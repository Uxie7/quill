import { col, newId } from '../db/client';
import { embed } from '../llm';

export function chunkWords(text: string, size = 170, overlap = 30) {
  const words = text.split(/\s+/);
  const out: { start: number; text: string }[] = [];
  for (let i = 0; i < words.length; i += size) out.push({ start: i, text: words.slice(Math.max(0, i - overlap), i + size).join(' ') });
  return out;
}

export async function embedChunks(callId: string) {
  const calls = await col('calls'), chunks = await col('chunks');
  const call = await calls.findOne({ _id: callId });
  if (!call?.transcript) throw new Error('No transcript to embed.');
  if (await chunks.countDocuments({ callId })) return; // idempotent
  const parts = chunkWords(call.transcript);
  let vectors: number[][] = [];
  try { vectors = await embed(parts.map(p => p.text)); } catch { /* history search falls back to keywords */ }
  await chunks.insertMany(parts.map((p, i) => ({ _id: newId(), callId, clientId: call.clientId, start: p.start, text: p.text, embedding: vectors[i] ?? [] })));
}
