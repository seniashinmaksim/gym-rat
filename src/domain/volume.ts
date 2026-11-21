import { TRACKED_MUSCLES } from './muscles';
import { assessSet, isCounted, taperBeyondCap } from './quality';
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
    effectiveDirect: 0, effectiveIndirect: 0, uncertainEffective: 0, lowEffortSets: 0, unknownEffortSets: 0, sessions: 0,
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
      for (const s of ex.sets) {
        if (!isCounted(s)) continue;
        if (s.type === 'warmup') {
          totalWarmupSets++;
          continue;
        }
        totalWorkingSets++;
        if (!def) {
          unknownExerciseSets++;
          continue;
        }
        const { contributions, regions: reg } = resolveCoefficients(def, ex.variation);
        const q = assessSet(s, model, { rom: ex.variation?.rom, timed: def.repRange[1] <= 1 });
        for (const [mid, coef] of Object.entries(contributions) as [MuscleId, number][]) {
          const mv = muscles[mid];
          if (!mv || !coef) continue;
          const inv = involvement(coef);
          mv.rawWorkingSets++;
          if (inv === 'direct') mv.directSets++;
          else mv.indirectSets++;
          mv.fractional += coef;
          const before = running[mid] ?? 0;
          const eff = taperBeyondCap(before, coef * q.credit, cap, beyond);
          running[mid] = before + coef * q.credit;
          mv.effective += eff;
          if (inv === 'direct') mv.effectiveDirect += eff;
          else mv.effectiveIndirect += eff;
          if (q.uncertain) mv.uncertainEffective += eff;
          if (q.tier === 'low_effort') mv.lowEffortSets++;
          if (q.tier === 'unknown') mv.unknownEffortSets++;
          touched.add(mid);
        }
        const chestCoef = contributions.chest ?? 0;
        for (const [rid, emph] of Object.entries(reg) as [RegionId, number][]) {
          if (!emph || !chestCoef) continue;
          regions[rid].effective += emph * chestCoef * q.credit;
          regions[rid].sets++;
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

const r2 = (n: number) => Math.round(n * 100) / 100;
