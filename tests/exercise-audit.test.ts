/**
 * Exercise → muscle mapping audit (E.11, 2026-11-22). Expected values are typed by hand from the audit decisions
 * and CLAUDE.md §C/§F — never read back from the library — so a wrong mapping cannot agree with itself.
 */
import { describe, expect, it } from 'vitest';
import { SEED_BY_ID, SEED_EXERCISES } from '../src/data/exercises';
import { EXERCISE_AUDIT, EXERCISE_AUDIT_BY_ID } from '../src/data/scientific-evidence/exerciseAudit';
import { REFERENCE_BY_ID } from '../src/data/scientific-evidence/references';
import { analyze } from '../src/domain/analysis';
import { assessChoice } from '../src/domain/exerciseChoice';
import { buildRegistry, resolveCoefficients } from '../src/domain/registry';
import { computeVolume } from '../src/domain/volume';
import type { MuscleId } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

/** The owner's exercises (CLAUDE.md §F + the audit list), by hand. */
const EXPECTED: Record<string, Partial<Record<MuscleId, number>>> = {
  incline_dumbbell_press: { chest: 1, front_delts: 0.5, triceps: 0.5 },
  triceps_pushdown_bar: { triceps: 1 },
  triceps_pushdown_rope: { triceps: 1 },
  pec_deck: { chest: 1, front_delts: 0.25 },
  machine_biceps_curl: { biceps: 1, forearms: 0.25 },
  ez_bar_curl: { biceps: 1, forearms: 0.25 },
  lateral_raise: { side_delts: 1, traps: 0.25 },
  cable_lateral_raise: { side_delts: 1, traps: 0.25 },
  back_squat: { quads: 1, glutes: 0.75, adductors: 0.75, spinal_erectors: 0.25 },
  leg_extension: { quads: 1 },
  romanian_deadlift: { hamstrings: 1, glutes: 0.75, adductors: 0.5, spinal_erectors: 0.25 },
  seated_leg_curl: { hamstrings: 1, calves: 0.25 },
  hanging_knee_raise_pelvic_curl: { abs: 1 },
  pull_up: { lats: 1, upper_back: 0.5, biceps: 0.5, rear_delts: 0.25, forearms: 0.25 },
  deadlift: { glutes: 1, hamstrings: 0.5, quads: 0.5, adductors: 0.5, spinal_erectors: 0.25, traps: 0.25, forearms: 0.25 },
  overhead_press: { front_delts: 1, triceps: 0.5, side_delts: 0.25, traps: 0.25 },
  barbell_row: { upper_back: 1, lats: 0.75, biceps: 0.5, rear_delts: 0.5, spinal_erectors: 0.25, traps: 0.25, forearms: 0.25 },
  shrug: { traps: 1 },
  farmer_carry: { forearms: 1, traps: 0.25 },
  front_squat: { quads: 1, glutes: 0.5, adductors: 0.5, spinal_erectors: 0.25 },
  leg_press: { quads: 1, glutes: 0.75, adductors: 0.5 },
  close_grip_bench: { triceps: 1, chest: 0.75, front_delts: 0.5 },
  face_pull: { rear_delts: 1, upper_back: 0.5, traps: 0.25, biceps: 0.25 },
};
const coef = (id: string) => SEED_BY_ID[id].contributions;

describe('the audit covers the whole library and documents every classification', () => {
  it('every exercise has exactly one audit entry; the audit records exactly the coefficients the library uses', () => {
    expect(EXERCISE_AUDIT).toHaveLength(SEED_EXERCISES.length);
    expect(new Set(EXERCISE_AUDIT.map((a) => a.id)).size).toBe(EXERCISE_AUDIT.length);
    for (const e of SEED_EXERCISES) {
      const a = EXERCISE_AUDIT_BY_ID[e.id];
      expect(a, e.id).toBeDefined();
      expect(a.coefficients, e.id).toEqual(e.contributions); // the library is the single source of truth
    }
  });
  it('every entry has a rationale, a confidence, resolvable evidence ids; uncertain ones say so', () => {
    for (const a of EXERCISE_AUDIT) {
      expect(a.rationale.length, a.id).toBeGreaterThan(30);
      expect(['high', 'moderate', 'low']).toContain(a.confidence);
      for (const r of a.refIds) expect(REFERENCE_BY_ID[r], `${a.id} → ${r}`).toBeDefined();
      if (a.verdict === 'corrected') expect(a.previous, a.id).not.toBeNull();
    }
    expect(EXERCISE_AUDIT.filter((a) => a.verdict === 'uncertain').length).toBeGreaterThan(0); // not claimed fully verified
  });
  it('only the allowed coefficient steps are used (1 / 0.75 / 0.5 / 0.25)', () => {
    for (const e of SEED_EXERCISES) for (const [m, c] of Object.entries(e.contributions)) expect([1, 0.75, 0.5, 0.25], `${e.id} ${m}`).toContain(c);
  });
  it('stabilisers are never credited as trained muscles (≤ 0.25)', () => {
    for (const a of EXERCISE_AUDIT) for (const m of a.stabilizers) expect(coef(a.id)[m] ?? 0, `${a.id} ${m}`).toBeLessThanOrEqual(0.25);
  });
});

describe('the owner\'s exercises map to the right muscles (independent expected values)', () => {
  for (const [id, exp] of Object.entries(EXPECTED)) {
    it(id, () => expect(coef(id)).toEqual(exp));
  }
  it('regressions for every corrected mapping: stabiliser credit removed / reduced', () => {
    expect(coef('romanian_deadlift').forearms).toBeUndefined();
    expect(coef('romanian_deadlift').traps).toBeUndefined();
    expect(coef('shrug').forearms).toBeUndefined();
    expect(coef('overhead_press').abs).toBeUndefined();
    expect(coef('farmer_carry').abs).toBeUndefined();
    expect(coef('front_squat').upper_back).toBeUndefined();
    expect(coef('deadlift').upper_back).toBeUndefined();
    for (const id of ['machine_pulldown', 'assisted_pull_up', 'chest_supported_row', 't_bar_row', 'close_grip_pulldown']) expect(coef(id).forearms, id).toBe(0.25);
    expect(coef('close_grip_pulldown').rear_delts).toBe(0.25);
    expect(coef('smith_squat').glutes).toBe(0.75);
  });
  it('the ambiguous aliases "пресс" (= abs) and "sit up" (a different movement) no longer resolve to crunch', () => {
    expect(SEED_BY_ID.crunch.aliases).not.toContain('пресс');
    expect(SEED_BY_ID.crunch.aliases).not.toContain('sit up');
  });
});

describe('variations change muscle credit only where justified', () => {
  const r = (id: string, v: Parameters<typeof resolveCoefficients>[1]) => resolveCoefficients(SEED_BY_ID[id], v).contributions;
  it('bench angle groups on the incline DB press: 15°, 30° and 45° alike; > 45° shifts to front delts', () => {
    for (const a of [15, 30, 45]) expect(r('incline_dumbbell_press', { benchAngleDeg: a })).toEqual({ chest: 1, triceps: 0.5, front_delts: 0.5 });
    expect(r('incline_dumbbell_press', { benchAngleDeg: 60 })).toMatchObject({ chest: 0.75, front_delts: 0.75 });
    expect(r('dumbbell_bench_press', { benchAngleDeg: -15 }).front_delts).toBe(0.25);
  });
  it('a bench angle outside -30…90° (typo) is ignored, not turned into a rule', () => {
    expect(r('incline_dumbbell_press', { benchAngleDeg: 300 })).toEqual(coef('incline_dumbbell_press'));
  });
  it('underhand grip raises biceps on pulldowns / chin-ups only — not on the straight-arm pulldown (regression)', () => {
    expect(r('lat_pulldown', { grip: 'supinated' }).biceps).toBe(0.75);
    expect(r('pull_up', { grip: 'supinated' }).biceps).toBe(0.75);
    expect(r('straight_arm_pulldown', { grip: 'supinated' }).biceps).toBeUndefined();
  });
  it('squat depth: full depth credits glutes / adductors 0.75; above parallel 0.5', () => {
    expect(r('back_squat', { depth: 'below_parallel' })).toMatchObject({ glutes: 0.75, adductors: 0.75 });
    expect(r('back_squat', { depth: 'above_parallel' })).toMatchObject({ glutes: 0.5, adductors: 0.5 });
  });
  it('weighted vs bodyweight pull-ups: the same muscles (load is not a muscle change)', () => {
    expect(r('pull_up', { loading: 'weighted' })).toEqual(r('pull_up', { loading: 'bodyweight' }));
  });
});

describe('fractional counting end to end (weekly aggregation)', () => {
  const w = workout('2026-11-17', [
    ex('incline_dumbbell_press', [set(25, 10, 2), set(25, 9, 2), set(25, 8, 2)], null, { variation: { benchAngleDeg: 30 } }),
    ex('pec_deck', [set(45, 12, 1), set(45, 11, 1)], 'pd_a'),
    ex('back_squat', [set(80, 8, 2), set(80, 8, 2), set(80, 7, 2)]),
    ex('romanian_deadlift', [set(70, 10, 2), set(70, 9, 2)]),
  ]);
  const d = data([w]);
  const reg = buildRegistry([], []);
  const v = computeVolume([w], reg, d.settings.quality).muscles;
  it('each muscle gets Σ coefficient × sets (RIR 1–2 → credit 1), computed by hand', () => {
    expect(v.chest.effective).toBe(5); // 3 × 1 + 2 × 1
    expect(v.triceps.effective).toBe(1.5); // 3 × 0.5
    expect(v.front_delts.effective).toBe(2); // 3 × 0.5 + 2 × 0.25
    expect(v.quads.effective).toBe(3);
    expect(v.glutes.effective).toBe(3.75); // squat 3 × 0.75 + RDL 2 × 0.75
    expect(v.adductors.effective).toBe(3.25); // 3 × 0.75 + 2 × 0.5
    expect(v.hamstrings.effective).toBe(2);
    expect(v.spinal_erectors.effective).toBe(1.25); // 5 × 0.25
    expect(v.forearms.effective).toBe(0); // RDL grip is not credited any more
  });
  it('no double counting: one set credits each muscle once; the raw set count never changes', () => {
    expect(v.chest.rawWorkingSets).toBe(5);
    expect(v.glutes.rawWorkingSets).toBe(5);
    const total = computeVolume([w], reg, d.settings.quality).totalWorkingSets;
    expect(total).toBe(10);
  });
  it('a corrected classification (override) recalculates history from raw sets; stored workouts are untouched', () => {
    const before = JSON.stringify(d.workouts);
    const reg2 = buildRegistry([], [{ id: 'pec_deck', contributions: { chest: 1 }, updatedAt: '' }]);
    const v2 = computeVolume(d.workouts, reg2, d.settings.quality).muscles;
    expect(v2.front_delts.effective).toBe(1.5); // pec deck no longer gives 2 × 0.25
    expect(JSON.stringify(d.workouts)).toBe(before);
  });
});

describe('one source of truth: every consumer uses the same mapping', () => {
  it('recovery: stabiliser-level credit (0.25) never starts a recovery hold, however many sets', () => {
    // 10 barbell-row sets: forearms 10 × 0.25 = 2.5 effective (≥ the 2-set threshold) — still no hold for forearms.
    const rows = workout('2026-11-18', [ex('barbell_row', Array.from({ length: 10 }, () => set(60, 10, 1)))], { startTime: '17:00', endTime: '18:00' });
    const a = analyze(data([rows]), new Date('2026-11-19T08:00:00Z'));
    expect(a.recovery.forearms.status).not.toBe('recovering');
    expect(a.recovery.upper_back.status).toBe('recovering');
  });
  it('an override reaches the choice assistant and remaining sets (no second copy of coefficients)', () => {
    const d2 = data([], { exerciseOverrides: [{ id: 'pec_deck', contributions: { chest: 1 }, updatedAt: '' }] });
    const a = analyze(d2, new Date('2026-11-16T17:00:00Z'));
    const c = assessChoice({ data: d2, analysis: a, workout: null, exerciseId: 'pec_deck' });
    expect(c.muscles.map((m) => m.muscle)).toEqual(['chest']);
  });
});
