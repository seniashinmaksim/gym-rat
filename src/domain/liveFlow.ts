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
import { adaptRemaining, type Prescription } from './prescription';
import { L, num } from '../i18n/core';
import { measuredRestSec } from './sessionSummary';
import type { Effort, ExerciseTarget, LoadMode, QualityModel, SetFeel, SetPrescription, Side, Workout, WorkoutExercise, WorkoutSet } from './types';

export const REST_DEFAULT_SEC = 150;
export const REST_STEP_SEC = 15;
export const REST_MIN_SEC = 15;
export const REST_MAX_SEC = 900;
/** A second LOG SET with the same values inside this window is a double tap, not a second set. */
export const DOUBLE_TAP_MS = 1500;
/** Any second LOG SET this soon is a double tap, even for the other side of a pair (nobody finishes a side in 0.4 s). */
export const ANY_DOUBLE_TAP_MS = 400;

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
  // Owner 2026-11-25: what the analysis learned comes first — last time's ramp (40 → 45 → 50 → 55) was finding the
  // weight; its lightest set is not the default again. While every set logged so far followed the plan, the plan's
  // weight is offered (last time's weight for that set stays one tap away); once the owner logs another weight, the
  // session leads (a declined plan load is not pushed again).
  const planFirst = target?.weightKg != null && done.every((s) => s.weightKg === target.weightKg);
  let altLast: number | null = null;
  if (planFirst) {
    weight = target!.weightKg as number; from = 'plan';
    const lastW = prev[n]?.weightKg ?? null;
    if (lastW != null && lastW !== weight) altLast = lastW;
  } else if (n === 0) {
    if (prev[0]?.weightKg != null) { weight = prev[0].weightKg; from = 'last'; }
  } else if (follows && prev[n]?.weightKg != null) { weight = prev[n].weightKg; from = 'last'; }
  else { weight = done[n - 1].weightKg; from = weight != null ? 'session' : null; }

  // The remaining sets were adapted during this exercise (the owner tapped Use): that weight goes in — unless a set was
  // logged after that at another weight (the owner chose otherwise; a declined load is not pushed again).
  const ad = ex.target?.adapted;
  if (ad && ex.target!.weightKg != null) {
    const after = done.filter((s) => (s.completedAt ?? '') > ad.at);
    if (!after.length || after[after.length - 1].weightKg === ex.target!.weightKg) { weight = ex.target!.weightKg; from = 'plan'; }
  }

  let alt: Prefill['alt'] = altLast != null ? { weightKg: altLast, from: 'last' } : null;
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
  const since = nowMs - Date.parse(lastSet.completedAt);
  if (since < ANY_DOUBLE_TAP_MS) return true;
  return since < DOUBLE_TAP_MS && lastSet.weightKg === entry.weightKg && lastSet.reps === entry.reps && (lastSet.side ?? null) === (entry.side ?? null);
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
  // Rest ends when NEXT SET was pressed (training mode); without that press it is estimated from the set's duration.
  const prevMs = prevAt ? Date.parse(prevAt) : NaN;
  const endMs = ex.restEndedAt ? Date.parse(ex.restEndedAt) : NaN;
  const pressed = Number.isFinite(prevMs) && Number.isFinite(endMs) && endMs > prevMs && endMs <= nowMs;
  const rest = secondSide ? null : pressed ? Math.round((endMs - prevMs) / 1000) : measuredRestSec(prevAt, nowMs, entry.reps);
  const set: WorkoutSet = {
    id, type: 'working', weightKg: entry.weightKg, loadMode: entry.loadMode, reps: entry.reps, rir: null, rirSource: 'unknown',
    restSecBefore: rest, ...(rest != null ? { restSource: pressed ? 'timer' as const : 'estimated' as const } : {}), completedAt: new Date(nowMs).toISOString(),
    ...(entry.side ? { side: entry.side } : {}),
  };
  const { restEndedAt: _used, ...rest0 } = ex;
  void _used;
  const sets = withPrescribed(reclassifyWarmups([...ex.sets, set], model), ex.target, set.id);
  return { ...rest0, sets, ...(ex.startedAt ? {} : { startedAt: set.completedAt }) };
}

/**
 * A set logged on one exercise ends the "NEXT SET" mark of every OTHER exercise: coming back to an exercise later
 * must not record the old, short rest (its rest is then estimated from the times as usual). Same object when nothing changes.
 */
export function clearOtherRestEnds(w: Workout, exId: string): Workout {
  if (!w.exercises.some((e) => e.id !== exId && e.restEndedAt)) return w;
  return { ...w, exercises: w.exercises.map((e) => {
    if (e.id === exId || !e.restEndedAt) return e;
    const { restEndedAt: _r, ...rest } = e;
    void _r;
    return rest;
  }) };
}

/** Edit or remove a logged set, then re-check warm-up tags. `patch: null` removes it. */
export function editSet(ex: WorkoutExercise, setId: string, patch: Partial<WorkoutSet> | null, model: WarmupModel, target: ExerciseTarget | undefined = ex.target): WorkoutExercise {
  const sets = patch == null ? ex.sets.filter((s) => s.id !== setId) : ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s));
  return { ...ex, sets: resyncPrescribed(reclassifyWarmups(sets, model), target) };
}

/**
 * After a set was removed or re-tagged: every working set that carries a prescription gets the one of its (new) place
 * among the working sets — the reps / RIR of that place; the load it was prescribed keeps its own value (second
 * analysis B-12). Warm-ups lose a working prescription.
 */
function resyncPrescribed(sets: WorkoutSet[], t: ExerciseTarget | undefined): WorkoutSet[] {
  if (!t) return sets;
  let n = 0;
  const pairOpen: Partial<Record<string, number>> = {};
  return sets.map((s) => {
    if (s.planned) return s;
    if (s.type === 'warmup') {
      if (s.prescribed?.kind === 'working') { const { prescribed: _p, ...rest } = s; void _p; return rest as WorkoutSet; }
      return s;
    }
    if (s.type !== 'working') return s;
    let idx: number;
    if (s.side) {
      const other = s.side === 'left' ? 'right' : 'left';
      if (pairOpen[other] != null) { idx = pairOpen[other] as number; delete pairOpen[other]; } else { idx = n++; pairOpen[s.side] = idx; }
    } else idx = n++;
    if (!s.prescribed) return s;
    const pr = prescribedFor(t, idx);
    return pr ? { ...s, prescribed: { ...pr, weightKg: s.prescribed.weightKg } } : s;
  });
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

// ---------------------------------------------------------------- prescribed per set, set-by-set adjustment, weight source

/** The prescription of working set `n` (0-based) from the target; null for an older target without an RIR target. */
export function prescribedFor(t: ExerciseTarget, n: number): SetPrescription | null {
  if (!t.rir?.length) return null;
  const r = t.reps[Math.min(n, t.reps.length - 1)] ?? t.reps[t.reps.length - 1];
  const q = t.rir[Math.min(n, t.rir.length - 1)];
  if (!r || !q) return null;
  return { weightKg: t.weightKg, repsMin: r.min, repsMax: r.max, rirMin: q.min, rirMax: q.max, kind: 'working', engine: t.engine };
}

/**
 * What was prescribed is stored next to what was done (never mixed; calculations use the performed values), AFTER the
 * warm-up re-check: a set re-tagged as a warm-up loses its working prescription, the new set gets the one of its place
 * among the WORKING sets (a left / right pair shares one).
 */
function withPrescribed(sets: WorkoutSet[], t: ExerciseTarget | undefined, newId: string): WorkoutSet[] {
  let n = 0;
  const pairOpen: Partial<Record<string, number>> = {};
  return sets.map((s) => {
    if (s.planned) return s;
    if (s.type === 'warmup') {
      if (s.prescribed?.kind === 'working') { const { prescribed: _p, ...rest } = s; void _p; return rest as WorkoutSet; }
      return s;
    }
    if (s.type !== 'working') return s;
    let idx: number;
    if (s.side) {
      const other = s.side === 'left' ? 'right' : 'left';
      if (pairOpen[other] != null) { idx = pairOpen[other] as number; delete pairOpen[other]; } else { idx = n++; pairOpen[s.side] = idx; }
    } else idx = n++;
    if (s.id !== newId || !t) return s;
    const pr = prescribedFor(t, idx);
    return pr ? { ...s, prescribed: pr } : s;
  });
}

/**
 * 'calc' = a working weight CALCULATED from a set that was really hard (owner 2026-11-25: only real analysis — "I said
 * easy, so add a step" is not one); 'find_weight' = a note without a number: the sets so far were too light to calculate from.
 */
export interface NextSetsOffer { change: 'add_load' | 'add_reps' | 'reduce' | 'calc' | 'find_weight'; weightKg: number | null; reps: { min: number; max: number } | null; why: string }

/** Reps this far from failure at most make a set an ANCHOR for the calculation (failure 0, the HARD tap 0–1, a logged RIR ≤ 1). */
export const ANCHOR_MAX_RIR = 1;
/** Reps window in which the load-reps equation is trusted (as in perception.ts: prediction worsens with reps). */
export const ANCHOR_REPS: [number, number] = [3, 20];

/** Reps in reserve of a set when it is known to be near the limit; null = not an anchor. */
export function anchorRir(s: WorkoutSet): number | null {
  if (s.type !== 'working' || s.planned || s.weightKg == null || !(s.weightKg > 0) || s.reps == null) return null;
  if (s.loadMode !== 'total' && s.loadMode !== 'per_side') return null;
  if (s.reps < ANCHOR_REPS[0] || s.reps > ANCHOR_REPS[1]) return null;
  if (s.technicalFailure || s.technique === 'compromised' || s.technique === 'failed' || s.pain || s.feel === 'pain' || s.feel === 'too_heavy_form') return null;
  if (s.rir != null) return s.rir <= ANCHOR_MAX_RIR ? s.rir : null;
  if (s.failure === 'muscular' || s.toFailure) return 0;
  if (s.effort === 'near_max') return 0.5;
  return null;
}

/**
 * The working weight for `reps` with `rir` in reserve, from today's hardest evidence on this exercise:
 * e1RM = w × (1 + (reps done + reps left) / 30) of the best anchor set (Epley), weight = e1RM ÷ (1 + (target reps +
 * target reserve) / 30), rounded DOWN to a real step. null without an anchor. An estimate — shown as one.
 */
export function workingWeightFromSets(sets: WorkoutSet[], reps: { min: number; max: number }, rir: { min: number; max: number }, step: number, limits: { minKg?: number | null; maxKg?: number | null } = {}): { weightKg: number; from: WorkoutSet; e1rm: number } | null {
  let best: { from: WorkoutSet; e1rm: number } | null = null;
  for (const s of sets) {
    const r = anchorRir(s);
    if (r == null) continue;
    const e = (s.weightKg as number) * (1 + ((s.reps as number) + r) / 30);
    if (!best || e > best.e1rm) best = { from: s, e1rm: e };
  }
  if (!best) return null;
  const raw = best.e1rm / (1 + ((reps.min + reps.max) / 2 + (rir.min + rir.max) / 2) / 30);
  const base = limits.minKg != null && limits.minKg > 0 ? limits.minKg : 0; // a stack counts from its lightest plate
  let w = step > 0 ? base + Math.floor((raw - base) / step + 1e-9) * step : Math.round(raw * 2) / 2;
  if (limits.minKg != null) w = Math.max(limits.minKg, w);
  if (limits.maxKg != null) w = Math.min(limits.maxKg, w);
  w = Math.round(w * 100) / 100;
  return w > 0 ? { weightKg: w, from: best.from, e1rm: Math.round(best.e1rm * 10) / 10 } : null;
}

/** Limits of this equipment and the owner's usual rest on this exercise (the short-rest rule needs it). */
export interface OfferContext { minKg?: number | null; maxKg?: number | null; restMedianSec?: number | null }

const offerKey = (setId: string, o: NextSetsOffer) => (o.change === 'calc' ? `calc|${o.weightKg ?? ''}` : `${setId}|${o.change}|${o.weightKg ?? ''}|${o.reps?.min ?? ''}-${o.reps?.max ?? ''}`);

/**
 * After a set: should the REMAINING sets change (`adaptRemaining`, rule presc_set_by_set)? Only an offer — the UI shows
 * Use / Keep the plan; nothing changes until the owner taps Use. null = keep the plan (no target, nothing left, already
 * applied after this set, or this very offer was answered "Keep the plan").
 */
export function nextSetsOffer(ex: WorkoutExercise, step: number, ctx: OfferContext = {}): NextSetsOffer | null {
  const t = ex.target;
  if (!t || !t.rir?.length || !t.reps.length || t.sets <= 0) return null;
  const done = performed(ex).filter((s) => s.type === 'working');
  if (!done.length) return null;
  const lastSet = done[done.length - 1];
  const lastAt = lastSet.completedAt ?? '';
  if (t.adapted && t.adapted.at >= lastAt) return null; // already decided after this set
  const sets = Array.from({ length: t.sets }, (_, i) => {
    const r = t.reps[Math.min(i, t.reps.length - 1)];
    const q = t.rir![Math.min(i, t.rir!.length - 1)];
    return { weightKg: t.weightKg, repsMin: r.min, repsMax: r.max, rirMin: q.min, rirMax: q.max, restSec: null };
  });
  // Bodyweight-only history (e.g. pull-ups without a belt): adding load would start another history → never a belt offer.
  const bodyweightOnly = ex.variation?.loading === 'bodyweight';
  const p = { sets, loadMode: done[0].loadMode, minKg: ctx.minKg ?? null, maxKg: bodyweightOnly ? 0 : ctx.maxKg ?? null, rest: { medianSec: ctx.restMedianSec ?? null } } as unknown as Prescription;
  const a = adaptRemaining(p, done, step);
  let o: NextSetsOffer | null = null;
  const first = a.sets[0];
  if (first && a.change === 'reduce') o = { change: a.change, weightKg: first.weightKg, reps: { min: first.repsMin, max: first.repsMax }, why: a.why };
  // Calibrating (no weight in the plan yet): only a real calculation, from a set that was really hard.
  const nDone = exerciseProgress(ex).done;
  // Only where a load-reps calculation exists at all (not assistance, not added-to-body-weight).
  const calcMode = lastSet.loadMode === 'total' || lastSet.loadMode === 'per_side';
  if (!o && t.weightKg == null && !bodyweightOnly && calcMode && nDone < t.sets) {
    const k = Math.min(nDone, t.reps.length - 1);
    const reps = t.reps[k];
    const rir = t.rir[Math.min(nDone, t.rir.length - 1)];
    const calc = workingWeightFromSets(done, reps, rir, step, { minKg: ctx.minKg, maxKg: ctx.maxKg });
    const nf = (x: number) => num(x);
    if (calc && calc.weightKg !== lastSet.weightKg) {
      const f = calc.from;
      const how = f.failure === 'muscular' || f.toFailure ? L('to the limit', 'до предела') : f.rir != null ? L(`with ${f.rir} left`, `с запасом ${f.rir}`) : L('hard', 'тяжело');
      o = { change: 'calc', weightKg: calc.weightKg, reps: null, why: L(
        `Calculated from your ${nf(f.weightKg as number)} kg × ${f.reps} (${how}): about ${nf(calc.weightKg)} kg should give ${reps.min}–${reps.max} reps with ${rir.min}–${rir.max} left. An estimate — the next sets will correct it.`,
        `Рассчитано по вашему подходу ${nf(f.weightKg as number)} кг × ${f.reps} (${how}): около ${nf(calc.weightKg)} кг должно дать ${reps.min}–${reps.max} повт. с запасом ${rir.min}–${rir.max}. Это оценка — следующие подходы её уточнят.`) };
    } else if (!calc && (lastSet.effort === 'easy' || lastSet.effort === 'very_easy') && lastSet.reps != null && lastSet.reps >= reps.max) {
      o = { change: 'find_weight', weightKg: null, reps: null, why: L(
        `${nf(lastSet.weightKg ?? 0)} kg × ${lastSet.reps} was easy — too light to calculate your working weight from. Go clearly heavier; once a set is hard (0–1 reps left), the app calculates the weight for ${reps.min}–${reps.max} reps.`,
        `${nf(lastSet.weightKg ?? 0)} кг × ${lastSet.reps} — легко: по такому подходу рабочий вес не рассчитать. Возьмите заметно тяжелее; когда подход будет тяжёлым (в запасе 0–1 повтор), приложение рассчитает вес на ${reps.min}–${reps.max} повт.`) };
    }
  }
  if (!o) return null;
  if (ex.offerKept?.includes(offerKey(lastSet.id, o))) return null;
  return o;
}

/** "Keep the plan": remembered on the exercise (survives leaving the screen, reload and lock); this offer is not asked again. */
export function keepOffer(ex: WorkoutExercise, o: NextSetsOffer): WorkoutExercise {
  const lastSet = performed(ex).filter((s) => s.type === 'working').at(-1);
  if (!lastSet) return ex;
  return { ...ex, offerKept: [...(ex.offerKept ?? []), offerKey(lastSet.id, o)] };
}

/** Use: the target of the remaining sets becomes the offer, marked as adapted (Undo = the previous target). */
export function applyOffer(ex: WorkoutExercise, o: NextSetsOffer, at: string): WorkoutExercise {
  const t = ex.target;
  if (!t) return ex;
  const n = exerciseProgress(ex).done;
  if (o.change === 'find_weight') return ex; // a note, nothing to apply
  // The sets already done keep their own range (a short rep list is padded with its last entry first).
  const head = Array.from({ length: n }, (_, i) => t.reps[Math.min(i, t.reps.length - 1)]);
  const reps = o.reps ? [...head, ...Array.from({ length: Math.max(1, t.sets - n) }, () => o.reps!)] : t.reps;
  return { ...ex, target: { ...t, weightKg: o.weightKg ?? t.weightKg, reps, adapted: { change: o.change, fromKg: t.weightKg, why: o.why, at } } };
}

/**
 * Where the pre-filled weight came from (owner 2026-11-24): 'adjusted' = the analysis changed it (a target that differs
 * from last time, or an adjustment during this exercise); 'kept' = the analysis set a target equal to last time's
 * weight; 'copied' = no target, the number is only copied (last time or the previous set); null = the shown weight is
 * neither (the owner typed it).
 */
export function weightSource(ex: WorkoutExercise, last: WorkoutExercise | null, weightKg: number | null): 'adjusted' | 'kept' | 'copied' | 'session' | null {
  if (weightKg == null) return null;
  const t = ex.target;
  const prev = performed(last);
  const done = performed(ex);
  const lastHere = prev[done.length]?.weightKg ?? prev.filter((s) => s.type === 'working').at(-1)?.weightKg ?? null;
  // A target the owner edited before Start is the owner's number, not the analysis's: no mark.
  if (t?.edited && !t.adapted && t.weightKg != null && weightKg === t.weightKg) return null;
  if (t?.weightKg != null && weightKg === t.weightKg) {
    if (t.adapted) return 'adjusted';
    // No last time: the analysis set it (never "same as last time").
    return lastHere == null || lastHere !== t.weightKg ? 'adjusted' : 'kept';
  }
  if (weightKg === lastHere) return 'copied';
  if (weightKg === done.at(-1)?.weightKg) return 'session';
  return null;
}

// ---------------------------------------------------------------- the target line, continuing a finished workout

/**
 * Today's target in words that cannot be misread (owner 2026-11-25: "4 × 10–15" without a weight was read as 4 kg):
 * "4 sets × 60 kg × 8–12 reps"; without a weight yet "4 sets × 10–15 reps · find your weight".
 */
export function targetText(t: ExerciseTarget | null | undefined): string | null {
  if (!t) return null;
  if (t.sets <= 0) return L('optional today', 'сегодня по желанию');
  const r = t.reps[0];
  const reps = r ? (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`) : '';
  const n = t.sets;
  const ru = n % 10 === 1 && n % 100 !== 11 ? 'подход' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'подхода' : 'подходов';
  const sets = L(`${n} ${n === 1 ? 'set' : 'sets'}`, `${n} ${ru}`);
  const repsText = reps ? L(` × ${reps} reps`, ` × ${reps} повт.`) : '';
  return t.weightKg != null
    ? `${sets} × ${num(t.weightKg)} ${L('kg', 'кг')}${repsText}`
    : `${sets}${repsText}${L(' · find your weight', ' · подберите вес')}`;
}

/** A workout finished TODAY in the training mode can be continued (one more set after Finish — owner 2026-11-25). */
export function canContinue(w: Workout, today: string): boolean {
  return w.source === 'live' && w.date === today && (!!w.finishedAt || !!w.endTime);
}

/** Back to a live session: the end marks are cleared, every logged set stays exactly as it was. Finish sets them again. */
export function continueWorkout(w: Workout, nowIso: string): Workout {
  const { finishedAt: _f, ...rest } = w;
  void _f;
  return { ...rest, endTime: null, durationMin: null, updatedAt: nowIso };
}
