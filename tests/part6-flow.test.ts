/**
 * Part 6 — log-after-the-set flow, weights, warm-ups by the numbers, rest timer (F.2–F.5).
 * Expected values are computed by hand in the comments; all numbers are synthetic.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import {
  adjustRest, clockStartMs, editSet, effortTapOf, effortTapPatch, exerciseProgress, isDoubleTap, logSet, prefillNext, restState, restTargetFor, setDelta, toggleWarmup,
} from '../src/domain/liveFlow';
import { creditForRir, crossCheck, objectiveForSets, perceptionBias, reclassifyWarmups, reportedRir } from '../src/domain/perception';
import { assessSet } from '../src/domain/quality';
import { buildRegistry } from '../src/domain/registry';
import type { ExerciseTarget, WorkoutSet } from '../src/domain/types';
import { computeVolume, qualitySetTotal } from '../src/domain/volume';
import { MAX_WEIGHT_KG, normalizeWeight, STEP_CHOICES, stepFrom, validWeight, withChosenStep } from '../src/domain/weights';
import { parseDecimal, ruPlural } from '../src/i18n/core';
import { ex, set, workout } from './fixtures';

const m = DEFAULT_QUALITY;
const reg = buildRegistry([], []);
const bare = (w: number | null, r: number | null, extra: Partial<WorkoutSet> = {}) => set(w, r, null, extra);
const T0 = Date.parse('2026-11-23T18:00:00Z');
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();

describe('F.3 weights: every weight can be entered', () => {
  it('every k × 0.25 kg from 0 to 300 is accepted exactly as typed', () => {
    for (let k = 0; k <= 1200; k++) {
      const v = k * 0.25;
      expect(validWeight(v), String(v)).toBe(true);
      expect(normalizeWeight(v), String(v)).toBe(v);
      // Typed with a dot or with a comma (Russian keypad).
      expect(parseDecimal(String(v))).toBe(v);
      expect(parseDecimal(String(v).replace('.', ','))).toBe(v);
    }
    expect(parseDecimal('41,25')).toBe(41.25);
    expect(parseDecimal('7.5')).toBe(7.5);
    expect(parseDecimal('22,5 ')).toBe(22.5);
  });
  it('rejects what is not a weight; never rounds a typed value', () => {
    for (const bad of ['', 'abc', '1.2.3', '-', '.', '12kg']) expect(parseDecimal(bad), bad).toBeNull();
    expect(normalizeWeight(-1)).toBeNull();
    expect(normalizeWeight(MAX_WEIGHT_KG + 1)).toBeNull();
    expect(normalizeWeight(null)).toBeNull();
    expect(normalizeWeight(61.3)).toBe(61.3); // off every grid: kept
  });
  it('the stepper reaches every multiple of each offered step', () => {
    for (const step of STEP_CHOICES) {
      let v: number | null = 0;
      for (let k = 1; k <= 300 / step; k++) {
        v = stepFrom(v, step, 1);
        expect(v, `${step} × ${k}`).toBeCloseTo(k * step, 6);
      }
      for (let k = Math.round(300 / step) - 1; k >= 0; k--) {
        v = stepFrom(v, step, -1);
        expect(v, `${step} × ${k} down`).toBeCloseTo(k * step, 6);
      }
      expect(stepFrom(0, step, -1)).toBe(0);
    }
  });
  it('stepping from an off-grid value goes to the next real step', () => {
    expect(stepFrom(40, 2.5, 1)).toBe(42.5);
    expect(stepFrom(42.5, 2.5, 1)).toBe(45);
    expect(stepFrom(41, 2.5, 1)).toBe(42.5);
    expect(stepFrom(41, 2.5, -1)).toBe(40);
    expect(stepFrom(27, 2, 1)).toBe(28);
    expect(stepFrom(null, 5, 1)).toBe(5);
    expect(stepFrom(22.5, 5, 1)).toBe(25);
    expect(stepFrom(22.5, 5, -1)).toBe(20);
  });
  it('a chosen step is remembered first; larger known steps are kept', () => {
    expect(withChosenStep([5], 2.5)).toEqual([2.5, 5]);
    expect(withChosenStep([1.25, 2.5], 2.5)).toEqual([2.5]);
    expect(withChosenStep(undefined, 0.5)).toEqual([0.5]);
  });
  it('Russian plural forms', () => {
    const f = (n: number) => ruPlural(n, 'подход', 'подхода', 'подходов');
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(f)).toEqual(['подход', 'подхода', 'подхода', 'подходов', 'подходов', 'подходов', 'подходов', 'подход', 'подхода', 'подходов', 'подход', 'подходов']);
    expect(f(1.5)).toBe('подхода');
  });
});

describe('F.4 what the numbers say about each set', () => {
  it('classic ramp 20×10, 40×5, 60×12: both light sets are far from failure', () => {
    // Best set 60×12. Part 7: reps possible = the lower of Epley (60 × 1.4 = 84 → 30 × (84/w − 1)) and Brzycki
    // (37 − 25 × w/60). At 20 kg: Epley 96, Brzycki 28.67 → 28.67 (> 20, but 10 ≤ half of it) → 18.7 in reserve.
    // At 40 kg: Epley 33, Brzycki 20.33 → 20.33 (> 20; 5 ≤ 10.2) → 15.3 in reserve.
    const s = [bare(20, 10), bare(40, 5), bare(60, 12)];
    const o = objectiveForSets(s);
    expect(o.get(s[0].id)).toMatchObject({ kind: 'ramp', estRir: 18.7, band: 'easy' });
    expect(o.get(s[1].id)).toMatchObject({ kind: 'ramp', estRir: 15.3, band: 'easy', possibleReps: 20.3 });
    expect(o.get(s[2].id)).toMatchObject({ kind: 'none' });
    expect(creditForRir(15.3, m)).toBe(0);
  });
  it('a heavy last ramp set 55×11 before 60×12 is a working set (Part 7: Brzycki 3.1 in reserve; Epley alone said 4.8)', () => {
    // Epley 30 × (84/55 − 1) = 15.82; Brzycki 37 − 25 × 55/60 = 14.08 → 14.1 possible → 3.1 in reserve → table index 3 → 1.0.
    const s = [bare(55, 11), bare(60, 12)];
    const o = objectiveForSets(s).get(s[0].id)!;
    expect(o).toMatchObject({ kind: 'ramp', estRir: 3.1, possibleReps: 14.1 });
    expect(creditForRir(o.estRir!, m)).toBe(1);
  });
  it('same load: reps that collapse on the next set mark the earlier set as hard; reps that hold mean reserve', () => {
    const s = [bare(60, 12), bare(60, 10), bare(60, 9)];
    const o = objectiveForSets(s);
    expect(o.get(s[0].id)).toMatchObject({ kind: 'next_set', band: 'hard' }); // 12 → 10
    expect(o.get(s[1].id)).toMatchObject({ kind: 'none' }); // 10 → 9: nothing clear
    expect(o.get(s[2].id)).toMatchObject({ kind: 'none' });
    const flat = [bare(60, 12), bare(60, 12)];
    expect(objectiveForSets(flat).get(flat[0].id)).toMatchObject({ band: 'reserve' });
  });
  it('a rep drop after a very short rest says nothing about effort', () => {
    const s = [bare(60, 12), bare(60, 9, { restSecBefore: 30 })];
    expect(objectiveForSets(s).get(s[0].id)).toMatchObject({ kind: 'none' });
  });
  it('a clearly lighter set after the best set is a back-off set (less certain: one rep of fatigue per earlier set)', () => {
    // 60×12. At 30 kg (50 %): Epley 54, Brzycki 37 − 12.5 = 24.5 → 24.5 possible (> 20). 30 × 10: 10 ≤ 12.25 →
    // 24.5 − 10 − 1 = 13.5 in reserve. 30 × 20: 20 > 12.25 → too long an extrapolation → nothing decided (Part 7).
    const s = [bare(60, 12), bare(30, 10)];
    expect(objectiveForSets(s).get(s[1].id)).toMatchObject({ kind: 'backoff', estRir: 13.5, band: 'easy' });
    const far = [bare(60, 12), bare(30, 20)];
    expect(objectiveForSets(far).get(far[1].id)?.kind).toBe('none');
    // At 50 kg (83 % of the best load) no estimate is made from the best set (owner's decision 2026-11-24).
    const h = [bare(60, 12), bare(50, 12)];
    expect(objectiveForSets(h).get(h[1].id)?.kind).toBe('none');
  });
  it('bodyweight, belt-only and assisted loads get no load-based estimate', () => {
    const bw = [bare(0, 12, { loadMode: 'bodyweight_plus' }), bare(10, 8, { loadMode: 'bodyweight_plus' })];
    expect(objectiveForSets(bw).get(bw[0].id)!.kind).toBe('none');
    const as = [bare(40, 8, { loadMode: 'assisted' }), bare(20, 8, { loadMode: 'assisted' })];
    expect(objectiveForSets(as).get(as[0].id)!.kind).toBe('none');
  });
  it('reported effort as one number (conservative end)', () => {
    expect(reportedRir(set(60, 10, 2))).toBe(2);
    expect(reportedRir(bare(60, 10, { failure: 'muscular' }))).toBe(0);
    expect(reportedRir(bare(60, 10, { effort: 'appropriate' }))).toBe(3);
    expect(reportedRir(bare(60, 10, { effort: 'very_easy' }))).toBe(5);
    expect(reportedRir(bare(60, 10))).toBeNull();
  });
});

describe('F.4 / F.7 credit: the numbers and the report together', () => {
  const credit = (sets: WorkoutSet[]) => {
    const o = objectiveForSets(sets);
    return sets.map((s) => assessSet(s, m, { objective: o.get(s.id) }).credit);
  };
  it('ramp without effort answers: 20×10, 40×5 → 0; 55×11 → 0.3; best set stays provisional 0.75', () => {
    expect(credit([bare(20, 10), bare(40, 5), bare(60, 12)])).toEqual([0, 0, 0.75]);
    expect(credit([bare(55, 11), bare(60, 12)])).toEqual([0.75, 0.75]); // 3.1 in reserve → 1.0, capped at 0.75 without an answer
  });
  it('an estimate without a report never earns more than the provisional credit', () => {
    // Pyramid 50×12, 55×10, 60×8. Best = 60×8. 50 kg: Epley 15.6, Brzycki 37 − 29 × 50/60 = 12.83 → 0.8 in reserve → 1.0,
    // capped at 0.75. 55 kg: Epley 11.45, Brzycki 10.42 → 0.4 → 1.0, capped at 0.75. (Epley alone gave 3.6 → 0.6 for 50 kg.)
    expect(credit([bare(50, 12), bare(55, 10), bare(60, 8)])).toEqual([0.75, 0.75, 0.75]);
  });
  it('pyramid of hard sets WITH effort answers counts in full', () => {
    const hard = (w: number, r: number) => bare(w, r, { ...effortTapPatch(bare(w, r), 'hard') });
    expect(credit([hard(50, 12), hard(55, 10), hard(60, 8)])).toEqual([1, 1, 1]);
  });
  it('a warm-up rated GOOD stays a warm-up: the numbers win when they are ≥ 3 reps further from failure', () => {
    const good = bare(40, 5, { ...effortTapPatch(bare(40, 5), 'good') });
    const sets = [good, bare(60, 12)];
    const q = assessSet(good, m, { objective: objectiveForSets(sets).get(good.id) });
    expect(q.credit).toBe(0);
    expect(q.disagreement).toBe('felt_harder');
    expect(q.effortSource).toBe('numbers');
    expect(good.effort).toBe('appropriate'); // the answer itself is never rewritten
  });
  it('an effort answer beats a borderline estimate (55×11 rated GOOD before 60×12 → full credit)', () => {
    const good = bare(55, 11, { ...effortTapPatch(bare(55, 11), 'good') }); // reported ≤ 3, estimate 3.1: gap < 3
    expect(credit([good, bare(60, 12)])[0]).toBe(1);
  });
  it('rated EASY but reps collapsed on the next set → credited as a hard set, flagged', () => {
    const easy = bare(60, 12, { ...effortTapPatch(bare(60, 12), 'easy') });
    const sets = [easy, bare(60, 9)];
    const q = assessSet(easy, m, { objective: objectiveForSets(sets).get(easy.id) });
    expect(q.credit).toBe(1); // alone it would be 0.8 (EASY = average of the table over 3–4, Part 7)
    expect(q.disagreement).toBe('felt_easier');
    expect(assessSet(easy, m).credit).toBe(0.8);
  });
  it('rated FAILED on set 1 but set 2 matched it → credit unchanged, flagged', () => {
    const failed = bare(60, 10, { ...effortTapPatch(bare(60, 10), 'failed') });
    const sets = [failed, bare(60, 10)];
    const q = assessSet(failed, m, { objective: objectiveForSets(sets).get(failed.id) });
    expect(q.credit).toBe(1);
    expect(q.disagreement).toBe('felt_harder');
  });
  it('no answer: a rep collapse on the next set counts as a hard set (12, 10, 9 → 1, 0.75, 0.75)', () => {
    expect(credit([bare(60, 12), bare(60, 10), bare(60, 9)])).toEqual([1, 0.75, 0.75]);
  });
  it('a logged RIR that agrees with the numbers is used as before', () => {
    expect(credit([set(60, 12, 2), set(60, 11, 2), set(60, 10, 1)])).toEqual([1, 1, 1]);
    expect(credit([set(60, 12, 5)])).toEqual([0.3]);
  });
  it('weekly volume uses it: incline press 20×10, 40×5, 60×12, 60×10 → chest 0 + 0 + 1 + 0.75', () => {
    const w = workout('2026-11-23', [ex('incline_dumbbell_press', [bare(20, 10), bare(40, 5), bare(60, 12), bare(60, 10)])]);
    const v = computeVolume([w], reg, m);
    expect(v.muscles.chest.effective).toBe(1.75);
    expect(v.muscles.front_delts.effective).toBe(0.88); // 0.5 × 1.75 = 0.875 → 0.88
    expect(qualitySetTotal([w], reg, m)).toBe(1.75);
    // Switched off in Settings → the old provisional credit for every set (4 × 0.75).
    expect(computeVolume([w], reg, { ...m, useNumbersCheck: false }).muscles.chest.effective).toBe(3);
  });
  it('sets with a logged RIR and no contradiction give the same volume as before Part 6', () => {
    const w = workout('2026-11-23', [ex('pec_deck', [set(45, 12, 1), set(45, 11, 1), set(45, 10, 1)], 'pd_a')]);
    expect(computeVolume([w], reg, m).muscles.chest.effective).toBe(3);
    expect(computeVolume([w], reg, { ...m, useNumbersCheck: false }).muscles.chest.effective).toBe(3);
  });
});

describe('F.4 warm-up tags from the numbers', () => {
  it('tags sets before the best set that earn no credit; borderline sets stay working sets', () => {
    const out = reclassifyWarmups([bare(20, 10), bare(40, 5), bare(55, 11), bare(60, 12), bare(60, 10)], m);
    expect(out.map((s) => s.type)).toEqual(['warmup', 'warmup', 'working', 'working', 'working']);
    expect(out.map((s) => s.typeSource)).toEqual(['auto', 'auto', undefined, undefined, undefined]);
  });
  it('re-checks when sets change: the tag appears once the heavy set is logged and goes when it is removed', () => {
    const first = [bare(40, 5)];
    expect(reclassifyWarmups(first, m)).toBe(first); // nothing to compare with yet
    const withTop = reclassifyWarmups([...first, bare(60, 12)], m);
    expect(withTop[0]).toMatchObject({ type: 'warmup', typeSource: 'auto' });
    const without = reclassifyWarmups([withTop[0]], m);
    expect(without[0].type).toBe('working');
    expect(without[0].typeSource).toBeUndefined();
  });
  it("the owner's correction survives; older / imported warm-ups and drop sets are never touched", () => {
    const e0 = ex('pec_deck', [bare(40, 5), bare(60, 12)], 'pd_a');
    const tagged = { ...e0, sets: reclassifyWarmups(e0.sets, m) };
    const corrected = toggleWarmup(tagged, tagged.sets[0].id); // "this was a real set"
    expect(corrected.sets[0]).toMatchObject({ type: 'working', typeSource: 'owner' });
    expect(reclassifyWarmups(corrected.sets, m)).toBe(corrected.sets);
    const old = [bare(60, 12, { type: 'warmup' }), bare(60, 12), bare(40, 12, { type: 'drop' })];
    expect(reclassifyWarmups(old, m)).toBe(old);
  });
  it('same load and bodyweight sets are not tagged from the load alone', () => {
    expect(reclassifyWarmups([bare(60, 10), bare(60, 12)], m).map((s) => s.type)).toEqual(['working', 'working']);
    expect(reclassifyWarmups([bare(0, 5, { loadMode: 'bodyweight_plus' }), bare(0, 12, { loadMode: 'bodyweight_plus' })], m).map((s) => s.type)).toEqual(['working', 'working']);
  });
  it('planned (legacy, unticked) sets are ignored', () => {
    const s = [bare(40, 5), bare(60, 12, { planned: true })];
    expect(reclassifyWarmups(s, m)).toBe(s);
  });
});

describe('F.2 log after the set', () => {
  const last = ex('pec_deck', [bare(60, 12), bare(60, 11), bare(60, 10)], 'pd_a');
  it('weight and reps are pre-filled from last time, set by set', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    expect(prefillNext(cur, last)).toMatchObject({ weightKg: 60, reps: 12, from: 'last', alt: null });
    cur = logSet(cur, { weightKg: 60, reps: 13, loadMode: 'total' }, T0, 'a', m);
    expect(prefillNext(cur, last)).toMatchObject({ weightKg: 60, reps: 11, from: 'last' });
  });
  it('after a different weight the last set of THIS session decides', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 62.5, reps: 10, loadMode: 'total' }, T0, 'a', m);
    expect(prefillNext(cur, last)).toMatchObject({ weightKg: 62.5, from: 'session', reps: 11 });
  });
  it("last time's ramp repeats by itself: 20 → 40 → 60", () => {
    const ramp = ex('pec_deck', [bare(20, 10), bare(40, 5), bare(60, 12), bare(60, 11)], 'pd_a');
    let cur = ex('pec_deck', [], 'pd_a');
    expect(prefillNext(cur, ramp)).toMatchObject({ weightKg: 20, reps: 10 });
    cur = logSet(cur, { weightKg: 20, reps: 10, loadMode: 'total' }, T0, 'a', m);
    expect(prefillNext(cur, ramp)).toMatchObject({ weightKg: 40, reps: 5 });
    cur = logSet(cur, { weightKg: 40, reps: 5, loadMode: 'total' }, T0 + 60000, 'b', m);
    expect(prefillNext(cur, ramp)).toMatchObject({ weightKg: 60, reps: 12 });
  });
  it('an increase that is due: the plan is offered, last time stays one tap away', () => {
    const top = ex('pec_deck', [bare(60, 15), bare(60, 15), bare(60, 15)], 'pd_a');
    const target: ExerciseTarget = { sets: 3, weightKg: 65, reps: [{ min: 10, max: 12 }], engine: 'presc-1' };
    let cur = ex('pec_deck', [], 'pd_a', { target });
    expect(prefillNext(cur, top)).toEqual({ weightKg: 65, reps: 10, from: 'plan', alt: { weightKg: 60, from: 'last' } });
    cur = logSet(cur, { weightKg: 65, reps: 11, loadMode: 'total' }, T0, 'a', m);
    expect(prefillNext(cur, top)).toMatchObject({ weightKg: 65, from: 'session', reps: 10, alt: null });
  });
  it('no history and no plan: nothing is invented', () => {
    expect(prefillNext(ex('pec_deck', [], 'pd_a'), null)).toEqual({ weightKg: null, reps: null, from: null, alt: null });
  });
  it('a logged set is performed: completion time, measured rest, no planned flag', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 60, reps: 12, loadMode: 'total' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 60, reps: 10, loadMode: 'total' }, T0 + 180000, 'b', m);
    expect(cur.sets).toHaveLength(2);
    expect(cur.sets[0]).toMatchObject({ type: 'working', weightKg: 60, reps: 12, completedAt: at(0), restSecBefore: null });
    expect(cur.sets[0].planned).toBeUndefined();
    // 180 s since the previous set − 10 reps × 3 s = 150 s of rest.
    expect(cur.sets[1]).toMatchObject({ restSecBefore: 150, restSource: 'estimated', completedAt: at(180) });
  });
  it('a double tap on LOG SET does not create a second set', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 60, reps: 12, loadMode: 'total' }, T0, 'a', m);
    expect(isDoubleTap(cur, { weightKg: 60, reps: 12, loadMode: 'total' }, T0 + 700)).toBe(true);
    expect(isDoubleTap(cur, { weightKg: 60, reps: 12, loadMode: 'total' }, T0 + 1600)).toBe(false);
    expect(isDoubleTap(cur, { weightKg: 60, reps: 11, loadMode: 'total' }, T0 + 700)).toBe(false);
  });
  it('logging the heavy set tags the earlier light set; editing re-checks', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 40, reps: 5, loadMode: 'total' }, T0, 'a', m);
    expect(cur.sets[0].type).toBe('working');
    cur = logSet(cur, { weightKg: 60, reps: 12, loadMode: 'total' }, T0 + 120000, 'b', m);
    expect(cur.sets[0]).toMatchObject({ type: 'warmup', typeSource: 'auto' });
    cur = editSet(cur, 'a', { weightKg: 60, reps: 11 }, m); // it was a typo: 60 × 11
    expect(cur.sets[0].type).toBe('working');
    cur = editSet(cur, 'b', null, m);
    expect(cur.sets.map((s) => s.id)).toEqual(['a']);
  });
  it('effort tap: one answer, changeable, clearable; RIR and technique untouched', () => {
    const s0 = bare(60, 12, { technique: 'compromised' });
    const failed = { ...s0, ...effortTapPatch(s0, 'failed') };
    expect(failed).toMatchObject({ effort: 'near_max', failure: 'muscular', technique: 'compromised', rir: null });
    expect(effortTapOf(failed)).toBe('failed');
    const good = { ...failed, ...effortTapPatch(failed, 'good') };
    expect(good).toMatchObject({ effort: 'appropriate', feel: 'just_right' });
    expect(good.failure).toBeUndefined();
    expect(effortTapOf(good)).toBe('good');
    const cleared = { ...good, ...effortTapPatch(good, 'good') };
    expect(cleared.effort).toBeUndefined();
    expect(effortTapOf(cleared)).toBeNull();
    expect((['easy', 'good', 'hard', 'failed'] as const).map((t) => assessSet({ ...s0, technique: undefined, ...effortTapPatch(s0, t) }, m).credit)).toEqual([0.8, 1, 1, 1]); // EASY 3–4 → (1.0 + 0.6) ÷ 2 (Part 7)
  });
  it('honest comparison with the same set last time', () => {
    let cur = ex('pec_deck', [], 'pd_a');
    cur = logSet(cur, { weightKg: 60, reps: 13, loadMode: 'total' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 60, reps: 11, loadMode: 'total' }, T0 + 1, 'b', m);
    cur = logSet(cur, { weightKg: 62.5, reps: 8, loadMode: 'total' }, T0 + 2, 'c', m);
    cur = logSet(cur, { weightKg: 60, reps: 8, loadMode: 'total' }, T0 + 3, 'd', m);
    expect(setDelta(cur, 'a', last)).toEqual({ kind: 'up', reps: 1, kg: null });
    expect(setDelta(cur, 'b', last)).toEqual({ kind: 'same', reps: 0, kg: null });
    expect(setDelta(cur, 'c', last)).toEqual({ kind: 'up', reps: null, kg: 2.5 });
    expect(setDelta(cur, 'd', last)).toEqual({ kind: 'new', reps: null, kg: null }); // no 4th set last time
    expect(setDelta(cur, 'a', null)).toBeNull();
  });
  it('progress against the target; left + right count once', () => {
    const target: ExerciseTarget = { sets: 2, weightKg: 10, reps: [{ min: 10, max: 12 }], engine: 'presc-1' };
    let cur = ex('cable_lateral_raise', [], null, { target });
    cur = logSet(cur, { weightKg: 10, reps: 12, loadMode: 'total', side: 'left' }, T0, 'a', m);
    cur = logSet(cur, { weightKg: 10, reps: 12, loadMode: 'total', side: 'right' }, T0 + 40000, 'b', m);
    expect(exerciseProgress(cur)).toEqual({ done: 1, target: 2, reached: false });
    expect(cur.sets[1].restSecBefore).toBeNull(); // the second side follows directly: not rest
    cur = logSet(cur, { weightKg: 10, reps: 11, loadMode: 'total', side: 'left' }, T0 + 200000, 'c', m);
    cur = logSet(cur, { weightKg: 10, reps: 11, loadMode: 'total', side: 'right' }, T0 + 240000, 'd', m);
    expect(exerciseProgress(cur)).toEqual({ done: 2, target: 2, reached: true });
  });
});

describe('F.5 rest timer', () => {
  it('starts at 2:30 from the logged set, counts from the stored time, adjustable by 15 s', () => {
    let e1 = ex('pec_deck', [], 'pd_a');
    e1 = logSet(e1, { weightKg: 60, reps: 12, loadMode: 'total' }, T0, 'a', m);
    let w = workout('2026-11-23', [e1], { source: 'live' });
    expect(clockStartMs(w)).toBe(T0);
    expect(restState(w, T0 + 100000, undefined)).toMatchObject({ targetSec: 150, elapsedSec: 100, remainingSec: 50, done: false, setId: 'a' });
    expect(restState(w, T0 + 160000, undefined)).toMatchObject({ remainingSec: -10, done: true });
    // +15 sticks for this exercise for the rest of the session.
    w = { ...w, exercises: [adjustRest(e1, 15, undefined)] };
    expect(restState(w, T0 + 100000, undefined)).toMatchObject({ targetSec: 165, remainingSec: 65 });
    w = { ...w, exercises: [adjustRest(adjustRest(w.exercises[0], -15, undefined), -15, undefined)] };
    expect(restTargetFor(w.exercises[0], undefined)).toBe(135);
    // Paused for 20 s → those seconds do not count.
    expect(restState(w, T0 + 100000, undefined, 20000)).toMatchObject({ elapsedSec: 80, remainingSec: 55 });
  });
  it('the default comes from Settings; limits 0:15 … 15:00; nothing logged → no timer', () => {
    expect(restTargetFor(null, 180)).toBe(180);
    let e1 = ex('pec_deck', [], 'pd_a', { restTargetSec: 20 });
    e1 = adjustRest(e1, -15, 150);
    expect(e1.restTargetSec).toBe(15);
    expect(adjustRest({ ...e1, restTargetSec: 895 }, 15, 150).restTargetSec).toBe(900);
    expect(restState(workout('2026-11-23', [ex('pec_deck', [], 'pd_a')]), T0, 150)).toBeNull();
    expect(clockStartMs(workout('2026-11-23', [ex('pec_deck', [bare(60, 12, { planned: true })], 'pd_a')]))).toBeNull();
  });
});

describe('F.7 personal bias: effort answers vs the next set', () => {
  it('needs 12 comparable sets; then names the tendency', () => {
    const hardButHeld = () => { const a = bare(60, 10, { ...effortTapPatch(bare(60, 10), 'hard') }); return [a, bare(60, 10)]; };
    const few = Array.from({ length: 5 }, hardButHeld);
    expect(perceptionBias(few)).toMatchObject({ compared: 5, feltHarder: 5, verdict: null });
    const many = Array.from({ length: 12 }, hardButHeld);
    expect(perceptionBias(many)).toMatchObject({ compared: 12, feltHarder: 12, feltEasier: 0, agree: 0, verdict: 'rates_harder' });
    const fine = Array.from({ length: 12 }, () => { const a = bare(60, 12, { ...effortTapPatch(bare(60, 12), 'hard') }); return [a, bare(60, 10)]; });
    expect(perceptionBias(fine)).toMatchObject({ compared: 12, agree: 12, verdict: 'matches' });
  });
  it('cross-check result names what decides', () => {
    const o = objectiveForSets([bare(40, 5), bare(60, 12)]);
    const first = [...o.values()][0];
    expect(crossCheck(bare(40, 5), first)).toMatchObject({ use: 'numbers', capAtProvisional: true, disagreement: null });
    expect(crossCheck(bare(60, 12), undefined)).toMatchObject({ use: 'provisional' });
    expect(crossCheck(set(60, 12, 2), undefined)).toMatchObject({ use: 'reported' });
  });
});

describe('step 0 review: effort tap on a set from before Part 6', () => {
  it('a set marked with the old Fail chip can be changed to another answer (the mark is cleared)', () => {
    const old = bare(60, 10, { toFailure: true });
    expect(effortTapOf(old)).toBe('failed');
    const next = { ...old, ...effortTapPatch(old, 'good') };
    expect(effortTapOf(next)).toBe('good');
    expect(next.toFailure).toBeUndefined();
    // Tapping FAILED again on such a set clears the answer completely.
    const cleared = { ...old, ...effortTapPatch(old, 'failed') };
    expect(effortTapOf(cleared)).toBeNull();
  });
});
