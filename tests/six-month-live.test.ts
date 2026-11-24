/**
 * SIX-MONTH SIMULATION THROUGH THE TRAINING MODE (Part 6, F.15 step 9).
 *
 * The same 26 synthetic weeks as tests/six-month.test.ts, but every set is logged the way the training mode
 * logs it: AFTER it was done, with `logSet` (completion time → measured rest, automatic warm-up tags), and the
 * effort as the optional one-tap answer (EASY / GOOD / HARD / FAILED, applied with `editSet` as the app does) —
 * never an exact RIR. Recorded warm-up tags are NOT given: the app has to find them from the numbers.
 *
 * Checked against the independent reference (tests/sim/reference.ts, which imports nothing from src/domain):
 * weekly effective sets per muscle, measured rest, and that automatic warm-up tags never remove credit.
 * Deterministic: fixed seed, fixed clock, UTC.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { editSet, effortTapPatch, logSet, type EffortTap } from '../src/domain/liveFlow';
import { computeVolume } from '../src/domain/volume';
import type { Workout, WorkoutExercise, WorkoutSet } from '../src/domain/types';
import { refEffective, refSetCredit } from './sim/reference';
import { dayAdd, generateSixMonths, SIM_END, SIM_WEEKS, weekStartOf } from './sim/sixMonth';

const m = DEFAULT_QUALITY;
const { data } = generateSixMonths();
const performed = (e: WorkoutExercise) => e.sets.filter((s) => !s.planned);

/** What the owner taps after a set, from what the generator says the set was like (the exact RIR is never typed). */
const tapOf = (s: WorkoutSet): EffortTap | null => (s.failure === 'muscular' ? 'failed' : s.rir == null ? null : s.rir <= 1 ? 'hard' : s.rir === 2 ? 'good' : 'easy');

/** The generated history re-logged set by set through the live flow. */
const live: Workout[] = data.workouts.map((w) => {
  let t = Date.parse(`${w.date}T${w.startTime ?? '18:00'}:00Z`);
  const exercises = w.exercises.map((e) => {
    let x: WorkoutExercise = { ...e, sets: [], target: undefined };
    for (const s of performed(e)) {
      // The set takes reps × 3 s; the rest before it is what the generator recorded (90 s when it recorded none).
      t += ((s.restSecBefore ?? 90) + (s.reps ?? 0) * 3) * 1000;
      const id = `${s.id}-live`;
      x = logSet(x, { weightKg: s.weightKg, reps: s.reps, loadMode: s.loadMode, ...(s.side ? { side: s.side } : {}) }, t, id, m);
      const tap = tapOf(s);
      if (tap) x = editSet(x, id, effortTapPatch(x.sets.find((y) => y.id === id) as WorkoutSet, tap), m);
      // Facts the owner also records in training mode (form broke, wrong weight, pain) are kept.
      const extra: Partial<WorkoutSet> = {};
      for (const k of ['technique', 'technicalFailure', 'weightAccuracy', 'intendedWeightKg', 'pain', 'rom'] as const) if (s[k] !== undefined) (extra as Record<string, unknown>)[k] = s[k];
      if (Object.keys(extra).length) x = editSet(x, id, extra, m);
    }
    return x;
  });
  return { ...w, exercises };
});
const pairs = () => data.workouts.flatMap((w, i) => w.exercises.flatMap((e, j) => performed(e).map((orig, k) => ({ w, e, orig, now: live[i].exercises[j].sets[k] }))));

describe('six months logged through the training mode', () => {
  it('every set is logged once, in order, with its completion time; nothing is "planned"', () => {
    const p = pairs();
    expect(p.length).toBeGreaterThan(1500);
    for (const { orig, now } of p) {
      expect(now).toBeDefined();
      expect(now.weightKg).toBe(orig.weightKg);
      expect(now.reps).toBe(orig.reps);
      expect(now.planned).toBeUndefined();
      expect(now.completedAt).toBeTruthy();
      expect(now.rir).toBeNull(); // only taps, never an exact RIR
    }
  });

  it('the rest measured from completion times is exactly the rest that was taken', () => {
    for (const { orig, now } of pairs()) {
      if (orig.restSecBefore == null) continue;
      expect(now.restSecBefore, `${orig.id}`).toBe(orig.restSecBefore);
    }
  });

  it('every recorded warm-up is found from the numbers alone', () => {
    const warm = pairs().filter(({ orig }) => orig.type === 'warmup');
    expect(warm.length).toBeGreaterThan(200);
    expect(warm.filter(({ now }) => now.type === 'warmup' && now.typeSource === 'auto').length).toBe(warm.length);
  });

  it('an automatic warm-up tag never removes credit the reference would give', () => {
    // Undo the app's tags and let the independent reference judge those sets: each must be worth 0 anyway.
    for (const [i, w] of live.entries()) for (const e of w.exercises) {
      const untagged = e.sets.map((s) => (s.typeSource === 'auto' ? { ...s, type: 'working' as const, typeSource: undefined } : s));
      for (const s of untagged) {
        const tagged = e.sets.find((x) => x.id === s.id) as WorkoutSet;
        if (tagged.typeSource !== 'auto') continue;
        expect(refSetCredit(s, untagged), `${data.workouts[i].date} ${e.exerciseId} ${s.weightKg}×${s.reps}`).toBe(0);
      }
    }
  });

  it('weekly effective sets per muscle equal the independent reference, every week', () => {
    let compared = 0;
    for (let week = 1; week <= SIM_WEEKS; week++) {
      const from = weekStartOf(week);
      const to = dayAdd(from, 6);
      const ws = live.filter((w) => w.date >= from && w.date <= to);
      if (!ws.length) continue;
      const app = computeVolume(ws, analyze(data, new Date(`${SIM_END}T20:00:00Z`)).registry, m).muscles;
      // The reference judges warm-ups itself: the app's automatic tags are removed before it sees the sets.
      const untagged = ws.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => (s.typeSource === 'auto' ? { ...s, type: 'working' as const } : s)) })) }));
      const ref = refEffective(untagged);
      for (const [muscle, v] of Object.entries(ref)) {
        compared++;
        expect(app[muscle as keyof typeof app].effective, `week ${week} ${muscle}`).toBeCloseTo(v, 1);
        expect(Math.abs(app[muscle as keyof typeof app].effective - v), `week ${week} ${muscle}`).toBeLessThanOrEqual(0.01);
      }
    }
    expect(compared).toBeGreaterThan(200);
  });

  it('advice still works without a single exact RIR: same load decisions as the RIR-logged history', () => {
    const now = new Date(`${SIM_END}T20:00:00Z`);
    const a = analyze({ ...data, workouts: live }, now);
    const o = analyze(data, now);
    // With taps only, every history is judged on weight and reps (documented in docs/FORMULA_ANALYSIS.md #10).
    expect(a.progression.every((p) => p.indexBasis === 'reps')).toBe(true);
    const key = (p: { key: string }) => p.key;
    const byKey = new Map(o.progression.map((p) => [key(p), p.next.action]));
    expect(a.progression.length).toBe(o.progression.length);
    for (const p of a.progression) expect(p.next.action, p.key).toBe(byKey.get(key(p)));
    // The analytics are there: trends for the regular exercises, and the weekly table.
    expect(a.progression.filter((p) => p.trend.cls !== 'insufficient_data').length).toBeGreaterThanOrEqual(10);
    expect(Object.values(a.muscles).some((x) => x.completed > 0)).toBe(true);
  });

  it('load increases are suggested along the way, as with exact RIR', () => {
    let liveInc = 0;
    let origInc = 0;
    for (let week = 4; week <= SIM_WEEKS; week += 2) {
      const day = dayAdd(weekStartOf(week), 6);
      const at = new Date(`${day}T20:00:00Z`);
      liveInc += analyze({ ...data, workouts: live.filter((w) => w.date <= day) }, at).progression.filter((p) => p.next.action === 'increase').length;
      origInc += analyze({ ...data, workouts: data.workouts.filter((w) => w.date <= day) }, at).progression.filter((p) => p.next.action === 'increase').length;
    }
    expect(origInc).toBeGreaterThan(0);
    expect(liveInc).toBeGreaterThan(0);
    // Taps only: the one-session "clearly too light" shortcut needs an exact RIR, so a few increases may come a session later.
    expect(liveInc).toBeGreaterThanOrEqual(Math.floor(origInc * 0.7));
  });
});
