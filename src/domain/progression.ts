import { isShortRest } from './rest';
import { defaultIncrement } from './increments';
import { diffDays } from './dates';
import type { Registry } from './registry';
import { benchmarkExclusion, exclusionLabel, techniqueOf } from './feedback';
import { failureImpliedRir } from './failure';
import { loadStep, type IncrementSource } from './increments';
import { L, byLang, num as nf, ruPlural } from '../i18n/core';
import { measuredDrop, preloadFactor, preloadFor, PRELOAD_DEFAULT_DROP, SAME_CONTEXT_MIN, type CompareBasis, type PreloadBucket } from './preload';
import type { Effort, Equipment, EquipmentKind, ExerciseDef, ExerciseOverride, FailureStatus, Location, SetFeel, Side, Technique, Variation, Workout, WorkoutExercise } from './types';

/**
 * Progression is tracked per (exercise × equipment instance). Loads from two different
 * machines are NEVER compared. Unidentified machines are kept separate per location.
 * Free weights without an equipment id share one history ("free weights") because
 * kilograms on barbells/dumbbells are standardised.
 */

const FREE_KINDS: EquipmentKind[] = ['barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band'];

function baseKey(ex: WorkoutExercise, w: Workout, def: ExerciseDef | undefined): string {
  if (ex.equipmentId) return `${ex.exerciseId}::${ex.equipmentId}`;
  if (def && FREE_KINDS.includes(def.equipmentKind)) return `${ex.exerciseId}::free`;
  return `${ex.exerciseId}::unidentified@${w.locationId ?? 'unknown'}`;
}

const VALUE_LABEL: Record<string, string> = byLang(() => ({
  straight_bar: L('straight bar', 'прямая рукоять'), rope: L('rope', 'канат'), v_bar: L('V-bar', 'V-рукоять'), single_handle: L('single handle', 'одиночная рукоять'), cuff: L('ankle/wrist cuff', 'манжета'),
  standing: L('standing', 'стоя'), seated: L('seated', 'сидя'), straight: L('straight legs', 'прямые ноги'), bent: L('bent knees', 'согнутые колени'), shoulder: L('shoulder-width', 'на ширине плеч'), wide: L('wide', 'широкий'), narrow: L('narrow', 'узкий'),
  pronated: L('pronated grip', 'хват сверху'), supinated: L('supinated grip', 'хват снизу'), neutral: L('neutral grip', 'нейтральный хват'), mixed: L('mixed grip', 'разнохват'),
  simultaneous: L('simultaneous', 'одновременно'), alternating: L('alternating', 'поочерёдно'),
  above_parallel: L('above parallel', 'выше параллели'), parallel: L('parallel', 'до параллели'), below_parallel: L('below parallel', 'ниже параллели'),
  high_bar: L('high bar', 'гриф высоко'), low_bar: L('low bar', 'гриф низко'),
}));
/** A load for a Russian sentence: decimal comma, "?" when unknown. */
const ruKg = (x: number | null | undefined): string => (x == null ? '?' : nf(x));
export const humanize = (v: string) => VALUE_LABEL[v] ?? v.replace(/_/g, ' ');

/**
 * Configuration parts that make loads NOT comparable, so they start their own history:
 * exact bench angle (angle-sensitive exercises — the owner wants 15°/30°/45° kept apart),
 * cable attachment, one side at a time (only for exercises offering that choice), standing vs
 * seated, straight vs bent legs. Apart from the bench angle these fields did not exist before
 * v1.1, so older entries keep their key; an older entry that DID record an angle moves to that
 * angle's history, and entries without an angle form an "angle not recorded" history.
 * Grip is deliberately not part of the key (it was optional on every exercise and recorded
 * inconsistently, so keying on it would fragment existing histories).
 */
export function variationParts(v: Variation | undefined, def: ExerciseDef | undefined): { key: string; label: string }[] {
  if (!v) return [];
  const parts: { key: string; label: string }[] = [];
  if (def?.angleSensitive && v.benchAngleDeg != null && Number.isFinite(v.benchAngleDeg)) {
    const a = Math.round(v.benchAngleDeg);
    parts.push({ key: `angle=${a}`, label: a === 0 ? L('flat', 'горизонтально') : `${a}°` });
  }
  if (v.attachment) parts.push({ key: `att=${v.attachment}`, label: humanize(v.attachment) });
  if (v.unilateral && def?.variationFields?.includes('unilateral')) parts.push({ key: 'uni', label: L('one side at a time', 'по одной стороне') });
  if (v.position) parts.push({ key: `pos=${v.position}`, label: humanize(v.position) });
  if (v.legs) parts.push({ key: `legs=${v.legs}`, label: humanize(v.legs) });
  // Pull-ups (v1.4): bodyweight vs weighted and grip width each start their own history (owner's request).
  // Only exercises that offer these choices; entries logged before keep the "not recorded" history.
  if (v.loading && def?.variationFields?.includes('loading')) parts.push({ key: `load=${v.loading}`, label: v.loading === 'weighted' ? L('weighted', 'с отягощением') : L('bodyweight', 'свой вес') });
  if (v.gripWidth && def?.variationFields?.includes('loading') && def.variationFields.includes('gripWidth')) parts.push({ key: `gw=${v.gripWidth}`, label: L(`${humanize(v.gripWidth)} grip`, v.gripWidth === 'shoulder' ? 'хват на ширине плеч' : `${humanize(v.gripWidth)} хват`) });
  return parts;
}

/**
 * History key: exercise × equipment instance (× configuration). Loads from two machines, or
 * from two configurations of one exercise (e.g. 15° vs 45° incline), are never compared.
 */
export function progressionKey(ex: WorkoutExercise, w: Workout, def: ExerciseDef | undefined): string {
  const parts = variationParts(effectiveVariation(ex, def), def);
  const base = baseKey(ex, w, def);
  return parts.length ? `${base}|${parts.map((p) => p.key).join('|')}` : base;
}

/**
 * Variation used for the history key. Exercises that offer bodyweight vs weighted (pull-ups) but have
 * no `loading` recorded (older entries, imports that did not state it) derive it from the logged
 * working loads — any added load → weighted, otherwise bodyweight — so logged and imported sessions
 * of the same thing share one history. Stored data is never changed.
 */
export function effectiveVariation(ex: WorkoutExercise, def: ExerciseDef | undefined): Variation | undefined {
  if (!def?.variationFields?.includes('loading') || ex.variation?.loading) return ex.variation;
  const work = ex.sets.filter((s) => s.type !== 'warmup' && !s.planned);
  if (!work.length) return ex.variation;
  const loading = work.some((s) => (s.weightKg ?? 0) > 0 && s.loadMode !== 'assisted') ? 'weighted' : 'bodyweight';
  return { ...(ex.variation ?? {}), loading };
}

export interface SetPoint {
  weight: number | null;
  reps: number | null;
  rir: number | null;
  /** Unilateral sets logged per side. */
  side?: Side;
  feel?: SetFeel;
  effort?: Effort;
  technique?: Technique;
  /** Rest before this set (seconds), if known. */
  restSec?: number | null;
  /** Failure status as recorded (v1.3). Absent = not recorded. */
  failure?: FailureStatus;
  /** The set ended because technique gave out (never a benchmark). */
  technicalFailure?: boolean;
  /** Used to judge progression? (false for wrong weight, pain, compromised technique). */
  benchmark: boolean;
  /** Why it is not a benchmark. */
  excluded?: string;
}

export interface SessionPerf {
  workoutId: string;
  date: string;
  /** Every performed working set, as recorded (also the non-benchmark ones). */
  sets: SetPoint[];
  /** Top set among BENCHMARK sets (falls back to all sets for display when none qualify). */
  topWeight: number | null;
  topReps: number | null;
  topRir: number | null;
  /** RIR-adjusted Epley estimate from benchmark sets. Index for THIS equipment only, not a true 1RM. */
  e1rm: number | null;
  /** Generic performance index (e1rm for loaded sets; reps+RIR for bodyweight), rounded to 0.1 for display. null = not representative. */
  index: number | null;
  /** The same index unrounded — used for percentages so display rounding never shifts a result. */
  indexRaw: number | null;
  /**
   * 'load' = RIR-adjusted Epley on the logged load; 'system' = Epley on body weight + added load (weighted
   * pull-ups / dips with a belt, body weight known before the session — an estimate); 'reps' = reps + RIR
   * (bodyweight only / assisted). Different kinds are never compared with each other.
   */
  indexKind: 'load' | 'system' | 'reps' | null;
  /** At least one benchmark set — the session can be used to judge progress. */
  representative: boolean;
  totalReps: number;
  volumeLoad: number;
  avgRir: number | null;
  rirKnownRatio: number;
  restAvgSec: number | null;
  /** Session logged with high fatigue (≥ 4/5) or short sleep (< 6 h). */
  fatigued: boolean;
  /**
   * Part 6 (F.8): fractional sets already done in that session for this exercise's primary muscle before its
   * first set, and the context that follows from it (fresh < 2 ≤ pre-loaded). Absent = not computed.
   */
  preload?: number;
  context?: PreloadBucket;
}

export type TrendClass = 'progressing' | 'stable' | 'plateau' | 'declining' | 'insufficient_data';

export interface Trend {
  cls: TrendClass;
  evidence: string;
  relSlopePerSession: number | null;
  sessionsUsed: number;
}

export interface NextLoad {
  action: 'increase' | 'hold' | 'reduce' | 'calibrate';
  weight: number | null;
  repTarget: [number, number];
  rirTarget: number;
  increment: number;
  reason: string;
}

export interface ProgressionSeries {
  key: string;
  exerciseId: string;
  equipmentId: string | null;
  scopeLabel: string;
  /** Configuration this history is for (e.g. "30°", "rope"), or null when none was recorded. */
  variantLabel: string | null;
  loadMode: string;
  /** Gym of the most recent session in this history (used for per-gym dumbbell jumps). */
  locationId: string | null;
  /** Where the load step (`next.increment`) came from. */
  incrementSource: IncrementSource;
  sessions: SessionPerf[];
  trend: Trend;
  best: { e1rm: number | null; weight: number | null; reps: number | null; date: string | null };
  current: SessionPerf | null;
  previous: SessionPerf | null;
  next: NextLoad;
  /**
   * Part 6 (F.7): what the index of THIS history is built from. 'rir' = reps + logged reps in reserve (every
   * scored session has RIR on its top set); 'reps' = weight and reps only (some session has none, so adding
   * RIR to the others would fake a change). One basis for all sessions of a history.
   */
  indexBasis: 'rir' | 'reps';
  /** Basis of the trend and the load decision (over the trend window; Part 7 G.1 #3). */
  trendBasis?: 'rir' | 'reps';
  /**
   * Part 6 (F.8): how trend and load decisions compared the sessions. single_context = the order never
   * differed; same_context = only sessions of the latest session's context (≥ 3 of them); adjusted = all
   * sessions, pre-loaded ones normalised by `dropPerSet` per pre-loading set.
   */
  compare: { basis: CompareBasis; context: PreloadBucket; dropPerSet: number | null };
}

export function epley(weight: number, reps: number, rir: number | null): number {
  const r = Math.min(reps + (rir ?? 0), 30);
  return weight * (1 + r / 30);
}

function pickTop(sets: SetPoint[], assisted: boolean, extraKg = 0, useRir = true): { top: SetPoint | null; bestE: number | null } {
  let top: SetPoint | null = null;
  let bestE: number | null = null;
  const rirOf = (s: SetPoint) => (useRir ? s.rir ?? 0 : 0);
  for (const s of sets) {
    if (s.reps == null) continue;
    if (!assisted && s.weight != null && s.weight > 0) {
      const e = epley(s.weight + extraKg, s.reps, useRir ? s.rir : null);
      if (bestE == null || e > bestE) {
        bestE = e;
        top = s;
      }
    }
  }
  if (!top) {
    // Bodyweight / assisted / unloaded: best reps (+RIR) is the performance index.
    for (const s of sets) if (s.reps != null && (!top || (s.reps + rirOf(s)) > ((top.reps ?? 0) + rirOf(top)))) top = s;
  }
  return { top, bestE };
}

/**
 * @param bodyKg body weight before this session (bodyweight-plus exercises only). With a belt/vest the
 * index then uses body + added load, so 5 kg × 8 → 7.5 kg × 6 reads as a small change, not "+42 %".
 */
export function sessionPerf(w: Workout, ex: WorkoutExercise, useFeel = true, bodyKg: number | null = null, basis: 'rir' | 'reps' = 'rir'): SessionPerf | null {
  const working = ex.sets.filter((s) => s.type === 'working' && !s.planned);
  if (!working.length) return null;
  const sets: SetPoint[] = working.map((s) => {
    const excluded = benchmarkExclusion(s);
    return {
      // Clean muscular failure without a logged RIR is valid performance at ≈ RIR 0 (index only; RIR is not stored).
      weight: s.weightKg, reps: s.reps, rir: s.rir ?? (s.toFailure ? 0 : failureImpliedRir(s)),
      ...(s.side ? { side: s.side } : {}),
      ...(s.feel ? { feel: s.feel } : {}),
      ...(s.effort && useFeel ? { effort: s.effort } : {}),
      ...(techniqueOf(s) ? { technique: techniqueOf(s) } : {}),
      ...(s.failure ? { failure: s.failure } : {}),
      ...(s.technicalFailure ? { technicalFailure: true } : {}),
      restSec: s.restSecBefore,
      benchmark: !excluded,
      ...(excluded ? { excluded } : {}),
    };
  });
  const assisted = working.some((s) => s.loadMode === 'assisted');
  const bench = sets.filter((s) => s.benchmark);
  const representative = bench.length > 0;
  const system = !assisted && bodyKg != null && bodyKg > 0 && working.every((s) => s.loadMode === 'bodyweight_plus');
  const useRir = basis === 'rir';
  const { top, bestE } = pickTop(representative ? bench : sets, assisted, system ? (bodyKg as number) : 0, useRir);
  const totalReps = sets.reduce((a, s) => a + (s.reps ?? 0), 0);
  const volumeLoad = sets.reduce((a, s) => a + (s.reps ?? 0) * (s.weight ?? 0), 0);
  const rirs = sets.map((s) => s.rir).filter((r): r is number => r != null);
  const rests = working.slice(1).map((s) => s.restSecBefore).filter((r): r is number => r != null && r > 0);
  const index = !representative ? null : bestE != null ? bestE : top?.reps != null ? top.reps + (useRir ? top.rir ?? 0 : 0) : null;
  const well = w.wellness;
  return {
    workoutId: w.id,
    date: w.date,
    sets,
    topWeight: top?.weight ?? null,
    topReps: top?.reps ?? null,
    topRir: top?.rir ?? null,
    e1rm: representative && bestE != null ? Math.round(bestE * 10) / 10 : null,
    index: index != null ? Math.round(index * 10) / 10 : null,
    indexRaw: index,
    indexKind: index == null ? null : bestE != null ? (system ? 'system' : 'load') : 'reps',
    representative,
    totalReps,
    volumeLoad,
    avgRir: rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null,
    rirKnownRatio: rirs.length / sets.length,
    restAvgSec: rests.length ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length) : null,
    fatigued: (well?.fatigue ?? 0) >= 4 || (well?.sleepHours != null && well.sleepHours < 6),
  };
}

/**
 * Trend over the last ≤ 6 REPRESENTATIVE sessions within 8 weeks (sessions whose sets were all
 * wrong-weight / pain / broken-technique are not comparable and are skipped). A possible plateau
 * needs ≥ 4 comparable sessions over ≥ 3 weeks with no new best in the last two — sessions logged
 * with high fatigue or short sleep are set aside for that decision, so one bad day never makes a plateau.
 */
/** Median of the last 3 sessions this far below the median of the first 3 in the 8-week window → sustained decline (practical heuristic). */
/** Days the trend looks back; also the longest gap between the two sessions of the two-session increase rule. */
export const TREND_WINDOW_DAYS = 56;
export const SUSTAINED_DECLINE = 0.08;
/** A single latest session this far below the usual level is treated as a bad day, not a trend (practical heuristic). */
export const SINGLE_DIP = 0.05;
const medianOf = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** With exactly three sessions: the first two count as level when the second is within this share of the first. */
export const THREE_FLAT = 0.02;

export function classifyTrend(sessions: SessionPerf[], today: string): Trend {
  // Only sessions measured on the same scale as the latest one (kg-based vs reps-based index).
  const scored = sessions.filter((s) => s.index != null);
  const kind = scored.at(-1)?.indexKind ?? null;
  const window = scored.filter((s) => (s.indexKind ?? null) === kind && diffDays(today, s.date) <= TREND_WINDOW_DAYS);
  const recent = window.slice(-6);
  if (recent.length < 3) {
    return {
      cls: 'insufficient_data',
      evidence: L(`${recent.length} comparable session(s) in the last 8 weeks; at least 3 are needed before classifying a trend.`, `Сопоставимых тренировок за последние 8 недель: ${recent.length}; для оценки тренда нужно минимум 3.`),
      relSlopePerSession: null,
      sessionsUsed: recent.length,
    };
  }
  const ys = recent.map((s) => s.index as number);
  const n = ys.length;
  // One bad day is not a trend: a lone latest session clearly below the usual level (the one before it
  // was normal) is set aside, and the trend is judged on the sessions before it.
  // Exactly three sessions (owner 2026-11-25): the first two level (within 2 %) and only the last one clearly lower is
  // one bad day, not a decline — wait for a fourth. A steady fall (100 / 96 / 92) is still read as a decline.
  if (n === 3 && ys[1] >= ys[0] * (1 - THREE_FLAT) && ys[2] < Math.min(ys[0], ys[1]) * (1 - SINGLE_DIP)) {
    const drop = Math.round((1 - ys[2] / Math.min(ys[0], ys[1])) * 1000) / 10;
    return { cls: 'stable', relSlopePerSession: null, sessionsUsed: n, evidence: L(`Latest session ${drop}% below the two before it — one session is not a trend; a fourth session will tell.`, `Последняя тренировка на ${nf(drop)}% ниже двух предыдущих — одна тренировка не тренд; покажет четвёртая.`) };
  }
  if (n >= 4) {
    const usual = medianOf(ys.slice(0, -1));
    // Clearly below the usual level, or ≥ 5 % below the session just before it while under the usual level.
    const dip = ys[n - 1] < usual * (1 - SINGLE_DIP) || (ys[n - 1] < ys[n - 2] * (1 - SINGLE_DIP) && ys[n - 1] < usual);
    if (dip && ys[n - 2] >= usual * (1 - SINGLE_DIP)) {
      const prior = classifyTrend(sessions.filter((s) => s !== recent[n - 1]), today);
      const drop = Math.round((1 - ys[n - 1] / usual) * 1000) / 10;
      const cls: TrendClass = prior.cls === 'progressing' || prior.cls === 'insufficient_data' ? 'stable' : prior.cls;
      return { ...prior, cls, evidence: L(`Latest session ${drop}% below your usual level (${ys[n - 1]} vs ${usual}) — one session is not a trend; judged on the sessions before it. ${prior.evidence}`, `Последняя тренировка на ${nf(drop)}% ниже вашего обычного уровня (${nf(ys[n - 1])} против ${nf(usual)}) — одна тренировка ещё не тренд; оценка по предыдущим. ${prior.evidence}`) };
    }
  }
  const xm = (n - 1) / 2;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - xm) * (y - ym);
    den += (i - xm) ** 2;
  });
  const slope = den ? num / den : 0;
  const rel = ym ? slope / ym : 0;
  const first = ys[0];
  const last = ys[n - 1];
  const span = diffDays(recent[n - 1].date, recent[0].date);
  const pct = (rel * 100).toFixed(1);
  const base = L(
    `Performance index ${first} → ${last} over ${n} sessions (${span} days), trend ${rel >= 0 ? '+' : ''}${pct}% per session.`,
    `Индекс результата ${nf(first)} → ${nf(last)} за ${n} ${ruPlural(n, 'тренировку', 'тренировки', 'тренировок')} (${span} дн.), тренд ${rel >= 0 ? '+' : ''}${pct.replace('.', ',')}% за тренировку.`,
  );

  if (rel >= 0.01 && last >= first) return { cls: 'progressing', evidence: L(`${base} Consistent upward trend.`, `${base} Устойчивый рост.`), relSlopePerSession: rel, sessionsUsed: n };
  const clean = recent.filter((s) => !s.fatigued);
  const setAside = n - clean.length;
  // A decline needs the last TWO sessions below the first one: one bad day is not a trend.
  if (rel <= -0.015 && last < first && ys[n - 2] < first) {
    const tired = recent.slice(-2).some((s) => s.fatigued);
    return { cls: 'declining', evidence: L(`${base} Recent sessions are below earlier ones — ${tired ? 'the latest session(s) were logged with high fatigue or short sleep, so this may be temporary; ' : ''}check fatigue, sleep, rest periods or exercise order before changing the load.`, `${base} Последние тренировки слабее предыдущих — ${tired ? 'последние записаны при сильной усталости или коротком сне, так что это может быть временно; ' : ''}прежде чем менять вес, проверьте усталость, сон, отдых между подходами и порядок упражнений.`), relSlopePerSession: rel, sessionsUsed: n };
  }
  // Sustained decline: across the 8-week window (≥ 6 sessions) the median of the last 3 sessions is
  // ≥ 8 % below the median of the first 3, and every one of the last 3 is below all of the first 3.
  // Catches slow declines that a 6-session slope reads as "stable".
  if (window.length >= 6) {
    const last3 = window.slice(-3).map((s) => s.index as number);
    const first3 = window.slice(0, 3).map((s) => s.index as number);
    const ref = medianOf(first3);
    if (ref > 0 && medianOf(last3) <= ref * (1 - SUSTAINED_DECLINE) && Math.max(...last3) < Math.min(...first3)) {
      const drop = Math.round((1 - medianOf(last3) / ref) * 1000) / 10;
      const tired = window.slice(-3).some((s) => s.fatigued);
      return { cls: 'declining', evidence: L(`Performance index ${ref} (first 3 of ${window.length} sessions in 8 weeks) → ${medianOf(last3)} (last 3): −${drop}%. ${tired ? 'Some of these sessions were logged with high fatigue or short sleep. ' : ''}Check fatigue, sleep, rest periods, technique and exercise order before changing the load.`, `Индекс результата ${nf(ref)} (первые 3 из ${window.length} тренировок за 8 недель) → ${nf(medianOf(last3))} (последние 3): −${nf(drop)}%. ${tired ? 'Часть этих тренировок записана при сильной усталости или коротком сне. ' : ''}Прежде чем менять вес, проверьте усталость, сон, отдых между подходами, технику и порядок упражнений.`), relSlopePerSession: rel, sessionsUsed: window.length };
    }
  }
  if (clean.length >= 4) {
    const cy = clean.map((s) => s.index as number);
    const cspan = diffDays(clean[clean.length - 1].date, clean[0].date);
    const bestEarlier = Math.max(...cy.slice(0, cy.length - 2));
    const bestLate = Math.max(cy[cy.length - 1], cy[cy.length - 2]);
    // A higher working load in the last two sessions is progress (double progression did its job), even when the
    // index has not caught up yet (Epley rates 52.5 × 10 like 50 × 12). Assistance loads are left out (lower = harder).
    const loads = clean.map((s) => (s.indexKind === 'load' ? s.topWeight : null));
    const earlierTop = Math.max(...loads.slice(0, -2).map((x) => x ?? -Infinity));
    const lateIdx = clean.slice(-2).map((s) => s.index as number);
    const loadUp = loads.slice(-2).some((x, k) => x != null && x > earlierTop && lateIdx[k] >= bestEarlier * 0.97);
    if (cspan >= 21 && bestLate <= bestEarlier && !loadUp) {
      return {
        cls: 'plateau',
        evidence: L(`${base} No new best in the last 2 comparable sessions across ≥ 3 weeks${setAside ? ` (${setAside} session(s) with high fatigue or short sleep set aside)` : ''} — a possible plateau, not yet certain. Before adding volume or changing the exercise, check the working weight, rest periods, technique, effort (RIR) and recovery.`, `${base} В 2 последних сопоставимых тренировках за ≥ 3 недели нет нового рекорда${setAside ? ` (тренировки при сильной усталости или коротком сне не учитывались: ${setAside})` : ''} — возможно, плато, но это ещё не точно. Прежде чем добавлять объём или менять упражнение, проверьте рабочий вес, отдых между подходами, технику, усилие (RIR) и восстановление.`),
        relSlopePerSession: rel,
        sessionsUsed: clean.length,
      };
    }
  }
  return { cls: 'stable', evidence: L(`${base} Performance is broadly stable${setAside ? ` (${setAside} fatigued session(s) noted)` : ''}.`, `${base} Результат в целом стабилен${setAside ? ` (тренировок при усталости: ${setAside})` : ''}.`), relSlopePerSession: rel, sessionsUsed: n };
}

export function roundToIncrement(w: number, inc: number): number {
  if (!inc || inc <= 0) return Math.round(w * 2) / 2;
  return Math.round(Math.round(w / inc) * inc * 100) / 100;
}

/**
 * One load step. Snaps to the increment grid only when the current load is already on it —
 * 25 kg dumbbells + 2 kg must give 27 kg, not 28 (rounding 27 to the 2-kg grid).
 */
export function stepLoad(w: number, step: number, inc: number): number {
  const onGrid = inc > 0 && Math.abs(w / inc - Math.round(w / inc)) < 1e-6;
  const raw = w + step;
  return Math.max(0, onGrid ? roundToIncrement(raw, inc) : Math.round(raw * 100) / 100);
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Rest interpretation: when reps fell at the same weight within the last session AND the rest
 * before the weaker set was clearly shorter than usual for this exercise (< 70 % of the median),
 * the drop is attributed to rest — not to the weight being too heavy.
 */
export function restInsight(sessions: SessionPerf[]): string | null {
  const last = sessions[sessions.length - 1];
  if (!last) return null;
  const typical = median(sessions.flatMap((s) => s.sets.slice(1).map((p) => p.restSec).filter((r): r is number => r != null && r > 0)));
  if (typical == null) return null;
  const first = last.sets.find((p) => p.benchmark && p.reps != null);
  if (!first) return null;
  for (const p of last.sets.slice(1)) {
    if (!p.benchmark || p.weight !== first.weight || p.reps == null || p.restSec == null || p.restSec <= 0) continue;
    if (first.reps! - p.reps >= 2 && isShortRest(p.restSec, typical)) {
      return L(`Reps fell from ${first.reps} to ${p.reps} at ${p.weight} kg after a shorter rest (${p.restSec} s vs your usual ~${Math.round(typical)} s) — likely the short rest, not a weight that is too heavy.`, `Повторения упали с ${first.reps} до ${p.reps} при ${ruKg(p.weight)} кг после более короткого отдыха (${p.restSec} с против обычных ~${Math.round(typical)} с) — вероятно, дело в коротком отдыхе, а не в слишком большом весе.`);
    }
  }
  return null;
}

/**
 * Next-session suggestion (double progression with the owner's set feedback):
 * - Representative (benchmark) sets only: accidental wrong weights, pain and broken technique are
 *   kept in the history but never prove progress.
 * - INCREASE when all working sets at the working load reach the top of the rep range in TWO
 *   consecutive sessions no more than 56 days apart (since Part 6, F.7, the reps are the evidence — no
 *   effort answer is needed) — or in ONE session when every set (at least two) was clearly too light
 *   (RIR ≥ target + 2, or felt "too easy"; "a little too easy" alone is not enough).
 * - REDUCE when technique broke down on at least half of the last session's sets at the working load
 *   (not because a set was merely hard: "very hard, good technique" is a good set), or when most sets
 *   fell below the range while the trend is declining.
 * - Otherwise KEEP and add reps. A single good set never triggers an increase.
 */
export function suggestNextLoad(
  sessions: SessionPerf[],
  repRange: [number, number],
  rirTarget: number,
  increment: number,
  trend: Trend,
  loadMode = 'total',
): NextLoad {
  const [lo, hi] = repRange;
  const base = { repTarget: repRange, rirTarget, increment };
  const lastAny = sessions[sessions.length - 1];
  if (!lastAny) return { ...base, action: 'calibrate', weight: null, reason: L('No history on this equipment yet. Pick a load you can lift for the rep range with ~2–3 RIR and record RIR (or how the set felt) to calibrate.', 'На этом оборудовании пока нет истории. Выберите вес, с которым выполните диапазон повторений с запасом ~2–3 повтора (RIR), и записывайте RIR (или ощущение от подхода) для калибровки.') };
  const assisted = loadMode === 'assisted';
  const step = assisted ? -increment : increment;
  const loadOf = (pts: SetPoint[]): number | null => {
    const ws = pts.filter((p) => p.weight != null && p.reps != null).map((p) => p.weight as number);
    if (!ws.length) return null;
    return assisted ? Math.min(...ws) : Math.max(...ws);
  };

  // 1) Technique broke down on at least half of the session's intended sets → reduce (scenario "too heavy").
  //    Target = one step down from the load that broke (or a clean load from that session if it is closer).
  const intended = lastAny.sets.filter((p) => !(p.excluded ?? '').startsWith('wrong weight') && p.weight != null && p.reps != null);
  const broken = intended.filter((p) => p.technique === 'compromised' || p.technique === 'failed');
  let brokeNote: string | null = null;
  if (broken.length) {
    const brokeAt = loadOf(broken) as number;
    const cleanLoad = loadOf(intended.filter((p) => p.benchmark));
    // Part 6 (F.7): one subjective answer never changes the load. A reduction needs technique trouble on ≥ 2 sets,
    // OR the numbers confirming it (a set at that load under the bottom of the range), OR the same in the
    // session before.
    const prevAny = sessions[sessions.length - 2];
    const prevIntended = prevAny ? prevAny.sets.filter((p) => !(p.excluded ?? '').startsWith('wrong weight') && p.weight != null && p.reps != null) : [];
    const prevBroken = prevIntended.filter((p) => p.technique === 'compromised' || p.technique === 'failed');
    const repeated = prevBroken.length > 0 && prevBroken.length >= Math.ceil(prevIntended.length / 2);
    const underRange = intended.some((p) => p.weight === brokeAt && (p.reps as number) < lo);
    const confirmedTrouble = broken.length >= 2 || underRange || repeated;
    if (broken.length >= Math.ceil(intended.length / 2) && confirmedTrouble) {
      // About ONE step down: back to a clean load from the same session if it is within ~one step, else one increment.
      const oneStep = stepLoad(brokeAt, -step, increment);
      // (A clean load within ~one step counts: 27.5 → 25 kg when dumbbells come in 2.5 kg pairs but the default step is 2.)
      const reach = Math.abs(step) * 1.5;
      const closerClean = cleanLoad != null && (assisted ? cleanLoad > brokeAt && cleanLoad - brokeAt <= reach : cleanLoad < brokeAt && brokeAt - cleanLoad <= reach);
      const to = closerClean ? (cleanLoad as number) : oneStep;
      return { ...base, action: 'reduce', weight: to, reason: L(`Technique broke down on ${broken.length} of ${intended.length} set${intended.length === 1 ? '' : 's'} last time (at ${brokeAt} kg). Those sets are kept but don't prove progress. ${assisted ? 'Use more assistance' : 'Go back'} to ${to} kg, keep full range and control, and rebuild reps from ~${lo}. (A set that is very hard but clean is fine — this is about technique, not difficulty.)`, `В прошлый раз техника нарушилась в ${broken.length} из ${intended.length} подх. (на ${nf(brokeAt)} кг). Эти подходы сохранены, но прогрессом не считаются. ${assisted ? `Увеличьте помощь до ${nf(to)} кг` : `Вернитесь к ${nf(to)} кг`}, держите полную амплитуду и контроль и набирайте повторения заново с ~${lo}. (Очень тяжёлый, но чистый подход — это нормально: речь о технике, а не о тяжести.)`) };
    }
    brokeNote = L(
      `${brokeAt} kg broke your technique on ${broken.length} set${broken.length === 1 ? '' : 's'} — not counted as progress yet${broken.length >= Math.ceil(intended.length / 2) ? '; if it happens again next session, the load goes one step down' : ''}.`,
      `На ${nf(brokeAt)} кг техника нарушилась в ${broken.length} подх. — пока не считается прогрессом${broken.length >= Math.ceil(intended.length / 2) ? '; если повторится в следующий раз, вес снизится на один шаг' : ''}.`,
    );
  }

  // 2) Judge progress from representative sessions only.
  const rep = sessions.filter((s) => s.representative);
  const last = rep[rep.length - 1];
  const notes: string[] = [];
  if (lastAny !== last) {
    const why = [...new Set(lastAny.sets.map((p) => p.excluded).filter(Boolean))].map((c) => exclusionLabel(c as string)).join(', ');
    notes.push(L(
      `Last session (${lastAny.date}) is saved but not used as a benchmark (${why || 'not representative'}).`,
      `Последняя тренировка (${lastAny.date}) сохранена, но не используется для сравнения (${why || 'не показательна'}).`,
    ));
  }
  const painLast = lastAny.sets.some((p) => p.excluded === 'pain or unusual discomfort');
  if (painLast) {
    notes.push(L('Pain or unusual discomfort was flagged — do not push the load on a painful movement; if it repeats, stop that movement and consider getting it checked.', 'Отмечена боль или необычный дискомфорт — не повышайте вес в болезненном движении; если это повторится, прекратите это движение и подумайте о том, чтобы показаться специалисту.'));
  }
  if (brokeNote) notes.push(brokeNote);
  const rest = restInsight(rep);
  if (rest) notes.push(rest);
  const tail = notes.length ? ` ${notes.join(' ')}` : '';
  if (!last) {
    return { ...base, action: 'calibrate', weight: null, reason: L(`No representative session yet on this equipment.${tail}`, `На этом оборудовании пока нет показательной тренировки.${tail}`) };
  }
  const prev = rep[rep.length - 2];
  const benchPts = (s: SessionPerf) => s.sets.filter((p) => p.benchmark);
  const workLoad = (s: SessionPerf): number | null => loadOf(benchPts(s)) ?? s.topWeight;
  const w = workLoad(last);
  if (w == null || (loadMode === 'bodyweight_plus' && w === 0)) {
    return { ...base, action: 'hold', weight: w, reason: L(`Bodyweight-based: aim to add reps (top set ${last.topReps ?? '?'} reps). Add load once all sets exceed ${hi} reps.${tail}`, `Со своим весом: старайтесь добавлять повторения (лучший подход — ${last.topReps ?? '?'} повт.). Добавляйте отягощение, когда во всех подходах будет больше ${hi} повт.${tail}`) };
  }
  const atLoad = (s: SessionPerf) => benchPts(s).filter((p) => p.weight === workLoad(s));
  // Effort is "recorded" with a RIR, a feel, or a definite failure answer (muscular / stopped before failure).
  // "Stopped before failure" alone does not say how close the set was, so it is not recorded effort.
  const effortKnown = (p: SetPoint) => p.rir != null || p.effort != null || (p.failure === 'muscular' && !p.technicalFailure);
  // Part 6 (F.7): reps at the top of the range are objective evidence — no effort answer is needed. A set at the
  // working load whose technique broke (kept, but not a benchmark) means the top was not reached cleanly.
  const technique = (p: SetPoint) => !p.benchmark && (p.technique === 'compromised' || p.technique === 'failed' || p.technicalFailure === true);
  // A RAMP (owner 2026-11-25: 40 → 45 → 50 → 55, one set each): every other set is lighter and comes BEFORE the first
  // set at the working load — then the top set(s) alone are the working sets. Otherwise at least half of the sets must
  // be at the working load (a single heavy set among sets at another load is not "the working sets").
  const isRamp = (s: SessionPerf) => {
    const pts = benchPts(s).filter((p) => p.weight != null);
    const w0 = workLoad(s);
    const first = pts.findIndex((p) => p.weight === w0);
    if (first <= 0) return false;
    const lighter = (p: SetPoint) => (assisted ? (p.weight as number) > (w0 as number) : (p.weight as number) < (w0 as number));
    return pts.slice(0, first).every(lighter) && pts.slice(first).every((p) => p.weight === w0);
  };
  const hitsTop = (s: SessionPerf) => {
    const at = atLoad(s);
    return at.length > 0 && (at.length >= Math.ceil(benchPts(s).length / 2) || isRamp(s)) && at.every((p) => (p.reps ?? 0) >= hi) && !s.sets.some(technique);
  };
  // "A little too easy" (≈ 3–4 RIR) is not clearly light on its own — only "too easy" or a logged RIR ≥ target + 2.
  const clearlyLight = (p: SetPoint) => (p.rir != null ? p.rir >= rirTarget + 2 : p.effort === 'very_easy');
  const lastTop = hitsTop(last);
  // "Two sessions in a row" must be close in time: the previous top session counts only inside the trend window
  // (a session months ago says little about today's strength) — otherwise the next session confirms it.
  const prevSame = prev ? hitsTop(prev) && workLoad(prev) === w : false;
  const gapDays = prev ? diffDays(last.date, prev.date) : 0;
  const prevStale = prevSame && gapDays > TREND_WINDOW_DAYS;
  const prevTop = prevSame && !prevStale;
  // One-session shortcut: every set clearly light, on at least TWO sets (one answer is never enough), and the
  // reps did not fall from the first to the last set (a load that is really too light does not fatigue you).
  const lastAt = atLoad(last);
  const tooEasy = lastTop && lastAt.length >= 2 && lastAt.every(clearlyLight) && (lastAt[lastAt.length - 1].reps ?? 0) >= (lastAt[0].reps ?? 0);
  const nextLoad = stepLoad(w, step, increment);

  if (painLast) {
    return { ...base, action: 'hold', weight: w, reason: L(`Keep ${w} kg (no increase after a session with pain).${tail}`, `Оставьте ${nf(w)} кг (после тренировки с болью вес не повышается).${tail}`) };
  }
  if (assisted && w <= 0 && lastTop) {
    return { ...base, action: 'hold', weight: 0, reason: L(`All sets reached ${hi} reps with no assistance. Switch to the unassisted (or weighted) version of the exercise.${tail}`, `Все подходы достигли ${hi} повт. без помощи. Переходите к варианту без помощи (или с отягощением).${tail}`) };
  }
  if (tooEasy) {
    return { ...base, action: 'increase', weight: nextLoad, reason: L(`Every set at ${w} kg reached ${hi} reps and was clearly too light (${rirTarget + 2}+ reps in reserve, or felt too easy) — those sets earn reduced effort credit. ${assisted ? 'Reduce assistance' : 'Add the smallest increment'} (${increment} kg) to ${nextLoad} kg now and rebuild reps from ~${lo}.${tail}`, `Каждый подход с ${nf(w)} кг достиг ${hi} повт. и был явно слишком лёгким (${rirTarget + 2}+ повторов в запасе или ощущение «слишком легко») — такие подходы засчитываются с пониженным усилием. ${assisted ? 'Уменьшите помощь' : 'Добавьте минимальный шаг'} (${nf(increment)} кг) — до ${nf(nextLoad)} кг уже сейчас — и набирайте повторения заново с ~${lo}.${tail}`) };
  }
  if (lastTop && prevTop) {
    return { ...base, action: 'increase', weight: nextLoad, reason: L(`All working sets reached ${hi} reps in the last two comparable sessions at ${w} kg. ${assisted ? 'Reduce assistance' : 'Add the smallest available increment'} (${increment} kg) to ${nextLoad} kg and rebuild reps from ~${lo}.${tail}`, `Все рабочие подходы достигли ${hi} повт. в двух последних сопоставимых тренировках с ${nf(w)} кг. ${assisted ? 'Уменьшите помощь' : 'Добавьте минимальный доступный шаг'} (${nf(increment)} кг) — до ${nf(nextLoad)} кг — и набирайте повторения заново с ~${lo}.${tail}`) };
  }
  if (lastTop && prevStale) {
    return { ...base, action: 'hold', weight: w, reason: L(
      `Top of the range (${hi}) reached at ${w} kg now and ${gapDays} days ago — too far apart to count as two sessions in a row. Confirm it next session before increasing.${tail}`,
      `Верх диапазона (${hi}) при ${nf(w)} кг достигнут сейчас и ${gapDays} дн. назад — перерыв слишком большой, чтобы считать это двумя тренировками подряд. Подтвердите в следующий раз, затем повышайте вес.${tail}`,
    ) };
  }
  if (lastTop && !prevTop) {
    return { ...base, action: 'hold', weight: w, reason: L(`Top of the range (${hi}) reached once at ${w} kg. Confirm it next session before increasing — one good session is not enough evidence.${tail}`, `Верх диапазона (${hi}) достигнут один раз при ${nf(w)} кг. Подтвердите в следующий раз, затем повышайте вес — одной удачной тренировки недостаточно.${tail}`) };
  }
  const belowLo = benchPts(last).filter((p) => (p.reps ?? 0) < lo).length;
  if (belowLo > benchPts(last).length / 2 && trend.cls === 'declining' && !rest) {
    return { ...base, action: 'reduce', weight: stepLoad(w, -step, increment), reason: L(`Most sets fell below ${lo} reps and the trend is declining across comparable sessions. A one-step reduction (or checking recovery and rest) may restore quality reps.${tail}`, `В большинстве подходов меньше ${lo} повт., и тренд по сопоставимым тренировкам снижается. Снижение на один шаг (или проверка восстановления и отдыха) может вернуть качественные повторения.${tail}`) };
  }
  if (benchPts(last).every((p) => !effortKnown(p))) {
    return { ...base, action: 'hold', weight: w, reason: L(`Keep ${w} kg and aim for +1 rep per set; the load goes up once every set reaches ${hi} reps in two sessions in a row.${tail}`, `Оставьте ${nf(w)} кг и старайтесь добавлять по 1 повторению в подходе; вес повысится, когда каждый подход достигнет ${hi} повт. в двух тренировках подряд.${tail}`) };
  }
  return { ...base, action: 'hold', weight: w, reason: L(`Keep ${w} kg and add reps toward ${hi} on every working set (last top set: ${last.topReps ?? '?'} reps${last.topRir != null ? ` @ RIR ${last.topRir}` : ''}).${tail}`, `Оставьте ${nf(w)} кг и добавляйте повторения до ${hi} в каждом рабочем подходе (лучший подход в прошлый раз: ${last.topReps ?? '?'} повт.${last.topRir != null ? ` при RIR ${last.topRir}` : ''}).${tail}`) };
}

/** The one recommendation shown per exercise. */
export type AdviceKind = 'increase' | 'keep' | 'reduce' | 'plateau' | 'not_enough_data';
export interface Advice {
  kind: AdviceKind;
  label: string;
  text: string;
}
export const ADVICE_LABEL: Record<AdviceKind, string> = byLang(() => ({ increase: L('Increase weight', 'Повысить вес'), keep: L('Keep weight', 'Оставить вес'), reduce: L('Reduce weight', 'Снизить вес'), plateau: L('Possible plateau', 'Возможное плато'), not_enough_data: L('Not enough data', 'Мало данных') }));

export function adviceFor(p: Pick<ProgressionSeries, 'next' | 'trend' | 'sessions'>): Advice {
  const n = p.next;
  const from = p.sessions.filter((s) => s.representative).slice(-1)[0];
  const fromW = from ? from.sets.filter((x) => x.benchmark && x.weight != null).reduce<number | null>((m, x) => (m == null || (x.weight as number) > m ? (x.weight as number) : m), null) : null;
  if (n.action === 'increase') return { kind: 'increase', label: ADVICE_LABEL.increase, text: L(`${fromW != null && n.weight != null ? `${fromW} → ${n.weight} kg. ` : ''}${n.reason}`, `${fromW != null && n.weight != null ? `${nf(fromW)} → ${nf(n.weight)} кг. ` : ''}${n.reason}`) };
  if (n.action === 'reduce') return { kind: 'reduce', label: ADVICE_LABEL.reduce, text: n.reason };
  if (n.action === 'calibrate' || p.trend.cls === 'insufficient_data') {
    return { kind: 'not_enough_data', label: ADVICE_LABEL.not_enough_data, text: L(`${p.trend.sessionsUsed} comparable session(s) so far — more are needed for a reliable trend. Meanwhile: ${n.reason}`, `Сопоставимых тренировок пока ${p.trend.sessionsUsed} — для надёжного тренда нужно больше. А пока: ${n.reason}`) };
  }
  if (p.trend.cls === 'plateau') return { kind: 'plateau', label: ADVICE_LABEL.plateau, text: L(`${p.trend.evidence} For now: ${n.reason}`, `${p.trend.evidence} Пока: ${n.reason}`) };
  return { kind: 'keep', label: ADVICE_LABEL.keep, text: n.reason };
}

/** Per-load calibration from the owner's feedback (this exercise × equipment × configuration only). */
export interface LoadFeel {
  weight: number;
  sets: number;
  counts: Partial<Record<SetFeel, number>>;
  verdict: 'too_easy' | 'right' | 'too_heavy' | 'mixed' | 'no_feedback';
  lastDate: string;
}

export function loadMap(p: Pick<ProgressionSeries, 'sessions'>): LoadFeel[] {
  const m = new Map<number, LoadFeel>();
  for (const s of p.sessions) for (const x of s.sets) {
    // A weight picked by accident says nothing about how the intended load feels.
    if (x.weight == null || (x.excluded ?? '').startsWith('wrong weight')) continue;
    const e = m.get(x.weight) ?? { weight: x.weight, sets: 0, counts: {}, verdict: 'no_feedback' as const, lastDate: s.date };
    e.sets++;
    e.lastDate = s.date;
    if (x.feel) e.counts[x.feel] = (e.counts[x.feel] ?? 0) + 1;
    m.set(x.weight, e);
  }
  for (const e of m.values()) {
    const c = e.counts;
    const easy = (c.too_easy ?? 0) + (c.bit_easy ?? 0);
    const right = (c.just_right ?? 0) + (c.hard_good ?? 0);
    const heavy = c.too_heavy_form ?? 0;
    const rated = easy + right + heavy; // wrong-weight and pain answers say nothing about the load itself
    if (!rated) e.verdict = 'no_feedback';
    else if (right / rated >= 0.6) e.verdict = 'right';
    else if (easy / rated >= 0.6) e.verdict = 'too_easy';
    else if (heavy / rated >= 0.6) e.verdict = 'too_heavy';
    else e.verdict = 'mixed';
  }
  return [...m.values()].sort((a, b) => a.weight - b.weight);
}

export function buildProgression(
  workouts: Workout[],
  registry: Registry,
  equipment: Equipment[],
  overrides: ExerciseOverride[],
  defaultRir: number,
  today: string,
  /** Settings → "Use how the set felt when no RIR was logged". Off = effort from feel is ignored here too. */
  useFeel = true,
  /** Gyms, so dumbbell / kettlebell jumps set per gym apply (Location.freeWeightIncrementsKg). */
  locations: Location[] = [],
  /** Body weight before a session (latest weigh-in before it started), for belt/vest exercises. */
  bodyKg: (w: Workout) => number | null = () => null,
): ProgressionSeries[] {
  const locById = new Map(locations.map((l) => [l.id, l]));
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const ovById = new Map(overrides.map((o) => [o.id, o]));
  const groups = new Map<string, { exerciseId: string; equipmentId: string | null; loadMode: string; sessions: SessionPerf[]; src: { w: Workout; ex: WorkoutExercise; body: number | null }[]; scope: string; variant: string | null; locationId: string | null }>();
  const sorted = [...workouts].sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  for (const w of sorted) {
    for (const ex of w.exercises) {
      const def = registry.get(ex.exerciseId);
      const key = progressionKey(ex, w, def);
      const body = (def?.equipmentKind === 'bodyweight' || ex.sets.some((s) => s.loadMode === 'bodyweight_plus')) ? bodyKg(w) : null;
      const perf = sessionPerf(w, ex, useFeel, body);
      if (!perf) continue;
      const ctx = preloadFor(w, ex, registry);
      perf.preload = ctx.sets;
      perf.context = ctx.bucket;
      let g = groups.get(key);
      if (!g) {
        const eq = ex.equipmentId ? eqById.get(ex.equipmentId) : undefined;
        const base = baseKey(ex, w, def);
        const scope = eq ? eq.name : base.endsWith('::free') ? (def?.equipmentKind === 'bodyweight' ? L('Bodyweight', 'Свой вес') : L('Free weights', 'Свободные веса')) : L('Unidentified equipment', 'Неопознанное оборудование');
        const parts = variationParts(effectiveVariation(ex, def), def);
        g = { exerciseId: ex.exerciseId, equipmentId: ex.equipmentId, loadMode: ex.sets.find((s) => s.type === 'working')?.loadMode ?? 'total', sessions: [], src: [], scope, variant: parts.length ? parts.map((p) => p.label).join(' · ') : null, locationId: null };
        groups.set(key, g);
      }
      g.sessions.push(perf);
      g.src.push({ w, ex, body });
      g.locationId = w.locationId ?? null;
    }
  }
  const out: ProgressionSeries[] = [];
  for (const [key, g] of groups) {
    const def = registry.get(g.exerciseId);
    const ov = ovById.get(g.exerciseId);
    // F.7: one index basis per history for what is SHOWN (indices, best, baseline): RIR only when every scored session
    // has it on its top set. The TREND has its own basis over the sessions it uses (last <= 6 in 56 days, Part 7 G.1 #3):
    // an old session without RIR no longer changes today's trend, and the shown history never loses sessions.
    const scoredAll = g.sessions.filter((s) => s.index != null);
    const indexBasis: 'rir' | 'reps' = scoredAll.length > 0 && scoredAll.every((s) => s.topRir != null) ? 'rir' : 'reps';
    const inWindow = scoredAll.filter((s) => diffDays(today, s.date) <= TREND_WINDOW_DAYS).slice(-6);
    const trendBasis: 'rir' | 'reps' = inWindow.length > 0 && inWindow.every((s) => s.topRir != null) ? 'rir' : 'reps';
    const rirScored = g.sessions;
    if (indexBasis === 'reps') {
      g.sessions = g.sessions.map((s, i) => {
        const again = sessionPerf(g.src[i].w, g.src[i].ex, useFeel, g.src[i].body, 'reps');
        return again ? { ...again, preload: s.preload, context: s.context } : s;
      });
    }
    const windowIds = new Set(inWindow.map((s) => s.workoutId));
    const trendInput = trendBasis === indexBasis ? g.sessions
      : rirScored.map((s) => (windowIds.has(s.workoutId) ? s : { ...s, index: null, indexRaw: null, e1rm: null }));
    // F.8: compare like with like.
    const { sessions: cmp, compare } = comparableSessions(trendInput);
    const trend = classifyTrend(cmp, today);
    const eq = g.equipmentId ? eqById.get(g.equipmentId) : undefined;
    const { step: inc, source: incrementSource } = loadStep(eq, g.locationId ? locById.get(g.locationId) : undefined, def?.equipmentKind, g.loadMode);
    let best: ProgressionSeries['best'] = { e1rm: null, weight: null, reps: null, date: null };
    // Within the latest index kind only: a reps index (bodyweight), a belt-only index and a body + belt index
    // are different scales and are never compared (as in the trend and the progress %).
    const bestKind = scoredAll.length ? (g.sessions.filter((s) => s.index != null).at(-1)?.indexKind ?? null) : null;
    for (const s of g.sessions) {
      if (s.index != null && (s.indexKind ?? null) === bestKind && (best.e1rm == null || s.index > best.e1rm)) best = { e1rm: s.index, weight: s.topWeight, reps: s.topReps, date: s.date };
    }
    out.push({
      key,
      exerciseId: g.exerciseId,
      equipmentId: g.equipmentId,
      scopeLabel: g.variant ? `${g.scope} · ${g.variant}` : g.scope,
      variantLabel: g.variant,
      loadMode: g.loadMode,
      locationId: g.locationId,
      incrementSource,
      sessions: g.sessions,
      trend,
      best,
      current: g.sessions[g.sessions.length - 1] ?? null,
      previous: g.sessions[g.sessions.length - 2] ?? null,
      next: suggestNextLoad(cmp, ov?.repRange ?? def?.repRange ?? [8, 12], ov?.targetRir ?? defaultRir, inc, trend, g.loadMode),
      indexBasis,
      trendBasis,
      compare,
    });
  }
  return out.sort((a, b) => (b.current?.date ?? '').localeCompare(a.current?.date ?? ''));
}

/**
 * F.8: the sessions to compare for trend and load decisions, given the context of the session being judged
 * (default: the latest one). Order never differed → all sessions as they are. Otherwise, with ≥ 3 sessions in
 * that context → only those; with fewer → all sessions, the index of pre-loaded ones normalised to the fresh
 * context (× 1 + drop × pre-load, capped), using the owner's own drop on this history when measurable.
 */
export function comparableSessions(sessions: SessionPerf[], context?: PreloadBucket): { sessions: SessionPerf[]; compare: ProgressionSeries['compare'] } {
  const ctxOf = (s: SessionPerf): PreloadBucket => s.context ?? 'fresh';
  const latest: PreloadBucket = context ?? (sessions.length ? ctxOf(sessions[sessions.length - 1]) : 'fresh');
  const kinds = new Set(sessions.map(ctxOf));
  if (context) kinds.add(context);
  if (kinds.size < 2) return { sessions, compare: { basis: 'single_context', context: latest, dropPerSet: null } };
  const same = sessions.filter((s) => ctxOf(s) === latest);
  if (same.length >= SAME_CONTEXT_MIN) return { sessions: same, compare: { basis: 'same_context', context: latest, dropPerSet: null } };
  const d = measuredDrop(sessions.map((s) => ({ index: s.indexRaw ?? s.index, preload: s.preload, context: ctxOf(s) }))) ?? PRELOAD_DEFAULT_DROP;
  const adj = sessions.map((s) => {
    if (ctxOf(s) !== 'preloaded' || s.index == null) return s;
    const f = preloadFactor(s.preload ?? 0, d);
    const raw = (s.indexRaw ?? s.index) * f;
    return { ...s, index: Math.round(raw * 10) / 10, indexRaw: raw, e1rm: s.e1rm != null ? Math.round(s.e1rm * f * 10) / 10 : null };
  });
  return { sessions: adj, compare: { basis: 'adjusted', context: latest, dropPerSet: d } };
}

export interface WarmupPlan {
  sets: { weight: number | null; reps: number }[];
  reason: string;
}

/** Exercise-specific warm-up: depends on movement type, load, position in session and prior same-muscle work. */
export function warmupFor(
  def: ExerciseDef | undefined,
  workingWeight: number | null,
  increment: number,
  priorSameMuscleSets: number,
): WarmupPlan {
  if (!def) return { sets: [], reason: L('Unknown exercise.', 'Неизвестное упражнение.') };
  if (workingWeight == null || workingWeight <= 0) {
    return { sets: [{ weight: null, reps: 8 }], reason: L('Bodyweight or unknown load: one easy set of ~8 reps to rehearse the movement.', 'Свой вес или вес неизвестен: один лёгкий подход на ~8 повторений, чтобы отработать движение.') };
  }
  const r = (p: number) => Math.max(increment || 1, roundToIncrement(workingWeight * p, increment));
  const heavyPattern = ['squat', 'hinge', 'horizontal_push', 'incline_push', 'vertical_push'].includes(def.pattern);
  if (def.category === 'compound') {
    if (priorSameMuscleSets >= 2) {
      return { sets: [{ weight: r(0.7), reps: 4 }], reason: L(`Target muscles already warm from ${priorSameMuscleSets} earlier sets — one feeler set at ~70% to groove this movement.`, `Целевые мышцы уже разогреты (подходов до этого: ${priorSameMuscleSets}) — один пробный подход на ~70%, чтобы настроиться на движение.`) };
    }
    if (heavyPattern && def.equipmentKind !== 'machine' && def.equipmentKind !== 'plate_loaded') {
      return { sets: [{ weight: r(0.5), reps: 8 }, { weight: r(0.7), reps: 4 }, { weight: r(0.85), reps: 2 }], reason: L('First free-weight compound for these muscles: ramp 50% → 70% → 85% with decreasing reps to prepare without fatigue.', 'Первое многосуставное упражнение со свободным весом для этих мышц: подводка 50% → 70% → 85% с убывающим числом повторений — подготовиться, не утомляясь.') };
    }
    return { sets: [{ weight: r(0.5), reps: 8 }, { weight: r(0.75), reps: 3 }], reason: L('Stable machine compound: two ramp-up sets are usually enough.', 'Многосуставное упражнение в тренажёре: двух подводящих подходов обычно достаточно.') };
  }
  if (priorSameMuscleSets >= 2) return { sets: [], reason: L(`No warm-up needed — this muscle already did ${priorSameMuscleSets} sets this session.`, `Разминка не нужна — эта мышца уже выполнила ${priorSameMuscleSets} ${ruPlural(priorSameMuscleSets, 'подход', 'подхода', 'подходов')} за эту тренировку.`) };
  return { sets: [{ weight: r(0.6), reps: 8 }], reason: L('Isolation exercise: one moderate set at ~60% to rehearse range of motion.', 'Изолирующее упражнение: один умеренный подход на ~60%, чтобы отработать амплитуду.') };
}

/** One-line summary of the load map, e.g. "Feels right: 25 kg · too easy: 22 kg · too heavy: 30 kg". */
export function loadMapNote(m: LoadFeel[]): string | null {
  const by = (v: LoadFeel['verdict']) => m.filter((x) => x.verdict === v).map((x) => L(`${x.weight} kg`, `${nf(x.weight)} кг`));
  const parts = [
    by('right').length ? L(`Feels right: ${by('right').join(', ')}`, `В самый раз: ${by('right').join(', ')}`) : null,
    by('too_easy').length ? L(`too easy: ${by('too_easy').join(', ')}`, `слишком легко: ${by('too_easy').join(', ')}`) : null,
    by('too_heavy').length ? L(`too heavy: ${by('too_heavy').join(', ')}`, `слишком тяжело: ${by('too_heavy').join(', ')}`) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Short, numeric call for the UI: "INCREASE +2.5 KG", "KEEP 25 KG", "REDUCE TO 22.5 KG", "PLATEAU — 4 SESSIONS", "MORE DATA NEEDED". */
export function adviceLabel(p: ProgressionSeries, kind: AdviceKind): string {
  const n = (x: number) => String(Math.round(x * 100) / 100);
  const w = p.next.weight;
  const cur = p.current?.topWeight ?? null;
  const bw = p.loadMode === 'bodyweight_plus' && (w ?? 0) === 0;
  const kg = (x: number | null) => (x == null ? '' : bw ? L('BW', 'СВОЙ ВЕС') : L(`${n(x)} KG`, `${nf(x)} КГ`));
  if (p.loadMode === 'assisted') {
    // Assistance: less assistance = harder. Say it in those words, never "increase 20 kg".
    if (kind === 'increase') return w != null && cur != null && w < cur ? L(`LESS ASSIST −${n(cur - w)} → ${n(w)} KG`, `МЕНЬШЕ ПОМОЩИ −${nf(cur - w)} → ${nf(w)} КГ`) : L(`ASSIST ${kg(w)}`, `ПОМОЩЬ ${kg(w)}`).trim();
    if (kind === 'reduce') return L(`MORE ASSIST → ${kg(w)}`, `БОЛЬШЕ ПОМОЩИ → ${kg(w)}`).trim();
    if (kind === 'keep') return L(`KEEP ASSIST ${kg(w ?? cur)}`, `ОСТАВИТЬ ПОМОЩЬ ${kg(w ?? cur)}`).trim();
  }
  if (kind === 'increase') return w != null && cur != null && w > cur && !bw ? L(`INCREASE +${n(w - cur)} KG`, `ПОВЫСИТЬ +${nf(w - cur)} КГ`) : L(`INCREASE ${kg(w)}`, `ПОВЫСИТЬ ${kg(w)}`).trim();
  if (kind === 'keep') return L(`KEEP ${kg(w ?? cur)}`, `ОСТАВИТЬ ${kg(w ?? cur)}`).trim();
  if (kind === 'reduce') return L(`REDUCE TO ${kg(w)}`, `СНИЗИТЬ ДО ${kg(w)}`).trim();
  if (kind === 'plateau') return L(`PLATEAU — ${p.trend.sessionsUsed} SESSIONS`, `ПЛАТО — ${p.trend.sessionsUsed} ТРЕН.`);
  return L('MORE DATA NEEDED', 'НУЖНО БОЛЬШЕ ДАННЫХ');
}

export { defaultIncrement };
