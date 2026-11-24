# FIX PLAN — Preferred exercises as first-class citizens

Status: **Part 1 and Part 2 implemented** (2026-11-21; both independently reviewed and shipped). **Part 3** (weaknesses, mobile layout audit, equipment memory, research library, workout prescriptions) at the end of this file is planned, not started.
Owner's full request is reproduced at the end of this file (Appendix A). This plan adds a critical review of that request against the current code, the decisions to take, and the order of work.

Rules that always apply: do not rebuild the app, never rename or delete an existing exercise id, never lose or rewrite stored workouts, never put personal data in the repo, keep the "remaining sets this week" dashboard as the centerpiece, touch-first UI at 375 px, explain every science-based choice.

---

## 1. Current state (verified 2026-11-21)

| Owner's exercise | Exists today | Gap |
|---|---|---|
| Incline DB bench press | `incline_dumbbell_press` (angleSensitive; angle rules in `resolveCoefficients`) | Angle not part of the progression key; no 15/30/45 quick-pick; UI doesn't say "kg per dumbbell" |
| Straight-bar pushdown | only `triceps_pushdown` (alias includes "rope pushdown") | Straight bar vs rope share ONE history; no attachment field |
| Pec deck | `pec_deck` {chest 1, front_delts 0.25} | Settings (seat, handle) are free-form only; no per-exercise setting template |
| Machine biceps curl | only `preacher_curl` (alias "machine curl") | No non-preacher machine curl; arm-pad/seat template missing |
| EZ-bar curl | `barbell_curl` (alias "ez bar curl") | EZ vs straight bar share history; no bar-weight concept |
| DB / cable lateral raise | `lateral_raise`, `cable_lateral_raise` | Unilateral L/R not representable; standing/seated, simultaneous/alternating missing |
| Back squat / leg extension | `back_squat`, `leg_extension` | Depth / bar position / stance not structured; bar weight unknown handling |
| RDL / leg curls | `romanian_deadlift` (barbell), `lying_leg_curl`, `seated_leg_curl` | No dumbbell RDL; no standing single-leg curl |
| Hanging ab-strap raises | `hanging_leg_raise` {abs 1, forearms 0.25} | **Wrong for arm straps** (no grip → forearms 0); no distinction between hip-flexion leg raise and pelvic-curl knee raise |

Engine facts: progression key = `exerciseId::equipmentId`, `::free` for free-weight kinds, `::unidentified@gym`. `ExerciseDef` has no "required fields" or "setting template". Import schema `gymrat.workout` v1.0 (strict zod).

## 2. Critical review of the request (decide these BEFORE coding)

1. **"Weight per dumbbell"** is already the stored convention (`weight_kg` = one dumbbell, `load_mode: "total"`). Do NOT migrate data or add a new load mode; make the UI/import say "kg per dumbbell" explicitly and add a test that "25 kg each hand" → 25.
2. **Bench angle precision.** Evidence on angle is mostly EMG plus few hypertrophy trials; keep the existing coarse buckets (flat < 10°, incline 10–45°, steep > 45°) and label them heuristic. Do not invent per-degree coefficients. Add 15/30/45 quick chips + custom.
3. **Separate histories without new data:** extend `progressionKey` with a *variation suffix* derived at runtime (angle bucket for angle-sensitive presses, attachment for cable pushdowns, bar type for curls, unilateral flag). Derived ⇒ no migration, old workouts stay valid (missing variation = "unspecified" bucket).
4. **Straight-bar vs rope:** recommended = new ids `triceps_pushdown_bar` and `triceps_pushdown_rope`, keep `triceps_pushdown` (old history, "attachment unspecified"), remove "rope pushdown" alias from the old id so new imports resolve to the right one. Same pattern for `ez_bar_curl` (new) vs `barbell_curl` (keep), `machine_biceps_curl` (new) vs `preacher_curl` (keep), `dumbbell_romanian_deadlift`, `standing_leg_curl`.
5. **Hanging ab straps — the request contradicts itself:** it lists rectus abdominis as *primary* for straight-leg raises, yet says hip-flexion-dominant raises must not get full abdominal credit. Resolve with separate ids: `hanging_leg_raise_straps` (hip-flexion dominant: abs 0.5) and `hanging_knee_raise_pelvic_curl` (posterior pelvic tilt + spinal flexion: abs 1.0); a straight-leg raise *with* pelvic curl may be logged as the latter. Forearms 0 for arm-strap versions. Keep `hanging_leg_raise` (bar-hanging) unchanged. Coefficients are heuristics (EMG-based reasoning), say so.
6. **Hip flexors** are not a tracked muscle and have no hypertrophy target. Do NOT add a new muscle id (it would change every weekly total, the body map and targets); mention hip-flexor involvement in the biomechanics text only.
7. **Unilateral counting** already matches the owner's rule (3 L + 3 R = 3 sets). Missing: a way to log sides. Add optional `side: 'left' | 'right'` on sets; volume counts a left+right pair as ONE set (pair by order; an unpaired side counts as one set). Progression uses per-side performance. Needs import schema v1.1 (additive).
8. **EZ/barbell bar weight:** never assume. Store what the owner reports as total; optional `barWeightKg` on the equipment instance (unknown allowed). Do not store "total" and "plates" separately per set (they can contradict); show plates = total − bar only when bar is known.
9. **"Required logging fields" / settings** (seat, arm pad, cable height, pulley height, handle position): add an optional `settingTemplate: string[]` to `ExerciseDef` so the logger pre-creates those setting keys; values stay per equipment instance ("Remember for this machine" already exists).
10. **Squat glute credit "depending on execution":** keep glutes 0.5 by default; optional depth variation (deep → glutes 0.75, adductors 0.5, Kubo 2019) only if cheap — otherwise list as a limitation.
11. **"Number of working sets" field** — sets are individual records; never add a separate count field (would double-count).
12. **Rest, RIR, warm-ups, dashboard refresh, separate machines per gym** already work — verify end-to-end rather than rebuild.
13. Any import-schema change ⇒ follow "Changing the import contract" in CLAUDE.md (bump to 1.1, update JSON Schema, WORKOUT_SCHEMA.md, WORKOUT_PARSING.md, examples, tests).

## 3. Work order

1. Read CLAUDE.md, this plan, `src/data/exercises.ts`, `registry.ts`, `progression.ts`, `volume.ts`, `importer.ts`, `Logger.tsx`, `Strength.tsx`.
2. Present the decisions in §2 to the owner as a short list; proceed with the recommended option unless told otherwise.
3. Exercise DB: new ids + RU names + aliases + coefficients + `settingTemplate`; fix strap forearms; alias hygiene so names resolve to the right variation.
4. Engine: variation-aware `progressionKey`; `side` pairing in volume and progression; bar weight on equipment.
5. Logger (375 px, touch): variation chips (angle 15/30/45/custom, attachment, bar type, standing/seated, unilateral L/R), "kg per dumbbell" label, setting template prefill.
6. Import schema v1.1 (additive) + docs + the owner's example message parsed correctly; unknown machine → flagged, never auto-assigned.
7. Strength page: per-variation history, rep/RIR/rest trends, PRs.
8. CLAUDE.md "Preferred exercises" section + WORKOUT_PARSING.md examples for all eight categories (synthetic data only).
9. Tests for every item in the owner's §8 list.
10. End-to-end in the in-app browser (synthetic localhost vault, deleted afterwards): log each of the eight categories, check dashboard, Strength, History, Recovery.
11. **Independent critical check** (a fresh reviewer reading the diff, not my conclusions) for calculation errors, double counting, lost history and UI regressions; fix what it finds.
12. typecheck + tests + build → commit → push → verify live site.
13. Final report A/B/C + the per-exercise × per-feature confirmation table.

---

## Appendix A — owner's request (verbatim)

TASK: AUDIT, ADD AND FULLY INTEGRATE MY PREFERRED EXERCISES INTO THE EXISTING FITNESS APP
The application has already been developed.
Do not rebuild the application from scratch. Do not replace its existing architecture or remove working functionality.
Your task is to inspect the existing codebase, identify how exercises, equipment, workout logging, muscle-volume calculations, progression tracking, and analytics currently work, and ensure that all my preferred exercises are properly supported.
I want these exercises to be first-class citizens in the application.
This is not simply about adding exercise names to a dropdown menu.
Every exercise must work correctly throughout the entire application:

* Exercise selection.
* Workout logging.
* Equipment identification.
* Weight and repetition tracking.
* Working and warm-up set classification.
* RIR recording.
* Rest interval recording.
* Biomechanical muscle mapping.
* Direct and indirect set calculations.
* Weekly muscle volume.
* Remaining weekly working sets.
* Recovery analysis.
* Strength progression.
* Historical charts.
* Future workout recommendations.

If something is missing or incorrectly implemented, fix it.

### 1. MY PREFERRED EXERCISES

**1. Incline Dumbbell Bench Press** — my preferred chest exercise.
Muscle involvement: Primary: Pectoralis Major, with emphasis depending on bench angle. Secondary: Anterior Deltoids. Secondary: Triceps.
Required logging fields: Weight per dumbbell, not combined weight. Repetitions. Number of working sets. RIR for each set. Rest duration between sets. Bench angle. Gym location. Exercise notes.
Support common incline angles: 15 degrees, 30 degrees, 45 degrees. Allow custom angles.
The application must distinguish 25 kg per dumbbell from 50 kg per dumbbell.
Muscle contribution coefficients should account for the bench angle, but must not imply more scientific precision than the available evidence supports.
Keep progression history for different exercise configurations when necessary.

**2. Cable Triceps Pushdown — Straight Bar** — my preferred triceps isolation exercise.
Primary muscle: Triceps Brachii.
Required logging: Specific cable machine. Gym location. Straight bar attachment. Weight displayed on the machine. Repetitions. Working sets. RIR. Rest intervals. Cable height. Technique notes.
Important: Keep straight-bar pushdowns separate from rope pushdowns and other cable variations in the progression history. All variations should still contribute appropriately to the same triceps weekly volume.

**3. Pec Deck — Machine Chest Fly** — my preferred chest isolation exercise.
Primary muscle: Pectoralis Major. Secondary involvement: Potential limited anterior deltoid contribution, depending on technique.
Do not assign meaningful triceps volume to this exercise.
Required logging: Exact machine ID. Manufacturer and model, if known. Gym location. Weight stack value. Seat position. Handle position. Repetitions. Sets. RIR. Rest intervals.
Allow machine photographs and remember the exact machine and settings.
Different Pec Deck machines in different gyms must have independent equipment records and progression histories.

**4. Biceps Curl — Machine or Standing EZ-Bar Curl.** Support two separate exercise variations.
A. Machine Biceps Curl. Track: Machine ID. Gym location. Weight stack. Seat position. Arm pad position. Grip type. Repetitions. Sets. RIR. Rest intervals. Support preacher-style curl machines as a separate equipment variation where appropriate.
B. Standing EZ-Bar Biceps Curl. Track: Total weight. Bar weight, if known. Plate weight. Repetitions. Sets. RIR. Rest intervals. Grip width. Technique notes. Never assume that an EZ bar weighs a standard amount. Allow unknown bar weight.
Keep machine and free-weight progression histories separate.

**5. Side Delts — Dumbbell or Cable Lateral Raises.** Support two variations.
A. Dumbbell Lateral Raise. Primary muscle: Lateral Deltoid. Track: Weight per dumbbell. Repetitions. Sets. RIR. Rest duration. Standing or seated variation. Simultaneous or alternating execution.
B. Cable Lateral Raise. Primary muscle: Lateral Deltoid. Track: Cable machine ID. Gym location. Attachment. Weight stack. Pulley height. Unilateral or bilateral execution. Repetitions. Sets. RIR. Rest intervals.
Keep the progression history of dumbbell and cable lateral raises separate. Both contribute to weekly side-delt volume.
Important unilateral counting rule: If I perform 3 sets with my left arm and 3 sets with my right arm as one complete unilateral exercise, count this as 3 sets for each side, not 6 sets for the overall muscle group. Allow left/right performance tracking when practical.

**6. Quadriceps — Barbell Squat or Leg Extension Machine.** Support both variations.
A. Barbell Back Squat. Main muscles: Quadriceps. Gluteus Maximus, depending on execution. Additional involvement: Adductors. Spinal Erectors as stabilizers. Track: Total weight. Bar weight, if known. Plate weight. Repetitions. Sets. RIR. Rest intervals. Squat depth. Bar position. Stance width. Technique notes. Never assume bar weight without confirmation.
B. Leg Extension Machine. Primary muscle: Quadriceps. Track: Exact machine ID. Gym location. Weight stack. Seat position. Backrest settings. Pad position. Repetitions. Sets. RIR. Rest intervals.
Keep squat and leg extension progression histories separate. Both should contribute appropriately to quadriceps volume.

**7. Hamstrings — Romanian Deadlift or Leg Curl Machine.** Support both variations.
A. Romanian Deadlift (RDL). Primary muscles: Hamstrings. Gluteus Maximus. Additional involvement: Spinal Erectors as stabilizers. Forearms and grip. Track: Barbell or dumbbell variation. Total weight. Bar weight, if known. Repetitions. Sets. RIR. Rest intervals. Range of motion. Technique notes.
B. Leg Curl Machine. Support available variations: Seated Leg Curl. Lying Leg Curl. Standing Single-Leg Curl, if available. Primary muscles: Hamstrings. Track: Exact equipment ID. Gym location. Manufacturer and model. Weight stack. Machine configuration. Seat position. Ankle pad position. Repetitions. Sets. RIR. Rest intervals.
Keep different leg curl machine variations separate in progression tracking. All variations should contribute appropriately to weekly hamstring volume.
Do not treat RDL and leg curls as biomechanically identical. They train the hamstrings through different movement functions and should be represented separately in the exercise database.

**8. Hanging Ab-Strap Leg Raises and Crunches** — an important exercise category.
I perform abdominal exercises using hanging straps that support my upper arms underneath the shoulders, allowing me to hang without gripping a pull-up bar with my hands.
This setup may also be referred to as: Hanging Ab Straps. Vertical Knee Raise with Arm Supports. Captain's Chair, depending on the equipment design.
Do not automatically merge these equipment variations if their mechanics differ.
Support at least two exercise variations:
A. Hanging Leg Raises. The user raises straight or slightly bent legs while suspended in arm-support straps. Primary target: Rectus Abdominis, depending on pelvic movement and execution. Secondary involvement: Hip Flexors. Track: Equipment ID. Strap or arm-pad configuration. Gym location. Straight-leg or bent-knee variation. Repetitions. Sets. RIR. Rest intervals. Range of motion. Technique notes.
B. Hanging Knee Raises / Abdominal Crunches. The user raises the knees and actively curls the pelvis toward the torso, emphasizing abdominal shortening rather than simply lifting the legs through hip flexion. Primary target: Rectus Abdominis. Secondary involvement: Hip Flexors. Track: Equipment ID. Variation. Repetitions. Sets. RIR. Rest intervals. Technique notes.
Important biomechanical distinction: A simple hip-flexion-based leg raise should not automatically receive the same abdominal training classification as a controlled movement involving posterior pelvic tilt and spinal flexion. Distinguish between: Hip flexion. Abdominal pelvic curl. Combined movement. Keep these exercise variations separately identifiable. Do not assign full abdominal working-set credit to movements that primarily train hip flexion without meaningful abdominal loading.

### 2. EXERCISE DATABASE AND EQUIPMENT IDENTIFICATION
Inspect the existing exercise and equipment database. Make sure every exercise above has: A unique exercise ID. A clear English name. A Russian display name. Exercise category. Primary muscles. Secondary muscles. Muscle contribution coefficients. Supported equipment types. Required logging fields. Exercise-specific settings.
The exercise database must support different equipment instances across different gyms. For example: Gym A: Technogym Pec Deck, Cable Machine 001, Dumbbells. Gym B: Matrix Pec Deck, Cable Machine 002, Different dumbbell increments. These must have independent equipment identifiers.
Do not compare weight numbers across different machines as if they represented identical resistance.
Remember confirmed machine settings and make them available when logging future workouts.

### 3. FULL WORKOUT LOGGING VALIDATION
For every exercise listed above, test the entire process. A user must be able to: 1. Select the exercise. 2. Select the correct exercise variation. 3. Select an existing machine or equipment instance. 4. Choose the gym location. 5. Enter working weight. 6. Enter repetitions. 7. Enter RIR. 8. Record rest duration. 9. Add multiple sets. 10. Mark warm-up sets separately. 11. Save the workout. 12. Review its historical record. 13. See its effect on weekly muscle volume. 14. See its effect on the progression chart. 15. Use the saved information in future workout recommendations.
The application must also support natural-language workout imports from Claude. For example:
"Today I trained at Gym A. Incline dumbbell press, 25 kg each hand, 3 sets of 10, RIR 2. Pec deck, 45 kg, 3 sets of 12, RIR 1. Cable triceps pushdown with a straight bar, 25 kg, 3 sets of 12."
The parser must correctly identify: Exercise names. Exercise variations. Equipment. Individual dumbbell weights. Sets. Repetitions. RIR. Gym location.
Do not invent missing values. If a machine cannot be identified confidently, flag it for confirmation rather than assigning it to the wrong equipment record.

### 4. MUSCLE VOLUME INTEGRATION
For all preferred exercises, verify direct and indirect muscle involvement. Use the existing fractional set accounting system. Initial model: Primary muscle: 1.0. Significant secondary muscle: 0.5. Minor contribution: 0–0.25. Insignificant contribution: 0. These are practical estimates, not precise biological measurements.
Do not blindly apply identical coefficients to different variations. For example: Incline dumbbell press must contribute to chest, triceps and anterior deltoids according to its execution and angle. Pec Deck must primarily contribute to chest. Cable pushdowns must primarily contribute to triceps. Lateral raises must primarily contribute to side delts. Squats and leg extensions must contribute to quadriceps differently from leg curls and Romanian deadlifts. RDLs and leg curls must both contribute to hamstrings, while preserving their distinct exercise characteristics. Hanging abdominal movements must be evaluated according to actual pelvic and spinal movement.
When appropriate, store regional muscle emphasis separately from the total muscle-group volume.
Do not double-count the same working set. Every set must have one unique record and all muscle-volume calculations must be derived from that record.

### 5. PROGRESSION AND HISTORICAL DATA
For each preferred exercise, ensure that the application stores a complete progression history. Display: Previous working weights. Current working weights. Repetition trends. RIR trends. Rest-period history. Personal bests. Estimated progression opportunities. Equipment-specific performance trends.
Keep these exercise variations distinct: Incline Dumbbell Press vs Flat Dumbbell Press. Straight-Bar Pushdown vs Rope Pushdown. Machine Biceps Curl vs EZ-Bar Curl. Dumbbell Lateral Raise vs Cable Lateral Raise. Barbell Squat vs Leg Extension. Romanian Deadlift vs Seated Leg Curl. Hanging Straight-Leg Raise vs Hanging Knee Raise with Pelvic Curl.
They may contribute to the same muscle-group volume while retaining separate performance records.
Do not recommend weight increases without sufficient historical evidence.

### 6. MAIN DASHBOARD INTEGRATION
The preferred exercises must be fully reflected in the main analytical dashboard. After logging these exercises, verify that: Chest volume increases correctly. Triceps volume receives direct and indirect contributions correctly. Anterior delt volume reflects pressing work. Side delt volume reflects lateral raises. Biceps volume reflects curls and indirect pulling work. Quadriceps volume reflects squat and leg extension work. Hamstrings volume reflects RDLs and leg curls. Glute volume reflects exercises that meaningfully load the glutes. Abdominal volume reflects the correct hanging movement.
The remaining weekly working sets must be recalculated immediately after a workout is saved. The dashboard must clearly show how much quality volume remains for every muscle group.

### 7. UPDATE CLAUDE.MD
Update the existing root-level `CLAUDE.md`. Do not overwrite unrelated instructions. Add a dedicated section describing: All preferred exercises. Their variations. Equipment identification rules. Required logging fields. Biomechanical interpretation. Fractional set counting. Unilateral exercise counting. Weight interpretation rules. Natural-language workout parsing. Historical progression rules.
Also update `WORKOUT_PARSING.md` with realistic examples for every preferred exercise. Ensure future Claude sessions use the same exercise names, equipment identifiers, and data schema.
Do not store private workout history or sensitive personal data in `CLAUDE.md`. The encrypted application database remains the source of truth.

### 8. AUTOMATED TESTING
Create or extend automated tests for all preferred exercises. At minimum, verify: All eight exercise categories are available. Every variation has a unique and consistent identifier. Dumbbell weight is interpreted as weight per dumbbell. EZ-bar weight is not assumed without confirmation. Machine histories remain separate across locations. Warm-up sets do not contribute to working-set volume. Direct and indirect contributions are calculated correctly. Unilateral sets are not double-counted. Hanging leg raises and abdominal pelvic curls are distinguishable. Every saved workout updates the weekly dashboard. Progression charts display the correct equipment-specific history. Imported workouts preserve all available information. No historical records are overwritten or lost.

### 9. FINAL END-TO-END AUDIT
Before finishing, perform a complete audit of the existing application. Create a report with three sections:
A. Already working correctly — list features that were already fully implemented.
B. Fixed or improved — list every missing feature or incorrect calculation that you fixed.
C. Remaining limitations — list anything that could not be reliably implemented and explain why.
For each of the eight exercise categories, explicitly confirm whether the following work: Exercise selection. Equipment identification. Workout logging. Sets and repetitions. Weight tracking. RIR. Rest intervals. Muscle calculations. Weekly volume. Progression history. Dashboard integration.
Do not claim that something works simply because an exercise appears in the catalog. Verify the actual end-to-end functionality.
Final objective: I want to be able to use these preferred exercises regularly, record my workouts quickly and accurately, and trust that every set is correctly reflected in my muscle-volume analytics, weekly remaining-set calculations, recovery estimates, and strength progression.
Make the necessary changes directly in the existing project while preserving all existing user data and functionality.

Also: after implementing, critically check that there are no mistakes.

---

# PART 2 — Per-set feedback + simple UI / smarter backend (requested 2026-11-21, after Part 1)

Status: **implemented** (2026-11-21, after Part 1 shipped), independently reviewed, findings fixed. Deviations from B.3 found during review: "a little too easy" alone does not allow a one-session increase; no increase right after a pain session; a reduction is about one step (or back to a clean load within ~1.5 increments); live sessions get `finishedAt` so edits after a past-dated finish are audited; feedback in edit mode starts collapsed.
The owner's two full requests are in the session transcript; their requirements are condensed faithfully below (B.1–B.2). Rules from the top of this file still apply.

## B.1 Request "Per-set difficulty, weight accuracy and technique feedback" (condensed)

- After each working set, one tap on "How did this set feel?": 1 Too easy · 2 A little too easy · 3 Just right · 4 Very hard, good technique · 5 Too heavy, technique compromised · 6 Wrong weight — too light · 7 Wrong weight — too heavy · 8 Pain / unusual discomfort. Short labels, description when selected, skippable, compact, mobile.
- Store THREE separate dimensions (never one ambiguous score): effort (very easy / easy / appropriate / hard / near max), weight-selection accuracy (correct / accidentally too light / accidentally too heavy / unknown), technique (good / slightly degraded / significantly compromised / unable to complete correctly / not assessed). A very hard set with good technique is not the same as a very hard set with bad technique.
- RIR stays separate and independent. Never derive an exact RIR from the button; "Just right" without RIR keeps RIR unknown. Optional estimated RIR RANGES allowed, clearly labelled as estimates.
- Never delete or ignore a bad set; keep actual weight, reps, RIR, feedback, rest, exercise/equipment. Distinguish (1) what was performed, (2) whether it was a good hypertrophy set, (3) whether it is useful for strength-progression analysis.
- Volume: normal sets count normally; very easy sets recorded but treated differently; compromised technique gives reduced/uncertain stimulus; wrong weight is not a representative progression set; pain flagged separately. No invented precise multipliers; any numeric adjustment configurable, transparent, evidence vs assumption labelled. Never change the raw set count. Per muscle: raw sets, high-confidence quality sets, easy sets, compromised sets, uncertain volume; the owner can inspect why each set was included or downgraded.
- Progression scenarios: A wrong weight too light: saved, not a progression benchmark. B just right at RIR 2: normal benchmark. C too heavy, compromised: saved, flagged as a poor benchmark, not proof of progress, consider recommending a lower weight with an explanation. D very hard with good technique (RIR 0–1): valid, not penalised.
- Learn personal working weights (first month and beyond) per exercise × equipment (× variation): loads consistently too easy / right / too heavy / technique-breaking, effort per exercise, rest vs following sets, decline across sets.
- Set-by-set feedback history per exercise (date, weight, reps, difficulty, RIR) with an easy visualisation; detect right loads, easy and heavy loads, technique improvement, effort change at the same weight, progression opportunities.
- Rest integration: if set 3 is much harder than set 1 at the same weight, check whether rest was shorter before concluding the weight is too heavy; use rest + rep decline + RIR change + feel change for rest and weight advice.
- Optional per-set note; edit previously saved sets with an AUDIT trail of corrections (original vs corrected values).
- Pain: ask the body area, short note, flag, not a normal quality set, show a caution against continuing a painful movement, never diagnose.
- Data: extend the set model (effort, weight accuracy, technique, quality status, pain flag and location, notes, intended weight, target reps …) following the existing architecture; safe migration; old sets stay valid with the new fields unknown; never invent historical feedback.
- Analytics: per muscle — sets performed, good-quality sets, unusually easy sets, compromised sets, uncertain volume; a separate load-accuracy and technique-over-time analysis; the dashboard stays simple, detail lives in the exercise and set views.
- Tests (12): too-easy saved; accidental light not read as progression; normal set gets normal quality; very hard + good technique not downgraded; compromised flagged; heavy-good distinguishable from heavy-compromised; RIR separate from feel; missing feedback valid; pain separate flag; rest available for analysis; corrections keep audit info; old records survive.
- Final audit + short report (what was added, how feedback works, effect on volume, effect on recommendations, tests, limitations); test every option on mobile and desktop.

## B.2 Request "UI simplification and advanced backend training analytics" (condensed)

- Principle: **simple UI, intelligent backend.** Two answers fast: (1) quality working sets still needed per muscle this week; (2) per exercise: increase / keep / reduce weight.
- Main screen: a plain list muscle → sets remaining (+ optional simple bar, clear "done" state). No breakdowns unless opened. Numbers = direct + indirect fractional sets × set quality (RIR, feel, technique, wrong weight), individual targets, no warm-ups; uncertainty handled transparently; show "calibrating" when history is insufficient instead of false precision.
- Every exercise: one clean progression chart (weight and reps, together or separately), plateau indication, one next-session recommendation. The backend uses weight, reps, sets, RIR, feel, technique, rest, exercise order, equipment identity, machine increments, history, consistency. Never compare machine instances; dumbbells per dumbbell; bar weight when known.
- One recommendation per exercise: INCREASE (from → to, smallest increment) / KEEP / REDUCE (e.g. repeated technique breakdown) / POSSIBLE PLATEAU (review rest, technique, recovery, load) / NOT ENOUGH DATA. Never increase after one good set; never reduce just because a set was hard.
- Plateau detection: multiple comparable sessions only (same exercise × equipment × variation, benchmark sets); separate normal fluctuation, temporary fatigue, insufficient recovery and inconsistent execution from a real stall; a plateau does not automatically mean more volume or a new exercise.
- Weight calibration from feedback, equipment and variation specific; accidental weight errors are not performance changes.
- Weekly report: short and actionable (muscles behind + sets left, progressing exercises, increase list, keep/reduce list, plateaus); details collapsible.
- UI: no extra cards, scores, charts, tables or repeated info; one muscle list, one chart + one recommendation per exercise, a short weekly summary; details on demand.
- Architecture: all analytics in tested `src/domain` modules, one source of truth for dashboard, charts and recommendations; edits recompute everything; raw data preserved so the model can be re-run. Tests: fractional sets, set quality, remaining volume, weight progression, plateau detection, equipment-specific comparison, accidental weight errors, technique adjustments, rest interpretation.

## B.3 Review of the requests and proposed decisions

1. **One tap stores the choice AND the three dimensions.** `WorkoutSet.feel` keeps the button (raw input); `effort`, `weightAccuracy`, `technique` are derived defaults the owner can change in an expandable row. Mapping: too_easy → very_easy/correct/not_assessed; bit_easy → easy/correct; just_right → appropriate/correct/good; hard_good → near_max/correct/good; too_heavy_form → hard/correct/compromised; wrong_light → effort unset/too_light; wrong_heavy → effort unset/too_heavy; pain → pain flag (+ area, note), the rest not assessed. Existing `techniqueOk: false` keeps meaning "compromised".
2. **No new effort multipliers.** A logged RIR always wins (evidence-based table). Without RIR, the feel gives an ESTIMATED RIR range fed through the existing RIR table at its conservative end and marked "estimate" (too easy ≈ 5+ → 0.3; a little easy ≈ 3–4 → 0.6; just right ≈ 1–3 → 1.0; very hard ≈ 0–1 → 1.0). RIR itself is never written. Compromised technique → existing ×0.7 (Settings); "unable to complete correctly" → ×0.7 + uncertain. Pain → raw count kept, effort credit kept, but marked uncertain and excluded from the high-confidence count. Wrong weight → stimulus by RIR/feel as usual (the muscle still worked); only progression excludes it.
3. **Quality status per set** (derived, not stored): high-confidence / reduced (low effort or compromised technique) / uncertain (no effort info, estimate only, pain). Muscle detail shows the counts and the reason per set.
4. **Progression benchmark sets** exclude wrong weight, pain, compromised or failed technique. Too-easy feel at the top of the range → fast-path increase (like RIR ≥ target + 2). At least half of the last session's working sets compromised at the working load, or two sessions in a row with a compromised top set → REDUCE one step with an explanation. A hard set with good technique never triggers a reduction.
5. **Plateau v2:** comparable = benchmark sets of the same history key; ≥ 4 sessions over ≥ 21 days; sessions with high fatigue (≥ 4), short sleep (< 6 h) or markedly shorter rest (< 70 % of the median) are set aside when deciding; "possible plateau" only if the remaining comparable sessions show no new best; the explanation lists which factors were checked.
6. **Load calibration:** per history key, a small load map weight → feel counts → e.g. "25 kg right, 27.5 kg too heavy"; shown in the exercise view only.
7. **Rest interpretation:** within a session, if reps or feel worsen at the same weight and the rest before was < 70 % of that exercise's typical rest, the explanation says "shorter rest (X s vs usual Y s)" instead of "too heavy".
8. **Corrections:** editing a completed set in a finished workout appends `{at, field, from, to}` to `WorkoutSet.corrections`; shown in History. Live-session edits are not audited (still being entered).
9. **Import v1.2 (additive):** set `feel`, `effort`, `weight_accuracy`, `technique`, `pain_area`, `intended_weight_kg`; follow "Changing the import contract" in CLAUDE.md.
10. **Simple UI:** Dashboard = muscle list (number left + bar + done tick; "calibrating" note while in Learning Mode); body map, last-week card and the detail facts move behind one "More details" disclosure. Strength list = one recommendation chip per history (Increase / Keep / Reduce / Possible plateau / Not enough data); detail = one chart with a Weight / Reps / Both toggle and the recommendation, then collapsible feedback history, load map, PRs and sessions. Weekly report: short summary first, the rest collapsible.

## B.4 Work order

1. Commit + push Part 1. 2. Types + defaults + quality (feel → dimensions, estimated RIR, status). 3. Volume and muscle counts (high-confidence / easy / compromised / uncertain). 4. Progression (benchmark filter, reduce rule, too-easy fast path, plateau v2, rest interpretation, load map). 5. Logger: one-tap feel row after ✓, expandable dimensions, pain area + caution, per-set note. 6. History edit audit trail. 7. Import v1.2 + docs + CLAUDE.md + Science page. 8. Dashboard / Strength / Report simplification. 9. Tests (the 12 + the backend list). 10. E2E on phone and desktop, every option. 11. Independent review. 12. typecheck/test/build/commit/push/live check. 13. Short report.

---

# PART 3 — Known weaknesses, mobile layout audit, smart equipment memory, research library and workout prescriptions (requested 2026-11-21, after commit 5c5bec2)

Status: **implemented 2026-11-21** (see the final report in the session). Parts 1–2 and the recovery-timing fix are live (commits 8f472b5, 0a948b5, 5c5bec2). The owner's full request is in the session transcript; it is condensed faithfully in C.3 (every acceptance test is listed in C.6). Rules at the top of this file still apply, plus: never invent research findings, DOIs or PMIDs; never claim to measure muscle growth.

## C.1 Known weaknesses to fix (from the Part 1/2 reports and both independent reviews)

1. **Mobile layout (owner-reported):** on the phone some elements are wider than the card/background around them. Audit EVERY route and every open state (modals, pickers, Setup panel, feedback grid, expanded rows, tables, charts, More sheet, lock screen) at 320, 360, 375, 390 and 414 px, light and dark. Detection script (in-app browser): for every element, flag `rect.right > parentCard.right + 0.5`, `rect.left < parentCard.left − 0.5`, `scrollWidth > clientWidth` on non-scroll containers, and `document.documentElement.scrollWidth > innerWidth`. Known suspects: `-mx-4` tables in Strength/History/Import (bleed past cards), `min-w-[420px]/[480px]/[340px]` tables, Recharts containers, the sticky chip strip, Segmented controls, long badges, the RIR row with 6 chips + Fail + ✓, 4-column feedback grid, settings grid, NumInput widths in chips rows. Fix so every element stays inside its card with its 16 px gutter and things are centred; intentional horizontal scrollers must be visibly scrollable inside their card, never past it. Re-run the script until 0 findings and screenshot each page.
2. **Grip shown for every exercise** (Logger Setup always shows Grip / Grip width / ROM) → becomes per-exercise fields (C.3 §2). Existing stored grip values stay and are still displayed.
3. **Older incline sessions without an angle** sit in an "angle not recorded" history → add a one-time "assign an angle to earlier sessions of this exercise" action on the Strength page (bulk edit WITH the corrections audit).
4. **Learning Mode start date** ignores imported earlier workouts → use the earliest workout date (never later than the first logged one).
5. **Dumbbell default increment 2 kg** — real dumbbells often go up 2.5 kg (or 1 kg). Let the owner set dumbbell/kettlebell increments per gym ("Dumbbells at Gym A: 2.5 kg") so steps and prescriptions use real available weights; keep 2 as fallback.
6. **Novelty after an id split:** switching from `triceps_pushdown` to `triceps_pushdown_bar` (or barbell_curl → ez_bar_curl, preacher_curl → machine_biceps_curl) counts as a "new exercise" (+12 h recovery) for 3 weeks → treat legacy/new id pairs as the same movement for the novelty rule.
7. **Name-only re-imports** of old JSON after the alias moves hash differently (only `client_ref` blocks them) → also block duplicates by (date, gym, set fingerprint without exercise id) as a warning.
8. **"Good quality"** includes sets whose effort is only estimated from feel → show "good (estimated)" separately in the muscle detail.
9. **Feedback prompt visibility:** after ✓ the logger scrolls to the next set; make sure the just-finished set's "How did it feel?" row stays visible (scroll so both are on screen) — verify on a 375×667 viewport.
10. **Squat depth / DB lateral execution** are recorded but unused → keep unused, but say so in the Setup hint ("recorded for your history; doesn't change muscle credit").
11. **Effort missing entirely** → 0.75 provisional; surface a gentle "tap how it felt" nudge on the Today screen only when ≥ 50 % of this week's sets lack effort.
12. Re-check after the changes: the deload callout, Body map, Periodization, Body and Exercises pages still work and are reachable (nothing lost by the UI simplification).

## C.2 Decisions taken while reviewing the request (implement these unless the owner objects)

1. **Equipment memory already exists** (Equipment records with locationId, settings, increments, photos; Logger dropdown filtered to the workout's gym + unassigned items). Gaps to build: searchable picker, recents first, favourites (star), Edit from the logger, photo when creating, bar weight, and a **machine-first flow**: Gym → Machine (recent first) → its linked exercises → Today's prescription. Equipment with no gym (dumbbells/bars added before gyms existed) shows in a separate, labelled "Not assigned to a gym" group — never as if it belonged to the selected gym, with a one-tap "assign to this gym". Equipment for another gym is never shown by default (searchable under "Other gyms", clearly labelled).
2. **Exercise-specific fields:** move `grip` / `gripWidth` / `rom` into `variationFields` per exercise (lat pulldown & rows: attachment + grip/width; EZ curl: grip width; RDL: barbell/dumbbell is already two ids; pec deck / leg extension: settings only). ROM stays available under a collapsed "More options". Logged-but-hidden values still show in the summary line.
3. **Research library**, done during development only (the app keeps making ZERO network calls; the CSP stays). Location `src/data/scientific-evidence/` as typed TS: `references.ts` (title, authors, year, journal, DOI, PMID, URL, design, population, main finding in our own words, muscles, limitations, confidence, verified-on date), `muscles.ts` (per tracked muscle: findings, evidence level, explicit "limited evidence" notes), `exercises.ts` (exercise-specific findings), `rules.ts` (every calculation adjustment: id, rationale, source ids, confidence, research-derived vs heuristic, configurable default). Plus `SCIENTIFIC_METHOD.md`, and docs/RESEARCH.md merged/linked. **Every DOI/PMID must be verified by actually fetching PubMed / doi.org at dev time; anything not verified is excluded, not guessed.** EMG / acute activation / MPS are labelled as indirect evidence, never as proven hypertrophy. No copyrighted text — short findings in our own words. A test checks every reference has DOI or PMID + design + confidence, and every rule cites existing reference ids or is marked heuristic.
4. **Hypertrophy engine:** keep the current transparent model (coefficients × set quality, per-session taper); add only adjustments that the research library supports, each in the rule registry (configurable, with confidence). No stacking of arbitrary multipliers; no double counting. Likely candidates only if evidence holds: lengthened-position / ROM notes per exercise (Wolf 2023, Pedrosa, Maeo 2021/2023, Kassiano), regional notes (incline → clavicular), "hip flexion ≠ abs". If evidence is weak → explanatory note, not a multiplier.
5. **Prescription engine** = new pure module `src/domain/prescription.ts` (fully tested), using the existing analysis (series for exercise × equipment × configuration, remaining weekly sets, today's share, recovery, load map, rest history, increments):
   - **Sets:** from today's share of the exercise's primary muscle ÷ its coefficient, minus what other exercises already gave that muscle today; clamped to 1…per-exercise max (e.g. 4 isolation / 5 compound); 0 with an explanation when the muscle is done or still recovering.
   - **Load:** from double progression + feedback (existing `suggestNextLoad`), snapped to the equipment's real increments; per set.
   - **Reps:** a range per set from the owner's own reps at that load (typical within-session drop at their usual rest), inside the exercise's range; never one "magic" range.
   - **RIR target:** 1–2 for machines/isolation, 2–3 for free-weight compounds, +1 if technique broke down recently; never "failure on every set".
   - **Rest:** the owner's median rest for that exercise, bounded by evidence (longer for compounds); shown as a range.
   - **Warm-up:** existing `warmupFor`, extended with: first exercise for those muscles or not, earlier same-muscle sets, available increments and the owner's own warm-up habit (from logged warm-up sets).
   - **Confidence:** high = ≥ 4 comparable sessions in 8 weeks, moderate = 2–3, low = 0–1 (then "calibrating" + the honest reason). Calendar days alone never unlock it.
6. **Adaptive set-by-set:** after each ticked set, recompute the remaining sets from actual reps, RIR, feel and technique (not feel alone): clearly too easy + good technique + top of range → "+1 step if the next weight exists, else +reps"; RIR 0 with broken technique → one step down; otherwise keep. Store the prescription separately on each set (`WorkoutSet.prescribed?: { weightKg, repsMin, repsMax, rir, restSec }`) so prescribed vs performed are never mixed. Import/export schema → v1.3 (additive).
7. **UI:** a "Today's workout" card per exercise in the logger (warm-ups, then the set table with weight / reps / RIR, rest), pre-filling the planned sets; the existing one-tap feedback stays; a one-line "why" when the call needs clarification. No research numbers in the normal UI (they live on the Science page).

## C.3 The owner's request (condensed; full text in the session transcript)

1. **Equipment memory & dropdowns:** first visit — select/create gym, add a new machine (name, manufacturer/model if known, optional photo) → permanent record with unique id, available for future workouts at that gym. Next visit — select gym → dropdown of that gym's machines → select → previous settings and history load → choose variation → enter sets. Required: gym dropdown, equipment dropdown filtered by gym, searchable, recently used, optional favourites, Add new, Edit. Never associate a machine with the wrong gym. Remember name, manufacturer, model, photo, gym, type, stack increments, available weights, seat/handle/other adjustments. Same exercise name ≠ same machine; separate histories. Fast: Gym → Machine → Exercise → Prescription; no repeated forms.
2. **Exercise-specific fields, grip not universal:** each exercise defines its relevant parameters. Incline DB press: weight per hand, bench angle, reps, RIR, rest. Pec deck: machine, stack, seat, handle position, reps, RIR. Cable pushdown: machine, attachment, weight, reps, RIR, rest. Lat pulldown: machine, attachment, grip type/width when relevant, weight, reps, RIR. EZ curl: total, bar weight if known, plates, optional grip width. Leg extension: machine, weight, seat, pad, reps, RIR. RDL: barbell/dumbbell, total, reps, RIR, technique notes. Optional fields available, never forced.
3. **Research database per muscle** (chest incl. clavicular/sternocostal, incline vs flat, DB vs machine, isolation, ROM, resistance profile & length; back: lats, upper back, traps, pulling planes, grips/elbow paths; shoulders: front/side/rear, pressing vs isolation, DB vs cable laterals; arms: biceps, brachialis, triceps, elbow/shoulder positions, direct vs indirect, lengthened vs shortened; legs: quads, hamstrings, glute max, adductors, calves, squat variations, leg ext, leg curls, RDL, hip extension, knee flexion, ROM; abs/spine: rectus abdominis, obliques, erectors, hip flexion vs spinal flexion). State uncertainty where evidence is limited; never invent.
4. **Sources:** PubMed / PMC / peer-reviewed journals; prefer systematic reviews and meta-analyses, keep landmark older studies; save title, authors, year, journal, DOI, PMID, URL, design, population, findings, muscles, limitations, confidence. Separate EMG / acute activation / MPS from long-term hypertrophy. No copyrighted full text. Done at development time, stored versioned in the project (`src/data/scientific-evidence/`), plus `SCIENTIFIC_METHOD.md`; no external API during workouts.
5. **Hypertrophy adjustment engine** considering volume (direct/indirect/fractional/weekly/frequency/history), effort (RIR, feel, failure proximity, technique, wrong weight), exercise characteristics (muscles, biomechanics, length, ROM, resistance profile, joint actions, variation, machine), individual response (progression, consistency, calibration, observed response to volume, recovery), fatigue (exposure, repeated hard sets, deterioration, rest, soreness). No false precision; keep separate: recorded sets, effective-set estimates, set quality, load recommendations, confidence. Every numeric adjustment: rationale, source, confidence, configurable, research vs heuristic. No arbitrary multiplier stacking, no double counting; transparent and testable.
6. **Personalized prescription** after ~30 days: select gym → exercise → machine → today's prescription using history on that equipment, typical weight, reps, RIR, technique, rest, increments, weekly volume done/remaining, workload and recovery. Show warm-up (weight × reps), working sets (weight, rep range, target RIR), number of sets, rest, increase/keep/decrease. Warm-up depends on working weight, exercise type, first heavy exercise or not, prior same-muscle work, increments, personal habit; not counted; not one scheme for all. Working weights per set from history, never after one good set. Sets from remaining weekly volume, earlier sessions, indirect work, recovery, performance — never the whole week in one session, no forced extra sets. Rep ranges from exercise/muscle/equipment/history/RIR/evidence — not one magic range. RIR personalised (exercise, phase, technique history, fatigue, safety); no mandatory failure.
7. **Adaptive set-by-set:** reassess remaining sets after each logged set (actual reps, RIR, feel, technique, history — not feel alone); may add load if practical, keep weight and add reps, or defer the change to next session; may reduce after broken technique at RIR 0. Preserve prescribed vs performed separately.
8. **30-day calibration:** learn working weights, rep ranges, rest, frequency, preferred exercises, equipment, feedback, trends, recovery; baseline after ~1 month; 30 days ≠ enough evidence automatically; new exercise/machine → "more calibration needed"; confidence high / moderate / low; improves with more data.
9. **Simple UI:** "Today's workout" = warm-ups, working weights, number of sets, rep targets, RIR targets, rest; per-set quick feedback; science stays in the backend; short explanation only when needed; feels like a personal trainer, not a dashboard.
10. **Data/architecture:** inspect first; preserve workouts, history, equipment, gyms, settings, encryption, existing progression; safe migrations; reusable tested modules; no calculation logic in UI; personal data stays encrypted (research metadata is not personal data).
11. **Final report:** equipment dropdowns, machine memory by gym, exercise-specific fields, sources per muscle, hypertrophy-engine improvements, prescription functionality, warm-up & working-weight logic, tests performed, limitations; never claim untested features work.

## C.4 Work order

1. Read CLAUDE.md, this Part 3, `src/ui/pages/Logger.tsx`, `Equipment.tsx`, `src/domain/progression.ts`, `analysis.ts`, `docs/RESEARCH.md`.
2. Show the owner the C.2 decisions as a short list; proceed unless told otherwise.
3. **Mobile layout audit + fixes (C.1 #1) first**, because every later UI change builds on it; keep the audit script in `scripts/` (dev-only) and re-run it at the end.
4. Weakness fixes C.1 #2–#12 (each with a test where it is logic).
5. Equipment memory & machine-first picker (C.2 #1).
6. Exercise-specific fields (C.2 #2).
7. Research library + SCIENTIFIC_METHOD.md — collect and VERIFY sources per muscle group; exclude anything unverified. Owner's instruction on sourcing: no broad web search — use known good databases and well-known articles:
   - Start from what the repo already has: grep `docs/RESEARCH.md`, `src/ui/pages/Science.tsx` and `CLAUDE.md` for existing, already-verified references.
   - Seed with well-known reviews and landmark trials in the field (e.g. Schoenfeld volume/load meta-analyses, Pelland 2026, Refalo 2023, Robinson 2024, Wolf 2023 ROM meta-analysis, Pedrosa 2022, Maeo 2021/2023, Kassiano 2023, Plotkin 2022, Baz-Valle 2022) — each still verified, never cited from memory alone.
   - Find additional sources only through PubMed's E-utilities API (`eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` / `esummary.fcgi` / `efetch.fcgi` for abstracts), Europe PMC (`www.ebi.ac.uk/europepmc/webservices/rest/search`) and Crossref (`api.crossref.org/works/<doi>`) for DOI checks; prefer systematic reviews / meta-analyses (PubMed filter `systematic[sb]` or publication type Meta-Analysis).
   - A reference is accepted only if its PMID resolves in PubMed AND its DOI resolves in Crossref with matching title/year/journal; findings are written in our own words from the abstract.
   - Parallel agents: one per muscle group (chest, back, shoulders, arms, legs, abs/spine), plus a separate verifier agent that re-checks every DOI/PMID and every claim against its abstract, and flags EMG/acute findings presented as hypertrophy.
8. Rule registry + any evidence-backed engine adjustments (C.2 #4).
9. Prescription engine (C.2 #5) + adaptive set-by-set (C.2 #6) + schema v1.3 + docs.
10. "Today's workout" UI (C.2 #7).
11. Tests for all 30 acceptance items (C.6) + E2E in the in-app browser on a synthetic localhost vault (two gyms, close and reopen = reload + unlock), phone and desktop; delete the vault afterwards.
12. Independent review of the diff (fresh reviewer, the code not my conclusions); fix findings.
13. typecheck / test / build / commit / push / verify live; update CLAUDE.md (new section H) and FIX_PLAN status.
14. Final report (C.3 §11) — say plainly what was and wasn't tested.

## C.5 Mobile audit acceptance

- 0 findings from the overflow script on every route and open state at 320 / 360 / 375 / 390 / 414 px, light and dark.
- Every card, row, chip group, table and chart sits inside its parent with consistent 16 px side gutters and is centred; no page-level horizontal scroll; intentional scrollers scroll inside their card.
- Screenshots of each page at 375 px reviewed by eye (not only by script).

## C.6 Acceptance tests (owner's list)

Equipment memory: 1 create Gym A · 2 add a machine to Gym A · 3 close and reopen the app · 4 select Gym A · 5 the machine is in the dropdown · 6 its settings and history are preserved · 7 create Gym B with a different machine · 8 Gym A's equipment is not a default choice at Gym B · 9 known equipment is selectable without recreating it.
Exercise fields: 10 no grip where irrelevant · 11 grip/attachment where relevant · 12 machine settings preserved.
Research: 13 every tracked muscle has a review or an explicit evidence limitation · 14 all DOIs and PMIDs verified · 15 nothing fabricated · 16 EMG never presented as proven hypertrophy · 17 every calculation adjustment has a documented rationale.
Hypertrophy engine: 18 direct/indirect volume correct · 19 exercise-specific contributions correct · 20 poor-quality sets not equal to sound sets · 21 no double counting · 22 recalculation preserves original data.
Prescriptions: 23 select known gym/exercise/machine · 24 that machine's history loads · 25 warm-ups generated correctly · 26 working weights respect machine increments · 27 individual rep and RIR targets · 28 number of sets reflects remaining weekly volume · 29 completed sets adjust the remaining prescription · 30 insufficient data gives an honest warning, not invented precision.

---

# PART 4 — First-workout readiness audit + "less text, more numbers" (requested 2026-11-21, during Part 3; do AFTER Part 3 ships)

Status: **implemented and shipped** (2026-11-21, commit after 5befbc2). Everything listed in D.1–D.7 is done and tested: typecheck clean; vitest green (incl. tests/six-month.test.ts — 26-week simulation vs an independent reference — and tests/review-part4.test.ts); Playwright WebKit: e2e/readiness.spec.ts (first workout end to end on iPhone 13: gym, sets, rest, new machine + photo, reload + unlock → resume with nothing lost/duplicated, summary numbers checked by hand, weekly table, back at Gym A the machine is offered with its settings/history) and e2e/responsive.spec.ts (0 overflow findings in 32 states × 4 viewports).

Independent review of the Part 4 diff found 13 defects, all fixed with regression tests: progress % mixed kg and reps indices; assisted pull-up "system mass" added the assistance; a pending autosave could re-create a deleted workout; finish "records" counted wrong-weight/broken-technique sets; per-side rest never measured; weekly "quality sets" summed across muscles (now each set once); fractional RIR counted as 3+; assisted advice labels; skipped count; imported vs logged pull-ups in different histories (loading now derived from the load); 4-week rates diluted before the first workout / after today; body-weight date not validated; rest countdown after Done. The six-month simulation also found: progress % computed from 0.1-rounded indices; one bad session could turn "progressing" into "plateau"; a slow 8-week decline read as "stable" — fixed (rules registry: single_bad_session, sustained_decline, index_scale).

Known limits: Playwright WebKit on Windows is not real iOS Safari (native pickers, camera, PWA install, background timers on a locked phone are not verifiable here).

Six-month QA audit (owner's request 2026-11-21, after Part 4) — **done**: deterministic 26-week simulation (tests/sim/sixMonth.ts) vs an independent reference (tests/sim/reference.ts) — 205 numeric checks, 0 failures; property tests (fast-check, fixed seed); encrypted-store integrity, migration, backup/restore and 6/12/24-month performance tests; reports tests; Playwright journeys on 4 WebKit viewports with screenshots in test-artifacts/six-month-audit/. Defects found and fixed (each with a regression test): order-dependent rounding (0.75×0.7 credited 0.52); weighted pull-up index on the belt alone (belt change read as +40 %); weekly report mixed index scales; weekly/monthly body averages double-counted days; Σ-over-muscles shown as "quality sets" (dashboard header, details, Periodization chart, growth-signal chip); growth-signal strength rule (2 declines cancelled 12 improvements); every table forced to 560 px (last columns hidden on phones); Progress vs baseline table hid the % and could not tell two pec decks apart; "Best reps" counted wrong-weight sets; summary rounded 0.25 to 0.3; body trend shown to 0.01 kg. Final verdict in the session report.

Owner's two pasted requests (full text in the session transcript), condensed. Don't rebuild; audit, fix, test the real workflows. Preserve all data, encryption, backups.

## D.1 First-workout readiness (owner's 14 sections)
1. **First visit:** Start Workout → pick or create gym (name, optional address/description) → train. No big setup form; equipment added gradually while training; gym remembered; next visit the gym is in a dropdown and its equipment appears.
2. **New equipment mid-workout:** exercise → existing equipment or "Add new" → optional photo (camera capture via `<input type=file accept=image/* capture=environment>` + gallery fallback, preview, retake/replace, encrypted storage) → name or suggested type → saved to current gym → log immediately. Make/model optional ("identify later"); never block. Optional: name, manufacturer, model, photo, stack increments, gym, notes. Dumbbells = per dumbbell; machines = displayed stack value; never convert between machines.
3. **Fast logging:** compact table per exercise (set · weight · reps · RIR); Complete set / Add set / Finish exercise / Next exercise; actual weight, reps, RIR, failure, difficulty/technique, warm-up vs working, notes; remember previous values per exercise × equipment; edit a set; autosave every set; only relevant fields.
4. **Rest timer:** auto-start after a working set; large countdown; +15 s, +30 s, Pause, Skip; visual + optional sound/vibration at the end; configurable default rest, per-exercise rest, remembers previous; records ACTUAL rest; manual adjust; never forced; stored when the next set starts; distinguish rest between sets / time between exercises / total duration; timestamp-based so it stays correct after backgrounding/locking the phone.
5. **Next exercise:** finish exercise → review its sets → pick next from preferred library → existing machine or new → previous weights load → continue; one session screen; add / reorder / remove / mark skipped / go back; never lose data.
6. **Live info bar:** duration, exercises done, working sets done, current exercise, current rest timer — nothing more.
7. **Finish summary (short, numeric):** duration, exercises, working sets, warm-up sets, tonnage, average rest; effective sets per muscle (+x.x, from the central engine); new PRs, weight increases, rep improvements, failure sets, compromised-technique sets; one Finish & save button.
8. **Integration:** one central engine updates weekly volume, remaining sets, direct/indirect, progression, equipment history, rest history, RIR/failure stats, recovery, weekly tonnage — no separate summary maths.
9. **Learning month:** learn exercises, machines, gyms, weights, reps, rest, proximity to failure, feedback, preferences from use; first set on a new machine works without a recommendation.
10. **Reliability:** autosave per set; duplicate-tap protection; resume interrupted workout; survives refresh/lock (completed sets never lost); offline OK; encrypted IndexedDB; clear "saved"; unfinished vs finished distinguishable; never silently discard partial sessions; corrections possible.
11. **Mobile-first:** big targets, numeric keypads, minimal scrolling, readable numbers, high contrast, easy camera, clear timer, no needless animation/pop-ups; desktop works too.
12. **Readiness test (synthetic localhost vault):** Gym A → incline DB press with dumbbells (+photo), 3 sets varying reps/RIR/failure/rest, timer + actual rest saved → Pec Deck new machine with photo at Gym A → more sets → another exercise → refresh/offline → resume, no duplicates/missing → finish summary (sets, duration, rest, effective volume, weekly remaining) → new workout at Gym A: Pec Deck in dropdown with history + settings.
13. **Final review** — PASS / FAIL / NOT TESTED for each: ready for first session; create gym + equipment immediately; photo from phone; new machine findable in dropdown; fast weight/reps; background-proof timer; switch exercises without loss; autosave; interrupt/resume; summary correct; weekly volume updated immediately; mobile genuinely convenient. Don't claim readiness from UI elements alone.
14. **Deliverable:** A readiness status · B improvements · C test results · D limitations · E first-session guide (start, create gym, photograph machine, log sets, rest timer, next exercise, finish, weekly analytics).

## D.2 "Less text, more numbers, simple visuals, deep backend"
- Four core metrics: weekly effective sets, progressive overload, intensity/proximity to failure, recovery.
- **Dashboard:** compact table per muscle: completed / target, remaining (DONE at 0; over-target shows actual volume without encouraging more), thin progress bars, PROVISIONAL marker when data is thin; no paragraphs; readable in ~5 s.
- **Workout screen:** prescription as a numeric table (Type · Weight/DB · Reps · RIR for warm-ups and sets), rest, next-session hint; no paragraphs (reasons only behind an optional expander).
- **Progress:** per exercise one clean chart (weight, reps) + small table (previous, current, best reps, next suggested, target RIR) + label INCREASE +2.5 KG / KEEP 25 KG / REDUCE TO 22.5 KG / PLATEAU / MORE DATA NEEDED.
- **Intensity:** weekly effort counts — RIR 0 / 1 / 2 / 3+, technically compromised, unknown effort, average RIR; muscular vs technical failure; no scoring system.
- **Recovery:** soreness, fatigue, sleep, readiness inputs; per-muscle READY / RECOVERING / UNKNOWN; no fake precision.
- **Weekly report:** table this week vs last week (workouts, working sets, effective sets, average RIR, tonnage) + behind-target muscles, progression lines, "next week" priorities. Short.
- **Tonnage:** weight × reps summed, secondary only; never compared across unrelated exercises.
- **Body:** body weight + 7-day average, waist, monthly photos; simple graphs; no composition estimates.
- **Text audit on every page:** "8 / 12 — 4 REMAINING", "25 → 27.5 KG", "QUADS — 12 / 12 — DONE", "PLATEAU — 4 SESSIONS"; short labels, units, tables/charts, no duplicates, details behind expanders; keep necessary context (per dumbbell vs total; estimates not shown as exact).
- **Backend:** keep all advanced logic in one engine (src/domain); every screen uses it; corrections recalc everywhere; raw data preserved; all calculations tested.
- **Science:** keep the library; show PROVISIONAL / LOW CONFIDENCE / MORE DATA NEEDED in the UI; details only on demand.
- **Navigation:** prefer four main sections — Dashboard, Workout, Progress (exercise graphs, plateaus, body weight), Settings (gyms, equipment, targets, backups, config). Critically review before changing; keep other pages reachable.
- Acceptance: dashboard shows completed/target/remaining for every tracked muscle; numbers first everywhere; each exercise has a graph; next-weight calls concise; workout shows exact prescriptions; RIR/failure/technique integrated; backend depth kept; text reduced; data preserved; calculations tested; mobile + desktop tested.

## D.3 Pull-ups (requested 2026-11-21, during Part 4)
- Check existing support (`pull_up`, `assisted_pull_up`, `bodyweight_plus` load mode, grip fields); implement only what is missing.
- Two variations × two grips, each with its OWN progression history: bodyweight vs weighted (dip belt), shoulder-width vs wide grip (grip width becomes part of the pull-up history key — pull-ups only; other exercises keep grip out of the key).
- Per set: body weight at the time (from Body log or entered), added belt weight (0 = bodyweight), reps, RIR, failure status, technique, rest, grip width, gym and pull-up station (optional equipment).
- Progression: max reps, working reps across sets, added-weight progression, body-weight change, trend, plateau. Weighted: show body weight and belt weight separately; any combined load (body + belt) labelled an ESTIMATE. A lower body weight is not lost strength; added weight is not the only progression (reps count too).
- Volume: lats 1.0, biceps ≥ 0.5 (≥ 0.75 supinated), upper back 0.5 via the existing coefficients; no double counting.
- Recommendation on selecting Pull-ups: bodyweight or weighted, suggested belt weight, target reps, sets, RIR, rest — from the owner's history.
- UI: Pull-ups → Bodyweight / Weighted · Shoulder-width / Wide → log sets fast; simple graph of reps and added weight; histories never mixed.

## D.4 Body weight at any time + workout integration (requested 2026-11-21, during Part 4)
- One "Add body weight" action on the Dashboard and Body page (not inside a workout): kg, measurement date + time pre-filled with now (editable), optional note and condition (morning fasted / after breakfast / before workout / after workout / evening). Store measurement timestamp (with timezone) SEPARATE from entry timestamp; analysis uses the measurement time. Multiple per day kept; duplicate-tap guard without merging legitimate repeats.
- Show: latest, today's measurements, 7-day rolling average, weekly trend, compact chart (points + 7-day average + long-term trend). Fluctuations ≠ mass change.
- Workouts: at analysis time pick the latest measurement taken BEFORE the session start (never one taken after); store/derive value, its timestamp and the gap; if none or too old → "unavailable / outdated" — never invented. Late entries back-dated before an earlier workout update the analysis automatically (derive, don't copy).
- Pull-ups: bodyweight sets use the session body weight as context; weighted show body weight and belt weight separately plus "estimated combined system mass" labelled an estimate; progression accounts for body-weight change (lighter = easier BW reps; added weight up while body weight down ≠ whole story); grips separate.
- Squats & others: body weight only as context next to the barbell load — never added as "total load"; no body-weight adjustment for unrelated machines.
- Recommendations use the latest valid pre-session body weight for weighted / bodyweight exercises; missing body weight never blocks logging.
- Storage: extend the encrypted Body records safely (existing entries untouched; old ones without a time = date only); corrections recalc derived analysis, never the workout's own weights/reps.
- Tests: 07:00 measurement entered at 20:00 keeps 07:00; two on one day both kept; workout picks the latest preceding one; a later-evening one is not applied to an earlier workout; weighted pull-up keeps body/belt separate; squat never adds body weight; 7-day average correct; logging works without body weight; old data intact.

## D.5 Weekly volume periods vs continuous recovery (requested 2026-11-21, during Part 4)
- Weekly volume = a reporting period (default Monday 00:00 in the configured timezone; week start day + timezone editable in Settings). New week → counters start at 0; previous weeks archived/accessible; NO data deleted; every completed set updates the current week immediately. A workout belongs to the week its session started in (even past midnight); set timestamps kept for recovery.
- Recovery never resets on Monday: rolling windows over the chronological exposure history (direct/indirect sets, quality, RIR, failure, technique, recent volume, soreness, fatigue, performance). Saturday's heavy session still counts on Monday; 0/12 weekly sets ≠ recovered; days passing alone ≠ recovered; uncertainty shown.
- Recommendations combine both (e.g. chest 0/12 this week, but Saturday 5 effective sets + moderate soreness → recovering → fewer/no sets); never force the full weekly target when recovery doesn't support it.
- Targets: never auto-changed after N workouts or one odd week; reviewed over multiple weeks (volume, strength progression, RIR, technique, recovery, consistency); a 4–8-week block review as a checkpoint; unchanged when progress + recovery are good.
- Architecture: immutable raw records; weekly reports and recovery derived from history; one engine.
- Tests (10): Monday starts a new period; previous week accessible; nothing deleted; each set updates the week immediately; Saturday relevant on Monday; recovery not reset by the new week; midnight-crossing workout assigned consistently; historical corrections update reports + recovery; targets not changed by single workouts; recommendations consider weekly volume + recent fatigue.

## D.6 iPhone 13 layout + dropdown/picker overflow (requested 2026-11-21, during Part 4)
- Primary device iPhone 13: 390 × 844 CSS px, DPR 3, portrait, touch. Also 375 × 812, 430 × 932, desktop.
- Audit every select, exercise/gym/equipment picker, date/time input, calendar, modal, popover, numeric input, settings menu, rest-timer controls — inside cards and forms. Menus stay within boundaries and the viewport, not clipped, aligned, scrollable when long, flip up/left when needed; no horizontal overflow; safe areas; usable with the keyboard open. Fix ROOT causes (e.g. iOS Safari's intrinsic min-width on date/time inputs and selects), no per-screen hacks, no overflow:hidden cover-ups.
- Test real interactions (top/bottom of screen, narrow cards, long option names, date, time, exercise, gym, equipment, while scrolling, keyboard open, modals/popovers); selected values readable.
- Screenshots BEFORE and AFTER at 390 × 844 with Playwright iPhone 13 emulation on WebKit → `test-artifacts/iphone-13/before/` and `/after/` (+ side-by-side). Screenshots inspected, not assumed.
- Responsive checks at all viewports: no page h-scroll, no clipped dropdowns, nothing outside its container, no overlaps, no cut-off text, no unreachable buttons, modals positioned correctly, touch targets ≥ 44 px where possible.
- Report: components with problems, root causes, changes, before/after screenshots, viewports, Playwright/WebKit results, remaining issues; never claim untested components pass.

## D.7 Baseline, strength progression % and a separate hypertrophy assessment (requested 2026-11-21, during Part 4 — "don't remove what already works better; evaluate critically")
- First ~4 weeks = baseline per exercise × equipment (× configuration): working weights, reps, RIR/failure, technique, rest, gym, body weight/measurements. Machines never compared. No hypertrophy claims from load increases. (Existing: Learning Mode 30 days, per-key histories — keep.)
- Strength progression per key: % vs baseline from an estimated performance index (RIR-adjusted e1RM from weight + reps + RIR; reps + RIR for bodyweight), only when baseline and current both have enough comparable, representative sessions (benchmark sets only: no wrong weight / pain / technique issues / technical failure; similar ROM; rest effects noted). Documented, consistent method. Separate histories per machine/configuration. Otherwise status "more data needed".
- Hypertrophy assessment = a SEPARATE system combining strength trend, weekly quality sets, consistency, proximity to failure, 7-day body-weight trend, circumferences, monthly photos. Windows: weeks 1–4 baseline (no claims) · 4–6 strength trend + first body changes · 8–12 first combined assessment vs baseline · then every 4 weeks. Status words, confidence; never a % of muscle growth; body-weight gain ≠ muscle; volume ≠ growth.
- 4-week internal check: current period vs baseline and previous period (strength by exercise, volume by muscle, consistency, body-weight trend, circumferences, recovery, plateaus); prescriptions change only when evidence supports it — never automatically because a period started.
- UI numbers only: Dashboard sets remaining; Today's workout table (set · weight · reps); Progress table Exercise · Baseline · Current · Progress % (only when reliable; else "—"/MORE DATA).
- Tests: baseline correct; % consistent; separate machines → separate baselines; reps/RIR changes reflected; wrong-weight sets don't create progress; body-weight averages by measurement time; strength vs hypertrophy kept separate; insufficient data → honest status; 4-week comparisons; history preserved.


---

# PART 5 — Exercise-choice assistant, exercise order & fatigue cost, data-gated adaptive Full Body planner (requested 2026-11-21, after the six-month audit, commit 6105fc4)

Status: **implemented 2026-11-22** (E.0–E.11; see CLAUDE.md section J and test-artifacts/part5/REPORT.md). The owner's four pasted requests (full text in the session transcript) are condensed below. Where they conflict, the LATER, stricter request wins (noted inline). Rules at the top of this file still apply: never lose or rewrite stored data; no personal data or passwords in the repo; touch-first, minimal UI; never claim something works unless tested; no network calls (research is dev-time only, verified references only; never invent DOIs/PMIDs).

## E.0 What exists — build on it, do NOT create a second engine
- `analyze()` already gives per muscle: completed / target / remaining, todayShare (capped, never catch-up), carryOver, todayBlocked, `planRecovery` (recovery entering today), moreVolumeJustified; per history key: trend, next load, plateau/decline guards (single bad session, sustained decline, index scales).
- `analysis.plan` (`planNextWorkout`, src/domain/analysis.ts ~l.230) already builds a muscle-priority list with exercises from the owner's history + an `avoid` list — **no UI uses it**. Natural seed of the planner.
- `prescription.ts` (presc-1) prescribes ONE exercise (warm-ups, sets = today's share minus earlier exercises, load by double progression on real increments, reps from history, RIR, rest, confidence high ≥ 4 / moderate 2–3 / low) and `adaptRemaining` re-checks after each set; `prescribed` is stored per set. Audit weakness: the first exercise of a muscle takes the whole day's share → the planner must allocate sets at SESSION level.
- `recovery.ts`: continuous, from the session END; soreness / fatigue / sleep / failure / new-exercise factors; `MOVEMENT_FAMILIES`. `feedback.ts`: pain is already a separate flag. `equipmentMemory.ts`: machines per gym, favourites, recent. `learningState` (targets.ts): 30-day learning mode.
- CLAUDE.md §0 says "an analytics system, not a program generator". The owner now explicitly wants a planner → update §0: analytics first; a workout planner only when the data supports it (Part 5), always editable, never a fixed split.

## E.1 Exercise-choice assistant (request 1)
- New pure module `src/domain/exerciseChoice.ts`: `assessChoice({ analysis, data, workout /* current session */, exerciseId, equipmentId?, now })` → `{ status: 'good' | 'acceptable' | 'reconsider', reasonKind: 'recovery' | 'volume' | 'order' | 'decline' | null, muscles: [{ muscle, coef, state: 'LIKELY_READY' | 'RECENTLY_LOADED' | 'RECOVERY_UNCERTAIN' | 'PERFORMANCE_DECLINING', weekLeft }], safety: string | null, alternatives (≤ 2), confidence, why[] }`. No 0–100 score.
- Significantly involved = coefficient ≥ 0.5 (incline press: chest 1, front delts 0.5, triceps 0.5). State from the EXISTING `planRecovery` (no new recovery model): RECENTLY_LOADED = still inside the window (> 6 h left) or substantial effective sets in the last ~48 h; RECOVERY_UNCERTAIN = insufficient data / unknown times; PERFORMANCE_DECLINING = a comparable history loading this muscle is `declining`; else LIKELY_READY. Wording never claims a biological state.
- Status (heuristic; register in rules.ts with basis + confidence): reconsider when the PRIMARY muscle is recently loaded, or a significant synergist is loaded AND an alternative trains the primary without it, or the primary is already above its weekly max; acceptable when a synergist is loaded / the week is already ≥ preferred / a declining trend; good otherwise. A weekly deficit never overrides recovery.
- Alternatives only if sensible: same primary muscle (coef ≥ 0.75), lower load on the loaded synergists, available at this gym (equipment memory), preferably in the owner's own history (≥ 2 sessions); or "another muscle" = the largest recovered weekly deficit with a familiar exercise. Otherwise none ("no better option today").
- Pain logged on that exercise/region in the last 7 days → separate SAFETY line, never mixed into fatigue.
- Never blocks: [Use Pec deck] [Continue]. Acknowledged warnings stored per session (`Workout.choiceAcks?: { key, at }[]`, key = exercise + reason + state) → not repeated unless the inputs change (a new set, a new day).
- Learning: `WorkoutExercise.choice?: { status, reasonKind, alternativeOffered?, followed }`. `choiceOutcomes` compares later performance of overridden choices (next sets, next comparable session). Only ≥ 3 observations change anything; one workout never makes an exercise "unsuitable"; subjective feedback is never proof.
- UI: picker list shows a small status dot; on select a compact card: name · badge · ≤ 3 muscle lines ("Triceps: RECENTLY LOADED") · "Alt: Pec deck" · Why▾.

## E.2 Fatigue cost & exercise order (request 2)
- Research first (PubMed / Europe PMC / Crossref; verify PMID + DOI as in Part 3): exercise order effects on strength vs hypertrophy (e.g. Simão et al. reviews, Nunes et al. 2021 systematic review/meta-analysis — verify, never cite from memory), compound vs isolation sequencing, fatigue accumulation, muscle prioritisation. Expected (to confirm): order mainly affects strength/performance of later exercises; hypertrophy differences small/unclear → order = performance-preservation heuristic, not a growth rule. Add references + `fatigue_cost` / `exercise_order` rules (research-informed heuristic, low–moderate confidence).
- `fatigueCost: 'high' | 'moderate' | 'low'` per exercise in src/data/exercises.ts (initial classification, overridable): high = squat, deadlift, RDL, heavy barbell presses, weighted / near-failure pull-ups…; moderate = incline DB press, machine chest press, pulldown, leg press, rows, bodyweight pull-ups…; low = pec deck, pushdowns, curls, lateral raises, leg extension / curls… Not calories; isolation is not automatically easy.
- `sessionLoad(workout)`: what was done today — effective sets per muscle, high-cost lifts done, failure sets, RIR trend, rep drops, axial/posterior-chain load (squat + RDL → lower body heavily loaded).
- Order: default high → moderate → low, BUT a priority muscle (big recovered deficit or `settings.priorities` high) may go earlier even as isolation; a demanding compound at the right point is GOOD CHOICE; avoid triceps-heavy isolation before important pressing; another high-cost lower-body lift after squat + RDL → reconsider unless it is the priority. Request 2's "POOR CHOICE RIGHT NOW" / "CONSIDER LATER" = the same third tier, label chosen by reasonKind ('order' → CONSIDER LATER; recovery/volume → CONSIDER ALTERNATIVE).
- UI lines only: "Fatigue cost: HIGH · Position: FIRST HALF · Quads: READY · 4 SETS LEFT".

## E.3 Adaptive Full Body planner (requests 3 + 4 — request 4's data gating replaces request 3's calendar weeks)
- New `src/domain/planner.ts` (engine `plan-1`) on top of analyze + prescription + exerciseChoice + fatigue cost:
  1. Personal library per exercise × equipment × configuration: sessions, last used, share of sessions, gyms → frequent (≥ 30 % of sessions in 8 wk) / occasional / tried (1–2) / preferred (CLAUDE.md §F list or starred) / not available at this gym.
  2. Patterns: usual exercise count, usual order (median position), co-occurrence, duration, sessions/week.
  3. Session muscle budget = today's share (existing, catch-up-free) minus recovery holds; session size from the owner's usual count/duration.
  4. Select from the personal library to cover the budget with fractional contributions (indirect work counts; no overshoot; familiar, calibrated, available here; respect synergist fatigue; vary when a muscle already had enough recent stimulus). Unfamiliar exercises only for a persistent deficit, missing equipment or a needed alternative.
  5. Order by E.2. 6. Prescribe each item with `prescribe()` using SESSION-level set allocation. 7. Warm-ups, RIR, rest as today.
- Output `GeneratedWorkout { engine, createdAt, mode, items[{ exerciseId, equipmentId, variation, order, calibration: 'calibrated' | 'provisional' | 'needs_data', warmups, sets[{ kg, reps range, rir }], rest, why[] }], skippedMuscles[{ muscle, reason }] }`. Persisted only when started (live workout with `prescribed` per set + `Workout.generated?` snapshot). Not part of the import schema; export unchanged.
- Weights: calibrated → exact on the machine's real increments; provisional → from the closest comparable history, labelled; needs_data (new machine) → no kg, "calibrate: a load for 10–12 @ RIR 2–3". Never transfer kg between machine instances.
- In session: existing `adaptRemaining` (never adds load just because one set was good; prescribed vs performed kept) + replace (E.1 alternatives) / skip / edit; deterioration → fewer sets, more rest, move or replace a demanding lift.
- Missed sessions/weeks: current-week deficits + expected remaining sessions + continuous recovery; after ≥ 10 days off a "returning" flag: loads from the last comparable sessions, one step down if > 14 days; calibration is not "lost".
- Accepted / rejected: per item followed / weight changed / reps changed / skipped / replaced / more or fewer sets + optional one-tap reason (equipment busy · time · preference · pain). Only repeated patterns (≥ 3) shift preferences (e.g. always replaces X with Y at gym B → prefer Y there).

## E.4 Operating modes and granular readiness (request 4)
- `src/domain/readiness.ts`: areas exercise history · equipment calibration · strength data · frequency/structure · weekly-volume history · recovery info · preference consistency → INSUFFICIENT DATA / DEVELOPING / SUFFICIENT / WELL CALIBRATED; also per muscle group, per exercise variation, per equipment instance.
- Calibration (data quality, not calendar): SUFFICIENT = ≥ 2–3 comparable representative sessions with weight, reps per set, effort (RIR or feel) and known equipment; WELL CALIBRATED = ≥ 4 in 8 weeks. "Well-documented workout" = gym, times or duration, every working set with weight + reps, effort on ≥ 70 % of sets.
- Modes switch automatically (never by calendar alone): LEARNING (default; logging, volume, stats; optional suggestions labelled PROVISIONAL) → PROVISIONAL ADAPTIVE (≥ 8 well-documented workouts over ≥ 21 days, gyms/equipment identified, ≥ 3 frequent exercises calibrated; full proposals with per-item labels) → FULL ADAPTIVE (≥ 10–12 well-documented workouts over ≥ 28 days and calibrated familiar exercises cover ≥ ~80 % of the major muscles' session budget). Stages in order: suggestions → prescriptions → complete workout. 12 badly logged workouts ≠ ready.
- Missing soreness/sleep never blocks: that recovery estimate is marked uncertain. A gap degrades only the affected items.
- UI: dashboard card "YOUR NEXT WORKOUT" with a mode badge (LEARNING / PROVISIONAL / ADAPTIVE): numbered list — exercise · equipment · warm-ups · kg × reps × sets · RIR · rest · small provisional/calibrate marks · [Start] [Replace] [Skip] [Edit]. Learning mode shows one line ("learning: 5 / 8 workouts"). Settings → Planner: readiness table in plain words, no scores.

## E.5 Safeguards (all four requests)
Never: exact kg for unfamiliar equipment; machine instances treated as equivalent; calendar-only activation; strength = growth; weekly targets over recovery; catch-up volume; ignoring technique breakdown; failure on every set; a complete workout when essential data is missing (then the reliable part + "needs data"). Warnings never block; everything editable; no stored data changed; all new fields optional (absent = unknown).

## E.6 Tests (automated; numbers checked independently where possible)
- Choice assistant: heavy recent training; light training; primary ready + synergist loaded (incline → Pec deck); weekly target reached; big deficit; decline over comparable sessions; insufficient recovery info; alternative exists; no suitable alternative; override recorded; same warning not repeated without new info; recovery still present after the Monday reset; pain → separate safety line.
- Order / fatigue: high cost early; low cost later; priority muscle overrides compound-first; recent demanding lifts change the next advice; whole current session considered; deficits change priority; recovery and fatigue cost evaluated separately; demanding lift can be GOOD when scheduled; every recommendation overridable; no data or functionality lost.
- Planner / readiness: extend tests/sim with data-quality variants — 2, 6, 10 well-documented, 12 inconsistently logged workouts; some unfamiliar equipment; reliable strength but no recovery info; irregular frequency; missed workouts; declining; increasing; changed preferences; return after a long break; a realistic 8-week run. Verify mode transitions, per-exercise calibration independence, preferred exercises and gym availability learned, full workout only when allowed, sensible order, deficit-based sets without overshoot or catch-up, weights only from real history on real increments, provisional / needs-data labels, adaptation after sessions, edits respected, ALL existing statistics unchanged (six-month reference checks still 0 failures).
- Playwright on 4 WebKit viewports: picker badge + assessment card + Continue / Use alternative; next-workout card → Start → Replace / Skip / Edit; layout audit 0 findings; screenshots in test-artifacts/part5/.
- Independent review agent on the diff → fix → typecheck, vitest, build, Playwright → commit, push, verify live bundle + console.

## E.7 Final report owed
Operating mode on each synthetic history; sessions needed for reliable personalisation; preferred exercises learned; exercises / weights calibrated vs still calibrating; muscle groups plannable reliably; information gaps; conditions for full adaptive mode; whether generated sessions distribute weekly volume appropriately and use real equipment / history; exercise-order research summary (strength vs hypertrophy) with verified references; limitations. Never claim full personalisation without evidence.

## E.8 Build order
1. Research → references + rules. 2. fatigueCost data + sessionLoad. 3. exerciseChoice.ts + tests + picker UI. 4. readiness.ts + modes + tests. 5. planner.ts (library, patterns, session budget, selection, order, prescriptions) + tests + data-quality simulations. 6. Next-workout card, Start / Replace / Skip / Edit, decision logging. 7. Docs (CLAUDE.md §0 + new section J), review, ship, report.

## E.9 Real-world gym conditions (requested 2026-11-21, during Part 5)
- Active workout from a plan is never a fixed order: **Later** (temporarily skip an occupied machine; the exercise moves to the end and stays pending), **↑/↓ reorder** at any time, **Machine busy** (marks the equipment temporarily unavailable for THIS session: `Workout.busyEquipment?`), and **alternatives that use available equipment** (busy machines excluded).
- Never assume the planned order was followed: every exercise with no performed set is re-prescribed from what was ACTUALLY done (fatigue of completed work, remaining weekly volume, recovery and synergist fatigue, loads/reps, warm-ups, fatigue cost / position). Untouched planned sets are updated with a visible "adjusted" line; edited sets are never overwritten.
- A demanding lift done earlier than planned → later prescriptions recalculated (fewer sets for muscles already covered, shorter warm-ups, order advice).
- The original plan (`Workout.generated`) is stored separately from execution (`exercises`); decisions (`Workout.planDecisions`) record later / reorder / busy / replace / skip.
- Learning: substitutions with reason "equipment busy" are excluded from preference learning; only repeated (≥ 3) non-equipment choices shift preferences.

## E.10 Evidence-based weekly volume per muscle (requested 2026-11-21, during Part 5)
- Never raise weekly sets only because a muscle is below a generic reference. After Learning Mode each muscle's target starts from ITS OWN baseline (median of recent complete weeks) and changes only on evidence:
  - **Increase (+1–2 effective sets)** only when its comparable sessions have stalled (plateau), technique and working weights are consistent, effort is adequate (sets near failure), recovery indicators are good, the volume has been stable for ≥ 3 weeks (the last change was observed), and earlier history does not show that more volume failed to help.
  - **Reduce (−1–2, or back to the last productive level)** when performance repeatedly declines with adequate effort, recovery is consistently worse, technique deteriorates, or a recent volume increase brought no better performance (more fatigue, no benefit).
  - **Hold** when progressing (e.g. progressing at 12–14 → no reason to go to 16), when evidence is insufficient, when effort is too low (take sets closer to failure first), or while observing a recent change.
- Response observation: earlier 4 weeks vs recent 4 weeks — volume level and performance slope of the muscle's direct exercises (same index kind), plus recovery and technique signals; body circumference (arms, chest, thighs, calves, shoulders) as supporting context only.
- Per muscle, independently; rationale lines say which rule fired. Rules registered (`volume_individual`), tests cover each branch.

## E.11 Final audit: exercise biomechanics and muscle mapping (requested 2026-11-21, during Part 5 — do LAST, before the full-app simulation)
- Audit EVERY exercise in src/data/exercises.ts (preferred first: incline DB press, straight-bar pushdown, pec deck, machine curl, EZ curl, DB + cable lateral raise, back squat, leg extension, RDL, seated leg curl, hanging knee raise with pelvic curl, bodyweight + weighted pull-ups, deadlift, dips, shoulder press, bent-over rows): primary / significant secondary / minor / stabiliser-only, regional emphasis; variation effects (bench angle, grip width/orientation, elbow position, trajectory, body position, ROM, equipment). Stabilisers get no (or minimal) credit.
- Verified sources only (systematic reviews, longitudinal hypertrophy trials, biomechanics; EMG labelled indirect). Per important classification: evidence, rationale, quality, confidence, limitations; insufficient evidence → marked uncertain.
- Coefficients: exercise-specific values where justified (not automatically 0.5); one source of truth (registry → volume, remaining sets, recovery, planner, choice assistant, reports, importer); changes recompute history from raw sets without touching stored workouts.
- Independent tests with hand-derived expected values + a regression test per corrected mapping. Report: total audited, verified, corrected, uncertain, coefficient fixes, tests, limitations.

---

# PART 6 — Training focus mode, log-after-the-set flow, Russian, and formulas that survive human error (requested 2026-11-23, after the owner's FIRST real gym session; commit 812e25f is live)

Status: IN PROGRESS — see **F.15** at the end of this part for what is done and what is left (updated 2026-11-24). Parts 1–5 and the UX audit (CLAUDE.md §K) are live; do not redo them. Where this part contradicts §K (planned set rows, "Next set" marker, RIR chips, + Warm-up / + Drop buttons, +30 on the timer), THIS PART WINS and CLAUDE.md must be updated.

## F.0 The owner's feedback (condensed, numbered as sent)
1. Does not like the overall UI/UX; the training session must look and feel more aggressive / motivating.
2. Having to set up the NEXT set makes no sense (reps are unknown before the set). A set is always entered AFTER it is done.
3. Remove drop sets and warm-ups from the UI. Warm-ups are simply the first sets; the formulas must still treat them as warm-ups wherever that matters.
4. Entering a set automatically starts a 2:30 rest timer, adjustable by +15 / −15 s at any time.
5. A gorgeous, distraction-free focus mode during the workout: the exercise, the timer, and a small overall workout timer that starts with the first logged set.
6. The numbers under weight and reps (the RIR chips 0–5+) are not understood → remove unless needed.
7. Always pre-set the weight from the last set, or from the last workout — never re-enter it.
8. Some weights cannot be chosen (half-kilo problem with the stepper).
9. Translate the WHOLE app to Russian; a language switch at the top next to the dark/light toggle.
10. A much bigger rest timer: a large circle in the centre, readable on a phone held low while standing.
11. Check the first workout and analyse the formulas: human perception of a set is unreliable ("the brain might lie") — the formulas must be robust to that.
12. Within-session fatigue: the second chest exercise after incline press will be weaker than if done fresh — the formulas must account for it.
13. (empty in the message) → added afterwards: in the session view (History → a workout) every set row says "Working" — noise; remove it.
14. Write this plan, rework the app, and give a prompt to send after compacting the session.
15. (added afterwards) The "Done" button sits too close to "Next exercise" — easy to hit the wrong one mid-workout. The UX/UI must be reworked so it is reasonable and outstanding, not patched.
16. (added afterwards) Closely analyse ALL formulas the app uses, report the findings, do not change them in that step, double-check anything that looks wrong, and keep the findings in a file (see F.14).

### How the unclear points are read (the owner can correct any of these in the post-compact prompt)
- #3 "drop downs" = DROP SETS (the "+ Drop" button), not dropdown menus.
- #6 "numbers under weight and reps" = the RIR chip row (0 1 2 3 4 5+).
- #8 = the ± stepper only moves in the machine's step (defaults: machine 5 kg, cable / barbell 2.5 kg, dumbbell 2 kg), so values such as 7.5 or 22.5 cannot be reached with the buttons. Fixed for both possible readings (see F.3).
- #11: the app's data is encrypted in the owner's browser — Claude cannot read the first workout. See F.9.

## F.1 Principles (apply to everything below)
- Never lose stored data. Existing workouts (planned sets, warm-up / drop types, RIR, feel, failure fields) stay valid and readable; import schema v1.4 is NOT changed (drop / warm-up types remain importable). All new fields optional, absent = unknown.
- One engine: build on analyze() / prescribe() / progression / exerciseChoice / planner / ruleChecks. No second calculation path.
- Honest motivation only: comparisons with the owner's own numbers ("+1 rep vs last time", "new best on this machine"). No fake praise, no invented targets, never a growth claim.
- Warnings never block. Everything stays editable and undoable (§K rules stay).
- Every new numeric rule goes into `rules.ts` with basis / confidence / sources; research is verified at development time (PMID in PubMed + DOI in Crossref), never cited from memory.
- Security invariants unchanged (no network, CSP untouched, nothing personal in the repo).

## F.2 New live flow: log AFTER the set (feedback 2, 6, 7)
- **No pre-created set rows in a live session.** A set exists only once it was done and logged. `buildExercise` / `workoutFromPlan` stop creating `planned: true` sets; the plan becomes a TARGET line ("Today: 3 × 60 kg × 12–14"). Old data with `planned` sets keeps working (still ignored by formulas, still dropped at Finish).
- **Entry for the set just done:** WEIGHT and REPS, one big button **LOG SET**.
  - Weight pre-filled: last set of this exercise in THIS session → else last workout's weight for that set number on the same exercise × machine × configuration (or the prescribed load when an increase / reduction is due — shown as "last 60 → today 62.5", one tap to use either).
  - Reps pre-filled with the same set's reps from last time (else the previous set's reps) — only a starting value for ±; nothing counts until LOG SET.
- **Re-assessment (E.9) without planned rows:** targets for exercises not started are recomputed by `prescribe()` from what was actually done; `replanPending` / `applyPendingUpdate` / `plannedCount` are reduced to target recalculation (keep the public behaviour and tests: untouched plans update, owner edits never overwritten).
- **Effort, one optional tap AFTER the set (replaces the RIR chips, the failure question and the 8-option feel grid in live mode):** `EASY` (3+ reps left) · `GOOD` (1–2 left) · `HARD` (0–1 left) · `FAILED` (could not finish the rep). "More" opens: form broke · wrong weight · pain (+ area) · note · exact reps-in-reserve number. Mapping to existing fields: effort / feel / failure / technique / rir (exact number only when given). Skippable; the timer never waits for it. RIR stays in the data model, imports and History → Edit.
- A logged set is edited by tapping it (weight, reps, effort, remove with Undo). Double-tap guard on LOG SET (1.5 s).

## F.3 Weights that can always be chosen (feedback 8)
- Stepper step = the machine's real step when known; otherwise a **step chooser** on the weight control (0.5 · 1 · 1.25 · 2 · 2.5 · 5 kg), remembered per machine (and per gym for dumbbells) after one tap — this also fills `incrementsKg` / `freeWeightIncrementsKg` for the prescriptions.
- Typing always works (numeric keypad with a decimal key; comma and dot accepted); a typed value is never snapped or rejected. Stepping from an off-grid value moves to the next real step (40 → 42.5 → 45, 41 → 42.5).
- Tests: every value k × 0.25 kg from 0 to 300 can be entered; the stepper reaches every multiple of the chosen step; RU keyboard comma.

## F.4 Warm-ups and drop sets (feedback 3)
- UI: remove the set-type button, "+ Warm-up" and "+ Drop" from live mode. One kind of set is logged.
- **Warm-ups are credited by how far from failure they were, not by a label** (revised 2026-11-23 after the owner asked whether removing them from volume is scientifically correct). What the evidence supports is not "warm-up = 0" but "stimulus falls as a set gets further from failure"; the volume research counts hard sets only, and the app already has that gradient (RIR 0-3 = 1.0, 4 = 0.6, 5 = 0.3, 6-7 = 0.15, 8+ = 0). So:
  - Every logged set without an effort answer or RIR gets an ESTIMATED reserve from the numbers (F.7): reps possible at this load, from the best set of the same exercise in this session (else the recent level on that machine), minus reps done. That estimate goes through the SAME credit table. A light ramp set (40 x 5 before 60 x 12: about 28 reps in reserve) gets 0; a heavy last ramp set that was nearly a working set (55 x 11: about 5 in reserve) gets partial credit; a pyramid of hard sets counts in full. No hard 80 % cut-off decides credit.
  - An effort answer (GOOD / HARD / FAILED) or a logged RIR always beats the estimate, subject to the F.7 cross-check.
  - The "W" tag (`type: 'warmup'`, `typeSource: 'auto'`) is only the DISPLAY of a set that comes before the best set and has estimated credit 0; it is written so the existing formulas that read `type` keep working. An owner correction (tap the tag) writes `typeSource: 'owner'` and is never changed automatically. Sets with partial credit stay working sets and are counted as "uncertain volume".
  - Same-load and bodyweight exercises never get auto warm-ups from load alone. Lighter sets AFTER the best set are back-off sets, credited by their own estimated reserve.
  - Everywhere else warm-ups behave as before: never a progression benchmark, they count as "already warmed up" for later exercises, they are listed in the summary. Tonnage (weight x reps) still includes them and says so.
  - Rule `warmup_by_reserve` in `rules.ts`: basis research-informed heuristic, confidence low-moderate (the estimate uses Epley, which is rough at high reps); sources verified in the research step (proximity-to-failure dose-response, how volume studies count sets). Stated limit: the estimate cannot see a set that was hard for another reason (bad day, short rest) - the one-tap effort answer exists for that.
- Prescription still SUGGESTS warm-up loads as text ("Warm-up: 30 × 8 → 45 × 5"), no rows.
- Drop sets: no button. Existing / imported `drop` sets keep their ×0.5 credit.
- **No "Working" label anywhere** (feedback 13; today `History.tsx` prints the type on every set row): a normal set shows only its number, weight × reps and result. A tag appears only for the exceptions — warm-up ("W"), drop set, left / right — in the session view, the training mode, the summary and the Workout check. The import review keeps its type selector (needed to correct an import) but shows it only when a set is not a normal one or on tap.
- Tests (hand-computed credit): classic ramp (20×10, 40×5, 60×12 → 0, 0, 1), heavy last ramp set (55×11 before 60×12 → partial), pyramid of hard sets with effort answers (all 1), back-off sets, bodyweight, owner override survives re-classification, an effort answer beats the estimate, history recomputation identical for old workouts.

## F.5 Rest timer (feedback 4, 10)
- LOG SET starts a rest of **2:30** (`settings.restDefaultSec = 150`, editable in Settings) — every set, warm-ups included.
- **Full-screen circle in the centre**: remaining time in very large digits (readable at arm's length, phone held low), ring shrinking, colour change + vibration (+ optional beep) at 0, then "GO" and counting up.
- **−15 / +15** large buttons either side, usable any time (also below 0); Pause; "Skip rest". An adjustment sticks for that exercise for the rest of the session.
- Survives reload, app switch and vault lock exactly as today (computed from the set's completion time). Measured rest is still stored per set (`restSecBefore`, source timer).
- Supersedes the personal rest target for the TIMER; the prescription's rest advice stays as text in "Why".

## F.6 Focus mode + aggressive training look (feedback 1, 5, 10)
- A dedicated full-screen **training mode** for a live session: no bottom navigation, no app header, no remaining-sets strip, no cards with secondary text.
  - Top line (small): leave (←, back to the workout overview) · overall workout clock (starts at the first logged set) · exercise n / N.
  - Centre: exercise name (very large, one line), machine (small, tap to change), `LAST TIME 60 × 12 · 11 · 10` and `TODAY 3 × 60 × 12–14`.
  - Logged sets as large chips (`1  60 × 13`), each with its honest delta vs last time (`+1`, `=`, `−2`, `BEST`).
  - Bottom (thumb zone): WEIGHT and REPS steppers with huge numerals, then the full-width LOG SET button.
  - After LOG SET: the rest screen (F.5) with the effort tap (F.2) under the circle and "NEXT SET"; when the exercise's target is reached: "NEXT EXERCISE" (plan order, or the picker) and "ONE MORE SET".
  - Overview (one tap away): the exercise list with done / left, reorder, Later, Machine busy, Replace, Change exercise, Skip, Finish — all existing real-gym controls and Undo stay here.
- **Look:** dark-first training theme independent of the app theme — near-black background, one hot accent, heavy condensed uppercase labels, tabular oversized numerals, strong contrast, large hit areas (≥ 56 px for the main actions), minimal motion (ring, a short flash on a new best). Accent as a setting with three presets (default "Ember" red-orange; "Volt" lime; "Ice" blue) via CSS variables. WCAG contrast ≥ 4.5 for text. Screen wake lock while a rest runs (where the browser supports it).
- **Action hierarchy (feedback 15) — a design rule for every training screen, checked by tests:**
  - ONE primary action per screen, full width in the thumb zone (LOG SET → NEXT SET → NEXT EXERCISE). Nothing else shares its row.
  - Today's card footer ("Next exercise · Done · Skip · ↑ ↓" side by side) is removed. "Done" disappears as a separate button: an exercise is done when the next one starts. Skip, Later, Replace, Machine busy, Change exercise and reorder live in the overview or behind one "⋯" on the exercise — never beside the primary action.
  - **Finish workout** exists only in the overview, at the very end of the list, visually different from the primary action (outline, not filled), ≥ 24 px away from any other control, and opens the summary with "Back to workout" (already built). It is never on the set-entry or rest screen. The delete-workout icon moves out of the header next to Finish into the overview's "⋯".
  - Two neighbouring controls never have opposite consequences (continue vs end, log vs remove). Minimum gap between any two tap targets 12 px; primary ≥ 56 px high, secondary ≥ 48 px.
  - E2E asserts: on every training-mode state exactly one primary button; Finish and any removing control are not within 24 px of it; no control overlaps another's 48 px hit area.
- **Whole-product redesign, not a patch (feedback 1, 15):** before coding the screens, write a one-page design spec in `docs/DESIGN.md` — type scale, spacing scale, colour tokens (app light / dark + training theme accents), button hierarchy (primary / secondary / quiet / destructive), states, motion, the rules above — and build shared components from it (`ui.tsx`) so every screen follows the same system. Then restyle screen by screen in the F.10 order. Show the owner screenshots of the training mode and the Week screen FIRST (both languages, iPhone 13) in the block's report before restyling the remaining screens.
- The rest of the app gets the same typographic system (bigger numbers, less text) but keeps light / dark.
- History → Edit keeps the detailed editor (all fields, audit trail).
- Layout: iPhone 13 first; 375 / 430 / desktop; landscape; no overflow (existing audit script), nothing behind the keyboard.

## F.7 Formulas robust to unreliable perception (feedback 11)
Problem: effort answers (and RIR) are subjective; one "felt heavy" or "felt easy" must not swing credit or progression.
- **Objective cross-check per set** (`perception.ts`, rules `perception_check`, `perception_bias`):
  - implied reserve from the owner's own recent level on the same exercise × machine × configuration: reps-to-failure estimate at this load from the median index of the last ≤ 3 comparable sessions (Epley inverse) minus reps done — itself noisy, so it is used only as a band (clearly easy ≥ 5, clearly hard ≤ 1);
  - within-session evidence (the strongest): at the same load and normal rest, reps holding or rising on the NEXT set means the previous set had reserve; a drop of ≥ 2 reps means it was close to the limit.
- **Credit:** the reported effort is used when it agrees with the numbers or the numbers are inconclusive. Clear disagreement (reported EASY but reps collapse on the next set; reported HARD / FAILED on set 1 but set 2 matches or beats it at the same load) → the set is credited by the objective band and flagged "felt X, numbers say Y" (counted as uncertain volume, never silently rewritten: the owner's answer stays stored). No effort answer → objective band when clear, else the existing 0.75 provisional credit.
- **Progression decisions rest on objective performance first:** increase needs reps at the top of the range in two consecutive sessions (unchanged); the one-session "too easy" shortcut additionally needs no rep drop across the sets; "reduce" for technique / too heavy needs reps under the bottom of the range in the same session OR the same report in two consecutive sessions. A single subjective answer alone never changes the load.
- **Personal bias:** over ≥ 12 sets with both a report and a clear objective band, the app measures the owner's average over- / under-rating and shows it (Settings → Rules of thumb vs your data: "you tend to rate sets about one rep easier than the numbers suggest"). It widens the uncertainty band; it never rewrites entries.
- Research to verify first (RIR / reps-to-failure prediction accuracy: scoping review + meta-analysis, effect of proximity to failure, load, set number, experience); record in `references-perception.ts`; thresholds stay labelled heuristics.
- Tests: synthetic sessions for each disagreement pattern with hand-computed credit; six-month reference checks stay at 0 failures; property test — changing one effort answer never changes a load decision by itself.

## F.8 Within-session fatigue between exercises (feedback 12)
Problem: pec deck after incline press is weaker than pec deck done first; today that can read as a decline, block a progression or suggest a wrong load.
- **Context on every session of a history** (`preload.ts`): effective sets already performed in that session, in the order actually done (tick times; list order for imports), for the exercise's primary muscles (earlier exercises with coefficient ≥ 0.5). Buckets: FRESH (< 2 sets) / PRE-LOADED (≥ 2). Stored nowhere — derived from raw sets.
- **Comparisons like with like** (progression.ts): trend, plateau, decline, baseline %, double progression and "new best" compare sessions of the same bucket when that bucket has ≥ 3 sessions; otherwise the index is context-adjusted: index × (1 + d × preload sets), d = the owner's own measured drop per pre-loading set once enough data exist (same statistics as `ruleChecks` order check), else a default from the verified order literature, capped, basis "research-informed heuristic", low confidence. The history key does NOT split (no fragmentation); the UI says which context a number comes from.
- **Prescription for exercise B after A:** load from B's history in the same context; with only fresh history → same load with the rep target lowered by the expected drop (or one step down when the expected reps fall under the range) and the line "after incline press: expect ~1–2 reps fewer — not a regression". Never REDUCE or call a decline from a pre-loaded session compared with fresh ones; never INCREASE just because a fresh session followed pre-loaded ones.
- Planner and exercise-choice assistant use the same expectation (order advice already exists).
- Tests: A→B vs B→A synthetic histories (no false decline, no false plateau, no false increase; correct expected reps), eight-week planner run unchanged where order never varies, rule registered with sources.

## F.9 Checking the owner's first workout (feedback 11)
- Claude cannot read the encrypted data. Two ways, both to be offered:
  1. **In-app "Workout check"** (History → a workout → Check): every number of that session step by step — per set: type (auto warm-up or working), effort answer, objective band, credit; per muscle: coefficient × credit sums; per exercise: index, context (fresh / pre-loaded), decision and why. Everything from the same engine, so the owner can verify the formulas on real data without sharing it.
  2. Optional: the owner pastes the workout export (Settings → Export unencrypted JSON) into the chat. It is analysed in the chat only and NEVER written to the repository, tests, commits or CLAUDE.md; findings are turned into SYNTHETIC regression tests.
- Whatever is found wrong becomes a failing test first, then a fix.

## F.10 Russian + language switch (feedback 9)
- `settings.language: 'en' | 'ru'` (migration: 'ru' when `exerciseNames` was 'ru', else the browser language if Russian, else 'en'). Toggle **EN / RU** in the mobile header and the desktop sidebar next to the theme button; also on the lock screen (stored outside the vault — a language code is not personal data).
- i18n layer `src/i18n/`: `en.ts` is the source of keys, `ru.ts` is typed against it (a missing key fails `tsc`), `t(key, params)`, Russian plural rules (1 / 2–4 / 5+), numbers and dates through `Intl` with the chosen locale, decimal comma accepted everywhere on input.
- Scope = the WHOLE app, in this order: training mode and overview → Week / Next workout → History, Strength, Body, Recovery, Muscles, Reports, Periodization → Equipment, Exercises, Import, Settings, lock screen, toasts and dialogs → engine texts (reasons, "Why", notes, warnings: the domain returns message keys + parameters, rendered by the UI; no English sentences built inside `src/domain`) → Science page and the evidence library texts. Exercise and muscle names already exist in Russian.
- Glossary fixed up front (подход, повторения, отдых, разминочный подход, запас повторов, отказ, тренажёр, рабочий вес …) and used consistently.
- Tests: key parity EN ↔ RU; no missing / unused keys; plural forms; a scan of the main screens in RU for leftover Latin text (whitelist: units, brand, exercise ids); the 32-screen layout audit × 4 viewports ALSO in Russian (longer words) with 0 overflow; existing English e2e specs keep running in EN.
- CLAUDE.md, FIX_PLAN.md and code comments stay in English.

## F.14 Formula audit — FIRST block, read-only (added 2026-11-23: "analyze all used formulas, report findings, do not change them, double check")
- **Scope: every formula and numeric rule the app uses**, taken from the code (not from the docs): set-quality credit (RIR table, unknown-RIR 0.75, feel → RIR ranges, drop ×0.5, partial ROM, < 5 reps, technique ×0.7), fractional coefficients and variation rules, per-session ceiling (taper above ~11), L/R pairing, quality-set totals, weekly targets and learning mode, today's share (÷ sessions left, 60 % cap, ≤ 10), recovery windows and modifiers, session end time, Epley / RIR-adjusted index, bodyweight and system index, trend / plateau / decline / sustained-decline thresholds, double progression and the one-session shortcut, reduce rule, load steps and snapping, warm-up suggestion, rest attribution, measured rest (≈ 3 s per rep), baseline and progress %, growth signals, body-weight averages and trend, deload assessment, fatigue cost and session load, exercise-choice states, readiness modes and calibration levels, planner budget and allocation, returning-after-break step-down, individual volume decision, rule checks, mapping spread, rounding.
- **Per formula record:** where it lives (file:function), the exact formula as coded, what it is meant to compute, units and edge cases (zero, null, one session, very high reps, bodyweight, assisted), the source (verified reference id / heuristic), a hand-computed example checked against the code, and a verdict: CORRECT · CORRECT BUT WEAKLY SUPPORTED (heuristic, say so) · QUESTIONABLE (plausible but arguable — give the alternative) · WRONG (code does not do what it claims, or contradicts its own source) · INCONSISTENT (two places compute the same thing differently, or code ≠ CLAUDE.md / rules.ts).
- **Double check before calling anything wrong:** every QUESTIONABLE / WRONG / INCONSISTENT verdict is re-derived a second way (independent hand calculation or an independent review agent given only the code and the claim), and the source is re-read (PMID / DOI verified, never from memory). Only what survives is reported as a finding.
- **No formula is changed in this block.** No code edits in `src/domain` or `src/data`, no test expectation edits. Output only:
  - `docs/FORMULA_AUDIT.md` — the working file for Claude: the full inventory table, each finding with evidence, the second check, severity, and a PROPOSED fix (not applied). Synthetic numbers only; nothing from the owner's data.
  - a short report to the owner in chat: how many formulas, how many per verdict, the findings in plain words, what each would change in practice.
- **After the report:** the changes the owner already asked for in this part (F.4 warm-up credit, F.7 perception, F.8 within-session fatigue) proceed as planned and must take the audit's findings into account. Any OTHER confirmed error is fixed only after the owner says so — until then it stays listed as open in `docs/FORMULA_AUDIT.md` and in the final report. When a formula is later changed, its audit entry is updated (old → new, why, test).

## F.11 Work order (commit after each block; never leave the app broken)
1. Baseline: typecheck, vitest, build, e2e smoke; read this part and CLAUDE.md §G–§K. Then the **formula audit (F.14)** — read-only, report to the owner, commit `docs/FORMULA_AUDIT.md`.
2. Research for F.7 / F.8 (verified references only) → `references-perception.ts`, rules.
3. Domain, tests first: F.2 data flow (no planned rows), F.3 steps, F.4 auto warm-ups, F.5 rest default, F.7 perception, F.8 preload context. Six-month reference checks at 0 failures after each.
4. `docs/DESIGN.md` (design system + action hierarchy), shared components, then the training mode UI (F.5, F.6) + overview; migrate the real-gym controls and Undo; History → Edit unchanged.
5. F.9 Workout check screen; analyse the owner's export if provided (chat only).
6. i18n infrastructure, then Russian screen by screen (F.10).
7. E2E on 4 WebKit viewports: a full first-workout journey in training mode in EN and RU (log after the set, auto timer, ±15, auto warm-up, effort tap, edit / undo, reload / lock / resume, finish), the mistakes-and-recovery journey adapted, responsive audit EN + RU, six-month journeys, landscape. Screenshots before / after.
8. Six-month simulation over all functions with the new flow (advice, logs and analytics appear when expected; graphs readable).
9. CLAUDE.md: update §C, §D, §G, §H, §I, §K and add §L (Part 6); architecture list.
10. Independent review agent on the diff → fix every confirmed finding with a regression test.
11. Typecheck, vitest, build, commit, push, verify the live bundle hash and console.

## F.12 Acceptance (the owner's list, testable)
- A live workout can be done end to end touching only: exercise → weight (pre-filled) → reps → LOG SET → (optional effort tap) → next set. No set has to be prepared in advance; no warm-up / drop buttons; no RIR chips.
- Logging a set starts 2:30 in a centred circle readable from standing height; −15 / +15 always work.
- Training mode shows only the exercise, the entry, the timer and a small workout clock.
- Every weight (… 7.5, 22.5, 41.25 …) can be entered; the stepper follows the machine's real step.
- Sets clearly far from failure (true warm-ups) are recognised automatically and get no volume credit; borderline sets get partial credit by estimated reserve; the owner can correct the tag or answer the effort tap.
- No set row in any screen is labelled "Working"; only warm-up / drop / side tags are shown.
- Every training screen has exactly one primary action; Finish workout is only in the overview, far from it; no "Done" beside "Next exercise".
- The whole app is available in Russian, switchable at the top; 0 layout overflow in both languages on 4 viewports.
- One wrong effort answer never changes a load decision; a second chest exercise after incline press is not reported as a decline and gets a realistic target.
- Stored data from before Part 6 is intact; six-month reference checks 0 failures; all earlier specs pass.

## F.13 Final report owed
The formula audit (F.14): counts per verdict, findings, which were fixed and which are still open; what changed per feedback point; before / after screenshots (EN and RU); the formulas of F.7 / F.8 in plain words with their confidence; what the Workout check showed; references verified; test totals; what is still not possible; what needs a real-iPhone check (wake lock, vibration, keyboard, safe areas, swipe-back).

## F.15 Status on 2026-11-24 (pause before a session compact) — read this first when resuming

Owner's additions during the work: (a) "fix the real errors the audit found, but double-check each one first" — DONE for 28 findings;
(b) "write an analysis of the formulas and how they have to be improved or redone" — NOT written yet (`docs/FORMULA_ANALYSIS.md`);
(c) weight entry "maybe a great-looking scroll wheel or touch feature" — DONE as a swipe ruler.
The owner sent no corrections to F.0 and no workout export.

### Done and committed (local commits c9370bc → c5309dc → 5e2e9b5 → the pause commit; ONLY c9370bc is pushed — the live site still runs 812e25f)
- F.14 formula audit: `docs/FORMULA_AUDIT.md` (278 formulas; findings; section 5 = every change old → new).
- F.4 / F.7 / F.8 formulas: `src/domain/perception.ts`, `preload.ts`, changes in `quality.ts`, `volume.ts`, `progression.ts`
  (`indexBasis`, `comparableSessions`, new increase / reduce rules), `prescription.ts` (`context`, `expectedRepDrop`), `baseline.ts`.
- F.2 domain: `liveFlow.ts` (prefill, logSet, effort tap, rest state), `planner.ts` (targets instead of planned rows:
  `targetFromPrescription`, `workoutFromPlan`, `applyPendingUpdate`, `planAdherence`), types (`ExerciseTarget`, `typeSource`,
  `restTargetSec`, settings `restDefaultSec` / `language` / `trainAccent`, `quality.useNumbersCheck`).
- F.3 domain: `weights.ts`.
- Research: `references-perception.ts` (33 verified references, 2026-11-23), 8 new rules in `rules.ts`.
- Audit fixes (owner approved): 28 defects, `tests/audit-fixes.test.ts` (53 tests). NOT yet reviewed line by line by the main session.
- Tests: `tests/part6-flow.test.ts`, `tests/part6-perception.test.ts`; vitest 596 passing; typecheck clean.
- `docs/DESIGN.md`, `docs/GLOSSARY_RU.md`, `src/i18n/core.ts` + `index.ts` (`L(en, ru)`, `P`, `NP`, `num`, `parseDecimal`, `useLang`).
  DECISION: texts are inline pairs `L('English', 'Русский')` (not key files); the domain imports `../i18n/core`.
- Training mode: `src/ui/pages/Train.tsx` (LogPage → TrainSession for live workouts, SessionEditor for finished ones),
  `src/ui/train/controls.tsx` (weight ruler, step chooser, rest ring, effort row), `useLiveWorkout.ts` (ordered writes), `liveEditors.ts`;
  theme tokens in `src/index.css` (`.train`) and `tailwind.config.js`.
- `e2e/train.spec.ts`: the full journey PASSES in English on all 4 WebKit viewports (iphone-13, mobile-375, mobile-430, desktop).
  Screenshots: `test-artifacts/train/after/<project>/en/`.

### Left to do, in this order
1. Training mode polish: **stop an exercise early** (owner, 2026-11-24): a quiet "Next exercise" on the rest screen and "Finish this exercise" in the exercise ⋯ menu whenever at least one set is logged and the target is not reached yet — marks the exercise done (`doneAt`), opens the next open one, Undo restores; the unfinished sets are not counted against anything (re-assessment already works from what was actually done); the toast covers the REPS control (move toasts to the top inside training mode); EquipmentForm `onSaved`
   should fall back to the id when the store has not updated yet; Settings: rest default (`restDefaultSec`), accent preset
   (`trainAccent`), "Check effort against the numbers" (`quality.useNumbersCheck`), perception bias card (`perceptionBias`).
2. Language: call `setLang(detectLang())` at start-up (main.tsx), EN / RU toggle next to the theme button in `Layout.tsx` (header + sidebar)
   and on `LockScreen.tsx`, mirror in `settings.language`, re-render on change (key the app on `useLang()`), `useAnalysis` must recompute
   when the language changes, `fmt()` and `formatDate()` locale-aware.
3. Translate every screen and every engine text with `L()` (use parallel agents per file group, glossary in `docs/GLOSSARY_RU.md`):
   Layout, LockScreen, Dashboard, NextWorkout, Logger (after step 5), History, Strength, Body, AddBodyWeight, Recovery, Muscles, Reports,
   Periodization, Equipment, EquipmentPicker, Exercises, Import, Settings, Science, ChoiceCard, ui.tsx; domain texts (progression,
   prescription, planner, exerciseChoice, recovery, analysis, reports, targets, volumeResponse, readiness, baseline, bodyweight,
   failure, feedback, fatigue, ruleChecks, sessionSummary, muscles); evidence library texts (rules, general, muscles, exercises, tempo,
   exerciseAudit; reference titles stay in the original). The e2e Russian strings in `e2e/train.spec.ts` (`T.ru`) are GUESSES for the
   lock screen / start screen — align them with the real translations.
4. F.9 Workout check screen (History → a workout → Check): per set type / effort answer / what the numbers say / credit; per muscle sums;
   per exercise index, context, decision. Use `assessSet` with `objectiveForSets`, `preloadFor`, the progression series.
5. History: no "Working" label on set rows (`History.tsx` ~line 332 prints `{s.type}`), tags only for warm-up / drop / side; pass
   `objective` to `assessSet` there. Logger.tsx: it is now only the detailed editor for finished workouts — set `live = false`, delete the
   dead live-only code (RestTimer, LiveBar, PendingActions, TodayPlan, replan effect, planned-row creation in `buildExercise`).
   `NextWorkout.tsx` Start already produces targets (check the plan-edit UI still reads well).
6. Older e2e specs drive the OLD live logger and will fail: rewrite `e2e/readiness.spec.ts`, `e2e/part5.spec.ts`, `e2e/ux-recovery.spec.ts`,
   the live parts of `e2e/responsive.spec.ts` and `e2e/six-month.spec.ts` for the training mode; responsive audit also in Russian.
7. Week screen restyle with the design tokens (numbers `text-num-lg`), then SHOW the owner training-mode + Week screenshots (EN + RU,
   iPhone 13) before restyling the remaining screens; then apply the type / spacing system to the rest.
8. `docs/FORMULA_ANALYSIS.md` (owner's request b): per formula family — what is solid, what is weak, what should be improved or redone and
   how (e.g. Epley above ~10 reps and per exercise; RIR credit steps; recovery windows from one session only; per-session cap; volume
   decisions with unknown effort; context drop per set), with priorities. Analysis only.
9. Six-month simulation with the new flow (sessions logged through `liveFlow.logSet`), advice / analytics appear when expected.
10. CLAUDE.md: update §C, §D, §G, §H, §I, §K, add §L (Part 6), architecture list. Independent review agent on the whole diff since 812e25f
    (include the audit-fix diff) → fix findings with regression tests.
11. Typecheck, vitest, build, full Playwright on 4 viewports EN + RU, commit, push, verify the live bundle hash and console; F.13 report.

### Open audit findings (not errors; need the owner's decision — listed in docs/FORMULA_AUDIT.md)
A-6, A-14 … A-21, B-11, B-13, B-14, C-4, C-10 … C-16.

## F.16 Status on 2026-11-24 (evening) — after the post-compact session

Done since F.15 (all committed locally; nothing pushed yet):
- Step 0 review: 10 findings verified and fixed with failing tests first (`tests/part6-review.test.ts`); the six-month
  replay found one more (reported back-off sets) — fixed. Audit log rows 42–51 in `docs/FORMULA_AUDIT.md` §5.
- F.15 steps 1–5, 8, 9, 10 (CLAUDE.md §C D G H I K + new §L): training-mode polish, stop an exercise early, Settings →
  Training mode, EN / RU switch, every screen / engine text / research text bilingual (`tests/i18n-engine.test.ts`),
  Workout check, History tags, Logger trimmed, `docs/FORMULA_ANALYSIS.md`, `tests/six-month-live.test.ts`.
- Step 7: Week screen restyled; screenshots sent (iPhone 13, EN + RU, `e2e/owner-screens.spec.ts`).
- Owner feedback during the session (all done, tested EN + RU on 4 viewports):
  effort answer on the SET screen before LOG SET; FAILED → MAX (RU ОТКАЗ = most reps possible, not a missed rep);
  "Enough — choose next exercise" opens a chooser; the rest timer keeps counting in 15-s laps until NEXT SET and the
  next set records the real rest; default machine step 2.5 kg; NO text ever cut off (layout audit fails on it).

Still open:
- Step 6: older browser specs rewritten (agent running) + responsive audit EN / RU with 0 findings incl. "text cut off".
- Step 7 (rest): restyle the remaining screens — waits for the owner's OK on the screenshots.
- Step 11: final independent review (running), full Playwright EN + RU, push, verify the live bundle and console, F.13 report.

---

# Part 7 — Formula revision for muscle gain (planned 2026-11-24, after the Part 6 compact)

Goal: the formulas must actively steer toward muscle gain (enough hard sets per muscle per week, sets close to failure,
progressive overload in reps then load, sensible frequency, rest and recovery) — not only describe the logs. Inputs:
`docs/FORMULA_ANALYSIS.md` (first analysis), `docs/FORMULA_AUDIT.md`, and the owner's review below. Every point is to be
CRITICALLY analysed against the code first (reproduce with a failing test, or explain why it is not a defect) — not accepted
on faith, neither the owner's points nor Claude's own earlier proposals.

## G.1 Owner's review of the first analysis (2026-11-24) — each with Claude's first note (to be verified)
1. **Session taper (P3).** 11-set threshold rests on limited evidence (one preprint); a fixed ×0.5 above it is not justified;
   evidence may support diminishing returns, not this multiplier. Proposal: a note / warning instead of silently lowering the
   weekly number, or a threshold per muscle group.
   *Note:* agree the multiplier is a heuristic; options are (a) show raw and tapered, count raw; (b) smooth curve; (c) per group.
2. **Epley extrapolation / "~20 reps" (P2).** The first analysis mixed up "possible reps" and "reps in reserve". Define exactly
   which value is capped, and never decide on an unreliable extrapolated value.
   *Note:* correct — the proposal must say: when POSSIBLE reps at the set's load exceed ~20 (or the load is < ~60 % of the best
   set's), the estimate becomes a band ("far from failure"), not a number; check how this interacts with the ramp rule and the
   new 60 % back-off rule (done 2026-11-24).
3. **Index basis RIR vs reps-only (P1).** Moving the decision to the trend window is good, but "every session in the window has
   RIR" still lets one missing session flip the whole index. Define a minimum share of sessions with RIR or a better
   missing-data policy; test mixed histories.
   *Note:* candidates — (a) RIR basis when ≥ 80 % of window sessions have it, sessions without it scored with the history's
   median RIR (labelled estimate); (b) always reps-only for trend, RIR only as context. Decide on the effect on decisions.
4. **Recovery: latest expiry, no 4-day limit (P1).** Use every session whose window is still open, not a fixed lookback.
   *Note:* correct — windows can exceed 4 days (72 h + 12 h + 24 h soreness = 108 h); the rule should be "any earlier session
   whose window has not expired".
5. **Next-set rep drop vs rest (P3).** 60 s is too generic; even with longer rest a SHORT rest can explain a drop — it must not
   automatically mean the earlier set was near failure.
   *Note:* compare with the owner's usual rest for the exercise (< 70 % → rest explains it, no evidence), as `rest_attribution` does.
6. **Evidence vs implementation numbers.** Principles (proximity to failure, diminishing returns, recovery, order) are
   research-supported; the exact coefficients / thresholds / multipliers are heuristics. Do not present them as established.
   *Note:* audit every rule in `rules.ts`: split "principle (evidence)" from "number (heuristic, confidence)" in text and UI.
7. **Verification of the audit.** The 278-formula audit was not independently reviewed against the code by the owner's reviewer.
   *Note:* re-check every P1 / P2 item against the code with a failing test before changing anything; independent agent pass.
8. **Regression risk.** Changes to recovery, strength index and set allocation ripple into advice, progress and weekly volume.
   *Note:* failing test first, then run the six-month reference, the training-mode replay and the Week / Strength / Recovery checks.
9. **Weighted pull-ups / dips (P2).** Index flips between body + belt and belt-only with weigh-in timing; a 28-day-old weight
   may be unrepresentative. Either a labelled estimated body weight with an explicit validity policy, or belt-only for the trend
   with body + belt as context.
   *Note:* prefer belt-only for trend / decisions (stable scale), body + belt shown as labelled context.
10. **Set-count inconsistency (P2, audit C-4).** Planner and first live re-assessment size sets differently (5 → 3 with nothing
    done). One allocation routine with clear muscle-coefficient constraints.
11. **Baseline partial weeks (P2, audit B-13).** Count only complete weeks, or normalise partial ones.
12. **Failure share (P1, audit A-17).** 30 sets at RIR 2 + 6 "failure" reads 100 %. Sets with RIR ≥ 1 count as not to failure → 6 / 36 ≈ 17 %.

13. **Today's share ignores future recovery (owner, P1 candidate).** "4 sets today" assumes every remaining training day is
    usable for that muscle; if the next day falls inside its recovery window, the week ends short. Sometimes today must say 5 or 6.
    *Proposal (to verify):* per muscle, remaining sets R and the likely remaining sessions (owner's usual days). For today's
    candidate s (from R ÷ sessions, upward in 0.5 steps, ≤ the per-session cap): window w(s) from the recovery table → only later
    sessions after w(s) (and after each later session's own window) are feasible → spread R − s over them (each ≤ cap). Choose
    the SMALLEST s that completes the week; if none, use the cap and say plainly how short the week will end ("fine — nothing
    to make up"), never cram. Example: chest R = 12, sessions Mon / Tue / Thu: 4 on Mon → 36 h window → Tue not feasible →
    Thu would need 8 → choose 6 Mon + 6 Thu. Evidence check: frequency with equated volume (schoenfeld2019_frequency,
    pelland2026_volume_frequency — re-verify) supports redistributing; the per-session cap and recovery windows are heuristics
    (see point 1 and A-14) — label them. Also apply the same feasibility to the planner (C-4, point 10) so plan and Week agree.

14. **Suggest an extra short session when the usual days cannot fit the week (owner).** The usual pattern is learned from the
    history (example to design and test for: Mon / Wed / Fri). If, with item 13, the remaining usual days cannot complete a
    muscle's week (recovery windows, per-session cap), the app may SUGGEST one extra short session on a day that is outside
    the relevant recovery windows, e.g. "Short session on Thursday: chest 3 sets, side delts 2 — otherwise the week ends about
    5 sets short." Rules (to verify): only when the shortfall is meaningful (proposal: ≥ 2 effective sets on at least one muscle,
    or the sum ≥ 4), only the muscles that are short, smallest useful session, never on a day that would break another muscle's
    recovery or the next usual session; a suggestion with "Why", never a requirement, never blocking, dismissible ("not this
    week"; a dismissal is not learned as a preference unless repeated ≥ 3 times, like other choices). Shown on the Week screen /
    next-workout card; the planner can build that short session. Honest wording: missing a few sets is fine — weekly volume is a
    reference, not a quota.

## G.2 Also to re-examine (Claude's list, from the first analysis and the Part 6 reviews)
- Unknown-effort credit 0.75 now that most sets carry a one-tap answer or none; how the taps map to credit.
- Double progression with taps only (the one-session "too light" shortcut needs an exact RIR — can EASY ever trigger it?).
- Plateau / decline thresholds; weekly targets and individual volume (E.10); exercise choice for growth (evidence only).
- Remaining open audit items: A-6, A-14…A-21, B-11, B-13, B-14, C-4, C-10…C-16.

## G.3 Process
1. State check. 2. Critical re-analysis (code + independent agent + verified research) → `docs/FORMULA_ANALYSIS.md` section
"Second analysis": per item verdict (defect / heuristic to relabel / not a defect), old → new with a hand-computed example,
evidence, expected effect on muscle gain, risk, priority. 3. Implement (failing test first; rules.ts, CLAUDE.md, FORMULA_AUDIT §5,
independent reference, EN + RU texts). 4. Full tests EN + RU, independent review of the diff, push, live check, report.
