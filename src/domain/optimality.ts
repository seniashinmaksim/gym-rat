/**
 * Part 9 — Exercise Optimality Score (FIX_PLAN I.4, rule `exercise_optimality`). How well an exercise fits THIS moment,
 * 0–100 in steps of 5, for ranking the next-exercise suggestions. Pure and read-only: it reuses the choice assistant's
 * findings (`assessChoice`, codes), the Part 8 forward checks, the weekly status per muscle, equipment availability and
 * the session counts — no second model, and it changes no weekly number, credit or recovery window.
 *
 * Three groups: NOT TODAY (no number: the primary muscle is held by an earlier session's window, a Part 8 limit, or
 * pain — shown with the reason) · LESS OPTIMAL (< 75 or a "reconsider" finding) · SUITABLE (≥ 75).
 * Score = min(caps for missing data, 100) − deductions, never below 5. The principle of each deduction comes from the
 * rules it reuses; the NUMBER of points is a heuristic (an app choice; the owner chose the weekly-target weights).
 */
import type { AppData } from './appdata';
import { assessChoice, availableEquipment, exerciseSessionCounts, priorWorkouts, type ChoiceFindingCode, type ChoiceOutcome } from './exerciseChoice';
import { significantMuscles } from './fatigue';
import { L, getLang } from '../i18n/core';
import { muscleName } from './muscles';
import { forwardChecks, usualSetCount } from './sequence';
import type { analyze } from './analysis';
import type { MuscleId, Variation, Workout } from './types';

type Analysis = ReturnType<typeof analyze>;

/** Points per finding (heuristics; FIX_PLAN I.4 — weekly-target weights chosen by the owner 2026-11-24). */
export const OPTIMALITY_POINTS = {
  primarySoftened: 25, synergistSpare: 15, synergistNoSpare: 5, recoveryUncertain: 10,
  primaryOver: 50, primaryWeekMet: 35, todayShareDone: 20, secondaryWeekMetMax: 80,
  forwardTip: 10, heavyLower: 20, lateHeavy: 10, orderPending: 15, orderHost: 5, decline: 5, machineBusy: 30,
} as const;
/** Ceilings when data is missing (a cap never raises a score). */
export const OPTIMALITY_CAPS = { noHistory: 60, newExercise: 70, unknownMachine: 80, oneSession: 85, noUsualDays: 90 } as const;
/** Scored at or above this (and no "reconsider" finding) → suitable now. */
export const SUITABLE_MIN = 75;

export type OptimalityGroup = 'suitable' | 'less_optimal' | 'not_today';
export type OptimalityBand = 'very_good' | 'good' | 'fair' | 'poor';
export type DeductionFactor = 'primary_softened' | 'recovery_uncertain' | 'synergist_recovering' | 'primary_over' | 'primary_week_met' | 'today_share_done'
  | 'secondary_week_met' | 'forward_tip' | 'fatigue' | 'order' | 'decline' | 'machine_busy';
export type CapFactor = 'no_history' | 'new_exercise' | 'one_session' | 'unknown_machine' | 'no_usual_days';

export interface Optimality {
  exerciseId: string;
  equipmentId: string | null;
  group: OptimalityGroup;
  /** null when not recommended today (never shown as a number). */
  score: number | null;
  band: OptimalityBand | null;
  confidence: 'high' | 'moderate' | 'low';
  deductions: { factor: DeductionFactor; points: number; text: string }[];
  caps: { factor: CapFactor; max: number; text: string }[];
  /** Why it is not recommended today (null otherwise). */
  reason: string | null;
  /** Short lines: what fits, then the largest deductions and caps. */
  why: string[];
  /** Sessions in which the exercise was performed before (familiarity; tie-break). */
  sessions: number;
}

export interface OptimalityInput {
  data: AppData;
  analysis: Analysis;
  workout: Workout | null;
  exerciseId: string;
  equipmentId?: string | null;
  variation?: Variation | null;
  /** Working sets intended (default: the owner's usual number for it). */
  sets?: number;
  /** Effective sets per muscle planned before it today that are not in `workout` (plan preview). */
  extraDone?: Partial<Record<MuscleId, number>>;
  outcomes?: Map<string, ChoiceOutcome>;
}

const FINDING_POINTS: Partial<Record<ChoiceFindingCode, [DeductionFactor, number]>> = {
  primary_softened: ['primary_softened', OPTIMALITY_POINTS.primarySoftened],
  recovery_uncertain: ['recovery_uncertain', OPTIMALITY_POINTS.recoveryUncertain],
  synergist_spare: ['synergist_recovering', OPTIMALITY_POINTS.synergistSpare],
  synergist_no_spare: ['synergist_recovering', OPTIMALITY_POINTS.synergistNoSpare],
  primary_over: ['primary_over', OPTIMALITY_POINTS.primaryOver],
  primary_week_met: ['primary_week_met', OPTIMALITY_POINTS.primaryWeekMet],
  today_share_done: ['today_share_done', OPTIMALITY_POINTS.todayShareDone],
  heavy_lower: ['fatigue', OPTIMALITY_POINTS.heavyLower],
  late_heavy: ['fatigue', OPTIMALITY_POINTS.lateHeavy],
  order_pending: ['order', OPTIMALITY_POINTS.orderPending],
  order_host: ['order', OPTIMALITY_POINTS.orderHost],
  decline: ['decline', OPTIMALITY_POINTS.decline],
};
const MACHINE_KINDS = new Set(['machine', 'cable', 'plate_loaded', 'smith']);
const round5 = (x: number) => Math.round(x / 5) * 5;

export function bandOf(score: number): OptimalityBand {
  return score >= 85 ? 'very_good' : score >= SUITABLE_MIN ? 'good' : score >= 50 ? 'fair' : 'poor';
}
export function bandText(b: OptimalityBand): string {
  return b === 'very_good' ? L('very good fit now', 'очень подходит сейчас') : b === 'good' ? L('good fit', 'подходит')
    : b === 'fair' ? L('less optimal', 'менее удачно') : L('poor fit today', 'сегодня плохо подходит');
}

export function optimality(input: OptimalityInput): Optimality {
  const { data, analysis, workout, exerciseId } = input;
  const equipmentId = input.equipmentId ?? null;
  const def = analysis.registry.get(exerciseId);
  const history = priorWorkouts(data, workout).filter((w) => w.date <= analysis.today);
  const sessions = exerciseSessionCounts(history).get(exerciseId) ?? 0;
  const base = { exerciseId, equipmentId, sessions };
  if (!def) {
    return { ...base, group: 'less_optimal', score: 5, band: 'poor', confidence: 'low', deductions: [], caps: [], reason: null,
      why: [L('Unknown exercise — no muscle data to score.', 'Неизвестное упражнение — нет данных о мышцах для оценки.')] };
  }
  const a = assessChoice({ data, analysis, workout, exerciseId, equipmentId, variation: input.variation, outcomes: input.outcomes });
  const sets = input.sets ?? usualSetCount(data.workouts, exerciseId);
  const fwd = forwardChecks({ data, analysis, workout, exerciseId, sets, variation: input.variation, extraDone: input.extraDone });

  // ---- not today: never a number
  const held = a.findings.find((f) => f.code === 'primary_held');
  const limit = fwd.filter((f) => f.severity === 'limit');
  const reason = a.safety ?? held?.text ?? (limit.length ? limit.map((f) => f.text).join(' ') : null);
  if (reason) {
    return { ...base, group: 'not_today', score: null, band: null, confidence: a.confidence, deductions: [], caps: [], reason,
      why: [reason] };
  }

  // ---- deductions (each one existing finding)
  const deductions: Optimality['deductions'] = [];
  for (const f of a.findings) {
    const p = FINDING_POINTS[f.code];
    if (p) deductions.push({ factor: p[0], points: p[1], text: f.text });
  }
  // Work going to secondary muscles (≥ 0.5) whose week is already met (owner 2026-11-24): its share of the exercise.
  const sig = significantMuscles(def, input.variation, 0.5);
  const total = sig.reduce((s, x) => s + x.coef, 0);
  const met = sig.slice(1).filter((x) => /^(done|over)$/.test(analysis.muscles.find((m) => m.muscle === x.muscle)?.status ?? ''));
  if (met.length && total > 0) {
    const points = round5(OPTIMALITY_POINTS.secondaryWeekMetMax * met.reduce((s, x) => s + x.coef, 0) / total);
    const names = met.map((x) => muscleName(x.muscle, getLang()).toLowerCase()).join(', ');
    if (points > 0) deductions.push({ factor: 'secondary_week_met', points, text: L(`Week already met for ${names} — part of this exercise's work goes there.`, `Недельная цель уже выполнена: ${names} — часть работы этого упражнения уходит туда.`) });
  }
  const tip = fwd.find((f) => f.severity === 'recommendation');
  if (tip) deductions.push({ factor: 'forward_tip', points: OPTIMALITY_POINTS.forwardTip, text: tip.text });

  // ---- availability
  const caps: Optimality['caps'] = [];
  const busy = new Set((workout?.busyEquipment ?? []).map((b) => b.equipmentId));
  const loc = workout?.locationId ?? null;
  const busyText = L('Machine busy right now.', 'Тренажёр сейчас занят.');
  if (equipmentId) {
    if (busy.has(equipmentId)) deductions.push({ factor: 'machine_busy', points: OPTIMALITY_POINTS.machineBusy, text: busyText });
  } else {
    const av = availableEquipment(data, def, loc, busy, history);
    if (!av.ok) {
      const any = availableEquipment(data, def, loc, new Set(), history);
      if (any.ok && any.equipmentId && busy.has(any.equipmentId)) deductions.push({ factor: 'machine_busy', points: OPTIMALITY_POINTS.machineBusy, text: busyText });
      else if (MACHINE_KINDS.has(def.equipmentKind)) caps.push({ factor: 'unknown_machine', max: OPTIMALITY_CAPS.unknownMachine, text: L('No machine for it known at this gym.', 'Тренажёр для него в этом зале не известен.') });
    }
  }

  // ---- missing data: caps
  if (!history.some((w) => w.date < analysis.today)) caps.push({ factor: 'no_history', max: OPTIMALITY_CAPS.noHistory, text: L('No training history yet — a rough guide only.', 'Истории тренировок пока нет — оценка приблизительная.') });
  if (sessions === 0) caps.push({ factor: 'new_exercise', max: OPTIMALITY_CAPS.newExercise, text: L('New to you — calibrate the load first.', 'Новое для вас — сначала подберите вес.') });
  else if (sessions === 1) caps.push({ factor: 'one_session', max: OPTIMALITY_CAPS.oneSession, text: L('Done once so far — little history.', 'Пока выполнено один раз — истории мало.') });
  if (!analysis.usualDays) caps.push({ factor: 'no_usual_days', max: OPTIMALITY_CAPS.noUsualDays, text: L('Your usual days are not known yet, so the next sessions could not be checked.', 'Ваши обычные дни пока не известны, поэтому следующие тренировки проверить нельзя.') });

  const ceiling = Math.min(100, ...caps.map((c) => c.max));
  const score = Math.max(5, round5(ceiling - deductions.reduce((s, x) => s + x.points, 0)));
  const reconsider = a.findings.some((f) => f.status === 'reconsider');
  const group: OptimalityGroup = score >= SUITABLE_MIN && !reconsider ? 'suitable' : 'less_optimal';
  const confidence = caps.length ? 'low' : a.confidence;

  const why: string[] = [];
  const pLine = a.muscles[0];
  if (pLine && !deductions.some((x) => /^primary|today_share/.test(x.factor))) {
    const left = pLine.todayLeft > 0 ? pLine.todayLeft : pLine.weekLeft;
    if (left > 0) why.push(pLine.todayLeft > 0
      ? L(`${muscleName(pLine.muscle, 'en')} ready, ${fmtN(left)} effective sets left today.`, `${muscleName(pLine.muscle, 'ru')}: готово, на сегодня ещё ${fmtN(left)} эфф. подх.`)
      : L(`${muscleName(pLine.muscle, 'en')} ready, ${fmtN(left)} effective sets left this week.`, `${muscleName(pLine.muscle, 'ru')}: готово, на неделе ещё ${fmtN(left)} эфф. подх.`));
  }
  for (const x of [...deductions].sort((p, q) => q.points - p.points).slice(0, 2)) why.push(`−${x.points}: ${x.text}`);
  for (const c of caps) why.push(L(`At most ${c.max}: ${c.text}`, `Не выше ${c.max}: ${c.text}`));
  if (!why.length) why.push(L('Nothing against it right now.', 'Сейчас ничто не мешает.'));
  return { ...base, group, score, band: bandOf(score), confidence, deductions, caps, reason: null, why };
}

const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-US'));

const GROUP_RANK: Record<OptimalityGroup, number> = { suitable: 0, less_optimal: 1, not_today: 2 };
/**
 * Suitable → less optimal → not today; inside a group high → low; ties: more sessions logged, then the name, then the id.
 * Stable and independent of the input order.
 */
export function rankOptions<T extends Optimality>(list: T[], nameOf: (exerciseId: string) => string): T[] {
  return [...list].sort((x, y) => GROUP_RANK[x.group] - GROUP_RANK[y.group] || (y.score ?? -1) - (x.score ?? -1) || y.sessions - x.sessions
    || nameOf(x.exerciseId).localeCompare(nameOf(y.exerciseId)) || x.exerciseId.localeCompare(y.exerciseId) || (x.equipmentId ?? '').localeCompare(y.equipmentId ?? ''));
}
