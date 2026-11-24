/**
 * Regression tests for the 2026-11 critical review (science calibration + correctness fixes).
 * All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { classifyTrend, sessionPerf, suggestNextLoad } from '../src/domain/progression';
import { assessSet, taperBeyondCap } from '../src/domain/quality';
import { baseWindowHours, estimateRecovery } from '../src/domain/recovery';
import { buildRegistry } from '../src/domain/registry';
import { buildSnapshot, pendingSnapshot, weeklyReport } from '../src/domain/reports';
import { computeVolume } from '../src/domain/volume';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const muscle = (a: ReturnType<typeof analyze>, m: string) => a.muscles.find((x) => x.muscle === m)!;

describe('planned (pre-filled) sets', () => {
  it('do not count toward volume until performed', () => {
    const w = workout('2026-11-18', [ex('preacher_curl', [set(20, 10, 1), set(20, 10, null, { planned: true })])]);
    const v = computeVolume([w], reg, DEFAULT_QUALITY);
    expect(v.muscles.biceps.effective).toBe(1);
    expect(v.totalWorkingSets).toBe(1);
  });
  it('are ignored by the weekly analysis and progression', () => {
    const now = new Date('2026-11-18T19:00:00Z');
    const planned = workout('2026-11-18', [ex('preacher_curl', [set(20, 10, null, { planned: true })])]);
    const a = analyze(data([planned]), now);
    expect(muscle(a, 'biceps').completed).toBe(0);
    expect(a.progression.length).toBe(0);
  });
});

describe("today's share", () => {
  const now = new Date('2026-11-18T19:00:00Z'); // Wednesday evening, mid-session
  const before = data([workout('2026-11-16', [ex('bulgarian_split_squat', [set(20, 10, 2)])])]);
  it('stays fixed while you log, and today\'s own sets never mark the muscle "recovering"', () => {
    const a0 = analyze(before, now);
    const share = muscle(a0, 'biceps').todayShare;
    expect(share).toBeGreaterThan(0);
    const during = data([
      ...before.workouts,
      workout('2026-11-18', [ex('preacher_curl', [set(20, 10, 1), set(20, 10, 1), set(20, 10, 1)])], { startTime: '18:30' }),
    ]);
    const a1 = analyze(during, now);
    const b = muscle(a1, 'biceps');
    expect(b.todayShare).toBe(share);
    expect(b.doneToday).toBe(3);
    expect(b.todayLeft).toBe(Math.max(0, share - 3));
    expect(b.todayBlocked).toBe(false);
    expect(b.moreVolumeJustified).not.toBe('wait');
  });
  it('never suggests cramming: the last session of the week is capped per muscle and the rest carries over', () => {
    const sunday = new Date('2026-11-22T10:00:00Z');
    const d = data([workout('2026-11-16', [ex('bulgarian_split_squat', [set(20, 10, 2)])])]);
    const a = analyze(d, sunday);
    const calves = muscle(a, 'calves');
    expect(a.sessionsLeftInclToday).toBe(1);
    expect(calves.todayShare).toBeLessThanOrEqual(Math.round(calves.target.preferred * 0.6));
    expect(calves.carryOver).toBeGreaterThan(0);
  });
  it('does not call a muscle "behind" on Monday morning before training', () => {
    const monday = new Date('2026-11-23T07:00:00Z');
    const d = data(['2026-11-16', '2026-11-18', '2026-11-20'].map((day) => workout(day, [ex('preacher_curl', [set(20, 10, 1)])])));
    const a = analyze(d, monday);
    expect(muscle(a, 'biceps').status).toBe('on_track');
  });
});

describe('recovery calibration', () => {
  it('uses 24–72 h baseline windows by session size', () => {
    expect(baseWindowHours(3)).toBe(24);
    expect(baseWindowHours(5)).toBe(36);
    expect(baseWindowHours(8)).toBe(48);
    expect(baseWindowHours(11)).toBe(60);
    expect(baseWindowHours(15)).toBe(72);
  });
  it('a typical full-body Mon → Wed gap (48 h) is recovered after ~5 non-failure chest sets', () => {
    const d = data([workout('2026-11-16', [ex('barbell_bench_press', Array.from({ length: 5 }, () => set(80, 8, 2)))], { startTime: '18:00' })]);
    const a = analyze(d, new Date('2026-11-18T18:00:00Z'));
    expect(muscle(a, 'chest').todayBlocked).toBe(false);
    expect(muscle(a, 'chest').todayShare).toBeGreaterThan(0);
  });
  it('failure sets and new exercises extend the window', () => {
    const base = workout('2026-11-01', [ex('lat_pulldown', [set(50, 10, 2)])]);
    const failure = workout('2026-11-16', [ex('preacher_curl', Array.from({ length: 5 }, () => set(20, 10, 0, { toFailure: true })))], { startTime: '18:00' });
    const r = estimateRecovery(data([base, failure]), reg, Date.parse('2026-11-17T18:00:00Z'), '2026-11-17');
    expect(r.biceps.windowHours).toBe(36 + 12 + 12); // base + failure + novel exercise
  });
  it('counts a workout logged today without a start time even before 18:00', () => {
    const w = workout('2026-11-18', [ex('preacher_curl', Array.from({ length: 4 }, () => set(20, 10, 1)))], { startTime: null });
    const r = estimateRecovery(data([w]), reg, Date.parse('2026-11-18T10:00:00Z'), '2026-11-18');
    expect(r.biceps.lastStimulusDate).toBe('2026-11-18');
    expect(r.biceps.status).toBe('recovering');
  });
});

describe('volume calibration', () => {
  it('tapers credit beyond ~11 effective sets per muscle in one session when the taper is set (×0.5); default ×1 counts all', () => {
    expect(taperBeyondCap(10, 2, 11, 0.5)).toBe(1.5);
    const w = workout('2026-11-16', [ex('pec_deck', Array.from({ length: 15 }, () => set(40, 12, 1)))]);
    expect(computeVolume([w], reg, { ...DEFAULT_QUALITY, beyondSessionCapCredit: 0.5 }).muscles.chest.effective).toBe(13); // 11 + 4 × 0.5
    expect(computeVolume([w], reg, DEFAULT_QUALITY).muscles.chest.effective).toBe(15); // Part 7 (owner): every set counts
  });
  it('applies the exercise-level ROM from the logger setup', () => {
    const w = workout('2026-11-16', [ex('leg_extension', [set(50, 12, 2)], null, { variation: { rom: 'partial' } })]);
    expect(computeVolume([w], reg, DEFAULT_QUALITY).muscles.quads.effective).toBe(0.8);
  });
  it('does not apply the low-rep discount to timed exercises (plank logged as 1 rep)', () => {
    const w = workout('2026-11-16', [ex('plank', [set(0, 1, 2)])]);
    expect(computeVolume([w], reg, DEFAULT_QUALITY).muscles.abs.effective).toBe(0.5);
    expect(assessSet(set(100, 3, 1), DEFAULT_QUALITY).credit).toBe(0.8);
  });
  it('counts hip abduction as half a glute set', () => {
    const w = workout('2026-11-16', [ex('hip_abduction', [set(50, 15, 2)])]);
    expect(computeVolume([w], reg, DEFAULT_QUALITY).muscles.glutes.effective).toBe(0.5);
  });
  it('uses 6 as the lower end for large muscles (Pelland 2026 efficiency tiers)', () => {
    const a = analyze(data([workout('2026-11-16', [ex('pec_deck', [set(40, 12, 1)])])]), new Date('2026-11-18T12:00:00Z'));
    expect(a.targets.chest.min).toBe(6);
    expect(a.targets.chest.preferred).toBe(12);
  });
});

describe('double progression', () => {
  const mk = (date: string, w: number, reps: number[], rir: number) => workout(date, [ex('lat_pulldown', reps.map((r) => set(w, r, rir)), 'eq_1')]);
  const perf = (ws: ReturnType<typeof mk>[]) => ws.map((w) => sessionPerf(w, w.exercises[0])!);
  it('increases after ONE session when every set hit the top with ≥ target+2 RIR (load clearly too light)', () => {
    const p = perf([mk('2026-11-01', 50, [10, 10], 2), mk('2026-11-05', 50, [12, 12, 12], 4)]);
    const next = suggestNextLoad(p, [8, 12], 2, 5, classifyTrend(p, '2026-11-06'));
    expect(next.action).toBe('increase');
    expect(next.weight).toBe(55);
  });
  it('still requires two sessions when the top was reached near the target effort', () => {
    const p = perf([mk('2026-11-01', 50, [10, 10], 2), mk('2026-11-05', 50, [12, 12, 12], 2)]);
    expect(suggestNextLoad(p, [8, 12], 2, 5, classifyTrend(p, '2026-11-06')).action).toBe('hold');
  });
  it('ignores a lighter back-off set', () => {
    const s = (date: string) => workout(date, [ex('lat_pulldown', [set(50, 12, 1), set(50, 12, 1), set(40, 15, 1)], 'eq_1')]);
    const p = perf([s('2026-11-01'), s('2026-11-05')]);
    const next = suggestNextLoad(p, [8, 12], 2, 5, classifyTrend(p, '2026-11-06'));
    expect(next.action).toBe('increase');
    expect(next.weight).toBe(55);
  });
  it('never suggests negative assistance', () => {
    const s = (date: string) => workout(date, [ex('assisted_pull_up', [set(5, 12, 1, { loadMode: 'assisted' }), set(5, 12, 1, { loadMode: 'assisted' })])]);
    const p = perf([s('2026-11-01'), s('2026-11-05')]);
    const next = suggestNextLoad(p, [6, 12], 2, 10, classifyTrend(p, '2026-11-06'), 'assisted');
    expect(next.action).toBe('increase');
    expect(next.weight).toBe(0);
  });
});

describe('periodization & reports', () => {
  it('halves targets while a deload block is active', () => {
    const d = data([workout('2026-11-16', [ex('pec_deck', [set(40, 12, 1)])])], {
      blocks: [{ id: 'b1', name: 'Deload', startDate: '2026-11-16', endDate: '2026-11-22', plannedWeeks: 1, kind: 'deload' }],
    });
    const a = analyze(d, new Date('2026-11-18T12:00:00Z'));
    expect(a.targets.chest.preferred).toBe(6);
  });
  it('auto-freezes the last finished week once, and reports without telling you to "start next week"', () => {
    const d = data([workout('2026-11-10', [ex('pec_deck', [set(40, 12, 1)])])]);
    const a = analyze(d, new Date('2026-11-18T12:00:00Z'));
    const pending = pendingSnapshot(a, d)!;
    expect(pending.range.start).toBe('2026-11-09');
    const snap = buildSnapshot(pending, a.targets, d, '2026-11-18T12:00:00Z');
    expect(snap.effective.chest).toBe(1);
    expect(pendingSnapshot(a, { ...d, snapshots: [snap] })).toBeNull();
    const rep = weeklyReport(pending, a, d);
    expect(rep.recommendations.join(' ')).not.toMatch(/start next week/i);
  });
});

describe("today's share bounds", () => {
  it('is never larger than what is left this week', () => {
    const sunday = new Date('2026-11-22T10:00:00Z');
    const d = data([workout('2026-11-16', [ex('leg_extension', Array.from({ length: 5 }, () => set(50, 12, 2))), ex('pec_deck', [set(40, 12, 2)])])]);
    const a = analyze(d, sunday);
    for (const m of a.muscles) expect(m.todayShare).toBeLessThanOrEqual(Math.max(0, m.target.preferred - m.completed) + 0.5);
  });
});

describe('export', () => {
  it('never exports planned (not performed) sets', async () => {
    const { workoutToExport } = await import('../src/domain/importer');
    const w = workout('2026-11-18', [ex('preacher_curl', [set(20, 10, 1), set(20, 10, null, { planned: true })])]);
    expect(workoutToExport(w).exercises[0].sets.length).toBe(1);
  });
});
