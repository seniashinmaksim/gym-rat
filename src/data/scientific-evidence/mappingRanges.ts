/**
 * Plausible coefficient ranges for the muscles whose mapping the 2026-11-22 audit left UNCERTAIN
 * (exerciseAudit.ts, verdict 'uncertain'). Every range is taken from that entry's own rationale /
 * limitations / variation notes — the alternative value the audit called "defensible" or "plausible" —
 * never invented here. The library value (src/data/exercises.ts) stays the one that is counted; the range
 * only shows how much a weekly number could move if the true contribution were at either end.
 * Exercises marked uncertain without a stated alternative (machine dip, split squat, walking lunge) get
 * no range: the app just says the mapping is uncertain.
 */
import type { MuscleId } from '../../domain/types';
import { L, byLang } from '../../i18n/core';

export type MappingRange = Partial<Record<MuscleId, [number, number]>>;

export const MAPPING_RANGES: Record<string, { range: MappingRange; basis: string }> = byLang(() => ({
  dumbbell_bench_press: { range: { triceps: [0.25, 0.5] }, basis: L('Audit: 0.25 proposed from acute EMG only; 0.5 kept (fractional-volume model).', 'Аудит: 0,25 предложено только по краткосрочной ЭМГ; оставлено 0,5 (модель дробного объёма).') },
  incline_dumbbell_press: { range: { triceps: [0.25, 0.5] }, basis: L('Audit: 0.25 proposed from acute EMG only; 0.5 kept (fractional-volume model).', 'Аудит: 0,25 предложено только по краткосрочной ЭМГ; оставлено 0,5 (модель дробного объёма).') },
  dumbbell_shoulder_press: { range: { triceps: [0.25, 0.5], side_delts: [0.25, 0.5] }, basis: L('Audit: triceps 0.25 from EMG only; side delts "may deserve 0.5".', 'Аудит: трицепс 0,25 — только по ЭМГ; средние дельты «возможно, заслуживают 0,5».') },
  low_to_high_cable_fly: { range: { front_delts: [0.25, 0.5] }, basis: L('Audit: "front delts may deserve 0.5" for a steep low-to-high path.', 'Аудит: «передние дельты, возможно, заслуживают 0,5» при крутой траектории снизу вверх.') },
  dips: { range: { chest: [0.75, 1], triceps: [0.75, 1] }, basis: L('Audit: chest 0.75 / triceps 1 "equally defensible" for an upright dip.', 'Аудит: грудные 0,75 / трицепс 1 «столь же обоснованны» для отжиманий с вертикальным корпусом.') },
  straight_arm_pulldown: { range: { upper_back: [0, 0.25] }, basis: L('Audit: crediting teres major (upper back 0.25) "a reasonable alternative".', 'Аудит: зачёт большой круглой мышце (верх спины 0,25) — «разумная альтернатива».') },
  hammer_curl: { range: { biceps: [0.75, 1] }, basis: L('Audit: biceps 1 / forearms 0.5 "a plausible alternative".', 'Аудит: бицепс 1 / предплечья 0,5 — «правдоподобная альтернатива».') },
  reverse_curl: { range: { biceps: [0.5, 0.75] }, basis: L('Audit: "biceps 0.5 may be conservative".', 'Аудит: «бицепс 0,5, возможно, осторожная оценка».') },
  hack_squat: { range: { glutes: [0.5, 0.75] }, basis: L('Audit: high, wide feet with deep hip flexion "probably justifies glutes 0.75".', 'Аудит: высокая и широкая постановка стоп с глубоким сгибанием бедра «вероятно, оправдывает ягодичные 0,75».') },
  pendulum_squat: { range: { glutes: [0.5, 0.75], adductors: [0.25, 0.5] }, basis: L('Audit: "align with hack squat (glutes 0.5–0.75, adductors 0.5)" if data appear.', 'Аудит: «привести в соответствие с гакк-приседаниями (ягодичные 0,5–0,75, приводящие 0,5)», если появятся данные.') },
  deadlift: { range: { spinal_erectors: [0.25, 0.5] }, basis: L('Audit: erectors 0.5 "defensible" if deadlifts are the main lower-back work.', 'Аудит: разгибатели спины 0,5 «обоснованны», если становая тяга — основная работа на поясницу.') },
  back_extension: { range: { spinal_erectors: [0.25, 1], glutes: [0.25, 0.75], hamstrings: [0.25, 1] }, basis: L('Audit: technique-dependent (rounded back vs neutral-spine hip hinge).', 'Аудит: зависит от техники (округлённая спина или наклон в тазобедренных суставах с нейтральной спиной).') },
  seated_calf_raise: { range: { calves: [0.5, 1] }, basis: L('Audit: a strict whole-muscle reading "would give about 0.5" (soleus only).', 'Аудит: строгая оценка по всей мышце «дала бы около 0,5» (только камбаловидная).') },
  hanging_leg_raise: { range: { abs: [0.5, 1] }, basis: L('Audit: without the pelvic curl the abs mainly stabilise (about 0.5).', 'Аудит: без скручивания таза пресс в основном стабилизирует (около 0,5).') },
  plank: { range: { abs: [0.5, 0.75] }, basis: L('Audit: 0.5 a compromise; weighted / long-lever planks "closer to 0.75".', 'Аудит: 0,5 — компромисс; планки с отягощением и с длинным рычагом «ближе к 0,75».') },
}));
