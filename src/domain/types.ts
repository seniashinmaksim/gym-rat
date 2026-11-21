// Core domain model. Every entity here is stored ENCRYPTED in IndexedDB
// (see src/lib/db.ts). Nothing in this file contains personal data.

export const MUSCLE_IDS = [
  'chest',
  'upper_chest',
  'lower_chest',
  'lats',
  'upper_back',
  'traps',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'spinal_erectors',
  'adductors',
] as const;
export type MuscleId = (typeof MUSCLE_IDS)[number];

/** Regional emphasis areas are NOT independent muscles (e.g. upper chest = clavicular pec major). */
export type RegionId = 'upper_chest' | 'lower_chest';

export type Confidence = 'confirmed' | 'probable' | 'uncertain' | 'unknown';
export type TargetConfidence = 'low' | 'moderate' | 'high';

export type SetType = 'warmup' | 'working' | 'drop';
export type RirSource = 'reported' | 'inferred' | 'unknown';
export type Rom = 'full' | 'lengthened_partial' | 'partial';
export type LoadMode = 'total' | 'per_side' | 'bodyweight_plus' | 'assisted';
export type RestSource = 'timer' | 'manual' | 'reported' | 'estimated';

export interface WorkoutSet {
  id: string;
  type: SetType;
  /** Load as entered on THIS equipment. Never normalized across machines. */
  weightKg: number | null;
  loadMode: LoadMode;
  reps: number | null;
  rir: number | null;
  rirSource: RirSource;
  toFailure?: boolean;
  rom?: Rom;
  techniqueOk?: boolean;
  /** Rest taken BEFORE this set (seconds). null = unknown. */
  restSecBefore: number | null;
  restSource?: RestSource;
  completedAt?: string; // ISO timestamp, set by the live logger
  /**
   * Live logger only: a pre-filled set that has not been performed yet. Planned sets are
   * ignored by every calculation until the owner ticks them (✓), so suggestions never
   * inflate the weekly numbers.
   */
  planned?: boolean;
  notes?: string;
}

export interface Variation {
  benchAngleDeg?: number | null;
  grip?: string | null; // pronated / supinated / neutral / mixed
  gripWidth?: string | null; // narrow / shoulder / wide
  stance?: string | null;
  rom?: Rom | null;
  unilateral?: boolean | null;
  notes?: string | null;
}

export interface WorkoutExercise {
  id: string;
  order: number;
  exerciseId: string;
  exerciseNameRaw?: string;
  exerciseConfidence: Confidence;
  equipmentId: string | null;
  equipmentConfidence: Confidence;
  variation?: Variation;
  /** Machine settings used this session (seat height, pad position...). */
  settings?: Record<string, string>;
  sets: WorkoutSet[];
  restAfterSec?: number | null;
  startedAt?: string;
  notes?: string;
}

export interface SessionWellness {
  fatigue?: number | null; // 1 (fresh) .. 5 (exhausted)
  energy?: number | null; // 1 (very low) .. 5 (excellent)
  sleepHours?: number | null;
  soreness?: Partial<Record<MuscleId, number>>; // 0 none .. 4 severe
  sessionRpe?: number | null;
}

export type WorkoutSource = 'manual' | 'live' | 'claude_import' | 'json_import' | 'quick_text';

export interface Workout {
  id: string;
  schemaVersion: number;
  date: string; // YYYY-MM-DD in the user's training timezone
  startTime?: string | null; // HH:mm
  endTime?: string | null; // HH:mm
  durationMin?: number | null;
  locationId: string | null;
  locationConfidence: Confidence;
  exercises: WorkoutExercise[];
  wellness?: SessionWellness;
  notes?: string;
  source: WorkoutSource;
  /** Original natural-language message. Stored only inside encrypted storage. */
  rawInput?: string;
  uncertainties?: string[];
  importHash?: string;
  clientRef?: string;
  blockId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MovementPattern =
  | 'horizontal_push'
  | 'incline_push'
  | 'vertical_push'
  | 'chest_fly'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'shoulder_abduction'
  | 'rear_delt'
  | 'shrug'
  | 'elbow_flexion'
  | 'elbow_extension'
  | 'wrist'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'knee_extension'
  | 'knee_flexion'
  | 'hip_extension'
  | 'hip_adduction'
  | 'hip_abduction'
  | 'calf'
  | 'core'
  | 'back_extension'
  | 'carry'
  | 'other';

export type EquipmentKind =
  | 'machine'
  | 'plate_loaded'
  | 'cable'
  | 'smith'
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'bodyweight'
  | 'band'
  | 'other';

export interface ExerciseDef {
  id: string;
  name: { en: string; ru: string };
  aliases: string[];
  pattern: MovementPattern;
  category: 'compound' | 'isolation';
  equipmentKind: EquipmentKind;
  /** Fractional set coefficients. 1.0 direct, 0.5 significant secondary, 0–0.25 minor. */
  contributions: Partial<Record<MuscleId, number>>;
  /** Regional emphasis of pec major. Not added to any total. */
  regionEmphasis?: Partial<Record<RegionId, number>>;
  /** Bench-angle sensitive pressing / flys: coefficients adapt to recorded angle. */
  angleSensitive?: boolean;
  repRange: [number, number];
  defaultRestSec: number;
  biomechanics: string;
  custom?: boolean;
}

/** User edits to a seed exercise (stored encrypted, applied on top of the seed). */
export interface ExerciseOverride {
  id: string; // exercise id
  contributions?: Partial<Record<MuscleId, number>>;
  regionEmphasis?: Partial<Record<RegionId, number>>;
  repRange?: [number, number];
  targetRir?: number;
  defaultRestSec?: number;
  notes?: string;
  updatedAt: string;
}

export interface Location {
  id: string;
  name: string;
  address?: string;
  notes?: string;
  photoIds: string[];
  createdAt: string;
}

export interface Equipment {
  id: string;
  locationId: string | null;
  name: string;
  kind: EquipmentKind;
  manufacturer?: string | null;
  model?: string | null;
  identified: boolean;
  /** Available load jumps on THIS instance, e.g. [5] for a 5 kg stack, [1.25, 2.5] for plates. */
  incrementsKg: number[];
  minKg?: number | null;
  maxKg?: number | null;
  stackNotes?: string;
  /** Persistent personal settings, e.g. { seat: "4", backPad: "2" }. */
  settings: Record<string, string>;
  exerciseIds: string[];
  photoIds: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Photo {
  id: string;
  kind: 'equipment' | 'location' | 'progress';
  ownerId?: string | null;
  mime: string;
  width?: number;
  height?: number;
  takenAt: string;
  caption?: string;
  pose?: 'front' | 'side' | 'back' | 'other';
}

export interface BodyMeasurement {
  id: string;
  date: string;
  weightKg?: number | null;
  waistCm?: number | null;
  chestCm?: number | null;
  shouldersCm?: number | null;
  armsCm?: number | null;
  forearmsCm?: number | null;
  thighsCm?: number | null;
  calvesCm?: number | null;
  photoIds: string[];
  notes?: string;
}

export interface DailyLog {
  id: string; // = date
  date: string;
  sleepHours?: number | null;
  sleepQuality?: number | null; // 1..5
  energy?: number | null; // 1..5
  fatigue?: number | null; // 1..5
  soreness?: Partial<Record<MuscleId, number>>; // 0..4
  proteinG?: number | null;
  calories?: number | null;
  creatineG?: number | null;
  wheyServings?: number | null;
  notes?: string;
}

export interface TrainingBlock {
  id: string;
  name: string;
  startDate: string;
  endDate?: string | null;
  plannedWeeks: number;
  focus?: string;
  kind: 'accumulation' | 'maintenance' | 'deload' | 'specialization' | 'other';
  notes?: string;
}

export interface TargetOverride {
  min: number;
  preferred: number;
  max: number;
  note?: string;
}

export type MusclePriority = 'high' | 'normal' | 'maintain';

export interface QualityModel {
  /** Credit by RIR value. Index = RIR (0..), last value applies to all higher RIR. */
  rirCredit: number[];
  unknownRirCredit: number;
  dropSetCredit: number;
  partialRomCredit: number;
  lengthenedPartialCredit: number;
  compromisedTechniqueCredit: number;
  lowRepThreshold: number;
  lowRepCredit: number;
  minRepsForCredit: number;
  /** Effective sets per muscle per SESSION above which extra sets get tapered credit. */
  sessionCreditCap: number;
  /** Multiplier for effective volume above `sessionCreditCap` in one session. */
  beyondSessionCapCredit: number;
}

export interface Settings {
  id: 'settings';
  timezone: string;
  weekStartsOn: number; // 0 = Sunday, 1 = Monday ...
  autoLockMinutes: number;
  theme: 'system' | 'dark' | 'light';
  exerciseNames: 'en' | 'ru' | 'both';
  experience: 'novice' | 'intermediate' | 'advanced';
  defaultTargetRir: number;
  significantStimulusSets: number;
  perSessionSetCap: number;
  quality: QualityModel;
  targetOverrides: Partial<Record<MuscleId, TargetOverride>>;
  priorities: Partial<Record<MuscleId, MusclePriority>>;
  learning: { startDate: string | null; endedOn: string | null; lengthDays: number };
  showOptionalTracking: boolean;
}

export interface ImportLogEntry {
  id: string;
  hash: string;
  workoutId: string;
  importedAt: string;
  source: WorkoutSource;
}

/** Frozen copy of a finished week's numbers so later target changes don't rewrite history. */
export interface WeeklySnapshot {
  id: string; // week start date
  weekStart: string;
  weekEnd: string;
  createdAt: string;
  targets: Partial<Record<MuscleId, { min: number; preferred: number; max: number; confidence: TargetConfidence }>>;
  effective: Partial<Record<MuscleId, number>>;
  sessions: number;
  coefficientNote: string;
}
