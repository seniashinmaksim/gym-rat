/**
 * Fatigue cost and the load of the CURRENT session (Part 5, E.2).
 *
 * - `fatigueCostOf`: HIGH / MODERATE / LOW per exercise (data in src/data/exercises.ts, derived for custom
 *   exercises, raised to HIGH for weighted pull-ups / dips). A practical, research-informed heuristic —
 *   see rules `fatigue_cost` and `exercise_order`.
 * - `sessionLoad`: what has ACTUALLY been done so far in a session, in whatever order it was done
 *   (never the planned order): effective sets per muscle, demanding lifts done, failure sets, rep drops.
 *
 * Exercise order mainly affects how well the LATER exercises perform (fewer reps / lower load when they
 * come after fatiguing work); differences in long-term hypertrophy between orders are small or unclear.
 * So order advice here is about protecting performance where it matters most, not a growth rule.
 */
import { isFailureSetForFatigue } from './failure';
import { isCounted, sideFactors } from './quality';
import { resolveCoefficients, type Registry } from './registry';
import type { ExerciseDef, FatigueCost, MuscleId, QualityModel, Variation, Workout, WorkoutSet } from './types';
import { sessionMuscleEffective } from './volume';

export const FATIGUE_RANK: Record<FatigueCost, number> = { high: 0, moderate: 1, low: 2 };
export const FATIGUE_LABEL: Record<FatigueCost, string> = { high: 'HIGH', moderate: 'MODERATE', low: 'LOW' };

const LOWER_HEAVY_PATTERNS = new Set(['squat', 'hinge', 'lunge']);

/**
 * `sets`: the sets of the entry when there is one. Pull-ups / dips count as weighted when the variation says so OR
 * a performed working set carries added load (dips have no `loading` field; older pull-up entries may lack it).
 */
export function fatigueCostOf(def: Pick<ExerciseDef, 'category' | 'fatigueCost' | 'id'> | undefined, variation?: Variation | null, sets?: WorkoutSet[]): FatigueCost {
  if (!def) return 'moderate';
  if (def.id === 'pull_up' || def.id === 'dips') {
    const addedLoad = (sets ?? []).some((s) => isCounted(s) && s.type !== 'warmup' && s.loadMode !== 'assisted' && (s.weightKg ?? 0) > 0);
    if (variation?.loading === 'weighted' || addedLoad) return 'high';
  }
  return def.fatigueCost ?? (def.category === 'isolation' ? 'low' : 'moderate');
}

/** A HIGH-cost squat / hinge / lunge pattern: loads the lower body and spine heavily. */
export function isHeavyLower(def: Pick<ExerciseDef, 'pattern' | 'category' | 'fatigueCost' | 'id'> | undefined, variation?: Variation | null, sets?: WorkoutSet[]): boolean {
  return !!def && LOWER_HEAVY_PATTERNS.has(def.pattern) && fatigueCostOf(def, variation, sets) === 'high';
}

export interface SessionLoad {
  /** Effective sets per muscle performed so far in this session (planned sets ignored). */
  muscles: Partial<Record<MuscleId, number>>;
  /** Exercises with at least one performed working set. */
  exercisesDone: number;
  workingSets: number;
  /** Exercise ids of HIGH-cost lifts already performed (in the order they were done). */
  highCostDone: string[];
  /** HIGH-cost squat / hinge / lunge lifts performed (e.g. squat + RDL → lower body heavily loaded). */
  heavyLowerDone: string[];
  failureSets: number;
  /** Sets whose reps fell ≥ 3 below the previous set at the same load (fatigue showing). */
  repDropSets: number;
  /** fresh / moderate / heavy — a summary of the above, never a score. */
  level: 'fresh' | 'moderate' | 'heavy';
}

/**
 * The real load of a session so far. Exercises are ordered by when their first set was completed
 * (falling back to their position) — the planned order is never assumed.
 */
export function sessionLoad(w: Workout, registry: Registry, quality: QualityModel): SessionLoad {
  const muscles = sessionMuscleEffective(w, registry, quality);
  const done = w.exercises
    .map((e, i) => ({ e, i, first: e.sets.filter((s) => isCounted(s) && s.type !== 'warmup').map((s) => s.completedAt ?? '').sort()[0] }))
    .filter((x) => x.first !== undefined)
    .sort((a, b) => (a.first && b.first ? a.first.localeCompare(b.first) : 0) || a.i - b.i);
  const highCostDone: string[] = [];
  const heavyLowerDone: string[] = [];
  let workingSets = 0;
  let failureSets = 0;
  let repDropSets = 0;
  for (const { e } of done) {
    const def = registry.get(e.exerciseId);
    const ws = e.sets.filter((s) => isCounted(s) && s.type === 'working');
    // A left + right pair is one set (0.5 + 0.5), as everywhere else.
    const f = sideFactors(e.sets);
    workingSets += ws.reduce((n, s) => n + (f.get(s.id) ?? 1), 0);
    failureSets += ws.filter(isFailureSetForFatigue).reduce((n, s) => n + (f.get(s.id) ?? 1), 0);
    for (let k = 1; k < ws.length; k++) {
      const a = ws[k - 1];
      const b = ws[k];
      if (a.weightKg === b.weightKg && a.reps != null && b.reps != null && a.reps - b.reps >= 3 && !a.side && !b.side) repDropSets++;
    }
    if (fatigueCostOf(def, e.variation, e.sets) === 'high') highCostDone.push(e.exerciseId);
    if (isHeavyLower(def, e.variation, e.sets)) heavyLowerDone.push(e.exerciseId);
  }
  const level: SessionLoad['level'] =
    heavyLowerDone.length >= 2 || highCostDone.length >= 3 || failureSets >= 4 || repDropSets >= 3 ? 'heavy'
      : highCostDone.length >= 1 || workingSets >= 8 ? 'moderate' : 'fresh';
  return { muscles, exercisesDone: done.length, workingSets, highCostDone, heavyLowerDone, failureSets, repDropSets, level };
}

/** Significant muscles (coefficient ≥ min) of an exercise with its variation, strongest first. */
export function significantMuscles(def: ExerciseDef, variation?: Variation | null, min = 0.5): { muscle: MuscleId; coef: number }[] {
  const { contributions } = resolveCoefficients(def, variation ?? undefined);
  return (Object.entries(contributions) as [MuscleId, number][])
    .filter(([, c]) => c >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, coef]) => ({ muscle, coef }));
}
