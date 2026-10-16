const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Turn spoken due text ("Friday", "next week") into a date, relative to when the call was held. */
export function resolveDue(due: string | null | undefined, held: Date): Date | undefined {
  if (!due) return undefined;
  const s = due.toLowerCase();
  const d = new Date(held);
  const day = DAYS.findIndex(n => s.includes(n));
  if (day >= 0) { d.setDate(d.getDate() + (((day - d.getDay() + 7) % 7) || 7)); return d; }
  if (s.includes('tomorrow')) { d.setDate(d.getDate() + 1); return d; }
  if (s.includes('tonight') || s.includes('today')) return d;
  if (s.includes('next week')) { d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); return d; } // Monday after
  if (s.includes('this week')) { d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return d; }    // Friday
  return undefined;
}

export const isOverdue = (c: { status: string; dueAt?: Date | string | null }, now = new Date()) =>
  c.status === 'open' && !!c.dueAt && new Date(c.dueAt).getTime() < now.getTime();

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
/** A quote counts as real only if it appears in the transcript (ignoring case and punctuation). */
export const quoteInTranscript = (quote: string, transcript: string) => norm(transcript).includes(norm(quote));
