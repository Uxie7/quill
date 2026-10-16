import { col } from './db/client';
import { Sentry } from './sentry';
import type { z } from 'zod';
import type { StepId } from './schemas';

export interface StepResult<T> { value: T; result: string; egress?: { to: string; contents: string } }

/** Run one pipeline step: trace it (Sentry span) and save it so the UI can stream it. Idempotent per (callId, idx). */
export async function step<T>(callId: string, idx: number, id: z.infer<typeof StepId>, title: string, tech: string,
  fn: () => Promise<StepResult<T>>): Promise<T> {
  return Sentry.startSpan({ name: `step.${id}`, op: 'agent.step' }, async () => {
    const t0 = Date.now();
    const { value, result, egress } = await fn();
    const steps = await col('steps');
    await steps.updateOne({ _id: `${callId}:${idx}` }, { $set: { callId, idx, stepId: id, title, tech, result, ms: Date.now() - t0, egress } }, { upsert: true });
    return value;
  });
}
