/**
 * Part 8 — recovery-aware sequencing across sessions (FIX_PLAN H.3). Written BEFORE the implementation; every number
 * is computed by hand in the comment above it. All data is synthetic.
 *
 * Usual week (four full weeks from Monday 2026-10-19): Mon chest + biceps curls, Tue pull-ups then rows, Thu legs + chest.
 * Today: Monday 2026-11-16, live session started 17:00 with 4 pec-deck sets done.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import type { AppData } from '../src/domain/appdata';
import { bestMoveDay, forwardChecks, upcomingSessions } from '../src/domain/sequence';
import type { Workout, WorkoutExercise } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);
const pec = (n: number) => ex('pec_deck', times(n, () => set(40, 12, 2)), 'pd');
const curls = (n: number, rir = 1) => ex('machine_biceps_curl', times(n, () => set(30, 10, rir)), 'bc');
const pullups = (n: number) => ex('pull_up', times(n, () => set(0, 8, 2, { loadMode: 'bodyweight_plus' })), null, { variation: { loading: 'bodyweight', gripWidth: 'shoulder' } });
const rows = (n: number) => ex('seated_cable_row', times(n, () => set(50, 10, 2)), 'row');
const legs = (n: number) => ex('leg_extension', times(n, () => set(50, 12, 2)), 'le');
const day = (d: string, exs: WorkoutExercise[]) => workout(d, exs, { startTime: '17:00', endTime: '18:00' });

function history(tue: (d: string) => WorkoutExercise[] = (d) => { void d; return [pullups(4), rows(3)]; }): Workout[] {
  const out: Workout[] = [];
  for (const [mon, tu, th] of [['2026-10-19', '2026-10-20', '2026-10-22'], ['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']]) {
    out.push(day(mon, [pec(4), curls(4)]), day(tu, tue(tu)), day(th, [legs(3), pec(3)]));
  }
  return out;
}
const NOW = new Date('2026-11-16T17:30:00Z');
function setup(hist = history(), live: WorkoutExercise[] = [pec(4)], patch: Partial<AppData> = {}) {
  const w = workout('2026-11-16', live, { startTime: '17:00' });
  const d = data([...hist, w], patch);
  return { d, a: analyze(d, NOW), w };
}

describe('upcoming sessions from the usual days', () => {
  it('Tuesday: pull-ups then rows (both compounds → high priority); Thursday: legs + chest', () => {
    const { d, a } = setup();
    const up = upcomingSessions(d, a);
    expect(up.map((s) => s.date)).toEqual(['2026-11-17', '2026-11-19', '2026-11-23']);
    expect(up[0].exercises.map((e) => [e.exerciseId, e.priority])).toEqual([['pull_up', 'high'], ['seated_cable_row', 'high']]);
  });
  it('no usual days known (< 3 full weeks) → no upcoming sessions, no forward checks', () => {
    const { d, a, w } = setup(history().slice(6)); // 2 full weeks left
    expect(upcomingSessions(d, a)).toEqual([]);
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 })).toEqual([]);
  });
});

describe('H.3 #1 — Monday chest + intensive biceps / Tuesday back + pull-ups', () => {
  // 4 curls near failure today → biceps 4 effective sets → window 36 h. Tuesday's pull-ups (biceps 0.5, high priority)
  // come 24 h later → 12 h of the window left ≥ 12 → a REAL LIMIT on next-session performance (interference).
  it('the curls get a short warning about Tuesday\'s pull-ups; the chest exercise gets nothing', () => {
    const { d, a, w } = setup();
    const f = forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ check: 'interference', severity: 'limit', date: '2026-11-17', muscle: 'biceps', affectsExerciseId: 'pull_up' });
    expect(f[0].text).toMatch(/May reduce Tuesday's pull-up — biceps still recovering\./);
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'cable_fly', sets: 3 })).toEqual([]);
  });
  it('Move proposes Tuesday (the order on Tuesday is the planner’s: tests/audit-gaps.test.ts C-2 — after the pull-ups, first only for a priority muscle)', () => {
    const { d, a, w } = setup();
    expect(bestMoveDay({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 })).toEqual({ date: '2026-11-17', clean: true });
  });
});

describe('H.3 #2–#5 — when nothing is shown', () => {
  it('#2 light curls (2 sets → 24 h window; 24 h until Tuesday ≥ 24 − 6) → nothing', () => {
    const { d, a, w } = setup();
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 2 })).toEqual([]);
  });
  it('#3 Tuesday is legs, not pulling → nothing', () => {
    const { d, a, w } = setup(history(() => [legs(4)]));
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 })).toEqual([]);
  });
  it('#4 the biceps week is already met → the interference warning still fires (independent of volume)', () => {
    // Owner target for biceps 2 sets / week; 3 curls already done today; one more → biceps 4 effective → 36 h window.
    const { d, w } = setup(history(), [pec(4), curls(3)], {});
    const d2 = { ...d, settings: { ...d.settings, targetOverrides: { biceps: { min: 1, preferred: 2, max: 4 } } } };
    const f = forwardChecks({ data: d2, analysis: analyze(d2, NOW), workout: w, exerciseId: 'machine_biceps_curl', sets: 1 });
    expect(f.map((x) => [x.check, x.muscle])).toEqual([['interference', 'biceps']]);
  });
  it('#5 a 0.25 user does not count: reverse pec deck today (rear delts 1) vs Tuesday pull-ups only (rear delts 0.25) → nothing', () => {
    // (With Tuesday's rows — rear delts 0.5 — the same 4 sets DO warn: rows use rear delts meaningfully.)
    const { d, a, w } = setup(history(() => [pullups(4)]));
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'reverse_pec_deck', sets: 4 })).toEqual([]);
    const withRows = setup();
    expect(forwardChecks({ data: withRows.d, analysis: withRows.a, workout: withRows.w, exerciseId: 'reverse_pec_deck', sets: 4 }).map((x) => x.affectsExerciseId)).toEqual(['seated_cable_row']);
  });
  it('#5b (kept from the plan) nothing for chest work today', () => {
    const { d, a, w } = setup();
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'pec_deck', sets: 3 })).toEqual([]);
  });
});

describe('H.3 #8 — compound overlap counts with what was already done today', () => {
  // Tuesday: overhead press (triceps 0.5, compound). Today: dips 4 done (triceps 0.75 → 3); pushdowns 3 more → triceps 6 → 36 h.
  it('pushdowns after dips → may reduce Tuesday\'s overhead press', () => {
    const hist = history(() => [ex('overhead_press', times(3, () => set(40, 8, 2)), null)]);
    const { d, a, w } = setup(hist, [ex('dips', times(4, () => set(0, 10, 2, { loadMode: 'bodyweight_plus' })), null)]);
    const f = forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'triceps_pushdown_bar', sets: 3 });
    expect(f.map((x) => [x.check, x.muscle, x.affectsExerciseId])).toEqual([['interference', 'triceps', 'overhead_press']]);
  });
});

describe('Russian text is short and complete', () => {
  it('no English left and one or two short sentences', async () => {
    const { setLang } = await import('../src/i18n/core');
    setLang('ru');
    try {
      const { d, w } = setup();
      const f = forwardChecks({ data: d, analysis: analyze(d, NOW), workout: w, exerciseId: 'machine_biceps_curl', sets: 4 });
      expect(f[0].text).not.toMatch(/[A-Za-z]{3,}/);
      expect(f[0].text.length).toBeLessThan(110);
    } finally { setLang('en'); }
  });
});

describe('H.3 #6 — recovery before the next usual session (week not met)', () => {
  // Mon / Wed / Fri, chest 4 each. Today Monday: 10 pec-deck sets → chest 10 → 60 + 12 (large, > 9) = 72 h. Wednesday is
  // 48 h later → 24 h left (≥ 12: a limit); Wednesday's pec deck trains chest directly and the week still needs 12 − 10 = 2.
  it('10 chest sets today → chest still recovering by Wednesday', () => {
    const mwf: Workout[] = [];
    for (const [m, w2, f] of [['2026-10-19', '2026-10-21', '2026-10-23'], ['2026-10-26', '2026-10-28', '2026-10-30'], ['2026-11-02', '2026-11-04', '2026-11-06'], ['2026-11-09', '2026-11-11', '2026-11-13']]) mwf.push(day(m, [pec(4)]), day(w2, [pec(4)]), day(f, [pec(4)]));
    const { d, a, w } = setup(mwf, []);
    const f = forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'pec_deck', sets: 10 });
    expect(f.map((x) => [x.check, x.severity, x.date, x.muscle, x.hoursLeft])).toEqual([['recovery', 'limit', '2026-11-18', 'chest', 24]]);
    expect(f[0].text).toBe('Chest still recovering by Wednesday\'s session.');
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'pec_deck', sets: 4 })).toEqual([]);
  });
});

describe('H.3 #9 — a move whose first candidate day conflicts again', () => {
  // Usual Mon / Tue / Wed: Tue rows only (biceps 0.5 — interference again), Wed pull-ups. Curls on Tue → Wed pull-ups 24 h later
  // with 12 h of the 36 h window left → not clean. Curls on Wed (after pull-ups) → next session next Monday → clean → Wednesday.
  it('skips Tuesday and proposes Wednesday', () => {
    const h: Workout[] = [];
    for (const [m, t, w2] of [['2026-10-26', '2026-10-27', '2026-10-28'], ['2026-11-02', '2026-11-03', '2026-11-04'], ['2026-11-09', '2026-11-10', '2026-11-11']]) h.push(day(m, [pec(4), curls(4)]), day(t, [rows(4)]), day(w2, [pullups(4)]));
    const { d, a, w } = setup(h);
    expect(bestMoveDay({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 })).toEqual({ date: '2026-11-18', clean: true });
  });
});

describe('H.3 #14 — a stored move: kept, planned on its day in the normal order, cleared only when done', () => {
  const move = { id: 'mv1', exerciseId: 'machine_biceps_curl', equipmentId: 'bc', sets: 4, fromDate: '2026-11-16', date: '2026-11-17', reason: 'May reduce Tuesday\'s pull-up — biceps still recovering.', createdAt: '2026-11-16T17:35:00Z' };
  const mondayDone = day('2026-11-16', [pec(4)]);
  it('Tuesday\'s plan contains the curls with 4 sets, AFTER pull-ups and rows', async () => {
    const { generateWorkout } = await import('../src/domain/planner');
    const d = data([...history(), mondayDone], {});
    d.settings = { ...d.settings, plannedMoves: [move] };
    const now = new Date('2026-11-17T08:00:00Z');
    const g = generateWorkout({ data: d, analysis: analyze(d, now), now });
    const ids = g.items.map((i) => i.exerciseId);
    expect(ids).toContain('machine_biceps_curl');
    expect(g.items.find((i) => i.exerciseId === 'machine_biceps_curl')!.setCount).toBe(4);
    const after = (x: string) => ids.indexOf('machine_biceps_curl') > ids.indexOf(x);
    for (const x of ['pull_up', 'seated_cable_row'].filter((y) => ids.includes(y))) expect(after(x), x).toBe(true);
  });
  it('stays open when not done by its day (never auto-skipped); cleared once performed after the day it was moved from', async () => {
    const { activeMoves } = await import('../src/domain/sequence');
    const base = { settings: { ...data([]).settings, plannedMoves: [move] } };
    expect(activeMoves({ ...base, workouts: [mondayDone, day('2026-11-17', [pullups(4)])] })).toHaveLength(1);
    expect(activeMoves({ ...base, workouts: [mondayDone, day('2026-11-19', [legs(3), curls(4)])] })).toHaveLength(0);
  });
});
