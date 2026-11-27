/**
 * Free barbell vs Smith machine (owner 2026-11-27: "I cannot choose if it's Smith or free weight") and the bar weight.
 *
 * - Exercises with their own Smith version in the library switch exercise (different muscle credit, own history):
 *   back squat ↔ Smith squat, incline barbell press ↔ Smith incline press.
 * - Every other barbell compound done in a Smith machine is linked to the gym's Smith machine (an equipment entry):
 *   a separate history, nothing else changes.
 * - Bar weight (owner 2026-11-27: "the bar is always 20 kg — not for biceps or EZ bars"): a free-barbell COMPOUND
 *   assumes a 20 kg bar unless the bar or the gym says otherwise; curl / EZ / other isolation bars get no default.
 *   The weight entered is always the TOTAL (bar + plates); the bar only drives the "plates per side" hint.
 *   A Smith bar is unknown unless set on that Smith machine: the owner enters the plates.
 */
import type { Equipment, ExerciseDef, Location } from './types';

export const SMITH_VERSION: Readonly<Record<string, string>> = { back_squat: 'smith_squat', incline_barbell_press: 'smith_incline_press' };
export const FREE_VERSION: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(SMITH_VERSION).map(([a, b]) => [b, a]));

/** The standard Olympic bar assumed for free-barbell compounds. */
export const DEFAULT_BAR_KG = 20;

export type BarType = 'free' | 'smith';

/** Whether the Free barbell / Smith machine switch applies, and which one is current. */
export function barTypeOf(def: ExerciseDef | undefined, eq: Equipment | null | undefined): BarType | null {
  if (!def) return null;
  if (def.equipmentKind === 'smith') return FREE_VERSION[def.id] ? 'smith' : null;
  if (def.equipmentKind !== 'barbell' || def.category !== 'compound') return null;
  return eq?.kind === 'smith' ? 'smith' : 'free';
}

/**
 * The bar's weight for the "plates per side" hint: the linked bar's own entry, else (free barbell) the gym's usual bar,
 * else 20 kg for a barbell compound. A Smith bar only when set on that Smith machine. Null = unknown (no hint).
 */
export function barWeightFor(def: ExerciseDef | undefined, eq: Equipment | null | undefined, gym: Location | null | undefined): { kg: number | null; assumed: boolean } {
  const smith = eq?.kind === 'smith' || (!eq && def?.equipmentKind === 'smith');
  if (eq?.barWeightKg != null) return { kg: eq.barWeightKg, assumed: false };
  if (smith) return { kg: null, assumed: false };
  if (gym?.barWeightKg != null) return { kg: gym.barWeightKg, assumed: false };
  if (def?.equipmentKind === 'barbell' && def.category === 'compound') return { kg: DEFAULT_BAR_KG, assumed: true };
  return { kg: null, assumed: false };
}

/** The gym's Smith machine entry, if one exists. */
export function smithAt(equipment: Equipment[], locationId: string | null | undefined): Equipment | null {
  return equipment.find((e) => e.kind === 'smith' && (e.locationId ?? null) === (locationId ?? null)) ?? null;
}
