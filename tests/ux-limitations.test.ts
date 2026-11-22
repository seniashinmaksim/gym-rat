/**
 * Covering the two stated limitations (UX audit 2026-11-22):
 *  1. uncertain exercise → muscle mappings: plausible ranges come from the audit text, the counted value stays the
 *     library value, and weekly volume shows the spread (hand-computed expected values);
 *  2. rules of thumb (recovery windows, exercise order): checked against the owner's own data, never changed
 *     automatically; "insufficient" until there is enough data.
 */
import { describe, expect, it } from 'vitest';
import { SEED_BY_ID } from '../src/data/exercises';
import { EXERCISE_AUDIT, EXERCISE_AUDIT_BY_ID } from '../src/data/scientific-evidence/exerciseAudit';
import { MAPPING_RANGES } from '../src/data/scientific-evidence/mappingRanges';
import { analyze } from '../src/domain/analysis';
import { withCorrections } from '../src/domain/feedback';
import { buildRegistry } from '../src/domain/registry';
import { isUncertainMapping, mappingSpread, uncertainMuscles } from '../src/domain/mappingUncertainty';
import { ruleChecks, RULE_CHECK_MIN_N } from '../src/domain/ruleChecks';
import { data, ex, set, workout } from './fixtures';

const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

describe('uncertain mappings: ranges from the audit, spread in weekly volume', () => {
  it('every range belongs to an exercise the audit marked uncertain; the counted value lies inside it', () => {
    for (const [id, { range, basis }] of Object.entries(MAPPING_RANGES)) {
      expect(EXERCISE_AUDIT_BY_ID[id]?.verdict, id).toBe('uncertain');
      expect(basis.length, id).toBeGreaterThan(20);
      for (const [m, [lo, hi]] of Object.entries(range)) {
        for (const v of [lo, hi]) expect([0, 0.25, 0.5, 0.75, 1], `${id} ${m}`).toContain(v);
        expect(lo, `${id} ${m}`).toBeLessThan(hi);
        const cur = (SEED_BY_ID[id].contributions as Record<string, number>)[m] ?? 0;
        expect(cur >= lo && cur <= hi, `${id} ${m}: ${cur} in [${lo}, ${hi}]`).toBe(true);
      }
    }
  });
  it('only 3 uncertain exercises have no stated alternative (shown as uncertain, no invented range)', () => {
    const uncertain = EXERCISE_AUDIT.filter((a) => a.verdict === 'uncertain').map((a) => a.id);
    expect(uncertain.filter((id) => !MAPPING_RANGES[id]).sort()).toEqual(['bulgarian_split_squat', 'machine_dip', 'walking_lunge']);
  });
  it('dips 3 sets (RIR 2): chest 3 (2.25–3), triceps 2.25 (2.25–3), computed by hand', () => {
    const w = workout('2026-11-17', [ex('dips', [set(0, 10, 2, { loadMode: 'bodyweight_plus' }), set(0, 9, 2, { loadMode: 'bodyweight_plus' }), set(0, 8, 2, { loadMode: 'bodyweight_plus' })])]);
    const d = data([w]);
    const s = mappingSpread([w], buildRegistry([], []), d.settings.quality);
    expect(s.chest).toMatchObject({ effective: 3, low: 2.25, high: 3, exerciseIds: ['dips'] });
    expect(s.triceps).toMatchObject({ effective: 2.25, low: 2.25, high: 3 });
    expect(s.front_delts).toMatchObject({ effective: 1.5, low: 1.5, high: 1.5, exerciseIds: [] }); // no range stated
  });
  it('deadlift erectors 0.25 → up to 0.5; pec deck (verified) has no spread', () => {
    const w = workout('2026-11-17', [ex('deadlift', [set(140, 5, 2), set(140, 5, 2)]), ex('pec_deck', [set(45, 12, 1), set(45, 11, 1)], 'pd_a')]);
    const s = mappingSpread([w], buildRegistry([], []), data([w]).settings.quality);
    expect(s.spinal_erectors).toMatchObject({ effective: 0.5, low: 0.5, high: 1 });
    expect(s.chest).toMatchObject({ effective: 2, low: 2, high: 2, exerciseIds: [] });
  });
  it("an owner's override is the owner's decision: no range any more", () => {
    const ov = [{ id: 'dips', contributions: { chest: 1, triceps: 1, front_delts: 0.5 }, updatedAt: '' }];
    expect(isUncertainMapping('dips', ov)).toBe(false);
    expect(uncertainMuscles('dips', ov)).toEqual({});
    const w = workout('2026-11-17', [ex('dips', [set(0, 10, 2, { loadMode: 'bodyweight_plus' })])]);
    const s = mappingSpread([w], buildRegistry([], ov), data([w]).settings.quality, ov);
    expect(s.triceps).toMatchObject({ effective: 1, low: 1, high: 1, exerciseIds: [] });
  });
  it('planned (unticked) sets never create a spread', () => {
    const w = workout('2026-11-17', [ex('dips', [set(0, 10, 2, { planned: true })])]);
    const s = mappingSpread([w], buildRegistry([], []), data([w]).settings.quality);
    expect(s.triceps).toMatchObject({ effective: 0, low: 0, high: 0, exerciseIds: [] });
  });
});

describe('rules of thumb vs the owner\'s own data', () => {
  /** Pec deck only (3 sets → 24 h window). Every second session comes 1 day after the previous one (inside the window). */
  function history(insideReps: number, freshReps: number, n = 22) {
    const ws = [];
    let date = '2026-08-03';
    for (let k = 0; k < n; k++) {
      if (k) date = add(date, k % 2 ? 1 : 3);
      const inside = k % 2 === 1;
      const r = inside ? insideReps : freshReps;
      ws.push(workout(date, [ex('pec_deck', [set(45, r, 1), set(45, r - 1, 1), set(45, r - 2, 1)], 'pd_a')], { startTime: '18:00', endTime: '19:00', locationId: 'gym_a' }));
    }
    return ws;
  }
  const run = (ws: ReturnType<typeof history>) => {
    const d = data(ws);
    const last = ws[ws.length - 1].date;
    const a = analyze(d, new Date(`${add(last, 2)}T12:00:00Z`));
    return ruleChecks(d, a.registry, a.progression);
  };
  it('lower performance inside the window → "supports"; order never varied → "insufficient"', () => {
    const [rec, ord] = run(history(10, 12));
    expect(rec.verdict).toBe('supports');
    expect(rec.affected.n).toBeGreaterThanOrEqual(RULE_CHECK_MIN_N);
    expect(rec.fresh.n).toBeGreaterThanOrEqual(RULE_CHECK_MIN_N);
    expect(rec.diffPct!).toBeGreaterThan(2);
    expect(ord.verdict).toBe('insufficient');
  });
  it('same performance either way → "no clear difference"', () => {
    expect(run(history(12, 12))[0].verdict).toBe('no_clear_difference');
  });
  it('better inside the window → "contradicts" (shown, never applied automatically)', () => {
    expect(run(history(12, 10))[0].verdict).toBe('contradicts');
  });
  it('few sessions → "insufficient" with the counts', () => {
    const [rec] = run(history(10, 12, 6));
    expect(rec.verdict).toBe('insufficient');
    expect(rec.text).toMatch(/Not enough comparable sessions yet/);
  });
  it('order: a lift after a pre-loading exercise for the same muscle vs done first', () => {
    const ws = [];
    let date = '2026-08-03';
    for (let k = 0; k < 24; k++) {
      if (k) date = add(date, 3);
      const after = k % 2 === 1;
      const pec = ex('pec_deck', [set(45, after ? 10 : 12, 1), set(45, after ? 9 : 11, 1)], 'pd_a');
      const press = ex('machine_chest_press', [set(60, 10, 1), set(60, 9, 1)], 'mcp_a');
      ws.push(workout(date, after ? [press, pec] : [pec, press], { startTime: '18:00', endTime: '19:00' }));
    }
    const [, ord] = run(ws as ReturnType<typeof history>);
    expect(ord.verdict).toBe('supports');
  });
});

describe('review fixes', () => {
  it('order check uses the order exercises were performed (tick times), not the card order', () => {
    const ws = [];
    let date = '2026-08-03';
    for (let k = 0; k < 24; k++) {
      if (k) date = add(date, 3);
      const after = k % 2 === 1;
      const t0 = Date.parse(`${date}T18:00:00Z`);
      const at = (min: number) => new Date(t0 + min * 60000).toISOString();
      // Cards always listed pec deck first; on "after" days the press was actually done first.
      const pec = ex('pec_deck', [set(45, after ? 10 : 12, 1, { completedAt: at(after ? 30 : 2) }), set(45, after ? 9 : 11, 1, { completedAt: at(after ? 33 : 5) })], 'pd_a');
      const press = ex('machine_chest_press', [set(60, 10, 1, { completedAt: at(after ? 2 : 30) }), set(60, 9, 1, { completedAt: at(after ? 5 : 33) })], 'mcp_a');
      ws.push(workout(date, [pec, press], { startTime: '18:00', endTime: '19:00' }));
    }
    const d = data(ws);
    const a = analyze(d, new Date(`${add(date, 2)}T12:00:00Z`));
    const [, ord] = ruleChecks(d, a.registry, a.progression);
    expect(ord.verdict).toBe('supports');
  });
  it('sessions with no significant session in the past 7 days count as "after the window"', () => {
    const ws = [];
    let date = '2026-06-01';
    for (let k = 0; k < 10; k++) { if (k) date = add(date, 9); ws.push(workout(date, [ex('pec_deck', [set(45, 12, 1), set(45, 11, 1), set(45, 10, 1)], 'pd_a')], { startTime: '18:00', endTime: '19:00' })); }
    const d = data(ws);
    const a = analyze(d, new Date(`${add(date, 2)}T12:00:00Z`));
    const [rec] = ruleChecks(d, a.registry, a.progression);
    expect(rec.fresh.n).toBeGreaterThan(0);
    expect(rec.affected.n).toBe(0);
  });
  it('changing the exercise of a finished workout is recorded in the audit trail', () => {
    const orig = workout('2026-11-17', [ex('lateral_raise', [set(10, 15, 1)])], { finishedAt: '2026-11-17T19:00:00Z' });
    const cur = { ...orig, exercises: [{ ...orig.exercises[0], exerciseId: 'cable_lateral_raise' }] };
    const out = withCorrections(orig, cur, '2026-11-18T08:00:00Z');
    expect(out.audit?.map((x) => x.note)).toEqual(['Exercise corrected: lateral_raise → cable_lateral_raise (1 set)']);
  });
});
