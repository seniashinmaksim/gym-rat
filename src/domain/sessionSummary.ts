/**
 * Numbers for the end-of-workout summary. Uses the same engine as everything else (effective sets via
 * sessionMuscleEffective, comparable histories via progressionKey) — no separate maths.
 */
import { benchmarkExclusion, isCompromised } from './feedback';
import { effectiveFailure } from './failure';
import { progressionKey } from './progression';
import { countedSetCount } from './quality';
import type { Registry } from './registry';
import type { MuscleId, QualityModel, Workout, WorkoutSet } from './types';
import { sessionMuscleEffective } from './volume';

export interface SessionRecord {
  exerciseId: string;
  kind: 'weight' | 'reps';
  /** e.g. "27.5 kg (was 25)" or "12 reps at 25 kg (was 10)" */
  text: string;
}

export interface SessionSummary {
  durationMin: number | null;
  exercises: number;
  skippedExercises: number;
  workingSets: number;
  warmupSets: number;
  /** Σ weight × reps of performed working/drop sets as logged (per dumbbell for dumbbells; assisted excluded). */
  tonnageKg: number;
  /** Mean rest before working sets where rest was measured or entered; null when none. */
  avgRestSec: number | null;
  muscles: { muscle: MuscleId; effective: number }[];
  records: SessionRecord[];
  muscularFailureSets: number;
  technicalFailureSets: number;
  compromisedSets: number;
}

const performed = (s: WorkoutSet) => !s.planned;
const isWork = (s: WorkoutSet) => s.type === 'working' || s.type === 'drop';

export function minutesBetween(date: string, startTime: string | null | undefined, now: { date: string; time: string }): number | null {
  if (!startTime || date !== now.date) return null;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = now.time.split(':').map(Number);
  const d = eh * 60 + em - (sh * 60 + sm);
  return d >= 0 && d < 600 ? d : null;
}

export function summarizeSession(w: Workout, all: Workout[], registry: Registry, model: QualityModel, now: { date: string; time: string }): SessionSummary {
  const exs = w.exercises.filter((e) => e.sets.some(performed));
  const sets = exs.flatMap((e) => e.sets.filter(performed));
  const work = sets.filter(isWork);
  const rests = work.map((s) => s.restSecBefore).filter((r): r is number => r != null && r > 0);
  const eff = sessionMuscleEffective({ ...w, exercises: exs.map((e) => ({ ...e, sets: e.sets.filter(performed) })) }, registry, model);

  // Records against EARLIER comparable sessions only (same exercise × equipment × configuration).
  const records: SessionRecord[] = [];
  for (const e of exs) {
    const def = registry.get(e.exerciseId);
    const key = progressionKey(e, w, def);
    // Records only from sets that can judge progress (never wrong weight, pain, compromised technique or technical failure).
    const clean = (s: WorkoutSet) => performed(s) && s.type === 'working' && s.weightKg != null && s.reps != null && s.loadMode !== 'assisted' && !benchmarkExclusion(s) && !s.technicalFailure;
    const mine = e.sets.filter(clean);
    if (!mine.length) continue;
    const prev = all
      .filter((o) => o.id !== w.id && (o.date < w.date || (o.date === w.date && (o.createdAt ?? '') < (w.createdAt ?? ''))))
      .flatMap((o) => o.exercises.filter((x) => x.exerciseId === e.exerciseId && progressionKey(x, o, def) === key).flatMap((x) => x.sets))
      .filter(clean);
    if (!prev.length) continue; // first time on this machine/configuration: nothing to beat
    const top = Math.max(...mine.map((s) => s.weightKg as number));
    const prevTop = Math.max(...prev.map((s) => s.weightKg as number));
    if (top > prevTop) {
      records.push({ exerciseId: e.exerciseId, kind: 'weight', text: `${top} kg (was ${prevTop})` });
      continue;
    }
    const repsAt = (xs: WorkoutSet[], wt: number) => Math.max(0, ...xs.filter((s) => s.weightKg === wt).map((s) => s.reps as number));
    const r = repsAt(mine, top);
    const pr = repsAt(prev, top);
    if (pr > 0 && r > pr) records.push({ exerciseId: e.exerciseId, kind: 'reps', text: `${r} reps at ${top} kg (was ${pr})` });
  }

  return {
    durationMin: w.durationMin ?? minutesBetween(w.date, w.startTime, now),
    exercises: exs.length,
    skippedExercises: w.exercises.filter((e) => e.skipped).length,
    workingSets: exs.reduce((n, e) => n + countedSetCount(e.sets.filter(performed)), 0),
    warmupSets: sets.filter((s) => s.type === 'warmup').length,
    tonnageKg: Math.round(work.filter((s) => s.loadMode !== 'assisted').reduce((t, s) => t + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
    avgRestSec: rests.length ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length) : null,
    muscles: (Object.entries(eff) as [MuscleId, number][]).filter(([, v]) => v > 0.04).map(([muscle, v]) => ({ muscle, effective: Math.round(v * 10) / 10 })).sort((a, b) => b.effective - a.effective),
    records,
    muscularFailureSets: work.filter((s) => effectiveFailure(s).status === 'muscular').length,
    technicalFailureSets: work.filter((s) => s.technicalFailure === true).length,
    compromisedSets: work.filter((s) => isCompromised(s)).length,
  };
}

/**
 * Rest actually taken before a set: time since the previous completed set OF THE SAME EXERCISE,
 * minus ~3 s per rep of this set (time under load). Time between exercises is not rest between sets.
 * Uses stored timestamps, so it survives reloads, locking and backgrounding.
 */
export function measuredRestSec(prevCompletedAt: string | null | undefined, nowMs: number, reps: number | null): number | null {
  if (!prevCompletedAt) return null;
  const gap = Math.round((nowMs - Date.parse(prevCompletedAt)) / 1000 - (reps ?? 8) * 3);
  return gap > 0 && gap < 1800 ? gap : null;
}
