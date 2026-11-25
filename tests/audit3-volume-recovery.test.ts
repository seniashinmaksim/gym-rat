/**
 * Audit 3 (2026-11-25): doc = code = hand calculation for set credit, effective volume, weekly targets, today's share /
 * week fit and the ONE recovery window. Every expected value below was computed BY HAND from CLAUDE.md and rules.ts (the
 * arithmetic is in the comments), not copied from the code's output. Synthetic data only.
 *
 * `it.fails(...)` = a place where the code does NOT give the documented / hand value (the comment says expected vs
 * actual and how it is classified). Nothing under src/ was changed.
 */
import { describe, expect, it } from 'vitest';
import { analyze, displaySets, isOpen, openOfShare, weekChip } from '../src/domain/analysis';
import { sessionEndVirtualMs } from '../src/domain/dates';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { objectiveForSets, reclassifyWarmups } from '../src/domain/perception';
import { assessSet, countedSetCount } from '../src/domain/quality';
import { baseWindowHours, conditionsExtraH, estimateRecovery, todayExtraH, windowHours } from '../src/domain/recovery';
import { buildRegistry, resolveCoefficients } from '../src/domain/registry';
import { computeVolume, qualitySetTotal } from '../src/domain/volume';
import { fitToday, sessionWindowH } from '../src/domain/weekPlan';
import type { AppData } from '../src/domain/appdata';
import type { Workout, WorkoutSet } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const Q = DEFAULT_QUALITY;
const reg = buildRegistry([], []);
const credit = (s: WorkoutSet, ctx: Parameters<typeof assessSet>[2] = {}) => assessSet(s, Q, ctx).credit;
/** Credits of one exercise entry with the numbers check, as the volume code applies it. */
const credits = (sets: WorkoutSet[]) => { const o = objectiveForSets(sets); return sets.map((s) => assessSet(s, Q, { objective: o.get(s.id) }).credit); };
const vms = (iso: string) => Date.parse(iso);
const H = 3_600_000;
const n = (k: number, f: () => WorkoutSet) => Array.from({ length: k }, f);

// =================================================================== 1. set credit
describe('1 — set credit', () => {
  it('RIR table 0–3 → 1, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥ 8 → 0', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 12].map((r) => credit(set(50, 10, r)))).toEqual([1, 1, 1, 1, 0.6, 0.3, 0.15, 0.15, 0, 0]);
  });
  it('unknown effort 0.75; effort answers = average of the table over the range', () => {
    expect(credit(set(50, 10, null))).toBe(0.75);
    expect(credit(set(50, 10, null, { effort: 'easy' }))).toBe(0.8); // 3–4 → (1 + 0.6) / 2
    expect(credit(set(50, 10, null, { effort: 'appropriate' }))).toBe(1); // 1–3
    expect(credit(set(50, 10, null, { effort: 'hard' }))).toBe(1); // 1–2
    expect(credit(set(50, 10, null, { effort: 'near_max' }))).toBe(1); // 0–1
    expect(credit(set(50, 10, null, { effort: 'very_easy' }))).toBe(0.3); // 5+ → 5
    // A logged RIR wins over the answer.
    expect(credit(set(50, 10, 5, { effort: 'near_max' }))).toBe(0.3);
  });
  // DOC WRONG (rules.ts feel_estimated_rir, CLAUDE.md §G): "an answer is never worth less than no answer (0.75)" — true for
  // the four training-mode taps, false for "very easy / too easy" (History → Edit, import `feel`): 0.3 < 0.75.
  it.fails('DOC: "answering is never worse than no answer (0.75)" — very easy earns 0.3', () => {
    expect(credit(set(50, 10, null, { effort: 'very_easy' }))).toBeGreaterThanOrEqual(0.75);
  });
  it('failure: Fail chip / muscular failure without RIR = RIR 0 = 1.0; technical failure → effort unknown × 0.7', () => {
    expect(credit(set(50, 10, null, { toFailure: true }))).toBe(1);
    expect(credit(set(50, 10, null, { failure: 'muscular' }))).toBe(1);
    // technique gave out: 0.75 (unknown) × 0.7 = 0.525 → 0.53 (half-up on the decimal value)
    expect(credit(set(50, 10, null, { toFailure: true, technicalFailure: true }))).toBe(0.53);
    expect(credit(set(50, 10, null, { failure: 'muscular', technicalFailure: true }))).toBe(0.53);
    // a stated RIR is kept: RIR 2 + technical failure → 1 × 0.7
    expect(credit(set(50, 10, 2, { technicalFailure: true }))).toBe(0.7);
    // "stopped before failure" without a number stays provisional
    expect(credit(set(50, 10, null, { failure: 'none' }))).toBe(0.75);
  });
  it('multipliers stack: RIR 4 (0.6) × low reps 0.8 × drop 0.5 × partial 0.8 × technique 0.7 = 0.1344 → 0.13', () => {
    expect(credit(set(50, 4, 4, { type: 'drop', rom: 'partial', technique: 'compromised' }))).toBe(0.13);
    expect(credit(set(50, 4, 2))).toBe(0.8); // < 5 reps
    expect(credit(set(50, 5, 2))).toBe(1); // 5 reps is not "low"
    expect(credit(set(50, 10, 0, { type: 'drop' }))).toBe(0.5);
    expect(credit(set(50, 10, 2, { rom: 'lengthened_partial' }))).toBe(1);
    expect(credit(set(50, 10, 2), { rom: 'partial' })).toBe(0.8); // exercise-level ROM
    expect(credit(set(50, 10, 2, { rom: 'full' }), { rom: 'partial' })).toBe(1); // the set's own ROM wins
    expect(credit(set(50, 0, 0))).toBe(0); // no completed rep
    expect(credit(set(50, null, 2))).toBe(1); // reps unknown: kept
    expect(credit(set(50, 10, 0, { type: 'warmup' }))).toBe(0);
    expect(credit(set(0, 1, null, { loadMode: 'bodyweight_plus' }), { timed: true })).toBe(0.75); // a plank is not "low reps"
  });
  it('fractional RIR rounds half-up into the table (3.5 → 4 → 0.6; 2.5 → 3 → 1)', () => {
    expect(credit(set(50, 10, 3.5))).toBe(0.6);
    expect(credit(set(50, 10, 2.5))).toBe(1);
  });

  it('ramp sets by the numbers: 40×5, 55×11 before 60×12 (no answers)', () => {
    // best 60 × 12: Epley value 60 × 1.4 = 84.
    // 40 kg: Epley 30 × (84/40 − 1) = 33; Brzycki 37 − 25 × 40/60 = 20.33 → possible 20.33 (> 20, but 5 ≤ 10.17) → reserve 15.3 → 0
    // 55 kg: Epley 15.82; Brzycki 37 − 25 × 55/60 = 14.08 → reserve 3.08 → table 1.0, no answer → capped at 0.75
    // 60 × 12 (best, nothing after it) → provisional 0.75
    const sets = [set(40, 5, null), set(55, 11, null), set(60, 12, null)];
    expect(credits(sets)).toEqual([0, 0.75, 0.75]);
    const o = objectiveForSets(sets);
    expect(o.get(sets[0].id)).toMatchObject({ kind: 'ramp', estRir: 15.3, possibleReps: 20.3 });
    expect(o.get(sets[1].id)).toMatchObject({ kind: 'ramp', estRir: 3.1, possibleReps: 14.1 });
    // Automatic warm-up: only the set whose estimate earns 0.
    const tagged = reclassifyWarmups(sets, Q);
    expect(tagged.map((s) => [s.type, s.typeSource])).toEqual([['warmup', 'auto'], ['working', undefined], ['working', undefined]]);
    // The owner's own tag is never changed; with the check off the automatic tag goes away.
    const owner = [{ ...sets[0], typeSource: 'owner' as const }, sets[1], sets[2]];
    expect(reclassifyWarmups(owner, Q)[0].type).toBe('working');
    expect(reclassifyWarmups(tagged, { ...Q, useNumbersCheck: false }).map((s) => s.type)).toEqual(['working', 'working', 'working']);
    // Volume: leg extension (quads 1) → 0 + 0.75 + 0.75 = 1.5 with or without the stored tag; check off → 3 × 0.75 = 2.25.
    const w = (ss: WorkoutSet[]) => [workout('2026-11-23', [ex('leg_extension', ss)])];
    expect(computeVolume(w(sets), reg, Q).muscles.quads.effective).toBe(1.5);
    const vt = computeVolume(w(tagged), reg, Q);
    expect([vt.muscles.quads.effective, vt.totalWarmupSets, vt.totalWorkingSets]).toEqual([1.5, 1, 2]);
    expect(computeVolume(w(tagged), reg, { ...Q, useNumbersCheck: false }).muscles.quads.effective).toBe(2.25);
  });
  it('20-rep limit: above 20 possible reps the numbers decide only at ≤ half of them', () => {
    // 30 kg before 60 × 12: Brzycki 37 − 25 × 0.5 = 24.5 (> 20). 12 reps ≤ 12.25 → decided: reserve 12.5 → 0. 13 reps → not decided → 0.75.
    expect(credits([set(30, 12, null), set(60, 12, null)])[0]).toBe(0);
    expect(credits([set(30, 13, null), set(60, 12, null)])[0]).toBe(0.75);
  });
  it('an answer is overruled only at ≥ 5 in reserve, ≥ 3 above the answer AND ≤ 75 % of the best load', () => {
    // 45 × 8 GOOD (1–3 → 3) before 60 × 12: ratio 0.75; Brzycki 37 − 25 × 0.75 = 18.25 → reserve 10.25 → numbers → 0.
    const a = [set(45, 8, null, { effort: 'appropriate' }), set(60, 12, null)];
    expect(credits(a)[0]).toBe(0);
    expect(assessSet(a[0], Q, { objective: objectiveForSets(a).get(a[0].id) }).disagreement).toBe('felt_harder');
    // 46 × 8 GOOD: ratio 0.767 > 0.75 → the answer stays → 1.0
    expect(credits([set(46, 8, null, { effort: 'appropriate' }), set(60, 12, null)])[0]).toBe(1);
    // 55 × 11 EASY (3–4 → 4): reserve 3.1 < 5 → answer stays → 0.8
    expect(credits([set(55, 11, null, { effort: 'easy' }), set(60, 12, null)])[0]).toBe(0.8);
  });
  it('back-off without an answer: only at ≤ 60 % of the best load, minus one rep per set since the best one', () => {
    // 36 × 10 after 60 × 12 (ratio 0.6): Brzycki 37 − 25 × 0.6 = 22 (> 20, 10 ≤ 11) → 22 − 10 − 1 = 11 → 0
    expect(credits([set(60, 12, null), set(36, 10, null)])).toEqual([0.75, 0]);
    // 37 kg (61.7 %) → not estimated → provisional
    expect(credits([set(60, 12, null), set(37, 10, null)])).toEqual([0.75, 0.75]);
    // 36 × 15: 15 > 11 (half of 22) → nothing decided → provisional
    expect(credits([set(60, 12, null), set(36, 15, null)])).toEqual([0.75, 0.75]);
  });
  it('next-set rule: reps falling by ≥ 2 at the same load mark the set as hard (1.0), 1 rep does not', () => {
    expect(credits([set(50, 12, null), set(50, 10, null)])).toEqual([1, 0.75]); // rest unknown = normal
    expect(credits([set(50, 12, null), set(50, 11, null)])).toEqual([0.75, 0.75]);
    // EASY (0.8) but reps collapsed after a normal 2:30 rest → credited as hard (1.0)
    expect(credits([set(50, 12, null, { effort: 'easy' }), set(50, 10, null, { restSecBefore: 150 })])[0]).toBe(1);
    // the next set was itself stopped on purpose (EASY → 4 ≥ 3 in reserve) → proves nothing
    expect(credits([set(50, 12, null), set(50, 10, null, { effort: 'easy' })])[0]).toBe(0.75);
    // a short rest explains the drop: 104 s < 70 % × 150 s = 105 s; exactly 105 s is not short
    expect(credits([set(50, 12, null), set(50, 10, null, { restSecBefore: 104 })])[0]).toBe(0.75);
    expect(credits([set(50, 12, null), set(50, 10, null, { restSecBefore: 105 })])[0]).toBe(1);
  });
  // DOC WRONG (stale): CLAUDE.md §L and rules.ts perception_check / warmup numbers say the drop counts "when that rest is
  // ≥ 60 s"; the code uses the ONE rest definition of §G (rest.ts): short = < 70 % of max(2:30, usual) = under 1:45.
  // A 90 s rest: by §L / rules.ts the first set is hard (1.0); the code credits 0.75.
  it.fails('DOC: §L / rules.ts "rest ≥ 60 s" — a 90 s rest still explains the rep drop in the code (0.75, not 1.0)', () => {
    expect(credits([set(50, 12, null), set(50, 10, null, { restSecBefore: 90 })])[0]).toBe(1);
  });
  it('bodyweight / assisted / per-side loads', () => {
    // bodyweight pull-ups (belt 0): no load estimate, the next-set rule still works: 12 → 9 → [1, 0.75]
    expect(credits([set(0, 12, null, { loadMode: 'bodyweight_plus' }), set(0, 9, null, { loadMode: 'bodyweight_plus' })])).toEqual([1, 0.75]);
    // assisted: 40 kg assistance × 10, then 20 kg × 8 — never compared by load → both provisional
    expect(credits([set(40, 10, null, { loadMode: 'assisted' }), set(20, 8, null, { loadMode: 'assisted' })])).toEqual([0.75, 0.75]);
    // plates per side: 20 × 5 before 40 × 12 → Brzycki 24.5, 5 ≤ 12.25 → reserve 19.5 → 0
    expect(credits([set(20, 5, null, { loadMode: 'per_side' }), set(40, 12, null, { loadMode: 'per_side' })])).toEqual([0, 0.75]);
  });
});

// =================================================================== 2. coefficients, sides, bench angle
describe('2 — coefficients, effective volume, sides, bench angle', () => {
  const vol = (ws: Workout[]) => computeVolume(ws, reg, Q);
  const press = (angle: number | undefined, id = 'incline_dumbbell_press') => resolveCoefficients(reg.get(id)!, angle == null ? undefined : { benchAngleDeg: angle });

  it('bench-angle groups at their boundaries', () => {
    expect(press(30).contributions).toMatchObject({ chest: 1, front_delts: 0.5, triceps: 0.5 });
    expect(press(30).regions).toEqual({ upper_chest: 1 });
    expect(press(10).regions).toEqual({ upper_chest: 1 }); // 10° is already incline
    expect(press(9.9).regions).toEqual({ lower_chest: 0.5 }); // < 10° flat: whole pec
    expect(press(45).contributions.chest).toBe(1); // 45° still incline
    expect(press(46).contributions).toMatchObject({ chest: 0.75, front_delts: 0.75, triceps: 0.5 }); // > 45°
    expect(press(46).regions).toEqual({ upper_chest: 0.5 });
    expect(press(-5, 'barbell_bench_press').contributions.front_delts).toBe(0.25); // ≤ −5° decline: front delts capped
    expect(press(-5, 'barbell_bench_press').regions).toEqual({ lower_chest: 1 });
    expect(press(-4, 'barbell_bench_press').contributions.front_delts).toBe(0.5);
    expect(press(120).contributions).toEqual(press(undefined).contributions); // a typo angle is ignored
    // a fly keeps its front delts whatever the angle
    expect(resolveCoefficients(reg.get('cable_fly')!, { benchAngleDeg: 60 }).contributions).toMatchObject({ chest: 1, front_delts: 0.25 });
  });
  it('incline press 3 × RIR 2: 30° vs 60° (regional emphasis is never added to chest)', () => {
    const w = (a: number) => [workout('2026-11-23', [ex('incline_dumbbell_press', n(3, () => set(25, 10, 2)), null, { variation: { benchAngleDeg: a } })])];
    const a30 = vol(w(30));
    expect([a30.muscles.chest.effective, a30.muscles.front_delts.effective, a30.muscles.triceps.effective, a30.regions.upper_chest.effective]).toEqual([3, 1.5, 1.5, 3]);
    const a60 = vol(w(60));
    // chest 3 × 0.75 = 2.25; front delts 3 × 0.75 = 2.25; upper-chest share 3 × 0.5 × 0.75 = 1.125 → 1.13
    expect([a60.muscles.chest.effective, a60.muscles.front_delts.effective, a60.muscles.triceps.effective, a60.regions.upper_chest.effective]).toEqual([2.25, 2.25, 1.5, 1.13]);
  });
  it('supinated grip: only compound vertical pulls; squat depth', () => {
    const c = (id: string, v: object) => resolveCoefficients(reg.get(id)!, v).contributions;
    expect(c('lat_pulldown', { grip: 'supinated' }).biceps).toBe(0.75);
    expect(c('straight_arm_pulldown', { grip: 'supinated' }).biceps).toBeUndefined();
    expect(c('back_squat', { depth: 'above_parallel' })).toMatchObject({ quads: 1, glutes: 0.5, adductors: 0.5 });
    expect(c('back_squat', {})).toMatchObject({ glutes: 0.75, adductors: 0.75 });
  });
  it('left + right: 3 L (RIR 2) + 3 R (no RIR) = 3 sets; credit = average of the sides', () => {
    const L = () => set(30, 10, 2, { side: 'left' });
    const R = () => set(30, 10, null, { side: 'right' });
    const sets = [L(), R(), L(), R(), L(), R()];
    const v = vol([workout('2026-11-23', [ex('standing_leg_curl', sets)])]);
    // per pair 0.5 × 1 + 0.5 × 0.75 = 0.875; × 3 = 2.625 → 2.63; calves 0.25 × 2.625 = 0.656 → 0.66
    expect([v.totalWorkingSets, v.muscles.hamstrings.effective, v.muscles.calves.effective, v.muscles.hamstrings.rawWorkingSets]).toEqual([3, 2.63, 0.66, 3]);
    expect(countedSetCount(sets)).toBe(3);
    // 3 L + 2 R (all RIR 2) = 3 sets: two pairs + one unpaired side counted as a full set
    const odd = [L(), set(30, 10, 2, { side: 'right' }), L(), set(30, 10, 2, { side: 'right' }), L()];
    const vo = vol([workout('2026-11-23', [ex('standing_leg_curl', odd)])]);
    expect([vo.totalWorkingSets, vo.muscles.hamstrings.effective]).toEqual([3, 3]);
    // a warm-up side never pairs with a working side
    const wu = [set(15, 10, null, { side: 'left', type: 'warmup' }), set(30, 10, 2, { side: 'right' })];
    expect(vol([workout('2026-11-23', [ex('standing_leg_curl', wu)])]).muscles.hamstrings.effective).toBe(1);
  });
  it('each set credits each muscle once; warm-ups, planned sets and unknown exercises do not count', () => {
    const v = vol([workout('2026-11-23', [
      ex('lat_pulldown', [set(30, 12, null, { type: 'warmup' }), set(60, 10, 2), set(60, 10, 2), { ...set(60, 10, 2), planned: true }]),
      ex('made_up_exercise', [set(10, 10, 2)]),
      ex('plank', [set(0, 1, null, { loadMode: 'bodyweight_plus' })]),
    ])]);
    expect([v.muscles.lats.effective, v.muscles.upper_back.effective, v.muscles.biceps.effective, v.muscles.forearms.effective]).toEqual([2, 1, 1, 0.5]);
    expect([v.totalWorkingSets, v.totalWarmupSets, v.unknownExerciseSets]).toEqual([4, 1, 1]);
    expect(v.muscles.abs.effective).toBe(0.38); // plank: 0.5 × 0.75 (timed: no low-rep cut) = 0.375 → 0.38
    expect(v.muscles.lats.sessions).toBe(1);
  });
  it('ROUNDING ORDER (d): the credit is rounded per set (0.525 → 0.53) BEFORE it is multiplied and summed', () => {
    // 3 pec-deck sets, effort unknown, technique compromised. Exact: 3 × 0.525 = 1.575 (→ 1.58). App: 3 × 0.53 = 1.59.
    const ws = [workout('2026-11-23', [ex('pec_deck', n(3, () => set(50, 12, null, { technique: 'compromised' })))])];
    const v = vol(ws);
    expect(v.muscles.chest.effective).toBe(1.59);
    expect(v.muscles.front_delts.effective).toBe(0.4); // 0.25 × 0.53 × 3 = 0.3975 → 0.40 (exact 0.39375 → 0.39)
    expect(qualitySetTotal(ws, reg, Q)).toBe(1.59);
  });
});

// =================================================================== 3. weekly targets, deload, individual level
const NOW = new Date('2026-11-25T10:00:00Z'); // Wednesday; week Mon 23 – Sun 29 November 2026
const mw = (a: ReturnType<typeof analyze>, m: string) => a.muscles.find((x) => x.muscle === m)!;

describe('3 — weekly targets, deload, individual level', () => {
  it('empty history: provisional references; experience and priority adjustments', () => {
    const a = analyze(data([]), NOW);
    expect([a.targets.chest.min, a.targets.chest.preferred, a.targets.chest.max, a.targets.chest.provisional]).toEqual([6, 12, 18, true]);
    expect([a.targets.abs.min, a.targets.abs.preferred, a.targets.abs.max]).toEqual([3, 6, 12]);
    expect(mw(a, 'chest').status).toBe('no_data');
    const withS = (patch: object) => { const d = data([]); d.settings = { ...d.settings, ...patch } as AppData['settings']; return analyze(d, NOW).targets.chest; };
    expect(withS({ experience: 'novice' })).toMatchObject({ min: 4, preferred: 10, max: 18 });
    expect(withS({ experience: 'advanced' })).toMatchObject({ min: 6, preferred: 14, max: 20 });
    expect(withS({ priorities: { chest: 'high' } })).toMatchObject({ min: 6, preferred: 14, max: 18 });
    // maintain: min 6 × 0.5 = 3, preferred 6 × 0.75 = 4.5 → 5 (Math.round half-up)
    expect(withS({ priorities: { chest: 'maintain' } })).toMatchObject({ min: 3, preferred: 5, max: 18 });
  });
  it('an active deload halves every target (also a manual one); an ended deload does not', () => {
    const block = (startDate: string, endDate: string | null) => ({ id: 'b', name: 'Deload', startDate, endDate, plannedWeeks: 1, kind: 'deload' as const });
    const run = (b: ReturnType<typeof block>, patch: object = {}) => { const d = data([], { blocks: [b] }); d.settings = { ...d.settings, ...patch } as AppData['settings']; return analyze(d, NOW); };
    const a = run(block('2026-11-25', null)); // starts today, open end
    expect([a.targets.chest.min, a.targets.chest.preferred, a.targets.chest.max]).toEqual([3, 6, 9]);
    expect([a.targets.abs.min, a.targets.abs.preferred, a.targets.abs.max]).toEqual([1.5, 3, 6]);
    expect(run(block('2026-11-16', '2026-11-25')).targets.chest.preferred).toBe(6); // last day inclusive
    expect(run(block('2026-11-16', '2026-11-24')).targets.chest.preferred).toBe(12); // ended yesterday
    expect(run(block('2026-11-26', null)).targets.chest.preferred).toBe(12); // starts tomorrow
    expect(run(block('2026-11-25', null), { targetOverrides: { chest: { min: 8, preferred: 14, max: 20 } } }).targets.chest).toMatchObject({ min: 4, preferred: 7, max: 10 });
    // Today's share in the deload: per-session cap max(3, round(6 × 0.6)) = 4; Wednesday → 5 days left, 3 sessions / week
    // assumed → round(15 / 7) = 2 sessions left → share min(4, 6, ceil(6 / 2)) = 3.
    expect([mw(a, 'chest').sessionCap, mw(a, 'chest').todayShare]).toEqual([4, 3]);
  });
  it('individual level after Learning Mode: 5 identical weeks of 8 chest sets, stalled → +2 (large muscle, baseline ≥ 8)', () => {
    // Mon + Thu, pec deck 4 × 12 @ 50 kg RIR 2, weeks of 19 Oct … 16 Nov (first workout on a Monday: no partial week).
    const ws: Workout[] = [];
    for (let k = 0; k < 5; k++) for (const off of [0, 3]) {
      const day = new Date(Date.parse('2026-10-19T00:00:00Z') + (k * 7 + off) * 86_400_000).toISOString().slice(0, 10);
      ws.push(workout(day, [ex('pec_deck', n(4, () => set(50, 12, 2)), 'pd1')]));
    }
    const a = analyze(data(ws), NOW);
    expect(a.learning.active).toBe(false); // day 38 > 30, 10 sessions, 5 complete weeks
    const t = a.targets.chest;
    expect(t.baseline).toBe(8); // median of 8, 8, 8, 8, 8
    // Same result for ≥ 4 sessions over ≥ 21 days, no new best in the last two → plateau → stalled; volume stable 5 weeks,
    // RIR 2 (adequate), clean technique, no recovery complaints → +2 → 10; min 7.5; max max(18, 14) = 18.
    expect([t.source, t.volumeAction, t.preferred, t.min, t.max]).toEqual(['individualized', 'increase', 10, 7.5, 18]);
    // Front delts got 0.25 × 8 = 2 a week, no direct exercise → "unknown" → hold at their own level 2 (never raised to the reference 6).
    expect([a.targets.front_delts.baseline, a.targets.front_delts.preferred, a.targets.front_delts.volumeAction]).toEqual([2, 2, 'hold']);
    // Week fit (usual days Mon + Thu; today Wednesday, nothing done this week): 10 left, cap round(10 × 0.6) = 6,
    // 2 sessions / week → round(2 × 5 / 7) = 1 session left → even share min(6, 10, 10) = 6.
    // 6 today → window 36 h → Thursday (24 h) is inside (needs ≥ 30 h) → 6 in total. 5 / 4 today: same → 5 / 4.
    // 3 today → window 24 h → Thursday fits (24 ≥ 18) with up to 6 → 9 of 10. → share 3, 1 does not fit.
    expect(a.usualDays).toEqual([1, 4]);
    const c = mw(a, 'chest');
    expect([c.sessionCap, c.todayShare, c.carryOver, c.shareRaised, c.todayOpen]).toEqual([6, 3, 1, false, 3]);
  });
});

// =================================================================== 4. today's share, week fit, sets left
describe("4 — today's share, week fit, sets-left display", () => {
  it('one display rounding: halves, nothing under half a set, ≈ when rounded', () => {
    expect(openOfShare(6, 2.75)).toBe(3.25);
    expect(openOfShare(2, 2.75)).toBe(0);
    expect(displaySets(3.25)).toEqual({ value: 3.5, approx: true, text: '≈3.5' });
    expect(displaySets(0.49).value).toBe(0);
    expect(displaySets(0.5)).toMatchObject({ value: 0.5, approx: false });
    expect(displaySets(0.74)).toMatchObject({ value: 0.5, approx: true });
    expect(displaySets(0.75)).toMatchObject({ value: 1, approx: true });
    expect([isOpen(0.49), isOpen(0.5)]).toEqual([false, true]);
  });
  it('share by weekday with no history (3 sessions / week assumed): chest 12, cap 7', () => {
    const at = (iso: string) => mw(analyze(data([]), new Date(iso)), 'chest');
    // Mon: 7 days → round(3) = 3 sessions → ceil(12 / 3) = 4. Wed: round(15 / 7) = 2 → 6. Thu: round(12 / 7) = 2 → 6.
    // Fri: round(9 / 7) = 1 → min(7, 12) = 7, carry-over 5. Sun: round(3 / 7) = 0 → at least 1 → 7.
    expect(at('2026-11-23T10:00:00Z').todayShare).toBe(4);
    expect(at('2026-11-25T10:00:00Z').todayShare).toBe(6);
    expect(at('2026-11-26T10:00:00Z').todayShare).toBe(6);
    expect([at('2026-11-27T10:00:00Z').todayShare, at('2026-11-27T10:00:00Z').carryOver]).toEqual([7, 5]);
    expect(at('2026-11-29T23:00:00Z').todayShare).toBe(7);
  });
  it("the share is fixed for the day; today's own sets never hold the muscle; open value is raw", () => {
    // Today (Wed): pec deck 50 × 12, RIR 2, RIR 2, no RIR → 1 + 1 + 0.75 = 2.75 done. Share stays 6 → open 3.25 → shown ≈3.5.
    const today = workout('2026-11-25', [ex('pec_deck', [set(50, 12, 2), set(50, 12, 2), set(50, 12, null)])], { startTime: '08:00', endTime: '09:00' });
    const c = mw(analyze(data([today]), NOW), 'chest');
    expect([c.doneToday, c.todayShare, c.todayOpen, c.todayLeft, c.todayBlocked]).toEqual([2.75, 6, 3.25, 3.5, false]);
  });
  it('Monday week boundary: the weekly count restarts, the recovery does not', () => {
    // Sunday 22 Nov 18:00: 10 pec-deck sets (RIR 2) → chest 10 → window 60 + 12 (large, > 9) = 72 h → until Wed 18:00.
    const sun = workout('2026-11-22', [ex('pec_deck', n(10, () => set(50, 12, 2)))], { startTime: '17:00', endTime: '18:00' });
    const at = (iso: string) => mw(analyze(data([sun]), new Date(iso)), 'chest');
    const mon = at('2026-11-23T10:00:00Z');
    expect([mon.completed, mon.remainingToPreferred, mon.todayBlocked, mon.todayShare, mon.recovery.windowHours, mon.recovery.hoursLeft]).toEqual([0, 12, true, 0, 72, 56]);
    expect(weekChip(mon)).toBe('recovering');
    // 6 h tolerance: 7 h left (Wed 11:00) holds, 6 h left (Wed 12:00) does not; share then 12 ÷ 2 = 6.
    expect(at('2026-11-25T11:00:00Z').todayBlocked).toBe(true);
    const free = at('2026-11-25T12:00:00Z');
    expect([free.todayBlocked, free.todayShare, free.recovery.hoursLeft]).toEqual([false, 6, 6]);
    expect(at('2026-11-25T18:00:00Z').recovery.status).toBe('likely_recovered');
  });
  // ROUNDING (d): `hoursLeft` is rounded to whole hours BEFORE it is compared with the 6 h tolerance (analysis.ts:229,
  // exerciseChoice.ts:313), while the week fit and the forward checks compare exact hours (weekPlan.ts:101, sequence.ts:181).
  // Wed 11:35 → 65.58 h since → 6.42 h left (> 6 h): the exact rule holds the muscle, the rounded one (6) does not.
  it('FIXED (third analysis) — was: 6.42 h of the window left is "> 6 h", but the rounded hoursLeft (6) releases the muscle', () => {
    const sun = workout('2026-11-22', [ex('pec_deck', n(10, () => set(50, 12, 2)))], { startTime: '17:00', endTime: '18:00' });
    expect(mw(analyze(data([sun]), new Date('2026-11-25T11:35:00Z')), 'chest').todayBlocked).toBe(true);
  });
  // ROUNDING (d) / CODE vs CLAUDE.md "every calculation uses the RAW open value … under half a set is nothing to do":
  // the weekly remainder is rounded to halves (analysis.ts:228) BEFORE the share is taken, so a raw 0.25 sets left becomes
  // a share of 0.5 and counts as open. Mon 6 × RIR 2 = 6; Tue 5 × RIR 2 + 1 without RIR = 5.75 → 11.75 of 12 → raw 0.25 left.
  it('FIXED (third analysis) — was: 0.25 sets left of the week (< 0.5 = nothing to do) is shown as 0.5 open today', () => {
    const monW = workout('2026-11-23', [ex('pec_deck', n(6, () => set(50, 12, 2)))]);
    const tueW = workout('2026-11-24', [ex('pec_deck', [...n(5, () => set(50, 12, 2)), set(50, 12, null)])]);
    const c = mw(analyze(data([monW, tueW]), new Date('2026-11-27T18:00:00Z')), 'chest');
    expect(c.completed).toBe(11.75);
    expect(isOpen(c.todayOpen)).toBe(false); // actual: todayShare 0.5, todayOpen 0.5, chip "today"
  });

  it('week fit by hand', () => {
    // 12 left, cap 7, even share 4, later days +2 and +4, large: 4 today (36 h) → day 2 is 48 h away (≥ 30) → 4 → 4 → fits.
    expect(fitToday({ remaining: 12, cap: 7, base: 4, later: [2, 4], large: true, toleranceH: 6 })).toEqual({ share: 4, reachable: 12, shortBy: 0, raised: false });
    // 10 left, cap 7, even share 5, tomorrow only: 5 / 6 / 7 today keep tomorrow inside the window (36 / 36 / 48 h, need ≤ 30);
    // 4 too (36 h); 3 today (24 h → 24 ≥ 18) + 7 tomorrow = 10 → share 3.
    expect(fitToday({ remaining: 10, cap: 7, base: 5, later: [1], large: true, toleranceH: 6 })).toEqual({ share: 3, reachable: 10, shortBy: 0, raised: false });
    // raised: 8 left, cap 7, even share 4, next usual day in 2 days, large: 4 today → day 2 fits (48 ≥ 30) → 4 + 4 = 8, no raise.
    expect(fitToday({ remaining: 8, cap: 7, base: 4, later: [2], large: true, toleranceH: 6 }).share).toBe(4);
    // no later day: 9 left, cap 7, even share 3 → 3 … 6 reach less than 7 → share 7 (raised), 2 do not fit.
    expect(fitToday({ remaining: 9, cap: 7, base: 3, later: [], large: false, toleranceH: 6 })).toEqual({ share: 7, reachable: 7, shortBy: 2, raised: true });
    // the tolerance is inclusive: a 36 h window and a day 24 h away fit with 12 h tolerance (24 ≥ 24), not with 11.
    expect(fitToday({ remaining: 8, cap: 4, base: 4, later: [1], large: false, toleranceH: 12 }).shortBy).toBe(0);
    expect(fitToday({ remaining: 8, cap: 4, base: 4, later: [1], large: false, toleranceH: 11 }).shortBy).toBeGreaterThan(0);
    expect(fitToday({ remaining: 0, cap: 7, base: 0, later: [1], large: true, toleranceH: 6 }).share).toBe(0);
  });
  // CODE WRONG (weekPlan.ts:124, also :158–159 for the extra session): the fallback loop over SMALLER shares calls
  // bestLater without `todayExtraH`, so what is known today (soreness, sleep, fatigue, ≥ 2 failure sets, a new exercise)
  // lengthens today's window for shares ≥ the even share but not for smaller ones.
  // By hand, 12 left, cap 7, even share 6, tomorrow only, not large, + 24 h today (soreness 3):
  //   6 today → 36 + 24 = 60 h, 7 → 48 + 24 = 72 h; 5 / 4 → 60 h; 3 / 2 / 1 → 24 + 24 = 48 h: tomorrow (24 h) needs ≤ 30 h
  //   → never fits → the most that fits is 7 today, 5 short.
  // Code: 3 today is given a 24 h window → tomorrow "fits" with 7 → share 3, reachable 10, 2 short.
  it('FIXED (third analysis) — was: the fallback to a smaller share forgets today\'s extra hours (share 3 / 2 short instead of 7 / 5 short)', () => {
    const f = fitToday({ remaining: 12, cap: 7, base: 6, later: [1], large: false, toleranceH: 6, todayExtraH: 24 });
    expect([f.share, f.shortBy]).toEqual([7, 5]);
  });
});

// =================================================================== 5. the ONE recovery window
describe('5 — recovery window', () => {
  it('window table and additions at their boundaries', () => {
    expect([0.5, 3, 3.01, 6, 6.01, 9, 9.01, 12, 12.01].map(baseWindowHours)).toEqual([24, 24, 36, 36, 48, 48, 60, 60, 72]);
    expect(windowHours({ sets: 9, large: true })).toBe(48); // "after > 9 sets": 9 is not above 9
    expect(windowHours({ sets: 9.01, large: true })).toBe(72); // 60 + 12
    expect(windowHours({ sets: 10, large: false })).toBe(60);
    expect(windowHours({ sets: 3, large: false, failureSets: 1 })).toBe(24);
    expect(windowHours({ sets: 3, large: false, failureSets: 2 })).toBe(36);
    expect(windowHours({ sets: 3, large: false, novel: true })).toBe(36);
    expect([1, 2, 3, 4].map((s) => conditionsExtraH({ soreness: s }))).toEqual([0, 12, 24, 24]);
    expect([conditionsExtraH({ avgSleep: 6 }), conditionsExtraH({ avgSleep: 5.9 }), conditionsExtraH({ maxFatigue: 3 }), conditionsExtraH({ maxFatigue: 4 })]).toEqual([0, 12, 0, 12]);
    // everything at once: 72 + 12 (large) + 12 (failure) + 12 (new) + 24 (soreness 3) + 12 (sleep) + 12 (fatigue) = 156 h
    expect(windowHours({ sets: 13, large: true, failureSets: 2, novel: true, soreness: 3, avgSleep: 5, maxFatigue: 4 })).toBe(156);
    // the week fit and the forward checks use the same formula
    expect([sessionWindowH(0, true), sessionWindowH(10, true), sessionWindowH(10, true, 24), sessionWindowH(3, false)]).toEqual([0, 72, 96, 24]);
  });
  it('session end time: last ticked set → end time → start + duration → start → 18:00 assumed', () => {
    const day = vms('2026-11-23T00:00:00Z');
    const e = (w: Parameters<typeof sessionEndVirtualMs>[0]) => { const r = sessionEndVirtualMs(w, 'UTC'); return [(r.ms - day) / H, r.source]; };
    expect(e({ date: '2026-11-23', startTime: '17:00', endTime: '18:30', exercises: [{ sets: [{ completedAt: '2026-11-23T19:15:00Z' }] }] })).toEqual([19.25, 'last_set']);
    expect(e({ date: '2026-11-23', startTime: '17:00', endTime: '18:30', durationMin: 30 })).toEqual([18.5, 'end_time']);
    expect(e({ date: '2026-11-23', startTime: '23:00', endTime: '00:30' })).toEqual([24.5, 'end_time']); // past midnight
    expect(e({ date: '2026-11-23', startTime: '17:00', durationMin: 75 })).toEqual([18.25, 'start_plus_duration']);
    expect(e({ date: '2026-11-23', startTime: '17:00' })).toEqual([17, 'start_time']);
    expect(e({ date: '2026-11-23' })).toEqual([18, 'assumed']);
    // a tick that is not on the workout's day or the night after (a set edited days later) is not trusted
    expect(e({ date: '2026-11-23', endTime: '18:30', exercises: [{ sets: [{ completedAt: '2026-11-26T10:00:00Z' }] }] })).toEqual([18.5, 'end_time']);
    // a planned row's tick is ignored
    expect(e({ date: '2026-11-23', exercises: [{ sets: [{ completedAt: '2026-11-23T20:00:00Z', planned: true }] }] })).toEqual([18, 'assumed']);
  });
  const chest = (d: AppData, nowIso: string, opts: object = {}) => estimateRecovery(d, reg, vms(nowIso), nowIso.slice(0, 10), opts).chest;
  it('empty history / one small session / unknown end time', () => {
    expect(chest(data([]), '2026-11-25T10:00:00Z')).toMatchObject({ status: 'insufficient_data', windowHours: null, hoursLeft: 0 });
    // 1 chest set is below the 2-set threshold
    expect(chest(data([workout('2026-11-24', [ex('pec_deck', [set(50, 12, 2)])])]), '2026-11-25T10:00:00Z').status).toBe('insufficient_data');
    // 3 sets, no time at all → 18:00 assumed; 16 h later: window 24 → 8 h left
    const w = workout('2026-11-24', [ex('pec_deck', n(3, () => set(50, 12, 2)))], { startTime: null });
    expect(chest(data([w]), '2026-11-25T10:00:00Z')).toMatchObject({ status: 'recovering', windowHours: 24, hoursSince: 16, hoursLeft: 8, lastStimulusTimeSource: 'assumed', lastStimulusTime: '18:00' });
    // minor credits never start a hold: 4 pulldown sets → biceps 2.0 (significant), forearms 1.0 at 0.25 (ignored)
    const pd = estimateRecovery(data([workout('2026-11-24', [ex('lat_pulldown', n(4, () => set(60, 10, 2)))])]), reg, vms('2026-11-25T10:00:00Z'), '2026-11-25');
    expect([pd.biceps.windowHours, pd.forearms.status, pd.lats.windowHours]).toEqual([24, 'insufficient_data', 36]);
  });
  it('+ 12 h for ≥ 2 failure sets (a left + right pair is one set), + 12 h for an exercise new in 3 weeks', () => {
    const fail = workout('2026-11-24', [ex('pec_deck', [set(50, 12, 2), set(50, 11, 0), set(50, 9, null, { toFailure: true })])]);
    expect(chest(data([fail]), '2026-11-25T10:00:00Z').windowHours).toBe(36); // 24 + 12
    const pair = workout('2026-11-24', [ex('standing_leg_curl', [
      set(30, 10, 0, { side: 'left' }), set(30, 10, 0, { side: 'right' }), set(30, 10, 2, { side: 'left' }), set(30, 10, 2, { side: 'right' })])]);
    expect(estimateRecovery(data([pair]), reg, vms('2026-11-25T10:00:00Z'), '2026-11-25').hamstrings.windowHours).toBe(24); // 2 sets, 1 failure set
    // new exercise: an older workout exists (30 days ago, another movement) → pec deck is new → 24 + 12
    const old = workout('2026-10-25', [ex('leg_extension', n(3, () => set(40, 12, 2)))]);
    const first = workout('2026-11-24', [ex('pec_deck', n(3, () => set(50, 12, 2)))]);
    expect(chest(data([old, first]), '2026-11-25T10:00:00Z').windowHours).toBe(36);
    // the very first workout on record is not "new" (nothing to compare with)
    expect(chest(data([first]), '2026-11-25T10:00:00Z').windowHours).toBe(24);
    // soreness 3 today: + 24 h; and still "recovering" after the window (hoursLeft 0 → does not hold today)
    const sore = data([first], { daily: [{ id: '2026-11-25', date: '2026-11-25', soreness: { chest: 3 } }] });
    expect(chest(sore, '2026-11-25T10:00:00Z')).toMatchObject({ windowHours: 48, hoursLeft: 32, conditionsExtraH: 24 });
    expect(chest(sore, '2026-11-26T19:00:00Z')).toMatchObject({ status: 'recovering', hoursLeft: 0 });
  });
  it('a small later session does not end the hold of a bigger one: the window that ends LAST decides', () => {
    // Mon 18:00 10 sets (72 h → Thu 18:00); Tue 18:00 2 sets (24 h → Wed 18:00). Wed 20:00 → Monday decides: 50 h since, 22 h left.
    const mon = workout('2026-11-23', [ex('pec_deck', n(10, () => set(50, 12, 2)))], { startTime: '17:00', endTime: '18:00' });
    const tue = workout('2026-11-24', [ex('pec_deck', n(2, () => set(50, 12, 2)))], { startTime: '17:00', endTime: '18:00' });
    expect(chest(data([mon, tue]), '2026-11-25T20:00:00Z')).toMatchObject({ lastStimulusDate: '2026-11-23', windowHours: 72, hoursSince: 50, hoursLeft: 22, status: 'recovering' });
    // After Thu 18:00 nothing is open: the most recent session is shown.
    expect(chest(data([mon, tue]), '2026-11-26T19:00:00Z')).toMatchObject({ lastStimulusDate: '2026-11-24', status: 'likely_recovered' });
  });
  it('a session logged with a time still ahead of "now" counts from now (0 h), never from the future', () => {
    const w = workout('2026-11-25', [ex('pec_deck', n(3, () => set(50, 12, 2)))], { startTime: '19:00', endTime: '20:00' });
    expect(chest(data([w]), '2026-11-25T10:00:00Z')).toMatchObject({ hoursSince: 0, hoursLeft: 24 });
  });
  // FORMULA CHOICE (documented here, passing): "only an EARLIER session can hold a muscle" is implemented as "a session of
  // an earlier DATE". A separate morning session (08:00–09:00, 10 chest sets, 72 h window) does not hold the chest for an
  // evening session the same day — the Recovery screen says 63 h left, the Week screen does not block.
  it('two sessions in one day: the morning session never holds the muscle in the evening', () => {
    const am = workout('2026-11-25', [ex('pec_deck', n(10, () => set(50, 12, 2)))], { startTime: '08:00', endTime: '09:00' });
    const a = analyze(data([am]), new Date('2026-11-25T18:00:00Z'));
    const c = mw(a, 'chest');
    expect([a.recovery.chest.status, a.recovery.chest.hoursLeft]).toEqual(['recovering', 63]);
    expect([a.planRecovery.chest.status, c.todayBlocked, c.doneToday, c.todayShare, c.todayOpen]).toEqual(['insufficient_data', false, 10, 6, 0]);
  });
  it("what is known today lengthens today's window: ≥ 2 failure sets + 12 h, a new exercise + 12 h", () => {
    const old = workout('2026-11-01', [ex('triceps_pushdown', n(3, () => set(30, 12, 2)))]); // 24 days ago
    const recent = workout('2026-11-20', [ex('leg_extension', n(3, () => set(40, 12, 2)))]);
    const today = workout('2026-11-25', [ex('pec_deck', [set(50, 12, 0), set(50, 10, 0), set(50, 9, 2)])]);
    const d = data([old, recent, today]);
    expect(todayExtraH(d, reg, 'chest', '2026-11-25')).toBe(24); // 2 failure sets + pec deck new in 3 weeks
    expect(todayExtraH(d, reg, 'quads', '2026-11-25')).toBe(0);
    expect(todayExtraH(d, reg, 'quads', '2026-11-25', ['leg_extension'])).toBe(0); // done 5 days ago
    expect(todayExtraH(d, reg, 'triceps', '2026-11-25', ['triceps_pushdown_rope'])).toBe(12); // same movement, but 24 days ago (> 21)
    expect(todayExtraH(data([today]), reg, 'chest', '2026-11-25')).toBe(12); // first workout ever: not "new", failure only
  });
});
