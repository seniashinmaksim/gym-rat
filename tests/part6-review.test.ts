/**
 * Regressions from the independent review of Part 6 (step 0). Expected values are worked out by hand
 * in the comments, never copied from the code.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { lastEntryFor, logSet, prefillNext } from '../src/domain/liveFlow';
import { crossCheck, objectiveForSets, reclassifyWarmups } from '../src/domain/perception';
import { progressionKey } from '../src/domain/progression';
import { assessSet } from '../src/domain/quality';
import { buildRegistry } from '../src/domain/registry';
import type { ExerciseTarget, WorkoutSet } from '../src/domain/types';
import { ex, set, workout } from './fixtures';

const m = DEFAULT_QUALITY;
const reg = buildRegistry([], []);
const bare = (w: number | null, r: number | null, extra: Partial<WorkoutSet> = {}) => set(w, r, null, extra);
const T0 = Date.parse('2026-11-24T18:00:00Z');
const credit = (sets: WorkoutSet[], i: number) => assessSet(sets[i], m, { objective: objectiveForSets(sets).get(sets[i].id) });

describe('review 2: the pre-filled weight respects the owner\'s choice', () => {
  const top = ex('pec_deck', [bare(60, 15), bare(60, 15), bare(60, 15)], 'pd_a');
  const target: ExerciseTarget = { sets: 3, weightKg: 65, reps: [{ min: 10, max: 12 }], engine: 'presc-1' };
  it('after the owner logged last time\'s weight instead of the plan, the plan is not offered again', () => {
    let cur = ex('pec_deck', [], 'pd_a', { target });
    cur = logSet(cur, { weightKg: 60, reps: 15, loadMode: 'total' }, T0, 'a', m);
    const f = prefillNext(cur, top);
    expect(f.weightKg).toBe(60);
    expect(f.alt).toBeNull();
    expect(f.reps).toBe(15); // last time's second set at 60
    cur = logSet(cur, { weightKg: 60, reps: 15, loadMode: 'total' }, T0 + 180_000, 'b', m);
    expect(prefillNext(cur, top).weightKg).toBe(60);
  });
  it('a ramp reaches the planned load with last time\'s weight still on offer', () => {
    const ramp = ex('pec_deck', [bare(20, 10), bare(40, 5), bare(60, 15), bare(60, 15)], 'pd_a');
    let cur = ex('pec_deck', [], 'pd_a', { target });
    cur = logSet(cur, { weightKg: 20, reps: 10, loadMode: 'total' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 40, reps: 5, loadMode: 'total' }, T0 + 60_000, 'b', m);
    expect(prefillNext(cur, ramp)).toMatchObject({ weightKg: 65, from: 'plan', alt: { weightKg: 60, from: 'last' } });
  });
});

describe('review 3: the numbers check never changes an ordinary set with a logged RIR', () => {
  it('a) two sets stopped early on purpose (RIR 4, then fewer reps also at RIR 4): the report stands', () => {
    const sets = [set(60, 12, 4), set(60, 10, 4)];
    // RIR 4 → credit 0.6 by the table. The next set was not taken near its limit, so its lower reps prove nothing.
    expect(crossCheck(sets[0], objectiveForSets(sets).get(sets[0].id)).use).toBe('reported');
    expect(credit(sets, 0).credit).toBe(0.6);
  });
  it('a) the rep-drop rule still works when the next set has no easy report', () => {
    const sets = [set(60, 12, 4), bare(60, 9)];
    // Reported 4 in reserve, yet 3 reps fewer on the next set after a normal rest → it was near the limit → full credit.
    expect(credit(sets, 0).credit).toBe(1);
  });
  it('b) a moderate set before a heavier best set keeps its reported effort (80 × 8 @ RIR 2, then 100 × 5 @ RIR 1)', () => {
    const sets = [set(80, 8, 2), set(100, 5, 1)];
    // Epley: 100 × 5 → 116.67; reps possible at 80 = 30 × (116.67 / 80 − 1) = 13.75 → estimate 5.75 in reserve.
    // 80 kg is 80 % of the best set's load — not a warm-up weight; the estimate's error (± 2.5–4.4 reps) is as
    // large as the gap, so the report (RIR 2 → credit 1) is kept.
    expect(crossCheck(sets[0], objectiveForSets(sets).get(sets[0].id)).use).toBe('reported');
    expect(credit(sets, 0).credit).toBe(1);
  });
  it('b) a real warm-up rated "2 in reserve" is still corrected (40 × 5 before 60 × 12)', () => {
    const sets = [set(40, 5, 2), bare(60, 12)];
    // 60 × 12 → 84; possible at 40 = 30 × (84 / 40 − 1) = 33 → 28 in reserve; 40 kg = 67 % of 60 kg → the numbers decide → 0.
    expect(credit(sets, 0).credit).toBe(0);
  });
  it('c) left and right are judged against the best set of the SAME side', () => {
    const sets = [set(10, 8, 0, { side: 'left' }), bare(10, 15, { side: 'right' })];
    // The weaker left arm went to failure: its own best set is itself → nothing contradicts the report → credit 1.
    expect(objectiveForSets(sets).get(sets[0].id)?.kind).not.toBe('ramp');
    expect(credit(sets, 0).credit).toBe(1);
  });
});

describe('six-month replay: a reported back-off set is judged by the next set, not by the extrapolated estimate', () => {
  it('17.5 × 7, then 12.5 × 12 "easy", then 12.5 × 10 to failure: the reported set was close to its limit → credit 1', () => {
    // A back-off estimate is used only WITHOUT a report (documented rule). With a report, the next set at the same
    // weight decides: 12 → 10 reps (−2, normal rest) after an "easy" (4 in reserve) answer → a hard set → credit 1.
    const sets = [bare(17.5, 7), bare(12.5, 12, { effort: 'easy' }), bare(12.5, 10, { effort: 'near_max', failure: 'muscular' })];
    expect(credit(sets, 1).credit).toBe(1);
  });
  it('the same set without an answer keeps the back-off estimate (unchanged)', () => {
    // 17.5 × 7 → 21.58; possible at 12.5 = 30 × (21.58 / 12.5 − 1) = 21.8; − 12 − 1 (one set since the best) = 8.8 → table 0, capped.
    const sets = [bare(17.5, 7), bare(12.5, 12), bare(12.5, 10)];
    expect(objectiveForSets(sets).get(sets[1].id)).toMatchObject({ kind: 'backoff', estRir: 8.8 });
  });
});

describe('review 4: the "check effort against the numbers" switch also governs automatic warm-up tags', () => {
  it('switched off: no set is tagged, and earlier automatic tags are removed', () => {
    const off = { ...m, useNumbersCheck: false };
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 40, reps: 10, loadMode: 'total' }, T0, 'a', off);
    cur = logSet(cur, { weightKg: 60, reps: 12, loadMode: 'total' }, T0 + 120_000, 'b', off);
    expect(cur.sets.map((s) => s.type)).toEqual(['working', 'working']);
    const tagged = [{ ...bare(40, 10), type: 'warmup' as const, typeSource: 'auto' as const }, bare(60, 12)];
    const back = reclassifyWarmups(tagged, off);
    expect(back.map((s) => s.type)).toEqual(['working', 'working']);
    expect(back[0].typeSource).toBeUndefined();
  });
  it('switched on (default): 40 × 10 before 60 × 12 is a warm-up; the owner\'s own tag is never changed', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 40, reps: 10, loadMode: 'total' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 60, reps: 12, loadMode: 'total' }, T0 + 120_000, 'b', m);
    // possible at 40 = 30 × (84 / 40 − 1) = 33 → 23 in reserve → credit 0 → warm-up.
    expect(cur.sets.map((s) => s.type)).toEqual(['warmup', 'working']);
    const owner = [{ ...bare(40, 10), typeSource: 'owner' as const }, bare(60, 12)];
    expect(reclassifyWarmups(owner, m)[0].type).toBe('working');
  });
  it('a ramp set with an honest report at a working load is not tagged as a warm-up', () => {
    // 50 × 3 @ RIR 1 before 60 × 12: possible at 50 = 30 × (84 / 50 − 1) = 20.4 → 17 "in reserve" by Epley,
    // but 50 kg is 83 % of 60 kg and the owner reported 1 in reserve: the report stands, the set stays a working set.
    const sets = [set(50, 3, 1), bare(60, 12)];
    expect(reclassifyWarmups(sets, m).map((s) => s.type)).toEqual(['working', 'working']);
  });
});

describe('review 6: "last time" compares like with like', () => {
  const key = (e: ReturnType<typeof ex>, w: ReturnType<typeof workout>) => progressionKey(e, w, reg.get(e.exerciseId));
  it('another bench angle is a different history; an entry with no performed set is skipped', () => {
    const a30 = ex('incline_dumbbell_press', [bare(22.5, 12)], null, { variation: { benchAngleDeg: 30 } });
    const a45 = ex('incline_dumbbell_press', [bare(17.5, 12)], null, { variation: { benchAngleDeg: 45 } });
    const empty = ex('incline_dumbbell_press', [], null, { variation: { benchAngleDeg: 30 } });
    const planned = ex('incline_dumbbell_press', [bare(25, 10, { planned: true })], null, { variation: { benchAngleDeg: 30 } });
    const w1 = workout('2026-11-10', [a30]);
    const w2 = workout('2026-11-14', [a45]);
    const w3 = workout('2026-11-17', [empty]);
    const w4 = workout('2026-11-19', [planned]);
    const today = ex('incline_dumbbell_press', [], null, { variation: { benchAngleDeg: 30 } });
    const wNow = workout('2026-11-24', [today]);
    const got = lastEntryFor([w1, w2, w3, w4, wNow], wNow, today, key);
    expect(got?.id).toBe(a30.id);
  });
  it('a different machine is never used; later workouts are ignored', () => {
    const onA = ex('pec_deck', [bare(60, 12)], 'pd_a');
    const onB = ex('pec_deck', [bare(40, 12)], 'pd_b');
    const future = ex('pec_deck', [bare(70, 12)], 'pd_a');
    const today = ex('pec_deck', [], 'pd_a');
    const wNow = workout('2026-11-24', [today]);
    const all = [workout('2026-11-10', [onA]), workout('2026-11-20', [onB]), workout('2026-11-30', [future]), wNow];
    expect(lastEntryFor(all, wNow, today, key)?.id).toBe(onA.id);
    const first = ex('pec_deck', [], 'pd_c');
    const wC = workout('2026-11-24', [first]);
    expect(lastEntryFor([...all, wC], wC, first, key)).toBeNull();
  });
});

describe('owner request: rest is measured until NEXT SET is pressed', () => {
  it('NEXT SET pressed 2:47 after the set → the next set records 167 s of rest (not an estimate)', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 50, reps: 12, loadMode: 'total' }, T0, 'a', m);
    cur = { ...cur, restEndedAt: new Date(T0 + 167_000).toISOString() };
    // The set itself took 33 s after NEXT SET; that time is not rest.
    cur = logSet(cur, { weightKg: 50, reps: 11, loadMode: 'total' }, T0 + 200_000, 'b', m);
    expect(cur.sets[1]).toMatchObject({ restSecBefore: 167, restSource: 'timer' });
    expect(cur.restEndedAt).toBeUndefined(); // used once
  });
  it('without a NEXT SET press the estimate stays: 200 s since the set − 11 reps × 3 s = 167 s', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 50, reps: 12, loadMode: 'total' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 50, reps: 11, loadMode: 'total' }, T0 + 200_000, 'b', m);
    expect(cur.sets[1].restSecBefore).toBe(167);
  });
  it('a NEXT SET press from before the previous set is ignored', () => {
    let cur = ex('pec_deck', [], 'pd_a', { restEndedAt: new Date(T0 - 60_000).toISOString() });
    cur = logSet(cur, { weightKg: 50, reps: 12, loadMode: 'total' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 50, reps: 10, loadMode: 'total' }, T0 + 120_000, 'b', m);
    // 120 s − 10 × 3 s = 90 s (estimate), not the stale press
    expect(cur.sets[1].restSecBefore).toBe(90);
  });
});

describe('owner request: default weight step on machines is 2.5 kg', () => {
  it('a machine without a recorded step moves in 2.5 kg; a step saved on the machine still wins', async () => {
    const { loadStep } = await import('../src/domain/increments');
    expect(loadStep(null, null, 'machine')).toEqual({ step: 2.5, source: 'default' });
    expect(loadStep({ incrementsKg: [5] }, null, 'machine')).toEqual({ step: 5, source: 'equipment' });
  });
});

describe('final review fixes', () => {
  it('#1 a second LOG SET within 0.4 s is a double tap even when the next side differs (no phantom right set)', async () => {
    const { isDoubleTap } = await import('../src/domain/liveFlow');
    let cur = ex('cable_lateral_raise', [], 'cl_a');
    cur = logSet(cur, { weightKg: 5, reps: 12, loadMode: 'total', side: 'left' }, T0, 'a', m);
    expect(isDoubleTap(cur, { weightKg: 5, reps: 12, loadMode: 'total', side: 'right' }, T0 + 300)).toBe(true);
    // The right side logged a moment later (≥ 0.4 s) is a real set.
    expect(isDoubleTap(cur, { weightKg: 5, reps: 12, loadMode: 'total', side: 'right' }, T0 + 900)).toBe(false);
  });

  it('#2 with the numbers check off, sets the app had tagged as warm-ups count as working sets again', async () => {
    const { computeVolume } = await import('../src/domain/volume');
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 20, reps: 10, loadMode: 'total' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 60, reps: 12, loadMode: 'total' }, T0 + 120_000, 'b', m);
    expect(cur.sets[0]).toMatchObject({ type: 'warmup', typeSource: 'auto' });
    const w = workout('2026-11-24', [cur]);
    // Off: both sets are working sets with unknown effort → 0.75 + 0.75 = 1.5 chest.
    expect(computeVolume([w], reg, { ...m, useNumbersCheck: false }).muscles.chest.effective).toBe(1.5);
    // On (default): the warm-up counts 0, the working set 0.75.
    expect(computeVolume([w], reg, m).muscles.chest.effective).toBe(0.75);
    // An owner's own warm-up tag stays a warm-up either way.
    const owner = workout('2026-11-24', [{ ...cur, sets: cur.sets.map((s, i) => (i === 0 ? { ...s, typeSource: 'owner' as const } : s)) }]);
    expect(computeVolume([owner], reg, { ...m, useNumbersCheck: false }).muscles.chest.effective).toBe(0.75);
  });

  it('#3 logging a set on another exercise ends the "NEXT SET" mark of every other exercise', async () => {
    const { clearOtherRestEnds } = await import('../src/domain/liveFlow');
    const a = ex('pec_deck', [], 'pd_a', { restEndedAt: new Date(T0).toISOString() });
    const b = ex('lateral_raise', []);
    const w = workout('2026-11-24', [a, b]);
    const after = clearOtherRestEnds(w, b.id);
    expect(after.exercises[0].restEndedAt).toBeUndefined();
    expect(clearOtherRestEnds(w, a.id)).toBe(w); // nothing to clear → same object
  });

  it('#5 left / right: the back-off fatigue allowance counts only sets of the same side', () => {
    // Left: best 50 × 10 (Epley 66.67); at 40: possible = 30 × (66.67 / 40 − 1) = 20; − 12 − 1 (one LEFT set since the best) = 7.
    const sets = [bare(50, 10, { side: 'left' }), bare(50, 10, { side: 'right' }), bare(40, 12, { side: 'left' }), bare(40, 12, { side: 'right' })];
    const o = objectiveForSets(sets);
    expect(o.get(sets[2].id)).toMatchObject({ kind: 'backoff', estRir: 7 });
    expect(o.get(sets[3].id)).toMatchObject({ kind: 'backoff', estRir: 7 });
  });

  it('#11 a pain flag without an area survives export → import', async () => {
    const { workoutToExport, parseImportJson } = await import('../src/domain/importer');
    const w = workout('2026-11-24', [ex('pec_deck', [bare(50, 12, { pain: { area: '' }, effort: 'appropriate', feel: 'just_right' })], 'pd_a')]);
    const out = workoutToExport(w);
    const back = parseImportJson(JSON.stringify(out));
    expect(back.ok).toBe(true);
    const set0 = back.workouts[0].exercises[0].sets[0] as { pain_area?: string };
    expect(set0.pain_area).toBe(''); // the flag is in the file, area unknown
  });

  it('#12 a rest that was not ended with NEXT SET is stored as an estimate', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 50, reps: 12, loadMode: 'total' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 50, reps: 10, loadMode: 'total' }, T0 + 120_000, 'b', m);
    expect(cur.sets[1]).toMatchObject({ restSecBefore: 90, restSource: 'estimated' });
  });
});
