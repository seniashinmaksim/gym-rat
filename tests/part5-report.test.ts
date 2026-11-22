/**
 * Generates the E.7 readiness report (test-artifacts/part5/readiness.{json,md}) from the synthetic data-quality
 * histories: operating mode, calibration, plannable muscles, data gaps and what is still needed per history.
 * Synthetic data only; the assertions guard the headline claims made in the report.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../src/domain/analysis';
import { generateWorkout } from '../src/domain/planner';
import { readinessReport, LEVEL_LABEL, MODE_LABEL } from '../src/domain/readiness';
import { dataQualityHistory, dayAfterLast, type DqOptions } from './sim/dataQuality';

const CASES: [string, DqOptions, number?][] = [
  ['2 well-documented workouts', { sessions: 2 }],
  ['6 well-documented workouts', { sessions: 6 }],
  ['10 well-documented workouts', { sessions: 10 }],
  ['12 inconsistently logged workouts', { sessions: 12, documentation: 'poor' }],
  ['14 workouts, a new pec deck (B) in the last 2', { sessions: 14, switchPecDeckAt: 12 }],
  ['14 workouts, strength data but no recovery info', { sessions: 14, noRecoveryInfo: true }],
  ['12 workouts, irregular frequency', { sessions: 12, gaps: [1, 4, 2, 6, 3] }],
  ['16 workouts, declining performance', { sessions: 16, trend: 'down' }],
  ['16 workouts, increasing performance', { sessions: 16, trend: 'up' }],
  ['18 workouts, stalled performance', { sessions: 18, trend: 'flat' }],
  ['20 workouts, changed preference (machine press)', { sessions: 20, preferenceChangeAt: 9 }],
  ['14 workouts, then 16 days off', { sessions: 14 }, 16],
];
const rows: Record<string, unknown>[] = [];

afterAll(() => {
  const out = path.join('test-artifacts', 'part5');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'readiness.json'), JSON.stringify(rows, null, 2));
  const md = ['# Readiness per synthetic history (Part 5, E.7)', '', '| History | Mode | Well-doc / span | Calibrated regular | Coverage | Plan (items · calibrated) | Plannable muscles | Volume actions | Still needed | Data gaps |', '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.name} | ${r.mode} | ${r.wd} / ${r.span} d | ${r.calibratedFrequent} | ${r.coverage} | ${r.plan} | ${r.plannable} | ${r.volume} | ${r.next || '—'} | ${r.gaps || '—'} |`)].join('\n');
  fs.writeFileSync(path.join(out, 'readiness.md'), md);
});

describe('E.7 readiness report', () => {
  it('builds the per-history report and guards its headline claims', () => {
    for (const [name, o, days] of CASES) {
      const d = dataQualityHistory(o);
      const now = dayAfterLast(d, days ?? 3);
      const a = analyze(d, now);
      const r = readinessReport(d, a);
      const g = generateWorkout({ data: d, analysis: a, now, readiness: r });
      const acts = a.muscles.map((m) => m.target.volumeAction).filter(Boolean) as string[];
      const count = (x: string) => acts.filter((y) => y === x).length;
      rows.push({
        name, mode: MODE_LABEL[r.mode], wd: r.wellDocumented, span: r.spanDays, calibratedFrequent: r.calibratedFrequent, coverage: `${Math.round(r.coverage * 100)} %`,
        plan: `${g.items.length} · ${g.items.filter((i) => i.calibration === 'calibrated').length}${g.returning ? ` · returning ${g.returning.daysOff} d` : ''}`,
        plannable: r.plannable.length, volume: acts.length ? ['increase', 'hold', 'reduce', 'observe'].map((k) => `${k} ${count(k)}`).join(', ') : 'learning (reference)',
        next: r.next.join('; '), gaps: r.dataGaps.slice(0, 3).join('; '),
        keys: r.keys.map((k) => `${k.label}: ${LEVEL_LABEL[k.level]}`),
      });
    }
    const by = (n: string) => rows.find((r) => r.name === n)!;
    expect(by('2 well-documented workouts').mode).toBe('LEARNING');
    expect(by('6 well-documented workouts').mode).toBe('LEARNING');
    expect(by('10 well-documented workouts').mode).toBe('PROVISIONAL');
    expect(by('12 inconsistently logged workouts').mode).toBe('LEARNING');
    expect(by('14 workouts, strength data but no recovery info').mode).toBe('ADAPTIVE');
    // Improving lifts are held (never raised); only the synthetic pull-ups, whose reps never change, count as a stall.
    expect(by('16 workouts, increasing performance').volume).toMatch(/reduce 0/);
    expect(by('14 workouts, then 16 days off').volume).toMatch(/increase 0, hold 0, reduce 0, observe 17/);
  });
});
