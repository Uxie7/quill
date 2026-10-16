import { col } from '../db/client';
export { transcribe } from './transcribe';
export { embedChunks } from './embed';
export { extractCommitments } from './extract';
export { runAgent } from '../agent/run';

export async function markCallDone(callId: string) {
  await (await col('calls')).updateOne({ _id: callId }, { $set: { status: 'done' } });
}
export async function markCallFailed(callId: string, message: string) {
  await (await col('calls')).updateOne({ _id: callId }, { $set: { status: 'failed', error: message } });
}
export async function markReminderDue(reminderId: string) {
  await (await col('reminders')).updateOne({ _id: reminderId, state: 'scheduled' }, { $set: { state: 'due' } });
}
