import { z } from 'zod';
import { sha256Hex } from '../lib/crypto';
import type { AppData } from './appdata';
import { isIsoDate } from './dates';
import { MUSCLE_IDS } from './types';
import { normalizeName, searchExercises, type Registry } from './registry';
import type { Confidence, Equipment, Location, MuscleId, Workout, WorkoutExercise, WorkoutSet } from './types';
import { uid } from '../lib/id';

/**
 * Workout import contract — schema "gymrat.workout", version 1.x.
 * Documented in docs/WORKOUT_SCHEMA.md and docs/schema/workout-import.v1.schema.json.
 * Keep CLAUDE.md in sync when this changes.
 */
export const IMPORT_SCHEMA_ID = 'gymrat.workout';
export const IMPORT_SCHEMA_VERSION = '1.0';

const confidence = z.enum(['confirmed', 'probable', 'uncertain', 'unknown']);
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:mm (24h)');
const nnum = z.number().finite().nonnegative();

const SetIn = z.object({
  type: z.enum(['warmup', 'working', 'drop']).default('working'),
  weight_kg: nnum.nullable(),
  load_mode: z.enum(['total', 'per_side', 'bodyweight_plus', 'assisted']).default('total'),
  reps: z.number().int().nonnegative().max(200).nullable(),
  rir: z.number().min(0).max(10).nullable().optional(),
  rir_source: z.enum(['reported', 'inferred', 'unknown']).optional(),
  to_failure: z.boolean().optional(),
  rest_before_sec: nnum.max(3600).nullable().optional(),
  rom: z.enum(['full', 'lengthened_partial', 'partial']).optional(),
  technique_ok: z.boolean().optional(),
  count: z.number().int().min(1).max(20).optional(),
  notes: z.string().max(1000).optional(),
}).strict();

const ExerciseIn = z.object({
  exercise_id: z.string().max(80).nullable().optional(),
  exercise_name_raw: z.string().max(200).nullable().optional(),
  exercise_confidence: confidence.optional(),
  equipment_id: z.string().max(80).nullable().optional(),
  equipment: z.object({
    equipment_id: z.string().max(80).nullable().optional(),
    name_hint: z.string().max(200).nullable().optional(),
    manufacturer: z.string().max(100).nullable().optional(),
    model: z.string().max(100).nullable().optional(),
    kind: z.enum(['machine', 'plate_loaded', 'cable', 'smith', 'barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band', 'other']).nullable().optional(),
    confidence: confidence.optional(),
  }).strict().optional(),
  variation: z.object({
    bench_angle_deg: z.number().min(-45).max(90).nullable().optional(),
    grip: z.string().max(40).nullable().optional(),
    grip_width: z.string().max(40).nullable().optional(),
    stance: z.string().max(60).nullable().optional(),
    rom: z.enum(['full', 'lengthened_partial', 'partial']).nullable().optional(),
    unilateral: z.boolean().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  }).strict().optional(),
  settings: z.record(z.union([z.string(), z.number()])).optional(),
  rest_between_sets_sec: nnum.max(3600).nullable().optional(),
  rest_after_sec: nnum.max(7200).nullable().optional(),
  notes: z.string().max(1000).optional(),
  sets: z.array(SetIn).min(1, 'Each exercise needs at least one set'),
}).strict().refine((e) => !!(e.exercise_id || e.exercise_name_raw), { message: 'Provide exercise_id or exercise_name_raw' });

const soreness = z.record(z.number().int().min(0).max(4)).refine(
  (r) => Object.keys(r).every((k) => (MUSCLE_IDS as readonly string[]).includes(k)),
  { message: `Soreness keys must be muscle ids: ${MUSCLE_IDS.join(', ')}` },
);

export const WorkoutIn = z.object({
  client_ref: z.string().max(120).optional(),
  date: z.string().refine(isIsoDate, 'date must be YYYY-MM-DD'),
  start_time: time.nullable().optional(),
  end_time: time.nullable().optional(),
  duration_min: nnum.max(600).nullable().optional(),
  location_id: z.string().max(80).nullable().optional(),
  location: z.object({
    location_id: z.string().max(80).nullable().optional(),
    name_hint: z.string().max(200).nullable().optional(),
    confidence: confidence.optional(),
  }).strict().optional(),
  exercises: z.array(ExerciseIn).min(1, 'A workout needs at least one exercise'),
  session: z.object({
    fatigue_1_5: z.number().int().min(1).max(5).nullable().optional(),
    energy_1_5: z.number().int().min(1).max(5).nullable().optional(),
    sleep_hours: z.number().min(0).max(24).nullable().optional(),
    session_rpe: z.number().min(1).max(10).nullable().optional(),
    soreness: soreness.optional(),
    notes: z.string().max(2000).optional(),
  }).strict().optional(),
  notes: z.string().max(4000).optional(),
  raw_input: z.string().max(20000).optional(),
  uncertainties: z.array(z.string().max(500)).optional(),
}).strict();

export const Envelope = z.object({
  schema: z.literal(IMPORT_SCHEMA_ID).optional(),
  schema_version: z.union([z.string(), z.number()]).optional(),
  workouts: z.array(WorkoutIn).min(1),
}).strict();

export type WorkoutInT = z.infer<typeof WorkoutIn>;

export interface ParseResult {
  ok: boolean;
  workouts: WorkoutInT[];
  errors: string[];
}

export function parseImportJson(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch (e) {
    return { ok: false, workouts: [], errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  const isEnvelope = typeof raw === 'object' && raw !== null && 'workouts' in raw;
  if (isEnvelope) {
    const v = (raw as { schema_version?: unknown }).schema_version;
    if (v != null && !String(v).startsWith('1')) return { ok: false, workouts: [], errors: [`Unsupported schema_version ${String(v)} (this app reads 1.x)`] };
    const r = Envelope.safeParse(raw);
    if (!r.success) return { ok: false, workouts: [], errors: formatZod(r.error) };
    return { ok: true, workouts: r.data.workouts, errors: [] };
  }
  const arr = Array.isArray(raw) ? raw : [raw];
  const workouts: WorkoutInT[] = [];
  const errors: string[] = [];
  arr.forEach((item, i) => {
    const r = WorkoutIn.safeParse(item);
    if (r.success) workouts.push(r.data);
    else errors.push(...formatZod(r.error).map((e) => (arr.length > 1 ? `workout[${i}].${e}` : e)));
  });
  return { ok: errors.length === 0 && workouts.length > 0, workouts, errors };
}

function stripFences(t: string): string {
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : t).trim();
}

function formatZod(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

// ---------------------------------------------------------------- Resolution

export type IssueLevel = 'error' | 'warning' | 'info';
export interface ImportIssue {
  level: IssueLevel;
  path: string;
  message: string;
}

export interface ExerciseResolution {
  index: number;
  rawName: string;
  exerciseId: string | null;
  exerciseSuggestions: string[];
  exerciseConfidence: Confidence;
  equipmentId: string | null;
  equipmentSuggestions: string[];
  equipmentConfidence: Confidence;
  equipmentHint: { name?: string | null; manufacturer?: string | null; model?: string | null; kind?: string | null } | null;
}

export interface ImportDraft {
  key: string;
  input: WorkoutInT;
  workout: Workout;
  locationSuggestions: string[];
  locationHint: string | null;
  exercises: ExerciseResolution[];
  issues: ImportIssue[];
  hash: string;
  duplicateOf: string | null;
}

function matchLocation(locations: Location[], id?: string | null, hint?: string | null): { id: string | null; suggestions: string[]; conf: Confidence } {
  if (id) {
    const exact = locations.find((l) => l.id === id);
    if (exact) return { id: exact.id, suggestions: [exact.id], conf: 'confirmed' };
    const byName = locations.find((l) => normalizeName(l.name) === normalizeName(id.replace(/_/g, ' ')));
    if (byName) return { id: byName.id, suggestions: [byName.id], conf: 'probable' };
  }
  if (hint) {
    const h = normalizeName(hint);
    const scored = locations.map((l) => ({ l, s: similarity(normalizeName(l.name), h) })).filter((x) => x.s > 0.3).sort((a, b) => b.s - a.s);
    if (scored.length) return { id: null, suggestions: scored.map((x) => x.l.id), conf: 'uncertain' };
  }
  return { id: null, suggestions: [], conf: 'unknown' };
}

export function matchEquipment(
  equipment: Equipment[],
  exerciseId: string | null,
  locationId: string | null,
  id?: string | null,
  hint?: { name_hint?: string | null; manufacturer?: string | null; model?: string | null } | null,
): { id: string | null; suggestions: string[]; conf: Confidence } {
  if (id) {
    const e = equipment.find((x) => x.id === id);
    if (e) return { id: e.id, suggestions: [e.id], conf: 'confirmed' };
  }
  const pool = equipment.filter((e) => !locationId || e.locationId === locationId || e.locationId == null);
  const scored = pool.map((e) => {
    let s = 0;
    if (exerciseId && e.exerciseIds.includes(exerciseId)) s += 0.6;
    if (hint?.name_hint) s += similarity(normalizeName(e.name), normalizeName(hint.name_hint)) * 0.5;
    if (hint?.manufacturer && e.manufacturer && normalizeName(e.manufacturer) === normalizeName(hint.manufacturer)) s += 0.3;
    if (hint?.model && e.model && normalizeName(e.model) === normalizeName(hint.model)) s += 0.4;
    return { e, s };
  }).filter((x) => x.s >= 0.3).sort((a, b) => b.s - a.s);
  if (!scored.length) return { id: null, suggestions: [], conf: 'unknown' };
  // A single machine at this gym already linked to the exercise is a probable (not confirmed) match.
  const top = scored[0];
  const unique = scored.length === 1 || scored[1].s < top.s - 0.25;
  if (unique && top.s >= 0.6 && locationId) return { id: top.e.id, suggestions: scored.map((x) => x.e.id), conf: 'probable' };
  return { id: null, suggestions: scored.map((x) => x.e.id), conf: 'uncertain' };
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const ta = new Set(a.split(' '));
  const tb = new Set(b.split(' '));
  let inter = 0;
  ta.forEach((t) => tb.has(t) && inter++);
  return inter / Math.max(ta.size, tb.size);
}

export async function workoutHash(w: Pick<Workout, 'date' | 'locationId' | 'exercises'>): Promise<string> {
  const canonical = JSON.stringify({
    d: w.date,
    l: w.locationId ?? null,
    e: w.exercises.map((e) => [e.exerciseId, e.equipmentId ?? null, e.sets.map((s) => [s.type, s.weightKg, s.reps, s.rir])]),
  });
  return sha256Hex(canonical);
}

/** Convert a validated input into an editable draft. Never invents values: unknowns stay null. */
export async function buildDraft(input: WorkoutInT, data: AppData, registry: Registry, source: Workout['source'] = 'claude_import'): Promise<ImportDraft> {
  const issues: ImportIssue[] = [];
  const now = new Date().toISOString();
  const loc = matchLocation(data.locations, input.location?.location_id ?? input.location_id, input.location?.name_hint);
  const locationHint = input.location?.name_hint ?? input.location_id ?? null;
  if (!loc.id) {
    issues.push({ level: 'warning', path: 'location', message: locationHint ? `Gym "${locationHint}" is not a known location — choose one or create it.` : 'Gym not specified — choose a location or leave it unknown.' });
  }
  const reported = input.location?.confidence;
  const locationConfidence: Confidence = loc.id ? (reported && reported !== 'confirmed' ? reported : loc.conf) : 'unknown';

  const exercises: WorkoutExercise[] = [];
  const resolutions: ExerciseResolution[] = [];
  input.exercises.forEach((ex, i) => {
    let exerciseId: string | null = null;
    let suggestions: string[] = [];
    let exConf: Confidence = ex.exercise_confidence ?? 'confirmed';
    if (ex.exercise_id && registry.has(ex.exercise_id)) {
      exerciseId = ex.exercise_id;
      suggestions = [ex.exercise_id];
    } else {
      const q = ex.exercise_name_raw ?? ex.exercise_id?.replace(/_/g, ' ') ?? '';
      const found = searchExercises(registry, q, 5);
      suggestions = found.map((f) => f.id);
      const nq = normalizeName(q);
      const exact = found.find((f) => [f.name.en, f.name.ru, f.id.replace(/_/g, ' '), ...f.aliases].some((n) => normalizeName(n) === nq));
      if (exact) {
        exerciseId = exact.id;
        exConf = 'probable';
      } else if (found.length && normalizeName(found[0].name.en) === nq) {
        exerciseId = found[0].id;
        exConf = 'probable';
      } else {
        exConf = 'uncertain';
        issues.push({ level: 'error', path: `exercises[${i}]`, message: `Exercise "${q}" not recognised — pick the matching exercise or create a custom one.` });
      }
    }
    const eqHint = ex.equipment ?? null;
    const eq = matchEquipment(data.equipment, exerciseId, loc.id, ex.equipment?.equipment_id ?? ex.equipment_id, eqHint);
    const def = exerciseId ? registry.get(exerciseId) : undefined;
    const needsMachine = def && ['machine', 'cable', 'plate_loaded', 'smith'].includes(def.equipmentKind);
    if (!eq.id && needsMachine) {
      issues.push({ level: 'warning', path: `exercises[${i}].equipment`, message: `${def!.name.en}: machine not identified. Loads on different machines are not comparable — select or create the equipment instance.` });
    }
    if (eq.id && loc.id) {
      const e = data.equipment.find((x) => x.id === eq.id);
      if (e?.locationId && e.locationId !== loc.id) issues.push({ level: 'warning', path: `exercises[${i}].equipment`, message: `Equipment "${e.name}" belongs to a different gym than this workout.` });
    }

    const sets: WorkoutSet[] = [];
    for (const s of ex.sets) {
      const n = s.count ?? 1;
      for (let k = 0; k < n; k++) {
        const rir = s.rir ?? null;
        sets.push({
          id: uid('s'),
          type: s.type,
          weightKg: s.weight_kg,
          loadMode: s.load_mode,
          reps: s.reps,
          rir,
          rirSource: s.rir_source ?? (rir != null ? 'reported' : 'unknown'),
          toFailure: s.to_failure,
          rom: s.rom ?? ex.variation?.rom ?? undefined,
          techniqueOk: s.technique_ok,
          restSecBefore: s.rest_before_sec ?? (sets.length > 0 && ex.rest_between_sets_sec != null ? ex.rest_between_sets_sec : null),
          restSource: s.rest_before_sec != null || ex.rest_between_sets_sec != null ? 'reported' : undefined,
          notes: s.notes,
        });
      }
    }
    sets.forEach((s, k) => {
      if (s.type !== 'warmup' && s.reps == null) issues.push({ level: 'warning', path: `exercises[${i}].sets[${k}]`, message: 'Reps missing — set kept, but its stimulus is uncertain.' });
      if (s.rir != null && s.rir > 5 && s.type === 'working') issues.push({ level: 'info', path: `exercises[${i}].sets[${k}]`, message: `RIR ${s.rir} is far from failure — counts as little or no effective volume. Was it a warm-up?` });
    });
    if (sets.every((s) => s.rir == null) && sets.some((s) => s.type !== 'warmup')) {
      issues.push({ level: 'info', path: `exercises[${i}]`, message: 'No RIR recorded — effective volume will be marked uncertain.' });
    }

    // Plausibility vs history on the same equipment.
    if (exerciseId && eq.id) {
      const prevTop = lastTopWeight(data.workouts, exerciseId, eq.id);
      const top = Math.max(0, ...sets.filter((s) => s.type === 'working').map((s) => s.weightKg ?? 0));
      if (prevTop && top && (top > prevTop * 1.3 || top < prevTop * 0.6)) {
        issues.push({ level: 'warning', path: `exercises[${i}]`, message: `Top load ${top} kg differs a lot from last time on this machine (${prevTop} kg). Typo, different machine, or per-side vs total?` });
      }
    }

    exercises.push({
      id: uid('we'),
      order: i,
      exerciseId: exerciseId ?? `unresolved:${ex.exercise_name_raw ?? ex.exercise_id ?? i}`,
      exerciseNameRaw: ex.exercise_name_raw ?? undefined,
      exerciseConfidence: exConf,
      equipmentId: eq.id,
      equipmentConfidence: eq.id ? (ex.equipment?.confidence ?? eq.conf) : 'unknown',
      variation: ex.variation ? {
        benchAngleDeg: ex.variation.bench_angle_deg ?? null, grip: ex.variation.grip ?? null, gripWidth: ex.variation.grip_width ?? null,
        stance: ex.variation.stance ?? null, rom: ex.variation.rom ?? null, unilateral: ex.variation.unilateral ?? null, notes: ex.variation.notes ?? null,
      } : undefined,
      settings: ex.settings ? Object.fromEntries(Object.entries(ex.settings).map(([k, v]) => [k, String(v)])) : undefined,
      sets,
      restAfterSec: ex.rest_after_sec ?? null,
      notes: ex.notes,
    });
    resolutions.push({
      index: i,
      rawName: ex.exercise_name_raw ?? ex.exercise_id ?? '',
      exerciseId,
      exerciseSuggestions: suggestions,
      exerciseConfidence: exConf,
      equipmentId: eq.id,
      equipmentSuggestions: eq.suggestions,
      equipmentConfidence: eq.id ? eq.conf : 'unknown',
      equipmentHint: eqHint ? { name: eqHint.name_hint, manufacturer: eqHint.manufacturer, model: eqHint.model, kind: eqHint.kind } : null,
    });
  });

  const soreness = input.session?.soreness as Partial<Record<MuscleId, number>> | undefined;
  const workout: Workout = {
    id: uid('w'),
    schemaVersion: 1,
    date: input.date,
    startTime: input.start_time ?? null,
    endTime: input.end_time ?? null,
    durationMin: input.duration_min ?? null,
    locationId: loc.id,
    locationConfidence,
    exercises,
    wellness: input.session ? {
      fatigue: input.session.fatigue_1_5 ?? null, energy: input.session.energy_1_5 ?? null, sleepHours: input.session.sleep_hours ?? null,
      sessionRpe: input.session.session_rpe ?? null, soreness,
    } : undefined,
    notes: [input.notes, input.session?.notes].filter(Boolean).join('\n') || undefined,
    source,
    rawInput: input.raw_input,
    uncertainties: input.uncertainties,
    clientRef: input.client_ref,
    createdAt: now,
    updatedAt: now,
  };
  const hash = await workoutHash(workout);
  const dupByHash = data.imports.find((i) => i.hash === hash)?.workoutId ?? data.workouts.find((w) => w.importHash === hash)?.id ?? null;
  const dupByRef = input.client_ref ? data.workouts.find((w) => w.clientRef === input.client_ref)?.id ?? null : null;
  const duplicateOf = dupByHash ?? dupByRef;
  if (duplicateOf) issues.unshift({ level: 'error', path: '(root)', message: 'This workout has already been imported (identical content or client_ref). Import blocked to prevent duplicates.' });
  else {
    const sameDay = data.workouts.filter((w) => w.date === input.date && (w.locationId ?? null) === (loc.id ?? null));
    if (sameDay.length) issues.push({ level: 'warning', path: 'date', message: `You already have ${sameDay.length} workout(s) on ${input.date} at this location. Make sure this is not the same session.` });
  }
  workout.importHash = hash;
  return { key: uid('draft'), input, workout, locationSuggestions: loc.suggestions, locationHint, exercises: resolutions, issues, hash, duplicateOf };
}

function lastTopWeight(workouts: Workout[], exerciseId: string, equipmentId: string): number | null {
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const w of sorted) for (const e of w.exercises) {
    if (e.exerciseId === exerciseId && e.equipmentId === equipmentId) {
      const tops = e.sets.filter((s) => s.type === 'working').map((s) => s.weightKg ?? 0);
      if (tops.length) return Math.max(...tops);
    }
  }
  return null;
}

/** Blocking problems that must be resolved before saving. */
export function draftBlockers(d: ImportDraft): string[] {
  const out: string[] = [];
  if (d.duplicateOf) out.push('Duplicate workout');
  d.workout.exercises.forEach((e, i) => {
    if (e.exerciseId.startsWith('unresolved:')) out.push(`Exercise ${i + 1} is not matched to the library`);
  });
  return out;
}

// ---------------------------------------------------------------- Export

export function workoutToExport(w: Workout, includeRaw = false): WorkoutInT {
  return {
    client_ref: w.clientRef ?? w.id,
    date: w.date,
    start_time: w.startTime ?? null,
    end_time: w.endTime ?? null,
    duration_min: w.durationMin ?? null,
    location: { location_id: w.locationId, confidence: w.locationConfidence },
    exercises: w.exercises.map((e) => ({
      exercise_id: e.exerciseId,
      exercise_name_raw: e.exerciseNameRaw ?? null,
      exercise_confidence: e.exerciseConfidence,
      equipment: { equipment_id: e.equipmentId, confidence: e.equipmentConfidence },
      variation: e.variation ? {
        bench_angle_deg: e.variation.benchAngleDeg ?? null, grip: e.variation.grip ?? null, grip_width: e.variation.gripWidth ?? null,
        stance: e.variation.stance ?? null, rom: e.variation.rom ?? null, unilateral: e.variation.unilateral ?? null, notes: e.variation.notes ?? null,
      } : undefined,
      settings: e.settings,
      rest_after_sec: e.restAfterSec ?? null,
      notes: e.notes,
      sets: e.sets.filter((s) => !s.planned).map((s) => ({
        type: s.type, weight_kg: s.weightKg, load_mode: s.loadMode, reps: s.reps, rir: s.rir, rir_source: s.rirSource,
        to_failure: s.toFailure, rest_before_sec: s.restSecBefore, rom: s.rom, technique_ok: s.techniqueOk, notes: s.notes,
      })),
    })),
    notes: w.notes,
    raw_input: includeRaw ? w.rawInput : undefined,
    uncertainties: w.uncertainties,
  };
}
