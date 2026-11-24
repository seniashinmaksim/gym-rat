/**
 * Part 8 H.3 #10 (usual pairs move together) and #13 (repeated "Keep today": softened only when the next session held up;
 * a quiet habit line). Written before the implementation; hand-computed; all data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { forwardChecks, forwardHabit, keptOutcome, movePartners } from '../src/domain/sequence';
import type { Workout, WorkoutExercise } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);
const day = (d: string, exs: WorkoutExercise[]) => workout(d, exs, { startTime: '17:00', endTime: '18:00' });
const pec = () => ex('pec_deck', times(4, () => set(40, 12, 2)), 'pd');
const curls = (kept?: string) => ex('machine_biceps_curl', times(4, () => set(30, 10, 1)), 'bc', kept ? { forwardKept: { affectsExerciseId: 'pull_up', date: kept, muscle: 'biceps' } } : {});
const hammer = () => ex('hammer_curl', times(3, () => set(14, 10, 1)), null);
const pullups = (reps: number) => ex('pull_up', times(3, () => set(0, reps, 2, { loadMode: 'bodyweight_plus' })), null, { variation: { loading: 'bodyweight', gripWidth: 'shoulder' } });
const legs = () => ex('leg_extension', times(3, () => set(50, 12, 2)), 'le');

// Four full weeks (Mon / Tue / Thu) from Monday 2026-10-19; the owner kept the curls on Monday in weeks 2–4.
const WEEKS = [['2026-10-19', '2026-10-20', '2026-10-22'], ['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']];
function history(pullReps: number[], withHammer = false, keptFrom = 1): Workout[] {
  return WEEKS.flatMap(([m, t, th], i) => [
    day(m, [pec(), curls(i >= keptFrom ? t : undefined), ...(withHammer ? [hammer()] : [])]),
    day(t, [pullups(pullReps[i])]),
    day(th, [legs()]),
  ]);
}
const NOW = new Date('2026-11-16T17:30:00Z');
const live = workout('2026-11-16', [pec()], { startTime: '17:00' });

describe('#13 "Keep today" learned only from the next session\'s result', () => {
  it('pull-ups held up after each kept Monday (8, 8, 8 after 8) → softened: the warning becomes a tip', () => {
    const d = data([...history([8, 8, 8, 8]), live]);
    const a = analyze(d, NOW);
    expect(keptOutcome(d, a, 'machine_biceps_curl', 'pull_up')).toMatchObject({ observations: 3, notLower: 3, softened: true });
    const f = forwardChecks({ data: d, analysis: a, workout: live, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(f.map((x) => [x.check, x.severity])).toEqual([['interference', 'recommendation']]);
  });
  it('pull-ups dropped every time (10 → 9 → 8 → 7, each < 97 % of the one before) → stays a real limit', () => {
    const d = data([...history([10, 9, 8, 7]), live]);
    const a = analyze(d, NOW);
    expect(keptOutcome(d, a, 'machine_biceps_curl', 'pull_up')).toMatchObject({ observations: 3, notLower: 0, softened: false });
    expect(forwardChecks({ data: d, analysis: a, workout: live, exerciseId: 'machine_biceps_curl', sets: 4 })[0].severity).toBe('limit');
  });
  it('the quiet habit line names what happened, once', () => {
    const held = data([...history([8, 8, 8, 8]), live]);
    expect(forwardHabit(held, analyze(held, NOW))?.text).toMatch(/Machine biceps curl kept before pull-up 3 times; pull-up held up — fine to keep\./);
    const dropped = data([...history([10, 9, 8, 7]), live]);
    expect(forwardHabit(dropped, analyze(dropped, NOW))?.text).toMatch(/pull-up was lower 3 of 3 times — moving machine biceps curl is worth a try\./);
  });
  it('fewer than 3 kept conflicts → nothing learned, no line', () => {
    // Kept only in weeks 3 and 4 → 2 observations.
    const d = data([...history([8, 8, 8, 8], false, 2), live]);
    expect(keptOutcome(d, analyze(d, NOW), 'machine_biceps_curl', 'pull_up')).toMatchObject({ observations: 2, softened: false });
    expect(forwardHabit(d, analyze(d, NOW))).toBeNull();
  });
});

describe('#10 exercises usually done together move together', () => {
  it('curls + hammer curls (adjacent in 4 of 4 sessions) → the hammer curls move with the curls', () => {
    const d = data([...history([8, 8, 8, 8], true), live]);
    const a = analyze(d, NOW);
    expect(movePartners(d, a, 'machine_biceps_curl', ['pec_deck', 'machine_biceps_curl', 'hammer_curl'], '2026-11-17', 4)).toEqual(['hammer_curl']);
  });
  it('not usually adjacent (pec deck is never next to the hammer curls) → not a partner', () => {
    const d = data([...history([8, 8, 8, 8], true), live]);
    const a = analyze(d, NOW);
    expect(movePartners(d, a, 'hammer_curl', ['pec_deck', 'hammer_curl'], '2026-11-17', 3)).toEqual([]);
  });
});

// ---------------------------------------------------------------- owner's test list (2026-11-24) + own cases

describe('owner: a partner is NOT moved when moving it would create another conflict', () => {
  // Usual Mon / Tue / Wed. Monday: pec deck, curls, pushdowns (curls and pushdowns adjacent every week). Tue: legs.
  // Wed: overhead press (triceps 0.5, compound). Moving the curls to Tuesday is clean (Wednesday's press does not use
  // biceps); the pushdowns on Tuesday (triceps 4 → 36 h) would leave triceps 12 h inside its window at Wednesday's press
  // → they stay where they are (today), with no new conflict created by the move.
  const weeks = [['2026-10-19', '2026-10-20', '2026-10-21'], ['2026-10-26', '2026-10-27', '2026-10-28'], ['2026-11-02', '2026-11-03', '2026-11-04'], ['2026-11-09', '2026-11-10', '2026-11-11']];
  const push = () => ex('triceps_pushdown_bar', times(4, () => set(30, 12, 1)), 'tp');
  const ohp = () => ex('overhead_press', times(3, () => set(40, 8, 2)), null);
  const h = weeks.flatMap(([m, t, w2]) => [day(m, [pec(), curls(), push()]), day(t, [legs()]), day(w2, [ohp()])]);
  it('curls move to Tuesday, the pushdowns do not follow', () => {
    const d = data([...h, live]);
    const a = analyze(d, NOW);
    expect(movePartners(d, a, 'machine_biceps_curl', ['pec_deck', 'machine_biceps_curl', 'triceps_pushdown_bar'], '2026-11-17', 4)).toEqual([]);
    // Control: they ARE a pair — to Wednesday (after the press; next session next Monday) the pushdowns would move too.
    expect(movePartners(d, a, 'machine_biceps_curl', ['pec_deck', 'machine_biceps_curl', 'triceps_pushdown_bar'], '2026-11-18', 4)).toEqual(['triceps_pushdown_bar']);
  });
});

describe('owner: correct order after rescheduling a pair', () => {
  it('curls + hammer curls moved to Tuesday both come AFTER the pull-ups (pair kept adjacent)', async () => {
    const { generateWorkout } = await import('../src/domain/planner');
    const d = data([...history([8, 8, 8, 8], true), day('2026-11-16', [pec()])]);
    const mv = (exerciseId: string, sets: number) => ({ id: `mv-${exerciseId}`, exerciseId, equipmentId: null, sets, fromDate: '2026-11-16', date: '2026-11-17', reason: 'x', createdAt: '2026-11-16T18:00:00Z' });
    d.settings = { ...d.settings, plannedMoves: [mv('machine_biceps_curl', 4), mv('hammer_curl', 3)] };
    const now = new Date('2026-11-17T08:00:00Z');
    const ids = generateWorkout({ data: d, analysis: analyze(d, now), now }).items.map((i) => i.exerciseId);
    const at = (x: string) => ids.indexOf(x);
    expect(at('machine_biceps_curl')).toBeGreaterThan(at('pull_up'));
    expect(at('hammer_curl')).toBeGreaterThan(at('pull_up'));
    expect(Math.abs(at('machine_biceps_curl') - at('hammer_curl'))).toBe(1);
  });
});

describe('owner: recovery constraints are unchanged after softening', () => {
  // The softened warning only changes how the message is SHOWN; recovery windows, hours left and the Week numbers
  // are computed from the sessions actually done, exactly as without any "Keep today".
  it('same recovery and same hours left with and without the kept records', () => {
    const strip = (ws: Workout[]) => ws.map((w) => ({ ...w, exercises: w.exercises.map(({ forwardKept: _k, ...e }) => { void _k; return e; }) }));
    const withKeeps = data([...history([8, 8, 8, 8]), live]);
    const without = data(strip([...history([8, 8, 8, 8]), live]));
    const a1 = analyze(withKeeps, NOW);
    const a2 = analyze(without, NOW);
    expect(a1.recovery.biceps).toEqual(a2.recovery.biceps);
    const pick = (a: ReturnType<typeof analyze>) => { const m = a.muscles.find((x) => x.muscle === 'biceps')!; return [m.completed, m.status, m.todayShare, m.todayBlocked, m.carryOver, m.trend.overall, m.trend.counts, m.target.preferred]; };
    expect(pick(a1)).toEqual(pick(a2));
    expect(a1.planRecovery.biceps).toEqual(a2.planRecovery.biceps);
    const f1 = forwardChecks({ data: withKeeps, analysis: a1, workout: live, exerciseId: 'machine_biceps_curl', sets: 4 })[0];
    const f2 = forwardChecks({ data: without, analysis: a2, workout: live, exerciseId: 'machine_biceps_curl', sets: 4 })[0];
    expect([f1.hoursLeft, f1.date, f1.affectsExerciseId]).toEqual([f2.hoursLeft, f2.date, f2.affectsExerciseId]);
    expect([f1.severity, f2.severity]).toEqual(['recommendation', 'limit']);
  });
  it('a recovery check (not interference) is never softened', () => {
    // Tuesday also has curls → for curls today it is a recovery check, which keeps its severity whatever was kept.
    const d = data([...WEEKS.flatMap(([m, t, th], i) => [day(m, [pec(), curls(i > 0 ? t : undefined)]), day(t, [ex('machine_biceps_curl', times(3, () => set(30, 10, 2)), 'bc')]), day(th, [legs()])]), live]);
    d.settings = { ...d.settings, targetOverrides: { biceps: { min: 6, preferred: 10, max: 14 } } };
    const f = forwardChecks({ data: d, analysis: analyze(d, NOW), workout: live, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(f.map((x) => [x.check, x.severity])).toEqual([['recovery', 'limit']]);
  });
});

describe('owner: the usual training days change', () => {
  // Four weeks Mon / Tue / Thu, then three weeks Mon / Wed / Fri (pull-ups move to Wednesday). Usual days = the last 4
  // full weeks: Mon 4/4, Wed 3/4, Fri 3/4, Tue 1/4, Thu 1/4 → Mon / Wed / Fri. The curls on Monday are then 48 h before
  // the pull-ups (window 36 h) → no warning.
  it('the forward check follows the new pattern', () => {
    const old = WEEKS.flatMap(([m, t, th]) => [day(m, [pec(), curls()]), day(t, [pullups(8)]), day(th, [legs()])]);
    const fresh = [['2026-10-26', '2026-10-28', '2026-10-30'], ['2026-11-02', '2026-11-04', '2026-11-06'], ['2026-11-09', '2026-11-11', '2026-11-13']]
      .flatMap(([m, w2, f]) => [day(m, [pec(), curls()]), day(w2, [pullups(8)]), day(f, [legs()])]);
    const d = data([...old.filter((w) => w.date < '2026-10-26'), ...fresh, live]);
    const a = analyze(d, NOW);
    expect(a.usualDays).toEqual([1, 3, 5]);
    expect(forwardChecks({ data: d, analysis: a, workout: live, exerciseId: 'machine_biceps_curl', sets: 4 })).toEqual([]);
  });
});

describe('owner: habit line in English and Russian', () => {
  it('Russian: no English words, the numbers and both names are there', async () => {
    const { setLang } = await import('../src/i18n/core');
    setLang('ru');
    try {
      const held = data([...history([8, 8, 8, 8]), live]);
      const t = forwardHabit(held, analyze(held, NOW))!.text;
      expect(t).not.toMatch(/[A-Za-z]{3,}/);
      expect(t).toMatch(/Сгибания рук в тренажёре: оставлено перед «подтягивания» 3 раза; результат не снизился — можно оставить\./);
      const dropped = data([...history([10, 9, 8, 7]), live]);
      expect(forwardHabit(dropped, analyze(dropped, NOW))!.text).toMatch(/результат был ниже 3 из 3 — стоит попробовать перенос\./);
    } finally { setLang('en'); }
  });
});

describe('own cases', () => {
  it('a kept record never changes the weekly numbers (volume, credit)', () => {
    const plain = data([...history([8, 8, 8, 8]).map((w) => ({ ...w, exercises: w.exercises.map(({ forwardKept: _k, ...e }) => { void _k; return e; }) })), live]);
    const kept = data([...history([8, 8, 8, 8]), live]);
    expect(analyze(kept, NOW).current).toEqual(analyze(plain, NOW).current);
  });
  it('only the affected exercise\'s session within 2 days counts (a pull-up session 10 days later is not evidence)', () => {
    // Kept on Mondays, but Tuesday pull-ups removed in weeks 2–4 → no observations.
    const ws = history([8, 8, 8, 8]).filter((w) => !(w.exercises.some((e) => e.exerciseId === 'pull_up') && w.date > '2026-10-20'));
    const d = data([...ws, live]);
    expect(keptOutcome(d, analyze(d, NOW), 'machine_biceps_curl', 'pull_up').observations).toBe(0);
  });
  it('the habit line disappears when the last kept conflict is older than 4 weeks', () => {
    const d = data([...history([8, 8, 8, 8]), live]);
    expect(forwardHabit(d, analyze(d, new Date('2026-12-20T12:00:00Z')))).toBeNull();
  });
  it('a pair needs at least 3 sessions together', () => {
    const ws = history([8, 8, 8, 8], true).map((w) => (w.date < '2026-11-02' ? { ...w, exercises: w.exercises.filter((e) => e.exerciseId !== 'hammer_curl') } : w));
    const d = data([...ws, live]);
    expect(movePartners(d, analyze(d, NOW), 'machine_biceps_curl', ['machine_biceps_curl', 'hammer_curl'], '2026-11-17', 4)).toEqual([]);
  });
});
