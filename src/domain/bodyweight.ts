/**
 * Body weight over time and its link to workouts.
 *
 * - Every weigh-in keeps its MEASUREMENT date + time (what analysis uses) separately from when it was
 *   typed in (`enteredAt`). Several per day are kept.
 * - Day-to-day swings are mostly water, glycogen, food and salt, so the trend is a rolling 7-day
 *   average of daily means.
 * - A workout's body weight is DERIVED (never copied): the latest weigh-in taken before the session
 *   started. A weigh-in entered later but dated before an earlier session therefore updates the
 *   analysis automatically, and an evening weigh-in after a session is never used for it.
 * - Body weight is context: it is never added to a barbell load; for pull-ups the combined
 *   "body + belt" figure is labelled an estimate.
 */
import { addDays, diffDays } from './dates';
import type { BodyMeasurement, Workout } from './types';
import type { ProgressionSeries } from './progression';

export interface WeighIn {
  id: string;
  date: string;
  time: string | null;
  kg: number;
  condition: BodyMeasurement['condition'] | null;
}

const hhmm = (t: string | null | undefined) => (t && /^\d{2}:\d{2}$/.test(t) ? t : null);
const sortKey = (w: { date: string; time: string | null }) => `${w.date}T${w.time ?? '00:00'}`;

export function weighIns(body: BodyMeasurement[]): WeighIn[] {
  return body
    .filter((b) => b.weightKg != null && Number.isFinite(b.weightKg) && (b.weightKg as number) > 0)
    .map((b) => ({ id: b.id, date: b.date, time: hhmm(b.time), kg: b.weightKg as number, condition: b.condition ?? null }))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.id.localeCompare(b.id));
}

export const latestWeighIn = (body: BodyMeasurement[]): WeighIn | null => weighIns(body).at(-1) ?? null;
export const weighInsOn = (body: BodyMeasurement[], date: string): WeighIn[] => weighIns(body).filter((w) => w.date === date);

/** Mean of the daily means over the `days` days ending at `endDate` (inclusive); null when no weigh-in falls inside. */
export function rollingAverage(body: BodyMeasurement[], endDate: string, days = 7): { kg: number; days: number; n: number } | null {
  const start = addDays(endDate, -(days - 1));
  const byDay = new Map<string, number[]>();
  for (const w of weighIns(body)) if (w.date >= start && w.date <= endDate) byDay.set(w.date, [...(byDay.get(w.date) ?? []), w.kg]);
  if (!byDay.size) return null;
  const means = [...byDay.values()].map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
  return { kg: Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 100) / 100, days: byDay.size, n: [...byDay.values()].flat().length };
}

/** 7-day average now minus the 7-day average a week earlier (kg/week); null without both. */
export function weeklyTrend(body: BodyMeasurement[], today: string): number | null {
  const now = rollingAverage(body, today);
  const before = rollingAverage(body, addDays(today, -7));
  return now && before ? Math.round((now.kg - before.kg) * 100) / 100 : null;
}

/** Points for a chart: every weigh-in plus the rolling 7-day average on each day that has one. */
export function weightSeries(body: BodyMeasurement[]): { points: { date: string; time: string | null; kg: number }[]; avg: { date: string; kg: number }[] } {
  const ws = weighIns(body);
  const days = [...new Set(ws.map((w) => w.date))];
  return { points: ws.map((w) => ({ date: w.date, time: w.time, kg: w.kg })), avg: days.map((d) => ({ date: d, kg: rollingAverage(body, d)!.kg })) };
}

export type SessionBodyStatus = 'ok' | 'outdated' | 'unavailable';
export interface SessionBodyWeight {
  status: SessionBodyStatus;
  kg: number | null;
  date: string | null;
  time: string | null;
  /** Hours between the weigh-in and the session start (approximate when either time is unknown). */
  gapHours: number | null;
  approximate: boolean;
}

/** Older than this, the weigh-in is shown as outdated (still shown, never silently treated as current). */
export const BODY_WEIGHT_MAX_AGE_DAYS = 7;

/**
 * Body weight for a session: the latest weigh-in taken BEFORE the session started. Same-day
 * weigh-ins count only when both times are known and the weigh-in is not later than the start
 * (an evening weigh-in is never used for that morning's workout); a same-day weigh-in without a
 * time counts only when marked "morning, fasted" or "before workout".
 */
export function bodyWeightForSession(body: BodyMeasurement[], w: Pick<Workout, 'date' | 'startTime'>): SessionBodyWeight {
  const start = hhmm(w.startTime);
  const candidates = weighIns(body).filter((x) => {
    if (x.date < w.date) return true;
    if (x.date > w.date) return false;
    if (x.time && start) return x.time <= start;
    return !x.time && (x.condition === 'morning_fasted' || x.condition === 'before_workout');
  });
  const best = candidates.at(-1);
  if (!best) return { status: 'unavailable', kg: null, date: null, time: null, gapHours: null, approximate: false };
  const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
  const days = diffDays(w.date, best.date);
  const approximate = !best.time || !start;
  const gapMin = days * 1440 + (toMin(start) ?? 12 * 60) - (toMin(best.time) ?? 8 * 60);
  return {
    status: days > BODY_WEIGHT_MAX_AGE_DAYS ? 'outdated' : 'ok',
    kg: best.kg, date: best.date, time: best.time, gapHours: Math.max(0, Math.round(gapMin / 6) / 10), approximate,
  };
}

/** Duplicate tap guard: same weight at the same measured date + time already saved. */
export const isDuplicateWeighIn = (body: BodyMeasurement[], kg: number, date: string, time: string | null) =>
  weighIns(body).some((w) => w.kg === kg && w.date === date && (w.time ?? null) === (time ?? null));

// ---------------------------------------------------------------- exercise context

/** Exercises where body weight is part of the load context (never added to an external load). */
export function bodyWeightRelevant(exerciseId: string, equipmentKind?: string): 'system' | 'context' | null {
  if (exerciseId === 'pull_up' || exerciseId === 'dips' || exerciseId === 'push_up' || exerciseId === 'assisted_pull_up') return 'system';
  if (equipmentKind === 'bodyweight') return 'system';
  if (['back_squat', 'front_squat', 'bulgarian_split_squat', 'walking_lunge', 'deadlift'].includes(exerciseId)) return 'context';
  return null; // machines and other exercises: body weight is not used
}

export interface BodyLoadSession {
  workoutId: string;
  date: string;
  body: SessionBodyWeight;
  /** External load as logged (belt weight for pull-ups, barbell for squats). */
  externalKg: number | null;
  bestReps: number | null;
  totalReps: number;
  sets: number;
  /** Pull-ups etc.: body + belt (assisted: body − assistance) — an ESTIMATE of system mass, not the force through the movement. */
  estSystemKg: number | null;
  /** External load is machine assistance (subtracted, lower = harder). */
  assisted?: boolean;
}

/** Per session of a progression series: body weight before the session next to the external load. */
export function bodyLoadSessions(series: ProgressionSeries, workouts: Workout[], body: BodyMeasurement[], kind: 'system' | 'context'): BodyLoadSession[] {
  const byId = new Map(workouts.map((w) => [w.id, w]));
  return series.sessions.map((s) => {
    const w = byId.get(s.workoutId);
    const b = w ? bodyWeightForSession(body, w) : bodyWeightForSession([], { date: s.date, startTime: null });
    const pts = s.sets.filter((p) => p.reps != null);
    const assisted = series.loadMode === 'assisted';
    // Hardest set: most added load, or LEAST assistance on an assisted machine.
    const top = pts.length ? (assisted ? Math.min(...pts.map((p) => p.weight ?? 0)) : Math.max(...pts.map((p) => p.weight ?? 0))) : null;
    const atTop = pts.filter((p) => (p.weight ?? 0) === top);
    const ext = top ?? null;
    const sys = b.kg == null ? null : assisted ? b.kg - Math.max(0, ext ?? 0) : b.kg + Math.max(0, ext ?? 0);
    return {
      workoutId: s.workoutId, date: s.date, body: b, externalKg: ext,
      bestReps: atTop.length ? Math.max(...atTop.map((p) => p.reps as number)) : null,
      totalReps: pts.reduce((n, p) => n + (p.reps ?? 0), 0), sets: pts.length,
      estSystemKg: kind === 'system' && sys != null && b.status !== 'unavailable' ? Math.round(Math.max(0, sys) * 10) / 10 : null,
      ...(assisted ? { assisted: true } : {}),
    };
  });
}

/**
 * One honest sentence about body weight next to the performance change (first vs last session with
 * a known body weight). Lighter body → bodyweight reps get easier; heavier → harder; more belt weight
 * while body weight drops is not the whole story. Never claims strength was lost or gained by itself.
 */
export function bodyWeightNote(sessions: BodyLoadSession[], kind: 'system' | 'context'): string | null {
  const known = sessions.filter((s) => s.body.kg != null && s.body.status !== 'unavailable');
  if (known.length < 2) return sessions.length >= 2 ? 'Body weight not recorded around these sessions — log it to see how it affects this exercise.' : null;
  const a = known[0];
  const b = known[known.length - 1];
  const dBody = Math.round(((b.body.kg as number) - (a.body.kg as number)) * 10) / 10;
  if (Math.abs(dBody) < 0.5) return `Body weight stable (${a.body.kg} → ${b.body.kg} kg) — changes here reflect performance.`;
  if (kind === 'context') return `Body weight ${a.body.kg} → ${b.body.kg} kg over these sessions — context only; it is never added to the bar.`;
  const dReps = (b.bestReps ?? 0) - (a.bestReps ?? 0);
  if (a.assisted || b.assisted) return `Body weight ${a.body.kg} → ${b.body.kg} kg; assistance ${a.externalKg ?? '—'} → ${b.externalKg ?? '—'} kg; estimated lifted mass ${a.estSystemKg ?? '—'} → ${b.estSystemKg ?? '—'} kg (estimate).`;
  const dExt = (b.externalKg ?? 0) - (a.externalKg ?? 0);
  const lighter = dBody < 0;
  if (dExt === 0 && dReps > 0 && lighter) return `Reps +${dReps} at the same added load while body weight fell ${Math.abs(dBody)} kg — part of the gain may come from being lighter.`;
  if (dExt === 0 && dReps < 0 && !lighter) return `Reps ${dReps} while body weight rose ${dBody} kg — being heavier makes bodyweight reps harder; not necessarily lost strength.`;
  if (dExt > 0 && lighter) return `Added load +${dExt} kg while body weight fell ${Math.abs(dBody)} kg — estimated system mass ${a.estSystemKg ?? '—'} → ${b.estSystemKg ?? '—'} kg (estimate).`;
  return `Body weight ${a.body.kg} → ${b.body.kg} kg; estimated system mass ${a.estSystemKg ?? '—'} → ${b.estSystemKg ?? '—'} kg (estimate).`;
}

/** Bodyweight pull-ups: is it time to add a belt? (top of the rep range with reps to spare in the last 2 sessions) */
export function pullUpLoadingAdvice(series: ProgressionSeries, repTop: number): string | null {
  if (!series.key.includes('load=bodyweight')) return null;
  const last2 = series.sessions.filter((s) => s.index != null).slice(-2);
  if (last2.length < 2) return null;
  const ready = last2.every((s) => s.sets.length > 0 && s.sets.every((p) => (p.reps ?? 0) >= repTop && (p.rir ?? 0) >= 1));
  return ready ? `All sets reached ${repTop}+ reps with reps to spare twice — consider weighted pull-ups (start with ~2.5–5 kg on the belt; a separate history).` : null;
}

export const daysBetween = (a: string, b: string) => diffDays(a, b);
