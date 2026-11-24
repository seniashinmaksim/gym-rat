import type { MuscleId, RegionId } from './types';
import { L, byLang } from '../i18n/core';

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

export const MUSCLES: MuscleMeta[] = byLang(() => [
  {
    id: 'chest', name: { en: 'Chest', ru: 'Грудные' }, group: 'push', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 12, max: 18 },
    referenceNote: L('Large muscle, mostly trained directly by presses and flys.', 'Крупная мышца, в основном тренируется напрямую жимами и разводками.'),
  },
  {
    id: 'upper_chest', name: { en: 'Upper chest emphasis', ru: 'Верх груди (акцент)' }, group: 'push', size: 'medium',
    isRegion: true, parent: 'chest', reference: null,
    referenceNote: L('Clavicular region of pectoralis major. Shown as a share of chest work; no independent target.', 'Ключичная часть большой грудной мышцы. Показывается как доля работы на грудные; своей цели нет.'),
  },
  {
    id: 'lower_chest', name: { en: 'Lower chest emphasis', ru: 'Низ груди (акцент)' }, group: 'push', size: 'medium',
    isRegion: true, parent: 'chest', reference: null,
    referenceNote: L('Sternocostal/abdominal region of pectoralis major. Shown as a share of chest work; no independent target.', 'Грудино-рёберная и абдоминальная часть большой грудной мышцы. Показывается как доля работы на грудные; своей цели нет.'),
  },
  {
    id: 'lats', name: { en: 'Lats', ru: 'Широчайшие' }, group: 'pull', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 12, max: 18 },
    referenceNote: L('Trained by vertical pulls and many rows.', 'Тренируются вертикальными тягами и многими горизонтальными тягами.'),
  },
  {
    id: 'upper_back', name: { en: 'Upper back', ru: 'Верх спины' }, group: 'pull', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: L('Rhomboids / mid traps / teres. Receives substantial work from rows and pulldowns.', 'Ромбовидные / середина трапеций / круглые мышцы. Получает существенную нагрузку от горизонтальных тяг и тяг верхнего блока.'),
  },
  {
    id: 'traps', name: { en: 'Traps', ru: 'Трапеции' }, group: 'pull', size: 'medium', isRegion: false,
    reference: { min: 4, preferred: 6, max: 12 },
    referenceNote: L('Often receives meaningful indirect work from rows, deadlifts and carries.', 'Часто получают заметную косвенную нагрузку от горизонтальных тяг, становой тяги и переносок.'),
  },
  {
    id: 'front_delts', name: { en: 'Front delts', ru: 'Передние дельты' }, group: 'push', size: 'small', isRegion: false,
    reference: { min: 4, preferred: 6, max: 12 },
    referenceNote: L('Heavily involved in all pressing; direct work is frequently unnecessary.', 'Активно участвуют во всех жимах; прямая работа часто не нужна.'),
  },
  {
    id: 'side_delts', name: { en: 'Side delts', ru: 'Средние дельты' }, group: 'push', size: 'small', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: L('Gets little from pressing; relies on lateral raises and similar.', 'Мало получают от жимов; нужны махи в стороны и похожие упражнения.'),
  },
  {
    id: 'rear_delts', name: { en: 'Rear delts', ru: 'Задние дельты' }, group: 'pull', size: 'small', isRegion: false,
    reference: { min: 6, preferred: 8, max: 14 },
    referenceNote: L('Receives indirect work from wide-elbow rows and pulls.', 'Получают косвенную нагрузку от горизонтальных тяг с разведёнными локтями и других тяг.'),
  },
  {
    id: 'biceps', name: { en: 'Biceps', ru: 'Бицепс' }, group: 'arms', size: 'small', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: L('Substantial indirect work from pulldowns and rows.', 'Существенная косвенная нагрузка от тяг верхнего блока и горизонтальных тяг.'),
  },
  {
    id: 'triceps', name: { en: 'Triceps', ru: 'Трицепс' }, group: 'arms', size: 'medium', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: L('Substantial indirect work from presses.', 'Существенная косвенная нагрузка от жимов.'),
  },
  {
    id: 'forearms', name: { en: 'Forearms', ru: 'Предплечья' }, group: 'arms', size: 'small', isRegion: false,
    reference: { min: 0, preferred: 4, max: 10 },
    referenceNote: L('Gripping provides some stimulus; direct work optional.', 'Хват даёт некоторый стимул; прямая работа по желанию.'),
  },
  {
    id: 'quads', name: { en: 'Quadriceps', ru: 'Квадрицепсы' }, group: 'legs', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 12, max: 18 },
    referenceNote: L('Squats, presses, lunges and extensions.', 'Приседания, жимы ногами, выпады и разгибания ног.'),
  },
  {
    id: 'hamstrings', name: { en: 'Hamstrings', ru: 'Бицепс бедра' }, group: 'legs', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: L('Needs both hip-hinge and knee-flexion work for full development.', 'Для полного развития нужны и тяги с наклоном (разгибание бедра), и сгибания ног.'),
  },
  {
    id: 'glutes', name: { en: 'Glutes', ru: 'Ягодичные' }, group: 'legs', size: 'large', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: L('Substantial indirect work from squats, lunges and hinges.', 'Существенная косвенная нагрузка от приседаний, выпадов и тяг с наклоном.'),
  },
  {
    id: 'calves', name: { en: 'Calves', ru: 'Икры' }, group: 'legs', size: 'small', isRegion: false,
    reference: { min: 6, preferred: 10, max: 16 },
    referenceNote: L('Little indirect work from other lifts.', 'Мало косвенной нагрузки от других упражнений.'),
  },
  {
    id: 'abs', name: { en: 'Abs', ru: 'Пресс' }, group: 'core', size: 'medium', isRegion: false,
    reference: { min: 3, preferred: 6, max: 12 },
    referenceNote: L('Some bracing stimulus from compounds; direct work for hypertrophy.', 'Некоторый стимул от напряжения корпуса в многосуставных упражнениях; для гипертрофии — прямая работа.'),
  },
  {
    id: 'spinal_erectors', name: { en: 'Spinal erectors', ru: 'Разгибатели спины' }, group: 'core', size: 'medium', isRegion: false,
    reference: { min: 2, preferred: 4, max: 10 },
    referenceNote: L('Large indirect load from hinges, squats and rows; direct work rarely needed.', 'Большая косвенная нагрузка от тяг с наклоном, приседаний и горизонтальных тяг; прямая работа нужна редко.'),
  },
  {
    id: 'adductors', name: { en: 'Adductors', ru: 'Приводящие' }, group: 'legs', size: 'medium', isRegion: false,
    reference: { min: 3, preferred: 6, max: 12 },
    referenceNote: L('Deep squats and lunges train them substantially.', 'Глубокие приседания и выпады существенно их тренируют.'),
  },
]);

export const MUSCLE_BY_ID: Record<MuscleId, MuscleMeta> = byLang(() => Object.fromEntries(
  MUSCLES.map((m) => [m.id, m]),
) as Record<MuscleId, MuscleMeta>);

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
