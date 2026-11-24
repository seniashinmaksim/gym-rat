/**
 * F.9 Workout check: the step-by-step numbers of one workout. Expected values are computed by hand in the
 * comments (default model: RIR 0–3 → 1, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥ 8 → 0; unknown effort → 0.75).
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { buildRegistry } from '../src/domain/registry';
import { computeVolume } from '../src/domain/volume';
import { workoutCheck } from '../src/domain/workoutCheck';
import { data, ex, set, workout } from './fixtures';

const m = DEFAULT_QUALITY;
const reg = buildRegistry([], []);
const bare = (w: number, r: number, extra = {}) => set(w, r, null, extra);

describe('F.9 workout check', () => {
  // Incline dumbbell press (chest 1, front delts 0.5, triceps 0.5): 12.5 × 10 (no answer), 22.5 × 12 @ RIR 2, 22.5 × 10 (no answer).
  // Pec deck after it (chest 1, front delts 0.25): 45 × 12 @ RIR 1, 45 × 11 @ RIR 4.
  const press = ex('incline_dumbbell_press', [bare(12.5, 10), set(22.5, 12, 2), bare(22.5, 10)]);
  const deck = ex('pec_deck', [set(45, 12, 1), set(45, 11, 4)], 'pd_a');
  const w = workout('2026-11-24', [press, deck]);
  const c = workoutCheck(w, reg, m);

  it('per set: what the numbers say and the credit', () => {
    const [a, b, d] = c.exercises[0].sets;
    // 12.5 × 10 before the best set 22.5 × 12: Epley 30 × (31.5 / 12.5 − 1) = 45.6; Brzycki 37 − 25 × 12.5/22.5 = 23.11 → the lower,
    // 23.11 (> 20, but 10 ≤ half of it) → 13.1 in reserve → credit 0 (Part 7).
    expect(a.objective).toMatchObject({ kind: 'ramp', estRir: 13.1 });
    expect(a.quality.credit).toBe(0);
    // 22.5 × 12 @ RIR 2 → 1; the next set lost 2 reps, which agrees with "close to the limit".
    expect(b.quality.credit).toBe(1);
    expect(b.report.rir).toBe(2);
    // 22.5 × 10, no answer, last set → provisional 0.75.
    expect(d.quality.credit).toBe(0.75);
    expect(d.report).toMatchObject({ rir: null, tap: null, reservedAs: null });
    expect(c.exercises[1].sets.map((s) => s.quality.credit)).toEqual([1, 0.6]);
  });

  it('per exercise: coefficient × Σ credit', () => {
    const p = c.exercises[0];
    expect(p.workingSets).toBe(3);
    // Σ credit = 0 + 1 + 0.75 = 1.75 → chest 1.75, front delts 0.875 → 0.88, triceps 0.88.
    expect(p.muscles.find((x) => x.muscle === 'chest')).toMatchObject({ coefficient: 1, creditSets: 1.75, effective: 1.75 });
    expect(p.muscles.find((x) => x.muscle === 'front_delts')).toMatchObject({ coefficient: 0.5, effective: 0.88 });
    // Pec deck: Σ credit = 1.6 → chest 1.6, front delts 0.25 × 1.6 = 0.4.
    const d = c.exercises[1];
    expect(d.muscles.find((x) => x.muscle === 'chest')?.effective).toBe(1.6);
    expect(d.muscles.find((x) => x.muscle === 'front_delts')?.effective).toBe(0.4);
  });

  it('context: the pec deck came after 1.75 effective… no — after 2 counted chest sets of the press → pre-loaded', () => {
    // Pre-load counts performed non-warm-up sets × coefficient (not credit): the press has no recorded warm-up tag,
    // so 3 sets × chest 1.0 = 3 ≥ 2 → pre-loaded by chest, from the press.
    expect(c.exercises[0].context.bucket).toBe('fresh');
    expect(c.exercises[1].context).toMatchObject({ bucket: 'preloaded', sets: 3, muscle: 'chest', from: ['incline_dumbbell_press'] });
  });

  it('per muscle: the parts add up to exactly what the weekly numbers use', () => {
    const chest = c.muscles.find((x) => x.muscle === 'chest')!;
    expect(chest.parts.map((p) => p.effective)).toEqual([1.75, 1.6]);
    expect(chest.sum).toBe(3.35);
    expect(chest.counted).toBe(3.35);
    expect(chest.tapered).toBe(false);
    const vol = computeVolume([w], reg, m).muscles;
    for (const x of c.muscles) expect(x.counted).toBe(vol[x.muscle].effective);
    // Front delts: 0.875 + 0.4 = 1.275 → 1.28 (rounded once, on the sum).
    expect(c.muscles.find((x) => x.muscle === 'front_delts')?.counted).toBe(1.28);
  });

  it('the per-session ceiling is shown as a difference between the sum and the counted number', () => {
    // 14 pec-deck sets at RIR 1: sum 14. With the taper set to ×0.5: 11 + 3 × 0.5 = 12.5. Default (Part 7): ×1 → 14, a note only.
    const many = workout('2026-11-24', [ex('pec_deck', Array.from({ length: 14 }, () => set(45, 12, 1)), 'pd_a')]);
    const chest = workoutCheck(many, reg, { ...m, beyondSessionCapCredit: 0.5 }).muscles.find((x) => x.muscle === 'chest')!;
    expect(chest.sum).toBe(14);
    expect(chest.counted).toBe(12.5);
    expect(chest.tapered).toBe(true);
    const plain = workoutCheck(many, reg, m).muscles.find((x) => x.muscle === 'chest')!;
    expect([plain.counted, plain.tapered]).toEqual([14, false]);
  });

  it('left + right count as one set; planned rows and unknown exercises are handled', () => {
    const sides = ex('cable_lateral_raise', [set(5, 12, 1, { side: 'left' }), set(5, 10, 1, { side: 'right' }), bare(5, 12, { planned: true })]);
    const unknown = ex('no_such_exercise', [set(10, 10, 2)]);
    const r = workoutCheck(workout('2026-11-24', [sides, unknown]), reg, m);
    expect(r.exercises[0].sets).toHaveLength(2); // the planned row is not a performed set
    expect(r.exercises[0].sets.map((s) => s.factor)).toEqual([0.5, 0.5]);
    expect(r.exercises[0].workingSets).toBe(1);
    expect(r.exercises[0].muscles.find((x) => x.muscle === 'side_delts')?.effective).toBe(1);
    expect(r.exercises[1]).toMatchObject({ known: false, muscles: [] });
  });

  it('the history of the exercise comes from the same progression series', () => {
    const earlier = workout('2026-11-17', [ex('pec_deck', [set(45, 12, 1), set(45, 12, 1)], 'pd_a')]);
    const a = analyze(data([earlier, w]), new Date('2026-11-24T20:00:00Z'));
    const r = workoutCheck(w, a.registry, m, a.progression);
    const h = r.exercises[1].history!;
    expect(h.session?.workoutId).toBe(w.id);
    expect(h.previous?.workoutId).toBe(earlier.id);
    expect(h.series.indexBasis).toBe('rir');
    // Index of this session: best of 45 × (12 + 1) and 45 × (11 + 4) by Epley → 45 × (1 + 15 / 30) = 67.5.
    expect(h.session?.index).toBe(67.5);
  });
});
