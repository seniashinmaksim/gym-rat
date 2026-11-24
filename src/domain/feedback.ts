import type { Effort, SetCorrection, SetFeel, Technique, WeightAccuracy, Workout, WorkoutSet } from './types';
import { L, byLang, num, ruPlural } from '../i18n/core';

/**
 * Per-set feedback ("How did this set feel?").
 *
 * One tap stores the owner's answer (`feel`) AND three separate dimensions derived from it —
 * perceived effort, weight-selection accuracy and technique — which the owner can change.
 * The dimensions are deliberately kept apart: "very hard with good technique" and "very hard
 * because the weight was too heavy and technique broke down" are different training outcomes.
 *
 * RIR is NEVER derived from the feel. When no RIR was logged, the effort gives an ESTIMATED RIR
 * range (labelled as an estimate) — see `estimatedRirRange`.
 */

export interface FeelOption {
  id: SetFeel;
  label: string; // short chip label
  title: string; // full name
  description: string;
  effort?: Effort;
  weightAccuracy?: WeightAccuracy;
  technique?: Technique;
}

export const FEEL_OPTIONS: FeelOption[] = byLang((): FeelOption[] => [
  { id: 'too_easy', label: L('Too easy', 'Слишком легко'), title: L('Too easy', 'Слишком легко'), description: L('Weight felt clearly too light — several more reps were possible.', 'Вес был явно слишком лёгким — можно было сделать ещё несколько повторений.'), effort: 'very_easy', weightAccuracy: 'correct' },
  { id: 'bit_easy', label: L('Bit easy', 'Легковато'), title: L('A little too easy', 'Немного легко'), description: L('Comfortable; more reps in reserve than intended. The weight could probably go up.', 'Комфортно; повторов в запасе больше, чем задумано. Вес, вероятно, можно повысить.'), effort: 'easy', weightAccuracy: 'correct' },
  { id: 'just_right', label: L('Just right', 'В самый раз'), title: L('Just right', 'В самый раз'), description: L('Challenging, intended reps done, technique controlled.', 'Непросто, намеченные повторения сделаны, техника под контролем.'), effort: 'appropriate', weightAccuracy: 'correct', technique: 'good' },
  { id: 'hard_good', label: L('Hard, good form', 'Тяжело, чисто'), title: L('Very hard, but good technique', 'Очень тяжело, но техника хорошая'), description: L('Close to failure with proper technique, range of motion and control.', 'Близко к отказу при правильной технике, полной амплитуде и контроле.'), effort: 'near_max', weightAccuracy: 'correct', technique: 'good' },
  { id: 'too_heavy_form', label: L('Too heavy', 'Слишком тяжело'), title: L('Too heavy, technique compromised', 'Слишком тяжело, техника нарушена'), description: L('Reps done as best as possible, but with momentum, shortened range or other muscles compensating.', 'Повторения сделаны как получилось: с инерцией, укороченной амплитудой или с помощью других мышц.'), effort: 'hard', weightAccuracy: 'correct', technique: 'compromised' },
  { id: 'wrong_light', label: L('Wrong: light', 'Ошибка: лёгкий'), title: L('Wrong weight — too light', 'Не тот вес — слишком лёгкий'), description: L('Picked a much lighter weight than intended by accident. Saved, but not used as a progression benchmark.', 'Случайно взят вес намного легче задуманного. Подход сохранён, но для оценки прогрессии не используется.'), weightAccuracy: 'too_light' },
  { id: 'wrong_heavy', label: L('Wrong: heavy', 'Ошибка: тяжёлый'), title: L('Wrong weight — too heavy', 'Не тот вес — слишком тяжёлый'), description: L('Picked a heavier weight than intended by accident. Saved, but not used as a progression benchmark.', 'Случайно взят вес тяжелее задуманного. Подход сохранён, но для оценки прогрессии не используется.'), weightAccuracy: 'too_heavy' },
  { id: 'pain', label: L('Pain', 'Боль'), title: L('Pain or unusual discomfort', 'Боль или необычный дискомфорт'), description: L('Pain or unusual discomfort — not ordinary muscular effort or burning.', 'Боль или необычный дискомфорт — не обычное мышечное усилие или жжение.') },
]);

export const FEEL_BY_ID: Record<SetFeel, FeelOption> = byLang(() => Object.fromEntries(FEEL_OPTIONS.map((o) => [o.id, o])) as Record<SetFeel, FeelOption>);

export const EFFORT_LABEL: Record<Effort, string> = byLang(() => ({ very_easy: L('Very easy', 'Очень легко'), easy: L('Easy', 'Легко'), appropriate: L('Appropriate', 'В меру'), hard: L('Hard', 'Тяжело'), near_max: L('Near max', 'Почти предел') }));
export const ACCURACY_LABEL: Record<WeightAccuracy, string> = byLang(() => ({ correct: L('Correct weight', 'Верный вес'), too_light: L('Accidentally too light', 'Случайно слишком лёгкий'), too_heavy: L('Accidentally too heavy', 'Случайно слишком тяжёлый'), unknown: L('Unknown', 'Неизвестно') }));
export const TECHNIQUE_LABEL: Record<Technique, string> = byLang(() => ({ good: L('Good', 'Хорошая'), slightly_degraded: L('Slightly degraded', 'Немного хуже'), compromised: L('Significantly compromised', 'Заметно нарушена'), failed: L('Unable to complete correctly', 'Не удалось выполнить правильно'), not_assessed: L('Not assessed', 'Не оценена') }));
/** STORED values (a set's `pain.area`) — never translate these; show them with `painAreaLabel`. */
export const PAIN_AREAS = ['Shoulder', 'Elbow', 'Wrist', 'Neck', 'Upper back', 'Lower back', 'Hip', 'Knee', 'Ankle', 'Other'];

/** Display text of a stored pain area (free text and unknown values are shown as they are). */
export function painAreaLabel(area: string): string {
  switch (area) {
    case 'Shoulder': return L('Shoulder', 'Плечо');
    case 'Elbow': return L('Elbow', 'Локоть');
    case 'Wrist': return L('Wrist', 'Запястье');
    case 'Neck': return L('Neck', 'Шея');
    case 'Upper back': return L('Upper back', 'Верх спины');
    case 'Lower back': return L('Lower back', 'Поясница');
    case 'Hip': return L('Hip', 'Бедро');
    case 'Knee': return L('Knee', 'Колено');
    case 'Ankle': return L('Ankle', 'Голеностоп');
    case 'Other': return L('Other', 'Другое');
    default: return area;
  }
}

/**
 * The patch one tap applies. Choosing a feel replaces the derived dimensions (so switching
 * from "Just right" to "Too heavy" does not leave "good technique" behind) but never touches
 * RIR, weight or reps. Tapping the selected feel again clears the feedback.
 */
export function feelPatch(set: WorkoutSet, feel: SetFeel | null): Partial<WorkoutSet> {
  if (feel == null || set.feel === feel) {
    return { feel: undefined, effort: undefined, weightAccuracy: undefined, technique: undefined, pain: undefined, intendedWeightKg: undefined };
  }
  const o = FEEL_BY_ID[feel];
  return {
    feel,
    effort: o.effort,
    weightAccuracy: o.weightAccuracy,
    technique: o.technique,
    pain: feel === 'pain' ? { area: set.pain?.area ?? '', note: set.pain?.note } : undefined,
    intendedWeightKg: feel === 'wrong_light' || feel === 'wrong_heavy' ? set.intendedWeightKg ?? null : undefined,
  };
}

/** Technique, also honouring the older boolean `techniqueOk`. */
export function techniqueOf(s: WorkoutSet): Technique | undefined {
  if (s.technique) return s.technique;
  if (s.techniqueOk === false) return 'compromised';
  return undefined;
}

export const isCompromised = (s: WorkoutSet) => {
  const t = techniqueOf(s);
  return t === 'compromised' || t === 'failed';
};
export const isWrongWeight = (s: WorkoutSet) => s.weightAccuracy === 'too_light' || s.weightAccuracy === 'too_heavy';
export const hasPain = (s: WorkoutSet) => s.feel === 'pain' || !!s.pain;

/**
 * Estimated RIR range from perceived effort, used ONLY when no RIR was logged. These ranges are
 * practical assumptions (how the owner's own words map onto reps in reserve), not measurements.
 * `[lo, hi]`; hi = null means "lo or more".
 */
export const EFFORT_RIR_ESTIMATE: Record<Effort, [number, number | null]> = {
  very_easy: [5, null],
  easy: [3, 4],
  appropriate: [1, 3],
  hard: [1, 2],
  near_max: [0, 1],
};

export function estimatedRirRange(s: WorkoutSet): [number, number | null] | null {
  if (s.rir != null || (s.toFailure && s.technicalFailure !== true) || !s.effort) return null;
  return EFFORT_RIR_ESTIMATE[s.effort];
}

export function formatRirRange(r: [number, number | null]): string {
  return r[1] == null ? `${r[0]}+` : r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
}

/**
 * Is this set a fair benchmark for strength progression? Performed sets are always KEPT;
 * this only decides whether they are used to judge progress. Excluded: accidental wrong
 * weight, pain, significantly compromised or failed technique, technical failure.
 * Reps at clean muscular failure ARE valid performance.
 */
export function benchmarkExclusion(s: WorkoutSet): string | null {
  if (s.weightAccuracy === 'too_light') return 'wrong weight (too light by accident)';
  if (s.weightAccuracy === 'too_heavy') return 'wrong weight (too heavy by accident)';
  if (hasPain(s)) return 'pain or unusual discomfort';
  const t = techniqueOf(s);
  if (t === 'compromised') return 'technique compromised';
  if (t === 'failed') return 'could not complete correctly';
  // Technical failure: reps after technique gave out are not a clean performance to compare.
  if (s.technicalFailure === true) return 'technical failure (technique gave out)';
  return null;
}

/**
 * Display text of a `benchmarkExclusion()` value. The value itself is a CODE (it is stored on session points
 * and compared in `progression.ts`), so it stays English; this is what a person reads. Unknown → the code itself.
 */
export function exclusionLabel(code: string): string {
  switch (code) {
    case 'wrong weight (too light by accident)': return L('wrong weight (too light by accident)', 'не тот вес (случайно слишком лёгкий)');
    case 'wrong weight (too heavy by accident)': return L('wrong weight (too heavy by accident)', 'не тот вес (случайно слишком тяжёлый)');
    case 'pain or unusual discomfort': return L('pain or unusual discomfort', 'боль или необычный дискомфорт');
    case 'technique compromised': return L('technique compromised', 'техника нарушена');
    case 'could not complete correctly': return L('could not complete correctly', 'не удалось выполнить правильно');
    case 'technical failure (technique gave out)': return L('technical failure (technique gave out)', 'отказ по технике (подвела техника)');
    default: return code;
  }
}

/** Quality status shown per set and counted per muscle (derived, never stored). */
export type SetStatus = 'good' | 'easy' | 'compromised' | 'pain' | 'uncertain';

export const STATUS_LABEL: Record<SetStatus, string> = byLang(() => ({
  good: L('Good quality', 'Качественный'),
  easy: L('Too easy', 'Слишком легко'),
  compromised: L('Technique compromised', 'Техника нарушена'),
  pain: L('Pain flagged', 'Отмечена боль'),
  uncertain: L('Effort unknown', 'Усилие неизвестно'),
}));

// ---------------------------------------------------------------- Corrections audit

const AUDITED: SetCorrection['field'][] = ['weightKg', 'reps', 'rir', 'type', 'side', 'failure', 'technicalFailure', 'toFailure'];

/** A workout counts as finished (so edits are corrections) once it has an end time, was finished, or did not come from the live logger. */
export function isFinished(w: Workout): boolean {
  return !!w.endTime || !!w.finishedAt || w.source !== 'live';
}

/**
 * Records corrections made to a FINISHED workout: every changed weight / reps / RIR / type / side of
 * a set that existed when editing began gets `{at, field, from, to}`; removed sets get a workout
 * note. Always computed against the version opened for editing, so repeated autosaves don't pile
 * up duplicate entries and an edit that is changed back leaves no trace. Original values are never lost.
 */
export function withCorrections(original: Workout, current: Workout, at: string, describe: (exerciseId: string) => string = (id) => id): Workout {
  if (!isFinished(original)) return current;
  const orig = new Map(original.exercises.flatMap((e) => e.sets.map((s) => [s.id, s] as const)));
  const seen = new Set<string>();
  const exercises = current.exercises.map((e) => ({
    ...e,
    sets: e.sets.map((s) => {
      const o = orig.get(s.id);
      if (!o) return s;
      seen.add(s.id);
      const base = o.corrections ?? [];
      // Entries added earlier in this editing session keep their time if they are unchanged.
      const earlier = (s.corrections ?? []).slice(base.length);
      const fresh: SetCorrection[] = [];
      for (const f of AUDITED) {
        const from = (o[f] ?? null) as number | string | boolean | null;
        const to = (s[f] ?? null) as number | string | boolean | null;
        if (from !== to) fresh.push({ at: earlier.find((c) => c.field === f && c.from === from && c.to === to)?.at ?? at, field: f, from, to });
      }
      const corrections = fresh.length ? [...base, ...fresh] : base.length ? base : undefined;
      if (!corrections) { const { corrections: _c, ...rest } = s; void _c; return rest; }
      return { ...s, corrections };
    }),
  }));
  const notes: { at: string; note: string }[] = [];
  // Exercise or machine corrected on a card (sets moved with it): recorded, never silent.
  for (const e of current.exercises) {
    const o = original.exercises.find((x) => x.id === e.id);
    if (!o) continue;
    const n = e.sets.filter((s) => !s.planned).length;
    if (o.exerciseId !== e.exerciseId) notes.push({ at, note: L(`Exercise corrected: ${describe(o.exerciseId)} → ${describe(e.exerciseId)} (${n} set${n === 1 ? '' : 's'})`, `Упражнение исправлено: ${describe(o.exerciseId)} → ${describe(e.exerciseId)} (${n} ${ruPlural(n, 'подход', 'подхода', 'подходов')})`) });
    if ((o.equipmentId ?? null) !== (e.equipmentId ?? null)) notes.push({ at, note: L(`Machine corrected on ${describe(e.exerciseId)}: ${o.equipmentId ?? 'none'} → ${e.equipmentId ?? 'none'}`, `Тренажёр исправлен (${describe(e.exerciseId)}): ${o.equipmentId ?? 'нет'} → ${e.equipmentId ?? 'нет'}`) });
  }
  for (const e of original.exercises) for (const s of e.sets) {
    if (seen.has(s.id) || s.planned) continue;
    notes.push({ at, note: L(
      `Removed ${s.type} set from ${describe(e.exerciseId)}: ${s.weightKg ?? '?'} kg × ${s.reps ?? '?'}${s.rir != null ? ` @ RIR ${s.rir}` : ''}`,
      `Удалён ${s.type === 'warmup' ? 'разминочный подход' : s.type === 'drop' ? 'подход дроп-сета' : 'рабочий подход'} (${describe(e.exerciseId)}): ${s.weightKg != null ? num(s.weightKg) : '?'} кг × ${s.reps ?? '?'}${s.rir != null ? ` @ RIR ${num(s.rir)}` : ''}`,
    ) });
  }
  const audit = [...(original.audit ?? []), ...notes];
  return { ...current, exercises, audit: audit.length ? audit : undefined };
}
