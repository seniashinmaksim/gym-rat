/**
 * Recovery is counted from when a session actually ended and moves forward with the clock.
 * All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { sessionEndVirtualMs } from '../src/domain/dates';
import { data, ex, set, workout } from './fixtures';

const at = (d: string, t: string) => Date.parse(`${d}T${t}:00Z`);

describe('when did the session end?', () => {
  const base = { date: '2026-11-20', exercises: [] as { sets: { completedAt?: string }[] }[] };
  it('prefers the moment the last set was ticked (converted to the training timezone)', () => {
    const w = { ...base, startTime: '17:00', endTime: '18:00', exercises: [{ sets: [{ completedAt: '2026-11-20T16:10:00Z' }, { completedAt: '2026-11-20T16:40:00Z' }] }] };
    expect(sessionEndVirtualMs(w, 'UTC')).toEqual({ ms: at('2026-11-20', '16:40'), source: 'last_set' });
    // 16:40 UTC is 17:40 in Berlin (winter time)
    expect(sessionEndVirtualMs(w, 'Europe/Berlin').ms).toBe(at('2026-11-20', '17:40'));
  });
  it('then the end time (also past midnight), start + duration, start time, else an assumed 18:00', () => {
    expect(sessionEndVirtualMs({ ...base, startTime: '17:00', endTime: '18:15' }, 'UTC')).toEqual({ ms: at('2026-11-20', '18:15'), source: 'end_time' });
    expect(sessionEndVirtualMs({ ...base, startTime: '23:30', endTime: '00:40' }, 'UTC').ms).toBe(at('2026-11-21', '00:40'));
    expect(sessionEndVirtualMs({ ...base, startTime: '17:00', durationMin: 75 }, 'UTC')).toEqual({ ms: at('2026-11-20', '18:15'), source: 'start_plus_duration' });
    expect(sessionEndVirtualMs({ ...base, startTime: '07:30' }, 'UTC')).toEqual({ ms: at('2026-11-20', '07:30'), source: 'start_time' });
    expect(sessionEndVirtualMs(base, 'UTC')).toEqual({ ms: at('2026-11-20', '18:00'), source: 'assumed' });
  });
  it('ignores ticks that do not belong to the workout day (e.g. the date was edited later)', () => {
    const w = { ...base, startTime: '17:00', exercises: [{ sets: [{ completedAt: '2026-11-25T10:00:00Z' }] }] };
    expect(sessionEndVirtualMs(w, 'UTC').source).toBe('start_time');
  });
});

describe('recovery refreshes with the current time', () => {
  // 10 chest sets ending 11:30 → 60 h base + 12 h (large muscle, > 9 sets) = 72 h window.
  const ws = [workout('2026-11-18', [ex('pec_deck', Array.from({ length: 10 }, () => set(45, 12, 2)))], { startTime: '10:00', endTime: '11:30' })];
  const chest = (now: string) => analyze(data(ws), new Date(now)).recovery.chest;
  it('counts from the end of the session, not its start', () => {
    const r = chest('2026-11-18T13:30:00Z');
    expect(r.hoursSince).toBe(2);
    expect(r.lastStimulusTime).toBe('11:30');
    expect(r.lastStimulusTimeSource).toBe('end_time');
    expect(r.factors[0]).toMatch(/Counted from 11:30 on 2026-11-18 \(session end time\) — 2 h ago/);
  });
  it('hours since, readiness and status move forward as time passes', () => {
    const a = chest('2026-11-19T11:30:00Z');
    const b = chest('2026-11-20T11:30:00Z');
    const c = chest('2026-11-21T12:00:00Z');
    expect([a.hoursSince, b.hoursSince, c.hoursSince]).toEqual([24, 48, 73]);
    expect(a.windowHours).toBe(72);
    expect(a.status).toBe('recovering');
    expect(a.hoursLeft).toBe(48);
    expect(b.hoursLeft).toBe(24);
    expect(c.status).toBe('likely_recovered');
    expect(a.readiness!).toBeLessThan(b.readiness!);
  });
});
