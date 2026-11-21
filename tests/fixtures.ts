import type { AppData } from '../src/domain/appdata';
import { defaultSettings } from '../src/domain/defaults';
import type { Workout, WorkoutExercise, WorkoutSet } from '../src/domain/types';

let n = 0;
export function set(weight: number | null, reps: number | null, rir: number | null = 2, extra: Partial<WorkoutSet> = {}): WorkoutSet {
  return { id: `s${n++}`, type: 'working', weightKg: weight, loadMode: 'total', reps, rir, rirSource: rir == null ? 'unknown' : 'reported', restSecBefore: null, ...extra };
}

export function ex(exerciseId: string, sets: WorkoutSet[], equipmentId: string | null = null, extra: Partial<WorkoutExercise> = {}): WorkoutExercise {
  return { id: `e${n++}`, order: 0, exerciseId, exerciseConfidence: 'confirmed', equipmentId, equipmentConfidence: equipmentId ? 'confirmed' : 'unknown', sets, ...extra };
}

export function workout(date: string, exercises: WorkoutExercise[], extra: Partial<Workout> = {}): Workout {
  return {
    id: `w${n++}`, schemaVersion: 1, date, locationId: 'gym_a', locationConfidence: 'confirmed', exercises, source: 'manual',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', startTime: '18:00', ...extra,
  };
}

export function data(workouts: Workout[], patch: Partial<AppData> = {}): AppData {
  const settings = { ...defaultSettings(), timezone: 'UTC' };
  return {
    settings, workouts, locations: [{ id: 'gym_a', name: 'Gym A', photoIds: [], createdAt: '' }], equipment: [], exerciseOverrides: [],
    customExercises: [], photos: [], body: [], daily: [], blocks: [], imports: [], snapshots: [], ...patch,
  };
}
