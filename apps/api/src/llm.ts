// Local model helpers (Ollama on localhost). This is one of the two places allowed to call fetch directly.
import { z } from 'zod';
import { cfg } from './config';

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

const stripThink = (s: string) => s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
const firstJson = (s: string) => {
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON in reply');
  return s.slice(a, b + 1);
};

export async function chat(messages: Msg[], json = false): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`${cfg.llmBase}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: cfg.llmModel, messages, stream: false, format: json ? 'json' : undefined, options: { temperature: 0.1 } }),
      signal: AbortSignal.timeout(180_000),
    });
  } catch { throw new Error('The local model is not reachable. Is Ollama running?'); }
  if (!r.ok) throw new Error(`The local model returned ${r.status}. Is "${cfg.llmModel}" pulled?`);
  const data: any = await r.json();
  return stripThink(String(data.message?.content ?? ''));
}

/** Ask for JSON, validate with zod, retry on invalid output. */
export async function chatJson<T>(messages: Msg[], schema: z.ZodType<T>, tries = 3): Promise<T> {
  let last = '';
  for (let i = 0; i < tries; i++) {
    try {
      const raw = await chat(messages, true);
      return schema.parse(JSON.parse(firstJson(raw)));
    } catch (e: any) {
      last = e.message ?? String(e);
      if (/not reachable|pulled/.test(last)) throw e;
    }
  }
  throw new Error(`The model did not return valid JSON after ${tries} tries (${last}).`);
}

export async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch(`${cfg.llmBase}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.embedModel, input: texts }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`embedding model returned ${r.status}`);
  const data: any = await r.json();
  return data.embeddings as number[][];
}

export const cosine = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return x && y ? d / (Math.sqrt(x) * Math.sqrt(y)) : 0;
};
