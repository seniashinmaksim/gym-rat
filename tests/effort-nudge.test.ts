import { describe, expect, it } from 'vitest';
import { effortCoverage } from '../src/domain/effort';
import { ex, set, workout } from './fixtures';

describe('effort nudge', () => {
  const r = { start: '2026-11-16', end: '2026-11-22' };
  it('nudges only when ≥ 50 % of ≥ 6 counted sets lack any effort info', () => {
    const none = Array.from({ length: 4 }, () => set(40, 10, null));
    // The feel answer as the logger / importer store it: with its effort dimension (a feel WITHOUT effort — pain, wrong weight — is not effort info, audit A-8).
    const some = [set(40, 10, 2), set(40, 10, null, { feel: 'just_right', effort: 'appropriate' })];
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', [...none, ...some])])], r)).toEqual({ counted: 6, missing: 4, nudge: true });
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', [...none.slice(0, 2), ...some, set(40, 10, 1), set(40, 10, null, { failure: 'muscular' })])])], r).nudge).toBe(false);
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', none)])], r).nudge).toBe(false); // too few sets
  });
  it('ignores warm-ups, planned sets and other weeks; "not sure" is not effort info', () => {
    const ws = [workout('2026-11-17', [ex('pec_deck', [set(20, 10, null, { type: 'warmup' }), set(40, 10, null, { planned: true }), set(40, 10, null, { failure: 'uncertain' })])]), workout('2026-11-01', [ex('pec_deck', [set(40, 10, null)])])];
    expect(effortCoverage(ws, r)).toEqual({ counted: 1, missing: 1, nudge: false });
  });
});

describe('weekly effort distribution', () => {
  it('buckets logged RIR, failure without RIR as 0, unknown and technique; L+R pairs count once', async () => {
    const { effortDistribution } = await import('../src/domain/effort');
    const ws = [workout('2026-11-17', [
      ex('pec_deck', [set(40, 10, 0), set(40, 10, 1), set(40, 10, 2), set(40, 10, 4), set(40, 10, null, { failure: 'muscular' }), set(40, 10, null), set(40, 10, 2, { technique: 'compromised' })]),
      ex('cable_lateral_raise', [set(5, 12, 1, { side: 'left' }), set(5, 12, 1, { side: 'right' })]),
    ]), workout('2026-11-10', [ex('pec_deck', [set(40, 10, 0)])])];
    expect(effortDistribution(ws, { start: '2026-11-16', end: '2026-11-22' })).toEqual({ rir0: 2, rir1: 2, rir2: 2, rir3plus: 1, unknown: 1, compromised: 1, avgRir: 1.7, total: 8 });
  });
});

describe('week totals', () => {
  it('counts workouts, sets (pairs once), tonnage as logged and passes effective sets through', async () => {
    const { weekTotals } = await import('../src/domain/effort');
    const ws = [workout('2026-11-17', [ex('pec_deck', [set(40, 10, 2), set(40, 8, 1), set(20, 10, null, { type: 'warmup' })])]), workout('2026-11-18', [ex('assisted_pull_up', [set(30, 8, 2, { loadMode: 'assisted' })])])];
    expect(weekTotals(ws, { start: '2026-11-16', end: '2026-11-22' }, () => 3.25)).toEqual({ workouts: 2, workingSets: 3, effective: 3.3, avgRir: 1.7, tonnageKg: 720 });
  });
});
