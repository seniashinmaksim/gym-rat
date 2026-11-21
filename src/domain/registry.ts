import { SEED_EXERCISES } from '../data/exercises';
import type { ExerciseDef, ExerciseOverride, MuscleId, RegionId, Variation } from './types';

export type Registry = Map<string, ExerciseDef>;

/** Seed library + user custom exercises + user coefficient overrides. */
export function buildRegistry(custom: ExerciseDef[], overrides: ExerciseOverride[]): Registry {
  const map: Registry = new Map();
  for (const e of SEED_EXERCISES) map.set(e.id, e);
  for (const e of custom) map.set(e.id, { ...e, custom: true });
  for (const o of overrides) {
    const base = map.get(o.id);
    if (!base) continue;
    map.set(o.id, {
      ...base,
      contributions: o.contributions ?? base.contributions,
      regionEmphasis: o.regionEmphasis ?? base.regionEmphasis,
      repRange: o.repRange ?? base.repRange,
      defaultRestSec: o.defaultRestSec ?? base.defaultRestSec,
    });
  }
  return map;
}

export function exerciseLabel(def: ExerciseDef | undefined, lang: 'en' | 'ru' | 'both', fallback = 'Unknown exercise'): string {
  if (!def) return fallback;
  if (lang === 'ru') return def.name.ru;
  if (lang === 'both') return def.name.en;
  return def.name.en;
}

export interface ResolvedCoefficients {
  contributions: Partial<Record<MuscleId, number>>;
  regions: Partial<Record<RegionId, number>>;
  notes: string[];
}

/**
 * Applies variation-dependent adjustments (currently: bench angle for angle-sensitive
 * pressing and flys). Rules are transparent and listed in the Scientific Sources page.
 */
export function resolveCoefficients(def: ExerciseDef, variation?: Variation): ResolvedCoefficients {
  const contributions = { ...def.contributions };
  const regions: Partial<Record<RegionId, number>> = { ...(def.regionEmphasis ?? {}) };
  const notes: string[] = [];
  const angle = variation?.benchAngleDeg;
  if (def.angleSensitive && angle != null && Number.isFinite(angle)) {
    const isFly = def.pattern === 'chest_fly';
    if (angle <= -5) {
      regions.lower_chest = 1;
      delete regions.upper_chest;
      if (!isFly && (contributions.front_delts ?? 0) > 0.25) contributions.front_delts = 0.25;
      notes.push(`Decline ${angle}°: lower-chest emphasis, reduced front-delt demand (heuristic).`);
    } else if (angle < 10) {
      regions.lower_chest = 0.5;
      delete regions.upper_chest;
      notes.push(`Flat (${angle}°): whole-pec loading (heuristic).`);
    } else if (angle <= 45) {
      regions.upper_chest = 1;
      delete regions.lower_chest;
      if (!isFly) contributions.front_delts = Math.max(contributions.front_delts ?? 0, 0.5);
      notes.push(`Incline ${angle}°: upper-chest (clavicular) emphasis; front delts at least 0.5 (heuristic — 15°, 30° and 45° are treated alike).`);
    } else {
      regions.upper_chest = 0.5;
      delete regions.lower_chest;
      if (!isFly) {
        contributions.front_delts = 0.75;
        contributions.chest = Math.min(contributions.chest ?? 1, 0.75);
      }
      notes.push(`Steep incline ${angle}°: approaches an overhead press — chest credit reduced, front delts increased (heuristic).`);
    }
  }
  if (variation?.grip === 'supinated' && def.pattern === 'vertical_pull') {
    contributions.biceps = Math.max(contributions.biceps ?? 0, 0.75);
    notes.push('Supinated grip: higher biceps contribution.');
  }
  return { contributions, regions, notes };
}

/**
 * What the weight number means for this exercise, shown next to every weight input.
 * Dumbbells: ONE dumbbell. Barbells: the total you report (bar weight never assumed).
 */
export function loadUnitLabel(def: ExerciseDef | undefined, loadMode: string | undefined): string {
  if (loadMode === 'assisted') return 'kg assistance';
  if (loadMode === 'bodyweight_plus') return 'kg added';
  if (loadMode === 'per_side') return 'kg per side';
  switch (def?.equipmentKind) {
    case 'dumbbell': case 'kettlebell': return 'kg per dumbbell';
    case 'barbell': case 'smith': return 'kg total';
    case 'machine': case 'cable': return 'kg on stack';
    case 'plate_loaded': return 'kg plates';
    default: return 'kg';
  }
}

/** Best-effort alias search used by pickers and the JSON importer. */
export function searchExercises(registry: Registry, query: string, limit = 12): ExerciseDef[] {
  const q = normalizeName(query);
  if (!q) return [...registry.values()].slice(0, limit);
  const scored: { def: ExerciseDef; score: number }[] = [];
  for (const def of registry.values()) {
    const names = [def.id.replace(/_/g, ' '), def.name.en, def.name.ru, ...def.aliases].map(normalizeName);
    let best = 0;
    for (const n of names) {
      if (n === q) best = Math.max(best, 100);
      else if (n.startsWith(q) || q.startsWith(n)) best = Math.max(best, 70 + Math.min(n.length, q.length));
      else if (n.includes(q) || q.includes(n)) best = Math.max(best, 50 + Math.min(n.length, q.length) / 2);
      else {
        const overlap = tokenOverlap(n, q);
        if (overlap > 0) best = Math.max(best, overlap * 40);
      }
    }
    if (best > 0) scored.push({ def, score: best });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.def);
}

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9° ]+/gi, ' ').replace(/\s+/g, ' ').trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter((t) => t.length > 2));
  const tb = b.split(' ').filter((t) => t.length > 2);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const t of tb) if (ta.has(t)) hit++;
  return hit / Math.max(ta.size, tb.length);
}
