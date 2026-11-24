/**
 * Part 7 G.1 #13 / #14 through the whole analysis (Week numbers). Hand-computed; all data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { data, ex, set, workout } from './fixtures';

const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);
const chestDay = (d: string, n = 3) => workout(d, [ex('pec_deck', times(n, () => set(40, 12, 2)))], { startTime: '17:00', endTime: '18:00' });

describe('today\'s share on the Week screen follows the usual days (#13)', () => {
  // Usual days Mon / Tue / Thu over three full weeks (2026-10-26, 11-02, 11-09; weeks start Monday). Today Monday 2026-11-16, 08:00.
  // Chest (Learning Mode reference): preferred 12, nothing done this week → 12 left. Cap = min(10, max(3, round(12 × 0.6))) = 7.
  // Sessions left incl. today = round(3 × 7 / 7) = 3 → even share ceil(12 / 3) = 4.
  // 4 today → 36 h window → Tuesday (24 h, 12 h left > 6 h tolerance) held → Thursday at most 7 → 11 < 12.
  // 5 today → 36 h → Tuesday held → Thursday 7 → 12 ✓ → 5 today, raised.
  const days = ['2026-10-26', '2026-10-27', '2026-10-29', '2026-11-02', '2026-11-03', '2026-11-05', '2026-11-09', '2026-11-10', '2026-11-12'];
  it('Mon / Tue / Thu: 5 chest sets today instead of 4', () => {
    const a = analyze(data(days.map((d) => chestDay(d))), new Date('2026-11-16T08:00:00Z'));
    expect(a.usualDays).toEqual([1, 2, 4]);
    const chest = a.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.sessionCap).toBe(7);
    expect(chest.todayShare).toBe(5);
    expect(chest.shareRaised).toBe(true);
    expect(chest.todayNote).toMatch(/5 today: fewer would leave your next usual day inside the recovery window/);
  });
  it('Mon / Wed / Fri: 4 + 4 + 4 fits → the even share stays', () => {
    const mwf = ['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'];
    const a = analyze(data(mwf.map((d) => chestDay(d))), new Date('2026-11-16T08:00:00Z'));
    expect(a.usualDays).toEqual([1, 3, 5]);
    const chest = a.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.todayShare).toBe(4);
    expect(chest.shareRaised).toBe(false);
    expect(a.extraSession).toBeNull();
  });
  it('a dismissed extra-session suggestion stays away for that week only', () => {
    // History from Monday 2026-10-19 (a full first week), then Fridays: Fri in 4 of 4 weeks, Mon in 1 of 4 → usual [Fri].
    // Today Friday: 12 chest left, cap 7, no later usual day → 7 today, 5 short → a free day can take them.
    const fri = ['2026-10-19', '2026-10-23', '2026-10-30', '2026-11-06', '2026-11-13'].map((d) => chestDay(d));
    const now = new Date('2026-11-20T08:00:00Z');
    const a = analyze(data(fri), now);
    expect(a.usualDays).toEqual([5]);
    expect(a.muscles.find((m) => m.muscle === 'chest')!.carryOver).toBe(5);
    // Saturday (+1): 24 h after 7 sets (48 h window + 0) is too soon; Sunday (+2): 48 h ≥ 48 − 6 → 5 more.
    expect(a.extraSession?.date).toBe('2026-11-22');
    expect(a.extraSession?.muscles.find((x) => x.muscle === 'chest')?.sets).toBe(5);
    const d = data(fri);
    d.settings = { ...d.settings, extraSessionDismissedWeek: '2026-11-16' };
    expect(analyze(d, now).extraSession).toBeNull();
  });
});
