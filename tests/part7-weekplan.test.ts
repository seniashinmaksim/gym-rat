/**
 * Part 7 G.1 #13 / #14 — today's share that fits the usual later days, and the optional extra session.
 * Every expectation is computed by hand in the comment above it. All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { fitToday, laterUsualOffsets, suggestExtraSession, usualTrainingDays, weekdayOf } from '../src/domain/weekPlan';

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5;

describe('usual training days', () => {
  it('weekdays trained in at least half of the recent weeks (≥ 3 weeks needed)', () => {
    // 2026-11-02 is a Monday. Weeks: Mon/Wed/Fri, Mon/Wed/Fri, Mon/Thu, Mon/Wed/Fri → Mon 4/4, Wed 3/4, Fri 3/4, Thu 1/4.
    const w = (...d: string[]) => ({ dates: d });
    expect(weekdayOf('2026-11-02')).toBe(MON);
    const weeks = [w('2026-10-12', '2026-10-14', '2026-10-16'), w('2026-10-19', '2026-10-21', '2026-10-23'), w('2026-10-26', '2026-10-29'), w('2026-11-02', '2026-11-04', '2026-11-06')];
    expect(usualTrainingDays(weeks)).toEqual([MON, WED, FRI]);
    expect(usualTrainingDays(weeks.slice(0, 2))).toBeNull();
  });
  it('later usual days of this week as offsets from today', () => {
    // Monday 2026-11-16, week ends Sunday 2026-11-22: Wed = +2, Fri = +4.
    expect(laterUsualOffsets('2026-11-16', '2026-11-22', [MON, WED, FRI])).toEqual([2, 4]);
    expect(laterUsualOffsets('2026-11-16', '2026-11-22', [MON, TUE, THU])).toEqual([1, 3]);
  });
});

describe('today\'s share fits the later usual days (#13)', () => {
  const chest = { cap: 7, large: true, toleranceH: 6 };
  it('Mon / Tue / Thu, 12 left: 4 today → 36 h → Tuesday held → Thursday would need 8 > 7 → 5 today (5 + 7)', () => {
    const f = fitToday({ ...chest, remaining: 12, base: 4, later: [1, 3] });
    expect(f).toEqual({ share: 5, reachable: 12, shortBy: 0, raised: true });
  });
  it('Mon / Wed / Fri, 12 left: 4 + 4 + 4 fits (48 h gaps ≥ 36 h − 6 h) → unchanged', () => {
    expect(fitToday({ ...chest, remaining: 12, base: 4, later: [2, 4] })).toEqual({ share: 4, reachable: 12, shortBy: 0, raised: false });
  });
  it('nothing fits upward: a smaller share today may — Saturday, Sunday (+1) the only later day, 10 left, cap 7', () => {
    // 5, 6 or 7 today → ≥ 36 h → Sunday (24 h < 36 − 6) held → at most 7. 4 today → 36 h → held too. 3 today → 24 h → Sunday 7 → 10.
    expect(fitToday({ ...chest, remaining: 10, base: 5, later: [1] })).toEqual({ share: 3, reachable: 10, shortBy: 0, raised: false });
  });
  it('nothing fits at all: the share that fits the most and an honest shortfall', () => {
    // 20 left, Sunday the only later day: 3 + 7 = 10 at best (any bigger share holds Sunday) → 10 short.
    expect(fitToday({ ...chest, remaining: 20, base: 7, later: [1] })).toEqual({ share: 3, reachable: 10, shortBy: 10, raised: false });
  });
});

describe('extra short session (#14)', () => {
  it('Mon / Wed / Fri with a cap of 3: the week ends 3 short; one free day fits them (gain 3 ≥ 2) — the earliest such day', () => {
    // 12 left, 3 per session: Mon 3 + Wed 3 + Fri 3 = 9 → 3 short. Tuesday (+1): 24 h after Monday's 3 sets (24 h window) → 3 more,
    // Wednesday still 24 h later → nothing lost. Total 12 → gain 3.
    const fit = { remaining: 12, cap: 3, base: 3, later: [2, 4], large: false, toleranceH: 6 };
    const f = fitToday(fit);
    expect(f.shortBy).toBe(3);
    const x = suggestExtraSession('2026-11-16', '2026-11-22', [MON, WED, FRI], [{ muscle: 'side_delts', fit, share: f.share, shortBy: f.shortBy }]);
    expect(x?.date).toBe('2026-11-17');
    expect(x?.muscles).toEqual([{ muscle: 'side_delts', sets: 3 }]);
    expect(x?.shortWithout).toBe(3);
  });
  it('no suggestion when the gain is small (1 set on one muscle, < 4 in total)', () => {
    const fit = { remaining: 10, cap: 3, base: 3, later: [2, 4], large: false, toleranceH: 6 };
    const f = fitToday(fit);
    expect(f.shortBy).toBe(1);
    expect(suggestExtraSession('2026-11-16', '2026-11-22', [MON, WED, FRI], [{ muscle: 'biceps', fit, share: f.share, shortBy: f.shortBy }])).toBeNull();
  });
  it('no suggestion when the week fits', () => {
    const fit = { remaining: 12, cap: 7, base: 4, later: [2, 4], large: true, toleranceH: 6 };
    expect(suggestExtraSession('2026-11-16', '2026-11-22', [MON, WED, FRI], [{ muscle: 'chest', fit, share: 4, shortBy: 0 }])).toBeNull();
    void THU;
  });
});
