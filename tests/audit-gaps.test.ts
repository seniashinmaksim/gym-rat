/**
 * Gaps found by the formula dependency map (docs/FORMULA_DEPENDENCY_MAP.md §10), each checked against git history and
 * the docs before fixing — written BEFORE the fixes. Synthetic data only.
 *
 * C-1 / C-8: the Part 6 training-mode rewrite (commit 3344046) dropped the set-by-set adjustment of the remaining sets
 *   and the per-set record of what was prescribed; CLAUDE.md §H still describes both → the CODE was wrong: restored.
 * Owner 2026-11-24: a mark next to the pre-filled weight says whether the analysis adjusted it, confirmed last time's
 *   weight, or the number is only copied.
 * C-2: two order rules for a moved exercise (`placeInSession`, unused, vs the planner's sort) → one rule: the planner's.
 * C-3: Part 5 override learning compared without the Part 8 comparability checks → shared checks.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { choiceOutcomes } from '../src/domain/exerciseChoice';
import { estimatedRirRange } from '../src/domain/feedback';
import { stoppedBeforeFailureInferred } from '../src/domain/failure';
import { bodyKgForIndex, weighIns } from '../src/domain/bodyweight';
import { weeklyHistory } from '../src/domain/history';
import { applyOffer, keepOffer, logSet, nextSetsOffer, prefillNext, weightSource } from '../src/domain/liveFlow';
import { generateWorkout, targetFromPrescription } from '../src/domain/planner';
import { readinessReport } from '../src/domain/readiness';
import { buildRegistry } from '../src/domain/registry';
import type { ExerciseTarget, Workout, WorkoutExercise, WorkoutSet } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';
import { DEFAULT_QUALITY } from '../src/domain/defaults';

// The real quality model (review 2026-11-24: a wrong shape here hid the warm-up re-tagging).
const model = DEFAULT_QUALITY;
const T: ExerciseTarget = { sets: 3, weightKg: 40, reps: [{ min: 8, max: 12 }], rir: [{ min: 1, max: 2 }], engine: 'presc-1' };
const card = (sets: WorkoutSet[] = [], target: ExerciseTarget = T): WorkoutExercise => ({ ...ex('pec_deck', sets, 'pd'), target });
const NOW = Date.parse('2026-11-16T17:30:00Z');

describe('C-8 — what was prescribed is stored on every logged set (written by the app)', () => {
  it('targetFromPrescription keeps the RIR target per set', () => {
    const t = targetFromPrescription({ workingWeightKg: 40, setCount: 2, sets: [{ weightKg: 40, repsMin: 8, repsMax: 12, rirMin: 1, rirMax: 2, restSec: null }, { weightKg: 40, repsMin: 8, repsMax: 12, rirMin: 1, rirMax: 2, restSec: null }] });
    expect(t.rir).toEqual([{ min: 1, max: 2 }, { min: 1, max: 2 }]);
  });
  it('logSet writes `prescribed` from the target of that set (separate from the performed values)', () => {
    const e = logSet(card(), { weightKg: 42.5, reps: 11, loadMode: 'total' }, NOW, 's1', model);
    expect(e.sets[0].prescribed).toEqual({ weightKg: 40, repsMin: 8, repsMax: 12, rirMin: 1, rirMax: 2, kind: 'working', engine: 'presc-1' });
    expect(e.sets[0].weightKg).toBe(42.5);
  });
  it('an older target without RIR (stored before this fix) writes nothing — never an invented RIR', () => {
    const { rir: _r, ...old } = T;
    void _r;
    expect(logSet(card([], old), { weightKg: 40, reps: 10, loadMode: 'total' }, NOW, 's1', model).sets[0].prescribed).toBeUndefined();
  });
});

describe('C-1 — the remaining sets are re-checked after each set (offered, never applied silently)', () => {
  it('40 kg × 12 at RIR 4 → NO "+1 step" offer (owner 2026-11-25: a reported reserve alone is not an analysis)', () => {
    const e = card([set(40, 12, 4, { completedAt: '2026-11-16T17:20:00Z' })]);
    expect(nextSetsOffer(e, 2.5)).toBeNull();
    expect(e.target!.weightKg).toBe(40);
  });
  it('technique broke at RIR 0 → offer one step down: 37.5 kg', () => {
    const e = card([set(40, 9, 0, { technicalFailure: true, completedAt: '2026-11-16T17:20:00Z' })]);
    expect(nextSetsOffer(e, 2.5)).toMatchObject({ change: 'reduce', weightKg: 37.5 });
  });
  it('on target → no offer; no target or no step → no offer', () => {
    expect(nextSetsOffer(card([set(40, 10, 2, { completedAt: '2026-11-16T17:20:00Z' })]), 2.5)).toBeNull();
    expect(nextSetsOffer({ ...ex('pec_deck', [set(40, 12, 4)], 'pd') }, 2.5)).toBeNull();
  });
  it('Use: the target of the remaining sets changes, marked as adapted, and the next set is pre-filled with it', () => {
    const e = card([set(40, 9, 0, { technicalFailure: true, completedAt: '2026-11-16T17:20:00Z' })]);
    const o = nextSetsOffer(e, 2.5)!;
    const after = applyOffer(e, o, '2026-11-16T17:21:00Z');
    expect(after.target).toMatchObject({ weightKg: 37.5, adapted: { change: 'reduce', fromKg: 40 } });
    const last = ex('pec_deck', [set(40, 12, 2), set(40, 12, 2), set(40, 11, 2)], 'pd');
    expect(prefillNext(after, last).weightKg).toBe(37.5);
    // Already applied → not offered again for the same set.
    expect(nextSetsOffer(after, 2.5)).toBeNull();
  });
});

describe('owner 2026-11-24 — where the pre-filled weight came from', () => {
  const last = ex('pec_deck', [set(40, 12, 2), set(40, 12, 2), set(40, 11, 2)], 'pd');
  it('analysis raised it (target 42.5 vs last 40) → adjusted', () => {
    const e = card([], { ...T, weightKg: 42.5 });
    const f = prefillNext(e, last);
    expect(f.weightKg).toBe(42.5);
    expect(weightSource(e, last, f.weightKg)).toBe('adjusted');
  });
  it('analysis kept last time\'s weight → kept (checked), not a silent copy', () => {
    const e = card();
    expect(weightSource(e, last, prefillNext(e, last).weightKg)).toBe('kept');
  });
  it('no target (nothing analysed) → copied', () => {
    const e = ex('pec_deck', [], 'pd');
    expect(weightSource(e, last, prefillNext(e, last).weightKg)).toBe('copied');
  });
  it('adapted during the session → adjusted on every remaining set that uses it', () => {
    const e = applyOffer(card([set(40, 12, 4, { completedAt: '2026-11-16T17:20:00Z' })]), { change: 'add_load', weightKg: 42.5, reps: null, why: 'x' }, '2026-11-16T17:21:00Z');
    expect(weightSource(e, last, 42.5)).toBe('adjusted');
  });
  it('a weight the owner typed (neither the target nor last time) → no mark', () => {
    expect(weightSource(card(), last, 45)).toBeNull();
  });
});

// ---------------------------------------------------------------- C-2: one order rule for moved exercises
const times = <X>(n: number, mk: () => X) => Array.from({ length: n }, mk);
const pec = (n: number) => ex('pec_deck', times(n, () => set(40, 12, 2)), 'pd');
const curls = (n: number) => ex('machine_biceps_curl', times(n, () => set(30, 10, 1)), 'bc');
const pullups = (n: number) => ex('pull_up', times(n, () => set(0, 8, 2, { loadMode: 'bodyweight_plus' })), null, { variation: { loading: 'bodyweight', gripWidth: 'shoulder' } });
const rows = (n: number) => ex('seated_cable_row', times(n, () => set(50, 10, 2)), 'row');
const legs = (n: number) => ex('leg_extension', times(n, () => set(50, 12, 2)), 'le');
const day = (d: string, exs: WorkoutExercise[]) => workout(d, exs, { startTime: '17:00', endTime: '18:00' });
function tuesday(priorities: Record<string, 'high'> = {}) {
  const out: Workout[] = [];
  for (const [mon, tu, th] of [['2026-10-19', '2026-10-20', '2026-10-22'], ['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']]) {
    out.push(day(mon, [pec(4), curls(4)]), day(tu, [pullups(4), rows(3)]), day(th, [legs(3), pec(3)]));
  }
  out.push(day('2026-11-16', [pec(4)]));
  const move = { id: 'mv', exerciseId: 'machine_biceps_curl', equipmentId: 'bc', sets: 4, fromDate: '2026-11-16', date: '2026-11-17', reason: 'synthetic', createdAt: '2026-11-16T17:40:00Z' };
  const d0 = data(out);
  const d = { ...d0, settings: { ...d0.settings, plannedMoves: [move], priorities } };
  const now = new Date('2026-11-17T16:00:00Z');
  const a = analyze(d, now);
  return generateWorkout({ data: d, analysis: a, now, locationId: 'gym_a', readiness: readinessReport(d, a) }).items.map((x) => x.exerciseId);
}
describe('C-2 — where a moved exercise goes on the new day: the planner\'s order is the one rule', () => {
  it('curls moved to Tuesday come after the pull-ups (not first)', () => {
    const plan = tuesday();
    expect(plan.indexOf('machine_biceps_curl')).toBeGreaterThan(plan.indexOf('pull_up'));
  });
  it('with biceps as the owner\'s priority muscle the curls may go first', () => {
    expect(tuesday({ biceps: 'high' })[0]).toBe('machine_biceps_curl');
  });
  it('the unused second rule is gone', async () => {
    const seq = await import('../src/domain/sequence');
    expect('placeInSession' in seq).toBe(false);
  });
});

// ---------------------------------------------------------------- C-3: override learning uses the comparability checks
describe('C-3 — Part 5 override learning skips results that are not comparable (as Part 8)', () => {
  const EQ = [{ id: 'pd_a', name: 'Pec deck', locationId: 'gym_a', exerciseIds: ['pec_deck'], photoIds: [], createdAt: '' }] as never;
  // Two clean sessions first: the baseline is the median of ≥ 2 earlier sessions not themselves overridden (owner 2026-11-24).
  const dates = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
  const mk = (rirOf: (i: number) => number) => dates.map((d, i) => workout(d, [ex('pec_deck', [set(45, 12, rirOf(i)), set(45, 11, rirOf(i))], 'pd_a',
    i > 1 ? { choice: { status: 'reconsider', reasonKind: 'recovery', followed: 'continued', at: `${d}T18:00:00Z` } } : {})], { startTime: '18:00', endTime: '18:30' }));
  const now = new Date('2026-11-19T08:00:00Z');
  it('the same reserve each time → 3 comparable observations → softened (unchanged behaviour)', () => {
    const d = data(mk(() => 1), { equipment: EQ });
    expect(choiceOutcomes(d, analyze(d, now)).get('pec_deck')).toMatchObject({ observations: 3, softened: true });
  });
  it('overrides stopped with a clearly different reserve (RIR 4 vs the clean sessions’ 1) are skipped → nothing learned', () => {
    const d = data(mk((i) => (i < 2 ? 1 : 4)), { equipment: EQ });
    expect(choiceOutcomes(d, analyze(d, now)).get('pec_deck')?.observations ?? 0).toBe(0);
  });
});

// ---------------------------------------------------------------- direct tests for decisions covered only via callers
describe('direct tests (map: "covered only through callers")', () => {
  it('estimatedRirRange: EASY → 3–4, GOOD → 1–3, a logged RIR wins (null)', () => {
    expect(estimatedRirRange(set(40, 10, null, { effort: 'easy' }))).toEqual([3, 4]);
    expect(estimatedRirRange(set(40, 10, null, { effort: 'appropriate' }))).toEqual([1, 3]);
    expect(estimatedRirRange(set(40, 10, 2, { effort: 'easy' }))).toBeNull();
  });
  it('stoppedBeforeFailureInferred: RIR ≥ 1 / EASY · GOOD · HARD yes; RIR 0, failure, near max no', () => {
    expect(stoppedBeforeFailureInferred(set(40, 10, 2))).toBe(true);
    expect(stoppedBeforeFailureInferred(set(40, 10, 0))).toBe(false);
    expect(stoppedBeforeFailureInferred(set(40, 10, null, { effort: 'hard' }))).toBe(true);
    expect(stoppedBeforeFailureInferred(set(40, 10, null, { effort: 'near_max' }))).toBe(false);
    expect(stoppedBeforeFailureInferred(set(40, 10, null, { failure: 'muscular' }))).toBe(false);
  });
  it('weighIns keeps only valid weights; bodyKgForIndex uses one up to 28 days old, not older', () => {
    const body = [{ id: 'b1', date: '2026-10-20', time: '07:00', weightKg: 80, photoIds: [] }, { id: 'b2', date: '2026-11-01', time: '07:00', weightKg: null, photoIds: [] }, { id: 'b3', date: '2026-11-02', time: '07:00', weightKg: 0, photoIds: [] }];
    expect(weighIns(body).map((x) => x.kg)).toEqual([80]);
    expect(bodyKgForIndex(body, { date: '2026-11-16', startTime: '17:00' })).toBe(80); // 27 days
    expect(bodyKgForIndex(body, { date: '2026-11-18', startTime: '17:00' })).toBeNull(); // 29 days
  });
  it('weeklyHistory: a history starting on Thursday makes the first week partial', () => {
    const d = data([workout('2026-11-05', [pec(3)]), workout('2026-11-10', [pec(3)])]);
    const weeks = weeklyHistory(d, buildRegistry([], []), '2026-11-18');
    expect(weeks[0].partial).toBe(true);
    expect(weeks[1].partial).toBe(false);
  });
});

// ---------------------------------------------------------------- independent review of the gap fixes (2026-11-24)
describe('review of the gap fixes — regressions', () => {
  const last = ex('pec_deck', [set(40, 12, 2), set(40, 12, 2), set(40, 11, 2)], 'pd');
  const at = (m: number) => `2026-11-16T17:${String(m).padStart(2, '0')}:00Z`;
  it('R1 after Use, a set logged at another weight is respected: the adapted weight is not pushed again', () => {
    const e = applyOffer(card([set(40, 12, 4, { completedAt: at(20) })]), { change: 'add_load', weightKg: 42.5, reps: null, why: 'x' }, at(21));
    expect(prefillNext(e, last).weightKg).toBe(42.5);
    const typed = { ...e, sets: [...e.sets, set(40, 11, 2, { completedAt: at(24) })] };
    expect(prefillNext(typed, last).weightKg).toBe(40);
  });
  it('R2 a ramp set re-tagged as a warm-up loses its working prescription; the first real working set gets set 1\'s', () => {
    const t: ExerciseTarget = { sets: 3, weightKg: 60, reps: [{ min: 6, max: 8 }, { min: 8, max: 10 }, { min: 10, max: 12 }], rir: [{ min: 2, max: 3 }, { min: 1, max: 2 }, { min: 0, max: 1 }], engine: 'presc-1' };
    let e = logSet(card([], t), { weightKg: 40, reps: 5, loadMode: 'total' }, Date.parse(at(10)), 'a', model);
    e = logSet(e, { weightKg: 60, reps: 12, loadMode: 'total' }, Date.parse(at(14)), 'b', model);
    const a = e.sets.find((x) => x.id === 'a')!;
    const b = e.sets.find((x) => x.id === 'b')!;
    expect(a.type).toBe('warmup');
    expect(a.prescribed).toBeUndefined();
    expect(b.prescribed).toMatchObject({ repsMin: 6, repsMax: 8, rirMin: 2, rirMax: 3 });
  });
  it('R3 "too easy" alone gives no offer, also at the machine limit (owner 2026-11-25); the short-rest rule holds', () => {
    const t = { ...T, weightKg: 100 };
    const e = card([set(100, 12, 5, { completedAt: at(20) })], t);
    expect(nextSetsOffer(e, 2.5, { maxKg: 100 })).toBeNull();
    // Reps well below the range on 2 sets after a clearly short rest (40 s vs usual 120 s) → the rest, not the load: no offer.
    const short = card([set(40, 5, 2, { completedAt: at(20), restSecBefore: 120 }), set(40, 5, 2, { completedAt: at(21), restSecBefore: 40 })]);
    expect(nextSetsOffer(short, 2.5, { restMedianSec: 120 })).toBeNull();
  });
  it('R3b bodyweight pull-ups: never an offer to add a belt load', () => {
    const t = { ...T, weightKg: 0 };
    const e = { ...ex('pull_up', [set(0, 12, 5, { loadMode: 'bodyweight_plus', completedAt: at(20) })], null, { variation: { loading: 'bodyweight' } }), target: t } as WorkoutExercise;
    const o = nextSetsOffer(e, 2.5);
    expect(o?.change).not.toBe('add_load');
  });
  it('R5 Keep the plan is remembered on the exercise (survives leaving the screen) and keyed by the offer, not only the set', () => {
    const e = card([set(40, 9, 0, { technicalFailure: true, completedAt: at(20) })]);
    const o = nextSetsOffer(e, 2.5)!;
    const kept = keepOffer(e, o);
    expect(nextSetsOffer(kept, 2.5)).toBeNull();
    // Another step (another offer) on the same set → a NEW offer is shown.
    expect(nextSetsOffer(kept, 5)).toMatchObject({ change: 'reduce', weightKg: 35 });
  });
  it('R6 a target the owner edited before Start is not "smart" (no mark)', () => {
    expect(weightSource(card([], { ...T, weightKg: 50, edited: true }), last, 50)).toBeNull();
  });
  it('R7 a target exists but the shown weight is last time\'s (declined / pyramid) → copied, and the screen must not say "not analysed"', () => {
    expect(weightSource(card([], { ...T, weightKg: 42.5 }), last, 40)).toBe('copied');
  });
  it('R9 a target with RIR but no reps never crashes the offer', () => {
    expect(() => nextSetsOffer(card([set(40, 12, 4, { completedAt: at(20) })], { ...T, reps: [] }), 2.5)).not.toThrow();
  });
  it('R10 both sides of a pair store the same set\'s prescription', () => {
    let e = card([]);
    e = logSet(e, { weightKg: 40, reps: 10, loadMode: 'total', side: 'left' }, Date.parse(at(10)), 'l1', model);
    e = logSet(e, { weightKg: 40, reps: 10, loadMode: 'total', side: 'right' }, Date.parse(at(11)), 'r1', model);
    e = logSet(e, { weightKg: 40, reps: 10, loadMode: 'total', side: 'left' }, Date.parse(at(14)), 'l2', model);
    const p = (id: string) => e.sets.find((x) => x.id === id)!.prescribed;
    expect(p('r1')).toEqual(p('l1'));
    expect(p('l2')).toBeDefined();
  });
});
