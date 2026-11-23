/**
 * Regression tests for the independent review of Part 5 (one per finding). Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { applyPendingUpdate, generateWorkout, planAdherence, replacementOptions, replanPending, workoutFromPlan } from '../src/domain/planner';
import { assessChoice } from '../src/domain/exerciseChoice';
import type { Workout, WorkoutSet } from '../src/domain/types';
import { dataQualityHistory, dayAfterLast } from './sim/dataQuality';
import { data, ex, set, workout } from './fixtures';

let n = 0;
const uidT = () => `r${n++}`;
const start = (o: Parameters<typeof dataQualityHistory>[0], days = 3) => {
  const d = dataQualityHistory(o);
  const now = dayAfterLast(d, days);
  const a = analyze(d, now);
  const g = generateWorkout({ data: d, analysis: a, now });
  return { d, now, a, g };
};
const tick = (s: WorkoutSet, at: string): WorkoutSet => ({ ...s, planned: false, completedAt: at, rir: 2, rirSource: 'reported' });
/** The sets an exercise's target asks for, as performed sets (Part 6: no prepared rows exist). */
const targetSets = (e: Workout['exercises'][number], at: string): WorkoutSet[] => Array.from({ length: e.target!.sets }, (_, k) => {
  const r = e.target!.reps[Math.min(k, e.target!.reps.length - 1)];
  return { id: `${e.id}-${k}`, type: 'working', weightKg: e.target!.weightKg, loadMode: 'total', reps: r.min, rir: 2, rirSource: 'reported', restSecBefore: null, completedAt: at };
});

describe('review #1: owner edits to the set COUNT are never overwritten or re-added', () => {
  it('an item edited before Start, sets removed in the logger, all sets removed → no re-assessment touches them', () => {
    const { d, now, g } = start({ sessions: 14 });
    const w = workoutFromPlan(g, { id: 'live', date: '2026-10-20', startTime: '17:00', nowIso: now.toISOString(), uid: uidT }, { 1: { sets: 7 } });
    expect(w.exercises[1].target).toMatchObject({ sets: 7, edited: true }); // edited → never re-planned
    // Part 6: the owner changes a target in the overview (fewer sets / none) → it is theirs from then on.
    const fewer = { ...w.exercises[2], target: { ...w.exercises[2].target!, sets: Math.max(0, w.exercises[2].target!.sets - 1), edited: true } };
    const none = { ...w.exercises[3], target: { ...w.exercises[3].target!, sets: 0, edited: true } };
    const live: Workout = { ...w, exercises: [{ ...w.exercises[0], sets: targetSets(w.exercises[0], now.toISOString()).slice(0, 1) }, w.exercises[1], fewer, none, ...w.exercises.slice(4)] };
    const all = { ...d, workouts: [...d.workouts, live] };
    for (const u of replanPending(all, analyze(all, now), live, now)) {
      if ([1, 2, 3].includes(u.exerciseIndex)) expect(applyPendingUpdate(live.exercises[u.exerciseIndex], u, uidT), `card ${u.exerciseIndex}`).toBeNull();
    }
  });
});

describe('review #2: the returning step-down survives live re-assessment and lands on a real load', () => {
  it('16 days off: planned and re-planned loads are the same, one known step down', () => {
    const { d, now, g, a } = start({ sessions: 14 }, 16);
    const inc = g.items.find((i) => i.exerciseId === 'incline_dumbbell_press')!;
    const used = new Set(a.progression.find((p) => p.key === inc.prescription.key)!.sessions.flatMap((s) => s.sets.map((x) => x.weight)));
    expect(used.has(inc.prescription.workingWeightKg)).toBe(true); // a load already used, never 30.5
    const w = workoutFromPlan(g, { id: 'live', date: a.today, startTime: '17:00', nowIso: now.toISOString(), uid: uidT });
    const live: Workout = { ...w, exercises: w.exercises.map((e, i) => (i === 0 ? { ...e, sets: targetSets(e, now.toISOString()).slice(0, 1) } : e)) };
    const all = { ...d, workouts: [...d.workouts, live] };
    const u = replanPending(all, analyze(all, now), live, now).find((x) => live.exercises[x.exerciseIndex].exerciseId === 'incline_dumbbell_press')!;
    expect(u.prescription.workingWeightKg).toBe(inc.prescription.workingWeightKg);
    expect(u.prescription.decisionWhy).toMatch(/Back after 16 days/);
  });
});

describe('review #3/#4/#6: individual volume needs effort evidence; priority never overrides; reductions have a floor', () => {
  it('stalled but NO effort logged → hold ("log effort first"), never "adequate effort"', () => {
    const d = dataQualityHistory({ sessions: 24, trend: 'flat' });
    d.workouts = d.workouts.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, rir: null, rirSource: 'unknown' as const })) })) }));
    const a = analyze(d, dayAfterLast(d, 3));
    for (const m of ['chest', 'quads', 'hamstrings', 'side_delts'] as const) {
      expect(a.muscles.find((x) => x.muscle === m)!.target.volumeAction, m).not.toBe('increase');
    }
    expect(a.muscles.find((x) => x.muscle === 'chest')!.target.rationale.join(' ')).toMatch(/log effort first/);
  });
  it('high priority adds nothing on top of a PROGRESSING muscle', () => {
    const d = dataQualityHistory({ sessions: 16, trend: 'up' });
    const base = analyze(d, dayAfterLast(d, 3)).muscles.find((x) => x.muscle === 'chest')!.target;
    const pri = { ...d, settings: { ...d.settings, priorities: { chest: 'high' as const } } };
    const t = analyze(pri, dayAfterLast(d, 3)).muscles.find((x) => x.muscle === 'chest')!.target;
    expect(base.volumeAction).toBe('hold');
    expect(t.preferred).toBe(base.preferred);
  });
  it('a persistent decline never cuts below the lower end of the range', () => {
    const d = dataQualityHistory({ sessions: 30, trend: 'down' });
    const t = analyze(d, dayAfterLast(d, 3)).muscles.find((x) => x.muscle === 'chest')!.target;
    expect(t.preferred).toBeGreaterThanOrEqual(Math.min(t.baseline as number, 6));
  });
});

describe('review #5/#11: choice assistant', () => {
  const EQ = [{ id: 'mcp_a', locationId: 'gym_a', name: 'Chest press A', kind: 'machine' as const, identified: true, incrementsKg: [5], minKg: 5, maxKg: 150, settings: {}, exerciseIds: ['machine_chest_press'], photoIds: [], createdAt: '', updatedAt: '' }];
  const hist = ['2026-11-02', '2026-11-05'].map((dt) => workout(dt, [ex('machine_chest_press', [set(50, 10), set(50, 9)], 'mcp_a'), ex('triceps_pushdown_bar', [set(30, 12)], null)], { startTime: '18:00', endTime: '19:00' }));
  it('a busy compound does not trigger CONSIDER LATER / "First: …"', () => {
    const pending = ex('machine_chest_press', [set(50, 10, null, { planned: true })], 'mcp_a');
    const busy: Workout = workout('2026-11-16', [pending], { id: 'live', busyEquipment: [{ equipmentId: 'mcp_a', at: '' }] });
    const d = data([...hist, busy], { equipment: EQ });
    const c = assessChoice({ data: d, analysis: analyze(d, new Date('2026-11-16T17:00:00Z')), workout: busy, exerciseId: 'triceps_pushdown_bar' });
    // No "do it first" on a busy machine and no CONSIDER LATER; at most the soft ACCEPTABLE note that other chest
    // compounds (on free equipment) would best come first.
    expect(c.status).not.toBe('reconsider');
    expect(c.alternatives.some((x) => x.kind === 'do_first')).toBe(false);
  });
  it('pain logged later changes the warning key (asked again); a known start time is not "uncertain"', () => {
    const late = workout('2026-11-18', [ex('machine_chest_press', Array.from({ length: 6 }, () => set(50, 10, 2)), 'mcp_a')], { startTime: '18:00', endTime: null });
    const w0 = workout('2026-11-19', [], { id: 'live' });
    const d = data([...hist, late, w0], { equipment: EQ });
    const c = assessChoice({ data: d, analysis: analyze(d, new Date('2026-11-19T19:00:00Z')), workout: w0, exerciseId: 'machine_chest_press', equipmentId: 'mcp_a' });
    expect(c.muscles[0].state).toBe('RECENTLY_LOADED');
    const pain = { ...w0, exercises: [ex('machine_chest_press', [set(50, 10, 2, { pain: { area: 'Shoulder' }, feel: 'pain' })], 'mcp_a')] };
    const d2 = { ...d, workouts: [...d.workouts.filter((x) => x.id !== 'live'), pain] };
    const c2 = assessChoice({ data: d2, analysis: analyze(d2, new Date('2026-11-19T19:00:00Z')), workout: pain, exerciseId: 'machine_chest_press', equipmentId: 'mcp_a' });
    expect(c2.key).not.toBe(c.key);
  });
});

describe('review #8/#9/#10: replacements, adherence, session size', () => {
  it('machine busy → the same exercise on another free machine is offered first (its own history)', () => {
    const { d, a } = start({ sessions: 14, switchPecDeckAt: 13 });
    const w: Workout = workout(a.today, [ex('pec_deck', [set(60, 12, null, { planned: true })], 'pd_a')], { id: 'live', busyEquipment: [{ equipmentId: 'pd_a', at: '' }] });
    const opts = replacementOptions(d, a, w, 'pec_deck');
    expect(opts[0]).toMatchObject({ exerciseId: 'pec_deck', equipmentId: 'pd_b' });
    expect(opts.every((o) => o.equipmentId !== 'pd_a')).toBe(true);
  });
  it('adherence counts a left + right pair once and compares with what was prescribed on the sets', () => {
    const { g, now } = start({ sessions: 14 });
    const w = workoutFromPlan(g, { id: 'live', date: '2026-10-20', startTime: '17:00', nowIso: now.toISOString(), uid: uidT });
    const e0 = w.exercises[0];
    const pairs = targetSets(e0, now.toISOString()).flatMap((s): WorkoutSet[] => [tick({ ...s, side: 'left' }, now.toISOString()), tick({ ...s, id: `${s.id}R`, side: 'right' }, now.toISOString())]);
    expect(planAdherence({ ...w, exercises: [{ ...e0, sets: pairs }, ...w.exercises.slice(1)] })[0].result).toBe('followed');
  });
  it('a generated session stays near the usual number of working sets (≤ +15 %)', () => {
    const { g, d } = start({ sessions: 14 });
    const usual = d.workouts[0].exercises.reduce((k, e) => k + e.sets.length, 0);
    expect(usual).toBe(19);
    expect(g.items.reduce((k, it) => k + it.setCount, 0)).toBeLessThanOrEqual(Math.round(usual * 1.15));
  });
});
