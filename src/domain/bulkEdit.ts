/**
 * One-time bulk corrections (with an audit entry on every workout they touch — never silent).
 */
import type { Workout } from './types';

/**
 * Give a bench angle to earlier sessions of one exercise (on one equipment entry) that were logged
 * without one, so they join that angle's strength history. Only entries WITHOUT an angle change;
 * sets, loads and reps are untouched. Returns only the workouts that changed.
 */
export function assignBenchAngle(
  workouts: Workout[],
  target: { workoutIds: string[]; exerciseId: string; equipmentId: string | null; exerciseName: string; matches?: (e: Workout['exercises'][number], w: Workout) => boolean },
  angleDeg: number,
  at: string,
): Workout[] {
  const ids = new Set(target.workoutIds);
  const out: Workout[] = [];
  for (const w of workouts) {
    if (!ids.has(w.id)) continue;
    let n = 0;
    const exercises = w.exercises.map((e) => {
      if (e.exerciseId !== target.exerciseId || (e.equipmentId ?? null) !== target.equipmentId || e.variation?.benchAngleDeg != null) return e;
      if (target.matches && !target.matches(e, w)) return e; // other setups (e.g. one arm at a time) keep their own history
      n++;
      return { ...e, variation: { ...(e.variation ?? {}), benchAngleDeg: angleDeg } };
    });
    if (!n) continue;
    out.push({ ...w, exercises, audit: [...(w.audit ?? []), { at, note: `Bench angle set to ${angleDeg}° for ${target.exerciseName} (not recorded before) — bulk correction from the Strength page.` }] });
  }
  return out;
}
