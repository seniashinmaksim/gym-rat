# CLAUDE.md — Gym Rat: project instructions & workout-interpretation workflow

This file tells Claude how to **interpret, structure, analyze and remember** the owner's workouts across sessions, and how to work on this codebase.

> **Important distinction — this is an instruction file, not a database.**
> The repository may be public. **Never** write the owner's real workout history, body measurements, passwords, gym addresses, photos, health data or any other personal data into this file, into any other repository file, into commits, or into build output. All personal training data lives **only** inside the app's encrypted browser storage (IndexedDB, AES-256-GCM). Everything below uses generic rules and **synthetic** examples only.

---

## 0. Coaching stance (applies to every answer)

- Goal: **muscle hypertrophy**. The app is an *analytics* system, not a program generator. The owner trains naturally (usually full body); do not impose a split.
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
3. Produce JSON in the **`gymrat.workout` v1.1** format (see `docs/WORKOUT_SCHEMA.md`, formal schema `docs/schema/workout-import.v1.schema.json`).
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
| `to failure`, `до отказа` | `to_failure: true` (credited as RIR 0); leave `rir` null unless stated |
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

- Coefficients per exercise (central DB: `src/data/exercises.ts`, overridable in the app): **1.0** direct target, **0.5** significant secondary, **0.25** minor, **0** insignificant. These are practical estimates, not activation measurements. Examples: incline press → chest 1.0, front delts 0.5, triceps 0.5; pec deck → chest 1.0, front delts 0.25, **no triceps**; lat pulldown → lats 1.0, upper back 0.5, biceps 0.5; hip abduction → glutes 0.5 (glute medius/minimus, not gluteus maximus).
- **Effort is separate from muscle participation.** Effective sets = coefficient × set-quality credit (RIR 0–3 → 1.0, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥8 → 0; unknown RIR → 0.75 provisional; drop segment ×0.5; partial ROM ×0.8; lengthened partials ×1.0; <5 reps ×0.8 except timed exercises such as planks; compromised technique ×0.7 — all configurable in Settings). Exercise-level ROM (`variation.rom`) applies to every set of that exercise unless a set has its own `rom`.
- **Per-session ceiling:** within one session, a muscle's effective sets above ~11 are credited ×0.5 (tapered, not zeroed; Remmert 2025 preprint). Settings → Set-quality model.
- **Planned sets:** the live logger pre-fills sets from last time; a pre-filled set has `planned: true` and is ignored by every calculation until the owner ticks it (✓) or picks an RIR. Unticked planned sets are dropped when the session is finished.
- **Bench-angle rules** (`resolveCoefficients` in `src/domain/registry.ts`) for angle-sensitive presses/flys: ≤ −5° decline → lower-chest emphasis, front delts capped at 0.25; < 10° flat → whole pec; 10–45° incline → upper-chest emphasis, front delts ≥ 0.5; > 45° → chest 0.75, front delts 0.75. Supinated vertical pulls → biceps ≥ 0.75. So record `bench_angle_deg` when the owner gives it.
- **Upper/lower chest are regional emphasis of pectoralis major**, tracked as shares of chest work, with no independent target and **never added to the chest total**.
- **No double counting:** each set credits each muscle exactly once (one coefficient per muscle per exercise). Supersets/giant sets are fine — log each exercise's sets under that exercise. Never log the same set twice (e.g. once as "chest press" and again as "pec work").
- Unilateral exercises: one set = both sides done once (do not double). When sides are logged separately (`side: "left"/"right"`), the i-th left and i-th right set pair into ONE set (each counts 0.5, so the pair's credit is the average of both sides); an unpaired side counts as one set. 3 L + 3 R = 3 sets.
- Changing a coefficient in the app recalculates all historical volume (volume is always derived from raw sets).

---

## D. Training-history rules

- **Compare like with like:** same `exercise_id` × same `equipment_id` × same configuration. Configuration = exact bench angle (angle-sensitive exercises), cable attachment, one side at a time (exercises that offer that choice), standing/seated, straight/bent legs — each recorded value starts its own history. Entries without the value share an "unspecified" history: older entries keep their history, except that an older entry which recorded a bench angle moves to that angle's history (angles were recordable before v1.1). Grip is not part of the key. Linking a free-weight exercise to an equipment entry (e.g. a specific EZ bar) also starts a new history for that bar. Free weights without an equipment id share one history; unidentified machines are kept separate per gym.
- Performance index per session = RIR-adjusted Epley estimate of the best working set (or reps+RIR for bodyweight) — an index for *that* equipment, not a true 1RM.
- **Trend classification** (`src/domain/progression.ts`, last ≤6 sessions within 8 weeks, ≥3 needed):
  - *progressing*: regression slope ≥ +1 %/session and last ≥ first;
  - *declining*: slope ≤ −1.5 %/session and last < first;
  - *possible plateau*: ≥4 sessions over ≥21 days, no new best in the last 2;
  - *stable*: otherwise; *insufficient data*: < 3 sessions.
- **Double progression:** increase load only after **all** working sets at the working load reach the top of the rep range (with RIR recorded) in **two consecutive** sessions; increment = smallest increment of that equipment. One good set or session is never enough — **except** when every set reached the top with ≥ target RIR + 2 in reserve (load clearly too light), where one session suffices. Lighter back-off sets are ignored; assistance never goes below 0.
- **Rest periods:** compare rep retention between sets against rest duration; a drop in performance with shorter rest is not a strength loss. Mention rest changes when explaining a "decline".
- **New variations** (different grip, angle, ROM, machine) start a new comparison context; do not report them as progress or regression.
- **Equipment vs performance:** a sudden large load change (> +30 % or < −40 %) on what looks like the same exercise usually means a different machine, per-side vs total confusion, or a typo — ask before treating it as performance.
- Strength progression ≠ muscle growth. Do not claim hypertrophy from it.

---

### Weekly targets, today's share and recovery (how the app answers "how many sets are left?")

- Targets are effective sets/week. Provisional references (Learning Mode): preferred ≈ 10–12 for most muscles, lower end 6 for large muscles (Pelland 2026: ~4 sets already detectable, 5–10 most efficient). Upper bounds mark diminishing returns, not harm. An active **deload** block halves all targets.
- **Today's share** = (remaining when the day started) ÷ (sessions likely left incl. today), at most ~60 % of the weekly target and ≤ 10 per muscle per session, and never more than what is left. It is fixed for the day; whatever doesn't fit carries over — never cram.
- **Recovery** (heuristic): base window by the last significant session's effective sets — ≤3 → 24 h, ≤6 → 36 h, ≤9 → 48 h, ≤12 → 60 h, more → 72 h; +12 h for ≥2 failure sets, a new exercise, a large muscle after >9 sets, short sleep or high fatigue; +12/24 h for soreness. Only an EARLIER session can hold a muscle back today (today's own sets never do), and only when > 6 h of the window remain. Advice, not a rule.

## E. Data persistence workflow (source of truth = the app)

When the owner submits a workout:

1. **Parse** the message (sections A–C).
2. **Validate** against `gymrat.workout` v1.1 (strict keys, required `date`, `exercises[]`, each set with `weight_kg` and `reps`).
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
| 6 | Quads | `back_squat`, `leg_extension` | squat: quads 1, glutes 0.5, adductors 0.5, erectors 0.25; leg ext: quads 1 | exercise; leg-extension machine | squat: **total** weight, `depth`, `bar_position`, `stance`; leg ext: machine, `seat`, `backrest`, `shin pad` |
| 7 | Hamstrings | `romanian_deadlift` (barbell), `dumbbell_romanian_deadlift`, `seated_leg_curl`, `lying_leg_curl`, `standing_leg_curl` | RDL: hamstrings 1, glutes 0.75, erectors 0.5, adductors 0.5, forearms 0.25, traps 0.25; curls: hamstrings 1, calves 0.25 | each id; each machine | RDL: total (barbell) or per dumbbell, ROM, notes. Curls: machine, manufacturer/model, `seat`, `backrest`, `ankle pad`, `thigh pad`; standing curl per side |
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

---

## Developer notes

### Architecture

```
src/
  domain/        pure, tested logic (no DOM, no storage)
    types.ts       entity model          muscles.ts    muscle list, reference ranges
    registry.ts    exercise registry + bench-angle coefficient rules
    quality.ts     set-quality (effort) model     volume.ts   fractional/effective volume
    dates.ts       week/timezone helpers          history.ts  weekly buckets
    progression.ts per-equipment progression, double progression, warm-ups
    recovery.ts    heuristic recovery estimates   targets.ts  learning mode + targets
    analysis.ts    weekly status, remaining sets, today's share, priorities
    reports.ts     weekly/baseline reports, rest analysis, deload, body
    importer.ts    gymrat.workout v1.x zod schema, matching, dedupe, export
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
