import { withoutAutoWarmups } from './perception';
import type { AppData } from './appdata';
import { daysLeftInWeek, localNowParts, weekOf, type WeekRange } from './dates';
import { mean, weeklyHistory, type WeekBucket } from './history';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, muscleName } from './muscles';
import { fitToday, laterUsualOffsets, suggestExtraSession, usualTrainingDays, type ExtraSession, type FitInput } from './weekPlan';
import { L, getLang, num } from '../i18n/core';
import { failureProfile, type FailureProfile } from './failure';
import { bodyKgForIndex } from './bodyweight';
import { buildProgression, type ProgressionSeries } from './progression';
import { round2, roundHalf, stripPlanned } from './quality';
import { estimateRecovery, type RecoveryEstimate } from './recovery';
import { buildRegistry, type Registry } from './registry';
import { computeTargets, learningState, muscleTrendSummary, type LearningState, type MuscleTarget } from './targets';
import type { MuscleId } from './types';
import { computeVolume, type MuscleVolume, type VolumeResult } from './volume';

export type WeekStatus = 'done' | 'over' | 'on_track' | 'behind' | 'at_risk' | 'no_data';

export interface MuscleWeek {
  muscle: MuscleId;
  target: MuscleTarget;
  volume: MuscleVolume;
  completed: number;
  remainingToMin: number;
  remainingToPreferred: number;
  pctOfPreferred: number;
  status: WeekStatus;
  recovery: RecoveryEstimate;
  trend: ReturnType<typeof muscleTrendSummary>;
  moreVolumeJustified: 'yes' | 'no' | 'wait' | 'caution';
  justification: string;
  /**
   * Today's share, fixed for the whole day: (remaining at the START of today) ÷ (sessions likely
   * left incl. today), capped per muscle. 0 if done or still recovering from an earlier session.
   */
  todayShare: number;
  /** Effective sets already logged for this muscle today. */
  doneToday: number;
  /** What is still open of today's share (todayShare − doneToday, never below 0). */
  todayLeft: number;
  /** Still recovering from a PREVIOUS session (today's own sets never block today's plan). */
  todayBlocked: boolean;
  /** Most effective sets suggested for this muscle in one session. */
  sessionCap: number;
  /** Remaining sets that will not fit in the sessions left — they simply carry over (don't cram). */
  carryOver: number;
  /**
   * The one value `'Target met'` stays ENGLISH in every language: it is a code other modules compare
   * (`prescription.ts`) and it is never shown by itself. Language-proof twin: `targetMet`.
   */
  todayNote: string;
  /** Nothing was left of the weekly target when the day started (same condition as `todayNote === 'Target met'`). */
  targetMet: boolean;
  /** Today's share was raised above the even share so the later usual days still fit outside the recovery window (Part 7 #13). */
  shareRaised: boolean;
  explanation: string;
}

export interface Analysis {
  today: string;
  nowVirtualMs: number;
  week: WeekRange;
  daysLeft: number;
  registry: Registry;
  weeks: WeekBucket[];
  current: VolumeResult;
  learning: LearningState;
  targets: Record<MuscleId, MuscleTarget>;
  recovery: Record<MuscleId, RecoveryEstimate>;
  /** Recovery entering today's session (ignores sessions dated today). Used for planning. */
  planRecovery: Record<MuscleId, RecoveryEstimate>;
  progression: ProgressionSeries[];
  muscles: MuscleWeek[];
  sessionsThisWeek: number;
  trainedToday: boolean;
  sessionsLeftInclToday: number;
  avgSessionsPerWeek: number;
  expectedRemainingSessions: number;
  /** Failure-status profile of the current week (descriptive only; one line for the UI in `failure.line`). */
  failure: FailureProfile;
  /** Weekdays the owner usually trains (0 = Sunday), learned from ≥ 3 recent complete weeks; null = not known yet. */
  usualDays: number[] | null;
  /** One optional extra short session when the usual days cannot finish the week (Part 7 #14); null = none. */
  extraSession: ExtraSession | null;
}

/** A muscle still recovering but within this many hours of the window's end is not held back today. */
export const RECOVERY_TOLERANCE_H = 6;

/** Share of the weekly preferred target suggested at most in one session (spreads it over ≥2 sessions). */
export const MAX_SESSION_SHARE = 0.6;

/**
 * What is still open of today's share: less than half a set counts as nothing, else rounded to half sets.
 * The one formula for "left today" (Week screen, choice card).
 */
export function leftOfShare(share: number, done: number): number {
  const diff = share - done;
  return diff < 0.5 ? 0 : roundHalf(diff);
}

export function analyze(rawData: AppData, now: Date = new Date()): Analysis {
  // Planned (pre-filled, not yet performed) sets never count toward anything.
  // Numbers check off (Settings): the app's own warm-up tags are not applied anywhere (progression, volume, recovery).
  const off = rawData.settings.quality.useNumbersCheck === false;
  const stripped = stripPlanned(rawData.workouts);
  const data: AppData = { ...rawData, workouts: off ? stripped.map((w) => ({ ...w, exercises: w.exercises.map((e) => withoutAutoWarmups(e, rawData.settings.quality)) })) : stripped };
  const { timezone, weekStartsOn, quality, perSessionSetCap, defaultTargetRir } = data.settings;
  const local = localNowParts(timezone, now);
  const today = local.date;
  const registry = buildRegistry(data.customExercises, data.exerciseOverrides);
  const week = weekOf(today, weekStartsOn);
  const weeks = weeklyHistory(data, registry, today);
  const thisWeek = data.workouts.filter((w) => w.date >= week.start && w.date <= week.end && w.date <= today);
  const current = computeVolume(thisWeek, registry, quality);
  const learning = learningState(data, today, weeks);
  const progression = buildProgression(data.workouts, registry, data.equipment, data.exerciseOverrides, defaultTargetRir, today, quality.useFeelWhenNoRir !== false, data.locations, (w) => bodyKgForIndex(data.body, w));
  const recovery = estimateRecovery(data, registry, local.virtualMs, today);
  const planRecovery = estimateRecovery(data, registry, local.virtualMs, today, { before: today });
  const targets = computeTargets({ data, weeks, learning, progression, recovery, registry, today });

  const recentWeeks = weeks.filter((w) => w.complete && !w.partial && w.workouts.length).slice(-4);
  const avgSessionsPerWeek = recentWeeks.length ? mean(recentWeeks.map((w) => w.workouts.length)) : 3;
  const daysLeft = daysLeftInWeek(today, week);
  // Part 7 #13: the owner's usual weekdays (from complete, full weeks) and which of them are still ahead this week.
  const usualDays = usualTrainingDays(weeks.filter((w) => w.complete && !w.partial).map((w) => ({ dates: w.workouts.map((x) => x.date) })));
  const laterUsual = usualDays ? laterUsualOffsets(today, week.end, usualDays) : null;
  const fits: { muscle: MuscleId; fit: FitInput; share: number; shortBy: number }[] = [];
  const todays = thisWeek.filter((w) => w.date === today);
  // Opening the logger is not training: a workout counts once it has a performed set (planned sets are stripped above).
  const trainedToday = todays.some((w) => w.exercises.some((e) => e.sets.length > 0));
  const todayVol = computeVolume(todays, registry, quality);
  const effDays = trainedToday ? Math.max(0, daysLeft - 1) : daysLeft;
  const expectedRemainingSessions = Math.max(effDays > 0 ? 1 : 0, Math.round((avgSessionsPerWeek * effDays) / 7));
  // Fraction of the week already behind us at the START of today (Monday morning = 0).
  const elapsedFrac = Math.min(1, Math.max(0, (7 - daysLeft) / 7));
  // Sessions likely left INCLUDING today (today counts as a session if you are opening the app to train).
  const sessionsLeftInclToday = Math.max(daysLeft > 0 ? 1 : 0, Math.round((avgSessionsPerWeek * daysLeft) / 7));

  const muscles: MuscleWeek[] = TRACKED_MUSCLES.map((m) => {
    const target = targets[m];
    const volume = current.muscles[m];
    const completed = volume.effective;
    const remainingToMin = roundHalf(Math.max(0, target.min - completed));
    const remainingToPreferred = roundHalf(Math.max(0, target.preferred - completed));
    const pct = target.preferred > 0 ? Math.min(2, completed / target.preferred) : 1;
    const rec = recovery[m];
    const planRec = planRecovery[m];
    const trend = muscleTrendSummary(m, progression, registry);
    const sessionCap = Math.max(1, Math.min(perSessionSetCap, Math.max(3, Math.round(target.preferred * MAX_SESSION_SHARE))));
    const achievable = expectedRemainingSessions * sessionCap;
    let status: WeekStatus;
    if (!data.workouts.length) status = 'no_data';
    else if (completed > target.max) status = 'over';
    // "Done" as soon as nothing is left after rounding to half sets (11.9 of 12 is the target, not 0 sets short).
    else if (completed >= target.preferred || remainingToPreferred === 0) status = 'done';
    else if (remainingToPreferred > achievable && remainingToMin > 0) status = 'at_risk';
    else if (completed >= target.min || pct >= elapsedFrac * 0.8) status = 'on_track';
    else status = 'behind';

    let moreVolumeJustified: MuscleWeek['moreVolumeJustified'];
    let justification: string;
    if (status === 'done' || status === 'over') {
      moreVolumeJustified = 'no';
      justification = status === 'over'
        ? L(`Above the current upper bound (${target.max}). Extra sets are unlikely to add much (diminishing returns) and add fatigue.`,
          `Выше текущей верхней границы (${num(target.max)}). Дополнительные подходы вряд ли дадут заметную прибавку (убывающая отдача) и добавляют усталость.`)
        : L('Target reached — no additional sets are required just to satisfy a number.', 'Цель достигнута — дополнительные подходы ради цифры не нужны.');
    } else if (planRec.status === 'recovering' && planRec.hoursLeft > RECOVERY_TOLERANCE_H) {
      moreVolumeJustified = 'wait';
      justification = L(`Below target, but likely still recovering from the last session (~${planRec.hoursLeft} h more by the heuristic). Train it next session rather than today if possible — this is advice, not a rule.`,
        `Ниже цели, но мышца, вероятно, ещё восстанавливается после прошлой тренировки (по эвристике ещё ~${planRec.hoursLeft} ч). По возможности нагрузите её на следующей тренировке, а не сегодня — это совет, а не правило.`);
    } else if (trend.overall === 'declining') {
      moreVolumeJustified = 'caution';
      justification = L('Below target, but performance on its main exercises is declining — prioritize quality sets over adding volume.',
        'Ниже цели, но результаты в основных упражнениях снижаются — качество подходов важнее добавления объёма.');
    } else {
      moreVolumeJustified = 'yes';
      justification = target.provisional
        ? L('Below the provisional reference. Adding the remaining sets is reasonable if time and recovery allow.', 'Ниже предварительного ориентира. Оставшиеся подходы стоит добавить, если позволяют время и восстановление.')
        : L('Below your individualized target and recovery looks adequate.', 'Ниже вашей индивидуальной цели, восстановление выглядит достаточным.');
    }

    const name = muscleName(m, getLang());
    const tLabel = target.provisional ? 'provisional ' : '';
    const indirectShare = completed > 0 ? Math.round((volume.effectiveIndirect / completed) * 100) : 0;
    let explanation = L(`${name}: ${completed.toFixed(1)} of your ${tLabel}${target.preferred} weekly effective sets completed (${volume.directSets} direct, ${volume.indirectSets} indirect raw sets).`,
      `${name}: выполнено ${num(completed, 1)} из ${num(target.preferred)} эффективных подходов недельной цели${target.provisional ? ' (предварительной)' : ''} (подходов как записано: ${num(volume.directSets)} прямых, ${num(volume.indirectSets)} косвенных).`);
    if (remainingToPreferred > 0) {
      explanation += L(` About ${remainingToPreferred} effective sets remain`, ` Осталось около ${num(remainingToPreferred)} эффективных подходов`);
      explanation += remainingToMin > 0
        ? L(` (${remainingToMin} to reach the lower end of ${target.min}).`, ` (${num(remainingToMin)} до нижней границы ${num(target.min)}).`)
        : L(' to reach the preferred target; the lower end is already met.', ' до предпочтительной цели; нижняя граница уже достигнута.');
    } else explanation += L(' No more sets are needed this week.', ' На этой неделе подходы больше не нужны.');
    if (completed > 0 && indirectShare >= 60) explanation += L(` ${indirectShare}% of this came from indirect work.`, ` ${indirectShare}% из этого дала косвенная нагрузка.`);
    if (volume.uncertainEffective > 0) explanation += L(` ${volume.uncertainEffective.toFixed(1)} of the credited sets have unknown effort (no RIR).`, ` У ${num(volume.uncertainEffective, 1)} из засчитанных подходов усилие неизвестно (нет RIR).`);
    if (status === 'at_risk') explanation += L(` With ~${expectedRemainingSessions} session(s) likely left, reaching the target would need more than ~${sessionCap} sets in a session — don't cram; the rest simply carries over.`,
      ` Тренировок, вероятно, осталось ~${expectedRemainingSessions}: чтобы достичь цели, понадобилось бы больше ~${sessionCap} подходов за тренировку — не пытайтесь уместить всё; остаток просто переносится.`);

    // Today's plan is fixed for the whole day: it is based on what remained when the day started,
    // so it does not shrink while you log, and today's own sets never mark the muscle "recovering".
    const doneToday = round2(todayVol.muscles[m].effective);
    const remainingAtDayStart = roundHalf(Math.max(0, target.preferred - (completed - doneToday)));
    const todayBlocked = planRec.status === 'recovering' && planRec.hoursLeft > RECOVERY_TOLERANCE_H;
    let todayShare = 0;
    let carryOver = 0;
    let shareRaised = false;
    let todayNote: string;
    if (remainingAtDayStart <= 0) todayNote = 'Target met';
    else if (todayBlocked) todayNote = L(`Still recovering (~${planRec.hoursLeft} h) — better next session`, `Ещё восстанавливается (~${planRec.hoursLeft} ч) — лучше на следующей тренировке`);
    else if (sessionsLeftInclToday <= 0) todayNote = L('Week is over', 'Неделя закончилась');
    else {
      // Whole sets per session, but never more than what is actually left this week.
      todayShare = Math.min(sessionCap, remainingAtDayStart, Math.ceil(remainingAtDayStart / sessionsLeftInclToday));
      carryOver = roundHalf(Math.max(0, remainingAtDayStart - sessionCap * sessionsLeftInclToday));
      todayNote = sessionsLeftInclToday === 1
        ? L('Likely your last session this week', 'Вероятно, последняя тренировка на этой неделе')
        : L(`${remainingAtDayStart} left ÷ ~${sessionsLeftInclToday} sessions`, `осталось ${num(remainingAtDayStart)} ÷ ~${sessionsLeftInclToday} трен.`);
      if (laterUsual) {
        // Part 7 #13: the share that still lets the later usual days finish the week outside the recovery windows.
        const fitIn: FitInput = { remaining: remainingAtDayStart, cap: sessionCap, base: todayShare, later: laterUsual, large: MUSCLE_BY_ID[m].size === 'large', toleranceH: RECOVERY_TOLERANCE_H };
        const fit = fitToday(fitIn);
        shareRaised = fit.share > todayShare;
        todayShare = fit.share;
        carryOver = fit.shortBy;
        // Only muscles the owner actually trains (any effective sets in the recent weeks) can be suggested for an extra session.
        if (recentWeeks.some((w) => w.volume.muscles[m].effective > 0)) fits.push({ muscle: m, fit: fitIn, share: fit.share, shortBy: fit.shortBy });
        if (shareRaised) todayNote += laterUsual.length
          ? L(` · ${todayShare} today: fewer would leave your next usual day inside the recovery window`, ` · сегодня ${num(todayShare)}: при меньшем числе следующий обычный день попадёт в окно восстановления`)
          : L(` · ${todayShare} today: no usual training day is left this week`, ` · сегодня ${num(todayShare)}: обычных тренировочных дней на этой неделе больше нет`);
        if (carryOver > 0) todayNote += L(` · ~${carryOver} will not fit your usual days this week (fine — nothing to make up)`, ` · ~${num(carryOver)} не поместится в ваши обычные дни на этой неделе (это нормально — догонять не нужно)`);
      } else if (todayShare === sessionCap && carryOver > 0) todayNote += L(` · capped at ${sessionCap} per session; ~${carryOver} carries over (fine)`, ` · не больше ${sessionCap} за тренировку; ~${num(carryOver)} переносится (это нормально)`);
      if (mwTrendDeclining(trend.overall)) todayNote += L(' · keep sets high-quality', ' · следите за качеством подходов');
    }
    const todayLeft = leftOfShare(todayShare, doneToday);

    return {
      muscle: m, target, volume, completed, remainingToMin, remainingToPreferred, pctOfPreferred: pct, status, recovery: rec, trend,
      moreVolumeJustified, justification, explanation, todayShare, doneToday, todayLeft, todayBlocked, sessionCap, carryOver, todayNote,
      targetMet: remainingAtDayStart <= 0, shareRaised,
    };
  });

  const failure = failureProfile(data, { start: week.start, end: today < week.end ? today : week.end }, registry);
  const dismissed = data.settings.extraSessionDismissedWeek === week.start;
  const extraSession = usualDays && !dismissed ? suggestExtraSession(today, week.end, usualDays, fits) : null;
  return {
    today, nowVirtualMs: local.virtualMs, week, daysLeft, registry, weeks, current, learning, targets, recovery, planRecovery, progression, muscles,
    sessionsThisWeek: thisWeek.length, trainedToday, sessionsLeftInclToday, avgSessionsPerWeek: Math.round(avgSessionsPerWeek * 10) / 10, expectedRemainingSessions, failure,
    usualDays, extraSession,
  };
}

function mwTrendDeclining(t: string) {
  return t === 'declining';
}

export function statusLabel(s: WeekStatus): string {
  return {
    done: L('Target met', 'Цель выполнена'), over: L('Above range', 'Выше диапазона'), on_track: L('On track', 'По плану'),
    behind: L('Behind', 'Отставание'), at_risk: L('At risk', 'Под угрозой'), no_data: L('No data', 'Нет данных'),
  }[s];
}
