import { describe, expect, it } from 'vitest';
import { effortCoverage } from '../src/domain/effort';
import { ex, set, workout } from './fixtures';

describe('effort nudge', () => {
  const r = { start: '2026-11-16', end: '2026-11-22' };
  it('nudges only when ≥ 50 % of ≥ 6 counted sets lack any effort info', () => {
    const none = Array.from({ length: 4 }, () => set(40, 10, null));
    const some = [set(40, 10, 2), set(40, 10, null, { feel: 'just_right' })];
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', [...none, ...some])])], r)).toEqual({ counted: 6, missing: 4, nudge: true });
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', [...none.slice(0, 2), ...some, set(40, 10, 1), set(40, 10, null, { failure: 'muscular' })])])], r).nudge).toBe(false);
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', none)])], r).nudge).toBe(false); // too few sets
  });
  it('ignores warm-ups, planned sets and other weeks; "not sure" is not effort info', () => {
    const ws = [workout('2026-11-17', [ex('pec_deck', [set(20, 10, null, { type: 'warmup' }), set(40, 10, null, { planned: true }), set(40, 10, null, { failure: 'uncertain' })])]), workout('2026-11-01', [ex('pec_deck', [set(40, 10, null)])])];
    expect(effortCoverage(ws, r)).toEqual({ counted: 1, missing: 1, nudge: false });
  });
});
