/**
 * Which logged sets count and how much each one counts as a "set" — a leaf module (no imports of other formula
 * modules), so quality, failure and perception do not import each other in a cycle (map audit C-6).
 */
import type { WorkoutSet } from './types';

/** A set counts only once it has been performed (planned/pre-filled sets are ignored). */
export function isCounted(s: WorkoutSet): boolean {
  return !s.planned;
}

/**
 * How much each set of ONE exercise entry counts as a "set" (1 normally).
 * Unilateral sets logged per side are paired in order within the same set type: the i-th left
 * and the i-th right set together make ONE set (0.5 each, so the pair's credit is the average
 * of the two sides). A side without a partner counts as a full set. 3 L + 3 R = 3 sets, never 6.
 */
export function sideFactors(sets: WorkoutSet[]): Map<string, number> {
  const out = new Map<string, number>();
  const byType = new Map<string, { left: string[]; right: string[] }>();
  for (const s of sets) {
    out.set(s.id, 1);
    if (!s.side || !isCounted(s) || s.type === 'warmup') continue;
    const g = byType.get(s.type) ?? { left: [], right: [] };
    g[s.side].push(s.id);
    byType.set(s.type, g);
  }
  for (const g of byType.values()) {
    const pairs = Math.min(g.left.length, g.right.length);
    for (let i = 0; i < pairs; i++) {
      out.set(g.left[i], 0.5);
      out.set(g.right[i], 0.5);
    }
  }
  return out;
}
