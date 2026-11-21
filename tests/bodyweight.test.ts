/** Body weight at any time + its link to workouts, pull-ups and squats. Synthetic data only. */
import { describe, expect, it } from 'vitest';
import {
  bodyLoadSessions, bodyWeightForSession, bodyWeightNote, isDuplicateWeighIn, latestWeighIn, pullUpLoadingAdvice, rollingAverage, weeklyTrend, weighInsOn,
} from '../src/domain/bodyweight';
import { buildProgression } from '../src/domain/progression';
import { buildRegistry } from '../src/domain/registry';
import type { BodyMeasurement } from '../src/domain/types';
import { ex, set, workout } from './fixtures';

const bm = (id: string, date: string, kg: number, time: string | null = null, extra: Partial<BodyMeasurement> = {}): BodyMeasurement => ({ id, date, time, weightKg: kg, photoIds: [], ...extra });

describe('weigh-ins keep the measurement time, not the entry time', () => {
  it('07:00 weigh-in typed at 20:00 is stored and used as 07:00; two on one day are both kept', () => {
    const body = [bm('a', '2026-11-20', 82.4, '07:00', { enteredAt: '2026-11-20T20:00:00Z' }), bm('b', '2026-11-20', 83.1, '21:30')];
    expect(weighInsOn(body, '2026-11-20').map((w) => [w.time, w.kg])).toEqual([['07:00', 82.4], ['21:30', 83.1]]);
    expect(latestWeighIn(body)?.kg).toBe(83.1);
    // A 17:00 workout uses the 07:00 weigh-in, never the 21:30 one taken after it.
    const s = bodyWeightForSession(body, { date: '2026-11-20', startTime: '17:00' });
    expect(s).toMatchObject({ status: 'ok', kg: 82.4, time: '07:00', gapHours: 10, approximate: false });
  });
  it('a weigh-in after the workout is never applied to it; earlier days are; old ones are outdated; none → unavailable', () => {
    const body = [bm('a', '2026-11-18', 81.9, '08:00'), bm('b', '2026-11-20', 82.0, '19:00')];
    expect(bodyWeightForSession(body, { date: '2026-11-20', startTime: '07:30' })).toMatchObject({ kg: 81.9, date: '2026-11-18' });
    expect(bodyWeightForSession([bm('a', '2026-11-01', 80, '08:00')], { date: '2026-11-20', startTime: '07:30' }).status).toBe('outdated');
    expect(bodyWeightForSession([], { date: '2026-11-20', startTime: '07:30' })).toMatchObject({ status: 'unavailable', kg: null });
    // Same day without a time: only when marked morning/before workout.
    expect(bodyWeightForSession([bm('x', '2026-11-20', 82)], { date: '2026-11-20', startTime: '18:00' }).status).toBe('unavailable');
    expect(bodyWeightForSession([bm('x', '2026-11-20', 82, null, { condition: 'morning_fasted' })], { date: '2026-11-20', startTime: '18:00' }).kg).toBe(82);
  });
  it('a late entry dated before an earlier workout updates that workout (derived, not copied)', () => {
    const w = { date: '2026-11-19', startTime: '18:00' };
    expect(bodyWeightForSession([], w).status).toBe('unavailable');
    expect(bodyWeightForSession([bm('late', '2026-11-19', 82.2, '07:10', { enteredAt: '2026-11-21T09:00:00Z' })], w).kg).toBe(82.2);
  });
  it('duplicate guard only blocks the exact same reading', () => {
    const body = [bm('a', '2026-11-20', 82.4, '07:00')];
    expect(isDuplicateWeighIn(body, 82.4, '2026-11-20', '07:00')).toBe(true);
    expect(isDuplicateWeighIn(body, 82.4, '2026-11-20', '19:00')).toBe(false);
  });
});

describe('7-day average and trend', () => {
  it('averages daily means over the last 7 days (several weigh-ins on one day count as one day)', () => {
    const body = [bm('1', '2026-11-14', 80, '07:00'), bm('2', '2026-11-15', 81, '07:00'), bm('3', '2026-11-15', 83, '20:00'), bm('4', '2026-11-20', 82, '07:00')];
    // window 14–20: days 14 (80), 15 (82), 20 (82) → 81.33
    expect(rollingAverage(body, '2026-11-20')).toEqual({ kg: 81.33, days: 3, n: 4 });
    expect(rollingAverage(body, '2026-11-13')).toBeNull();
  });
  it('weekly trend = this 7-day average minus last week\'s', () => {
    const body = [bm('1', '2026-11-10', 80), bm('2', '2026-11-12', 80.4), bm('3', '2026-11-18', 81), bm('4', '2026-11-20', 81.4)];
    expect(weeklyTrend(body, '2026-11-20')).toBe(1);
  });
});

describe('pull-ups and squats with body weight', () => {
  const reg = buildRegistry([], []);
  const pull = (d: string, belt: number, reps: number[], loading: 'bodyweight' | 'weighted') =>
    workout(d, [ex('pull_up', reps.map((r) => set(belt, r, 1, { loadMode: 'bodyweight_plus' })), null, { variation: { loading, gripWidth: 'shoulder' } })], { startTime: '18:00' });
  const ws = [pull('2026-11-02', 0, [10, 9], 'bodyweight'), pull('2026-11-09', 0, [12, 11], 'bodyweight'), pull('2026-11-05', 10, [6, 6], 'weighted'), pull('2026-11-12', 15, [6, 5], 'weighted')];
  const prog = buildProgression(ws, reg, [], [], 2, '2026-11-21');
  it('bodyweight vs weighted and grip width are separate histories', () => {
    const keys = prog.map((p) => p.key).sort();
    expect(keys).toEqual(['pull_up::free|load=bodyweight|gw=shoulder', 'pull_up::free|load=weighted|gw=shoulder']);
  });
  it('weighted pull-ups keep body and belt separate; the combined figure is an estimate', () => {
    const body = [bm('a', '2026-11-05', 82, '07:00'), bm('b', '2026-11-12', 80.5, '07:00')];
    const wp = prog.find((p) => p.key.includes('weighted'))!;
    const s = bodyLoadSessions(wp, ws, body, 'system');
    expect(s.map((x) => [x.body.kg, x.externalKg, x.estSystemKg])).toEqual([[82, 10, 92], [80.5, 15, 95.5]]);
    expect(bodyWeightNote(s, 'system')).toMatch(/Added load \+5 kg while body weight fell 1.5 kg .*estimate/);
  });
  it('bodyweight pull-up reps gained while lighter are flagged as possibly helped by lower body weight', () => {
    const body = [bm('a', '2026-11-02', 82, '07:00'), bm('b', '2026-11-09', 80, '07:00')];
    const bw = prog.find((p) => p.key.includes('bodyweight'))!;
    expect(bodyWeightNote(bodyLoadSessions(bw, ws, body, 'system'), 'system')).toMatch(/Reps \+2 .* fell 2 kg/);
    expect(pullUpLoadingAdvice(bw, 12)).toBeNull(); // 11 < 12 on the last set
  });
  it('squats never add body weight to the bar', () => {
    const sq = [workout('2026-11-03', [ex('back_squat', [set(100, 8, 2)])], { startTime: '18:00' }), workout('2026-11-10', [ex('back_squat', [set(100, 8, 2)])], { startTime: '18:00' })];
    const p = buildProgression(sq, reg, [], [], 2, '2026-11-21')[0];
    const body = [bm('a', '2026-11-03', 82, '07:00'), bm('b', '2026-11-10', 80, '07:00')];
    const s = bodyLoadSessions(p, sq, body, 'context');
    expect(s.map((x) => [x.externalKg, x.estSystemKg])).toEqual([[100, null], [100, null]]);
    expect(bodyWeightNote(s, 'context')).toMatch(/never added to the bar/);
  });
});
