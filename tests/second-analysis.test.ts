/**
 * Second analysis of the formula map (docs/FORMULA_DEPENDENCY_MAP.md §11), written BEFORE the fixes. Synthetic data.
 *
 * Owner's decisions 2026-11-24:
 *  - ONE recovery window everywhere: the next-session checks and the week fit add what is already known (≥ 2 failure
 *    sets, a new exercise, soreness, short sleep, high fatigue), like the recovery screen.
 *  - EASY with reps at the top of the range offers one step up for today's remaining sets (an offer only).
 *  - ONE "short rest": < 70 % of the usual rest on that exercise (today's median of ≥ 3, else the history's), the usual
 *    never taken below 2:30 (the owner never rests less) → short = under 1:45 at the floor.
 * Bugs (code wrong): the Week chip said RECOVERING from today's own sets / inside the tolerance; forward checks ignored
 * a second session the same day; the copied label said "last time" for this session's previous set; editing a set did
 * not re-sync the per-set prescription.
 */
import { describe, expect, it } from 'vitest';
import { analyze, weekChip } from '../src/domain/analysis';
import { forwardChecks } from '../src/domain/sequence';
import { estimateRecovery, windowHours } from '../src/domain/recovery';
import { sessionWindowH } from '../src/domain/weekPlan';
import { editSet, logSet, nextSetsOffer, weightSource } from '../src/domain/liveFlow';
import { objectiveForSets } from '../src/domain/perception';
import { isShortRest, usualRestSec, USUAL_REST_FLOOR_SEC } from '../src/domain/rest';
import { buildRegistry } from '../src/domain/registry';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import type { ExerciseTarget, Workout, WorkoutExercise } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const times = <X>(n: number, mk: () => X) => Array.from({ length: n }, mk);
const pec = (n: number) => ex('pec_deck', times(n, () => set(40, 12, 2)), 'pd');
const curls = (n: number, rir = 1) => ex('machine_biceps_curl', times(n, () => set(30, 10, rir)), 'bc');
const pullups = (n: number) => ex('pull_up', times(n, () => set(0, 8, 2, { loadMode: 'bodyweight_plus' })), null, { variation: { loading: 'bodyweight', gripWidth: 'shoulder' } });
const rows = (n: number) => ex('seated_cable_row', times(n, () => set(50, 10, 2)), 'row');
const legs = (n: number) => ex('leg_extension', times(n, () => set(50, 12, 2)), 'le');
const day = (d: string, exs: WorkoutExercise[]) => workout(d, exs, { startTime: '17:00', endTime: '18:00' });
function history(): Workout[] {
  const out: Workout[] = [];
  for (const [mon, tu, th] of [['2026-10-19', '2026-10-20', '2026-10-22'], ['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']]) {
    out.push(day(mon, [pec(4), curls(4)]), day(tu, [pullups(4), rows(3)]), day(th, [legs(3), pec(3)]));
  }
  return out;
}

describe('one recovery window everywhere (owner 2026-11-24)', () => {
  it('windowHours: base by sets, + 12 h large > 9, + 12 h ≥ 2 failure sets, + 12 h new, soreness + 12 / + 24, sleep < 6 h + 12, fatigue ≥ 4 + 12', () => {
    expect(windowHours({ sets: 3, large: false })).toBe(24);
    expect(windowHours({ sets: 3, large: false, failureSets: 2 })).toBe(36);
    expect(windowHours({ sets: 10, large: true, failureSets: 2, novel: true, soreness: 3, avgSleep: 5.5, maxFatigue: 4 })).toBe(60 + 12 + 12 + 12 + 24 + 12 + 12);
    expect(sessionWindowH(3, false, 12)).toBe(36);
  });
  it('the recovery screen and windowHours agree (one formula)', () => {
    const w = workout('2026-11-16', [curls(3, 0)], { startTime: '17:00', endTime: '18:00' });
    const d = data([...history(), w]);
    const r = estimateRecovery(d, buildRegistry([], []), Date.parse('2026-11-17T08:00:00Z'), '2026-11-17').biceps;
    expect(r.windowHours).toBe(windowHours({ sets: 3, large: false, failureSets: 3 }));
  });
  it('Monday: 2 curls to failure done + 1 more → the forward check flags Tuesday (36 h window), as Tuesday\'s recovery will', () => {
    const live = workout('2026-11-16', [pec(4), ex('machine_biceps_curl', [set(30, 10, 0, { completedAt: '2026-11-16T17:20:00Z' }), set(30, 10, 0, { completedAt: '2026-11-16T17:24:00Z' })], 'bc')], { startTime: '17:00' });
    const d = data([...history(), live]);
    const a = analyze(d, new Date('2026-11-16T17:30:00Z'));
    const f = forwardChecks({ data: d, analysis: a, workout: live, exerciseId: 'machine_biceps_curl', sets: 1 });
    expect(f.map((x) => [x.muscle, x.affectsExerciseId])).toEqual([['biceps', 'pull_up']]);
    // Tuesday: the same session holds biceps (the screens agree).
    const done = { ...live, exercises: live.exercises.map((e) => (e.exerciseId === 'machine_biceps_curl' ? { ...e, sets: [...e.sets, set(30, 10, 1, { completedAt: '2026-11-16T17:28:00Z' })] } : e)), endTime: '17:30' };
    const dT = data([...history(), done]);
    const aT = analyze(dT, new Date('2026-11-17T17:00:00Z'));
    expect(aT.muscles.find((m) => m.muscle === 'biceps')!.todayBlocked).toBe(true);
  });
  it('a second session the same day counts for the forward checks (not only the live workout)', () => {
    const morning = workout('2026-11-16', [curls(3, 2)], { startTime: '08:00', endTime: '08:40' });
    const live = workout('2026-11-16', [pec(2)], { startTime: '17:00' });
    const d = data([...history(), morning, live]);
    const a = analyze(d, new Date('2026-11-16T17:30:00Z'));
    // 3 curls this morning + 1 now = 4 effective → 36 h → Tuesday 17:00 is 24 h later → 12 h left → a limit.
    expect(forwardChecks({ data: d, analysis: a, workout: live, exerciseId: 'machine_biceps_curl', sets: 1 }).map((x) => x.muscle)).toEqual(['biceps']);
  });
});

describe('one "short rest" (owner 2026-11-24: never below 2:30 as the usual)', () => {
  it('usual = today\'s median of ≥ 3 rests, else the history\'s, never below 150 s; short = < 70 % of it', () => {
    expect(USUAL_REST_FLOOR_SEC).toBe(150);
    expect(usualRestSec([90, 100], null)).toBe(150);
    expect(usualRestSec([200, 210, 220], 120)).toBe(210);
    expect(usualRestSec([], 180)).toBe(180);
    expect(isShortRest(100, null)).toBe(true); // < 105 s
    expect(isShortRest(110, null)).toBe(false);
    expect(isShortRest(140, 210)).toBe(true); // < 147 s
    expect(isShortRest(null, 210)).toBe(false); // unknown rest = normal
  });
  it('perception: a 2-rep drop after a 90 s rest is the rest, not evidence of a hard set (was evidence: 90 ≥ 60 s)', () => {
    const s1 = set(40, 12, null, { id: 'p1' });
    const s2 = set(40, 10, null, { id: 'p2', restSecBefore: 90 });
    const o = objectiveForSets([s1, s2]).get('p1');
    expect(o?.kind ?? 'none').not.toBe('next_set');
  });
});

const T: ExerciseTarget = { sets: 3, weightKg: 40, reps: [{ min: 8, max: 12 }], rir: [{ min: 1, max: 2 }], engine: 'presc-1' };
const card = (sets = [] as ReturnType<typeof set>[], t: ExerciseTarget = T): WorkoutExercise => ({ ...ex('pec_deck', sets, 'pd'), target: t });
describe('after-set offer (owner 2026-11-24)', () => {
  it('EASY at the top of the range with a planned weight → no offer (owner 2026-11-25, replaces B-3: "I said easy" is not an analysis); GOOD → no offer', () => {
    expect(nextSetsOffer(card([set(40, 12, null, { effort: 'easy', feel: 'bit_easy', completedAt: '2026-11-16T17:20:00Z' })]), 2.5)).toBeNull();
    expect(nextSetsOffer(card([set(40, 12, null, { effort: 'appropriate', completedAt: '2026-11-16T17:20:00Z' })]), 2.5)).toBeNull();
  });
  it('two sets well under the range after 90 s rests → the rest, no reduce offer (unified short rest)', () => {
    const e = card([set(40, 5, 2, { completedAt: '2026-11-16T17:20:00Z', restSecBefore: 180 }), set(40, 5, 2, { completedAt: '2026-11-16T17:22:00Z', restSecBefore: 90 })]);
    expect(nextSetsOffer(e, 2.5)).toBeNull();
  });
});

describe('bugs found by the second analysis', () => {
  it('B-1 Week chip: today\'s own sets never show RECOVERING; it follows todayBlocked', () => {
    const live = workout('2026-11-16', [pec(2)], { startTime: '08:00' });
    const d = data([...history(), live]);
    const a = analyze(d, new Date('2026-11-16T09:00:00Z'));
    const chest = a.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.todayBlocked).toBe(false);
    expect(weekChip(chest)).not.toBe('recovering');
  });
  it('B-8 copied from THIS session\'s previous set is told apart from last time', () => {
    const e = card([set(35, 10, 2, { completedAt: '2026-11-16T17:20:00Z' })]);
    expect(weightSource(e, null, 35)).toBe('session');
  });
  it('B-12 removing the first working set re-numbers the prescriptions of the others', () => {
    const t: ExerciseTarget = { sets: 3, weightKg: 40, reps: [{ min: 6, max: 8 }, { min: 8, max: 10 }, { min: 10, max: 12 }], rir: [{ min: 2, max: 3 }, { min: 1, max: 2 }, { min: 0, max: 1 }], engine: 'presc-1' };
    let e = card([], t);
    e = logSet(e, { weightKg: 40, reps: 8, loadMode: 'total' }, Date.parse('2026-11-16T17:10:00Z'), 'a', DEFAULT_QUALITY);
    e = logSet(e, { weightKg: 40, reps: 9, loadMode: 'total' }, Date.parse('2026-11-16T17:14:00Z'), 'b', DEFAULT_QUALITY);
    e = editSet(e, 'a', null, DEFAULT_QUALITY, t);
    expect(e.sets.find((x) => x.id === 'b')!.prescribed).toMatchObject({ repsMin: 6, repsMax: 8 });
  });
});
