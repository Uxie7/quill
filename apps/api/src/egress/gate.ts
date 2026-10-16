import { RiskFeatures } from '../schemas';

const SKIP = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|thanks|great|okay|perfect|understood|good|sure|will|glad|same|yes|just|honestly|actually|maybe|probably|interesting|recap|weird|there|right|okay)$/i;

/** Words that must never appear in an outbound search: client and practitioner names, plus proper nouns in the transcript. */
export function forbiddenTerms(clientName: string, practitioner: string, transcript: string): string[] {
  const caps = (transcript.match(/(?<![.!?]\s)\b[A-Z][a-z]{3,}\b/g) ?? []).filter(w => !SKIP.test(w));
  return [...new Set([clientName, practitioner, ...caps].filter(Boolean))];
}

export function gateSearch(topic: string, forbidden: string[]) {
  const words = topic.trim().split(/\s+/);
  if (words.length < 4 || words.length > 8) throw new Error('Search topic must be 4 to 8 words.');
  if (/\d{3,}|@/.test(topic)) throw new Error('Search topic contains digits or an email-like pattern.');
  const padded = ` ${topic.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')} `;
  for (const f of forbidden) {
    if (f && padded.includes(` ${f.toLowerCase()} `)) throw new Error('Search topic contains a name from the record.');
  }
}

/** Only these six numbers may go to the prediction service. */
export function gateFeatures(f: unknown) {
  return RiskFeatures.strict().parse(f);
}
