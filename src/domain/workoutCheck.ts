/**
 * Workout check (Part 6, F.9): every number the app derives from ONE workout, step by step, so the owner
 * can verify the formulas on real data without sharing it.
 *
 *   per set:      what was logged, what was reported, what the numbers say, the credit and why;
 *   per exercise: coefficient × Σ credit for each muscle, the context (fresh / after same-muscle work),
 *                 the strength index of this session and the load decision;
 *   per muscle:   the sum over the exercises and the session total the Week screen uses.
 *
 * Nothing is computed a second way: credits come from `assessSet` with `objectiveForSets`, pairing from
 * `sideFactors`, coefficients from `resolveCoefficients`, totals from `computeVolume` — the same calls the
 * weekly numbers use. Read-only; nothing is stored.
 */
import { effortTapOf, type EffortTap } from './liveFlow';
import { objectiveForSets, reportedRir, withoutAutoWarmups, type Disagreement, type Objective } from './perception';
import { preloadFor, type PreloadContext } from './preload';
import { progressionKey, type NextLoad, type ProgressionSeries, type SessionPerf } from './progression';
import { assessSet, isCounted, sideFactors, type SetQuality } from './quality';
import { resolveCoefficients, type Registry } from './registry';
import type { MuscleId, QualityModel, Workout, WorkoutExercise, WorkoutSet } from './types';
import { computeVolume } from './volume';

const r2 = (n: number) => Math.round(n * 100 + 1e-9) / 100;

export interface CheckSet {
  set: WorkoutSet;
  /** 1-based position among the performed sets of the exercise. */
  n: number;
  /** How much of ONE set this row is (0.5 for one side of a left / right pair). */
  factor: number;
  /** What the owner reported: an exact RIR, a failure answer, the one-tap answer, or nothing. */
  report: { rir: number | null; tap: EffortTap | null; reservedAs: number | null };
  /** What the numbers of this exercise say (null when the check is switched off). */
  objective: Objective | null;
  quality: SetQuality;
  disagreement: Disagreement;
}

export interface CheckMusclePart {
  muscle: MuscleId;
  coefficient: number;
  /** Σ credit × factor over the counted sets of this exercise. */
  creditSets: number;
  /** coefficient × creditSets, before the per-session ceiling. */
  effective: number;
}

export interface CheckExercise {
  entry: WorkoutExercise;
  known: boolean;
  sets: CheckSet[];
  /** Counted working sets (left + right = one). */
  workingSets: number;
  warmups: number;
  muscles: CheckMusclePart[];
  context: PreloadContext;
  /** This session inside its history (same exercise × machine × configuration), when it has one. */
  history: { series: ProgressionSeries; session: SessionPerf | null; previous: SessionPerf | null; next: NextLoad } | null;
}

export interface CheckMuscle {
  muscle: MuscleId;
  parts: { exerciseEntryId: string; exerciseId: string; coefficient: number; creditSets: number; effective: number }[];
  /** Σ parts, before the per-session ceiling. */
  sum: number;
  /** What the app counts for this session (after the ceiling) — the number the Week screen adds up. */
  counted: number;
  tapered: boolean;
}

export interface WorkoutCheck {
  exercises: CheckExercise[];
  muscles: CheckMuscle[];
  ceiling: number | null;
}

export function workoutCheck(w: Workout, registry: Registry, model: QualityModel, progression: ProgressionSeries[] = []): WorkoutCheck {
  const exercises: CheckExercise[] = [];
  const byMuscle = new Map<MuscleId, CheckMuscle>();

  for (const ex0 of w.exercises) {
    const ex = withoutAutoWarmups(ex0, model);
    const def = registry.get(ex.exerciseId);
    const factors = sideFactors(ex.sets);
    const objective = model.useNumbersCheck === false ? null : objectiveForSets(ex.sets);
    const performed = ex.sets.filter((s) => isCounted(s));
    const sets: CheckSet[] = performed.map((s, i) => {
      const quality = assessSet(s, model, { rom: ex.variation?.rom, timed: !!def && def.repRange[1] <= 1, objective: objective?.get(s.id) });
      return {
        set: s, n: i + 1, factor: factors.get(s.id) ?? 1,
        report: { rir: s.rir, tap: effortTapOf(s), reservedAs: reportedRir(s, model.useFeelWhenNoRir !== false) },
        objective: objective?.get(s.id) ?? null, quality, disagreement: quality.disagreement ?? null,
      };
    });
    const working = sets.filter((c) => c.set.type !== 'warmup');
    const creditSets = working.reduce((a, c) => a + c.quality.credit * c.factor, 0);
    const muscles: CheckMusclePart[] = [];
    if (def) {
      const { contributions } = resolveCoefficients(def, ex.variation);
      for (const [muscle, coefficient] of Object.entries(contributions) as [MuscleId, number][]) {
        if (!coefficient) continue;
        const part = { muscle, coefficient, creditSets: r2(creditSets), effective: r2(coefficient * creditSets) };
        muscles.push(part);
        let m = byMuscle.get(muscle);
        if (!m) { m = { muscle, parts: [], sum: 0, counted: 0, tapered: false }; byMuscle.set(muscle, m); }
        m.parts.push({ exerciseEntryId: ex.id, exerciseId: ex.exerciseId, coefficient, creditSets: part.creditSets, effective: part.effective });
        m.sum += coefficient * creditSets;
      }
      muscles.sort((a, b) => b.coefficient - a.coefficient);
    }
    const series = def ? progression.find((p) => p.key === progressionKey(ex, w, def)) : undefined;
    const idx = series ? series.sessions.findIndex((s) => s.workoutId === w.id) : -1;
    exercises.push({
      entry: ex0, known: !!def, sets,
      workingSets: r2(working.reduce((a, c) => a + c.factor, 0)), warmups: sets.length - working.length,
      muscles, context: preloadFor(w, ex, registry),
      history: series ? { series, session: idx >= 0 ? series.sessions[idx] : null, previous: idx > 0 ? series.sessions[idx - 1] : null, next: series.next } : null,
    });
  }

  const total = computeVolume([w], registry, model).muscles;
  const muscles = [...byMuscle.values()].map((m) => {
    const counted = total[m.muscle]?.effective ?? 0;
    const sum = r2(m.sum);
    return { ...m, sum, counted, tapered: counted < sum - 0.005 };
  }).filter((m) => m.sum > 0 || m.parts.length > 0).sort((a, b) => b.counted - a.counted || b.sum - a.sum);
  return { exercises, muscles, ceiling: model.sessionCreditCap ?? null };
}
