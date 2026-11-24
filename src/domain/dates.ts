/**
 * Calendar helpers. Workouts store a LOCAL calendar date (YYYY-MM-DD) in the user's
 * training timezone, so week membership is pure calendar arithmetic. "Now" is
 * resolved in the configured timezone via Intl.
 */
import { locale } from '../i18n/core';

const DAY = 86_400_000;

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  // Round trip: an impossible day (30 February) is rolled over by some engines instead of being rejected.
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}

/** Date-only → UTC epoch ms at 00:00 (a "virtual" calendar instant). */
export function dateMs(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}

export function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  return msToDate(dateMs(d) + n * DAY);
}

export function diffDays(a: string, b: string): number {
  return Math.round((dateMs(a) - dateMs(b)) / DAY);
}

export function dayOfWeek(d: string): number {
  return new Date(dateMs(d)).getUTCDay();
}

export function localNowParts(timeZone: string, now: Date = new Date()): { date: string; time: string; virtualMs: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}`;
  return { date, time, virtualMs: Date.parse(`${date}T${time}:00Z`) };
}

export function todayIn(timeZone: string, now?: Date): string {
  return localNowParts(timeZone, now).date;
}

export function weekStart(d: string, weekStartsOn: number): string {
  const dow = dayOfWeek(d);
  const back = (dow - weekStartsOn + 7) % 7;
  return addDays(d, -back);
}

export interface WeekRange {
  start: string;
  end: string; // inclusive
}

export function weekOf(d: string, weekStartsOn: number): WeekRange {
  const start = weekStart(d, weekStartsOn);
  return { start, end: addDays(start, 6) };
}

export function inRange(d: string, r: WeekRange): boolean {
  return d >= r.start && d <= r.end;
}

/** Days remaining in the week INCLUDING today. */
export function daysLeftInWeek(today: string, r: WeekRange): number {
  return Math.max(0, diffDays(r.end, today) + 1);
}

export type SessionTimeSource = 'last_set' | 'end_time' | 'start_plus_duration' | 'start_time' | 'assumed';

/**
 * When the training stimulus of a session ENDED, as a virtual local timestamp (same scale as
 * `localNowParts().virtualMs`). Recovery is counted from here. Best evidence first:
 * the moment the last set was ticked in the live logger → the recorded end time →
 * start + duration → start time → 18:00 when no time was recorded (flagged as assumed).
 */
export function sessionEndVirtualMs(
  w: { date: string; startTime?: string | null; endTime?: string | null; durationMin?: number | null; exercises?: { sets: { completedAt?: string; planned?: boolean }[] }[] },
  timeZone: string,
): { ms: number; source: SessionTimeSource } {
  const day = dateMs(w.date);
  // 1) Last ticked set (real instant → local wall time). Only trusted if it falls on the workout's day or the night after.
  const ticks = (w.exercises ?? []).flatMap((e) => e.sets).filter((s) => s.completedAt && !s.planned).map((s) => Date.parse(s.completedAt as string)).filter((x) => Number.isFinite(x));
  if (ticks.length) {
    const v = localNowParts(timeZone, new Date(Math.max(...ticks))).virtualMs;
    if (v >= day && v < day + 2 * DAY) return { ms: v, source: 'last_set' };
  }
  const hhmm = (t?: string | null) => (t && /^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 3_600_000 + Number(t.slice(3, 5)) * 60_000 : null);
  const start = hhmm(w.startTime);
  const end = hhmm(w.endTime);
  // 2) End time (an end earlier than the start means the session ran past midnight).
  if (end != null) return { ms: day + end + (start != null && end < start ? DAY : 0), source: 'end_time' };
  // 3) Start + duration, 4) start only.
  if (start != null && w.durationMin != null && w.durationMin > 0) return { ms: day + start + w.durationMin * 60_000, source: 'start_plus_duration' };
  if (start != null) return { ms: day + start, source: 'start_time' };
  return { ms: day + 18 * 3_600_000, source: 'assumed' };
}

/** Virtual local timestamp of a workout (date + start time; 18:00 if unknown). */
export function workoutVirtualMs(date: string, startTime?: string | null): number {
  const t = startTime && /^\d{2}:\d{2}$/.test(startTime) ? startTime : '18:00';
  return Date.parse(`${date}T${t}:00Z`);
}

export function formatDate(d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  return new Date(dateMs(d)).toLocaleDateString(locale(), { ...opts, timeZone: 'UTC' });
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${r}s`;
}

export function listTimezones(): string[] {
  const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  try {
    return anyIntl.supportedValuesOf?.('timeZone') ?? ['UTC'];
  } catch {
    return ['UTC'];
  }
}
