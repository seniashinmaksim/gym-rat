/**
 * The real load step available for an exercise: the equipment's own smallest increment, else (for
 * dumbbells / kettlebells) the jumps the owner set for that gym, else the app default for the kind.
 */
import type { Equipment, EquipmentKind, Location } from './types';

/** 'gym_barbell' = the gym's barbell step: loads move BY it, they are never snapped to its multiples (a bar may weigh 7.5 kg). */
export type IncrementSource = 'equipment' | 'gym_free_weights' | 'gym_barbell' | 'default';

export function loadStep(
  eq: Pick<Equipment, 'incrementsKg'> | null | undefined,
  location: Pick<Location, 'freeWeightIncrementsKg' | 'barbellIncrementsKg'> | null | undefined,
  kind: EquipmentKind | undefined,
  loadMode?: string,
): { step: number; source: IncrementSource } {
  if (eq?.incrementsKg?.length) return { step: Math.min(...eq.incrementsKg), source: 'equipment' };
  if ((kind === 'dumbbell' || kind === 'kettlebell') && location?.freeWeightIncrementsKg?.length) {
    return { step: Math.min(...location.freeWeightIncrementsKg), source: 'gym_free_weights' };
  }
  if (isBarKind(kind) && location?.barbellIncrementsKg?.length) {
    const s = Math.min(...location.barbellIncrementsKg);
    return { step: loadMode === 'per_side' ? s / 2 : s, source: 'gym_barbell' };
  }
  return { step: defaultIncrement(kind, loadMode), source: 'default' };
}

export function defaultIncrement(kind: EquipmentKind | undefined, loadMode?: string): number {
  switch (kind) {
    case 'machine': return 2.5; // owner's choice (2026-11-24): a 2.5 kg step by default; a machine's saved step wins
    case 'cable': return 2.5;
    // Owner 2026-11-25: the smallest plates are 2.5 kg → a bar moves in 5 kg steps (2.5 per side); a gym's own step wins.
    case 'barbell': case 'smith': return loadMode === 'per_side' ? 2.5 : 5;
    case 'plate_loaded': return loadMode === 'per_side' ? 2.5 : 5;
    case 'dumbbell': case 'kettlebell': return 2;
    default: return 2.5;
  }
}

/** Loaded with plates on a bar (the gym's barbell step applies). */
export function isBarKind(kind: EquipmentKind | undefined): boolean {
  return kind === 'barbell' || kind === 'smith' || kind === 'plate_loaded';
}

/**
 * "30 kg = bar 20 + 5 per side" — only with a KNOWN bar weight (the bar's equipment entry, else the gym's usual bar);
 * never assumed. null when unknown, or when the total is lighter than the bar.
 */
export function barBreakdown(totalKg: number | null, barKg: number | null | undefined): { barKg: number; perSideKg: number } | null {
  if (totalKg == null || barKg == null || !(barKg > 0) || totalKg < barKg - 1e-9) return null;
  return { barKg, perSideKg: Math.round(((totalKg - barKg) / 2) * 100) / 100 };
}
