/** Short numeric recommendation labels (synthetic series). */
import { describe, expect, it } from 'vitest';
import { adviceLabel, type ProgressionSeries } from '../src/domain/progression';

const series = (cur: number | null, next: number | null, loadMode = 'total', sessionsUsed = 4) =>
  ({ current: cur == null ? null : { topWeight: cur }, next: { weight: next }, loadMode, trend: { sessionsUsed } } as unknown as ProgressionSeries);

describe('adviceLabel', () => {
  it('shows the step for an increase, the load to keep / reduce to, plateau sessions, or more data', () => {
    expect(adviceLabel(series(25, 27.5), 'increase')).toBe('INCREASE +2.5 KG');
    expect(adviceLabel(series(25, 25), 'keep')).toBe('KEEP 25 KG');
    expect(adviceLabel(series(25, 22.5), 'reduce')).toBe('REDUCE TO 22.5 KG');
    expect(adviceLabel(series(25, 25, 'total', 4), 'plateau')).toBe('PLATEAU — 4 SESSIONS');
    expect(adviceLabel(series(null, null), 'not_enough_data')).toBe('MORE DATA NEEDED');
    expect(adviceLabel(series(0, 0, 'bodyweight_plus'), 'keep')).toBe('KEEP BW');
  });
});
