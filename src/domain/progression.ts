import { diffDays } from './dates';
import type { Registry } from './registry';
import { benchmarkExclusion, techniqueOf } from './feedback';
import { failureImpliedRir } from './failure';
import { loadStep, type IncrementSource } from './increments';
import type { Effort, Equipment, EquipmentKind, ExerciseDef, ExerciseOverride, FailureStatus, Location, SetFeel, Side, Technique, Variation, Workout, WorkoutExercise } from './types';

/**
 * Progression is tracked per (exercise × equipment instance). Loads from two different
 * machines are NEVER compared. Unidentified machines are kept separate per location.
 * Free weights without an equipment id share one history ("free weights") because
 * kilograms on barbells/dumbbells are standardised.
 */

const FREE_KINDS: EquipmentKind[] = ['barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band'];

function baseKey(ex: WorkoutExercise, w: Workout, def: ExerciseDef | undefined): string {
  if (ex.equipmentId) return `${ex.exerciseId}::${ex.equipmentId}`;
  if (def && FREE_KINDS.includes(def.equipmentKind)) return `${ex.exerciseId}::free`;
  return `${ex.exerciseId}::unidentified@${w.locationId ?? 'unknown'}`;
}

const VALUE_LABEL: Record<string, string> = {
  straight_bar: 'straight bar', rope: 'rope', v_bar: 'V-bar', single_handle: 'single handle', cuff: 'ankle/wrist cuff',
  standing: 'standing', seated: 'seated', straight: 'straight legs', bent: 'bent knees',
  pronated: 'pronated grip', supinated: 'supinated grip', neutral: 'neutral grip', mixed: 'mixed grip',
};
export const humanize = (v: string) => VALUE_LABEL[v] ?? v.replace(/_/g, ' ');

/**
 * Configuration parts that make loads NOT comparable, so they start their own history:
 * exact bench angle (angle-sensitive exercises — the owner wants 15°/30°/45° kept apart),
 * cable attachment, one side at a time (only for exercises offering that choice), standing vs
 * seated, straight vs bent legs. Apart from the bench angle these fields did not exist before
 * v1.1, so older entries keep their key; an older entry that DID record an angle moves to that
 * angle's history, and entries without an angle form an "angle not recorded" history.
 * Grip is deliberately not part of the key (it was optional on every exercise and recorded
 * inconsistently, so keying on it would fragment existing histories).
 */
export function variationParts(v: Variation | undefined, def: ExerciseDef | undefined): { key: string; label: string }[] {
  if (!v) return [];
  const parts: { key: string; label: string }[] = [];
  if (def?.angleSensitive && v.benchAngleDeg != null && Number.isFinite(v.benchAngleDeg)) {
    const a = Math.round(v.benchAngleDeg);
    parts.push({ key: `angle=${a}`, label: a === 0 ? 'flat' : `${a}°` });
  }
  if (v.attachment) parts.push({ key: `att=${v.attachment}`, label: humanize(v.attachment) });
  if (v.unilateral && def?.variationFields?.includes('unilateral')) parts.push({ key: 'uni', label: 'one side at a time' });
  if (v.position) parts.push({ key: `pos=${v.position}`, label: humanize(v.position) });
  if (v.legs) parts.push({ key: `legs=${v.legs}`, label: humanize(v.legs) });
  return parts;
}

/**
 * History key: exercise × equipment instance (× configuration). Loads from two machines, or
 * from two configurations of one exercise (e.g. 15° vs 45° incline), are never compared.
 */
export function progressionKey(ex: WorkoutExercise, w: Workout, def: ExerciseDef | undefined): string {
  const parts = variationParts(ex.variation, def);
  const base = baseKey(ex, w, def);
  return parts.length ? `${base}|${parts.map((p) => p.key).join('|')}` : base;
}

export interface SetPoint {
  weight: number | null;
  reps: number | null;
  rir: number | null;
  /** Unilateral sets logged per side. */
  side?: Side;
  feel?: SetFeel;
  effort?: Effort;
  technique?: Technique;
  /** Rest before this set (seconds), if known. */
  restSec?: number | null;
  /** Failure status as recorded (v1.3). Absent = not recorded. */
  failure?: FailureStatus;
  /** The set ended because technique gave out (never a benchmark). */
  technicalFailure?: boolean;
  /** Used to judge progression? (false for wrong weight, pain, compromised technique). */
  benchmark: boolean;
  /** Why it is not a benchmark. */
  excluded?: string;
}

export interface SessionPerf {
  workoutId: string;
  date: string;
  /** Every performed working set, as recorded (also the non-benchmark ones). */
  sets: SetPoint[];
  /** Top set among BENCHMARK sets (falls back to all sets for display when none qualify). */
  topWeight: number | null;
  topReps: number | null;
  topRir: number | null;
  /** RIR-adjusted Epley estimate from benchmark sets. Index for THIS equipment only, not a true 1RM. */
  e1rm: number | null;
  /** Generic performance index (e1rm for loaded sets; reps+RIR for bodyweight). null = not representative. */
  index: number | null;
  /** At least one benchmark set — the session can be used to judge progress. */
  representative: boolean;
  totalReps: number;
  volumeLoad: number;
  avgRir: number | null;
  rirKnownRatio: number;
  restAvgSec: number | null;
  /** Session logged with high fatigue (≥ 4/5) or short sleep (< 6 h). */
  fatigued: boolean;
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
  /** Configuration this history is for (e.g. "30°", "rope"), or null when none was recorded. */
  variantLabel: string | null;
  loadMode: string;
  /** Gym of the most recent session in this history (used for per-gym dumbbell jumps). */
  locationId: string | null;
  /** Where the load step (`next.increment`) came from. */
  incrementSource: IncrementSource;
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

function pickTop(sets: SetPoint[], assisted: boolean): { top: SetPoint | null; bestE: number | null } {
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
  return { top, bestE };
}

export function sessionPerf(w: Workout, ex: WorkoutExercise, useFeel = true): SessionPerf | null {
  const working = ex.sets.filter((s) => s.type === 'working' && !s.planned);
  if (!working.length) return null;
  const sets: SetPoint[] = working.map((s) => {
    const excluded = benchmarkExclusion(s);
    return {
      // Clean muscular failure without a logged RIR is valid performance at ≈ RIR 0 (index only; RIR is not stored).
      weight: s.weightKg, reps: s.reps, rir: s.rir ?? (s.toFailure ? 0 : failureImpliedRir(s)),
      ...(s.side ? { side: s.side } : {}),
      ...(s.feel ? { feel: s.feel } : {}),
      ...(s.effort && useFeel ? { effort: s.effort } : {}),
      ...(techniqueOf(s) ? { technique: techniqueOf(s) } : {}),
      ...(s.failure ? { failure: s.failure } : {}),
      ...(s.technicalFailure ? { technicalFailure: true } : {}),
      restSec: s.restSecBefore,
      benchmark: !excluded,
      ...(excluded ? { excluded } : {}),
    };
  });
  const assisted = working.some((s) => s.loadMode === 'assisted');
  const bench = sets.filter((s) => s.benchmark);
  const representative = bench.length > 0;
  const { top, bestE } = pickTop(representative ? bench : sets, assisted);
  const totalReps = sets.reduce((a, s) => a + (s.reps ?? 0), 0);
  const volumeLoad = sets.reduce((a, s) => a + (s.reps ?? 0) * (s.weight ?? 0), 0);
  const rirs = sets.map((s) => s.rir).filter((r): r is number => r != null);
  const rests = working.slice(1).map((s) => s.restSecBefore).filter((r): r is number => r != null && r > 0);
  const index = !representative ? null : bestE != null ? bestE : top?.reps != null ? top.reps + (top.rir ?? 0) : null;
  const well = w.wellness;
  return {
    workoutId: w.id,
    date: w.date,
    sets,
    topWeight: top?.weight ?? null,
    topReps: top?.reps ?? null,
    topRir: top?.rir ?? null,
    e1rm: representative && bestE != null ? Math.round(bestE * 10) / 10 : null,
    index: index != null ? Math.round(index * 10) / 10 : null,
    representative,
    totalReps,
    volumeLoad,
    avgRir: rirs.length ? Math.round((rirs.reduce((a, b) => a + b, 0) / rirs.length) * 10) / 10 : null,
    rirKnownRatio: rirs.length / sets.length,
    restAvgSec: rests.length ? Math.round(rests.reduce((a, b) => a + b, 0) / rests.length) : null,
    fatigued: (well?.fatigue ?? 0) >= 4 || (well?.sleepHours != null && well.sleepHours < 6),
  };
}

/**
 * Trend over the last ≤ 6 REPRESENTATIVE sessions within 8 weeks (sessions whose sets were all
 * wrong-weight / pain / broken-technique are not comparable and are skipped). A possible plateau
 * needs ≥ 4 comparable sessions over ≥ 3 weeks with no new best in the last two — sessions logged
 * with high fatigue or short sleep are set aside for that decision, so one bad day never makes a plateau.
 */
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
  const span = diffDays(recent[n - 1].date, recent[0].date);
  const pct = (rel * 100).toFixed(1);
  const base = `Performance index ${first} → ${last} over ${n} sessions (${span} days), trend ${rel >= 0 ? '+' : ''}${pct}% per session.`;

  if (rel >= 0.01 && last >= first) return { cls: 'progressing', evidence: `${base} Consistent upward trend.`, relSlopePerSession: rel, sessionsUsed: n };
  const clean = recent.filter((s) => !s.fatigued);
  const setAside = n - clean.length;
  if (rel <= -0.015 && last < first) {
    const tired = recent.slice(-2).some((s) => s.fatigued);
    return { cls: 'declining', evidence: `${base} Recent sessions are below earlier ones — ${tired ? 'the latest session(s) were logged with high fatigue or short sleep, so this may be temporary; ' : ''}check fatigue, sleep, rest periods or exercise order before changing the load.`, relSlopePerSession: rel, sessionsUsed: n };
  }
  if (clean.length >= 4) {
    const cy = clean.map((s) => s.index as number);
    const cspan = diffDays(clean[clean.length - 1].date, clean[0].date);
    const bestEarlier = Math.max(...cy.slice(0, cy.length - 2));
    const bestLate = Math.max(cy[cy.length - 1], cy[cy.length - 2]);
    if (cspan >= 21 && bestLate <= bestEarlier) {
      return {
        cls: 'plateau',
        evidence: `${base} No new best in the last 2 comparable sessions across ≥ 3 weeks${setAside ? ` (${setAside} session(s) with high fatigue or short sleep set aside)` : ''} — a possible plateau, not yet certain. Before adding volume or changing the exercise, check the working weight, rest periods, technique, effort (RIR) and recovery.`,
        relSlopePerSession: rel,
        sessionsUsed: clean.length,
      };
    }
  }
  return { cls: 'stable', evidence: `${base} Performance is broadly stable${setAside ? ` (${setAside} fatigued session(s) noted)` : ''}.`, relSlopePerSession: rel, sessionsUsed: n };
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
 * One load step. Snaps to the increment grid only when the current load is already on it —
 * 25 kg dumbbells + 2 kg must give 27 kg, not 28 (rounding 27 to the 2-kg grid).
 */
export function stepLoad(w: number, step: number, inc: number): number {
  const onGrid = inc > 0 && Math.abs(w / inc - Math.round(w / inc)) < 1e-6;
  const raw = w + step;
  return Math.max(0, onGrid ? roundToIncrement(raw, inc) : Math.round(raw * 100) / 100);
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Rest interpretation: when reps fell at the same weight within the last session AND the rest
 * before the weaker set was clearly shorter than usual for this exercise (< 70 % of the median),
 * the drop is attributed to rest — not to the weight being too heavy.
 */
export function restInsight(sessions: SessionPerf[]): string | null {
  const last = sessions[sessions.length - 1];
  if (!last) return null;
  const typical = median(sessions.flatMap((s) => s.sets.slice(1).map((p) => p.restSec).filter((r): r is number => r != null && r > 0)));
  if (typical == null) return null;
  const first = last.sets.find((p) => p.benchmark && p.reps != null);
  if (!first) return null;
  for (const p of last.sets.slice(1)) {
    if (!p.benchmark || p.weight !== first.weight || p.reps == null || p.restSec == null || p.restSec <= 0) continue;
    if (first.reps! - p.reps >= 2 && p.restSec < typical * 0.7) {
      return `Reps fell from ${first.reps} to ${p.reps} at ${p.weight} kg after a shorter rest (${p.restSec} s vs your usual ~${Math.round(typical)} s) — likely the short rest, not a weight that is too heavy.`;
    }
  }
  return null;
}

/**
 * Next-session suggestion (double progression with the owner's set feedback):
 * - Representative (benchmark) sets only: accidental wrong weights, pain and broken technique are
 *   kept in the history but never prove progress.
 * - INCREASE when all working sets at the working load reach the top of the rep range with effort
 *   recorded (RIR or feel) in TWO consecutive sessions — or in ONE session when every set was clearly
 *   too light (RIR ≥ target + 2, or felt "too easy"/"a little too easy").
 * - REDUCE when technique broke down on at least half of the last session's sets at the working load
 *   (not because a set was merely hard: "very hard, good technique" is a good set), or when most sets
 *   fell below the range while the trend is declining.
 * - Otherwise KEEP and add reps. A single good set never triggers an increase.
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
  const lastAny = sessions[sessions.length - 1];
  if (!lastAny) return { ...base, action: 'calibrate', weight: null, reason: 'No history on this equipment yet. Pick a load you can lift for the rep range with ~2–3 RIR and record RIR (or how the set felt) to calibrate.' };
  const assisted = loadMode === 'assisted';
  const step = assisted ? -increment : increment;
  const loadOf = (pts: SetPoint[]): number | null => {
    const ws = pts.filter((p) => p.weight != null && p.reps != null).map((p) => p.weight as number);
    if (!ws.length) return null;
    return assisted ? Math.min(...ws) : Math.max(...ws);
  };

  // 1) Technique broke down on at least half of the session's intended sets → reduce (scenario "too heavy").
  //    Target = one step down from the load that broke (or a clean load from that session if it is closer).
  const intended = lastAny.sets.filter((p) => !(p.excluded ?? '').startsWith('wrong weight') && p.weight != null && p.reps != null);
  const broken = intended.filter((p) => p.technique === 'compromised' || p.technique === 'failed');
  let brokeNote: string | null = null;
  if (broken.length) {
    const brokeAt = loadOf(broken) as number;
    const cleanLoad = loadOf(intended.filter((p) => p.benchmark));
    if (broken.length >= Math.ceil(intended.length / 2)) {
      // About ONE step down: back to a clean load from the same session if it is within ~one step, else one increment.
      const oneStep = stepLoad(brokeAt, -step, increment);
      // (A clean load within ~one step counts: 27.5 → 25 kg when dumbbells come in 2.5 kg pairs but the default step is 2.)
      const reach = Math.abs(step) * 1.5;
      const closerClean = cleanLoad != null && (assisted ? cleanLoad > brokeAt && cleanLoad - brokeAt <= reach : cleanLoad < brokeAt && brokeAt - cleanLoad <= reach);
      const to = closerClean ? (cleanLoad as number) : oneStep;
      return { ...base, action: 'reduce', weight: to, reason: `Technique broke down on ${broken.length} of ${intended.length} set${intended.length === 1 ? '' : 's'} last time (at ${brokeAt} kg). Those sets are kept but don't prove progress. ${assisted ? 'Use more assistance' : 'Go back'} to ${to} kg, keep full range and control, and rebuild reps from ~${lo}. (A set that is very hard but clean is fine — this is about technique, not difficulty.)` };
    }
    brokeNote = `${brokeAt} kg broke your technique on ${broken.length} set${broken.length === 1 ? '' : 's'} — not counted as progress yet.`;
  }

  // 2) Judge progress from representative sessions only.
  const rep = sessions.filter((s) => s.representative);
  const last = rep[rep.length - 1];
  const notes: string[] = [];
  if (lastAny !== last) {
    const why = [...new Set(lastAny.sets.map((p) => p.excluded).filter(Boolean))].join(', ');
    notes.push(`Last session (${lastAny.date}) is saved but not used as a benchmark (${why || 'not representative'}).`);
  }
  const painLast = lastAny.sets.some((p) => p.excluded === 'pain or unusual discomfort');
  if (painLast) {
    notes.push('Pain or unusual discomfort was flagged — do not push the load on a painful movement; if it repeats, stop that movement and consider getting it checked.');
  }
  if (brokeNote) notes.push(brokeNote);
  const rest = restInsight(rep);
  if (rest) notes.push(rest);
  const tail = notes.length ? ` ${notes.join(' ')}` : '';
  if (!last) {
    return { ...base, action: 'calibrate', weight: null, reason: `No representative session yet on this equipment.${tail}` };
  }
  const prev = rep[rep.length - 2];
  const benchPts = (s: SessionPerf) => s.sets.filter((p) => p.benchmark);
  const workLoad = (s: SessionPerf): number | null => loadOf(benchPts(s)) ?? s.topWeight;
  const w = workLoad(last);
  if (w == null || (loadMode === 'bodyweight_plus' && w === 0)) {
    return { ...base, action: 'hold', weight: w, reason: `Bodyweight-based: aim to add reps (top set ${last.topReps ?? '?'} reps). Add load once all sets exceed ${hi} reps.${tail}` };
  }
  const atLoad = (s: SessionPerf) => benchPts(s).filter((p) => p.weight === workLoad(s));
  // Effort is "recorded" with a RIR, a feel, or a definite failure answer (muscular / stopped before failure).
  // "Stopped before failure" alone does not say how close the set was, so it is not recorded effort.
  const effortKnown = (p: SetPoint) => p.rir != null || p.effort != null || (p.failure === 'muscular' && !p.technicalFailure);
  const hitsTop = (s: SessionPerf) => {
    const at = atLoad(s);
    return at.length > 0 && at.length >= Math.ceil(benchPts(s).length / 2) && at.every((p) => (p.reps ?? 0) >= hi && effortKnown(p));
  };
  // "A little too easy" (≈ 3–4 RIR) is not clearly light on its own — only "too easy" or a logged RIR ≥ target + 2.
  const clearlyLight = (p: SetPoint) => (p.rir != null ? p.rir >= rirTarget + 2 : p.effort === 'very_easy');
  const lastTop = hitsTop(last);
  const prevTop = prev ? hitsTop(prev) && workLoad(prev) === w : false;
  const tooEasy = lastTop && atLoad(last).every(clearlyLight);
  const nextLoad = stepLoad(w, step, increment);

  if (painLast) {
    return { ...base, action: 'hold', weight: w, reason: `Keep ${w} kg (no increase after a session with pain).${tail}` };
  }
  if (assisted && w <= 0 && lastTop) {
    return { ...base, action: 'hold', weight: 0, reason: `All sets reached ${hi} reps with no assistance. Switch to the unassisted (or weighted) version of the exercise.${tail}` };
  }
  if (tooEasy) {
    return { ...base, action: 'increase', weight: nextLoad, reason: `Every set at ${w} kg reached ${hi} reps and was clearly too light (${rirTarget + 2}+ reps in reserve, or felt too easy) — those sets earn reduced effort credit. ${assisted ? 'Reduce assistance' : 'Add the smallest increment'} (${increment} kg) to ${nextLoad} kg now and rebuild reps from ~${lo}.${tail}` };
  }
  if (lastTop && prevTop) {
    return { ...base, action: 'increase', weight: nextLoad, reason: `All working sets reached ${hi} reps in the last two comparable sessions at ${w} kg. ${assisted ? 'Reduce assistance' : 'Add the smallest available increment'} (${increment} kg) to ${nextLoad} kg and rebuild reps from ~${lo}.${tail}` };
  }
  if (lastTop && !prevTop) {
    return { ...base, action: 'hold', weight: w, reason: `Top of the range (${hi}) reached once at ${w} kg. Confirm it next session before increasing — one good session is not enough evidence.${tail}` };
  }
  const belowLo = benchPts(last).filter((p) => (p.reps ?? 0) < lo).length;
  if (belowLo > benchPts(last).length / 2 && trend.cls === 'declining' && !rest) {
    return { ...base, action: 'reduce', weight: stepLoad(w, -step, increment), reason: `Most sets fell below ${lo} reps and the trend is declining across comparable sessions. A one-step reduction (or checking recovery and rest) may restore quality reps.${tail}` };
  }
  if (benchPts(last).every((p) => !effortKnown(p))) {
    return { ...base, action: 'hold', weight: w, reason: `Keep ${w} kg and aim for +1 rep per set. Effort was not recorded (no RIR or feel), so readiness for a load increase cannot be confirmed — tap how the set felt or log RIR.${tail}` };
  }
  return { ...base, action: 'hold', weight: w, reason: `Keep ${w} kg and add reps toward ${hi} on every working set (last top set: ${last.topReps ?? '?'} reps${last.topRir != null ? ` @ RIR ${last.topRir}` : ''}).${tail}` };
}

/** The one recommendation shown per exercise. */
export type AdviceKind = 'increase' | 'keep' | 'reduce' | 'plateau' | 'not_enough_data';
export interface Advice {
  kind: AdviceKind;
  label: string;
  text: string;
}
export const ADVICE_LABEL: Record<AdviceKind, string> = { increase: 'Increase weight', keep: 'Keep weight', reduce: 'Reduce weight', plateau: 'Possible plateau', not_enough_data: 'Not enough data' };

export function adviceFor(p: Pick<ProgressionSeries, 'next' | 'trend' | 'sessions'>): Advice {
  const n = p.next;
  const from = p.sessions.filter((s) => s.representative).slice(-1)[0];
  const fromW = from ? from.sets.filter((x) => x.benchmark && x.weight != null).reduce<number | null>((m, x) => (m == null || (x.weight as number) > m ? (x.weight as number) : m), null) : null;
  if (n.action === 'increase') return { kind: 'increase', label: ADVICE_LABEL.increase, text: `${fromW != null && n.weight != null ? `${fromW} → ${n.weight} kg. ` : ''}${n.reason}` };
  if (n.action === 'reduce') return { kind: 'reduce', label: ADVICE_LABEL.reduce, text: n.reason };
  if (n.action === 'calibrate' || p.trend.cls === 'insufficient_data') {
    return { kind: 'not_enough_data', label: ADVICE_LABEL.not_enough_data, text: `${p.trend.sessionsUsed} comparable session(s) so far — more are needed for a reliable trend. Meanwhile: ${n.reason}` };
  }
  if (p.trend.cls === 'plateau') return { kind: 'plateau', label: ADVICE_LABEL.plateau, text: `${p.trend.evidence} For now: ${n.reason}` };
  return { kind: 'keep', label: ADVICE_LABEL.keep, text: n.reason };
}

/** Per-load calibration from the owner's feedback (this exercise × equipment × configuration only). */
export interface LoadFeel {
  weight: number;
  sets: number;
  counts: Partial<Record<SetFeel, number>>;
  verdict: 'too_easy' | 'right' | 'too_heavy' | 'mixed' | 'no_feedback';
  lastDate: string;
}

export function loadMap(p: Pick<ProgressionSeries, 'sessions'>): LoadFeel[] {
  const m = new Map<number, LoadFeel>();
  for (const s of p.sessions) for (const x of s.sets) {
    // A weight picked by accident says nothing about how the intended load feels.
    if (x.weight == null || (x.excluded ?? '').startsWith('wrong weight')) continue;
    const e = m.get(x.weight) ?? { weight: x.weight, sets: 0, counts: {}, verdict: 'no_feedback' as const, lastDate: s.date };
    e.sets++;
    e.lastDate = s.date;
    if (x.feel) e.counts[x.feel] = (e.counts[x.feel] ?? 0) + 1;
    m.set(x.weight, e);
  }
  for (const e of m.values()) {
    const c = e.counts;
    const easy = (c.too_easy ?? 0) + (c.bit_easy ?? 0);
    const right = (c.just_right ?? 0) + (c.hard_good ?? 0);
    const heavy = c.too_heavy_form ?? 0;
    const rated = easy + right + heavy; // wrong-weight and pain answers say nothing about the load itself
    if (!rated) e.verdict = 'no_feedback';
    else if (right / rated >= 0.6) e.verdict = 'right';
    else if (easy / rated >= 0.6) e.verdict = 'too_easy';
    else if (heavy / rated >= 0.6) e.verdict = 'too_heavy';
    else e.verdict = 'mixed';
  }
  return [...m.values()].sort((a, b) => a.weight - b.weight);
}

export function buildProgression(
  workouts: Workout[],
  registry: Registry,
  equipment: Equipment[],
  overrides: ExerciseOverride[],
  defaultRir: number,
  today: string,
  /** Settings → "Use how the set felt when no RIR was logged". Off = effort from feel is ignored here too. */
  useFeel = true,
  /** Gyms, so dumbbell / kettlebell jumps set per gym apply (Location.freeWeightIncrementsKg). */
  locations: Location[] = [],
): ProgressionSeries[] {
  const locById = new Map(locations.map((l) => [l.id, l]));
  const eqById = new Map(equipment.map((e) => [e.id, e]));
  const ovById = new Map(overrides.map((o) => [o.id, o]));
  const groups = new Map<string, { exerciseId: string; equipmentId: string | null; loadMode: string; sessions: SessionPerf[]; scope: string; variant: string | null; locationId: string | null }>();
  const sorted = [...workouts].sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  for (const w of sorted) {
    for (const ex of w.exercises) {
      const def = registry.get(ex.exerciseId);
      const key = progressionKey(ex, w, def);
      const perf = sessionPerf(w, ex, useFeel);
      if (!perf) continue;
      let g = groups.get(key);
      if (!g) {
        const eq = ex.equipmentId ? eqById.get(ex.equipmentId) : undefined;
        const base = baseKey(ex, w, def);
        const scope = eq ? eq.name : base.endsWith('::free') ? (def?.equipmentKind === 'bodyweight' ? 'Bodyweight' : 'Free weights') : 'Unidentified equipment';
        const parts = variationParts(ex.variation, def);
        g = { exerciseId: ex.exerciseId, equipmentId: ex.equipmentId, loadMode: ex.sets.find((s) => s.type === 'working')?.loadMode ?? 'total', sessions: [], scope, variant: parts.length ? parts.map((p) => p.label).join(' · ') : null, locationId: null };
        groups.set(key, g);
      }
      g.sessions.push(perf);
      g.locationId = w.locationId ?? null;
    }
  }
  const out: ProgressionSeries[] = [];
  for (const [key, g] of groups) {
    const def = registry.get(g.exerciseId);
    const ov = ovById.get(g.exerciseId);
    const trend = classifyTrend(g.sessions, today);
    const eq = g.equipmentId ? eqById.get(g.equipmentId) : undefined;
    const { step: inc, source: incrementSource } = loadStep(eq, g.locationId ? locById.get(g.locationId) : undefined, def?.equipmentKind, g.loadMode);
    let best: ProgressionSeries['best'] = { e1rm: null, weight: null, reps: null, date: null };
    for (const s of g.sessions) {
      if (s.index != null && (best.e1rm == null || s.index > best.e1rm)) best = { e1rm: s.index, weight: s.topWeight, reps: s.topReps, date: s.date };
    }
    out.push({
      key,
      exerciseId: g.exerciseId,
      equipmentId: g.equipmentId,
      scopeLabel: g.variant ? `${g.scope} · ${g.variant}` : g.scope,
      variantLabel: g.variant,
      loadMode: g.loadMode,
      locationId: g.locationId,
      incrementSource,
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

/** One-line summary of the load map, e.g. "Feels right: 25 kg · too easy: 22 kg · too heavy: 30 kg". */
export function loadMapNote(m: LoadFeel[]): string | null {
  const by = (v: LoadFeel['verdict']) => m.filter((x) => x.verdict === v).map((x) => `${x.weight} kg`);
  const parts = [
    by('right').length ? `Feels right: ${by('right').join(', ')}` : null,
    by('too_easy').length ? `too easy: ${by('too_easy').join(', ')}` : null,
    by('too_heavy').length ? `too heavy: ${by('too_heavy').join(', ')}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
