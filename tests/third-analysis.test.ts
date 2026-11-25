/**
 * Third analysis (2026-11-25) — the owner's own session, replayed with SYNTHETIC numbers of the same shape
 * (docs/FORMULA_DEPENDENCY_MAP.md §13). Each test names the observation it reproduces.
 *
 * Shape: Monday — incline dumbbell press 4, pec deck 2, leg extension 4, EZ curl 4, lateral raise 2 (the first week,
 * everything new). Wednesday 18:00 — back was never trained; the app put incline press on top.
 * Owner's decisions 2026-11-25: suggestions by the most-needed muscle; barbells move in 5 kg steps (2.5 kg plates);
 * no "you said easy → +1 step" offer — only a weight calculated from a set that was really hard.
 */
import { describe, expect, it } from 'vitest';
import { analyze, setsLeftTodayText } from '../src/domain/analysis';
import { prescribe } from '../src/domain/prescription';
import { assessChoice } from '../src/domain/exerciseChoice';
import { muscleCreditText } from '../src/domain/fatigue';
import { barBreakdown, loadStep } from '../src/domain/increments';
import { anchorRir, applyOffer, canContinue, continueWorkout, keepOffer, nextSetsOffer, targetText, workingWeightFromSets } from '../src/domain/liveFlow';
import { suggestNext } from '../src/domain/optimality';
import { buildRegistry } from '../src/domain/registry';
import { stepTarget } from '../src/domain/weights';
import { setLang } from '../src/i18n/core';
import type { ExerciseTarget, Workout, WorkoutExercise } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const hard = { effort: 'near_max' as const, feel: 'hard_good' as const };
const max = { ...hard, failure: 'muscular' as const };
const easy = { effort: 'easy' as const, feel: 'bit_easy' as const };
const monday = (): Workout => workout('2026-11-23', [
  ex('incline_dumbbell_press', [set(18, 12, null, hard), set(22, 9, null, max), set(22, 9, null, { ...max, technique: 'compromised' }), set(22, 7, null, max)], null, { variation: { benchAngleDeg: 30 } }),
  ex('pec_deck', [set(50, 9, null, max), set(55, 6, null, max)]),
  ex('leg_extension', [set(40, 11, null, max), set(45, 12, null, max), set(50, 12, null, max), set(55, 11, null, max)]),
  ex('ez_bar_curl', [set(20, 9, null, hard), set(20, 11, null, hard), set(25, 10, null, hard), set(25, 8, null, max)]),
  ex('lateral_raise', [set(12, 9, null, hard), set(12, 7, null)]),
], { startTime: '17:44', endTime: '18:46', source: 'live', finishedAt: '2026-11-23T18:46:00Z' });
const WED = new Date('2026-11-25T18:00:00Z');
const live = (exs: WorkoutExercise[] = []): Workout => workout('2026-11-25', exs, { id: 'live', startTime: '18:00', endTime: null, source: 'live' });

describe('obs. 1 — what to do next: the most-needed muscle first, new exercises included', () => {
  const d = data([monday(), live()]);
  const a = analyze(d, WED);
  it('hand check of the state: chest 4 open today, lats 6 (never trained), chest window over', () => {
    const m = (id: string) => a.muscles.find((x) => x.muscle === id)!;
    // Learning Mode targets: lats 12, chest 12. Chest done Mon: 4 + 2 sets with an effort answer, one with broken technique (× 0.7) → 5.7.
    expect(m('chest').completed).toBe(5.7);
    expect(m('lats').completed).toBe(0);
    expect(m('lats').todayOpen).toBeGreaterThan(m('chest').todayOpen);
    expect(m('chest').todayBlocked).toBe(false);
  });
  it('the first group is the back (lats), with exercises new to the owner; chest is not on top', () => {
    const s = suggestNext({ data: d, analysis: a, workout: d.workouts[1] });
    expect(s.groups[0].muscle).toBe('lats');
    expect(s.groups[0].options.length).toBeGreaterThan(0);
    expect(s.groups[0].options.every((o) => o.isNew)).toBe(true);
    expect(s.groups.map((g) => g.muscle)).not.toContain('chest'); // 4 open — behind the muscles with 5–6 open
    // ≤ 4 muscles, ≤ 2 options each, groups in descending order of open sets.
    expect(s.groups.length).toBeLessThanOrEqual(4);
    for (const g of s.groups) expect(g.options.length).toBeLessThanOrEqual(2);
    const opens = s.groups.map((g) => g.open);
    expect([...opens].sort((x, y) => y - x)).toEqual(opens);
  });
  it('a muscle with a familiar exercise offers that one, not a new one; nothing already in the session is suggested', () => {
    const w = live([ex('lat_pulldown', [set(50, 10, null, hard), set(50, 9, null, hard), set(50, 8, null, max)])]);
    const d2 = data([monday(), w]);
    const s = suggestNext({ data: d2, analysis: analyze(d2, WED), workout: w });
    for (const g of s.groups) for (const o of g.options) expect(o.exerciseId).not.toBe('lat_pulldown');
    const quads = s.groups.find((g) => g.muscle === 'quads');
    if (quads) expect(quads.options.map((o) => o.exerciseId)).toEqual(['leg_extension']);
  });
});

describe('obs. 2 / 4 / 6 — the target line cannot be read as a weight', () => {
  const T: ExerciseTarget = { sets: 4, weightKg: null, reps: [{ min: 10, max: 15 }], rir: [{ min: 1, max: 2 }], engine: 'presc-1' };
  it('"4 × 10–15" (read as 4 kg) → "4 sets × 10–15 reps · find your weight"; with a weight the kg is named', () => {
    setLang('en', false);
    expect(targetText(T)).toBe('4 sets × 10–15 reps · find your weight');
    expect(targetText({ ...T, weightKg: 60 })).toBe('4 sets × 60 kg × 10–15 reps');
    expect(targetText({ ...T, sets: 1 })).toBe('1 set × 10–15 reps · find your weight');
    expect(targetText({ ...T, sets: 0 })).toBe('optional today');
    setLang('ru', false);
    expect(targetText(T)).toBe('4 подхода × 10–15 повт. · подберите вес');
    expect(targetText({ ...T, sets: 5, weightKg: 62.5 })).toBe('5 подходов × 62,5 кг × 10–15 повт.');
    setLang('en', false);
  });
});

describe('obs. 3 / 5 — barbells: 5 kg steps, the step remembered per gym, bar + plates', () => {
  it('default steps: barbell 5 (2.5 per side), dumbbell 2, machine 2.5; a gym\'s barbell step wins; an equipment step wins over both', () => {
    expect(loadStep(null, null, 'barbell').step).toBe(5);
    expect(loadStep(null, null, 'barbell', 'per_side').step).toBe(2.5);
    expect(loadStep(null, null, 'dumbbell').step).toBe(2);
    expect(loadStep(null, null, 'machine').step).toBe(2.5);
    expect(loadStep(null, { barbellIncrementsKg: [2.5] }, 'barbell')).toEqual({ step: 2.5, source: 'gym_barbell' });
    expect(loadStep({ incrementsKg: [1] }, { barbellIncrementsKg: [2.5] }, 'barbell').step).toBe(1);
    expect(stepTarget(null, { id: 'gym_a' }, 'barbell')).toEqual({ kind: 'gym_barbell', id: 'gym_a' });
  });
  it('30 kg with a 20 kg bar = 5 kg per side; unknown bar → nothing is assumed; lighter than the bar → nothing', () => {
    expect(barBreakdown(30, 20)).toEqual({ barKg: 20, perSideKg: 5 });
    expect(barBreakdown(42.5, 20)).toEqual({ barKg: 20, perSideKg: 11.25 });
    expect(barBreakdown(30, null)).toBeNull();
    expect(barBreakdown(15, 20)).toBeNull();
  });
});

describe('obs. 5 — no "you said easy → +1 step"; a working weight only from a set that was really hard', () => {
  const T: ExerciseTarget = { sets: 4, weightKg: null, reps: [{ min: 6, max: 10 }], rir: [{ min: 2, max: 3 }], engine: 'presc-1' };
  const card = (sets: ReturnType<typeof set>[]) => ex('barbell_row', sets, null, { target: T });
  const at = (m: number) => ({ completedAt: `2026-11-25T18:${String(m).padStart(2, '0')}:00Z` });
  it('30 × 11 EASY, no history: a note without a number (not 32.5 kg)', () => {
    const o = nextSetsOffer(card([set(30, 11, null, { ...easy, ...at(5) })]), 5)!;
    expect(o.change).toBe('find_weight');
    expect(o.weightKg).toBeNull();
    expect(o.why).toMatch(/too light to calculate/);
    // Nothing to apply.
    const e = card([set(30, 11, null, { ...easy, ...at(5) })]);
    expect(applyOffer(e, o, '2026-11-25T18:06:00Z')).toBe(e);
  });
  it('anchors: failure 0, HARD 0.5, RIR ≤ 1; never EASY / GOOD / broken technique / > 20 reps / bodyweight', () => {
    expect(anchorRir(set(50, 8, null, max))).toBe(0);
    expect(anchorRir(set(50, 8, null, hard))).toBe(0.5);
    expect(anchorRir(set(50, 8, 1))).toBe(1);
    expect(anchorRir(set(50, 8, 2))).toBeNull();
    expect(anchorRir(set(50, 8, null, easy))).toBeNull();
    expect(anchorRir(set(50, 8, null, { effort: 'appropriate' }))).toBeNull();
    expect(anchorRir(set(50, 8, null, { ...max, technique: 'compromised' }))).toBeNull();
    expect(anchorRir(set(50, 25, null, max))).toBeNull();
    expect(anchorRir(set(0, 8, null, { ...max, loadMode: 'bodyweight_plus' }))).toBeNull();
  });
  it('by hand: 50 × 8 to the limit → e1RM 50 × (1 + 8/30) = 63.3; for 6–10 reps with 2–3 left: 63.3 ÷ (1 + 10.5/30) = 46.9 → 45 kg (5 kg steps)', () => {
    const r = workingWeightFromSets([set(30, 11, null, easy), set(40, 11, null, { effort: 'appropriate' }), set(50, 8, null, max)], { min: 6, max: 10 }, { min: 2, max: 3 }, 5)!;
    expect(r.e1rm).toBe(63.3);
    expect(r.weightKg).toBe(45);
    // 2.5 kg steps: 46.9 → 45 (rounded DOWN, never up); the machine's maximum caps it.
    expect(workingWeightFromSets([set(50, 8, null, max)], { min: 6, max: 10 }, { min: 2, max: 3 }, 2.5)!.weightKg).toBe(45);
    expect(workingWeightFromSets([set(50, 8, null, max)], { min: 6, max: 10 }, { min: 2, max: 3 }, 2.5, { maxKg: 40 })!.weightKg).toBe(40);
    expect(workingWeightFromSets([set(30, 11, null, easy)], { min: 6, max: 10 }, { min: 2, max: 3 }, 5)).toBeNull();
  });
  it('the offer after the hard set: "calculated 45 kg", Use sets the target (smart weight), nothing silently', () => {
    const e = card([set(30, 11, null, { ...easy, ...at(5) }), set(40, 11, null, { effort: 'appropriate', ...at(9) }), set(50, 8, null, { ...max, ...at(13) })]);
    const o = nextSetsOffer(e, 5)!;
    expect(o).toMatchObject({ change: 'calc', weightKg: 45 });
    expect(o.why).toMatch(/50 kg × 8/);
    expect(e.target!.weightKg).toBeNull();
    const after = applyOffer(e, o, '2026-11-25T18:14:00Z');
    expect(after.target).toMatchObject({ weightKg: 45, adapted: { change: 'calc', fromKg: null } });
    expect(nextSetsOffer(after, 5)).toBeNull();
  });
  it('with a planned weight (history exists) an EASY answer changes nothing in the session', () => {
    const e = ex('barbell_row', [set(40, 10, null, { ...easy, ...at(5) })], null, { target: { ...T, weightKg: 40 } });
    expect(nextSetsOffer(e, 5)).toBeNull();
  });
});

describe('independent review of the third analysis — regressions', () => {
  const T: ExerciseTarget = { sets: 3, weightKg: null, reps: [{ min: 10, max: 15 }], rir: [{ min: 1, max: 2 }], engine: 'presc-1' };
  const at = (m: number) => ({ completedAt: `2026-11-25T18:${String(m).padStart(2, '0')}:00Z` });
  it('R1 a gym barbell step never snaps an EZ bar at 22.5 kg to 25: the plan keeps 22.5', () => {
    const hist = ['2026-11-16', '2026-11-18', '2026-11-20'].map((dte) => workout(dte, [ex('ez_bar_curl', [set(22.5, 10, 2), set(22.5, 10, 2), set(22.5, 9, 2)])], { startTime: '18:00', endTime: '19:00' }));
    const w = live([ex('ez_bar_curl', [])]);
    const d = data([...hist, w], { locations: [{ id: 'gym_a', name: 'Gym A', photoIds: [], createdAt: '', barbellIncrementsKg: [5] }] });
    const p = prescribe({ data: d, analysis: analyze(d, WED), now: WED, workout: w, exerciseIndex: 0 });
    expect(p.workingWeightKg).toBe(22.5);
  });
  it('R2 no "go heavier" note for assistance or added-to-body-weight (no calculation can follow)', () => {
    const as = ex('assisted_pull_up', [set(40, 15, null, { ...easy, loadMode: 'assisted', ...at(5) })], null, { target: T });
    expect(nextSetsOffer(as, 5)).toBeNull();
    const dips = ex('dips', [set(0, 15, null, { ...easy, loadMode: 'bodyweight_plus', ...at(5) })], null, { target: T });
    expect(nextSetsOffer(dips, 5)).toBeNull();
  });
  it('R3 left + right count as one set: L, R easy, then L to the limit (2 of 3 done) still gets the calculation', () => {
    const e = ex('standing_leg_curl', [set(10, 15, null, { ...easy, side: 'left', ...at(5) }), set(10, 15, null, { ...easy, side: 'right', ...at(6) }), set(25, 8, null, { ...max, side: 'left', ...at(9) })], null, { target: T });
    // 25 × (1 + 8/30) = 31.67; ÷ (1 + (12.5 + 1.5)/30) = 21.59 → 20 kg (2.5 kg steps)
    expect(nextSetsOffer(e, 2.5)).toMatchObject({ change: 'calc', weightKg: 20 });
  });
  it('R4 on a stack 2.5 / 7.5 / 12.5 … the result is a plate that exists: 22.5, not 20', () => {
    // 27.5 × (1 + 8/30) = 34.83; ÷ (1 + 14/30) = 23.75 → the stack's 22.5
    expect(workingWeightFromSets([set(27.5, 8, null, max)], { min: 10, max: 15 }, { min: 1, max: 2 }, 5, { minKg: 2.5 })!.weightKg).toBe(22.5);
  });
  it('R6 a declined calculated weight is not offered again after the next set (same weight)', () => {
    const T2: ExerciseTarget = { ...T, sets: 4, reps: [{ min: 6, max: 10 }], rir: [{ min: 2, max: 3 }] };
    const e1 = ex('barbell_row', [set(60, 8, null, { ...hard, ...at(5) })], null, { target: T2 });
    const o = nextSetsOffer(e1, 5)!;
    expect(o).toMatchObject({ change: 'calc', weightKg: 55 }); // 60 × (1 + 8.5/30) = 77 ÷ 1.35 = 57.04 → 55
    const kept = keepOffer(e1, o);
    const e2 = { ...kept, sets: [...kept.sets, set(57.5, 7, null, { effort: 'appropriate', ...at(9) })] };
    expect(nextSetsOffer(e2, 5)).toBeNull();
  });
  it('one wording and one rounding for "sets left today"', () => {
    setLang('en', false);
    expect(setsLeftTodayText(1)).toBe('1 set left today');
    expect(setsLeftTodayText(2.3)).toBe('≈2.5 sets left today');
  });
});

describe('obs. 8 — every credited muscle is named', () => {
  it('pull-up: lats, upper back ½, biceps ½ (not "lats" alone); pec deck: chest', () => {
    const name = (m: string) => m;
    expect(muscleCreditText(reg.get('pull_up')!, name)).toBe('lats · upper_back ½ · biceps ½');
    expect(muscleCreditText(reg.get('pec_deck')!, name)).toBe('chest');
    expect(muscleCreditText(reg.get('barbell_row')!, name)).toBe('upper_back · lats ¾ · rear_delts ½ · biceps ½');
  });
});

describe('obs. 9 / 10 — "ready" must not read as "done" in Russian; the order tip only early in the session', () => {
  const pulls = [ex('pull_up', [set(0, 7, null, { ...max, loadMode: 'bodyweight_plus' }), set(0, 6, null, { ...max, loadMode: 'bodyweight_plus' })], null, { variation: { loading: 'bodyweight' } })];
  it('RU: "МОЖНО НАГРУЖАТЬ", never "ГОТОВО"', () => {
    setLang('ru', false);
    const w = live(pulls);
    const d = data([monday(), w]);
    const c = assessChoice({ data: d, analysis: analyze(d, WED), workout: w, exerciseId: 'reverse_pec_deck' });
    setLang('en', false);
    expect(c.muscles[0].text).toMatch(/МОЖНО НАГРУЖАТЬ/);
    expect(c.muscles.map((m) => m.text).join(' ')).not.toMatch(/ГОТОВО/);
  });
  it('triceps isolation as the 6th exercise: no "if you still plan chest compounds" tip; as the 1st it is shown', () => {
    const many = live([...pulls, ex('barbell_row', [set(40, 10, null, hard)]), ex('seated_leg_curl', [set(40, 12, null, hard)]), ex('reverse_pec_deck', [set(25, 12, null, hard)]), ex('lateral_raise', [set(10, 12, null, hard)])]);
    const d = data([monday(), many]);
    const late = assessChoice({ data: d, analysis: analyze(d, WED), workout: many, exerciseId: 'triceps_pushdown_bar' });
    expect(late.position).toBe('SECOND HALF');
    expect(late.findings.map((f) => f.code)).not.toContain('order_host');
    const first = live();
    const d1 = data([monday(), first]);
    const early = assessChoice({ data: d1, analysis: analyze(d1, WED), workout: first, exerciseId: 'triceps_pushdown_bar' });
    expect(early.findings.map((f) => f.code)).toContain('order_host');
  });
});

describe('obs. 11 — one more set after Finish', () => {
  it('a training-mode workout finished today can be continued; sets are untouched; yesterday\'s or an imported one cannot', () => {
    const w = { ...live([ex('cable_crunch', [set(30, 12, null, hard)])]), endTime: '19:17', durationMin: 77, finishedAt: '2026-11-25T19:17:00Z' };
    expect(canContinue(w, '2026-11-25')).toBe(true);
    expect(canContinue(w, '2026-11-26')).toBe(false);
    expect(canContinue({ ...w, source: 'claude_import' }, '2026-11-25')).toBe(false);
    const c = continueWorkout(w, '2026-11-25T19:21:00Z');
    expect(c.endTime).toBeNull();
    expect(c.durationMin).toBeNull();
    expect('finishedAt' in c).toBe(false);
    expect(c.exercises).toEqual(w.exercises);
    expect(c.startTime).toBe('18:00');
  });
});

describe('audit findings fixed with the third analysis', () => {
  it('obs. 7 (explained, not changed): incline press 4 sets gives front delts 4 × 0.5 = 2, minus the technique-broken set (0.5 × 0.7) → 1.85 < 2 = no recovery entry', () => {
    const d = data([monday()]);
    const a = analyze(d, WED);
    // pec deck credits front delts 0.25 — below 0.5, so it never counts toward a "significant session".
    expect(a.recovery.front_delts.status).toBe('insufficient_data');
    expect(a.muscles.find((m) => m.muscle === 'front_delts')!.completed).toBeCloseTo(4 * 0.5 - 0.15 + 2 * 0.25, 2);
  });
});

describe('exercise mappings — sibling consistency (owner 2026-11-25, all 84 re-checked)', () => {
  const c = (id: string) => reg.get(id)!.contributions;
  it('the eight corrected mappings (hand-typed)', () => {
    expect(c('dumbbell_shoulder_press').traps).toBe(0.25);
    expect(c('machine_shoulder_press').traps).toBe(0.25);
    expect(c('overhead_press').traps).toBe(0.25); // the sibling they follow
    expect(c('dumbbell_row').traps).toBe(0.25);
    expect(c('machine_dip').front_delts).toBe(0.5);
    expect(c('dips').front_delts).toBe(0.5);
    expect(c('hack_squat').glutes).toBe(0.75);
    expect(c('pendulum_squat').adductors).toBe(0.5);
    expect(c('hammer_curl')).toEqual({ biceps: 1, forearms: 0.5 });
    expect(c('reverse_curl')).toEqual({ forearms: 1, biceps: 0.75 });
    expect(c('straight_arm_pulldown').upper_back).toBe(0.25);
    expect([c('face_pull').traps, c('reverse_pec_deck').traps, c('rear_delt_fly').traps]).toEqual([0.25, 0.25, 0.25]);
  });
  it('pull-ups credit the biceps (0.5), upper back (0.5), rear delts and forearms (0.25) — not only the lats', () => {
    expect(c('pull_up')).toEqual({ lats: 1, upper_back: 0.5, biceps: 0.5, rear_delts: 0.25, forearms: 0.25 });
  });
});

