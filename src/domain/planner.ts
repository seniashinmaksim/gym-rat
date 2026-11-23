/**
 * Adaptive Full Body planner ("plan-1", Part 5 E.3 + E.9). Built ON the existing engine — no second model:
 *   analyze()        weekly targets, today's capped catch-up-free share, recovery entering today, trends
 *   prescribe()      loads (double progression on real increments), reps, RIR, rest, warm-ups per key
 *   exerciseChoice   availability at this gym, safety, alternatives
 *   readiness        operating mode and calibration per exercise × machine × configuration
 *
 * Steps: personal library → patterns → session muscle budget (today's share minus recovery holds) →
 * selection with fractional contributions (indirect work counts, no overshoot, familiar + available
 * first) → order (fatigue cost, priorities, usual position) → prescriptions with SESSION-level set
 * allocation → calibration labels. During the workout `replanPending` re-prescribes everything not yet
 * started from what was ACTUALLY done (any order). Nothing here writes data; the UI stores the snapshot
 * (`Workout.generated`) separately from what is performed.
 */
import type { AppData } from './appdata';
import { diffDays, localNowParts } from './dates';
import { L } from '../i18n/core';
import { availableEquipment, exerciseSessionCounts, priorWorkouts, safetyLine, usualExerciseCount } from './exerciseChoice';
import { FATIGUE_RANK, fatigueCostOf, significantMuscles } from './fatigue';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, muscleName } from './muscles';
import { prescribe, PRESCRIPTION_ENGINE, type Prescription } from './prescription';
import { progressionKey } from './progression';
import { countedSetCount, isCounted } from './quality';
import { MAJOR_MUSCLES, readinessReport, type OperatingMode, type ReadinessLevel, type ReadinessReport } from './readiness';
import { resolveCoefficients } from './registry';
import { sessionMuscleEffective, computeVolume } from './volume';
import type { analyze } from './analysis';
import type { ExerciseDef, GeneratedPlanSnapshot, MuscleId, PlanDecision, Variation, Workout, WorkoutExercise, WorkoutSet, ExerciseTarget } from './types';
import { PREFERRED_EXERCISE_IDS } from '../data/exercises';

type Analysis = ReturnType<typeof analyze>;

export const PLANNER_ENGINE = 'plan-1';
const MAX_SETS = { isolation: 4, compound: 5 } as const;
/** A muscle needs this many open effective sets to get an exercise of its own today. */
export const MIN_OPEN = 1.5;
/** Fewest working sets for a planned exercise (one set alone is rarely worth the setup). */
export const MIN_ITEM_SETS = 2;
const MACHINE_KINDS = new Set(['machine', 'plate_loaded', 'cable', 'smith']);

// ---------------------------------------------------------------- personal library + patterns

export type LibraryStatus = 'frequent' | 'occasional' | 'tried' | 'old';

export interface LibraryEntry {
  key: string;
  exerciseId: string;
  equipmentId: string | null;
  variation?: Variation;
  sessions: number;
  sessions8w: number;
  /** Share of the last-8-week workouts containing it. */
  share: number;
  lastUsed: string | null;
  gyms: string[];
  status: LibraryStatus;
  preferred: boolean;
  /** Median position in the session, 0 = first … 1 = last. */
  medianPosition: number | null;
  /** Sessions among the owner's last 6 workouts (recency: a recent switch outweighs an old habit). */
  recent6: number;
  calibration: ReadinessLevel;
}

export interface Patterns {
  usualCount: number;
  /** Median working sets per session in 8 weeks (null = no history). */
  usualSets: number | null;
  medianDurationMin: number | null;
  sessionsPerWeek: number;
}

const med = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const performed = (e: WorkoutExercise) => e.sets.some((s) => isCounted(s) && s.type === 'working');

export function buildLibrary(data: AppData, analysis: Analysis, readiness: ReadinessReport, current: Workout | null = null): LibraryEntry[] {
  const today = analysis.today;
  const hist = priorWorkouts(data, current).filter((w) => w.date <= today);
  const recent8 = hist.filter((w) => diffDays(today, w.date) <= 56);
  const byKey = new Map<string, { ex: WorkoutExercise; dates: string[]; ids: Set<string>; recent: Set<string>; gyms: Set<string>; pos: number[] }>();
  for (const w of [...hist].sort((a, b) => a.date.localeCompare(b.date))) {
    const done = w.exercises.filter(performed);
    done.forEach((e, i) => {
      const key = progressionKey(e, w, analysis.registry.get(e.exerciseId));
      const g = byKey.get(key) ?? { ex: e, dates: [], ids: new Set<string>(), recent: new Set<string>(), gyms: new Set<string>(), pos: [] };
      g.ex = e;
      g.dates.push(w.date);
      g.ids.add(w.id);
      if (diffDays(today, w.date) <= 56) g.recent.add(w.id);
      if (w.locationId) g.gyms.add(w.locationId);
      g.pos.push(done.length > 1 ? i / (done.length - 1) : 0);
      byKey.set(key, g);
    });
  }
  const levels = new Map(readiness.keys.map((k) => [k.key, k.level]));
  const last6 = new Set([...hist].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map((w) => w.id));
  const favs = new Set(data.equipment.filter((e) => e.favorite).map((e) => e.id));
  const out: LibraryEntry[] = [];
  for (const [key, g] of byKey) {
    const share = recent8.length ? g.recent.size / recent8.length : 0;
    const sessions = g.ids.size;
    const status: LibraryStatus = share >= 0.3 && g.recent.size >= 2 ? 'frequent' : g.recent.size >= 1 && sessions >= 3 ? 'occasional' : sessions <= 2 ? 'tried' : 'old';
    out.push({
      key, exerciseId: g.ex.exerciseId, equipmentId: g.ex.equipmentId, variation: g.ex.variation, sessions, sessions8w: g.recent.size, share,
      lastUsed: g.dates[g.dates.length - 1] ?? null, gyms: [...g.gyms], status,
      preferred: PREFERRED_EXERCISE_IDS.includes(g.ex.exerciseId) || (!!g.ex.equipmentId && favs.has(g.ex.equipmentId)),
      medianPosition: med(g.pos), calibration: levels.get(key) ?? 'INSUFFICIENT_DATA', recent6: [...g.ids].filter((x) => last6.has(x)).length,
    });
  }
  return out;
}

export function sessionPatterns(data: AppData, analysis: Analysis, current: Workout | null = null): Patterns {
  const hist = priorWorkouts(data, current);
  const recent = hist.filter((w) => diffDays(analysis.today, w.date) >= 0 && diffDays(analysis.today, w.date) <= 56);
  return {
    usualCount: usualExerciseCount(hist, analysis.today),
    usualSets: med(recent.map((w) => w.exercises.reduce((n, e) => n + countedSetCount(e.sets, ['working']), 0)).filter((n) => n > 0)),
    medianDurationMin: med(recent.map((w) => w.durationMin ?? 0).filter((d) => d > 0)),
    sessionsPerWeek: analysis.avgSessionsPerWeek,
  };
}

// ---------------------------------------------------------------- learning from decisions

export interface PlanPreferences {
  /** gym → exercise ids to avoid there (≥ 3 non-equipment replacements / skips). */
  avoid: Map<string, Set<string>>;
  /** gym → exercise ids preferred there (chosen ≥ 3 times as a replacement for something else). */
  prefer: Map<string, Set<string>>;
  /** Exercises with a pain-related skip/replace in the last 7 days (safety, not preference). */
  painHold: Set<string>;
}

/**
 * Only repeated (≥ 3) decisions at the same gym shift preferences. Decisions with reason "busy" (equipment
 * occupied) and "pain" are never preferences; later / reorder / busy are logistics and never count.
 */
export function planPreferences(data: AppData, today: string): PlanPreferences {
  const avoidN = new Map<string, number>();
  const preferN = new Map<string, number>();
  const painHold = new Set<string>();
  for (const w of data.workouts) {
    const gym = w.locationId ?? '';
    for (const d of w.planDecisions ?? []) {
      if (d.reason === 'pain') {
        if (diffDays(today, w.date) <= 7) painHold.add(d.exerciseId);
        continue;
      }
      if (d.reason === 'busy' || (d.action !== 'replaced' && d.action !== 'skipped')) continue;
      avoidN.set(`${gym}|${d.exerciseId}`, (avoidN.get(`${gym}|${d.exerciseId}`) ?? 0) + 1);
      if (d.action === 'replaced' && d.replacement) preferN.set(`${gym}|${d.replacement.exerciseId}`, (preferN.get(`${gym}|${d.replacement.exerciseId}`) ?? 0) + 1);
    }
  }
  const toMap = (m: Map<string, number>) => {
    const out = new Map<string, Set<string>>();
    for (const [k, n] of m) if (n >= 3) {
      const [gym, id] = k.split('|');
      out.set(gym, (out.get(gym) ?? new Set()).add(id));
    }
    return out;
  };
  return { avoid: toMap(avoidN), prefer: toMap(preferN), painHold };
}

// ---------------------------------------------------------------- output types

export type Calibration = 'calibrated' | 'provisional' | 'needs_data';

export interface PlanItem {
  key: string;
  exerciseId: string;
  equipmentId: string | null;
  variation?: Variation;
  order: number;
  calibration: Calibration;
  fatigueCost: 'high' | 'moderate' | 'low';
  primary: MuscleId | null;
  /** Effective sets this item is planned to give each muscle (sets × coefficient). */
  contributes: Partial<Record<MuscleId, number>>;
  setCount: number;
  prescription: Prescription;
  /** Familiar? (history on this key) */
  familiar: boolean;
  safety: string | null;
  why: string[];
}

export interface GeneratedWorkout {
  engine: typeof PLANNER_ENGINE;
  createdAt: string;
  mode: OperatingMode;
  /** suggestions (learning) → prescriptions (provisional) → complete (full adaptive). */
  stage: 'suggestions' | 'prescriptions' | 'complete';
  locationId: string | null;
  items: PlanItem[];
  skippedMuscles: { muscle: MuscleId; reason: string }[];
  /** Open effective sets per muscle at the start (today's share − done today; 0 when recovering). */
  budget: Partial<Record<MuscleId, number>>;
  /** Effective sets the plan gives each muscle. */
  planned: Partial<Record<MuscleId, number>>;
  returning: { daysOff: number; stepDown: boolean } | null;
  notes: string[];
  readiness: ReadinessReport;
}

export interface GenerateInput {
  data: AppData;
  analysis: Analysis;
  now: Date;
  locationId?: string | null;
  readiness?: ReadinessReport;
  /** Exercise ids not to plan (replaced / unwanted). */
  exclude?: string[];
  /** Exercises that must be in the plan (a chosen replacement). */
  force?: { exerciseId: string; equipmentId: string | null; variation?: Variation }[];
  /** Equipment marked busy. */
  busy?: string[];
  maxItems?: number;
}

// ---------------------------------------------------------------- generate

export function generateWorkout(input: GenerateInput): GeneratedWorkout {
  const { data, analysis, now } = input;
  const today = analysis.today;
  const registry = analysis.registry;
  const readiness = input.readiness ?? readinessReport(data, analysis);
  const lastLoc = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date)).find((w) => w.locationId)?.locationId ?? null;
  const locationId = input.locationId !== undefined ? input.locationId : lastLoc;
  const busy = new Set(input.busy ?? []);
  const exclude = new Set(input.exclude ?? []);
  const prefs = planPreferences(data, today);
  const avoidHere = prefs.avoid.get(locationId ?? '') ?? new Set<string>();
  const preferHere = prefs.prefer.get(locationId ?? '') ?? new Set<string>();
  const library = buildLibrary(data, analysis, readiness);
  const patterns = sessionPatterns(data, analysis);
  const history = data.workouts.filter((w) => w.date <= today);
  const counts = exerciseSessionCounts(history);
  const notes: string[] = [];

  // ---- budget: today's share minus what is already done today; 0 while recovering (never catch-up).
  const budget: Partial<Record<MuscleId, number>> = {};
  const skippedMuscles: GeneratedWorkout['skippedMuscles'] = [];
  for (const mw of analysis.muscles) {
    if (mw.todayBlocked) {
      if (mw.remainingToPreferred > 0 && MAJOR_MUSCLES.includes(mw.muscle)) skippedMuscles.push({ muscle: mw.muscle, reason: `recovering (~${analysis.planRecovery[mw.muscle].hoursLeft} h left)` });
      budget[mw.muscle] = 0;
      continue;
    }
    const open = Math.max(0, mw.todayShare - mw.doneToday);
    budget[mw.muscle] = open;
    if (open <= 0 && (mw.status === 'done' || mw.status === 'over') && MAJOR_MUSCLES.includes(mw.muscle)) skippedMuscles.push({ muscle: mw.muscle, reason: 'weekly target met' });
  }
  const remaining: Partial<Record<MuscleId, number>> = { ...budget };
  const blocked = (m: MuscleId) => analysis.muscles.find((x) => x.muscle === m)?.todayBlocked ?? false;

  const availableKey = (e: LibraryEntry, def: ExerciseDef): { ok: boolean; equipmentId: string | null } => {
    if (e.equipmentId) {
      const eq = data.equipment.find((x) => x.id === e.equipmentId);
      if (!eq || busy.has(eq.id)) return { ok: false, equipmentId: null };
      return { ok: !locationId || eq.locationId === locationId || eq.locationId == null, equipmentId: eq.id };
    }
    if (MACHINE_KINDS.has(def.equipmentKind)) return { ok: !locationId || e.gyms.includes(locationId) || e.gyms.length === 0, equipmentId: null };
    const gymKnown = !!locationId && history.filter((w) => w.locationId === locationId).length >= 3;
    return { ok: !locationId || e.gyms.includes(locationId) || !gymKnown || def.equipmentKind === 'dumbbell' || def.equipmentKind === 'bodyweight', equipmentId: null };
  };

  const items: Omit<PlanItem, 'order' | 'prescription' | 'calibration'>[] = [];
  const usedEx = new Set<string>();
  const priorityMult = (m: MuscleId) => (data.settings.priorities[m] === 'high' ? 1.3 : data.settings.priorities[m] === 'maintain' ? 0.6 : 1);
  const sizeMult = (m: MuscleId) => (MUSCLE_BY_ID[m].size === 'large' ? 1.15 : MUSCLE_BY_ID[m].size === 'medium' ? 1.05 : 1);
  const lastWorkout = [...history].filter((w) => w.date < today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const maxItems = input.maxItems ?? patterns.usualCount;

  const addItem = (def: ExerciseDef, equipmentId: string | null, variation: Variation | undefined, entry: LibraryEntry | null, targetMuscle: MuscleId, why: string[]) => {
    const { contributions } = resolveCoefficients(def, variation);
    const coefT = contributions[targetMuscle] ?? 0;
    const maxSets = def.category === 'compound' ? MAX_SETS.compound : MAX_SETS.isolation;
    const need = remaining[targetMuscle] ?? 0;
    let sets = Math.max(MIN_ITEM_SETS, Math.min(maxSets, Math.round(need / Math.max(coefT, 0.25))));
    while (sets > MIN_ITEM_SETS && sets * coefT > need + 0.5) sets--;
    // Keep the session near its usual size.
    const room = (patterns.usualSets != null ? Math.max(8, Math.round(patterns.usualSets * 1.15)) : 24) - items.reduce((n, it) => n + it.setCount, 0);
    sets = Math.max(MIN_ITEM_SETS, Math.min(sets, room));
    const contributes: Partial<Record<MuscleId, number>> = {};
    for (const [m, c] of Object.entries(contributions) as [MuscleId, number][]) {
      if (c <= 0) continue;
      contributes[m] = Math.round(sets * c * 100) / 100;
      remaining[m] = Math.max(0, (remaining[m] ?? 0) - sets * c);
    }
    usedEx.add(def.id);
    const key = entry?.key ?? progressionKey({ id: 'k', order: 0, exerciseId: def.id, exerciseConfidence: 'confirmed', equipmentId, equipmentConfidence: 'confirmed', variation, sets: [] }, { locationId } as Workout, def);
    items.push({
      key, exerciseId: def.id, equipmentId, variation, fatigueCost: fatigueCostOf(def, variation), primary: significantMuscles(def, variation, 0.5)[0]?.muscle ?? null,
      contributes, setCount: sets, familiar: !!entry, safety: safetyLine(data, def, today, registry, null), why,
    });
  };

  // Forced items first (chosen replacements).
  for (const f of input.force ?? []) {
    const def = registry.get(f.exerciseId);
    if (!def || usedEx.has(def.id)) continue;
    const target = significantMuscles(def, f.variation, 0.5)[0]?.muscle;
    if (!target) continue;
    const entry = library.find((e) => e.exerciseId === f.exerciseId && e.equipmentId === f.equipmentId) ?? null;
    addItem(def, f.equipmentId, f.variation ?? entry?.variation, entry, target, ['Your choice (replacement).']);
  }

  // Muscles that drive selection: the major ones, plus any the owner trains directly (a familiar exercise
  // with coefficient ≥ 0.75). Muscles that only ever get indirect work (erectors, adductors…) never pull in
  // an exercise of their own — they are credited by what is planned for the others.
  const directlyTrained = new Set<MuscleId>(MAJOR_MUSCLES);
  for (const e of library) {
    const def = registry.get(e.exerciseId);
    if (!def || e.sessions8w === 0) continue;
    for (const [m, c] of Object.entries(resolveCoefficients(def, e.variation).contributions) as [MuscleId, number][]) if (c >= 0.75) directlyTrained.add(m);
  }
  /** Below the lower end of the weekly range in each of the last 2 complete weeks → a persistent deficit. */
  const persistent = (m: MuscleId) => {
    const done = analysis.weeks.filter((b) => b.complete).slice(-2);
    return done.length === 2 && done.every((b) => b.volume.muscles[m].effective < analysis.targets[m].min);
  };

  // Session size: the owner's usual exercise count and ~ their usual number of working sets (+15 %).
  const maxSets = patterns.usualSets != null ? Math.max(8, Math.round(patterns.usualSets * 1.15)) : 24;
  const totalSets = () => items.reduce((n, it) => n + it.setCount, 0);
  const rejectedFor = new Map<MuscleId, Set<MuscleId>>();

  // Greedy selection by the largest open need (≥ 1.5 effective sets; smaller leftovers carry over).
  for (let guard = 0; guard < 30 && items.length < maxItems && totalSets() <= maxSets - MIN_ITEM_SETS; guard++) {
    const need = (TRACKED_MUSCLES.filter((m) => directlyTrained.has(m) && (remaining[m] ?? 0) >= MIN_OPEN) as MuscleId[])
      .sort((a, b) => (remaining[b] ?? 0) * priorityMult(b) * sizeMult(b) - (remaining[a] ?? 0) * priorityMult(a) * sizeMult(a));
    const m = need[0];
    if (!m) break;
    const scored = library
      .map((e) => {
        const def = registry.get(e.exerciseId);
        if (!def || usedEx.has(def.id) || exclude.has(def.id) || prefs.painHold.has(def.id)) return null;
        const co = resolveCoefficients(def, e.variation).contributions;
        if ((co[m] ?? 0) < 0.75) return null;
        const av = availableKey(e, def);
        if (!av.ok) return null;
        // Never plan something that loads a recovering muscle significantly.
        const held = (Object.entries(co) as [MuscleId, number][]).filter(([n, c]) => c >= 0.5 && n !== m && blocked(n)).map(([n]) => n);
        if (held.length) { held.forEach((n) => (rejectedFor.get(m) ?? rejectedFor.set(m, new Set()).get(m)!).add(n)); return null; }
        // No overshoot: another directly trained muscle (≥ 0.75) whose open share is already covered.
        if ((Object.entries(co) as [MuscleId, number][]).some(([n, c]) => c >= 0.75 && n !== m && (remaining[n] ?? 0) < 1)) return null;
        // Familiarity, weighted toward what the owner does NOW: a switch in recent sessions outweighs an old habit.
        let score = Math.min(e.sessions8w, 8) * 0.75 + e.recent6 * 2 + ({ INSUFFICIENT_DATA: 0, DEVELOPING: 1, SUFFICIENT: 3, WELL_CALIBRATED: 4 }[e.calibration]) * 2;
        if (e.recent6 === 0 && e.sessions8w > 0) score -= 4; // dropped from the recent routine
        if (e.preferred) score += 3;
        if (e.status === 'frequent') score += 2;
        if (e.status === 'old') score -= 3;
        if (preferHere.has(def.id)) score += 4;
        if (avoidHere.has(def.id)) score -= 10;
        if (locationId && !e.gyms.includes(locationId) && e.gyms.length) score -= 2;
        for (const [n, c] of Object.entries(co) as [MuscleId, number][]) if (n !== m && c >= 0.5 && (remaining[n] ?? 0) <= 0) score -= 1.5; // overshoot
        // Variety: the same key in the very last session while an equally familiar option exists.
        if (lastWorkout?.exercises.some((x) => progressionKey(x, lastWorkout, registry.get(x.exerciseId)) === e.key)) score -= 0.5;
        return { e, def, av, score };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best) {
      const why = [`${muscleName(m)}: ${fmt(remaining[m] ?? 0)} effective set${(remaining[m] ?? 0) === 1 ? '' : 's'} open today.`];
      why.push(best.e.sessions8w ? `Familiar: ${best.e.sessions8w} session${best.e.sessions8w === 1 ? '' : 's'} in 8 weeks${best.e.preferred ? ' · one of your regular exercises' : ''}.` : `Done before (${best.e.sessions} session${best.e.sessions === 1 ? '' : 's'}), not recently.`);
      if (preferHere.has(best.def.id)) why.push('You usually choose this one at this gym.');
      addItem(best.def, best.av.equipmentId ?? best.e.equipmentId, best.e.variation, best.e, m, why);
      continue;
    }
    // No familiar option: an unfamiliar exercise only for a major muscle with a persistent deficit (≥ 2 sets open)
    // against the owner's OWN target (individualized or set by hand) — never to chase a generic reference.
    const ownTarget = analysis.targets[m].source !== 'reference';
    if ((remaining[m] ?? 0) >= 2 && MAJOR_MUSCLES.includes(m) && ownTarget && persistent(m)) {
      const seed = [...registry.values()]
        // The pain hold (safety) and a learned "avoid" apply here exactly as on the familiar path.
        .filter((d) => !usedEx.has(d.id) && !exclude.has(d.id) && !prefs.painHold.has(d.id) && !avoidHere.has(d.id) && (d.contributions[m] ?? 0) >= 1)
        .filter((d) => !(Object.entries(d.contributions) as [MuscleId, number][]).some(([n, c]) => c >= 0.5 && n !== m && blocked(n)))
        .map((d) => ({ d, av: availableEquipment(data, d, locationId, busy, history) }))
        .filter((x) => x.av.ok && (x.av.known || !MACHINE_KINDS.has(x.d.equipmentKind)))
        .sort((a, b) => Number(b.av.known) - Number(a.av.known) || (counts.get(b.d.id) ?? 0) - (counts.get(a.d.id) ?? 0)
          || (MUSCLE_BY_ID[m].size === 'small' ? Number(a.d.category === 'compound') - Number(b.d.category === 'compound') : Number(b.d.category === 'compound') - Number(a.d.category === 'compound')))[0];
      if (seed) {
        // "New to you" only when it really is: an exercise with sessions on record is named as such.
        const before = counts.get(seed.d.id) ?? 0;
        const deficit = L(`${muscleName(m)}: below the lower end of its weekly range for 2 weeks and no familiar exercise available here`, `${muscleName(m)}: две недели ниже нижней границы недельного диапазона, знакомого упражнения здесь нет`);
        addItem(seed.d, seed.av.equipmentId, seed.d.defaultVariation as Variation | undefined, null, m, [before > 0
          ? L(`${deficit} — done before (${before} session${before === 1 ? '' : 's'}), but not in this setup, so it starts calibrating.`, `${deficit} — вы уже делали это упражнение (тренировок: ${before}), но не в этом варианте, поэтому оно начинает калибровку.`)
          : L(`${deficit} — new to you, so it starts calibrating.`, `${deficit} — упражнение для вас новое, поэтому оно начинает калибровку.`)]);
        continue;
      }
    }
    const held = rejectedFor.get(m);
    if (MAJOR_MUSCLES.includes(m)) skippedMuscles.push({ muscle: m, reason: held?.size ? `familiar options also load ${[...held].map((n) => muscleName(n).toLowerCase()).join(', ')} (recovering)` : 'no familiar exercise available here' });
    remaining[m] = 0;
  }

  // ---- order: priority muscle first (even isolation), then fatigue cost HIGH → LOW, usual position, larger muscle.
  const priority = (it: (typeof items)[number]) => !!it.primary && data.settings.priorities[it.primary] === 'high';
  const posOf = (it: (typeof items)[number]) => library.find((e) => e.key === it.key)?.medianPosition ?? 0.5;
  const sizeRank = (m: MuscleId | null) => (m ? { large: 0, medium: 1, small: 2 }[MUSCLE_BY_ID[m].size] : 3);
  const ordered = [...items].sort((a, b) => Number(priority(b)) - Number(priority(a)) || FATIGUE_RANK[a.fatigueCost] - FATIGUE_RANK[b.fatigueCost] || posOf(a) - posOf(b) || sizeRank(a.primary) - sizeRank(b.primary));

  // ---- prescriptions in that order, with session-level set counts; earlier items count as done for warm-ups.
  const draft: Workout = {
    id: '__plan_draft__', schemaVersion: 1, date: today, startTime: null, endTime: null, durationMin: null, locationId, locationConfidence: 'confirmed',
    exercises: [], source: 'live', createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  const lastDate = lastWorkout?.date ?? null;
  const daysOff = lastDate ? diffDays(today, lastDate) : null;
  const returning = daysOff != null && daysOff >= 10 ? { daysOff, stepDown: daysOff > 14 } : null;
  if (returning) notes.push(returning.stepDown ? `Returning after ${daysOff} days: loads start one step below your last comparable session.` : `Returning after ${daysOff} days: loads as last time; judge the first set.`);

  const out: PlanItem[] = [];
  ordered.forEach((it, i) => {
    const we: WorkoutExercise = {
      id: `plan-${i}`, order: i, exerciseId: it.exerciseId, exerciseConfidence: 'confirmed', equipmentId: it.equipmentId,
      equipmentConfidence: it.equipmentId ? 'confirmed' : 'unknown', variation: it.variation, sets: [],
    };
    draft.exercises.push(we);
    const p = prescribe({
      data, analysis, now, workout: draft, exerciseIndex: i,
      setCount: { count: it.setCount, reason: `Planned for the whole session: ${Object.entries(it.contributes).filter(([, v]) => (v ?? 0) >= 0.5).map(([m, v]) => `${muscleName(m as MuscleId).toLowerCase()} ${fmt(v as number)}`).join(', ')} effective sets.` },
    });
    // (The > 14-day step-down is applied inside prescribe(), so live re-assessment keeps it too.)
    // Calibration = well-logged comparable sessions on THIS exercise × machine × configuration (readiness),
    // not merely how many sessions exist.
    const keyLevel = readiness.keys.find((k) => k.key === p.key)?.level ?? 'INSUFFICIENT_DATA';
    const calibration: Calibration = p.workingWeightKg == null && p.loadMode !== 'bodyweight_plus' ? 'needs_data'
      : keyLevel === 'SUFFICIENT' || keyLevel === 'WELL_CALIBRATED' ? 'calibrated' : 'provisional';
    // Later items see this one as done (shorter warm-ups for the same muscles).
    we.sets = p.sets.map((s, k): WorkoutSet => ({
      id: `plan-${i}-${k}`, type: 'working', weightKg: s.weightKg, loadMode: p.loadMode, reps: s.repsMin, rir: s.rirMax, rirSource: 'reported',
      restSecBefore: null, completedAt: now.toISOString(),
    }));
    const why = [...it.why];
    if (calibration === 'needs_data') why.push(`Calibrate: pick a load for ${registry.get(it.exerciseId)?.repRange.join('–') ?? '10–12'} reps at RIR 2–3 (no kg is transferred from other machines).`);
    else if (calibration === 'provisional') why.push(`Provisional: ${p.confidenceReason}`);
    else why.push(p.decisionWhy);
    out.push({ ...it, order: i, prescription: p, calibration, setCount: p.setCount, why });
  });

  const planned: Partial<Record<MuscleId, number>> = {};
  for (const it of out) for (const [m, v] of Object.entries(it.contributes) as [MuscleId, number][]) planned[m] = Math.round(((planned[m] ?? 0) + v) * 100) / 100;

  const mode = readiness.mode;
  const stage: GeneratedWorkout['stage'] = mode === 'full' ? 'complete' : mode === 'provisional' ? 'prescriptions' : 'suggestions';
  if (mode === 'learning') notes.push('Learning mode: suggestions only, labelled provisional — log well-documented workouts to unlock full plans.');
  if (out.some((x) => x.calibration === 'needs_data')) notes.push('Items marked "calibrate" have no history on that machine yet.');
  if (!out.length && data.workouts.length) notes.push('Nothing is open today: every muscle is done for the week or still recovering. Rest or a light session is a good choice.');
  return {
    engine: PLANNER_ENGINE, createdAt: now.toISOString(), mode, stage, locationId, items: out, skippedMuscles, budget, planned, returning, notes, readiness,
  };
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

// ---------------------------------------------------------------- start / snapshot

/** The plan snapshot stored on the workout (separate from what will be performed). */
export function planSnapshot(g: GeneratedWorkout): GeneratedPlanSnapshot {
  return {
    engine: g.engine, createdAt: g.createdAt, mode: g.mode,
    items: g.items.map((it) => ({
      exerciseId: it.exerciseId, equipmentId: it.equipmentId, ...(it.variation ? { variation: it.variation } : {}), order: it.order, calibration: it.calibration,
      sets: it.setCount, weightKg: it.prescription.workingWeightKg, repsMin: it.prescription.sets[0]?.repsMin ?? 0, repsMax: it.prescription.sets[0]?.repsMax ?? 0,
    })),
  };
}

export interface ItemEdit { sets?: number; weightKg?: number | null }

/** Today's target for one exercise, from a prescription (Part 6: a line, never set rows). */
export function targetFromPrescription(p: Pick<Prescription, 'workingWeightKg' | 'sets' | 'setCount'>, sets: number = p.setCount, weightKg: number | null | undefined = undefined, edited = false): ExerciseTarget {
  const reps = p.sets.length ? p.sets.map((x) => ({ min: x.repsMin, max: x.repsMax })) : [{ min: 10, max: 12 }];
  return { sets, weightKg: weightKg !== undefined ? weightKg : p.workingWeightKg, reps, engine: PRESCRIPTION_ENGINE, ...(edited ? { edited: true } : {}) };
}

/**
 * A live workout started from a plan: one exercise per item with a TARGET (sets × load × reps). No set rows are
 * created — a set exists only once it was performed and logged (Part 6). Edits before Start change the target
 * and mark it as the owner's; the prescription stays as it was.
 */
export function workoutFromPlan(g: GeneratedWorkout, base: { id: string; date: string; startTime: string; nowIso: string; uid: () => string }, edits: Record<number, ItemEdit> = {}, decisions: PlanDecision[] = []): Workout {
  const exercises: WorkoutExercise[] = g.items.map((it, i) => {
    const ed = edits[it.order] ?? {};
    const n = ed.sets != null ? Math.max(0, Math.min(8, ed.sets)) : it.setCount;
    return {
      id: base.uid(), order: i, exerciseId: it.exerciseId, exerciseConfidence: 'confirmed', equipmentId: it.equipmentId,
      equipmentConfidence: it.equipmentId ? 'confirmed' : 'unknown', ...(it.variation ? { variation: { ...it.variation } } : {}), sets: [], planItem: it.order,
      // An item the owner edited before starting is never re-planned automatically.
      target: targetFromPrescription(it.prescription, n, ed.weightKg, !!edits[it.order]),
    };
  });
  return {
    id: base.id, schemaVersion: 1, date: base.date, startTime: base.startTime, endTime: null, durationMin: null, locationId: g.locationId,
    locationConfidence: g.locationId ? 'confirmed' : 'unknown', exercises, source: 'live', generated: planSnapshot(g),
    ...(decisions.length ? { planDecisions: decisions } : {}), createdAt: base.nowIso, updatedAt: base.nowIso,
  };
}

// ---------------------------------------------------------------- live re-assessment (E.9)

export interface PendingUpdate {
  exerciseIndex: number;
  setCount: number;
  prescription: Prescription;
  reason: string;
}

/**
 * Re-prescribe every exercise of the live session that has NO performed working set yet, from what was
 * actually done (whatever the order): open share per muscle = today's share − effective sets already done
 * today (this session + other sessions today); pending exercises share it in their CURRENT order, each
 * contributing fractionally. Warm-ups and loads come from prescribe() with the real session as context.
 * Skipped exercises are ignored. Returns one entry per pending exercise.
 */
export function replanPending(data: AppData, analysis: Analysis, w: Workout, now: Date): PendingUpdate[] {
  const registry = analysis.registry;
  const today = localNowParts(data.settings.timezone, now).date;
  const q = data.settings.quality;
  const doneHere = sessionMuscleEffective(w, registry, q);
  const otherToday = computeVolume(data.workouts.filter((o) => o.date === today && o.id !== w.id), registry, q);
  const open: Partial<Record<MuscleId, number>> = {};
  for (const mw of analysis.muscles) {
    const done = (doneHere[mw.muscle] ?? 0) + otherToday.muscles[mw.muscle].effective;
    open[mw.muscle] = mw.todayBlocked ? 0 : Math.max(0, mw.todayShare - done);
  }
  const out: PendingUpdate[] = [];
  w.exercises.forEach((e, i) => {
    if (e.skipped || performed(e)) return;
    const def = registry.get(e.exerciseId);
    if (!def) return;
    const sig = significantMuscles(def, e.variation, 0.5);
    const primary = sig[0];
    if (!primary) return;
    const maxSets = def.category === 'compound' ? MAX_SETS.compound : MAX_SETS.isolation;
    const need = open[primary.muscle] ?? 0;
    let n = need / primary.coef < 0.5 ? 0 : Math.max(1, Math.min(maxSets, Math.round(need / primary.coef)));
    while (n > 1 && n * primary.coef > need + 0.5) n--;
    const { contributions } = resolveCoefficients(def, e.variation);
    for (const [m, c] of Object.entries(contributions) as [MuscleId, number][]) open[m] = Math.max(0, (open[m] ?? 0) - n * c);
    const doneTxt = Object.entries(doneHere).filter(([, v]) => (v ?? 0) >= 0.5).map(([m, v]) => `${muscleName(m as MuscleId).toLowerCase()} ${fmt(v as number)}`).join(', ');
    const reason = n === 0
      ? `${muscleName(primary.muscle)}: today's share is already covered by what you did${doneTxt ? ` (${doneTxt})` : ''} — optional now.`
      : `Re-checked after what you actually did${doneTxt ? ` (${doneTxt})` : ''}: ${n} set${n === 1 ? '' : 's'} for ${muscleName(primary.muscle).toLowerCase()}.`;
    const p = prescribe({ data, analysis, now, workout: w, exerciseIndex: i, setCount: { count: n, reason } });
    out.push({ exerciseIndex: i, setCount: p.setCount, prescription: p, reason });
  });
  return out;
}

/** A planned set that the owner has not touched (still equal to what was prescribed). */
export function untouchedPlanned(s: WorkoutSet): boolean {
  return !!s.planned && !!s.prescribed && s.prescribed.kind === 'working' && s.weightKg === s.prescribed.weightKg && s.reps === s.prescribed.repsMin && s.rir == null && !s.feel;
}

/**
 * Apply a re-assessment to one exercise that has NOT been started: its target is replaced by the new
 * prescription (count, load, reps). A target the owner edited is never overwritten; an exercise with a
 * performed set is never touched. A session started before Part 6 (untouched planned rows the app made) is
 * converted: the rows go, the target takes their place. Returns null when nothing changes.
 */
export function applyPendingUpdate(e: WorkoutExercise, u: PendingUpdate, _uid?: () => string): WorkoutExercise | null {
  void _uid;
  if (performed(e)) return null;
  const p = u.prescription;
  const next = targetFromPrescription(p);
  if (e.target) {
    if (e.target.edited) return null;
    const same = e.target.sets === next.sets && e.target.weightKg === next.weightKg && JSON.stringify(e.target.reps) === JSON.stringify(next.reps);
    return same ? null : { ...e, target: next };
  }
  // Legacy cards (planned rows): only when the app made them and the owner left them alone.
  const working = e.sets.filter((s) => s.type === 'working');
  if (e.plannedCount == null || working.length !== e.plannedCount) return null;
  if (working.some((s) => !untouchedPlanned(s)) || working.some((s) => s.side)) return null;
  const { plannedCount: _c, ...rest } = e;
  void _c;
  return { ...rest, sets: e.sets.filter((s) => s.type !== 'working'), target: next };
}

// ---------------------------------------------------------------- replacements + adherence

export interface ReplacementOption { exerciseId: string; equipmentId: string | null; variation?: Variation; sessions: number; why: string }

/**
 * Options to replace one exercise (busy machine, preference): same primary muscle (coef ≥ 0.75), available
 * at this gym with busy machines excluded, not already in the session, familiar first; ≤ 3.
 */
export function replacementOptions(data: AppData, analysis: Analysis, w: Workout | null, exerciseId: string, busy: string[] = [], locationId: string | null = w?.locationId ?? null): ReplacementOption[] {
  const registry = analysis.registry;
  const def = registry.get(exerciseId);
  if (!def) return [];
  const primary = significantMuscles(def, null, 0.5)[0]?.muscle;
  if (!primary) return [];
  const busySet = new Set([...busy, ...(w?.busyEquipment ?? []).map((b) => b.equipmentId)]);
  const history = priorWorkouts(data, w);
  const counts = exerciseSessionCounts(history);
  const inSession = new Set((w?.exercises ?? []).filter((e) => !e.skipped).map((e) => e.exerciseId));
  const lib = new Map<string, Variation | undefined>();
  for (const x of history) for (const e of x.exercises) if (e.variation) lib.set(e.exerciseId, e.variation);
  const out: ReplacementOption[] = [];
  // The same exercise on another machine at this gym that is free (its own history; "calibrate" if new).
  const current = w?.exercises.find((e) => e.exerciseId === exerciseId && !e.skipped)?.equipmentId ?? null;
  for (const eq of data.equipment) {
    if (eq.id === current || busySet.has(eq.id) || !eq.exerciseIds.includes(def.id) || (locationId && eq.locationId !== locationId)) continue;
    const used = history.filter((x) => x.exercises.some((e) => e.exerciseId === def.id && e.equipmentId === eq.id)).length;
    out.push({ exerciseId: def.id, equipmentId: eq.id, sessions: used, why: `Same exercise on ${eq.name} — its own history${used ? ` (${used} session${used === 1 ? '' : 's'})` : ' · new machine: calibrate'}` });
  }
  for (const d of registry.values()) {
    if (d.id === def.id || inSession.has(d.id) || (d.contributions[primary] ?? 0) < 0.75) continue;
    const av = availableEquipment(data, d, locationId, busySet, history);
    const sessions = counts.get(d.id) ?? 0;
    if (!av.ok || (!av.known && sessions === 0)) continue;
    const blockedSyn = significantMuscles(d, null, 0.5).some((x) => x.muscle !== primary && analysis.muscles.find((m) => m.muscle === x.muscle)?.todayBlocked);
    if (blockedSyn) continue;
    out.push({
      exerciseId: d.id, equipmentId: av.equipmentId, variation: lib.get(d.id), sessions,
      why: `${muscleName(primary)} ${(d.contributions[primary] ?? 0) >= 1 ? 'direct' : 'mostly'} · fatigue ${fatigueCostOf(d).toUpperCase()}${sessions ? ` · ${sessions} session${sessions === 1 ? '' : 's'} logged` : ' · new to you (calibrate)'}`,
    });
  }
  return out.sort((a, b) => Number(b.exerciseId === def.id) - Number(a.exerciseId === def.id) || Number(b.sessions >= 2) - Number(a.sessions >= 2) || b.sessions - a.sessions).slice(0, 3);
}

export type Adherence = 'followed' | 'weight_changed' | 'reps_changed' | 'more_sets' | 'fewer_sets' | 'skipped' | 'replaced' | 'not_done';

/** Per plan item: what happened (computed from the snapshot vs the performed exercises + decisions). */
export function planAdherence(w: Workout): { order: number; exerciseId: string; result: Adherence }[] {
  const g = w.generated;
  if (!g) return [];
  return g.items.map((it) => {
    const dec = (w.planDecisions ?? []).filter((d) => d.exerciseId === it.exerciseId);
    if (dec.some((d) => d.action === 'replaced')) return { order: it.order, exerciseId: it.exerciseId, result: 'replaced' };
    const ex = w.exercises.find((e) => e.planItem === it.order && e.exerciseId === it.exerciseId);
    if (!ex || ex.skipped || dec.some((d) => d.action === 'skipped')) return { order: it.order, exerciseId: it.exerciseId, result: ex && performed(ex) ? 'fewer_sets' : 'skipped' };
    // Compared with what was prescribed on the sets at the time (after any live re-assessment); L/R pairs count once.
    const done = ex.sets.filter((s) => isCounted(s) && s.type === 'working');
    const nDone = countedSetCount(done, ['working']);
    // Planned = the exercise's target (Part 6; after any live re-assessment), else the plan item. Sessions from
    // before Part 6 carry the prescription on each set instead.
    const t = ex.target;
    const nPlanned = t ? t.sets : it.sets;
    if (!done.length) return { order: it.order, exerciseId: it.exerciseId, result: 'not_done' };
    if (nDone > nPlanned) return { order: it.order, exerciseId: it.exerciseId, result: 'more_sets' };
    if (nDone < nPlanned) return { order: it.order, exerciseId: it.exerciseId, result: 'fewer_sets' };
    const planW = (sx: WorkoutSet) => sx.prescribed?.weightKg ?? t?.weightKg ?? null;
    const planR = (sx: WorkoutSet, k: number): [number, number] | null => (sx.prescribed ? [sx.prescribed.repsMin, sx.prescribed.repsMax] : t && t.reps.length ? [t.reps[Math.min(k, t.reps.length - 1)].min, t.reps[Math.min(k, t.reps.length - 1)].max] : null);
    if (done.some((sx) => planW(sx) != null && sx.weightKg !== planW(sx))) return { order: it.order, exerciseId: it.exerciseId, result: 'weight_changed' };
    const perSide = done.some((sx) => sx.side);
    if (done.some((sx, k) => { const r = planR(sx, perSide ? Math.floor(k / 2) : k); return !!r && sx.reps != null && (sx.reps < r[0] - 1 || sx.reps > r[1] + 1); })) return { order: it.order, exerciseId: it.exerciseId, result: 'reps_changed' };
    return { order: it.order, exerciseId: it.exerciseId, result: 'followed' };
  });
}

