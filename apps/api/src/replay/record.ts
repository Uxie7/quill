// Records a live run per client into data/replay/<client>.json for the public replay deployment.
// Usage: npm run record            (all three clients)
//        npm run record -- dana    (one client)
import fs from 'node:fs';
import { col, newId } from '../db/client';
import { runPipeline } from '../pipeline';
import { buildResult, clientView } from '../results';
import { buildDashboard } from '../dashboard';

const SAMPLES: Record<string, string> = { dana: 'dana-06', marcus: 'marcus-06', ines: 'ines-08' };
const only = process.argv[2];
const keys = only ? [only] : Object.keys(SAMPLES);
fs.mkdirSync('data/replay', { recursive: true });

for (const key of keys) {
  const script = JSON.parse(fs.readFileSync(`data/scripts/${SAMPLES[key]}.json`, 'utf8'));
  const callId = newId();
  await (await col('calls')).insertOne({ _id: callId, clientId: key, heldAt: new Date(), minutes: 0, status: 'queued', sourceText: script.lines.map((l: any) => l.text).join(' ') });
  console.log(`Recording ${key}...`);
  await runPipeline(callId);
  const result: any = await buildResult(callId);
  const risk = (await (await col('calls')).findOne({ _id: callId }))?.risk ?? null;
  const reminderDays = risk === null ? 7 : risk >= 0.6 ? 2 : risk >= 0.3 ? 4 : 7;
  const client = await (await col('clients')).findOne({ _id: key });
  fs.writeFileSync(`data/replay/${key}.json`, JSON.stringify({ client: clientView(client!), steps: result.steps, result: { ...result, reminderDays } }, null, 2));
}
const clients = await (await col('clients')).find().sort({ createdAt: 1 }).toArray();
fs.writeFileSync('data/replay/_clients.json', JSON.stringify(clients.map(clientView), null, 2));
fs.writeFileSync('data/replay/_dashboard.json', JSON.stringify(await buildDashboard(), null, 2));
const eg = await (await col('egress')).find().sort({ at: -1 }).limit(50).toArray();
fs.writeFileSync('data/replay/_egress.json', JSON.stringify(eg.map(r => ({ id: r._id, callId: r.callId, to: r.to, contents: r.contents, reason: r.reason, at: r.at })), null, 2));
console.log('Done. Commit data/replay/*.json');
process.exit(0);
