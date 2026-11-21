import type {
  BodyMeasurement, DailyLog, Equipment, ExerciseDef, ExerciseOverride, ImportLogEntry, Location, Photo,
  Settings, TrainingBlock, WeeklySnapshot, Workout,
} from './types';

/** Everything decrypted into memory while the vault is unlocked. */
export interface AppData {
  settings: Settings;
  workouts: Workout[];
  locations: Location[];
  equipment: Equipment[];
  exerciseOverrides: ExerciseOverride[];
  customExercises: ExerciseDef[];
  photos: Photo[];
  body: BodyMeasurement[];
  daily: DailyLog[];
  blocks: TrainingBlock[];
  imports: ImportLogEntry[];
  snapshots: WeeklySnapshot[];
}
