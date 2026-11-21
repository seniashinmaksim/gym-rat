import { EFFORT_LABEL, FEEL_BY_ID, estimatedRirRange, formatRirRange, hasPain, type SetStatus } from './feedback';
import { failureImpliedRir, techniqueWithFailure } from './failure';
import type { QualityModel, Rom, Workout, WorkoutSet } from './types';

export type EffortTier = 'warmup' | 'high_effort' | 'working' | 'low_effort' | 'unknown';

export interface SetQuality {
  /** 0..1 multiplier applied to the muscle coefficient. */
  credit: number;
  tier: EffortTier;
  /** True when effort data is missing or only estimated — the set is kept, but its stimulus is uncertain. */
  uncertain: boolean;
  /** Effort came from the owner's feel (estimated RIR range), not from a logged RIR. */
  estimated?: boolean;
  /**
   * Where the effort credit came from: a logged RIR, the "Fail" chip / to_failure (RIR 0), a recorded
   * muscular failure without RIR (≈ RIR 0), how the set felt (estimate), or nothing (provisional).
   */
  effortSource?: 'rir' | 'to_failure' | 'failure_status' | 'feel' | 'none';
  /** Quality status for display and per-muscle counts (good / easy / compromised / pain / uncertain). */
  status: SetStatus | 'warmup';
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
  if (set.type === 'warmup') return { credit: 0, tier: 'warmup', uncertain: false, status: 'warmup', reasons: ['Warm-up set (not counted)'] };

  const reasons: string[] = [];
  let credit: number;
  let tier: EffortTier;
  let uncertain = false;
  let estimated = false;

  const rir = set.rir ?? (set.toFailure ? 0 : null);
  // Muscular failure recorded (technique held) but no RIR → effort treated like RIR 0. This is NOT
  // extra credit: RIR 0–3 all earn the same credit, because failure is not shown to grow more muscle.
  const failRir = rir == null ? failureImpliedRir(set) : null;
  const est = m.useFeelWhenNoRir === false ? null : estimatedRirRange(set);
  let effortSource: SetQuality['effortSource'];
  if (rir == null && failRir != null) {
    const idx = Math.max(0, Math.min(failRir, m.rirCredit.length - 1));
    credit = m.rirCredit[idx];
    tier = 'high_effort';
    effortSource = 'failure_status';
    reasons.push(`No RIR logged; muscular failure recorded ≈ RIR 0 (from the failure status) → credit ${credit} (same as RIR 1–3: failure earns no extra credit)`);
  } else if (rir == null && est) {
    // No RIR logged, but the owner said how it felt: use the CONSERVATIVE end of the estimated
    // RIR range through the same evidence-based RIR table. Marked as an estimate.
    const r = est[1] ?? est[0];
    const idx = Math.max(0, Math.min(r, m.rirCredit.length - 1));
    credit = m.rirCredit[idx];
    tier = r <= 1 ? 'high_effort' : r <= 3 ? 'working' : 'low_effort';
    uncertain = true;
    estimated = true;
    effortSource = 'feel';
    reasons.push(`No RIR logged. Felt "${EFFORT_LABEL[set.effort!]}" ≈ RIR ${formatRirRange(est)} (estimate, not measured) → credit ${credit}`);
  } else if (rir == null) {
    credit = m.unknownRirCredit;
    tier = 'unknown';
    uncertain = true;
    effortSource = 'none';
    reasons.push(`Effort unknown (no RIR) → provisional credit ${m.unknownRirCredit}`);
    if (set.failure === 'none') reasons.push('Stopped before failure (no RIR) — at least 1 rep in reserve, exact effort unknown');
    else if (set.failure === 'uncertain') reasons.push('Not sure whether failure was reached — effort stays unknown');
  } else {
    const idx = Math.max(0, Math.min(Math.round(rir), m.rirCredit.length - 1));
    credit = m.rirCredit[idx];
    tier = rir <= 1 ? 'high_effort' : rir <= 3 ? 'working' : 'low_effort';
    effortSource = set.rir != null ? 'rir' : 'to_failure';
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
  if (rir != null && set.feel && FEEL_BY_ID[set.feel]?.effort) reasons.push(`Feel: ${FEEL_BY_ID[set.feel].title} (logged RIR is used for effort)`);
  // Technical failure (technique gave out) counts as compromised technique unless technique was explicitly good.
  const technique = techniqueWithFailure(set);
  if (set.technicalFailure === true) {
    reasons.push(technique === 'good'
      ? 'Technical failure recorded although technique is marked good — please check'
      : 'Technical failure: technique gave out — not a clean muscular-failure set');
  }
  if (technique === 'compromised' || technique === 'failed') {
    credit *= m.compromisedTechniqueCredit;
    reasons.push(`${technique === 'failed' ? 'Could not complete correctly' : 'Technique compromised'} — less certain the target muscle did the work ×${m.compromisedTechniqueCredit}`);
    if (technique === 'failed') uncertain = true;
  } else if (technique === 'slightly_degraded') {
    reasons.push('Technique slightly degraded (no reduction)');
  }
  const pain = hasPain(set);
  if (pain) {
    uncertain = true;
    reasons.push(`Pain / unusual discomfort${set.pain?.area ? ` (${set.pain.area})` : ''} — kept, but not counted as a high-confidence quality set`);
  }
  if (set.weightAccuracy === 'too_light' || set.weightAccuracy === 'too_heavy') {
    reasons.push('Wrong weight picked by accident — counts for volume by its effort, but is not a progression benchmark');
  }

  const status: SetStatus = pain ? 'pain'
    : technique === 'compromised' || technique === 'failed' ? 'compromised'
    : tier === 'low_effort' ? 'easy'
    : tier === 'unknown' ? 'uncertain'
    : 'good';
  return { credit: round2(credit), tier, uncertain, estimated, effortSource, status, reasons };
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
