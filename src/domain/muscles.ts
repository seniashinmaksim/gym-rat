import type { MuscleId, RegionId } from './types';

export interface MuscleMeta {
  id: MuscleId;
  name: { en: string; ru: string };
  group: 'push' | 'pull' | 'arms' | 'legs' | 'core';
  size: 'large' | 'medium' | 'small';
  /** Regional emphasis areas have no independent volume requirement. */
  isRegion: boolean;
  parent?: MuscleId;
  /**
   * Provisional weekly EFFECTIVE-set reference range (fractional, quality-adjusted).
   * These are starting points informed by the volume dose-response literature
   * (≈10+ sets/muscle/week is a useful reference with diminishing returns), adjusted
   * for how much indirect work a muscle typically receives. They are NOT quotas.
   */
  reference: { min: number; preferred: number; max: number } | null;
  referenceNote: string;
}

export const MUSCLES: MuscleMeta[] = [
  {
    id: 'chest', name: { en: 'Chest', ru: 'Грудные' }, group: 'push', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 12, max: 18 },
    referenceNote: 'Large muscle, mostly trained directly by presses and flys.',
  },
  {
    id: 'upper_chest', name: { en: 'Upper chest emphasis', ru: 'Верх груди (акцент)' }, group: 'push', size: 'medium',
    isRegion: true, parent: 'chest', reference: null,
    referenceNote: 'Clavicular region of pectoralis major. Shown as a share of chest work; no independent target.',
  },
  {
    id: 'lower_chest', name: { en: 'Lower chest emphasis', ru: 'Низ груди (акцент)' }, group: 'push', size: 'medium',
    isRegion: true, parent: 'chest', reference: null,
    referenceNote: 'Sternocostal/abdominal region of pectoralis major. Shown as a share of chest work; no independent target.',
  },
  {
    id: 'lats', name: { en: 'Lats', ru: 'Широчайшие' }, group: 'pull', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 12, max: 18 },
    referenceNote: 'Trained by vertical pulls and many rows.',
  },
  {
    id: 'upper_back', name: { en: 'Upper back', ru: 'Верх спины' }, group: 'pull', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: 'Rhomboids / mid traps / teres. Receives substantial work from rows and pulldowns.',
  },
  {
    id: 'traps', name: { en: 'Traps', ru: 'Трапеции' }, group: 'pull', size: 'medium', isRegion: false,
    reference: { min: 4, preferred: 6, max: 12 },
    referenceNote: 'Often receives meaningful indirect work from rows, deadlifts and carries.',
  },
  {
    id: 'front_delts', name: { en: 'Front delts', ru: 'Передние дельты' }, group: 'push', size: 'small', isRegion: false,
    reference: { min: 4, preferred: 6, max: 12 },
    referenceNote: 'Heavily involved in all pressing; direct work is frequently unnecessary.',
  },
  {
    id: 'side_delts', name: { en: 'Side delts', ru: 'Средние дельты' }, group: 'push', size: 'small', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: 'Gets little from pressing; relies on lateral raises and similar.',
  },
  {
    id: 'rear_delts', name: { en: 'Rear delts', ru: 'Задние дельты' }, group: 'pull', size: 'small', isRegion: false,
    reference: { min: 6, preferred: 8, max: 14 },
    referenceNote: 'Receives indirect work from wide-elbow rows and pulls.',
  },
  {
    id: 'biceps', name: { en: 'Biceps', ru: 'Бицепс' }, group: 'arms', size: 'small', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: 'Substantial indirect work from pulldowns and rows.',
  },
  {
    id: 'triceps', name: { en: 'Triceps', ru: 'Трицепс' }, group: 'arms', size: 'medium', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: 'Substantial indirect work from presses.',
  },
  {
    id: 'forearms', name: { en: 'Forearms', ru: 'Предплечья' }, group: 'arms', size: 'small', isRegion: false,
    reference: { min: 0, preferred: 4, max: 10 },
    referenceNote: 'Gripping provides some stimulus; direct work optional.',
  },
  {
    id: 'quads', name: { en: 'Quadriceps', ru: 'Квадрицепсы' }, group: 'legs', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 12, max: 18 },
    referenceNote: 'Squats, presses, lunges and extensions.',
  },
  {
    id: 'hamstrings', name: { en: 'Hamstrings', ru: 'Бицепс бедра' }, group: 'legs', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: 'Needs both hip-hinge and knee-flexion work for full development.',
  },
  {
    id: 'glutes', name: { en: 'Glutes', ru: 'Ягодичные' }, group: 'legs', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: 'Substantial indirect work from squats, lunges and hinges.',
  },
  {
    id: 'calves', name: { en: 'Calves', ru: 'Икры' }, group: 'legs', size: 'small', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: 'Little indirect work from other lifts.',
  },
  {
    id: 'abs', name: { en: 'Abs', ru: 'Пресс' }, group: 'core', size: 'medium', isRegion: false,
    reference: { min: 3, preferred: 6, max: 12 },
    referenceNote: 'Some bracing stimulus from compounds; direct work for hypertrophy.',
  },
  {
    id: 'spinal_erectors', name: { en: 'Spinal erectors', ru: 'Разгибатели спины' }, group: 'core', size: 'medium', isRegion: false,
    reference: { min: 2, preferred: 4, max: 10 },
    referenceNote: 'Large indirect load from hinges, squats and rows; direct work rarely needed.',
  },
  {
    id: 'adductors', name: { en: 'Adductors', ru: 'Приводящие' }, group: 'legs', size: 'medium', isRegion: false,
    reference: { min: 3, preferred: 6, max: 12 },
    referenceNote: 'Deep squats and lunges train them substantially.',
  },
];

export const MUSCLE_BY_ID: Record<MuscleId, MuscleMeta> = Object.fromEntries(
  MUSCLES.map((m) => [m.id, m]),
) as Record<MuscleId, MuscleMeta>;

/** Muscles that carry weekly targets (regions excluded). */
export const TRACKED_MUSCLES: MuscleId[] = MUSCLES.filter((m) => !m.isRegion).map((m) => m.id);
export const REGIONS: RegionId[] = ['upper_chest', 'lower_chest'];

export function muscleName(id: MuscleId, lang: 'en' | 'ru' | 'both' = 'en'): string {
  const m = MUSCLE_BY_ID[id];
  if (!m) return id;
  if (lang === 'ru') return m.name.ru;
  if (lang === 'both') return `${m.name.en} · ${m.name.ru}`;
  return m.name.en;
}

/** Classification of a coefficient into direct / indirect for reporting. */
export function involvement(coef: number): 'direct' | 'indirect' | 'minor' | 'none' {
  if (coef >= 0.75) return 'direct';
  if (coef >= 0.4) return 'indirect';
  if (coef > 0) return 'minor';
  return 'none';
}
