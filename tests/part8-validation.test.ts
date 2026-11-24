/**
 * Part 8 validation (owner's list 2026-11-24): edge cases of pairs, softening, learned days, configuration on moves,
 * export / import and the three warning categories. Written against the existing behaviour first; every number is
 * computed by hand in the comment above it. All data is synthetic.
 */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { workoutToExport } from '../src/domain/importer';
import { addMoves, forwardChecks, forwardHabit, keptOutcome, moveNeedsSetup, movePartners, type ForwardFinding } from '../src/domain/sequence';
import { buildRegistry } from '../src/domain/registry';
import type { PlannedMove, Workout, WorkoutExercise, WorkoutSet } from '../src/domain/types';
import { usualTrainingDays } from '../src/domain/weekPlan';
import { setLang } from '../src/i18n/core';
import { ForwardWarning } from '../src/ui/components/ForwardWarning';
import { data, ex, set, workout } from './fixtures';

const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);
const day = (d: string, exs: WorkoutExercise[]) => workout(d, exs, { startTime: '17:00', endTime: '18:00' });
const add = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const pec = () => ex('pec_deck', times(4, () => set(40, 12, 2)), 'pd');
const curlsA = (kept?: string) => ex('machine_biceps_curl', times(4, () => set(30, 10, 1)), 'bc', kept ? { forwardKept: { affectsExerciseId: 'pull_up', date: kept, muscle: 'biceps' } } : {});
const hammerB = () => ex('hammer_curl', times(3, () => set(14, 10, 1)), null);
const cableC = () => ex('cable_curl', times(3, () => set(20, 12, 1)), 'cc');
const legs = () => ex('leg_extension', times(3, () => set(50, 12, 2)), 'le');
const pull = (reps: number, extra: Partial<WorkoutSet> = {}, variation: WorkoutExercise['variation'] = { loading: 'bodyweight', gripWidth: 'shoulder' }) =>
  ex('pull_up', times(3, (): WorkoutSet => set(variation?.loading === 'weighted' ? 10 : 0, reps, 2, { loadMode: 'bodyweight_plus', ...extra })), null, { variation });

/** n weeks Mon / Tue / Thu ending the week before Monday 2026-11-16. */
function weeksBack(n: number) { return Array.from({ length: n }, (_, i) => add('2026-11-16', -7 * (n - i))); }
const NOW = new Date('2026-11-16T17:30:00Z');
const live = workout('2026-11-16', [pec()], { startTime: '17:00' });

// ============================================================== 1. pair detection
describe('1. pairs', () => {
  /** Mondays with the given order (array of exercise lists), Tue legs, Thu legs. */
  const mondays = (orders: WorkoutExercise[][]) => {
    const starts = weeksBack(orders.length);
    return starts.flatMap((m, i) => [day(m, orders[i]), day(add(m, 1), [legs()]), day(add(m, 3), [legs()])]);
  };
  const ids = ['pec_deck', 'machine_biceps_curl', 'hammer_curl', 'cable_curl'];
  it('1.1 adjacent in 3 of 4 sessions (75 % ≥ 70 %) → a pair', () => {
    const d = data([...mondays([[curlsA(), hammerB()], [curlsA(), hammerB()], [curlsA(), hammerB()], [curlsA(), pec(), hammerB()]]), live]);
    expect(movePartners(d, analyze(d, NOW), 'machine_biceps_curl', ids, '2026-11-17')).toEqual(['hammer_curl']);
  });
  it('1.2 adjacent in 2 of 4 (50 %) → not a pair', () => {
    const d = data([...mondays([[curlsA(), hammerB()], [curlsA(), hammerB()], [curlsA(), pec(), hammerB()], [curlsA(), pec(), hammerB()]]), live]);
    expect(movePartners(d, analyze(d, NOW), 'machine_biceps_curl', ids, '2026-11-17')).toEqual([]);
  });
  it('1.3 A–B and B–C pairs, A–C not adjacent → moving A takes only B (no transitive three-exercise group)', () => {
    const d = data([...mondays(times(4, () => [curlsA(), hammerB(), cableC()])), live]);
    const a = analyze(d, NOW);
    expect(movePartners(d, a, 'machine_biceps_curl', ids, '2026-11-17')).toEqual(['hammer_curl']);
    expect(movePartners(d, a, 'cable_curl', ids, '2026-11-17')).toEqual(['hammer_curl']);
  });
  it('1.4 the order changed for good: 12 old weeks adjacent, then 4 weeks apart → forgotten (last 6 sessions: 2 / 6; all 16 would say 75 %)', () => {
    const d = data([...mondays([...times(12, () => [curlsA(), hammerB()]), ...times(4, () => [curlsA(), pec(), hammerB()])]), live]);
    expect(movePartners(d, analyze(d, NOW), 'machine_biceps_curl', ids, '2026-11-17')).toEqual([]);
  });
  it('1.7 always next to each other but unrelated (pec deck before curls) → not a pair', () => {
    const d = data([...mondays(times(4, () => [pec(), curlsA()])), live]);
    expect(movePartners(d, analyze(d, NOW), 'machine_biceps_curl', ids, '2026-11-17')).toEqual([]);
  });
});

// ============================================================== 2. softening
describe('2. softening', () => {
  /**
   * Weeks Mon (pec + curls) / Tue (pull-ups) / Thu (legs). `reps[i]` = Tuesday pull-up reps in week i; the curls were kept
   * against Tuesday's pull-ups in the weeks listed in `keptIn`.
   */
  function hist(reps: number[], keptIn: number[], tue: (i: number, r: number) => WorkoutExercise = (_i, r) => pull(r)) {
    const starts = weeksBack(reps.length);
    return starts.flatMap((m, i) => [day(m, [pec(), curlsA(keptIn.includes(i) ? add(m, 1) : undefined)]), day(add(m, 1), [tue(i, reps[i])]), day(add(m, 3), [legs()])]);
  }
  const outcome = (ws: Workout[]) => { const d = data([...ws, live]); return keptOutcome(d, analyze(d, NOW), 'machine_biceps_curl', 'pull_up'); };
  const severity = (ws: Workout[]) => { const d = data([...ws, live]); return forwardChecks({ data: d, analysis: analyze(d, NOW), workout: live, exerciseId: 'machine_biceps_curl', sets: 4 })[0]?.severity; };
  // Index of these pull-ups = reps + RIR 2 (reps scale). Comparison on the Epley scale: (1 + i/30) ÷ (1 + baseline/30).
  // Baseline = median of the 3 comparable sessions before the first of the kept ones (here 10 reps → 12).
  it('2.1 10 → 9 → 10 → 10 is normal variation: 11 vs 12 → 1.367 / 1.4 = 0.976 ≥ 0.97 → held up → a Tip', () => {
    expect(outcome(hist([10, 10, 10, 9, 10, 10], [3, 4, 5]))).toMatchObject({ observations: 3, notLower: 3, softened: true });
  });
  it('2.2 10 → 9 → 8 → 7: vs baseline 12: 0.976 ok, 1.333/1.4 = 0.952 lower, 0.929 lower → stays a limit', () => {
    const ws = hist([10, 10, 10, 9, 8, 7], [3, 4, 5]);
    expect(outcome(ws)).toMatchObject({ observations: 3, notLower: 1, softened: false });
    expect(severity(ws)).toBe('limit');
  });
  it('2.3 improving despite three overrides (11, 12, 12) → a Tip', () => {
    expect(severity(hist([10, 10, 10, 11, 12, 12], [3, 4, 5]))).toBe('recommendation');
  });
  it('2.4 three overrides but only two comparable results (one Tuesday missing) → not softened', () => {
    const ws = hist([10, 10, 10, 10, 10, 10], [3, 4, 5]).filter((w) => w.date !== add(weeksBack(6)[5], 1));
    expect(outcome(ws)).toMatchObject({ observations: 2, softened: false });
  });
  it('2.5 the results after the overrides were weighted pull-ups (another history) → not evidence', () => {
    const ws = hist([10, 10, 10, 8, 8, 8], [3, 4, 5], (i, r) => (i >= 3 ? pull(r, {}, { loading: 'weighted', gripWidth: 'shoulder' }) : pull(r)));
    expect(outcome(ws)).toMatchObject({ observations: 0, softened: false });
  });
  it('2.6 a session stopped early (RIR 5 vs the usual 2) or after a much shorter rest is not evidence', () => {
    const early = hist([10, 10, 10, 10, 10, 7], [3, 4, 5], (i, r) => pull(r, i === 5 ? { rir: 5 } : {}));
    expect(outcome(early)).toMatchObject({ observations: 2 });
    const rushed = hist([10, 10, 10, 10, 10, 7], [3, 4, 5], (i, r) => pull(r, { restSecBefore: i === 5 ? 60 : 150 }));
    expect(outcome(rushed)).toMatchObject({ observations: 2 });
  });
  it('2.7 softened, then two clear drops → the limit comes back (last 3: 10, 8, 8 vs baseline 10 → 1 of 3 held)', () => {
    expect(severity(hist([10, 10, 10, 10, 10, 10], [3, 4, 5]))).toBe('recommendation');
    expect(severity(hist([10, 10, 10, 10, 10, 10, 8, 8], [3, 4, 5, 6, 7]))).toBe('limit');
  });
  it('2.8 a pure recovery limit is never softened, whatever was kept', () => {
    // Tuesday has curls (direct biceps) → a recovery check; the week still needs biceps.
    const ws = hist([10, 10, 10, 10, 10, 10], [3, 4, 5], () => ex('machine_biceps_curl', times(3, () => set(30, 10, 2)), 'bc'));
    const d = data([...ws, live]); d.settings = { ...d.settings, targetOverrides: { biceps: { min: 6, preferred: 10, max: 14 } } };
    const f = forwardChecks({ data: d, analysis: analyze(d, NOW), workout: live, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(f.map((x) => [x.check, x.severity])).toEqual([['recovery', 'limit']]);
  });
  it('2.9 softening never changes recovery, hours left, weekly volume or credits', () => {
    const ws = hist([10, 10, 10, 10, 10, 10], [3, 4, 5]);
    const strip = (xs: Workout[]) => xs.map((w) => ({ ...w, exercises: w.exercises.map(({ forwardKept: _k, ...e }) => { void _k; return e; }) }));
    const a1 = analyze(data([...ws, live]), NOW);
    const a2 = analyze(data([...strip(ws), live]), NOW);
    expect(a1.recovery).toEqual(a2.recovery);
    expect(a1.current).toEqual(a2.current);
    const f = (dd: ReturnType<typeof data>, a: ReturnType<typeof analyze>) => forwardChecks({ data: dd, analysis: a, workout: live, exerciseId: 'machine_biceps_curl', sets: 4 })[0];
    expect(f(data([...ws, live]), a1).hoursLeft).toBe(f(data([...strip(ws), live]), a2).hoursLeft);
  });
});

// ============================================================== 3. learned days
describe('3. learned training days', () => {
  const wk = (start: string, offsets: number[]) => offsets.map((o) => ({ date: add(start, o) }));
  const usual = (weeks: { date: string }[][]) => usualTrainingDays(weeks.map((w) => ({ dates: w.map((x) => x.date) })));
  const s = weeksBack(4);
  it('3.1 one missed Wednesday in 4 weeks → still Mon / Wed / Fri', () => {
    expect(usual([wk(s[0], [0, 2, 4]), wk(s[1], [0, 4]), wk(s[2], [0, 2, 4]), wk(s[3], [0, 2, 4])])).toEqual([1, 3, 5]);
  });
  it('3.2 one unusual week with a single session → unchanged', () => {
    expect(usual([wk(s[0], [0, 2, 4]), wk(s[1], [0]), wk(s[2], [0, 2, 4]), wk(s[3], [0, 2, 4])])).toEqual([1, 3, 5]);
  });
  it('3.3 a switch Mon/Tue/Thu → Mon/Wed/Fri is learned gradually (1 new week: old pattern; 3 new weeks: new one)', () => {
    expect(usual([wk(s[0], [0, 1, 3]), wk(s[1], [0, 1, 3]), wk(s[2], [0, 1, 3]), wk(s[3], [0, 2, 4])])).toEqual([1, 2, 4]);
    expect(usual([wk(s[0], [0, 1, 3]), wk(s[1], [0, 2, 4]), wk(s[2], [0, 2, 4]), wk(s[3], [0, 2, 4])])).toEqual([1, 3, 5]);
  });
  it('3.4 alternating weeks (Mon/Wed/Fri, then Tue/Thu/Sat) → no rigid schedule is invented (6 "usual" days > 3 sessions + 1)', () => {
    expect(usual([wk(s[0], [0, 2, 4]), wk(s[1], [1, 3, 5]), wk(s[2], [0, 2, 4]), wk(s[3], [1, 3, 5])])).toBeNull();
  });
  it('3.5 only 3 full weeks of history → forward warnings are tips at most (limited confidence); 4 weeks → a limit', () => {
    const mk = (n: number) => weeksBack(n).flatMap((m) => [day(m, [pec(), curlsA()]), day(add(m, 1), [pull(8)]), day(add(m, 3), [legs()])]);
    const sev = (n: number) => { const d = data([...mk(n), live]); return forwardChecks({ data: d, analysis: analyze(d, NOW), workout: live, exerciseId: 'machine_biceps_curl', sets: 4 })[0]?.severity; };
    expect(sev(3)).toBe('recommendation');
    expect(sev(4)).toBe('limit');
  });
  it('3.7 the habit line follows the latest kept conflict and expires 4 weeks after it', () => {
    const ws = weeksBack(6).flatMap((m, i) => [day(m, [pec(), curlsA(i >= 3 ? add(m, 1) : undefined)]), day(add(m, 1), [pull(10)]), day(add(m, 3), [legs()])]);
    const d = data([...ws, live]);
    expect(forwardHabit(d, analyze(d, NOW))).not.toBeNull();
    expect(forwardHabit(d, analyze(d, new Date('2026-12-15T12:00:00Z')))).toBeNull();
  });
});

// ============================================================== 4. configuration on moves
describe('4. configuration on moves', () => {
  const reg = buildRegistry([], []);
  const mv = (over: Partial<PlannedMove>): PlannedMove => ({ id: 'm1', exerciseId: 'machine_biceps_curl', equipmentId: 'bc', sets: 4, fromDate: '2026-11-16', date: '2026-11-17', reason: 'x', createdAt: '2026-11-16T18:00:00Z', ...over });
  it('4.1 / 4.3 a move from the plan card keeps the machine and the variation on the target day', async () => {
    const { generateWorkout } = await import('../src/domain/planner');
    const ws = weeksBack(4).flatMap((m) => [day(m, [pec(), ex('incline_dumbbell_press', times(3, () => set(25, 10, 2)), null, { variation: { benchAngleDeg: 30 } })]), day(add(m, 1), [pull(8)]), day(add(m, 3), [legs()])]);
    const d = data([...ws, day('2026-11-16', [pec()])]);
    d.settings = { ...d.settings, plannedMoves: [mv({ exerciseId: 'incline_dumbbell_press', equipmentId: null, variation: { benchAngleDeg: 30 }, sets: 3 })] };
    const now = new Date('2026-11-17T08:00:00Z');
    const item = generateWorkout({ data: d, analysis: analyze(d, now), now }).items.find((i) => i.exerciseId === 'incline_dumbbell_press');
    expect(item?.variation).toMatchObject({ benchAngleDeg: 30 });
  });
  it('4.2 a move without a machine for a machine exercise says the machine is chosen on the day; free weights do not', () => {
    expect(moveNeedsSetup(mv({ equipmentId: null }), reg)).toBe(true);
    expect(moveNeedsSetup(mv({}), reg)).toBe(false);
    expect(moveNeedsSetup(mv({ exerciseId: 'hammer_curl', equipmentId: null }), reg)).toBe(false);
  });
  it('4.4 / 4.5 a second move of the same exercise replaces the first (no duplicate), others stay; Undo = the list before', () => {
    const before = [mv({ id: 'a' }), mv({ id: 'b', exerciseId: 'hammer_curl' })];
    const after = addMoves(before, [mv({ id: 'c', date: '2026-11-19' })]);
    expect(after.map((m) => [m.id, m.exerciseId, m.date])).toEqual([['b', 'hammer_curl', '2026-11-17'], ['c', 'machine_biceps_curl', '2026-11-19']]);
    expect(before.map((m) => m.id)).toEqual(['a', 'b']); // untouched: Undo writes this list back as it was
  });
});

// ============================================================== 5. export / import
describe('5. export, import and learned state', () => {
  it('5.1 / 5.3 the Claude export carries no kept-warning records; workouts without them give the same numbers and learn nothing', () => {
    const ws = weeksBack(6).flatMap((m, i) => [day(m, [pec(), curlsA(i >= 3 ? add(m, 1) : undefined)]), day(add(m, 1), [pull(10)]), day(add(m, 3), [legs()])]);
    const exported = JSON.stringify(ws.map((w) => workoutToExport(w)));
    expect(exported).not.toMatch(/forwardKept|affectsExerciseId/);
    const imported = ws.map((w) => ({ ...w, exercises: w.exercises.map(({ forwardKept: _k, ...e }) => { void _k; return e; }) }));
    const a1 = analyze(data([...ws, live]), NOW);
    const d2 = data([...imported, live]);
    const a2 = analyze(d2, NOW);
    expect(a2.current).toEqual(a1.current);
    expect(a2.recovery).toEqual(a1.recovery);
    expect(keptOutcome(d2, a2, 'machine_biceps_curl', 'pull_up').observations).toBe(0);
    expect(forwardHabit(d2, a2)).toBeNull();
    expect(forwardChecks({ data: d2, analysis: a2, workout: live, exerciseId: 'machine_biceps_curl', sets: 4 })[0].severity).toBe('limit');
  });
});

// ============================================================== 6. categories
describe('6. recovery limit vs performance interference vs tip', () => {
  const f = (over: Partial<ForwardFinding>): ForwardFinding => ({ check: 'interference', severity: 'limit', date: '2026-11-17', muscle: 'biceps', affectsExerciseId: 'pull_up', hoursLeft: 12, text: 'x', ...over });
  const html = (x: ForwardFinding) => renderToString(h(ForwardWarning, { findings: [x], moveDate: '2026-11-17', clean: true, onMove: () => undefined }));
  it('6.6 three distinct labels in English', () => {
    expect(html(f({ check: 'recovery' }))).toContain('Recovery limit');
    expect(html(f({}))).toContain('Next-session performance');
    expect(html(f({ severity: 'recommendation' }))).toContain('Tip');
    expect(html(f({}))).not.toContain('Recovery limit');
  });
  it('6.6 and in Russian', () => {
    setLang('ru');
    try {
      expect(html(f({ check: 'recovery' }))).toContain('Предел восстановления');
      expect(html(f({}))).toContain('Результат следующей тренировки');
      expect(html(f({ severity: 'recommendation' }))).toContain('Совет');
    } finally { setLang('en'); }
  });
  it('6.4 a change in the upcoming schedule is evaluated afresh (Tuesday becomes legs → no warning)', () => {
    const base = weeksBack(4).flatMap((m) => [day(m, [pec(), curlsA()]), day(add(m, 1), [pull(8)]), day(add(m, 3), [legs()])]);
    const changed = base.map((w) => (w.exercises.some((e) => e.exerciseId === 'pull_up') && w.date > weeksBack(4)[0] ? { ...w, exercises: [legs()] } : w));
    const run = (ws: Workout[]) => { const d = data([...ws, live]); return forwardChecks({ data: d, analysis: analyze(d, NOW), workout: live, exerciseId: 'machine_biceps_curl', sets: 4 }); };
    expect(run(base)).toHaveLength(1);
    expect(run(changed)).toEqual([]);
  });
});
