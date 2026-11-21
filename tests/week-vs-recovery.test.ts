/**
 * "Weekly volume resets. Training history does not. Recovery does not."
 * Synthetic data, timezone UTC, week starts Monday. 2026-11-21 is a Saturday, 2026-11-23 a Monday.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { prescribe } from '../src/domain/prescription';
import { data, ex, set, workout } from './fixtures';

const heavyChestSat = workout('2026-11-21', [ex('pec_deck', Array.from({ length: 10 }, () => set(45, 10, 1)), 'pd_a')], { startTime: '17:00', endTime: '18:30' });
const chest = (ws = [heavyChestSat], now = '2026-11-23T08:00:00Z') => analyze(data(ws), new Date(now));

describe('weekly reporting period', () => {
  it('Monday 00:00 starts a new week: counters at 0, last week still in the history, nothing deleted', () => {
    const sun = chest([heavyChestSat], '2026-11-22T23:59:00Z');
    expect(sun.week.start).toBe('2026-11-16');
    expect(sun.muscles.find((m) => m.muscle === 'chest')!.completed).toBeGreaterThan(9);
    const mon = chest([heavyChestSat], '2026-11-23T00:01:00Z');
    expect(mon.week.start).toBe('2026-11-23');
    expect(mon.muscles.find((m) => m.muscle === 'chest')!.completed).toBe(0);
    const prev = mon.weeks.find((w) => w.range.start === '2026-11-16')!;
    expect(prev.workouts.map((w) => w.id)).toContain(heavyChestSat.id); // archived week is derived, not deleted
  });
  it('every completed set updates the current week immediately', () => {
    const w = workout('2026-11-23', [ex('pec_deck', [set(45, 10, 1)], 'pd_a')], { startTime: '07:00' });
    const one = chest([heavyChestSat, w], '2026-11-23T09:00:00Z').muscles.find((m) => m.muscle === 'chest')!.completed;
    const w2 = { ...w, exercises: [{ ...w.exercises[0], sets: [...w.exercises[0].sets, set(45, 9, 1)] }] };
    const two = chest([heavyChestSat, w2], '2026-11-23T09:00:00Z').muscles.find((m) => m.muscle === 'chest')!.completed;
    expect(two - one).toBeCloseTo(1, 5);
  });
  it('a session crossing midnight belongs to the week it started in; recovery counts from its real end', () => {
    const late = workout('2026-11-22', [ex('pec_deck', [set(45, 10, 1), set(45, 10, 1)], 'pd_a')], { startTime: '23:30', endTime: '00:40' });
    const a = chest([late], '2026-11-23T08:00:00Z');
    expect(a.weeks.find((w) => w.range.start === '2026-11-16')!.workouts.map((w) => w.id)).toContain(late.id);
    expect(a.muscles.find((m) => m.muscle === 'chest')!.completed).toBe(0);
    expect(a.recovery.chest.lastStimulusTime).toBe('00:40');
    expect(a.recovery.chest.hoursSince).toBe(7); // 00:40 → 08:00 (rounded)
  });
  it('a historical correction updates the archived week (derived from raw sets)', () => {
    const fewer = { ...heavyChestSat, exercises: [{ ...heavyChestSat.exercises[0], sets: heavyChestSat.exercises[0].sets.slice(0, 4) }] };
    const before = chest([heavyChestSat], '2026-11-22T12:00:00Z').muscles.find((m) => m.muscle === 'chest')!.completed;
    const after = chest([fewer], '2026-11-22T12:00:00Z').muscles.find((m) => m.muscle === 'chest')!.completed;
    expect(after).toBeLessThan(before);
  });
});

describe('continuous recovery', () => {
  it("Saturday's heavy session is still counted on Monday — a new week is not a fresh start", () => {
    const a = chest();
    const r = a.recovery.chest;
    expect(r.status).toBe('recovering');
    expect(r.lastStimulusDate).toBe('2026-11-21');
    expect(r.hoursSince).toBe(38); // Sat 18:30 → Mon 08:00 (37.5 h, rounded)
    const m = a.muscles.find((x) => x.muscle === 'chest')!;
    expect(m.completed).toBe(0); // weekly counter reset…
    expect(m.todayBlocked).toBe(true); // …but recovery still holds the muscle back today
  });
  it('recommendations use both: 0/target this week, yet no chest sets prescribed while recovering', () => {
    const today = workout('2026-11-23', [ex('pec_deck', [], 'pd_a')], { startTime: '08:00', source: 'live' });
    const d = data([heavyChestSat, today]);
    const a = analyze(d, new Date('2026-11-23T08:00:00Z'));
    const p = prescribe({ data: d, analysis: a, now: new Date('2026-11-23T08:00:00Z'), workout: today, exerciseIndex: 0 });
    expect(p.setCount).toBe(0);
    expect(p.setCountReason).toMatch(/recover/i);
  });
  it('once the window has passed (Tuesday evening) chest is available again', () => {
    expect(chest([heavyChestSat], '2026-11-24T20:00:00Z').recovery.chest.status).toBe('likely_recovered');
  });
});

describe('targets are not changed by single workouts', () => {
  it('adding one more session this week leaves the weekly target unchanged', () => {
    const extra = workout('2026-11-23', [ex('pec_deck', Array.from({ length: 6 }, () => set(45, 10, 1)), 'pd_a')], { startTime: '07:00' });
    const t1 = chest([heavyChestSat], '2026-11-23T12:00:00Z').muscles.find((m) => m.muscle === 'chest')!.target.preferred;
    const t2 = chest([heavyChestSat, extra], '2026-11-23T12:00:00Z').muscles.find((m) => m.muscle === 'chest')!.target.preferred;
    expect(t2).toBe(t1);
  });
});
