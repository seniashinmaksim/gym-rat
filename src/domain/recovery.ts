import type { AppData } from './appdata';
import { addDays, diffDays, workoutVirtualMs } from './dates';
import { MUSCLE_BY_ID, TRACKED_MUSCLES } from './muscles';
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
  lastStimulusSets: number;
  windowHours: number | null;
  recent7dEffective: number;
  recent7dDirect: number;
  recent7dIndirect: number;
  exposures14d: number;
  soreness: number | null;
  factors: string[];
}

/**
 * Heuristic recovery model. Recovery time scales with the size of the last stimulus and
 * is extended by reported soreness, short sleep and high fatigue. Output is guidance,
 * not a claim about the true biological state of the muscle.
 */
export function estimateRecovery(data: AppData, registry: Registry, nowVirtualMs: number, today: string): Record<MuscleId, RecoveryEstimate> {
  const { quality, significantStimulusSets } = data.settings;
  const sorted = [...data.workouts].sort((a, b) => workoutVirtualMs(b.date, b.startTime) - workoutVirtualMs(a.date, a.startTime));
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
    let last: { date: string; startTime?: string | null; sets: number; workout: (typeof sorted)[number] } | null = null;
    for (const w of sorted) {
      if (workoutVirtualMs(w.date, w.startTime) > nowVirtualMs) continue;
      const eff = sessionMuscleEffective(w, registry, quality)[m] ?? 0;
      if (eff >= significantStimulusSets) {
        last = { date: w.date, startTime: w.startTime, sets: eff, workout: w };
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
        ...base, status: 'insufficient_data', readiness: null, hoursSince: null, lastStimulusDate: null, lastStimulusSets: 0,
        windowHours: null,
        factors: [`No session with ≥${significantStimulusSets} effective sets for this muscle is recorded.`],
      };
      continue;
    }

    const hoursSince = Math.max(0, (nowVirtualMs - workoutVirtualMs(last.date, last.startTime)) / 3_600_000);
    let window = last.sets <= 3 ? 36 : last.sets <= 6 ? 48 : last.sets <= 9 ? 72 : 96;
    factors.push(`Last significant stimulus: ${last.sets.toFixed(1)} effective sets → baseline window ~${window} h.`);
    if (MUSCLE_BY_ID[m].size === 'large' && last.sets > 3) {
      window += 12;
      factors.push('Large muscle with a substantial session: +12 h.');
    }
    // Sets taken to failure slow recovery by roughly a day (Morán-Navarro 2017); unfamiliar
    // exercises cause more damage than familiar ones (repeated-bout effect, Damas 2016/2018).
    const hitsM = (exId: string, min: number) => (registry.get(exId)?.contributions[m] ?? 0) >= min;
    const failureSets = last.workout.exercises.filter((e) => hitsM(e.exerciseId, 0.5))
      .flatMap((e) => e.sets).filter((s) => s.type !== 'warmup' && (s.toFailure || s.rir === 0)).length;
    if (failureSets >= 2) {
      window += 12;
      factors.push(`${failureSets} sets to failure in that session: +12 h.`);
    }
    const lastDate = last.date;
    const novel = last.workout.exercises.filter((e) => hitsM(e.exerciseId, 0.75)).filter((e) =>
      !data.workouts.some((o) => o.date < lastDate && diffDays(lastDate, o.date) <= 21 && o.exercises.some((x) => x.exerciseId === e.exerciseId)));
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
      lastStimulusSets: last.sets, windowHours: window, factors,
    };
  }
  return out;
}
