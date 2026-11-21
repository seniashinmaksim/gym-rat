# Workout import format — `gymrat.workout` v1.0

The contract between Claude (or any tool) and the app's **Import from Claude** screen.

- Runtime validator: zod schema in `src/domain/importer.ts` (source of truth).
- Formal JSON Schema (draft 2020-12): `docs/schema/workout-import.v1.schema.json`.
- Worked examples: `WORKOUT_PARSING.md`. Synthetic sample: `examples/synthetic-workout.json`.

## Accepted shapes

1. **Envelope** (preferred): `{ "schema": "gymrat.workout", "schema_version": "1.0", "workouts": [ Workout, ... ] }`
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
| `variation` | object | – | `{ bench_angle_deg? (−45..90), grip?, grip_width?, stance?, rom?, unilateral?, notes? }` |
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
| `notes` | string | – | |

`confidence` ∈ `confirmed`, `probable`, `uncertain`, `unknown`.

## What the importer does

1. Validates the JSON (errors listed with paths).
2. Resolves the gym (`location_id` exact → confirmed; id matching a name → probable; `name_hint` → suggestions only).
3. Resolves exercises (`exercise_id` → direct; otherwise an exact English/Russian name or alias → probable; anything else → suggestions + blocking error until the owner picks).
4. Proposes equipment instances only within the same gym (probable at best); warns when a machine exercise has no identified equipment, when equipment belongs to another gym, and when a load differs > +30 % / < −40 % from the last session on the same machine.
5. Blocks duplicates (SHA-256 of date + gym + exercises + sets, or same `client_ref`); warns about other sessions on the same day/gym.
6. Never fills unknown values; they stay `null` and are shown as uncertain.

## Versioning

Additive, backwards-compatible changes → bump the minor (`1.1`). Breaking changes → new major, a new schema file, and parser support for both while migrating. Keep CLAUDE.md, WORKOUT_PARSING.md, this file, the JSON Schema, the example and `tests/importer.test.ts` in sync.
