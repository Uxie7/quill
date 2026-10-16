// npm run seed: resets the database and loads three sample clients with history.
import fs from 'node:fs';
import { getDb, col, newId } from './client';
import { embed } from '../llm';
import { chunkWords } from '../activities/embed';
import { resolveDue } from '../dates';
import { computeFeatures, heuristicRisk } from '../tools/risk';

const DAY = 86_400_000;
const now = new Date();
const ago = (d: number) => new Date(now.getTime() - d * DAY);
const at = (weekday: number, hour: number) => { const d = new Date(now); d.setDate(d.getDate() + (((weekday - d.getDay() + 7) % 7) || 7)); d.setHours(hour, 0, 0, 0); return d; };

const CLIENTS = [
  { _id: 'dana', name: 'Dana', role: 'freelancer', gig: 'Brand identity project' },
  { _id: 'marcus', name: 'Marcus', role: 'consultant', gig: 'Operations review, logistics firm' },
  { _id: 'ines', name: 'Ines', role: 'coach', gig: 'Weekly tennis lessons' },
];

const db = await getDb();
for (const c of ['clients', 'calls', 'chunks', 'commitments', 'actions', 'reminders', 'steps', 'egress', 'attendance', 'resource_cache']) await db.collection(c).deleteMany({});
await (await col('clients')).insertMany(CLIENTS.map((c, i) => ({ ...c, createdAt: ago(100 - i) })));

const data = JSON.parse(fs.readFileSync('data/history.json', 'utf8'));
let embedOk = true;
for (const h of data.calls) {
  const words = h.text.split(/\s+/).length;
  await (await col('calls')).insertOne({ _id: h.id, clientId: h.client, heldAt: ago(h.daysAgo), minutes: Math.max(20, Math.round(words / 6)), transcript: h.text, words, status: 'done' });
  const parts = chunkWords(h.text);
  let vectors: number[][] = [];
  if (embedOk) { try { vectors = await embed(parts.map(p => p.text)); } catch { embedOk = false; console.log('Embedding model not reachable: storing chunks without embeddings (keyword search will be used).'); } }
  await (await col('chunks')).insertMany(parts.map((p, i) => ({ _id: newId(), callId: h.id, clientId: h.client, start: p.start, text: p.text, embedding: vectors[i] ?? [] })));
  for (const c of h.commitments) {
    await (await col('commitments')).insertOne({
      _id: newId(), clientId: h.client, callId: h.id, who: c.who, text: c.text, due: c.due,
      dueAt: new Date(now.getTime() + c.dueDaysFromNow * DAY) ?? resolveDue(c.due, ago(h.daysAgo)), status: 'open', quote: c.quote, confidence: 0.9,
    });
  }
}

for (const [clientId, rows] of Object.entries<any[]>(data.attendance)) {
  const sorted = [...rows].sort((a, b) => b[0] - a[0]);
  await (await col('attendance')).insertMany(sorted.map(([d, status, reply], i) => ({
    _id: `${clientId}-att-${i}`, clientId, heldAt: ago(d), status,
    gapDays: i === 0 ? 7 : sorted[i - 1][0] - d, replyHours: reply,
  })));
  // Give each client's latest earlier call a risk, so the dashboard has a status before any new call.
  const risk = heuristicRisk(await computeFeatures(clientId, now));
  const last = data.calls.filter((c: any) => c.client === clientId).sort((a: any, b: any) => a.daysAgo - b.daysAgo)[0];
  await (await col('calls')).updateOne({ _id: last.id }, { $set: { risk } });
  console.log(`${clientId}: starting risk ${risk.toFixed(2)}`);
}

await (await col('reminders')).insertMany([
  { _id: newId(), clientId: 'ines', text: 'Check in on how Ines is feeling about exams', remindAt: at(5, 9), state: 'scheduled' },
  { _id: newId(), clientId: 'marcus', text: 'Review Marcus\u2019s proposal draft', remindAt: at(2, 14), state: 'scheduled' },
]);

const counts: Record<string, number> = {};
for (const c of ['clients', 'calls', 'chunks', 'commitments', 'attendance', 'reminders']) counts[c] = await db.collection(c).countDocuments();
console.log('Seeded:', counts);
process.exit(0);
