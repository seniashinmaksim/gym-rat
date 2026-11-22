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

export type MappingRange = Partial<Record<MuscleId, [number, number]>>;

export const MAPPING_RANGES: Record<string, { range: MappingRange; basis: string }> = {
  dumbbell_bench_press: { range: { triceps: [0.25, 0.5] }, basis: 'Audit: 0.25 proposed from acute EMG only; 0.5 kept (fractional-volume model).' },
  incline_dumbbell_press: { range: { triceps: [0.25, 0.5] }, basis: 'Audit: 0.25 proposed from acute EMG only; 0.5 kept (fractional-volume model).' },
  dumbbell_shoulder_press: { range: { triceps: [0.25, 0.5], side_delts: [0.25, 0.5] }, basis: 'Audit: triceps 0.25 from EMG only; side delts "may deserve 0.5".' },
  low_to_high_cable_fly: { range: { front_delts: [0.25, 0.5] }, basis: 'Audit: "front delts may deserve 0.5" for a steep low-to-high path.' },
  dips: { range: { chest: [0.75, 1], triceps: [0.75, 1] }, basis: 'Audit: chest 0.75 / triceps 1 "equally defensible" for an upright dip.' },
  straight_arm_pulldown: { range: { upper_back: [0, 0.25] }, basis: 'Audit: crediting teres major (upper back 0.25) "a reasonable alternative".' },
  hammer_curl: { range: { biceps: [0.75, 1] }, basis: 'Audit: biceps 1 / forearms 0.5 "a plausible alternative".' },
  reverse_curl: { range: { biceps: [0.5, 0.75] }, basis: 'Audit: "biceps 0.5 may be conservative".' },
  hack_squat: { range: { glutes: [0.5, 0.75] }, basis: 'Audit: high, wide feet with deep hip flexion "probably justifies glutes 0.75".' },
  pendulum_squat: { range: { glutes: [0.5, 0.75], adductors: [0.25, 0.5] }, basis: 'Audit: "align with hack squat (glutes 0.5–0.75, adductors 0.5)" if data appear.' },
  deadlift: { range: { spinal_erectors: [0.25, 0.5] }, basis: 'Audit: erectors 0.5 "defensible" if deadlifts are the main lower-back work.' },
  back_extension: { range: { spinal_erectors: [0.25, 1], glutes: [0.25, 0.75], hamstrings: [0.25, 1] }, basis: 'Audit: technique-dependent (rounded back vs neutral-spine hip hinge).' },
  seated_calf_raise: { range: { calves: [0.5, 1] }, basis: 'Audit: a strict whole-muscle reading "would give about 0.5" (soleus only).' },
  hanging_leg_raise: { range: { abs: [0.5, 1] }, basis: 'Audit: without the pelvic curl the abs mainly stabilise (about 0.5).' },
  plank: { range: { abs: [0.5, 0.75] }, basis: 'Audit: 0.5 a compromise; weighted / long-lever planks "closer to 0.75".' },
};
