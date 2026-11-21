/**
 * Weekly report, summary, snapshots, learning baseline, deload assessment, body reports and volume
 * trend — on the six-month simulation, checked against the independent reference where a number is shown.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { assessDeload, baselineReport, buildSnapshot, monthlyBodyReport, pendingSnapshot, volumeTrend, weeklyReport, weeklySummary, weeklyWeightAverages } from '../src/domain/reports';
import { qualitySetTotal } from '../src/domain/volume';
import type { AppData } from '../src/domain/appdata';
import { asOf, dayAdd, generateSixMonths, SIM_START, weekStartOf } from './sim/sixMonth';
import { refAddDays, refDiffDays, refEffective, refMonday } from './sim/reference';
import { data as fx, ex, set, workout } from './fixtures';

const { data } = generateSixMonths();
const sunday = (w: number) => dayAdd(weekStartOf(w), 6);
const at = (d: string, t = '20:00') => new Date(`${d}T${t}:00Z`);
const A = (date: string, d: AppData = data) => analyze(asOf(d, date), at(date));
const bucketOf = (a: ReturnType<typeof analyze>, week: number) => a.weeks.find((b) => b.range.start === weekStartOf(week))!;

describe('weekly report', () => {
  it('rows = independent reference per muscle; result follows min / preferred / max', () => {
    const a = A(sunday(15));
    const r = weeklyReport(bucketOf(a, 15), a, data);
    const ref = refEffective(data.workouts.filter((w) => w.date >= weekStartOf(15) && w.date <= sunday(15)));
    for (const row of r.rows) {
      expect(row.effective, row.muscle).toBeCloseTo(Math.round((ref[row.muscle] ?? 0) * 100) / 100, 2);
      const exp = row.effective > row.max ? 'excess' : row.effective >= row.preferred ? 'met' : row.effective < row.min ? 'short' : 'within';
      expect(row.result).toBe(exp);
    }
    expect(r.sessions).toBe(bucketOf(a, 15).workouts.length);
  });

  it('an empty week (11) says: resume normally, do not compensate', () => {
    const a = A(sunday(12));
    const r = weeklyReport(bucketOf(a, 11), a, data);
    expect(r.sessions).toBe(0);
    expect(r.recommendations.join(' ')).toMatch(/resume normally rather than compensating/);
  });

  it('poor-recovery week (24): sleep and fatigue averages are reported from the logs', () => {
    const a = A(sunday(24));
    const r = weeklyReport(bucketOf(a, 24), a, data);
    expect(r.recoveryNotes.join(' ')).toContain('Average logged sleep 5.1 h over 7 night(s).');
    expect(r.recoveryNotes.join(' ')).toMatch(/Average fatigue 4\.0\/5/);
  });

  it('summary "behind" = preferred − effective, rounded to ½ set, largest first', () => {
    const a = A(dayAdd(weekStartOf(20), 3));
    const r = weeklyReport(bucketOf(a, 20), a, data);
    const s = weeklySummary(r, a);
    for (const b of s.behind) {
      const row = r.rows.find((x) => x.muscle === b.muscle)!;
      expect(b.left).toBe(Math.round((row.preferred - row.effective) * 2) / 2);
    }
    expect(s.behind.map((b) => b.left)).toEqual([...s.behind.map((b) => b.left)].sort((x, y) => y - x));
  });

  it('switching dips from bodyweight to a belt is not reported as a decline', () => {
    const bw = (d: string) => workout(d, [ex('dips', [set(0, 12, 1, { loadMode: 'bodyweight_plus' })])]);
    const belt = (d: string) => workout(d, [ex('dips', [set(10, 8, 1, { loadMode: 'bodyweight_plus' })])]);
    const d = fx([bw('2026-10-05'), bw('2026-10-08'), bw('2026-10-12'), belt('2026-10-19')]);
    const a = analyze(d, at('2026-10-25'));
    const r = weeklyReport(a.weeks.find((b) => b.range.start === '2026-10-19')!, a, d);
    expect(r.declined).toEqual([]);
  });
});

describe('frozen weekly snapshots', () => {
  it('keep the targets of that week even when targets change later', () => {
    const a = A(sunday(10));
    const b = bucketOf(a, 10);
    const snap = buildSnapshot(b, a.targets, data, '2026-08-03T00:00:00Z');
    for (const [m, e] of Object.entries(snap.effective)) expect(e).toBe(b.volume.muscles[m as keyof typeof b.volume.muscles].effective);
    const later = A(sunday(26));
    const withSnap = { ...data, snapshots: [snap] };
    const r = weeklyReport(bucketOf(later, 10), later, withSnap);
    for (const row of r.rows) expect(row.preferred).toBe(snap.targets[row.muscle]!.preferred);
    expect(pendingSnapshot(A(dayAdd(weekStartOf(11), 2)), withSnap)).toBeNull(); // week 10 already frozen
  });
});

describe('learning baseline report (first 30 days)', () => {
  it('counts the sessions and per-week frequency of the learning window exactly', () => {
    const a = A(sunday(8));
    const r = baselineReport(asOf(data, sunday(8)), a)!;
    const end = refAddDays(SIM_START, 29);
    const n = data.workouts.filter((w) => w.date >= SIM_START && w.date <= end).length;
    expect(r.period).toEqual({ start: SIM_START, end, days: 30 });
    expect(r.frequency.sessions).toBe(n);
    expect(r.frequency.perWeek).toBeCloseTo((n / 30) * 7, 1);
    expect(r.inventory.locations).toBe(2);
  });
});

describe('deload assessment', () => {
  it('recommends a deload only when several independent signs coincide (week 24), not in a normal week (14)', () => {
    const poor = assessDeload(asOf(data, dayAdd(weekStartOf(24), 5)), A(dayAdd(weekStartOf(24), 5)));
    const on = poor.indicators.filter((i) => i.present).map((i) => i.label);
    expect(on).toEqual(expect.arrayContaining(['Elevated fatigue', 'Short sleep', 'Persistent soreness']));
    expect(poor.recommend).toBe(true);
    const normal = assessDeload(asOf(data, sunday(14)), A(sunday(14)));
    expect(normal.recommend).toBe(false);
  });
});

describe('body reports use the mean of DAILY means', () => {
  it('weekly averages match the reference (a morning + evening day counts once)', () => {
    const rows = weeklyWeightAverages(data, 1);
    const byDay = new Map<string, number[]>();
    for (const b of data.body) if (b.weightKg) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b.weightKg]);
    const byWeek = new Map<string, number[]>();
    for (const [d, xs] of byDay) byWeek.set(refMonday(d), [...(byWeek.get(refMonday(d)) ?? []), xs.reduce((a, x) => a + x, 0) / xs.length]);
    for (const r of rows) {
      const xs = byWeek.get(r.week)!;
      expect(r.avg).toBeCloseTo(Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10, 5);
      expect(r.n).toBe(xs.length);
    }
    expect(rows.length).toBe(26);
  });
  it('monthly body report: last 30 vs previous 30 days of daily means', () => {
    const today = '2026-11-22';
    const r = monthlyBodyReport(data, today);
    const byDay = new Map<string, number[]>();
    for (const b of data.body) if (b.weightKg) byDay.set(b.date, [...(byDay.get(b.date) ?? []), b.weightKg]);
    const avg = (lo: number, hi: number) => { const xs = [...byDay].filter(([d]) => refDiffDays(today, d) >= lo && refDiffDays(today, d) < hi).map(([, v]) => v.reduce((a, x) => a + x, 0) / v.length); return Math.round((xs.reduce((a, x) => a + x, 0) / xs.length) * 10) / 10; };
    const w = r.rows.find((x) => x.field === 'weightKg')!;
    expect(w.current).toBe(avg(0, 30));
    expect(w.previous).toBe(avg(30, 60));
    expect(r.notes.join(' ')).toMatch(/Neither body weight nor circumference can measure muscle mass precisely/);
  });
});

describe('volume trend (Periodization chart)', () => {
  it('bars = quality sets (≤ working sets), muscle columns = that week\'s effective sets', () => {
    const a = A(sunday(26));
    const rows = volumeTrend(a.weeks, 12, (ws) => qualitySetTotal(ws, a.registry, data.settings.quality));
    expect(rows).toHaveLength(12);
    for (const r of rows) {
      const b = a.weeks.find((w) => w.range.start.slice(5) === r.week)!;
      expect(r.total as number).toBeLessThanOrEqual(b.volume.totalWorkingSets + 1e-9);
      expect(r.chest).toBe(b.volume.muscles.chest.effective);
      expect(r.sessions).toBe(b.workouts.length);
    }
    expect(rows.find((r) => r.week === weekStartOf(17).slice(5))!.total).toBe(0); // missed week stays 0
  });
});
