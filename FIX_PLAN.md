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

Status: **planned, not started.** Parts 1–2 and the recovery-timing fix are live (commits 8f472b5, 0a948b5, 5c5bec2). The owner's full request is in the session transcript; it is condensed faithfully in C.3 (every acceptance test is listed in C.6). Rules at the top of this file still apply, plus: never invent research findings, DOIs or PMIDs; never claim to measure muscle growth.

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
7. Research library + SCIENTIFIC_METHOD.md — collect and VERIFY sources per muscle group (fetch every DOI/PMID); exclude anything unverified. This step is research-heavy; parallel agents per muscle group are suitable if the owner opts into a workflow.
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
