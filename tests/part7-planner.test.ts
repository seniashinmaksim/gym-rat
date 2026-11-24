/**
 * Part 7 G.1 #10 (audit C-4): the plan and the live re-plan size sets with ONE routine, in the same order — a plan
 * started with nothing done re-plans to itself. All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { allocateSets, generateWorkout, replanPending, workoutFromPlan } from '../src/domain/planner';
import { dataQualityHistory, dayAfterLast } from './sim/dataQuality';

let n = 0;
const uid = () => `u${++n}`;

describe('one set-allocation routine', () => {
  it('hand example: triceps share 5, chest 4 — press first (chest 4 → 4 sets, triceps +2), then pushdown gets 5 − 2 = 3', () => {
    const open = { chest: 4, triceps: 5, front_delts: 3 };
    const press = allocateSets({ chest: 1, front_delts: 0.5, triceps: 0.5 }, open, 5);
    expect(press).toEqual({ sets: 4, target: 'chest' });
    // open after the press: chest 0, triceps 3, front delts 1
    const push = allocateSets({ triceps: 1 }, { chest: 0, triceps: 3, front_delts: 1 }, 4);
    expect(push).toEqual({ sets: 3, target: 'triceps' });
  });
  it('a squat chosen for glutes (open 3.75, coefficient 0.75 → 5 sets) is capped by quads (open 3): 3 sets', () => {
    // target = largest open ÷ coefficient: quads 3, glutes 5, adductors 4 → glutes. 5 × 1.0 = 5 > 3 + 0.5 → 4 → 4 > 3.5 → 3 ✓ (glutes and adductors 2.25 each)
    expect(allocateSets({ quads: 1, glutes: 0.75, adductors: 0.75 }, { quads: 3, glutes: 3.75, adductors: 3 }, 5)).toEqual({ sets: 3, target: 'glutes' });
  });
  it('nothing left for any direct muscle → 0 sets', () => {
    expect(allocateSets({ triceps: 1 }, { triceps: 0.4 }, 4)).toEqual({ sets: 0, target: 'triceps' });
  });
  it('a generated plan, started with nothing done, re-plans to the same set counts', () => {
    const d = dataQualityHistory({ sessions: 14 });
    const now = dayAfterLast(d, 3);
    const a = analyze(d, now);
    const g = generateWorkout({ data: d, analysis: a, now });
    const w = workoutFromPlan(g, { id: 'live', date: a.today, startTime: '17:00', nowIso: now.toISOString(), uid });
    const all = { ...d, workouts: [...d.workouts, w] };
    const ups = replanPending(all, analyze(all, now), w, now);
    expect(ups.length).toBeGreaterThan(1);
    for (const u of ups) expect(u.setCount, w.exercises[u.exerciseIndex].exerciseId).toBe(w.exercises[u.exerciseIndex].target!.sets);
  });
});
