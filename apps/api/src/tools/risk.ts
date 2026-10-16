import fs from 'node:fs';
import { col } from '../db/client';
import { cfg } from '../config';
import { gateFeatures } from '../egress/gate';
import { egressFetch } from '../egress/wrapper';
import type { RiskFeaturesT } from '../schemas';

export async function computeFeatures(clientId: string, now = new Date()): Promise<RiskFeaturesT> {
  const rows = await (await col('attendance')).find({ clientId }).sort({ heldAt: 1 }).toArray();
  const attended = rows.filter(r => r.status === 'attended');
  const last = rows.at(-1);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    calls_so_far: attended.length,
    avg_gap_days: r1(avg(rows.map(r => r.gapDays as number))),
    last_gap_days: r1(last?.gapDays ?? 0),
    missed_count: rows.length - attended.length,
    avg_reply_hours: r1(avg(rows.map(r => (r.replyHours ?? 0) as number))),
    days_since_last_call: r1(last ? (now.getTime() - new Date(last.heldAt).getTime()) / 86_400_000 : 0),
  };
}

/** Same formula the synthetic attendance table is generated from. Used when no prediction service is running. */
export function heuristicRisk(f: RiskFeaturesT): number {
  const z = -1.2 + 0.5 * f.missed_count + 0.07 * (f.last_gap_days - f.avg_gap_days) + 0.015 * f.avg_reply_hours - 0.05 * f.calls_so_far + 0.02 * f.days_since_last_call;
  return 1 / (1 + Math.exp(-z));
}

export function trainRowCount(): number {
  try { return Math.max(0, fs.readFileSync('data/attendance.csv', 'utf8').trim().split('\n').length - 1); } catch { return 600; }
}

export interface RiskResult { risk: number; method: 'tabpfn' | 'heuristic'; features: RiskFeaturesT }

export async function predictDropoutRisk(clientId: string, callId: string): Promise<RiskResult> {
  const features = gateFeatures(await computeFeatures(clientId)); // numbers only
  if (cfg.tabpfnMode !== 'heuristic') {
    try {
      if (cfg.tabpfnMode === 'local') {
        const r = await fetch(`${cfg.tabpfnUrl}/risk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(features), signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error('prediction service error');
        return { risk: ((await r.json()) as any).risk, method: 'tabpfn', features };
      }
      // api mode: the service forwards to the hosted API, so this is logged as outbound
      const out = await egressFetch({
        to: 'TabPFN prediction service', url: `${cfg.tabpfnUrl}/risk`, body: features, callId,
        reason: 'Estimate dropout risk',
        describe: `6 numbers about this client plus ${trainRowCount()} anonymized example rows. No name, audio or transcript.`,
      });
      return { risk: out.risk, method: 'tabpfn', features };
    } catch { /* fall through to the local formula */ }
  }
  return { risk: heuristicRisk(features), method: 'heuristic', features };
}
