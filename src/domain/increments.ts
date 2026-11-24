/**
 * The real load step available for an exercise: the equipment's own smallest increment, else (for
 * dumbbells / kettlebells) the jumps the owner set for that gym, else the app default for the kind.
 */
import type { Equipment, EquipmentKind, Location } from './types';

export type IncrementSource = 'equipment' | 'gym_free_weights' | 'default';

export function loadStep(
  eq: Pick<Equipment, 'incrementsKg'> | null | undefined,
  location: Pick<Location, 'freeWeightIncrementsKg'> | null | undefined,
  kind: EquipmentKind | undefined,
  loadMode?: string,
): { step: number; source: IncrementSource } {
  if (eq?.incrementsKg?.length) return { step: Math.min(...eq.incrementsKg), source: 'equipment' };
  if ((kind === 'dumbbell' || kind === 'kettlebell') && location?.freeWeightIncrementsKg?.length) {
    return { step: Math.min(...location.freeWeightIncrementsKg), source: 'gym_free_weights' };
  }
  return { step: defaultIncrement(kind, loadMode), source: 'default' };
}

export function defaultIncrement(kind: EquipmentKind | undefined, loadMode?: string): number {
  switch (kind) {
    case 'machine': return 2.5; // owner's choice (2026-11-24): a 2.5 kg step by default; a machine's saved step wins
    case 'cable': return 2.5;
    case 'barbell': case 'smith': return 2.5;
    case 'plate_loaded': return loadMode === 'per_side' ? 1.25 : 2.5;
    case 'dumbbell': case 'kettlebell': return 2;
    default: return 2.5;
  }
}
