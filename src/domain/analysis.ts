import type { AppData } from './appdata';
import { daysLeftInWeek, diffDays, localNowParts, weekOf, type WeekRange } from './dates';
import { mean, weeklyHistory, type WeekBucket } from './history';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, muscleName } from './muscles';
import { buildProgression, defaultIncrement, warmupFor, type NextLoad, type ProgressionSeries, type WarmupPlan } from './progression';
import { roundHalf } from './quality';
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
  /** Suggested effective sets for the session today = remaining ÷ sessions likely left (0 if recovering/done). */
  todayShare: number;
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
  progression: ProgressionSeries[];
  muscles: MuscleWeek[];
  sessionsThisWeek: number;
  sessionsLeftInclToday: number;
  avgSessionsPerWeek: number;
  expectedRemainingSessions: number;
  plan: NextWorkoutPlan;
}

export function analyze(data: AppData, now: Date = new Date()): Analysis {
  const { timezone, weekStartsOn, quality, perSessionSetCap, defaultTargetRir } = data.settings;
  const local = localNowParts(timezone, now);
  const today = local.date;
  const registry = buildRegistry(data.customExercises, data.exerciseOverrides);
  const week = weekOf(today, weekStartsOn);
  const weeks = weeklyHistory(data, registry, today);
  const thisWeek = data.workouts.filter((w) => w.date >= week.start && w.date <= week.end && w.date <= today);
  const current = computeVolume(thisWeek, registry, quality);
  const learning = learningState(data, today, weeks);
  const progression = buildProgression(data.workouts, registry, data.equipment, data.exerciseOverrides, defaultTargetRir, today);
  const recovery = estimateRecovery(data, registry, local.virtualMs, today);
  const targets = computeTargets({ data, weeks, learning, progression, recovery, registry });

  const recentWeeks = weeks.filter((w) => w.complete && w.workouts.length).slice(-4);
  const avgSessionsPerWeek = recentWeeks.length ? mean(recentWeeks.map((w) => w.workouts.length)) : 3;
  const daysLeft = daysLeftInWeek(today, week);
  const trainedToday = thisWeek.some((w) => w.date === today);
  const effDays = trainedToday ? Math.max(0, daysLeft - 1) : daysLeft;
  const expectedRemainingSessions = Math.max(effDays > 0 ? 1 : 0, Math.round((avgSessionsPerWeek * effDays) / 7));
  const achievable = expectedRemainingSessions * perSessionSetCap;
  const elapsedFrac = Math.min(1, (7 - daysLeft + 1) / 7);
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
    const trend = muscleTrendSummary(m, progression, registry);
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
    } else if (rec.status === 'recovering') {
      moreVolumeJustified = 'wait';
      const hrs = rec.windowHours != null && rec.hoursSince != null ? Math.max(0, rec.windowHours - rec.hoursSince) : null;
      justification = `Below target, but likely still recovering${hrs ? ` (~${hrs} h more by the heuristic)` : ''}. Train it next session rather than today if possible.`;
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
    if (status === 'at_risk') explanation += ` With ~${expectedRemainingSessions} session(s) likely left, reaching the target would need more than ~${perSessionSetCap} sets/session — don't cram; carry the focus into next week.`;

    let todayShare = 0;
    let todayNote: string;
    if (remainingToPreferred <= 0) todayNote = 'Target met';
    else if (rec.status === 'recovering') todayNote = 'Let it recover first';
    else if (sessionsLeftInclToday <= 0) todayNote = 'Week is over';
    else {
      todayShare = Math.min(perSessionSetCap, Math.ceil(remainingToPreferred / sessionsLeftInclToday));
      todayNote = sessionsLeftInclToday === 1
        ? 'Likely your last session this week'
        : `${remainingToPreferred} left ÷ ~${sessionsLeftInclToday} sessions`;
      if (mwTrendDeclining(trend.overall)) todayNote += ' · keep sets high-quality';
    }

    return { muscle: m, target, volume, completed, remainingToMin, remainingToPreferred, pctOfPreferred: pct, status, recovery: rec, trend, moreVolumeJustified, justification, explanation, todayShare, todayNote };
  });

  const plan = planNextWorkout(data, registry, muscles, progression, today, perSessionSetCap);
  return {
    today, nowVirtualMs: local.virtualMs, week, daysLeft, registry, weeks, current, learning, targets, recovery, progression, muscles,
    sessionsThisWeek: thisWeek.length, sessionsLeftInclToday, avgSessionsPerWeek: Math.round(avgSessionsPerWeek * 10) / 10, expectedRemainingSessions, plan,
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
    if (mw.recovery.status === 'recovering') {
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
      const inc = eq?.incrementsKg?.length ? Math.min(...eq.incrementsKg) : defaultIncrement(def?.equipmentKind, p.loadMode);
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
