import { col } from './db/client';
import { transcribe } from './activities/transcribe';
import { embedChunks } from './activities/embed';
import { extractCommitments } from './activities/extract';
import { runAgent } from './agent/run';

/** The whole call pipeline as plain functions. Used directly, or wrapped by the Temporal workflow. */
export async function runPipeline(callId: string): Promise<string[]> {
  try {
    await transcribe(callId);
    await embedChunks(callId);
    await extractCommitments(callId);
    return await runAgent(callId);
  } catch (e: any) {
    await (await col('calls')).updateOne({ _id: callId }, { $set: { status: 'failed', error: e?.message ?? 'Processing failed.' } });
    throw e;
  }
}
