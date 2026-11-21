import type { QualityModel, Rom, Workout, WorkoutSet } from './types';

export type EffortTier = 'warmup' | 'high_effort' | 'working' | 'low_effort' | 'unknown';

export interface SetQuality {
  /** 0..1 multiplier applied to the muscle coefficient. */
  credit: number;
  tier: EffortTier;
  /** True when effort data is missing — the set is kept, but its stimulus is uncertain. */
  uncertain: boolean;
  reasons: string[];
}

export interface SetContext {
  /** Exercise-level ROM from the variation (used when the set itself has none). */
  rom?: Rom | null;
  /** Timed exercise (plank, carry) logged as a single "rep": the low-rep rule does not apply. */
  timed?: boolean;
}

/**
 * Transparent set-quality model. Keeps EFFORT separate from MUSCLE PARTICIPATION:
 * this returns only the effort/quality multiplier; muscle coefficients are applied later.
 */
export function assessSet(set: WorkoutSet, m: QualityModel, ctx: SetContext = {}): SetQuality {
  if (set.type === 'warmup') return { credit: 0, tier: 'warmup', uncertain: false, reasons: ['Warm-up set (not counted)'] };

  const reasons: string[] = [];
  let credit: number;
  let tier: EffortTier;
  let uncertain = false;

  const rir = set.rir ?? (set.toFailure ? 0 : null);
  if (rir == null) {
    credit = m.unknownRirCredit;
    tier = 'unknown';
    uncertain = true;
    reasons.push(`Effort unknown (no RIR) → provisional credit ${m.unknownRirCredit}`);
  } else {
    const idx = Math.max(0, Math.min(Math.round(rir), m.rirCredit.length - 1));
    credit = m.rirCredit[idx];
    tier = rir <= 1 ? 'high_effort' : rir <= 3 ? 'working' : 'low_effort';
    reasons.push(`RIR ${rir} → credit ${credit}`);
    if (set.rirSource === 'inferred') {
      uncertain = true;
      reasons.push('RIR was inferred, not reported');
    }
  }

  if (set.reps == null) {
    uncertain = true;
    reasons.push('Reps not recorded');
  } else if (set.reps < m.minRepsForCredit) {
    credit = 0;
    reasons.push('No completed reps');
  } else if (set.reps < m.lowRepThreshold && !ctx.timed) {
    credit *= m.lowRepCredit;
    reasons.push(`Very low reps (<${m.lowRepThreshold}) ×${m.lowRepCredit}`);
  }

  if (set.type === 'drop') {
    credit *= m.dropSetCredit;
    reasons.push(`Drop-set segment ×${m.dropSetCredit}`);
  }
  const rom = set.rom ?? ctx.rom ?? null;
  if (rom === 'partial') {
    credit *= m.partialRomCredit;
    reasons.push(`Partial ROM ×${m.partialRomCredit}`);
  } else if (rom === 'lengthened_partial') {
    credit *= m.lengthenedPartialCredit;
    reasons.push(`Lengthened partials ×${m.lengthenedPartialCredit}`);
  }
  if (set.techniqueOk === false) {
    credit *= m.compromisedTechniqueCredit;
    reasons.push(`Compromised technique ×${m.compromisedTechniqueCredit}`);
  }

  return { credit: round2(credit), tier, uncertain, reasons };
}

/** A set counts only once it has been performed (planned/pre-filled sets are ignored). */
export function isCounted(s: WorkoutSet): boolean {
  return !s.planned;
}

/** Copy of the workouts with planned (not yet performed) sets removed. */
export function stripPlanned(workouts: Workout[]): Workout[] {
  return workouts.map((w) => (w.exercises.some((e) => e.sets.some((s) => s.planned))
    ? { ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.filter(isCounted) })) }
    : w));
}

/**
 * Applies the per-session ceiling: effective volume for one muscle above `cap` in a single
 * session is multiplied by `beyond`. Returns the credited amount for this set.
 */
export function taperBeyondCap(runningBefore: number, eff: number, cap: number, beyond: number): number {
  if (!(cap > 0) || runningBefore + eff <= cap) return eff;
  if (runningBefore >= cap) return eff * beyond;
  const under = cap - runningBefore;
  return under + (eff - under) * beyond;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}
