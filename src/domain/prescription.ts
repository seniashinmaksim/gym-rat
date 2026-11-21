/**
 * Prescription engine ("presc-1"): what to do on ONE exercise in the live session — warm-ups,
 * working sets (load, reps, RIR, rest) and how many — plus set-by-set adjustment from what was
 * actually performed.
 *
 * Principles (CLAUDE.md sections C, D, G and "Weekly targets, today's share and recovery"):
 * - Everything is per progression key (exercise × equipment instance × configuration). A new
 *   machine or variation is a new key and starts calibrating; loads are never carried across.
 * - The load decision reuses the double-progression rules of `suggestNextLoad` / `adviceFor`
 *   (never an increase after one good set; pain / broken technique rules respected).
 * - Reps per set come from the owner's OWN reps at that load on this key and their usual
 *   within-session rep drop — not from one fixed range.
 * - Set count comes from today's share of the exercise's PRIMARY muscle (analysis), minus what
 *   other exercises already gave that muscle today. Never crams, never forces extra sets.
 * - Warm-ups are prescribed but never counted.
 * - Pure and deterministic: no storage, no clock (pass `now`).
 *
 * Every number here is a practical heuristic, not a measurement; confidence says how much
 * personal data stands behind it.
 */
import type { AppData } from './appdata';
import { diffDays, localNowParts } from './dates';
import { benchmarkExclusion, hasPain, techniqueOf } from './feedback';
import { loadStep, type IncrementSource } from './increments';
import {
  adviceFor, classifyTrend, progressionKey, roundToIncrement, stepLoad, suggestNextLoad, warmupFor,
  type Advice, type SessionPerf, type SetPoint,
} from './progression';
import { computeVolume } from './volume';
import { countedSetCount, isCounted } from './quality';
import { resolveCoefficients } from './registry';
import type { analyze } from './analysis';
import type {
  Equipment, EquipmentKind, ExerciseDef, LoadMode, Location, MuscleId, SetPrescription, Workout, WorkoutExercise, WorkoutSet,
} from './types';

export const PRESCRIPTION_ENGINE = 'presc-1';

/** Comparable sessions are counted within this window (same as the trend window). */
export const CONFIDENCE_WINDOW_DAYS = 56;

export type PrescriptionConfidence = 'high' | 'moderate' | 'low';
export type LoadDecision = 'increase' | 'keep' | 'reduce' | 'calibrate';

export interface PrescribedSet {
  weightKg: number | null;
  repsMin: number;
  repsMax: number;
  rirMin: number;
  rirMax: number;
  /** Rest before this set, from the owner's own median rest on this key; null = no rest history. */
  restSec: [number, number] | null;
}

export interface PrescribedWarmup {
  weightKg: number | null;
  reps: number;
}

export interface Prescription {
  engine: typeof PRESCRIPTION_ENGINE;
  /** Progression key: exercise × equipment × configuration. */
  key: string;
  exerciseId: string;
  equipmentId: string | null;
  loadMode: LoadMode;
  /** Comparable (representative) sessions on this key within the last 8 weeks, today's session excluded. */
  sessionsUsed: number;
  /** high ≥ 4, moderate 2–3, low 0–1 comparable sessions. Calendar days alone never raise it. */
  confidence: PrescriptionConfidence;
  status: 'ready' | 'calibrating';
  confidenceReason: string;

  decision: LoadDecision;
  /** One line: why this load. */
  decisionWhy: string;
  /** The app's standard per-exercise advice for the same history (Strength page wording). */
  advice: Advice;
  workingWeightKg: number | null;
  /** Real load step for this equipment / gym (loadStep), and where it came from. */
  step: number;
  stepSource: IncrementSource;
  minKg: number | null;
  maxKg: number | null;

  warmups: PrescribedWarmup[];
  warmupReason: string;

  /** Working sets for the WHOLE exercise this session (sets already done included). */
  sets: PrescribedSet[];
  setCount: number;
  setCountReason: string;
  primaryMuscle: MuscleId | null;
  primaryCoefficient: number;

  /** Sensible rep bounds for this exercise (category bounds, widened by the owner's history). */
  repBounds: [number, number];
  repSource: 'history' | 'estimate' | 'exercise_default';
  /** Typical reps lost per set at the owner's usual rest (median; 1 when unknown). */
  repDropPerSet: number;

  rirTarget: [number, number];
  rirReason: string;

  rest: { range: [number, number]; source: 'history' | 'bounds'; medianSec: number | null; reason: string };

  /** Short notes, only when needed. */
  notes: string[];
}

export interface PrescribeInput {
  data: AppData;
  analysis: ReturnType<typeof analyze>;
  now: Date;
  /** The live session (may already contain done sets). */
  workout: Workout;
  exerciseIndex: number;
}

// ---------------------------------------------------------------- helpers

const FREE_WEIGHT: EquipmentKind[] = ['barbell', 'dumbbell', 'kettlebell'];
const ISOLATION_BOUNDS: [number, number] = [8, 20];
const COMPOUND_BOUNDS: [number, number] = [5, 12];
const ISOLATION_REST: [number, number] = [60, 180];
const COMPOUND_REST: [number, number] = [120, 300];
const MAX_SETS = { isolation: 4, compound: 5 } as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round15 = (s: number) => Math.round(s / 15) * 15;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const FALLBACK_DEF = (id: string, kind: EquipmentKind): ExerciseDef => ({
  id, name: { en: id, ru: id }, aliases: [], pattern: 'other', category: 'isolation', equipmentKind: kind,
  contributions: {}, repRange: [8, 12], defaultRestSec: 90, biomechanics: '',
});

/** Free-weight compound (squat, RDL, barbell / dumbbell presses, free-weight rows): technique-first, RIR 2–3. */
export function isFreeWeightCompound(def: Pick<ExerciseDef, 'category' | 'equipmentKind'>): boolean {
  return def.category === 'compound' && FREE_WEIGHT.includes(def.equipmentKind);
}

const doneWorking = (sets: WorkoutSet[]) => sets.filter((s) => isCounted(s) && s.type === 'working');
const isBroken = (s: WorkoutSet) => {
  const t = techniqueOf(s);
  return t === 'compromised' || t === 'failed' || s.technicalFailure === true;
};
const hitLimit = (s: WorkoutSet) => s.rir === 0 || s.toFailure === true || s.failure === 'muscular' || s.technicalFailure === true;

/** Raw history entries (earlier workouts) on this key, oldest first. Planned sets removed. */
function rawHistory(data: AppData, current: Workout, key: string, defOf: (id: string) => ExerciseDef | undefined) {
  const out: { workout: Workout; ex: WorkoutExercise }[] = [];
  const sorted = [...data.workouts].filter((w) => w.id !== current.id)
    .sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  for (const w of sorted) {
    for (const e of w.exercises) {
      if (progressionKey(e, w, defOf(e.exerciseId)) !== key) continue;
      const sets = e.sets.filter(isCounted);
      if (sets.some((s) => s.type === 'working')) out.push({ workout: w, ex: { ...e, sets } });
    }
  }
  return out;
}

/** Snap a load to what exists on this equipment / at this gym, inside its min/max. */
function snapLoad(w: number, step: number, source: IncrementSource, minKg: number | null, maxKg: number | null): number {
  let v = w;
  if (step > 0 && source === 'gym_free_weights') v = roundToIncrement(v, step);
  else if (step > 0 && source === 'equipment' && minKg != null) v = Math.round((minKg + Math.round((v - minKg) / step) * step) * 100) / 100;
  if (minKg != null) v = Math.max(minKg, v);
  if (maxKg != null) v = Math.min(maxKg, v);
  return Math.max(0, v);
}

// ---------------------------------------------------------------- prescribe

export function prescribe(input: PrescribeInput): Prescription {
  const { data, analysis, now, workout, exerciseIndex } = input;
  const ex = workout.exercises[exerciseIndex];
  if (!ex) throw new RangeError(`No exercise at index ${exerciseIndex}`);
  const registry = analysis.registry;
  const eq: Equipment | undefined = ex.equipmentId ? data.equipment.find((e) => e.id === ex.equipmentId) : undefined;
  const def = registry.get(ex.exerciseId) ?? FALLBACK_DEF(ex.exerciseId, eq?.kind ?? 'other');
  const location: Location | undefined = workout.locationId ? data.locations.find((l) => l.id === workout.locationId) : undefined;
  const override = data.exerciseOverrides.find((o) => o.id === def.id);
  const today = localNowParts(data.settings.timezone, now).date;
  const compound = def.category === 'compound';
  const freeCompound = isFreeWeightCompound(def);
  const notes: string[] = [];

  const key = progressionKey(ex, workout, def);
  const series = analysis.progression.find((p) => p.key === key);
  // Today's own sets never shape today's prescription (keeps it stable while logging).
  const hist: SessionPerf[] = (series?.sessions ?? []).filter((s) => s.workoutId !== workout.id && s.date <= today);
  const raw = rawHistory(data, workout, key, (id) => registry.get(id));
  const loadMode: LoadMode = (ex.sets.find((s) => s.type === 'working')?.loadMode
    ?? raw[raw.length - 1]?.ex.sets.find((s) => s.type === 'working')?.loadMode
    ?? (series?.loadMode as LoadMode | undefined) ?? 'total');
  const assisted = loadMode === 'assisted';

  // ---- confidence
  const comparable = hist.filter((s) => s.representative && diffDays(today, s.date) <= CONFIDENCE_WINDOW_DAYS);
  const sessionsUsed = comparable.length;
  const confidence: PrescriptionConfidence = sessionsUsed >= 4 ? 'high' : sessionsUsed >= 2 ? 'moderate' : 'low';
  const where = ex.equipmentId ? 'on this machine' : def.equipmentKind === 'bodyweight' ? 'for this exercise' : 'with these free weights';
  const variantNote = series?.variantLabel ? ` (${series.variantLabel})` : '';
  const olderOnly = hist.some((s) => s.representative) && sessionsUsed === 0;
  const confidenceReason = confidence === 'low'
    ? `Calibrating: ${sessionsUsed} comparable session${sessionsUsed === 1 ? '' : 's'} ${where}${variantNote} in the last 8 weeks${olderOnly ? ' (older sessions exist but are too old to rely on)' : ''}. Loads and reps are a starting point, not a precise prescription.`
    : `${sessionsUsed} comparable sessions ${where}${variantNote} in the last 8 weeks.`;
  if (confidence === 'low') notes.push(`Calibrating: ${sessionsUsed} comparable session${sessionsUsed === 1 ? '' : 's'} ${where}`);

  // ---- RIR target
  let rirTarget: [number, number];
  let rirReason: string;
  if (override?.targetRir != null) {
    rirTarget = [Math.max(0, override.targetRir - 1), override.targetRir];
    rirReason = `Your own target RIR (${override.targetRir}) for this exercise.`;
  } else if (freeCompound) {
    rirTarget = [2, 3];
    rirReason = 'Free-weight compound: stop 2–3 reps short of failure — technique first; RIR 0–3 gives similar growth.';
  } else {
    rirTarget = [1, 2];
    rirReason = 'Machine / isolation: 1–2 reps in reserve is close enough to failure and safe on a stable path.';
  }
  const lastTwo = raw.slice(-2);
  const brokeRecently = lastTwo.some((h) => doneWorking(h.ex.sets).some(isBroken));
  const recentSets = raw.slice(-3).flatMap((h) => doneWorking(h.ex.sets));
  const failureShare = recentSets.length ? recentSets.filter(hitLimit).length / recentSets.length : 0;
  const frequentFailure = freeCompound && recentSets.length >= 3 && failureShare >= 1 / 3;
  if (brokeRecently || frequentFailure) {
    rirTarget = [rirTarget[0] + 1, rirTarget[1] + 1];
    rirReason += brokeRecently
      ? ' +1 because technique broke down (or a set ended in technical failure) in the last 2 sessions.'
      : ` +1 because ${Math.round(failureShare * 100)}% of recent sets went to failure on a technique-first lift.`;
  }

  // ---- load step and limits
  const stepInfo = loadStep(eq, location, eq?.kind ?? def.equipmentKind, loadMode);
  const step = stepInfo.step;
  const minKg = eq?.minKg ?? null;
  const maxKg = eq?.maxKg ?? null;

  // ---- load decision (double progression, reusing progression.ts)
  const exRange: [number, number] = override?.repRange ?? def.repRange;
  const decisionRir = override?.targetRir ?? Math.max(data.settings.defaultTargetRir, rirTarget[1] - (brokeRecently || frequentFailure ? 1 : 0));
  const trend = classifyTrend(hist, today);
  const next = suggestNextLoad(hist, exRange, decisionRir, step, trend, loadMode);
  const advice = adviceFor({ next, trend, sessions: hist });
  let decision: LoadDecision = next.action === 'increase' ? 'increase' : next.action === 'reduce' ? 'reduce' : next.action === 'calibrate' ? 'calibrate' : 'keep';
  let decisionWhy = next.reason;
  let weight: number | null = next.weight;
  const lastLoad = (() => {
    const last = [...hist].reverse().find((s) => s.representative);
    if (!last) return null;
    const ws = last.sets.filter((p) => p.benchmark && p.weight != null).map((p) => p.weight as number);
    return ws.length ? (assisted ? Math.min(...ws) : Math.max(...ws)) : null;
  })();
  if (weight != null) {
    const snapped = snapLoad(weight, step, stepInfo.source, minKg, maxKg);
    if (decision === 'increase' && lastLoad != null && (assisted ? snapped >= lastLoad : snapped <= lastLoad)) {
      decision = 'keep';
      weight = lastLoad;
      decisionWhy = `${assisted ? 'No less assistance is available' : `The next load does not exist on this equipment (max ${maxKg ?? lastLoad} kg)`} — keep ${lastLoad} kg and add reps instead.`;
    } else weight = snapped;
  }
  if (sessionsUsed <= 1 && decision === 'keep') {
    decision = 'calibrate';
    decisionWhy = weight != null
      ? `Only ${sessionsUsed} comparable recent session — repeat ${weight} kg and record RIR (or how each set felt) to calibrate.`
      : next.reason;
  }
  if (weight == null && decision !== 'calibrate') decision = 'calibrate';
  if (decision === 'calibrate' && weight == null) {
    notes.push('No working weight known — pick a load you can lift for the rep range with the target RIR');
  }

  // ---- rep bounds (sensible range, widened only by the owner's own history)
  const cat = compound ? COMPOUND_BOUNDS : ISOLATION_BOUNDS;
  let repBounds: [number, number] = [Math.max(3, Math.min(cat[0], exRange[0])), Math.max(cat[1], exRange[1])];
  const recentRep = hist.filter((s) => s.representative).slice(-6);
  const typicalReps = median(recentRep.flatMap((s) => s.sets.filter((p) => p.benchmark && p.reps != null).map((p) => p.reps as number)));
  if (typicalReps != null && recentRep.length >= 2) {
    repBounds = [clamp(Math.min(repBounds[0], Math.floor(typicalReps) - 1), 3, 30), clamp(Math.max(repBounds[1], Math.ceil(typicalReps) + 1), 3, 30)];
  }

  // ---- rest (owner's median on this key, bounded)
  const restBounds = compound ? COMPOUND_REST : ISOLATION_REST;
  const restVals = raw.flatMap((h) => doneWorking(h.ex.sets).slice(1).map((s) => s.restSecBefore).filter((r): r is number => r != null && r > 0));
  const restMed = median(restVals);
  let rest: Prescription['rest'];
  if (restMed != null) {
    const c = clamp(restMed, restBounds[0], restBounds[1]);
    const range: [number, number] = [clamp(round15(c - 15), restBounds[0], restBounds[1]), clamp(round15(c + 15), restBounds[0], restBounds[1])];
    rest = { range, source: 'history', medianSec: Math.round(restMed), reason: `Your usual rest here is ~${Math.round(restMed)} s${restMed !== c ? ` (kept within ${restBounds[0]}–${restBounds[1]} s)` : ''}.` };
  } else {
    rest = { range: [...restBounds], source: 'bounds', medianSec: null, reason: `No rest times recorded on this exercise yet — ${restBounds[0]}–${restBounds[1]} s is a sensible ${compound ? 'compound' : 'isolation'} range.` };
  }

  // ---- typical within-session rep drop at the usual rest
  const drops: number[] = [];
  for (const h of raw) {
    const ws = doneWorking(h.ex.sets).filter((s) => !benchmarkExclusion(s) && s.reps != null && !s.side);
    for (let i = 1; i < ws.length; i++) {
      const a = ws[i - 1];
      const b = ws[i];
      if (a.weightKg !== b.weightKg) continue;
      const r = b.restSecBefore;
      if (restMed != null && r != null && r > 0 && (r < restMed * 0.7 || r > restMed * 1.3)) continue;
      drops.push((a.reps as number) - (b.reps as number));
    }
  }
  const dropMed = median(drops);
  const repDropPerSet = dropMed == null ? 1 : clamp(Math.round(dropMed * 2) / 2, 0, 3);

  // ---- first-set reps at the prescribed load
  const pts = (s: SessionPerf) => s.sets.filter((p) => p.benchmark && p.reps != null);
  let firstReps: number | null = null;
  let repSource: Prescription['repSource'] = 'exercise_default';
  {
    const atLoad = [...hist].reverse().find((s) => pts(s).some((p) => p.weight === weight));
    if (atLoad) {
      firstReps = (pts(atLoad).find((p) => p.weight === weight) as SetPoint).reps;
      repSource = 'history';
    } else if (weight != null && weight > 0 && !assisted) {
      const withE = [...hist].reverse().find((s) => s.e1rm != null);
      if (withE) {
        const rirMid = (rirTarget[0] + rirTarget[1]) / 2;
        const est = Math.floor(30 * ((withE.e1rm as number) / weight - 1) - rirMid);
        if (Number.isFinite(est) && est >= 1) {
          firstReps = est;
          repSource = 'estimate';
        }
      }
    }
  }

  // ---- set count from today's share of the PRIMARY muscle
  const { contributions } = resolveCoefficients(def, ex.variation);
  const ranked = (Object.entries(contributions) as [MuscleId, number][]).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]);
  const primaryMuscle = ranked[0]?.[0] ?? null;
  const primaryCoefficient = ranked[0]?.[1] ?? 0;
  const maxSets = compound ? MAX_SETS.compound : MAX_SETS.isolation;
  let setCount: number;
  let setCountReason: string;
  const mw = primaryMuscle ? analysis.muscles.find((m) => m.muscle === primaryMuscle) : undefined;
  if (!primaryMuscle || !mw || primaryCoefficient <= 0) {
    setCount = Math.min(maxSets, 3);
    setCountReason = 'No weekly target is tracked for this exercise\'s main muscle — 3 sets as a neutral default.';
  } else {
    const quality = data.settings.quality;
    const others = { ...workout, exercises: workout.exercises.filter((_, i) => i !== exerciseIndex) };
    const thisSession = computeVolume([others], registry, quality).muscles[primaryMuscle].effective;
    const otherToday = computeVolume(data.workouts.filter((w) => w.date === today && w.id !== workout.id), registry, quality).muscles[primaryMuscle].effective;
    const already = Math.round((thisSession + otherToday) * 100) / 100;
    const mName = primaryMuscle.replace(/_/g, ' ');
    if (mw.todayBlocked) {
      setCount = 0;
      setCountReason = `${cap(mName)} is likely still recovering from an earlier session (${mw.todayNote}). Skip it today or keep it light — advice, not a rule.`;
    } else if (mw.todayShare <= 0) {
      setCount = 0;
      setCountReason = mw.todayNote === 'Target met'
        ? `${cap(mName)} has met its weekly target — no extra sets are needed just to fill a number.`
        : `No sets planned for ${mName} today (${mw.todayNote}).`;
    } else {
      const need = Math.max(0, mw.todayShare - already);
      const rawSets = need / primaryCoefficient;
      if (rawSets < 0.5) {
        setCount = 0;
        setCountReason = `Today's share for ${mName} (${mw.todayShare}) is already covered by earlier exercises (${already} effective sets) — extra sets are optional, not needed.`;
      } else {
        setCount = clamp(Math.round(rawSets), 1, maxSets);
        setCountReason = `Today's share for ${mName}: ${mw.todayShare} effective set${mw.todayShare === 1 ? '' : 's'}`
          + (already > 0 ? ` − ${already} from earlier exercises` : '')
          + (primaryCoefficient !== 1 ? ` ÷ ${primaryCoefficient} per set` : '')
          + ` → ${setCount}${Math.round(rawSets) > maxSets ? ` (capped at ${maxSets} for one exercise — another ${mName} exercise can cover the rest, or it carries over)` : ''}.`;
        const pr = analysis.planRecovery[primaryMuscle];
        if (pr?.status === 'recovering' && pr.hoursLeft > 0 && setCount > 1) {
          setCount -= 1;
          setCountReason += ` One set fewer: ${mName} is nearly recovered (~${pr.hoursLeft} h left by the heuristic).`;
        }
      }
    }
  }

  // ---- working sets
  const sets: PrescribedSet[] = [];
  const restSec = rest.source === 'history' ? rest.range : null;
  for (let i = 0; i < setCount; i++) {
    let lo: number;
    let hi: number;
    if (firstReps != null) {
      const c = firstReps - Math.round(i * repDropPerSet);
      if (repSource === 'history' && (decision === 'keep' || decision === 'calibrate')) {
        // Same load as before: aim to match or beat last time by one rep.
        lo = c;
        hi = c + 1;
      } else {
        lo = c - 1;
        hi = c + 1;
      }
    } else {
      [lo, hi] = exRange;
    }
    lo = clamp(lo, repBounds[0], repBounds[1]);
    hi = clamp(hi, repBounds[0], repBounds[1]);
    if (hi < lo) hi = lo;
    sets.push({ weightKg: weight, repsMin: lo, repsMax: hi, rirMin: rirTarget[0], rirMax: rirTarget[1], restSec });
  }
  if (repSource === 'exercise_default' && setCount > 0) notes.push(`Rep range ${exRange[0]}–${exRange[1]} is the exercise default until you have history at this load`);
  if (repSource === 'estimate' && setCount > 0) notes.push('Reps at this load are estimated from your best recent set');
  if (rest.source === 'bounds') notes.push('No rest history yet');

  // ---- warm-ups
  const { warmups, warmupReason } = planWarmups({ data, workout, exerciseIndex, def, weight, loadMode, step, stepSource: stepInfo.source, minKg, maxKg, primaryMuscle, raw, registry });

  return {
    engine: PRESCRIPTION_ENGINE, key, exerciseId: ex.exerciseId, equipmentId: ex.equipmentId, loadMode,
    sessionsUsed, confidence, status: confidence === 'low' ? 'calibrating' : 'ready', confidenceReason,
    decision, decisionWhy, advice, workingWeightKg: weight, step, stepSource: stepInfo.source, minKg, maxKg,
    warmups, warmupReason, sets, setCount, setCountReason, primaryMuscle, primaryCoefficient,
    repBounds, repSource, repDropPerSet, rirTarget, rirReason, rest, notes,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------- warm-ups

interface WarmupCtx {
  data: AppData;
  workout: Workout;
  exerciseIndex: number;
  def: ExerciseDef;
  weight: number | null;
  loadMode: LoadMode;
  step: number;
  stepSource: IncrementSource;
  minKg: number | null;
  maxKg: number | null;
  primaryMuscle: MuscleId | null;
  raw: { workout: Workout; ex: WorkoutExercise }[];
  registry: ReturnType<typeof analyze>['registry'];
}

/**
 * Warm-ups: never counted. Based on the working weight, the exercise type (free-weight compound
 * ramps more than a machine isolation), earlier work for the same muscle in THIS session, whether
 * a heavy compound was already done today, the real increments, and the owner's logged warm-up habit.
 */
function planWarmups(c: WarmupCtx): { warmups: PrescribedWarmup[]; warmupReason: string } {
  const { workout, exerciseIndex, def, weight, loadMode, step, primaryMuscle, registry } = c;
  // Earlier done work in this session.
  let priorSameMuscle = 0;
  let heavyEarlier = false;
  workout.exercises.forEach((e, i) => {
    if (i === exerciseIndex) return;
    const done = doneWorking(e.sets);
    if (!done.length) return;
    const d = registry.get(e.exerciseId);
    if (!d) return;
    if (d.category === 'compound') heavyEarlier = true;
    const coef = primaryMuscle ? resolveCoefficients(d, e.variation).contributions[primaryMuscle] ?? 0 : 0;
    if (coef >= 0.5) priorSameMuscle += Math.ceil(countedSetCount(done, ['working']));
  });

  if (weight == null) return { warmups: [], warmupReason: 'No working weight known yet — no warm-up load can be prescribed; do an easy rehearsal set if needed.' };

  // Assisted: warm up with MORE assistance (easier), never less.
  if (loadMode === 'assisted') {
    if (priorSameMuscle >= 2) return { warmups: [], warmupReason: `Muscles already warm from ${priorSameMuscle} earlier sets — no warm-up needed.` };
    let w = weight + 2 * (step || 5);
    if (c.maxKg != null) w = Math.min(c.maxKg, w);
    return w > weight
      ? { warmups: [{ weightKg: w, reps: 5 }], warmupReason: 'Assisted: one easier set with more assistance to rehearse the movement.' }
      : { warmups: [], warmupReason: 'Already at the most assistance available — start with the working sets.' };
  }
  // Bodyweight with added load: rehearse with bodyweight only.
  if (loadMode === 'bodyweight_plus' && weight > 0) {
    if (priorSameMuscle >= 2) return { warmups: [], warmupReason: `Muscles already warm from ${priorSameMuscle} earlier sets — no warm-up needed.` };
    return { warmups: [{ weightKg: 0, reps: 5 }], warmupReason: 'One bodyweight-only set before adding the load.' };
  }
  if (weight <= 0) {
    if (def.category === 'compound' && priorSameMuscle < 2) return { warmups: [{ weightKg: 0, reps: 4 }], warmupReason: 'Bodyweight compound: one easy, short set to rehearse the movement.' };
    return { warmups: [], warmupReason: 'Bodyweight isolation — the first working set is its own warm-up.' };
  }

  // Contextual plan from the shared rules (warmupFor), then adjusted.
  const base = warmupFor(def, weight, step, priorSameMuscle);
  let plan = base.sets.filter((s) => s.weight != null).map((s) => ({ pct: (s.weight as number) / weight, reps: s.reps }));
  let reason = base.reason;
  if (def.category === 'compound' && priorSameMuscle < 2 && heavyEarlier && plan.length >= 2) {
    plan = plan.slice(1);
    reason = 'A heavy compound was already done this session (generally warm): shorter ramp for this movement.';
  }
  if (def.category === 'isolation' && priorSameMuscle === 1) reason = 'Isolation after a little same-muscle work: one moderate set.';

  // Owner's own habit on this key: ≥ 2 sessions with logged warm-ups.
  const habitRows: { pct: number; reps: number }[][] = [];
  for (const h of c.raw) {
    const working = doneWorking(h.ex.sets).filter((s) => s.weightKg != null && s.weightKg > 0);
    const top = working.length ? Math.max(...working.map((s) => s.weightKg as number)) : 0;
    const wu = h.ex.sets.filter((s) => s.type === 'warmup' && s.weightKg != null && s.weightKg > 0 && s.reps != null);
    if (top > 0 && wu.length) habitRows.push(wu.map((s) => ({ pct: (s.weightKg as number) / top, reps: s.reps as number })).sort((a, b) => a.pct - b.pct));
  }
  if (habitRows.length >= 2) {
    const n = Math.min(4, Math.round(median(habitRows.map((r) => r.length)) as number));
    const habit: { pct: number; reps: number }[] = [];
    for (let j = 0; j < n; j++) {
      const at = habitRows.filter((r) => r.length >= n).map((r) => r[j]);
      const pool = at.length ? at : habitRows.map((r) => r[Math.min(j, r.length - 1)]);
      habit.push({ pct: median(pool.map((x) => x.pct)) as number, reps: Math.round(median(pool.map((x) => x.reps)) as number) });
    }
    const count = priorSameMuscle === 0 && !(heavyEarlier && def.category === 'compound') ? habit.length : Math.min(habit.length, plan.length);
    plan = habit.slice(habit.length - count);
    reason = count
      ? `Based on your own warm-up habit here (${habitRows.length} sessions): ${habit.map((h) => `~${Math.round(h.pct * 100)}%`).join(' → ')}${count < habit.length ? ', shortened because the muscle is already warm' : ''}.`
      : `Your usual warm-up is skipped: the muscle already did ${priorSameMuscle} sets this session.`;
  }

  // Snap to real increments; keep strictly ascending and below the working weight.
  const out: PrescribedWarmup[] = [];
  for (const p of plan) {
    // Warm-ups always land on the grid: anchored at the stack's minimum when known, else multiples of the step.
    const grid: IncrementSource = c.stepSource === 'equipment' && c.minKg != null ? 'equipment' : 'gym_free_weights';
    let w = snapLoad(weight * p.pct, step, grid, c.minKg, c.maxKg);
    if (step > 0 && c.minKg == null) w = Math.max(step, w);
    if (w <= 0 || w >= weight) continue;
    if (out.length && w <= (out[out.length - 1].weightKg as number)) continue;
    out.push({ weightKg: w, reps: p.reps });
  }
  return { warmups: out, warmupReason: out.length ? reason : plan.length ? 'The working weight is too light for a lighter warm-up step on this equipment — start with the working sets.' : reason };
}

// ---------------------------------------------------------------- set-by-set adjustment

export type AdaptChange = 'none' | 'add_load' | 'add_reps' | 'reduce' | 'defer';

/**
 * Adjusts the REMAINING working sets from what was actually performed (reps, RIR, feel AND
 * technique — never feel alone):
 * - clearly too easy (RIR ≥ target + 2, or "too easy" when no RIR) AND reps at/above the top, clean
 *   technique → +1 step if this equipment has one (`step`, min/max respected), else keep the weight
 *   and add ~2 reps;
 * - RIR 0 / muscular failure WITH broken technique, or a technical failure → one step down
 *   (also when technique broke on ≥ 2 sets);
 * - reps well below the range at the prescribed load → after a clearly short rest: none (rest, not
 *   load); on one set only: defer (judge next session); on ≥ 2 sets: keep the load and lower the rep
 *   target of the remaining sets (`change: 'reduce'` with the weight unchanged);
 * - otherwise none. Pain never leads to more load.
 *
 * `performed` = this exercise's sets so far in the session (only done working sets are used;
 * left/right pairs count once). Returns the remaining sets only.
 */
export function adaptRemaining(
  p: Prescription,
  performed: WorkoutSet[],
  step: number,
): { sets: Prescription['sets']; change: AdaptChange; why: string } {
  const done = doneWorking(performed);
  const n = Math.ceil(countedSetCount(done, ['working']));
  const remaining = p.sets.slice(n).map((s) => ({ ...s }));
  if (!done.length) return { sets: remaining, change: 'none', why: 'No working set done yet — follow the prescription.' };
  if (!remaining.length) return { sets: remaining, change: 'none', why: 'All prescribed working sets are done.' };

  const last = done[done.length - 1];
  const ref = p.sets[Math.min(n - 1, p.sets.length - 1)] ?? p.sets[0];
  const target: Pick<SetPrescription, 'weightKg' | 'repsMin' | 'repsMax' | 'rirMin' | 'rirMax'> = last.prescribed ?? ref;
  const w = last.weightKg;
  const assisted = p.loadMode === 'assisted';
  const withLimits = (x: number) => {
    let v = Math.max(0, x);
    if (p.minKg != null) v = Math.max(p.minKg, v);
    if (p.maxKg != null) v = Math.min(p.maxKg, v);
    return v;
  };
  const setW = (x: number) => remaining.map((s) => ({ ...s, weightKg: x }));

  if (hasPain(last)) {
    return { sets: remaining, change: 'none', why: 'Pain flagged — no load is added. If it persists, stop this exercise for today.' };
  }

  // 1) Broken technique at the limit → one step down.
  const brokenSets = done.filter(isBroken).length;
  if ((isBroken(last) && hitLimit(last)) || brokenSets >= 2) {
    if (w != null && step > 0) {
      const to = withLimits(assisted ? w + step : stepLoad(w, -step, step));
      if (to !== w && (assisted || w > 0)) {
        return { sets: setW(to), change: 'reduce', why: `Technique broke down${last.technicalFailure ? ' (technical failure)' : ''} at ${w} kg — ${assisted ? 'more assistance' : 'one step down'} to ${to} kg for the remaining sets, with full range and control.` };
      }
    }
    return { sets: remaining.map((s) => ({ ...s, repsMin: Math.max(1, s.repsMin - 2), repsMax: Math.max(1, s.repsMax - 2) })), change: 'reduce', why: `Technique broke down, but no lighter step is available${w != null ? ` below ${w} kg` : ''} — stop the remaining sets 2 reps earlier.` };
  }

  // 2) Clearly too easy with clean technique and reps at the top.
  const t = techniqueOf(last);
  const clean = t == null || t === 'good' || t === 'not_assessed';
  const easyEffort = last.rir != null ? last.rir >= target.rirMax + 2 : last.feel === 'too_easy';
  if (easyEffort && clean && last.reps != null && last.reps >= target.repsMax && !benchmarkExclusion(last)) {
    let to: number | null = null;
    if (w != null && step > 0) {
      if (assisted) to = w > 0 ? withLimits(Math.max(0, w - step)) : null;
      else if (w > 0 || p.loadMode === 'bodyweight_plus') to = stepLoad(w, step, step);
      if (to != null && !assisted && p.maxKg != null && to > p.maxKg) to = null;
      if (to === w) to = null;
    }
    if (to != null) {
      return { sets: setW(to), change: 'add_load', why: `${last.reps} reps at ${w} kg ${last.rir != null ? `with RIR ${last.rir}` : 'felt too easy'} — ${assisted ? 'less assistance' : `+${step} kg`}: ${to} kg for the remaining sets.` };
    }
    return {
      sets: remaining.map((s) => ({ ...s, repsMin: Math.min(30, s.repsMin + 2), repsMax: Math.min(30, s.repsMax + 2) })),
      change: 'add_reps',
      why: `Too easy at ${w ?? 'this'} kg, but no heavier step is available on this equipment${p.maxKg != null ? ` (max ${p.maxKg} kg)` : ''} — keep the weight and add ~2 reps per set.`,
    };
  }

  // 3) Reps well below the range at the prescribed load.
  const wellBelow = (s: WorkoutSet, i: number) => {
    const pr = s.prescribed ?? p.sets[Math.min(i, p.sets.length - 1)];
    return !!pr && s.reps != null && s.weightKg === pr.weightKg && s.reps <= pr.repsMin - 2;
  };
  if (wellBelow(last, done.length - 1)) {
    const usual = p.rest.medianSec;
    if (usual != null && last.restSecBefore != null && last.restSecBefore > 0 && last.restSecBefore < usual * 0.7) {
      return { sets: remaining, change: 'none', why: `Reps dropped after a shorter rest (${last.restSecBefore} s vs your usual ~${usual} s) — likely the rest, not the load. Rest fully before the next set.` };
    }
    const offCount = done.filter((s, i) => wellBelow(s, i)).length;
    if (offCount >= 2) {
      const r = last.reps as number;
      return {
        sets: remaining.map((s) => ({ ...s, repsMin: Math.max(1, Math.min(s.repsMin, r - 1)), repsMax: Math.max(1, Math.min(s.repsMax, r + 1)) })),
        change: 'reduce',
        why: `Reps fell well below the range on ${offCount} sets at ${w} kg — keep the load and aim for ~${Math.max(1, r - 1)}–${r + 1} reps on the remaining sets; the load is reviewed next session.`,
      };
    }
    return { sets: remaining, change: 'defer', why: `One set fell short (${last.reps} reps at ${w} kg) — keep the plan; one set is not enough to change the load. Reviewed next session.` };
  }

  return { sets: remaining, change: 'none', why: `On target — keep ${w ?? '?'} kg and aim for the planned reps at RIR ${target.rirMin}–${target.rirMax}.` };
}

// ---------------------------------------------------------------- recording what was prescribed

/** Warm-ups are prescribed well away from failure; encoded as RIR 5–10 so the record stays numeric. */
const WARMUP_RIR: [number, number] = [5, 10];

/** The value stored on WorkoutSet.prescribed (kept separate from the performed values). */
export function toSetPrescription(set: PrescribedSet | PrescribedWarmup, kind: 'working' | 'warmup'): SetPrescription {
  if ('repsMin' in set) {
    return {
      weightKg: set.weightKg, repsMin: set.repsMin, repsMax: set.repsMax, rirMin: set.rirMin, rirMax: set.rirMax,
      restSec: set.restSec ? Math.round((set.restSec[0] + set.restSec[1]) / 2) : null, kind, engine: PRESCRIPTION_ENGINE,
    };
  }
  return { weightKg: set.weightKg, repsMin: set.reps, repsMax: set.reps, rirMin: WARMUP_RIR[0], rirMax: WARMUP_RIR[1], restSec: null, kind, engine: PRESCRIPTION_ENGINE };
}
