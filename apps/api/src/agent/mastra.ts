// OPTIONAL: expose Quill's tools through Mastra (for the Mastra category).
// The default pipeline (agent/run.ts) enforces the tool order in code, which is more reliable with small local models.
// TODO(verify): createTool / Agent signatures and the model provider against the current Mastra docs.
import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchPastNotes } from '../tools/history';
import { predictDropoutRisk } from '../tools/risk';
import { findResource } from '../tools/resource';
import { SYSTEM_PROMPT } from './prompts';

export const searchPastNotesTool = createTool({
  id: 'search_past_notes',
  description: "Search this client's earlier calls for a pattern such as repeated delays.",
  inputSchema: z.object({ clientId: z.string(), callId: z.string(), query: z.string() }),
  execute: async ({ context }) => ({ hits: await searchPastNotes(context.clientId, context.callId, context.query) }),
});

export const predictDropoutRiskTool = createTool({
  id: 'predict_dropout_risk',
  description: 'Estimate how likely this client is to stop working with you, from attendance numbers only.',
  inputSchema: z.object({ clientId: z.string(), callId: z.string() }),
  execute: async ({ context }) => { const r = await predictDropoutRisk(context.clientId, context.callId); return { risk: r.risk, method: r.method }; },
});

export const findResourceTool = createTool({
  id: 'find_resource',
  description: 'Find a free public resource to attach. The topic must be 4 to 8 general words and must never include names.',
  inputSchema: z.object({ topic: z.string(), callId: z.string(), forbidden: z.array(z.string()) }),
  execute: async ({ context }) => ({ resource: await findResource(context.topic, context.forbidden, context.callId) }),
});

/** Build the agent with the model you choose (for example an Ollama model through the AI SDK provider). */
export function createQuillAgent(model: any) {
  return new Agent({
    name: 'quill',
    instructions: SYSTEM_PROMPT,
    model,
    tools: { search_past_notes: searchPastNotesTool, predict_dropout_risk: predictDropoutRiskTool, find_resource: findResourceTool },
  });
}
