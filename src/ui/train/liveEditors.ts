import type { Workout } from '../../domain/types';

/**
 * The mounted editor per workout id (training mode or the detailed editor): an Undo tapped after the
 * workout was closed and re-opened goes to the one that is open now.
 */
export type WorkoutUpdate = (fn: (w: Workout) => Workout, opts?: { now?: boolean }) => void;
export const liveEditors = new Map<string, WorkoutUpdate>();
