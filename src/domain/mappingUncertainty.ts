/**
 * How much of a weekly volume number rests on an UNCERTAIN exercise → muscle mapping (audit 2026-11-22).
 * The counted value always uses the library coefficient (or the owner's override). Alongside it we recompute
 * the same sets with the low and the high end of each uncertain coefficient (MAPPING_RANGES, taken from the
 * audit text) and report the spread. An exercise the owner has overridden is the owner's decision: no range.
 * Nothing here changes any stored data or any target.
 */
import { EXERCISE_AUDIT_BY_ID } from '../data/scientific-evidence/exerciseAudit';
import { MAPPING_RANGES } from '../data/scientific-evidence/mappingRanges';
import type { Registry } from './registry';
import type { ExerciseOverride, MuscleId, QualityModel, Workout } from './types';
import { computeVolume } from './volume';
import { TRACKED_MUSCLES } from './muscles';

export interface MappingSpread {
  muscle: MuscleId;
  effective: number;
  low: number;
  high: number;
  /** Exercises this week whose mapping for THIS muscle is uncertain (no override). */
  exerciseIds: string[];
}

export function isUncertainMapping(exerciseId: string, overrides: ExerciseOverride[] = []): boolean {
  if (overrides.some((o) => o.id === exerciseId)) return false;
  return EXERCISE_AUDIT_BY_ID[exerciseId]?.verdict === 'uncertain';
}

/** The muscles of an exercise whose coefficient has a stated plausible range (no override). */
export function uncertainMuscles(exerciseId: string, overrides: ExerciseOverride[] = []): Partial<Record<MuscleId, [number, number]>> {
  if (!isUncertainMapping(exerciseId, overrides)) return {};
  return MAPPING_RANGES[exerciseId]?.range ?? {};
}

function shifted(registry: Registry, overrides: ExerciseOverride[], end: 0 | 1): Registry {
  const out: Registry = new Map(registry);
  for (const [id, r] of Object.entries(MAPPING_RANGES)) {
    const def = registry.get(id);
    if (!def || !isUncertainMapping(id, overrides)) continue;
    const contributions = { ...def.contributions };
    for (const [m, span] of Object.entries(r.range) as [MuscleId, [number, number]][]) {
      const v = span[end];
      if (v > 0) contributions[m] = v;
      else delete contributions[m];
    }
    out.set(id, { ...def, contributions });
  }
  return out;
}

/** Per muscle: counted effective sets and the range if uncertain mappings were at their low / high end. */
export function mappingSpread(workouts: Workout[], registry: Registry, quality: QualityModel, overrides: ExerciseOverride[] = []): Record<MuscleId, MappingSpread> {
  const base = computeVolume(workouts, registry, quality).muscles;
  const lo = computeVolume(workouts, shifted(registry, overrides, 0), quality).muscles;
  const hi = computeVolume(workouts, shifted(registry, overrides, 1), quality).muscles;
  const used = new Set(workouts.flatMap((w) => w.exercises.filter((e) => e.sets.some((s) => !s.planned)).map((e) => e.exerciseId)));
  const out = {} as Record<MuscleId, MappingSpread>;
  for (const m of TRACKED_MUSCLES) {
    const ids = [...used].filter((id) => uncertainMuscles(id, overrides)[m]);
    const r = (x: number) => Math.round(x * 100) / 100;
    out[m] = { muscle: m, effective: r(base[m].effective), low: r(Math.min(lo[m].effective, base[m].effective)), high: r(Math.max(hi[m].effective, base[m].effective)), exerciseIds: ids };
  }
  return out;
}
