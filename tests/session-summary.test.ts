/** End-of-workout summary — synthetic data, same engine as the dashboard. */
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/domain/registry';
import { measuredRestSec, summarizeSession } from '../src/domain/sessionSummary';
import { sessionMuscleEffective } from '../src/domain/volume';
import { data, ex, set, workout } from './fixtures';

describe('workout summary', () => {
  const d = data([]);
  const reg = buildRegistry(d.customExercises, d.exerciseOverrides);
  const q = d.settings.quality;
  const earlier = workout('2026-11-17', [ex('pec_deck', [set(40, 12, 2), set(40, 11, 2)], 'pd_a'), ex('lateral_raise', [set(10, 12, 2)])], { createdAt: '2026-11-17T18:00:00Z' });
  const today = workout('2026-11-20', [
    ex('pec_deck', [set(20, 10, null, { type: 'warmup' }), set(45, 12, 2, { restSecBefore: 120 }), set(45, 10, 0, { restSecBefore: 150, failure: 'muscular' }), set(45, 9, null, { planned: true })], 'pd_a'),
    ex('lateral_raise', [set(10, 14, 1, { restSecBefore: 90 }), set(10, 12, 0, { technicalFailure: true, technique: 'compromised' })]),
    ex('leg_extension', [set(50, 12, null, { planned: true })], null, { skipped: true }),
  ], { startTime: '18:00', createdAt: '2026-11-20T18:00:00Z' });

  const s = summarizeSession(today, [earlier, today], reg, q, { date: '2026-11-20', time: '19:05' });
  it('counts performed sets only (planned and skipped never count)', () => {
    expect(s.exercises).toBe(2);
    expect(s.skippedExercises).toBe(1);
    expect(s.workingSets).toBe(4);
    expect(s.warmupSets).toBe(1);
    expect(s.durationMin).toBe(65);
  });
  it('tonnage = Σ weight × reps of performed working sets; rest = mean of recorded rests', () => {
    expect(s.tonnageKg).toBe(45 * 12 + 45 * 10 + 10 * 14 + 10 * 12);
    expect(s.avgRestSec).toBe(Math.round((120 + 150 + 90) / 3));
  });
  it('muscle volume comes from the central engine', () => {
    const eff = sessionMuscleEffective({ ...today, exercises: today.exercises.map((e) => ({ ...e, sets: e.sets.filter((x) => !x.planned) })) }, reg, q);
    expect(s.muscles.find((m) => m.muscle === 'chest')?.effective).toBe(Math.round((eff.chest ?? 0) * 10) / 10);
    expect(s.muscles.find((m) => m.muscle === 'quads')).toBeUndefined();
  });
  it('records against earlier comparable sessions; failure / technique counts', () => {
    expect(s.records).toEqual([
      { exerciseId: 'pec_deck', kind: 'weight', text: '45 kg (was 40)' },
      { exerciseId: 'lateral_raise', kind: 'reps', text: '14 reps at 10 kg (was 12)' },
    ]);
    expect(s.muscularFailureSets).toBe(1);
    expect(s.technicalFailureSets).toBe(1);
    expect(s.compromisedSets).toBe(1);
  });
  it('a first session on a machine has no "record"', () => {
    const first = summarizeSession(earlier, [earlier], reg, q, { date: '2026-11-17', time: '19:00' });
    expect(first.records).toEqual([]);
  });
});

describe('measured rest', () => {
  it('uses the previous completed set of the same exercise minus time under load', () => {
    const prev = '2026-11-20T18:00:00.000Z';
    expect(measuredRestSec(prev, Date.parse(prev) + 150_000, 10)).toBe(120);
    expect(measuredRestSec(null, Date.now(), 10)).toBeNull();
    expect(measuredRestSec(prev, Date.parse(prev) + 20_000, 10)).toBeNull(); // shorter than the set itself
    expect(measuredRestSec(prev, Date.parse(prev) + 3_600_000, 10)).toBeNull(); // > 30 min: not rest
  });
});
