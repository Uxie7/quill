import { col, newId } from '../db/client';
import { chatJson } from '../llm';
import { ExtractionOutput } from '../schemas';
import { quoteInTranscript, resolveDue } from '../dates';
import { step } from '../steps';
import { cfg } from '../config';
import { extractionPrompt } from '../agent/prompts';

export async function extractCommitments(callId: string) {
  const calls = await col('calls'), commitments = await col('commitments'), clients = await col('clients');
  const call = await calls.findOne({ _id: callId });
  if (!call?.transcript) throw new Error('No transcript to read.');
  if (await commitments.countDocuments({ callId })) return; // idempotent
  const client = await clients.findOne({ _id: call.clientId });
  if (!client) throw new Error('Client not found.');

  await step(callId, 1, 'extract', 'Finding who promised what', 'extract_commitments, open model', async () => {
    const parsed = await chatJson([{ role: 'user', content: extractionPrompt(cfg.practitioner, client.name, call.transcript) }], ExtractionOutput);
    const seen = new Set<string>();
    const good = parsed.commitments.filter(c => {
      if (!quoteInTranscript(c.quote, call.transcript)) return false; // the quote must be real
      const k = `${c.who}:${c.text.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (good.length) {
      await commitments.insertMany(good.map(c => ({
        _id: newId(), clientId: call.clientId, callId, who: c.who, text: c.text, due: c.due,
        dueAt: resolveDue(c.due, call.heldAt), status: c.firm ? 'open' : 'unclear', quote: c.quote, confidence: c.firm ? 0.9 : 0.5,
      })));
    }
    const unclear = good.filter(c => !c.firm).length;
    return { value: null, result: `Found ${good.length} promises.${unclear ? ` ${unclear} of them ${unclear === 1 ? 'is' : 'are'} unclear.` : ''}` };
  });
}
