import type { AppData } from './appdata';
import { addDays, weekOf, type WeekRange } from './dates';
import type { Registry } from './registry';
import type { Workout } from './types';
import { computeVolume, type VolumeResult } from './volume';

export interface WeekBucket {
  range: WeekRange;
  workouts: Workout[];
  volume: VolumeResult;
  complete: boolean;
  /** The first week of the history, begun mid-week: not a full week for averages, medians or usual days. */
  partial?: boolean;
}

/** All weeks from the first workout until the current week (inclusive), oldest first. */
export function weeklyHistory(data: AppData, registry: Registry, today: string): WeekBucket[] {
  if (!data.workouts.length) return [];
  const ws = data.settings.weekStartsOn;
  const first = data.workouts.reduce((m, w) => (w.date < m ? w.date : m), data.workouts[0].date);
  const current = weekOf(today, ws);
  const buckets: WeekBucket[] = [];
  let r = weekOf(first, ws);
  let guard = 0;
  while (r.start <= current.start && guard++ < 1000) {
    const range = r;
    const wk = data.workouts.filter((w) => w.date >= range.start && w.date <= range.end);
    // The week holding the very first workout is only part of a week unless that workout was on its first day (Part 7 G.1 #11).
    buckets.push({ range, workouts: wk, volume: computeVolume(wk, registry, data.settings.quality), complete: range.end < today, partial: first > range.start });
    r = weekOf(addDays(range.end, 1), ws);
  }
  return buckets;
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function cv(xs: number[]): number {
  if (xs.length < 2) return 1;
  const m = mean(xs);
  if (!m) return 1;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
  return sd / m;
}
