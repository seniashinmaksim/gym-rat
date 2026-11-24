/**
 * Part 6 — formulas that survive human error (F.7) and within-session fatigue between exercises (F.8).
 * Synthetic histories; expected values computed by hand in the comments.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { analyze } from '../src/domain/analysis';
import { strengthProgress } from '../src/domain/baseline';
import { effortTapPatch } from '../src/domain/liveFlow';
import { expectedRepDrop, measuredDrop, preloadFactor, preloadFor, primaryMuscles, PRELOAD_CAP } from '../src/domain/preload';
import { prescribe } from '../src/domain/prescription';
import { buildRegistry } from '../src/domain/registry';
import type { Workout, WorkoutSet } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const bare = (w: number | null, r: number | null, extra: Partial<WorkoutSet> = {}) => set(w, r, null, extra);
const run = (ws: Workout[], daysAfter = 1) => {
  const last = [...ws].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.date;
  const d = data(ws);
  const now = new Date(`${add(last, daysAfter)}T12:00:00Z`);
  return { d, now, a: analyze(d, now) };
};
/** Sessions of one exercise every `gap` days. */
const series = (make: (k: number) => WorkoutSet[], n: number, id = 'pec_deck', eq: string | null = 'pd_a', start = '2026-09-07', gap = 4) => {
  const ws: Workout[] = [];
  let d = start;
  for (let k = 0; k < n; k++) { if (k) d = add(d, gap); ws.push(workout(d, [ex(id, make(k), eq)])); }
  return ws;
};

describe('F.7 the strength index does not depend on whether RIR was typed', () => {
  it('RIR logged in the first sessions and not later: same performance is NOT a decline', () => {
    // 60 × 12 with RIR 3 → 60 × (1 + 15/30) = 90; the same 60 × 12 without RIR → 84. Before Part 6 this read as −6.7 %.
    const ws = series((k) => (k < 3 ? [set(60, 12, 3), set(60, 11, 3), set(60, 10, 3)] : [bare(60, 12), bare(60, 11), bare(60, 10)]), 6);
    const p = run(ws).a.progression[0];
    expect(p.indexBasis).toBe('reps');
    expect(p.sessions.map((s) => s.index)).toEqual([84, 84, 84, 84, 84, 84]);
    expect(p.trend.cls).not.toBe('declining');
  });
  it('a history with RIR on every session keeps the RIR-adjusted index (unchanged from before)', () => {
    const ws = series(() => [set(60, 12, 2), set(60, 11, 2), set(60, 10, 2)], 5);
    const p = run(ws).a.progression[0];
    expect(p.indexBasis).toBe('rir');
    expect(p.sessions.map((s) => s.index)).toEqual([88, 88, 88, 88, 88]); // 60 × (1 + 14/30)
  });
  it('progress % uses the same basis (no fake loss when RIR stops being logged)', () => {
    const ws = series((k) => (k < 4 ? [set(60, 12, 3), set(60, 11, 3)] : [bare(60, 12), bare(60, 11)]), 12, 'pec_deck', 'pd_a', '2026-08-03', 5);
    const { a } = run(ws);
    const sp = strengthProgress(a.progression[0], add(ws.at(-1)!.date, 1));
    expect(sp.pct).toBe(0);
  });
});

describe('F.7 load decisions rest on what was done', () => {
  it('two sessions with every set at the top of the range → increase, with or without an effort answer', () => {
    // pec deck range 10–15; default machine step 5.
    const ws = series(() => [bare(60, 15), bare(60, 15), bare(60, 15)], 3);
    const p = run(ws).a.progression[0];
    expect(p.next).toMatchObject({ action: 'increase', weight: 62.5 } );
  });
  it('one top session is still not enough', () => {
    const ws = series((k) => (k < 2 ? [bare(60, 13), bare(60, 12)] : [bare(60, 15), bare(60, 15)]), 3);
    expect(run(ws).a.progression[0].next.action).toBe('hold');
  });
  it('the one-session "too easy" shortcut needs two sets and no rep drop', () => {
    const easy = (w: number, r: number) => bare(w, r, { effort: 'very_easy', feel: 'too_easy' });
    expect(run(series(() => [easy(60, 15)], 1)).a.progression[0].next.action).toBe('hold'); // one set = one answer
    expect(run(series(() => [easy(60, 16), easy(60, 15)], 1)).a.progression[0].next.action).toBe('hold'); // reps fell: not that easy
    expect(run(series(() => [easy(60, 15), easy(60, 15)], 1)).a.progression[0].next).toMatchObject({ action: 'increase', weight: 62.5 });
    expect(run(series(() => [set(60, 15, 4), set(60, 15, 4)], 1)).a.progression[0].next.action).toBe('increase'); // RIR ≥ target + 2
  });
  it('one "form broke" answer does not reduce the load; two do; one plus reps under the range does', () => {
    const broke = (w: number, r: number) => bare(w, r, { technique: 'compromised' });
    const before = series(() => [bare(60, 12), bare(60, 11)], 2);
    const day = add(before.at(-1)!.date, 4);
    const one = [...before, workout(day, [ex('pec_deck', [broke(60, 12), bare(60, 11)], 'pd_a')])];
    expect(run(one).a.progression[0].next.action).toBe('hold');
    expect(run(one).a.progression[0].next.reason).toMatch(/technique/i);
    const two = [...before, workout(day, [ex('pec_deck', [broke(60, 12), broke(60, 11), bare(60, 10)], 'pd_a')])];
    expect(run(two).a.progression[0].next).toMatchObject({ action: 'reduce', weight: 57.5 });
    const under = [...before, workout(day, [ex('pec_deck', [broke(60, 8), bare(60, 11)], 'pd_a')])]; // 8 < 10 = bottom of the range
    expect(run(under).a.progression[0].next.action).toBe('reduce');
    // The same answer in two consecutive sessions also counts.
    const twice = [...one, workout(add(day, 4), [ex('pec_deck', [broke(60, 12), bare(60, 11)], 'pd_a')])];
    expect(run(twice).a.progression[0].next.action).toBe('reduce');
  });
  it('property: ONE effort answer added to a history without answers never causes a load change', () => {
    const tap = fc.constantFrom('easy', 'good', 'hard', 'failed') as fc.Arbitrary<'easy' | 'good' | 'hard' | 'failed'>;
    fc.assert(fc.property(
      fc.array(fc.array(fc.integer({ min: 6, max: 18 }), { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 6 }),
      fc.constantFrom(55, 60, 65), fc.nat(), fc.nat(), tap, fc.constantFrom<'tap' | 'very_easy' | 'form'>('tap', 'very_easy', 'form'),
      (sessions, w, si, ki, t, what) => {
        const mk = (answer: boolean) => {
          let d = '2026-09-07';
          return sessions.map((reps, s) => {
            if (s) d = add(d, 4);
            const sets = reps.map((r, k) => {
              const b = bare(w, r);
              if (!answer || s !== si % sessions.length || k !== ki % reps.length) return b;
              return what === 'tap' ? { ...b, ...effortTapPatch(b, t) } : what === 'very_easy' ? { ...b, effort: 'very_easy' as const, feel: 'too_easy' as const } : { ...b, technique: 'compromised' as const };
            });
            return workout(d, [ex('pec_deck', sets, 'pd_a')], { id: `w${s}` });
          });
        };
        // "keep" and "not enough comparable data" both mean: no load change.
        const call = (n: { action: string; weight: number | null }) => (n.action === 'increase' || n.action === 'reduce' ? `${n.action} ${n.weight}` : 'no change');
        const base = call(run(mk(false)).a.progression[0].next);
        const one = call(run(mk(true)).a.progression[0].next);
        // A broken-technique answer may add a note but never changes the action or the load by itself,
        // except when the numbers confirm it (reps under the bottom of the range in that session).
        const s = sessions[si % sessions.length];
        const confirmed = what === 'form' && si % sessions.length === sessions.length - 1 && s.some((r) => r < 10);
        if (confirmed) return true;
        // An answer may take a session out of the comparison (so a suggestion can disappear); it must never
        // CAUSE an increase or a reduction that the numbers alone would not give.
        return one === 'no change' || one === base;
      },
    ), { numRuns: 300, seed: 20261123 });
  });
});

describe('F.8 context of an exercise within its session', () => {
  const press = () => ex('incline_dumbbell_press', [bare(30, 10), bare(30, 9), bare(30, 8)]);
  const deck = () => ex('pec_deck', [bare(60, 12), bare(60, 11), bare(60, 10)], 'pd_a');
  it('pec deck after three incline-press sets is pre-loaded (chest 3 × 1.0); done first it is fresh', () => {
    const d1 = deck();
    const after = workout('2026-11-23', [press(), d1]);
    expect(preloadFor(after, d1, reg)).toEqual({ sets: 3, bucket: 'preloaded', muscle: 'chest', from: ['incline_dumbbell_press'] });
    const d2 = deck();
    expect(preloadFor(workout('2026-11-23', [d2, press()]), d2, reg)).toMatchObject({ sets: 0, bucket: 'fresh' });
  });
  it('uses the order the sets were actually done, not the order of the cards', () => {
    const t = (min: number) => new Date(Date.parse('2026-11-23T18:00:00Z') + min * 60000).toISOString();
    const p = ex('incline_dumbbell_press', [bare(30, 10, { completedAt: t(2) }), bare(30, 9, { completedAt: t(5) })]);
    const d1 = ex('pec_deck', [bare(60, 12, { completedAt: t(10) }), bare(60, 11, { completedAt: t(13) })], 'pd_a');
    expect(preloadFor(workout('2026-11-23', [d1, p]), d1, reg)).toMatchObject({ sets: 2, bucket: 'preloaded' }); // card listed first, done second
    expect(preloadFor(workout('2026-11-23', [d1, p]), p, reg)).toMatchObject({ sets: 0, bucket: 'fresh' });
  });
  it('a synergist with coefficient 0.5 counts half: pushdown after three bench sets = 1.5 → still fresh', () => {
    const push = ex('triceps_pushdown_rope', [bare(25, 12)], 'cable_a');
    const w = workout('2026-11-23', [ex('barbell_bench_press', [bare(80, 8), bare(80, 7), bare(80, 6)]), push]);
    expect(preloadFor(w, push, reg)).toMatchObject({ sets: 1.5, bucket: 'fresh', muscle: 'triceps' });
  });
  it('warm-ups and planned sets do not pre-load; an exercise not started sees everything done so far', () => {
    const next = ex('pec_deck', [], 'pd_a');
    const w = workout('2026-11-23', [ex('incline_dumbbell_press', [bare(10, 10, { type: 'warmup' }), bare(30, 10), bare(30, 9), bare(30, 9, { planned: true })]), next]);
    expect(preloadFor(w, next, reg)).toMatchObject({ sets: 2, bucket: 'preloaded' });
  });
  it('primary muscles = highest coefficient only', () => {
    expect(primaryMuscles({ chest: 1, front_delts: 0.5, triceps: 0.5 })).toEqual(['chest']);
    expect(primaryMuscles({ forearms: 0.25 })).toEqual([]);
  });
  it('normalisation and the expected rep loss, by hand', () => {
    expect(preloadFactor(3)).toBeCloseTo(1.03, 6); // 3 sets × 1 %
    expect(preloadFactor(10)).toBeCloseTo(1 + PRELOAD_CAP, 6); // capped at 6 %
    expect(preloadFactor(0)).toBe(1);
    // 12 reps fresh, after 3 pre-loading sets: (30 + 12) × 0.03 / 1.03 = 1.22 → 1 rep fewer; after 5: 42 × 0.05 / 1.05 = 2.
    expect(expectedRepDrop(12, 3)).toBe(1);
    expect(expectedRepDrop(12, 5)).toBe(2);
    expect(expectedRepDrop(12, 0)).toBe(0);
    expect(expectedRepDrop(8, 2)).toBe(1); // 38 × 0.02 / 1.02 = 0.75
  });
  it("the owner's own drop per pre-loading set once both contexts have 2 sessions", () => {
    // fresh 84, pre-loaded 79.8 after 3 sets: (1 − 0.95) / 3 = 1.67 % per set.
    const s = [{ index: 84, context: 'fresh' as const, preload: 0 }, { index: 84, context: 'fresh' as const, preload: 0 }, { index: 79.8, context: 'preloaded' as const, preload: 3 }, { index: 79.8, context: 'preloaded' as const, preload: 3 }];
    expect(measuredDrop(s)).toBeCloseTo(0.016667, 5);
    expect(measuredDrop(s.slice(0, 3))).toBeNull();
    // Stronger when pre-loaded (noise) → 0, never negative.
    expect(measuredDrop([s[0], s[1], { ...s[2], index: 86 }, { ...s[3], index: 86 }])).toBe(0);
  });
});

describe('F.8 comparisons are made like with like', () => {
  // Pec deck: fresh 60 × 12, 11, 10; after three incline-press sets 60 × 10, 9, 8.
  const fresh = () => ex('pec_deck', [bare(60, 12), bare(60, 11), bare(60, 10)], 'pd_a');
  const tired = () => ex('pec_deck', [bare(60, 10), bare(60, 9), bare(60, 8)], 'pd_a');
  const press = () => ex('incline_dumbbell_press', [bare(30, 10), bare(30, 9), bare(30, 8)]);
  const hist = (pattern: ('F' | 'P')[]) => {
    let d = '2026-09-07';
    return pattern.map((c, k) => { if (k) d = add(d, 4); return workout(d, c === 'F' ? [fresh(), press()] : [press(), tired()]); });
  };
  const deckOf = (ws: Workout[]) => run(ws).a.progression.find((p) => p.exerciseId === 'pec_deck')!;

  it('every session carries its context', () => {
    const p = deckOf(hist(['F', 'P', 'F']));
    expect(p.sessions.map((s) => s.context)).toEqual(['fresh', 'preloaded', 'fresh']);
    expect(p.sessions.map((s) => s.preload)).toEqual([0, 3, 0]);
  });
  it('fresh sessions followed by pre-loaded ones: NOT a decline, no reduction', () => {
    // Raw index 84 → 80 (60 × (1 + 10/30)): −4.8 %. Normalised: 80 × 1.03 = 82.4 → slope −0.58 %/session: no decline.
    const p = deckOf(hist(['F', 'F', 'F', 'P', 'P']));
    expect(p.compare.basis).toBe('adjusted');
    expect(p.trend.cls).not.toBe('declining');
    expect(p.next.action).toBe('hold');
  });
  it('three sessions in the latest context → judged within that context only', () => {
    const p = deckOf(hist(['F', 'F', 'F', 'P', 'P', 'P']));
    expect(p.compare).toMatchObject({ basis: 'same_context', context: 'preloaded' });
    expect(p.trend.cls).toBe('stable');
    expect(p.trend.sessionsUsed).toBe(3);
  });
  it('alternating order never produces a plateau / decline from the order alone', () => {
    const p = deckOf(hist(['F', 'P', 'F', 'P', 'F', 'P', 'F', 'P']));
    expect(['stable', 'plateau', 'insufficient_data']).toContain(p.trend.cls);
    expect(p.trend.cls).not.toBe('declining');
  });
  it('a fresh top session after pre-loaded ones is not two sessions at the top', () => {
    // Pre-loaded: 60 × 13, 12, 11 (not at the top, 15). Fresh: 60 × 15, 15, 15.
    let d = '2026-09-07';
    const ws: Workout[] = [];
    for (let k = 0; k < 3; k++) { if (k) d = add(d, 4); ws.push(workout(d, [press(), ex('pec_deck', [bare(60, 13), bare(60, 12), bare(60, 11)], 'pd_a')])); }
    ws.push(workout(add(d, 4), [ex('pec_deck', [bare(60, 15), bare(60, 15), bare(60, 15)], 'pd_a'), press()]));
    expect(deckOf(ws).next.action).toBe('hold');
  });
  it('a history that never changes order is unchanged (single context)', () => {
    const p = deckOf(hist(['F', 'F', 'F', 'F']));
    expect(p.compare.basis).toBe('single_context');
    expect(p.sessions.map((s) => s.index)).toEqual([84, 84, 84, 84]);
  });
  it('prescription for pec deck AFTER incline press when history is fresh only: same load, fewer reps expected, said so', () => {
    const ws = hist(['F', 'F', 'F', 'F']);
    const day = add(ws.at(-1)!.date, 4);
    const live = workout(day, [ex('incline_dumbbell_press', [bare(30, 10), bare(30, 9), bare(30, 8)]), ex('pec_deck', [], 'pd_a')], { source: 'live' });
    const d = data([...ws, live]);
    const now = new Date(`${day}T18:00:00Z`);
    const a = analyze(d, now);
    const p = prescribe({ data: d, analysis: a, now, workout: live, exerciseIndex: 1 });
    expect(p.workingWeightKg).toBe(60);
    expect(p.context).toMatchObject({ bucket: 'preloaded', sets: 3 });
    // Fresh 12 → expect (30 + 12) × 0.03 / 1.03 ≈ 1 fewer → aim for 11–12.
    expect(p.expectedRepDrop).toBe(1);
    expect([p.sets[0].repsMin, p.sets[0].repsMax]).toEqual([11, 12]);
    expect(p.notes.join(' ')).toMatch(/not a regression/i);
    // Done first, the same history asks for the usual reps.
    const liveFresh = workout(day, [ex('pec_deck', [], 'pd_a')], { source: 'live' });
    const d2 = data([...ws, liveFresh]);
    const p2 = prescribe({ data: d2, analysis: analyze(d2, now), now, workout: liveFresh, exerciseIndex: 0 });
    expect([p2.sets[0].repsMin, p2.sets[0].repsMax]).toEqual([12, 13]);
    expect(p2.expectedRepDrop).toBe(0);
  });
});
