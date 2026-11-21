/**
 * Regression tests for defects found by the independent review of Part 4 and by the six-month
 * simulation. Each test fails on the code before the fix. Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { strengthProgress, periodStats } from '../src/domain/baseline';
import { bodyLoadSessions } from '../src/domain/bodyweight';
import { effortDistribution } from '../src/domain/effort';
import { adviceLabel, classifyTrend, progressionKey, type ProgressionSeries, type SessionPerf } from '../src/domain/progression';
import { isSecondSide } from '../src/domain/quality';
import { buildRegistry } from '../src/domain/registry';
import { summarizeSession } from '../src/domain/sessionSummary';
import { qualitySetTotal } from '../src/domain/volume';
import { defaultSettings } from '../src/domain/defaults';
import { data, data as fx, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const model = defaultSettings().quality;
const at = (d: string) => new Date(`${d}T20:00:00Z`);

describe('progress % never mixes a kg index with a reps index (dips: bodyweight, then a belt)', () => {
  it('returns no % and keeps the trend on the latest scale', () => {
    const bw = (d: string) => workout(d, [ex('dips', [set(0, 12, 1, { loadMode: 'bodyweight_plus' }), set(0, 12, 1, { loadMode: 'bodyweight_plus' })])]);
    const belt = (d: string) => workout(d, [ex('dips', [set(5, 10, 1, { loadMode: 'bodyweight_plus' }), set(5, 10, 1, { loadMode: 'bodyweight_plus' })])]);
    const ws = [bw('2026-09-01'), bw('2026-09-05'), bw('2026-09-10'), belt('2026-10-20'), belt('2026-10-24'), belt('2026-10-28')];
    const a = analyze(data(ws), at('2026-10-29'));
    const p = a.progression.find((x) => x.exerciseId === 'dips')!;
    expect(p.sessions.map((s) => s.indexKind)).toEqual(['reps', 'reps', 'reps', 'load', 'load', 'load']);
    const s = strengthProgress(p, '2026-10-29');
    expect(s.pct).toBeNull(); // was −47.7 %
    expect(p.trend.cls).not.toBe('declining'); // 13 → 6.8 is a change of scale, not a decline
  });
});

describe('assisted pull-ups: system mass = body − assistance (least assistance = hardest set)', () => {
  it('80 kg body, 30 and 25 kg assistance → 55 kg estimate, never 110', () => {
    const w = workout('2026-10-10', [ex('assisted_pull_up', [set(30, 8, 1, { loadMode: 'assisted' }), set(25, 6, 0, { loadMode: 'assisted' })])], { startTime: '18:00' });
    const body = [{ id: 'b1', date: '2026-10-10', time: '07:00', weightKg: 80, photoIds: [] }];
    const a = analyze(data([w], { body }), at('2026-10-10'));
    const p = a.progression.find((x) => x.exerciseId === 'assisted_pull_up')!;
    const [r] = bodyLoadSessions(p, [w], body, 'system');
    expect(r.externalKg).toBe(25);
    expect(r.bestReps).toBe(6);
    expect(r.estSystemKg).toBe(55);
    expect(r.assisted).toBe(true);
  });
});

describe('finish summary records only from clean benchmark sets', () => {
  it('an accidentally too-heavy set with broken technique is not a "record"', () => {
    const prev = workout('2026-10-01', [ex('pec_deck', [set(50, 12, 1)], 'pd')], { createdAt: '2026-10-01T18:00:00Z' });
    const cur = workout('2026-10-04', [ex('pec_deck', [set(60, 6, 0, { weightAccuracy: 'too_heavy', technique: 'compromised' }), set(50, 13, 1)], 'pd')], { createdAt: '2026-10-04T18:00:00Z' });
    const s = summarizeSession(cur, [prev, cur], reg, model, { date: '2026-10-04', time: '19:00' });
    expect(s.records.map((r) => r.text)).toEqual(['13 reps at 50 kg (was 12)']);
  });
});

describe('effort distribution with fractional RIR (RPE 8.5 → RIR 1.5)', () => {
  it('buckets to the nearest column instead of "3+"', () => {
    const w = workout('2026-10-05', [ex('pec_deck', [set(40, 10, 0.5), set(40, 10, 1.5), set(40, 10, 2.5), set(40, 10, 3)], 'pd')]);
    const d = effortDistribution([w], { start: '2026-10-05', end: '2026-10-11' });
    expect([d.rir0, d.rir1, d.rir2, d.rir3plus]).toEqual([1, 0, 1, 2]);
  });
});

describe('weekly "quality sets" count each set once', () => {
  it('3 bench sets at RIR 2 = 3 quality sets (not chest + front delts + triceps = 6)', () => {
    const w = workout('2026-10-05', [ex('barbell_bench_press', [set(80, 8, 2), set(80, 8, 2), set(80, 7, 2)])]);
    expect(qualitySetTotal([w], reg, model)).toBe(3);
    const lr = workout('2026-10-06', [ex('cable_lateral_raise', [set(5, 12, 1, { side: 'left' }), set(5, 12, 1, { side: 'right' }), set(5, 12, 5, { side: 'left' }), set(5, 12, 5, { side: 'right' })], 'c')]);
    expect(qualitySetTotal([lr], reg, model)).toBeCloseTo(1 + 0.3, 5); // two pairs: RIR 1 → 1, RIR 5 → 0.3
  });
});

describe('4-week rates use only days that belong to the history', () => {
  it('two weeks of training in a 4-week window → per-week rate over 2 weeks, not 4', () => {
    const ws = ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23'].map((d) => workout(d, [ex('pec_deck', [set(40, 10, 1)], 'pd')]));
    const p = periodStats(data(ws), '2026-09-28', '2026-10-25', () => ({}), { today: '2026-10-25' });
    expect(p.sessionsPerWeek).toBe(3); // 6 sessions / 2 weeks
    const q = periodStats(data(ws), '2026-10-12', '2026-11-08', () => ({}), { today: '2026-10-25' }); // window runs past today
    expect(q.sessionsPerWeek).toBe(3);
  });
});

describe('pull-ups: imported (no `loading`) and logged sessions share one history', () => {
  it('derives bodyweight / weighted from the logged load', () => {
    const def = reg.get('pull_up');
    const w = workout('2026-10-05', []);
    expect(progressionKey(ex('pull_up', [set(0, 10, 1, { loadMode: 'bodyweight_plus' })]), w, def)).toBe('pull_up::free|load=bodyweight');
    expect(progressionKey(ex('pull_up', [set(10, 6, 1, { loadMode: 'bodyweight_plus' })]), w, def)).toBe('pull_up::free|load=weighted');
    expect(progressionKey(ex('pull_up', [set(0, 10, 1, { loadMode: 'bodyweight_plus' })], null, { variation: { loading: 'bodyweight' } }), w, def)).toBe('pull_up::free|load=bodyweight');
    // Other exercises are untouched.
    expect(progressionKey(ex('dips', [set(10, 8, 1, { loadMode: 'bodyweight_plus' })]), w, reg.get('dips'))).toBe('dips::free');
  });
});

describe('advice labels on assisted machines speak in assistance', () => {
  const p = (next: number, cur: number, action: 'increase' | 'reduce' | 'hold') => ({ loadMode: 'assisted', next: { action, weight: next }, current: { topWeight: cur }, trend: { sessionsUsed: 3 } }) as unknown as ProgressionSeries;
  it('25 → 20 is "less assist", 25 → 30 is "more assist"', () => {
    expect(adviceLabel(p(20, 25, 'increase'), 'increase')).toBe('LESS ASSIST −5 → 20 KG');
    expect(adviceLabel(p(30, 25, 'reduce'), 'reduce')).toBe('MORE ASSIST → 30 KG');
    expect(adviceLabel(p(25, 25, 'hold'), 'keep')).toBe('KEEP ASSIST 25 KG');
  });
});

describe('measured rest with left/right sets', () => {
  it('only the side that completes a pair is a "second side"', () => {
    const L = (i: number) => set(5, 12, 1, { id: `L${i}`, side: 'left' });
    const R = (i: number) => set(5, 12, 1, { id: `R${i}`, side: 'right' });
    const alt = [L(1), R(1), L(2), R(2)];
    expect(alt.map((_, i) => isSecondSide(alt, i))).toEqual([false, true, false, true]); // L2 was wrongly "second side"
    const blocks = [L(1), L(2), R(1), R(2)];
    expect(blocks.map((_, i) => isSecondSide(blocks, i))).toEqual([false, false, true, true]);
  });
});

describe('trend classification guards', () => {
  const perf = (date: string, index: number): SessionPerf => ({ workoutId: date, date, sets: [], topWeight: index, topReps: 10, topRir: 1, e1rm: index, index, indexRaw: index, indexKind: 'load', representative: true, totalReps: 30, volumeLoad: 0, avgRir: 1, rirKnownRatio: 1, restAvgSec: null, fatigued: false });
  it('a slow decline over 8 weeks (−1 %/session) is "declining", not "stable"', () => {
    const xs = [50, 50, 49.5, 49, 48.5, 48, 47.5, 47, 46.5, 46, 45.5, 45].map((v, i) => perf(`2026-10-${String(1 + i * 4).padStart(2, '0')}`.replace('-10-49', '-11-18'), v));
    const days = ['2026-09-28', '2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29', '2026-11-02', '2026-11-05'];
    const s = xs.map((p, i) => ({ ...p, date: days[i], workoutId: days[i] }));
    expect(classifyTrend(s, '2026-11-06').cls).toBe('declining');
  });
  it('one bad day after steady progress is not a plateau and not a decline', () => {
    const days = ['2026-10-01', '2026-10-05', '2026-10-09', '2026-10-13', '2026-10-17', '2026-10-22'];
    const s = [60, 62, 63, 65, 66, 58].map((v, i) => perf(days[i], v));
    const t = classifyTrend(s, '2026-10-23');
    expect(t.cls).toBe('stable');
    expect(t.evidence).toMatch(/one session is not a trend/);
  });
  it('two low sessions in a row are a real decline', () => {
    const days = ['2026-10-01', '2026-10-05', '2026-10-09', '2026-10-13', '2026-10-17', '2026-10-22'];
    const s = [66, 66, 65, 65, 58, 57].map((v, i) => perf(days[i], v));
    expect(classifyTrend(s, '2026-10-23').cls).toBe('declining');
  });
});

describe('rounding is half-up on the decimal value and independent of summation order', () => {
  it('0.75 × 0.7 (unknown effort, compromised technique) = 0.53; 0.455 = 0.46 either way', async () => {
    const { round2, assessSet } = await import('../src/domain/quality');
    expect(round2(0.75 * 0.7)).toBe(0.53); // binary 0.5249999999999999 used to round to 0.52
    expect(round2(0.455)).toBe(round2(0.2 + 0.255));
    expect(assessSet(set(null, 10, null, { technique: 'compromised' }), model).credit).toBe(0.53);
    const w1 = workout('2026-10-05', [ex('incline_dumbbell_press', [set(null, null, null, { side: 'left' }), set(null, null, null, { side: 'right', technique: 'compromised' })])]);
    const w2 = workout('2026-10-05', [ex('incline_dumbbell_press', [set(20, 10, 6, { side: 'left' }), set(20, 10, 1, { side: 'right' }), set(20, 10, 4)])]);
    const { computeVolume } = await import('../src/domain/volume');
    expect(computeVolume([w1, w2], reg, model).muscles.chest.effective).toBe(computeVolume([w2, w1], reg, model).muscles.chest.effective);
  });
});

describe('weighted pull-ups: strength index uses body + belt when body weight is known', () => {
  it('5 kg × 8 → 7.5 kg × 6 at 80 kg body is ≈ −2.5 %, not "+42 %"', () => {
    const pu = (d: string, kg: number, reps: number) => workout(d, [ex('pull_up', [set(kg, reps, 1, { loadMode: 'bodyweight_plus' }), set(kg, reps, 1, { loadMode: 'bodyweight_plus' })], null, { variation: { loading: 'weighted', gripWidth: 'wide' } })], { startTime: '18:00' });
    const ws = [pu('2026-09-01', 5, 8), pu('2026-09-08', 5, 8), pu('2026-10-20', 7.5, 6), pu('2026-10-27', 7.5, 6)];
    const body = ws.map((w, i) => ({ id: `b${i}`, date: w.date, time: '07:00', weightKg: 80, photoIds: [] }));
    const a = analyze(fx(ws, { body }), at('2026-10-28'));
    const p = a.progression.find((x) => x.exerciseId === 'pull_up')!;
    expect(p.sessions.every((s) => s.indexKind === 'system')).toBe(true);
    const s = strengthProgress(p, '2026-10-28');
    // Independent: (87.5 × (1 + 7/30)) / (85 × (1 + 9/30)) − 1 = 107.917 / 110.5 − 1 = −2.34 %
    expect(s.pct).toBeCloseTo(-2.3, 1);
    // Without any body weight the belt-only index is used and kept on its own scale.
    const b = analyze(fx(ws), at('2026-10-28')).progression.find((x) => x.exerciseId === 'pull_up')!;
    expect(b.sessions.every((x) => x.indexKind === 'load')).toBe(true);
    expect(strengthProgress(b, '2026-10-28')).toMatchObject({ status: 'baseline_only', pct: null }); // no misleading %
  });
});

describe('growth signals: strength indicator reflects the broad trend', () => {
  it('12 up / 2 down is positive; 3 up / 2 down is neutral; never a growth %', async () => {
    const { hypertrophyAssessment } = await import('../src/domain/baseline');
    const mk = (pcts: number[]) => pcts.map((pct, i) => ({ key: `k${i}`, exerciseId: 'x', status: 'ok' as const, baseline: null, current: null, pct }));
    const ps = { from: '2026-10-26', to: '2026-11-22', sessions: 14, sessionsPerWeek: 3.5, weeklyEffective: {}, totalWeeklyEffective: 100, qualitySetsPerWeek: 60, bodyWeight7d: 79, waistCm: null };
    const run = (pcts: number[]) => hypertrophyAssessment({ data: data([workout('2026-05-25', [ex('pec_deck', [set(40, 10, 1)])])]), today: '2026-11-22', startDate: '2026-05-25', progress: mk(pcts), current: ps, previous: { ...ps, bodyWeight7d: 78.4 }, targetPerWeek: 110, effortKnownShare: 0.95 });
    const a = run([5, 8, 3, 12, 6, 9, 4, 7, 10, 3, 5, 6, -11, -5]);
    expect(a.indicators[0]).toMatchObject({ value: '12/14 up, 2 down', signal: 'positive' });
    expect(a.indicators[1].value).toBe('91% of targets');
    expect(a.status).toBe('consistent_positive_signals');
    expect(run([5, 8, 3, -11, -5]).indicators[0].signal).toBe('neutral');
    expect(JSON.stringify(a)).not.toMatch(/"pct"|growth/);
  });
});
