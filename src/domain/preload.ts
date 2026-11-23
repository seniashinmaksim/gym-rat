/**
 * Within-session fatigue between exercises (Part 6, F.8).
 *
 * A pec deck done after an incline press is weaker than a pec deck done first. That is the order of
 * the session, not a loss of strength. Every session of a history therefore gets a CONTEXT, derived
 * from the raw sets (nothing is stored):
 *
 *   pre-load = fractional sets already performed in that session, before this exercise's first set,
 *              by earlier exercises that work one of its PRIMARY muscles with a coefficient ≥ 0.5
 *              (Σ coefficient per performed non-warm-up set; left + right = one set).
 *   FRESH = pre-load < 2, PRE-LOADED = pre-load ≥ 2.
 *
 * Order = the order sets were actually done (completion times); entries without times use the list
 * order. Comparisons (trend, plateau, decline, double progression, baseline) are made like with like
 * when the latest session's context has ≥ 3 sessions; otherwise the index of a pre-loaded session is
 * normalised to the fresh context: index × (1 + min(cap, d × pre-load)). `d` is the owner's own drop
 * per pre-loading set when the history has ≥ 2 sessions in each context, else a default taken from the
 * exercise-order literature (rule `preload_context`, low confidence).
 */
import { resolveCoefficients, type Registry } from './registry';
import { sideFactors } from './quality';
import type { MuscleId, Workout, WorkoutExercise } from './types';

export const PRELOAD_MIN_SETS = 2;
/** Default index drop per pre-loading fractional set (research-informed heuristic; see rule `preload_context`). */
export const PRELOAD_DEFAULT_DROP = 0.01;
/** The owner's measured drop per set is kept inside this range. */
export const PRELOAD_DROP_RANGE: [number, number] = [0, 0.03];
/** The total normalisation never exceeds this. */
export const PRELOAD_CAP = 0.06;
/** Sessions of the latest context needed to compare like with like. */
export const SAME_CONTEXT_MIN = 3;

export type PreloadBucket = 'fresh' | 'preloaded';

export interface PreloadContext {
  /** Fractional sets for the most pre-loaded primary muscle. */
  sets: number;
  bucket: PreloadBucket;
  /** The primary muscle that was pre-loaded most (null when the exercise is unknown). */
  muscle: MuscleId | null;
  /** Exercise ids that did the pre-loading, in the order performed. */
  from: string[];
}

const FRESH: PreloadContext = { sets: 0, bucket: 'fresh', muscle: null, from: [] };
const r2 = (n: number) => Math.round(n * 100 + 1e-9) / 100;
const ms = (iso: string | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : null; };

/** Muscles an exercise trains with its highest coefficient (≥ 0.5). */
export function primaryMuscles(contributions: Partial<Record<MuscleId, number>>): MuscleId[] {
  const entries = (Object.entries(contributions) as [MuscleId, number][]).filter(([, c]) => c >= 0.5);
  if (!entries.length) return [];
  const top = Math.max(...entries.map(([, c]) => c));
  return entries.filter(([, c]) => c === top).map(([m]) => m);
}

/**
 * Context of one exercise entry within its session. `ex` must be an entry of `w`. An entry with no
 * performed set yet (a prescription being made) sees everything performed so far.
 */
export function preloadFor(w: Workout, ex: WorkoutExercise, registry: Registry): PreloadContext {
  const def = registry.get(ex.exerciseId);
  if (!def) return FRESH;
  const prim = primaryMuscles(resolveCoefficients(def, ex.variation).contributions);
  if (!prim.length) return FRESH;
  const own = ex.sets.filter((s) => !s.planned);
  const ownTimes = own.map((s) => ms(s.completedAt)).filter((t): t is number => t != null);
  const firstOwn = ownTimes.length ? Math.min(...ownTimes) : null;
  const at = w.exercises.indexOf(ex);
  const load: Partial<Record<MuscleId, number>> = {};
  const from: { id: string; t: number }[] = [];
  w.exercises.forEach((e, i) => {
    if (e === ex) return;
    const d = registry.get(e.exerciseId);
    if (!d) return;
    const c = resolveCoefficients(d, e.variation).contributions;
    if (!prim.some((m) => (c[m] ?? 0) >= 0.5)) return;
    const factors = sideFactors(e.sets);
    let counted = false;
    let firstT = Infinity;
    for (const s of e.sets) {
      if (s.planned || s.type === 'warmup') continue;
      const t = ms(s.completedAt);
      // Earlier = completed before this exercise's first set; without times, listed before it.
      const earlier = own.length === 0 ? true : t != null && firstOwn != null ? t < firstOwn : at < 0 ? false : i < at;
      if (!earlier) continue;
      counted = true;
      if (t != null) firstT = Math.min(firstT, t);
      const k = factors.get(s.id) ?? 1;
      for (const m of prim) if ((c[m] ?? 0) >= 0.5) load[m] = (load[m] ?? 0) + (c[m] as number) * k;
    }
    if (counted) from.push({ id: e.exerciseId, t: Number.isFinite(firstT) ? firstT : i });
  });
  let muscle: MuscleId | null = null;
  let sets = 0;
  for (const m of prim) if ((load[m] ?? 0) > sets) { sets = load[m] as number; muscle = m; }
  sets = r2(sets);
  return { sets, bucket: sets >= PRELOAD_MIN_SETS ? 'preloaded' : 'fresh', muscle, from: [...new Set(from.sort((a, b) => a.t - b.t).map((f) => f.id))] };
}

/** index × factor = the index normalised to the fresh context. */
export function preloadFactor(sets: number, d: number = PRELOAD_DEFAULT_DROP): number {
  return 1 + Math.min(PRELOAD_CAP, Math.max(0, d) * Math.max(0, sets));
}

/**
 * Reps expected to be lost on a set of `reps` (done fresh) when the exercise comes after `sets`
 * pre-loading sets: the Epley-equivalent of the index drop. 12 reps after 3 sets (1 % each) → 1; after 5 → 2.
 */
export function expectedRepDrop(reps: number, sets: number, d: number = PRELOAD_DEFAULT_DROP): number {
  const f = preloadFactor(sets, d) - 1;
  if (f <= 0) return 0;
  return Math.round((30 + Math.min(reps, 30)) * (f / (1 + f)));
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/**
 * The owner's own drop per pre-loading set on ONE history: needs ≥ 2 sessions in each context
 * (same index kind). (1 − median pre-loaded ÷ median fresh) ÷ median pre-load, kept in range. null = not measurable.
 */
export function measuredDrop(sessions: { index: number | null; preload?: number; context?: PreloadBucket }[]): number | null {
  const fresh = sessions.filter((s) => s.index != null && s.context !== 'preloaded').map((s) => s.index as number);
  const pre = sessions.filter((s) => s.index != null && s.context === 'preloaded');
  if (fresh.length < 2 || pre.length < 2) return null;
  const mf = median(fresh);
  const mp = median(pre.map((s) => s.index as number));
  const sets = median(pre.map((s) => s.preload ?? PRELOAD_MIN_SETS));
  if (!(mf > 0) || !(sets > 0)) return null;
  const d = (1 - mp / mf) / sets;
  return Math.min(PRELOAD_DROP_RANGE[1], Math.max(PRELOAD_DROP_RANGE[0], d));
}

export type CompareBasis = 'single_context' | 'same_context' | 'adjusted';
