import type { Effort, SetCorrection, SetFeel, Technique, WeightAccuracy, Workout, WorkoutSet } from './types';

/**
 * Per-set feedback ("How did this set feel?").
 *
 * One tap stores the owner's answer (`feel`) AND three separate dimensions derived from it —
 * perceived effort, weight-selection accuracy and technique — which the owner can change.
 * The dimensions are deliberately kept apart: "very hard with good technique" and "very hard
 * because the weight was too heavy and technique broke down" are different training outcomes.
 *
 * RIR is NEVER derived from the feel. When no RIR was logged, the effort gives an ESTIMATED RIR
 * range (labelled as an estimate) — see `estimatedRirRange`.
 */

export interface FeelOption {
  id: SetFeel;
  label: string; // short chip label
  title: string; // full name
  description: string;
  effort?: Effort;
  weightAccuracy?: WeightAccuracy;
  technique?: Technique;
}

export const FEEL_OPTIONS: FeelOption[] = [
  { id: 'too_easy', label: 'Too easy', title: 'Too easy', description: 'Weight felt clearly too light — several more reps were possible.', effort: 'very_easy', weightAccuracy: 'correct' },
  { id: 'bit_easy', label: 'Bit easy', title: 'A little too easy', description: 'Comfortable; more reps in reserve than intended. The weight could probably go up.', effort: 'easy', weightAccuracy: 'correct' },
  { id: 'just_right', label: 'Just right', title: 'Just right', description: 'Challenging, intended reps done, technique controlled.', effort: 'appropriate', weightAccuracy: 'correct', technique: 'good' },
  { id: 'hard_good', label: 'Hard, good form', title: 'Very hard, but good technique', description: 'Close to failure with proper technique, range of motion and control.', effort: 'near_max', weightAccuracy: 'correct', technique: 'good' },
  { id: 'too_heavy_form', label: 'Too heavy', title: 'Too heavy, technique compromised', description: 'Reps done as best as possible, but with momentum, shortened range or other muscles compensating.', effort: 'hard', weightAccuracy: 'correct', technique: 'compromised' },
  { id: 'wrong_light', label: 'Wrong: light', title: 'Wrong weight — too light', description: 'Picked a much lighter weight than intended by accident. Saved, but not used as a progression benchmark.', weightAccuracy: 'too_light' },
  { id: 'wrong_heavy', label: 'Wrong: heavy', title: 'Wrong weight — too heavy', description: 'Picked a heavier weight than intended by accident. Saved, but not used as a progression benchmark.', weightAccuracy: 'too_heavy' },
  { id: 'pain', label: 'Pain', title: 'Pain or unusual discomfort', description: 'Pain or unusual discomfort — not ordinary muscular effort or burning.' },
];

export const FEEL_BY_ID: Record<SetFeel, FeelOption> = Object.fromEntries(FEEL_OPTIONS.map((o) => [o.id, o])) as Record<SetFeel, FeelOption>;

export const EFFORT_LABEL: Record<Effort, string> = { very_easy: 'Very easy', easy: 'Easy', appropriate: 'Appropriate', hard: 'Hard', near_max: 'Near max' };
export const ACCURACY_LABEL: Record<WeightAccuracy, string> = { correct: 'Correct weight', too_light: 'Accidentally too light', too_heavy: 'Accidentally too heavy', unknown: 'Unknown' };
export const TECHNIQUE_LABEL: Record<Technique, string> = { good: 'Good', slightly_degraded: 'Slightly degraded', compromised: 'Significantly compromised', failed: 'Unable to complete correctly', not_assessed: 'Not assessed' };
export const PAIN_AREAS = ['Shoulder', 'Elbow', 'Wrist', 'Neck', 'Upper back', 'Lower back', 'Hip', 'Knee', 'Ankle', 'Other'];

/**
 * The patch one tap applies. Choosing a feel replaces the derived dimensions (so switching
 * from "Just right" to "Too heavy" does not leave "good technique" behind) but never touches
 * RIR, weight or reps. Tapping the selected feel again clears the feedback.
 */
export function feelPatch(set: WorkoutSet, feel: SetFeel | null): Partial<WorkoutSet> {
  if (feel == null || set.feel === feel) {
    return { feel: undefined, effort: undefined, weightAccuracy: undefined, technique: undefined, pain: undefined, intendedWeightKg: undefined };
  }
  const o = FEEL_BY_ID[feel];
  return {
    feel,
    effort: o.effort,
    weightAccuracy: o.weightAccuracy,
    technique: o.technique,
    pain: feel === 'pain' ? { area: set.pain?.area ?? '', note: set.pain?.note } : undefined,
    intendedWeightKg: feel === 'wrong_light' || feel === 'wrong_heavy' ? set.intendedWeightKg ?? null : undefined,
  };
}

/** Technique, also honouring the older boolean `techniqueOk`. */
export function techniqueOf(s: WorkoutSet): Technique | undefined {
  if (s.technique) return s.technique;
  if (s.techniqueOk === false) return 'compromised';
  return undefined;
}

export const isCompromised = (s: WorkoutSet) => {
  const t = techniqueOf(s);
  return t === 'compromised' || t === 'failed';
};
export const isWrongWeight = (s: WorkoutSet) => s.weightAccuracy === 'too_light' || s.weightAccuracy === 'too_heavy';
export const hasPain = (s: WorkoutSet) => s.feel === 'pain' || !!s.pain;

/**
 * Estimated RIR range from perceived effort, used ONLY when no RIR was logged. These ranges are
 * practical assumptions (how the owner's own words map onto reps in reserve), not measurements.
 * `[lo, hi]`; hi = null means "lo or more".
 */
export const EFFORT_RIR_ESTIMATE: Record<Effort, [number, number | null]> = {
  very_easy: [5, null],
  easy: [3, 4],
  appropriate: [1, 3],
  hard: [1, 2],
  near_max: [0, 1],
};

export function estimatedRirRange(s: WorkoutSet): [number, number | null] | null {
  if (s.rir != null || s.toFailure || !s.effort) return null;
  return EFFORT_RIR_ESTIMATE[s.effort];
}

export function formatRirRange(r: [number, number | null]): string {
  return r[1] == null ? `${r[0]}+` : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
}

/**
 * Is this set a fair benchmark for strength progression? Performed sets are always KEPT;
 * this only decides whether they are used to judge progress. Excluded: accidental wrong
 * weight, pain, significantly compromised or failed technique, technical failure.
 * Reps at clean muscular failure ARE valid performance.
 */
export function benchmarkExclusion(s: WorkoutSet): string | null {
  if (s.weightAccuracy === 'too_light') return 'wrong weight (too light by accident)';
  if (s.weightAccuracy === 'too_heavy') return 'wrong weight (too heavy by accident)';
  if (hasPain(s)) return 'pain or unusual discomfort';
  const t = techniqueOf(s);
  if (t === 'compromised') return 'technique compromised';
  if (t === 'failed') return 'could not complete correctly';
  // Technical failure: reps after technique gave out are not a clean performance to compare.
  if (s.technicalFailure === true) return 'technical failure (technique gave out)';
  return null;
}

/** Quality status shown per set and counted per muscle (derived, never stored). */
export type SetStatus = 'good' | 'easy' | 'compromised' | 'pain' | 'uncertain';

export const STATUS_LABEL: Record<SetStatus, string> = {
  good: 'Good quality',
  easy: 'Too easy',
  compromised: 'Technique compromised',
  pain: 'Pain flagged',
  uncertain: 'Effort unknown',
};

// ---------------------------------------------------------------- Corrections audit

const AUDITED: SetCorrection['field'][] = ['weightKg', 'reps', 'rir', 'type', 'side', 'failure', 'technicalFailure', 'toFailure'];

/** A workout counts as finished (so edits are corrections) once it has an end time, was finished, or did not come from the live logger. */
export function isFinished(w: Workout): boolean {
  return !!w.endTime || !!w.finishedAt || w.source !== 'live';
}

/**
 * Records corrections made to a FINISHED workout: every changed weight / reps / RIR / type / side of
 * a set that existed when editing began gets `{at, field, from, to}`; removed sets get a workout
 * note. Always computed against the version opened for editing, so repeated autosaves don't pile
 * up duplicate entries and an edit that is changed back leaves no trace. Original values are never lost.
 */
export function withCorrections(original: Workout, current: Workout, at: string, describe: (exerciseId: string) => string = (id) => id): Workout {
  if (!isFinished(original)) return current;
  const orig = new Map(original.exercises.flatMap((e) => e.sets.map((s) => [s.id, s] as const)));
  const seen = new Set<string>();
  const exercises = current.exercises.map((e) => ({
    ...e,
    sets: e.sets.map((s) => {
      const o = orig.get(s.id);
      if (!o) return s;
      seen.add(s.id);
      const base = o.corrections ?? [];
      // Entries added earlier in this editing session keep their time if they are unchanged.
      const earlier = (s.corrections ?? []).slice(base.length);
      const fresh: SetCorrection[] = [];
      for (const f of AUDITED) {
        const from = (o[f] ?? null) as number | string | boolean | null;
        const to = (s[f] ?? null) as number | string | boolean | null;
        if (from !== to) fresh.push({ at: earlier.find((c) => c.field === f && c.from === from && c.to === to)?.at ?? at, field: f, from, to });
      }
      const corrections = fresh.length ? [...base, ...fresh] : base.length ? base : undefined;
      if (!corrections) { const { corrections: _c, ...rest } = s; void _c; return rest; }
      return { ...s, corrections };
    }),
  }));
  const notes: { at: string; note: string }[] = [];
  for (const e of original.exercises) for (const s of e.sets) {
    if (seen.has(s.id) || s.planned) continue;
    notes.push({ at, note: `Removed ${s.type} set from ${describe(e.exerciseId)}: ${s.weightKg ?? '?'} kg × ${s.reps ?? '?'}${s.rir != null ? ` @ RIR ${s.rir}` : ''}` });
  }
  const audit = [...(original.audit ?? []), ...notes];
  return { ...current, exercises, audit: audit.length ? audit : undefined };
}
