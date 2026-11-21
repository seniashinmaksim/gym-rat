# Workout import format — `gymrat.workout` v1.4

The contract between Claude (or any tool) and the app's **Import from Claude** screen.

- Runtime validator: zod schema in `src/domain/importer.ts` (source of truth).
- Formal JSON Schema (draft 2020-12): `docs/schema/workout-import.v1.schema.json`.
- Worked examples: `WORKOUT_PARSING.md`. Synthetic sample: `examples/synthetic-workout.json`.

## Accepted shapes

1. **Envelope** (preferred): `{ "schema": "gymrat.workout", "schema_version": "1.4", "workouts": [ Workout, ... ] }`
2. A single bare **Workout** object.
3. An **array** of Workout objects.

JSON wrapped in a Markdown code fence (```` ```json ````) is accepted. `schema_version` must start with `1`; other major versions are rejected. All objects are **strict**: unknown keys are an error (catches typos such as `weight_lbs`).

## Workout

| Field | Type | Req. | Notes |
|---|---|---|---|
| `client_ref` | string ≤120 | – | Unique id of the report; a second import with the same value is blocked. |
| `date` | `YYYY-MM-DD` | ✔ | Local date in the training timezone. |
| `start_time`, `end_time` | `HH:mm` \| null | – | 24-hour. |
| `duration_min` | number \| null | – | 0–600. |
| `location_id` | string \| null | – | Shorthand for `location.location_id`. |
| `location` | object | – | `{ location_id?, name_hint?, confidence? }` |
| `exercises` | Exercise[] ≥1 | ✔ | Order = performed order. |
| `session` | object | – | `{ fatigue_1_5?, energy_1_5?, sleep_hours?, session_rpe?, soreness?: {muscle_id: 0–4}, notes? }` |
| `notes` | string | – | |
| `raw_input` | string ≤20000 | – | Original message; stored only in encrypted storage. |
| `uncertainties` | string[] | – | Everything that was assumed or unknown. |

## Exercise

| Field | Type | Req. | Notes |
|---|---|---|---|
| `exercise_id` | string \| null | one of these two | Library id (see CLAUDE.md §A.2). |
| `exercise_name_raw` | string \| null | one of these two | Owner's wording (EN/RU). |
| `exercise_confidence` | confidence | – | |
| `equipment_id` | string \| null | – | Shorthand for `equipment.equipment_id`. |
| `equipment` | object | – | `{ equipment_id?, name_hint?, manufacturer?, model?, kind?, confidence? }` — `kind` ∈ machine, plate_loaded, cable, smith, barbell, dumbbell, kettlebell, bodyweight, band, other. |
| `variation` | object | – | `{ bench_angle_deg? (−45..90), grip?, grip_width?, stance?, rom?, unilateral?, attachment?, position?, execution?, legs?, depth?, bar_position?, loading?, notes? }` — attachment…bar_position are v1.1 strings; `loading` (`bodyweight`\|`weighted`, pull-ups) is v1.4. A recorded bench angle (angle-sensitive exercises), attachment, position, legs, pull-up loading and pull-up grip width and — for exercises that offer the choice — unilateral start a separate strength history; grip (and grip width on other exercises) does not. |
| `settings` | `{ key: string \| number }` | – | Session machine settings (seat, pads…). |
| `rest_between_sets_sec` | number \| null | – | Fills `rest_before_sec` for sets 2…n when they have none. |
| `rest_after_sec` | number \| null | – | Rest before the next exercise. |
| `notes` | string | – | |
| `sets` | Set[] ≥1 | ✔ | |

## Set

| Field | Type | Req. | Default / notes |
|---|---|---|---|
| `type` | `warmup` \| `working` \| `drop` | – | `working`. Warm-ups never count toward volume; drop segments credited ×0.5. |
| `weight_kg` | number ≥0 \| null | ✔ (key) | Load on **this** equipment. Dumbbells = one dumbbell. |
| `load_mode` | `total` \| `per_side` \| `bodyweight_plus` \| `assisted` | – | `total`. |
| `reps` | integer 0–200 \| null | ✔ (key) | |
| `rir` | number 0–10 \| null | – | This set only. |
| `rir_source` | `reported` \| `inferred` \| `unknown` | – | `reported` if `rir` given, else `unknown`. |
| `to_failure` | boolean | – | Credited as RIR 0 when `rir` is null. |
| `rest_before_sec` | number 0–3600 \| null | – | |
| `rom` | `full` \| `lengthened_partial` \| `partial` | – | Falls back to `variation.rom`. |
| `technique_ok` | boolean | – | `false` → quality ×0.7. |
| `count` | integer 1–20 | – | Expands to N identical sets. |
| `feel` | see below | – | v1.2. How the set felt — only if the owner said so. Fills `effort` / `weight_accuracy` / `technique` defaults. Never derived from RIR, never converted into RIR. |
| `effort` | `very_easy` \| `easy` \| `appropriate` \| `hard` \| `near_max` | – | v1.2. Overrides the effort implied by `feel`. |
| `weight_accuracy` | `correct` \| `too_light` \| `too_heavy` \| `unknown` | – | v1.2. `too_light`/`too_heavy` = wrong weight picked by accident: kept, not a progression benchmark. |
| `technique` | `good` \| `slightly_degraded` \| `compromised` \| `failed` \| `not_assessed` | – | v1.2. `compromised`/`failed` → reduced credit and not a benchmark. |
| `pain_area` | string | – | v1.2. Pain or unusual discomfort (with `feel: "pain"`). |
| `pain_note` | string ≤500 | – | v1.2. The owner's description of the pain. |
| `intended_weight_kg` | number \| null | – | v1.2. For wrong-weight sets. |
| `failure_status` | `muscular_failure` \| `no_failure` \| `uncertain` | – | v1.3. "Did you reach muscular failure?" — kept **separate from RIR** (never overwrites it). `muscular_failure` = no further full rep with proper technique (≈ RIR 0); `no_failure` = stopped with ≥ 1 rep left; `uncertain` = not sure. Omit when not stated. |
| `technical_failure` | boolean \| null | – | v1.3. The set ended because technique broke down. Counts as compromised technique (×0.7) unless `technique: "good"`, is never a progression benchmark, and does not by itself mean RIR 0. |
| `failure_notes` | string ≤500 | – | v1.3. The owner's words about failure / form breakdown. |
| `execution_feedback` | `followed` \| `ecc_too_fast` \| `ecc_too_slow` \| `momentum` \| `lost_concentric_control` \| `short_rom` | – | v1.3. Did the set follow the recommended execution? Technique guidance only — never changes volume credit. |
| `prescribed` | object | – | v1.3. What the app's prescription engine suggested for this set: `{ weight_kg (number\|null), reps_min, reps_max, rir_min, rir_max, rest_sec? (number\|null), kind ("warmup"\|"working"), engine? }`. Stored apart from the performed values; calculations always use what was performed. Written by the app, not by Claude. |
| `side` | `left` \| `right` | – | v1.1. Unilateral set for one side. The i-th left + i-th right set count as **one** set; an unpaired side counts as one. Sets with a side imply `variation.unilateral: true`. |
| `notes` | string | – | |

`confidence` ∈ `confirmed`, `probable`, `uncertain`, `unknown`.

Variation values (v1.1, free strings but use these): `attachment` ∈ `straight_bar`, `rope`, `v_bar`, `single_handle`, `cuff`; `position` ∈ `standing`, `seated`; `execution` ∈ `simultaneous`, `alternating`; `legs` ∈ `straight`, `bent`; `depth` ∈ `above_parallel`, `parallel`, `below_parallel`; `bar_position` ∈ `high_bar`, `low_bar`.

## Changelog

- **1.4** (additive): variation `loading` (`bodyweight` | `weighted`) for pull-ups — bodyweight-only vs weighted with a dip belt (`weight_kg` = belt weight, `load_mode: "bodyweight_plus"`). Pull-up histories are kept apart by `loading` and `grip_width`. Files with `schema_version` 1.0–1.3 remain valid.
- **1.3** (additive): set `failure_status`, `technical_failure`, `failure_notes`, `execution_feedback`, `prescribed`. Files with `schema_version` 1.0–1.2 remain valid. The duplicate hash appends the failure status / technical failure only when present, so workouts without them hash exactly as before (execution feedback, notes and prescriptions are not part of the hash).
  - **Migration (lazy):** nothing is rewritten. Existing records simply lack the new fields, which means "not recorded / unknown". An old `to_failure: true` is read as muscular failure *reported via the Fail chip* for analysis, but no `failure_status` is stored or back-filled, and RIR 0 alone is never turned into a failure status.

- **1.2** (additive): set `feel`, `effort`, `weight_accuracy`, `technique`, `pain_area`, `pain_note`, `intended_weight_kg`. `feel` ∈ `too_easy`, `bit_easy`, `just_right`, `hard_good` (very hard, good technique), `too_heavy_form` (too heavy, technique compromised), `wrong_light`, `wrong_heavy`, `pain`.
- **1.1** (additive): set `side`; variation `attachment`, `position`, `execution`, `legs`, `depth`, `bar_position`. v1.0 files are still valid and hash identically (no duplicate re-imports).
- **1.0**: initial contract.

## What the importer does

1. Validates the JSON (errors listed with paths).
2. Resolves the gym (`location_id` exact → confirmed; id matching a name → probable; `name_hint` → suggestions only).
3. Resolves exercises (`exercise_id` → direct; otherwise an exact English/Russian name or alias → probable; anything else → suggestions + blocking error until the owner picks).
4. Proposes equipment instances only within the same gym (probable at best, flagged for confirmation); warns when a machine exercise has no identified equipment, when equipment belongs to another gym, and when a load differs > +30 % / < −40 % from the last session on the same machine.
5. Blocks duplicates (SHA-256 of date + gym + exercises + sets, or same `client_ref`). Warns (does not block) when a saved workout has the same date, gym and multiset of working-set (weight, reps, RIR) even though exercise ids differ — "looks like a workout you already have" (e.g. a name-only re-import resolved to different ids); otherwise warns about other sessions on the same day/gym.
6. Adds gentle info notes when a failure status and the RIR disagree (e.g. `muscular_failure` with RIR ≥ 2, `no_failure` with RIR 0). Both values are kept as given.
7. Never fills unknown values; they stay `null` and are shown as uncertain.

## Versioning

Additive, backwards-compatible changes → bump the minor (`1.1`). Breaking changes → new major, a new schema file, and parser support for both while migrating. Keep CLAUDE.md, WORKOUT_PARSING.md, this file, the JSON Schema, the example and `tests/importer.test.ts` in sync.
