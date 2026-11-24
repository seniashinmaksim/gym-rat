# CLAUDE.md — Gym Rat: project instructions & workout-interpretation workflow

This file tells Claude how to **interpret, structure, analyze and remember** the owner's workouts across sessions, and how to work on this codebase.

> **Important distinction — this is an instruction file, not a database.**
> The repository may be public. **Never** write the owner's real workout history, body measurements, passwords, gym addresses, photos, health data or any other personal data into this file, into any other repository file, into commits, or into build output. All personal training data lives **only** inside the app's encrypted browser storage (IndexedDB, AES-256-GCM). Everything below uses generic rules and **synthetic** examples only.

---

## 0. Coaching stance (applies to every answer)

- Goal: **muscle hypertrophy**. The app is **analytics first**; since Part 5 it also proposes the next Full Body workout, but only as far as the owner's own well-logged data supports it (operating modes, section J), always editable and never a fixed split or a fixed order. The owner trains naturally (usually full body); do not impose a split.
- Supplements currently used: **whey protein and creatine**. Do **not** recommend anabolic steroids, other PEDs, or additional supplements.
- Evidence summary to keep answers honest:
  - Hypertrophy is broadly similar across a wide load range (~5–30 reps, ≈30–85 % 1RM) **when sets are taken close to failure** (≈0–3 RIR). Heavy loads are superior for *strength*, not necessarily for size. Progressive overload over time (reps, then load) is what matters.
  - Weekly hard-set volume shows a dose-response with **diminishing returns**; ~10+ sets/muscle/week is a useful reference, not a quota.
  - Training to absolute failure is not required.
- Always separate **observed facts** (logged data), **estimates** (model outputs), **assumptions** (coefficients, heuristics) and **scientific evidence** (literature). Never claim actual muscle growth from volume or strength data alone.
- Every recommendation must state *why*.

---

## A. Workout interpretation rules

### A.1 Pipeline for a natural-language workout message

1. Read the whole message; split it into workouts (one per date/session) and exercises.
2. For each exercise identify: exercise → `exercise_id`, equipment instance, variation (bench angle, grip, ROM), and every set.
3. Produce JSON in the **`gymrat.workout` v1.4** format (see `docs/WORKOUT_SCHEMA.md`, formal schema `docs/schema/workout-import.v1.schema.json`).
4. List every assumption and uncertainty in `uncertainties` **and** in your reply.
5. Show the JSON to the owner for correction **before** they import it.

### A.2 Exercise identification (EN + RU)

- Always output **`exercise_id`** from the library below when you are confident, **and** `exercise_name_raw` with the owner's exact wording (the app shows it and uses it as a fallback).
  - Why: an id resolves directly. Name-only entries auto-resolve (as `probable`) only when the name exactly equals a library English name, Russian name or alias; anything else becomes a blocking item the owner must match by hand.
- If the movement is not in the library, omit `exercise_id` (or set it to `null`), keep `exercise_name_raw`, set `exercise_confidence: "uncertain"`, and tell the owner to create a custom exercise in the app (Exercise database → New custom exercise).
- **Ambiguous names → ask.** Examples: "press" (chest? shoulder? leg?), "rows" (cable? chest-supported? barbell?), "curls" (biceps or leg curl?), "fly" (pec deck vs cable vs dumbbell), "extensions" (leg, triceps, back), "тяга" alone (pulldown/row/deadlift), "жим" alone. If the owner is not available to answer, pick nothing: keep `exercise_name_raw`, set `exercise_confidence: "uncertain"` and add an uncertainty.
- Do not change the exercise because a different one "would be better".

#### Exercise library lookup (ids are stable; source of truth: `src/data/exercises.ts`)

| exercise_id | English | Русский | Common aliases |
|---|---|---|---|
| barbell_bench_press | Barbell bench press | Жим штанги лёжа | bench, flat bench, жим лежа |
| dumbbell_bench_press | Dumbbell bench press | Жим гантелей лёжа | db bench, жим гантелей |
| incline_barbell_press | Incline barbell press | Жим штанги на наклонной | incline bench |
| incline_dumbbell_press | Incline dumbbell press | Жим гантелей на наклонной | incline db press |
| machine_chest_press | Machine chest press | Жим в тренажёре (грудь) | chest press, хаммер грудь |
| incline_chest_press | Incline machine chest press | Жим в тренажёре под углом | incline chest press, incline machine press |
| smith_incline_press | Smith machine incline press | Жим в Смите на наклонной | smith incline |
| decline_press | Decline press | Жим на скамье с отрицательным наклоном | decline bench |
| pec_deck | Pec deck | Пек-дек (бабочка) | butterfly, machine fly, бабочка |
| cable_fly | Cable fly | Сведение рук в кроссовере | crossover, кроссовер |
| low_to_high_cable_fly | Low-to-high cable fly | Сведение снизу вверх | |
| dumbbell_fly | Dumbbell fly | Разводка гантелей | разводка |
| dips | Dips | Отжимания на брусьях | брусья |
| push_up | Push-up | Отжимания от пола | pushups |
| lat_pulldown | Lat pulldown | Тяга верхнего блока | pulldown, вертикальная тяга |
| close_grip_pulldown | Close-grip pulldown | Тяга верхнего блока узким хватом | v-bar pulldown |
| machine_pulldown | Machine pulldown | Тяга сверху в тренажёре | plate-loaded pulldown |
| pull_up | Pull-up | Подтягивания | chin-up |
| assisted_pull_up | Assisted pull-up | Подтягивания в гравитроне | gravitron |
| seated_cable_row | Seated cable row | Тяга горизонтального блока | low row, тяга нижнего блока |
| chest_supported_row | Chest-supported row | Тяга с упором грудью | machine row, seal row |
| barbell_row | Barbell row | Тяга штанги в наклоне | bent-over row |
| dumbbell_row | One-arm dumbbell row | Тяга гантели одной рукой | db row |
| t_bar_row | T-bar row | Тяга Т-грифа | |
| straight_arm_pulldown | Straight-arm pulldown | Пуловер на блоке | cable pullover |
| shrug | Shrug | Шраги | |
| face_pull | Face pull | Тяга к лицу | |
| overhead_press | Overhead press | Жим штанги стоя | OHP, military press, армейский жим |
| dumbbell_shoulder_press | Dumbbell shoulder press | Жим гантелей сидя | |
| machine_shoulder_press | Machine shoulder press | Жим вверх в тренажёре | shoulder press |
| lateral_raise | Dumbbell lateral raise | Махи гантелями в стороны | side raise, махи в стороны |
| cable_lateral_raise | Cable lateral raise | Отведение руки в кроссовере | |
| machine_lateral_raise | Machine lateral raise | Махи в стороны в тренажёре | |
| upright_row | Upright row | Тяга к подбородку | |
| reverse_pec_deck | Reverse pec deck | Обратная бабочка | rear delt fly machine |
| rear_delt_fly | Bent-over rear delt fly | Разводка в наклоне | махи в наклоне |
| front_raise | Front raise | Подъём перед собой | |
| barbell_curl | Barbell curl | Подъём штанги на бицепс | straight bar curl |
| ez_bar_curl | Standing EZ-bar curl | Подъём EZ-штанги на бицепс стоя | EZ curl, EZ bar curl |
| dumbbell_curl | Dumbbell curl | Сгибания с гантелями | |
| incline_dumbbell_curl | Incline dumbbell curl | Сгибания на наклонной скамье | |
| preacher_curl | Preacher curl | Сгибания на скамье Скотта | scott curl, preacher machine |
| machine_biceps_curl | Machine biceps curl | Сгибания рук в тренажёре | machine curl, бицепс в тренажёре |
| cable_curl | Cable curl | Сгибания на блоке | |
| hammer_curl | Hammer curl | Молотки | |
| triceps_pushdown | Triceps pushdown (attachment unspecified) | Разгибания на блоке | pushdown |
| triceps_pushdown_bar | Triceps pushdown (straight bar) | Разгибания на блоке с прямой рукоятью | straight bar pushdown |
| triceps_pushdown_rope | Triceps pushdown (rope) | Разгибания на блоке с канатом | rope pushdown |
| overhead_triceps_extension | Overhead triceps extension | Разгибания из-за головы | french press (overhead) |
| skull_crusher | Skull crusher | Французский жим лёжа | lying triceps extension |
| close_grip_bench | Close-grip bench press | Жим узким хватом | CGBP |
| machine_dip | Machine dip | Отжимания в тренажёре | seated dip |
| wrist_curl | Wrist curl | Сгибания запястий | |
| reverse_curl | Reverse curl | Обратные сгибания | |
| back_squat | Back squat | Приседания со штангой | squat, присед |
| front_squat | Front squat | Фронтальные приседания | |
| hack_squat | Hack squat | Гакк-приседания | гакк |
| smith_squat | Smith machine squat | Приседания в Смите | |
| leg_press | Leg press | Жим ногами | платформа |
| pendulum_squat | Pendulum squat | Маятниковые приседания | |
| bulgarian_split_squat | Bulgarian split squat | Болгарские выпады | split squat |
| walking_lunge | Walking lunge | Выпады в ходьбе | lunges |
| leg_extension | Leg extension | Разгибания ног | |
| romanian_deadlift | Romanian deadlift (barbell) | Румынская тяга | RDL, stiff-leg |
| dumbbell_romanian_deadlift | Dumbbell Romanian deadlift | Румынская тяга с гантелями | DB RDL |
| deadlift | Deadlift | Становая тяга | |
| lying_leg_curl | Lying leg curl | Сгибания ног лёжа | leg curl |
| seated_leg_curl | Seated leg curl | Сгибания ног сидя | |
| standing_leg_curl | Standing single-leg curl | Сгибание ноги стоя | standing leg curl |
| hip_thrust | Hip thrust | Ягодичный мост | glute bridge |
| glute_kickback | Cable glute kickback | Отведение ноги назад | |
| back_extension | 45° back extension | Гиперэкстензия | hyperextension |
| hip_adduction | Hip adduction machine | Сведение ног в тренажёре | |
| hip_abduction | Hip abduction machine | Разведение ног в тренажёре | |
| standing_calf_raise | Standing calf raise | Подъём на носки стоя | calf raise |
| seated_calf_raise | Seated calf raise | Подъём на носки сидя | |
| leg_press_calf_raise | Leg-press calf raise | Икры в жиме ногами | |
| cable_crunch | Cable crunch | Скручивания на блоке | молитва |
| crunch | Crunch | Скручивания | |
| hanging_leg_raise | Hanging leg raise (from a bar) | Подъём ног в висе | leg raise |
| hanging_knee_raise_pelvic_curl | Hanging knee raise with pelvic curl (ab straps) | Подъём коленей в петлях со скручиванием таза | ab straps, hanging knee raise, подъём ног/коленей в петлях |
| ab_machine | Ab crunch machine | Пресс в тренажёре | |
| plank | Plank | Планка | |
| farmer_carry | Farmer's carry | Прогулка фермера | |

Note "Leg curl" (hamstrings) vs "curl" (biceps), and "французский жим" (lying vs overhead): ask if unclear.

### A.3 Gym location identification

- Use the owner's existing location ids (e.g. `gym_a`) when the message names a known gym. Claude does not know the owner's location ids unless the owner states them or pastes them; if unsure use `location.name_hint` with the owner's wording and `confidence: "uncertain"`.
- No gym mentioned → omit `location_id`, set `location: { "name_hint": null, "confidence": "unknown" }` and add an uncertainty. Never guess from "usual habits".

### A.4 Numbers: weights, sets, reps, RIR

| Message pattern | Meaning |
|---|---|
| `3x10 @45`, `3×10 по 45`, `3х10 45 кг`, `3 sets of 10 at 45 kg` | 3 working sets × 10 reps × 45 kg |
| `45×10, 10, 9` / `45 kg: 10/10/9` | 3 sets at 45 kg with reps 10, 10, 9 |
| `50 kg for 12, 11, 10` | 3 sets, reps 12, 11, 10 |
| `5x5 at 100` | 5 sets × 5 reps × 100 kg |
| `2 RIR`, `RIR 2`, `2 in reserve`, `2 в запасе`, `RPE 8` | RIR 2 (RPE 8 ≈ RIR 2; RPE 10 = RIR 0). Mark RPE conversions `rir_source: "inferred"` |
| `to failure`, `до отказа` | `failure_status: "muscular_failure"` + `to_failure: true` (credited as RIR 0); leave `rir` null unless stated |
| `could have done one more`, `stopped before failure` | `failure_status: "no_failure"` (+ `rir: 1` only if a number is implied) |
| `form broke`, `started swinging`, `техника поплыла` | `technical_failure: true` (does NOT by itself mean RIR 0) |
| `not sure if failure` | `failure_status: "uncertain"` |
| `lbs` | Convert to kg (×0.4536, round to 0.1) and add an uncertainty noting the conversion |

- **RIR attaches only to the set(s) it was stated for.** "2 RIR on the last set" → only the last set gets `rir: 2`; earlier sets keep `rir` omitted (`null`). "All sets at 2 RIR" → every set.
- `count` expands identical sets. Use it only if load, reps and RIR are identical; otherwise list sets individually.
- Reps unknown → `reps: null`. Weight unknown → `weight_kg: null`. **Both keys are required in every set** (null is allowed; omission is not).

#### Load conventions (critical for comparability)

| Equipment | `weight_kg` means | `load_mode` |
|---|---|---|
| Selectorised machine / cable stack | number on the stack | `total` |
| Barbell / Smith | total bar + plates as the owner reports it | `total` |
| **Dumbbells** | weight of **one** dumbbell ("2×20 kg dumbbells" → 20) | `total` |
| Plate-loaded machine, owner reports plates **per side** | plates on one side | `per_side` |
| Plate-loaded machine, owner reports total plates | total plates | `total` |
| Assisted pull-up / dip machine | assistance weight (lower = harder) | `assisted` |
| Bodyweight with added load (belt, vest) | added load only (bodyweight alone → `0`) | `bodyweight_plus` |
| **Pull-ups** (v1.4) | belt/vest load only; bodyweight reps → `0`. Also set `variation.loading` (`bodyweight` / `weighted`) and `grip_width` (`narrow` / `shoulder` / `wide`) when stated | `bodyweight_plus` |

Never "normalise" loads (e.g. adding the sled or bar weight) unless the owner says so.

### A.5 Warm-up vs working sets

- `type: "warmup"` if the owner says warm-up / разминка / "ramp", or a clearly light feeler set precedes the working weight **and** the owner treats it as such. When uncertain, ask; if no answer, keep it `working` and add an uncertainty (the app shows its quality as low if RIR is high).
- `type: "drop"` for each drop-set segment after the first (the first, heavy segment is `working`).
- Warm-ups never count toward volume.

### A.6 Missing information

- **Never invent** dates, gyms, machines, loads, reps, RIR, rest times, soreness or sleep. Use `null`/omit and record the gap in `uncertainties`.
- Today's date: use the date the owner gives. If they say "today" and you know the current date, use it; otherwise ask.
- Keep the original message in `raw_input` (it is stored encrypted only).

---

## B. Equipment memory rules

The app models **Gym Location → Equipment instance → Exercise variation → History**. Every physical machine has its own id. Loads on two machines are **never** comparable (cable ratios, cam profiles, sled weights and friction differ).

1. **Matching a previously recorded machine:** if the owner names a known `equipment_id`, use it with `confidence: "confirmed"`. Otherwise fill `equipment.name_hint`, `manufacturer`, `model` from the message. The importer proposes a match only within the same gym, scoring links to the same exercise and name/manufacturer/model similarity, and marks it `probable` (never auto-confirmed).
2. **Same exercise, different machines:** "lat pulldown on the Technogym" and "lat pulldown on the Matrix" are different `equipment_id`s with separate progression histories, even at the same gym.
3. **Machine variations:** a converging vs. a fixed-path chest press, or a plate-loaded vs. a selectorised leg press, are different equipment instances, not settings.
4. **Unknown machines:** leave `equipment_id` null, describe it in `name_hint`; if a manufacturer is only a guess, set `confidence: "uncertain"`. The owner creates the instance in **Equipment & gyms** (manufacturer may stay unknown and be identified later).
5. **Photos:** photos are attached in the app (Equipment & gyms → instance → Add photo). They are re-encoded (EXIF/GPS stripped) and encrypted. When the owner sends a photo to Claude, describe what you can identify (type, likely manufacturer/model, stack increments) and tell the owner which existing instance it most likely is — do not claim certainty.
6. **Increments & settings:** stack increments (e.g. 5 kg, or 2.5 kg with add-on weights) and personal settings (seat 4, back pad 2) belong on the equipment record. Put session-specific settings in the exercise's `settings` object.
7. **Corrections persist in the app, not here.** When the owner corrects an identification, an exercise name or a machine setting, the correction is saved by editing the workout (History → edit) or the equipment record (Equipment & gyms). Never write it into CLAUDE.md.

---

## C. Exercise biomechanics & fractional set accounting

- Coefficients per exercise (central DB: `src/data/exercises.ts`, overridable in the app): **1.0** direct target, **0.5** significant secondary, **0.25** minor, **0** insignificant; **0.75** only where a longitudinal trial or a stated biomechanical reason supports it (e.g. full squats → glutes / adductors, Kubo 2019). Muscles that only STABILISE (isometric bracing, holding the bar) get 0, at most 0.25 when they plausibly limit the set (grip in heavy pulls, erectors in heavy hinges). Only contributions ≥ 0.5 can make a session "significant" for recovery. Every exercise's audit (verdict, confidence, stabilisers, evidence, limitations) is in `src/data/scientific-evidence/exerciseAudit.ts` (audit 2026-11-22). These are practical estimates, not activation measurements. Examples: incline press → chest 1.0, front delts 0.5, triceps 0.5; pec deck → chest 1.0, front delts 0.25, **no triceps**; lat pulldown → lats 1.0, upper back 0.5, biceps 0.5; hip abduction → glutes 0.5 (glute medius/minimus, not gluteus maximus).
- **Effort is separate from muscle participation.** Effective sets = coefficient × set-quality credit (RIR 0–3 → 1.0, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥8 → 0; unknown RIR → 0.75 provisional; drop segment ×0.5; partial ROM ×0.8; lengthened partials ×1.0; <5 reps ×0.8 except timed exercises such as planks; compromised technique ×0.7 — all configurable in Settings). Exercise-level ROM (`variation.rom`) applies to every set of that exercise unless a set has its own `rom`.
- **Per-session note (Part 7, owner 2026-11-24):** every set counts toward the week. Above ~11 effective sets for one muscle in one session the app only shows a note that more sets in one session likely give less (heuristic: no PubMed-indexed study of a per-session ceiling exists; the earlier ×0.5 taper rested on an unindexed preprint). Settings → Set-quality model keeps the threshold and the multiplier (default ×1); stored models with the old ×0.5 were moved to ×1 once.
- **No prepared sets (Part 6):** in the training mode a set exists only once it was done and logged; the plan is a target line (`WorkoutExercise.target`). Older workouts may still contain `planned: true` rows: they are ignored by every calculation and dropped at Finish.
- **Effort from the numbers and automatic warm-ups (Part 6):** see §L. A light set before the session's best set can be credited from the numbers and tagged a warm-up automatically (`typeSource: 'auto'`); the owner's own tags are never changed.
- **Bench-angle rules** (`resolveCoefficients` in `src/domain/registry.ts`) for angle-sensitive presses/flys: ≤ −5° decline → lower-chest emphasis, front delts capped at 0.25; < 10° flat → whole pec; 10–45° incline → upper-chest emphasis, front delts ≥ 0.5; > 45° → chest 0.75, front delts 0.75. Supinated vertical pulls → biceps ≥ 0.75. So record `bench_angle_deg` when the owner gives it.
- **Upper/lower chest are regional emphasis of pectoralis major**, tracked as shares of chest work, with no independent target and **never added to the chest total**.
- **No double counting:** each set credits each muscle exactly once (one coefficient per muscle per exercise). Supersets/giant sets are fine — log each exercise's sets under that exercise. Never log the same set twice (e.g. once as "chest press" and again as "pec work").
- Unilateral exercises: one set = both sides done once (do not double). When sides are logged separately (`side: "left"/"right"`), the i-th left and i-th right set pair into ONE set (each counts 0.5, so the pair's credit is the average of both sides); an unpaired side counts as one set. 3 L + 3 R = 3 sets.
- Changing a coefficient in the app recalculates all historical volume (volume is always derived from raw sets).

---

## D. Training-history rules

- **Compare like with like:** same `exercise_id` × same `equipment_id` × same configuration. Configuration = exact bench angle (angle-sensitive exercises), cable attachment, one side at a time (exercises that offer that choice), standing/seated, straight/bent legs — each recorded value starts its own history. Entries without the value share an "unspecified" history: older entries keep their history, except that an older entry which recorded a bench angle moves to that angle's history (angles were recordable before v1.1). Grip is not part of the key — except pull-ups, where `loading` (bodyweight vs weighted) and grip width each start their own history (v1.4). Linking a free-weight exercise to an equipment entry (e.g. a specific EZ bar) also starts a new history for that bar. Free weights without an equipment id share one history; unidentified machines are kept separate per gym.
- Performance index per session = RIR-adjusted Epley estimate of the best working set (or reps+RIR for bodyweight) — an index for *that* equipment, not a true 1RM.
- **Trend classification** (`src/domain/progression.ts`, last ≤6 sessions within 8 weeks, ≥3 needed):
  - *progressing*: regression slope ≥ +1 %/session and last ≥ first;
  - *declining*: slope ≤ −1.5 %/session and last < first;
  - *possible plateau*: ≥4 sessions over ≥21 days, no new best in the last 2;
  - *stable*: otherwise; *insufficient data*: < 3 sessions.
  - Guards (v1.4 audit): one bad latest session (≥ 5 % under the usual level) is set aside — it never creates a plateau, a decline or a reduction; a *sustained decline* is also flagged when, over ≥ 6 sessions in 8 weeks, the last 3 are ≥ 8 % below the first 3; kg-based and reps-based indices (e.g. bodyweight dips vs dips with a belt) are never compared.
- **Double progression:** increase load only after **all** working sets at the working load reach the top of the rep range in **two consecutive** sessions no more than 56 days apart (further apart → "confirm it next session"); reps at the top are objective evidence, no effort answer is required (Part 6, F.7); a set at that load whose technique broke means the top was not reached cleanly. Increment = smallest increment of that equipment. One good set or session is never enough — **except** when at least two sets reached the top with ≥ target RIR + 2 in reserve (logged RIR, or "too easy") and reps did not fall from the first to the last set, where one session suffices. Lighter back-off sets are ignored; assistance never goes below 0.
- **Like with like (Part 6):** the index basis is one per history (reps + RIR only when every scored session has RIR on its top set, else weight and reps only), and sessions are compared in the same order context (fresh vs after same-muscle work) — §L.
- **Rest periods:** compare rep retention between sets against rest duration; a drop in performance with shorter rest is not a strength loss. Mention rest changes when explaining a "decline".
- **New variations** (different grip, angle, ROM, machine) start a new comparison context; do not report them as progress or regression.
- **Equipment vs performance:** a sudden large load change (> +30 % or < −40 %) on what looks like the same exercise usually means a different machine, per-side vs total confusion, or a typo — ask before treating it as performance.
- Strength progression ≠ muscle growth. Do not claim hypertrophy from it.

---

### Weekly targets, today's share and recovery (how the app answers "how many sets are left?")

- Targets are effective sets/week. Provisional references (Learning Mode): preferred ≈ 10–12 for most muscles, lower end 6 for large muscles (Pelland 2026: ~4 sets already detectable, 5–10 most efficient). Upper bounds mark diminishing returns, not harm. An active **deload** block halves all targets.
- **Today's share** = (remaining when the day started) ÷ (sessions likely left incl. today), at most ~60 % of the weekly target and ≤ 10 per muscle per session, and never more than what is left; fixed for the day. **Part 7 (G.1 #13):** when the owner's usual training days are known (weekdays trained in ≥ half of the last ≤ 8 complete weeks, ≥ 3 weeks; e.g. Mon / Wed / Fri), the share is the smallest one from that even share upward with which the later usual days can still finish the week OUTSIDE the recovery windows (same time of day, base window of the planned sets, 6 h tolerance); failing that, the largest smaller share that does; else the share that fits the most and an honest "~n sets will not fit — fine". Whatever doesn't fit carries over — never cram. If the usual days cannot finish a muscle's week, the Week screen may suggest ONE extra short session on a free day (`weekPlan.ts`; only when it gains ≥ 2 sets on a muscle or ≥ 4 in total; dismissible for the week; never a requirement).
- **Recovery** (heuristic): base window by a significant session's effective sets — ≤3 → 24 h, ≤6 → 36 h, ≤9 → 48 h, ≤12 → 60 h, more → 72 h; +12 h for ≥2 failure sets, a new exercise, a large muscle after >9 sets, short sleep or high fatigue; +12/24 h for soreness. EVERY significant session of the last 7 days is checked and the one whose window ends LAST decides (Part 7 G.1 #4: a small session after a big one does not end the big one's hold). Only an EARLIER session can hold a muscle back today (today's own sets never do), and only when > 6 h of the window remain. Advice, not a rule. The window is counted from when the session ENDED — the last ticked set, else the end time, else start + duration, else the start time, else an assumed 18:00 (shown with "?") — up to the current time; the app recalculates every minute and whenever it is reopened. Give `end_time` (or `duration_min`) in imports when the owner states it.

## E. Data persistence workflow (source of truth = the app)

When the owner submits a workout:

1. **Parse** the message (sections A–C).
2. **Validate** against `gymrat.workout` v1.4 (strict keys, required `date`, `exercises[]`, each set with `weight_kg` and `reps`).
3. **Match** exercises (library ids), gym (`location_id` / `name_hint`) and equipment (`equipment_id` / hints). Mark anything unsure as `uncertain` and ask.
4. **Generate** the JSON (envelope form preferred, with a unique `client_ref`, e.g. `"chat-2026-11-21-1"`).
5. **Allow corrections**: show the JSON plus a short bullet list of assumptions; apply the owner's corrections.
6. **Import**: the owner pastes it into **Import from Claude** in the app, resolves highlighted items (gym, unknown machines, unmatched names) and saves. Duplicates (same content hash or `client_ref`) are blocked.
7. **Use the app's data for analysis.** For any question about history, progression or remaining sets, rely on data the owner exports or pastes (Settings → export workouts JSON, or screenshots/text of app screens). **Never rely solely on conversational memory, and never invent historical records.** If you lack the data, say so and ask for an export.

## F. Preferred exercises (the owner's regular movements)

The owner trains these most often. Use exactly these ids; examples for each are in `WORKOUT_PARSING.md` §14. Coefficients are practical estimates (see section C), not measurements. Nothing here is personal data — loads in examples are synthetic.

| # | Movement | exercise_id(s) | Coefficients | Separate history by | Log / ask for |
|---|---|---|---|---|---|
| 1 | Incline dumbbell press | `incline_dumbbell_press` (flat = `dumbbell_bench_press`) | chest 1, front delts 0.5, triceps 0.5; upper-chest emphasis (not added to chest) | exact bench angle (15°/30°/45°/custom) | **kg per dumbbell**, reps, RIR per set, rest, `bench_angle_deg`, gym, notes |
| 2 | Cable triceps pushdown | `triceps_pushdown_bar` (straight bar), `triceps_pushdown_rope`; `triceps_pushdown` = attachment unknown (older entries) | triceps 1 | exercise id × cable machine | stack weight, reps, RIR, rest, machine, `settings."cable height"` |
| 3 | Pec deck | `pec_deck` | chest 1, front delts 0.25, **no triceps** | machine instance | stack weight, machine (manufacturer/model if known), `seat`, `handle position`, reps, RIR, rest |
| 4 | Biceps curl | `machine_biceps_curl`, `preacher_curl` (preacher-style machine/bench), `ez_bar_curl` | biceps 1, forearms 0.25 | exercise id × machine; EZ: standing/seated | machine: stack, `seat`, `arm pad`, grip. EZ: **total** weight as reported, grip width, notes |
| 5 | Lateral raise | `lateral_raise` (dumbbell), `cable_lateral_raise` | side delts 1, traps 0.25 | dumbbell vs cable; cable machine; standing/seated; attachment; one side at a time | DB: **kg per dumbbell**, `position`, `execution` (simultaneous/alternating). Cable: machine, `attachment`, `settings."pulley height"`, `unilateral` + `side` per set |
| 6 | Quads | `back_squat`, `leg_extension` | squat: quads 1, glutes 0.75, adductors 0.75, erectors 0.25 (above parallel: glutes 0.5, adductors 0.5); leg ext: quads 1 | exercise; leg-extension machine | squat: **total** weight, `depth`, `bar_position`, `stance`; leg ext: machine, `seat`, `backrest`, `shin pad` |
| 7 | Hamstrings | `romanian_deadlift` (barbell), `dumbbell_romanian_deadlift`, `seated_leg_curl`, `lying_leg_curl`, `standing_leg_curl` | RDL: hamstrings 1, glutes 0.75, adductors 0.5, erectors 0.25 (grip and traps only hold the bar — not credited); curls: hamstrings 1, calves 0.25 | each id; each machine | RDL: total (barbell) or per dumbbell, ROM, notes. Curls: machine, manufacturer/model, `seat`, `backrest`, `ankle pad`, `thigh pad`; standing curl per side |
| 8 | Hanging ab straps | `hanging_knee_raise_pelvic_curl` | abs 1 (no forearms: arms rest in straps) | strap equipment instance | reps, RIR/failure, rest, `settings."strap setup"`, notes |

Rules specific to these movements:

- **Hanging ab straps = always the pelvic-curl knee raise** (owner's stated practice): knees up AND pelvis curled toward the ribs (posterior pelvic tilt + spinal flexion) → full ab set. Any "ab straps", "hanging knee raise", "подъём ног/коленей в петлях" message maps to `hanging_knee_raise_pelvic_curl`. A pure hip-flexion leg lift would mainly train the hip flexors (not tracked, no target) and must not be logged as this exercise. A leg raise hanging from a bar is `hanging_leg_raise`; a captain's chair is a different piece of equipment — ask.
- **Bench angle:** record the angle the owner states. Muscle credit uses coarse heuristic groups only (flat < 10°, incline 10–45°, steep > 45°) because the evidence (mostly EMG plus few hypertrophy trials) does not support per-degree coefficients; the exact angle only separates strength histories.
- **Weights:** dumbbells = one dumbbell ("25 kg each hand" → 25). Barbell/EZ/squat = the total the owner reports; never add or assume a bar weight. A known bar weight belongs on that bar's equipment record (`barWeightKg`, set in the app), unknown is allowed.
- **Machines:** pec deck, curl machines, leg extension, leg curls and cable stations are equipment instances per gym; loads never compare across instances. Unknown machine → `equipment.name_hint` (+ manufacturer/model if stated) and `confidence: "uncertain"`; the importer flags it and never assigns it silently.
- **Settings:** the app offers the setting names above for each exercise and remembers values per machine ("Remember for this machine"). Put stated values in `settings`.
- **Unilateral:** `variation.unilateral: true` keeps its v1.0 meaning (one limb at a time; one set = both sides done once). Logging sides is separate: per-side sets get `side`, and a left + right pair is ONE set (section C). Without per-side detail, log one set per both-sides round and no `side`.
- **No separate "number of sets" field** — each set is its own record (`count` only expands identical sets).
- **History:** variations add to the same muscle's weekly volume but keep separate strength records (incline vs flat DB press, bar vs rope pushdown, machine vs EZ curl, DB vs cable laterals, squat vs leg extension, RDL vs leg curls). Load increases follow double progression (section D); never suggest one without that evidence.

## G. Set feedback, recommendations and the simple UI

- **How the set felt** (training mode: one optional tap after the set — EASY · GOOD · HARD · FAILED, mapped in §L; History → Edit and import `feel` keep the full list): too easy · a little too easy · just right · very hard, good technique · too heavy, technique compromised · wrong weight too light · wrong weight too heavy · pain. Each answer also fills three SEPARATE dimensions the owner can change: perceived effort, weight-selection accuracy, technique. Never merge them into one score.
- **RIR stays separate.** A logged RIR decides the effort credit — except where the numbers of the same exercise clearly contradict it (Part 6, §L: e.g. a light ramp set before the best set, ≤ 75 % of its load; or a clear rep collapse on the next set); the stored RIR is never rewritten. Without RIR, the effort gives an ESTIMATED RIR range (very easy 5+, easy 3–4, appropriate 1–3, hard 1–2, near max 0–1) credited with the AVERAGE of the RIR table over its range (Part 7, owner: EASY 3–4 → (1.0 + 0.6) ÷ 2 = 0.8, so answering is never worse than the 0.75 for no answer; 5+ → 0.3); the cross-check against the numbers still uses the range's higher end; it is labelled an estimate and RIR itself stays empty. These ranges are practical assumptions (Settings can switch them off).
- **Volume:** the raw set count never changes. Compromised technique → existing ×0.7; pain → kept, effort credit kept, but flagged uncertain and never "good quality"; wrong weight → credited by its effort (the muscle still worked). Per muscle the app shows sets performed, good-quality, too easy, technique issues, pain, uncertain volume.
- **Progression benchmark:** wrong-weight, pain and compromised/failed-technique sets are kept in history but never used to judge progress. Increase: two consecutive sessions with all sets at the top of the range (no effort answer needed), or one session if at least two sets were clearly too light (RIR ≥ target + 2 or felt "too easy" — "a little too easy" alone is not enough) and reps did not fall. Never increase right after a session with pain. Reduce: technique broke down on at least half of the session's sets AND that is confirmed (on ≥ 2 sets, or a set at that load under the bottom of the range, or the same in the session before) — one subjective answer never changes the load, and a set that was merely hard never does — by about one step (one increment, or back to a clean load from that session within ~1.5 increments). Second reduce rule: most sets under the bottom of the rep range while the trend is declining and a short rest does not explain it → one step down. Load steps use the equipment's smallest increment from the current load.
- **Plateau:** ≥ 4 comparable (representative) sessions over ≥ 3 weeks with no new best in the last two; sessions with high fatigue or short sleep are set aside; a plateau means "check load, rest, technique, effort and recovery first", not "add volume".
- **Rest:** a rep drop at the same weight after a clearly shorter rest (< 70 % of the usual) is attributed to rest, not to the load.
- **Corrections:** editing a finished workout (ended, marked finished, or imported) records original → corrected values per set (and removed sets) — never overwrite silently.
- **UI principle:** the main screen shows only quality sets left per muscle and one increase/keep/reduce call per recent exercise; details open on demand. All calculations live in `src/domain` (feedback.ts, quality.ts, volume.ts, progression.ts, reports.ts).

## H. Failure status, prescriptions, equipment memory and the research library (Part 3)

- **Failure status (v1.3) is separate from RIR.** Per set: `failure_status` ∈ `muscular_failure` (no further full rep with proper technique ≈ RIR 0) · `no_failure` (stopped with ≥ 1 rep left) · `uncertain`; `technical_failure: true` when technique broke down; `failure_notes` for the owner's words. Never invent any of these and never overwrite a stated RIR; if status and RIR disagree, keep both, add an uncertainty and ask. The app: muscular failure without RIR ≈ RIR 0 with the SAME credit as RIR 1–3 (failure is neither required nor superior for hypertrophy); technical failure → technique ×0.7 unless marked good, effort unknown unless a RIR was stated (the Fail chip / `to_failure` alone does not mean RIR 0 when technique gave out) and never a progression benchmark; failure sets count toward the +12 h recovery rule; a weekly failure profile describes patterns (often to failure, on compounds, technique before muscle); its share counts a set with RIR ≥ 1 or an EASY / GOOD / HARD answer as "stopped before failure" (inferred, Part 7 G.1 #12: 30 × RIR 2 + 6 failure sets = 17 %, not 100 %); RIR 0 alone stays unknown. Old records need no migration: absent fields = unknown. The training mode records muscular failure with the FAILED tap; "stopped before failure", "not sure" and technical failure are set in History → Edit (or the import). A gentle note appears when the answer and RIR disagree.
- **Execution / tempo:** `src/data/scientific-evidence/tempo.ts` holds a profile per exercise (eccentric, concentric intent, pause, ROM, cues, confidence, sources). The logger shows one "Form" line; details on tap. Optional `execution_feedback` per set (followed / ecc_too_fast / ecc_too_slow / momentum / lost_concentric_control / short_rom) is guidance only — tempo NEVER adds or removes volume credit; only the technique field changes credit. "Fast intent" = trying to move quickly while staying in control; slower reps near failure are normal.
- **Prescriptions** (`src/domain/prescription.ts`, engine `presc-1`): per exercise × equipment × configuration — warm-ups (never counted), number of sets from today's share of the primary muscle minus what earlier exercises gave it (0 with a reason when the week is covered or the muscle is recovering), load from double progression on the real increments (equipment → the gym's dumbbell steps → default), per-set rep ranges from the owner's own history, RIR targets (machines/isolation 1–2, free-weight compounds 2–3, +1 after technique trouble), rest from the owner's median (bounded), confidence high (≥ 4 comparable sessions in 8 weeks) / moderate (2–3) / low ("calibrating"). After each set `adaptRemaining` re-checks the remaining sets (actual reps, RIR, feel, technique); changes are offered, never applied silently. What was prescribed is stored per set in `prescribed` (v1.3) — written by the app, never by Claude.
- **Equipment memory:** the machine picker shows favourites, recent for this exercise, this gym's equipment, then "Not assigned to a gym" (one tap to assign); other gyms' equipment only when searched/expanded and labelled with its gym. Gyms can record their dumbbell steps (`freeWeightIncrementsKg`).
- **Exercise-specific fields:** grip / grip width appear only where relevant (pulldowns, rows, pull-ups, barbell/EZ curls, bench press width); range of motion sits under "More options"; values logged earlier are still shown.
- **Research library:** `src/data/scientific-evidence/` (references, muscles, exercises, general, tempo, rules) + `SCIENTIFIC_METHOD.md`. Every reference was verified (PMID resolves in PubMed AND DOI matches in Crossref, 2026-11-21); EMG/acute studies are labelled indirect. `rules.ts` lists every numeric adjustment with basis (research / research-informed heuristic / heuristic), confidence, setting and sources; tests enforce it. Research happens at development time only — the app makes no network calls. Cite these ids when explaining a recommendation; never cite from memory.

---

## I. Live workout, body weight, baseline and the numbers-first UI (Part 4)

- **Live workout = training mode (Part 6, §L):** a logged set is saved immediately (ordered writes; flushed when the tab hides and before the vault locks); a second LOG SET with the same values within 1.5 s is ignored (not for the other side of a left / right pair). The rest timer (default 2:30, Settings → Training mode) starts from the set's completion time and survives reloads and the vault lock (−15 / +15 for that exercise, pause, vibration at zero, screen kept awake where supported). Rest between sets of the same exercise is MEASURED (time between completions minus an estimate of the set's own duration). Finish lives only in the overview and shows a summary (duration, exercises, sets, warm-ups, tonnage = weight × reps as logged, average rest, effective sets per muscle, records, failure sets); "Back to workout" restores the live session.
- **Pull-ups (v1.4):** `variation.loading` = `bodyweight` | `weighted` and `grip_width` = `narrow` | `shoulder` | `wide`. Each combination has its own history. `weight_kg` is the belt/vest load only; body weight is never stored on the set. "Body + belt" is shown only as a labelled estimate.
- **Body weight any time:** each weigh-in stores the MEASUREMENT date + time (and optional condition: morning fasted, after breakfast, before/after workout, evening) separately from when it was entered. A workout uses the latest weigh-in taken before it started (same-day entries without a time count only if tagged morning fasted / before workout); older than 7 days → "outdated" (shown as such). The body + belt index of weighted pull-ups / dips uses the latest weigh-in up to 28 days old, marked "estimated" after 7 days (Part 7 G.1 #9: switching single sessions to a belt-only index broke the trend, and a belt-only Epley index ranks sets wrongly). Trend = 7-day average of daily means. Body weight is NOT part of the workout import: if the owner mentions it, tell them to log it in the app (Week → + Weight, or Body) with the time it was measured. Squats/lunges/deadlifts show body weight as context only — never added to the bar.
- **Weekly volume resets, history and recovery do not:** Monday 00:00 (owner's timezone) starts new weekly counters; previous weeks are derived from raw sets (never deleted); recovery counts continuously from the real end of the last session, across the week boundary.
- **Baseline and progress (`src/domain/baseline.ts`):** the first 28 days of an exercise × equipment × configuration history are its baseline (median index of ≥ 2 representative sessions). Progress % = (median of the last ≤ 3 representative sessions in the last 28 days ÷ baseline − 1) — STRENGTH on that setup only (RIR-adjusted Epley, an estimate). Hypertrophy is a SEPARATE "growth signals" status from indirect indicators (strength trend, quality sets, sessions, logged effort, 7-day body weight, waist, photos): baseline in weeks 1–4, "too early" until week 8, then every 4 weeks; never a growth percentage, never claimed from strength alone.
- **Six-month QA audit rules (now enforced by tests):** "quality sets" in totals count each working set ONCE, weighted by its quality credit (never Σ over muscles, which would count one bench set three times); per-muscle numbers stay effective sets. Weighted pull-ups / dips: the strength index uses body (latest weigh-in before the session) + belt — an estimate — and no % is shown from a belt-only index. Rounding is half-up on the decimal value (0.75 × 0.7 = 0.53), independent of summation order. Body-weight averages are means of daily means everywhere (dashboard, weekly, monthly). Growth signals: strength is "positive" when more than half of the histories are up and ups outnumber downs ≥ 3 : 1.
- **Numbers-first UI:** the Week screen is one table: muscle · done / target · LEFT or DONE. Advice reads `INCREASE +2.5 KG` / `KEEP 25 KG` / `REDUCE TO 22.5 KG` / `PLATEAU — n SESSIONS` / `MORE DATA NEEDED`; explanations open on "Why".
- **Mobile layout:** WebKit does not shrink flex children inside `<button>` and grid items default to `min-width: auto`; `src/index.css` sets `.grid > * { min-width: 0 }`, bounds inputs/selects, and normalises iOS date/time inputs. `e2e/responsive.spec.ts` audits 32 screens × 4 viewports (iPhone 13 390×844, 375, 430, desktop) on WebKit; `e2e/readiness.spec.ts` runs a first workout end to end (training mode); `e2e/train.spec.ts` checks the training-mode journey and its design rules in English and Russian; `e2e/six-month.spec.ts` restores a synthetic 26-week backup and checks the real screens. Tables with ≤ 5 columns take their natural width (no forced 560 px), so every column fits on a phone. Unit side: `tests/six-month.test.ts` (simulation vs the independent reference in `tests/sim/reference.ts`), `tests/properties.test.ts` (fast-check, fixed seed), `tests/integrity.test.ts` (encrypted store, migration, 24-month performance), `tests/reports.test.ts`.

---

## J. Exercise choice, order, the adaptive planner and individual volume (Part 5)

- **One engine.** `exerciseChoice.ts`, `planner.ts`, `readiness.ts`, `fatigue.ts` and `volumeResponse.ts` sit on `analyze()` (targets, today's capped catch-up-free share, recovery), `prescribe()` (loads on real increments, reps, RIR, rest, warm-ups) and the progression histories. Nothing here writes data; all new fields are optional (absent = unknown).
- **Exercise choice** (picker dot + compact card): GOOD CHOICE / ACCEPTABLE / CONSIDER ALTERNATIVE (recovery, volume, fatigue) / CONSIDER LATER (order). Muscles with coefficient ≥ 0.5 get a state: READY, RECENTLY LOADED (earlier session inside its window, or ≥ 3 sets today for a synergist), RECOVERY UNCERTAIN (session time unknown near the window's end), PERFORMANCE DECLINING. A weekly deficit never overrides recovery. ≤ 2 alternatives, only familiar ones available at this gym (busy machines excluded). Pain = a separate SAFETY line. Never blocks: [Use …] [Continue]; an answered warning is not repeated in the session unless its inputs change; overrides are learned only after ≥ 3 observations (`choice_learning`).
- **Fatigue cost and order** (rules `fatigue_cost`, `exercise_order`, verified refs in `references-order.ts`): HIGH / MODERATE / LOW per exercise (weighted pull-ups / dips HIGH). Default order HIGH → LOW, but a priority muscle may go first. Evidence: order changes the strength / reps of the LATER exercises; hypertrophy differs little or not at all (Nunes 2021 meta-analysis) — so order is performance protection, not a growth rule. Never present it as more than that.
- **Operating modes** (`readiness.ts`, never by calendar alone): LEARNING → PROVISIONAL ADAPTIVE (≥ 8 well-documented workouts over ≥ 21 days, ≥ 80 % of machine exercises linked to a machine, ≥ 3 regular exercises calibrated) → FULL ADAPTIVE (≥ 10 over ≥ 28 days and calibrated exercises cover ≥ 80 % of the trained major muscles' targets). Well-documented = gym, times/duration, every working set with weight + reps, effort on ≥ 70 % of sets. Calibration per exercise × machine × configuration: 0 INSUFFICIENT DATA, 1 DEVELOPING, 2–3 SUFFICIENT, ≥ 4 WELL CALIBRATED comparable sessions (effort on ≥ 60 % of their sets). Missing sleep / soreness never blocks.
- **Planner** ("YOUR NEXT WORKOUT"): session budget = today's share − done today (0 while recovering); familiar, available, recent exercises cover it with fractional contributions (no direct-muscle overshoot, session near the owner's usual size); unfamiliar exercises only for a persistent deficit against the owner's OWN target. Labels: calibrated / provisional / calibrate (no kg — never transferred between machines). ≥ 10 days off → returning; > 14 → one step down. Start stores the plan in `Workout.generated` (separate from what is performed); Replace / Skip / Edit with optional reason.
- **Real gyms (E.9):** in a live session nothing assumes the planned order: Later (postpone to the end), ↑/↓, Machine busy (`Workout.busyEquipment`, alternatives on free equipment), Replace. Whenever performed sets change, every exercise not started is re-prescribed from what was ACTUALLY done (`replanPending`); only untouched planned sets are updated, edited ones never. Decisions go to `Workout.planDecisions`; "busy" and "pain" never count as preferences; ≥ 3 other repeats at a gym do.
- **Individual volume (E.10, `volume_individual`):** after Learning Mode a muscle's target starts at its own baseline and changes only on evidence: +1–2 when stalled (or flat for weeks) with clean technique, adequate effort, good recovery, stable volume ≥ 3 weeks and no sign that more volume failed before; −1–2 (or back to the last productive level) on repeated decline, consistently poor recovery, technique breakdown, or an increase that brought no better performance; otherwise hold. Never raised just because it is below a generic reference. Each muscle independently; body circumferences are context only.
- Tests: `tests/part5-choice.test.ts`, `tests/part5-planner.test.ts` (data-quality histories in `tests/sim/dataQuality.ts`, 8-week planner run), `tests/part5-review.test.ts` (independent-review regressions), `tests/six-month-part5.test.ts` (26 weeks), `tests/exercise-audit.test.ts` (mapping audit, hand-typed expected values), `e2e/part5.spec.ts` (4 WebKit viewports).
- **Exercise-mapping audit (E.11, 2026-11-22):** all 84 exercises reviewed against verified sources (`exerciseAudit.ts`, `references-audit.ts`): stabilisers are not credited (≤ 0.25); 0.75 only with trial or biomechanical support (full squat → glutes/adductors; leg press → glutes; close-grip bench → chest); acute-EMG differences alone never change a coefficient (DB presses keep triceps 0.5, marked uncertain). Registry: supinated-grip rule only on compound pulls; bench angles outside −30…90° ignored; above-parallel squats credit glutes/adductors 0.5. The library stays the single source of truth; history is recomputed from raw sets, stored workouts are never rewritten.

---

## K. Editing, undo, drafts and navigation (UX audit 2026-11-22)

- **Every entered value stays editable.** Training mode: tap a logged set → weight, reps, effort answer, form broke, wrong weight, pain (+ area), warm-up tag, exact reps in reserve, note, remove (Undo); exercise menu → setup (variation, machine settings, the load mode: total / per side / assistance / added to body weight), machine, sides, change exercise; overview → session date, time, gym, wellness. Failure details, set type "drop" and rest are edited in History → Edit after Finish. A wrong exercise is corrected with **Change exercise** on the card: performed sets are kept, only the exercise changes (machine kept only if linked to the new exercise); nothing performed yet → a fresh card with a new plan. The machine and the recorded variation values the new exercise also uses are kept; on a finished workout the change is written to the audit trail ("Exercise corrected: X → Y (n sets)"). Finished workouts: History → Edit (corrections audit trail, section G). Weigh-ins / measurements: Body → Log → ✎ (date, time, condition, note, every value). Imports, equipment, overrides, settings and plan edits before Start are editable as before.
- **Undo instead of blocking dialogs** for destructive or accidental actions: remove set, remove exercise, Skip, finishing an exercise before its target ("Enough — next exercise" on the rest screen, "Finish this exercise" in its menu), Later, Machine busy, Replace, Change exercise, delete weigh-in, empty Finish. A short toast with **Undo** (~7 s) restores exactly what changed; an undo never discards sets performed after the action, never puts unticked sets into a finished workout, says "Nothing to undo" when things changed since, and reaches the workout even if it was closed and re-opened meanwhile. Deleting a WHOLE workout (logger or History) still asks first — rare and costly — and then also offers Undo. **Finish** by mistake → "Back to workout" in the summary restores the live session (planned sets included). Permanent photo deletion still asks first (encrypted bytes are removed).
- **Nothing typed is lost:** live-logger edits autosave (debounced 350 ms) and are flushed on hide, unmount and **right before the vault locks** (`store.onBeforeLock`). Unsaved form input (new weigh-in, new measurement, new machine, import text and review, plan edits before Start) is kept as an ENCRYPTED draft (`store` kind `draft`, hook `useDraftSync`) until saved or cancelled — it survives leaving the screen, reload and lock, is never part of backups/exports, has an opaque record id, and passwords are never drafted. Cancel discards a draft; ✕ / Back keeps it.
- **Back gesture:** the phone's back gesture / browser Back closes the top-most sheet (picker, forms, More) instead of leaving the workout (`registerBackClose` in `ui.tsx`). An unfinished live workout shows **Resume** on every other screen.
- **During training:** the training mode follows `docs/DESIGN.md` — exactly one primary action per screen (≥ 56 px), nothing that ends or removes within 24 px of it, Finish only in the overview, tap targets ≥ 44 px, landscape keeps the primary action visible; confirmations (toasts) appear at the top so they never cover the weight / reps controls.
- **Covering the stated limitations:** (1) uncertain exercise mappings — `mappingRanges.ts` holds the plausible range the audit text gives for each uncertain coefficient (never invented; 3 uncertain exercises have none); the Week screen shows "counted x; plausible a–b" when a muscle's weekly number depends on one, and the logger marks such credits "(a–b?)". The counted value is still the library value / the owner's override. (2) rules of thumb — `ruleChecks.ts` compares the recovery-window and exercise-order heuristics with the owner's OWN performance (each session vs the median of the previous three on the same exercise × machine; ≥ 6 sessions per side; < 2 % = no clear difference). Settings → "Rules of thumb vs your data" shows the verdict; the app never changes a rule automatically (observational, confounded).
- Tests: `tests/ux-store.test.ts` (pre-lock flush, encrypted drafts, identical undo), `tests/ux-limitations.test.ts` (ranges, spread by hand, rule-check verdicts), `e2e/ux-recovery.spec.ts` (mistakes-and-recovery journey in the training mode, tap targets, landscape, plan / import drafts, 4 WebKit viewports).

---

## L. Training mode, effort from the numbers, session order and Russian (Part 6, 2026-11-24)

- **Log AFTER the set** (`src/ui/pages/Train.tsx`, `src/domain/liveFlow.ts`): set entry (WEIGHT, REPS, one LOG SET button) → rest (2:30 ring, −15 / +15, optional effort tap) → next set; once the target is reached the primary action becomes NEXT EXERCISE with ONE MORE SET as secondary; before it, a quiet "Enough — next exercise" and "Finish this exercise" (exercise menu) stop early, with Undo. The overview holds order, Later, Machine busy, Replace, Change, Skip, Add, session details and Finish. Weight is pre-filled from this session's last set, else the same set last time on the same history (`lastEntryFor`, same exercise × machine × configuration), else the plan; a declined plan load is not pushed again. Reps are pre-filled from last time. Nothing counts until LOG SET.
- **Any weight** (`weights.ts`): typed (comma or point), ± the step, or a swipe ruler; the step chooser (0.5 … 5 kg) is remembered per machine (or per gym for dumbbells). Default steps when nothing is saved: machines, cables, barbells 2.5 kg; dumbbells 2 kg; plates per side 1.25 kg.
- **Rest:** the timer counts down from the default (2:30) and, past zero, keeps counting in 15-second laps until NEXT SET; that press ends the rest, and the next logged set records the real rest (LOG SET → NEXT SET). Without the press the rest is estimated as before.
- **Effort answer** (on the set screen, with weight and reps, before LOG SET; optional, cleared after each set): EASY = effort easy / feel "a little easy" (3+ left); GOOD = appropriate / just right (1–2 left); HARD = near max / hard, good technique (~1 left); MAX (RU «ОТКАЗ») = near max + muscular failure, i.e. the most reps possible, not one more with good form — NOT a missed rep. Exact RIR, form broke, wrong weight and pain: tap the logged set. The rest screen shows the answer and an "edit" link; "Enough — choose next exercise" opens a chooser (remaining plan, suggested first; Add exercise; overview).
- **No text is ever cut off** ("…"), in either language: shorter wording, a smaller size or a second line. `scripts/layout-audit.js` and the training-mode design rules fail on cut text.
- **Effort from the numbers** (`perception.ts`, rules `warmup_by_reserve`, `perception_check`, `perception_bias`; Settings → Training mode → "Check effort against the numbers"): the session's best set of the exercise (per side) predicts the reps possible at a lighter load: the LOWER of Epley, 30 × (best ÷ load − 1), and Brzycki, 37 − (37 − best reps) × load ÷ best load (Part 7 G.1 #2: they diverge at high reps; prediction worsens with reps, reynolds2006_rm_prediction). When even that is > 20 reps, the numbers decide only if the set did ≤ half of them, else nothing is decided. A set BEFORE the best set: estimate = possible − reps done; without an answer the estimate decides (never above the provisional 0.75); with an answer the numbers overrule it only when the estimate is ≥ 5, ≥ 3 above the answer AND the load is ≤ 75 % of the best set's. A clearly lighter set AFTER the best set (≤ 60 % of its load) without an answer: minus one rep per set of that side since the best one; a heavier back-off set without an answer stays provisional (0.75) unless the next-set rule applies (owner's decision 2026-11-24). At the same load, reps falling by ≥ 2 on the next set mark the set as hard — only when that rest is ≥ 60 s (an unknown rest counts as normal) and ≥ 70 % of the exercise's usual rest that day (median of ≥ 3 measured rests; Part 7 G.1 #5), and the next set was not reported with ≥ 3 in reserve. The stored answer is never rewritten; disagreements are shown and summarised (Settings card, after ≥ 12 compared sets).
- **Automatic warm-ups:** a set before the best set whose estimate earns no credit is tagged `type: 'warmup', typeSource: 'auto'` while logging (only where the numbers would overrule an answer); re-checked on every log / edit / undo; the owner's own tag (`typeSource: 'owner'`), imported and older warm-ups are never changed; with the numbers check off nothing is tagged and earlier automatic tags are removed. Finished and imported workouts are never re-tagged.
- **Index basis** (rule `index_basis`): one per history — reps + RIR only when every scored session has RIR on its top set, else weight and reps only (training mode rarely records an exact RIR, so most histories are reps-only; see `docs/FORMULA_ANALYSIS.md` #10).
- **Session order** (`preload.ts`, rule `preload_context`): an exercise done after ≥ 2 fractional sets for its primary muscle is "pre-loaded"; trend and load decisions compare it with sessions in the same context when ≥ 3 exist, else normalise pre-loaded indices by the owner's own measured drop per set (≥ 2 sessions in each context) or a default of 1 % per set, capped at 6 %. The prescription expects correspondingly fewer reps and says why ("the order of the session, not a regression").
- **Workout check** (History → a workout → Check the numbers, `workoutCheck.ts`): per set what was reported, what the numbers say and which decided the credit; per exercise share × credit per muscle, order context, index and next decision; per muscle the sum and what the week counts. The best way for the owner to verify formulas on real data without sharing it.
- **Language** (`src/i18n`): every visible text is a pair `L('English', 'Русский')` (glossary `docs/GLOSSARY_RU.md`); the domain imports `i18n/core`; module-level text tables use `byLang`. The EN / RU switch sits next to the theme toggle (header, sidebar, lock screen); the choice is stored outside the vault (`gymrat-lang`, not personal data) and mirrored in `settings.language`. Stored values (codes, setting keys, pain areas, the benchmark-exclusion code) stay English and are shown through label functions. Exercise names follow the app language; "Also show the name in the other language" adds the second one.
- **Design** (`docs/DESIGN.md`): the training mode is always dark with one accent (Ember / Volt / Ice, Settings); numbers in the condensed display font; one primary action per screen; Finish only in the overview.
- **Analysis of the formulas:** `docs/FORMULA_AUDIT.md` (every formula, findings, every change old → new) and `docs/FORMULA_ANALYSIS.md` (what is solid / weak / to improve, priorities P1–P3; analysis only — formula changes need the owner's OK).
- Tests: `tests/part6-flow.test.ts`, `tests/part6-perception.test.ts`, `tests/part6-review.test.ts`, `tests/workout-check.test.ts`, `tests/i18n.test.ts`, `tests/i18n-engine.test.ts` (the whole engine in Russian has no English phrase), `tests/six-month-live.test.ts` (26 synthetic weeks logged through `logSet` with taps only, against the independent reference), `e2e/train.spec.ts` and the rewritten browser specs (EN + RU, 4 WebKit viewports).

---

## M. Formula revision for muscle gain (Part 7, 2026-11-24)

- Analysis: `docs/FORMULA_ANALYSIS.md` §5 (verdict per item, old → new, evidence, effect, risk); changes in `docs/FORMULA_AUDIT.md` §5.
- Every rule in `rules.ts` states its PRINCIPLE (what research supports) apart from its NUMBER (threshold / multiplier / coefficient — a heuristic unless a study gives it); the Science screen shows both. Never present a heuristic number as established.
- Changes (each with a hand-computed test in `tests/part7-*.test.ts`): failure share (§H), recovery over every open window (Weekly targets), recovery-aware today's share and the optional extra session (`weekPlan.ts`), reps possible from the lower of two equations and no decision on long extrapolations, the short-rest and unknown-rest rules (§L), EASY credit (§G), per-session note instead of the ×0.5 taper (§C), a higher working load in the last two sessions is progress, not a plateau (§D), the index basis decided over the trend window (§D), the body + belt index with weigh-ins up to 28 days (§I), one set-sizing routine for the planner and the live re-plan (§J), the partial first week of the history is not a full week.
- Still heuristics (shown as such): recovery windows and their additions, tolerances, rest cuts, load limits, the 20-rep limit, 0.75 for unknown effort, the RIR table steps above 3, plateau / decline thresholds, the extra-session thresholds. To watch: the individual target ("Your level") can drift down when many sets are untapped (0.75) or carried over — check with History → Check the numbers before changing it.

## Developer notes

### Architecture

```
src/
  domain/        pure, tested logic (no DOM, no storage)
    types.ts       entity model          muscles.ts    muscle list, reference ranges
    registry.ts    exercise registry + bench-angle coefficient rules
    quality.ts     set-quality (effort) model     volume.ts   fractional/effective volume
    feedback.ts    per-set feel → effort / weight accuracy / technique, benchmark rules, corrections audit
    dates.ts       week/timezone helpers          history.ts  weekly buckets
    progression.ts per-equipment progression, double progression, warm-ups
    recovery.ts    heuristic recovery estimates   targets.ts  learning mode + targets
    analysis.ts    weekly status, remaining sets, today's share, priorities
    reports.ts     weekly/baseline reports, rest analysis, deload, body
    importer.ts    gymrat.workout v1.x zod schema, matching, dedupe, export
    failure.ts     failure status consistency + weekly failure profile
    prescription.ts today's prescription (warm-ups, sets, loads, reps, RIR, rest) + set-by-set adaptation
    equipmentMemory.ts machine picker grouping by gym   increments.ts real load steps
    sessionSummary.ts finish summary, measured rest       bodyweight.ts weigh-ins, 7-day average, body weight per workout
    baseline.ts    baseline, progress %, 4-week check, growth signals   effort.ts  effort distribution
    fatigue.ts     fatigue cost, session load          exerciseChoice.ts  choice assistant, alternatives, safety
    readiness.ts   operating modes, calibration       planner.ts   adaptive planner, live re-assessment
    volumeResponse.ts  per-muscle volume decisions (E.10)
    ruleChecks.ts  rules of thumb vs the owner's data   mappingUncertainty.ts  volume ranges for uncertain mappings
    perception.ts  effort from the numbers, automatic warm-ups, perception bias   preload.ts  session-order context
    liveFlow.ts    training-mode logic (prefill, log, effort tap, rest)       weights.ts  any weight, step chooser
    workoutCheck.ts  step-by-step numbers of one workout      weekPlan.ts  usual days, recovery-aware today's share, extra session
  i18n/          L(en, ru) language layer (core.ts has no React; index.ts adds useLang)
  data/scientific-evidence/  verified references, per-muscle/exercise evidence, tempo model, rule registry
  data/exercises.ts  seed exercise library (EN/RU, aliases, coefficients)
  lib/
    crypto.ts      Web Crypto: PBKDF2-SHA-256 (600k) → KEK; AES-256-GCM DEK; AAD-bound records
    db.ts          Dexie/IndexedDB: plaintext vault header + encrypted records/photos
    store.ts       in-memory decrypted state, write-through encryption, auto-lock
    backup.ts      password-encrypted backup files
  ui/            React pages & components (Tailwind)
docs/            schema docs, JSON Schema, research brief
tests/           vitest (analytics, security, importer)
```

### Commands

```
npm install        # once
npm run dev        # local dev server
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build into dist/
npx playwright test # WebKit e2e (needs `npm run dev` on :5173)
```

### Changing the import contract

1. Edit the zod schema in `src/domain/importer.ts`; bump `IMPORT_SCHEMA_VERSION` (minor for additive, major for breaking — the parser rejects other majors).
2. Update **in the same change**: `docs/schema/workout-import.v1.schema.json` (or a new v2 file), `docs/WORKOUT_SCHEMA.md`, `WORKOUT_PARSING.md` examples, `examples/synthetic-workout.json`, this file, and `tests/importer.test.ts`.
3. Adding/renaming exercises: edit `src/data/exercises.ts` and the lookup table in section A.2. Never rename an existing id (history references it).

### Security invariants (do not break)

- No plaintext personal data in IndexedDB: only the vault header (salt, KDF params, wrapped key) is plaintext; every record and photo is AES-256-GCM encrypted with a fresh 96-bit IV and AAD bound to its slot.
- The password and derived keys are never persisted; the data key is non-extractable and held only in memory while unlocked; auto-lock after inactivity + Lock Now.
- No network calls, analytics, CDNs or third-party servers. The CSP in `index.html` (`connect-src 'self'`) enforces this — do not loosen it.
- No secrets, real training data, backups or exports in the repo (`.gitignore` covers backup files).
- Tests in `tests/security.test.ts` must keep passing.
