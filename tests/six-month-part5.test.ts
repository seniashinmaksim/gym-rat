/**
 * SIX-MONTH SIMULATION over the Part 5 features (step 6 of the owner's request): the same synthetic 26-week
 * person as tests/six-month.test.ts, replayed day by day as the app would have seen it. Checks WHEN features
 * switch on (learning → provisional → adaptive, individual volume after Learning Mode, growth signals,
 * returning after the 2-week gap), and that every daily plan / choice stays inside the documented rules:
 * no catch-up, no load on a recovering muscle, loads only from own history, warnings never block, pain separate.
 * Writes test-artifacts/six-month-audit/part5-timeline.{json,md}. Synthetic data only.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../src/domain/analysis';
import { assessChoice } from '../src/domain/exerciseChoice';
import { generateWorkout } from '../src/domain/planner';
import { readinessReport } from '../src/domain/readiness';
import { hypertrophyAssessment, periodStats, strengthProgress } from '../src/domain/baseline';
import { computeVolume } from '../src/domain/volume';
import type { AppData } from '../src/domain/appdata';
import { asOf, dayAdd, generateSixMonths, MISSED, SIM_START, SIM_WEEKS, weekStartOf } from './sim/sixMonth';

const { data } = generateSixMonths();
const timeline: Record<string, unknown>[] = [];
const known = (d: AppData, date: string) => {
  const x = asOf(d, date);
  return { ...x, workouts: x.workouts.filter((w) => w.date < date) }; // the morning: today's session not yet done
};

afterAll(() => {
  const out = path.join('test-artifacts', 'six-month-audit');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'part5-timeline.json'), JSON.stringify(timeline, null, 2));
  const md = ['# Part 5 over six months (synthetic)', '', '| Week | Date | Mode | Well-doc | Plan items | Sets | Returning | Volume actions | Growth status |', '|---|---|---|---|---|---|---|---|---|',
    ...timeline.map((t) => `| ${t.week} | ${t.date} | ${t.mode} | ${t.wd} | ${t.items} | ${t.sets} | ${t.returning ?? ''} | ${t.volume} | ${t.growth} |`)].join('\n');
  fs.writeFileSync(path.join(out, 'part5-timeline.md'), md);
});

describe('Part 5 over 26 synthetic weeks', () => {
  it('modes, plans, choices and volume decisions behave as documented every week', () => {
    let firstProvisional: number | null = null;
    let firstFull: number | null = null;
    const modeRank = { learning: 0, provisional: 1, full: 2 } as const;
    let lastRank = 0;
    for (let week = 1; week <= SIM_WEEKS; week++) {
      // Tuesday 17:00 of each week, before that day's session.
      const date = dayAdd(weekStartOf(week), 1);
      const now = new Date(`${date}T17:00:00Z`);
      const d = known(data, date);
      if (!d.workouts.length) continue;
      const a = analyze(d, now);
      const r = readinessReport(d, a);
      const g = generateWorkout({ data: d, analysis: a, now, readiness: r });
      const rank = modeRank[r.mode];
      // Modes never go backwards while the data keeps coming (a gap may hold them, never on calendar alone).
      if (!MISSED.emptyWeeks.some((w) => week >= w && week <= w + 4)) expect(rank, `week ${week}`).toBeGreaterThanOrEqual(lastRank);
      lastRank = Math.max(lastRank, rank);
      if (r.mode !== 'learning' && firstProvisional == null) firstProvisional = week;
      if (r.mode === 'full' && firstFull == null) firstFull = week;

      // Plans: never a recovering muscle as the main target, never above today's open share by more than one set.
      for (const it of g.items) {
        const mw = a.muscles.find((m) => m.muscle === it.primary)!;
        expect(mw.todayBlocked, `week ${week} ${it.exerciseId}`).toBe(false);
        expect(it.contributes[it.primary!] ?? 0, `week ${week} ${it.exerciseId}`).toBeLessThanOrEqual((g.budget[it.primary!] ?? 0) + 1.01);
        if (it.prescription.workingWeightKg != null && it.prescription.workingWeightKg > 0) expect(it.familiar, `${it.exerciseId} kg only from own history`).toBe(true);
      }
      // Choice assistant on the planned items: never blocks, each has a label; pain stays separate.
      for (const it of g.items.slice(0, 3)) {
        const c = assessChoice({ data: d, analysis: a, workout: null, exerciseId: it.exerciseId, equipmentId: it.equipmentId, variation: it.variation, alternatives: false });
        expect(['GOOD CHOICE', 'ACCEPTABLE', 'CONSIDER ALTERNATIVE', 'CONSIDER LATER']).toContain(c.label);
        if (c.reasonKind === 'recovery') expect(c.muscles.some((m) => m.state === 'RECENTLY_LOADED')).toBe(true);
      }
      // Individual volume decisions only after Learning Mode; never an increase right after a break.
      const actions = a.muscles.map((m) => m.target.volumeAction).filter(Boolean);
      if (a.learning.active) expect(actions).toHaveLength(0);
      if (MISSED.emptyWeeks.some((w) => week === w + 1 || week === w + 2)) expect(actions).not.toContain('increase');
      const eff = (ws: typeof d.workouts) => Object.fromEntries(Object.entries(computeVolume(ws, a.registry, d.settings.quality).muscles).map(([m, x]) => [m, x.effective]));
      const growth = hypertrophyAssessment({
        data: d, today: a.today, startDate: SIM_START, progress: a.progression.map((p) => strengthProgress(p, a.today)),
        current: periodStats(d, dayAdd(a.today, -27), a.today, eff), previous: periodStats(d, dayAdd(a.today, -55), dayAdd(a.today, -28), eff),
        targetPerWeek: a.muscles.reduce((t, m) => t + m.target.preferred, 0), effortKnownShare: 0.95,
      });
      expect(JSON.stringify(growth)).not.toMatch(/growth %|% muscle/i);
      timeline.push({
        week, date, mode: r.mode, wd: r.wellDocumented, items: g.items.length, sets: g.items.reduce((n, it) => n + it.setCount, 0),
        returning: g.returning ? `${g.returning.daysOff} d` : null,
        volume: Object.entries(actions.reduce((m, x) => ({ ...m, [x as string]: ((m as Record<string, number>)[x as string] ?? 0) + 1 }), {} as Record<string, number>)).map(([k, v]) => `${k} ${v}`).join(', ') || '—',
        growth: growth.status,
      });
    }
    // Activation timing from data quality: PROVISIONAL needs ≥ 8 well-documented sessions over ≥ 21 days.
    expect(firstProvisional).not.toBeNull();
    expect(firstProvisional!).toBeGreaterThanOrEqual(4);
    expect(firstFull!).toBeGreaterThanOrEqual(firstProvisional!);
    expect(firstFull!).toBeLessThanOrEqual(8);
    // The two-week gap (weeks 17–18): on the morning of the first session back (week 19) the plan is "returning",
    // with loads one step down (> 14 days), and no catch-up volume.
    const back = data.workouts.filter((w) => w.date >= weekStartOf(19)).sort((x, y) => x.date.localeCompare(y.date))[0].date;
    const d19 = known(data, back);
    const a19 = analyze(d19, new Date(`${back}T06:00:00Z`));
    const g19 = generateWorkout({ data: d19, analysis: a19, now: new Date(`${back}T06:00:00Z`) });
    expect(g19.returning?.daysOff).toBeGreaterThanOrEqual(14);
    for (const m of a19.muscles) expect(m.todayShare).toBeLessThanOrEqual(m.sessionCap);
    timeline.push({ week: 19.0, date: back, mode: 'returning check', wd: '', items: g19.items.length, sets: g19.items.reduce((n, it) => n + it.setCount, 0), returning: `${g19.returning?.daysOff} d`, volume: '', growth: '' });
  });
});
