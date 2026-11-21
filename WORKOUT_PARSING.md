# WORKOUT_PARSING.md — turning workout messages into `gymrat.workout` records

Practical, **synthetic** examples of how Claude converts a natural-language workout report into a valid import record. Rules live in `CLAUDE.md` (sections A–E); the contract is `docs/WORKOUT_SCHEMA.md` / `docs/schema/workout-import.v1.schema.json`.

General reminders:

- Prefer the envelope form `{ "schema": "gymrat.workout", "schema_version": "1.0", "workouts": [...] }` with a unique `client_ref`.
- Every set needs `weight_kg` and `reps` keys (use `null` when unknown). RIR only on the sets it was stated for.
- Always include `exercise_name_raw` (owner's words) and `exercise_id` when confident.
- List assumptions in `uncertainties` and repeat them in the reply so the owner can correct them **before** importing.
- Location and equipment ids below (`gym_a`, `machine_001`, …) are placeholders; real ids come from the owner's app.

---

## 1. Simple English session

> Today I trained at Gym A. Incline chest press: 3 sets of 10 reps at 45 kg. Lat pulldown: 3 sets of 12 reps at 50 kg. Pec deck: 3 sets of 12 at 40 kg. I had approximately 2 reps in reserve on the last chest press set.

```json
{
  "schema": "gymrat.workout",
  "schema_version": "1.0",
  "workouts": [
    {
      "client_ref": "chat-2026-11-21-1",
      "date": "2026-11-21",
      "location": { "location_id": "gym_a", "name_hint": "Gym A", "confidence": "confirmed" },
      "exercises": [
        {
          "exercise_id": "incline_chest_press",
          "exercise_name_raw": "Incline chest press",
          "sets": [
            { "weight_kg": 45, "reps": 10, "count": 2 },
            { "weight_kg": 45, "reps": 10, "rir": 2 }
          ]
        },
        {
          "exercise_id": "lat_pulldown",
          "exercise_name_raw": "Lat pulldown",
          "sets": [{ "weight_kg": 50, "reps": 12, "count": 3 }]
        },
        {
          "exercise_id": "pec_deck",
          "exercise_name_raw": "Pec deck",
          "sets": [{ "weight_kg": 40, "reps": 12, "count": 3 }]
        }
      ],
      "raw_input": "Today I trained at Gym A. Incline chest press: 3 sets of 10 reps at 45 kg. ...",
      "uncertainties": [
        "RIR known only for the last incline press set",
        "Machines not identified — select equipment instances on import"
      ]
    }
  ]
}
```

Assumptions: "approximately 2 RIR" → `rir: 2`, only on set 3. No machine ids were given, so the app will propose/ask for the equipment instances.

---

## 2. Russian message

> Жим в тренажёре под углом 3х10 по 45 кг, последний подход 2 в запасе. Потом тяга верхнего блока 50 кг 12, 11, 10 — последний до отказа.

```json
{
  "schema": "gymrat.workout",
  "schema_version": "1.0",
  "workouts": [
    {
      "client_ref": "chat-2026-11-21-ru",
      "date": "2026-11-21",
      "location": { "name_hint": null, "confidence": "unknown" },
      "exercises": [
        {
          "exercise_id": "incline_chest_press",
          "exercise_name_raw": "Жим в тренажёре под углом",
          "sets": [
            { "weight_kg": 45, "reps": 10, "count": 2 },
            { "weight_kg": 45, "reps": 10, "rir": 2 }
          ]
        },
        {
          "exercise_id": "lat_pulldown",
          "exercise_name_raw": "Тяга верхнего блока",
          "sets": [
            { "weight_kg": 50, "reps": 12 },
            { "weight_kg": 50, "reps": 11 },
            { "weight_kg": 50, "reps": 10, "to_failure": true }
          ]
        }
      ],
      "raw_input": "Жим в тренажёре под углом 3х10 по 45 кг, последний подход 2 в запасе. ...",
      "uncertainties": ["Зал не указан", "Date assumed to be today — confirm"]
    }
  ]
}
```

Assumptions: "3х10" uses Cyrillic х; "2 в запасе" = RIR 2 on the last set only; "до отказа" → `to_failure: true` (credited as RIR 0), `rir` left null. Gym unknown → ask which gym.

---

## 3. Warm-ups mentioned

> Squats: warmed up with 60x8 and 80x4, then 100 kg 3x6, RIR 2 on all of them.

```json
{
  "date": "2026-11-21",
  "exercises": [
    {
      "exercise_id": "back_squat",
      "exercise_name_raw": "Squats",
      "sets": [
        { "type": "warmup", "weight_kg": 60, "reps": 8 },
        { "type": "warmup", "weight_kg": 80, "reps": 4 },
        { "type": "working", "weight_kg": 100, "reps": 6, "rir": 2, "count": 3 }
      ]
    }
  ],
  "uncertainties": ["Gym not stated", "'Squats' assumed to be barbell back squats"]
}
```

Assumptions: warm-ups explicitly named → `warmup` (never counted). "RIR 2 on all of them" → every working set. "Squats" without qualifier: back squat is the default reading, but flag it — hack/Smith squats are different exercises.

---

## 4. Dumbbells per hand

> Incline DB press 2x30s for 10, 9, 8. Lateral raises with the 10s, 3x15, last set 1 RIR.

```json
{
  "date": "2026-11-21",
  "exercises": [
    {
      "exercise_id": "incline_dumbbell_press",
      "exercise_name_raw": "Incline DB press",
      "sets": [
        { "weight_kg": 30, "reps": 10 },
        { "weight_kg": 30, "reps": 9 },
        { "weight_kg": 30, "reps": 8 }
      ]
    },
    {
      "exercise_id": "lateral_raise",
      "exercise_name_raw": "Lateral raises",
      "sets": [
        { "weight_kg": 10, "reps": 15, "count": 2 },
        { "weight_kg": 10, "reps": 15, "rir": 1 }
      ]
    }
  ],
  "uncertainties": ["Bench angle not stated", "RIR unknown for incline DB press"]
}
```

Convention: dumbbell `weight_kg` = **one** dumbbell, `load_mode: "total"` (default). "2x30s" = a pair of 30 kg dumbbells → 30.

---

## 5. Plate-loaded machine, plates per side

> Hack squat at Gym B: two 20s per side, 4 sets of 10. Then leg press 120 total, 2x12.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_b", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "hack_squat",
      "exercise_name_raw": "Hack squat",
      "sets": [{ "weight_kg": 40, "load_mode": "per_side", "reps": 10, "count": 4 }]
    },
    {
      "exercise_id": "leg_press",
      "exercise_name_raw": "Leg press",
      "sets": [{ "weight_kg": 120, "load_mode": "total", "reps": 12, "count": 2 }]
    }
  ],
  "uncertainties": ["Sled weight not included", "RIR not reported"]
}
```

Assumptions: "two 20s per side" → 40 kg per side. Never add the sled weight. Because these machines' sleds differ, the loads only compare with the same equipment instance.

---

## 6. Assisted pull-up and bodyweight with added load

> Gravitron pull-ups with 25 kg assistance: 8, 8, 7. Dips with +10 kg: 10, 9.

```json
{
  "date": "2026-11-21",
  "exercises": [
    {
      "exercise_id": "assisted_pull_up",
      "exercise_name_raw": "Gravitron pull-ups",
      "sets": [
        { "weight_kg": 25, "load_mode": "assisted", "reps": 8 },
        { "weight_kg": 25, "load_mode": "assisted", "reps": 8 },
        { "weight_kg": 25, "load_mode": "assisted", "reps": 7 }
      ]
    },
    {
      "exercise_id": "dips",
      "exercise_name_raw": "Dips",
      "sets": [
        { "weight_kg": 10, "load_mode": "bodyweight_plus", "reps": 10 },
        { "weight_kg": 10, "load_mode": "bodyweight_plus", "reps": 9 }
      ]
    }
  ]
}
```

Assisted: lower assistance = harder; the app reverses the progression direction. `bodyweight_plus`: only the added load is recorded.

---

## 7. Drop set

> Pushdowns 35 kg x12, then 35x10 and dropped to 25 for 8 more, to failure.

```json
{
  "date": "2026-11-21",
  "exercises": [
    {
      "exercise_id": "triceps_pushdown",
      "exercise_name_raw": "Pushdowns",
      "sets": [
        { "type": "working", "weight_kg": 35, "reps": 12 },
        { "type": "working", "weight_kg": 35, "reps": 10 },
        { "type": "drop", "weight_kg": 25, "reps": 8, "to_failure": true }
      ]
    }
  ],
  "uncertainties": ["Rope vs bar attachment not stated", "Failure stated for the drop segment only"]
}
```

The heavy segment is a normal working set; each lighter segment is `type: "drop"` (credited ×0.5 by default).

---

## 8. Unknown gym and an unidentified machine (manufacturer guess)

> Trained at a hotel gym. Chest press on some machine, I think it was a Life Fitness, 60 kg 3x10 with 2 RIR on each. Rest was about 2 minutes.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": null, "name_hint": "hotel gym", "confidence": "uncertain" },
  "exercises": [
    {
      "exercise_id": "machine_chest_press",
      "exercise_name_raw": "Chest press",
      "equipment": {
        "equipment_id": null,
        "name_hint": "chest press machine (hotel gym)",
        "manufacturer": "Life Fitness",
        "kind": "machine",
        "confidence": "uncertain"
      },
      "rest_between_sets_sec": 120,
      "sets": [{ "weight_kg": 60, "reps": 10, "rir": 2, "count": 3 }]
    }
  ],
  "uncertainties": [
    "New location — create it on import or leave unknown",
    "Manufacturer is the owner's guess",
    "60 kg on this machine is NOT comparable with other chest presses"
  ]
}
```

On import, create a new location and a new equipment instance (manufacturer can be corrected later). `rest_between_sets_sec` fills the rest before sets 2 and 3.

---

## 9. Rest times given per set

> Seated cable row 60 kg: 12 reps, rested 90 s, 11 reps, rested 2:30, 12 reps, 1 RIR.

```json
{
  "date": "2026-11-21",
  "exercises": [
    {
      "exercise_id": "seated_cable_row",
      "exercise_name_raw": "Seated cable row",
      "sets": [
        { "weight_kg": 60, "reps": 12, "rest_before_sec": null },
        { "weight_kg": 60, "reps": 11, "rest_before_sec": 90 },
        { "weight_kg": 60, "reps": 12, "rest_before_sec": 150, "rir": 1 }
      ]
    }
  ]
}
```

`rest_before_sec` is the rest **before** that set. "2:30" = 150 s. RIR "1" placed after the last set → last set only.

---

## 10. Ambiguous exercise name → ask first

> Did curls 3x12 with 15 and some presses, 4x8 at 40.

Claude replies **before** generating JSON:

> Quick check so the record is accurate:
> 1. "Curls" — biceps curls with dumbbells (15 kg each?), a barbell/EZ curl (15 kg total?), or leg curls?
> 2. "Presses" at 40 kg — chest press machine, shoulder press machine, dumbbell press or leg press? Which machine/gym?
> 3. Any RIR for the last sets?

If the owner does not answer, the JSON keeps the raw names with `exercise_confidence: "uncertain"` and no `exercise_id`, so the importer forces a choice:

```json
{
  "date": "2026-11-21",
  "exercises": [
    { "exercise_name_raw": "curls", "exercise_confidence": "uncertain", "sets": [{ "weight_kg": 15, "reps": 12, "count": 3 }] },
    { "exercise_name_raw": "presses", "exercise_confidence": "uncertain", "sets": [{ "weight_kg": 40, "reps": 8, "count": 4 }] }
  ],
  "uncertainties": ["Exercise identity unclear for both entries", "Load convention unclear for curls"]
}
```

---

## 11. Soreness, sleep and fatigue included

> Slept 5.5 hours, still sore in the quads (like 3/4), energy low. Did only upper body: machine shoulder press 30 kg 3x10, last set 1 RIR.

```json
{
  "date": "2026-11-21",
  "exercises": [
    {
      "exercise_id": "machine_shoulder_press",
      "exercise_name_raw": "Machine shoulder press",
      "sets": [
        { "weight_kg": 30, "reps": 10, "count": 2 },
        { "weight_kg": 30, "reps": 10, "rir": 1 }
      ]
    }
  ],
  "session": {
    "sleep_hours": 5.5,
    "soreness": { "quads": 3 },
    "energy_1_5": 2,
    "notes": "Energy low"
  },
  "uncertainties": ["'Energy low' mapped to 2/5 — adjust if needed"]
}
```

Soreness is 0–4 per muscle id; these feed the Recovery estimates (more recovery time is assumed for sore muscles and short sleep).

---

## 12. Multiple workouts in one message

> Catch-up: Monday at Gym A — leg extension 50 kg 3x12. Wednesday at Gym B — seated leg curl 45 kg 3x10, 2 RIR each.

```json
{
  "schema": "gymrat.workout",
  "schema_version": "1.0",
  "workouts": [
    {
      "client_ref": "chat-2026-11-16-a",
      "date": "2026-11-16",
      "location": { "location_id": "gym_a", "confidence": "confirmed" },
      "exercises": [
        { "exercise_id": "leg_extension", "exercise_name_raw": "Leg extension", "sets": [{ "weight_kg": 50, "reps": 12, "count": 3 }] }
      ]
    },
    {
      "client_ref": "chat-2026-11-18-b",
      "date": "2026-11-18",
      "location": { "location_id": "gym_b", "confidence": "confirmed" },
      "exercises": [
        { "exercise_id": "seated_leg_curl", "exercise_name_raw": "Seated leg curl", "sets": [{ "weight_kg": 45, "reps": 10, "rir": 2, "count": 3 }] }
      ]
    }
  ]
}
```

Dates resolved from weekday names relative to the date of the message — state that resolution in the reply so the owner can confirm.

---

## 13. Correcting a previous import

> Oops — yesterday's pulldown was 55 kg, not 50, and it was the Matrix machine.

- Re-importing a corrected copy may be **blocked** if `client_ref` matches the earlier import (duplicates are detected by `client_ref` and by a content hash).
- Preferred fix: in the app, **Workout history → open the session → Edit**, change the load and select the right equipment instance. This keeps a single record.
- Alternative: delete the session in History, then import the corrected JSON (with the same or a new `client_ref`).
- Claude should never claim it "remembered" the correction: it lives only in the app's encrypted data once the owner saves it. If the correction reveals a new machine, the owner creates/identifies that equipment instance in **Equipment & gyms**.
