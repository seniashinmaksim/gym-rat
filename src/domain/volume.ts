import { TRACKED_MUSCLES } from './muscles';
import { assessSet, isCounted, round2, sideFactors, taperBeyondCap } from './quality';
import { resolveCoefficients, type Registry } from './registry';
import type { MuscleId, QualityModel, RegionId, Workout } from './types';
import { involvement } from './muscles';

export interface MuscleVolume {
  muscle: MuscleId;
  /** Raw count of working sets (any involvement), unadjusted. */
  rawWorkingSets: number;
  /** Raw counts by involvement. */
  directSets: number;
  indirectSets: number;
  /** Σ coefficient, ignoring effort. */
  fractional: number;
  /** Σ coefficient × quality credit — the headline "effective sets". */
  effective: number;
  effectiveDirect: number;
  effectiveIndirect: number;
  /** Part of `effective` that comes from sets with unknown effort (uncertainty band). */
  uncertainEffective: number;
  lowEffortSets: number;
  unknownEffortSets: number;
  /** Raw working sets touching this muscle, by quality status (left/right pairs count once). */
  status: { good: number; easy: number; compromised: number; pain: number; uncertain: number };
  /**
   * Part of `status.good` whose effort is only ESTIMATED from how the set felt (no RIR, no failure
   * status). Show as "good (estimated)"; `status.good − goodEstimated` = good with effort recorded
   * (RIR, Fail chip or muscular-failure status).
   */
  goodEstimated: number;
  sessions: number;
}

export interface RegionVolume {
  region: RegionId;
  effective: number;
  sets: number;
}

export interface VolumeResult {
  muscles: Record<MuscleId, MuscleVolume>;
  regions: Record<RegionId, RegionVolume>;
  totalWorkingSets: number;
  totalWarmupSets: number;
  unknownExerciseSets: number;
}

function emptyMuscle(m: MuscleId): MuscleVolume {
  return {
    muscle: m, rawWorkingSets: 0, directSets: 0, indirectSets: 0, fractional: 0, effective: 0,
    effectiveDirect: 0, effectiveIndirect: 0, uncertainEffective: 0, lowEffortSets: 0, unknownEffortSets: 0,
    status: { good: 0, easy: 0, compromised: 0, pain: 0, uncertain: 0 }, goodEstimated: 0, sessions: 0,
  };
}

/**
 * Fractional, quality-adjusted volume. Each set credits each muscle ONCE with the
 * exercise's coefficient for that muscle (no double counting); regional emphasis
 * (upper/lower chest) is tracked separately and never added to the chest total.
 * Within one session, effective volume for a muscle above `sessionCreditCap` is
 * tapered (×`beyondSessionCapCredit`). Planned (not yet performed) sets are ignored.
 */
export function computeVolume(workouts: Workout[], registry: Registry, model: QualityModel): VolumeResult {
  const muscles = Object.fromEntries(TRACKED_MUSCLES.map((m) => [m, emptyMuscle(m)])) as Record<MuscleId, MuscleVolume>;
  const regions: Record<RegionId, RegionVolume> = {
    upper_chest: { region: 'upper_chest', effective: 0, sets: 0 },
    lower_chest: { region: 'lower_chest', effective: 0, sets: 0 },
  };
  let totalWorkingSets = 0;
  let totalWarmupSets = 0;
  let unknownExerciseSets = 0;

  const cap = model.sessionCreditCap ?? Infinity;
  const beyond = model.beyondSessionCapCredit ?? 1;
  for (const w of workouts) {
    const touched = new Set<MuscleId>();
    // Running effective sets per muscle within THIS session (for the per-session taper).
    const running: Partial<Record<MuscleId, number>> = {};
    for (const ex of w.exercises) {
      const def = registry.get(ex.exerciseId);
      // Left/right sets of a unilateral exercise pair up into one set (0.5 + 0.5).
      const factors = sideFactors(ex.sets);
      for (const s of ex.sets) {
        if (!isCounted(s)) continue;
        if (s.type === 'warmup') {
          totalWarmupSets++;
          continue;
        }
        const k = factors.get(s.id) ?? 1;
        totalWorkingSets += k;
        if (!def) {
          unknownExerciseSets += k;
          continue;
        }
        const { contributions, regions: reg } = resolveCoefficients(def, ex.variation);
        const q = assessSet(s, model, { rom: ex.variation?.rom, timed: def.repRange[1] <= 1 });
        for (const [mid, coef] of Object.entries(contributions) as [MuscleId, number][]) {
          const mv = muscles[mid];
          if (!mv || !coef) continue;
          const inv = involvement(coef);
          mv.rawWorkingSets += k;
          if (inv === 'direct') mv.directSets += k;
          else mv.indirectSets += k;
          mv.fractional += coef * k;
          const before = running[mid] ?? 0;
          const eff = taperBeyondCap(before, coef * q.credit * k, cap, beyond);
          running[mid] = before + coef * q.credit * k;
          mv.effective += eff;
          if (inv === 'direct') mv.effectiveDirect += eff;
          else mv.effectiveIndirect += eff;
          if (q.uncertain) mv.uncertainEffective += eff;
          if (q.tier === 'low_effort') mv.lowEffortSets += k;
          if (q.tier === 'unknown') mv.unknownEffortSets += k;
          if (q.status !== 'warmup') mv.status[q.status] += k;
          if (q.status === 'good' && q.effortSource === 'feel') mv.goodEstimated += k;
          touched.add(mid);
        }
        const chestCoef = contributions.chest ?? 0;
        for (const [rid, emph] of Object.entries(reg) as [RegionId, number][]) {
          if (!emph || !chestCoef) continue;
          regions[rid].effective += emph * chestCoef * q.credit * k;
          regions[rid].sets += k;
        }
      }
    }
    for (const m of touched) muscles[m].sessions++;
  }

  for (const mv of Object.values(muscles)) {
    mv.fractional = r2(mv.fractional);
    mv.effective = r2(mv.effective);
    mv.effectiveDirect = r2(mv.effectiveDirect);
    mv.effectiveIndirect = r2(mv.effectiveIndirect);
    mv.uncertainEffective = r2(mv.uncertainEffective);
  }
  for (const rv of Object.values(regions)) rv.effective = r2(rv.effective);
  return { muscles, regions, totalWorkingSets, totalWarmupSets, unknownExerciseSets };
}

/** Effective sets per muscle for a single session (used by recovery & history). */
export function sessionMuscleEffective(w: Workout, registry: Registry, model: QualityModel): Partial<Record<MuscleId, number>> {
  const v = computeVolume([w], registry, model);
  const out: Partial<Record<MuscleId, number>> = {};
  for (const m of TRACKED_MUSCLES) if (v.muscles[m].effective > 0) out[m] = v.muscles[m].effective;
  return out;
}

const r2 = round2; // order-independent rounding (see quality.ts)

/**
 * Quality sets: each performed working set counted ONCE, weighted by its effort/quality credit
 * (left + right = one set). Unlike Σ muscle effective sets, it can never exceed the working-set count.
 */
export function qualitySetTotal(workouts: Workout[], registry: Registry, model: QualityModel): number {
  let t = 0;
  for (const w of workouts) for (const ex of w.exercises) {
    const def = registry.get(ex.exerciseId);
    const factors = sideFactors(ex.sets);
    for (const s of ex.sets) {
      if (!isCounted(s) || s.type === 'warmup') continue;
      t += assessSet(s, model, { rom: ex.variation?.rom, timed: def ? def.repRange[1] <= 1 : false }).credit * (factors.get(s.id) ?? 1);
    }
  }
  return r2(t);
}
