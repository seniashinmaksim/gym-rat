/**
 * Recovery-aware sequencing across sessions (Part 8, FIX_PLAN H.2). Pure: no clock, no storage.
 *
 * Three SEPARATE forward checks for an exercise considered today, against the owner's upcoming usual sessions
 * (learned in Part 7 `weekPlan.ts`; no usual days known → no forward checks at all):
 *   - interference: today's sets leave a muscle the exercise trains DIRECTLY (≥ 0.75) inside its window when a
 *     high-priority exercise of an upcoming session uses that muscle meaningfully (≥ 0.5, also as a SECONDARY muscle).
 *     Independent of weekly volume and of whether that muscle needs anything that day (e.g. Monday curls → Tuesday pull-ups);
 *   - recovery: the same, for an upcoming exercise that trains that muscle directly while its week is not met yet;
 *   - (weekly volume is handled by Part 7's recovery-aware today's share.)
 * Severity: a REAL LIMIT when ≥ 12 h of the window would be left at that session, else a RECOMMENDATION; inside the
 * usual 6 h tolerance nothing is shown. Windows are the recovery table's base windows (heuristics), the same ones the
 * rest of the app uses — no second recovery model. Same time of day assumed for every session (24 h per day).
 *
 * Moving (`bestMoveDay`) chooses the DAY; `placeInSession` chooses the POSITION inside that day separately: after the
 * high-priority exercises that use the moved exercise's muscles or cost more fatigue (curls after pull-ups), first only
 * when its primary muscle is the owner's priority.
 */
import type { AppData } from './appdata';
import { addDays, diffDays, formatDate } from './dates';
import { FATIGUE_RANK, fatigueCostOf } from './fatigue';
import { L, getLang } from '../i18n/core';
import { MUSCLE_BY_ID, muscleName } from './muscles';
import { RECOVERY_TOLERANCE_H, type analyze } from './analysis';
import { buildRegistry, resolveCoefficients } from './registry';
import type { MuscleId, PlannedMove, Variation, Workout } from './types';
import { computeVolume } from './volume';
import { sessionWindowH, weekdayOf } from './weekPlan';

type Analysis = ReturnType<typeof analyze>;

/** An exercise counts as usual on a weekday when it appears in at least this share of the recent sessions on that weekday. */
export const USUAL_EXERCISE_SHARE = 0.5;
/** Window hours still left at the upcoming session from which a conflict is a REAL LIMIT (below: a recommendation). */
export const LIMIT_HOURS_LEFT = 12;
/** A muscle counts as used by an upcoming exercise from this coefficient (secondary muscles included). */
export const INTERFERENCE_MIN_COEF = 0.5;
/** A muscle is trained DIRECTLY by the exercise considered today from this coefficient. */
export const DIRECT_COEF = 0.75;

export interface UpcomingExercise { exerciseId: string; position: number; priority: 'high' | 'low'; contributions: Partial<Record<MuscleId, number>> }
export interface UpcomingSession { date: string; exercises: UpcomingExercise[] }

export interface ForwardFinding {
  check: 'interference' | 'recovery';
  severity: 'limit' | 'recommendation';
  date: string;
  muscle: MuscleId;
  affectsExerciseId: string;
  /** Window hours still left at that session. */
  hoursLeft: number;
  /** One short sentence (EN / RU). */
  text: string;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function priorityOf(data: AppData, analysis: Analysis, exerciseId: string, variation?: Variation | null): 'high' | 'low' {
  const def = analysis.registry.get(exerciseId);
  if (!def) return 'low';
  if (def.category === 'compound' || fatigueCostOf(def, variation) !== 'low') return 'high';
  const primary = (Object.entries(resolveCoefficients(def, variation ?? undefined).contributions) as [MuscleId, number][]).sort((a, b) => b[1] - a[1])[0]?.[0];
  return primary && data.settings.priorities[primary] === 'high' ? 'high' : 'low';
}

/**
 * The owner's next usual sessions: the later usual days of this week and the first usual day of next week, each with
 * the exercises usually done on that weekday (in ≥ half of the last ≤ 8 sessions on it), in their usual order.
 */
export function upcomingSessions(data: AppData, analysis: Analysis): UpcomingSession[] {
  const usual = analysis.usualDays;
  if (!usual) return [];
  const dates: string[] = [];
  for (let d = 1; d <= diffDays(analysis.week.end, analysis.today); d++) { const x = addDays(analysis.today, d); if (usual.includes(weekdayOf(x))) dates.push(x); }
  for (let d = 1; d <= 7; d++) { const x = addDays(analysis.week.end, d); if (usual.includes(weekdayOf(x))) { dates.push(x); break; } }
  const past = data.workouts.filter((w) => w.date < analysis.today).sort((a, b) => a.date.localeCompare(b.date));
  return dates.map((date) => {
    const same = past.filter((w) => weekdayOf(w.date) === weekdayOf(date)).slice(-8);
    const seen = new Map<string, { n: number; pos: number[]; variation?: Variation | null }>();
    for (const w of same) {
      const ids = new Set<string>();
      w.exercises.filter((e) => !e.skipped && e.sets.some((s) => !s.planned)).forEach((e, i) => {
        if (ids.has(e.exerciseId)) return;
        ids.add(e.exerciseId);
        const r = seen.get(e.exerciseId) ?? { n: 0, pos: [], variation: e.variation };
        r.n++; r.pos.push(i); seen.set(e.exerciseId, r);
      });
    }
    const exercises = [...seen].filter(([, r]) => same.length > 0 && r.n / same.length >= USUAL_EXERCISE_SHARE)
      .map(([exerciseId, r]) => {
        const def = analysis.registry.get(exerciseId);
        return { exerciseId, position: median(r.pos), priority: priorityOf(data, analysis, exerciseId, r.variation), contributions: def ? resolveCoefficients(def, r.variation ?? undefined).contributions : {} };
      })
      .sort((a, b) => a.position - b.position);
    return { date, exercises };
  });
}

const exName = (analysis: Analysis, id: string) => { const d = analysis.registry.get(id); return d ? L(d.name.en, d.name.ru) : id; };
const weekday = (date: string) => formatDate(date, { weekday: 'long' });

function findingText(analysis: Analysis, f: Omit<ForwardFinding, 'text'>): string {
  const day = weekday(f.date);
  const Day = day.charAt(0).toUpperCase() + day.slice(1);
  const m = muscleName(f.muscle, getLang()).toLowerCase();
  const p = exName(analysis, f.affectsExerciseId);
  if (f.check === 'interference') {
    return f.severity === 'limit'
      ? L(`May reduce ${Day}'s ${p.toLowerCase()} — ${m} still recovering.`, `Может снизить результат: ${p.toLowerCase()} (${day}) — ${m} ещё восстанавливается.`)
      : L(`Slightly better after ${Day}'s ${p.toLowerCase()} — ${m} overlaps.`, `Чуть лучше после: ${p.toLowerCase()} (${day}) — ${m} пересекается.`);
  }
  return f.severity === 'limit'
    ? L(`${m.charAt(0).toUpperCase() + m.slice(1)} still recovering by ${Day}'s session.`, `${m.charAt(0).toUpperCase() + m.slice(1)} не успеет восстановиться к тренировке (${day}).`)
    : L(`Close to ${Day}'s ${m} session — fine if needed.`, `Близко к тренировке (${day}) на ${m} — можно, если нужно.`);
}

export interface ForwardInput {
  data: AppData;
  analysis: Analysis;
  /** Today's session (performed sets count as done today). */
  workout: Workout | null;
  exerciseId: string;
  /** Working sets intended for the exercise today (credited in full: the cautious assumption). */
  sets: number;
  /** Effective sets per muscle planned before it today that are not in `workout` (plan preview). */
  extraDone?: Partial<Record<MuscleId, number>>;
  variation?: Variation | null;
}

/**
 * Moves still open: the exercise has not been performed in any workout dated after the day it was moved from.
 * (A move whose day has passed stays open and visible — never skipped automatically.)
 */
export function activeMoves(data: Pick<AppData, 'settings' | 'workouts'>): PlannedMove[] {
  return (data.settings.plannedMoves ?? []).filter((m) => !data.workouts.some((w) => w.date > m.fromDate && w.exercises.some((e) => e.exerciseId === m.exerciseId && !e.skipped && e.sets.some((s) => !s.planned && s.type !== 'warmup'))));
}

/** How many working sets the owner usually does of an exercise (median of the last ≤ 6 sessions with it; 3 when unknown). */
export function usualSetCount(workouts: Workout[], exerciseId: string): number {
  const counts = [...workouts].sort((a, b) => a.date.localeCompare(b.date)).flatMap((w) => w.exercises.filter((e) => e.exerciseId === exerciseId && !e.skipped)
    .map((e) => { const ok = e.sets.filter((x) => !x.planned && x.type !== 'warmup'); return ok.filter((x) => !x.side).length + Math.max(ok.filter((x) => x.side === 'left').length, ok.filter((x) => x.side === 'right').length); }))
    .filter((n) => n > 0).slice(-6);
  return counts.length ? Math.round(median(counts)) : 3;
}

/** Effective sets per muscle already done in this session. */
function doneToday(input: Pick<ForwardInput, 'workout' | 'analysis' | 'data'>): Partial<Record<MuscleId, number>> {
  if (!input.workout) return {};
  const v = computeVolume([input.workout], input.analysis.registry, input.data.settings.quality).muscles;
  return Object.fromEntries(Object.entries(v).map(([m, x]) => [m, x.effective])) as Partial<Record<MuscleId, number>>;
}

/** The forward checks of one exercise placed on `fromDate` with `load` effective sets per muscle (done that day incl. it). */
function checksFrom(input: ForwardInput, sessions: UpcomingSession[], fromDate: string, load: Partial<Record<MuscleId, number>>, direct: MuscleId[], added: Partial<Record<MuscleId, number>> = load): Omit<ForwardFinding, 'text'>[] {
  const out: Omit<ForwardFinding, 'text'>[] = [];
  const weekLeft = (m: MuscleId) => input.analysis.muscles.find((x) => x.muscle === m)?.remainingToPreferred ?? 0;
  for (const m of direct) {
    const eff = load[m] ?? 0;
    const window = sessionWindowH(eff, MUSCLE_BY_ID[m].size === 'large');
    for (const s of sessions) {
      const gap = 24 * diffDays(s.date, fromDate);
      if (gap <= 0) continue;
      if (gap >= window - RECOVERY_TOLERANCE_H) break; // later sessions are further away still
      const left = window - gap;
      const severity = left >= LIMIT_HOURS_LEFT ? 'limit' as const : 'recommendation' as const;
      const p = s.exercises.find((e) => e.priority === 'high' && (e.contributions[m] ?? 0) >= INTERFERENCE_MIN_COEF);
      if (p) { out.push({ check: 'interference', severity, date: s.date, muscle: m, affectsExerciseId: p.exerciseId, hoursLeft: Math.round(left) }); break; }
      const q = s.exercises.find((e) => (e.contributions[m] ?? 0) >= DIRECT_COEF);
      // remainingToPreferred already includes today's done sets: subtract only what comes on top; next week resets.
      if (q && s.date <= input.analysis.week.end && weekLeft(m) - (added[m] ?? 0) > 0.5) { out.push({ check: 'recovery', severity, date: s.date, muscle: m, affectsExerciseId: q.exerciseId, hoursLeft: Math.round(left) }); break; }
    }
  }
  return out;
}

/** Short findings for an exercise considered today; [] when nothing meaningful (or no usual days known). */
export function forwardChecks(input: ForwardInput): ForwardFinding[] {
  const def = input.analysis.registry.get(input.exerciseId);
  if (!def || input.sets <= 0) return [];
  const sessions = upcomingSessions(input.data, input.analysis);
  if (!sessions.length) return [];
  const co = resolveCoefficients(def, input.variation ?? undefined).contributions;
  const direct = (Object.entries(co) as [MuscleId, number][]).filter(([, c]) => c >= DIRECT_COEF).map(([m]) => m);
  const done = doneToday(input);
  const load: Partial<Record<MuscleId, number>> = {};
  const added: Partial<Record<MuscleId, number>> = {};
  for (const m of direct) {
    added[m] = (input.extraDone?.[m] ?? 0) + input.sets * (co[m] ?? 0);
    load[m] = (done[m] ?? 0) + added[m]!;
  }
  return checksFrom(input, sessions, input.analysis.today, load, direct, added).map((f) => ({ ...f, text: findingText(input.analysis, f) }));
}

/**
 * The day to move an exercise to: the earliest upcoming usual day where its direct muscles are outside today's window
 * and doing it there raises no forward finding for the sessions after it. None clean → the day with the fewest findings,
 * `clean: false` (shown as "still overlaps"). null = no upcoming usual day known.
 */
export function bestMoveDay(input: ForwardInput): { date: string; clean: boolean } | null {
  const def = input.analysis.registry.get(input.exerciseId);
  const sessions = upcomingSessions(input.data, input.analysis);
  if (!def || !sessions.length) return null;
  const co = resolveCoefficients(def, input.variation ?? undefined).contributions;
  const direct = (Object.entries(co) as [MuscleId, number][]).filter(([, c]) => c >= DIRECT_COEF).map(([m]) => m);
  const done = doneToday(input);
  let best: { date: string; n: number } | null = null;
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const gap = 24 * diffDays(s.date, input.analysis.today);
    const held = direct.some((m) => gap < sessionWindowH((done[m] ?? 0) + (input.extraDone?.[m] ?? 0), MUSCLE_BY_ID[m].size === 'large') - RECOVERY_TOLERANCE_H);
    const load: Partial<Record<MuscleId, number>> = {};
    for (const m of direct) load[m] = input.sets * (co[m] ?? 0);
    const n = (held ? 1 : 0) + checksFrom(input, sessions.slice(i + 1), s.date, load, direct).length;
    if (n === 0) return { date: s.date, clean: true };
    if (!best || n < best.n) best = { date: s.date, n };
  }
  return best ? { date: best.date, clean: false } : null;
}

/**
 * Where a moved exercise goes inside that day's session (scheduling priority ≠ execution order): after every
 * high-priority exercise that uses one of its direct muscles (≥ 0.5) or costs more fatigue; first only when its primary
 * muscle is the owner's priority muscle. Returns the index to insert at.
 */
export function placeInSession(data: AppData, session: UpcomingSession, exerciseId: string, variation?: Variation | null): number {
  const ids = session.exercises;
  const reg = buildRegistry(data.customExercises, data.exerciseOverrides);
  const def = reg.get(exerciseId);
  if (!def) return ids.length;
  const co = resolveCoefficients(def, variation ?? undefined).contributions;
  const ranked = (Object.entries(co) as [MuscleId, number][]).sort((a, b) => b[1] - a[1]);
  if (ranked[0] && data.settings.priorities[ranked[0][0]] === 'high') return 0;
  const direct = ranked.filter(([, c]) => c >= DIRECT_COEF).map(([m]) => m);
  const mine = FATIGUE_RANK[fatigueCostOf(def, variation)];
  let at = 0;
  ids.forEach((e, i) => {
    if (e.priority !== 'high') return;
    const eDef = reg.get(e.exerciseId);
    const uses = direct.some((m) => (e.contributions[m] ?? 0) >= INTERFERENCE_MIN_COEF);
    if (uses || FATIGUE_RANK[fatigueCostOf(eDef)] < mine) at = i + 1;
  });
  return at;
}

