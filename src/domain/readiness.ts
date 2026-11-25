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
import { L, byLang, num, ruPlural } from '../i18n/core';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, muscleName } from './muscles';
import type { ProgressionSeries, SessionPerf } from './progression';
import { isCounted } from './quality';
import { MACHINE_KINDS, type Registry } from './registry';
import type { analyze } from './analysis';
import type { MuscleId, Workout, WorkoutSet } from './types';

type Analysis = ReturnType<typeof analyze>;

export type ReadinessLevel = 'INSUFFICIENT_DATA' | 'DEVELOPING' | 'SUFFICIENT' | 'WELL_CALIBRATED';
export type OperatingMode = 'learning' | 'provisional' | 'full';

export const LEVEL_LABEL: Record<ReadinessLevel, string> = byLang(() => ({
  INSUFFICIENT_DATA: L('INSUFFICIENT DATA', 'МАЛО ДАННЫХ'), DEVELOPING: L('DEVELOPING', 'НАБИРАЕТСЯ'), SUFFICIENT: L('SUFFICIENT', 'ДОСТАТОЧНО'), WELL_CALIBRATED: L('WELL CALIBRATED', 'ОТКАЛИБРОВАНО'),
}));
export const MODE_LABEL: Record<OperatingMode, string> = byLang(() => ({ learning: L('LEARNING', 'ЗНАКОМСТВО'), provisional: L('PROVISIONAL', 'ПРЕДВАРИТЕЛЬНЫЙ'), full: L('ADAPTIVE', 'АДАПТИВНЫЙ') }));
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


// ---------------------------------------------------------------- workout documentation

export type DocGap = 'no_gym' | 'no_times' | 'missing_load_or_reps' | 'effort_missing' | 'no_working_sets';
export const GAP_LABEL: Record<DocGap, string> = byLang(() => ({
  no_gym: L('gym not recorded', 'не указан зал'),
  no_times: L('no start/end time or duration', 'нет времени начала и конца или длительности'),
  missing_load_or_reps: L('a working set without weight or reps', 'рабочий подход без веса или повторений'),
  effort_missing: L('effort (RIR or how it felt) on fewer than 70 % of sets', 'усилие (RIR или ощущение) указано меньше чем в 70 % подходов'),
  no_working_sets: L('no working sets', 'нет рабочих подходов'),
}));

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
  // A machine history without a named machine is still ONE machine when its gym is known (owner 2026-11-25; the key is
  // `…::unidentified@<gym>`); only without a gym is it unknown equipment.
  const unknownMachine = needsMachine && !series.equipmentId && series.key.includes('::unidentified@unknown');
  const comparable = unknownMachine ? 0 : inWindow.filter(calibratedSession).length;
  const share = recentWorkouts ? new Set(inWindow.map((s) => s.workoutId)).size / recentWorkouts : 0;
  return {
    key: series.key, exerciseId: series.exerciseId, equipmentId: series.equipmentId,
    label: `${def ? L(def.name.en, def.name.ru || def.name.en) : series.exerciseId} · ${series.scopeLabel}`,
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

  // Machines identified: machine-type exercises logged with an equipment id — or at a known gym (owner 2026-11-25: the
  // same gym means the same machine; its history is already kept per gym, `progressionKey`). Without a gym it is unknown.
  let machineEx = 0;
  let machineIdentified = 0;
  for (const w of recent) for (const e of w.exercises) {
    const d = analysis.registry.get(e.exerciseId);
    if (!d || !MACHINE_KINDS.has(d.equipmentKind)) continue;
    machineEx++;
    if (e.equipmentId || w.locationId) machineIdentified++;
  }
  const equipmentIdentified = machineEx ? machineIdentified / machineEx : 1;

  const keys = analysis.progression.map((p) => keyReadiness(p, analysis.registry, today, recent8.length));
  const calibratedFrequent = keys.filter((k) => k.frequent && atLeast(k.level, 'SUFFICIENT')).length;

  const eqLevels = new Map<string, ReadinessLevel>();
  for (const k of keys) if (k.equipmentId) {
    const cur = eqLevels.get(k.equipmentId);
    if (!cur || RANK[k.level] > RANK[cur]) eqLevels.set(k.equipmentId, k.level);
  }
  const equipment = [...eqLevels].map(([id, level]) => ({ equipmentId: id, name: data.equipment.find((e) => e.id === id)?.name ?? L('Unknown machine', 'Неизвестный тренажёр'), level }));

  // Per muscle: best calibrated history that trains it directly; direct exposures in 8 weeks.
  const muscles: MuscleReadiness[] = TRACKED_MUSCLES.map((m) => {
    const direct = keys.filter((k) => (analysis.registry.get(k.exerciseId)?.contributions[m] ?? 0) >= 0.75);
    const best = direct.sort((a, b) => RANK[b.level] - RANK[a.level] || b.comparable - a.comparable)[0];
    const directSessions8w = new Set(recent8.filter((w) => w.exercises.some((e) => (analysis.registry.get(e.exerciseId)?.contributions[m] ?? 0) >= 0.75 && e.sets.some((s) => isCounted(s) && s.type === 'working'))).map((w) => w.id)).size;
    const level: ReadinessLevel = !best ? 'INSUFFICIENT_DATA'
      : best.level === 'WELL_CALIBRATED' && directSessions8w >= 4 ? 'WELL_CALIBRATED'
        : atLeast(best.level, 'SUFFICIENT') ? 'SUFFICIENT' : best.comparable > 0 || directSessions8w > 0 ? 'DEVELOPING' : 'INSUFFICIENT_DATA';
    const detail = !best ? L('No direct exercise logged', 'Прямых упражнений не записано')
      : L(`${best.label}: ${best.comparable} comparable session${best.comparable === 1 ? '' : 's'}; ${directSessions8w} direct session${directSessions8w === 1 ? '' : 's'} in 8 weeks`, `${best.label}: сопоставимых тренировок — ${best.comparable}; прямых тренировок за 8 недель — ${directSessions8w}`);
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
    if (wd.length < T.provisional.workouts) next.push(L(`${wd.length} / ${T.provisional.workouts} well-documented workouts`, `${wd.length} / ${T.provisional.workouts} хорошо записанных тренировок`));
    if (spanDays < T.provisional.spanDays) next.push(L(`${spanDays} / ${T.provisional.spanDays} days of well-documented training`, `${spanDays} / ${T.provisional.spanDays} дней хорошо записанных тренировок`));
    if (calibratedFrequent < T.provisional.calibratedFrequent) next.push(L(`${calibratedFrequent} / ${T.provisional.calibratedFrequent} regular exercises calibrated (≥ 2 comparable sessions with effort)`, `откалибровано регулярных упражнений: ${calibratedFrequent} / ${T.provisional.calibratedFrequent} (≥ 2 сопоставимые тренировки с указанным усилием)`));
    if (equipmentIdentified < T.provisional.equipmentIdentified) next.push(L(`${Math.round(equipmentIdentified * 100)} % / 80 % of machine exercises with a machine or a gym`, `${Math.round(equipmentIdentified * 100)} % / 80 % упражнений в тренажёрах привязаны к тренажёру`));
  } else if (!full) {
    if (wd.length < T.full.workouts) next.push(L(`${wd.length} / ${T.full.workouts} well-documented workouts`, `${wd.length} / ${T.full.workouts} хорошо записанных тренировок`));
    if (spanDays < T.full.spanDays) next.push(L(`${spanDays} / ${T.full.spanDays} days of well-documented training`, `${spanDays} / ${T.full.spanDays} дней хорошо записанных тренировок`));
    if (coverage < T.full.coverage) next.push(L(`${Math.round(coverage * 100)} % / 80 % of major-muscle targets covered by calibrated exercises`, `${Math.round(coverage * 100)} % / 80 % целей по крупным мышцам покрыты откалиброванными упражнениями`));
  }

  const recoveryKnown = recent.length ? recent.filter((w) => !documentationGaps(w).includes('no_times')).length / recent.length : 0;
  const subjective = recent.length ? recent.filter((w) => w.wellness && (w.wellness.sleepHours != null || w.wellness.soreness || w.wellness.fatigue != null)).length + data.daily.filter((d) => diffDays(today, d.date) >= 0 && diffDays(today, d.date) <= T.windowDays).length : 0;
  const weeksWithData = new Set(recent.map((w) => analysis.weeks.find((b) => w.date >= b.range.start && w.date <= b.range.end)?.range.start ?? w.date.slice(0, 7)).filter(Boolean)).size;
  const strengthKeys = analysis.progression.filter((p) => p.trend.cls !== 'insufficient_data').length;
  const lv = (n: number, a: number, b: number, c: number): ReadinessLevel => (n >= c ? 'WELL_CALIBRATED' : n >= b ? 'SUFFICIENT' : n >= a ? 'DEVELOPING' : 'INSUFFICIENT_DATA');
  const areas: AreaReadiness[] = [
    { area: L('Exercise history', 'История упражнений'), level: lv(wd.length, 3, 8, 12), detail: L(`${wd.length} well-documented of ${recent.length} workouts in 12 weeks`, `хорошо записано ${wd.length} из ${recent.length} тренировок за 12 недель`) },
    { area: L('Equipment calibration', 'Калибровка оборудования'), level: lv(keys.filter((k) => atLeast(k.level, 'SUFFICIENT')).length, 1, 3, 6), detail: L(`${keys.filter((k) => atLeast(k.level, 'SUFFICIENT')).length} exercise/machine histories calibrated; ${Math.round(equipmentIdentified * 100)} % of machine exercises linked`, `откалибровано историй «упражнение + тренажёр»: ${keys.filter((k) => atLeast(k.level, 'SUFFICIENT')).length}; ${Math.round(equipmentIdentified * 100)} % упражнений в тренажёрах привязаны к тренажёру`) },
    { area: L('Strength data', 'Данные о силе'), level: lv(strengthKeys, 1, 3, 6), detail: L(`${strengthKeys} histories with a trend (≥ 3 sessions)`, `историй с трендом (≥ 3 тренировки): ${strengthKeys}`) },
    { area: L('Frequency and structure', 'Частота и структура'), level: lv(weeksWithData, 2, 3, 6), detail: L(`${weeksWithData} weeks with training; ~${analysis.avgSessionsPerWeek} sessions/week`, `недель с тренировками: ${weeksWithData}; ~${num(analysis.avgSessionsPerWeek)} трен. в неделю`) },
    { area: L('Weekly volume history', 'История недельного объёма'), level: lv(analysis.weeks.filter((b) => b.complete && b.workouts.length).length, 1, 4, 8), detail: L(`${analysis.weeks.filter((b) => b.complete && b.workouts.length).length} complete weeks with data`, `полных недель с данными: ${analysis.weeks.filter((b) => b.complete && b.workouts.length).length}`) },
    { area: L('Recovery information', 'Данные о восстановлении'), level: recoveryKnown >= 0.7 ? (subjective >= Math.max(3, recent.length * 0.3) ? 'WELL_CALIBRATED' : 'SUFFICIENT') : recoveryKnown > 0 ? 'DEVELOPING' : 'INSUFFICIENT_DATA', detail: L(`session times known for ${Math.round(recoveryKnown * 100)} %; ${subjective} sleep/soreness/fatigue entries (optional — missing ones never block)`, `время тренировок известно для ${Math.round(recoveryKnown * 100)} %; записей о сне, болезненности мышц и усталости: ${subjective} (необязательно — их отсутствие ничего не блокирует)`) },
    { area: L('Preference consistency', 'Постоянство предпочтений'), level: lv(keys.filter((k) => k.frequent).length, 1, 3, 5), detail: L(`${keys.filter((k) => k.frequent).length} exercises in ≥ 30 % of recent sessions`, `упражнений в ≥ 30 % недавних тренировок: ${keys.filter((k) => k.frequent).length}`) },
  ];

  const dataGaps: string[] = [];
  for (const [g, n] of gapCount) dataGaps.push(L(`${n} workout${n === 1 ? '' : 's'}: ${GAP_LABEL[g]}`, `${n} ${ruPlural(n, 'тренировка', 'тренировки', 'тренировок')}: ${GAP_LABEL[g]}`));
  if (machineEx > machineIdentified) dataGaps.push(L(`${machineEx - machineIdentified} machine exercise entr${machineEx - machineIdentified === 1 ? 'y' : 'ies'} without a machine`, `записей упражнений в тренажёрах без указанного тренажёра: ${machineEx - machineIdentified}`));
  for (const m of MAJOR_MUSCLES) {
    const r = muscles.find((x) => x.muscle === m)!;
    if (r.directSessions8w === 0) dataGaps.push(L(`${muscleName(m)}: no direct exercise in 8 weeks (not planned with loads)`, `${muscleName(m, 'ru')}: за 8 недель нет прямых упражнений (вес для них не планируется)`));
  }

  return {
    mode, wellDocumented: wd.length, totalRecent: recent.length, spanDays, equipmentIdentified, calibratedFrequent, coverage, areas, keys, equipment, muscles,
    plannable: muscles.filter((m) => atLeast(m.level, 'SUFFICIENT')).map((m) => m.muscle),
    next, gaps: [...gapCount].map(([gap, workouts]) => ({ gap, workouts })), dataGaps,
  };
}
