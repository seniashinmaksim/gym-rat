/**
 * ONE definition of "usual rest" and "short rest" for every rule (second analysis 2026-11-24, owner's decision):
 * a rest explains a rep drop when it is shorter than 70 % of the usual rest on that exercise — today's median when
 * there are ≥ 3 measured rests, else the history's median. Owner 2026-11-25: the REAL usual rest is used (no 2:30
 * floor any more); 2:30 is only the assumption when no rest was measured yet.
 * Used by: the next-set rule (perception), the set-by-set offer (adaptRemaining), the rest insight of the next load
 * (progression), the prescription's rep-drop estimate and the comparability of two sessions (outcomes).
 */

/** The usual rest assumed when nothing was measured yet (the app's default rest, 2:30). */
export const USUAL_REST_FLOOR_SEC = 150;
/** A rest below this share of the usual rest explains a rep drop (rule rest_attribution, a heuristic). */
export const SHORT_REST_SHARE = 0.7;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The owner's REAL usual rest on this exercise (owner 2026-11-25: where he always rests 1 minute, compare with that):
 * today's median of ≥ 3 measured rests, else the history's median; 2:30 only when neither is known.
 */
export function usualRestSec(todayRests: (number | null | undefined)[], historyMedian: number | null | undefined): number {
  const today = todayRests.filter((r): r is number => r != null && r > 0);
  const base = today.length >= 3 ? median(today) : historyMedian ?? null;
  return base != null && base > 0 ? base : USUAL_REST_FLOOR_SEC;
}

/** A measured rest shorter than 70 % of the usual one (2:30 when the usual is unknown). Unknown rest = normal. */
export function isShortRest(restSec: number | null | undefined, usualSec: number | null | undefined): boolean {
  if (restSec == null || restSec <= 0) return false;
  return restSec < SHORT_REST_SHARE * (usualSec != null && usualSec > 0 ? usualSec : USUAL_REST_FLOOR_SEC);
}
