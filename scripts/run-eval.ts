// npm run eval : runs each scripted call through the live server and scores the extracted promises.
// Start the API first (npm run dev). Uses the dev from-text endpoint, so no audio is needed.
import fs from 'node:fs';
import { score } from '../apps/api/src/eval/score';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const rows: any[] = [];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

for (const f of fs.readdirSync('data/scripts').filter(x => x.endsWith('.json'))) {
  const s = JSON.parse(fs.readFileSync(`data/scripts/${f}`, 'utf8'));
  const started = Date.now();
  const { callId } = await (await fetch(`${BASE}/api/dev/calls/from-text`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: s.client, text: s.lines.map((l: any) => l.text).join(' ') }) })).json() as any;
  let res: any;
  for (let i = 0; i < 240; i++) { // up to 8 minutes
    await sleep(2000);
    const r = await fetch(`${BASE}/api/calls/${callId}/results`);
    if (r.ok) { res = await r.json(); break; }
    const st: any = await (await fetch(`${BASE}/api/calls/${callId}`)).json();
    if (st.status === 'failed') { res = { failed: st.error }; break; }
  }
  if (!res || res.failed) { rows.push({ script: s.id, error: res?.failed ?? 'timeout' }); continue; }
  const sc = score(s.truth.commitments, res.commitments);
  const level = res.summary.flagLevel === 'ok' ? 'low' : 'warn';
  rows.push({ script: s.id, ...Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, Math.round((v as number) * 100) / 100])), seconds: Math.round((Date.now() - started) / 1000), flag: res.summary.flag, expected: s.truth.expectedLevel, level });
}
console.table(rows);
fs.mkdirSync('data/eval', { recursive: true });
fs.writeFileSync('data/eval/results.json', JSON.stringify(rows, null, 2));
console.log('Wrote data/eval/results.json');
