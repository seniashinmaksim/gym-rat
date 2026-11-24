/**
 * Part 7 — formula revision for muscle gain. Every expectation is computed by hand in the comment above it.
 * All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { failureProfile } from '../src/domain/failure';
import { data, ex, set, workout } from './fixtures';

const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);

describe('G.1 #12 — failure share counts the sets that stopped before failure', () => {
  it('30 sets at RIR 2 + 6 failure sets → 6 / 36 ≈ 17 %, not 100 %', () => {
    const ws = [workout('2026-11-16', [
      ex('pec_deck', [...times(30, () => set(40, 12, 2)), ...times(6, () => set(40, 12, null, { failure: 'muscular' }))]),
    ])];
    const p = failureProfile({ workouts: ws }, { start: '2026-11-16', end: '2026-11-22' });
    // RIR ≥ 1 means at least one more rep was possible → "stopped before failure" (inferred).
    expect(p.totals.recorded).toBe(36);
    expect(p.totals.none).toBe(30);
    expect(p.totals.shareAtFailure).toBe(0.17); // 6 / 36 = 0.1667 → 0.17
  });
  it('a one-tap answer EASY / GOOD / HARD also means "not to failure"; MAX means failure; no answer stays unknown', () => {
    const ws = [workout('2026-11-16', [ex('pec_deck', [
      set(40, 12, null, { effort: 'easy' }), set(40, 12, null, { effort: 'appropriate' }), set(40, 12, null, { effort: 'near_max' }),
      set(40, 12, null, { effort: 'near_max', failure: 'muscular' }), set(40, 12, null),
    ])])];
    const t = failureProfile({ workouts: ws }, { start: '2026-11-16', end: '2026-11-22' }).totals;
    expect(t.recorded).toBe(4);
    expect(t.none).toBe(3);
    expect(t.muscular).toBe(1);
    expect(t.shareAtFailure).toBe(0.25);
  });
  it('RIR 0 alone is still not turned into a failure status (it may be an estimate)', () => {
    const ws = [workout('2026-11-16', [ex('pec_deck', [set(40, 12, 0)])])];
    expect(failureProfile({ workouts: ws }, { start: '2026-11-16', end: '2026-11-22' }).totals.recorded).toBe(0);
  });
});

describe('G.1 #4 — recovery uses every earlier session whose window is still open', () => {
  // Mon: 12 chest sets (pec deck, RIR 2) ending 18:00 → base 60 h (≤ 12 sets) + 12 h (large muscle, > 9 sets) = 72 h → open until Thu 18:00.
  // Tue: 3 chest sets ending 18:00 → 24 h → open until Wed 18:00.
  const ws = [
    workout('2026-11-16', [ex('pec_deck', times(12, () => set(45, 12, 2)))], { startTime: '17:00', endTime: '18:00' }),
    workout('2026-11-17', [ex('pec_deck', times(3, () => set(45, 12, 2)))], { startTime: '17:00', endTime: '18:00' }),
  ];
  it('Wed 20:00: the small Tuesday session is over, but Monday still holds the muscle (until Thu 18:00 → 22 h left)', () => {
    const r = analyze(data(ws), new Date('2026-11-18T20:00:00Z')).recovery.chest;
    expect(r.status).toBe('recovering');
    expect(r.hoursLeft).toBe(22);
    expect(r.lastStimulusDate).toBe('2026-11-16');
    expect(r.windowHours).toBe(72);
  });
  it('Thu 19:00: both windows are over → likely recovered; the latest significant session is shown', () => {
    const r = analyze(data(ws), new Date('2026-11-19T19:00:00Z')).recovery.chest;
    expect(r.status).toBe('likely_recovered');
    expect(r.lastStimulusDate).toBe('2026-11-17');
  });
  it('a window longer than four days is still found (12 sets, 2 failure sets, soreness 3: 60 + 12 + 12 + 24 = 108 h)', () => {
    const big = [workout('2026-11-16', [ex('pec_deck', [...times(10, () => set(45, 12, 2)), ...times(2, () => set(45, 12, 0))])], { startTime: '17:00', endTime: '18:00' })];
    const d = data(big, { daily: [{ id: 'd1', date: '2026-11-19', soreness: { chest: 3 } } as never] });
    // Fri 2026-11-20 18:00 = 96 h after Monday 18:00 → 12 h left.
    const r = analyze(d, new Date('2026-11-20T18:00:00Z')).recovery.chest;
    expect(r.windowHours).toBe(108);
    expect(r.hoursLeft).toBe(12);
  });
});

describe('G.1 #5 — a rep drop after a rest much shorter than usual says nothing about effort', () => {
  // Same load, no answers. Rests before sets 2–4: 150, 150, 90 s → usual (median) 150 s; 70 % = 105 s.
  // Set 3 → set 4 loses 2 reps (12 → 10) after only 90 s (< 105 s): the short rest explains the drop.
  const mk = (reps: number, rest: number | null, id: string) => set(50, reps, null, { id, restSecBefore: rest });
  it('drop after 90 s when the usual rest is 150 s → no evidence (set 3 stays provisional, not "hard")', async () => {
    const { objectiveForSets } = await import('../src/domain/perception');
    const s = [mk(12, null, 'a'), mk(12, 150, 'b'), mk(12, 150, 'c'), mk(10, 90, 'd')];
    expect(objectiveForSets(s).get('c')?.kind).toBe('none');
  });
  it('the same drop after a normal rest (150 s) still marks the earlier set as hard', async () => {
    const { objectiveForSets } = await import('../src/domain/perception');
    const s = [mk(12, null, 'a'), mk(12, 150, 'b'), mk(12, 150, 'c'), mk(10, 150, 'd')];
    expect(objectiveForSets(s).get('c')).toMatchObject({ kind: 'next_set', band: 'hard' });
  });
  it('with fewer than 3 measured rests only the 60 s floor applies (90 s after 150 s: still evidence)', async () => {
    const { objectiveForSets } = await import('../src/domain/perception');
    const s = [mk(12, null, 'a'), mk(12, 150, 'b'), mk(10, 90, 'c')];
    expect(objectiveForSets(s).get('b')).toMatchObject({ kind: 'next_set', band: 'hard' });
  });
});
