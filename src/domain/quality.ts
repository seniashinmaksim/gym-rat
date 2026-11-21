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
 * How much each set of ONE exercise entry counts as a "set" (1 normally).
 * Unilateral sets logged per side are paired in order within the same set type: the i-th left
 * and the i-th right set together make ONE set (0.5 each, so the pair's credit is the average
 * of the two sides). A side without a partner counts as a full set. 3 L + 3 R = 3 sets, never 6.
 */
export function sideFactors(sets: WorkoutSet[]): Map<string, number> {
  const out = new Map<string, number>();
  const byType = new Map<string, { left: string[]; right: string[] }>();
  for (const s of sets) {
    out.set(s.id, 1);
    if (!s.side || !isCounted(s) || s.type === 'warmup') continue;
    const g = byType.get(s.type) ?? { left: [], right: [] };
    g[s.side].push(s.id);
    byType.set(s.type, g);
  }
  for (const g of byType.values()) {
    const pairs = Math.min(g.left.length, g.right.length);
    for (let i = 0; i < pairs; i++) {
      out.set(g.left[i], 0.5);
      out.set(g.right[i], 0.5);
    }
  }
  return out;
}

/**
 * Ends left/right logging without changing the set count: the i-th left and i-th right set
 * become ONE set (the left one is kept, its partner removed); unpaired sides just lose the tag.
 */
export function mergeSides(sets: WorkoutSet[]): WorkoutSet[] {
  const f = sideFactors(sets);
  return sets.filter((s) => !(s.side === 'right' && f.get(s.id) === 0.5))
    .map((s) => { if (!s.side) return s; const { side: _s, ...rest } = s; void _s; return rest; });
}

/** Number of working-or-drop sets in an exercise entry after left/right pairing (warm-ups and planned sets excluded). */
export function countedSetCount(sets: WorkoutSet[], types: WorkoutSet['type'][] = ['working', 'drop']): number {
  const f = sideFactors(sets);
  return sets.filter((s) => isCounted(s) && types.includes(s.type)).reduce((a, s) => a + (f.get(s.id) ?? 1), 0);
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
