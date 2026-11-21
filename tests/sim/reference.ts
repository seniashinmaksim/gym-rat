/**
 * INDEPENDENT reference calculations for the QA audit.
 *
 * Written from the documented rules (CLAUDE.md sections C, D, G, H, I) — it imports NOTHING from
 * src/domain, so a bug in the app cannot silently agree with itself. Only plain data types are shared.
 * Coefficients are copied from the documentation tables (CLAUDE.md §C/§F), not from exercises.ts;
 * pull_up and hanging_leg_raise are not in those tables and are taken from the library description
 * (marked ASSUMED below).
 */
import type { BodyMeasurement, Workout, WorkoutSet } from '../../src/domain/types';

export type Coef = Record<string, number>;
export const REF_COEF: Record<string, Coef> = {
  incline_dumbbell_press: { chest: 1, front_delts: 0.5, triceps: 0.5 }, // §C, §F row 1 (30° = incline group)
  triceps_pushdown_bar: { triceps: 1 }, // §F row 2
  pec_deck: { chest: 1, front_delts: 0.25 }, // §C, §F row 3 — no triceps
  machine_biceps_curl: { biceps: 1, forearms: 0.25 }, // §F row 4
  ez_bar_curl: { biceps: 1, forearms: 0.25 },
  lateral_raise: { side_delts: 1, traps: 0.25 }, // §F row 5
  cable_lateral_raise: { side_delts: 1, traps: 0.25 },
  back_squat: { quads: 1, glutes: 0.5, adductors: 0.5, spinal_erectors: 0.25 }, // §F row 6
  leg_extension: { quads: 1 },
  romanian_deadlift: { hamstrings: 1, glutes: 0.75, spinal_erectors: 0.5, adductors: 0.5, forearms: 0.25, traps: 0.25 }, // §F row 7
  seated_leg_curl: { hamstrings: 1, calves: 0.25 },
  lying_leg_curl: { hamstrings: 1, calves: 0.25 },
  hanging_knee_raise_pelvic_curl: { abs: 1 }, // §F row 8
  pull_up: { lats: 1, upper_back: 0.5, biceps: 0.5, rear_delts: 0.25, forearms: 0.25 }, // ASSUMED (library text)
  hanging_leg_raise: { abs: 1, forearms: 0.25 }, // ASSUMED (library text)
};

/** §C: RIR 0–3 → 1, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥ 8 → 0; unknown → 0.75. */
export function refRirCredit(rir: number): number {
  if (rir <= 3) return 1;
  if (rir === 4) return 0.6;
  if (rir === 5) return 0.3;
  if (rir <= 7) return 0.15;
  return 0;
}

/** Credit of one performed working set, from the documented rules only. */
export function refSetCredit(s: WorkoutSet): number {
  if (s.type === 'warmup' || s.planned) return 0;
  let c: number;
  if (s.rir != null) c = refRirCredit(s.rir);
  else if (s.toFailure) c = 1;
  else if (s.failure === 'muscular' && !s.technicalFailure) c = 1; // §H: ≈ RIR 0, same credit as RIR 1–3
  else c = 0.75; // unknown effort (failure 'none' / 'uncertain' without RIR stays unknown)
  if (s.reps != null && s.reps < 5) c *= 0.8;
  if (s.type === 'drop') c *= 0.5;
  if (s.rom === 'partial') c *= 0.8;
  const tech = s.technique ?? (s.techniqueOk === false ? 'compromised' : undefined);
  const technical = s.technicalFailure === true && tech !== 'good';
  if (tech === 'compromised' || tech === 'failed' || technical) c *= 0.7; // §G/§H
  return c;
}

/** §C unilateral rule: i-th left pairs with i-th right (each 0.5); an unpaired side counts as one set. */
function sideWeights(sets: WorkoutSet[]): Map<string, number> {
  const m = new Map<string, number>();
  const L = sets.filter((s) => s.side === 'left' && s.type !== 'warmup' && !s.planned);
  const R = sets.filter((s) => s.side === 'right' && s.type !== 'warmup' && !s.planned);
  const pairs = Math.min(L.length, R.length);
  L.forEach((s, i) => m.set(s.id, i < pairs ? 0.5 : 1));
  R.forEach((s, i) => m.set(s.id, i < pairs ? 0.5 : 1));
  return m;
}

/** Effective sets per muscle for a list of workouts, with the per-session taper (> 11 → ×0.5). */
export function refEffective(workouts: Workout[], cap = 11, beyond = 0.5): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of workouts) {
    const run: Record<string, number> = {};
    for (const e of w.exercises) {
      const coef = REF_COEF[e.exerciseId];
      if (!coef) throw new Error(`reference has no coefficients for ${e.exerciseId}`);
      const sw = sideWeights(e.sets);
      for (const s of e.sets) {
        if (s.type === 'warmup' || s.planned) continue;
        const k = sw.get(s.id) ?? 1;
        const credit = refSetCredit(s);
        for (const [m, c] of Object.entries(coef)) {
          const add = c * credit * k;
          const before = run[m] ?? 0;
          const credited = before >= cap ? add * beyond : before + add <= cap ? add : (cap - before) + (before + add - cap) * beyond;
          run[m] = before + add;
          out[m] = (out[m] ?? 0) + credited;
        }
      }
    }
  }
  return out;
}

/** Raw direct (coef 1) / indirect (coef < 1) working-set counts per muscle (pairs count once). */
export function refRawSets(workouts: Workout[]): Record<string, { direct: number; indirect: number }> {
  const out: Record<string, { direct: number; indirect: number }> = {};
  for (const w of workouts) for (const e of w.exercises) {
    const sw = sideWeights(e.sets);
    for (const s of e.sets) {
      if (s.type === 'warmup' || s.planned) continue;
      for (const [m, c] of Object.entries(REF_COEF[e.exerciseId])) {
        const o = (out[m] ??= { direct: 0, indirect: 0 });
        if (c >= 0.75) o.direct += sw.get(s.id) ?? 1; else o.indirect += sw.get(s.id) ?? 1;
      }
    }
  }
  return out;
}

/** Tonnage = Σ weight × reps of performed working (non-warm-up) sets, as logged; assisted excluded. */
export function refTonnage(w: Workout): number {
  let t = 0;
  for (const e of w.exercises) for (const s of e.sets) {
    if (s.type === 'warmup' || s.planned || s.loadMode === 'assisted') continue;
    t += (s.weightKg ?? 0) * (s.reps ?? 0);
  }
  return t;
}

// ---------------------------------------------------------------- calendar (independent date math)

const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const refAddDays = (d: string, n: number) => new Date(ms(d) + n * 86400000).toISOString().slice(0, 10);
export const refDiffDays = (a: string, b: string) => Math.round((ms(a) - ms(b)) / 86400000);
/** Monday of the ISO week containing `d` (weeks start Monday 00:00). */
export function refMonday(d: string): string {
  const dow = (new Date(ms(d)).getUTCDay() + 6) % 7; // Mon=0
  return refAddDays(d, -dow);
}

// ---------------------------------------------------------------- body weight

/** Mean of DAILY means over the `days` calendar days ending at `end` (inclusive). */
export function ref7dAverage(body: BodyMeasurement[], end: string, days = 7): number | null {
  const start = refAddDays(end, -(days - 1));
  const byDay = new Map<string, number[]>();
  for (const b of body) {
    if (b.weightKg == null || !(b.weightKg > 0) || b.date < start || b.date > end) continue;
    byDay.set(b.date, [...(byDay.get(b.date) ?? []), b.weightKg]);
  }
  if (!byDay.size) return null;
  const means = [...byDay.values()].map((xs) => xs.reduce((a, x) => a + x, 0) / xs.length);
  return means.reduce((a, x) => a + x, 0) / means.length;
}

/** §I: latest weigh-in taken before the session start; same-day without time only if morning fasted / before workout. */
export function refBodyBefore(body: BodyMeasurement[], date: string, start: string | null): { kg: number; date: string; outdated: boolean } | null {
  let best: { kg: number; date: string; t: string } | null = null;
  for (const b of body) {
    if (b.weightKg == null || !(b.weightKg > 0)) continue;
    const t = b.time ?? '00:00';
    let ok: boolean;
    if (b.date < date) ok = true;
    else if (b.date > date) ok = false;
    else if (b.time && start) ok = b.time <= start;
    else ok = !b.time && (b.condition === 'morning_fasted' || b.condition === 'before_workout');
    if (!ok) continue;
    const k = `${b.date}T${t}`;
    if (!best || k > `${best.date}T${best.t}` || (k === `${best.date}T${best.t}`)) best = { kg: b.weightKg, date: b.date, t };
  }
  return best ? { kg: best.kg, date: best.date, outdated: refDiffDays(date, best.date) > 7 } : null;
}

// ---------------------------------------------------------------- strength index & progress %

/**
 * §D: RIR-adjusted Epley on BENCHMARK sets (wrong weight, pain, compromised/failed technique, technical
 * failure excluded). §I: belt/vest exercises (all sets bodyweight-plus) with added load use body + belt
 * when the body weight before the session is known.
 */
export function refIndex(sets: WorkoutSet[], bodyKg: number | null = null): number | null {
  const bench = sets.filter((s) => s.type === 'working' && !s.planned && s.reps != null
    && s.weightAccuracy !== 'too_light' && s.weightAccuracy !== 'too_heavy' && !s.pain && s.feel !== 'pain'
    && s.technique !== 'compromised' && s.technique !== 'failed' && !(s.technicalFailure && s.technique !== 'good'));
  if (!bench.length) return null;
  const rirOf = (s: WorkoutSet) => s.rir ?? (s.toFailure || (s.failure === 'muscular' && !s.technicalFailure) ? 0 : 0);
  const loaded = bench.filter((s) => (s.weightKg ?? 0) > 0 && s.loadMode !== 'assisted');
  const work = sets.filter((s) => s.type === 'working' && !s.planned);
  const extra = bodyKg != null && work.every((s) => s.loadMode === 'bodyweight_plus') ? bodyKg : 0;
  if (loaded.length) return Math.max(...loaded.map((s) => ((s.weightKg as number) + extra) * (1 + Math.min((s.reps as number) + rirOf(s), 30) / 30)));
  return Math.max(...bench.map((s) => (s.reps as number) + rirOf(s)));
}

const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** §I: baseline = median index of the first 28 days (≥ 2); current = median of the last ≤ 3 in the last 28 days, after the baseline window (≥ 2). */
export function refProgressPct(sessions: { date: string; index: number | null }[], today: string): { baseline: number; current: number; pct: number } | null {
  const rep = sessions.filter((s) => s.index != null) as { date: string; index: number }[];
  if (!rep.length) return null;
  const baseEnd = refAddDays(rep[0].date, 27);
  const base = rep.filter((s) => s.date <= baseEnd);
  if (base.length < 2) return null;
  const recent = rep.filter((s) => s.date > baseEnd && refDiffDays(today, s.date) < 28).slice(-3);
  if (recent.length < 2) return null;
  const b = med(base.map((s) => s.index));
  const c = med(recent.map((s) => s.index));
  return { baseline: b, current: c, pct: (c / b - 1) * 100 };
}
