/**
 * Part 9 — Exercise Optimality Score (FIX_PLAN I.2 + I.4). Written BEFORE the implementation; the points in every
 * comment are the design note's deductions, computed by hand. All data is synthetic.
 *
 * Usual week (four full weeks from Monday 2026-10-19): Mon pec deck + biceps curls, Tue pull-ups then rows,
 * Thu leg extensions + pec deck + pushdowns. Today: Monday 2026-11-16, live session started 17:00 with 4 pec-deck sets.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import type { AppData } from '../src/domain/appdata';
import { optimality, rankOptions, OPTIMALITY_POINTS, type Optimality } from '../src/domain/optimality';
import { RULES } from '../src/data/scientific-evidence/rules';
import { setLang } from '../src/i18n/core';
import type { Workout, WorkoutExercise } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);
const pec = (n: number, rir = 2) => ex('pec_deck', times(n, () => set(40, 12, rir)), 'pd');
const curls = (n: number, rir = 1) => ex('machine_biceps_curl', times(n, () => set(30, 10, rir)), 'bc');
const pullups = (n: number) => ex('pull_up', times(n, () => set(0, 8, 2, { loadMode: 'bodyweight_plus' })), null, { variation: { loading: 'bodyweight', gripWidth: 'shoulder' } });
const rows = (n: number) => ex('seated_cable_row', times(n, () => set(50, 10, 2)), 'row');
const legs = (n: number) => ex('leg_extension', times(n, () => set(50, 12, 2)), 'le');
const pushdown = (n: number) => ex('triceps_pushdown_rope', times(n, () => set(25, 12, 2)), 'tp');
const day = (d: string, exs: WorkoutExercise[]) => workout(d, exs, { startTime: '17:00', endTime: '18:00' });
const EQUIPMENT = [
  { id: 'pd', name: 'Pec deck', locationId: 'gym_a', exerciseIds: ['pec_deck'], photoIds: [], createdAt: '' },
  { id: 'pd2', name: 'Pec deck 2', locationId: 'gym_a', exerciseIds: ['pec_deck'], photoIds: [], createdAt: '' },
  { id: 'bc', name: 'Curl machine', locationId: 'gym_a', exerciseIds: ['machine_biceps_curl'], photoIds: [], createdAt: '' },
  { id: 'row', name: 'Cable row', locationId: 'gym_a', exerciseIds: ['seated_cable_row'], photoIds: [], createdAt: '' },
  { id: 'le', name: 'Leg extension', locationId: 'gym_a', exerciseIds: ['leg_extension'], photoIds: [], createdAt: '' },
  { id: 'tp', name: 'Cable station', locationId: 'gym_a', exerciseIds: ['triceps_pushdown_rope'], photoIds: [], createdAt: '' },
] as unknown as AppData['equipment'];

function history(): Workout[] {
  const out: Workout[] = [];
  for (const [mon, tu, th] of [['2026-10-19', '2026-10-20', '2026-10-22'], ['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']]) {
    out.push(day(mon, [pec(4), curls(4)]), day(tu, [pullups(4), rows(3)]), day(th, [legs(3), pec(3), pushdown(2)]));
  }
  return out;
}
const NOW = new Date('2026-11-16T17:30:00Z');
function setup(hist: Workout[] = history(), live: WorkoutExercise[] = [pec(4)], patch: Partial<AppData> = {}, now = NOW, date = '2026-11-16') {
  const w = workout(date, live, { startTime: '17:00' });
  const d = data([...hist, w], { equipment: EQUIPMENT, ...patch });
  return { d, a: analyze(d, now), w };
}
const score = (o: Optimality) => o.score as number;
const factors = (o: Optimality) => o.deductions.map((x) => x.factor);

describe('the score itself: 100 − deductions, rounded to 5, three groups', () => {
  it('a familiar exercise for an open muscle with nothing against it scores 100, suitable', () => {
    const { d, a, w } = setup();
    // Pull-ups today, 2 sets: lats window 24 h ends at Tuesday's session (inside the 6 h tolerance) → no forward finding;
    // lats week open; 4 sessions logged; bodyweight (no machine needed); usual days known.
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'pull_up', sets: 2 });
    expect(o.group).toBe('suitable');
    expect(o.score).toBe(100);
    expect(o.why.length).toBeGreaterThan(0);
  });
  it('every score is a multiple of 5 between 5 and 100', () => {
    const { d, a, w } = setup();
    for (const id of ['pull_up', 'leg_extension', 'pec_deck', 'cable_fly', 'seated_cable_row', 'dumbbell_curl', 'triceps_pushdown_rope']) {
      const o = optimality({ data: d, analysis: a, workout: w, exerciseId: id });
      if (o.score != null) { expect(o.score % 5).toBe(0); expect(o.score).toBeGreaterThanOrEqual(5); expect(o.score).toBeLessThanOrEqual(100); }
    }
  });
});

describe('I.2 #1 — descending order (NOT TODAY last, never interleaved)', () => {
  it('rankOptions sorts scored options high → low, suitable before less optimal, not-today after them', () => {
    const { d, a, w } = setup();
    const list = ['pull_up', 'machine_biceps_curl', 'leg_extension', 'pec_deck', 'cable_fly', 'seated_cable_row'].map((id) => optimality({ data: d, analysis: a, workout: w, exerciseId: id }));
    const ranked = rankOptions(list, (id) => id);
    const rank = { suitable: 0, less_optimal: 1, not_today: 2 } as const;
    for (let i = 1; i < ranked.length; i++) {
      expect(rank[ranked[i - 1].group]).toBeLessThanOrEqual(rank[ranked[i].group]);
      if (ranked[i - 1].group === ranked[i].group && ranked[i].score != null) expect(score(ranked[i - 1])).toBeGreaterThanOrEqual(score(ranked[i]));
    }
  });
});

describe('I.2 #2 — better recovery → higher score, all else equal', () => {
  // Sunday 18:00–19:00 curls: 4 sets RIR 1 → biceps 4 effective → 36 h window → ends Tue 07:00 → 13.5 h left at
  // Mon 17:30 (> 6 h) → biceps (0.5 in pull-ups) RECENTLY LOADED, no familiar option spares it → −5.
  // 1 set → 24 h → ends Mon 19:00 → 1.5 h left (inside the 6 h tolerance) → ready → 0.
  const sunday = (n: number) => workout('2026-11-15', [curls(n)], { startTime: '18:00', endTime: '19:00' });
  it('pull-ups score 5 lower when a synergist is still inside its window', () => {
    const fresh = setup([...history(), sunday(1)]);
    const loaded = setup([...history(), sunday(4)]);
    const a = optimality({ data: fresh.d, analysis: fresh.a, workout: fresh.w, exerciseId: 'pull_up', sets: 2 });
    const b = optimality({ data: loaded.d, analysis: loaded.a, workout: loaded.w, exerciseId: 'pull_up', sets: 2 });
    expect(factors(b)).toContain('synergist_recovering');
    expect(score(a) - score(b)).toBe(OPTIMALITY_POINTS.synergistNoSpare);
  });
});

describe('I.2 #3 — compromising the next priority session is penalised', () => {
  it('a REAL LIMIT (4 curls → Tuesday pull-ups, 12 h left) → not recommended today, with the reason, no number', () => {
    const { d, a, w } = setup();
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(o.group).toBe('not_today');
    expect(o.score).toBeNull();
    expect(o.reason).toMatch(/pull-up/i);
  });
  it('a TIP (usual days from 3 full weeks → tips only) costs exactly the tip points versus no finding', () => {
    const { d, a, w } = setup(history().slice(3));
    const withTip = optimality({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 });
    const without = optimality({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 2 });
    expect(withTip.group).not.toBe('not_today');
    expect(factors(withTip)).toContain('forward_tip');
    expect(score(without) - score(withTip)).toBe(OPTIMALITY_POINTS.forwardTip);
  });
});

describe('I.2 #4 — an active recovery restriction is never recommended', () => {
  // Sunday 18:00–19:00: 6 pec-deck sets to failure → chest window ≥ 48 h → far beyond Monday 17:30.
  it('pec deck → not today, whatever the other factors (priority muscle, open week, familiar machine)', () => {
    const sun = workout('2026-11-15', [pec(6, 0)], { startTime: '18:00', endTime: '19:00' });
    const { d, w } = setup([...history(), sun], [pullups(3)]);
    const d2 = { ...d, settings: { ...d.settings, priorities: { chest: 'high' as const } } };
    const o = optimality({ data: d2, analysis: analyze(d2, NOW), workout: w, exerciseId: 'pec_deck', equipmentId: 'pd' });
    expect(o.group).toBe('not_today');
    expect(o.score).toBeNull();
    expect(o.reason).toMatch(/h left|recover/i);
  });
});

describe('I.2 #5 — a met weekly target lowers the ranking (owner 2026-11-24)', () => {
  it('primary (chest) week met → −35 → less optimal', () => {
    const { d, w } = setup();
    const d2 = { ...d, settings: { ...d.settings, targetOverrides: { chest: { min: 2, preferred: 4, max: 8 } } } };
    const o = optimality({ data: d2, analysis: analyze(d2, NOW), workout: w, exerciseId: 'pec_deck', equipmentId: 'pd' });
    expect(factors(o)).toContain('primary_week_met');
    expect(o.deductions.find((x) => x.factor === 'primary_week_met')?.points).toBe(35);
    expect(o.group).toBe('less_optimal');
    expect(score(o)).toBeLessThanOrEqual(65);
  });
  it('only the triceps week met: incline press loses 80 × 0.5 ÷ 2 = 20 points, pec deck nothing (owner: 95 is too high)', () => {
    const { d, w } = setup(history(), [pushdown(3)]);
    const d2 = { ...d, settings: { ...d.settings, targetOverrides: { triceps: { min: 1, preferred: 2, max: 6 } } } };
    const a2 = analyze(d2, NOW);
    expect(a2.muscles.find((m) => m.muscle === 'triceps')?.status).toMatch(/done|over/);
    expect(a2.muscles.find((m) => m.muscle === 'front_delts')?.status).not.toMatch(/done|over/);
    const incline = optimality({ data: d2, analysis: a2, workout: w, exerciseId: 'incline_dumbbell_press' });
    const fly = optimality({ data: d2, analysis: a2, workout: w, exerciseId: 'pec_deck', equipmentId: 'pd' });
    expect(incline.deductions.find((x) => x.factor === 'secondary_week_met')?.points).toBe(20);
    expect(fly.deductions.find((x) => x.factor === 'secondary_week_met')).toBeUndefined();
  });
  it('triceps AND front delts met → 40 points', () => {
    // 4 pec-deck sets give front delts 4 × 0.25 = 1 ≥ 0.5 → met.
    const { d, w } = setup(history(), [pushdown(3), pec(4)]);
    const d2 = { ...d, settings: { ...d.settings, targetOverrides: { triceps: { min: 1, preferred: 2, max: 6 }, front_delts: { min: 0, preferred: 0.5, max: 4 } } } };
    const o = optimality({ data: d2, analysis: analyze(d2, NOW), workout: w, exerciseId: 'incline_dumbbell_press' });
    expect(o.deductions.find((x) => x.factor === 'secondary_week_met')?.points).toBe(40);
  });
});

describe('I.2 #6 — changing the planned workout recalculates', () => {
  it('a planned row still to do (biceps 0.5) puts the curls behind it: an order deduction appears', () => {
    const base = setup(history(), [pec(4)]);
    const before = optimality({ data: base.d, analysis: base.a, workout: base.w, exerciseId: 'machine_biceps_curl', sets: 2 });
    const planned = { ...base.w, exercises: [...base.w.exercises, ex('seated_cable_row', [], 'row')] };
    const d2 = { ...base.d, workouts: base.d.workouts.map((x) => (x.id === base.w.id ? planned : x)) };
    const after = optimality({ data: d2, analysis: analyze(d2, NOW), workout: planned, exerciseId: 'machine_biceps_curl', sets: 2 });
    // Before: only the quiet host hint ("if you still plan back compounds…", −5); after: a compound is really planned (−15).
    const pts = (o: Optimality) => o.deductions.find((x) => x.factor === 'order')?.points ?? 0;
    expect(pts(before)).toBeLessThanOrEqual(OPTIMALITY_POINTS.orderHost);
    expect(pts(after)).toBe(OPTIMALITY_POINTS.orderPending);
    expect(score(after)).toBeLessThan(score(before));
  });
});

describe('I.2 #7 — a move recalculates in the new day\'s context', () => {
  it('curls are not for Monday (Tuesday pull-ups), but on Tuesday after the pulls they are scored', () => {
    const mon = setup();
    expect(optimality({ data: mon.d, analysis: mon.a, workout: mon.w, exerciseId: 'machine_biceps_curl', sets: 4 }).group).toBe('not_today');
    const monDone = { ...mon.w, endTime: '18:00' };
    const tue = setup([...history(), monDone], [pullups(4), rows(3)], {}, new Date('2026-11-17T18:30:00Z'), '2026-11-17');
    const o = optimality({ data: tue.d, analysis: tue.a, workout: tue.w, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(o.group).not.toBe('not_today');
    expect(o.score).not.toBeNull();
  });
});

describe('I.2 #8 — identical inputs → identical scores; input order irrelevant; nothing changed', () => {
  it('deterministic and order-free', () => {
    const { d, a, w } = setup();
    const ids = ['pull_up', 'leg_extension', 'pec_deck', 'cable_fly', 'seated_cable_row', 'machine_biceps_curl', 'triceps_pushdown_rope'];
    const one = ids.map((id) => optimality({ data: d, analysis: a, workout: w, exerciseId: id }));
    const two = [...ids].reverse().map((id) => optimality({ data: d, analysis: a, workout: w, exerciseId: id }));
    expect(one).toEqual([...two].reverse());
    expect(rankOptions(one, (id) => id).map((o) => o.exerciseId)).toEqual(rankOptions(two, (id) => id).map((o) => o.exerciseId));
  });
  it('the score never changes a weekly number, a credit or a recovery window (data and analysis untouched)', () => {
    const { d, a, w } = setup();
    const snapD = JSON.stringify(d);
    const snapA = JSON.stringify({ m: a.muscles, r: a.planRecovery });
    for (const id of ['pull_up', 'pec_deck', 'machine_biceps_curl']) optimality({ data: d, analysis: a, workout: w, exerciseId: id });
    expect(JSON.stringify(d)).toBe(snapD);
    expect(JSON.stringify({ m: a.muscles, r: a.planRecovery })).toBe(snapA);
  });
});

describe('I.2 #9 — missing data caps the score and lowers confidence (never misleadingly high)', () => {
  it('no history at all → ≤ 60, low confidence', () => {
    const { d, a, w } = setup([], [pec(2)]);
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'pull_up', sets: 2 });
    expect(score(o)).toBeLessThanOrEqual(60);
    expect(o.confidence).toBe('low');
    expect(o.caps.map((c) => c.factor)).toContain('no_history');
  });
  it('an exercise never performed → ≤ 70 ("new: calibrate")', () => {
    const { d, a, w } = setup();
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'dumbbell_curl', sets: 2 });
    expect(score(o)).toBeLessThanOrEqual(70);
    expect(o.caps.map((c) => c.factor)).toContain('new_exercise');
  });
  it('performed once → ≤ 85', () => {
    const once = [...history(), day('2026-11-11', [ex('dumbbell_curl', times(3, () => set(12, 10, 2)))])];
    const { d, a, w } = setup(once);
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'dumbbell_curl', sets: 2 });
    expect(score(o)).toBeLessThanOrEqual(85);
    expect(o.caps.map((c) => c.factor)).toContain('one_session');
  });
  it('a machine exercise with no machine known at this gym → ≤ 80', () => {
    const { d, a, w } = setup(history(), [pec(4)], { equipment: EQUIPMENT.filter((e) => e.id !== 'le') });
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'leg_extension' });
    expect(score(o)).toBeLessThanOrEqual(80);
    expect(o.caps.map((c) => c.factor)).toContain('unknown_machine');
  });
  it('no usual days known (2 full weeks) → ≤ 90, and the next sessions could not be checked', () => {
    const { d, a, w } = setup(history().slice(6));
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'pull_up', sets: 2 });
    expect(score(o)).toBeLessThanOrEqual(90);
    expect(o.caps.map((c) => c.factor)).toContain('no_usual_days');
  });
  it('caps come first and deductions after them, so a cap never hides a difference', () => {
    const { d, a, w } = setup();
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'dumbbell_curl', sets: 2 });
    const ded = o.deductions.reduce((s, x) => s + x.points, 0);
    expect(o.score).toBe(Math.max(5, Math.min(...o.caps.map((c) => c.max), 100) - ded));
  });
});

describe('own tests', () => {
  it('ties: more sessions logged first, then the name, then the id', () => {
    const mk = (id: string, s: number, sessions: number): Optimality => ({ exerciseId: id, equipmentId: null, group: 'suitable', score: s, band: 'very_good', confidence: 'high', deductions: [], caps: [], reason: null, why: [], sessions });
    const r = rankOptions([mk('b', 90, 2), mk('a', 90, 2), mk('c', 90, 5), mk('d', 95, 0)], (id) => id.toUpperCase());
    expect(r.map((o) => o.exerciseId)).toEqual(['d', 'c', 'a', 'b']);
  });
  it('pain logged on the exercise → not today, the reason is the separate SAFETY line', () => {
    const hurt = [...history().slice(0, -1), day('2026-11-12', [legs(3), ex('pec_deck', [set(40, 12, 2, { feel: 'pain', pain: { area: 'Shoulder' } } as never)], 'pd')])];
    const { d, a, w } = setup(hurt, [pullups(2)]);
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'pec_deck', equipmentId: 'pd' });
    expect(o.group).toBe('not_today');
    expect(o.reason).toMatch(/SAFETY/);
  });
  it('busy machine → the same exercise on a free machine ranks above it', () => {
    const { d, a, w } = setup();
    const busy = { ...w, busyEquipment: [{ equipmentId: 'pd', at: '2026-11-16T17:20:00Z' }] } as unknown as Workout;
    const onBusy = optimality({ data: d, analysis: a, workout: busy, exerciseId: 'pec_deck', equipmentId: 'pd' });
    const onFree = optimality({ data: d, analysis: a, workout: busy, exerciseId: 'pec_deck', equipmentId: 'pd2' });
    expect(factors(onBusy)).toContain('machine_busy');
    expect(rankOptions([onBusy, onFree], (id) => id)[0].equipmentId).toBe('pd2');
  });
  it('rule exercise_optimality states its principle apart from its numbers (a heuristic)', () => {
    const r = RULES.find((x) => x.id === 'exercise_optimality');
    expect(r).toBeDefined();
    expect(r!.principle).toBeTruthy();
    expect(r!.number).toBeTruthy();
    expect(r!.basis).not.toBe('research');
  });
  it('Russian: the why and the reason are fully Russian', () => {
    setLang('ru');
    try {
      const { d, a, w } = setup();
      for (const [id, sets] of [['pull_up', 2], ['machine_biceps_curl', 4], ['dumbbell_curl', 2], ['pec_deck', 3]] as const) {
        const o = optimality({ data: d, analysis: a, workout: w, exerciseId: id, sets });
        for (const t of [...o.why, o.reason ?? '']) expect(t).not.toMatch(/\b(left|sets|week|today|session|score|fit|new|machine|pull-up)\b/i);
      }
    } finally { setLang('en'); }
  });
});
