import type { QualityModel, WorkoutSet } from './types';

export type EffortTier = 'warmup' | 'high_effort' | 'working' | 'low_effort' | 'unknown';

export interface SetQuality {
  /** 0..1 multiplier applied to the muscle coefficient. */
  credit: number;
  tier: EffortTier;
  /** True when effort data is missing — the set is kept, but its stimulus is uncertain. */
  uncertain: boolean;
  reasons: string[];
}

/**
 * Transparent set-quality model. Keeps EFFORT separate from MUSCLE PARTICIPATION:
 * this returns only the effort/quality multiplier; muscle coefficients are applied later.
 */
export function assessSet(set: WorkoutSet, m: QualityModel): SetQuality {
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
  } else if (set.reps < m.lowRepThreshold) {
    credit *= m.lowRepCredit;
    reasons.push(`Very low reps (<${m.lowRepThreshold}) ×${m.lowRepCredit}`);
  }

  if (set.type === 'drop') {
    credit *= m.dropSetCredit;
    reasons.push(`Drop-set segment ×${m.dropSetCredit}`);
  }
  if (set.rom === 'partial') {
    credit *= m.partialRomCredit;
    reasons.push(`Partial ROM ×${m.partialRomCredit}`);
  } else if (set.rom === 'lengthened_partial') {
    credit *= m.lengthenedPartialCredit;
    reasons.push(`Lengthened partials ×${m.lengthenedPartialCredit}`);
  }
  if (set.techniqueOk === false) {
    credit *= m.compromisedTechniqueCredit;
    reasons.push(`Compromised technique ×${m.compromisedTechniqueCredit}`);
  }

  return { credit: round2(credit), tier, uncertain, reasons };
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
