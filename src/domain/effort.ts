/**
 * How many of a period's counted working sets carry ANY effort information (RIR, the Fail chip or a
 * muscular-failure answer with technique intact, or an effort answer). "Pain" and "wrong weight" answers say
 * nothing about effort and do not count. Sets without it are credited a provisional 0.75 — fine
 * occasionally, but if most sets lack it the weekly numbers are mostly guesses, so the Week screen
 * shows a gentle nudge (only when ≥ 50 % are missing and there are at least 6 sets).
 */
import type { Workout, WorkoutSet } from './types';

export const hasEffortInfo = (s: WorkoutSet): boolean =>
  s.rir != null || !!s.effort || ((!!s.toFailure || s.failure === 'muscular') && s.technicalFailure !== true);

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

/**
 * Weekly effort distribution of counted working sets (left/right pairs count once): logged RIR
 * buckets, failure answers without RIR (muscular failure ≈ RIR 0), unknown effort, technique trouble.
 * Average RIR uses logged RIR only (estimates from feel are not averaged as if measured).
 */
export interface EffortDistribution { rir0: number; rir1: number; rir2: number; rir3plus: number; unknown: number; compromised: number; avgRir: number | null; total: number }

export function effortDistribution(workouts: Workout[], range: { start: string; end: string }): EffortDistribution {
  const d: EffortDistribution = { rir0: 0, rir1: 0, rir2: 0, rir3plus: 0, unknown: 0, compromised: 0, avgRir: null, total: 0 };
  let rirSum = 0;
  let rirN = 0;
  for (const w of workouts) {
    if (w.date < range.start || w.date > range.end) continue;
    for (const e of w.exercises) {
      const sets = e.sets.filter((s) => !s.planned && (s.type === 'working' || s.type === 'drop'));
      const leftN = sets.filter((s) => s.side === 'left').length;
      const rightN = sets.filter((s) => s.side === 'right').length;
      const pairs = Math.min(leftN, rightN);
      let rightSeen = 0;
      for (const s of sets) {
        // A left+right pair is one set: count the left side, skip the paired right sides.
        if (s.side === 'right' && rightSeen++ < pairs) continue;
        d.total++;
        const rir = s.rir ?? ((s.toFailure || s.failure === 'muscular') && !s.technicalFailure ? 0 : null);
        if (s.rir != null) { rirSum += s.rir; rirN++; }
        if (rir == null) d.unknown++;
        // Fractional RIR (e.g. 1.5 from RPE 8.5) goes to the nearest column: ≤0.5 → 0, <1.5 → 1, <2.5 → 2, else 3+.
        else if (rir <= 0.5) d.rir0++;
        else if (rir < 1.5) d.rir1++;
        else if (rir < 2.5) d.rir2++;
        else d.rir3plus++;
        if (s.technicalFailure || s.technique === 'compromised' || s.technique === 'failed' || s.techniqueOk === false) d.compromised++;
      }
    }
  }
  d.avgRir = rirN ? Math.round((rirSum / rirN) * 10) / 10 : null;
  return d;
}

/**
 * Week totals for the compact report: workouts, counted working sets, quality (effective) sets from
 * the central volume engine, average logged RIR, and tonnage (Σ weight × reps as logged, secondary —
 * never compared across unrelated exercises).
 */
export function weekTotals(workouts: Workout[], range: { start: string; end: string }, effectiveSum: (ws: Workout[]) => number) {
  const ws = workouts.filter((w) => w.date >= range.start && w.date <= range.end);
  const eff = effortDistribution(ws, range);
  let tonnage = 0;
  for (const w of ws) for (const e of w.exercises) for (const s of e.sets) {
    if (s.planned || (s.type !== 'working' && s.type !== 'drop') || s.loadMode === 'assisted') continue;
    tonnage += (s.weightKg ?? 0) * (s.reps ?? 0);
  }
  return { workouts: ws.length, workingSets: eff.total, effective: Math.round(effectiveSum(ws) * 10) / 10, avgRir: eff.avgRir, tonnageKg: Math.round(tonnage) };
}
