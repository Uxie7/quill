export type Level = 'high' | 'mid' | 'low';
export type Plan = { level: Level; kind: 'checkin' | 'plan' | 'recap'; reminderDays: number; label: string; headline: string };

/** The decision table from docs/05. Plain code so it can be tested. */
export function decide(risk: number | null): Plan {
  const level: Level = risk === null ? 'low' : risk >= 0.6 ? 'high' : risk >= 0.3 ? 'mid' : 'low';
  return {
    level,
    kind: ({ high: 'checkin', mid: 'plan', low: 'recap' } as const)[level],
    reminderDays: ({ high: 2, mid: 4, low: 7 } as const)[level],
    label: ({ high: 'may be going quiet', mid: 'might pause', low: 'is on track' } as const)[level],
    headline: ({
      high: 'A friendly check-in fits better than a routine recap.',
      mid: 'A short plan they can do alone keeps them moving without pressure.',
      low: 'No sign of drift, so a standard recap is enough.',
    } as const)[level],
  };
}
