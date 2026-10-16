import { norm } from '../dates';

const tok = (s: string) => new Set(norm(s).split(' ').filter(w => w.length > 2));
export const sim = (a: string, b: string) => {
  const A = tok(a), B = tok(b);
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
};

export interface Truth { who: string; text: string; due: string | null; firm: boolean }
export interface Got { who: string; text: string; status: string }

/** Compare extracted promises with ground truth. */
export function score(truth: Truth[], got: Got[]) {
  let matched = 0, whoOk = 0, hedged = 0, hedgedUnclear = 0;
  const used = new Set<number>();
  for (const t of truth) {
    if (!t.firm) hedged++;
    let best = -1, bestSim = 0;
    got.forEach((g, i) => { if (used.has(i)) return; const s = sim(t.text, g.text); if (s > bestSim) { bestSim = s; best = i; } });
    if (best >= 0 && bestSim >= 0.25) {
      used.add(best); matched++;
      if (got[best].who === t.who) whoOk++;
      if (!t.firm && got[best].status === 'unclear') hedgedUnclear++;
    }
  }
  return {
    recall: truth.length ? matched / truth.length : 1,
    precision: got.length ? matched / got.length : 1,
    speaker: matched ? whoOk / matched : 0,
    ambiguity: hedged ? hedgedUnclear / hedged : 1,
    extra: got.length - matched,
  };
}
