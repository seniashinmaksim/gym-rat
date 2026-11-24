import { SEED_EXERCISES } from '../data/exercises';
import type { ExerciseDef, ExerciseOverride, MuscleId, RegionId, Variation } from './types';
import { L, num } from '../i18n/core';

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

export function exerciseLabel(def: ExerciseDef | undefined, lang: 'en' | 'ru' | 'both', fallback?: string): string {
  if (!def) return fallback ?? L('Unknown exercise', 'Неизвестное упражнение');
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
  // A logged angle outside what a bench can do (typo) is ignored rather than turned into a rule.
  if (def.angleSensitive && angle != null && Number.isFinite(angle) && angle >= -30 && angle <= 90) {
    const isFly = def.pattern === 'chest_fly';
    if (angle <= -5) {
      regions.lower_chest = 1;
      delete regions.upper_chest;
      if (!isFly && (contributions.front_delts ?? 0) > 0.25) contributions.front_delts = 0.25;
      notes.push(L(`Decline ${angle}°: lower-chest emphasis, reduced front-delt demand (heuristic).`, `Отрицательный наклон ${num(angle)}°: акцент на низ груди, меньше нагрузки на передние дельты (эвристика).`));
    } else if (angle < 10) {
      regions.lower_chest = 0.5;
      delete regions.upper_chest;
      notes.push(L(`Flat (${angle}°): whole-pec loading (heuristic).`, `Горизонтально (${num(angle)}°): нагрузка на всю грудную мышцу (эвристика).`));
    } else if (angle <= 45) {
      regions.upper_chest = 1;
      delete regions.lower_chest;
      if (!isFly) contributions.front_delts = Math.max(contributions.front_delts ?? 0, 0.5);
      notes.push(L(`Incline ${angle}°: upper-chest (clavicular) emphasis; front delts at least 0.5 (heuristic — 15°, 30° and 45° are treated alike).`, `Наклон ${num(angle)}°: акцент на верх груди (ключичная часть); передние дельты не меньше 0,5 (эвристика — 15°, 30° и 45° считаются одинаково).`));
    } else {
      regions.upper_chest = 0.5;
      delete regions.lower_chest;
      if (!isFly) {
        contributions.front_delts = 0.75;
        contributions.chest = Math.min(contributions.chest ?? 1, 0.75);
      }
      notes.push(L(`Steep incline ${angle}°: approaches an overhead press — chest credit reduced, front delts increased (heuristic).`, `Крутой наклон ${num(angle)}°: близко к жиму над головой — зачёт груди снижен, передних дельт повышен (эвристика).`));
    }
  }
  // Underhand grip on a PULL with elbow flexion (pulldowns, chin-ups). Not on straight-arm pulldowns
  // (isolation, elbows locked) — a grip there does not make the biceps work (audit 2026-11-22).
  if (variation?.grip === 'supinated' && def.pattern === 'vertical_pull' && def.category === 'compound') {
    contributions.biceps = Math.max(contributions.biceps ?? 0, 0.75);
    notes.push(L('Supinated grip: higher biceps contribution.', 'Обратный хват: вклад бицепса выше.'));
  }
  // Squat depth (Kubo 2019): glute and adductor growth came from FULL-depth squats; above parallel they are
  // credited as ordinary secondaries (0.5) instead of 0.75.
  if ((def.id === 'back_squat' || def.id === 'smith_squat') && variation?.depth === 'above_parallel') {
    if ((contributions.glutes ?? 0) > 0.5) contributions.glutes = 0.5;
    if ((contributions.adductors ?? 0) > 0.5) contributions.adductors = 0.5;
    notes.push(L('Above-parallel squat: glutes and adductors credited 0.5 (their extra growth was shown for full-depth squats).', 'Присед выше параллели: ягодицам и приводящим засчитывается 0,5 (их дополнительный рост показан для приседаний на полную глубину).'));
  }
  return { contributions, regions, notes };
}

/**
 * What the weight number means for this exercise, shown next to every weight input.
 * Dumbbells: ONE dumbbell. Barbells: the total you report (bar weight never assumed).
 */
export function loadUnitLabel(def: ExerciseDef | undefined, loadMode: string | undefined): string {
  if (loadMode === 'assisted') return L('kg assistance', 'кг помощи');
  if (loadMode === 'bodyweight_plus') return L('kg added', 'кг доп. веса');
  if (loadMode === 'per_side') return L('kg per side', 'кг на сторону');
  switch (def?.equipmentKind) {
    case 'dumbbell': case 'kettlebell': return L('kg per dumbbell', 'кг одна гантель');
    case 'barbell': case 'smith': return L('kg total', 'кг всего');
    case 'machine': case 'cable': return L('kg on stack', 'кг на блоке');
    case 'plate_loaded': return L('kg plates', 'кг дисков');
    default: return L('kg', 'кг');
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
