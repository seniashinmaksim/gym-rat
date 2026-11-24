/**
 * Independent review of Parts 7 + 8 (2026-11-24): regressions found by the reviewer, reproduced before the fix.
 * Hand-computed; all data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { defaultSettings } from '../src/domain/defaults';
import { failureProfile } from '../src/domain/failure';
import { generateWorkout } from '../src/domain/planner';
import { bestMoveDay, forwardChecks, usualSetCount } from '../src/domain/sequence';
import type { Workout, WorkoutExercise } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';
import { dataQualityHistory, dayAfterLast } from './sim/dataQuality';

const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);
const day = (d: string, exs: WorkoutExercise[]) => workout(d, exs, { startTime: '17:00', endTime: '18:00' });

describe('#1 a replacement the owner picked in the plan is never dropped', () => {
  it('forced triceps pushdown stays in the plan with at least 2 sets', () => {
    const d = dataQualityHistory({ sessions: 14 });
    const now = dayAfterLast(d, 1);
    const g = generateWorkout({ data: d, analysis: analyze(d, now), now, force: [{ exerciseId: 'triceps_pushdown_bar', equipmentId: null }] });
    const it0 = g.items.find((i) => i.exerciseId === 'triceps_pushdown_bar');
    expect(it0).toBeDefined();
    expect(it0!.setCount).toBeGreaterThanOrEqual(2);
  });
});

describe('#2 a moved exercise respects Replace (exclude) and the pain hold', () => {
  const hist: Workout[] = [];
  for (const [m, t, th] of [['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']]) {
    hist.push(day(m, [ex('pec_deck', times(4, () => set(40, 12, 2)), 'pd'), ex('machine_biceps_curl', times(4, () => set(30, 10, 1)), 'bc')]), day(t, [ex('seated_cable_row', times(3, () => set(50, 10, 2)), 'row')]), day(th, [ex('leg_extension', times(3, () => set(50, 12, 2)), 'le')]));
  }
  const move = { id: 'mv', exerciseId: 'machine_biceps_curl', equipmentId: 'bc', sets: 4, fromDate: '2026-11-16', date: '2026-11-17', reason: 'x', createdAt: '2026-11-16T18:00:00Z' };
  const now = new Date('2026-11-17T08:00:00Z');
  it('excluded (replaced) → not planned again', () => {
    const d = data(hist); d.settings = { ...d.settings, plannedMoves: [move] };
    const g = generateWorkout({ data: d, analysis: analyze(d, now), now, exclude: ['machine_biceps_curl'] });
    expect(g.items.map((i) => i.exerciseId)).not.toContain('machine_biceps_curl');
  });
  it('pain on it in the last 7 days → not planned (safety rule)', () => {
    // The pain hold comes from an exercise skipped for pain in the last 7 days (plan decision).
    const pain = workout('2026-11-13', [ex('leg_extension', times(3, () => set(50, 12, 2)), 'le')], { startTime: '17:00', endTime: '18:00', planDecisions: [{ action: 'skipped', exerciseId: 'machine_biceps_curl', equipmentId: 'bc', reason: 'pain', at: '2026-11-13T17:00:00Z' }] as never });
    const d = data([...hist, pain]); d.settings = { ...d.settings, plannedMoves: [move] };
    const g = generateWorkout({ data: d, analysis: analyze(d, now), now });
    expect(g.items.map((i) => i.exerciseId)).not.toContain('machine_biceps_curl');
  });
});

describe('#3 / #4 forward checks count today once and use what else is planned today', () => {
  // Usual Mon pec deck / Tue machine curls / Thu legs; today Monday; biceps target 10. 4 curls done today, 2 more →
  // biceps 6 → 36 h; Tuesday (24 h) has curls (biceps 1.0) → 12 h left = a limit; week: 10 − 6 = 4 still open → recovery.
  const hist: Workout[] = [];
  for (const [m, t, th] of [['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']]) {
    hist.push(day(m, [ex('pec_deck', times(4, () => set(40, 12, 2)), 'pd')]), day(t, [ex('machine_biceps_curl', times(3, () => set(30, 10, 2)), 'bc')]), day(th, [ex('leg_extension', times(3, () => set(50, 12, 2)), 'le')]));
  }
  const NOW = new Date('2026-11-16T17:40:00Z');
  it('#3 recovery finding with 4 done + 2 more (no double count of today)', () => {
    const live = workout('2026-11-16', [ex('machine_biceps_curl', times(4, () => set(30, 10, 1)), 'bc')], { startTime: '17:00' });
    const d = data([...hist, live]); d.settings = { ...d.settings, targetOverrides: { biceps: { min: 6, preferred: 10, max: 14 } } };
    const f = forwardChecks({ data: d, analysis: analyze(d, NOW), workout: live, exerciseId: 'machine_biceps_curl', sets: 2 });
    expect(f.map((x) => [x.check, x.severity, x.date])).toEqual([['recovery', 'limit', '2026-11-17']]);
  });
  it('#4 bestMoveDay does not offer Tuesday when today\'s plan keeps biceps inside its window then', () => {
    const d = data(hist);
    const a = analyze(d, NOW);
    const r = bestMoveDay({ data: d, analysis: a, workout: null, exerciseId: 'machine_biceps_curl', sets: 2, extraDone: { biceps: 6 } });
    expect(r?.date).not.toBe('2026-11-17');
  });
});

describe('#5 a new vault is already at formula revision 7 (an explicit 0.5 is never reverted)', () => {
  it('defaultSettings has formulaRevision 7', () => {
    expect(defaultSettings().formulaRevision).toBe(7);
  });
});

describe('failure share: HARD (near max, 0–1 in reserve) is not "stopped before failure"', () => {
  it('EASY + GOOD → none; HARD → unknown; MAX → failure', () => {
    const ws = [workout('2026-11-16', [ex('pec_deck', [set(40, 12, null, { effort: 'easy' }), set(40, 12, null, { effort: 'appropriate' }), set(40, 12, null, { effort: 'near_max' }), set(40, 12, null, { effort: 'near_max', failure: 'muscular' })])])];
    const t = failureProfile({ workouts: ws }, { start: '2026-11-16', end: '2026-11-22' }).totals;
    expect([t.recorded, t.none, t.muscular]).toEqual([3, 2, 1]);
  });
});

describe('plateau guard: a heavier load counts as progress only when the reps held up', () => {
  // 50 × 12,12,12 four times (Epley 70), then 52.5 × 4,4,4 twice (59.5 < 97 % of 70) → not shielded from plateau / decline.
  it('52.5 × 4 after 50 × 12 is not "progress"', () => {
    const dates = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
    const ws = dates.map((dd, i) => workout(dd, [ex('pec_deck', times(3, () => set(i < 4 ? 50 : 52.5, i < 4 ? 12 : 4, null)), 'eq-pec')]));
    const p = analyze(data(ws), new Date('2026-11-12T12:00:00Z')).progression.find((x) => x.exerciseId === 'pec_deck')!;
    expect(['plateau', 'declining']).toContain(p.trend.cls);
  });
});

describe('usual set count follows the sides rule', () => {
  it('3 left + 2 right = 3 sets; warm-ups ignored', () => {
    const w = workout('2026-11-10', [ex('cable_lateral_raise', [set(5, 12, 2, { side: 'left' }), set(5, 12, 2, { side: 'left' }), set(5, 12, 2, { side: 'left' }), set(5, 12, 2, { side: 'right' }), set(5, 12, 2, { side: 'right' }), set(2, 12, null, { side: 'left', type: 'warmup' })])]);
    expect(usualSetCount([w], 'cable_lateral_raise')).toBe(3);
  });
});
