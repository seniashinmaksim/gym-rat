/**
 * Effort from the NUMBERS, next to effort as REPORTED (Part 6, F.4 + F.7).
 *
 * A person's sense of how hard a set was is unreliable, and most sets get no effort answer at all.
 * This module reads what the logged weights and reps of ONE exercise in ONE session say about each set:
 *
 *  - ramp:     a set done BEFORE the session's best set. Reps possible at its load follow from the best
 *              set (Epley inverse); possible − done = estimated reps in reserve. 40 × 5 before 60 × 12
 *              ≈ 28 in reserve (a warm-up); 55 × 11 before 60 × 12 ≈ 5 (partly a working set).
 *  - back-off: a LIGHTER set after the best set. Same estimate minus one rep per hard set already done
 *              (fatigue), so it is less certain.
 *  - next set: at the same load after a normal rest, reps that hold or rise on the next set mean the set
 *              had reserve; a drop of ≥ 2 reps means it was close to the limit.
 *
 * It then cross-checks the reported effort (RIR, failure, the effort tap). The report is used unless the
 * numbers clearly contradict it; the stored answer is never rewritten. Everything is derived from raw
 * sets — nothing is stored. Rules `warmup_by_reserve`, `perception_check`, `perception_bias`.
 *
 * Limits (stated in the rules): Epley is rough above ~12 reps; the numbers cannot see a set that was
 * hard for another reason (bad day, short rest). The one-tap effort answer exists for that.
 */
import { EFFORT_RIR_ESTIMATE } from './feedback';
import { failureImpliedRir } from './failure';
import type { QualityModel, WorkoutSet } from './types';

/** Estimated reserve at or above this = clearly far from failure. */
export const CLEARLY_EASY_RIR = 5;
/** Estimated reserve at or below this = clearly close to failure. */
export const CLEARLY_HARD_RIR = 1;
/** A ramp estimate overrides a reported effort only when it is at least this many reps further from failure. */
export const RAMP_OVERRIDE_GAP = 3;
/** Reps lost on the next set at the same load that mark the earlier set as close to its limit. */
export const NEXT_SET_DROP = 2;
/** A rest shorter than this before the next set explains a rep drop by itself (no evidence about effort). */
export const SHORT_REST_SEC = 60;
/** Reps of fatigue allowed per earlier hard set when estimating a back-off set. */
export const BACKOFF_ALLOWANCE = 1;
/** Reported reserve at or above this counts as "reported easy". */
export const REPORTED_EASY_RIR = 4;

export type ObjectiveKind = 'ramp' | 'backoff' | 'next_set' | 'none';
export type ObjectiveBand = 'easy' | 'hard' | 'reserve' | null;

export interface Objective {
  kind: ObjectiveKind;
  /** Estimated reps in reserve from the numbers (ramp / back-off only), else null. */
  estRir: number | null;
  /** easy = clearly far from failure; hard = clearly close; reserve = had at least about two reps left; null = nothing clear. */
  band: ObjectiveBand;
  /** Reps the best set of the session implies at this set's load (ramp / back-off), for display. */
  possibleReps: number | null;
}

const NONE: Objective = { kind: 'none', estRir: null, band: null, possibleReps: null };
const epley0 = (w: number, reps: number) => w * (1 + Math.min(reps, 30) / 30);
const r1 = (n: number) => Math.round(n * 10) / 10;
const bandOf = (est: number): ObjectiveBand => (est >= CLEARLY_EASY_RIR ? 'easy' : est <= CLEARLY_HARD_RIR ? 'hard' : null);

/** Sets whose load can be compared by Epley: a real external load, not assistance, not belt-only. */
const loadComparable = (s: WorkoutSet) => s.weightKg != null && s.weightKg > 0 && s.reps != null && s.reps >= 1 && (s.loadMode === 'total' || s.loadMode === 'per_side') && s.type !== 'drop';

/**
 * What the numbers say about each performed set of one exercise entry (planned sets are ignored).
 * Keyed by set id.
 */
export function objectiveForSets(all: WorkoutSet[]): Map<string, Objective> {
  const out = new Map<string, Objective>();
  for (const s of all) if (!s.planned) out.set(s.id, NONE);
  // Recorded warm-ups are neither judged nor used as a reference: removing them never changes another set.
  const sets = all.filter((s) => !s.planned && s.type !== 'warmup');

  // The session's best set: highest reps-only Epley value (the earliest one on a tie).
  let best = -1;
  let bestE = 0;
  sets.forEach((s, i) => {
    if (!loadComparable(s)) return;
    const e = epley0(s.weightKg as number, s.reps as number);
    if (e > bestE + 1e-9) { bestE = e; best = i; }
  });

  sets.forEach((s, i) => {
    // 1) Next-set evidence (same load, same side, normal rest).
    let next: Objective = NONE;
    const j = sets.findIndex((o, k) => k > i && (o.side ?? null) === (s.side ?? null));
    const n = j >= 0 ? sets[j] : null;
    if (n && s.reps != null && n.reps != null && s.type !== 'drop' && n.type !== 'drop' && n.weightKg === s.weightKg && n.loadMode === s.loadMode
      && !(n.restSecBefore != null && n.restSecBefore > 0 && n.restSecBefore < SHORT_REST_SEC)) {
      if (s.reps - n.reps >= NEXT_SET_DROP) next = { kind: 'next_set', estRir: null, band: 'hard', possibleReps: null };
      else if (n.reps >= s.reps) next = { kind: 'next_set', estRir: null, band: 'reserve', possibleReps: null };
    }
    // 2) Load-based estimate against the best set.
    if (best >= 0 && i !== best && loadComparable(s)) {
      const w = s.weightKg as number;
      const bw = sets[best].weightKg as number;
      const possible = 30 * (bestE / w - 1);
      if (i < best) {
        const est = Math.max(0, r1(possible - (s.reps as number)));
        out.set(s.id, { kind: 'ramp', estRir: est, band: bandOf(est), possibleReps: r1(possible) });
        return;
      }
      if (w < bw) {
        const hardBefore = i - best;
        const est = Math.max(0, r1(possible - (s.reps as number) - BACKOFF_ALLOWANCE * hardBefore));
        // A back-off estimate that is not clearly easy says nothing reliable; next-set evidence then decides.
        if (est >= CLEARLY_EASY_RIR || next.kind === 'none') {
          out.set(s.id, { kind: 'backoff', estRir: est, band: est >= CLEARLY_EASY_RIR ? 'easy' : null, possibleReps: r1(possible) });
          return;
        }
      }
    }
    out.set(s.id, next);
  });
  return out;
}

/**
 * The reserve a set was REPORTED with, as one number: a logged RIR, RIR 0 for failure, else the
 * conservative (higher) end of the range its effort answer stands for (5 for "5+"). null = no report.
 */
export function reportedRir(s: WorkoutSet, useFeel = true): number | null {
  if (s.rir != null) return s.rir;
  if (s.toFailure) return 0;
  const f = failureImpliedRir(s);
  if (f != null) return f;
  if (useFeel && s.effort) { const r = EFFORT_RIR_ESTIMATE[s.effort]; return r[1] ?? r[0]; }
  return null;
}

export type Disagreement = 'felt_harder' | 'felt_easier' | null;

export interface CrossCheck {
  /** Which effort decides the credit. */
  use: 'reported' | 'numbers' | 'provisional';
  /** Reserve used for the credit table when `use` is 'numbers'. */
  rir: number | null;
  /** With `use: 'numbers'` and no report: the credit is capped at the provisional (unknown-effort) credit. */
  capAtProvisional: boolean;
  /** felt_harder = rated harder than the numbers show; felt_easier = rated easier than the numbers show. */
  disagreement: Disagreement;
}

/**
 * Reported effort vs the numbers.
 *  - report + ramp estimate ≥ 5 that is ≥ 3 reps further from failure → the numbers decide (a warm-up
 *    rated "good" stays a warm-up);
 *  - reported easy (≥ 4 in reserve) but reps collapsed on the next set → credited as a hard set;
 *  - reported at the limit (≤ 1, or failure) but the next set matched or beat it → credit unchanged
 *    (0–3 in reserve earn the same), flagged;
 *  - no report: a load-based estimate decides (never above the provisional credit); a rep collapse on the
 *    next set counts as a hard set; otherwise the provisional credit stays.
 */
export function crossCheck(s: WorkoutSet, o: Objective | undefined, useFeel = true): CrossCheck {
  const r = reportedRir(s, useFeel);
  if (!o || o.kind === 'none') return { use: r == null ? 'provisional' : 'reported', rir: null, capAtProvisional: false, disagreement: null };
  if (r != null) {
    if (o.kind === 'ramp' && o.estRir != null && o.estRir >= CLEARLY_EASY_RIR && o.estRir - r >= RAMP_OVERRIDE_GAP) {
      return { use: 'numbers', rir: o.estRir, capAtProvisional: false, disagreement: 'felt_harder' };
    }
    if (o.band === 'hard' && o.kind === 'next_set' && r >= REPORTED_EASY_RIR) return { use: 'numbers', rir: CLEARLY_HARD_RIR, capAtProvisional: false, disagreement: 'felt_easier' };
    if (o.band === 'reserve' && r <= CLEARLY_HARD_RIR) return { use: 'reported', rir: null, capAtProvisional: false, disagreement: 'felt_harder' };
    return { use: 'reported', rir: null, capAtProvisional: false, disagreement: null };
  }
  if (o.estRir != null) return { use: 'numbers', rir: o.estRir, capAtProvisional: true, disagreement: null };
  if (o.band === 'hard') return { use: 'numbers', rir: CLEARLY_HARD_RIR, capAtProvisional: false, disagreement: null };
  return { use: 'provisional', rir: null, capAtProvisional: false, disagreement: null };
}

/** Effort credit for a reserve estimate through the SAME table as a logged RIR. */
export function creditForRir(rir: number, m: Pick<QualityModel, 'rirCredit'>): number {
  return m.rirCredit[Math.max(0, Math.min(Math.round(rir), m.rirCredit.length - 1))];
}

/**
 * Warm-ups by the numbers (F.4): a set before the session's best set whose estimated reserve earns no
 * credit is tagged `type: 'warmup', typeSource: 'auto'`; an auto tag that no longer holds goes back to
 * a working set. Tags the owner set (`typeSource: 'owner'`), drop sets and warm-ups recorded before
 * Part 6 or by an import (no `typeSource`) are never changed. Returns the same array when nothing changes.
 */
export function reclassifyWarmups(sets: WorkoutSet[], m: Pick<QualityModel, 'rirCredit'>): WorkoutSet[] {
  const auto = (s: WorkoutSet) => !s.planned && s.typeSource !== 'owner' && (s.type === 'working' || (s.type === 'warmup' && s.typeSource === 'auto'));
  // Judge with auto tags removed, so a tag never depends on an earlier tag.
  const neutral = sets.map((s) => (s.type === 'warmup' && s.typeSource === 'auto' ? { ...s, type: 'working' as const } : s));
  const obj = objectiveForSets(neutral);
  let changed = false;
  const out = sets.map((s) => {
    if (!auto(s)) return s;
    const o = obj.get(s.id);
    const warm = !!o && o.kind === 'ramp' && o.estRir != null && creditForRir(o.estRir, m) === 0;
    if (warm && s.type !== 'warmup') { changed = true; return { ...s, type: 'warmup' as const, typeSource: 'auto' as const }; }
    if (!warm && s.type === 'warmup') { changed = true; const { typeSource: _t, ...rest } = s; void _t; return { ...rest, type: 'working' as const }; }
    return s;
  });
  return changed ? out : sets;
}

// ---------------------------------------------------------------- personal bias

export interface PerceptionBias {
  /** Sets that had both an effort report and clear next-set evidence. */
  compared: number;
  feltHarder: number;
  feltEasier: number;
  agree: number;
  /** null until enough sets were compared. */
  verdict: 'rates_harder' | 'rates_easier' | 'matches' | 'mixed' | null;
}

export const BIAS_MIN_SETS = 12;
/** Share of compared sets that must point one way before a tendency is named. */
export const BIAS_SHARE = 0.3;

/**
 * How the owner's effort answers compare with the numbers, over every performed set that has both a
 * report and clear next-set evidence. Shown in Settings; widens nothing and rewrites nothing.
 */
export function perceptionBias(entries: WorkoutSet[][], useFeel = true): PerceptionBias {
  let compared = 0;
  let feltHarder = 0;
  let feltEasier = 0;
  for (const sets of entries) {
    const obj = objectiveForSets(sets);
    for (const s of sets) {
      if (s.planned || s.type === 'warmup') continue;
      const o = obj.get(s.id);
      const r = reportedRir(s, useFeel);
      if (!o || r == null || o.kind !== 'next_set' || !o.band) continue;
      compared++;
      const d = crossCheck(s, o, useFeel).disagreement;
      if (d === 'felt_harder') feltHarder++;
      else if (d === 'felt_easier') feltEasier++;
    }
  }
  const agree = compared - feltHarder - feltEasier;
  let verdict: PerceptionBias['verdict'] = null;
  if (compared >= BIAS_MIN_SETS) {
    const h = feltHarder / compared;
    const e = feltEasier / compared;
    verdict = h >= BIAS_SHARE && e >= BIAS_SHARE ? 'mixed' : h >= BIAS_SHARE ? 'rates_harder' : e >= BIAS_SHARE ? 'rates_easier' : 'matches';
  }
  return { compared, feltHarder, feltEasier, agree, verdict };
}
