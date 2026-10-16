import { col, newId } from '../db/client';
import { cfg } from '../config';
import { step } from '../steps';
import { chat, chatJson } from '../llm';
import { DraftJson } from '../schemas';
import { forbiddenTerms } from '../egress/gate';
import { searchPastNotes } from '../tools/history';
import { predictDropoutRisk } from '../tools/risk';
import { findResource, DEFAULT_TOPICS, type Resource } from '../tools/resource';
import { decide, type Plan } from './policy';
import { draftPrompt, fallbackDraft, type DraftCtx } from './prompts';
import { Sentry } from '../sentry';

/**
 * The agent stage. Order is enforced in code (reliable with small local models);
 * the model fills in the content, and the decision comes from the policy table.
 * Returns the ids of the drafted actions awaiting approval.
 */
export async function runAgent(callId: string): Promise<string[]> {
  return Sentry.startSpan({ name: 'agent.run', op: 'agent.run' }, () => runAgentInner(callId));
}

async function runAgentInner(callId: string): Promise<string[]> {
  const calls = await col('calls'), clients = await col('clients'), commitments = await col('commitments');
  const actions = await col('actions'), egress = await col('egress'), attendance = await col('attendance');
  const call = (await calls.findOne({ _id: callId }))!;
  const client = (await clients.findOne({ _id: call.clientId }))!;
  const cs = await commitments.find({ callId }).toArray();
  const forbidden = forbiddenTerms(client.name, cfg.practitioner, call.transcript);
  await calls.updateOne({ _id: callId }, { $set: { status: 'analyzing' } });

  // 2. Earlier calls
  const history = await step<string>(callId, 2, 'history', 'Checking your earlier calls', 'search_past_notes, vector search', async () => {
    const hits = await searchPastNotes(client._id, callId, 'client delayed, avoided or struggled with something');
    if (!hits.length || hits[0].score < 0.15) return { value: 'No clear pattern in earlier calls.', result: 'No pattern found in earlier calls.' };
    let note = '';
    try {
      const excerpts = hits.slice(0, 3).map(h => '- ' + h.text.slice(0, 500)).join('\n');
      note = (await chat([{ role: 'user', content: `Excerpts from earlier calls with ${client.name}:\n${excerpts}\n\nIn one short plain sentence, name any repeated pattern (delays, avoidance, struggles, skipped calls). If there is none, reply exactly: No pattern.` }])).split('\n')[0].trim();
    } catch { /* model unavailable: fall through */ }
    if (!note || /^no pattern/i.test(note)) note = 'No clear pattern in earlier calls.';
    return { value: note, result: note };
  });

  // 3. Dropout risk
  const risk = await step<number | null>(callId, 3, 'risk', `Checking if ${client.name} is going quiet`, 'predict_dropout_risk, TabPFN', async () => {
    try {
      const r = await predictDropoutRisk(client._id, callId);
      const eg = cfg.tabpfnMode === 'api' && r.method === 'tabpfn' ? await egress.findOne({ callId, to: 'TabPFN prediction service' }, { sort: { at: -1 } }) : null;
      const missed = r.features.missed_count;
      const lvl = r.risk >= 0.6 ? 'high' : r.risk >= 0.3 ? 'moderate' : 'low';
      return {
        value: r.risk,
        result: `${missed === 0 ? 'No missed calls so far.' : `Missed ${missed} so far.`} Risk is ${lvl} at ${r.risk.toFixed(2)}${r.method === 'heuristic' ? ' (estimated locally)' : ''}.`,
        egress: eg ? { to: eg.to, contents: eg.contents } : undefined,
      };
    } catch { return { value: null, result: 'Risk not estimated.' }; }
  });

  // 4. Decide (policy table)
  const plan = await step<Plan>(callId, 4, 'decide', 'Deciding what to do', 'decide_next_step, agent reasoning', async () => {
    const p = decide(risk);
    return { value: p, result: p.headline };
  });

  // 5. Resource (topic only, gated)
  const resource = await step<Resource | null>(callId, 5, 'resource', 'Finding something useful to attach', 'find_resource, web search', async () => {
    const safe = DEFAULT_TOPICS[client.role] ?? DEFAULT_TOPICS.freelancer;
    let topic = safe;
    try {
      const t = (await chat([{ role: 'user', content: `Give a general 4 to 8 word web search for a free resource that would help someone in this situation: ${client.gig} (${client.role}). No names, no places. Reply with only the search words.` }])).split('\n')[0].replace(/["'.]/g, '').trim();
      if (t) topic = t;
    } catch { /* use the safe default */ }
    let r: Resource | null = null;
    try { r = await findResource(topic, forbidden, callId); }
    catch { try { r = await findResource(safe, forbidden, callId); } catch { r = null; } } // gate rejected: use the safe topic
    const eg = await egress.findOne({ callId, to: 'Web search provider' }, { sort: { at: -1 } });
    return { value: r, result: r ? `Chose "${r.title}".` : 'No attachment added.', egress: eg ? { to: eg.to, contents: eg.contents } : undefined };
  });

  // 6. Drafts
  const ctx: DraftCtx = {
    practitioner: cfg.practitioner, clientName: client.name, gig: client.gig, plan,
    commitments: cs.filter(c => c.status !== 'dismissed').map(c => ({ who: c.who, text: c.text, due: c.due ?? null, status: c.status })),
    history, resource, today: new Date().toISOString().slice(0, 10),
  };
  const out = await step(callId, 6, 'draft', 'Writing the drafts', 'draft_followup, open model', async () => {
    try {
      const d = await chatJson([{ role: 'user', content: draftPrompt(ctx) }], DraftJson, 2);
      return { value: d, result: 'Wrote an email in your usual tone and a reminder.' };
    } catch {
      return { value: fallbackDraft(ctx), result: 'Wrote a standard email and a reminder (the model did not return a usable draft).' };
    }
  });

  const remindAt = new Date(Date.now() + plan.reminderDays * 86_400_000);
  remindAt.setHours(9, 0, 0, 0);
  const drafts = [
    { kind: 'email', subject: out.email_subject, body: out.email_body, remindAt: undefined as Date | undefined },
    { kind: 'reminder', subject: undefined as string | undefined, body: out.reminder_text, remindAt },
  ];
  const ids: string[] = [];
  for (const [i, d] of drafts.entries()) {
    const key = `${callId}:${d.kind}:${i}`;
    await actions.updateOne({ idempotencyKey: key }, { $setOnInsert: { _id: newId(), callId, clientId: client._id, kind: d.kind, subject: d.subject, body: d.body, remindAt: d.remindAt, state: 'pending', idempotencyKey: key } }, { upsert: true });
    ids.push(String((await actions.findOne({ idempotencyKey: key }))!._id));
  }

  // Remember this call for next time
  const prev = await attendance.find({ clientId: client._id, callId: { $ne: callId } }).sort({ heldAt: -1 }).limit(1).toArray();
  const gap = prev[0] ? Math.max(0, Math.round(((new Date(call.heldAt).getTime() - new Date(prev[0].heldAt).getTime()) / 86_400_000) * 10) / 10) : 0;
  await attendance.updateOne({ _id: `att-${callId}` }, { $set: { clientId: client._id, callId, heldAt: call.heldAt, status: 'attended', gapDays: gap, replyHours: prev[0]?.replyHours ?? 8 } }, { upsert: true });

  await calls.updateOne({ _id: callId }, { $set: { risk, why: out.why, status: 'awaiting_approval' } });
  return ids;
}
