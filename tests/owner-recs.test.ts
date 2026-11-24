/**
 * Owner's recommendations 2026-11-24 (after the second analysis), tests written BEFORE the changes. Synthetic data.
 *
 * 1. The two "did it hold up?" rules (Part 5 choice_learning, Part 8 kept-warning softening) measure the same thing —
 *    did performance hold up although a warning was ignored — so both use the median of up to 3 earlier comparable
 *    sessions that were not themselves under such a warning (≥ 2 needed). Each still judges ITS session: Part 5 the
 *    overridden session itself, Part 8 the next session of the affected exercise.
 * 2. Sets left today: raw values in every calculation; ONE display rounding (halves, "≈" when rounded); "under half a
 *    set is nothing to do" is a named decision threshold on the raw value (as the planner's), not a rounding.
 * 3. One-set exercises are allowed when the allocation produces them; never zero or negative.
 * 4. Shared recovery window checklist.
 */
import { describe, expect, it } from 'vitest';
import { analyze, ACTIONABLE_SETS, displaySets } from '../src/domain/analysis';
import { assessChoice, choiceOutcomes } from '../src/domain/exerciseChoice';
import { outcomeAt, OUTCOME_BASELINE_MIN } from '../src/domain/outcomes';
import { allocateSets, generateWorkout, MIN_OPEN, targetFromPrescription } from '../src/domain/planner';
import { readinessReport } from '../src/domain/readiness';
import { buildRegistry } from '../src/domain/registry';
import { computeVolume } from '../src/domain/volume';
import { assessSet } from '../src/domain/quality';
import { forwardChecks, movePartners } from '../src/domain/sequence';
import { windowHours } from '../src/domain/recovery';
import { sessionWindowH } from '../src/domain/weekPlan';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import type { AppData } from '../src/domain/appdata';
import type { SessionPerf } from '../src/domain/progression';
import type { Workout, WorkoutExercise } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

// ---------------------------------------------------------------- 1. "did it hold up?"
const sp = (i: number, indexRaw: number, extra: Partial<SessionPerf> = {}): SessionPerf => ({
  date: `2026-10-${String(1 + i * 3).padStart(2, '0')}`, workoutId: `w${i}`, indexRaw, index: indexRaw, indexKind: 'kg', representative: true, topRir: 1, restAvgSec: 150, context: 'fresh', ...extra,
} as unknown as SessionPerf);
const none = () => false;

describe('1 — both learning rules: median of up to 3 earlier comparable sessions (≥ 2)', () => {
  it('owner #1 one unusually BAD earlier session does not make a normal result look "held up" by contrast', () => {
    // Earlier 100, 100, 80 (bad) → median 100; now 90 → 90 % < 97 % → lower. Against the previous session only (80) it
    // would have counted as "held up" and softened the warning wrongly.
    expect(outcomeAt([sp(0, 100), sp(1, 100), sp(2, 80), sp(3, 90)], 3, none)).toBe(false);
  });
  it('owner #2 one unusually GOOD earlier session does not turn a normal result into a "drop"', () => {
    // Earlier 100, 100, 120 (good) → median 100; now 99 → held up. Against the previous only (120) it would be a drop.
    expect(outcomeAt([sp(0, 100), sp(1, 100), sp(2, 120), sp(3, 99)], 3, none)).toBe(true);
  });
  it('owner #2b one unusually good RESULT is not enough confidence: softening needs ≥ 2 of the last 3', async () => {
    const { softenedFrom } = await import('../src/domain/outcomes');
    expect(softenedFrom([true, false, false])).toBe(false);
    expect(softenedFrom([true, false, true])).toBe(true);
  });
  it('owner #3 three comparable sessions give a stable median baseline (96, 100, 104 → 100)', () => {
    expect(outcomeAt([sp(0, 96), sp(1, 104), sp(2, 100), sp(3, 97)], 3, none)).toBe(true); // 97 / 100 = 97 %
    expect(outcomeAt([sp(0, 96), sp(1, 104), sp(2, 100), sp(3, 96.9)], 3, none)).toBe(false);
  });
  it('owner #4 missing or not comparable sessions are never counted as success (null = skipped)', () => {
    expect(outcomeAt([sp(0, 100), sp(1, 100)], 1, none)).toBeNull(); // only 1 earlier session (< 2)
    expect(OUTCOME_BASELINE_MIN).toBe(2);
    expect(outcomeAt([sp(0, 100), sp(1, 100), sp(2, 120, { topRir: 4 })], 2, none)).toBeNull(); // another reserve
    expect(outcomeAt([sp(0, 100), sp(1, 100), sp(2, 120, { restAvgSec: 60 })], 2, none)).toBeNull(); // short rest
    expect(outcomeAt([sp(0, 100), sp(1, 100), sp(2, 120, { representative: false })], 2, none)).toBeNull();
    // Sessions that were themselves under a warning are not part of the baseline.
    expect(outcomeAt([sp(0, 100), sp(1, 70), sp(2, 98)], 2, (s) => s.workoutId === 'w1')).toBeNull();
  });
});

const EQ = [{ id: 'pd_a', name: 'Pec deck A', locationId: 'gym_a', exerciseIds: ['pec_deck'], photoIds: [], createdAt: '' }] as unknown as AppData['equipment'];
const override = (d: string, w: number) => workout(d, [ex('pec_deck', [set(w, 12, 1), set(w, 11, 1)], 'pd_a',
  { choice: { status: 'reconsider', reasonKind: 'recovery', followed: 'continued', at: `${d}T18:00:00Z` } })], { startTime: '18:00', endTime: '18:30' });
const clean = (d: string, w: number) => workout(d, [ex('pec_deck', [set(w, 12, 1), set(w, 11, 1)], 'pd_a')], { startTime: '18:00', endTime: '18:30' });
describe('owner #5 — Part 5 keeps judging the overridden session itself (immediate effect)', () => {
  it('2 clean sessions, then 3 overrides at the same performance → 3 comparable observations, softened', () => {
    const d = data([clean('2026-09-28', 45), clean('2026-10-02', 45), override('2026-10-05', 45), override('2026-10-12', 45), override('2026-10-19', 45)], { equipment: EQ });
    expect(choiceOutcomes(d, analyze(d, new Date('2026-11-19T08:00:00Z'))).get('pec_deck')).toMatchObject({ observations: 3, softened: true });
  });
  it('the overridden session is what is judged: a drop ON the override day counts as lower', () => {
    const d = data([clean('2026-09-28', 45), clean('2026-10-02', 45), override('2026-10-05', 40), override('2026-10-12', 40), override('2026-10-19', 45)], { equipment: EQ });
    const o = choiceOutcomes(d, analyze(d, new Date('2026-11-19T08:00:00Z'))).get('pec_deck')!;
    expect(o.softened).toBe(false);
  });
});

// ---------------------------------------------------------------- 2. sets left today
describe('2 — raw values in calculations, one display rounding', () => {
  it('owner #1 values just below / above the half-set boundaries', () => {
    expect(displaySets(0.49)).toEqual({ value: 0, approx: true, text: '0' });
    expect(displaySets(0.5)).toEqual({ value: 0.5, approx: false, text: '0.5' });
    expect(displaySets(0.74)).toMatchObject({ value: 0.5, approx: true });
    expect(displaySets(0.76)).toMatchObject({ value: 1, approx: true });
    expect(displaySets(1.24)).toMatchObject({ value: 1, approx: true });
    expect(displaySets(1.26)).toMatchObject({ value: 1.5, approx: true });
    expect(displaySets(2)).toEqual({ value: 2, approx: false, text: '2' });
    expect(displaySets(0.76).text).toBe('≈1');
  });
  it('owner #2 the same displayed number can hide different planner decisions (shown as approximate)', () => {
    expect(displaySets(1.4).text).toBe(displaySets(1.6).text);
    expect(1.4 < MIN_OPEN && 1.6 >= MIN_OPEN).toBe(true); // the planner decides on the raw value
    expect(displaySets(1.4).approx && displaySets(1.6).approx).toBe(true);
    expect(ACTIONABLE_SETS).toBe(0.5);
  });
  it('owner #3 Week, the choice assistant and the planner read the same raw value and show the same text', () => {
    const live = workout('2026-11-16', [ex('pec_deck', [set(40, 12, 2), set(40, 12, 2)], 'pd_a')], { startTime: '17:00' });
    const hist = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'].map((dd) => workout(dd, [ex('pec_deck', [set(40, 12, 2), set(40, 12, 2), set(40, 12, 2)], 'pd_a')], { startTime: '17:00', endTime: '18:00' }));
    const d = data([...hist, live], { equipment: EQ });
    const a = analyze(d, new Date('2026-11-16T17:30:00Z'));
    const chest = a.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.todayOpen).toBeCloseTo(Math.max(0, chest.todayShare - chest.doneToday), 9);
    expect(chest.todayLeft).toBe(displaySets(chest.todayOpen).value);
    const c = assessChoice({ data: d, analysis: a, workout: live, exerciseId: 'pec_deck', equipmentId: 'pd_a' });
    expect(c.muscles[0].todayOpen).toBeCloseTo(chest.todayOpen, 9);
    expect(c.muscles[0].todayLeft).toBe(displaySets(c.muscles[0].todayOpen).value);
  });
  it('owner #4 the volume calculation and the allocation are unchanged (raw in, whole sets out)', () => {
    expect(allocateSets({ chest: 1 }, { chest: 2.4 }, 6)).toEqual(allocateSets({ chest: 1 }, { chest: 2.4 }, 6));
    expect(allocateSets({ chest: 1 }, { chest: 2.4 }, 6).sets).toBe(2);
    expect(allocateSets({ chest: 1 }, { chest: 0.4 }, 6).sets).toBe(0);
  });
});

// ---------------------------------------------------------------- 3. one-set exercises
const times = <X>(n: number, mk: () => X) => Array.from({ length: n }, mk);
const pec = (n: number) => ex('pec_deck', times(n, () => set(40, 12, 2)), 'pd');
const curls = (n: number) => ex('machine_biceps_curl', times(n, () => set(30, 10, 1)), 'bc');
const pullups = (n: number) => ex('pull_up', times(n, () => set(0, 8, 2, { loadMode: 'bodyweight_plus' })), null, { variation: { loading: 'bodyweight', gripWidth: 'shoulder' } });
const rows = (n: number) => ex('seated_cable_row', times(n, () => set(50, 10, 2)), 'row');
const legs = (n: number) => ex('leg_extension', times(n, () => set(50, 12, 2)), 'le');
const day = (dd: string, exs: WorkoutExercise[]) => workout(dd, exs, { startTime: '17:00', endTime: '18:00' });
function weeks(): Workout[] {
  const out: Workout[] = [];
  for (const [mon, tu, th] of [['2026-10-19', '2026-10-20', '2026-10-22'], ['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']]) {
    out.push(day(mon, [pec(4), curls(4)]), day(tu, [pullups(4), rows(3)]), day(th, [legs(3), pec(3)]));
  }
  return out;
}
describe('3 — one-set exercises (allowed when the allocation produces them)', () => {
  it('owner #1 a legitimate one-set allocation: 1.2 open sets on a direct muscle → 1 set', () => {
    expect(allocateSets({ chest: 1, front_delts: 0.25 }, { chest: 1.2 }, 4).sets).toBe(1);
    const t = targetFromPrescription({ workingWeightKg: 40, setCount: 1, sets: [{ weightKg: 40, repsMin: 10, repsMax: 12, rirMin: 1, rirMax: 2, restSec: null }] });
    expect(t.sets).toBe(1);
  });
  it('owner #2 / #5 a moved one-set exercise appears exactly once on the new day, with its one set', () => {
    const move = { id: 'mv', exerciseId: 'machine_biceps_curl', equipmentId: 'bc', sets: 1, fromDate: '2026-11-16', date: '2026-11-17', reason: 'synthetic', createdAt: '2026-11-16T17:40:00Z' };
    const d0 = data([...weeks(), day('2026-11-16', [pec(4)])]);
    const d = { ...d0, settings: { ...d0.settings, plannedMoves: [move] } };
    const now = new Date('2026-11-17T16:00:00Z');
    const a = analyze(d, now);
    const items = generateWorkout({ data: d, analysis: a, now, locationId: 'gym_a', readiness: readinessReport(d, a) }).items;
    const curl = items.filter((x) => x.exerciseId === 'machine_biceps_curl');
    expect(curl).toHaveLength(1);
    expect(curl[0].setCount).toBe(1);
  });
  it('owner #3 weekly volume counts one set correctly (pec deck 1 × RIR 2 → chest 1.0, front delts 0.25)', () => {
    const v = computeVolume([workout('2026-11-16', [ex('pec_deck', [set(40, 12, 2)])])], buildRegistry([], []), DEFAULT_QUALITY).muscles;
    expect(v.chest.effective).toBeCloseTo(1, 9);
    expect(v.front_delts.effective).toBeCloseTo(0.25, 9);
  });
  it('owner #4 progression works with one working set: two sessions at the top of the range → increase', () => {
    const top = (dd: string) => workout(dd, [ex('pec_deck', [set(40, 15, 2)], 'pd')], { startTime: '17:00', endTime: '17:30' });
    const d = data([top('2026-11-09'), top('2026-11-12')]);
    const p = analyze(d, new Date('2026-11-16T08:00:00Z')).progression.find((s) => s.exerciseId === 'pec_deck')!;
    expect(p.next.action).toBe('increase');
  });
  it('owner #6 pairs and recovery-aware moves still work with one-set history', () => {
    const one = (dd: string) => day(dd, [ex('pec_deck', [set(40, 12, 2)], 'pd'), ex('machine_biceps_curl', [set(30, 10, 1)], 'bc')]);
    const d = data([one('2026-11-02'), one('2026-11-05'), one('2026-11-09'), one('2026-11-12')]);
    const a = analyze(d, new Date('2026-11-16T17:30:00Z'));
    expect(() => movePartners(d, a, 'machine_biceps_curl', ['pec_deck', 'machine_biceps_curl'], '2026-11-17')).not.toThrow();
    expect(forwardChecks({ data: d, analysis: a, workout: null, exerciseId: 'machine_biceps_curl', sets: 1 })).toEqual(expect.any(Array));
  });
  it('owner #7 zero or negative sets can never be planned', () => {
    expect(allocateSets({ chest: 1 }, { chest: 0 }, 4).sets).toBe(0);
    expect(allocateSets({ chest: 1 }, { chest: -3 }, 4).sets).toBe(0);
    const d0 = data([...weeks(), day('2026-11-16', [pec(4)])]);
    for (const now of ['2026-11-16T19:00:00Z', '2026-11-17T16:00:00Z', '2026-11-19T16:00:00Z']) {
      const a = analyze(d0, new Date(now));
      for (const it of generateWorkout({ data: d0, analysis: a, now: new Date(now), locationId: 'gym_a', readiness: readinessReport(d0, a) }).items) expect(it.setCount).toBeGreaterThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------- 4. shared recovery window checklist
describe('4 — the shared recovery window', () => {
  it('failure sets receive full set credit (RIR 0 = 1.0, the same as RIR 1–3)', () => {
    expect(assessSet(set(40, 12, 0), DEFAULT_QUALITY).credit).toBe(1);
    expect(assessSet(set(40, 12, null, { failure: 'muscular' }), DEFAULT_QUALITY).credit).toBe(1);
    expect(assessSet(set(40, 12, 2), DEFAULT_QUALITY).credit).toBe(1);
  });
  it('the failure extension lengthens the window and never lowers the credit (volume identical)', () => {
    const reg = buildRegistry([], []);
    const fail = computeVolume([workout('2026-11-16', [ex('pec_deck', [set(40, 12, 0), set(40, 12, 0), set(40, 12, 0)])])], reg, DEFAULT_QUALITY).muscles.chest.effective;
    const notFail = computeVolume([workout('2026-11-16', [ex('pec_deck', [set(40, 12, 2), set(40, 12, 2), set(40, 12, 2)])])], reg, DEFAULT_QUALITY).muscles.chest.effective;
    expect(fail).toBe(notFail);
    expect(windowHours({ sets: 3, large: true, failureSets: 3 })).toBeGreaterThan(windowHours({ sets: 3, large: true }));
  });
  it('additional factors are applied the same way everywhere (one formula)', () => {
    for (const x of [{ sets: 3, large: false }, { sets: 10, large: true }, { sets: 5, large: false, failureSets: 2, novel: true }]) {
      const extra = windowHours(x) - windowHours({ sets: x.sets, large: x.large });
      expect(sessionWindowH(x.sets, x.large, extra)).toBe(windowHours(x));
    }
  });
  it('two sessions on the same day both count for the week and for the next-session checks', () => {
    const morning = workout('2026-11-16', [curls(3)], { startTime: '08:00', endTime: '08:40' });
    const evening = workout('2026-11-16', [curls(1)], { startTime: '17:00' });
    const d = data([...weeks(), morning, evening]);
    const a = analyze(d, new Date('2026-11-16T17:30:00Z'));
    expect(a.muscles.find((m) => m.muscle === 'biceps')!.doneToday).toBeCloseTo(4, 9);
    expect(forwardChecks({ data: d, analysis: a, workout: evening, exerciseId: 'machine_biceps_curl', sets: 1 }).map((f) => f.muscle)).toContain('biceps');
  });
  it('the Week screen never shows a restriction caused only by the workout in progress', () => {
    const live = workout('2026-11-16', [pec(6)], { startTime: '17:00' });
    const d = data([...weeks(), live]);
    const a = analyze(d, new Date('2026-11-16T18:30:00Z'));
    const chest = a.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.todayBlocked).toBe(false);
  });
});
