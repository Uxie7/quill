import { col, type Doc } from './db/client';
import { decide } from './agent/policy';
import { isOverdue } from './dates';

export function commitmentView(c: Doc, now = new Date()): Record<string, any> {
  const { _id, ...rest } = c;
  return { id: _id, ...rest, status: isOverdue(c as any, now) ? 'overdue' : c.status };
}
export const actionView = (a: Doc) => { const { _id, idempotencyKey, ...rest } = a; return { id: _id, ...rest }; };
export const stepView = (s: Doc) => { const { _id, ...rest } = s; return { id: s.stepId, ...rest, _id: undefined }; };
export const clientView = (c: Doc) => { const { _id, ...rest } = c; return { id: _id, ...rest }; };

export async function buildResult(callId: string) {
  const call = await (await col('calls')).findOne({ _id: callId });
  if (!call) return null;
  const client = await (await col('clients')).findOne({ _id: call.clientId });
  const cs = (await (await col('commitments')).find({ callId }).toArray()).filter(c => c.status !== 'dismissed');
  const steps = await (await col('steps')).find({ callId }).sort({ idx: 1 }).toArray();
  const actions = await (await col('actions')).find({ callId }).sort({ idempotencyKey: 1 }).toArray();
  const plan = decide(call.risk ?? null);
  const unclear = cs.filter(c => c.status === 'unclear');
  const q = unclear[0];
  return {
    callId, clientId: call.clientId, clientName: client?.name,
    status: call.status,
    summary: { promisesFound: cs.length, needsAnswer: unclear.length, flag: plan.label, flagLevel: plan.level === 'low' ? 'ok' : 'warn' },
    commitments: cs.map(c => commitmentView(c)),
    question: q ? { commitmentId: q._id, title: 'Is this a promise?', text: `${client?.name ?? 'The client'} said: "${q.quote}" Track it as a commitment?`, yesLabel: 'Yes, track it' } : undefined,
    why: call.why ?? '',
    drafts: actions.map(actionView),
    steps: steps.map(s => ({ id: s.stepId, title: s.title, tech: s.tech, result: s.result, ms: s.ms, egress: s.egress })),
  };
}
