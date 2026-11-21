import { describe, expect, it } from 'vitest';
import { assignBenchAngle } from '../src/domain/bulkEdit';
import { ex, set, workout } from './fixtures';

describe('assign an angle to earlier sessions', () => {
  const w1 = workout('2026-11-02', [ex('incline_dumbbell_press', [set(22, 10)]), ex('pec_deck', [set(45, 12)])]);
  const w2 = workout('2026-11-05', [ex('incline_dumbbell_press', [set(24, 9)], null, { variation: { benchAngleDeg: 45 } })]);
  const w3 = workout('2026-11-08', [ex('incline_dumbbell_press', [set(24, 10)])]);
  it('only fills missing angles, keeps sets intact and records an audit note', () => {
    const out = assignBenchAngle([w1, w2, w3], { workoutIds: [w1.id, w2.id], exerciseId: 'incline_dumbbell_press', equipmentId: null, exerciseName: 'Incline DB press' }, 30, '2026-11-21T10:00:00Z');
    expect(out.map((w) => w.id)).toEqual([w1.id]); // w2 already had 45°, w3 not selected
    expect(out[0].exercises[0].variation?.benchAngleDeg).toBe(30);
    expect(out[0].exercises[0].sets).toEqual(w1.exercises[0].sets);
    expect(out[0].exercises[1]).toEqual(w1.exercises[1]);
    expect(out[0].audit?.[0].note).toMatch(/Bench angle set to 30°/);
    expect(w1.exercises[0].variation).toBeUndefined(); // input not mutated
  });
});
