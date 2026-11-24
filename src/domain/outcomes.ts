/**
 * "Did the session hold up?" — ONE comparability check for both learning rules (audit C-3, 2026-11-24): Part 5
 * `choiceOutcomes` (a recovery warning overridden) and Part 8 `keptOutcome` (a forward warning kept). A result is
 * compared only when it is comparable with its baseline; otherwise it is skipped (null), never counted either way.
 */
import type { SessionPerf } from './progression';
import { isShortRest } from './rest';

/** A result whose top-set reserve differs by at least this much from the baseline is not comparable. */
export const OUTCOME_RIR_DIFF = 2;
/** A result whose average rest is below this share of the baseline's is not comparable. */
export const OUTCOME_SHORT_REST = 0.7;
/** "Held up": index at least this share of the baseline (a heuristic: 3 % is within normal day-to-day variation). */
export const OUTCOME_NOT_LOWER = 0.97;

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * `cur` against `base` (earlier sessions of the SAME history; the caller chooses which): true = held up, false = lower,
 * null = not comparable (not representative, no index, different index kind, a reserve ≥ 2 away, a rest < 70 % of the
 * baseline's, or a different place in the session). A reps-based index is compared on the Epley scale (1 + reps / 30),
 * so one rep at 10 is not a "10 % drop".
 */
export function heldUp(cur: SessionPerf, base: SessionPerf[]): boolean | null {
  if (cur.indexRaw == null || !cur.representative) return null;
  const b = base.filter((x) => x.representative && x.indexRaw != null && x.indexKind === cur.indexKind);
  if (!b.length || b.length !== base.length) return null;
  const baseRir = median(b.map((x) => x.topRir).filter((r): r is number => r != null));
  if (cur.topRir != null && baseRir != null && Math.abs(cur.topRir - baseRir) >= OUTCOME_RIR_DIFF) return null;
  const rest = median(b.map((x) => x.restAvgSec).filter((r): r is number => r != null));
  if (rest != null && isShortRest(cur.restAvgSec, rest)) return null;
  if (cur.context && b.every((x) => x.context && x.context !== cur.context)) return null;
  const bi = median(b.map((x) => x.indexRaw as number)) as number;
  const ratio = cur.indexKind === 'reps' ? (1 + cur.indexRaw / 30) / (1 + bi / 30) : cur.indexRaw / bi;
  return ratio >= OUTCOME_NOT_LOWER;
}
