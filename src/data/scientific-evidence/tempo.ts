/**
 * Exercise-specific execution / tempo model (verified 2026-11-21; see SCIENTIFIC_METHOD.md).
 * Guidance only: tempo never adds or removes volume credit (rule `tempo_no_credit`). Only momentum or a
 * shortened range, when the owner ALSO marks technique as compromised, changes credit via the technique rule.
 * Profiles are practical recommendations from pooled tempo evidence + biomechanics; confidence is stated honestly.
 */
import type { ExecutionFeedback } from '../../domain/types';

export type IntentLevel = 'yes' | 'yes_controlled' | 'no';
export interface TempoProfile {
  exerciseIds: string[];
  /** e.g. "about 2 s, controlled" */
  eccentric: string;
  /** [min, max] seconds when a number makes sense, else null (descriptive only). */
  eccentricSec: [number, number] | null;
  concentric: string;
  /** Strong intent to accelerate — always while keeping control (yes_controlled = stability first). */
  maxIntent: IntentLevel;
  pause: 'none' | 'optional' | 'brief';
  pauseWhere: string | null;
  rom: string;
  /** 2–4 phone-sized cues. */
  cues: string[];
  avoid: string[];
  why: string;
  confidence: 'moderate' | 'low' | 'very_low';
  basis: 'pooled_tempo_evidence' | 'exercise_specific_trials' | 'biomechanics_and_expert_consensus';
  refIds: string[];
}

export const TEMPO_PROFILES: TempoProfile[] = [
  {
    "exerciseIds": [
      "incline_dumbbell_press"
    ],
    "eccentric": "about 2 s, controlled into the stretch",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Press with strong intent on a steady dumbbell path",
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Lower to a deep chest stretch you can control (dumbbells about chest level) and press to near lockout. Keep the same depth and the same recorded bench angle every rep.",
    "cues": [
      "Lower ~2 s to a stretch",
      "Press hard, stay stable",
      "Same angle, same depth"
    ],
    "avoid": [
      "Bouncing out of the bottom",
      "Dumbbells drifting off path",
      "Cutting depth as the set gets hard",
      "5-10 s negatives by default"
    ],
    "why": "Tempo barely changes growth, so control the stretch and press with intent to keep sets close to failure and comparable between sessions.",
    "confidence": "moderate",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "gschneidner2025_lengthened_partials",
      "kassiano2023_rom_review",
      "pallares2021_rom",
      "schoenfeld2015_repduration"
    ]
  },
  {
    "exerciseIds": [
      "pec_deck"
    ],
    "eccentric": "about 2 s, controlled into the stretch",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Bring the handles together with intent, no jerk",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Open to a deep but comfortable chest stretch with shoulders back, close until the handles nearly meet. Seat height puts the arms at chest level; keep the same seat and handle settings.",
    "cues": [
      "Control the opening ~2 s",
      "Stretch, don't let it crash",
      "Squeeze, don't jerk"
    ],
    "avoid": [
      "Stack crashing at the stretch",
      "Jerking out of the stretch",
      "Shoulders rolling forward",
      "Shortening the open range"
    ],
    "why": "The stretched end is where control matters most; the tempo itself shows no growth advantage either way.",
    "confidence": "low",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "kassiano2023_rom_review",
      "pedrosa2026_length_review"
    ]
  },
  {
    "exerciseIds": [
      "triceps_pushdown_bar",
      "triceps_pushdown",
      "triceps_pushdown_rope"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Push down fast with elbows pinned",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "From full elbow bend (forearms past parallel) to full lockout. Rope: spread the ends at the bottom only if it feels natural. Keep the same cable height.",
    "cues": [
      "Elbows fixed at sides",
      "Let it rise to full bend",
      "Push to lockout"
    ],
    "avoid": [
      "Leaning body weight onto the bar",
      "Elbows drifting forward",
      "Stopping short of the bend"
    ],
    "why": "In one trial momentum did not change arm growth, but strict elbows keep the load comparable on that cable station.",
    "confidence": "moderate",
    "basis": "exercise_specific_trials",
    "refIds": [
      "augustin2025_momentum",
      "enes2025_tempo",
      "wolf2025_lengthened_partials"
    ]
  },
  {
    "exerciseIds": [
      "machine_biceps_curl"
    ],
    "eccentric": "about 2 s, controlled",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Curl with intent, smooth",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Lower to a near-straight arm without resting the stack, curl to full flexion. At failure, partial reps in the bottom (stretched) range are fine.",
    "cues": [
      "Lower ~2 s to near straight",
      "Curl hard, arms on pad",
      "Don't rest the stack"
    ],
    "avoid": [
      "Lifting shoulders or hips off the seat",
      "Bouncing out of the bottom",
      "Top-half-only reps"
    ],
    "why": "Growth is similar across tempos and with some momentum; the stretched bottom range matters more than speed.",
    "confidence": "moderate",
    "basis": "exercise_specific_trials",
    "refIds": [
      "augustin2025_momentum",
      "enes2025_tempo",
      "havers2025_preacher_partials",
      "kassiano2023_rom_review",
      "wolf2025_lengthened_partials"
    ]
  },
  {
    "exerciseIds": [
      "preacher_curl"
    ],
    "eccentric": "about 2 s, slowing in the last part of the descent",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Curl with intent, no bounce out of the bottom",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Lower to near-full extension under control (do not drop into lockout), curl until the forearm is about vertical. Lengthened partials at failure are fine.",
    "cues": [
      "Ease into the bottom",
      "No bounce at the bottom",
      "Armpits snug on the pad"
    ],
    "avoid": [
      "Dropping into lockout",
      "Shoulders or hips heaving",
      "Top-half-only reps"
    ],
    "why": "The preacher loads the stretched bottom where the elbow is most exposed, so a controlled turnaround is sensible; bottom-range partials grew as well as full ROM.",
    "confidence": "low",
    "basis": "exercise_specific_trials",
    "refIds": [
      "attarieh2025_preacher_vs_bayesian",
      "augustin2025_momentum",
      "enes2025_tempo",
      "havers2025_preacher_partials",
      "kobayashi2026_incline_vs_preacher"
    ]
  },
  {
    "exerciseIds": [
      "ez_bar_curl"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Curl with intent, torso still",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Full extension to full flexion with elbows near the sides. Record standing vs seated; keep the same grip width.",
    "cues": [
      "Stand tall, brace",
      "Curl hard, don't swing",
      "Lower all the way"
    ],
    "avoid": [
      "Hip or back swing to start reps",
      "Elbows drifting far forward",
      "Half reps from mid-range"
    ],
    "why": "Some body English did not hurt arm growth in one trial, but a big swing changes the load you compare and stresses the lower back.",
    "confidence": "moderate",
    "basis": "exercise_specific_trials",
    "refIds": [
      "augustin2025_momentum",
      "enes2025_tempo",
      "kassiano2023_rom_review",
      "pallares2021_rom"
    ]
  },
  {
    "exerciseIds": [
      "lateral_raise"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Raise with intent, leading with the elbows",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "From arms near the sides to about shoulder height. With dumbbells the bottom is barely loaded and the load peaks near the top, so there is no need to slow down at the bottom.",
    "cues": [
      "Lead with elbows",
      "Up to shoulder height",
      "No hip kick"
    ],
    "avoid": [
      "Swinging or kicking with the hips",
      "Shrugging the weight up",
      "Stopping well below shoulder height"
    ],
    "why": "A small amount of momentum may be harmless, but a model suggests a big swing shifts work away from the side delts.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "arandjelovic2013_momentum_model",
      "augustin2025_momentum",
      "enes2025_tempo",
      "larsen2025_lateral_raise"
    ]
  },
  {
    "exerciseIds": [
      "cable_lateral_raise"
    ],
    "eccentric": "about 2 s, controlled all the way down",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Raise with intent, smooth",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Start with the hand slightly across the body so the cable still pulls at the bottom, raise to about shoulder height. Keep the same pulley height and attachment; log side per set if one arm at a time.",
    "cues": [
      "Cable stays taut at bottom",
      "Control the low range",
      "Same pulley height"
    ],
    "avoid": [
      "Stack touching down between reps",
      "Torso leaning or swinging",
      "Shrugging"
    ],
    "why": "Unlike dumbbells, the cable keeps tension low in the range, so control it there; growth matched dumbbells when ROM was matched.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "enes2025_tempo",
      "larsen2025_lateral_raise",
      "pedrosa2026_length_review"
    ]
  },
  {
    "exerciseIds": [
      "back_squat"
    ],
    "eccentric": "about 2 s, controlled",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Drive up with strong intent while staying braced",
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": "The same controlled depth every rep, ideally at or below parallel; full squats grew the adductors and glutes more than half squats.",
    "cues": [
      "Brace before each rep",
      "Down ~2 s, same depth",
      "Drive up hard, stay tight",
      "Slow grinders are OK"
    ],
    "avoid": [
      "Dive-bombing into the hole",
      "Bouncing off loose knees",
      "Cutting depth late in the set",
      "Losing the brace to go faster"
    ],
    "why": "Stable technique comes first; fast intent helped squat strength, while tempo had little or mixed effect on size.",
    "confidence": "moderate",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "cornejodaza2026_velocity_bfr",
      "enes2025_tempo",
      "kubo2019_squatdepth",
      "parejablanco2014_maxv_squat",
      "parejablanco2017_vl"
    ]
  },
  {
    "exerciseIds": [
      "leg_extension"
    ],
    "eccentric": "about 2 s, controlled",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Extend with intent, no kick",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "From the deepest knee bend the machine allows to near lockout. If reps fall short near failure, keep the deep-bend part of the range.",
    "cues": [
      "Lower all the way down",
      "Extend hard, hips down",
      "Deep bend counts most"
    ],
    "avoid": [
      "Kicking the pad up",
      "Hips lifting off the seat",
      "Top-half partials"
    ],
    "why": "Partials in the knee-bent range grew the quads at least as well as full ROM, so protect that range; tempo itself matters little.",
    "confidence": "moderate",
    "basis": "exercise_specific_trials",
    "refIds": [
      "enes2025_tempo",
      "kinoshita2026_legext_vs_legpress",
      "pedrosa2022_legext_partials",
      "vasconcelos2026_legext_failure"
    ]
  },
  {
    "exerciseIds": [
      "romanian_deadlift"
    ],
    "eccentric": "about 2-3 s, controlled",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Drive hips forward with intent, staying rigid",
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Hinge until a strong hamstring stretch with a neutral back and the bar close to the legs; stop before the back rounds. Total weight as reported.",
    "cues": [
      "Hips back, bar close",
      "Stop at stretch, back flat",
      "Stand up strong, no jerk"
    ],
    "avoid": [
      "Rounding the lower back to go deeper",
      "Bouncing at the bottom",
      "Bar drifting forward",
      "Leaning back at the top"
    ],
    "why": "A heavy hinge rewards a stable position; the controlled descent keeps the bar path, not because slow negatives grow more.",
    "confidence": "low",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "amdi2025_eccduration",
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "morin2025_sldl_nordic"
    ]
  },
  {
    "exerciseIds": [
      "dumbbell_romanian_deadlift"
    ],
    "eccentric": "about 2-3 s, controlled",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Drive hips forward with intent, staying rigid",
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Hinge until a strong hamstring stretch with a neutral back, dumbbells close to the thighs and shins; stop before the back rounds. Weight per dumbbell.",
    "cues": [
      "Hips back, DBs close",
      "Stop at stretch, back flat",
      "Stand up strong"
    ],
    "avoid": [
      "Rounding the back to reach lower",
      "Bouncing at the bottom",
      "Dumbbells swinging forward"
    ],
    "why": "Same hinge rules as the barbell version: stable position first; tempo has little effect on growth.",
    "confidence": "low",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "morin2025_sldl_nordic"
    ]
  },
  {
    "exerciseIds": [
      "seated_leg_curl"
    ],
    "eccentric": "about 2 s, controlled",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Curl with intent",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Thigh pad snug, hips flexed (lean slightly forward if the seat allows); from near-straight knees to full flexion.",
    "cues": [
      "Thigh pad locked tight",
      "Let legs nearly straighten",
      "Curl hard, hips down"
    ],
    "avoid": [
      "Hips sliding or lifting",
      "Stack crashing between reps",
      "Short bottom range"
    ],
    "why": "Sitting with hips flexed stretches the hamstrings and grew them more than lying curls in a 12-week trial; tempo matters little.",
    "confidence": "moderate",
    "basis": "exercise_specific_trials",
    "refIds": [
      "enes2025_tempo",
      "kassiano2023_rom_review",
      "maeo2021_seated_vs_prone_curl"
    ]
  },
  {
    "exerciseIds": [
      "lying_leg_curl"
    ],
    "eccentric": "about 2 s, controlled",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Curl with intent",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Hips pressed into the pad; knees from near-straight to full flexion.",
    "cues": [
      "Hips pinned to pad",
      "Lower to near straight",
      "Curl hard, no hip lift"
    ],
    "avoid": [
      "Hips rising to help the curl",
      "Kicking from the bottom",
      "Stopping short of straight legs"
    ],
    "why": "Lying curls stretch the hamstrings less than seated curls (less growth in one trial), so keep hips down and use the full bottom range.",
    "confidence": "moderate",
    "basis": "exercise_specific_trials",
    "refIds": [
      "enes2025_tempo",
      "kassiano2023_rom_review",
      "maeo2021_seated_vs_prone_curl"
    ]
  },
  {
    "exerciseIds": [
      "standing_leg_curl"
    ],
    "eccentric": "about 2 s, controlled",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Curl with intent, thigh still",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Knee from near-straight to full flexion with the pelvis square and the thigh fixed. Log sides per set.",
    "cues": [
      "Hips still, brace",
      "Lower to near straight",
      "Curl, don't swing thigh"
    ],
    "avoid": [
      "Swinging the thigh",
      "Pelvis twisting",
      "Short bottom range"
    ],
    "why": "The hip stays fairly extended, as in lying curls, so a steady pelvis and full bottom range keep reps comparable.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "enes2025_tempo",
      "maeo2021_seated_vs_prone_curl"
    ]
  },
  {
    "exerciseIds": [
      "hanging_knee_raise_pelvic_curl"
    ],
    "eccentric": "about 2 s, controlled down to a still hang",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Knees up, then curl the pelvis toward the ribs",
    "maxIntent": "yes_controlled",
    "pause": "brief",
    "pauseWhere": "bottom still hang ~1 s to stop the swing; optional short hold at top with pelvis curled",
    "rom": "Knees above hip level AND pelvis tilted back toward the ribs. The curl is the ab part; lifting the knees with a flat back is mostly hip flexors and is not this exercise.",
    "cues": [
      "Stop the swing at bottom",
      "Curl pelvis to ribs",
      "Knees only = hip flexors",
      "Lower ~2 s, no drop"
    ],
    "avoid": [
      "Swinging for momentum",
      "Knee lift with no pelvic curl",
      "Dropping the legs",
      "Partial reps that skip the curl"
    ],
    "why": "Ab work comes from curling the pelvis, so a swing-free start and a visible curl make each rep a true ab set (EMG and biomechanics only).",
    "confidence": "very_low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "escamilla2006_abs_emg",
      "mcgill2015_hlr_emg"
    ]
  },
  {
    "exerciseIds": [
      "hanging_leg_raise"
    ],
    "eccentric": "about 2 s, controlled down to a still hang",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Raise the legs, finish by curling the pelvis up",
    "maxIntent": "yes_controlled",
    "pause": "brief",
    "pauseWhere": "bottom still hang ~1 s to stop the swing",
    "rom": "Legs up to at least hip level with a pelvic curl at the top; lifting the legs with a flat or arched back is mainly hip flexion.",
    "cues": [
      "Dead hang, no swing",
      "Curl pelvis at the top",
      "Lower ~2 s, no drop"
    ],
    "avoid": [
      "Kipping or swinging",
      "Arching the lower back",
      "Dropping the legs"
    ],
    "why": "It shows very high ab EMG but also high modelled spine load, so controlled reps with a pelvic curl keep it an ab exercise rather than a hip-flexor swing.",
    "confidence": "very_low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "escamilla2006_abs_emg",
      "mcgill2015_hlr_emg"
    ]
  },
  {
    "exerciseIds": [
      "barbell_bench_press",
      "incline_barbell_press",
      "smith_incline_press",
      "decline_press",
      "close_grip_bench"
    ],
    "eccentric": "about 1-2 s, controlled to the chest",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Press with strong intent, steady bar path",
    "maxIntent": "yes_controlled",
    "pause": "optional",
    "pauseWhere": "brief touch on the chest, only if bouncing creeps in",
    "rom": "Lower to the same touch point each rep and press to lockout; record the bench angle.",
    "cues": [
      "Same touch point",
      "No bounce off chest",
      "Press hard, stay tight"
    ],
    "avoid": [
      "Bouncing the bar off the chest",
      "Hips lifting off the bench",
      "Cutting depth late in the set"
    ],
    "why": "Fast intent improved bench strength; growth depends more on effort and range than on speed.",
    "confidence": "moderate",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "enes2025_tempo",
      "gonzalezbadillo2014_maxv_bench",
      "pallares2021_rom",
      "parejablanco2026_vlbench"
    ]
  },
  {
    "exerciseIds": [
      "dumbbell_bench_press",
      "dumbbell_shoulder_press"
    ],
    "eccentric": "about 2 s, controlled",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Press with intent, dumbbells stable",
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Lower to a controlled stretch and press to near lockout; same depth every rep. Weight per dumbbell.",
    "cues": [
      "Lower ~2 s to a stretch",
      "Press hard, wrists stacked",
      "Same depth every rep"
    ],
    "avoid": [
      "Bouncing at the bottom",
      "Dumbbells wobbling off path",
      "Cutting depth late in the set"
    ],
    "why": "Free dumbbells need stability first; tempo within the normal range does not change growth.",
    "confidence": "low",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "schoenfeld2015_repduration"
    ]
  },
  {
    "exerciseIds": [
      "machine_chest_press",
      "incline_chest_press",
      "machine_shoulder_press",
      "machine_dip"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Press with intent",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "The full machine range to a comfortable stretch and near lockout, with the same seat setting.",
    "cues": [
      "Same seat, same range",
      "Control into the stretch",
      "Press with intent"
    ],
    "avoid": [
      "Stack crashing between reps",
      "Short reps",
      "Hips lifting off the seat"
    ],
    "why": "Machines are stable, so push with intent; on a chest press, lengthened partials and full ROM grew similarly.",
    "confidence": "moderate",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "currier2026_acsm_position",
      "enes2025_tempo",
      "gschneidner2025_lengthened_partials"
    ]
  },
  {
    "exerciseIds": [
      "overhead_press",
      "front_squat",
      "deadlift"
    ],
    "eccentric": "about 1-2 s, controlled (deadlift: lower under control, no drop)",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Move with strong intent while staying braced",
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": "The full range you can hold in position, the same every rep; reset between deadlift reps if needed.",
    "cues": [
      "Brace before each rep",
      "Move hard, stay tight",
      "Lower under control",
      "Stop when form slips"
    ],
    "avoid": [
      "Dropping or bouncing the load",
      "Losing the brace or back position",
      "Leg drive on a strict press"
    ],
    "why": "With heavy free weights stable technique matters most; tempo has little effect on growth.",
    "confidence": "low",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "currier2026_acsm_position",
      "enes2025_tempo",
      "parejablanco2014_maxv_squat"
    ]
  },
  {
    "exerciseIds": [
      "cable_fly",
      "low_to_high_cable_fly",
      "dumbbell_fly"
    ],
    "eccentric": "about 2 s, controlled into the stretch",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Bring the arms together with intent, no jerk",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Open to a deep but comfortable chest stretch with a fixed soft elbow. Dumbbell fly: the load peaks at the stretch, so take most care there.",
    "cues": [
      "Elbows soft, fixed angle",
      "Control into the stretch",
      "Squeeze, don't jerk"
    ],
    "avoid": [
      "Turning it into a press",
      "Dropping into the stretch",
      "Jerking out of the bottom"
    ],
    "why": "Flys load the stretched shoulder, so control there protects the joint; tempo itself does not change growth.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "kassiano2023_rom_review",
      "pedrosa2026_length_review"
    ]
  },
  {
    "exerciseIds": [
      "dips",
      "push_up"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Push with intent, body rigid",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Dips: down to a stretch the shoulders tolerate. Push-up: chest near the floor. Both to full lockout.",
    "cues": [
      "Body rigid",
      "Lower ~1-2 s",
      "Push hard to lockout"
    ],
    "avoid": [
      "Bouncing at the bottom",
      "Sagging hips",
      "Half reps"
    ],
    "why": "Normal controlled reps cover the tempo range shown to work; range and effort matter more.",
    "confidence": "low",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "enes2025_tempo",
      "pallares2021_rom"
    ]
  },
  {
    "exerciseIds": [
      "lat_pulldown",
      "close_grip_pulldown",
      "machine_pulldown",
      "pull_up",
      "assisted_pull_up"
    ],
    "eccentric": "about 2 s, controlled up to a full stretch",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Pull with intent, elbows driving down",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "From a full overhead stretch (arms nearly straight, shoulders allowed to rise) to the bar near the upper chest or chin over the bar.",
    "cues": [
      "Full stretch at the top",
      "Pull hard with elbows",
      "No swing or kip"
    ],
    "avoid": [
      "Leaning back to yank",
      "Kipping",
      "Cutting the top stretch"
    ],
    "why": "The stretched top is the valuable part (lengthened pulldown partials matched full ROM); tempo matters little.",
    "confidence": "moderate",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "enes2025_tempo",
      "gschneidner2025_lengthened_partials",
      "kassiano2023_rom_review"
    ]
  },
  {
    "exerciseIds": [
      "seated_cable_row",
      "chest_supported_row",
      "barbell_row",
      "dumbbell_row",
      "t_bar_row"
    ],
    "eccentric": "about 1-2 s, controlled to a full reach",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Pull with intent, torso still",
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Reach to a full stretch (shoulder blades forward) and pull until the elbows pass the torso.",
    "cues": [
      "Reach to a full stretch",
      "Pull hard, torso still",
      "Lower under control"
    ],
    "avoid": [
      "Torso heaving to start reps",
      "Jerking the weight",
      "Short reach"
    ],
    "why": "A still torso keeps the load on the back and comparable between sessions; tempo has little effect on growth.",
    "confidence": "low",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "kassiano2023_rom_review"
    ]
  },
  {
    "exerciseIds": [
      "machine_lateral_raise",
      "front_raise",
      "upright_row",
      "reverse_pec_deck",
      "rear_delt_fly",
      "face_pull",
      "straight_arm_pulldown",
      "shrug"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Move with intent using the target muscle",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "The full range the joint tolerates, the same every rep. Straight-arm pulldown: start from a full overhead stretch.",
    "cues": [
      "Lift with the target",
      "No body swing",
      "Control the return"
    ],
    "avoid": [
      "Swinging the torso",
      "Stack crashing",
      "Shrugging into it (except shrugs)"
    ],
    "why": "Small muscles are easy to cheat with a swing; a model suggests big momentum offloads the target.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "arandjelovic2013_momentum_model",
      "augustin2025_momentum",
      "enes2025_tempo"
    ]
  },
  {
    "exerciseIds": [
      "barbell_curl",
      "dumbbell_curl",
      "incline_dumbbell_curl",
      "cable_curl",
      "hammer_curl",
      "reverse_curl",
      "wrist_curl"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Curl with intent, torso still",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Full extension to full flexion. Incline curl: let the arm hang fully for the stretch.",
    "cues": [
      "Lower all the way",
      "Curl with intent",
      "Torso still"
    ],
    "avoid": [
      "Big hip or back swing",
      "Elbows drifting far forward",
      "Half reps"
    ],
    "why": "Moderate momentum did not change arm growth in one trial, but strict reps keep loads comparable; curl variations grew the elbow flexors similarly in total.",
    "confidence": "moderate",
    "basis": "exercise_specific_trials",
    "refIds": [
      "augustin2025_momentum",
      "enes2025_tempo",
      "kobayashi2026_incline_vs_preacher",
      "larsen2026_cablecurl_shoulder"
    ]
  },
  {
    "exerciseIds": [
      "overhead_triceps_extension",
      "skull_crusher"
    ],
    "eccentric": "about 2 s, controlled into the deep bend",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Extend with intent to lockout",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "From a deep elbow bend to lockout with the elbows roughly fixed.",
    "cues": [
      "Control the deep bend",
      "Elbows stay put",
      "Extend hard to lockout"
    ],
    "avoid": [
      "Dropping into the stretch",
      "Elbows flaring",
      "Half reps"
    ],
    "why": "The deep bend is loaded and stresses the elbow, so control it; bottom-range partials grew the triceps as well as full ROM.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "wolf2025_lengthened_partials"
    ]
  },
  {
    "exerciseIds": [
      "hack_squat",
      "smith_squat",
      "leg_press",
      "pendulum_squat"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      3
    ],
    "concentric": "Drive with intent",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "As deep as you control without the pelvis tucking, the same depth every rep, to near lockout without slamming the knees.",
    "cues": [
      "Same depth every rep",
      "Control down, drive up",
      "Don't slam knees locked"
    ],
    "avoid": [
      "Bouncing off the bottom",
      "Hips peeling off the pad",
      "Shortening reps late in the set"
    ],
    "why": "Machines allow strong intent safely; depth and effort matter more than speed.",
    "confidence": "moderate",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "enes2025_tempo",
      "kinoshita2026_legext_vs_legpress",
      "kubo2019_squatdepth",
      "pallares2021_rom"
    ]
  },
  {
    "exerciseIds": [
      "bulgarian_split_squat",
      "walking_lunge"
    ],
    "eccentric": "about 1.5-2 s, controlled",
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": "Drive through the front foot with intent",
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Back knee near the floor with a deep front-hip stretch and a stable torso.",
    "cues": [
      "Balance first, then push",
      "Lower ~2 s, deep",
      "Drive through front foot"
    ],
    "avoid": [
      "Bouncing off the back knee",
      "Wobbling or twisting",
      "Shallow reps"
    ],
    "why": "Balance limits these lifts, so stability comes first; tempo has little effect on growth.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo"
    ]
  },
  {
    "exerciseIds": [
      "hip_thrust",
      "glute_kickback",
      "back_extension"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Extend the hips with intent",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Full hip extension without arching the lower back; back extension hinges from the hips.",
    "cues": [
      "Hips do the work",
      "No lower-back arch",
      "Control down"
    ],
    "avoid": [
      "Overarching the lower back",
      "Swinging the leg (kickback)",
      "Bouncing at the bottom"
    ],
    "why": "Hip extensors are easy to replace with lumbar arching, so position matters more than tempo.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "enes2025_tempo"
    ]
  },
  {
    "exerciseIds": [
      "hip_adduction",
      "hip_abduction"
    ],
    "eccentric": "about 1-2 s, controlled",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Move with intent",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "The full machine range to a comfortable stretch, the same every rep.",
    "cues": [
      "Control the opening",
      "Full comfortable range",
      "No pad slamming"
    ],
    "avoid": [
      "Pads slamming",
      "Short reps",
      "Rocking the torso"
    ],
    "why": "Normal controlled reps fall in the tempo range shown to work; a consistent range keeps sessions comparable.",
    "confidence": "low",
    "basis": "pooled_tempo_evidence",
    "refIds": [
      "enes2025_tempo",
      "kassiano2023_rom_review"
    ]
  },
  {
    "exerciseIds": [
      "standing_calf_raise",
      "seated_calf_raise",
      "leg_press_calf_raise"
    ],
    "eccentric": "about 1-2 s into the stretch",
    "eccentricSec": [
      1,
      2
    ],
    "concentric": "Rise with intent onto the big toe",
    "maxIntent": "yes",
    "pause": "brief",
    "pauseWhere": "bottom stretch, ~1 s, to remove the Achilles rebound",
    "rom": "A deep heel drop to full stretch, then up onto the big toe. At failure, bottom-range partials are fine.",
    "cues": [
      "Pause ~1 s at bottom",
      "Full heel drop",
      "Up onto big toe"
    ],
    "avoid": [
      "Bouncing out of the stretch",
      "Short top-only reps",
      "Bending knees to cheat (standing)"
    ],
    "why": "The Achilles tendon makes bouncing easy, so a short bottom pause keeps the stretched range loaded; lengthened partials grew the calves well.",
    "confidence": "low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "larsen2025_calf_partials",
      "oranchuk2019_isometric",
      "vanevery2022_interset_stretch"
    ]
  },
  {
    "exerciseIds": [
      "cable_crunch",
      "crunch",
      "ab_machine"
    ],
    "eccentric": "about 1-2 s, controlled back to a stretch",
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": "Curl the spine with intent",
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Ribs curl toward the pelvis (spinal flexion) and return to a stretch; not a hinge at the hips.",
    "cues": [
      "Ribs toward pelvis",
      "Don't just hinge hips",
      "Control back to stretch"
    ],
    "avoid": [
      "Pulling with the arms",
      "Hip hinge instead of a spinal curl",
      "Yanking the weight"
    ],
    "why": "The abs flex the spine, so the curl matters more than speed (biomechanics only).",
    "confidence": "very_low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "escamilla2006_abs_emg"
    ]
  },
  {
    "exerciseIds": [
      "plank",
      "farmer_carry"
    ],
    "eccentric": "not applicable (timed hold or carry)",
    "eccentricSec": null,
    "concentric": "not applicable",
    "maxIntent": "no",
    "pause": "none",
    "pauseWhere": null,
    "rom": "Plank: neutral spine, ribs down. Carry: tall posture, steady steps.",
    "cues": [
      "Brace, breathe steady",
      "Stop when posture breaks"
    ],
    "avoid": [
      "Hips sagging or piking",
      "Leaning or shuffling"
    ],
    "why": "These are timed holds, so posture quality replaces tempo.",
    "confidence": "very_low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "androulakiskorakakis2023_technique"
    ]
  }
];

const BY_ID = new Map<string, TempoProfile>();
for (const p of TEMPO_PROFILES) for (const id of p.exerciseIds) if (!BY_ID.has(id)) BY_ID.set(id, p);
/** Execution profile for an exercise (custom exercises have none). */
export const tempoFor = (exerciseId: string): TempoProfile | null => BY_ID.get(exerciseId) ?? null;

/** General principles behind every profile. */
export const TEMPO_PRINCIPLES: { text: string; refIds: string[] }[] = [
  {
    "text": "There is no universal tempo: reps of about 0.5-8 s grow muscle similarly, and ~1 s vs ~3.5 s reps differed only trivially.",
    "refIds": [
      "currier2026_acsm_position",
      "enes2025_tempo",
      "schoenfeld2015_repduration"
    ]
  },
  {
    "text": "Default: lower under control in about 1-3 s and lift with intent. No 5-10 s negatives by default; very slow reps (>10 s) may be worse.",
    "refIds": [
      "amdi2025_eccduration",
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "schoenfeld2015_repduration"
    ]
  },
  {
    "text": "Explosive intent means trying to move fast while staying in control. It improved strength in trials that did not measure size; for growth it is neutral or unknown.",
    "refIds": [
      "cornejodaza2026_velocity_bfr",
      "currier2026_acsm_position",
      "gonzalezbadillo2014_maxv_bench",
      "parejablanco2014_maxv_squat"
    ]
  },
  {
    "text": "Reps slow down near failure. That reflects effort, not bad technique, and sets that run on as speed drops grew slightly more.",
    "refIds": [
      "jukic2023_velocityloss",
      "parejablanco2017_vl",
      "refalo2023_failure_meta"
    ]
  },
  {
    "text": "Range matters more than speed: full ROM or lengthened partials beat short partials, so protect the stretched part of each rep.",
    "refIds": [
      "gschneidner2025_lengthened_partials",
      "kassiano2023_rom_review",
      "pallares2021_rom",
      "pedrosa2022_legext_partials",
      "wolf2025_lengthened_partials"
    ]
  },
  {
    "text": "Some momentum on arm isolation did not change growth in one trial, but control keeps loads comparable and joints safe; heavy compounds put stability first.",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "arandjelovic2013_momentum_model",
      "augustin2025_momentum"
    ]
  },
  {
    "text": "Slow negatives and eccentric overload are optional, not superior, and never earn extra credit.",
    "refIds": [
      "amdi2025_eccduration",
      "dasilva2025_ecc_con",
      "schoenfeld2017_ecc_con",
      "zhang2026_ael"
    ]
  },
  {
    "text": "No trial isolates pauses inside a rep. Use a pause only for a specific reason, such as stopping a swing or a tendon bounce.",
    "refIds": [
      "davies2021_cluster",
      "oranchuk2019_isometric",
      "vanevery2022_interset_stretch"
    ]
  }
];

/** Distinct execution concepts (maximal intent ≠ actual velocity ≠ controlled ≠ momentum ≠ slow reps ≠ accentuated eccentric). */
export const TEMPO_CONCEPTS: { concept: string; text: string; level: string; refIds: string[] }[] = [
  {
    "concept": "actual_velocity",
    "text": "Repetition speed has little effect on hypertrophy across a wide range. Fast reps (about 1 s) and slower reps (about 3.5 s) grew muscle similarly, with a trivial, uncertain edge for faster reps (Enes 2025). Total rep durations of about 0.5-8 s were similar when sets went to failure (Schoenfeld 2015). The older muscle-specific review in untrained people was mixed (Hackett 2018). ACSM 2026 found that time under tension did not consistently change outcomes. Inference, not tested directly: reps slow down near failure regardless of intent, so slowing within a set reflects effort, not poor technique. Tempo should not change set credit.",
    "level": "moderate",
    "refIds": [
      "currier2026_acsm_position",
      "enes2025_tempo",
      "hackett2018_velocity",
      "schoenfeld2015_repduration"
    ]
  },
  {
    "concept": "maximal_concentric_intent",
    "text": "Lifting with maximal intended concentric velocity improved strength, bar speed and jump height more than deliberately half-speed lifting (two 6-week RCTs, no size outcome). ACSM 2026 links fast-concentric power training to power, not specifically to size. The only trial that measured size found a complex velocity-by-BFR interaction: without BFR, half-speed squats grew the distal vastus lateralis more. Velocity-loss studies show that hypertrophy still occurs, and is slightly larger, when sets continue as speed drops. Intent is a strength and performance tool; for hypertrophy it is neutral or unknown.",
    "level": "limited",
    "refIds": [
      "cornejodaza2026_velocity_bfr",
      "currier2026_acsm_position",
      "enes2025_tempo",
      "gonzalezbadillo2014_maxv_bench",
      "parejablanco2014_maxv_squat"
    ]
  },
  {
    "concept": "other",
    "text": "Velocity loss as a proxy for effort: letting sets run to greater velocity loss (closer to failure) went with slightly more hypertrophy in a meta-regression (Jukic 2023). It also gave more quadriceps growth at 40% vs 20% loss (Pareja-Blanco 2017) and the most pectoral CSA at 50% loss (Pareja-Blanco 2026). Strength was similar, and jump and speed qualities favoured low velocity loss. Refalo 2023 found no difference between >25% and 20-25% loss, so the benefit likely flattens near failure. Velocity loss is confounded with reps and volume.",
    "level": "moderate",
    "refIds": [
      "jukic2023_velocityloss",
      "parejablanco2017_vl",
      "parejablanco2026_vlbench",
      "refalo2023_failure_meta"
    ]
  },
  {
    "concept": "deliberately_slow_reps",
    "text": "Deliberately slowing reps did not add hypertrophy. Slower tempos were no better, trivially worse, than faster ones (Enes 2025). Longer versus shorter eccentric phases showed about zero, uncertain difference in growth, although longer eccentrics gave equal or slightly larger strength gains in trained, volume-load-matched subgroups (Amdi 2025). Very slow reps (>10 s) looked inferior in the 2015 meta-analysis, based on few studies. Deliberately half-speed concentrics reduced strength gains. The 1-2 s per phase advice in ACSM 2009 was consensus and is superseded.",
    "level": "moderate",
    "refIds": [
      "acsm2009_progression",
      "amdi2025_eccduration",
      "currier2026_acsm_position",
      "enes2025_tempo",
      "gonzalezbadillo2014_maxv_bench",
      "schoenfeld2015_repduration",
      "wilk2021_tempo"
    ]
  },
  {
    "concept": "controlled_execution",
    "text": "The owner's technique review (first author Androulakis Korakakis, not Schoenfeld) recommends about 2-8 s per rep and an emphasis on long muscle lengths. It says body-position and movement-path guidance rests mostly on anatomy and biomechanics theory, and that strict versus looser technique has barely been tested. Controlled execution is a sensible default for keeping ROM and loading consistent, and for safety. It has not been shown to add growth beyond the tempo range already shown to be equivalent.",
    "level": "limited",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "augustin2025_momentum",
      "enes2025_tempo",
      "schoenfeld2015_repduration"
    ]
  },
  {
    "concept": "uncontrolled_momentum",
    "text": "In one 8-week within-participant RCT, external momentum ('cheating') on curls and pushdowns taken to failure neither helped nor hurt arm growth compared with strict form, despite much higher volume load. A computer model of the lateral raise suggests moderate momentum may keep target torque high, while excessive momentum offloads the target muscle; this is theoretical only. The evidence covers single-joint arm exercises only, and injury risk was not studied. The app's x0.7 compromised-technique factor is therefore an assumption, not a value derived from evidence.",
    "level": "limited",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "arandjelovic2013_momentum_model",
      "augustin2025_momentum"
    ]
  },
  {
    "concept": "eccentric_vs_concentric",
    "text": "Both muscle actions build muscle. Eccentric-only training showed a small, non-significant edge over concentric-only (Schoenfeld 2017: ES difference 0.25, CI -0.03 to 0.52). da Silva 2025 (26 studies) found no overall difference, with very low certainty and high heterogeneity; exploratory subgroups leaned eccentric. Roig 2009 tied an eccentric advantage to the heavier loads possible eccentrically. Maia 2026 reported an eccentric benefit from only 4 hypertrophy studies, mostly in clinical and older groups. Normal lifts already include both phases.",
    "level": "moderate",
    "refIds": [
      "dasilva2025_ecc_con",
      "maia2026_ecc_con",
      "roig2009_ecc_con",
      "schoenfeld2017_ecc_con"
    ]
  },
  {
    "concept": "accentuated_eccentric",
    "text": "The evidence conflicts. The newest, largest meta-analysis (Zhang 2026, 49 studies) found accentuated eccentric loading gave CSA and strength changes similar to constant-load training. It raised perceived effort and post-session lactate, implying a higher recovery cost; its higher eccentric EMG is indirect. ACSM 2026 lists eccentric overload as enhancing hypertrophy without defining protocols in the abstract. Maroto-Izquierdo 2017 favoured flywheel overload (9 studies, special devices). Simply slowing the eccentric does not count as overload (Amdi 2025). Treat it as optional, not superior.",
    "level": "limited",
    "refIds": [
      "amdi2025_eccduration",
      "currier2026_acsm_position",
      "marotoizquierdo2017_flywheel",
      "zhang2026_ael"
    ]
  },
  {
    "concept": "pauses",
    "text": "No long-term trial isolates a pause inside the rep, either in the stretched position or elsewhere. The closest evidence is indirect. Cluster sets (short rests inside a set) matched traditional sets for hypertrophy (Davies 2021). Pure isometric training grew muscle more at long than at short lengths (Oranchuk 2019, no pooling). A 20 s loaded stretch between calf sets possibly grew the soleus but not the gastrocnemii in untrained men (Van Every 2022). Pauses can be logged as a variation, but there is no basis for crediting them differently.",
    "level": "very_limited",
    "refIds": [
      "davies2021_cluster",
      "oranchuk2019_isometric",
      "pedrosa2026_length_review",
      "vanevery2022_interset_stretch"
    ]
  },
  {
    "concept": "rom_lengthened",
    "text": "Full ROM beats partials done at short muscle lengths (Pallarés 2021; Kassiano 2023). Lengthened partials perform about the same as full ROM: Wolf 2025 (trained arms), Gschneidner 2025 (about 300 people, estimates near zero), Havers 2025 and Larsen 2025 (slight, uncertain leans toward lengthened partials). They sometimes do better regionally (Pedrosa 2022, leg extension). Varovic 2025 found only trivial regional differences between longer and shorter mean lengths. The long-length advantage seems to depend on actually loading the stretched position. This supports the app's partial x0.8 and lengthened-partial x1.0 credit.",
    "level": "moderate",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "gschneidner2025_lengthened_partials",
      "havers2025_preacher_partials",
      "kassiano2023_rom_review",
      "larsen2025_calf_partials",
      "pallares2021_rom",
      "pedrosa2022_legext_partials",
      "pedrosa2026_length_review",
      "varovic2025_muscle_length",
      "wolf2025_lengthened_partials",
      "wolf2026_longitudinal"
    ]
  },
  {
    "concept": "other",
    "text": "Failure and set termination: training to momentary failure was not clearly better than stopping short. Refalo 2023 found only a trivial overall edge, and no significant edge for momentary failure. Leg extensions to failure versus 1-3 RIR were practically identical (Vasconcelos 2026). Failure modestly helped some size measures only in a single-set, very-low-volume program (Hermann 2025). Past-failure partials added nothing clear for calves (Larsen 2025). No trial compares technical with momentary failure, so ending a set when form breaks is an inference, not a tested rule.",
    "level": "limited",
    "refIds": [
      "currier2026_acsm_position",
      "hermann2025_single_set_failure",
      "larsen2025_calf_partials",
      "refalo2023_failure_meta",
      "vasconcelos2026_legext_failure"
    ]
  },
  {
    "concept": "other",
    "text": "Exercise-specific trials for the owner's movements. Dumbbell and cable lateral raises (ROM matched) grew the lateral deltoid equally. Incline and preacher dumbbell curls gave equal total elbow-flexor growth, with incline favouring the biceps and preacher the brachialis and brachioradialis. Shoulder angle did not matter when resistance profiles were matched (Attarieh 2025; Larsen 2026). Seated leg curls beat lying curls for hamstring growth. Knee extension is needed for rectus femoris growth. Full squats grew the adductors and glutes more than half squats. Stiff-leg deadlifts mainly grew the semimembranosus.",
    "level": "moderate",
    "refIds": [
      "attarieh2025_preacher_vs_bayesian",
      "kinoshita2026_legext_vs_legpress",
      "kobayashi2026_incline_vs_preacher",
      "kubo2019_squatdepth",
      "larsen2025_lateral_raise",
      "larsen2026_cablecurl_shoulder",
      "maeo2021_seated_vs_prone_curl",
      "morin2025_sldl_nordic"
    ]
  },
  {
    "concept": "other",
    "text": "Hanging ab straps: no long-term hypertrophy trial exists. Acute EMG shows the strap hanging knee-up and the hanging straight-leg raise among the highest rectus abdominis and oblique activators. The strap knee-up was not among the highest rectus femoris (hip-flexor) activators. No study compares pelvic-curl with pure hip-flexion technique. The app's rule (count only the pelvic-curl version as an ab set) is biomechanical reasoning, supported only indirectly by EMG.",
    "level": "very_limited",
    "refIds": [
      "escamilla2006_abs_emg",
      "mcgill2015_hlr_emg"
    ]
  },
  {
    "concept": "other",
    "text": "Guidelines: ACSM 2026 (overview of 137 systematic reviews) found hypertrophy enhanced by at least 10 sets per week and by eccentric overload. Time under tension, set structure, training to momentary fatigue and equipment type did not consistently change outcomes. It supersedes the consensus-based ACSM 2009 advice of about 1-2 s per phase. Practical takeaway: tempo between roughly 0.5 and 8 s per rep needs no credit adjustment; volume and effort matter more.",
    "level": "moderate",
    "refIds": [
      "acsm2009_progression",
      "currier2026_acsm_position"
    ]
  }
];

/** Optional "did you follow the recommended execution?" answers and how the app uses them. */
export const EXECUTION_FEEDBACK: { id: ExecutionFeedback; label: string; use: string }[] = [
  {
    "id": "followed",
    "label": "Tempo as planned",
    "use": "Confirms consistent execution. It is used only for technique guidance and to show that sessions are comparable; it never changes set credit."
  },
  {
    "id": "ecc_too_fast",
    "label": "Lowered too fast",
    "use": "Shows a 'control the lowering' cue next time. It is never a reason to downgrade the set, because faster eccentrics grow muscle similarly. Credit changes only if the owner also marks technique as compromised in the existing technique field."
  },
  {
    "id": "ecc_too_slow",
    "label": "Lowered slower than needed",
    "use": "Shows a note that about 2 s is enough and that very slow negatives can cost reps without adding growth. It never adds hypertrophy credit and never changes credit."
  },
  {
    "id": "momentum",
    "label": "Used momentum / swing",
    "use": "Noted as an execution issue so the next session gets a stricter-form cue, and repeated tags can flag that loads may not be comparable. The tag itself does not change credit; only the owner's existing technique field (compromised x0.7) does."
  },
  {
    "id": "lost_concentric_control",
    "label": "Lost control on the way up",
    "use": "For a weight that jerked, shifted off path or lost joint position. It is not for a normal slow grind near failure, which is expected effort. It feeds a technique or load-check cue only, and credit changes only through the existing technique field."
  },
  {
    "id": "short_rom",
    "label": "Shortened the range",
    "use": "Noted as an execution issue with a cue to protect the stretched range. The tag itself never changes credit. Any change comes only from the owner's existing technique entry; the existing ROM field already models deliberate partials, so do not apply both."
  }
];

/** The owner's starting sources and what verification found (documentation). */
export const OWNER_SOURCE_CHECKS: { given: string; status: string; detail: string }[] = [
  {
    "given": "Enes et al. (2025) 'How Slow Should You Go? A Systematic Review With Meta-Analysis of the Effect of Resistance Training Repetition Tempo on Muscle Hypertrophy', DOI 10.1519/JSC.0000000000005302, PMID 42709703",
    "status": "verified",
    "detail": "PubMed esummary: PMID 42709703 = exact title, J Strength Cond Res 2025 Dec 1;39(12):1331-1339, first author Enes A, last author Schoenfeld BJ (13 authors). Its articleids hold DOI 10.1519/JSC.0000000000005302. Crossref confirms the same DOI, title, journal and 2025. The abstract (14 studies; faster vs slower tempo, trivial difference) supports the stated finding."
  },
  {
    "given": "'Comparison Between Eccentric vs. Concentric Muscle Actions On Hypertrophy: A Systematic Review and Meta-analysis' (2025), PMID 39652733",
    "status": "verified",
    "detail": "PMID 39652733 = exact title. da Silva LSL, Gonçalves LDS, Alves Campos PH, Benjamim CJR, Tasinafo Júnior MF, de Lima LCR, Bueno Júnior CR, Alves CPL. J Strength Cond Res 2025 Jan 1;39(1):115-134. DOI 10.1519/JSC.0000000000004981 appears in PubMed and matches Crossref (title, 2025, JSCR). The owner gave no DOI or authors; they are added here."
  },
  {
    "given": "Schoenfeld et al. (2024) 'Optimizing Resistance Training Technique to Maximize Muscle Hypertrophy', https://pmc.ncbi.nlm.nih.gov/articles/PMC10801605/",
    "status": "corrected",
    "detail": "PMC10801605 maps to PMID 38249086 (from PubMed articleids). Corrections: (1) the first author is Androulakis Korakakis P; Schoenfeld BJ is the last of 7 authors (Wolf, Coleman, Burke, Piñero, Nippard). (2) The full title ends ': A Narrative Review', so this is a narrative, not systematic, review. (3) Published 29 Dec 2023 in J Funct Morphol Kinesiol 9(1):9 (2024 volume); PubMed and Crossref both date it 2023. DOI 10.3390/jfmk9010009, confirmed in Crossref. Declared ties: Tonal advisory board and Jeff Nippard Fitness."
  },
  {
    "given": "Current ACSM resistance-training recommendations / position stand",
    "status": "verified",
    "detail": "The current stand is Currier BS, ... Schoenfeld BJ, ... Phillips SM, 'American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews', Med Sci Sports Exerc 2026 Apr 1;58(4):851-872. DOI 10.1249/MSS.0000000000003897, PMID 41843416, PMC12965823. Confirmed in PubMed and Crossref; the abstract states it updates the 2009 stand. The superseded stand is 'Progression models in resistance training for healthy adults', Med Sci Sports Exerc 2009;41(3):687-708, DOI 10.1249/MSS.0b013e3181915670, PMID 19204579, also confirmed. docs/RESEARCH.md line 28 already cites the 2026 stand correctly."
  }
];
