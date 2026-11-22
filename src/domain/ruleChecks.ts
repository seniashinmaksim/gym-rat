/**
 * "Rules of thumb vs your data" (UX audit 2026-11-22). The recovery windows and the exercise-order rule are
 * practical heuristics with low-confidence evidence. Once enough sessions exist, this compares them with the
 * owner's OWN logged performance — observational, confounded (fatigue, sleep, exercise mix), never a trial:
 *
 *  - recovery_window: a lift done while one of its primary muscles was still inside the app's base window
 *    (from the last significant session) vs. done after it.
 *  - exercise_order: a lift done after an earlier exercise in the same session had already loaded one of its
 *    primary muscles (≥ 0.5) vs. done first for those muscles.
 *
 * Performance = the session's performance index ÷ the median of the previous 3 comparable sessions of the
 * same history (so different exercises and machines are never compared). Verdicts need ≥ MIN_N sessions on
 * each side; a difference under 2 % counts as "no clear difference". The app's rules are NOT changed
 * automatically — the check only tells the owner whether their data agree.
 */
import type { AppData } from './appdata';
import { sessionEndVirtualMs, workoutVirtualMs } from './dates';
import type { ProgressionSeries } from './progression';
import { baseWindowHours } from './recovery';
import type { Registry } from './registry';
import { resolveCoefficients } from './registry';
import type { MuscleId, Workout } from './types';
import { sessionMuscleEffective } from './volume';

export type RuleVerdict = 'supports' | 'no_clear_difference' | 'contradicts' | 'insufficient';
export interface RuleCheck {
  id: 'recovery_window' | 'exercise_order';
  title: string;
  rule: string;
  verdict: RuleVerdict;
  /** "affected" side: inside the window / after a pre-loading exercise. */
  affected: { n: number; medianPct: number | null };
  /** comparison side: after the window / done fresh. */
  fresh: { n: number; medianPct: number | null };
  /** fresh − affected, percentage points (positive = the rule's expected cost is visible). */
  diffPct: number | null;
  text: string;
}

export const RULE_CHECK_MIN_N = 6;
const CLEAR = 2; // percentage points

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x: number | null) => (x == null ? null : Math.round((x - 1) * 1000) / 10);

/** Relative performance of each comparable session (index ÷ median of the previous 3), keyed by workout id. */
function relativePerf(series: ProgressionSeries): Map<string, number> {
  const out = new Map<string, number>();
  const rep = series.sessions.filter((s) => s.representative && s.indexRaw != null && s.indexKind);
  for (let i = 3; i < rep.length; i++) {
    const prev = rep.slice(i - 3, i).filter((p) => p.indexKind === rep[i].indexKind).map((p) => p.indexRaw as number);
    if (prev.length < 3) continue;
    const ref = median(prev);
    if (ref && ref > 0) out.set(rep[i].workoutId, (rep[i].indexRaw as number) / ref);
  }
  return out;
}

function verdictOf(affected: number[], fresh: number[]): { verdict: RuleVerdict; diff: number | null } {
  if (affected.length < RULE_CHECK_MIN_N || fresh.length < RULE_CHECK_MIN_N) return { verdict: 'insufficient', diff: null };
  const d = Math.round(((median(fresh) as number) - (median(affected) as number)) * 1000) / 10;
  return { verdict: d >= CLEAR ? 'supports' : d <= -CLEAR ? 'contradicts' : 'no_clear_difference', diff: d };
}

export function ruleChecks(data: AppData, registry: Registry, progression: ProgressionSeries[]): RuleCheck[] {
  const { quality, significantStimulusSets, timezone } = data.settings;
  const byId = new Map(data.workouts.map((w) => [w.id, w]));
  const sorted = [...data.workouts].sort((a, b) => sessionEndVirtualMs(a, timezone).ms - sessionEndVirtualMs(b, timezone).ms);
  const effCache = new Map<string, Partial<Record<MuscleId, number>>>();
  const eff = (w: Workout) => {
    let e = effCache.get(w.id);
    if (!e) { e = sessionMuscleEffective(w, registry, quality, { minCoef: 0.5 }); effCache.set(w.id, e); }
    return e;
  };
  const rec = { affected: [] as number[], fresh: [] as number[] };
  const ord = { affected: [] as number[], fresh: [] as number[] };

  for (const s of progression) {
    const def = registry.get(s.exerciseId);
    if (!def) continue;
    const rel = relativePerf(s);
    for (const [wid, r] of rel) {
      const w = byId.get(wid);
      if (!w) continue;
      const exIdx = w.exercises.findIndex((e) => e.exerciseId === s.exerciseId && (e.equipmentId ?? null) === (s.equipmentId ?? null));
      if (exIdx < 0) continue;
      const ex = w.exercises[exIdx];
      const primary = Object.entries(resolveCoefficients(def, ex.variation).contributions).filter(([, c]) => (c ?? 0) >= 0.75).map(([m]) => m as MuscleId);
      if (!primary.length) continue;

      // Recovery window: hours from the end of the last earlier session that significantly loaded a primary muscle.
      const start = workoutVirtualMs(w.date, w.startTime);
      let inside: boolean | null = null;
      let found = false;
      for (const m of primary) {
        for (let i = sorted.length - 1; i >= 0; i--) {
          const o = sorted[i];
          if (o.id === w.id) continue;
          const end = sessionEndVirtualMs(o, timezone).ms;
          if (end >= start) continue;
          const e = eff(o)[m] ?? 0;
          if (e < significantStimulusSets) continue;
          const hours = (start - end) / 3_600_000;
          if (hours > 7 * 24) break;
          found = true;
          inside = (inside ?? false) || hours < baseWindowHours(e);
          break;
        }
      }
      // No significant session for these muscles in the past 7 days = clearly after the window (best rested).
      if (!found) inside = false;
      (inside ? rec.affected : rec.fresh).push(r);

      // Order: an exercise PERFORMED earlier in this session already loaded a primary muscle (≥ 0.5 coefficient).
      // Live sessions: by when each exercise's first working set was ticked (cards may be done in any order);
      // imports without tick times: list order.
      const firstTick = (e: Workout['exercises'][number]) => {
        const t = e.sets.filter((x) => !x.planned && x.type !== 'warmup' && x.completedAt).map((x) => Date.parse(x.completedAt as string)).filter(Number.isFinite);
        return t.length ? Math.min(...t) : null;
      };
      const myTick = firstTick(ex);
      const earlier = w.exercises.filter((e, k) => {
        if (k === exIdx || !e.sets.some((x) => !x.planned && x.type !== 'warmup')) return false;
        const t = firstTick(e);
        return myTick != null && t != null ? t < myTick : k < exIdx;
      });
      const preloaded = earlier.some((e) => {
        const d = registry.get(e.exerciseId);
        if (!d) return false;
        const c = resolveCoefficients(d, e.variation).contributions as Record<string, number>;
        return primary.some((m) => (c[m] ?? 0) >= 0.5);
      });
      (preloaded ? ord.affected : ord.fresh).push(r);
    }
  }

  const rv = verdictOf(rec.affected, rec.fresh);
  const ov = verdictOf(ord.affected, ord.fresh);
  const side = (xs: number[]) => ({ n: xs.length, medianPct: pct(median(xs)) });
  const sign = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x} %`);
  const recText: Record<RuleVerdict, string> = {
    supports: `Lifts done while a main muscle was still inside the window were ${sign(pct(median(rec.affected)))} vs your recent level, after the window ${sign(pct(median(rec.fresh)))}. Your data agree with the rule.`,
    no_clear_difference: `No clear difference (${sign(pct(median(rec.affected)))} inside vs ${sign(pct(median(rec.fresh)))} after the window). The window may be cautious for you; it stays a rule of thumb.`,
    contradicts: `You performed better inside the window (${sign(pct(median(rec.affected)))}) than after it (${sign(pct(median(rec.fresh)))}). Observational data, not proof — but the window may be too cautious for you.`,
    insufficient: `Not enough comparable sessions yet (${rec.affected.length} inside the window, ${rec.fresh.length} after; ${RULE_CHECK_MIN_N} each needed). The planner rarely puts you inside a window, so this fills slowly.`,
  };
  const ordText: Record<RuleVerdict, string> = {
    supports: `Lifts done after another exercise had already worked the same muscle were ${sign(pct(median(ord.affected)))} vs your recent level, done fresh ${sign(pct(median(ord.fresh)))}. Your data agree: order protects performance.`,
    no_clear_difference: `No clear difference (${sign(pct(median(ord.affected)))} after a pre-loading exercise vs ${sign(pct(median(ord.fresh)))} fresh). Order matters little for you on these lifts.`,
    contradicts: `Lifts done after a pre-loading exercise were better (${sign(pct(median(ord.affected)))}) than fresh (${sign(pct(median(ord.fresh)))}) — likely other factors (warm-up, exercise mix). Treat the order rule as optional for you.`,
    insufficient: `Not enough comparable sessions yet (${ord.affected.length} after a pre-loading exercise, ${ord.fresh.length} fresh; ${RULE_CHECK_MIN_N} each needed).`,
  };
  return [
    { id: 'recovery_window', title: 'Recovery windows', rule: 'A muscle needs 24–72 h after a significant session (base window by sets; checked here without the +12 h modifiers).', verdict: rv.verdict, affected: side(rec.affected), fresh: side(rec.fresh), diffPct: rv.diff, text: recText[rv.verdict] },
    { id: 'exercise_order', title: 'Exercise order', rule: 'Demanding lifts first; an exercise done after others that used the same muscle loses some reps.', verdict: ov.verdict, affected: side(ord.affected), fresh: side(ord.fresh), diffPct: ov.diff, text: ordText[ov.verdict] },
  ];
}
