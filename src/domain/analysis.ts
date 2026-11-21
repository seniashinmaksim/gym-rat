import type { AppData } from './appdata';
import { daysLeftInWeek, diffDays, localNowParts, weekOf, type WeekRange } from './dates';
import { mean, weeklyHistory, type WeekBucket } from './history';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, muscleName } from './muscles';
import { failureProfile, type FailureProfile } from './failure';
import { loadStep } from './increments';
import { buildProgression, warmupFor, type NextLoad, type ProgressionSeries, type WarmupPlan } from './progression';
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
  todayNote: string;
  explanation: string;
}

export interface PlannedExercise {
  exerciseId: string;
  equipmentId: string | null;
  sets: number;
  next: NextLoad | null;
  warmup: WarmupPlan;
  lastUsed: string | null;
  fromHistory: boolean;
}

export interface PlanItem {
  muscle: MuscleId;
  suggestedSets: number;
  reason: string;
  exercises: PlannedExercise[];
}

export interface NextWorkoutPlan {
  priorities: PlanItem[];
  avoid: { muscle: MuscleId; reason: string }[];
  satisfied: MuscleId[];
  notes: string[];
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
  plan: NextWorkoutPlan;
  /** Failure-status profile of the current week (descriptive only; one line for the UI in `failure.line`). */
  failure: FailureProfile;
}

/** A muscle still recovering but within this many hours of the window's end is not held back today. */
export const RECOVERY_TOLERANCE_H = 6;

/** Share of the weekly preferred target suggested at most in one session (spreads it over ≥2 sessions). */
export const MAX_SESSION_SHARE = 0.6;

export function analyze(rawData: AppData, now: Date = new Date()): Analysis {
  // Planned (pre-filled, not yet performed) sets never count toward anything.
  const data: AppData = { ...rawData, workouts: stripPlanned(rawData.workouts) };
  const { timezone, weekStartsOn, quality, perSessionSetCap, defaultTargetRir } = data.settings;
  const local = localNowParts(timezone, now);
  const today = local.date;
  const registry = buildRegistry(data.customExercises, data.exerciseOverrides);
  const week = weekOf(today, weekStartsOn);
  const weeks = weeklyHistory(data, registry, today);
  const thisWeek = data.workouts.filter((w) => w.date >= week.start && w.date <= week.end && w.date <= today);
  const current = computeVolume(thisWeek, registry, quality);
  const learning = learningState(data, today, weeks);
  const progression = buildProgression(data.workouts, registry, data.equipment, data.exerciseOverrides, defaultTargetRir, today, quality.useFeelWhenNoRir !== false, data.locations);
  const recovery = estimateRecovery(data, registry, local.virtualMs, today);
  const planRecovery = estimateRecovery(data, registry, local.virtualMs, today, { before: today });
  const targets = computeTargets({ data, weeks, learning, progression, recovery, registry, today });

  const recentWeeks = weeks.filter((w) => w.complete && w.workouts.length).slice(-4);
  const avgSessionsPerWeek = recentWeeks.length ? mean(recentWeeks.map((w) => w.workouts.length)) : 3;
  const daysLeft = daysLeftInWeek(today, week);
  const todays = thisWeek.filter((w) => w.date === today);
  const trainedToday = todays.length > 0;
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
    else if (completed >= target.preferred) status = 'done';
    else if (remainingToPreferred > achievable && remainingToMin > 0) status = 'at_risk';
    else if (completed >= target.min || pct >= elapsedFrac * 0.8) status = 'on_track';
    else status = 'behind';

    let moreVolumeJustified: MuscleWeek['moreVolumeJustified'];
    let justification: string;
    if (status === 'done' || status === 'over') {
      moreVolumeJustified = 'no';
      justification = status === 'over'
        ? `Above the current upper bound (${target.max}). Extra sets are unlikely to add much (diminishing returns) and add fatigue.`
        : 'Target reached — no additional sets are required just to satisfy a number.';
    } else if (planRec.status === 'recovering' && planRec.hoursLeft > RECOVERY_TOLERANCE_H) {
      moreVolumeJustified = 'wait';
      justification = `Below target, but likely still recovering from the last session (~${planRec.hoursLeft} h more by the heuristic). Train it next session rather than today if possible — this is advice, not a rule.`;
    } else if (trend.overall === 'declining') {
      moreVolumeJustified = 'caution';
      justification = 'Below target, but performance on its main exercises is declining — prioritize quality sets over adding volume.';
    } else {
      moreVolumeJustified = 'yes';
      justification = target.provisional
        ? 'Below the provisional reference. Adding the remaining sets is reasonable if time and recovery allow.'
        : 'Below your individualized target and recovery looks adequate.';
    }

    const name = muscleName(m);
    const tLabel = target.provisional ? 'provisional ' : '';
    const indirectShare = completed > 0 ? Math.round((volume.effectiveIndirect / completed) * 100) : 0;
    let explanation = `${name}: ${completed.toFixed(1)} of your ${tLabel}${target.preferred} weekly effective sets completed (${volume.directSets} direct, ${volume.indirectSets} indirect raw sets).`;
    if (remainingToPreferred > 0) {
      explanation += ` About ${remainingToPreferred} effective sets remain`;
      explanation += remainingToMin > 0 ? ` (${remainingToMin} to reach the lower end of ${target.min}).` : ' to reach the preferred target; the lower end is already met.';
    } else explanation += ' No more sets are needed this week.';
    if (completed > 0 && indirectShare >= 60) explanation += ` ${indirectShare}% of this came from indirect work.`;
    if (volume.uncertainEffective > 0) explanation += ` ${volume.uncertainEffective.toFixed(1)} of the credited sets have unknown effort (no RIR).`;
    if (status === 'at_risk') explanation += ` With ~${expectedRemainingSessions} session(s) likely left, reaching the target would need more than ~${sessionCap} sets in a session — don't cram; the rest simply carries over.`;

    // Today's plan is fixed for the whole day: it is based on what remained when the day started,
    // so it does not shrink while you log, and today's own sets never mark the muscle "recovering".
    const doneToday = round2(todayVol.muscles[m].effective);
    const remainingAtDayStart = roundHalf(Math.max(0, target.preferred - (completed - doneToday)));
    const todayBlocked = planRec.status === 'recovering' && planRec.hoursLeft > RECOVERY_TOLERANCE_H;
    let todayShare = 0;
    let carryOver = 0;
    let todayNote: string;
    if (remainingAtDayStart <= 0) todayNote = 'Target met';
    else if (todayBlocked) todayNote = `Still recovering (~${planRec.hoursLeft} h) — better next session`;
    else if (sessionsLeftInclToday <= 0) todayNote = 'Week is over';
    else {
      // Whole sets per session, but never more than what is actually left this week.
      todayShare = Math.min(sessionCap, remainingAtDayStart, Math.ceil(remainingAtDayStart / sessionsLeftInclToday));
      carryOver = roundHalf(Math.max(0, remainingAtDayStart - sessionCap * sessionsLeftInclToday));
      todayNote = sessionsLeftInclToday === 1
        ? 'Likely your last session this week'
        : `${remainingAtDayStart} left ÷ ~${sessionsLeftInclToday} sessions`;
      if (todayShare === sessionCap && carryOver > 0) todayNote += ` · capped at ${sessionCap} per session; ~${carryOver} carries over (fine)`;
      if (mwTrendDeclining(trend.overall)) todayNote += ' · keep sets high-quality';
    }
    const diff = todayShare - doneToday;
    const todayLeft = diff < 0.5 ? 0 : roundHalf(diff);

    return {
      muscle: m, target, volume, completed, remainingToMin, remainingToPreferred, pctOfPreferred: pct, status, recovery: rec, trend,
      moreVolumeJustified, justification, explanation, todayShare, doneToday, todayLeft, todayBlocked, sessionCap, carryOver, todayNote,
    };
  });

  const plan = planNextWorkout(data, registry, muscles, progression, today, perSessionSetCap);
  const failure = failureProfile(data, { start: week.start, end: today < week.end ? today : week.end }, registry);
  return {
    today, nowVirtualMs: local.virtualMs, week, daysLeft, registry, weeks, current, learning, targets, recovery, planRecovery, progression, muscles,
    sessionsThisWeek: thisWeek.length, trainedToday, sessionsLeftInclToday, avgSessionsPerWeek: Math.round(avgSessionsPerWeek * 10) / 10, expectedRemainingSessions, plan, failure,
  };
}

function planNextWorkout(
  data: AppData,
  registry: Registry,
  muscles: MuscleWeek[],
  progression: ProgressionSeries[],
  today: string,
  cap: number,
): NextWorkoutPlan {
  const notes: string[] = [];
  const avoid: NextWorkoutPlan['avoid'] = [];
  const satisfied: MuscleId[] = [];
  const priorityMult = (m: MuscleId) => (data.settings.priorities[m] === 'high' ? 1.3 : data.settings.priorities[m] === 'maintain' ? 0.5 : 1);
  const candidates: { mw: MuscleWeek; score: number }[] = [];
  for (const mw of muscles) {
    if (mw.status === 'done' || mw.status === 'over') {
      satisfied.push(mw.muscle);
      continue;
    }
    if (mw.todayBlocked) {
      avoid.push({ muscle: mw.muscle, reason: mw.justification });
      continue;
    }
    if (mw.remainingToPreferred <= 0) continue;
    const recMult = mw.recovery.status === 'likely_recovered' ? 1 : 0.8;
    const declining = mw.trend.overall === 'declining' ? 0.7 : 1;
    candidates.push({ mw, score: mw.remainingToPreferred * recMult * declining * priorityMult(mw.muscle) * (MUSCLE_BY_ID[mw.muscle].size === 'large' ? 1.1 : 1) });
  }
  candidates.sort((a, b) => b.score - a.score);

  const lastLocation = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date))[0]?.locationId ?? null;
  const eqById = new Map(data.equipment.map((e) => [e.id, e]));
  const locById = new Map(data.locations.map((l) => [l.id, l]));
  const used = new Set<string>();
  const priorities: PlanItem[] = [];
  for (const { mw } of candidates.slice(0, 5)) {
    const m = mw.muscle;
    const sets = Math.max(1, Math.min(Math.ceil(mw.remainingToPreferred), cap));
    const hist = progression
      .filter((p) => (registry.get(p.exerciseId)?.contributions[m] ?? 0) >= 0.75 && !used.has(p.key))
      .map((p) => {
        const eq = p.equipmentId ? eqById.get(p.equipmentId) : undefined;
        const atLoc = !eq || !lastLocation || eq.locationId === lastLocation;
        const age = p.current ? diffDays(today, p.current.date) : 999;
        return { p, score: p.sessions.length * 2 - age / 7 + (atLoc ? 5 : 0) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    const exercises: PlannedExercise[] = [];
    let prior = 0;
    hist.forEach(({ p }, i) => {
      used.add(p.key);
      const def = registry.get(p.exerciseId);
      const eq = p.equipmentId ? eqById.get(p.equipmentId) : undefined;
      const loc = locById.get(p.locationId ?? lastLocation ?? '');
      const inc = loadStep(eq, loc, def?.equipmentKind, p.loadMode).step;
      const exSets = hist.length === 1 ? sets : i === 0 ? Math.ceil(sets / 2) : Math.floor(sets / 2);
      if (exSets <= 0) return;
      exercises.push({
        exerciseId: p.exerciseId,
        equipmentId: p.equipmentId,
        sets: exSets,
        next: p.next,
        warmup: warmupFor(def, p.next.weight, inc, prior),
        lastUsed: p.current?.date ?? null,
        fromHistory: true,
      });
      prior += exSets;
    });
    if (!exercises.length) {
      const seed = [...registry.values()].find((d) => (d.contributions[m] ?? 0) >= 1 && d.category === 'isolation') ?? [...registry.values()].find((d) => (d.contributions[m] ?? 0) >= 1);
      if (seed) {
        exercises.push({ exerciseId: seed.id, equipmentId: null, sets, next: null, warmup: warmupFor(seed, null, 0, 0), lastUsed: null, fromHistory: false });
      }
    }
    const reasonParts = [`${mw.remainingToPreferred} effective sets below ${mw.target.provisional ? 'the provisional' : 'your'} target of ${mw.target.preferred}`];
    if (mw.recovery.status === 'likely_recovered') reasonParts.push('likely recovered');
    if (data.settings.priorities[m] === 'high') reasonParts.push('marked high priority');
    if (mw.trend.overall === 'declining') reasonParts.push('main lifts declining — keep sets high-quality');
    priorities.push({ muscle: m, suggestedSets: sets, reason: reasonParts.join(' · '), exercises });
  }
  if (!data.workouts.length) notes.push('Log your first workout to start receiving recommendations.');
  if (priorities.length === 0 && data.workouts.length) notes.push('Every muscle is at or above target, or still recovering. A rest day or a light session is a perfectly good choice.');
  if (priorities.some((p) => p.exercises.some((e) => !e.fromHistory))) notes.push('Some suggestions have no personal history yet — treat the first session as calibration.');
  return { priorities, avoid, satisfied, notes };
}

function mwTrendDeclining(t: string) {
  return t === 'declining';
}

export function statusLabel(s: WeekStatus): string {
  return { done: 'Target met', over: 'Above range', on_track: 'On track', behind: 'Behind', at_risk: 'At risk', no_data: 'No data' }[s];
}
