/**
 * Week fit (Part 7, G.1 #13 / #14): today's share that still lets the owner's USUAL later days finish the week
 * outside the recovery windows, and — when the usual days cannot — one optional extra short session.
 *
 *  - Usual days: weekdays trained in at least half of the recent complete weeks (≥ 3 such weeks), e.g. Mon / Wed / Fri.
 *  - A later session is possible for a muscle only when it falls outside the recovery window of the session before
 *    it (same time of day assumed, 24 h per day, the usual 6 h tolerance). The window of n effective sets is the
 *    recovery table's base window (+ 12 h for a large muscle above 9 sets); failure sets, soreness and sleep are
 *    not known in advance and are ignored here (heuristic, like the windows themselves).
 *  - Today's share = the SMALLEST share, from today's even share upward (≤ the per-session cap), with which the
 *    later usual days can still complete the week; failing that, the largest smaller share that does; if none can,
 *    the share that fits the most and an honest shortfall ("fine — nothing to make up").
 *  - Extra session: only when adding ONE non-usual later day gains ≥ 2 sets on a muscle or ≥ 4 in total; the day
 *    can always be left empty in the fit, so it never lowers what the usual days can do. A suggestion, never a rule.
 * Pure: no clock, no storage.
 */
import { L } from '../i18n/core';
import { addDays, diffDays } from './dates';
import { baseWindowHours } from './recovery';

/** At least this many recent complete weeks with training are needed to speak of "usual" days. */
export const USUAL_MIN_WEEKS = 3;
/** A weekday is usual when trained in at least this share of those weeks. */
export const USUAL_DAY_SHARE = 0.5;
/** How many recent complete weeks are looked at (4: a new routine is picked up within about 3 weeks). */
export const USUAL_LOOKBACK_WEEKS = 4;
/** An extra session is suggested only when it gains at least this much on one muscle … */
export const EXTRA_MIN_ONE = 2;
/** … or at least this much over all muscles together. */
export const EXTRA_MIN_TOTAL = 4;
/** A SHORT session: at most this many muscles (the largest gains). */
export const EXTRA_MAX_MUSCLES = 3;

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundHalf = (n: number) => Math.round(n * 2) / 2;

/** Weekday of a YYYY-MM-DD date, 0 = Sunday … 6 = Saturday. */
export const weekdayOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Weekdays trained in ≥ half of the recent complete weeks that had training (null below 3 such weeks). */
export function usualTrainingDays(weeks: { dates: string[] }[]): number[] | null {
  const recent = weeks.filter((w) => w.dates.length > 0).slice(-USUAL_LOOKBACK_WEEKS);
  if (recent.length < USUAL_MIN_WEEKS) return null;
  const count = new Map<number, number>();
  for (const w of recent) for (const d of new Set(w.dates.map(weekdayOf))) count.set(d, (count.get(d) ?? 0) + 1);
  const days = [...count].filter(([, n]) => n / recent.length >= USUAL_DAY_SHARE).map(([d]) => d).sort((a, b) => a - b);
  return days.length ? days : null;
}

/** Days after today (1 = tomorrow) up to the end of the week that are usual training days. */
export function laterUsualOffsets(today: string, weekEnd: string, usual: number[]): number[] {
  const out: number[] = [];
  for (let d = 1; d <= diffDays(weekEnd, today); d++) if (usual.includes(weekdayOf(addDays(today, d)))) out.push(d);
  return out;
}

export interface FitInput {
  /** Effective sets left this week when the day started. */
  remaining: number;
  /** Most sets in one session for this muscle. */
  cap: number;
  /** Today's even share (remaining ÷ sessions left), the starting point. */
  base: number;
  /** Later session days, as offsets from today (sorted). */
  later: number[];
  large: boolean;
  /** Hours a window may still have left and the muscle still counts as ready. */
  toleranceH: number;
}

export interface Fit {
  share: number;
  /** Sets the week can reach with this share and the later days. */
  reachable: number;
  /** remaining − reachable (0 when the week fits), to half sets. */
  shortBy: number;
  /** The share is above today's even share because a later day falls inside the window of a smaller one. */
  raised: boolean;
}

export function sessionWindowH(sets: number, large: boolean): number {
  return sets <= 0 ? 0 : baseWindowHours(sets) + (large && sets > 9 ? 12 : 0);
}

/** Most sets the later days can still take (exhaustive over whole sets; ≤ 7 days × ≤ 10 sets, memoised). */
function bestLater(remaining: number, later: number[], cap: number, large: boolean, tol: number, todaySets: number): number {
  const memo = new Map<string, number>();
  const go = (rem: number, k: number, lastOff: number, lastWin: number): number => {
    if (rem <= 1e-9 || k >= later.length) return 0;
    const key = `${rem}|${k}|${lastOff}|${lastWin}`;
    const hit = memo.get(key);
    if (hit != null) return hit;
    let b = go(rem, k + 1, lastOff, lastWin); // nothing for this muscle that day
    const d = later[k];
    if (24 * (d - lastOff) >= lastWin - tol) {
      for (let n = 1; n <= Math.min(cap, Math.ceil(rem)); n++) b = Math.max(b, Math.min(n, rem) + go(rem - Math.min(n, rem), k + 1, d, sessionWindowH(n, large)));
    }
    memo.set(key, b);
    return b;
  };
  return go(remaining, 0, 0, sessionWindowH(todaySets, large));
}

export function fitToday(p: FitInput): Fit {
  const hi = Math.max(0, Math.min(p.cap, Math.ceil(p.remaining)));
  if (hi === 0) return { share: 0, reachable: p.remaining, shortBy: 0, raised: false };
  const start = Math.max(1, Math.min(p.base, hi));
  let bestS = start;
  let bestTotal = -1;
  for (let s = start; s <= hi; s++) {
    const today = Math.min(s, p.remaining);
    const total = today + bestLater(p.remaining - today, p.later, p.cap, p.large, p.toleranceH, s);
    if (total >= p.remaining - 1e-9) return { share: today, reachable: p.remaining, shortBy: 0, raised: s > start };
    if (total > bestTotal + 1e-9) { bestTotal = total; bestS = s; }
  }
  // Nothing from the even share upward fits: a SMALLER share today may (3 today + 7 tomorrow beats 7 today and a held tomorrow).
  for (let s = start - 1; s >= 1; s--) {
    const total = s + bestLater(p.remaining - s, p.later, p.cap, p.large, p.toleranceH, s);
    if (total >= p.remaining - 1e-9) return { share: s, reachable: p.remaining, shortBy: 0, raised: false };
    if (total > bestTotal + 1e-9) { bestTotal = total; bestS = s; }
  }
  return { share: Math.min(bestS, p.remaining), reachable: round1(bestTotal), shortBy: roundHalf(p.remaining - bestTotal), raised: bestS > start };
}

export interface ExtraSessionMuscle { muscle: string; sets: number }
export interface ExtraSession {
  /** Offset from today and the date of the suggested day. */
  offset: number;
  date: string;
  muscles: ExtraSessionMuscle[];
  /** Sets the week would end short WITHOUT the extra session (over the listed muscles). */
  shortWithout: number;
  why: string;
}

/**
 * One optional extra short session. `muscles`: per muscle the fit input and today's chosen share. Only non-usual
 * days after today in this week are tried; the day with the largest total gain wins (the earliest on a tie).
 */
export function suggestExtraSession(today: string, weekEnd: string, usual: number[], muscles: { muscle: string; fit: FitInput; share: number; shortBy: number }[]): ExtraSession | null {
  const short = muscles.filter((m) => m.shortBy > 0);
  if (!short.length) return null;
  let best: ExtraSession | null = null;
  let bestGain = 0;
  for (let d = 1; d <= diffDays(weekEnd, today); d++) {
    const date = addDays(today, d);
    if (usual.includes(weekdayOf(date))) continue;
    const gains: ExtraSessionMuscle[] = [];
    for (const m of short) {
      const later = [...m.fit.later, d].sort((a, b) => a - b);
      const rest = m.fit.remaining - m.share;
      const without = bestLater(rest, m.fit.later, m.fit.cap, m.fit.large, m.fit.toleranceH, m.share);
      const withX = bestLater(rest, later, m.fit.cap, m.fit.large, m.fit.toleranceH, m.share);
      const g = roundHalf(withX - without);
      if (g >= 1) gains.push({ muscle: m.muscle, sets: g });
    }
    gains.sort((a, b) => b.sets - a.sets).splice(EXTRA_MAX_MUSCLES);
    const total = gains.reduce((a, g) => a + g.sets, 0);
    const ok = gains.some((g) => g.sets >= EXTRA_MIN_ONE) || total >= EXTRA_MIN_TOTAL;
    if (ok && total > bestGain + 1e-9) {
      bestGain = total;
      const listed = new Set(gains.map((g) => g.muscle));
      const shortWithout = roundHalf(short.filter((m) => listed.has(m.muscle)).reduce((a, m) => a + m.shortBy, 0));
      best = {
        offset: d, date, muscles: gains, shortWithout,
        why: L(`Your usual days leave ~${shortWithout} sets of this week undone because the next usual day falls inside a recovery window. One short session on a free day fits them in — or skip it: weekly volume is a reference, not a quota.`,
          `В ваши обычные дни ~${shortWithout} подходов этой недели не помещаются: следующий обычный день попадает в окно восстановления. Одна короткая тренировка в свободный день их вместит — или пропустите её: недельный объём — ориентир, а не норма.`),
      };
    }
  }
  return best;
}
