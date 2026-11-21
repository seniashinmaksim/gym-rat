/** Baseline, strength progression % and the separate hypertrophy assessment. Synthetic data only. */
import { describe, expect, it } from 'vitest';
import { hypertrophyAssessment, periodStats, strengthProgress } from '../src/domain/baseline';
import { buildProgression } from '../src/domain/progression';
import { buildRegistry } from '../src/domain/registry';
import { computeVolume } from '../src/domain/volume';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const pec = (d: string, w: number, reps: number, rir: number, eq = 'pd_a', extra = {}) => workout(d, [ex('pec_deck', [set(w, reps, rir, extra), set(w, reps, rir, extra)], eq)]);
const progOf = (ws: ReturnType<typeof pec>[], key?: string) => buildProgression(ws, reg, [], [], 2, '2026-12-20').filter((p) => !key || p.key.includes(key));
// Epley with RIR: weight × (1 + (reps + RIR) / 30)
const e1 = (w: number, r: number, rir: number) => w * (1 + (r + rir) / 30);

describe('strength progression vs baseline', () => {
  const ws = [pec('2026-10-20', 40, 10, 2), pec('2026-10-27', 40, 11, 2), pec('2026-11-30', 45, 10, 2), pec('2026-12-07', 45, 11, 2), pec('2026-12-14', 45, 12, 2)];
  it('baseline = median of the first 28 days, current = median of the last ≤ 3 sessions; % from weight + reps + RIR', () => {
    const p = strengthProgress(progOf(ws)[0], '2026-12-20');
    expect(p.status).toBe('ok');
    expect(p.baseline?.sessions).toBe(2);
    expect(p.baseline?.index).toBeCloseTo((e1(40, 10, 2) + e1(40, 11, 2)) / 2, 1);
    expect(p.current?.index).toBeCloseTo(e1(45, 11, 2), 1);
    expect(p.pct).toBeCloseTo((e1(45, 11, 2) / ((e1(40, 10, 2) + e1(40, 11, 2)) / 2) - 1) * 100, 0); // index is stored rounded to 0.1
    expect(p.baseline?.topWeight).toBe(40);
    expect(p.current?.topWeight).toBe(45);
  });
  it('a heavier load for fewer reps is not counted as progress from weight alone', () => {
    const heavier = [pec('2026-10-20', 40, 12, 2), pec('2026-10-27', 40, 12, 2), pec('2026-12-07', 45, 7, 2), pec('2026-12-14', 45, 7, 2)];
    const p = strengthProgress(progOf(heavier)[0], '2026-12-20');
    expect(p.pct).toBeLessThan(5); // weight +12.5 %, performance index roughly flat
  });
  it('different machines keep separate baselines', () => {
    const two = [...ws, pec('2026-10-21', 70, 10, 2, 'pd_b'), pec('2026-10-28', 70, 10, 2, 'pd_b')];
    const ps = progOf(two).map((s) => strengthProgress(s, '2026-12-20'));
    expect(ps.find((p) => p.key.includes('pd_b'))?.status).toBe('baseline_only');
    expect(ps.find((p) => p.key.includes('pd_a'))?.baseline?.topWeight).toBe(40);
  });
  it('a wrong-weight set never creates progress', () => {
    const wrong = [pec('2026-10-20', 40, 10, 2), pec('2026-10-27', 40, 10, 2), pec('2026-12-07', 60, 10, 2, 'pd_a', { weightAccuracy: 'too_heavy', feel: 'wrong_heavy' }), pec('2026-12-14', 40, 10, 2)];
    const p = strengthProgress(progOf(wrong)[0], '2026-12-20');
    expect(p.status).toBe('baseline_only'); // the wrong-weight session is not representative → too few recent sessions
    expect(p.pct).toBeNull();
  });
  it('insufficient data gives an honest status, never a number', () => {
    expect(strengthProgress(progOf([pec('2026-12-01', 40, 10, 2)])[0], '2026-12-20')).toMatchObject({ status: 'more_data', pct: null });
  });
});

describe('4-week periods and the hypertrophy assessment (separate from strength)', () => {
  const ws = Array.from({ length: 10 }, (_, i) => pec(`2026-${i < 5 ? '10' : '11'}-${String(5 + (i % 5) * 4).padStart(2, '0')}`, 40 + i, 10, 2));
  const d = data(ws, { body: [{ id: 'b1', date: '2026-11-25', time: '07:00', weightKg: 80, photoIds: [] }, { id: 'b2', date: '2026-12-15', time: '07:00', weightKg: 80.6, photoIds: [] }] });
  const eff = (xs: typeof ws) => Object.fromEntries(Object.entries(computeVolume(xs, reg, d.settings.quality).muscles).map(([m, v]) => [m, v.effective]));
  it('period stats come from the central volume engine', () => {
    const p = periodStats(d, '2026-11-01', '2026-11-28', eff);
    expect(p.sessions).toBe(5);
    expect(p.weeklyEffective.chest).toBeCloseTo((computeVolume(ws.filter((w) => w.date >= '2026-11-01' && w.date <= '2026-11-28'), reg, d.settings.quality).muscles.chest.effective) / 4, 1);
  });
  it('weeks 1–4: establishing baseline; 4–8: too early; never a growth percentage', () => {
    const cur = periodStats(d, '2026-11-01', '2026-11-28', eff);
    const a1 = hypertrophyAssessment({ data: d, today: '2026-10-20', startDate: '2026-10-05', progress: [], current: cur, previous: null, targetPerWeek: 100, effortKnownShare: 1 });
    expect(a1).toMatchObject({ phase: 'baseline', status: 'establishing_baseline', confidence: 'low' });
    const a2 = hypertrophyAssessment({ data: d, today: '2026-11-15', startDate: '2026-10-05', progress: [], current: cur, previous: null, targetPerWeek: 100, effortKnownShare: 1 });
    expect(a2.status).toBe('too_early');
    expect(JSON.stringify(a2)).not.toMatch(/%.*muscle|growth %/i);
  });
  it('from week 8 it combines indicators; strength up + volume + consistency → consistent positive signals', () => {
    const cur = periodStats(d, '2026-11-01', '2026-11-28', eff);
    const prog = [{ status: 'ok', pct: 6 }, { status: 'ok', pct: 4 }, { status: 'ok', pct: 3 }] as never;
    const a = hypertrophyAssessment({ data: d, today: '2026-12-20', startDate: '2026-10-05', progress: prog, current: { ...cur, sessionsPerWeek: 3, totalWeeklyEffective: 60 }, previous: null, targetPerWeek: 60, effortKnownShare: 0.9 });
    expect(a.phase).toBe('assessment');
    expect(a.status).toBe('consistent_positive_signals');
    expect(a.confidence).toBe('moderate');
    // body weight alone never decides
    expect(a.indicators.find((i) => i.id === 'body_weight')?.signal).not.toBe('positive');
  });
});
