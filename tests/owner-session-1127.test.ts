/**
 * Owner's session 2026-11-27: warm-ups offered in the training mode before the first working set. Hand-computed;
 * all numbers synthetic.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { logSet, prefillNext } from '../src/domain/liveFlow';
import { targetFromPrescription } from '../src/domain/planner';
import type { Equipment, ExerciseTarget, WorkoutExercise } from '../src/domain/types';
import { weekGroups, type MuscleWeek } from '../src/domain/analysis';
import { barTypeOf, barWeightFor, FREE_VERSION, SMITH_VERSION, smithAt } from '../src/domain/barType';
import { barBreakdown } from '../src/domain/increments';
import { buildRegistry } from '../src/domain/registry';
import { ex, set } from './fixtures';

const m = DEFAULT_QUALITY;
const T0 = Date.parse('2026-11-27T18:00:00Z');
const target: ExerciseTarget = { sets: 3, weightKg: 32, reps: [{ min: 8, max: 12 }], engine: 'presc-1', warmups: [{ weightKg: 16, reps: 8 }, { weightKg: 22, reps: 4 }, { weightKg: 28, reps: 2 }] };

describe('warm-ups first in the training mode (owner 2026-11-27)', () => {
  it('offers each warm-up in turn, logged as a warm-up the app never re-tags, then the working weight', () => {
    let e: WorkoutExercise = { ...ex('incline_dumbbell_press', []), target };
    expect(prefillNext(e, null)).toMatchObject({ weightKg: 16, reps: 8, warmup: { n: 1, of: 3 } });
    e = logSet(e, { weightKg: 16, reps: 8, loadMode: 'total', warmup: true }, T0, 's1', m);
    expect(e.sets[0]).toMatchObject({ type: 'warmup', typeSource: 'owner' });
    expect(prefillNext(e, null)).toMatchObject({ weightKg: 22, reps: 4, warmup: { n: 2, of: 3 } });
    e = logSet(e, { weightKg: 22, reps: 4, loadMode: 'total', warmup: true }, T0 + 120_000, 's2', m);
    e = logSet(e, { weightKg: 28, reps: 2, loadMode: 'total', warmup: true }, T0 + 240_000, 's3', m);
    // All three done: the working weight 32 and the plan's lower bound 8.
    const p = prefillNext(e, null);
    expect([p.weightKg, p.reps, p.from, p.warmup]).toEqual([32, 8, 'plan', undefined]);
  });
  it('"Skip warm-up" goes straight to the working weight; a working set ends the warm-ups', () => {
    const e = { ...ex('incline_dumbbell_press', []), target };
    expect(prefillNext(e, null, target, true)).toMatchObject({ weightKg: 32, from: 'plan' });
    const worked = logSet(e, { weightKg: 32, reps: 10, loadMode: 'total' }, T0, 's1', m);
    expect(prefillNext(worked, null).warmup).toBeUndefined();
  });
  it('warm-ups never decide what the working sets follow (last time\'s first set is not matched against them)', () => {
    const last = ex('incline_dumbbell_press', [set(30, 10, null), set(30, 9, null)]);
    let e: WorkoutExercise = { ...ex('incline_dumbbell_press', []), target: { ...target, warmups: [{ weightKg: 16, reps: 8 }] } };
    e = logSet(e, { weightKg: 16, reps: 8, loadMode: 'total', warmup: true }, T0, 's1', m);
    // The plan (32) is offered for the first working set; last time's 30 one tap away.
    expect(prefillNext(e, last)).toMatchObject({ weightKg: 32, from: 'plan', alt: { weightKg: 30, from: 'last' } });
  });
  it('the target keeps the prescribed warm-ups only for the prescribed weight', () => {
    const p = { workingWeightKg: 32, setCount: 3, sets: [], warmups: [{ weightKg: 16, reps: 8 }, { weightKg: null, reps: 8 }] };
    expect(targetFromPrescription(p).warmups).toEqual([{ weightKg: 16, reps: 8 }]);
    expect(targetFromPrescription(p, 3, 40, true).warmups).toBeUndefined();
  });
});

describe('free barbell vs Smith, and the bar (owner 2026-11-27)', () => {
  const reg = buildRegistry([], []);
  const d = (id: string) => reg.get(id)!;
  const eqOf = (kind: Equipment['kind'], barWeightKg: number | null = null) => ({ id: 'e', locationId: 'g', name: 'x', kind, identified: true, incrementsKg: [5], barWeightKg, settings: {}, exerciseIds: [], photoIds: [], createdAt: '', updatedAt: '' }) as Equipment;
  it('the switch: barbell compounds and the two Smith versions; never curls or machines', () => {
    expect(barTypeOf(d('back_squat'), null)).toBe('free');
    expect(barTypeOf(d('romanian_deadlift'), eqOf('smith'))).toBe('smith');
    expect(barTypeOf(d('smith_squat'), null)).toBe('smith');
    expect([SMITH_VERSION.back_squat, FREE_VERSION.smith_incline_press]).toEqual(['smith_squat', 'incline_barbell_press']);
    expect(barTypeOf(d('ez_bar_curl'), null)).toBeNull();
    expect(barTypeOf(d('barbell_curl'), null)).toBeNull();
    expect(barTypeOf(d('leg_press'), null)).toBeNull();
  });
  it('bar weight: 20 kg assumed for barbell compounds; never for curl / EZ bars; Smith only when set on it', () => {
    expect(barWeightFor(d('back_squat'), null, null)).toEqual({ kg: 20, assumed: true });
    expect(barWeightFor(d('back_squat'), null, { barWeightKg: 15 } as never)).toEqual({ kg: 15, assumed: false });
    expect(barWeightFor(d('ez_bar_curl'), null, null).kg).toBeNull();
    expect(barWeightFor(d('barbell_curl'), null, null).kg).toBeNull();
    expect(barWeightFor(d('smith_squat'), null, { barWeightKg: 20 } as never).kg).toBeNull();
    expect(barWeightFor(d('romanian_deadlift'), eqOf('smith', 15), null).kg).toBe(15);
    // 60 kg total on a 20 kg bar = 20 kg per side.
    expect(barBreakdown(60, 20)).toMatchObject({ barKg: 20, perSideKg: 20 });
  });
  it('the gym\'s Smith machine is found by gym', () => {
    expect(smithAt([eqOf('smith')], 'g')?.id).toBe('e');
    expect(smithAt([eqOf('smith')], 'other')).toBeNull();
  });
});

describe('Week screen groups and order (owner 2026-11-27)', () => {
  const mw = (muscle: string, remainingToPreferred: number, todayOpen: number, todayBlocked = false) => ({ muscle, remainingToPreferred, todayOpen, todayBlocked }) as unknown as MuscleWeek;
  it('Today (most open today first) -> Later this week (most left first; recovering included) -> Done (usual order)', () => {
    const g = weekGroups([mw('chest', 0, 0), mw('lats', 6, 2), mw('quads', 8, 4), mw('biceps', 4, 0, true), mw('calves', 9, 0), mw('abs', -1, 0), mw('triceps', 7, 2)]);
    expect(g.map((x) => [x.group, x.muscles.map((m) => m.muscle)])).toEqual([
      ['today', ['quads', 'triceps', 'lats']], // 4 today; 2 and 2 -> more left in the week first (7 > 6)
      ['later', ['calves', 'biceps']], // 9 > 4 (biceps is recovering)
      ['done', ['chest', 'abs']],
    ]);
  });
  it('under half a set open today is not "today"', () => {
    expect(weekGroups([mw('chest', 3, 0.4)]).map((x) => x.group)).toEqual(['later']);
  });
});
