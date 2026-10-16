# 16. Code skeleton

Close-to-runnable code for each part, in the order you would build it. **None of it has been run.** Library calls marked *(verify)* may have changed. Types come from `schemas.ts` in 15.

Conventions: Node 20, TypeScript, ES modules, `_id` values are hex strings, collections typed loosely for speed.

## 0. Project setup

```bash
npm init -y
npm i express multer mongodb zod @mastra/core @temporalio/client @temporalio/worker \
  @temporalio/workflow @temporalio/activity @sentry/node dotenv
npm i -D typescript tsx vitest @types/express @types/multer @types/node
```

```json
"scripts": {
  "dev": "tsx watch apps/api/src/server.ts",
  "worker": "tsx apps/api/src/worker.ts",
  "seed": "tsx apps/api/src/db/seed.ts",
  "record": "tsx apps/api/src/replay/record.ts",
  "eval": "tsx scripts/run-eval.ts",
  "test": "vitest run"
}
```

## 1. Database client

```ts
// apps/api/src/db/client.ts
import { MongoClient, Db } from 'mongodb';
let db: Db | undefined;
export async function getDb(): Promise<Db> {
  if (db) return db;
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  db = client.db();
  await db.collection('actions').createIndex({ idempotencyKey: 1 }, { unique: true });
  await db.collection('commitments').createIndex({ clientId: 1, status: 1 });
  await db.collection('chunks').createIndex({ clientId: 1, callId: 1 });
  return db;
}
export const newId = () => new (require('mongodb').ObjectId)().toHexString();
```

## 2. Steps: record and stream

The API process and the Temporal worker are separate processes, so an in-memory event emitter will not work between them. Activities write steps to MongoDB, and the SSE route reads them.

```ts
// apps/api/src/steps.ts
import * as Sentry from '@sentry/node';
import { getDb, newId } from './db/client';

export type StepId = 'transcribe'|'extract'|'history'|'risk'|'decide'|'resource'|'draft';
export interface StepResult<T> { value: T; result: string; egress?: { to: string; contents: string } }

export async function step<T>(callId: string, idx: number, id: StepId, title: string, tech: string,
  fn: () => Promise<StepResult<T>>): Promise<T> {
  return Sentry.startSpan({ name: `step.${id}`, op: 'agent.step' }, async () => {
    const t0 = Date.now();
    const { value, result, egress } = await fn();
    const db = await getDb();
    await db.collection('steps').updateOne(
      { callId, idx },
      { $set: { _id: `${callId}:${idx}`, callId, idx, stepId: id, title, tech, result, ms: Date.now() - t0, egress } },
      { upsert: true });                      // upsert keeps retries idempotent
    return value;
  });
}
```

```ts
// SSE route (inside server.ts)
app.get('/api/calls/:id/stream', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const db = await getDb();
  let sent = 0, closed = false;
  req.on('close', () => { closed = true; });
  while (!closed) {
    const steps = await db.collection('steps').find({ callId: req.params.id }).sort({ idx: 1 }).skip(sent).toArray();
    for (const s of steps) { res.write(`event: step\ndata: ${JSON.stringify(s)}\n\n`); sent++; }
    const call = await db.collection('calls').findOne({ _id: req.params.id as any });
    if (call?.status === 'failed') { res.write(`event: error\ndata: ${JSON.stringify({ message: call.error ?? 'Processing failed' })}\n\n`); break; }
    if (call && ['awaiting_approval', 'done'].includes(call.status)) { res.write('event: done\ndata: {}\n\n'); break; }
    await new Promise(r => setTimeout(r, 500));
  }
  res.end();
});
```

## 3. Upload route

```ts
import multer from 'multer';
import { Client } from '@temporalio/client';
import { processCall } from './workflows/processCall';

const upload = multer({ dest: 'data/uploads', limits: { fileSize: 500 * 1024 * 1024 } });
const temporal = new Client();   // connects to localhost:7233 by default (verify options)

app.post('/api/calls', upload.single('audio'), async (req, res) => {
  const { clientId } = req.body;
  if (!req.file || !clientId) return res.status(400).json({ error: { code: 'bad_request', message: 'Add a file and pick a client.' } });
  if (!/\.(m4a|mp3|wav|mp4|webm|ogg)$/i.test(req.file.originalname))
    return res.status(415).json({ error: { code: 'unsupported_media', message: 'Use an audio or video file.' } });
  const db = await getDb();
  const callId = newId();
  await db.collection('calls').insertOne({ _id: callId as any, clientId, heldAt: new Date(), minutes: 0, audioPath: req.file.path, status: 'queued' });
  await temporal.workflow.start(processCall, { taskQueue: 'quill', workflowId: `call-${callId}`, args: [callId] });
  res.status(201).json({ callId });
});
```

## 4. Egress: gate and wrapper

```ts
// apps/api/src/egress/gate.ts
import { RiskFeatures } from '../schemas';

const SKIP = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|thanks|great|yeah|okay)$/i;

export function forbiddenTerms(clientName: string, practitioner: string, transcript: string): string[] {
  const caps = (transcript.match(/(?<![.!?]\s)\b[A-Z][a-z]{3,}\b/g) ?? []).filter(w => !SKIP.test(w));
  return [...new Set([clientName, practitioner, ...caps])];
}

export function gateSearch(topic: string, forbidden: string[]) {
  const words = topic.trim().split(/\s+/);
  if (words.length < 4 || words.length > 8) throw new Error('Search topic must be 4 to 8 words.');
  if (/\d{3,}|@/.test(topic)) throw new Error('Search topic contains digits or an email-like pattern.');
  const lower = topic.toLowerCase();
  for (const f of forbidden) if (f && lower.includes(f.toLowerCase())) throw new Error('Search topic contains a name from the record.');
}

export function gateFeatures(f: unknown) { return RiskFeatures.strict().parse(f); }   // numbers only
```

```ts
// apps/api/src/egress/wrapper.ts
import { getDb, newId } from '../db/client';

export async function egressFetch(o: {
  to: string; url: string; method?: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string>;
  reason: string; describe: string;     // describe is human text: never put keys or secrets in it
  callId?: string;
}) {
  const db = await getDb();
  await db.collection('egress').insertOne({ _id: newId() as any, callId: o.callId, to: o.to, contents: o.describe, reason: o.reason, at: new Date() });
  const res = await fetch(o.url, {
    method: o.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...o.headers },
    body: o.body ? JSON.stringify(o.body) : undefined,
  });
  if (!res.ok) throw new Error(`${o.to} responded ${res.status}`);
  return res.json();
}
```

Add a test that greps `apps/api/src` for `fetch(` outside `egress/` and the local helpers (`llm.ts`).

## 5. Local model helpers

```ts
// apps/api/src/llm.ts  (localhost only: Ollama)
const BASE = process.env.LLM_BASE_URL!;
export async function chat(messages: { role: string; content: string }[], format?: 'json' | object) {
  const r = await fetch(`${BASE}/api/chat`, { method: 'POST', body: JSON.stringify({
    model: process.env.LLM_MODEL, messages, stream: false, format, options: { temperature: 0.1 } }) });
  if (!r.ok) throw new Error('model_unavailable');
  return (await r.json()).message.content as string;
}
export async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch(`${BASE}/api/embed`, { method: 'POST', body: JSON.stringify({ model: process.env.EMBED_MODEL, input: texts }) });
  return (await r.json()).embeddings;     // (verify endpoint and field names)
}
export const cosine = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i]*b[i]; x += a[i]*a[i]; y += b[i]*b[i]; }
  return d / (Math.sqrt(x) * Math.sqrt(y));
};
```

## 6. Activities

### Transcribe

```ts
// apps/api/src/activities/transcribe.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { getDb } from '../db/client';
import { step } from '../steps';
const run = promisify(execFile);

export async function transcribe(callId: string) {
  const db = await getDb();
  const call = await db.collection('calls').findOne({ _id: callId as any });
  if (!call) throw new Error('call not found');
  if (call.transcript) return;                                   // idempotent
  await db.collection('calls').updateOne({ _id: callId as any }, { $set: { status: 'transcribing' } });
  await fs.mkdir('data/tmp', { recursive: true });
  await step(callId, 0, 'transcribe', 'Listening to the call', 'transcribe_audio, Whisper on this laptop', async () => {
    const wav = `data/tmp/${callId}.wav`;
    await run('ffmpeg', ['-y', '-i', call.audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    await run(process.env.WHISPER_BIN!, ['-m', process.env.WHISPER_MODEL!, '-f', wav, '-oj', '-of', `data/tmp/${callId}`], { timeout: 600_000 });
    const j = JSON.parse(await fs.readFile(`data/tmp/${callId}.json`, 'utf8'));   // (verify JSON shape)
    const text = j.transcription.map((s: any) => s.text.trim()).join(' ');
    const words = text.split(/\s+/).length;
    const minutes = Math.max(1, Math.round(j.transcription.at(-1).offsets.to / 60000));
    await db.collection('calls').updateOne({ _id: callId as any }, { $set: { transcript: text, words, minutes } });
    return { value: null, result: `${minutes} minutes of audio became ${words.toLocaleString()} words.` };
  });
}
```

### Chunk and embed

```ts
export async function embedChunks(callId: string) {
  const db = await getDb();
  const call = await db.collection('calls').findOne({ _id: callId as any });
  if (await db.collection('chunks').countDocuments({ callId })) return;
  const words = call!.transcript.split(/\s+/);
  const chunks: { start: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += 170) chunks.push({ start: i, text: words.slice(Math.max(0, i - 30), i + 170).join(' ') });
  const vectors = await embed(chunks.map(c => c.text));
  await db.collection('chunks').insertMany(chunks.map((c, i) => ({ _id: newId() as any, callId, clientId: call!.clientId, ...c, embedding: vectors[i] })));
}
```

### Extract promises

```ts
// apps/api/src/activities/extract.ts
import { ExtractionOutput } from '../schemas';
import { chat } from '../llm';
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export async function extractCommitments(callId: string) {
  const db = await getDb();
  const call = await db.collection('calls').findOne({ _id: callId as any });
  if (await db.collection('commitments').countDocuments({ callId })) return;     // idempotent
  const client = await db.collection('clients').findOne({ _id: call!.clientId });
  const prompt = `From this call transcript between ${process.env.PRACTITIONER_NAME} (the practitioner) and ${client!.name} (the client), list every commitment made.
For each: who ("you" for the practitioner, "client"), text, due (as spoken or null), firm (true if stated definitely, false if hedged with maybe, might, probably, I'll try), quote (the exact sentence).
Return JSON only: {"commitments":[...]}. Do not include anything not said.

Transcript:
${call!.transcript}`;
  await step(callId, 1, 'extract', 'Finding who promised what', 'extract_commitments, open model', async () => {
    let parsed: ReturnType<typeof ExtractionOutput.parse> | undefined;
    for (let i = 0; i < 3 && !parsed; i++) {
      try { parsed = ExtractionOutput.parse(JSON.parse(await chat([{ role: 'user', content: prompt }], 'json'))); } catch { /* retry */ }
    }
    if (!parsed) throw new Error('The model did not return valid promises.');
    const t = norm(call!.transcript);
    const good = parsed.commitments.filter(c => t.includes(norm(c.quote)));       // quote must be real
    await db.collection('commitments').insertMany(good.map(c => ({
      _id: newId() as any, clientId: call!.clientId, callId, who: c.who, text: c.text, due: c.due,
      dueAt: resolveDue(c.due, call!.heldAt), status: c.firm ? 'open' : 'unclear', quote: c.quote, confidence: c.firm ? 0.9 : 0.5 })));
    const unclear = good.filter(c => !c.firm).length;
    return { value: null, result: `Found ${good.length} promises.${unclear ? ` ${unclear} of them ${unclear === 1 ? 'is' : 'are'} unclear.` : ''}` };
  });
}
```

### Due date resolver

```ts
// apps/api/src/dates.ts
const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
export function resolveDue(due: string | null, held: Date): Date | undefined {
  if (!due) return;
  const s = due.toLowerCase(), d = new Date(held);
  const day = DAYS.findIndex(n => s.includes(n));
  if (day >= 0) { d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7 || 7)); return d; }
  if (s.includes('tomorrow')) { d.setDate(d.getDate() + 1); return d; }
  if (s.includes('tonight') || s.includes('today')) return d;
  if (s.includes('next week')) { d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; }       // Monday after
  if (s.includes('this week')) { d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return d; }        // Friday
  return;
}
```

## 7. Tools

```ts
// apps/api/src/tools/history.ts
export async function searchPastNotes(clientId: string, excludeCallId: string, query: string) {
  const db = await getDb();
  const [q] = await embed([query]);
  const chunks = await db.collection('chunks').find({ clientId, callId: { $ne: excludeCallId } }).toArray();
  return chunks.map(c => ({ text: c.text as string, callId: c.callId as string, score: cosine(q, c.embedding) }))
    .sort((a, b) => b.score - a.score).slice(0, 5);
}
// To use Atlas Vector Search instead: db.collection('chunks').aggregate([{ $vectorSearch: { index: 'chunks_vec',
//   path: 'embedding', queryVector: q, numCandidates: 50, limit: 5, filter: { clientId } } }]) (verify)
```

```ts
// apps/api/src/tools/risk.ts
export async function computeFeatures(clientId: string) {
  const db = await getDb();
  const rows = await db.collection('attendance').find({ clientId }).sort({ heldAt: 1 }).toArray();
  const held = rows.filter(r => r.status === 'attended');
  const gaps = rows.map(r => r.gapDays as number);
  const last = rows.at(-1);
  return {
    calls_so_far: held.length,
    avg_gap_days: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
    last_gap_days: last?.gapDays ?? 0,
    missed_count: rows.length - held.length,
    avg_reply_hours: rows.length ? rows.reduce((a, r) => a + (r.replyHours ?? 0), 0) / rows.length : 0,
    days_since_last_call: last ? (Date.now() - new Date(last.heldAt).getTime()) / 86_400_000 : 0,
  };
}

export async function predictDropoutRisk(clientId: string, callId: string, trainRows = 600) {
  const f = gateFeatures(await computeFeatures(clientId));
  if (process.env.TABPFN_MODE === 'local') {            // nothing leaves the laptop
    return (await (await fetch(`${process.env.TABPFN_URL}/risk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })).json()).risk as number;
  }
  const out = await egressFetch({ to: 'TabPFN prediction service', url: `${process.env.TABPFN_URL}/risk`, body: f, callId,
    reason: 'Estimate dropout risk',
    describe: `6 numbers about this client plus ${trainRows} anonymized example rows. No name, audio or transcript.` });
  return out.risk as number;
}
```

```ts
// apps/api/src/tools/resource.ts
export async function findResource(topic: string, forbidden: string[], callId: string) {
  gateSearch(topic, forbidden);
  const db = await getDb();
  const cached = await db.collection('resource_cache').findOne({ topic });
  if (cached) return cached.result;
  const url = `https://serpapi.com/search.json?engine=google&num=5&q=${encodeURIComponent(topic)}&api_key=${process.env.SERPAPI_KEY}`;
  const data = await egressFetch({ to: 'Web search provider', url, method: 'GET', callId, reason: 'Find a public resource to attach',
    describe: `Search: "${topic}". Client details removed.` });
  const top = data.organic_results?.[0];
  const result = top ? { title: top.title, url: top.link, snippet: top.snippet } : null;
  await db.collection('resource_cache').insertOne({ topic, result });
  return result;
}
```

## 8. Decision policy (plain code, unit-tested)

```ts
// apps/api/src/agent/policy.ts
export type Level = 'high' | 'mid' | 'low';
export function decide(risk: number | null) {
  const level: Level = risk === null ? 'low' : risk >= 0.6 ? 'high' : risk >= 0.3 ? 'mid' : 'low';
  return {
    level,
    kind: ({ high: 'checkin', mid: 'plan', low: 'recap' } as const)[level],
    reminderDays: ({ high: 2, mid: 4, low: 7 } as const)[level],
    label: ({ high: 'may be going quiet', mid: 'might pause', low: 'is on track' } as const)[level],
  };
}
// policy.test.ts
// expect(decide(0.68).kind).toBe('checkin'); expect(decide(0.41).kind).toBe('plan'); expect(decide(0.12).kind).toBe('recap'); expect(decide(null).kind).toBe('recap');
```

## 9. Agent run

Code-driven order, with the model writing the content. This is the reliable path for small local models. A Mastra wrapper (section 10) exposes the same functions as tools.

```ts
// apps/api/src/agent/run.ts
export async function runAgent(callId: string): Promise<string[]> {
  const db = await getDb();
  const call = (await db.collection('calls').findOne({ _id: callId as any }))!;
  const client = (await db.collection('clients').findOne({ _id: call.clientId }))!;
  const commitments = await db.collection('commitments').find({ callId }).toArray();
  const forbidden = forbiddenTerms(client.name, process.env.PRACTITIONER_NAME!, call.transcript);
  await db.collection('calls').updateOne({ _id: callId as any }, { $set: { status: 'analyzing' } });

  const history = await step(callId, 2, 'history', 'Checking your earlier calls', 'search_past_notes, vector search', async () => {
    const hits = await searchPastNotes(client._id, callId, 'client delayed or avoided a decision');
    const top = hits[0];
    return { value: hits, result: top && top.score > 0.5 ? await summarizeHit(client.name, top.text) : 'No pattern in earlier calls.' };
  });

  const risk = await step(callId, 3, 'risk', `Checking if ${client.name} is going quiet`, 'predict_dropout_risk, TabPFN', async () => {
    try {
      const r = await predictDropoutRisk(client._id, callId);
      const e = await db.collection('egress').findOne({ callId }, { sort: { at: -1 } });
      return { value: r as number | null, result: `Risk is ${r >= 0.6 ? 'high' : r >= 0.3 ? 'moderate' : 'low'} at ${r.toFixed(2)}.`, egress: e ? { to: e.to, contents: e.contents } : undefined };
    } catch { return { value: null as number | null, result: 'Risk not estimated.' }; }
  });

  const plan = decide(risk);
  await step(callId, 4, 'decide', 'Deciding what to do', 'decide_next_step, agent reasoning', async () =>
    ({ value: plan, result: { high: 'A friendly check-in fits better than a routine recap.', mid: 'A short plan to do alone keeps them moving.', low: 'No sign of drift, so a standard recap is enough.' }[plan.level] }));

  const resource = await step(callId, 5, 'resource', 'Finding something useful to attach', 'find_resource, web search', async () => {
    try {
      const topic = (await chat([{ role: 'user', content: `Give a general 4 to 8 word web search for a free resource that would help someone in this situation: ${client.gig}. No names. Reply with only the search.` }])).trim();
      const r = await findResource(topic, forbidden, callId);
      const e = await db.collection('egress').findOne({ callId, to: 'Web search provider' }, { sort: { at: -1 } });
      return { value: r, result: r ? `Chose "${r.title}".` : 'No attachment found.', egress: e ? { to: e.to, contents: e.contents } : undefined };
    } catch { return { value: null, result: 'No attachment added.' }; }
  });

  const out = await step(callId, 6, 'draft', 'Writing the drafts', 'draft_followup, open model', async () => {
    const raw = await chat([{ role: 'user', content: draftPrompt(client, commitments, plan, history, resource, call.heldAt) }], 'json');
    const o = AgentOutput.parse(JSON.parse(raw));          // retry once in real code
    return { value: o, result: `Wrote ${o.drafts.length === 1 ? 'a draft' : 'an email and a reminder'}.` };
  });

  const ids: string[] = [];
  for (const [i, d] of out.drafts.entries()) {
    const id = newId(); ids.push(id);
    await db.collection('actions').updateOne({ idempotencyKey: `${callId}:${d.kind}:${i}` },
      { $setOnInsert: { _id: id as any, callId, clientId: client._id, kind: d.kind, subject: d.subject, body: d.body,
        remindAt: d.remindAt ? new Date(d.remindAt) : new Date(Date.now() + plan.reminderDays * 86_400_000), state: 'pending' } }, { upsert: true });
  }
  await db.collection('calls').updateOne({ _id: callId as any }, { $set: { risk, why: out.why, status: 'awaiting_approval' } });
  return ids;
}
```

`summarizeHit` and `draftPrompt` are plain prompt builders; keep the draft prompt in `agent/prompts.ts` (text in 05).

## 10. Mastra wrapper (for the Mastra category)

```ts
// apps/api/src/agent/mastra.ts   (sketch, verify createTool, Agent and model provider APIs)
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const riskTool = createTool({
  id: 'predict_dropout_risk',
  description: 'Estimate how likely this client is to stop working with you, using attendance numbers only.',
  inputSchema: z.object({ clientId: z.string(), callId: z.string() }),
  execute: async ({ context }) => ({ risk: await predictDropoutRisk(context.clientId, context.callId) }),
});

export const quill = new Agent({
  name: 'quill',
  instructions: SYSTEM_PROMPT,            // from 05
  model: /* Ollama model via the provider you chose (verify) */ undefined as any,
  tools: { predict_dropout_risk: riskTool /* , search_past_notes, find_resource, draft_followup */ },
});
```

Use the Mastra agent for the decision/drafting stage if the local model handles tool calling well in your spike; otherwise keep `runAgent` above and say in the post that Mastra provides the tools and orchestration while the order is enforced in code.

## 11. Temporal

```ts
// apps/api/src/workflows/processCall.ts
import { proxyActivities, defineSignal, setHandler, condition, sleep } from '@temporalio/workflow';
import type * as acts from '../activities';
const a = proxyActivities<typeof acts>({ startToCloseTimeout: '10 minutes', retry: { maximumAttempts: 3 } });
export const actionDecided = defineSignal<[string]>('actionDecided');

export async function processCall(callId: string) {
  await a.transcribe(callId);
  await a.embedChunks(callId);
  await a.extractCommitments(callId);
  const pending = new Set(await a.runAgent(callId));
  setHandler(actionDecided, (id) => { pending.delete(id); });
  await condition(() => pending.size === 0, '30 days');
  await a.markCallDone(callId);
}

export async function reminderWorkflow(reminderId: string, remindAtMs: number) {
  await sleep(Math.max(0, remindAtMs - Date.now()));
  await a.markReminderDue(reminderId);
}
```

```ts
// apps/api/src/worker.ts
import 'dotenv/config';
import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities';
const connection = await NativeConnection.connect({ address: process.env.TEMPORAL_ADDRESS });
const worker = await Worker.create({ connection, taskQueue: 'quill', workflowsPath: new URL('./workflows/index.ts', import.meta.url).pathname, activities });
await worker.run();
```

Approve route (idempotent):

```ts
app.post('/api/actions/:id/approve', async (req, res) => {
  const db = await getDb();
  const act = await db.collection('actions').findOne({ _id: req.params.id as any });
  if (!act) return res.status(404).json({ error: { code: 'not_found', message: 'No such action.' } });
  if (act.state === 'approved') return res.json({ state: 'approved' });                         // idempotent
  const body = req.body?.body ?? act.body;
  await db.collection('actions').updateOne({ _id: act._id }, { $set: { state: 'approved', body } });
  if (act.kind === 'reminder') {
    const reminderId = newId();
    await db.collection('reminders').insertOne({ _id: reminderId as any, actionId: act._id, clientId: act.clientId, text: body, remindAt: act.remindAt, state: 'scheduled' });
    try { await temporal.workflow.start(reminderWorkflow, { taskQueue: 'quill', workflowId: `reminder-${act._id}`, args: [reminderId, new Date(act.remindAt).getTime()] }); }
    catch (e: any) { if (e.name !== 'WorkflowExecutionAlreadyStartedError') throw e; }
  }
  await temporal.workflow.getHandle(`call-${act.callId}`).signal(actionDecided, String(act._id)).catch(() => {});
  res.json({ state: 'approved', mailto: act.kind === 'email' ? `mailto:?subject=${encodeURIComponent(act.subject ?? '')}&body=${encodeURIComponent(body)}` : undefined });
});
```

## 12. Replay mode

```ts
// apps/api/src/replay/routes.ts
import fs from 'node:fs';
export function replayRoutes(app: import('express').Express) {
  app.post('/api/calls', (req, res) => res.status(201).json({ callId: `replay-${req.body.clientKey ?? 'dana'}-${Date.now()}` }));
  app.get('/api/calls/:id/stream', async (req, res) => {
    const key = req.params.id.split('-')[1];
    const run = JSON.parse(fs.readFileSync(`data/replay/${key}.json`, 'utf8'));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    for (const s of run.steps) { await new Promise(r => setTimeout(r, Math.min(1200, s.ms))); res.write(`event: step\ndata: ${JSON.stringify(s)}\n\n`); }
    res.write('event: done\ndata: {}\n\n'); res.end();
  });
  app.get('/api/calls/:id/results', (req, res) => res.json(JSON.parse(fs.readFileSync(`data/replay/${req.params.id.split('-')[1]}.json`, 'utf8')).result));
}
// in server.ts: if (process.env.MODE === 'replay') replayRoutes(app) else mountLiveRoutes(app)
```

## 13. Data generators

### Attendance table (runnable)

```python
# scripts/gen-attendance.py
import numpy as np, pandas as pd
rng = np.random.default_rng(42)
n = 600
calls = rng.integers(2, 25, n)
avg_gap = rng.normal(8, 3, n).clip(3, 25)
last_gap = (avg_gap + rng.normal(0, 5, n)).clip(1, 45)
missed = rng.poisson(0.6, n).clip(0, 6)
reply = rng.gamma(2.0, 6.0, n).clip(1, 96)
since = (last_gap * rng.uniform(0.5, 1.2, n)).clip(0, 50)
z = -1.2 + 0.5 * missed + 0.07 * (last_gap - avg_gap) + 0.015 * reply - 0.05 * calls + 0.02 * since
y = (rng.uniform(size=n) < 1 / (1 + np.exp(-z))).astype(int)
df = pd.DataFrame(dict(calls_so_far=calls, avg_gap_days=avg_gap, last_gap_days=last_gap, missed_count=missed,
                       avg_reply_hours=reply, days_since_last_call=since, dropped_30d=y)).round(1)
df.to_csv("data/attendance.csv", index=False)
print("rows", len(df), "dropout rate", round(df.dropped_30d.mean(), 2))   # aim for roughly 0.2 to 0.35
```

### Synthetic audio (sketch)

```ts
// scripts/gen-audio.ts
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const VOICE = { you: process.env.EL_VOICE_YOU!, client: process.env.EL_VOICE_CLIENT! };
export async function synth(script: { id: string; lines: { speaker: 'you' | 'client'; text: string }[] }) {
  const parts: string[] = [];
  for (const [i, l] of script.lines.entries()) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE[l.speaker]}`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: l.text, model_id: 'eleven_multilingual_v2' }) });          // (verify model ids and limits)
    const f = `data/tmp/${script.id}-${i}.mp3`; await fs.writeFile(f, Buffer.from(await r.arrayBuffer())); parts.push(f);
  }
  await fs.writeFile(`data/tmp/${script.id}.txt`, parts.map(p => `file '${p.replace('data/tmp/', '')}'`).join('\n'));
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', `data/tmp/${script.id}.txt`, '-c', 'copy', `data/audio/${script.id}.mp3`]);
}
```

## 14. Eval harness skeleton

```ts
// scripts/run-eval.ts
const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2));
const sim = (a: string, b: string) => { const A = tok(a), B = tok(b); const i = [...A].filter(x => B.has(x)).length; return i / (A.size + B.size - i || 1); };

export function score(truth: any[], got: any[]) {
  let matched = 0, whoOk = 0, hedged = 0, hedgedUnclear = 0;
  const used = new Set<number>();
  for (const t of truth) {
    const idx = got.findIndex((g, i) => !used.has(i) && sim(t.text, g.text) >= 0.4);
    if (!t.firm) hedged++;
    if (idx >= 0) { used.add(idx); matched++; if (got[idx].who === t.who) whoOk++; if (!t.firm && got[idx].status === 'unclear') hedgedUnclear++; }
  }
  return { recall: matched / truth.length, precision: matched / (got.length || 1), speaker: whoOk / (matched || 1), ambiguity: hedged ? hedgedUnclear / hedged : 1 };
}
// For each script: run the pipeline, load commitments, score(), print a table, write data/eval/results.json
```

## 15. First vertical slice (do this before anything else)

1. `npm run seed`, start Mongo, Ollama, Temporal, worker, API.
2. `curl -F clientId=<dana id> -F audio=@data/audio/dana-06.mp3 localhost:3000/api/calls`
3. Watch `curl -N localhost:3000/api/calls/<id>/stream` print seven steps.
4. `curl localhost:3000/api/calls/<id>/results`.
5. Only then wire the frontend.
