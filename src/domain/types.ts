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
  /**
   * Who decided `type` (Part 6): 'auto' = the app tagged a warm-up from the numbers (re-checked whenever the
   * exercise's sets change); 'owner' = the owner set or corrected the tag (never changed automatically).
   * Absent = recorded before Part 6 or by an import (never changed automatically).
   */
  typeSource?: 'auto' | 'owner';
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
  /**
   * Unilateral exercises logged per side. A left set and a right set (paired in order)
   * together count as ONE set for the muscle; an unpaired side counts as one set.
   */
  side?: Side;
  // ---- Per-set feedback (all optional; never invented for older sets) ----
  /** The one-tap answer to "How did this set feel?" (raw input, kept as entered). */
  feel?: SetFeel;
  /** Perceived effort — separate from RIR (RIR is never derived from it). */
  effort?: Effort;
  /** Was the load on the bar/stack the one intended? */
  weightAccuracy?: WeightAccuracy;
  /** Technique quality. `techniqueOk: false` (older field) means "compromised". */
  technique?: Technique;
  /** Pain or unusual discomfort (not ordinary muscular effort or burning). */
  pain?: { area: string; note?: string } | null;
  /** The load the owner meant to use, when a wrong weight was picked by accident. */
  intendedWeightKg?: number | null;
  /** Audit trail: corrections made after the workout was finished (original → corrected). */
  corrections?: SetCorrection[];
  // ---- Failure status (v1.3; optional, never invented for older sets) ----
  /**
   * "Did you reach muscular failure?" — kept SEPARATE from RIR (RIR is never overwritten by it).
   * muscular = could not complete another full rep with proper technique; none = stopped
   * voluntarily with at least one more rep possible; uncertain = not sure. Undefined = not recorded.
   * The older `toFailure` flag (the "Fail" chip / import `to_failure`) still means RIR 0 was reported.
   */
  failure?: FailureStatus;
  /** The set ended because technique broke down (technical failure). undefined = unknown. */
  technicalFailure?: boolean;
  failureNote?: string;
  /** Optional "did you follow the recommended execution?" answer (technique guidance only, never volume credit). */
  execution?: ExecutionFeedback;
  /**
   * What the prescription engine suggested for this set when it was planned. Stored separately so
   * prescribed and performed values are never mixed; calculations always use the performed values.
   */
  prescribed?: SetPrescription;
  notes?: string;
}

export type FailureStatus = 'muscular' | 'none' | 'uncertain';
export type ExecutionFeedback = 'followed' | 'ecc_too_fast' | 'ecc_too_slow' | 'momentum' | 'lost_concentric_control' | 'short_rom';
export interface SetPrescription {
  weightKg: number | null;
  repsMin: number;
  repsMax: number;
  rirMin: number;
  rirMax: number;
  restSec?: number | null;
  /** 'warmup' sets are prescribed too (never counted as volume). */
  kind: 'warmup' | 'working';
  /** Engine version that produced it, for later audits. */
  engine: string;
}

export type Side = 'left' | 'right';
export type SetFeel = 'too_easy' | 'bit_easy' | 'just_right' | 'hard_good' | 'too_heavy_form' | 'wrong_light' | 'wrong_heavy' | 'pain';
export type Effort = 'very_easy' | 'easy' | 'appropriate' | 'hard' | 'near_max';
export type WeightAccuracy = 'correct' | 'too_light' | 'too_heavy' | 'unknown';
export type Technique = 'good' | 'slightly_degraded' | 'compromised' | 'failed' | 'not_assessed';
export interface SetCorrection {
  at: string; // ISO timestamp of the correction
  field: 'weightKg' | 'reps' | 'rir' | 'type' | 'side' | 'failure' | 'technicalFailure' | 'toFailure';
  from: number | string | boolean | null;
  to: number | string | boolean | null;
}

export interface Variation {
  benchAngleDeg?: number | null;
  grip?: string | null; // pronated / supinated / neutral / mixed
  gripWidth?: string | null; // narrow / shoulder / wide
  stance?: string | null;
  rom?: Rom | null;
  /** One limb at a time. Sets may then carry `side`. */
  unilateral?: boolean | null;
  /** Cable attachment: straight_bar / rope / v_bar / single_handle / cuff. */
  attachment?: string | null;
  /** Body position: standing / seated. */
  position?: string | null;
  /** Dumbbell work: simultaneous / alternating. */
  execution?: string | null;
  /** Hanging raises: straight / bent knees. */
  legs?: string | null;
  /** Pull-ups (v1.4): bodyweight only, or weighted with a dip belt (weightKg = belt weight). Separate histories. */
  loading?: 'bodyweight' | 'weighted' | null;
  /** Squats: above_parallel / parallel / below_parallel. Recorded, not used for coefficients. */
  depth?: string | null;
  /** Back squat: high_bar / low_bar. */
  barPosition?: string | null;
  notes?: string | null;
}

/** Variation controls the logger offers for an exercise (beyond grip, grip width and ROM, which are always available). */
export type VariationField = 'angle' | 'attachment' | 'position' | 'execution' | 'unilateral' | 'legs' | 'depth' | 'barPosition' | 'stance' | 'grip' | 'gripWidth' | 'loading';

export interface WorkoutExercise {
  /**
   * Part 8: the owner chose "Keep today" on a forward warning for this exercise: which upcoming exercise it was about
   * (and on which day). Used only to learn whether that session held up; it never changes any number.
   */
  forwardKept?: { affectsExerciseId: string; date: string; muscle: MuscleId };
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
  /** Live logger: the owner tapped "Finish exercise" (card collapses; can be reopened). */
  doneAt?: string;
  /** Live logger: the owner marked the exercise as skipped (planned sets are dropped at finish). */
  skipped?: boolean;
  /** Live logger: "Later" — postponed (e.g. machine occupied); still pending, comes back at the end. */
  deferredAt?: string;
  /** Exercise-choice assistant (Part 5): the assessment shown when it was added and what the owner did. */
  choice?: ExerciseChoiceRecord;
  /** Index of the generated-plan item this exercise came from (Part 5); absent = added by hand. */
  planItem?: number;
  /**
   * Today's target for this exercise (Part 6): shown as one line; no set rows are created from it. A set
   * exists only once it was performed and logged.
   */
  target?: ExerciseTarget;
  /** Rest-timer length chosen for this exercise in this session (−15 / +15 sticks for the rest of the session). */
  restTargetSec?: number;
  /**
   * Training mode: when NEXT SET was pressed after the last logged set of this exercise. The rest of the next
   * logged set is measured up to this moment (instead of estimating the set's own duration). Used once, then cleared.
   */
  restEndedAt?: string;
  /**
   * How many working sets the APP last planned for this exercise. A re-assessment may only replace planned sets
   * while the card still has exactly this many working sets (the owner added / removed / edited nothing).
   */
  plannedCount?: number;
  notes?: string;
  /** Offers the owner answered "Keep the plan" (key: set id + change + weight), so they are not asked again. */
  offerKept?: string[];
}

/** What the exercise-choice assistant said when the exercise was picked, and what the owner did (never blocks). */
/** Today's target for one exercise in a live session (a plan, never counted). */
export interface ExerciseTarget {
  sets: number;
  weightKg: number | null;
  /** Rep range per set (the last entry repeats for further sets). */
  reps: { min: number; max: number }[];
  /** Engine that produced it. */
  engine: string;
  /** The owner changed it before starting: never re-planned automatically. */
  edited?: boolean;
  /** Target reps in reserve per set (the last entry repeats). Older targets have none. */
  rir?: { min: number; max: number }[];
  /** The remaining sets were changed during the exercise from what was done (offered, the owner tapped Use). */
  adapted?: { change: 'add_load' | 'add_reps' | 'reduce'; fromKg: number | null; why: string; at: string };
}

export interface ExerciseChoiceRecord {
  status: 'good' | 'acceptable' | 'reconsider';
  reasonKind: string | null;
  /** Exercise id of the alternative that was offered (if any). */
  alternativeOffered?: string | null;
  /** continued = picked it anyway; alternative = took the offered alternative (this exercise IS the alternative). */
  followed: 'continued' | 'alternative';
  /** When this is the alternative: the exercise originally picked. */
  replacedExerciseId?: string;
  at: string;
}

/** Snapshot of a generated plan (Part 5), stored separately from what was actually performed. */
export interface GeneratedPlanSnapshot {
  engine: string;
  createdAt: string;
  mode: 'learning' | 'provisional' | 'full';
  items: {
    exerciseId: string;
    equipmentId: string | null;
    variation?: Variation;
    order: number;
    calibration: 'calibrated' | 'provisional' | 'needs_data';
    sets: number;
    weightKg: number | null;
    repsMin: number;
    repsMax: number;
  }[];
}

export type PlanDecisionAction = 'replaced' | 'skipped' | 'later' | 'reordered' | 'busy' | 'edited';
export type PlanDecisionReason = 'busy' | 'time' | 'preference' | 'pain';
/** One owner decision about the plan (Part 5). Reason "busy" (equipment occupied) never counts as a preference. */
export interface PlanDecision {
  action: PlanDecisionAction;
  exerciseId: string;
  equipmentId?: string | null;
  /** For replaced: what was used instead. */
  replacement?: { exerciseId: string; equipmentId: string | null } | null;
  reason?: PlanDecisionReason | null;
  at: string;
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
  /** Set when a live session is finished (even if no end time could be filled in, e.g. a past date). */
  finishedAt?: string | null;
  /** Audit notes for corrections made after the workout was finished (e.g. a removed set). */
  audit?: { at: string; note: string }[];
  /** Exercise-choice warnings the owner already answered in this session (not repeated unless inputs change). */
  choiceAcks?: { key: string; at: string }[];
  /** The generated plan this session started from (Part 5) — kept separate from the performed exercises. */
  generated?: GeneratedPlanSnapshot;
  /** Decisions about the plan during the session (later / reorder / busy / replace / skip). */
  planDecisions?: PlanDecision[];
  /** Equipment marked "busy" (temporarily unavailable) during this session. */
  busyEquipment?: { equipmentId: string; at: string }[];
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

export type FatigueCost = 'high' | 'moderate' | 'low';

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
  /** Machine/bench setting names the logger offers for this exercise (values are remembered per equipment instance). */
  settingTemplate?: string[];
  /** Variation controls shown in the logger's Setup panel. */
  variationFields?: VariationField[];
  /** Default variation for a NEW entry of this exercise (e.g. standing single-leg curl → unilateral). */
  defaultVariation?: Partial<Variation>;
  /** Systemic / local fatigue cost of a typical hard set (Part 5). Absent = derived (see fatigueCostOf). */
  fatigueCost?: FatigueCost;
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
  /**
   * Dumbbell / kettlebell jumps available at THIS gym (e.g. [2.5] or [1, 2]); used for load steps and
   * prescriptions of free-weight exercises without their own equipment record. Empty/undefined = app default.
   */
  freeWeightIncrementsKg?: number[];
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
  /** Empty bar / sled weight if KNOWN (barbells, EZ bars, Smith). Never assumed; null = unknown. */
  barWeightKg?: number | null;
  /** Persistent personal settings, e.g. { seat: "4", backPad: "2" }. */
  settings: Record<string, string>;
  exerciseIds: string[];
  photoIds: string[];
  notes?: string;
  /** Starred in pickers (shown first). */
  favorite?: boolean;
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
  /** Date the measurement was TAKEN (training timezone). */
  date: string;
  /** Local time the measurement was taken (HH:mm). Older entries have none (date only). */
  time?: string | null;
  /** When it was typed into the app (ISO) — kept separate; analysis always uses date + time. */
  enteredAt?: string;
  /** Optional measuring condition. */
  condition?: 'morning_fasted' | 'after_breakfast' | 'before_workout' | 'after_workout' | 'evening' | null;
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
  /** When no RIR is logged, estimate effort from the owner's set feedback (default on). */
  useFeelWhenNoRir?: boolean;
  /**
   * Cross-check effort against the logged numbers (Part 6): ramp sets far from failure earn less or no credit,
   * and a reported effort that the numbers clearly contradict is credited by the numbers. Absent = on.
   */
  useNumbersCheck?: boolean;
}

/**
 * An exercise the owner moved to a later day (Part 8). Never a skip, never done, never deleted silently: it stays
 * planned until it is performed after `fromDate` or the owner cancels the move.
 */
export interface PlannedMove {
  id: string;
  exerciseId: string;
  equipmentId: string | null;
  variation?: Variation;
  sets: number;
  /** The day it was moved away from. */
  fromDate: string;
  /** The day it is planned for. */
  date: string;
  /** The short finding that led to the move (as shown then). */
  reason: string;
  createdAt: string;
}

export interface Settings {
  /** Exercises moved to a later day (Part 8). */
  plannedMoves?: PlannedMove[];
  /** Formula revision the stored settings were migrated to (7 = Part 7, 2026-11-24). */
  formulaRevision?: number;
  /** Week start (YYYY-MM-DD) for which the owner dismissed the extra-session suggestion ("not this week"). */
  extraSessionDismissedWeek?: string | null;
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
  /** Rest-timer length started by every logged set, seconds (Part 6; absent = 150). */
  restDefaultSec?: number;
  /** App language (Part 6; mirrored outside the vault so the lock screen can use it). */
  language?: 'en' | 'ru';
  /** Accent of the training mode: ember (default), volt or ice. */
  trainAccent?: 'ember' | 'volt' | 'ice';
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
