import type { AppData } from './appdata';
import { techniqueOf } from './feedback';
import { buildRegistry, type Registry } from './registry';
import { isCounted, sideFactors } from './quality';
import type { ExerciseDef, FailureStatus, MuscleId, Technique, Workout, WorkoutSet } from './types';

/**
 * Failure status ("Did you reach muscular failure?") — kept SEPARATE from RIR.
 *
 * Practical consistency (heuristic, not a measurement):
 * - muscular failure with proper technique ≈ 0 RIR;
 * - "none" (stopped before failure) ≈ RIR ≥ 1;
 * - technical failure (technique gave out) does not necessarily mean 0 muscular RIR;
 * - uncertain → RIR may stay unknown.
 *
 * Nothing here ever overwrites a manually entered RIR, and nothing is invented for older sets:
 * a set without `failure` / `technicalFailure` / `toFailure` simply has an unknown failure status.
 *
 * Evidence note: training to failure is NOT required and is not clearly superior for hypertrophy
 * compared with stopping 1–3 reps short (Refalo 2023 meta-analysis; Refalo 2024; Robinson 2024
 * dose-response). The app therefore gives failure sets the same effort credit as RIR 0–3 sets.
 */

// ---------------------------------------------------------------- Per-set status

export type EffectiveFailureStatus = FailureStatus | 'unknown';
export type FailureSource = 'recorded' | 'to_failure' | 'none';

export interface EffectiveFailure {
  status: EffectiveFailureStatus;
  /** recorded = the failure field; to_failure = the older "Fail" chip / import `to_failure`; none = nothing recorded. */
  source: FailureSource;
  /** Set ended because technique broke down. */
  technical: boolean;
  /** Short label for the UI. */
  label: string;
}

export const FAILURE_LABEL: Record<EffectiveFailureStatus, string> = {
  muscular: 'Muscular failure',
  none: 'Stopped before failure',
  uncertain: 'Not sure if failure',
  unknown: 'Failure not recorded',
};

/**
 * The failure status used by analysis: the failure field if set, else `toFailure` true →
 * muscular (reported via Fail / to_failure), else unknown. RIR 0 alone is NOT turned into a
 * failure status (it may have been an estimate), and older sets are never given one.
 */
export function effectiveFailure(s: WorkoutSet): EffectiveFailure {
  const technical = s.technicalFailure === true;
  if (s.failure) return { status: s.failure, source: 'recorded', technical, label: FAILURE_LABEL[s.failure] + (technical ? ' (technique gave out)' : '') };
  if (s.toFailure) return { status: 'muscular', source: 'to_failure', technical, label: 'Muscular failure (reported via Fail / to_failure)' };
  if (technical) return { status: 'unknown', source: 'none', technical, label: 'Technical failure' };
  return { status: 'unknown', source: 'none', technical, label: FAILURE_LABEL.unknown };
}

/** Clean muscular failure: muscular failure recorded (or via Fail) and technique did NOT give out first. */
export function isCleanMuscularFailure(s: WorkoutSet): boolean {
  const f = effectiveFailure(s);
  return f.status === 'muscular' && !f.technical;
}

/** Counts as a "failure set" for fatigue/recovery: Fail chip, RIR 0, muscular failure or technical failure. */
export function isFailureSetForFatigue(s: WorkoutSet): boolean {
  return !!s.toFailure || s.rir === 0 || s.failure === 'muscular' || s.technicalFailure === true;
}

/**
 * Technique as used by the quality model: a technical-failure set counts as "compromised" unless
 * technique was explicitly recorded as good (an explicit "compromised"/"failed" stays as it is).
 */
export function techniqueWithFailure(s: WorkoutSet): Technique | undefined {
  const t = techniqueOf(s);
  if (s.technicalFailure !== true) return t;
  if (t === 'good' || t === 'compromised' || t === 'failed') return t;
  return 'compromised';
}

/**
 * RIR implied by the failure status when NO RIR was logged (analysis only, never stored):
 * clean muscular failure → 0. "none" gives no number (only "≥ 1"), uncertain / technical → null.
 */
export function failureImpliedRir(s: WorkoutSet): number | null {
  if (s.rir != null || s.toFailure) return null;
  if (s.failure === 'muscular' && s.technicalFailure !== true) return 0;
  return null;
}

/**
 * Gentle consistency check between the failure status and the logged RIR. Returns null when
 * consistent, else one short sentence. Never changes the RIR (the owner decides which is right).
 */
export function failureConsistency(s: WorkoutSet): string | null {
  if (s.type === 'warmup') return null;
  const rir = s.rir;
  if (s.failure === 'muscular' && s.technicalFailure === true) {
    return 'Technique gave out before the muscle — counted as technical failure, not a clean failure set.';
  }
  if (s.failure === 'muscular' && rir != null && rir >= 2) {
    return `Marked as muscular failure, but RIR ${rir} is logged. Failure usually means about 0 RIR — your RIR is kept as entered; check which one is right.`;
  }
  if (s.failure === 'none' && (rir === 0 || s.toFailure)) {
    return `Marked as stopped before failure, but ${s.toFailure && rir == null ? '"Fail"' : 'RIR 0'} is logged. Stopping early usually means at least 1 rep in reserve — check which one is right.`;
  }
  if (s.technicalFailure === true && s.failure == null && (rir === 0 || s.toFailure)) {
    return 'Technique gave out — the muscle may still have had a rep or two left, so RIR 0 may overstate how close to muscular failure this was.';
  }
  return null;
}

// ---------------------------------------------------------------- Exercise categories

/**
 * Free-weight / technically demanding compounds where taking every set to failure is
 * discouraged (injury risk and technique breakdown rise; fatigue cost is high). Practical
 * heuristic, not a rule from a specific trial.
 */
export const TECHNIQUE_FIRST_COMPOUNDS: readonly string[] = [
  'back_squat', 'front_squat', 'deadlift', 'romanian_deadlift', 'dumbbell_romanian_deadlift',
  'barbell_bench_press', 'incline_barbell_press', 'dumbbell_bench_press', 'incline_dumbbell_press', 'close_grip_bench',
  'overhead_press', 'dumbbell_shoulder_press', 'barbell_row', 't_bar_row', 'bulgarian_split_squat', 'walking_lunge', 'hip_thrust',
];

export type FailureCategory = 'technique_first_compound' | 'compound' | 'stable_isolation' | 'isolation';

const STABLE_KINDS = ['machine', 'cable', 'plate_loaded', 'smith'];

export function failureCategory(def: ExerciseDef | undefined, exerciseId: string): FailureCategory {
  if (TECHNIQUE_FIRST_COMPOUNDS.includes(exerciseId)) return 'technique_first_compound';
  if (!def) return 'compound';
  if (def.category === 'compound') return 'compound';
  return STABLE_KINDS.includes(def.equipmentKind) ? 'stable_isolation' : 'isolation';
}

// ---------------------------------------------------------------- Profile

export interface FailureCounts {
  /** Working + drop sets performed (left/right pairs count once). */
  workingSets: number;
  /** Sets with failure information (failure field, Fail / to_failure, or technical failure). */
  recorded: number;
  muscular: number;
  none: number;
  uncertain: number;
  /** Sets that ended in technical failure (technique gave out), whatever the failure status. */
  technical: number;
  /** muscular ÷ recorded (0..1), null when nothing recorded. */
  shareAtFailure: number | null;
}

export interface ExerciseFailureRow extends FailureCounts {
  exerciseId: string;
  category: FailureCategory;
}

export interface MuscleFailureRow extends FailureCounts {
  muscle: MuscleId;
}

export type FailureFlagId =
  | 'not_enough_data'
  | 'frequently_to_failure'
  | 'usually_rir'
  | 'failure_mostly_isolation'
  | 'failure_often_compounds'
  | 'technical_before_muscular';

export interface FailureFlag {
  id: FailureFlagId;
  /** One short line for the UI. */
  text: string;
  /** Plain explanation (never claims that failure grows more muscle). */
  why: string;
  exerciseIds?: string[];
}

export interface FailureProfile {
  range: { start: string; end: string };
  totals: FailureCounts;
  exercises: ExerciseFailureRow[];
  muscles: MuscleFailureRow[];
  flags: FailureFlag[];
  /** The one line the weekly summary shows (null when there is nothing to say). */
  line: string | null;
}

/** Below this many sets with a recorded failure status, only "not enough data" is reported. */
export const FAILURE_MIN_RECORDED = 6;

const emptyCounts = (): FailureCounts => ({ workingSets: 0, recorded: 0, muscular: 0, none: 0, uncertain: 0, technical: 0, shareAtFailure: null });

function add(c: FailureCounts, s: WorkoutSet, k: number) {
  c.workingSets += k;
  const f = effectiveFailure(s);
  if (f.technical) c.technical += k;
  if (f.status === 'unknown' && !f.technical) return;
  c.recorded += k;
  if (f.status === 'muscular' && !f.technical) c.muscular += k;
  else if (f.status === 'none') c.none += k;
  else if (f.status === 'uncertain') c.uncertain += k;
  // A "muscular" set whose technique gave out first counts as technical failure, not muscular.
}

const finish = <T extends FailureCounts>(c: T): T => {
  const r = (n: number) => Math.round(n * 100) / 100;
  return { ...c, workingSets: r(c.workingSets), recorded: r(c.recorded), muscular: r(c.muscular), none: r(c.none), uncertain: r(c.uncertain), technical: r(c.technical), shareAtFailure: c.recorded > 0 ? r(c.muscular / c.recorded) : null };
};

/**
 * Failure profile over a date range (inclusive): per exercise and per primary muscle
 * (coefficient 1.0), plus pattern flags. Warm-ups and planned sets are ignored; a left + right
 * pair counts as one set. Purely descriptive — failure is neither required nor superior for growth.
 */
export function failureProfile(
  data: Pick<AppData, 'workouts'> & Partial<Pick<AppData, 'customExercises' | 'exerciseOverrides'>>,
  range: { start: string; end: string },
  registry: Registry = buildRegistry(data.customExercises ?? [], data.exerciseOverrides ?? []),
): FailureProfile {
  const totals = emptyCounts();
  const byEx = new Map<string, ExerciseFailureRow>();
  const byMuscle = new Map<MuscleId, MuscleFailureRow>();
  const ws: Workout[] = data.workouts.filter((w) => w.date >= range.start && w.date <= range.end);
  for (const w of ws) {
    for (const ex of w.exercises) {
      const def = registry.get(ex.exerciseId);
      const f = sideFactors(ex.sets);
      const primary = def ? (Object.entries(def.contributions) as [MuscleId, number][]).filter(([, c]) => (c ?? 0) >= 1).map(([m]) => m) : [];
      for (const s of ex.sets) {
        if (!isCounted(s) || s.type === 'warmup') continue;
        const k = f.get(s.id) ?? 1;
        add(totals, s, k);
        let row = byEx.get(ex.exerciseId);
        if (!row) {
          row = { exerciseId: ex.exerciseId, category: failureCategory(def, ex.exerciseId), ...emptyCounts() };
          byEx.set(ex.exerciseId, row);
        }
        add(row, s, k);
        for (const m of primary) {
          let mr = byMuscle.get(m);
          if (!mr) {
            mr = { muscle: m, ...emptyCounts() };
            byMuscle.set(m, mr);
          }
          add(mr, s, k);
        }
      }
    }
  }
  const exercises = [...byEx.values()].map(finish).sort((a, b) => b.workingSets - a.workingSets);
  const muscles = [...byMuscle.values()].map(finish).sort((a, b) => b.workingSets - a.workingSets);
  const t = finish(totals);
  const flags = failureFlags(t, exercises);
  return { range, totals: t, exercises, muscles, flags, line: failureLine(t, flags) };
}

function failureFlags(t: FailureCounts, exercises: ExerciseFailureRow[]): FailureFlag[] {
  if (t.recorded < FAILURE_MIN_RECORDED) {
    return [{
      id: 'not_enough_data',
      text: t.recorded ? `Failure status recorded on only ${t.recorded} set${t.recorded === 1 ? '' : 's'} — not enough to see a pattern.` : 'No failure status recorded yet.',
      why: `At least ${FAILURE_MIN_RECORDED} sets with "Did you reach failure?" answered are needed before describing how often you train to failure.`,
    }];
  }
  const flags: FailureFlag[] = [];
  const share = t.muscular / t.recorded;
  if (share >= 0.5) {
    flags.push({
      id: 'frequently_to_failure',
      text: `${Math.round(share * 100)}% of recorded sets reached muscular failure.`,
      why: 'Stopping 1–3 reps short gives similar muscle growth in current studies (Refalo 2023/2024, Robinson 2024) with less fatigue and longer-lasting performance across sets. Failure is fine occasionally, mainly on stable machine or cable isolation work — it is not required.',
    });
  } else if (share <= 0.2) {
    flags.push({
      id: 'usually_rir',
      text: `Most sets stopped short of failure (${Math.round(share * 100)}% at failure).`,
      why: 'That is fine for hypertrophy as long as sets end close to failure (about 0–3 reps in reserve). Keep logging RIR honestly so the effort credit stays accurate.',
    });
  }
  const iso = exercises.filter((e) => e.category === 'stable_isolation' || e.category === 'isolation');
  const comp = exercises.filter((e) => e.category === 'compound' || e.category === 'technique_first_compound');
  const sum = (rows: ExerciseFailureRow[], k: keyof FailureCounts) => rows.reduce((a, r) => a + ((r[k] as number) ?? 0), 0);
  const isoFail = sum(iso, 'muscular');
  const compFail = sum(comp, 'muscular');
  const compRec = sum(comp, 'recorded');
  if (compRec > 0 && compFail / compRec >= 0.4) {
    const risky = comp.filter((e) => e.category === 'technique_first_compound' && e.muscular > 0).map((e) => e.exerciseId);
    flags.push({
      id: 'failure_often_compounds',
      text: `Failure is common on compound lifts (${Math.round((compFail / compRec) * 100)}% of their recorded sets).`,
      why: `On free-weight compounds${risky.length ? ' such as squats, RDLs and presses' : ''} technique tends to break before the target muscle fails, and recovery takes longer. Stopping about 1–2 reps short there usually keeps the same stimulus with less risk; save failure for machines and isolation work if you want it.`,
      exerciseIds: risky.length ? risky : comp.filter((e) => e.muscular > 0).map((e) => e.exerciseId),
    });
  } else if (isoFail > 0 && isoFail >= compFail * 2 && isoFail / (isoFail + compFail) >= 0.67) {
    flags.push({
      id: 'failure_mostly_isolation',
      text: 'Failure sets are mostly on isolation exercises.',
      why: 'That is the lower-risk place for them: stable machine or cable isolation lets the target muscle fail before technique does, with less systemic fatigue.',
    });
  }
  const techFirst = exercises.filter((e) => e.recorded >= 3 && e.technical > 0 && e.technical >= e.muscular).map((e) => e.exerciseId);
  if (techFirst.length) {
    flags.push({
      id: 'technical_before_muscular',
      text: `Technique often gives out before the muscle on ${techFirst.length} exercise${techFirst.length === 1 ? '' : 's'}.`,
      why: 'Reps after form breaks mostly shift work to other muscles and are not counted as clean progress. Ending the set when form starts to slip (or choosing a slightly lighter load) gives cleaner, comparable sets.',
      exerciseIds: techFirst,
    });
  }
  return flags;
}

function failureLine(t: FailureCounts, flags: FailureFlag[]): string | null {
  if (!t.workingSets) return null;
  const f = flags.find((x) => x.id !== 'not_enough_data') ?? flags[0];
  if (!f) return t.recorded ? `${t.muscular} of ${t.recorded} recorded sets reached muscular failure.` : null;
  return f.text;
}
