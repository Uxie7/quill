import { col } from '../db/client';
import { embed, cosine } from '../llm';
import { norm } from '../dates';

export interface Hit { text: string; callId: string; score: number }

const kw = (s: string) => new Set(norm(s).split(' ').filter(w => w.length > 3));

/** Search this client's earlier calls (never other clients). Uses embeddings when present, keywords otherwise. */
export async function searchPastNotes(clientId: string, excludeCallId: string, query: string): Promise<Hit[]> {
  const chunks = await col('chunks');
  const rows = await chunks.find({ clientId, callId: { $ne: excludeCallId } }).toArray();
  if (!rows.length) return [];
  let q: number[] | undefined;
  if (rows.some(r => r.embedding?.length)) { try { [q] = await embed([query]); } catch { q = undefined; } }
  const qk = kw(query);
  return rows.map(r => {
    const score = q && r.embedding?.length ? cosine(q, r.embedding) : (() => { const k = kw(r.text); let n = 0; qk.forEach(w => { if (k.has(w)) n++; }); return n / (qk.size || 1); })();
    return { text: r.text as string, callId: r.callId as string, score };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}
