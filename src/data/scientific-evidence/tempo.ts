/**
 * Exercise-specific execution / tempo model (verified 2026-11-21; see SCIENTIFIC_METHOD.md).
 * Guidance only: tempo never adds or removes volume credit (rule `tempo_no_credit`). Only momentum or a
 * shortened range, when the owner ALSO marks technique as compromised, changes credit via the technique rule.
 * Profiles are practical recommendations from pooled tempo evidence + biomechanics; confidence is stated honestly.
 */
import type { ExecutionFeedback } from '../../domain/types';
import { L, byLang } from '../../i18n/core';

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

export const TEMPO_PROFILES: TempoProfile[] = byLang(() => [
  {
    "exerciseIds": [
      "incline_dumbbell_press"
    ],
    "eccentric": L("about 2 s, controlled into the stretch", "около 2 с, подконтрольно до растяжения"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Press with strong intent on a steady dumbbell path", "Жмите мощно, ведя гантели по ровной траектории"),
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Lower to a deep chest stretch you can control (dumbbells about chest level) and press to near lockout. Keep the same depth and the same recorded bench angle every rep.", "Опускайте до глубокого растяжения груди, которое можете контролировать (гантели примерно на уровне груди), и жмите почти до полного выпрямления рук. В каждом повторении — та же глубина и тот же записанный угол скамьи."),
    "cues": [
      L("Lower ~2 s to a stretch", "Опускайте ~2 с до растяжения"),
      L("Press hard, stay stable", "Жмите мощно, держите устойчивость"),
      L("Same angle, same depth", "Тот же угол, та же глубина")
    ],
    "avoid": [
      L("Bouncing out of the bottom", "Отбив в нижней точке"),
      L("Dumbbells drifting off path", "Гантели уходят с траектории"),
      L("Cutting depth as the set gets hard", "Меньшая глубина, когда подход становится тяжёлым"),
      L("5-10 s negatives by default", "Опускание по 5–10 с как правило")
    ],
    "why": L("Tempo barely changes growth, so control the stretch and press with intent to keep sets close to failure and comparable between sessions.", "Темп почти не влияет на рост, поэтому контролируйте растяжение и жмите мощно: так подходы остаются близкими к отказу и сравнимыми между тренировками."),
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
    "eccentric": L("about 2 s, controlled into the stretch", "около 2 с, подконтрольно до растяжения"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Bring the handles together with intent, no jerk", "Сводите рукояти энергично, без рывка"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Open to a deep but comfortable chest stretch with shoulders back, close until the handles nearly meet. Seat height puts the arms at chest level; keep the same seat and handle settings.", "Разводите до глубокого, но комфортного растяжения груди, плечи отведены назад; сводите, пока рукояти почти не встретятся. Высота сиденья — чтобы руки были на уровне груди; сохраняйте те же настройки сиденья и рукоятей."),
    "cues": [
      L("Control the opening ~2 s", "Разводите подконтрольно ~2 с"),
      L("Stretch, don't let it crash", "Растягивайте, не бросайте вес"),
      L("Squeeze, don't jerk", "Сводите усилием, не рывком")
    ],
    "avoid": [
      L("Stack crashing at the stretch", "Плитки падают в точке растяжения"),
      L("Jerking out of the stretch", "Рывок из растянутого положения"),
      L("Shoulders rolling forward", "Плечи уходят вперёд"),
      L("Shortening the open range", "Укороченное разведение")
    ],
    "why": L("The stretched end is where control matters most; the tempo itself shows no growth advantage either way.", "Контроль важнее всего в растянутом положении; сам темп не даёт преимущества в росте ни в одну сторону."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Push down fast with elbows pinned", "Разгибайте быстро, локти прижаты"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("From full elbow bend (forearms past parallel) to full lockout. Rope: spread the ends at the bottom only if it feels natural. Keep the same cable height.", "От полного сгибания в локтях (предплечья выше параллели) до полного разгибания. Канат: разводите концы внизу, только если это получается естественно. Сохраняйте ту же высоту блока."),
    "cues": [
      L("Elbows fixed at sides", "Локти прижаты к бокам"),
      L("Let it rise to full bend", "Дайте подняться до полного сгиба"),
      L("Push to lockout", "Разгибайте до конца")
    ],
    "avoid": [
      L("Leaning body weight onto the bar", "Наваливаться на рукоять весом тела"),
      L("Elbows drifting forward", "Локти уходят вперёд"),
      L("Stopping short of the bend", "Неполное сгибание вверху")
    ],
    "why": L("In one trial momentum did not change arm growth, but strict elbows keep the load comparable on that cable station.", "В одном исследовании инерция не изменила рост рук, но неподвижные локти сохраняют нагрузку сравнимой на этом блочном тренажёре."),
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
    "eccentric": L("about 2 s, controlled", "около 2 с, подконтрольно"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Curl with intent, smooth", "Сгибайте энергично и плавно"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Lower to a near-straight arm without resting the stack, curl to full flexion. At failure, partial reps in the bottom (stretched) range are fine.", "Опускайте почти до прямой руки, не ставя плитки, сгибайте до полного сгибания. В отказе допустимы частичные повторения в нижней (растянутой) части амплитуды."),
    "cues": [
      L("Lower ~2 s to near straight", "Опускайте ~2 с почти до прямых рук"),
      L("Curl hard, arms on pad", "Сгибайте мощно, руки на подушке"),
      L("Don't rest the stack", "Не ставьте плитки")
    ],
    "avoid": [
      L("Lifting shoulders or hips off the seat", "Отрыв плеч или таза от сиденья"),
      L("Bouncing out of the bottom", "Отбив в нижней точке"),
      L("Top-half-only reps", "Повторения только в верхней половине")
    ],
    "why": L("Growth is similar across tempos and with some momentum; the stretched bottom range matters more than speed.", "Рост схож при разном темпе и при небольшой инерции; растянутая нижняя часть амплитуды важнее скорости."),
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
    "eccentric": L("about 2 s, slowing in the last part of the descent", "около 2 с, замедляясь в конце опускания"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Curl with intent, no bounce out of the bottom", "Сгибайте энергично, без отбива внизу"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Lower to near-full extension under control (do not drop into lockout), curl until the forearm is about vertical. Lengthened partials at failure are fine.", "Опускайте подконтрольно почти до полного разгибания (не роняйте руку в прямой локоть), сгибайте, пока предплечье не станет примерно вертикальным. В отказе допустимы частичные повторения в растянутом положении."),
    "cues": [
      L("Ease into the bottom", "Мягко подходите к нижней точке"),
      L("No bounce at the bottom", "Без отбива внизу"),
      L("Armpits snug on the pad", "Подмышки плотно на подушке")
    ],
    "avoid": [
      L("Dropping into lockout", "Ронять вес в прямой локоть"),
      L("Shoulders or hips heaving", "Рывки плечами или тазом"),
      L("Top-half-only reps", "Повторения только в верхней половине")
    ],
    "why": L("The preacher loads the stretched bottom where the elbow is most exposed, so a controlled turnaround is sensible; bottom-range partials grew as well as full ROM.", "Скамья Скотта нагружает растянутое нижнее положение, где локоть наиболее уязвим, поэтому подконтрольный разворот внизу разумен; частичные повторения в нижней части дали такой же рост, как полная амплитуда."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Curl with intent, torso still", "Сгибайте энергично, корпус неподвижен"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Full extension to full flexion with elbows near the sides. Record standing vs seated; keep the same grip width.", "От полного разгибания до полного сгибания, локти у боков. Записывайте, стоя или сидя; сохраняйте ту же ширину хвата."),
    "cues": [
      L("Stand tall, brace", "Стойте прямо, напрягите корпус"),
      L("Curl hard, don't swing", "Сгибайте мощно, без раскачки"),
      L("Lower all the way", "Опускайте до конца")
    ],
    "avoid": [
      L("Hip or back swing to start reps", "Раскачка тазом или спиной в начале повторения"),
      L("Elbows drifting far forward", "Локти уходят далеко вперёд"),
      L("Half reps from mid-range", "Половинные повторения с середины")
    ],
    "why": L("Some body English did not hurt arm growth in one trial, but a big swing changes the load you compare and stresses the lower back.", "Небольшая помощь корпусом не ухудшила рост рук в одном исследовании, но сильная раскачка меняет сравниваемую нагрузку и нагружает поясницу."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Raise with intent, leading with the elbows", "Поднимайте энергично, ведя локтями"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("From arms near the sides to about shoulder height. With dumbbells the bottom is barely loaded and the load peaks near the top, so there is no need to slow down at the bottom.", "От рук у боков примерно до высоты плеч. С гантелями низ почти не нагружен, а нагрузка максимальна ближе к верху, поэтому замедляться внизу незачем."),
    "cues": [
      L("Lead with elbows", "Ведите локтями"),
      L("Up to shoulder height", "Вверх до высоты плеч"),
      L("No hip kick", "Без толчка тазом")
    ],
    "avoid": [
      L("Swinging or kicking with the hips", "Раскачка или толчок тазом"),
      L("Shrugging the weight up", "Подъём веса за счёт пожимания плечами"),
      L("Stopping well below shoulder height", "Остановка заметно ниже плеч")
    ],
    "why": L("A small amount of momentum may be harmless, but a model suggests a big swing shifts work away from the side delts.", "Небольшая инерция, возможно, безвредна, но модель показывает: сильная раскачка снимает работу со средних дельт."),
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
    "eccentric": L("about 2 s, controlled all the way down", "около 2 с, подконтрольно до самого низа"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Raise with intent, smooth", "Поднимайте энергично и плавно"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Start with the hand slightly across the body so the cable still pulls at the bottom, raise to about shoulder height. Keep the same pulley height and attachment; log side per set if one arm at a time.", "Начинайте с кистью чуть перед корпусом, чтобы трос тянул и внизу, поднимайте примерно до высоты плеч. Сохраняйте ту же высоту блока и ту же рукоять; при работе одной рукой записывайте сторону для каждого подхода."),
    "cues": [
      L("Cable stays taut at bottom", "Трос натянут и внизу"),
      L("Control the low range", "Контролируйте нижнюю часть"),
      L("Same pulley height", "Та же высота блока")
    ],
    "avoid": [
      L("Stack touching down between reps", "Плитки ложатся между повторениями"),
      L("Torso leaning or swinging", "Наклон или раскачка корпуса"),
      L("Shrugging", "Пожимание плечами")
    ],
    "why": L("Unlike dumbbells, the cable keeps tension low in the range, so control it there; growth matched dumbbells when ROM was matched.", "В отличие от гантелей, трос сохраняет натяжение внизу амплитуды, поэтому контролируйте этот участок; рост был таким же, как с гантелями, при равной амплитуде."),
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
    "eccentric": L("about 2 s, controlled", "около 2 с, подконтрольно"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Drive up with strong intent while staying braced", "Вставайте мощно, сохраняя напряжение корпуса"),
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("The same controlled depth every rep, ideally at or below parallel; full squats grew the adductors and glutes more than half squats.", "Одна и та же подконтрольная глубина в каждом повторении, лучше до параллели или ниже; полные приседания сильнее развивали приводящие и ягодичные, чем полуприседы."),
    "cues": [
      L("Brace before each rep", "Напрягайте корпус перед повтором"),
      L("Down ~2 s, same depth", "Вниз ~2 с, та же глубина"),
      L("Drive up hard, stay tight", "Вставайте мощно, держите корпус"),
      L("Slow grinders are OK", "Медленные тяжёлые повторы — норма")
    ],
    "avoid": [
      L("Dive-bombing into the hole", "Падение в нижнюю точку"),
      L("Bouncing off loose knees", "Отбив на расслабленных коленях"),
      L("Cutting depth late in the set", "Меньшая глубина к концу подхода"),
      L("Losing the brace to go faster", "Потеря напряжения корпуса ради скорости")
    ],
    "why": L("Stable technique comes first; fast intent helped squat strength, while tempo had little or mixed effect on size.", "Сначала стабильная техника; старание двигать быстро помогало силе в приседе, а на размер мышц темп влиял слабо или неоднозначно."),
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
    "eccentric": L("about 2 s, controlled", "около 2 с, подконтрольно"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Extend with intent, no kick", "Разгибайте энергично, без броска"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("From the deepest knee bend the machine allows to near lockout. If reps fall short near failure, keep the deep-bend part of the range.", "От самого глубокого сгибания коленей, которое позволяет тренажёр, почти до полного разгибания. Если ближе к отказу повторения становятся неполными, сохраняйте часть амплитуды с глубоким сгибом."),
    "cues": [
      L("Lower all the way down", "Опускайте до самого низа"),
      L("Extend hard, hips down", "Разгибайте мощно, таз прижат"),
      L("Deep bend counts most", "Глубокий сгиб важнее всего")
    ],
    "avoid": [
      L("Kicking the pad up", "Подбрасывать валик"),
      L("Hips lifting off the seat", "Отрыв таза от сиденья"),
      L("Top-half partials", "Частичные повторения в верхней половине")
    ],
    "why": L("Partials in the knee-bent range grew the quads at least as well as full ROM, so protect that range; tempo itself matters little.", "Частичные повторения в положении согнутого колена развивали квадрицепсы не хуже полной амплитуды, поэтому берегите этот участок; сам темп значит мало."),
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
    "eccentric": L("about 2-3 s, controlled", "около 2–3 с, подконтрольно"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Drive hips forward with intent, staying rigid", "Подавайте таз вперёд энергично, корпус жёсткий"),
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Hinge until a strong hamstring stretch with a neutral back and the bar close to the legs; stop before the back rounds. Total weight as reported.", "Наклоняйтесь, отводя таз, до сильного растяжения бицепсов бедра; спина нейтральна, гриф близко к ногам; остановитесь до того, как спина округлится. Общий вес — как вы его называете."),
    "cues": [
      L("Hips back, bar close", "Таз назад, гриф близко"),
      L("Stop at stretch, back flat", "Стоп на растяжении, спина ровная"),
      L("Stand up strong, no jerk", "Вставайте мощно, без рывка")
    ],
    "avoid": [
      L("Rounding the lower back to go deeper", "Округление поясницы ради глубины"),
      L("Bouncing at the bottom", "Отбив в нижней точке"),
      L("Bar drifting forward", "Гриф уходит вперёд"),
      L("Leaning back at the top", "Отклонение назад вверху")
    ],
    "why": L("A heavy hinge rewards a stable position; the controlled descent keeps the bar path, not because slow negatives grow more.", "Тяжёлый наклон требует устойчивого положения; подконтрольное опускание сохраняет траекторию грифа — а не потому, что медленное опускание даёт больше роста."),
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
    "eccentric": L("about 2-3 s, controlled", "около 2–3 с, подконтрольно"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Drive hips forward with intent, staying rigid", "Подавайте таз вперёд энергично, корпус жёсткий"),
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Hinge until a strong hamstring stretch with a neutral back, dumbbells close to the thighs and shins; stop before the back rounds. Weight per dumbbell.", "Наклоняйтесь, отводя таз, до сильного растяжения бицепсов бедра; спина нейтральна, гантели близко к бёдрам и голеням; остановитесь до того, как спина округлится. Вес одной гантели."),
    "cues": [
      L("Hips back, DBs close", "Таз назад, гантели близко"),
      L("Stop at stretch, back flat", "Стоп на растяжении, спина ровная"),
      L("Stand up strong", "Вставайте мощно")
    ],
    "avoid": [
      L("Rounding the back to reach lower", "Округление спины, чтобы достать ниже"),
      L("Bouncing at the bottom", "Отбив в нижней точке"),
      L("Dumbbells swinging forward", "Гантели уходят вперёд")
    ],
    "why": L("Same hinge rules as the barbell version: stable position first; tempo has little effect on growth.", "Те же правила наклона, что и со штангой: сначала устойчивое положение; темп мало влияет на рост."),
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
    "eccentric": L("about 2 s, controlled", "около 2 с, подконтрольно"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Curl with intent", "Сгибайте энергично"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Thigh pad snug, hips flexed (lean slightly forward if the seat allows); from near-straight knees to full flexion.", "Валик плотно прижимает бёдра, тазобедренные суставы согнуты (слегка наклонитесь вперёд, если позволяет сиденье); от почти прямых коленей до полного сгибания."),
    "cues": [
      L("Thigh pad locked tight", "Валик плотно на бёдрах"),
      L("Let legs nearly straighten", "Дайте ногам почти выпрямиться"),
      L("Curl hard, hips down", "Сгибайте мощно, таз прижат")
    ],
    "avoid": [
      L("Hips sliding or lifting", "Таз скользит или отрывается"),
      L("Stack crashing between reps", "Плитки падают между повторениями"),
      L("Short bottom range", "Укороченный низ амплитуды")
    ],
    "why": L("Sitting with hips flexed stretches the hamstrings and grew them more than lying curls in a 12-week trial; tempo matters little.", "Положение сидя с согнутыми тазобедренными суставами растягивает бицепсы бедра и дало больший их рост, чем сгибания лёжа, в 12-недельном исследовании; темп значит мало."),
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
    "eccentric": L("about 2 s, controlled", "около 2 с, подконтрольно"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Curl with intent", "Сгибайте энергично"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Hips pressed into the pad; knees from near-straight to full flexion.", "Таз прижат к подушке; колени — от почти прямых до полного сгибания."),
    "cues": [
      L("Hips pinned to pad", "Таз прижат к подушке"),
      L("Lower to near straight", "Опускайте почти до прямых ног"),
      L("Curl hard, no hip lift", "Сгибайте мощно, таз не поднимайте")
    ],
    "avoid": [
      L("Hips rising to help the curl", "Таз поднимается, помогая сгибанию"),
      L("Kicking from the bottom", "Рывок из нижней точки"),
      L("Stopping short of straight legs", "Остановка до выпрямления ног")
    ],
    "why": L("Lying curls stretch the hamstrings less than seated curls (less growth in one trial), so keep hips down and use the full bottom range.", "Сгибания лёжа растягивают бицепсы бедра меньше, чем сидя (меньший рост в одном исследовании), поэтому держите таз прижатым и используйте весь низ амплитуды."),
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
    "eccentric": L("about 2 s, controlled", "около 2 с, подконтрольно"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Curl with intent, thigh still", "Сгибайте энергично, бедро неподвижно"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Knee from near-straight to full flexion with the pelvis square and the thigh fixed. Log sides per set.", "Колено — от почти прямого до полного сгибания, таз ровно, бедро зафиксировано. Записывайте стороны для каждого подхода."),
    "cues": [
      L("Hips still, brace", "Таз неподвижен, корпус напряжён"),
      L("Lower to near straight", "Опускайте почти до прямых ног"),
      L("Curl, don't swing thigh", "Сгибайте, не раскачивая бедро")
    ],
    "avoid": [
      L("Swinging the thigh", "Раскачка бедром"),
      L("Pelvis twisting", "Разворот таза"),
      L("Short bottom range", "Укороченный низ амплитуды")
    ],
    "why": L("The hip stays fairly extended, as in lying curls, so a steady pelvis and full bottom range keep reps comparable.", "Тазобедренный сустав остаётся почти разогнутым, как в сгибаниях лёжа, поэтому неподвижный таз и полный низ амплитуды сохраняют повторения сравнимыми."),
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
    "eccentric": L("about 2 s, controlled down to a still hang", "около 2 с, подконтрольно до неподвижного виса"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Knees up, then curl the pelvis toward the ribs", "Колени вверх, затем подкрутите таз к рёбрам"),
    "maxIntent": "yes_controlled",
    "pause": "brief",
    "pauseWhere": L("bottom still hang ~1 s to stop the swing; optional short hold at top with pelvis curled", "внизу неподвижный вис ~1 с, чтобы погасить раскачку; по желанию короткая задержка вверху с подкрученным тазом"),
    "rom": L("Knees above hip level AND pelvis tilted back toward the ribs. The curl is the ab part; lifting the knees with a flat back is mostly hip flexors and is not this exercise.", "Колени выше уровня таза И таз подкручен к рёбрам. Подкручивание — это и есть работа пресса; подъём коленей с ровной спиной нагружает в основном сгибатели бедра и не является этим упражнением."),
    "cues": [
      L("Stop the swing at bottom", "Погасите раскачку внизу"),
      L("Curl pelvis to ribs", "Подкрутите таз к рёбрам"),
      L("Knees only = hip flexors", "Только колени = сгибатели бедра"),
      L("Lower ~2 s, no drop", "Опускайте ~2 с, не бросайте")
    ],
    "avoid": [
      L("Swinging for momentum", "Раскачка ради инерции"),
      L("Knee lift with no pelvic curl", "Подъём коленей без подкручивания таза"),
      L("Dropping the legs", "Бросать ноги вниз"),
      L("Partial reps that skip the curl", "Частичные повторения без подкручивания")
    ],
    "why": L("Ab work comes from curling the pelvis, so a swing-free start and a visible curl make each rep a true ab set (EMG and biomechanics only).", "Пресс работает за счёт подкручивания таза, поэтому старт без раскачки и заметное подкручивание делают каждое повторение настоящей работой пресса (только ЭМГ и биомеханика)."),
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
    "eccentric": L("about 2 s, controlled down to a still hang", "около 2 с, подконтрольно до неподвижного виса"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Raise the legs, finish by curling the pelvis up", "Поднимайте ноги, в конце подкрутите таз вверх"),
    "maxIntent": "yes_controlled",
    "pause": "brief",
    "pauseWhere": L("bottom still hang ~1 s to stop the swing", "внизу неподвижный вис ~1 с, чтобы погасить раскачку"),
    "rom": L("Legs up to at least hip level with a pelvic curl at the top; lifting the legs with a flat or arched back is mainly hip flexion.", "Ноги как минимум до уровня таза с подкручиванием таза вверху; подъём ног с ровной или прогнутой спиной — в основном сгибание бедра."),
    "cues": [
      L("Dead hang, no swing", "Неподвижный вис, без раскачки"),
      L("Curl pelvis at the top", "Подкрутите таз вверху"),
      L("Lower ~2 s, no drop", "Опускайте ~2 с, не бросайте")
    ],
    "avoid": [
      L("Kipping or swinging", "Киппинг или раскачка"),
      L("Arching the lower back", "Прогиб в пояснице"),
      L("Dropping the legs", "Бросать ноги вниз")
    ],
    "why": L("It shows very high ab EMG but also high modelled spine load, so controlled reps with a pelvic curl keep it an ab exercise rather than a hip-flexor swing.", "Упражнение показывает очень высокую ЭМГ пресса, но и высокую расчётную нагрузку на позвоночник, поэтому подконтрольные повторения с подкручиванием таза оставляют его упражнением на пресс, а не раскачкой на сгибателях бедра."),
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
    "eccentric": L("about 1-2 s, controlled to the chest", "около 1–2 с, подконтрольно до груди"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Press with strong intent, steady bar path", "Жмите мощно, ровная траектория грифа"),
    "maxIntent": "yes_controlled",
    "pause": "optional",
    "pauseWhere": L("brief touch on the chest, only if bouncing creeps in", "короткое касание груди, только если появляется отбив"),
    "rom": L("Lower to the same touch point each rep and press to lockout; record the bench angle.", "Опускайте в одну и ту же точку касания в каждом повторении и жмите до полного выпрямления рук; записывайте угол скамьи."),
    "cues": [
      L("Same touch point", "Одна и та же точка касания"),
      L("No bounce off chest", "Без отбива от груди"),
      L("Press hard, stay tight", "Жмите мощно, держите напряжение")
    ],
    "avoid": [
      L("Bouncing the bar off the chest", "Отбив грифа от груди"),
      L("Hips lifting off the bench", "Отрыв таза от скамьи"),
      L("Cutting depth late in the set", "Меньшая глубина к концу подхода")
    ],
    "why": L("Fast intent improved bench strength; growth depends more on effort and range than on speed.", "Старание жать быстро улучшало силу в жиме; рост больше зависит от усилия и амплитуды, чем от скорости."),
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
    "eccentric": L("about 2 s, controlled", "около 2 с, подконтрольно"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Press with intent, dumbbells stable", "Жмите энергично, гантели устойчивы"),
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Lower to a controlled stretch and press to near lockout; same depth every rep. Weight per dumbbell.", "Опускайте до подконтрольного растяжения и жмите почти до полного выпрямления рук; та же глубина в каждом повторении. Вес одной гантели."),
    "cues": [
      L("Lower ~2 s to a stretch", "Опускайте ~2 с до растяжения"),
      L("Press hard, wrists stacked", "Жмите мощно, кисти над локтями"),
      L("Same depth every rep", "Та же глубина в каждом повторе")
    ],
    "avoid": [
      L("Bouncing at the bottom", "Отбив в нижней точке"),
      L("Dumbbells wobbling off path", "Гантели шатаются и уходят с траектории"),
      L("Cutting depth late in the set", "Меньшая глубина к концу подхода")
    ],
    "why": L("Free dumbbells need stability first; tempo within the normal range does not change growth.", "Свободным гантелям сначала нужна устойчивость; темп в обычных пределах не меняет рост."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Press with intent", "Жмите энергично"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("The full machine range to a comfortable stretch and near lockout, with the same seat setting.", "Вся амплитуда тренажёра — до комфортного растяжения и почти до полного выпрямления, с той же настройкой сиденья."),
    "cues": [
      L("Same seat, same range", "То же сиденье, та же амплитуда"),
      L("Control into the stretch", "Подконтрольно входите в растяжение"),
      L("Press with intent", "Жмите энергично")
    ],
    "avoid": [
      L("Stack crashing between reps", "Плитки падают между повторениями"),
      L("Short reps", "Короткие повторения"),
      L("Hips lifting off the seat", "Отрыв таза от сиденья")
    ],
    "why": L("Machines are stable, so push with intent; on a chest press, lengthened partials and full ROM grew similarly.", "Тренажёры устойчивы, поэтому жмите энергично; в жиме от груди частичные повторения в растянутом положении и полная амплитуда дали схожий рост."),
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
    "eccentric": L("about 1-2 s, controlled (deadlift: lower under control, no drop)", "около 1–2 с, подконтрольно (становая тяга: опускайте подконтрольно, не бросайте)"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Move with strong intent while staying braced", "Двигайте мощно, сохраняя напряжение корпуса"),
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("The full range you can hold in position, the same every rep; reset between deadlift reps if needed.", "Вся амплитуда, в которой вы удерживаете положение, одинаковая в каждом повторении; в становой тяге при необходимости заново принимайте стартовое положение между повторениями."),
    "cues": [
      L("Brace before each rep", "Напрягайте корпус перед повтором"),
      L("Move hard, stay tight", "Двигайте мощно, держите корпус"),
      L("Lower under control", "Опускайте подконтрольно"),
      L("Stop when form slips", "Стоп, когда техника нарушается")
    ],
    "avoid": [
      L("Dropping or bouncing the load", "Бросать вес или отбивать его"),
      L("Losing the brace or back position", "Потеря напряжения корпуса или положения спины"),
      L("Leg drive on a strict press", "Помощь ногами в строгом жиме")
    ],
    "why": L("With heavy free weights stable technique matters most; tempo has little effect on growth.", "С тяжёлыми свободными весами важнее всего стабильная техника; темп мало влияет на рост."),
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
    "eccentric": L("about 2 s, controlled into the stretch", "около 2 с, подконтрольно до растяжения"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Bring the arms together with intent, no jerk", "Сводите руки энергично, без рывка"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Open to a deep but comfortable chest stretch with a fixed soft elbow. Dumbbell fly: the load peaks at the stretch, so take most care there.", "Разводите до глубокого, но комфортного растяжения груди с постоянным лёгким сгибом в локтях. Разводка гантелей: нагрузка максимальна в растяжении, поэтому там нужна наибольшая аккуратность."),
    "cues": [
      L("Elbows soft, fixed angle", "Локти слегка согнуты, угол постоянен"),
      L("Control into the stretch", "Подконтрольно входите в растяжение"),
      L("Squeeze, don't jerk", "Сводите усилием, не рывком")
    ],
    "avoid": [
      L("Turning it into a press", "Превращение в жим"),
      L("Dropping into the stretch", "Ронять вес в растяжение"),
      L("Jerking out of the bottom", "Рывок из нижней точки")
    ],
    "why": L("Flys load the stretched shoulder, so control there protects the joint; tempo itself does not change growth.", "Сведения нагружают плечо в растянутом положении, поэтому контроль там бережёт сустав; сам темп не меняет рост."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Push with intent, body rigid", "Выжимайте себя энергично, тело жёсткое"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Dips: down to a stretch the shoulders tolerate. Push-up: chest near the floor. Both to full lockout.", "Брусья: вниз до растяжения, которое переносят плечи. Отжимания от пола: грудь почти у пола. В обоих — до полного выпрямления рук."),
    "cues": [
      L("Body rigid", "Тело жёсткое"),
      L("Lower ~1-2 s", "Опускайтесь ~1–2 с"),
      L("Push hard to lockout", "Жмите мощно до прямых рук")
    ],
    "avoid": [
      L("Bouncing at the bottom", "Отбив в нижней точке"),
      L("Sagging hips", "Провисание таза"),
      L("Half reps", "Половинные повторения")
    ],
    "why": L("Normal controlled reps cover the tempo range shown to work; range and effort matter more.", "Обычные подконтрольные повторения укладываются в диапазон темпа, для которого показан результат; амплитуда и усилие важнее."),
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
    "eccentric": L("about 2 s, controlled up to a full stretch", "около 2 с, подконтрольно вверх до полного растяжения"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Pull with intent, elbows driving down", "Тяните энергично, направляя локти вниз"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("From a full overhead stretch (arms nearly straight, shoulders allowed to rise) to the bar near the upper chest or chin over the bar.", "От полного растяжения над головой (руки почти прямые, плечам можно подняться) до рукояти у верха груди или подбородка над перекладиной."),
    "cues": [
      L("Full stretch at the top", "Полное растяжение вверху"),
      L("Pull hard with elbows", "Тяните мощно локтями"),
      L("No swing or kip", "Без раскачки и киппинга")
    ],
    "avoid": [
      L("Leaning back to yank", "Отклонение назад с рывком"),
      L("Kipping", "Киппинг"),
      L("Cutting the top stretch", "Обрезанное растяжение вверху")
    ],
    "why": L("The stretched top is the valuable part (lengthened pulldown partials matched full ROM); tempo matters little.", "Растянутая верхняя часть — самая ценная (частичные повторения в растянутом положении в тяге сверху не уступили полной амплитуде); темп значит мало."),
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
    "eccentric": L("about 1-2 s, controlled to a full reach", "около 1–2 с, подконтрольно до полного вытяжения"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Pull with intent, torso still", "Тяните энергично, корпус неподвижен"),
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Reach to a full stretch (shoulder blades forward) and pull until the elbows pass the torso.", "Тянитесь до полного растяжения (лопатки вперёд) и тяните, пока локти не уйдут за корпус."),
    "cues": [
      L("Reach to a full stretch", "Тянитесь до полного растяжения"),
      L("Pull hard, torso still", "Тяните мощно, корпус неподвижен"),
      L("Lower under control", "Опускайте подконтрольно")
    ],
    "avoid": [
      L("Torso heaving to start reps", "Рывок корпусом в начале повторения"),
      L("Jerking the weight", "Рывок веса"),
      L("Short reach", "Неполное вытяжение")
    ],
    "why": L("A still torso keeps the load on the back and comparable between sessions; tempo has little effect on growth.", "Неподвижный корпус оставляет нагрузку на спине и сохраняет её сравнимой между тренировками; темп мало влияет на рост."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Move with intent using the target muscle", "Двигайте энергично за счёт целевой мышцы"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("The full range the joint tolerates, the same every rep. Straight-arm pulldown: start from a full overhead stretch.", "Вся амплитуда, которую переносит сустав, одинаковая в каждом повторении. Пуловер на блоке: начинайте с полного растяжения над головой."),
    "cues": [
      L("Lift with the target", "Поднимайте целевой мышцей"),
      L("No body swing", "Без раскачки телом"),
      L("Control the return", "Контролируйте возврат")
    ],
    "avoid": [
      L("Swinging the torso", "Раскачка корпусом"),
      L("Stack crashing", "Плитки падают"),
      L("Shrugging into it (except shrugs)", "Пожимание плечами (кроме шрагов)")
    ],
    "why": L("Small muscles are easy to cheat with a swing; a model suggests big momentum offloads the target.", "В малых мышцах легко схитрить раскачкой; модель показывает, что сильная инерция снимает нагрузку с целевой мышцы."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Curl with intent, torso still", "Сгибайте энергично, корпус неподвижен"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Full extension to full flexion. Incline curl: let the arm hang fully for the stretch.", "От полного разгибания до полного сгибания. Сгибания на наклонной скамье: дайте руке полностью повиснуть для растяжения."),
    "cues": [
      L("Lower all the way", "Опускайте до конца"),
      L("Curl with intent", "Сгибайте энергично"),
      L("Torso still", "Корпус неподвижен")
    ],
    "avoid": [
      L("Big hip or back swing", "Сильная раскачка тазом или спиной"),
      L("Elbows drifting far forward", "Локти уходят далеко вперёд"),
      L("Half reps", "Половинные повторения")
    ],
    "why": L("Moderate momentum did not change arm growth in one trial, but strict reps keep loads comparable; curl variations grew the elbow flexors similarly in total.", "Умеренная инерция не изменила рост рук в одном исследовании, но строгие повторения сохраняют нагрузки сравнимыми; варианты сгибаний дали схожий суммарный рост сгибателей локтя."),
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
    "eccentric": L("about 2 s, controlled into the deep bend", "около 2 с, подконтрольно до глубокого сгиба"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Extend with intent to lockout", "Разгибайте энергично до конца"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("From a deep elbow bend to lockout with the elbows roughly fixed.", "От глубокого сгибания в локтях до полного разгибания, локти примерно неподвижны."),
    "cues": [
      L("Control the deep bend", "Контролируйте глубокий сгиб"),
      L("Elbows stay put", "Локти остаются на месте"),
      L("Extend hard to lockout", "Разгибайте мощно до конца")
    ],
    "avoid": [
      L("Dropping into the stretch", "Ронять вес в растяжение"),
      L("Elbows flaring", "Локти расходятся в стороны"),
      L("Half reps", "Половинные повторения")
    ],
    "why": L("The deep bend is loaded and stresses the elbow, so control it; bottom-range partials grew the triceps as well as full ROM.", "Глубокий сгиб нагружен и нагружает локоть, поэтому контролируйте его; частичные повторения в нижней части развивали трицепс не хуже полной амплитуды."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      3
    ],
    "concentric": L("Drive with intent", "Жмите энергично"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("As deep as you control without the pelvis tucking, the same depth every rep, to near lockout without slamming the knees.", "Настолько глубоко, насколько вы контролируете движение без подкручивания таза, одна и та же глубина в каждом повторении, почти до полного выпрямления, не вставляя колени резко."),
    "cues": [
      L("Same depth every rep", "Та же глубина в каждом повторе"),
      L("Control down, drive up", "Вниз подконтрольно, вверх мощно"),
      L("Don't slam knees locked", "Не выпрямляйте колени рывком")
    ],
    "avoid": [
      L("Bouncing off the bottom", "Отбив в нижней точке"),
      L("Hips peeling off the pad", "Таз отрывается от подушки"),
      L("Shortening reps late in the set", "Укороченные повторения к концу подхода")
    ],
    "why": L("Machines allow strong intent safely; depth and effort matter more than speed.", "Тренажёры позволяют безопасно работать мощно; глубина и усилие важнее скорости."),
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
    "eccentric": L("about 1.5-2 s, controlled", "около 1,5–2 с, подконтрольно"),
    "eccentricSec": [
      1.5,
      3
    ],
    "concentric": L("Drive through the front foot with intent", "Вставайте энергично через переднюю стопу"),
    "maxIntent": "yes_controlled",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Back knee near the floor with a deep front-hip stretch and a stable torso.", "Заднее колено почти у пола, глубокое растяжение в тазобедренном суставе передней ноги, корпус устойчив."),
    "cues": [
      L("Balance first, then push", "Сначала равновесие, потом усилие"),
      L("Lower ~2 s, deep", "Опускайтесь ~2 с, глубоко"),
      L("Drive through front foot", "Вставайте через переднюю стопу")
    ],
    "avoid": [
      L("Bouncing off the back knee", "Отбив задним коленом от пола"),
      L("Wobbling or twisting", "Шатание или разворот"),
      L("Shallow reps", "Неглубокие повторения")
    ],
    "why": L("Balance limits these lifts, so stability comes first; tempo has little effect on growth.", "Эти упражнения ограничены равновесием, поэтому сначала устойчивость; темп мало влияет на рост."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Extend the hips with intent", "Разгибайте бёдра энергично"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Full hip extension without arching the lower back; back extension hinges from the hips.", "Полное разгибание в тазобедренных суставах без прогиба в пояснице; в гиперэкстензии сгибайтесь в тазобедренных суставах."),
    "cues": [
      L("Hips do the work", "Работают бёдра"),
      L("No lower-back arch", "Без прогиба в пояснице"),
      L("Control down", "Вниз подконтрольно")
    ],
    "avoid": [
      L("Overarching the lower back", "Чрезмерный прогиб в пояснице"),
      L("Swinging the leg (kickback)", "Мах ногой (отведение назад)"),
      L("Bouncing at the bottom", "Отбив в нижней точке")
    ],
    "why": L("Hip extensors are easy to replace with lumbar arching, so position matters more than tempo.", "Работу разгибателей бедра легко подменить прогибом в пояснице, поэтому положение важнее темпа."),
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
    "eccentric": L("about 1-2 s, controlled", "около 1–2 с, подконтрольно"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Move with intent", "Двигайте энергично"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("The full machine range to a comfortable stretch, the same every rep.", "Вся амплитуда тренажёра до комфортного растяжения, одинаковая в каждом повторении."),
    "cues": [
      L("Control the opening", "Контролируйте разведение"),
      L("Full comfortable range", "Полная комфортная амплитуда"),
      L("No pad slamming", "Не бейте подушками")
    ],
    "avoid": [
      L("Pads slamming", "Удары подушек"),
      L("Short reps", "Короткие повторения"),
      L("Rocking the torso", "Раскачка корпусом")
    ],
    "why": L("Normal controlled reps fall in the tempo range shown to work; a consistent range keeps sessions comparable.", "Обычные подконтрольные повторения попадают в диапазон темпа, для которого показан результат; постоянная амплитуда сохраняет тренировки сравнимыми."),
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
    "eccentric": L("about 1-2 s into the stretch", "около 1–2 с до растяжения"),
    "eccentricSec": [
      1,
      2
    ],
    "concentric": L("Rise with intent onto the big toe", "Поднимайтесь энергично на большой палец"),
    "maxIntent": "yes",
    "pause": "brief",
    "pauseWhere": L("bottom stretch, ~1 s, to remove the Achilles rebound", "растяжение внизу, ~1 с, чтобы убрать отдачу ахиллова сухожилия"),
    "rom": L("A deep heel drop to full stretch, then up onto the big toe. At failure, bottom-range partials are fine.", "Глубоко опустите пятку до полного растяжения, затем поднимитесь на большой палец. В отказе допустимы частичные повторения в нижней части."),
    "cues": [
      L("Pause ~1 s at bottom", "Пауза ~1 с внизу"),
      L("Full heel drop", "Пятку до самого низа"),
      L("Up onto big toe", "Вверх на большой палец")
    ],
    "avoid": [
      L("Bouncing out of the stretch", "Отбив из растянутого положения"),
      L("Short top-only reps", "Короткие повторения только вверху"),
      L("Bending knees to cheat (standing)", "Сгибание коленей для помощи (стоя)")
    ],
    "why": L("The Achilles tendon makes bouncing easy, so a short bottom pause keeps the stretched range loaded; lengthened partials grew the calves well.", "Ахиллово сухожилие облегчает отбив, поэтому короткая пауза внизу сохраняет нагрузку в растянутом положении; частичные повторения в растянутом положении хорошо развивали икры."),
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
    "eccentric": L("about 1-2 s, controlled back to a stretch", "около 1–2 с, подконтрольно назад до растяжения"),
    "eccentricSec": [
      1,
      2.5
    ],
    "concentric": L("Curl the spine with intent", "Скручивайте позвоночник энергично"),
    "maxIntent": "yes",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Ribs curl toward the pelvis (spinal flexion) and return to a stretch; not a hinge at the hips.", "Рёбра скручиваются к тазу (сгибание позвоночника) и возвращаются до растяжения; это не наклон в тазобедренных суставах."),
    "cues": [
      L("Ribs toward pelvis", "Рёбра к тазу"),
      L("Don't just hinge hips", "Не сгибайтесь только в тазу"),
      L("Control back to stretch", "Подконтрольно назад до растяжения")
    ],
    "avoid": [
      L("Pulling with the arms", "Тяга руками"),
      L("Hip hinge instead of a spinal curl", "Наклон в тазобедренных суставах вместо скручивания"),
      L("Yanking the weight", "Рывок веса")
    ],
    "why": L("The abs flex the spine, so the curl matters more than speed (biomechanics only).", "Пресс сгибает позвоночник, поэтому скручивание важнее скорости (только биомеханика)."),
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
    "eccentric": L("not applicable (timed hold or carry)", "неприменимо (удержание на время или переноска)"),
    "eccentricSec": null,
    "concentric": L("not applicable", "неприменимо"),
    "maxIntent": "no",
    "pause": "none",
    "pauseWhere": null,
    "rom": L("Plank: neutral spine, ribs down. Carry: tall posture, steady steps.", "Планка: нейтральный позвоночник, рёбра опущены. Переноска: прямая осанка, ровные шаги."),
    "cues": [
      L("Brace, breathe steady", "Корпус напряжён, дышите ровно"),
      L("Stop when posture breaks", "Стоп, когда осанка нарушается")
    ],
    "avoid": [
      L("Hips sagging or piking", "Таз провисает или задирается"),
      L("Leaning or shuffling", "Наклон или шарканье")
    ],
    "why": L("These are timed holds, so posture quality replaces tempo.", "Это удержания на время, поэтому вместо темпа — качество осанки."),
    "confidence": "very_low",
    "basis": "biomechanics_and_expert_consensus",
    "refIds": [
      "androulakiskorakakis2023_technique"
    ]
  }
]);

// Built per language: the profiles hold texts, so the lookup must not freeze the language of the first load.
const BY_ID: Map<string, TempoProfile> = byLang(() => {
  const m = new Map<string, TempoProfile>();
  for (const p of TEMPO_PROFILES) for (const id of p.exerciseIds) if (!m.has(id)) m.set(id, p);
  return m;
});
/** Execution profile for an exercise (custom exercises have none). */
export const tempoFor = (exerciseId: string): TempoProfile | null => BY_ID.get(exerciseId) ?? null;

/** General principles behind every profile. */
export const TEMPO_PRINCIPLES: { text: string; refIds: string[] }[] = byLang(() => [
  {
    "text": L("There is no universal tempo: reps of about 0.5-8 s grow muscle similarly, and ~1 s vs ~3.5 s reps differed only trivially.", "Универсального темпа нет: повторения длительностью примерно 0,5–8 с дают схожий рост мышц, а повторения ~1 с и ~3,5 с различались лишь незначительно."),
    "refIds": [
      "currier2026_acsm_position",
      "enes2025_tempo",
      "schoenfeld2015_repduration"
    ]
  },
  {
    "text": L("Default: lower under control in about 1-3 s and lift with intent. No 5-10 s negatives by default; very slow reps (>10 s) may be worse.", "По умолчанию: опускайте подконтрольно примерно 1–3 с и поднимайте энергично. Опускание по 5–10 с не используется как правило; очень медленные повторения (>10 с), возможно, хуже."),
    "refIds": [
      "amdi2025_eccduration",
      "androulakiskorakakis2023_technique",
      "enes2025_tempo",
      "schoenfeld2015_repduration"
    ]
  },
  {
    "text": L("Explosive intent means trying to move fast while staying in control. It improved strength in trials that did not measure size; for growth it is neutral or unknown.", "Взрывное намерение — это стараться двигать быстро, сохраняя контроль. Оно улучшало силу в исследованиях, где размер мышц не измеряли; для роста оно нейтрально или его влияние неизвестно."),
    "refIds": [
      "cornejodaza2026_velocity_bfr",
      "currier2026_acsm_position",
      "gonzalezbadillo2014_maxv_bench",
      "parejablanco2014_maxv_squat"
    ]
  },
  {
    "text": L("Reps slow down near failure. That reflects effort, not bad technique, and sets that run on as speed drops grew slightly more.", "Ближе к отказу повторения замедляются. Это отражает усилие, а не плохую технику, и подходы, которые продолжались по мере падения скорости, дали немного больший рост."),
    "refIds": [
      "jukic2023_velocityloss",
      "parejablanco2017_vl",
      "refalo2023_failure_meta"
    ]
  },
  {
    "text": L("Range matters more than speed: full ROM or lengthened partials beat short partials, so protect the stretched part of each rep.", "Амплитуда важнее скорости: полная амплитуда или частичные повторения в растянутом положении лучше коротких частичных, поэтому берегите растянутую часть каждого повторения."),
    "refIds": [
      "gschneidner2025_lengthened_partials",
      "kassiano2023_rom_review",
      "pallares2021_rom",
      "pedrosa2022_legext_partials",
      "wolf2025_lengthened_partials"
    ]
  },
  {
    "text": L("Some momentum on arm isolation did not change growth in one trial, but control keeps loads comparable and joints safe; heavy compounds put stability first.", "Небольшая инерция в изолирующих упражнениях на руки не изменила рост в одном исследовании, но контроль сохраняет нагрузки сравнимыми, а суставы — в безопасности; в тяжёлых многосуставных упражнениях сначала устойчивость."),
    "refIds": [
      "androulakiskorakakis2023_technique",
      "arandjelovic2013_momentum_model",
      "augustin2025_momentum"
    ]
  },
  {
    "text": L("Slow negatives and eccentric overload are optional, not superior, and never earn extra credit.", "Медленное опускание и эксцентрическая перегрузка — по желанию; они не лучше и никогда не дают дополнительного зачёта."),
    "refIds": [
      "amdi2025_eccduration",
      "dasilva2025_ecc_con",
      "schoenfeld2017_ecc_con",
      "zhang2026_ael"
    ]
  },
  {
    "text": L("No trial isolates pauses inside a rep. Use a pause only for a specific reason, such as stopping a swing or a tendon bounce.", "Ни одно исследование не изучало паузы внутри повторения отдельно. Используйте паузу только по конкретной причине — например, чтобы погасить раскачку или отдачу сухожилия."),
    "refIds": [
      "davies2021_cluster",
      "oranchuk2019_isometric",
      "vanevery2022_interset_stretch"
    ]
  }
]);

/** Distinct execution concepts (maximal intent ≠ actual velocity ≠ controlled ≠ momentum ≠ slow reps ≠ accentuated eccentric). */
export const TEMPO_CONCEPTS: { concept: string; text: string; level: string; refIds: string[] }[] = byLang(() => [
  {
    "concept": "actual_velocity",
    "text": L("Repetition speed has little effect on hypertrophy across a wide range. Fast reps (about 1 s) and slower reps (about 3.5 s) grew muscle similarly, with a trivial, uncertain edge for faster reps (Enes 2025). Total rep durations of about 0.5-8 s were similar when sets went to failure (Schoenfeld 2015). The older muscle-specific review in untrained people was mixed (Hackett 2018). ACSM 2026 found that time under tension did not consistently change outcomes. Inference, not tested directly: reps slow down near failure regardless of intent, so slowing within a set reflects effort, not poor technique. Tempo should not change set credit.", "Скорость повторений мало влияет на гипертрофию в широком диапазоне. Быстрые (около 1 с) и более медленные (около 3,5 с) повторения дали схожий рост мышц с незначительным, неопределённым перевесом быстрых (Enes 2025). Общая длительность повторения примерно 0,5–8 с давала схожий результат, когда подходы доводили до отказа (Schoenfeld 2015). Более старый обзор по отдельным мышцам у нетренированных людей дал неоднозначные результаты (Hackett 2018). ACSM 2026: время под нагрузкой не меняло результаты устойчиво. Вывод, напрямую не проверенный: ближе к отказу повторения замедляются независимо от намерения, поэтому замедление внутри подхода отражает усилие, а не плохую технику. Темп не должен менять зачёт подхода."),
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
    "text": L("Lifting with maximal intended concentric velocity improved strength, bar speed and jump height more than deliberately half-speed lifting (two 6-week RCTs, no size outcome). ACSM 2026 links fast-concentric power training to power, not specifically to size. The only trial that measured size found a complex velocity-by-BFR interaction: without BFR, half-speed squats grew the distal vastus lateralis more. Velocity-loss studies show that hypertrophy still occurs, and is slightly larger, when sets continue as speed drops. Intent is a strength and performance tool; for hypertrophy it is neutral or unknown.", "Подъём с намерением двигать максимально быстро в концентрической фазе улучшал силу, скорость штанги и высоту прыжка больше, чем намеренный подъём вполовину скорости (два 6-недельных РКИ, размер мышц не измеряли). ACSM 2026 связывает тренировку мощности с быстрой концентрической фазой с мощностью, а не именно с размером. Единственное исследование, где измеряли размер, показало сложное взаимодействие скорости и ограничения кровотока (BFR): без BFR приседания вполовину скорости сильнее развивали дистальную часть латеральной широкой мышцы бедра. Исследования потери скорости показывают, что гипертрофия всё равно происходит и даже немного больше, когда подходы продолжаются по мере падения скорости. Намерение — инструмент для силы и результативности; для гипертрофии оно нейтрально или его влияние неизвестно."),
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
    "text": L("Velocity loss as a proxy for effort: letting sets run to greater velocity loss (closer to failure) went with slightly more hypertrophy in a meta-regression (Jukic 2023). It also gave more quadriceps growth at 40% vs 20% loss (Pareja-Blanco 2017) and the most pectoral CSA at 50% loss (Pareja-Blanco 2026). Strength was similar, and jump and speed qualities favoured low velocity loss. Refalo 2023 found no difference between >25% and 20-25% loss, so the benefit likely flattens near failure. Velocity loss is confounded with reps and volume.", "Потеря скорости как косвенный показатель усилия: подходы с большей потерей скорости (ближе к отказу) сопровождались немного большей гипертрофией в метарегрессии (Jukic 2023). Также был больший рост квадрицепса при потере 40% против 20% (Pareja-Blanco 2017) и наибольшая площадь поперечного сечения грудных при потере 50% (Pareja-Blanco 2026). Сила была схожей, а прыжковые и скоростные качества выигрывали от малой потери скорости. Refalo 2023 не нашёл разницы между потерей >25% и 20–25%, так что польза, вероятно, выходит на плато ближе к отказу. Потеря скорости смешана с числом повторений и объёмом."),
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
    "text": L("Deliberately slowing reps did not add hypertrophy. Slower tempos were no better, trivially worse, than faster ones (Enes 2025). Longer versus shorter eccentric phases showed about zero, uncertain difference in growth, although longer eccentrics gave equal or slightly larger strength gains in trained, volume-load-matched subgroups (Amdi 2025). Very slow reps (>10 s) looked inferior in the 2015 meta-analysis, based on few studies. Deliberately half-speed concentrics reduced strength gains. The 1-2 s per phase advice in ACSM 2009 was consensus and is superseded.", "Намеренное замедление повторений не добавило гипертрофии. Более медленный темп был не лучше, незначительно хуже, чем более быстрый (Enes 2025). Более длинная эксцентрическая фаза против более короткой показала примерно нулевую, неопределённую разницу в росте, хотя длинная эксцентрика давала равный или немного больший прирост силы в подгруппах тренированных людей с уравненным тоннажем (Amdi 2025). Очень медленные повторения (>10 с) выглядели хуже в метаанализе 2015 года, основанном на малом числе исследований. Намеренная концентрика вполовину скорости снижала прирост силы. Совет ACSM 2009 «1–2 с на фазу» был консенсусом и заменён."),
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
    "text": L("The owner's technique review (first author Androulakis Korakakis, not Schoenfeld) recommends about 2-8 s per rep and an emphasis on long muscle lengths. It says body-position and movement-path guidance rests mostly on anatomy and biomechanics theory, and that strict versus looser technique has barely been tested. Controlled execution is a sensible default for keeping ROM and loading consistent, and for safety. It has not been shown to add growth beyond the tempo range already shown to be equivalent.", "Обзор техники, предложенный владельцем (первый автор — Androulakis Korakakis, не Schoenfeld), рекомендует примерно 2–8 с на повторение и акцент на растянутом положении мышцы. В нём сказано, что рекомендации по положению тела и траектории движения опираются в основном на анатомию и биомеханическую теорию, а строгая техника против более свободной почти не проверялась. Подконтрольное выполнение — разумный вариант по умолчанию, чтобы сохранять амплитуду и нагрузку постоянными, и ради безопасности. Не показано, что оно добавляет рост сверх диапазона темпа, который уже признан равноценным."),
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
    "text": L("In one 8-week within-participant RCT, external momentum ('cheating') on curls and pushdowns taken to failure neither helped nor hurt arm growth compared with strict form, despite much higher volume load. A computer model of the lateral raise suggests moderate momentum may keep target torque high, while excessive momentum offloads the target muscle; this is theoretical only. The evidence covers single-joint arm exercises only, and injury risk was not studied. The app's x0.7 compromised-technique factor is therefore an assumption, not a value derived from evidence.", "В одном 8-недельном РКИ с внутрииндивидуальным сравнением внешняя инерция («читинг») в сгибаниях и разгибаниях на блоке до отказа не помогла и не навредила росту рук по сравнению со строгой техникой, несмотря на гораздо больший тоннаж. Компьютерная модель махов в стороны показывает, что умеренная инерция может сохранять высокий момент силы на целевой мышце, а чрезмерная снимает с неё нагрузку; это только теория. Данные охватывают лишь односуставные упражнения на руки, риск травм не изучался. Поэтому коэффициент приложения ×0,7 за нарушенную технику — допущение, а не величина, выведенная из данных исследований."),
    "level": "limited",
    "refIds": [
      "androulakiskorakakis2023_technique",
      "arandjelovic2013_momentum_model",
      "augustin2025_momentum"
    ]
  },
  {
    "concept": "eccentric_vs_concentric",
    "text": L("Both muscle actions build muscle. Eccentric-only training showed a small, non-significant edge over concentric-only (Schoenfeld 2017: ES difference 0.25, CI -0.03 to 0.52). da Silva 2025 (26 studies) found no overall difference, with very low certainty and high heterogeneity; exploratory subgroups leaned eccentric. Roig 2009 tied an eccentric advantage to the heavier loads possible eccentrically. Maia 2026 reported an eccentric benefit from only 4 hypertrophy studies, mostly in clinical and older groups. Normal lifts already include both phases.", "Оба вида мышечной работы наращивают мышцы. Только эксцентрическая тренировка показала небольшой, статистически незначимый перевес над только концентрической (Schoenfeld 2017: разница размера эффекта 0,25, ДИ от −0,03 до 0,52). da Silva 2025 (26 исследований) не нашёл общей разницы при очень низкой достоверности и высокой неоднородности; поисковые подгруппы склонялись к эксцентрике. Roig 2009 связал преимущество эксцентрики с большими весами, возможными в эксцентрической фазе. Maia 2026 сообщил о пользе эксцентрики всего по 4 исследованиям гипертрофии, в основном в клинических и пожилых группах. Обычные повторения уже включают обе фазы."),
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
    "text": L("The evidence conflicts. The newest, largest meta-analysis (Zhang 2026, 49 studies) found accentuated eccentric loading gave CSA and strength changes similar to constant-load training. It raised perceived effort and post-session lactate, implying a higher recovery cost; its higher eccentric EMG is indirect. ACSM 2026 lists eccentric overload as enhancing hypertrophy without defining protocols in the abstract. Maroto-Izquierdo 2017 favoured flywheel overload (9 studies, special devices). Simply slowing the eccentric does not count as overload (Amdi 2025). Treat it as optional, not superior.", "Данные противоречивы. Новейший и крупнейший метаанализ (Zhang 2026, 49 исследований) показал, что акцентированная эксцентрическая нагрузка даёт изменения площади поперечного сечения и силы, схожие с тренировкой с постоянной нагрузкой. Она повышала воспринимаемое усилие и лактат после тренировки, что указывает на более высокую цену восстановления; более высокая эксцентрическая ЭМГ — косвенный показатель. ACSM 2026 называет эксцентрическую перегрузку фактором, усиливающим гипертрофию, не определяя протоколы в аннотации. Maroto-Izquierdo 2017 высказался в пользу перегрузки на маховичных тренажёрах (9 исследований, специальные устройства). Простое замедление эксцентрической фазы перегрузкой не считается (Amdi 2025). Считайте её необязательной, а не лучшей."),
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
    "text": L("No long-term trial isolates a pause inside the rep, either in the stretched position or elsewhere. The closest evidence is indirect. Cluster sets (short rests inside a set) matched traditional sets for hypertrophy (Davies 2021). Pure isometric training grew muscle more at long than at short lengths (Oranchuk 2019, no pooling). A 20 s loaded stretch between calf sets possibly grew the soleus but not the gastrocnemii in untrained men (Van Every 2022). Pauses can be logged as a variation, but there is no basis for crediting them differently.", "Ни одно долгосрочное исследование не изучало отдельно паузу внутри повторения — ни в растянутом положении, ни в другом. Ближайшие данные косвенные. Кластерные подходы (короткий отдых внутри подхода) не уступили обычным по гипертрофии (Davies 2021). Чисто изометрическая тренировка сильнее наращивала мышцы при большой длине мышцы, чем при малой (Oranchuk 2019, без объединения данных). Растяжка под нагрузкой 20 с между подходами на икры, возможно, увеличила камбаловидную мышцу, но не икроножные у нетренированных мужчин (Van Every 2022). Паузы можно записывать как вариант выполнения, но оснований засчитывать их иначе нет."),
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
    "text": L("Full ROM beats partials done at short muscle lengths (Pallarés 2021; Kassiano 2023). Lengthened partials perform about the same as full ROM: Wolf 2025 (trained arms), Gschneidner 2025 (about 300 people, estimates near zero), Havers 2025 and Larsen 2025 (slight, uncertain leans toward lengthened partials). They sometimes do better regionally (Pedrosa 2022, leg extension). Varovic 2025 found only trivial regional differences between longer and shorter mean lengths. The long-length advantage seems to depend on actually loading the stretched position. This supports the app's partial x0.8 and lengthened-partial x1.0 credit.", "Полная амплитуда лучше частичных повторений при малой длине мышцы (Pallarés 2021; Kassiano 2023). Частичные повторения в растянутом положении работают примерно так же, как полная амплитуда: Wolf 2025 (руки, тренированные), Gschneidner 2025 (около 300 человек, оценки около нуля), Havers 2025 и Larsen 2025 (небольшой, неопределённый перевес в пользу частичных в растянутом положении). Иногда они лучше для отдельных участков мышцы (Pedrosa 2022, разгибания ног). Varovic 2025 нашёл лишь незначительные региональные различия между большей и меньшей средней длиной мышцы. Преимущество большой длины, по-видимому, зависит от того, нагружено ли растянутое положение на самом деле. Это поддерживает зачёт в приложении: частичные ×0,8 и частичные в растянутом положении ×1,0."),
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
    "text": L("Failure and set termination: training to momentary failure was not clearly better than stopping short. Refalo 2023 found only a trivial overall edge, and no significant edge for momentary failure. Leg extensions to failure versus 1-3 RIR were practically identical (Vasconcelos 2026). Failure modestly helped some size measures only in a single-set, very-low-volume program (Hermann 2025). Past-failure partials added nothing clear for calves (Larsen 2025). No trial compares technical with momentary failure, so ending a set when form breaks is an inference, not a tested rule.", "Отказ и завершение подхода: тренировка до момента отказа не была явно лучше остановки чуть раньше. Refalo 2023 нашёл лишь незначительный общий перевес и не нашёл значимого перевеса для момента отказа. Разгибания ног до отказа и с 1–3 RIR дали практически одинаковый результат (Vasconcelos 2026). Отказ умеренно помог некоторым показателям размера только в программе с одним подходом и очень малым объёмом (Hermann 2025). Частичные повторения после отказа не дали явной прибавки для икр (Larsen 2025). Ни одно исследование не сравнивает отказ по технике с моментом мышечного отказа, поэтому завершать подход, когда техника нарушается, — это вывод, а не проверенное правило."),
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
    "text": L("Exercise-specific trials for the owner's movements. Dumbbell and cable lateral raises (ROM matched) grew the lateral deltoid equally. Incline and preacher dumbbell curls gave equal total elbow-flexor growth, with incline favouring the biceps and preacher the brachialis and brachioradialis. Shoulder angle did not matter when resistance profiles were matched (Attarieh 2025; Larsen 2026). Seated leg curls beat lying curls for hamstring growth. Knee extension is needed for rectus femoris growth. Full squats grew the adductors and glutes more than half squats. Stiff-leg deadlifts mainly grew the semimembranosus.", "Исследования конкретных упражнений владельца. Махи в стороны с гантелями и на блоке (при равной амплитуде) одинаково развивали среднюю дельту. Сгибания с гантелями на наклонной скамье и на скамье Скотта дали равный суммарный рост сгибателей локтя: наклонная скамья больше развивала бицепс, скамья Скотта — плечевую и плечелучевую мышцы. Угол в плечевом суставе не имел значения, когда профили сопротивления были уравнены (Attarieh 2025; Larsen 2026). Сгибания ног сидя превзошли сгибания лёжа по росту бицепсов бедра. Для роста прямой мышцы бедра нужно разгибание колена. Полные приседания сильнее развивали приводящие и ягодичные, чем полуприседы. Тяга на прямых ногах в основном развивала полуперепончатую мышцу."),
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
    "text": L("Hanging ab straps: no long-term hypertrophy trial exists. Acute EMG shows the strap hanging knee-up and the hanging straight-leg raise among the highest rectus abdominis and oblique activators. The strap knee-up was not among the highest rectus femoris (hip-flexor) activators. No study compares pelvic-curl with pure hip-flexion technique. The app's rule (count only the pelvic-curl version as an ab set) is biomechanical reasoning, supported only indirectly by EMG.", "Подъёмы в петлях для пресса: долгосрочных исследований гипертрофии нет. По данным ЭМГ (разовые измерения), подъём коленей в петлях и подъём прямых ног в висе входят в число упражнений с наибольшей активацией прямой мышцы живота и косых мышц. Подъём коленей в петлях не входил в число упражнений с наибольшей активацией прямой мышцы бедра (сгибателя бедра). Ни одно исследование не сравнивает технику с подкручиванием таза и чистое сгибание бедра. Правило приложения (засчитывать как подход на пресс только вариант с подкручиванием таза) — биомеханическое рассуждение, лишь косвенно поддержанное ЭМГ."),
    "level": "very_limited",
    "refIds": [
      "escamilla2006_abs_emg",
      "mcgill2015_hlr_emg"
    ]
  },
  {
    "concept": "other",
    "text": L("Guidelines: ACSM 2026 (overview of 137 systematic reviews) found hypertrophy enhanced by at least 10 sets per week and by eccentric overload. Time under tension, set structure, training to momentary fatigue and equipment type did not consistently change outcomes. It supersedes the consensus-based ACSM 2009 advice of about 1-2 s per phase. Practical takeaway: tempo between roughly 0.5 and 8 s per rep needs no credit adjustment; volume and effort matter more.", "Рекомендации: ACSM 2026 (обзор 137 систематических обзоров) — гипертрофию усиливают не менее 10 подходов в неделю и эксцентрическая перегрузка. Время под нагрузкой, структура подхода, тренировка до момента утомления и тип оборудования не меняли результаты устойчиво. Этот документ заменяет основанный на консенсусе совет ACSM 2009 — примерно 1–2 с на фазу. Практический вывод: темп примерно от 0,5 до 8 с на повторение не требует поправки зачёта; объём и усилие важнее."),
    "level": "moderate",
    "refIds": [
      "acsm2009_progression",
      "currier2026_acsm_position"
    ]
  }
]);

/** Optional "did you follow the recommended execution?" answers and how the app uses them. */
export const EXECUTION_FEEDBACK: { id: ExecutionFeedback; label: string; use: string }[] = byLang(() => [
  {
    "id": "followed",
    "label": L("Tempo as planned", "Темп по плану"),
    "use": L("Confirms consistent execution. It is used only for technique guidance and to show that sessions are comparable; it never changes set credit.", "Подтверждает постоянное выполнение. Используется только для подсказок по технике и чтобы показать, что тренировки сравнимы; зачёт подхода никогда не меняет.")
  },
  {
    "id": "ecc_too_fast",
    "label": L("Lowered too fast", "Слишком быстрое опускание"),
    "use": L("Shows a 'control the lowering' cue next time. It is never a reason to downgrade the set, because faster eccentrics grow muscle similarly. Credit changes only if the owner also marks technique as compromised in the existing technique field.", "В следующий раз показывает подсказку «контролируйте опускание». Это никогда не причина снижать зачёт подхода, потому что более быстрая эксцентрика даёт схожий рост мышц. Зачёт меняется, только если владелец также отметит нарушенную технику в существующем поле техники.")
  },
  {
    "id": "ecc_too_slow",
    "label": L("Lowered slower than needed", "Опускание медленнее, чем нужно"),
    "use": L("Shows a note that about 2 s is enough and that very slow negatives can cost reps without adding growth. It never adds hypertrophy credit and never changes credit.", "Показывает заметку, что около 2 с достаточно и что очень медленное опускание может стоить повторений, не добавляя роста. Никогда не добавляет зачёт за гипертрофию и никогда не меняет зачёт.")
  },
  {
    "id": "momentum",
    "label": L("Used momentum / swing", "Инерция / раскачка"),
    "use": L("Noted as an execution issue so the next session gets a stricter-form cue, and repeated tags can flag that loads may not be comparable. The tag itself does not change credit; only the owner's existing technique field (compromised x0.7) does.", "Отмечается как замечание по выполнению, чтобы на следующей тренировке показать подсказку о более строгой технике; повторяющиеся отметки могут указать, что нагрузки, возможно, несравнимы. Сама отметка зачёт не меняет; его меняет только существующее поле техники (нарушена — ×0,7).")
  },
  {
    "id": "lost_concentric_control",
    "label": L("Lost control on the way up", "Потеря контроля на подъёме"),
    "use": L("For a weight that jerked, shifted off path or lost joint position. It is not for a normal slow grind near failure, which is expected effort. It feeds a technique or load-check cue only, and credit changes only through the existing technique field.", "Для случаев, когда вес пошёл рывком, сместился с траектории или сустав потерял положение. Не для обычного медленного тяжёлого повторения ближе к отказу — это ожидаемое усилие. Даёт только подсказку по технике или проверке веса; зачёт меняется только через существующее поле техники.")
  },
  {
    "id": "short_rom",
    "label": L("Shortened the range", "Укороченная амплитуда"),
    "use": L("Noted as an execution issue with a cue to protect the stretched range. The tag itself never changes credit. Any change comes only from the owner's existing technique entry; the existing ROM field already models deliberate partials, so do not apply both.", "Отмечается как замечание по выполнению с подсказкой беречь растянутую часть амплитуды. Сама отметка зачёт никогда не меняет. Любое изменение идёт только из существующей записи владельца о технике; существующее поле амплитуды уже учитывает намеренные частичные повторения, поэтому не применяйте оба.")
  }
]);

/** The owner's starting sources and what verification found (documentation). */
export const OWNER_SOURCE_CHECKS: { given: string; status: string; detail: string }[] = byLang(() => [
  {
    "given": "Enes et al. (2025) 'How Slow Should You Go? A Systematic Review With Meta-Analysis of the Effect of Resistance Training Repetition Tempo on Muscle Hypertrophy', DOI 10.1519/JSC.0000000000005302, PMID 42709703",
    "status": "verified",
    "detail": L("PubMed esummary: PMID 42709703 = exact title, J Strength Cond Res 2025 Dec 1;39(12):1331-1339, first author Enes A, last author Schoenfeld BJ (13 authors). Its articleids hold DOI 10.1519/JSC.0000000000005302. Crossref confirms the same DOI, title, journal and 2025. The abstract (14 studies; faster vs slower tempo, trivial difference) supports the stated finding.", "PubMed esummary: PMID 42709703 = точное название, J Strength Cond Res 2025 Dec 1;39(12):1331-1339, первый автор Enes A, последний автор Schoenfeld BJ (13 авторов). В articleids указан DOI 10.1519/JSC.0000000000005302. Crossref подтверждает тот же DOI, название, журнал и 2025 год. Аннотация (14 исследований; быстрый темп против медленного, незначительная разница) поддерживает заявленный вывод.")
  },
  {
    "given": "'Comparison Between Eccentric vs. Concentric Muscle Actions On Hypertrophy: A Systematic Review and Meta-analysis' (2025), PMID 39652733",
    "status": "verified",
    "detail": L("PMID 39652733 = exact title. da Silva LSL, Gonçalves LDS, Alves Campos PH, Benjamim CJR, Tasinafo Júnior MF, de Lima LCR, Bueno Júnior CR, Alves CPL. J Strength Cond Res 2025 Jan 1;39(1):115-134. DOI 10.1519/JSC.0000000000004981 appears in PubMed and matches Crossref (title, 2025, JSCR). The owner gave no DOI or authors; they are added here.", "PMID 39652733 = точное название. da Silva LSL, Gonçalves LDS, Alves Campos PH, Benjamim CJR, Tasinafo Júnior MF, de Lima LCR, Bueno Júnior CR, Alves CPL. J Strength Cond Res 2025 Jan 1;39(1):115-134. DOI 10.1519/JSC.0000000000004981 указан в PubMed и совпадает с Crossref (название, 2025, JSCR). Владелец не дал ни DOI, ни авторов; они добавлены здесь.")
  },
  {
    "given": "Schoenfeld et al. (2024) 'Optimizing Resistance Training Technique to Maximize Muscle Hypertrophy', https://pmc.ncbi.nlm.nih.gov/articles/PMC10801605/",
    "status": "corrected",
    "detail": L("PMC10801605 maps to PMID 38249086 (from PubMed articleids). Corrections: (1) the first author is Androulakis Korakakis P; Schoenfeld BJ is the last of 7 authors (Wolf, Coleman, Burke, Piñero, Nippard). (2) The full title ends ': A Narrative Review', so this is a narrative, not systematic, review. (3) Published 29 Dec 2023 in J Funct Morphol Kinesiol 9(1):9 (2024 volume); PubMed and Crossref both date it 2023. DOI 10.3390/jfmk9010009, confirmed in Crossref. Declared ties: Tonal advisory board and Jeff Nippard Fitness.", "PMC10801605 соответствует PMID 38249086 (по articleids в PubMed). Исправления: (1) первый автор — Androulakis Korakakis P; Schoenfeld BJ — последний из 7 авторов (Wolf, Coleman, Burke, Piñero, Nippard). (2) Полное название оканчивается на «: A Narrative Review», то есть это описательный, а не систематический обзор. (3) Опубликовано 29 декабря 2023 года в J Funct Morphol Kinesiol 9(1):9 (том 2024 года); PubMed и Crossref датируют его 2023 годом. DOI 10.3390/jfmk9010009, подтверждён в Crossref. Заявленные связи: консультативный совет Tonal и Jeff Nippard Fitness.")
  },
  {
    "given": L("Current ACSM resistance-training recommendations / position stand", "Действующие рекомендации / позиция ACSM по силовым тренировкам"),
    "status": "verified",
    "detail": L("The current stand is Currier BS, ... Schoenfeld BJ, ... Phillips SM, 'American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews', Med Sci Sports Exerc 2026 Apr 1;58(4):851-872. DOI 10.1249/MSS.0000000000003897, PMID 41843416, PMC12965823. Confirmed in PubMed and Crossref; the abstract states it updates the 2009 stand. The superseded stand is 'Progression models in resistance training for healthy adults', Med Sci Sports Exerc 2009;41(3):687-708, DOI 10.1249/MSS.0b013e3181915670, PMID 19204579, also confirmed. docs/RESEARCH.md line 28 already cites the 2026 stand correctly.", "Действующий документ: Currier BS, ... Schoenfeld BJ, ... Phillips SM, «American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews», Med Sci Sports Exerc 2026 Apr 1;58(4):851-872. DOI 10.1249/MSS.0000000000003897, PMID 41843416, PMC12965823. Подтверждён в PubMed и Crossref; в аннотации сказано, что он обновляет документ 2009 года. Заменённый документ — «Progression models in resistance training for healthy adults», Med Sci Sports Exerc 2009;41(3):687-708, DOI 10.1249/MSS.0b013e3181915670, PMID 19204579, также подтверждён. В docs/RESEARCH.md, строка 28, документ 2026 года уже процитирован верно.")
  }
]);
