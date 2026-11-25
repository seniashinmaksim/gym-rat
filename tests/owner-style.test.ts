/**
 * The owner's logging STYLE, nine weeks ahead (owner 2026-11-25: "when it has learned, will it give good
 * recommendations?"). Synthetic numbers; the style is real: two sessions a week (Mon / Wed), every exercise once a week,
 * the weight raised on every set (a ramp, the last set the heaviest), machine exercises logged WITHOUT naming the
 * machine, an effort answer on every set. Before the fixes of that day this projection showed: the planner stuck in
 * LEARNING for good (machines "not linked"), never one load increase (no two sets at one weight), and weekly targets
 * falling to what two sessions happen to give (chest 5.5, back 4.5, quads 4).
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { availableEquipment } from '../src/domain/exerciseChoice';
import { suggestNextLoad } from '../src/domain/progression';
import { readinessReport } from '../src/domain/readiness';
import { sorenessCandidates } from '../src/domain/recovery';
import { MUSCLE_BY_ID } from '../src/domain/muscles';
import { buildRegistry } from '../src/domain/registry';
import { prefillNext } from '../src/domain/liveFlow';
import type { ExerciseTarget, Workout, WorkoutSet } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const hard = { effort: 'near_max' as const, feel: 'hard_good' as const };
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** A ramp of 4 sets to the top weight; the top set gains a rep every week (capped at `hi`). */
const ramp = (top: number, step: number, wk: number, lo: number, hi: number): WorkoutSet[] =>
  [3, 2, 1, 0].map((k) => set(top - k * step, k === 0 ? Math.min(hi, lo + wk) : hi, null, hard));
function weeks(n: number): Workout[] {
  const out: Workout[] = [];
  for (let wk = 0; wk < n; wk++) {
    out.push(workout(add('2026-11-23', 7 * wk), [
      ex('incline_dumbbell_press', ramp(22, 2, wk, 8, 12), null, { variation: { benchAngleDeg: 30 } }),
      ex('leg_extension', ramp(55, 5, wk, 10, 15)), ex('ez_bar_curl', ramp(25, 2.5, wk, 8, 12)), ex('lateral_raise', ramp(12, 2, wk, 12, 20)),
    ], { startTime: '18:00', endTime: '19:00', source: 'live', finishedAt: 'x' }));
    out.push(workout(add('2026-11-25', 7 * wk), [
      ex('lat_pulldown', ramp(60, 5, wk, 8, 12)), ex('seated_leg_curl', ramp(60, 5, wk, 10, 15)), ex('triceps_pushdown_bar', ramp(40, 5, wk, 10, 15)), ex('reverse_pec_deck', ramp(30, 2.5, wk, 12, 20)),
    ], { startTime: '18:00', endTime: '19:00', source: 'live', finishedAt: 'x' }));
  }
  return out;
}
const at = (wk: number) => new Date(`${add('2026-11-27', 7 * wk)}T10:00:00Z`); // the Friday of week wk + 1

describe('nine weeks of the owner’s logging style', () => {
  it('P3 machines without a name at a known gym count as that gym’s machine: PROVISIONAL in week 4, FULL from week 5', () => {
    const report = (wk: number) => { const d = data(weeks(wk + 1)); return readinessReport(d, analyze(d, at(wk))); };
    expect(report(2).mode).toBe('learning'); // 6 workouts
    expect(report(3).equipmentIdentified).toBe(1);
    expect(report(3).mode).toBe('provisional'); // 8 workouts over 23 days
    expect(report(4).mode).toBe('full'); // 10 workouts over 30 days
    // Without a gym the machine is unknown, as before.
    const d = data(weeks(4).map((w) => ({ ...w, locationId: null })));
    expect(readinessReport(d, analyze(d, at(3))).equipmentIdentified).toBe(0);
  });
  it('P3 a machine exercise done at this gym before is available here (no "no machine known at this gym" cap)', () => {
    const d = data(weeks(2));
    const reg = buildRegistry([], []);
    expect(availableEquipment(d, reg.get('leg_extension')!, 'gym_a', new Set(), d.workouts)).toMatchObject({ ok: true, known: true });
    expect(availableEquipment(d, reg.get('leg_extension')!, 'gym_b', new Set(), d.workouts).ok).toBe(false);
    expect(availableEquipment(d, reg.get('leg_press')!, 'gym_a', new Set(), d.workouts).ok).toBe(false); // never done here
  });
  it('P2 a ramp is judged on its top set: 55 kg × 15 twice in a row → one step up; once → keep; a lone heavy set that is not a ramp → keep', () => {
    // Top set 10, 11, 12, 13, 14, 15, 15 reps at 55 kg → the last two sessions are at the top of 10–15.
    const le = analyze(data(weeks(7)), at(6)).progression.find((p) => p.exerciseId === 'leg_extension')!;
    expect(le.next.action).toBe('increase');
    expect(le.next.weight).toBe(57.5); // machines step 2.5 kg by default
    const six = analyze(data(weeks(6)), at(5)).progression.find((p) => p.exerciseId === 'leg_extension')!;
    expect(six.next.action).toBe('hold'); // the top reached once
    // Not a ramp: the heavy set first, lighter sets after it (a back-off), only 1 of 4 at the working load.
    const pt = (weight: number, reps: number) => ({ weight, reps, rir: null, benchmark: true, effort: 'near_max' as const });
    const s = (date: string) => ({ ...le.sessions[0], date, sets: [pt(55, 15), pt(40, 15), pt(40, 15), pt(40, 15)] });
    expect(suggestNextLoad([s('2026-12-01'), s('2026-12-08')], [10, 15], 2, 2.5, le.trend).action).toBe('hold');
  });
  it('P1 targets are STATIC (owner 2026-11-25): after Learning Mode chest stays 12 although two sessions a week gave 3; an untrained muscle keeps its target', () => {
    const a = analyze(data(weeks(9)), at(8));
    expect(a.learning.active).toBe(false);
    for (const m of a.muscles) {
      const ref = MUSCLE_BY_ID[m.muscle].reference!;
      expect([m.target.min, m.target.preferred, m.target.max], m.muscle).toEqual([ref.min, ref.preferred, ref.max]);
      expect(m.target.source).toBe('reference');
    }
    // Chest: 4 incline sets a week, the first (16 kg, ≤ 75 % of 22 kg) a warm-up by the numbers → own level 3 — an observation.
    expect(a.targets.chest.baseline).toBe(3);
    expect(a.targets.chest.preferred).toBe(12);
    expect(a.targets.calves.preferred).toBe(10);
    // The same numbers in week 1 (Learning Mode) and in week 9.
    const early = analyze(data(weeks(1)), at(0));
    expect(early.learning.active).toBe(true);
    for (const m of early.muscles) expect(m.target.preferred, m.muscle).toBe(a.targets[m.muscle].preferred);
  });
  it('P1 priorities still move the reference: high = +2 (chest 14), maintain = the lowered reference (chest 5)', () => {
    const d = data(weeks(9));
    d.settings.priorities = { chest: 'high', lats: 'maintain' };
    const a = analyze(d, at(8));
    expect(a.targets.chest.preferred).toBe(14);
    expect(a.targets.lats.preferred).toBe(5); // max(2, round(6 × 0.75))
  });
  it('P4 "still sore?" asks about muscles with a real session in the last 4 days; "sore" (+24 h) holds a muscle the window had released', () => {
    const d = data(weeks(1)); // Mon 23 + Wed 25 Nov
    const friday = new Date('2026-11-27T19:30:00Z');
    const a = analyze(d, friday);
    const ask = sorenessCandidates(a.planRecovery, a.today);
    expect(ask).toContain('lats'); // Wednesday
    expect(ask).toContain('chest'); // Monday, 4 days ago
    expect(ask).not.toContain('calves');
    // Lats: 4 pulldown sets, a new exercise → 36 + 12 = 48 h from Wed 19:00 → over on Fri 19:00.
    expect(a.muscles.find((m) => m.muscle === 'lats')!.todayBlocked).toBe(false);
    // "Sore" + 24 h → 72 h → 23.5 h left (> 6 h): held.
    const b = analyze({ ...d, daily: [{ id: '2026-11-27', date: '2026-11-27', soreness: { lats: 3 } }] }, friday);
    expect(b.recovery.lats.conditionsExtraH).toBe(24);
    expect(b.muscles.find((m) => m.muscle === 'lats')!.todayBlocked).toBe(true);
  });
  it('obs. "the lowest should not be the default again": after a ramp 40 → 45 → 50 → 55 the analysed weight is offered first, last time one tap away; a declined plan is not pushed', () => {
    const last = ex('leg_extension', ramp(55, 5, 0, 10, 15));
    const target: ExerciseTarget = { sets: 4, weightKg: 55, reps: [{ min: 10, max: 15 }], rir: [{ min: 1, max: 2 }], engine: 'presc-1' };
    let cur = ex('leg_extension', [], null, { target });
    expect(prefillNext(cur, last)).toMatchObject({ weightKg: 55, from: 'plan', alt: { weightKg: 40, from: 'last' } }); // not 40
    cur = { ...cur, sets: [set(55, 11, null, hard)] };
    expect(prefillNext(cur, last)).toMatchObject({ weightKg: 55, from: 'plan' }); // set 2: still the plan (last time 45)
    // The owner logs another weight → the session leads, the plan is not pushed again.
    cur = { ...cur, sets: [set(55, 11, null, hard), set(50, 12, null, hard)] };
    expect(prefillNext(cur, last).weightKg).toBe(50);
    // Without an analysed weight (first sessions) last time is still copied.
    expect(prefillNext(ex('leg_extension', [], null, { target: { ...target, weightKg: null } }), last)).toMatchObject({ weightKg: 40, from: 'last' });
  });
  it('soreness for EVERY muscle: "sore" today holds a muscle with no recorded session, and one whose window ended days ago; "a bit" does not', () => {
    const d = data(weeks(1)); // Mon 23 + Wed 25 Nov; calves never trained
    const sat = new Date('2026-11-28T10:00:00Z');
    const blocked = (soreness: Record<string, number>, m: string) => analyze({ ...d, daily: [{ id: '2026-11-28', date: '2026-11-28', soreness }] }, sat).muscles.find((x) => x.muscle === m)!.todayBlocked;
    expect(blocked({}, 'calves')).toBe(false);
    expect(blocked({ calves: 3 }, 'calves')).toBe(true); // no session on record, sore today → 12 h hold (> 6 h)
    expect(blocked({ calves: 2 }, 'calves')).toBe(false);
    // Chest: Monday's window (3 sets, new, failure … ≤ 48 h) ended long before Saturday.
    expect(blocked({}, 'chest')).toBe(false);
    expect(blocked({ chest: 3 }, 'chest')).toBe(true);
    // Yesterday's "sore" does not hold today by itself.
    const y = analyze({ ...d, daily: [{ id: '2026-11-27', date: '2026-11-27', soreness: { calves: 3 } }] }, sat);
    expect(y.muscles.find((x) => x.muscle === 'calves')!.todayBlocked).toBe(false);
  });
});
