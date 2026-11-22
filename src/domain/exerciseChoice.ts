/**
 * Exercise-choice assistant (Part 5, E.1 + E.2). Pure: given the analysis, the stored data and the CURRENT
 * session (whatever order it was performed in), it says whether picking an exercise right now is a
 * GOOD CHOICE, ACCEPTABLE, or worth reconsidering (CONSIDER ALTERNATIVE / CONSIDER LATER) — and why.
 *
 * Four dimensions are evaluated SEPARATELY and never merged into a score:
 *   recovery (existing `planRecovery` windows — no second recovery model), weekly volume (existing
 *   targets / today's share), fatigue cost of the exercise vs. what this session already did, and order
 *   (cheap isolation of a synergist before a demanding compound that is still planned).
 * A weekly deficit never overrides recovery. Pain is a separate SAFETY line, never a fatigue reason.
 * Nothing here blocks: the UI offers [Use alternative] [Continue]; answered warnings are not repeated.
 * Wording never claims a biological state ("RECENTLY LOADED", not "damaged").
 */
import type { AppData } from './appdata';
import { addDays, diffDays, formatDate } from './dates';
import { hasPain } from './feedback';
import { FATIGUE_LABEL, FATIGUE_RANK, fatigueCostOf, isHeavyLower, sessionLoad, significantMuscles, type SessionLoad } from './fatigue';
import { muscleName, MUSCLE_BY_ID } from './muscles';
import { progressionKey } from './progression';
import { isCounted } from './quality';
import { movementFamily } from './recovery';
import { RECOVERY_TOLERANCE_H, type analyze } from './analysis';
import type { ExerciseDef, FatigueCost, MovementPattern, MuscleId, Variation, Workout, WorkoutExercise } from './types';

type Analysis = ReturnType<typeof analyze>;

export type MuscleState = 'LIKELY_READY' | 'RECENTLY_LOADED' | 'RECOVERY_UNCERTAIN' | 'PERFORMANCE_DECLINING';
export type ChoiceStatus = 'good' | 'acceptable' | 'reconsider';
export type ChoiceReason = 'recovery' | 'volume' | 'fatigue' | 'order' | 'uncertain' | 'decline';
export type ChoiceLabel = 'GOOD CHOICE' | 'ACCEPTABLE' | 'CONSIDER ALTERNATIVE' | 'CONSIDER LATER';

export const STATE_LABEL: Record<MuscleState, string> = {
  LIKELY_READY: 'READY', RECENTLY_LOADED: 'RECENTLY LOADED', RECOVERY_UNCERTAIN: 'RECOVERY UNCERTAIN', PERFORMANCE_DECLINING: 'PERFORMANCE DECLINING',
};

export interface MuscleLine {
  muscle: MuscleId;
  coef: number;
  state: MuscleState;
  /** Where RECENTLY_LOADED comes from: an earlier session (recovery window) or this session's own sets. */
  source: 'earlier_session' | 'this_session' | null;
  hoursLeft: number;
  /** Effective sets left this week to the preferred target. */
  weekLeft: number;
  /** Open part of today's (capped, catch-up-free) share. */
  todayLeft: number;
  text: string;
}

export interface ChoiceAlternative {
  exerciseId: string;
  equipmentId: string | null;
  /** same_muscle = trains the same primary with less load on the busy muscles; other_muscle = a recovered deficit; do_first = a planned compound to do before this. */
  kind: 'same_muscle' | 'other_muscle' | 'do_first';
  sessions: number;
  why: string;
}

export interface ChoiceAssessment {
  exerciseId: string;
  equipmentId: string | null;
  status: ChoiceStatus;
  reasonKind: ChoiceReason | null;
  label: ChoiceLabel;
  muscles: MuscleLine[];
  fatigueCost: FatigueCost;
  position: 'FIRST HALF' | 'SECOND HALF';
  /** Separate pain / safety line (never part of the status). */
  safety: string | null;
  alternatives: ChoiceAlternative[];
  confidence: 'high' | 'moderate' | 'low';
  /** One short line per finding, most important first. */
  why: string[];
  /** Identity of this warning for "already answered" checks (exercise + reason + muscle states). */
  key: string;
  /** A recovery warning softened because ≥ 3 earlier overrides went fine (choice_learning). */
  softened: boolean;
}

export interface AssessInput {
  data: AppData;
  analysis: Analysis;
  /** The current session (performed sets in any order; planned sets ignored). null = no session yet. */
  workout: Workout | null;
  exerciseId: string;
  equipmentId?: string | null;
  variation?: Variation | null;
  /** Skip the alternatives search (picker badges). Default true. */
  alternatives?: boolean;
  /** Precomputed `choiceOutcomes` (when assessing many exercises at once). */
  outcomes?: Map<string, ChoiceOutcome>;
}

// ---------------------------------------------------------------- helpers shared with the planner

const FREE_KINDS = new Set(['barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band']);
const MACHINE_KINDS = new Set(['machine', 'plate_loaded', 'cable', 'smith']);

/** Workouts before the current one (the current session never counts as history). */
export function priorWorkouts(data: AppData, current: Workout | null): Workout[] {
  return data.workouts.filter((w) => !current || w.id !== current.id);
}

/** Sessions in which each exercise was performed (any equipment), from earlier workouts. */
export function exerciseSessionCounts(workouts: Workout[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of workouts) {
    const seen = new Set<string>();
    for (const e of w.exercises) {
      if (seen.has(e.exerciseId) || !e.sets.some((s) => isCounted(s) && s.type === 'working')) continue;
      seen.add(e.exerciseId);
      m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + 1);
    }
  }
  return m;
}

/** Median number of exercises per session over the last 8 weeks (default 5). */
export function usualExerciseCount(workouts: Workout[], today: string): number {
  const xs = workouts
    .filter((w) => diffDays(today, w.date) >= 0 && diffDays(today, w.date) <= 56)
    .map((w) => w.exercises.filter((e) => e.sets.some((s) => isCounted(s) && s.type === 'working')).length)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  if (!xs.length) return 5;
  return Math.max(3, Math.min(8, xs[Math.floor(xs.length / 2)]));
}

/**
 * Where an exercise can be done at this gym right now: the machine linked to it here (most used first,
 * busy machines excluded), or free weights / bodyweight. Machines from another gym never count.
 */
export function availableEquipment(
  data: AppData, def: ExerciseDef, locationId: string | null, busy: Set<string>, history: Workout[],
): { ok: boolean; equipmentId: string | null; known: boolean } {
  const usedHere = new Map<string, number>();
  let freeUsedHere = 0;
  let freeUsedAnywhere = 0;
  for (const w of history) {
    for (const e of w.exercises) {
      if (e.exerciseId !== def.id) continue;
      if (e.equipmentId) {
        const eq = data.equipment.find((x) => x.id === e.equipmentId);
        if (eq && (eq.locationId === locationId || eq.locationId == null)) usedHere.set(e.equipmentId, (usedHere.get(e.equipmentId) ?? 0) + 1);
      } else {
        freeUsedAnywhere++;
        if (!locationId || w.locationId === locationId) freeUsedHere++;
      }
    }
  }
  const linked = data.equipment
    .filter((e) => !busy.has(e.id) && (e.locationId === locationId || (e.locationId == null && usedHere.has(e.id))) && (e.exerciseIds.includes(def.id) || usedHere.has(e.id)))
    .sort((a, b) => (usedHere.get(b.id) ?? 0) - (usedHere.get(a.id) ?? 0));
  if (linked.length) return { ok: true, equipmentId: linked[0].id, known: true };
  if (FREE_KINDS.has(def.equipmentKind)) {
    // Free weights: available when used at this gym before (or anywhere when no gym is set).
    if (freeUsedHere > 0) return { ok: true, equipmentId: null, known: true };
    if (!locationId && freeUsedAnywhere > 0) return { ok: true, equipmentId: null, known: true };
    return { ok: def.equipmentKind === 'bodyweight' || def.equipmentKind === 'dumbbell', equipmentId: null, known: false };
  }
  return { ok: false, equipmentId: null, known: false };
}

/** Body areas each movement pattern loads (for the separate pain / safety line). */
const PAIN_REGIONS: Partial<Record<MovementPattern, string[]>> = {
  horizontal_push: ['Shoulder', 'Elbow', 'Wrist'], incline_push: ['Shoulder', 'Elbow', 'Wrist'], vertical_push: ['Shoulder', 'Elbow', 'Wrist', 'Neck'],
  chest_fly: ['Shoulder', 'Elbow'], horizontal_pull: ['Shoulder', 'Elbow', 'Lower back'], vertical_pull: ['Shoulder', 'Elbow'],
  shoulder_abduction: ['Shoulder', 'Neck'], rear_delt: ['Shoulder'], shrug: ['Neck', 'Upper back'], elbow_flexion: ['Elbow', 'Wrist'],
  elbow_extension: ['Elbow', 'Wrist', 'Shoulder'], wrist: ['Wrist', 'Elbow'], squat: ['Knee', 'Hip', 'Lower back'], hinge: ['Lower back', 'Hip'],
  lunge: ['Knee', 'Hip', 'Ankle'], knee_extension: ['Knee'], knee_flexion: ['Knee'], hip_extension: ['Hip', 'Lower back'], hip_adduction: ['Hip'],
  hip_abduction: ['Hip'], calf: ['Ankle'], core: ['Lower back', 'Hip'], back_extension: ['Lower back'], carry: ['Lower back', 'Wrist', 'Shoulder'],
};

/** Pain logged in the last 7 days on this exercise or on an area this movement loads — separate from fatigue. */
export function safetyLine(data: AppData, def: ExerciseDef, today: string, registry: Analysis['registry'], current: Workout | null): string | null {
  const since = addDays(today, -7);
  const regions = PAIN_REGIONS[def.pattern] ?? [];
  let same: { date: string; area: string } | null = null;
  let region: { date: string; area: string; ex: string } | null = null;
  const pool = [...data.workouts.filter((w) => w.date >= since && w.date <= today)];
  if (current && !pool.some((w) => w.id === current.id)) pool.push(current);
  for (const w of pool) {
    for (const e of w.exercises) {
      for (const s of e.sets) {
        if (!hasPain(s) || s.planned) continue;
        const area = s.pain?.area || '';
        if (e.exerciseId === def.id) { if (!same || w.date > same.date) same = { date: w.date, area }; }
        else if (area && regions.includes(area) && (!region || w.date > region.date)) region = { date: w.date, area, ex: registry.get(e.exerciseId)?.name.en ?? e.exerciseId };
      }
    }
  }
  if (same) return `SAFETY: pain logged on this exercise ${formatDate(same.date)}${same.area ? ` (${same.area.toLowerCase()})` : ''}. If it hurts again, stop — a pain-free alternative or rest is the better choice.`;
  if (region) return `SAFETY: ${region.area.toLowerCase()} pain logged ${formatDate(region.date)} (${region.ex}); this movement also loads the ${region.area.toLowerCase()}. Stop if it hurts.`;
  return null;
}

// ---------------------------------------------------------------- learning from overridden choices

export interface ChoiceOutcome { exerciseId: string; observations: number; notLower: number; softened: boolean }

/**
 * For each exercise: overridden RECOVERY warnings ("Continue" on CONSIDER ALTERNATIVE) and whether that
 * session's performance index was not lower than the previous comparable session (same history, same
 * index kind). Uses the last 3 observations; ≥ 2 not lower → the warning is softened (rule choice_learning).
 */
export function choiceOutcomes(data: AppData, analysis: Analysis): Map<string, ChoiceOutcome> {
  const out = new Map<string, ChoiceOutcome>();
  const obs = new Map<string, boolean[]>();
  const sorted = [...data.workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of sorted) {
    for (const e of w.exercises) {
      const c = e.choice;
      if (!c || c.followed !== 'continued' || c.status !== 'reconsider' || c.reasonKind !== 'recovery') continue;
      const key = progressionKey(e, w, analysis.registry.get(e.exerciseId));
      const series = analysis.progression.find((p) => p.key === key);
      if (!series) continue;
      const i = series.sessions.findIndex((s) => s.workoutId === w.id);
      if (i < 0) continue;
      const cur = series.sessions[i];
      const prev = [...series.sessions.slice(0, i)].reverse().find((s) => s.representative && s.indexKind === cur.indexKind);
      if (!prev || cur.indexRaw == null || prev.indexRaw == null) continue;
      const list = obs.get(e.exerciseId) ?? [];
      list.push(cur.indexRaw >= prev.indexRaw * 0.97);
      obs.set(e.exerciseId, list);
    }
  }
  for (const [id, list] of obs) {
    const last = list.slice(-3);
    const notLower = last.filter(Boolean).length;
    out.set(id, { exerciseId: id, observations: list.length, notLower, softened: last.length >= 3 && notLower >= 2 });
  }
  return out;
}

// ---------------------------------------------------------------- assess

const SEVERITY: Record<ChoiceStatus, number> = { good: 0, acceptable: 1, reconsider: 2 };
const REASON_ORDER: ChoiceReason[] = ['recovery', 'volume', 'fatigue', 'order', 'uncertain', 'decline'];

interface Finding { status: ChoiceStatus; kind: ChoiceReason; text: string }

export function labelOf(status: ChoiceStatus, reason: ChoiceReason | null): ChoiceLabel {
  return status === 'good' ? 'GOOD CHOICE' : status === 'acceptable' ? 'ACCEPTABLE' : reason === 'order' ? 'CONSIDER LATER' : 'CONSIDER ALTERNATIVE';
}

export function assessChoice(input: AssessInput): ChoiceAssessment {
  const { data, analysis, workout, exerciseId } = input;
  const registry = analysis.registry;
  const def = registry.get(exerciseId);
  const equipmentId = input.equipmentId ?? null;
  const variation = input.variation ?? undefined;
  const today = analysis.today;
  const history = priorWorkouts(data, workout);
  const counts = exerciseSessionCounts(history);
  const load: SessionLoad | null = workout ? sessionLoad(workout, registry, data.settings.quality) : null;
  const busy = new Set((workout?.busyEquipment ?? []).map((b) => b.equipmentId));

  if (!def) {
    return {
      exerciseId, equipmentId, status: 'acceptable', reasonKind: 'uncertain', label: 'ACCEPTABLE', muscles: [], fatigueCost: 'moderate', position: 'FIRST HALF',
      safety: null, alternatives: [], confidence: 'low', why: ['Unknown exercise — no muscle data to assess.'], key: `${exerciseId}|unknown`, softened: false,
    };
  }

  const sig = significantMuscles(def, variation, 0.5);
  const primary = sig[0]?.muscle ?? null;
  const lines: MuscleLine[] = sig.slice(0, 3).map(({ muscle, coef }, idx) => {
    const mw = analysis.muscles.find((m) => m.muscle === muscle);
    const pr = analysis.planRecovery[muscle];
    const doneNow = Math.max(mw?.doneToday ?? 0, load?.muscles[muscle] ?? 0);
    const todayLeft = Math.max(0, Math.round(((mw?.todayShare ?? 0) - doneNow) * 2) / 2);
    const weekLeft = mw?.remainingToPreferred ?? 0;
    let state: MuscleState = 'LIKELY_READY';
    let source: MuscleLine['source'] = null;
    const hoursLeft = pr?.status === 'recovering' ? pr.hoursLeft : 0;
    // Only a fully assumed time (no start, no end) makes a nearly-finished window uncertain; a known start time
    // misses only the session's own length.
    const timeUnsure = pr?.lastStimulusTimeSource === 'assumed';
    if (pr?.status === 'recovering' && pr.hoursLeft > RECOVERY_TOLERANCE_H) {
      // An unknown session time puts a window that is nearly over into doubt.
      if (timeUnsure && pr.hoursLeft <= 18) state = 'RECOVERY_UNCERTAIN';
      else { state = 'RECENTLY_LOADED'; source = 'earlier_session'; }
    } else if (idx > 0 && doneNow >= 3) {
      state = 'RECENTLY_LOADED';
      source = 'this_session';
    } else if (mw?.trend.overall === 'declining') state = 'PERFORMANCE_DECLINING';
    const name = muscleName(muscle);
    let text = `${name}: ${STATE_LABEL[state]}`;
    if (state === 'RECENTLY_LOADED' && source === 'earlier_session') text += ` (~${hoursLeft} h left)`;
    else if (state === 'RECENTLY_LOADED') text += ` (${round1(doneNow)} sets today)`;
    else if (state === 'RECOVERY_UNCERTAIN') text += ' (session time unknown)';
    if (idx === 0 || state === 'LIKELY_READY') text += weekLeft > 0 ? ` · ${fmtSets(todayLeft > 0 ? todayLeft : weekLeft)} ${todayLeft > 0 ? 'LEFT TODAY' : 'LEFT THIS WEEK'}` : ' · WEEK DONE';
    return { muscle, coef, state, source, hoursLeft, weekLeft, todayLeft, text };
  });

  const cost = fatigueCostOf(def, variation);
  const usual = usualExerciseCount(history, today);
  const doneCount = load?.exercisesDone ?? 0;
  const position: ChoiceAssessment['position'] = doneCount < Math.ceil(usual / 2) ? 'FIRST HALF' : 'SECOND HALF';
  const isPriority = (m: MuscleId | null) => {
    if (!m) return false;
    if (data.settings.priorities[m] === 'high') return true;
    const ready = analysis.muscles.filter((x) => !x.todayBlocked && x.todayLeft >= 2);
    const top = ready.sort((a, b) => b.todayLeft - a.todayLeft)[0];
    return !!top && top.muscle === m;
  };

  const findings: Finding[] = [];
  const pLine = lines[0];
  const pmw = primary ? analysis.muscles.find((m) => m.muscle === primary) : undefined;
  const outcomes = input.outcomes ?? choiceOutcomes(data, analysis);
  let softened = false;

  // 1) Recovery (never overridden by a weekly deficit).
  if (pLine?.state === 'RECENTLY_LOADED' && pLine.source === 'earlier_session') {
    if (outcomes.get(exerciseId)?.softened) {
      softened = true;
      findings.push({ status: 'acceptable', kind: 'recovery', text: `${muscleName(pLine.muscle)} trained recently (~${pLine.hoursLeft} h left by the heuristic), but your last overrides here performed as usual.` });
    } else findings.push({ status: 'reconsider', kind: 'recovery', text: `${muscleName(pLine.muscle)} was trained recently — ~${pLine.hoursLeft} h left by the recovery heuristic.` });
  } else if (pLine?.state === 'RECOVERY_UNCERTAIN') {
    findings.push({ status: 'acceptable', kind: 'uncertain', text: `${muscleName(pLine.muscle)}: last session time unknown, so recovery is uncertain (assumed 18:00 or start time).` });
  }
  const loadedSyn = lines.slice(1).filter((l) => l.state === 'RECENTLY_LOADED');

  // 2) Weekly volume.
  if (pmw && pmw.status === 'over') findings.push({ status: 'reconsider', kind: 'volume', text: `${muscleName(pmw.muscle)} is above its weekly upper bound (${round1(pmw.completed)} / ${pmw.target.max}) — more sets add fatigue, little growth.` });
  else if (pmw && pmw.status === 'done') findings.push({ status: 'acceptable', kind: 'volume', text: `${muscleName(pmw.muscle)} weekly target already met (${round1(pmw.completed)} / ${pmw.target.preferred}).` });
  else if (pLine && pmw && pmw.todayShare > 0 && pLine.todayLeft <= 0 && pLine.state === 'LIKELY_READY') findings.push({ status: 'acceptable', kind: 'volume', text: `Today's share for ${muscleName(pmw.muscle).toLowerCase()} is already done — more is optional.` });

  // 3) Fatigue cost vs what this session already did.
  if (load && cost === 'high' && isHeavyLower(def, variation) && load.heavyLowerDone.length >= 2 && !isPriority(primary)) {
    findings.push({ status: 'reconsider', kind: 'fatigue', text: `Lower body already heavily loaded this session (${load.heavyLowerDone.map((id) => registry.get(id)?.name.en ?? id).join(' + ')}) — another HIGH-cost lift adds a lot of fatigue for little extra.` });
  } else if (load && cost === 'high' && load.level === 'heavy') {
    findings.push({ status: 'acceptable', kind: 'fatigue', text: 'Demanding lift late in a heavy session — expect fewer reps than usual; earlier next time keeps it stronger.' });
  }

  // 4) Order: cheap isolation of a synergist before a demanding compound still planned in this session.
  if (load && cost === 'low' && primary && !isPriority(primary)) {
    const pending = pendingDoable(workout, exerciseId);
    const blocked = pending.find((e) => {
      const d = registry.get(e.exerciseId);
      if (!d || fatigueCostOf(d, e.variation) === 'low') return false;
      const sm = significantMuscles(d, e.variation, 0.5);
      return sm[0]?.muscle !== primary && sm.some((x) => x.muscle === primary);
    });
    if (blocked) {
      findings.push({ status: 'reconsider', kind: 'order', text: `${muscleName(primary)} also works hard in ${registry.get(blocked.exerciseId)?.name.en ?? 'a planned press/pull'} (still to do) — do that first to keep its reps; isolation after it.` });
    } else if (!pending.length) {
      const host: Partial<Record<MuscleId, MuscleId[]>> = { triceps: ['chest'], front_delts: ['chest'], biceps: ['lats', 'upper_back'], rear_delts: ['upper_back'] };
      const h = (host[primary] ?? []).find((m) => {
        const mw = analysis.muscles.find((x) => x.muscle === m);
        return !!mw && !mw.todayBlocked && mw.todayLeft >= 2 && (load.muscles[m] ?? 0) < 1;
      });
      if (h) findings.push({ status: 'acceptable', kind: 'order', text: `If you still plan ${muscleName(h).toLowerCase()} compounds today, doing them before ${muscleName(primary).toLowerCase()} isolation keeps their reps up.` });
    }
  }

  // 5) Declining performance (this exact history, or the primary's main lifts).
  const key = progressionKey({ id: 'x', order: 0, exerciseId, exerciseConfidence: 'confirmed', equipmentId, equipmentConfidence: 'confirmed', variation, sets: [] } as WorkoutExercise, workout ?? ({ locationId: null } as Workout), def);
  const own = analysis.progression.find((p) => p.key === key);
  if (own?.trend.cls === 'declining') findings.push({ status: 'acceptable', kind: 'decline', text: 'Performance on this exercise is declining — check load, rest and recovery; keep sets high-quality.' });
  else if (pLine?.state === 'PERFORMANCE_DECLINING') findings.push({ status: 'acceptable', kind: 'decline', text: `${muscleName(pLine.muscle)} main lifts are declining — quality over extra sets.` });

  // Synergist recovery: depends on whether an alternative spares it.
  let alternatives: ChoiceAlternative[] = [];
  const wantAlt = input.alternatives !== false;
  const altCtx = { data, analysis, def, variation, workout, history, counts, busy, lines };
  if (loadedSyn.length && primary) {
    const spare = sparingAlternatives(altCtx, primary, loadedSyn.map((l) => l.muscle));
    const names = loadedSyn.map((l) => `${muscleName(l.muscle).toLowerCase()}${l.source === 'this_session' ? ' (today)' : ''}`).join(', ');
    if (spare.length) {
      findings.push({ status: 'reconsider', kind: 'recovery', text: `${muscleName(primary)} is ready, but ${names} ${loadedSyn.length === 1 ? 'is' : 'are'} recently loaded — an option that spares ${loadedSyn.length === 1 ? 'it' : 'them'} trains ${muscleName(primary).toLowerCase()} just as well.` });
      if (wantAlt) alternatives = spare;
    } else findings.push({ status: 'acceptable', kind: 'recovery', text: `${muscleName(primary)} is ready; ${names} recently loaded and no familiar option here spares ${loadedSyn.length === 1 ? 'it' : 'them'}.` });
  }

  // Final status: worst finding; reason by fixed priority.
  let status: ChoiceStatus = 'good';
  for (const f of findings) if (SEVERITY[f.status] > SEVERITY[status]) status = f.status;
  const top = findings.filter((f) => f.status === status).sort((a, b) => REASON_ORDER.indexOf(a.kind) - REASON_ORDER.indexOf(b.kind))[0];
  const reasonKind = status === 'good' ? null : top?.kind ?? null;

  if (wantAlt && status !== 'good' && !alternatives.length) {
    if (reasonKind === 'recovery' || reasonKind === 'volume') alternatives = otherMuscleAlternatives(altCtx, primary);
    else if (reasonKind === 'fatigue' && primary) alternatives = cheaperAlternatives(altCtx, primary, cost);
    else if (reasonKind === 'order') alternatives = doFirstAlternatives(altCtx, primary);
  }

  const why = findings.sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status] || REASON_ORDER.indexOf(a.kind) - REASON_ORDER.indexOf(b.kind)).map((f) => f.text);
  if (status === 'good') {
    if (pLine && pLine.todayLeft > 0) why.unshift(`${muscleName(pLine.muscle)} is ready with ${fmtSets(pLine.todayLeft)} left today.`);
    if (cost === 'high' && position === 'FIRST HALF') why.push('Fatigue cost HIGH early in the session — a good point for it.');
  }
  if (wantAlt && status !== 'good' && !alternatives.length) why.push('No better familiar option here today — continuing is reasonable.');
  why.push(`Fatigue cost ${FATIGUE_LABEL[cost]} · position ${position}.`);

  const hasHistory = history.some((w) => w.date < today);
  const confidence: ChoiceAssessment['confidence'] = !hasHistory || pLine?.state === 'RECOVERY_UNCERTAIN' ? 'low'
    : history.filter((w) => diffDays(today, w.date) <= 56).length < 8 ? 'moderate' : 'high';

  const safety = safetyLine(data, def, today, registry, workout);
  return {
    exerciseId, equipmentId, status, reasonKind, label: labelOf(status, reasonKind), muscles: lines, fatigueCost: cost, position, safety,
    alternatives: alternatives.slice(0, 2), confidence, why,
    key: `${exerciseId}|${equipmentId ?? ''}|${status}|${reasonKind ?? ''}|${lines.map((l) => `${l.muscle}:${l.state}`).join(',')}|${safety ? 'pain' : ''}`,
    softened,
  };
}

/** Already answered in this session (same exercise, reason and muscle states) → not shown again. */
export function isAcknowledged(w: Workout | null, a: Pick<ChoiceAssessment, 'key'>): boolean {
  return !!w?.choiceAcks?.some((k) => k.key === a.key);
}

/** Should the compact card be shown before adding? (non-good status not yet answered, or a safety line). */
export function needsPrompt(w: Workout | null, a: ChoiceAssessment): boolean {
  if (isAcknowledged(w, a)) return false;
  return a.status !== 'good' || a.safety != null;
}

// ---------------------------------------------------------------- alternatives

interface AltCtx {
  data: AppData;
  analysis: Analysis;
  def: ExerciseDef;
  variation?: Variation;
  workout: Workout | null;
  history: Workout[];
  counts: Map<string, number>;
  busy: Set<string>;
  lines: MuscleLine[];
}

function recentlyLoaded(a: Analysis, m: MuscleId): boolean {
  const pr = a.planRecovery[m];
  return pr?.status === 'recovering' && pr.hoursLeft > RECOVERY_TOLERANCE_H;
}

function candidatePool(c: AltCtx, filter: (d: ExerciseDef) => boolean): { d: ExerciseDef; equipmentId: string | null; sessions: number }[] {
  const out: { d: ExerciseDef; equipmentId: string | null; sessions: number }[] = [];
  const fam = movementFamily(c.def.id);
  for (const d of c.analysis.registry.values()) {
    if (d.id === c.def.id || movementFamily(d.id) === fam || !filter(d)) continue;
    if (c.workout?.exercises.some((e) => e.exerciseId === d.id && !e.skipped)) continue;
    const av = availableEquipment(c.data, d, c.workout?.locationId ?? null, c.busy, c.history);
    const sessions = c.counts.get(d.id) ?? 0;
    if (!av.ok) continue;
    if (!av.known && sessions === 0 && MACHINE_KINDS.has(d.equipmentKind)) continue;
    if (sessions === 0 && !av.known) continue; // never suggest something neither familiar nor known to be here
    // None of its significant muscles may be recently loaded.
    if (significantMuscles(d, null, 0.5).some((x) => recentlyLoaded(c.analysis, x.muscle))) continue;
    out.push({ d, equipmentId: av.equipmentId, sessions });
  }
  return out.sort((a, b) => score(b) - score(a));
  function score(x: { d: ExerciseDef; sessions: number }) { return Math.min(x.sessions, 10) * 2 + (x.sessions >= 2 ? 5 : 0); }
}

function sparingAlternatives(c: AltCtx, primary: MuscleId, loaded: MuscleId[]): ChoiceAlternative[] {
  const mine = Object.fromEntries(significantMuscles(c.def, c.variation, 0).map((x) => [x.muscle, x.coef])) as Partial<Record<MuscleId, number>>;
  const pool = candidatePool(c, (d) => {
    const co = significantMuscles(d, null, 0);
    const get = (m: MuscleId) => co.find((x) => x.muscle === m)?.coef ?? 0;
    return get(primary) >= 0.75 && loaded.every((m) => get(m) <= (mine[m] ?? 0) - 0.2);
  }).filter((x) => x.sessions >= 1);
  return pool.slice(0, 2).map((x) => ({
    exerciseId: x.d.id, equipmentId: x.equipmentId, kind: 'same_muscle', sessions: x.sessions,
    why: `${x.d.name.en}: ${muscleName(primary).toLowerCase()} without the ${loaded.map((m) => muscleName(m).toLowerCase()).join(' / ')} load (${x.sessions} session${x.sessions === 1 ? '' : 's'} logged).`,
  }));
}

function otherMuscleAlternatives(c: AltCtx, avoid: MuscleId | null): ChoiceAlternative[] {
  const out: ChoiceAlternative[] = [];
  const needs = c.analysis.muscles
    .filter((m) => m.muscle !== avoid && !m.todayBlocked && m.todayLeft >= 1 && !recentlyLoaded(c.analysis, m.muscle))
    // Larger muscles first at equal need (they usually carry the session).
    .sort((a, b) => b.todayLeft - a.todayLeft || sizeRank(a.muscle) - sizeRank(b.muscle));
  for (const mw of needs) {
    if (out.length >= 2) break;
    const pick = candidatePool(c, (d) => (d.contributions[mw.muscle] ?? 0) >= 0.75).filter((x) => x.sessions >= 1)[0];
    if (pick && !out.some((o) => o.exerciseId === pick.d.id)) {
      out.push({ exerciseId: pick.d.id, equipmentId: pick.equipmentId, kind: 'other_muscle', sessions: pick.sessions, why: `${pick.d.name.en}: ${muscleName(mw.muscle).toLowerCase()} is ready with ${fmtSets(mw.todayLeft)} left today.` });
    }
  }
  return out;
}

function cheaperAlternatives(c: AltCtx, primary: MuscleId, cost: FatigueCost): ChoiceAlternative[] {
  return candidatePool(c, (d) => (d.contributions[primary] ?? 0) >= 0.75 && FATIGUE_RANK[fatigueCostOf(d)] > FATIGUE_RANK[cost])
    .filter((x) => x.sessions >= 1).slice(0, 2)
    .map((x) => ({ exerciseId: x.d.id, equipmentId: x.equipmentId, kind: 'same_muscle', sessions: x.sessions, why: `${x.d.name.en}: ${muscleName(primary).toLowerCase()} at a ${FATIGUE_LABEL[fatigueCostOf(x.d)].toLowerCase()} fatigue cost.` }));
}

function doFirstAlternatives(c: AltCtx, primary: MuscleId | null): ChoiceAlternative[] {
  const pending = pendingDoable(c.workout, c.def.id);
  const out: ChoiceAlternative[] = [];
  for (const e of pending) {
    const d = c.analysis.registry.get(e.exerciseId);
    if (!d || fatigueCostOf(d, e.variation) === 'low') continue;
    if (primary && !significantMuscles(d, e.variation, 0.5).some((x) => x.muscle === primary)) continue;
    out.push({ exerciseId: d.id, equipmentId: e.equipmentId, kind: 'do_first', sessions: c.counts.get(d.id) ?? 0, why: `${d.name.en} first (still planned), then this.` });
  }
  return out.slice(0, 2);
}

/** Exercises still to do in the session that can actually be done now (not skipped, not postponed, machine not busy). */
function pendingDoable(w: Workout | null, except: string): WorkoutExercise[] {
  const busy = new Set((w?.busyEquipment ?? []).map((b) => b.equipmentId));
  return (w?.exercises ?? []).filter((e) => e.exerciseId !== except && !e.skipped && !e.deferredAt && !(e.equipmentId && busy.has(e.equipmentId))
    && !e.sets.some((s) => isCounted(s) && s.type === 'working'));
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmtSets = (n: number) => `${Number.isInteger(n) ? n : round1(n)} SET${n === 1 ? '' : 'S'}`;
const sizeRank = (m: MuscleId) => ({ large: 0, medium: 1, small: 2 })[MUSCLE_BY_ID[m].size];
