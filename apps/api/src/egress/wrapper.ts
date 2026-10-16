// Every outbound request to an external host goes through this function.
// The ledger row is written BEFORE the request, so a failed request is still visible.
import { col, newId } from '../db/client';

export async function egressFetch(o: {
  to: string;
  url: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  reason: string;
  describe: string; // human text for the ledger. Never put keys or secrets in it.
  callId?: string;
}): Promise<any> {
  const egress = await col('egress');
  await egress.insertOne({ _id: newId(), callId: o.callId, to: o.to, contents: o.describe, reason: o.reason, at: new Date() });
  const res = await fetch(o.url, {
    method: o.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...o.headers },
    body: o.body ? JSON.stringify(o.body) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${o.to} responded ${res.status}`);
  return res.json();
}
