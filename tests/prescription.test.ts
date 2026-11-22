/**
 * Prescription engine (presc-1). All data is synthetic.
 * "Today" is Wednesday 2026-11-18 (week Mon 16 – Sun 22, UTC); history sits in earlier weeks
 * unless a test says otherwise.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import type { AppData } from '../src/domain/appdata';
import { addDays } from '../src/domain/dates';
import { adaptRemaining, prescribe, toSetPrescription, type Prescription } from '../src/domain/prescription';
import { computeVolume } from '../src/domain/volume';
import type { Equipment, Location, TargetOverride, Workout, WorkoutExercise, WorkoutSet } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const TODAY = '2026-11-18';
const NOW = new Date(`${TODAY}T17:00:00Z`);
const weeksAgo = (k: number) => addDays(TODAY, -7 * k);

function machine(id: string, locationId: string, extra: Partial<Equipment> = {}): Equipment {
  return { id, locationId, name: id, kind: 'machine', identified: true, incrementsKg: [5], settings: {}, exerciseIds: ['pec_deck'], photoIds: [], createdAt: '', updatedAt: '', ...extra };
}
const loc = (id: string, extra: Partial<Location> = {}): Location => ({ id, name: id, photoIds: [], createdAt: '', ...extra });

/** k weekly sessions, oldest first, ending one week ago. */
function history(k: number, make: (i: number) => WorkoutExercise[], extra: Partial<Workout> = {}): Workout[] {
  return Array.from({ length: k }, (_, i) => workout(weeksAgo(k - i), make(i), extra));
}

function appData(ws: Workout[], opts: { equipment?: Equipment[]; locations?: Location[]; targets?: Record<string, TargetOverride> } = {}): AppData {
  const d = data(ws, {
    equipment: opts.equipment ?? [machine('pd_a', 'gym_a'), machine('pd_b', 'gym_b')],
    locations: opts.locations ?? [loc('gym_a'), loc('gym_b')],
  });
  d.settings.targetOverrides = (opts.targets ?? { chest: { min: 6, preferred: 10, max: 16 } }) as AppData['settings']['targetOverrides'];
  return d;
}

const live = (exercises: WorkoutExercise[], extra: Partial<Workout> = {}) => workout(TODAY, exercises, { id: 'live', source: 'live', ...extra });

function run(d: AppData, w: Workout, idx = 0): Prescription {
  return prescribe({ data: d, analysis: analyze(d, NOW), now: NOW, workout: w, exerciseIndex: idx });
}

const rest = (sec: number) => ({ restSecBefore: sec });
/** Pec deck on machine pd_a: reps per set at 45 kg, RIR 2, 90 s rest. */
const pecDeck = (reps: number[], eq = 'pd_a', w = 45, rir: number | null = 2, extra: Partial<WorkoutSet> = {}) =>
  ex('pec_deck', reps.map((r, i) => set(w, r, rir, { ...(i ? rest(90) : {}), ...extra })), eq);

// ---------------------------------------------------------------- confidence

describe('confidence tiers', () => {
  const tier = (n: number) => run(appData(history(n, () => [pecDeck([14, 13, 12])])), live([ex('pec_deck', [], 'pd_a')]));
  it('0–1 comparable sessions → low / calibrating', () => {
    for (const n of [0, 1]) {
      const p = tier(n);
      expect(p.sessionsUsed).toBe(n);
      expect(p.confidence).toBe('low');
      expect(p.status).toBe('calibrating');
      expect(p.decision).toBe('calibrate');
      expect(p.notes.join(' ')).toMatch(new RegExp(`Calibrating: ${n} comparable session`));
    }
  });
  it('2–3 → moderate, ≥4 → high', () => {
    expect(tier(2).confidence).toBe('moderate');
    expect(tier(3).confidence).toBe('moderate');
    expect(tier(4).confidence).toBe('high');
    expect(tier(6).confidence).toBe('high');
    expect(tier(4).status).toBe('ready');
  });
  it('calendar days alone never unlock it: 1 session 30 days ago stays low', () => {
    const p = run(appData([workout(addDays(TODAY, -30), [pecDeck([14, 13, 12])])]), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.sessionsUsed).toBe(1);
    expect(p.confidence).toBe('low');
    // The known load is reused, not invented — one real step down because the last session was 30 days ago
    // (rule planner_returning: > 14 days off → first session one step below the last comparable load).
    expect(p.workingWeightKg).toBe(40);
    expect(p.decisionWhy).toMatch(/Back after 30 days/);
  });
  it('sessions older than 8 weeks do not count', () => {
    const old = Array.from({ length: 5 }, (_, i) => workout(addDays(TODAY, -100 + i * 7), [pecDeck([14, 13, 12])]));
    const p = run(appData(old), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.sessionsUsed).toBe(0);
    expect(p.confidence).toBe('low');
    expect(p.confidenceReason).toMatch(/too old/);
  });
});

// ---------------------------------------------------------------- calibration

describe('insufficient data', () => {
  it('no history → calibrate with honest notes and no invented precision', () => {
    const p = run(appData([]), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.decision).toBe('calibrate');
    expect(p.workingWeightKg).toBeNull();
    expect(p.warmups).toEqual([]);
    expect(p.sets.length).toBeGreaterThan(0);
    for (const s of p.sets) {
      expect(s.weightKg).toBeNull();
      expect([s.repsMin, s.repsMax]).toEqual([10, 15]); // the exercise default, not a made-up per-set range
      expect(s.restSec).toBeNull();
    }
    expect(p.repSource).toBe('exercise_default');
    expect(p.rest.source).toBe('bounds');
    expect(p.rest.range).toEqual([60, 180]);
    expect(p.notes.join(' | ')).toMatch(/Calibrating: 0 comparable sessions/);
    expect(p.notes.join(' | ')).toMatch(/No working weight known/);
    expect(p.advice.kind).toBe('not_enough_data');
  });
});

// ---------------------------------------------------------------- loads & keys

describe('loads snap to real increments', () => {
  it('machine: +1 stack increment after two sessions at the top of the range', () => {
    const p = run(appData(history(2, () => [pecDeck([15, 15, 15])])), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.decision).toBe('increase');
    expect(p.step).toBe(5);
    expect(p.stepSource).toBe('equipment');
    expect(p.workingWeightKg).toBe(50);
    expect(p.sets.every((s) => s.weightKg === 50)).toBe(true);
  });
  it('never increases after one good session', () => {
    const ws = [workout(weeksAgo(2), [pecDeck([13, 12, 12])]), workout(weeksAgo(1), [pecDeck([15, 15, 15])])];
    const p = run(appData(ws), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.decision).toBe('keep');
    expect(p.workingWeightKg).toBe(45);
  });
  it('dumbbells use the gym\'s own jumps: [2.5] → 22.5 kg, not 22', () => {
    const idp = () => [ex('incline_dumbbell_press', [set(20, 12, 3), set(20, 12, 3, rest(150)), set(20, 12, 3, rest(150))])];
    const ws = history(2, idp);
    const target = { chest: { min: 6, preferred: 10, max: 16 } };
    const withGym = run(appData(ws, { locations: [loc('gym_a', { freeWeightIncrementsKg: [2.5] })], targets: target }), live([ex('incline_dumbbell_press', [])]));
    expect(withGym.stepSource).toBe('gym_free_weights');
    expect(withGym.decision).toBe('increase');
    expect(withGym.workingWeightKg).toBe(22.5);
    const noGym = run(appData(ws, { targets: target }), live([ex('incline_dumbbell_press', [])]));
    expect(noGym.stepSource).toBe('default');
    expect(noGym.workingWeightKg).toBe(22);
  });
  it('a different machine at another gym has its own key and history', () => {
    const d = appData(history(4, () => [pecDeck([14, 13, 12])]));
    const a = run(d, live([ex('pec_deck', [], 'pd_a')]));
    const b = run(d, live([ex('pec_deck', [], 'pd_b')], { locationId: 'gym_b' }));
    expect(a.key).toBe('pec_deck::pd_a');
    expect(b.key).toBe('pec_deck::pd_b');
    expect(a.confidence).toBe('high');
    expect(b.sessionsUsed).toBe(0);
    expect(b.confidence).toBe('low');
    expect(b.workingWeightKg).toBeNull(); // 45 kg on machine A says nothing about machine B
  });
  it('a new variation (bench angle) is a new key', () => {
    const ws = history(4, () => [ex('incline_dumbbell_press', [set(20, 10, 2), set(20, 9, 2)], null, { variation: { benchAngleDeg: 30 } })]);
    const p = run(appData(ws), live([ex('incline_dumbbell_press', [], null, { variation: { benchAngleDeg: 45 } })]));
    expect(p.key).toBe('incline_dumbbell_press::free|angle=45');
    expect(p.confidence).toBe('low');
  });
  it('the next load does not exist (stack max) → keep and add reps', () => {
    const p = run(appData(history(2, () => [pecDeck([15, 15, 15])]), { equipment: [machine('pd_a', 'gym_a', { maxKg: 45 })] }), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.decision).toBe('keep');
    expect(p.workingWeightKg).toBe(45);
    expect(p.decisionWhy).toMatch(/does not exist/);
  });
});

// ---------------------------------------------------------------- reps, RIR, rest

describe('rep ranges come from the owner\'s own history', () => {
  const twoSessions = (reps: number[]) => run(appData(history(2, () => [pecDeck(reps)])), live([ex('pec_deck', [], 'pd_a')]));
  it('per-set ranges follow the first-set reps and the typical drop at the usual rest', () => {
    const steep = twoSessions([14, 12, 10]);
    const flat = twoSessions([14, 14, 13]);
    expect(steep.repSource).toBe('history');
    expect(steep.repDropPerSet).toBe(2);
    expect(steep.sets.slice(0, 3).map((s) => [s.repsMin, s.repsMax])).toEqual([[14, 15], [12, 13], [10, 11]]);
    expect(flat.repDropPerSet).toBe(0.5);
    expect(flat.sets[2].repsMin).toBeGreaterThan(steep.sets[2].repsMin);
    expect(steep.sets.map((s) => s.repsMin)).not.toEqual(flat.sets.map((s) => s.repsMin)); // not one magic range
  });
  it('stays inside sensible bounds', () => {
    const p = twoSessions([14, 10, 6]);
    for (const s of p.sets) {
      expect(s.repsMin).toBeGreaterThanOrEqual(p.repBounds[0]);
      expect(s.repsMax).toBeLessThanOrEqual(p.repBounds[1]);
      expect(s.repsMax).toBeGreaterThanOrEqual(s.repsMin);
    }
  });
});

describe('RIR targets', () => {
  const squatHist = (extra: Partial<WorkoutSet> = {}) => history(2, () => [ex('back_squat', [set(100, 8, 2, extra), set(100, 8, 2, { ...rest(180), ...extra }), set(100, 7, 2, rest(180))])]);
  const quads = { quads: { min: 6, preferred: 10, max: 16 } };
  it('machine isolation 1–2, free-weight squat 2–3', () => {
    expect(run(appData(history(2, () => [pecDeck([14, 13, 12])])), live([ex('pec_deck', [], 'pd_a')])).rirTarget).toEqual([1, 2]);
    expect(run(appData(squatHist(), { targets: quads }), live([ex('back_squat', [])])).rirTarget).toEqual([2, 3]);
  });
  it('+1 after technique broke down in the last 2 sessions', () => {
    const ws = [...history(2, () => [pecDeck([14, 13, 12])]), workout(addDays(TODAY, -2), [ex('pec_deck', [set(45, 14, 1), set(45, 12, 0, { technique: 'compromised', restSecBefore: 90 })], 'pd_a')])];
    expect(run(appData(ws), live([ex('pec_deck', [], 'pd_a')])).rirTarget).toEqual([2, 3]);
  });
  it('frequent failure on a technique-first compound makes it more conservative (never "failure every set")', () => {
    const p = run(appData(squatHist({ failure: 'muscular', rir: 0 }), { targets: quads }), live([ex('back_squat', [])]));
    expect(p.rirTarget).toEqual([3, 4]);
    expect(p.rirReason).toMatch(/failure/);
    expect(p.sets.every((s) => s.rirMin >= 1)).toBe(true);
  });
});

describe('rest', () => {
  it('uses the owner\'s median rest on this key, bounded, as a range', () => {
    const p = run(appData(history(2, () => [pecDeck([14, 13, 12])])), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.rest.source).toBe('history');
    expect(p.rest.medianSec).toBe(90);
    expect(p.rest.range).toEqual([75, 105]);
    expect(p.sets[0].restSec).toEqual([75, 105]);
  });
  it('bounds a very short habitual rest on a compound to ≥ 120 s', () => {
    const ws = history(2, () => [ex('back_squat', [set(100, 8, 2), set(100, 8, 2, rest(60)), set(100, 7, 2, rest(60))])]);
    const p = run(appData(ws, { targets: { quads: { min: 6, preferred: 10, max: 16 } } }), live([ex('back_squat', [])]));
    expect(p.rest.range[0]).toBeGreaterThanOrEqual(120);
    expect(p.rest.medianSec).toBe(60);
  });
});

// ---------------------------------------------------------------- set count

describe('set count from the remaining weekly volume', () => {
  const ws = history(2, () => [pecDeck([14, 13, 12]), ex('machine_chest_press', [set(60, 10, 2), set(60, 9, 2, rest(120))], null)]);
  it('follows today\'s share of the primary muscle', () => {
    const d = appData(ws, { targets: { chest: { min: 2, preferred: 4, max: 8 } } });
    const a = analyze(d, NOW);
    const share = a.muscles.find((m) => m.muscle === 'chest')!.todayShare;
    const p = run(d, live([ex('pec_deck', [], 'pd_a')]));
    expect(p.primaryMuscle).toBe('chest');
    expect(p.setCount).toBe(Math.min(4, Math.round(share)));
    expect(p.sets).toHaveLength(p.setCount);
  });
  it('minus what earlier exercises already gave that muscle in this session (done sets only)', () => {
    const d = appData(ws, { targets: { chest: { min: 2, preferred: 4, max: 8 } } });
    const alone = run(d, live([ex('pec_deck', [], 'pd_a')]));
    const after = run(d, live([ex('machine_chest_press', [set(60, 10, 2), set(60, 9, 2)]), ex('pec_deck', [], 'pd_a')]), 1);
    expect(after.setCount).toBe(alone.setCount - 2);
    expect(after.setCountReason).toMatch(/from earlier exercises/);
    // Planned (not ticked) sets of the earlier exercise do not count.
    const planned = run(d, live([ex('machine_chest_press', [set(60, 10, 2, { planned: true }), set(60, 9, 2, { planned: true })]), ex('pec_deck', [], 'pd_a')]), 1);
    expect(planned.setCount).toBe(alone.setCount);
  });
  it('earlier warm-ups are not counted', () => {
    const d = appData(ws, { targets: { chest: { min: 2, preferred: 4, max: 8 } } });
    const alone = run(d, live([ex('pec_deck', [], 'pd_a')]));
    const afterWarmups = run(d, live([ex('machine_chest_press', [set(30, 10, null, { type: 'warmup' }), set(45, 5, null, { type: 'warmup' })]), ex('pec_deck', [], 'pd_a')]), 1);
    expect(afterWarmups.setCount).toBe(alone.setCount);
    expect(afterWarmups.warmups.length).toBe(alone.warmups.length);
  });
  it('never more than the per-exercise max (4 isolation / 5 compound)', () => {
    const d = appData(ws, { targets: { chest: { min: 10, preferred: 20, max: 30 } } });
    expect(run(d, live([ex('pec_deck', [], 'pd_a')])).setCount).toBe(4);
    expect(run(d, live([ex('machine_chest_press', [])])).setCount).toBe(5);
  });
  it('0 with a reason when the weekly target is already met', () => {
    const met = [...ws, workout('2026-11-16', [pecDeck([14, 13, 12, 12, 11])])];
    const p = run(appData(met, { targets: { chest: { min: 2, preferred: 4, max: 8 } } }), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.setCount).toBe(0);
    expect(p.sets).toEqual([]);
    expect(p.setCountReason).toMatch(/met its weekly target/);
  });
  it('0 with a reason while still recovering from an earlier session', () => {
    const rec = [...ws, workout('2026-11-17', [pecDeck([14, 13, 12, 12])])]; // yesterday 18:00 → 23 h of a ≥ 36 h window
    const p = run(appData(rec), live([ex('pec_deck', [], 'pd_a')]));
    expect(p.setCount).toBe(0);
    expect(p.setCountReason).toMatch(/still recovering/);
  });
  it('is stable while logging: today\'s own done sets never change the plan', () => {
    const d = appData(ws);
    const before = run(d, live([ex('pec_deck', [], 'pd_a')]));
    const w = live([ex('pec_deck', [set(45, 15, 2), set(45, 13, 2, rest(90))], 'pd_a')]);
    const during = run({ ...d, workouts: [...d.workouts, w] }, w);
    expect(during.sets).toEqual(before.sets);
    expect(during.decision).toBe(before.decision);
  });
});

// ---------------------------------------------------------------- warm-ups

describe('warm-ups', () => {
  const ws = history(2, () => [ex('back_squat', [set(100, 8, 2), set(100, 8, 2, rest(180)), set(100, 7, 2, rest(180))]), ex('leg_extension', [set(50, 12, 2)])]);
  const d = appData(ws, { targets: { quads: { min: 6, preferred: 12, max: 18 } } });
  it('free-weight compound, first heavy exercise: full ramp on the real grid, below the working weight', () => {
    const p = run(d, live([ex('back_squat', [])]));
    expect(p.workingWeightKg).toBe(100);
    expect(p.warmups.map((w) => w.weightKg)).toEqual([50, 70, 85]);
    expect(p.warmups.every((w) => (w.weightKg as number) % 2.5 === 0)).toBe(true);
  });
  it('fewer when the muscle was trained earlier in the session', () => {
    const p = run(d, live([ex('leg_extension', [set(50, 12, 2), set(50, 11, 2)]), ex('back_squat', [])]), 1);
    expect(p.warmups).toHaveLength(1);
    expect(p.warmups[0].weightKg).toBe(70);
  });
  it('shorter ramp when a heavy compound for other muscles came first', () => {
    const p = run(d, live([ex('machine_chest_press', [set(60, 10, 2)]), ex('back_squat', [])]), 1);
    expect(p.warmups.map((w) => w.weightKg)).toEqual([70, 85]);
  });
  it('machine isolation gets at most one; none after same-muscle work', () => {
    const fresh = run(d, live([ex('leg_extension', [])]));
    expect(fresh.warmups).toHaveLength(1);
    const after = run(d, live([ex('back_squat', [set(100, 8, 2), set(100, 8, 2)]), ex('leg_extension', [])]), 1);
    expect(after.warmups).toEqual([]);
  });
  it('follows the owner\'s own logged warm-up habit on this key', () => {
    const habit = history(3, () => [ex('back_squat', [
      set(60, 5, null, { type: 'warmup' }), set(100, 8, 2), set(100, 8, 2, rest(180)),
    ])]);
    const p = run(appData(habit, { targets: { quads: { min: 6, preferred: 12, max: 18 } } }), live([ex('back_squat', [])]));
    expect(p.warmups).toEqual([{ weightKg: 60, reps: 5 }]);
    expect(p.warmupReason).toMatch(/your own warm-up habit/);
  });
  it('warm-ups are never counted as volume', () => {
    const p = run(d, live([ex('back_squat', [])]));
    const w = live([ex('back_squat', p.warmups.map((x) => set(x.weightKg, x.reps, null, { type: 'warmup', prescribed: toSetPrescription(x, 'warmup') })))]);
    const v = computeVolume([w], analyze(d, NOW).registry, d.settings.quality);
    expect(v.muscles.quads.effective).toBe(0);
    expect(v.totalWarmupSets).toBe(p.warmups.length);
  });
  it('assisted: warm up with MORE assistance; unknown weight: none', () => {
    const ah = history(2, () => [ex('assisted_pull_up', [set(30, 10, 2, { loadMode: 'assisted' }), set(30, 9, 2, { loadMode: 'assisted', restSecBefore: 120 })])]);
    const p = run(appData(ah, { targets: { lats: { min: 6, preferred: 10, max: 16 } } }), live([ex('assisted_pull_up', [])]));
    expect(p.loadMode).toBe('assisted');
    expect(p.warmups[0].weightKg).toBeGreaterThan(30);
    expect(run(appData([]), live([ex('back_squat', [])])).warmups).toEqual([]);
  });
});

// ---------------------------------------------------------------- adaptRemaining

describe('adaptRemaining', () => {
  const base = (eq: Equipment = machine('pd_a', 'gym_a', { maxKg: 100 })) =>
    run(appData(history(2, () => [pecDeck([14, 13, 12])]), { equipment: [eq] }), live([ex('pec_deck', [], 'pd_a')]));
  const done = (w: number, reps: number, rir: number | null, extra: Partial<WorkoutSet> = {}) => set(w, reps, rir, { completedAt: `${TODAY}T17:05:00Z`, ...extra });

  it('clearly too easy with clean technique and reps at the top → +1 step on the remaining sets', () => {
    const p = base();
    expect(p.workingWeightKg).toBe(45);
    expect(p.setCount).toBeGreaterThanOrEqual(3);
    const r = adaptRemaining(p, [done(45, 15, 4, { technique: 'good' })], p.step);
    expect(r.change).toBe('add_load');
    expect(r.sets).toHaveLength(p.setCount - 1);
    expect(r.sets.every((s) => s.weightKg === 50)).toBe(true);
  });
  it('feel alone is not enough: "too easy" with a logged RIR 2 is judged by the RIR', () => {
    const p = base();
    expect(adaptRemaining(p, [done(45, 15, 2, { feel: 'too_easy' })], p.step).change).toBe('none');
    expect(adaptRemaining(p, [done(45, 15, null, { feel: 'too_easy', effort: 'very_easy' })], p.step).change).toBe('add_load');
    expect(adaptRemaining(p, [done(45, 12, 4)], p.step).change).not.toBe('add_load'); // reps below the top
  });
  it('the next weight does not exist (stack max) → keep the weight and add reps', () => {
    const p = base(machine('pd_a', 'gym_a', { maxKg: 45 }));
    const r = adaptRemaining(p, [done(45, 15, 4)], p.step);
    expect(r.change).toBe('add_reps');
    expect(r.sets.every((s) => s.weightKg === 45)).toBe(true);
    expect(r.sets[0].repsMin).toBe(p.sets[1].repsMin + 2);
    expect(r.why).toMatch(/no heavier step/);
  });
  it('technical failure / RIR 0 with broken technique → one step down', () => {
    const p = base();
    const r = adaptRemaining(p, [done(45, 9, 0, { technicalFailure: true, failure: 'muscular' })], p.step);
    expect(r.change).toBe('reduce');
    expect(r.sets.every((s) => s.weightKg === 40)).toBe(true);
    const r2 = adaptRemaining(p, [done(45, 10, 0, { technique: 'compromised' })], p.step);
    expect(r2.change).toBe('reduce');
  });
  it('a hard set with good technique is fine (no reduction)', () => {
    const p = base();
    expect(adaptRemaining(p, [done(45, 14, 0, { feel: 'hard_good', technique: 'good', failure: 'muscular' })], p.step).change).toBe('none');
  });
  it('on target → none', () => {
    const p = base();
    const r = adaptRemaining(p, [done(45, 14, 2)], p.step);
    expect(r.change).toBe('none');
    expect(r.sets).toEqual(p.sets.slice(1));
  });
  it('reps well below the range: one set → defer; two sets → keep the load, lower the rep target', () => {
    const p = base();
    const one = adaptRemaining(p, [done(45, 10, 1)], p.step);
    expect(one.change).toBe('defer');
    expect(one.sets).toEqual(p.sets.slice(1));
    const two = adaptRemaining(p, [done(45, 10, 1), done(45, 9, 1, rest(90))], p.step);
    expect(two.change).toBe('reduce');
    expect(two.sets.every((s) => s.weightKg === 45)).toBe(true);
    expect(two.sets[0].repsMax).toBeLessThanOrEqual(10);
  });
  it('a drop after a clearly short rest is attributed to the rest', () => {
    const p = base();
    const r = adaptRemaining(p, [done(45, 14, 2), done(45, 9, 1, rest(30))], p.step);
    expect(r.change).toBe('none');
    expect(r.why).toMatch(/shorter rest/);
  });
  it('pain never adds load', () => {
    const p = base();
    expect(adaptRemaining(p, [done(45, 15, 5, { feel: 'pain', pain: { area: 'Shoulder' } })], p.step).change).toBe('none');
  });
});

// ---------------------------------------------------------------- recording

describe('toSetPrescription', () => {
  it('records prescribed values separately, tagged with the engine', () => {
    const sp = toSetPrescription({ weightKg: 45, repsMin: 12, repsMax: 13, rirMin: 1, rirMax: 2, restSec: [75, 105] }, 'working');
    expect(sp).toEqual({ weightKg: 45, repsMin: 12, repsMax: 13, rirMin: 1, rirMax: 2, restSec: 90, kind: 'working', engine: 'presc-1' });
    const wu = toSetPrescription({ weightKg: 20, reps: 8 }, 'warmup');
    expect(wu.kind).toBe('warmup');
    expect([wu.repsMin, wu.repsMax]).toEqual([8, 8]);
  });
});
