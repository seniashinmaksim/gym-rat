/**
 * Live flow (Part 6, F.2 / F.5): a set is logged AFTER it was done. No set rows are prepared.
 *
 *  - prefillNext: weight and reps offered for the set about to be logged (never counted until logged);
 *  - logSet: appends the performed set (completion time, measured rest) and re-checks warm-up tags;
 *  - effortTapPatch: the one optional answer after a set — EASY / GOOD / HARD / FAILED;
 *  - setDelta: the honest comparison with the same set last time;
 *  - restState: the rest timer, computed from the stored completion time (survives reload and lock).
 *
 * Pure: no storage, no clock (pass `nowMs`).
 */
import { reclassifyWarmups } from './perception';
import { measuredRestSec } from './sessionSummary';
import type { Effort, ExerciseTarget, LoadMode, QualityModel, SetFeel, Side, Workout, WorkoutExercise, WorkoutSet } from './types';

export const REST_DEFAULT_SEC = 150;
export const REST_STEP_SEC = 15;
export const REST_MIN_SEC = 15;
export const REST_MAX_SEC = 900;
/** A second LOG SET with the same values inside this window is a double tap, not a second set. */
export const DOUBLE_TAP_MS = 1500;

// ---------------------------------------------------------------- effort tap

export type EffortTap = 'easy' | 'good' | 'hard' | 'failed';
export const EFFORT_TAPS: EffortTap[] = ['easy', 'good', 'hard', 'failed'];

const TAP_FIELDS: Record<EffortTap, { feel: SetFeel; effort: Effort }> = {
  easy: { feel: 'bit_easy', effort: 'easy' }, // 3 or more reps left
  good: { feel: 'just_right', effort: 'appropriate' }, // 1–2 reps left
  hard: { feel: 'hard_good', effort: 'near_max' }, // 0–1 reps left
  failed: { feel: 'hard_good', effort: 'near_max' }, // could not finish the rep → muscular failure
};

/**
 * The patch one tap applies: the feel, the effort and (FAILED) muscular failure. Tapping the selected
 * answer again clears it. RIR, weight, reps, technique, wrong-weight and pain flags are never touched.
 */
export function effortTapPatch(set: WorkoutSet, tap: EffortTap | null): Partial<WorkoutSet> {
  const cur = effortTapOf(set);
  const wasFailed = cur === 'failed';
  // An older set marked with the Fail chip (`toFailure`) reads as FAILED; choosing another answer clears that mark too.
  const clearFail = wasFailed ? { failure: undefined, ...(set.toFailure ? { toFailure: undefined } : {}) } : {};
  if (tap == null || tap === cur) return { feel: undefined, effort: undefined, ...clearFail };
  const f = TAP_FIELDS[tap];
  return { feel: f.feel, effort: f.effort, ...(tap === 'failed' ? { failure: 'muscular' as const } : clearFail) };
}

/** Which answer a set carries (also for sets logged before Part 6). */
export function effortTapOf(s: WorkoutSet): EffortTap | null {
  if (s.failure === 'muscular' || s.toFailure) return 'failed';
  if (s.effort === 'near_max' || s.effort === 'hard') return 'hard';
  if (s.effort === 'appropriate') return 'good';
  if (s.effort === 'easy' || s.effort === 'very_easy') return 'easy';
  return null;
}

// ---------------------------------------------------------------- pre-fill

export interface Prefill {
  weightKg: number | null;
  reps: number | null;
  /** Where the weight came from. */
  from: 'session' | 'last' | 'plan' | null;
  /** The other candidate when the plan and last time differ ("last 60 → today 62.5"). */
  alt: { weightKg: number; from: 'last' | 'plan' } | null;
}

const performed = (e: WorkoutExercise | null | undefined) => (e ? e.sets.filter((s) => !s.planned) : []);
const targetReps = (t: ExerciseTarget | null | undefined, k: number) => (t && t.reps.length ? t.reps[Math.min(k, t.reps.length - 1)].min : null);

/**
 * Values offered for the next set of `ex`.
 * Weight: the same set number last time while the session repeats last time's weights so far (so a
 * ramp 20 → 40 → 60 repeats by itself); else the last set of this session; else last time's first
 * set; else the plan. When last time's top weight is due and the plan says a different load, the plan
 * is offered with last time's weight as the alternative.
 * Reps: last time's reps for that set at that weight; else the plan's lower bound; else the previous set's reps.
 */
export function prefillNext(ex: WorkoutExercise, last: WorkoutExercise | null, target: ExerciseTarget | null | undefined = ex.target): Prefill {
  const done = performed(ex);
  const prev = performed(last);
  const n = done.length;
  const follows = n > 0 && done.every((s, i) => prev[i] && prev[i].weightKg === s.weightKg);
  let weight: number | null = null;
  let from: Prefill['from'] = null;
  if (n === 0) {
    if (prev[0]?.weightKg != null) { weight = prev[0].weightKg; from = 'last'; }
    else if (target?.weightKg != null) { weight = target.weightKg; from = 'plan'; }
  } else if (follows && prev[n]?.weightKg != null) { weight = prev[n].weightKg; from = 'last'; }
  else { weight = done[n - 1].weightKg; from = weight != null ? 'session' : null; }

  let alt: Prefill['alt'] = null;
  const lastWork = prev.filter((s) => s.type === 'working' && s.weightKg != null).map((s) => s.weightKg as number);
  const lastTop = lastWork.length ? Math.max(...lastWork) : null;
  const planW = target?.weightKg ?? null;
  // The owner already did a set at last time's top weight today (declined the plan): the plan is not pushed again.
  const declined = lastTop != null && done.some((s) => s.weightKg === lastTop);
  if (from === 'last' && weight != null && planW != null && lastTop != null && weight === lastTop && planW !== lastTop && !declined) {
    alt = { weightKg: weight, from: 'last' };
    weight = planW;
    from = 'plan';
  }

  let reps: number | null = null;
  const workDone = done.filter((s) => s.type === 'working' && s.weightKg === weight).length;
  if (from !== 'plan' && prev[n]?.reps != null && prev[n].weightKg === weight) reps = prev[n].reps;
  else if (from === 'plan' || (planW != null && weight === planW)) reps = targetReps(target, workDone);
  if (reps == null) reps = prev[n]?.reps ?? (n > 0 ? done[n - 1].reps : null) ?? targetReps(target, workDone);
  return { weightKg: weight, reps, from, alt };
}

// ---------------------------------------------------------------- logging

type WarmupModel = Pick<QualityModel, 'rirCredit' | 'useNumbersCheck' | 'useFeelWhenNoRir'>;

/**
 * "Last time" for an exercise entry: the most recent EARLIER entry of the same history (same exercise ×
 * machine × configuration, by `keyOf` = progressionKey) that has at least one performed set. A different
 * bench angle or machine is a different history; a card that was planned but never done is skipped.
 */
export function lastEntryFor(workouts: Workout[], w: Workout, ex: WorkoutExercise, keyOf: (e: WorkoutExercise, o: Workout) => string): WorkoutExercise | null {
  const key = keyOf(ex, w);
  const stamp = (o: Workout) => `${o.date}T${o.startTime ?? '00:00'}`;
  const earlier = workouts.filter((o) => o.id !== w.id && o.date <= w.date).sort((a, b) => stamp(b).localeCompare(stamp(a)));
  for (const o of earlier) {
    for (const e of o.exercises) {
      if (e.exerciseId === ex.exerciseId && e.sets.some((s) => !s.planned) && keyOf(e, o) === key) return e;
    }
  }
  return null;
}

export interface SetEntry { weightKg: number | null; reps: number | null; loadMode: LoadMode; side?: Side }

/** A repeated LOG SET (same values right after the previous one) is ignored. */
export function isDoubleTap(ex: WorkoutExercise, entry: SetEntry, nowMs: number): boolean {
  const done = performed(ex);
  const lastSet = done[done.length - 1];
  if (!lastSet?.completedAt) return false;
  return nowMs - Date.parse(lastSet.completedAt) < DOUBLE_TAP_MS && lastSet.weightKg === entry.weightKg && lastSet.reps === entry.reps && (lastSet.side ?? null) === (entry.side ?? null);
}

/**
 * Appends the set that was just performed. Rest before it = time since the previous performed set of
 * THIS exercise minus an estimate of the set's own duration (the second side of a left/right pair has
 * no rest). Warm-up tags of the whole exercise are then re-checked from the numbers.
 */
export function logSet(ex: WorkoutExercise, entry: SetEntry, nowMs: number, id: string, model: WarmupModel): WorkoutExercise {
  const done = performed(ex);
  const prevAt = done.map((s) => s.completedAt).filter((x): x is string => !!x).sort().pop();
  const secondSide = !!entry.side && done.filter((s) => s.side && s.side !== entry.side).length > done.filter((s) => s.side === entry.side).length;
  const rest = secondSide ? null : measuredRestSec(prevAt, nowMs, entry.reps);
  const set: WorkoutSet = {
    id, type: 'working', weightKg: entry.weightKg, loadMode: entry.loadMode, reps: entry.reps, rir: null, rirSource: 'unknown',
    restSecBefore: rest, ...(rest != null ? { restSource: 'timer' as const } : {}), completedAt: new Date(nowMs).toISOString(),
    ...(entry.side ? { side: entry.side } : {}),
  };
  return { ...ex, sets: reclassifyWarmups([...ex.sets, set], model), ...(ex.startedAt ? {} : { startedAt: set.completedAt }) };
}

/** Edit or remove a logged set, then re-check warm-up tags. `patch: null` removes it. */
export function editSet(ex: WorkoutExercise, setId: string, patch: Partial<WorkoutSet> | null, model: WarmupModel): WorkoutExercise {
  const sets = patch == null ? ex.sets.filter((s) => s.id !== setId) : ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s));
  return { ...ex, sets: reclassifyWarmups(sets, model) };
}

/** The owner corrects the warm-up tag: stored as the owner's decision, never changed automatically. */
export function toggleWarmup(ex: WorkoutExercise, setId: string): WorkoutExercise {
  return { ...ex, sets: ex.sets.map((s) => (s.id !== setId || s.type === 'drop' ? s : { ...s, type: s.type === 'warmup' ? 'working' as const : 'warmup' as const, typeSource: 'owner' as const })) };
}

// ---------------------------------------------------------------- progress and comparison

/** Working sets performed (left + right pairs count once) against the target. */
export function exerciseProgress(ex: WorkoutExercise): { done: number; target: number | null; reached: boolean } {
  const work = ex.sets.filter((s) => !s.planned && s.type === 'working');
  const sides = work.filter((s) => s.side);
  const pairs = Math.min(sides.filter((s) => s.side === 'left').length, sides.filter((s) => s.side === 'right').length);
  const done = work.length - pairs;
  const target = ex.target?.sets ?? null;
  return { done, target, reached: target != null && target > 0 && done >= target };
}

export interface SetDelta {
  kind: 'up' | 'same' | 'down' | 'new';
  /** Reps difference at the same weight, else null. */
  reps: number | null;
  /** Weight difference (kg) when the weight changed, else null. */
  kg: number | null;
}

/** The i-th performed set compared with the i-th performed set of the same exercise last time. null = nothing to compare. */
export function setDelta(ex: WorkoutExercise, setId: string, last: WorkoutExercise | null): SetDelta | null {
  const done = performed(ex);
  const i = done.findIndex((s) => s.id === setId);
  const cur = done[i];
  const ref = performed(last)[i];
  if (!cur || !ref || cur.reps == null || ref.reps == null || cur.weightKg == null || ref.weightKg == null) return last && cur ? { kind: 'new', reps: null, kg: null } : null;
  if (cur.weightKg !== ref.weightKg) {
    const kg = Math.round((cur.weightKg - ref.weightKg) * 100) / 100;
    return { kind: kg > 0 ? 'up' : 'down', reps: null, kg };
  }
  const reps = cur.reps - ref.reps;
  return { kind: reps > 0 ? 'up' : reps < 0 ? 'down' : 'same', reps, kg: null };
}

/** Reps-only Epley value of a set (what "best on this machine" compares). */
export function setScore(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || weightKg <= 0 || reps < 1) return null;
  return weightKg * (1 + Math.min(reps, 30) / 30);
}

// ---------------------------------------------------------------- clock and rest

/** When the workout clock starts: the first logged set. null = nothing logged yet. */
export function clockStartMs(w: Workout): number | null {
  let first: number | null = null;
  for (const e of w.exercises) for (const s of e.sets) {
    if (s.planned || !s.completedAt) continue;
    const t = Date.parse(s.completedAt);
    if (Number.isFinite(t) && (first == null || t < first)) first = t;
  }
  return first;
}

export interface LastLogged { atMs: number; exerciseId: string; setId: string }

export function lastLogged(w: Workout): LastLogged | null {
  let best: LastLogged | null = null;
  for (const e of w.exercises) for (const s of e.sets) {
    if (s.planned || !s.completedAt) continue;
    const t = Date.parse(s.completedAt);
    if (Number.isFinite(t) && (!best || t > best.atMs)) best = { atMs: t, exerciseId: e.id, setId: s.id };
  }
  return best;
}

export const clampRest = (sec: number) => Math.max(REST_MIN_SEC, Math.min(REST_MAX_SEC, Math.round(sec)));

/** The rest length for an exercise: its own adjusted length this session, else the default from Settings. */
export function restTargetFor(ex: WorkoutExercise | null | undefined, defaultSec: number | undefined): number {
  return clampRest(ex?.restTargetSec ?? defaultSec ?? REST_DEFAULT_SEC);
}

export interface RestState {
  exerciseId: string;
  setId: string;
  targetSec: number;
  elapsedSec: number;
  /** Negative = over time. */
  remainingSec: number;
  done: boolean;
}

/** Rest since the last logged set (the timer). `pausedMs` = time the timer was paused in this rest. */
export function restState(w: Workout, nowMs: number, defaultSec: number | undefined, pausedMs = 0): RestState | null {
  const l = lastLogged(w);
  if (!l) return null;
  const ex = w.exercises.find((e) => e.id === l.exerciseId);
  const targetSec = restTargetFor(ex, defaultSec);
  const elapsedSec = Math.max(0, Math.floor((nowMs - l.atMs - pausedMs) / 1000));
  return { exerciseId: l.exerciseId, setId: l.setId, targetSec, elapsedSec, remainingSec: targetSec - elapsedSec, done: elapsedSec >= targetSec };
}

/** −15 / +15: the new length for this exercise (kept for the rest of the session). */
export function adjustRest(ex: WorkoutExercise, deltaSec: number, defaultSec: number | undefined): WorkoutExercise {
  return { ...ex, restTargetSec: clampRest(restTargetFor(ex, defaultSec) + deltaSec) };
}

export const mmss = (sec: number) => `${sec < 0 ? '−' : ''}${Math.floor(Math.abs(sec) / 60)}:${String(Math.abs(sec) % 60).padStart(2, '0')}`;
