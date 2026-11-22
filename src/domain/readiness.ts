/**
 * Operating modes and granular readiness (Part 5, E.4). Data QUALITY decides, never the calendar alone:
 *
 *   LEARNING              default — logging, volume and stats; optional suggestions labelled PROVISIONAL
 *   PROVISIONAL ADAPTIVE  ≥ 8 well-documented workouts over ≥ 21 days, machines identified (≥ 80 %),
 *                         ≥ 3 frequent exercises calibrated → full proposals with per-item labels
 *   FULL ADAPTIVE         ≥ 10 well-documented workouts over ≥ 28 days AND calibrated familiar exercises
 *                         cover ≥ 80 % of the weekly targets of the major muscles the owner trains
 *
 * "Well-documented workout" = gym known, start + end/duration (or ticked sets with times), every working
 * set with weight and reps, effort (RIR / how it felt / failure) on ≥ 70 % of working sets.
 * Calibration per exercise × machine × configuration: comparable representative sessions in 8 weeks
 * with load, reps and effort on known equipment — 0 INSUFFICIENT, 1 DEVELOPING, 2–3 SUFFICIENT, ≥ 4 WELL.
 * Missing soreness / sleep never blocks anything: that part of the recovery estimate is just uncertain.
 */
import type { AppData } from './appdata';
import { diffDays } from './dates';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, muscleName } from './muscles';
import type { ProgressionSeries, SessionPerf } from './progression';
import { isCounted } from './quality';
import type { Registry } from './registry';
import type { analyze } from './analysis';
import type { MuscleId, Workout, WorkoutSet } from './types';

type Analysis = ReturnType<typeof analyze>;

export type ReadinessLevel = 'INSUFFICIENT_DATA' | 'DEVELOPING' | 'SUFFICIENT' | 'WELL_CALIBRATED';
export type OperatingMode = 'learning' | 'provisional' | 'full';

export const LEVEL_LABEL: Record<ReadinessLevel, string> = {
  INSUFFICIENT_DATA: 'INSUFFICIENT DATA', DEVELOPING: 'DEVELOPING', SUFFICIENT: 'SUFFICIENT', WELL_CALIBRATED: 'WELL CALIBRATED',
};
export const MODE_LABEL: Record<OperatingMode, string> = { learning: 'LEARNING', provisional: 'PROVISIONAL', full: 'ADAPTIVE' };
const RANK: Record<ReadinessLevel, number> = { INSUFFICIENT_DATA: 0, DEVELOPING: 1, SUFFICIENT: 2, WELL_CALIBRATED: 3 };
export const atLeast = (l: ReadinessLevel, min: ReadinessLevel) => RANK[l] >= RANK[min];

export const MODE_THRESHOLDS = {
  provisional: { workouts: 8, spanDays: 21, calibratedFrequent: 3, equipmentIdentified: 0.8 },
  full: { workouts: 10, spanDays: 28, coverage: 0.8 },
  /** Well-documented workouts are counted in this window. */
  windowDays: 84,
  calibrationWindowDays: 56,
  frequentShare: 0.3,
} as const;

/** Muscles the planner treats as "major" for the coverage rule. */
export const MAJOR_MUSCLES: MuscleId[] = ['chest', 'lats', 'upper_back', 'side_delts', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'abs'];

const MACHINE_KINDS = new Set(['machine', 'plate_loaded', 'cable', 'smith']);

// ---------------------------------------------------------------- workout documentation

export type DocGap = 'no_gym' | 'no_times' | 'missing_load_or_reps' | 'effort_missing' | 'no_working_sets';
export const GAP_LABEL: Record<DocGap, string> = {
  no_gym: 'gym not recorded',
  no_times: 'no start/end time or duration',
  missing_load_or_reps: 'a working set without weight or reps',
  effort_missing: 'effort (RIR or how it felt) on fewer than 70 % of sets',
  no_working_sets: 'no working sets',
};

export const effortKnown = (s: WorkoutSet) => s.rir != null || !!s.feel || !!s.effort || s.toFailure === true || s.failure === 'muscular';

/** Why a workout is not well documented ([] = well documented). */
export function documentationGaps(w: Workout): DocGap[] {
  const gaps: DocGap[] = [];
  const working = w.exercises.flatMap((e) => e.sets.filter((s) => isCounted(s) && s.type === 'working'));
  if (!working.length) return ['no_working_sets'];
  if (!w.locationId) gaps.push('no_gym');
  const ticked = working.some((s) => !!s.completedAt);
  if (!(w.startTime && (w.endTime || w.durationMin)) && !ticked) gaps.push('no_times');
  if (working.some((s) => s.reps == null || s.weightKg == null)) gaps.push('missing_load_or_reps');
  if (working.filter(effortKnown).length / working.length < 0.7) gaps.push('effort_missing');
  return gaps;
}

export const isWellDocumented = (w: Workout) => documentationGaps(w).length === 0;

// ---------------------------------------------------------------- calibration

export interface KeyReadiness {
  key: string;
  exerciseId: string;
  equipmentId: string | null;
  label: string;
  /** Comparable sessions in 8 weeks with load + reps + effort on known equipment. */
  comparable: number;
  level: ReadinessLevel;
  /** Share of the last-8-week workouts that contained this history. */
  share: number;
  frequent: boolean;
  lastUsed: string | null;
}

const levelFor = (n: number): ReadinessLevel => (n >= 4 ? 'WELL_CALIBRATED' : n >= 2 ? 'SUFFICIENT' : n === 1 ? 'DEVELOPING' : 'INSUFFICIENT_DATA');

function calibratedSession(s: SessionPerf): boolean {
  if (!s.representative) return false;
  const bench = s.sets.filter((p) => p.benchmark && p.reps != null);
  if (!bench.length) return false;
  // Effort (RIR / how it felt / failure) on most benchmark sets — one rated set in five is not calibration.
  const effort = bench.filter((p) => p.rir != null || !!p.feel || !!p.effort).length / bench.length >= 0.6;
  const load = s.indexKind === 'reps' || bench.some((p) => p.weight != null);
  return effort && load;
}

export function keyReadiness(series: ProgressionSeries, registry: Registry, today: string, recentWorkouts: number): KeyReadiness {
  const def = registry.get(series.exerciseId);
  const needsMachine = !!def && MACHINE_KINDS.has(def.equipmentKind);
  const inWindow = series.sessions.filter((s) => diffDays(today, s.date) >= 0 && diffDays(today, s.date) <= MODE_THRESHOLDS.calibrationWindowDays);
  const comparable = needsMachine && !series.equipmentId ? 0 : inWindow.filter(calibratedSession).length;
  const share = recentWorkouts ? new Set(inWindow.map((s) => s.workoutId)).size / recentWorkouts : 0;
  return {
    key: series.key, exerciseId: series.exerciseId, equipmentId: series.equipmentId,
    label: `${def?.name.en ?? series.exerciseId} · ${series.scopeLabel}`,
    comparable, level: levelFor(comparable), share, frequent: share >= MODE_THRESHOLDS.frequentShare && inWindow.length >= 2,
    lastUsed: series.current?.date ?? null,
  };
}

// ---------------------------------------------------------------- report

export interface AreaReadiness { area: string; level: ReadinessLevel; detail: string }
export interface MuscleReadiness { muscle: MuscleId; level: ReadinessLevel; bestKey: string | null; directSessions8w: number; detail: string }

export interface ReadinessReport {
  mode: OperatingMode;
  wellDocumented: number;
  totalRecent: number;
  spanDays: number;
  equipmentIdentified: number;
  calibratedFrequent: number;
  coverage: number;
  areas: AreaReadiness[];
  keys: KeyReadiness[];
  equipment: { equipmentId: string; name: string; level: ReadinessLevel }[];
  muscles: MuscleReadiness[];
  /** Muscles the planner can plan with calibrated loads. */
  plannable: MuscleId[];
  /** What is still missing for the next mode, in plain words. */
  next: string[];
  /** Counted documentation gaps in the window. */
  gaps: { gap: DocGap; workouts: number }[];
  dataGaps: string[];
}

export function readinessReport(data: AppData, analysis: Analysis): ReadinessReport {
  const today = analysis.today;
  const T = MODE_THRESHOLDS;
  const recent = data.workouts.filter((w) => diffDays(today, w.date) >= 0 && diffDays(today, w.date) <= T.windowDays && w.exercises.length);
  const recent8 = recent.filter((w) => diffDays(today, w.date) <= T.calibrationWindowDays);
  const wd = recent.filter(isWellDocumented).sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = wd.length ? diffDays(wd[wd.length - 1].date, wd[0].date) : 0;
  const gapCount = new Map<DocGap, number>();
  for (const w of recent) for (const g of documentationGaps(w)) gapCount.set(g, (gapCount.get(g) ?? 0) + 1);

  // Machines identified: machine-type exercises logged with an equipment id.
  let machineEx = 0;
  let machineIdentified = 0;
  for (const w of recent) for (const e of w.exercises) {
    const d = analysis.registry.get(e.exerciseId);
    if (!d || !MACHINE_KINDS.has(d.equipmentKind)) continue;
    machineEx++;
    if (e.equipmentId) machineIdentified++;
  }
  const equipmentIdentified = machineEx ? machineIdentified / machineEx : 1;

  const keys = analysis.progression.map((p) => keyReadiness(p, analysis.registry, today, recent8.length));
  const calibratedFrequent = keys.filter((k) => k.frequent && atLeast(k.level, 'SUFFICIENT')).length;

  const eqLevels = new Map<string, ReadinessLevel>();
  for (const k of keys) if (k.equipmentId) {
    const cur = eqLevels.get(k.equipmentId);
    if (!cur || RANK[k.level] > RANK[cur]) eqLevels.set(k.equipmentId, k.level);
  }
  const equipment = [...eqLevels].map(([id, level]) => ({ equipmentId: id, name: data.equipment.find((e) => e.id === id)?.name ?? 'Unknown machine', level }));

  // Per muscle: best calibrated history that trains it directly; direct exposures in 8 weeks.
  const muscles: MuscleReadiness[] = TRACKED_MUSCLES.map((m) => {
    const direct = keys.filter((k) => (analysis.registry.get(k.exerciseId)?.contributions[m] ?? 0) >= 0.75);
    const best = direct.sort((a, b) => RANK[b.level] - RANK[a.level] || b.comparable - a.comparable)[0];
    const directSessions8w = new Set(recent8.filter((w) => w.exercises.some((e) => (analysis.registry.get(e.exerciseId)?.contributions[m] ?? 0) >= 0.75 && e.sets.some((s) => isCounted(s) && s.type === 'working'))).map((w) => w.id)).size;
    const level: ReadinessLevel = !best ? 'INSUFFICIENT_DATA'
      : best.level === 'WELL_CALIBRATED' && directSessions8w >= 4 ? 'WELL_CALIBRATED'
        : atLeast(best.level, 'SUFFICIENT') ? 'SUFFICIENT' : best.comparable > 0 || directSessions8w > 0 ? 'DEVELOPING' : 'INSUFFICIENT_DATA';
    const detail = !best ? 'No direct exercise logged' : `${best.label}: ${best.comparable} comparable session${best.comparable === 1 ? '' : 's'}; ${directSessions8w} direct session${directSessions8w === 1 ? '' : 's'} in 8 weeks`;
    return { muscle: m, level, bestKey: best?.key ?? null, directSessions8w, detail };
  });

  // Coverage: weekly targets of the major muscles the owner trains directly, covered by a calibrated history.
  const trained = MAJOR_MUSCLES.filter((m) => (muscles.find((x) => x.muscle === m)?.directSessions8w ?? 0) >= 1);
  const pref = (m: MuscleId) => analysis.targets[m]?.preferred ?? MUSCLE_BY_ID[m].reference?.preferred ?? 0;
  const totalPref = trained.reduce((a, m) => a + pref(m), 0);
  const coveredPref = trained.filter((m) => atLeast(muscles.find((x) => x.muscle === m)!.level, 'SUFFICIENT')).reduce((a, m) => a + pref(m), 0);
  const coverage = totalPref > 0 && trained.length >= 4 ? coveredPref / totalPref : 0;

  const prov = wd.length >= T.provisional.workouts && spanDays >= T.provisional.spanDays && equipmentIdentified >= T.provisional.equipmentIdentified && calibratedFrequent >= T.provisional.calibratedFrequent;
  const full = prov && wd.length >= T.full.workouts && spanDays >= T.full.spanDays && coverage >= T.full.coverage;
  const mode: OperatingMode = full ? 'full' : prov ? 'provisional' : 'learning';

  const next: string[] = [];
  if (!prov) {
    if (wd.length < T.provisional.workouts) next.push(`${wd.length} / ${T.provisional.workouts} well-documented workouts`);
    if (spanDays < T.provisional.spanDays) next.push(`${spanDays} / ${T.provisional.spanDays} days of well-documented training`);
    if (calibratedFrequent < T.provisional.calibratedFrequent) next.push(`${calibratedFrequent} / ${T.provisional.calibratedFrequent} regular exercises calibrated (≥ 2 comparable sessions with effort)`);
    if (equipmentIdentified < T.provisional.equipmentIdentified) next.push(`${Math.round(equipmentIdentified * 100)} % / 80 % of machine exercises linked to a machine`);
  } else if (!full) {
    if (wd.length < T.full.workouts) next.push(`${wd.length} / ${T.full.workouts} well-documented workouts`);
    if (spanDays < T.full.spanDays) next.push(`${spanDays} / ${T.full.spanDays} days of well-documented training`);
    if (coverage < T.full.coverage) next.push(`${Math.round(coverage * 100)} % / 80 % of major-muscle targets covered by calibrated exercises`);
  }

  const recoveryKnown = recent.length ? recent.filter((w) => !documentationGaps(w).includes('no_times')).length / recent.length : 0;
  const subjective = recent.length ? recent.filter((w) => w.wellness && (w.wellness.sleepHours != null || w.wellness.soreness || w.wellness.fatigue != null)).length + data.daily.filter((d) => diffDays(today, d.date) >= 0 && diffDays(today, d.date) <= T.windowDays).length : 0;
  const weeksWithData = new Set(recent.map((w) => analysis.weeks.find((b) => w.date >= b.range.start && w.date <= b.range.end)?.range.start ?? w.date.slice(0, 7)).filter(Boolean)).size;
  const strengthKeys = analysis.progression.filter((p) => p.trend.cls !== 'insufficient_data').length;
  const lv = (n: number, a: number, b: number, c: number): ReadinessLevel => (n >= c ? 'WELL_CALIBRATED' : n >= b ? 'SUFFICIENT' : n >= a ? 'DEVELOPING' : 'INSUFFICIENT_DATA');
  const areas: AreaReadiness[] = [
    { area: 'Exercise history', level: lv(wd.length, 3, 8, 12), detail: `${wd.length} well-documented of ${recent.length} workouts in 12 weeks` },
    { area: 'Equipment calibration', level: lv(keys.filter((k) => atLeast(k.level, 'SUFFICIENT')).length, 1, 3, 6), detail: `${keys.filter((k) => atLeast(k.level, 'SUFFICIENT')).length} exercise/machine histories calibrated; ${Math.round(equipmentIdentified * 100)} % of machine exercises linked` },
    { area: 'Strength data', level: lv(strengthKeys, 1, 3, 6), detail: `${strengthKeys} histories with a trend (≥ 3 sessions)` },
    { area: 'Frequency and structure', level: lv(weeksWithData, 2, 3, 6), detail: `${weeksWithData} weeks with training; ~${analysis.avgSessionsPerWeek} sessions/week` },
    { area: 'Weekly volume history', level: lv(analysis.weeks.filter((b) => b.complete && b.workouts.length).length, 1, 4, 8), detail: `${analysis.weeks.filter((b) => b.complete && b.workouts.length).length} complete weeks with data` },
    { area: 'Recovery information', level: recoveryKnown >= 0.7 ? (subjective >= Math.max(3, recent.length * 0.3) ? 'WELL_CALIBRATED' : 'SUFFICIENT') : recoveryKnown > 0 ? 'DEVELOPING' : 'INSUFFICIENT_DATA', detail: `session times known for ${Math.round(recoveryKnown * 100)} %; ${subjective} sleep/soreness/fatigue entries (optional — missing ones never block)` },
    { area: 'Preference consistency', level: lv(keys.filter((k) => k.frequent).length, 1, 3, 5), detail: `${keys.filter((k) => k.frequent).length} exercises in ≥ 30 % of recent sessions` },
  ];

  const dataGaps: string[] = [];
  for (const [g, n] of gapCount) dataGaps.push(`${n} workout${n === 1 ? '' : 's'}: ${GAP_LABEL[g]}`);
  if (machineEx > machineIdentified) dataGaps.push(`${machineEx - machineIdentified} machine exercise entr${machineEx - machineIdentified === 1 ? 'y' : 'ies'} without a machine`);
  for (const m of MAJOR_MUSCLES) {
    const r = muscles.find((x) => x.muscle === m)!;
    if (r.directSessions8w === 0) dataGaps.push(`${muscleName(m)}: no direct exercise in 8 weeks (not planned with loads)`);
  }

  return {
    mode, wellDocumented: wd.length, totalRecent: recent.length, spanDays, equipmentIdentified, calibratedFrequent, coverage, areas, keys, equipment, muscles,
    plannable: muscles.filter((m) => atLeast(m.level, 'SUFFICIENT')).map((m) => m.muscle),
    next, gaps: [...gapCount].map(([gap, workouts]) => ({ gap, workouts })), dataGaps,
  };
}
