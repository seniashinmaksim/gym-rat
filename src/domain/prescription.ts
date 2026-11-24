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
import { isShortRest, usualRestSec } from './rest';
import type { AppData } from './appdata';
import { diffDays, localNowParts } from './dates';
import { benchmarkExclusion, hasPain, techniqueOf } from './feedback';
import { loadStep, type IncrementSource } from './increments';
import {
  adviceFor, classifyTrend, comparableSessions, progressionKey, roundToIncrement, stepLoad, suggestNextLoad, warmupFor,
  type Advice, type SessionPerf, type SetPoint,
} from './progression';
import { L, num, ruPlural } from '../i18n/core';
import { muscleName } from './muscles';
import { expectedRepDrop, preloadFactor, preloadFor, PRELOAD_DEFAULT_DROP, type PreloadContext } from './preload';
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

  /**
   * Part 6 (F.8): what was already done in this session for the exercise's primary muscle before it, and how
   * many reps fewer than in the (fresh) reference session that makes the first set — the rep targets already
   * include it. 0 when the history is in the same context.
   */
  context: PreloadContext;
  expectedRepDrop: number;
}

export interface PrescribeInput {
  data: AppData;
  analysis: ReturnType<typeof analyze>;
  now: Date;
  /** The live session (may already contain done sets). */
  workout: Workout;
  exerciseIndex: number;
  /**
   * Session-level allocation (planner, Part 5): the number of working sets decided for the WHOLE session
   * (all planned exercises' fractional contributions), replacing the per-exercise share calculation.
   */
  setCount?: { count: number; reason: string };
}

// ---------------------------------------------------------------- helpers

const FREE_WEIGHT: EquipmentKind[] = ['barbell', 'dumbbell', 'kettlebell'];
const ISOLATION_BOUNDS: [number, number] = [8, 20];
const COMPOUND_BOUNDS: [number, number] = [5, 12];
const ISOLATION_REST: [number, number] = [60, 180];
const COMPOUND_REST: [number, number] = [120, 300];
const MAX_SETS = { isolation: 4, compound: 5 } as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** A load for a Russian sentence: decimal comma, "?" when unknown. */
const ruKg = (x: number | null | undefined): string => (x == null ? '?' : num(x));
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
  const whereRu = ex.equipmentId ? 'на этом оборудовании' : def.equipmentKind === 'bodyweight' ? 'в этом упражнении' : 'с этими свободными весами';
  const variantNote = series?.variantLabel ? ` (${series.variantLabel})` : '';
  const olderOnly = hist.some((s) => s.representative) && sessionsUsed === 0;
  const confidenceReason = confidence === 'low'
    ? L(
      `Calibrating: ${sessionsUsed} comparable session${sessionsUsed === 1 ? '' : 's'} ${where}${variantNote} in the last 8 weeks${olderOnly ? ' (older sessions exist but are too old to rely on)' : ''}. Loads and reps are a starting point, not a precise prescription.`,
      `Калибровка: сопоставимых тренировок ${whereRu}${variantNote} за последние 8 недель — ${sessionsUsed}${olderOnly ? ' (есть более старые, но на них уже нельзя опираться)' : ''}. Вес и повторения — отправная точка, а не точное назначение.`,
    )
    : L(`${sessionsUsed} comparable sessions ${where}${variantNote} in the last 8 weeks.`, `Сопоставимых тренировок ${whereRu}${variantNote} за последние 8 недель: ${sessionsUsed}.`);
  if (confidence === 'low') notes.push(L(`Calibrating: ${sessionsUsed} comparable session${sessionsUsed === 1 ? '' : 's'} ${where}`, `Калибровка: сопоставимых тренировок ${whereRu} — ${sessionsUsed}`));

  // ---- RIR target
  let rirTarget: [number, number];
  let rirReason: string;
  if (override?.targetRir != null) {
    rirTarget = [Math.max(0, override.targetRir - 1), override.targetRir];
    rirReason = L(`Your own target RIR (${override.targetRir}) for this exercise.`, `Ваш собственный целевой RIR (${override.targetRir}) для этого упражнения.`);
  } else if (freeCompound) {
    rirTarget = [2, 3];
    rirReason = L('Free-weight compound: stop 2–3 reps short of failure — technique first; RIR 0–3 gives similar growth.', 'Многосуставное упражнение со свободным весом: останавливайтесь за 2–3 повтора до отказа — техника прежде всего; при RIR 0–3 рост схожий.');
  } else {
    rirTarget = [1, 2];
    rirReason = L('Machine / isolation: 1–2 reps in reserve is close enough to failure and safe on a stable path.', 'Тренажёр / изолирующее упражнение: 1–2 повтора в запасе — достаточно близко к отказу и безопасно на стабильной траектории.');
  }
  const lastTwo = raw.slice(-2);
  const brokeRecently = lastTwo.some((h) => doneWorking(h.ex.sets).some(isBroken));
  const recentSets = raw.slice(-3).flatMap((h) => doneWorking(h.ex.sets));
  const failureShare = recentSets.length ? recentSets.filter(hitLimit).length / recentSets.length : 0;
  const frequentFailure = freeCompound && recentSets.length >= 3 && failureShare >= 1 / 3;
  if (brokeRecently || frequentFailure) {
    rirTarget = [rirTarget[0] + 1, rirTarget[1] + 1];
    rirReason += brokeRecently
      ? L(' +1 because technique broke down (or a set ended in technical failure) in the last 2 sessions.', ' +1, потому что в последних 2 тренировках нарушалась техника (или подход закончился отказом по технике).')
      : L(` +1 because ${Math.round(failureShare * 100)}% of recent sets went to failure on a technique-first lift.`, ` +1, потому что ${Math.round(failureShare * 100)}% недавних подходов доходили до отказа в упражнении, где техника прежде всего.`);
  }

  // ---- load step and limits
  const stepInfo = loadStep(eq, location, eq?.kind ?? def.equipmentKind, loadMode);
  const step = stepInfo.step;
  const minKg = eq?.minKg ?? null;
  const maxKg = eq?.maxKg ?? null;

  // ---- load decision (double progression, reusing progression.ts)
  const exRange: [number, number] = override?.repRange ?? def.repRange;
  const decisionRir = override?.targetRir ?? Math.max(data.settings.defaultTargetRir, rirTarget[1] - (brokeRecently || frequentFailure ? 1 : 0));
  // F.8: judge the history in the context this exercise is done in TODAY (fresh, or after same-muscle work).
  const context = preloadFor(workout, ex, registry);
  const judged = comparableSessions(hist, context.bucket);
  const cmp = judged.sessions;
  const trend = classifyTrend(cmp, today);
  const next = suggestNextLoad(cmp, exRange, decisionRir, step, trend, loadMode);
  const advice = adviceFor({ next, trend, sessions: cmp });
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
      decisionWhy = L(`${assisted ? 'No less assistance is available' : `The next load does not exist on this equipment (max ${maxKg ?? lastLoad} kg)`} — keep ${lastLoad} kg and add reps instead.`, `${assisted ? 'Меньшей помощи нет' : `Следующего веса на этом оборудовании нет (макс. ${num(maxKg ?? lastLoad)} кг)`} — оставьте ${num(lastLoad)} кг и добавляйте повторения.`);
    } else weight = snapped;
  }
  // Back after > 14 days without training: one step below the last comparable load — a load that exists
  // (a lighter one already used on this history, else one real step down), then progress as usual.
  const priorDates = data.workouts.filter((w) => w.id !== workout.id && w.date < today).map((w) => w.date).sort();
  const daysOff = priorDates.length ? diffDays(today, priorDates[priorDates.length - 1]) : null;
  if (daysOff != null && daysOff > 14 && weight != null && weight > 0 && step > 0 && hist.length) {
    const cur = weight;
    const used = [...new Set(hist.flatMap((s) => s.sets.filter((p) => p.benchmark && p.weight != null).map((p) => p.weight as number)))].sort((a, b) => a - b);
    let to: number;
    if (assisted) to = maxKg != null ? Math.min(maxKg, cur + step) : cur + step;
    else {
      const lighter = used.filter((u) => u < cur && cur - u <= step * 1.5 + 1e-9);
      to = lighter.length ? lighter[lighter.length - 1] : snapLoad(stepLoad(cur, -step, step), step, stepInfo.source, minKg, maxKg);
    }
    if (to !== weight && to >= 0) {
      weight = to;
      decision = 'reduce';
      decisionWhy = L(`Back after ${daysOff} days without training: one step ${assisted ? 'easier' : 'down'} to ${to} kg for the first session, then progress as usual.`, `Возвращение после ${daysOff} дн. без тренировок: на один шаг ${assisted ? 'легче' : 'ниже'} — ${num(to)} кг на первую тренировку, дальше прогрессия как обычно.`);
      notes.push(L(`Back after ${daysOff} days: one step down`, `Возвращение после ${daysOff} дн.: на один шаг ниже`));
    }
  }
  if (sessionsUsed <= 1 && decision === 'keep') {
    decision = 'calibrate';
    decisionWhy = weight != null
      ? L(`Only ${sessionsUsed} comparable recent session — repeat ${weight} kg and record RIR (or how each set felt) to calibrate.`, `Недавних сопоставимых тренировок: ${sessionsUsed} — повторите ${num(weight)} кг и записывайте RIR (или ощущение от каждого подхода) для калибровки.`)
      : next.reason;
  }
  if (weight == null && decision !== 'calibrate') decision = 'calibrate';
  if (decision === 'calibrate' && weight == null) {
    notes.push(L('No working weight known — pick a load you can lift for the rep range with the target RIR', 'Рабочий вес неизвестен — выберите вес, с которым выполните диапазон повторений с целевым RIR'));
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
    rest = { range, source: 'history', medianSec: Math.round(restMed), reason: L(`Your usual rest here is ~${Math.round(restMed)} s${restMed !== c ? ` (kept within ${restBounds[0]}–${restBounds[1]} s)` : ''}.`, `Ваш обычный отдых здесь — ~${Math.round(restMed)} с${restMed !== c ? ` (в пределах ${restBounds[0]}–${restBounds[1]} с)` : ''}.`) };
  } else {
    rest = { range: [...restBounds], source: 'bounds', medianSec: null, reason: L(`No rest times recorded on this exercise yet — ${restBounds[0]}–${restBounds[1]} s is a sensible ${compound ? 'compound' : 'isolation'} range.`, `Время отдыха в этом упражнении пока не записано — ${restBounds[0]}–${restBounds[1]} с — разумный диапазон для ${compound ? 'многосуставного' : 'изолирующего'} упражнения.`) };
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
      if (restMed != null && r != null && r > 0 && (isShortRest(r, restMed) || r > restMed * 1.3)) continue;
      drops.push((a.reps as number) - (b.reps as number));
    }
  }
  const dropMed = median(drops);
  const repDropPerSet = dropMed == null ? 1 : clamp(Math.round(dropMed * 2) / 2, 0, 3);

  // ---- first-set reps at the prescribed load
  const pts = (s: SessionPerf) => s.sets.filter((p) => p.benchmark && p.reps != null);
  let firstReps: number | null = null;
  let repSource: Prescription['repSource'] = 'exercise_default';
  let repDropFromOrder = 0;
  const dropPerSet = judged.compare.dropPerSet ?? PRELOAD_DEFAULT_DROP;
  {
    const atLoad = [...cmp].reverse().find((s) => pts(s).some((p) => p.weight === weight));
    if (atLoad) {
      firstReps = (pts(atLoad).find((p) => p.weight === weight) as SetPoint).reps;
      repSource = 'history';
      // Reference session done fresh, today after same-muscle work: fewer reps are expected at the same load.
      const extra = context.sets - (atLoad.preload ?? 0);
      if (context.bucket === 'preloaded' && atLoad.context !== 'preloaded' && extra > 0 && firstReps != null) {
        repDropFromOrder = expectedRepDrop(firstReps, extra, dropPerSet);
        firstReps = Math.max(1, firstReps - repDropFromOrder);
      }
    } else if (weight != null && weight > 0 && !assisted) {
      const withE = [...cmp].reverse().find((s) => s.e1rm != null);
      if (withE) {
        const rirMid = (rirTarget[0] + rirTarget[1]) / 2;
        // `cmp` holds indices normalised to the fresh context; today's context takes its share back.
        const today1rm = (withE.e1rm as number) / (judged.compare.basis === 'adjusted' && context.bucket === 'preloaded' ? preloadFactor(context.sets, dropPerSet) : 1);
        const est = Math.floor(30 * (today1rm / weight - 1) - rirMid);
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
    setCountReason = L('No weekly target is tracked for this exercise\'s main muscle — 3 sets as a neutral default.', 'Для основной мышцы этого упражнения недельная цель не ведётся — 3 подхода как нейтральное значение по умолчанию.');
  } else {
    const quality = data.settings.quality;
    const others = { ...workout, exercises: workout.exercises.filter((_, i) => i !== exerciseIndex) };
    const thisSession = computeVolume([others], registry, quality).muscles[primaryMuscle].effective;
    const otherToday = computeVolume(data.workouts.filter((w) => w.date === today && w.id !== workout.id), registry, quality).muscles[primaryMuscle].effective;
    const already = Math.round((thisSession + otherToday) * 100) / 100;
    const mName = primaryMuscle.replace(/_/g, ' ');
    const mRu = muscleName(primaryMuscle, 'ru');
    if (mw.todayBlocked) {
      setCount = 0;
      setCountReason = L(`${cap(mName)} is likely still recovering from an earlier session (${mw.todayNote}). Skip it today or keep it light — advice, not a rule.`, `${mRu}: вероятно, ещё идёт восстановление после прошлой тренировки (${mw.todayNote}). Сегодня пропустите или сделайте легко — это совет, а не правило.`);
    } else if (mw.todayShare <= 0) {
      setCount = 0;
      // `targetMet` is the number behind the note (the note's text follows the language).
      setCountReason = mw.targetMet
        ? L(`${cap(mName)} has met its weekly target — no extra sets are needed just to fill a number.`, `${mRu}: недельная цель выполнена — добавлять подходы ради цифры не нужно.`)
        : L(`No sets planned for ${mName} today (${mw.todayNote}).`, `${mRu}: на сегодня подходы не запланированы (${mw.todayNote}).`);
    } else {
      const need = Math.max(0, mw.todayShare - already);
      const rawSets = need / primaryCoefficient;
      if (rawSets < 0.5) {
        setCount = 0;
        setCountReason = L(`Today's share for ${mName} (${mw.todayShare}) is already covered by earlier exercises (${already} effective sets) — extra sets are optional, not needed.`, `${mRu}: доля на сегодня (${num(mw.todayShare)}) уже закрыта предыдущими упражнениями (эффективных подходов: ${num(already)}) — дополнительные подходы по желанию, они не нужны.`);
      } else {
        setCount = clamp(Math.round(rawSets), 1, maxSets);
        setCountReason = L(
          `Today's share for ${mName}: ${mw.todayShare} effective set${mw.todayShare === 1 ? '' : 's'}`
          + (already > 0 ? ` − ${already} from earlier exercises` : '')
          + (primaryCoefficient !== 1 ? ` ÷ ${primaryCoefficient} per set` : '')
          + ` → ${setCount}${Math.round(rawSets) > maxSets ? ` (capped at ${maxSets} for one exercise — another ${mName} exercise can cover the rest, or it carries over)` : ''}.`,
          `${mRu}: доля на сегодня — ${num(mw.todayShare)} эфф. подх.`
          + (already > 0 ? ` − ${num(already)} от предыдущих упражнений` : '')
          + (primaryCoefficient !== 1 ? ` ÷ ${num(primaryCoefficient)} за подход` : '')
          + ` → ${setCount}${Math.round(rawSets) > maxSets ? ` (не больше ${maxSets} на одно упражнение — остальное закроет другое упражнение на эту мышцу, или оно перенесётся)` : ''}.`,
        );
        const pr = analysis.planRecovery[primaryMuscle];
        if (pr?.status === 'recovering' && pr.hoursLeft > 0 && setCount > 1) {
          setCount -= 1;
          setCountReason += L(` One set fewer: ${mName} is nearly recovered (~${pr.hoursLeft} h left by the heuristic).`, ` На один подход меньше: мышца почти восстановилась (по эвристике осталось ~${pr.hoursLeft} ч).`);
        }
      }
    }
  }

  if (input.setCount) {
    setCount = clamp(Math.round(input.setCount.count), 0, maxSets);
    setCountReason = input.setCount.reason;
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
  if (repSource === 'exercise_default' && setCount > 0) notes.push(L(`Rep range ${exRange[0]}–${exRange[1]} is the exercise default until you have history at this load`, `Диапазон ${exRange[0]}–${exRange[1]} повт. — значение по умолчанию для упражнения, пока нет истории с этим весом`));
  if (repSource === 'estimate' && setCount > 0) notes.push(L('Reps at this load are estimated from your best recent set', 'Повторения с этим весом оценены по вашему лучшему недавнему подходу'));
  if (rest.source === 'bounds') notes.push(L('No rest history yet', 'Истории отдыха пока нет'));
  if (repDropFromOrder > 0 && setCount > 0) {
    const names = context.from.map((id) => { const d = registry.get(id); return d ? L(d.name.en, d.name.ru) : id; }).join(', ');
    notes.push(L(
      `After ${names}: expect about ${repDropFromOrder} rep${repDropFromOrder === 1 ? '' : 's'} fewer at this load than when it is done first — the order of the session, not a regression`,
      `После: ${names} — ожидайте примерно на ${repDropFromOrder} повт. меньше с этим весом, чем когда упражнение идёт первым: это порядок тренировки, а не регресс`,
    ));
  }

  // ---- warm-ups
  const { warmups, warmupReason } = planWarmups({ data, workout, exerciseIndex, def, weight, loadMode, step, stepSource: stepInfo.source, minKg, maxKg, primaryMuscle, raw, registry });

  return {
    engine: PRESCRIPTION_ENGINE, key, exerciseId: ex.exerciseId, equipmentId: ex.equipmentId, loadMode,
    sessionsUsed, confidence, status: confidence === 'low' ? 'calibrating' : 'ready', confidenceReason,
    decision, decisionWhy, advice, workingWeightKg: weight, step, stepSource: stepInfo.source, minKg, maxKg,
    warmups, warmupReason, sets, setCount, setCountReason, primaryMuscle, primaryCoefficient,
    repBounds, repSource, repDropPerSet, rirTarget, rirReason, rest, notes, context, expectedRepDrop: repDropFromOrder,
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

  if (weight == null) return { warmups: [], warmupReason: L('No working weight known yet — no warm-up load can be prescribed; do an easy rehearsal set if needed.', 'Рабочий вес пока неизвестен — вес разминки назначить нельзя; при необходимости сделайте лёгкий пробный подход.') };

  // Assisted: warm up with MORE assistance (easier), never less.
  if (loadMode === 'assisted') {
    if (priorSameMuscle >= 2) return { warmups: [], warmupReason: L(`Muscles already warm from ${priorSameMuscle} earlier sets — no warm-up needed.`, `Мышцы уже разогреты (подходов до этого: ${priorSameMuscle}) — разминка не нужна.`) };
    let w = weight + 2 * (step || 5);
    if (c.maxKg != null) w = Math.min(c.maxKg, w);
    return w > weight
      ? { warmups: [{ weightKg: w, reps: 5 }], warmupReason: L('Assisted: one easier set with more assistance to rehearse the movement.', 'С помощью: один более лёгкий подход с большей помощью, чтобы отработать движение.') }
      : { warmups: [], warmupReason: L('Already at the most assistance available — start with the working sets.', 'Помощь уже максимальная — начинайте с рабочих подходов.') };
  }
  // Bodyweight with added load: rehearse with bodyweight only.
  if (loadMode === 'bodyweight_plus' && weight > 0) {
    if (priorSameMuscle >= 2) return { warmups: [], warmupReason: L(`Muscles already warm from ${priorSameMuscle} earlier sets — no warm-up needed.`, `Мышцы уже разогреты (подходов до этого: ${priorSameMuscle}) — разминка не нужна.`) };
    return { warmups: [{ weightKg: 0, reps: 5 }], warmupReason: L('One bodyweight-only set before adding the load.', 'Один подход только со своим весом перед добавлением отягощения.') };
  }
  if (weight <= 0) {
    if (def.category === 'compound' && priorSameMuscle < 2) return { warmups: [{ weightKg: 0, reps: 4 }], warmupReason: L('Bodyweight compound: one easy, short set to rehearse the movement.', 'Многосуставное упражнение со своим весом: один лёгкий короткий подход, чтобы отработать движение.') };
    return { warmups: [], warmupReason: L('Bodyweight isolation — the first working set is its own warm-up.', 'Изолирующее упражнение со своим весом — первый рабочий подход сам служит разминкой.') };
  }

  // Contextual plan from the shared rules (warmupFor), then adjusted.
  const base = warmupFor(def, weight, step, priorSameMuscle);
  let plan = base.sets.filter((s) => s.weight != null).map((s) => ({ pct: (s.weight as number) / weight, reps: s.reps }));
  let reason = base.reason;
  if (def.category === 'compound' && priorSameMuscle < 2 && heavyEarlier && plan.length >= 2) {
    plan = plan.slice(1);
    reason = L('A heavy compound was already done this session (generally warm): shorter ramp for this movement.', 'В этой тренировке уже было тяжёлое многосуставное упражнение (тело разогрето): подводка для этого движения короче.');
  }
  if (def.category === 'isolation' && priorSameMuscle === 1) reason = L('Isolation after a little same-muscle work: one moderate set.', 'Изолирующее упражнение после небольшой работы на ту же мышцу: один умеренный подход.');

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
      ? L(`Based on your own warm-up habit here (${habitRows.length} sessions): ${habit.map((h) => `~${Math.round(h.pct * 100)}%`).join(' → ')}${count < habit.length ? ', shortened because the muscle is already warm' : ''}.`, `По вашей привычной разминке здесь (тренировок: ${habitRows.length}): ${habit.map((h) => `~${Math.round(h.pct * 100)}%`).join(' → ')}${count < habit.length ? ', короче, потому что мышца уже разогрета' : ''}.`)
      : L(`Your usual warm-up is skipped: the muscle already did ${priorSameMuscle} sets this session.`, `Обычная разминка пропущена: эта мышца уже выполнила ${priorSameMuscle} ${ruPlural(priorSameMuscle, 'подход', 'подхода', 'подходов')} за эту тренировку.`);
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
  return { warmups: out, warmupReason: out.length ? reason : plan.length ? L('The working weight is too light for a lighter warm-up step on this equipment — start with the working sets.', 'Рабочий вес слишком мал для более лёгкого разминочного шага на этом оборудовании — начинайте с рабочих подходов.') : reason };
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
  opts: { easyTap?: boolean } = {},
): { sets: Prescription['sets']; change: AdaptChange; why: string } {
  const done = doneWorking(performed);
  const n = Math.ceil(countedSetCount(done, ['working']));
  const remaining = p.sets.slice(n).map((s) => ({ ...s }));
  if (!done.length) return { sets: remaining, change: 'none', why: L('No working set done yet — follow the prescription.', 'Рабочих подходов пока нет — следуйте назначению.') };
  if (!remaining.length) return { sets: remaining, change: 'none', why: L('All prescribed working sets are done.', 'Все назначенные рабочие подходы выполнены.') };

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
    return { sets: remaining, change: 'none', why: L('Pain flagged — no load is added. If it persists, stop this exercise for today.', 'Отмечена боль — вес не добавляется. Если она не проходит, прекратите это упражнение на сегодня.') };
  }

  // 1) Broken technique at the limit → one step down.
  const brokenSets = done.filter(isBroken).length;
  if ((isBroken(last) && hitLimit(last)) || brokenSets >= 2) {
    if (w != null && step > 0) {
      const to = withLimits(assisted ? w + step : stepLoad(w, -step, step));
      if (to !== w && (assisted || w > 0)) {
        return { sets: setW(to), change: 'reduce', why: L(`Technique broke down${last.technicalFailure ? ' (technical failure)' : ''} at ${w} kg — ${assisted ? 'more assistance' : 'one step down'} to ${to} kg for the remaining sets, with full range and control.`, `Техника нарушилась${last.technicalFailure ? ' (отказ по технике)' : ''} на ${ruKg(w)} кг — ${assisted ? 'больше помощи' : 'на один шаг ниже'}: ${num(to)} кг на оставшиеся подходы, с полной амплитудой и контролем.`) };
      }
    }
    return { sets: remaining.map((s) => ({ ...s, repsMin: Math.max(1, s.repsMin - 2), repsMax: Math.max(1, s.repsMax - 2) })), change: 'reduce', why: L(`Technique broke down, but no lighter step is available${w != null ? ` below ${w} kg` : ''} — stop the remaining sets 2 reps earlier.`, `Техника нарушилась, но более лёгкого шага нет${w != null ? ` ниже ${num(w)} кг` : ''} — заканчивайте оставшиеся подходы на 2 повторения раньше.`) };
  }

  // 2) Clearly too easy with clean technique and reps at the top.
  const t = techniqueOf(last);
  const clean = t == null || t === 'good' || t === 'not_assessed';
  // In the training mode the EASY tap ("3+ left") with reps at the top counts too (owner 2026-11-24, an offer only);
  // between sessions "a little too easy" alone still never raises the load (suggestNextLoad).
  const easyEffort = last.rir != null ? last.rir >= target.rirMax + 2 : last.feel === 'too_easy' || (!!opts.easyTap && (last.effort === 'easy' || last.effort === 'very_easy'));
  if (easyEffort && clean && last.reps != null && last.reps >= target.repsMax && !benchmarkExclusion(last)) {
    let to: number | null = null;
    if (w != null && step > 0) {
      if (assisted) to = w > 0 ? withLimits(Math.max(0, w - step)) : null;
      else if (w > 0 || p.loadMode === 'bodyweight_plus') to = stepLoad(w, step, step);
      if (to != null && !assisted && p.maxKg != null && to > p.maxKg) to = null;
      if (to === w) to = null;
    }
    if (to != null) {
      return { sets: setW(to), change: 'add_load', why: L(`${last.reps} reps at ${w} kg ${last.rir != null ? `with RIR ${last.rir}` : 'felt too easy'} — ${assisted ? 'less assistance' : `+${step} kg`}: ${to} kg for the remaining sets.`, `${last.reps} повт. с ${ruKg(w)} кг ${last.rir != null ? `при RIR ${last.rir}` : '— слишком легко'} — ${assisted ? 'меньше помощи' : `+${num(step)} кг`}: ${num(to)} кг на оставшиеся подходы.`) };
    }
    return {
      sets: remaining.map((s) => ({ ...s, repsMin: Math.min(30, s.repsMin + 2), repsMax: Math.min(30, s.repsMax + 2) })),
      change: 'add_reps',
      why: L(`Too easy at ${w ?? 'this'} kg, but no heavier step is available on this equipment${p.maxKg != null ? ` (max ${p.maxKg} kg)` : ''} — keep the weight and add ~2 reps per set.`, `Слишком легко${w != null ? ` с ${num(w)} кг` : ''}, но более тяжёлого шага на этом оборудовании нет${p.maxKg != null ? ` (макс. ${num(p.maxKg)} кг)` : ''} — оставьте вес и добавьте ~2 повторения в подходе.`),
    };
  }

  // 3) Reps well below the range at the prescribed load.
  const wellBelow = (s: WorkoutSet, i: number) => {
    const pr = s.prescribed ?? p.sets[Math.min(i, p.sets.length - 1)];
    return !!pr && s.reps != null && s.weightKg === pr.weightKg && s.reps <= pr.repsMin - 2;
  };
  if (wellBelow(last, done.length - 1)) {
    const usual = usualRestSec(done.map((x) => x.restSecBefore), p.rest.medianSec);
    if (isShortRest(last.restSecBefore, usual)) {
      return { sets: remaining, change: 'none', why: L(`Reps dropped after a shorter rest (${last.restSecBefore} s vs your usual ~${usual} s) — likely the rest, not the load. Rest fully before the next set.`, `Повторения упали после более короткого отдыха (${last.restSecBefore} с против обычных ~${usual} с) — вероятно, дело в отдыхе, а не в весе. Перед следующим подходом отдохните полностью.`) };
    }
    const offCount = done.filter((s, i) => wellBelow(s, i)).length;
    if (offCount >= 2) {
      const r = last.reps as number;
      return {
        sets: remaining.map((s) => ({ ...s, repsMin: Math.max(1, Math.min(s.repsMin, r - 1)), repsMax: Math.max(1, Math.min(s.repsMax, r + 1)) })),
        change: 'reduce',
        why: L(`Reps fell well below the range on ${offCount} sets at ${w} kg — keep the load and aim for ~${Math.max(1, r - 1)}–${r + 1} reps on the remaining sets; the load is reviewed next session.`, `Повторений намного меньше диапазона в ${offCount} подх. с ${ruKg(w)} кг — оставьте вес и ориентируйтесь на ~${Math.max(1, r - 1)}–${r + 1} повт. в оставшихся подходах; вес будет пересмотрен на следующей тренировке.`),
      };
    }
    return { sets: remaining, change: 'defer', why: L(`One set fell short (${last.reps} reps at ${w} kg) — keep the plan; one set is not enough to change the load. Reviewed next session.`, `Один подход не дотянул (${last.reps} повт. с ${ruKg(w)} кг) — план не меняется: одного подхода недостаточно, чтобы менять вес. Пересмотр на следующей тренировке.`) };
  }

  return { sets: remaining, change: 'none', why: L(`On target — keep ${w ?? '?'} kg and aim for the planned reps at RIR ${target.rirMin}–${target.rirMax}.`, `По плану — оставьте ${ruKg(w)} кг и выполняйте запланированные повторения при RIR ${target.rirMin}–${target.rirMax}.`) };
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
