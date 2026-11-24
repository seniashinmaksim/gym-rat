/**
 * Part 7 G.1 #3 (index basis over the trend window) and #9 (weighted pull-ups: body + belt with older weigh-ins).
 * Every expectation is computed by hand in the comment above it. All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import type { BodyMeasurement } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

describe('G.1 #3 — the index basis is decided over the sessions the trend uses', () => {
  // Pec deck 50 × 10 × 3. One old session in June WITHOUT RIR, then four weekly sessions with RIR 3, 2, 1, 0 on every set.
  // Old: the June session forces reps-only for the whole history → all indices 66.7 → "plateau"/"stable".
  // New: the trend window (≤ 6 sessions in 56 days) has RIR everywhere → RIR basis: index = Epley of 10 + RIR reps
  //   → 50 × (1 + 13/30) = 71.7, 70, 68.3, 66.7 → the same output now costs more effort → declining.
  const old = workout('2026-06-01', [ex('pec_deck', [set(50, 10, null), set(50, 10, null), set(50, 10, null)], 'eq-pec')]);
  const rirs = [3, 2, 1, 0];
  const recent = ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'].map((d, i) => workout(d, [ex('pec_deck', [set(50, 10, rirs[i]), set(50, 10, rirs[i]), set(50, 10, rirs[i])], 'eq-pec')]));
  it('an old session without RIR no longer switches today\'s trend to reps-only', () => {
    const p = analyze(data([old, ...recent]), new Date('2026-11-12T12:00:00Z')).progression.find((x) => x.exerciseId === 'pec_deck')!;
    expect(p.indexBasis).toBe('rir');
    expect(p.sessions.at(-1)?.index).toBe(66.7);
    expect(p.sessions.at(-4)?.index).toBe(71.7);
    expect(p.trend.cls).toBe('declining');
  });
});

describe('G.1 #9 — weighted pull-ups keep the body + belt index when the last weigh-in is older than 7 days', () => {
  // Weekly pull-ups with a 10 kg belt, reps 8, 8, 9, 10. Weigh-ins 80 kg on 2026-10-19 and 2026-10-26 only.
  // Sessions 2026-10-20 / -27 (weigh-in ≤ 7 days old) and 2026-11-03 / -10 (8 and 15 days old, ≤ 28 → estimated).
  // Body + belt index = 90 × (1 + reps / 30): 114, 114, 117, 120 → all on one scale → progressing (not "insufficient data").
  const body: BodyMeasurement[] = [
    { id: 'b1', date: '2026-10-19', time: '08:00', condition: 'morning_fasted', weightKg: 80, photoIds: [] },
    { id: 'b2', date: '2026-10-26', time: '08:00', condition: 'morning_fasted', weightKg: 80, photoIds: [] },
  ];
  const reps = [8, 8, 9, 10];
  const ws = ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'].map((d, i) => workout(d, [ex('pull_up', [set(10, reps[i], null, { loadMode: 'bodyweight_plus' })], null, { variation: { loading: 'weighted', gripWidth: 'shoulder' } })], { startTime: '18:00' }));
  it('every session is on the body + belt scale and the trend is visible', () => {
    const p = analyze(data(ws, { body }), new Date('2026-11-12T12:00:00Z')).progression.find((x) => x.exerciseId === 'pull_up')!;
    expect(p.sessions.map((s) => s.indexKind)).toEqual(['system', 'system', 'system', 'system']);
    expect(p.sessions.map((s) => s.index)).toEqual([114, 114, 117, 120]);
    expect(p.trend.cls).toBe('progressing');
  });
});
