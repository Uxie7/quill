import { proxyActivities, defineSignal, setHandler, condition, sleep } from '@temporalio/workflow';
import type * as acts from '../activities/index';

const a = proxyActivities<typeof acts>({ startToCloseTimeout: '10 minutes', retry: { maximumAttempts: 3 } });
export const actionDecided = defineSignal<[string]>('actionDecided');

export async function processCall(callId: string) {
  let ids: string[] | null = null;
  const decided = new Set<string>();
  setHandler(actionDecided, (id: string) => { decided.add(id); });
  try {
    await a.transcribe(callId);
    await a.embedChunks(callId);
    await a.extractCommitments(callId);
    ids = await a.runAgent(callId);
  } catch (e) {
    await a.markCallFailed(callId, e instanceof Error ? e.message : 'Processing failed.');
    throw e;
  }
  await condition(() => ids !== null && ids.every(i => decided.has(i)), '30 days');
  await a.markCallDone(callId);
}

export async function reminderWorkflow(reminderId: string, remindAtMs: number) {
  await sleep(Math.max(0, remindAtMs - Date.now()));
  await a.markReminderDue(reminderId);
}
