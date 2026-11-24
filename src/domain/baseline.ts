/**
 * Baseline, strength progression and a SEPARATE hypertrophy assessment.
 *
 * Strength progression (per exercise × equipment × configuration history):
 *   index   = the session's performance index from progression.ts — RIR-adjusted Epley estimate of
 *             the best BENCHMARK set (wrong weight, pain, compromised technique and technical failure
 *             are excluded), or reps + RIR for bodyweight work. It reflects weight, reps AND RIR
 *             together, so a heavier load done for fewer reps is not counted as progress by itself.
 *   baseline = median index of the representative sessions in the first 28 days of that history
 *             (needs ≥ 2).
 *   current  = median index of the last ≤ 3 representative sessions in the last 28 days (needs ≥ 2,
 *             all after the baseline window).
 *   progress = (current / baseline − 1) × 100, rounded to 0.1 %. An ESTIMATE of strength
 *             performance on that machine — never a measure of muscle growth.
 *
 * Hypertrophy assessment combines independent indicators (strength trend, quality sets,
 * consistency, effort, 7-day body-weight trend, circumferences, photos) and returns a status with
 * confidence. It never outputs a growth percentage. Windows: weeks 1–4 baseline, 4–8 early signals,
 * after 8 full weeks (day 56 on) a first combined assessment, then every 4 weeks.
 */
import type { AppData } from './appdata';
import { addDays, diffDays } from './dates';
import { comparableSessions, type ProgressionSeries } from './progression';
import { rollingAverage } from './bodyweight';
import { L, num } from '../i18n/core';
import type { MuscleId, Workout } from './types';

export const BASELINE_DAYS = 28;
const r1 = (x: number) => Math.round(x * 10) / 10;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export interface StrengthProgress {
  key: string;
  exerciseId: string;
  status: 'ok' | 'baseline_only' | 'more_data';
  baseline: { index: number; topWeight: number | null; sessions: number; from: string; to: string } | null;
  current: { index: number; topWeight: number | null; sessions: number; from: string; to: string } | null;
  pct: number | null;
}

export function strengthProgress(series: ProgressionSeries, today: string): StrengthProgress {
  // Part 6 (F.8): like with like — sessions of the latest context only (≥ 3 of them), else pre-loaded sessions
  // normalised to the fresh context, so a changed exercise order is not read as a gain or a loss.
  const all = comparableSessions(series.sessions).sessions.filter((s) => s.representative && s.index != null);
  const out: StrengthProgress = { key: series.key, exerciseId: series.exerciseId, status: 'more_data', baseline: null, current: null, pct: null };
  if (!all.length) return out;
  // Never compare a kg-based index with a reps-based one (e.g. bodyweight dips vs dips with a belt).
  // The LATEST kind decides (rule `index_scale`): after a switch (bodyweight → belt, belt → body + belt) the
  // baseline is the first 28 days of the sessions on the new scale, instead of "baseline only" for ever.
  const kind = all[all.length - 1].indexKind ?? null;
  const rep = all.filter((s) => (s.indexKind ?? null) === kind);
  const ix = (s: (typeof rep)[number]) => (s.indexRaw ?? s.index) as number;
  const start = rep[0].date;
  const baseEnd = addDays(start, BASELINE_DAYS - 1);
  const base = rep.filter((s) => s.date <= baseEnd);
  if (base.length < 2) return out;
  const weights = (xs: typeof rep) => { const w = xs.map((s) => s.topWeight).filter((x): x is number => x != null); return w.length ? median(w) : null; };
  out.baseline = { index: r1(median(base.map(ix))), topWeight: weights(base), sessions: base.length, from: base[0].date, to: base[base.length - 1].date };
  out.status = 'baseline_only';
  // Belt/vest work without any body weight: an Epley on the belt alone exaggerates every belt change
  // (5 → 7.5 kg reads as +50 %), so no % is shown until body weight is logged.
  if (kind === 'load' && series.loadMode === 'bodyweight_plus') return out;
  const recent = rep.filter((s) => s.date > baseEnd && diffDays(today, s.date) < BASELINE_DAYS).slice(-3);
  if (recent.length < 2) return out;
  out.current = { index: r1(median(recent.map(ix))), topWeight: weights(recent), sessions: recent.length, from: recent[0].date, to: recent[recent.length - 1].date };
  out.pct = Math.round((median(recent.map(ix)) / median(base.map(ix)) - 1) * 1000) / 10;
  out.status = 'ok';
  return out;
}

// ---------------------------------------------------------------- 4-week periods

export interface PeriodStats {
  from: string;
  to: string;
  sessions: number;
  sessionsPerWeek: number;
  /** Mean weekly quality (effective) sets per muscle — from the central volume engine. */
  weeklyEffective: Partial<Record<MuscleId, number>>;
  totalWeeklyEffective: number;
  bodyWeight7d: number | null;
  waistCm: number | null;
  /** Working sets per week, each counted once and weighted by quality (null when not computed). */
  qualitySetsPerWeek: number | null;
}

export function periodStats(data: AppData, from: string, to: string, effective: (ws: Workout[]) => Partial<Record<MuscleId, number>>, opts: { today?: string; quality?: (ws: Workout[]) => number } = {}): PeriodStats {
  const ws = data.workouts.filter((w) => w.date >= from && w.date <= to);
  // Per-week rates use only the days that actually belong to the history: not before the first workout,
  // not after today (a 4-week window in week 2 is 2 weeks long, not 4).
  const first = data.workouts.reduce<string | null>((m, w) => (m == null || w.date < m ? w.date : m), null);
  const lo = first && first > from ? first : from;
  const hi = opts.today && opts.today < to ? opts.today : to;
  const weeks = Math.max(1, (diffDays(hi, lo) + 1) / 7);
  const eff = effective(ws);
  const weekly = Object.fromEntries(Object.entries(eff).map(([m, v]) => [m, Math.round(((v ?? 0) / weeks) * 10) / 10])) as Partial<Record<MuscleId, number>>;
  const waist = data.body.filter((b) => b.date >= from && b.date <= to && b.waistCm != null).map((b) => b.waistCm as number);
  return {
    from, to, sessions: ws.length, sessionsPerWeek: Math.round((ws.length / weeks) * 10) / 10,
    weeklyEffective: weekly, totalWeeklyEffective: Math.round(Object.values(weekly).reduce((a, b) => a + (b ?? 0), 0) * 10) / 10,
    qualitySetsPerWeek: opts.quality ? Math.round((opts.quality(ws) / weeks) * 10) / 10 : null,
    bodyWeight7d: rollingAverage(data.body, hi)?.kg ?? null,
    waistCm: waist.length ? Math.round(median(waist) * 10) / 10 : null,
  };
}

// ---------------------------------------------------------------- hypertrophy assessment (separate)

export type HypertrophyPhase = 'no_data' | 'baseline' | 'early' | 'assessment';
export type HypertrophyStatus = 'establishing_baseline' | 'too_early' | 'consistent_positive_signals' | 'mixed_signals' | 'no_clear_signals' | 'insufficient_data';

export interface HypertrophyIndicator { id: 'strength' | 'volume' | 'consistency' | 'effort' | 'body_weight' | 'circumference' | 'photos'; value: string; signal: 'positive' | 'neutral' | 'negative' | 'unknown' }
export interface HypertrophyAssessment {
  phase: HypertrophyPhase;
  week: number;
  status: HypertrophyStatus;
  confidence: 'low' | 'moderate';
  indicators: HypertrophyIndicator[];
  /** Next scheduled check (start date + 4-week multiples). */
  nextCheck: string | null;
}

export function hypertrophyAssessment(input: {
  data: AppData; today: string; startDate: string | null; progress: StrengthProgress[];
  current: PeriodStats; previous: PeriodStats | null; targetPerWeek: number; effortKnownShare: number | null;
}): HypertrophyAssessment {
  const { data, today, startDate, progress, current, previous, targetPerWeek, effortKnownShare } = input;
  if (!startDate || !data.workouts.length) return { phase: 'no_data', week: 0, status: 'insufficient_data', confidence: 'low', indicators: [], nextCheck: null };
  const days = diffDays(today, startDate);
  const week = Math.floor(days / 7) + 1;
  const phase: HypertrophyPhase = days < 28 ? 'baseline' : days < 56 ? 'early' : 'assessment';
  const nextCheck = addDays(startDate, (Math.floor(days / 28) + 1) * 28);
  const ind: HypertrophyIndicator[] = [];
  const ok = progress.filter((p) => p.status === 'ok');
  const up = ok.filter((p) => (p.pct ?? 0) >= 2).length;
  const down = ok.filter((p) => (p.pct ?? 0) <= -2).length;
  // Mostly up (more than half, and at least 3 ups per down): one or two declining exercises don't cancel a broad trend.
  ind.push({ id: 'strength', value: ok.length ? L(`${up}/${ok.length} up${down ? `, ${down} down` : ''}`, `${up}/${ok.length} вверх${down ? `, ${down} вниз` : ''}`) : '—', signal: !ok.length ? 'unknown' : up > ok.length / 2 && up >= 3 * down ? 'positive' : down > up ? 'negative' : 'neutral' });
  // Volume vs the weekly targets (both summed over muscles, so the ratio is meaningful; the sum itself is not shown).
  const volRatio = targetPerWeek > 0 ? current.totalWeeklyEffective / targetPerWeek : null;
  ind.push({ id: 'volume', value: volRatio == null ? '—' : L(`${Math.round(volRatio * 100)}% of targets`, `${Math.round(volRatio * 100)}% от целей`), signal: volRatio == null ? 'unknown' : volRatio >= 0.8 ? 'positive' : volRatio >= 0.5 ? 'neutral' : 'negative' });
  ind.push({ id: 'consistency', value: L(`${current.sessionsPerWeek}/wk`, `${num(current.sessionsPerWeek)}/нед.`), signal: current.sessionsPerWeek >= 2 ? 'positive' : current.sessionsPerWeek >= 1 ? 'neutral' : 'negative' });
  ind.push({ id: 'effort', value: effortKnownShare == null ? '—' : L(`${Math.round(effortKnownShare * 100)}% logged`, `${Math.round(effortKnownShare * 100)}% записано`), signal: effortKnownShare == null ? 'unknown' : effortKnownShare >= 0.6 ? 'positive' : 'neutral' });
  const bw = current.bodyWeight7d != null && previous?.bodyWeight7d != null ? Math.round((current.bodyWeight7d - previous.bodyWeight7d) * 10) / 10 : null;
  // Body weight is context, not proof: slowly rising or stable is compatible with growth; it never decides alone.
  ind.push({ id: 'body_weight', value: bw == null ? '—' : L(`${bw > 0 ? '+' : ''}${bw} kg / 4 wk`, `${bw > 0 ? '+' : ''}${num(bw)} кг / 4 нед.`), signal: bw == null ? 'unknown' : bw >= -0.5 ? 'neutral' : 'negative' });
  const waist = current.waistCm != null && previous?.waistCm != null ? Math.round((current.waistCm - previous.waistCm) * 10) / 10 : null;
  ind.push({ id: 'circumference', value: waist == null ? '—' : L(`waist ${waist > 0 ? '+' : ''}${waist} cm`, `талия ${waist > 0 ? '+' : ''}${num(waist)} см`), signal: 'unknown' });
  const photos = data.photos.filter((p) => p.kind === 'progress' && (p.takenAt ?? '').slice(0, 10) >= addDays(today, -35)).length;
  ind.push({ id: 'photos', value: L(`${photos} in 5 wk`, `${photos} за 5 нед.`), signal: photos > 0 ? 'neutral' : 'unknown' });

  let status: HypertrophyStatus;
  if (phase === 'baseline') status = 'establishing_baseline';
  else if (phase === 'early') status = 'too_early';
  else {
    const pos = ind.filter((i) => i.signal === 'positive').length;
    const neg = ind.filter((i) => i.signal === 'negative').length;
    const known = ind.filter((i) => i.signal !== 'unknown').length;
    status = known < 3 ? 'insufficient_data' : ind[0].signal === 'positive' && pos >= 3 && neg === 0 ? 'consistent_positive_signals' : pos > 0 && neg > 0 ? 'mixed_signals' : 'no_clear_signals';
  }
  return { phase, week, status, confidence: phase === 'assessment' && ok.length >= 3 ? 'moderate' : 'low', indicators: ind, nextCheck };
}
