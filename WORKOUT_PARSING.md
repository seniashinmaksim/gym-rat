# WORKOUT_PARSING.md — turning workout messages into `gymrat.workout` records

Practical, **synthetic** examples of how Claude converts a natural-language workout report into a valid import record. Rules live in `CLAUDE.md` (sections A–E); the contract is `docs/WORKOUT_SCHEMA.md` / `docs/schema/workout-import.v1.schema.json`.

General reminders:

- Prefer the envelope form `{ "schema": "gymrat.workout", "schema_version": "1.3", "workouts": [...] }` with a unique `client_ref`.
- Set feedback (how a set felt, wrong weight, technique, pain) has its own section (§15); failure status (to failure, form broke, not sure) has §16. Only record what the owner actually said.
- The owner's preferred exercises have their own section at the end (§14) — use exactly those ids and variation fields.
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
  "schema_version": "1.3",
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
  "schema_version": "1.3",
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
  "schema_version": "1.3",
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

---

## 14. Preferred exercises (owner's regular movements)

All numbers below are **synthetic**. Use these ids and fields every time; rules are in CLAUDE.md §F.

### 14.0 The typical message

> Today I trained at Gym A. Incline dumbbell press, 25 kg each hand, 3 sets of 10, RIR 2. Pec deck, 45 kg, 3 sets of 12, RIR 1. Cable triceps pushdown with a straight bar, 25 kg, 3 sets of 12.

```json
{
  "schema": "gymrat.workout",
  "schema_version": "1.3",
  "workouts": [
    {
      "client_ref": "chat-2026-11-21-pref",
      "date": "2026-11-21",
      "location": { "location_id": "gym_a", "name_hint": "Gym A", "confidence": "confirmed" },
      "exercises": [
        {
          "exercise_id": "incline_dumbbell_press",
          "exercise_name_raw": "Incline dumbbell press",
          "sets": [{ "weight_kg": 25, "reps": 10, "rir": 2, "count": 3 }]
        },
        {
          "exercise_id": "pec_deck",
          "exercise_name_raw": "Pec deck",
          "equipment": { "name_hint": "pec deck", "confidence": "uncertain" },
          "sets": [{ "weight_kg": 45, "reps": 12, "rir": 1, "count": 3 }]
        },
        {
          "exercise_id": "triceps_pushdown_bar",
          "exercise_name_raw": "Cable triceps pushdown with a straight bar",
          "equipment": { "name_hint": "cable machine", "confidence": "uncertain" },
          "sets": [{ "weight_kg": 25, "reps": 12, "count": 3 }]
        }
      ],
      "raw_input": "Today I trained at Gym A. Incline dumbbell press, 25 kg each hand, ...",
      "uncertainties": [
        "Bench angle not stated — left empty (goes to the 'angle not recorded' history; no angle-specific credit)",
        "\"RIR 2\" / \"RIR 1\" read as applying to every set of that exercise — confirm",
        "Pushdown RIR not stated — effective volume provisional",
        "Pec deck and cable machine not identified — pick the machines on import",
        "Rest times not stated"
      ]
    }
  ]
}
```

- "25 kg each hand" → `weight_kg: 25` (ONE dumbbell). Never 50.
- "RIR 2" written after "3 sets of 10" with nothing else → ask whether it was every set; if the owner isn't available, apply it to all and say so in `uncertainties`.
- Machines are never guessed: hints only; the importer flags them.

### 14.1 Incline dumbbell press — angle

> Incline DB press on the 30° bench, 26 kg dumbbells: 10, 9, 8, RIR 1 on the last. Rested about 2 minutes.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "incline_dumbbell_press",
      "exercise_name_raw": "Incline DB press",
      "variation": { "bench_angle_deg": 30 },
      "rest_between_sets_sec": 120,
      "sets": [
        { "weight_kg": 26, "reps": 10 },
        { "weight_kg": 26, "reps": 9 },
        { "weight_kg": 26, "reps": 8, "rir": 1 }
      ]
    }
  ]
}
```

15°, 30° and 45° (or any custom angle) are separate strength histories; all count as incline for muscle credit (chest 1, front delts 0.5, triceps 0.5). Flat (`0`) is `dumbbell_bench_press`, a different exercise.

### 14.2 Triceps pushdown — straight bar vs rope

> Pushdowns, straight bar, cable 2, height at the top: 30 kg × 12, 12, 11 (RIR 2, 1, 0). Then rope 20 × 15.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "triceps_pushdown_bar",
      "exercise_name_raw": "Pushdowns, straight bar",
      "equipment": { "name_hint": "cable 2", "confidence": "uncertain" },
      "settings": { "cable height": "top" },
      "sets": [
        { "weight_kg": 30, "reps": 12, "rir": 2 },
        { "weight_kg": 30, "reps": 12, "rir": 1 },
        { "weight_kg": 30, "reps": 11, "rir": 0 }
      ]
    },
    {
      "exercise_id": "triceps_pushdown_rope",
      "exercise_name_raw": "rope",
      "equipment": { "name_hint": "cable 2", "confidence": "uncertain" },
      "sets": [{ "weight_kg": 20, "reps": 15 }]
    }
  ]
}
```

Attachment unknown ("pushdowns" only) → `triceps_pushdown` and ask which handle.

### 14.3 Pec deck — machine and settings

> Pec deck (the Technogym one), seat 4, handles in position 2: 50 × 12, 12, 10 to failure.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "pec_deck",
      "exercise_name_raw": "Pec deck (the Technogym one)",
      "equipment": { "name_hint": "pec deck", "manufacturer": "Technogym", "confidence": "probable" },
      "settings": { "seat": 4, "handle position": 2 },
      "sets": [
        { "weight_kg": 50, "reps": 12 },
        { "weight_kg": 50, "reps": 12 },
        { "weight_kg": 50, "reps": 10, "to_failure": true }
      ]
    }
  ]
}
```

Use the owner's `equipment_id` only if they state it. Two pec decks in two gyms are two equipment ids.

### 14.4 Biceps — machine curl vs EZ bar

> Curl machine, seat 3, arm pad 2: 35 × 12, 11. Then EZ bar 30 kg total × 10, 9 (bar about 10 kg I think).

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "machine_biceps_curl",
      "exercise_name_raw": "Curl machine",
      "equipment": { "name_hint": "curl machine", "confidence": "uncertain" },
      "settings": { "seat": 3, "arm pad": 2 },
      "sets": [{ "weight_kg": 35, "reps": 12 }, { "weight_kg": 35, "reps": 11 }]
    },
    {
      "exercise_id": "ez_bar_curl",
      "exercise_name_raw": "EZ bar",
      "variation": { "position": "standing" },
      "sets": [{ "weight_kg": 30, "reps": 10 }, { "weight_kg": 30, "reps": 9 }],
      "notes": "Owner thinks the bar is ~10 kg (unconfirmed)"
    }
  ]
}
```

`weight_kg` is the total the owner reported. Never add or subtract a bar weight; an uncertain bar weight goes in `notes`/`uncertainties`, and a confirmed one is set by the owner on the bar's equipment entry. A preacher-style machine is `preacher_curl`.

### 14.5 Lateral raises — dumbbell vs cable, one side at a time

> DB laterals seated, 10 kg each, 15, 14, 12 alternating. Cable laterals one arm, cuff, pulley at the bottom, 7.5 kg: left 12, right 11, left 11, right 10.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "lateral_raise",
      "exercise_name_raw": "DB laterals seated",
      "variation": { "position": "seated", "execution": "alternating" },
      "sets": [{ "weight_kg": 10, "reps": 15 }, { "weight_kg": 10, "reps": 14 }, { "weight_kg": 10, "reps": 12 }]
    },
    {
      "exercise_id": "cable_lateral_raise",
      "exercise_name_raw": "Cable laterals one arm",
      "variation": { "unilateral": true, "attachment": "cuff" },
      "settings": { "pulley height": "bottom" },
      "sets": [
        { "weight_kg": 7.5, "reps": 12, "side": "left" },
        { "weight_kg": 7.5, "reps": 11, "side": "right" },
        { "weight_kg": 7.5, "reps": 11, "side": "left" },
        { "weight_kg": 7.5, "reps": 10, "side": "right" }
      ]
    }
  ]
}
```

The cable example is **2 sets** for side delts (each left + right pair = one set), not 4. "3 sets of 12 each arm" → 3 `left` and 3 `right` sets of 12 (= 3 sets). "3 sets of 12, one arm at a time" with no per-side detail → 3 sets without `side` and `unilateral: true` (each set = both arms done once).

### 14.6 Quads — back squat vs leg extension

> Squats high bar, below parallel, 100 kg × 6, 6, 5 (RIR 2, 2, 1). Leg extension seat 5, back 3, shin pad 4: 60 × 12 × 3, last one RIR 0.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "back_squat",
      "exercise_name_raw": "Squats high bar",
      "variation": { "depth": "below_parallel", "bar_position": "high_bar" },
      "sets": [
        { "weight_kg": 100, "reps": 6, "rir": 2 },
        { "weight_kg": 100, "reps": 6, "rir": 2 },
        { "weight_kg": 100, "reps": 5, "rir": 1 }
      ]
    },
    {
      "exercise_id": "leg_extension",
      "exercise_name_raw": "Leg extension",
      "equipment": { "name_hint": "leg extension", "confidence": "uncertain" },
      "settings": { "seat": 5, "backrest": 3, "shin pad": 4 },
      "sets": [
        { "weight_kg": 60, "reps": 12, "count": 2 },
        { "weight_kg": 60, "reps": 12, "rir": 0 }
      ]
    }
  ]
}
```

Squat `weight_kg` = total as reported (bar weight never assumed). Depth is recorded, but does not change coefficients.

### 14.7 Hamstrings — RDL vs leg curls

> RDL with dumbbells 32 each, 10, 10, 9. Seated leg curl 55 × 12, 11; standing leg curl 20 kg, left 12 right 12.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "dumbbell_romanian_deadlift",
      "exercise_name_raw": "RDL with dumbbells",
      "sets": [{ "weight_kg": 32, "reps": 10, "count": 2 }, { "weight_kg": 32, "reps": 9 }]
    },
    {
      "exercise_id": "seated_leg_curl",
      "exercise_name_raw": "Seated leg curl",
      "equipment": { "name_hint": "seated leg curl", "confidence": "uncertain" },
      "sets": [{ "weight_kg": 55, "reps": 12 }, { "weight_kg": 55, "reps": 11 }]
    },
    {
      "exercise_id": "standing_leg_curl",
      "exercise_name_raw": "standing leg curl",
      "equipment": { "name_hint": "standing leg curl", "confidence": "uncertain" },
      "variation": { "unilateral": true },
      "sets": [{ "weight_kg": 20, "reps": 12, "side": "left" }, { "weight_kg": 20, "reps": 12, "side": "right" }]
    }
  ]
}
```

"RDL" with a barbell (or unspecified) → `romanian_deadlift`; ask if unclear. Lying / seated / standing curls are separate ids.

### 14.8 Hanging ab straps

> Ab straps: knee raises curling the pelvis up, 15, 12, 10, last one to failure.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "hanging_knee_raise_pelvic_curl",
      "exercise_name_raw": "Ab straps: knee raises",
      "sets": [
        { "weight_kg": 0, "load_mode": "bodyweight_plus", "reps": 15 },
        { "weight_kg": 0, "load_mode": "bodyweight_plus", "reps": 12 },
        { "weight_kg": 0, "load_mode": "bodyweight_plus", "reps": 10, "to_failure": true }
      ]
    }
  ]
}
```

The owner always does the pelvic-curl version in arm straps → `hanging_knee_raise_pelvic_curl` (abs 1.0, no forearms). "Подъём коленей/ног в петлях" means the same. A leg raise hanging from a **bar** is `hanging_leg_raise`; a captain's chair is different equipment — ask.

---

## 15. How the set felt — feedback fields (v1.2)

> Incline DB press: grabbed the 20s by mistake, did 12 easily — meant to use 25. Then 25s for 10, 10, felt just right, RIR 2 on the last. Third set 25 × 8 but my shoulder pinched at the bottom. Pec deck 50 × 10, way too heavy, I was swinging.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "incline_dumbbell_press",
      "exercise_name_raw": "Incline DB press",
      "sets": [
        { "weight_kg": 20, "reps": 12, "feel": "wrong_light", "intended_weight_kg": 25 },
        { "weight_kg": 25, "reps": 10, "feel": "just_right" },
        { "weight_kg": 25, "reps": 10, "rir": 2, "feel": "just_right" },
        { "weight_kg": 25, "reps": 8, "feel": "pain", "pain_area": "Shoulder", "pain_note": "pinched at the bottom" }
      ]
    },
    {
      "exercise_id": "pec_deck",
      "exercise_name_raw": "Pec deck",
      "equipment": { "name_hint": "pec deck", "confidence": "uncertain" },
      "sets": [{ "weight_kg": 50, "reps": 10, "feel": "too_heavy_form", "notes": "swinging" }]
    }
  ],
  "uncertainties": ["\"just right\" stated for the first two 25 kg sets together — applied to both", "RIR only for the third set", "Pec deck: number of sets not stated — one set recorded"]
}
```

- `feel` only when the owner describes the set; never infer it from RIR, and never turn it into an RIR number (the app shows an **estimated** RIR range instead when RIR is missing).
- "Very hard but clean / good form" → `hard_good`; "too heavy, sloppy / swinging / cut the range" → `too_heavy_form`. These are different outcomes: the first is a good set.
- Accidental wrong weight → `wrong_light` / `wrong_heavy` (+ `intended_weight_kg` if stated). The set is kept but not used to judge progress.
- Pain or unusual discomfort (not normal burning or fatigue) → `feel: "pain"`, `pain_area`, the owner's words in `pain_note`. Never diagnose; suggest not pushing through pain.
- The separate dimensions can be given directly when the owner is specific, e.g. `{ "effort": "hard", "technique": "slightly_degraded" }`.

---

## 16. Failure status — "to failure", "one more", "form broke", "not sure" (v1.3)

Failure status is recorded **separately from RIR**. Fill `failure_status` / `technical_failure` only from what the owner said; never invent them (and never turn a stated RIR into a failure status or the other way round, except the RIR-0 rule below).

> Pec deck 45 × 14, 13, 12 — last one to failure. Laterals 10s: 15, 14 — could have done one more each. Squats 100 × 8, 7, form broke on the last rep of the second set. Leg curl 40 × 12, not sure if that was failure.

```json
{
  "date": "2026-11-21",
  "location": { "location_id": "gym_a", "confidence": "confirmed" },
  "exercises": [
    {
      "exercise_id": "pec_deck",
      "exercise_name_raw": "Pec deck",
      "sets": [
        { "weight_kg": 45, "reps": 14 },
        { "weight_kg": 45, "reps": 13 },
        { "weight_kg": 45, "reps": 12, "to_failure": true, "failure_status": "muscular_failure" }
      ]
    },
    {
      "exercise_id": "lateral_raise",
      "exercise_name_raw": "Laterals 10s",
      "sets": [
        { "weight_kg": 10, "reps": 15, "rir": 1, "failure_status": "no_failure" },
        { "weight_kg": 10, "reps": 14, "rir": 1, "failure_status": "no_failure" }
      ]
    },
    {
      "exercise_id": "back_squat",
      "exercise_name_raw": "Squats",
      "sets": [
        { "weight_kg": 100, "reps": 8 },
        { "weight_kg": 100, "reps": 7, "technical_failure": true, "failure_notes": "form broke on the last rep" }
      ]
    },
    {
      "exercise_id": "seated_leg_curl",
      "exercise_name_raw": "Leg curl",
      "equipment": { "name_hint": "leg curl", "confidence": "uncertain" },
      "sets": [{ "weight_kg": 40, "reps": 12, "failure_status": "uncertain" }]
    }
  ],
  "uncertainties": ["Leg curl: seated or lying not stated — seated assumed, please confirm", "Squat set 2: failure status not stated (only that form broke)"]
}
```

| Owner says | Record |
|---|---|
| "to failure", "до отказа", "couldn't do another rep" | `failure_status: "muscular_failure"` (+ `to_failure: true`, which the app credits as RIR 0 when `rir` is null). Keep a stated RIR as stated. |
| "could have done one more", "stopped short", "1–2 in the tank", "не до отказа" | `failure_status: "no_failure"`; `rir` only if a number is given or clearly implied ("one more" → `rir: 1`). |
| "form broke", "technique fell apart", "started cheating / swinging at the end" | `technical_failure: true`, the owner's words in `failure_notes`. Do **not** set `rir: 0` — the muscle may still have had reps left. Add `failure_status` only if the owner also said whether the muscle failed. |
| "not sure if that was failure", "maybe failure" | `failure_status: "uncertain"`; leave `rir` null unless given. |
| nothing about failure | omit all failure fields (unknown). |

- Failure status is **not** a better set: the app gives failure sets the same effort credit as sets with 1–3 RIR (failure is not required for growth). It only uses the status for consistency checks, fatigue/recovery and a descriptive "how often do you go to failure" profile.
- A set marked `muscular_failure` with `technical_failure: true` is treated as technical failure (not a clean failure set) and is not used to judge progress.
- If the owner gives both a status and an RIR that disagree (e.g. "to failure, RIR 2"), keep both as stated, add an uncertainty, and ask; the app also shows a gentle note.
- `execution_feedback` (`followed`, `ecc_too_fast`, `ecc_too_slow`, `momentum`, `lost_concentric_control`, `short_rom`) only when the owner comments on how a recommended execution was followed. `prescribed` is written by the app's prescription engine, not by Claude.
- Older records have none of these fields; they stay "not recorded" (nothing is back-filled).
