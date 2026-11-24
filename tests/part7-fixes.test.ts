/**
 * Part 7 — further formula fixes (Epley reliability, EASY credit, plateau after a load increase, partial first week,
 * per-session note). Every expectation is computed by hand in the comment above it. All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { DEFAULT_QUALITY, migrateSettings } from '../src/domain/defaults';
import { objectiveForSets } from '../src/domain/perception';
import { assessSet } from '../src/domain/quality';
import { buildRegistry } from '../src/domain/registry';
import { computeVolume } from '../src/domain/volume';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);

describe('G.1 #2 — reps possible: the lower of Epley and Brzycki, and no decision on a long extrapolation', () => {
  // Best set 60 × 12: Epley 60 × (1 + 12/30) = 84; Brzycki reps possible at w = 37 − (37 − 12) × w / 60.
  it('45 × 15 tapped GOOD before 60 × 12: Epley 26 possible, Brzycki 37 − 25 × 0.75 = 18.25 → 3.3 in reserve → the answer stands (credit 1.0)', () => {
    const s = [set(45, 15, null, { id: 'a', effort: 'appropriate' }), set(60, 12, null, { id: 'b' })];
    const o = objectiveForSets(s).get('a');
    expect(o).toMatchObject({ kind: 'ramp', estRir: 3.3, possibleReps: 18.3 });
    expect(assessSet(s[0], DEFAULT_QUALITY, { objective: o }).credit).toBe(1);
  });
  it('unreported 50 × 10 before 60 × 12: Epley 20.4, Brzycki 37 − 25 × 50/60 = 16.17 → 6.2 in reserve → credit 0.15 (table at 6)', () => {
    const s = [set(50, 10, null, { id: 'a' }), set(60, 12, null, { id: 'b' })];
    const o = objectiveForSets(s).get('a');
    expect(o).toMatchObject({ kind: 'ramp', estRir: 6.2 });
    expect(assessSet(s[0], DEFAULT_QUALITY, { objective: o }).credit).toBe(0.15);
  });
  it('more than 20 possible: decided only when the set did ≤ half of them (30 kg: Brzycki 37 − 12.5 = 24.5 possible)', () => {
    // 30 × 10: 10 ≤ 12.25 → clearly far from failure: 24.5 − 10 = 14.5 in reserve.
    const a = [set(30, 10, null, { id: 'a' }), set(60, 12, null, { id: 'b' })];
    expect(objectiveForSets(a).get('a')).toMatchObject({ kind: 'ramp', estRir: 14.5, band: 'easy' });
    // 30 × 15: 15 > 12.25 → the extrapolation is too long to decide anything.
    const b = [set(30, 15, null, { id: 'a' }), set(60, 12, null, { id: 'b' })];
    expect(objectiveForSets(b).get('a')?.kind).toBe('none');
  });
});

describe('EASY credit (owner 2026-11-24): a range answer earns the average of the table over its range', () => {
  it('EASY (3–4 in reserve) → (1.0 + 0.6) ÷ 2 = 0.8, more than no answer (0.75); GOOD 1–3 → 1.0; very easy 5+ → 0.3', () => {
    expect(assessSet(set(40, 12, null, { effort: 'easy' }), DEFAULT_QUALITY).credit).toBe(0.8);
    expect(assessSet(set(40, 12, null), DEFAULT_QUALITY).credit).toBe(0.75);
    expect(assessSet(set(40, 12, null, { effort: 'appropriate' }), DEFAULT_QUALITY).credit).toBe(1);
    expect(assessSet(set(40, 12, null, { effort: 'very_easy' }), DEFAULT_QUALITY).credit).toBe(0.3);
  });
});

describe('plateau after a correct load increase', () => {
  // Pec deck weekly, no RIR: 50 × 10,10,9 · 11,10,10 · 12,12,12 · 12,12,12 · then 52.5 × 9,9,8 · 10,9,9.
  // Epley of the best set: 66.7, 68.3, 70, 70, 68.3, 70 → no new best in the last two → "plateau" before the fix.
  // A higher working load in the last 2 sessions is progress (double progression did its job) → not a plateau.
  const dates = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
  const reps = [[10, 10, 9], [11, 10, 10], [12, 12, 12], [12, 12, 12], [9, 9, 8], [10, 9, 9]];
  const ws = dates.map((d, i) => workout(d, [ex('pec_deck', reps[i].map((r) => set(i < 4 ? 50 : 52.5, r, null)), 'eq-pec')]));
  it('is not called a plateau', () => {
    const p = analyze(data(ws), new Date('2026-11-12T12:00:00Z')).progression.find((x) => x.exerciseId === 'pec_deck')!;
    expect(p.trend.cls).not.toBe('plateau');
  });
});

describe('G.1 #11 — the partial first week is not a full week', () => {
  // First workout on Thursday 2026-10-22 (1 session that week); then three full weeks of 3 sessions. Today Wed 2026-11-18.
  // Last 4 complete weeks: [1 (partial), 3, 3, 3] → old average 2.5; without the partial week → 3.
  const day = (d: string) => workout(d, [ex('pec_deck', times(3, () => set(40, 12, 2)))]);
  const ws = [day('2026-10-22'), ...['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'].map(day)];
  it('average sessions per week = 3', () => {
    expect(analyze(data(ws), new Date('2026-11-18T08:00:00Z')).avgSessionsPerWeek).toBe(3);
  });
});

describe('G.1 #11 — the partial first week is not a full week', () => {
  // First workout on Thursday 2026-10-22 (1 session that week); then three full weeks of 3 sessions. Today Wed 2026-11-18.
  // Last 4 complete weeks: [1 (partial), 3, 3, 3] → old average 2.5; without the partial week → 3.
  const day = (d: string) => workout(d, [ex('pec_deck', times(3, () => set(40, 12, 2)))]);
  const ws = [day('2026-10-22'), ...['2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13'].map(day)];
  it('average sessions per week = 3', () => {
    expect(analyze(data(ws), new Date('2026-11-18T08:00:00Z')).avgSessionsPerWeek).toBe(3);
  });
});

describe('G.1 #1 — per-session ceiling (owner 2026-11-24): every set counts; the ceiling is a note only', () => {
  it('16 chest sets in one session count 16 (not 11 + 5 × 0.5 = 13.5)', () => {
    const v = computeVolume([workout('2026-11-16', [ex('pec_deck', times(16, () => set(40, 12, 2)))])], reg, DEFAULT_QUALITY);
    expect(v.muscles.chest.effective).toBe(16);
  });
  it('a stored model with the old default ×0.5 is moved to ×1 once; the threshold for the note stays', () => {
    const s = migrateSettings({ quality: { ...DEFAULT_QUALITY, beyondSessionCapCredit: 0.5 } } as never);
    expect(s.quality.beyondSessionCapCredit).toBe(1);
    expect(s.quality.sessionCreditCap).toBe(11);
  });
});
