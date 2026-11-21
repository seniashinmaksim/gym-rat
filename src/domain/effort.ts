/**
 * How many of a period's counted working sets carry ANY effort information (RIR, the Fail chip,
 * a failure answer, or how the set felt). Sets without it are credited a provisional 0.75 — fine
 * occasionally, but if most sets lack it the weekly numbers are mostly guesses, so the Week screen
 * shows a gentle nudge (only when ≥ 50 % are missing and there are at least 6 sets).
 */
import type { Workout, WorkoutSet } from './types';

export const hasEffortInfo = (s: WorkoutSet): boolean =>
  s.rir != null || !!s.toFailure || !!s.effort || !!s.feel || (s.failure === 'muscular' && s.technicalFailure !== true);

export function effortCoverage(workouts: Workout[], range: { start: string; end: string }): { counted: number; missing: number; nudge: boolean } {
  let counted = 0;
  let missing = 0;
  for (const w of workouts) {
    if (w.date < range.start || w.date > range.end) continue;
    for (const e of w.exercises) for (const s of e.sets) {
      if (s.planned || s.type === 'warmup') continue;
      counted++;
      if (!hasEffortInfo(s)) missing++;
    }
  }
  return { counted, missing, nudge: counted >= 6 && missing / counted >= 0.5 };
}
