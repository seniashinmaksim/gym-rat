/**
 * Weight entry (Part 6, F.3): any weight can be entered. The stepper follows the machine's real step
 * when it is known, otherwise a step the owner picks once (remembered per machine, per gym for
 * dumbbells). A typed value is never snapped or rejected; stepping from an off-grid value moves to the
 * next real step (40 → 42.5 → 45, 41 → 42.5, 41 ↓ 40).
 */
import type { Equipment, EquipmentKind, Location } from './types';

/** Steps offered by the step chooser (kg). */
export const STEP_CHOICES = [0.5, 1, 1.25, 2, 2.5, 5] as const;
export const MAX_WEIGHT_KG = 500;

const r2 = (n: number) => Math.round(n * 100 + Math.sign(n) * 1e-7) / 100;

/** One press of + (dir 1) or − (dir −1): the next multiple of `step` in that direction; never below 0. */
export function stepFrom(value: number | null, step: number, dir: 1 | -1): number {
  const v = value ?? 0;
  if (!(step > 0)) return Math.max(0, r2(v + dir));
  const q = v / step;
  const near = Math.round(q);
  const onGrid = Math.abs(q - near) < 1e-6;
  const next = onGrid ? near + dir : dir > 0 ? Math.ceil(q) : Math.floor(q);
  return Math.min(MAX_WEIGHT_KG, Math.max(0, r2(next * step)));
}

/** Is `v` a valid weight to store? (0…500 kg, at most 2 decimals — nothing is rounded for the owner.) */
export function validWeight(v: number | null): v is number {
  return v != null && Number.isFinite(v) && v >= 0 && v <= MAX_WEIGHT_KG;
}

/** A typed weight kept exactly (2 decimals at most), or null when it is not a number in range. */
export function normalizeWeight(v: number | null): number | null {
  return validWeight(v) ? r2(v) : null;
}

/** Where a remembered step is written: the machine, or the gym's dumbbell / kettlebell steps. */
export type StepTarget = { kind: 'equipment'; id: string } | { kind: 'gym_free_weights'; id: string } | { kind: 'session' };

export function stepTarget(eq: Pick<Equipment, 'id'> | null | undefined, location: Pick<Location, 'id'> | null | undefined, kind: EquipmentKind | undefined): StepTarget {
  if (eq) return { kind: 'equipment', id: eq.id };
  if ((kind === 'dumbbell' || kind === 'kettlebell') && location) return { kind: 'gym_free_weights', id: location.id };
  return { kind: 'session' };
}

/** The increments to store when the owner picks `step`: the chosen step first, larger known ones kept. */
export function withChosenStep(existing: number[] | undefined, step: number): number[] {
  const rest = (existing ?? []).filter((x) => x > step + 1e-9);
  return [step, ...rest.sort((a, b) => a - b)];
}
