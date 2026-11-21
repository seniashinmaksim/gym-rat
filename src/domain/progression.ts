import { diffDays } from './dates';
import type { Registry } from './registry';
import type { Equipment, EquipmentKind, ExerciseDef, ExerciseOverride, Workout, WorkoutExercise } from './types';

/**
 * Progression is tracked per (exercise × equipment instance). Loads from two different
 * machines are NEVER compared. Unidentified machines are kept separate per location.
 * Free weights without an equipment id share one history ("free weights") because
 * kilograms on barbells/dumbbells are standardised.
 */

const FREE_KINDS: EquipmentKind[] = ['barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band'];

export function progressionKey(ex: WorkoutExercise, w: Workout, def: ExerciseDef | undefined): string {
  if (ex.equipmentId) return `${ex.exerciseId}::${ex.equipmentId}`;
  if (def && FREE_KINDS.includes(def.equipmentKind)) return `${ex.exerciseId}::free`;
  return `${ex.exerciseId}::unidentified@${w.locationId ?? 'unknown'}`;
}

export interface SetPoint {
  weight: number | null;
  reps: number | null;
  rir: number | null;
}

export interface SessionPerf {
  workoutId: string;
  date: string;
  sets: SetPoint[];
  topWeight: number | null;
  topReps: number | null;
  topRir: number | null;
  /** RIR-adjusted Epley estimate. Index for THIS equipment only, not a true 1RM. */
  e1rm: number | null;
  /** Generic performance index (e1rm for loaded sets; reps+RIR for bodyweight). */
  index: number | null;
  totalReps: number;
  volumeLoad: number;
  avgRir: number | null;
  rirKnownRatio: number;
  restAvgSec: number | null;
}

export type TrendClass = 'progressing' | 'stable' | 'plateau' | 'declining' | 'insufficient_data';

export interface Trend {
  cls: TrendClass;
  evidence: string;
  relSlopePerSession: number | null;
  sessionsUsed: number;
}

export interface NextLoad {
  action: 'increase' | 'hold' | 'reduce' | 'calibrate';
  weight: number | null;
  repTarget: [number, number];
  rirTarget: number;
  increment: number;
  reason: string;
}

export interface ProgressionSeries {
  key: string;
  exerciseId: string;
  equipmentId: string | null;
  scopeLabel: string;
  loadMode: string;
  sessions: SessionPerf[];
  trend: Trend;
  best: { e1rm: number | null; weight: number | null; reps: number | null; date: string | null };
  current: SessionPerf | null;
  previous: SessionPerf | null;
  next: NextLoad;
}

export function epley(weight: number, reps: number, rir: number | null): number {
  const r = Math.min(reps + (rir ?? 0), 30);
  return weight * (1 + r / 30);
}

export function sessionPerf(w: Workout, ex: WorkoutExercise): SessionPerf | null {
  const working = ex.sets.filter((s) => s.type === 'working' && !s.planned);
  if (!working.length) return null;
  const sets: SetPoint[] = working.map((s) => ({ weight: s.weightKg, reps: s.reps, rir: s.rir ?? (s.toFailure ? 0 : null) }));
  const assisted = working.some((s) => s.loadMode === 'assisted');
  let top: SetPoint | null = null;
  let bestE: number | null = null;
  for (const s of sets) {
    if (s.reps == null) continue;
    if (!assisted && s.weight != null && s.weight > 0) {
      const e = epley(s.weight, s.reps, s.rir);
      if (bestE == null || e > bestE) {
        bestE = e;
        top = s;
      }
    }
  }
  if (!top) {
    // Bodyweight / assisted / unloaded: best reps (+RIR) is the performance index.
    for (const s of sets) if (s.reps != null && (!top || (s.reps + (s.rir ?? 0)) > ((top.reps ?? 0) + (top.rir ?? 0)))) top = s;
  }
  const totalReps = sets.reduce((a, s) => a + (s.reps ?? 0), 0);
  const volumeLoad = sets.reduce((a, s) => a + (s.reps ?? 0) * (s.weight ?? 0), 0);
  const rirs = sets.map((s) => s.rir).filter((r): r is number => r != null);
  const rests = working.slice(1).map((s) => s.restSecBefore).filter((r): r is number => r != null && r > 0);
  const index = bestE != null ? bestE : top?.reps != null ? top.reps + (top.rir ?? 0) : null;
  return {
    workoutId: w.id,
    date: w.date,
    sets,
    topWeight: top?.weight ?? null,
    topReps: top?.reps ?? null,
    topRir: top?.rir ?? null,
    e1rm: bestE != null ? Math.round(bestE * 10) / 10 : null,
    index: index != null ? Math.round(index * 10) / 10 : null,
    totalReps,
    volumeLoad,
    avgRir: rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null,
    rirKnownRatio: rirs.length / sets.length,
    restAvgSec: rests.length ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length) : null,
  };
}

export function classifyTrend(sessions: SessionPerf[], today: string): Trend {
  const recent = sessions.filter((s) => s.index != null && diffDays(today, s.date) <= 56).slice(-6);
  if (recent.length < 3) {
    return {
      cls: 'insufficient_data',
      evidence: `${recent.length} comparable session(s) in the last 8 weeks; at least 3 are needed before classifying a trend.`,
      relSlopePerSession: null,
      sessionsUsed: recent.length,
    };
  }
  const ys = recent.map((s) => s.index as number);
  const n = ys.length;
  const xm = (n - 1) / 2;
  const ym = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - xm) * (y - ym);
    den += (i - xm) ** 2;
  });
  const slope = den ? num / den : 0;
  const rel = ym ? slope / ym : 0;
  const first = ys[0];
  const last = ys[n - 1];
  const bestEarlier = Math.max(...ys.slice(0, n - 2));
  const bestLate = Math.max(ys[n - 1], ys[n - 2]);
  const span = diffDays(recent[n - 1].date, recent[0].date);
  const pct = (rel * 100).toFixed(1);
  const base = `Performance index ${first} → ${last} over ${n} sessions (${span} days), trend ${rel >= 0 ? '+' : ''}${pct}% per session.`;

  if (rel >= 0.01 && last >= first) return { cls: 'progressing', evidence: `${base} Consistent upward trend.`, relSlopePerSession: rel, sessionsUsed: n };
  if (rel <= -0.015 && last < first) return { cls: 'declining', evidence: `${base} Recent sessions are below earlier ones — check fatigue, sleep, rest periods or exercise order.`, relSlopePerSession: rel, sessionsUsed: n };
  if (n >= 4 && span >= 21 && bestLate <= bestEarlier) {
    return { cls: 'plateau', evidence: `${base} No new best in the last 2 sessions across ≥3 weeks — a possible plateau (not yet certain).`, relSlopePerSession: rel, sessionsUsed: n };
  }
  return { cls: 'stable', evidence: `${base} Performance is broadly stable.`, relSlopePerSession: rel, sessionsUsed: n };
}

export function defaultIncrement(kind: EquipmentKind | undefined, loadMode?: string): number {
  switch (kind) {
    case 'machine': return 5;
    case 'cable': return 2.5;
    case 'barbell': case 'smith': return 2.5;
    case 'plate_loaded': return loadMode === 'per_side' ? 1.25 : 2.5;
    case 'dumbbell': case 'kettlebell': return 2;
    default: return 2.5;
  }
}

export function roundToIncrement(w: number, inc: number): number {
  if (!inc || inc <= 0) return Math.round(w * 2) / 2;
  return Math.round(Math.round(w / inc) * inc * 100) / 100;
}

/**
 * Double progression: stay at a load until ALL working sets at that load reach the top of the
 * rep range (with RIR recorded) in TWO consecutive sessions, then add the smallest available
 * increment. Exception: if every set reached the top of the range while still ≥ target RIR + 2
 * (clearly too light — those sets earn reduced effort credit), one session is enough.
 * Lighter back-off sets are ignored. A single unusually good set never triggers an increase.
 */
export function suggestNextLoad(
  sessions: SessionPerf[],
  repRange: [number, number],
  rirTarget: number,
  increment: number,
  trend: Trend,
  loadMode = 'total',
): NextLoad {
  const [lo, hi] = repRange;
  const base = { repTarget: repRange, rirTarget, increment };
  const last = sessions[sessions.length - 1];
  if (!last) return { ...base, action: 'calibrate', weight: null, reason: 'No history on this equipment yet. Pick a load you can lift for the rep range with ~2–3 RIR and record RIR to calibrate.' };
  const prev = sessions[sessions.length - 2];
  const assisted = loadMode === 'assisted';
  // Working load = heaviest load used (for assisted: the least assistance). Lighter back-off sets don't block progress.
  const workLoad = (s: SessionPerf): number | null => {
    const ws = s.sets.filter((p) => p.weight != null && p.reps != null).map((p) => p.weight as number);
    if (!ws.length) return s.topWeight;
    return assisted ? Math.min(...ws) : Math.max(...ws);
  };
  const w = workLoad(last);
  if (w == null || loadMode === 'bodyweight_plus' && w === 0) {
    return { ...base, action: 'hold', weight: w, reason: `Bodyweight-based: aim to add reps (top set ${last.topReps ?? '?'} reps). Add load once all sets exceed ${hi} reps.` };
  }
  const atLoad = (s: SessionPerf) => s.sets.filter((p) => p.weight === workLoad(s));
  const hitsTop = (s: SessionPerf) => {
    const at = atLoad(s);
    return at.length > 0 && at.length >= Math.ceil(s.sets.length / 2) && at.every((p) => (p.reps ?? 0) >= hi && p.rir != null);
  };
  const rirUnknown = last.sets.every((p) => p.rir == null);
  const lastTop = hitsTop(last);
  const prevTop = prev ? hitsTop(prev) && workLoad(prev) === w : false;
  const tooEasy = lastTop && atLoad(last).every((p) => (p.rir as number) >= rirTarget + 2);
  const step = assisted ? -increment : increment;
  const nextLoad = Math.max(0, roundToIncrement(w + step, increment));

  if (assisted && w <= 0 && lastTop) {
    return { ...base, action: 'hold', weight: 0, reason: `All sets reached ${hi} reps with no assistance. Switch to the unassisted (or weighted) version of the exercise.` };
  }
  if (tooEasy) {
    return { ...base, action: 'increase', weight: nextLoad, reason: `Every set at ${w} kg reached ${hi} reps with ${rirTarget + 2}+ reps still in reserve — the load is clearly too light (those sets earn reduced effort credit). ${assisted ? 'Reduce assistance' : 'Add the smallest increment'} (${increment} kg) now and rebuild reps from ~${lo}.` };
  }
  if (lastTop && prevTop) {
    return { ...base, action: 'increase', weight: nextLoad, reason: `All working sets reached ${hi} reps in the last two sessions at ${w} kg. ${assisted ? 'Reduce assistance' : 'Add the smallest available increment'} (${increment} kg) and rebuild reps from ~${lo}.` };
  }
  if (lastTop && !prevTop) {
    return { ...base, action: 'hold', weight: w, reason: `Top of the range (${hi}) reached once at ${w} kg. Confirm it next session before increasing — one good session is not enough evidence.` };
  }
  const belowLo = last.sets.filter((p) => (p.reps ?? 0) < lo).length;
  if (belowLo > last.sets.length / 2 && trend.cls === 'declining') {
    return { ...base, action: 'reduce', weight: Math.max(0, roundToIncrement(w - step, increment)), reason: `Most sets fell below ${lo} reps and the trend is declining. A one-step reduction (or checking recovery/rest) may restore quality reps.` };
  }
  if (rirUnknown) {
    return { ...base, action: 'hold', weight: w, reason: `Keep ${w} kg and aim for +1 rep per set. RIR was not recorded, so readiness for a load increase cannot be confirmed — log RIR on the last set.` };
  }
  return { ...base, action: 'hold', weight: w, reason: `Keep ${w} kg and add reps toward ${hi} on every working set (last top set: ${last.topReps ?? '?'} reps @ RIR ${last.topRir ?? '?'}).` };
}

export function buildProgression(
  workouts: Workout[],
  registry: Registry,
  equipment: Equipment[],
  overrides: ExerciseOverride[],
  defaultRir: number,
  today: string,
): ProgressionSeries[] {
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const ovById = new Map(overrides.map((o) => [o.id, o]));
  const groups = new Map<string, { exerciseId: string; equipmentId: string | null; loadMode: string; sessions: SessionPerf[]; scope: string }>();
  const sorted = [...workouts].sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  for (const w of sorted) {
    for (const ex of w.exercises) {
      const def = registry.get(ex.exerciseId);
      const key = progressionKey(ex, w, def);
      const perf = sessionPerf(w, ex);
      if (!perf) continue;
      let g = groups.get(key);
      if (!g) {
        const eq = ex.equipmentId ? eqById.get(ex.equipmentId) : undefined;
        const scope = eq ? eq.name : key.endsWith('::free') ? 'Free weights' : 'Unidentified equipment';
        g = { exerciseId: ex.exerciseId, equipmentId: ex.equipmentId, loadMode: ex.sets.find((s) => s.type === 'working')?.loadMode ?? 'total', sessions: [], scope };
        groups.set(key, g);
      }
      g.sessions.push(perf);
    }
  }
  const out: ProgressionSeries[] = [];
  for (const [key, g] of groups) {
    const def = registry.get(g.exerciseId);
    const ov = ovById.get(g.exerciseId);
    const trend = classifyTrend(g.sessions, today);
    const eq = g.equipmentId ? eqById.get(g.equipmentId) : undefined;
    const inc = eq?.incrementsKg?.length ? Math.min(...eq.incrementsKg) : defaultIncrement(def?.equipmentKind, g.loadMode);
    let best: ProgressionSeries['best'] = { e1rm: null, weight: null, reps: null, date: null };
    for (const s of g.sessions) {
      if (s.index != null && (best.e1rm == null || s.index > best.e1rm)) best = { e1rm: s.index, weight: s.topWeight, reps: s.topReps, date: s.date };
    }
    out.push({
      key,
      exerciseId: g.exerciseId,
      equipmentId: g.equipmentId,
      scopeLabel: g.scope,
      loadMode: g.loadMode,
      sessions: g.sessions,
      trend,
      best,
      current: g.sessions[g.sessions.length - 1] ?? null,
      previous: g.sessions[g.sessions.length - 2] ?? null,
      next: suggestNextLoad(g.sessions, ov?.repRange ?? def?.repRange ?? [8, 12], ov?.targetRir ?? defaultRir, inc, trend, g.loadMode),
    });
  }
  return out.sort((a, b) => (b.current?.date ?? '').localeCompare(a.current?.date ?? ''));
}

export interface WarmupPlan {
  sets: { weight: number | null; reps: number }[];
  reason: string;
}

/** Exercise-specific warm-up: depends on movement type, load, position in session and prior same-muscle work. */
export function warmupFor(
  def: ExerciseDef | undefined,
  workingWeight: number | null,
  increment: number,
  priorSameMuscleSets: number,
): WarmupPlan {
  if (!def) return { sets: [], reason: 'Unknown exercise.' };
  if (workingWeight == null || workingWeight <= 0) {
    return { sets: [{ weight: null, reps: 8 }], reason: 'Bodyweight or unknown load: one easy set of ~8 reps to rehearse the movement.' };
  }
  const r = (p: number) => Math.max(increment || 1, roundToIncrement(workingWeight * p, increment));
  const heavyPattern = ['squat', 'hinge', 'horizontal_push', 'incline_push', 'vertical_push'].includes(def.pattern);
  if (def.category === 'compound') {
    if (priorSameMuscleSets >= 2) {
      return { sets: [{ weight: r(0.7), reps: 4 }], reason: `Target muscles already warm from ${priorSameMuscleSets} earlier sets — one feeler set at ~70% to groove this movement.` };
    }
    if (heavyPattern && def.equipmentKind !== 'machine' && def.equipmentKind !== 'plate_loaded') {
      return { sets: [{ weight: r(0.5), reps: 8 }, { weight: r(0.7), reps: 4 }, { weight: r(0.85), reps: 2 }], reason: 'First free-weight compound for these muscles: ramp 50% → 70% → 85% with decreasing reps to prepare without fatigue.' };
    }
    return { sets: [{ weight: r(0.5), reps: 8 }, { weight: r(0.75), reps: 3 }], reason: 'Stable machine compound: two ramp-up sets are usually enough.' };
  }
  if (priorSameMuscleSets >= 2) return { sets: [], reason: `No warm-up needed — this muscle already did ${priorSameMuscleSets} sets this session.` };
  return { sets: [{ weight: r(0.6), reps: 8 }], reason: 'Isolation exercise: one moderate set at ~60% to rehearse range of motion.' };
}

