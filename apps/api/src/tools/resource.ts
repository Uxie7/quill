import { col } from '../db/client';
import { cfg } from '../config';
import { gateSearch } from '../egress/gate';
import { egressFetch } from '../egress/wrapper';

export const DEFAULT_TOPICS: Record<string, string> = {
  freelancer: 'client feedback checklist for designers',
  consultant: 'consulting findings report outline template',
  coach: 'simple home practice routine for beginners',
};

export interface Resource { title: string; url: string; snippet?: string }

export async function findResource(topic: string, forbidden: string[], callId: string): Promise<Resource | null> {
  gateSearch(topic, forbidden); // throws if the topic could identify anyone
  const cache = await col('resource_cache');
  const hit = await cache.findOne({ _id: topic });
  if (hit) return hit.result ?? null;
  if (!cfg.serpKey) return null;
  const url = `https://serpapi.com/search.json?engine=google&num=5&q=${encodeURIComponent(topic)}&api_key=${cfg.serpKey}`;
  const data = await egressFetch({
    to: 'Web search provider', url, method: 'GET', callId,
    reason: 'Find a public resource to attach',
    describe: `Search: "${topic}". Client details removed.`,
  });
  const top = data.organic_results?.[0];
  const result: Resource | null = top ? { title: top.title, url: top.link, snippet: top.snippet } : null;
  await cache.replaceOne({ _id: topic }, { _id: topic, result }, { upsert: true });
  return result;
}
