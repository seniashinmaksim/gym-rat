import type { AppData } from './appdata';
import { addDays, diffDays, sessionEndVirtualMs, type SessionTimeSource } from './dates';
import { MUSCLE_BY_ID, TRACKED_MUSCLES } from './muscles';
import { isFailureSetForFatigue } from './failure';
import { sideFactors } from './quality';
import type { Registry } from './registry';
import type { MuscleId } from './types';
import { computeVolume, sessionMuscleEffective } from './volume';

export type RecoveryStatus = 'likely_recovered' | 'recovering' | 'insufficient_data';

export interface RecoveryEstimate {
  muscle: MuscleId;
  status: RecoveryStatus;
  /** Rough probability-style readiness 0..1 (heuristic, not a biological measurement). */
  readiness: number | null;
  hoursSince: number | null;
  lastStimulusDate: string | null;
  /** Local time (HH:mm) the last significant session ended, and how that time is known. */
  lastStimulusTime: string | null;
  lastStimulusTimeSource: SessionTimeSource | null;
  lastStimulusSets: number;
  windowHours: number | null;
  /** Hours until the window ends (0 when recovered or no data). */
  hoursLeft: number;
  recent7dEffective: number;
  recent7dDirect: number;
  recent7dIndirect: number;
  exposures14d: number;
  soreness: number | null;
  factors: string[];
}

export const TIME_SOURCE_LABEL: Record<SessionTimeSource, string> = {
  last_set: 'when the last set was ticked',
  end_time: 'session end time',
  start_plus_duration: 'start time + duration',
  start_time: 'start time — no end time recorded',
  assumed: 'no time recorded — 18:00 assumed',
};

/**
 * Exercise ids that are the SAME movement for the "new exercise" (+12 h) rule. Some exercises were
 * split into more specific ids later (e.g. pushdown → bar / rope); switching between members of one
 * family is not a novel stimulus. Deliberately NOT paired: hanging_leg_raise vs
 * hanging_knee_raise_pelvic_curl (different exercises).
 */
export const MOVEMENT_FAMILIES: readonly (readonly string[])[] = [
  ['triceps_pushdown', 'triceps_pushdown_bar', 'triceps_pushdown_rope'],
  ['barbell_curl', 'ez_bar_curl'],
  ['preacher_curl', 'machine_biceps_curl'],
  ['romanian_deadlift', 'dumbbell_romanian_deadlift'],
];

const FAMILY_OF = new Map<string, string>(MOVEMENT_FAMILIES.flatMap((f) => f.map((id) => [id, f[0]] as const)));

/** Canonical movement id for novelty checks (the exercise id itself when it has no family). */
export function movementFamily(exerciseId: string): string {
  return FAMILY_OF.get(exerciseId) ?? exerciseId;
}

export function sameMovement(a: string, b: string): boolean {
  return movementFamily(a) === movementFamily(b);
}

/** Baseline window by the size of the last significant session (effective sets for the muscle). */
export function baseWindowHours(sets: number): number {
  return sets <= 3 ? 24 : sets <= 6 ? 36 : sets <= 9 ? 48 : sets <= 12 ? 60 : 72;
}

export interface RecoveryOptions {
  /** Ignore sessions dated on/after this day (planning view: "entering today's session"). */
  before?: string;
}

/**
 * Heuristic recovery model. Recovery time scales with the size of the last stimulus and is
 * extended by failure training, exercise novelty, reported soreness, short sleep and high
 * fatigue. Familiar, non-failure work largely recovers within 24–48 h; failure sets add
 * roughly a day (Morán-Navarro 2017); new exercises cause more damage (Damas 2016/2018).
 * Output is guidance, not a claim about the true biological state of the muscle.
 */
export function estimateRecovery(data: AppData, registry: Registry, nowVirtualMs: number, today: string, opts: RecoveryOptions = {}): Record<MuscleId, RecoveryEstimate> {
  const { quality, significantStimulusSets, timezone } = data.settings;
  // Recovery is counted from when the session ENDED (last ticked set, end time, start + duration,
  // start time, else an assumed 18:00). A session dated today or earlier whose estimated time is
  // still in the future has obviously already happened (it was logged), so it is treated as "now".
  const endCache = new Map<string, { ms: number; source: SessionTimeSource }>();
  const endOf = (w: (typeof data.workouts)[number]) => {
    let e = endCache.get(w.id);
    if (!e) {
      e = sessionEndVirtualMs(w, timezone);
      endCache.set(w.id, e);
    }
    return e;
  };
  const at = (w: (typeof data.workouts)[number]) => {
    const v = endOf(w).ms;
    return w.date <= today && v > nowVirtualMs ? nowVirtualMs : v;
  };
  const pool = opts.before ? data.workouts.filter((w) => w.date < opts.before!) : data.workouts;
  const sorted = [...pool].sort((a, b) => at(b) - at(a));
  const recent7 = data.workouts.filter((w) => diffDays(today, w.date) >= 0 && diffDays(today, w.date) < 7);
  const vol7 = computeVolume(recent7, registry, quality);
  const recent14 = sorted.filter((w) => diffDays(today, w.date) >= 0 && diffDays(today, w.date) < 14);
  const perSession14 = recent14.map((w) => sessionMuscleEffective(w, registry, quality));

  // Subjective inputs from the last 3 days (daily logs + session wellness).
  const since = addDays(today, -2);
  const recentDaily = data.daily.filter((d) => d.date >= since && d.date <= today);
  const recentWell = data.workouts.filter((w) => w.date >= since && w.date <= today && w.wellness).map((w) => w.wellness!);
  const sleepVals = [...recentDaily.map((d) => d.sleepHours), ...recentWell.map((w) => w.sleepHours)].filter((v): v is number => v != null);
  const fatigueVals = [...recentDaily.map((d) => d.fatigue), ...recentWell.map((w) => w.fatigue)].filter((v): v is number => v != null);
  const avgSleep = sleepVals.length ? sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length : null;
  const maxFatigue = fatigueVals.length ? Math.max(...fatigueVals) : null;

  const out = {} as Record<MuscleId, RecoveryEstimate>;
  for (const m of TRACKED_MUSCLES) {
    const factors: string[] = [];
    let last: { date: string; sets: number; workout: (typeof sorted)[number] } | null = null;
    for (const w of sorted) {
      if (at(w) > nowVirtualMs) continue;
      const eff = sessionMuscleEffective(w, registry, quality)[m] ?? 0;
      if (eff >= significantStimulusSets) {
        last = { date: w.date, sets: eff, workout: w };
        break;
      }
    }
    const soreVals = [
      ...recentDaily.map((d) => d.soreness?.[m]),
      ...recentWell.map((w) => w.soreness?.[m]),
    ].filter((v): v is number => v != null);
    const soreness = soreVals.length ? Math.max(...soreVals) : null;
    const v7 = vol7.muscles[m];
    const exposures14d = perSession14.filter((s) => (s[m] ?? 0) >= significantStimulusSets).length;
    const base = {
      muscle: m,
      recent7dEffective: v7.effective,
      recent7dDirect: v7.directSets,
      recent7dIndirect: v7.indirectSets,
      exposures14d,
      soreness,
    };

    if (!last) {
      out[m] = {
        ...base, status: 'insufficient_data', readiness: null, hoursSince: null, lastStimulusDate: null, lastStimulusTime: null, lastStimulusTimeSource: null, lastStimulusSets: 0,
        windowHours: null, hoursLeft: 0,
        factors: [`No session with ≥${significantStimulusSets} effective sets for this muscle is recorded.`],
      };
      continue;
    }

    const endedAt = at(last.workout);
    const src = endOf(last.workout).source;
    const hoursSince = Math.max(0, (nowVirtualMs - endedAt) / 3_600_000);
    const endedHHMM = new Date(endedAt).toISOString().slice(11, 16);
    factors.push(`Counted from ${endedHHMM} on ${new Date(endedAt).toISOString().slice(0, 10)} (${TIME_SOURCE_LABEL[src]}) — ${Math.round(hoursSince)} h ago.`);
    let window = baseWindowHours(last.sets);
    factors.push(`Last significant stimulus: ${last.sets.toFixed(1)} effective sets → baseline window ~${window} h.`);
    if (MUSCLE_BY_ID[m].size === 'large' && last.sets > 9) {
      window += 12;
      factors.push('Large muscle with a very high-volume session: +12 h.');
    }
    // Sets taken to failure slow recovery by roughly a day (Morán-Navarro 2017); unfamiliar
    // exercises cause more damage than familiar ones (repeated-bout effect, Damas 2016/2018).
    const hitsM = (exId: string, min: number) => (registry.get(exId)?.contributions[m] ?? 0) >= min;
    // A left + right pair to failure is one set, not two.
    const failureSets = last.workout.exercises.filter((e) => hitsM(e.exerciseId, 0.5)).reduce((n, e) => {
      const f = sideFactors(e.sets);
      // Fail chip / RIR 0 / muscular failure / technical failure all count as a failure set here.
      return n + e.sets.filter((s) => s.type !== 'warmup' && !s.planned && isFailureSetForFatigue(s)).reduce((a, s) => a + (f.get(s.id) ?? 1), 0);
    }, 0);
    if (failureSets >= 2) {
      window += 12;
      factors.push(`${failureSets} sets to failure in that session: +12 h.`);
    }
    const lastDate = last.date;
    const novel = last.workout.exercises.filter((e) => hitsM(e.exerciseId, 0.75)).filter((e) =>
      !data.workouts.some((o) => o.date < lastDate && diffDays(lastDate, o.date) <= 21 && o.exercises.some((x) => sameMovement(x.exerciseId, e.exerciseId))));
    if (novel.length && data.workouts.some((o) => o.date < lastDate)) {
      window += 12;
      factors.push('Exercise new to you in the last 3 weeks (more muscle damage expected): +12 h.');
    }
    if (soreness != null && soreness >= 3) {
      window += 24;
      factors.push(`Reported soreness ${soreness}/4: +24 h.`);
    } else if (soreness != null && soreness >= 2) {
      window += 12;
      factors.push(`Reported soreness ${soreness}/4: +12 h.`);
    }
    if (avgSleep != null && avgSleep < 6) {
      window += 12;
      factors.push(`Recent sleep ~${avgSleep.toFixed(1)} h (<6 h): +12 h.`);
    }
    if (maxFatigue != null && maxFatigue >= 4) {
      window += 12;
      factors.push(`High reported fatigue (${maxFatigue}/5): +12 h.`);
    }
    const readiness = Math.max(0, Math.min(1, hoursSince / window));
    let status: RecoveryStatus = hoursSince >= window ? 'likely_recovered' : 'recovering';
    if (soreness != null && soreness >= 3 && status === 'likely_recovered') {
      status = 'recovering';
      factors.push('Still reporting marked soreness — treated as recovering.');
    }
    if (hoursSince > 240) factors.push('More than 10 days since the last significant stimulus.');
    if (soreness == null && avgSleep == null) factors.push('No soreness/sleep data recently — estimate is based on training load only.');
    out[m] = {
      ...base, status, readiness: Math.round(readiness * 100) / 100, hoursSince: Math.round(hoursSince), lastStimulusDate: last.date,
      lastStimulusTime: endedHHMM, lastStimulusTimeSource: src,
      lastStimulusSets: last.sets, windowHours: window, hoursLeft: status === 'recovering' ? Math.max(0, Math.round(window - hoursSince)) : 0, factors,
    };
  }
  return out;
}
