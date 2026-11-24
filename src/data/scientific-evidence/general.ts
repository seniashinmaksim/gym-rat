// Generated from the verified research pass (2026-11-21). See SCIENTIFIC_METHOD.md.
// Edit by hand only together with tests/evidence.test.ts; never add a reference without verifying its PMID and DOI.

import { L, byLang } from '../../i18n/core';

export interface GeneralEvidence {
  topic: string;
  text: string;
  /** strong | moderate | limited | very_limited, sometimes qualified (e.g. "moderate (limbs); none for chest"). */
  evidenceLevel: string;
  refIds: string[];
}

export const GENERAL_EVIDENCE: GeneralEvidence[] = byLang(() => [
  {
    topic: L("Muscle length / lengthened partials", "Длина мышцы / частичные повторения в растянутом положении"),
    text: L("A meta-analysis of 12 studies found only trivial regional-growth differences between training at longer and shorter mean muscle lengths, with a slight distal lean toward longer lengths. A systematic review found full ROM or initial-range partials generally beat final-range partials for several limb muscles, with exceptions such as the triceps. Neither abstract reports chest data, so lengthened-partial advice for the chest is extrapolation.", "Метаанализ 12 исследований обнаружил лишь незначительные различия в региональном росте между тренировкой при большей и меньшей средней длине мышцы, с небольшим смещением в пользу большей длины в дистальной части. Систематический обзор показал, что полная амплитуда или частичные повторения в начальной части амплитуды в целом превосходят частичные в конечной части для нескольких мышц конечностей, с исключениями — например, для трицепса. Ни в одном из двух рефератов нет данных по грудным, поэтому советы о частичных повторениях в растянутом положении для грудных — экстраполяция."),
    evidenceLevel: "moderate (limbs); none for chest",
    refIds: [
      "varovic2025_muscle_length",
      "kassiano2023_rom_review"
    ]
  },
  {
    topic: L("Free weights vs machines", "Свободные веса и тренажёры"),
    text: L("Hypertrophy is similar with free weights and machines, and strength gains are specific to the trained modality. This supports separate strength histories per equipment instance while weekly muscle volume is shared.", "Гипертрофия сходна при работе со свободными весами и в тренажёрах, а прирост силы специфичен для того способа, которым тренировались. Это обосновывает отдельные истории силы для каждой единицы оборудования при общем недельном объёме на мышцу."),
    evidenceLevel: "moderate",
    refIds: [
      "haugen2023_freeweight_machine",
      "heidel2022_machines_freeweights",
      "hernandezbelmonte2023_freeweight_machine"
    ]
  },
  {
    topic: L("Isolation vs compound for chest", "Изолирующие и многосуставные упражнения для грудных"),
    text: L("Dumbbell flys grew the pectoralis as much as dumbbell presses, and pec deck alone produced clear pectoral growth. Single-joint chest work is a valid primary chest stimulus, with no triceps credit for flys.", "Разводка гантелей увеличивала грудную мышцу так же, как жим гантелей, а одна лишь «бабочка» (пек-дек) давала отчётливый рост грудных. Односуставная работа на грудные — полноценный основной стимул для них; трицепсу за разводки и сведения ничего не засчитывается."),
    evidenceLevel: "limited",
    refIds: [
      "dellavanzi2026_press_vs_fly",
      "pinto2025_pecdeck"
    ]
  },
  {
    topic: L("Regional (upper/lower) chest", "Региональный рост груди (верх / низ)"),
    text: L("Regional pectoral growth from exercise choice rests on one small long-term incline trial plus acute EMG and swelling studies, which partly disagree. Pec deck and dumbbell press vs fly showed no regional differences. Keep upper/lower chest as display-only emphasis shares that are never added to the chest total.", "Данные о региональном росте грудных в зависимости от выбора упражнения опираются на одно небольшое длительное исследование жима на наклонной скамье, а также на краткосрочные исследования ЭМГ и отёка мышц, которые частично расходятся. «Бабочка» и сравнение жима гантелей с разводкой региональных различий не показали. Верх и низ груди следует оставить долями акцента только для отображения, которые никогда не прибавляются к общему объёму грудных."),
    evidenceLevel: "limited",
    refIds: [
      "chaves2020_incline",
      "pinto2025_pecdeck",
      "dellavanzi2026_press_vs_fly",
      "albarello2022_inclination",
      "cabral2022_hdemg_incline"
    ]
  },
  {
    topic: L("Stretching", "Растяжка"),
    text: L("Prolonged daily static pectoral stretching (15 min, 4 days a week) matched resistance training for pectoral thickness in active people. It is impractical and does not show benefit added to lifting, so no recommendation follows for a lifter.", "Длительная ежедневная статическая растяжка грудных (15 мин, 4 дня в неделю) дала у физически активных людей такой же прирост толщины грудных, как силовая тренировка. Это непрактично и не показывает пользы в дополнение к силовой тренировке, поэтому рекомендаций для занимающегося отсюда не следует."),
    evidenceLevel: "limited",
    refIds: [
      "wohlann2024_pec_stretch"
    ]
  },
  {
    topic: L("EMG is not proof of hypertrophy", "ЭМГ — не доказательство гипертрофии"),
    text: L("Higher acute surface-EMG amplitude has not been validated as a predictor of long-term muscle growth. Nearly all back-specific exercise-selection evidence (grip width, grip orientation, elbow path, vertical vs horizontal pulls) is EMG-based, so the app should present it as indirect evidence, not as proven hypertrophy differences.", "Более высокая амплитуда поверхностной ЭМГ в отдельном подходе не подтверждена как предиктор долгосрочного роста мышц. Почти все данные о выборе упражнений именно для спины (ширина хвата, ориентация хвата, траектория локтя, вертикальные и горизонтальные тяги) основаны на ЭМГ, поэтому приложению следует подавать их как косвенные данные, а не как доказанные различия в гипертрофии."),
    evidenceLevel: "moderate",
    refIds: [
      "vigotsky2022_emg_proxy",
      "difonza2026_lat_emg_review"
    ]
  },
  {
    topic: L("Back hypertrophy evidence gap", "Пробел в данных о гипертрофии спины"),
    text: L("Long-term size data for back muscles are scarce: one small MRI/biopsy trial for the lats, a few small (partly clinical) studies for the upper trapezius, and none found for rhomboids/middle trapezius. No longitudinal trial compared vertical vs horizontal pulling, grip widths or elbow paths for back growth. Back-exercise muscle credit should be labelled as practical estimates.", "Долгосрочных данных о размере мышц спины мало: одно небольшое исследование с МРТ и биопсией для широчайших, несколько небольших (отчасти клинических) исследований для верхней части трапеции и ни одного найденного для ромбовидных и средней части трапеции. Ни одно длительное исследование не сравнивало вертикальные и горизонтальные тяги, ширину хвата или траекторию локтя по росту спины. Зачёт мышцам в упражнениях для спины следует помечать как практические оценки."),
    evidenceLevel: "limited",
    refIds: [
      "paoli2016_latissimus",
      "kadi2000_trapezius",
      "andersen2014_trapezius_rct",
      "bartolomei2021_split_traps"
    ]
  },
  {
    topic: L("Multi-joint pulls and arm credit", "Многосуставные тяги и зачёт рукам"),
    text: L("In untrained men, lat-pulldown-only training produced elbow-flexor growth similar to curl-only training, supporting fractional (non-zero) biceps credit for pulling exercises; the exact coefficient remains an estimate.", "У нетренированных мужчин тренировка только тягой верхнего блока дала рост сгибателей локтя, сходный с тренировкой только сгибаниями, что поддерживает дробный (ненулевой) зачёт бицепсу за тяговые упражнения; точный коэффициент остаётся оценкой."),
    evidenceLevel: "limited",
    refIds: [
      "gentil2015_mj_vs_sj"
    ]
  },
  {
    topic: L("Regional deltoid hypertrophy / exercise variation", "Региональная гипертрофия дельтовидной / вариативность упражнений"),
    text: L("The three deltoid heads are activated by different movements (EMG), and one bench-press trial showed uneven growth across the muscles involved, with the side delt lagging. A systematic review on exercise variation suggests a few anatomically distinct exercises (e.g. a press, a lateral raise and a rear-delt movement) are more sensible than rotating many redundant ones; deltoid-specific trials of this are lacking.", "Три головки дельтовидной мышцы активируются разными движениями (ЭМГ), а одно исследование жима лёжа показало неравномерный рост участвующих мышц, причём средняя дельта отставала. Систематический обзор по вариативности упражнений позволяет предположить, что несколько анатомически различных упражнений (например, жим, махи в стороны и движение на задние дельты) разумнее, чем чередование многих дублирующих; исследований именно на дельтовидных нет."),
    evidenceLevel: "limited",
    refIds: [
      "kassiano2022_exercise_variation",
      "lanza2024_bench_muscles",
      "rabello2024_deltoid_emg_sr"
    ]
  },
  {
    topic: L("Do presses train the front delts enough?", "Достаточно ли жимы нагружают передние дельты?"),
    text: L("Bench pressing alone grew the anterior deltoid in men whose training status the abstract does not state; no trial tested whether front-delt isolation adds anything on top of pressing. Reasonable default: credit presses to the front delts and do not prompt extra front-raise work, labelled as an inference.", "Один лишь жим лёжа увеличивал переднюю дельту у мужчин, чей уровень подготовки в реферате не указан; ни одно исследование не проверяло, добавляет ли что-то изолирующая работа на передние дельты поверх жимов. Разумный вариант по умолчанию: засчитывать жимы передним дельтам и не предлагать дополнительные подъёмы перед собой, с пометкой, что это умозаключение."),
    evidenceLevel: "limited",
    refIds: [
      "lanza2024_bench_muscles",
      "campos2020_deltoid_emg"
    ]
  },
  {
    topic: L("Long muscle length (arms)", "Большая длина мышцы (руки)"),
    text: L("In arm studies, emphasizing the stretched position helped or did not hurt: overhead triceps extension beat neutral-arm extension (MRI), and elbow-extended-range curl partials beat flexed-range partials. When full-range curls differ only in shoulder position or resistance curve, total elbow flexor growth was similar. Exception: one triceps study found mid-range partials beat full ROM. Practical summary: use full ROM, avoid short-range partials, and include an overhead triceps movement.", "В исследованиях рук акцент на растянутом положении помогал или не вредил: разгибания из-за головы превзошли разгибания с рукой вдоль корпуса (МРТ), а частичные сгибания в диапазоне с разогнутым локтем превзошли частичные в диапазоне с согнутым. Когда сгибания в полной амплитуде различались только положением плеча или кривой сопротивления, общий рост сгибателей локтя был сходным. Исключение: в одном исследовании трицепса частичные повторения в средней части амплитуды превзошли полную амплитуду. Практический итог: используйте полную амплитуду, избегайте частичных повторений в укороченном положении и включайте движение на трицепс из-за головы."),
    evidenceLevel: "moderate",
    refIds: [
      "maeo2023_triceps_overhead",
      "pedrosa2023_arm_curl_initial_rom",
      "sato2021_elbow_angle_training",
      "kassiano2023_rom_review",
      "kobayashi2026_incline_vs_preacher",
      "attarieh2025_preacher_vs_bayesian",
      "nunes2020_cable_vs_barbell_preacher",
      "goto2019_partial_rom_triceps"
    ]
  },
  {
    topic: L("Direct vs indirect arm training", "Прямая и косвенная тренировка рук"),
    text: L("Compound pulls and presses grow the biceps and triceps respectively, so fractional credit from rows/pulldowns to biceps and from presses to triceps is reasonable (the exact 0.5 value is an assumption). Curls grew the elbow flexors more than rows set-for-set in one small trial, while adding isolation work to a compound program showed no detectable extra benefit in short, small trials. Evidence is limited: mostly untrained participants and short durations.", "Многосуставные тяги и жимы увеличивают бицепс и трицепс соответственно, поэтому дробный зачёт бицепсу за тяги (горизонтальные и вертикальные) и трицепсу за жимы обоснован (точное значение 0,5 — допущение). В одном небольшом исследовании сгибания увеличивали сгибатели локтя сильнее, чем тяги, при равном числе подходов, а добавление изолирующей работы к программе из многосуставных упражнений не показало заметной дополнительной пользы в коротких небольших исследованиях. Данные ограниченны: в основном нетренированные участники и короткая продолжительность."),
    evidenceLevel: "limited",
    refIds: [
      "mannarino2021_curl_vs_row",
      "gentil2013_adding_single_joint",
      "defranca2015_single_joint_trained",
      "ogasawara2012_bench_press_arm",
      "wakahara2013_nonuniform_triceps"
    ]
  },
  {
    topic: L("Regional (nonuniform) arm hypertrophy", "Региональная (неравномерная) гипертрофия рук"),
    text: L("Arm muscles do not grow uniformly along their length, and exercise choice or range can shift where growth occurs (e.g. distal biceps with lengthened-range curls, middle triceps with a multi-joint exercise). The app tracks whole muscles, so regional effects should be explained as emphasis, not counted as extra volume.", "Мышцы рук растут неравномерно по длине, а выбор упражнения или амплитуды может сместить место роста (например, дистальная часть бицепса при сгибаниях в растянутом диапазоне, средняя часть трицепса при многосуставном упражнении). Приложение отслеживает мышцы целиком, поэтому региональные эффекты следует объяснять как акцент, а не считать дополнительным объёмом."),
    evidenceLevel: "limited",
    refIds: [
      "wakahara2013_nonuniform_triceps",
      "pedrosa2023_arm_curl_initial_rom",
      "zabaletakorta2023_incline_vs_preacher",
      "kobayashi2026_incline_vs_preacher"
    ]
  },
  {
    topic: L("Range of motion and muscle length", "Амплитуда и длина мышцы"),
    text: L("Pooled studies favoured full over partial ROM for lower-limb growth. A later Bayesian meta-analysis found that training at longer or shorter mean muscle lengths gave practically equivalent regional growth, with only a small, non-decisive distal trend. Some individual trials still favoured lengthened positions for particular muscles: seated leg curl, standing calf raise, stretched-half calf partials and reclined leg extension. Treat lengthened emphasis as a sensible tiebreaker, not a large universal effect.", "Объединённые исследования отдавали предпочтение полной амплитуде перед частичной для роста мышц нижних конечностей. Более поздний байесовский метаанализ показал, что тренировка при большей или меньшей средней длине мышцы давала практически эквивалентный региональный рост, лишь с небольшой, не решающей тенденцией в дистальной части. Некоторые отдельные исследования всё же отдавали предпочтение растянутому положению для конкретных мышц: сгибания ног сидя, подъём на носки стоя, частичные повторения для икр в растянутой половине амплитуды и разгибания ног с откинутой спинкой. Считайте акцент на растянутом положении разумным доводом при прочих равных, а не большим универсальным эффектом."),
    evidenceLevel: "moderate",
    refIds: [
      "pallares2021_rom",
      "varovic2025_muscle_length",
      "maeo2021_seated_vs_prone_curl",
      "kinoshita2023_standing_vs_seated_calf",
      "kassiano2023_calf_lengthened",
      "larsen2025_hipangle_legext"
    ]
  },
  {
    topic: L("Two-joint thigh muscles and compound exercises", "Двусуставные мышцы бедра и многосуставные упражнения"),
    text: L("Compound leg exercises grew the two-joint thigh muscles little. Squats and leg press barely grew the rectus femoris, and squats and hip thrusts barely grew the hamstrings. Leg extension grew the rectus femoris in every trial that compared it with a compound. Leg curls grew the hamstrings, although no trial compared them directly with squats.", "Многосуставные упражнения для ног мало увеличивали двусуставные мышцы бедра. Приседания и жим ногами почти не увеличивали прямую мышцу бедра, а приседания и ягодичный мост почти не увеличивали бицепс бедра. Разгибания ног увеличивали прямую мышцу бедра в каждом исследовании, где их сравнивали с многосуставным упражнением. Сгибания ног увеличивали бицепс бедра, хотя ни одно исследование не сравнивало их напрямую с приседаниями."),
    evidenceLevel: "moderate",
    refIds: [
      "kubo2019_squatdepth",
      "kinoshita2026_legext_vs_legpress",
      "kassiano2026_squat_vs_legext",
      "zabaleta2021_exerciseselection",
      "plotkin2023_hipthrust_vs_squat",
      "maeo2021_seated_vs_prone_curl"
    ]
  },
  {
    topic: L("EMG vs growth", "ЭМГ и рост"),
    text: L("The hip thrust showed higher acute glute EMG than the squat, but in a later MRI training study this did not translate into more glute growth. Treat EMG as a hint about which muscles are working, not as proof of hypertrophy.", "Ягодичный мост показал более высокую ЭМГ ягодичных в отдельном подходе, чем приседания, но в более позднем тренировочном исследовании с МРТ это не привело к большему росту ягодичных. Считайте ЭМГ подсказкой о том, какие мышцы работают, а не доказательством гипертрофии."),
    evidenceLevel: "limited",
    refIds: [
      "contreras2015_hipthrust_squat_emg",
      "plotkin2023_hipthrust_vs_squat"
    ]
  },
  {
    topic: L("Core activation vs hypertrophy", "Активация мышц кора и гипертрофия"),
    text: L("Two systematic reviews of acute EMG found free-weight lifts among the highest for erector spinae activity (and, in one review, rectus abdominis and external oblique), with multifidus results mixed between reviews. Such activation has not been shown to produce trunk muscle growth in long-term trials, so trunk exercise rankings in the app are activation-based assumptions.", "Два систематических обзора краткосрочных ЭМГ-исследований показали, что упражнения со свободным весом — среди лидеров по активности мышцы, выпрямляющей позвоночник (а в одном обзоре — также прямой мышцы живота и наружной косой), при этом результаты для многораздельной мышцы в обзорах расходятся. Не показано, что такая активация приводит к росту мышц туловища в длительных исследованиях, поэтому ранжирование упражнений для туловища в приложении — допущения, основанные на активации."),
    evidenceLevel: "limited",
    refIds: [
      "martuscello2013_core_emg_sr",
      "olivalozano2020_core_emg_sr"
    ]
  },
  {
    topic: L("Hip flexors are not abs", "Сгибатели бедра — это не пресс"),
    text: L("Hip-flexion movements (sit-ups, leg lifts) strongly recruit the iliopsoas and rectus femoris, whereas curl-ups keep psoas low and abdominal activity grows with trunk-flexion angle. The abs are still active during hip-flexion movements, so the difference is one of emphasis in EMG, not proven growth. Hip flexors are not tracked in the app and earn no target credit.", "Движения со сгибанием бедра (подъёмы корпуса из положения лёжа, подъёмы ног) сильно задействуют подвздошно-поясничную мышцу и прямую мышцу бедра, тогда как при скручиваниях активность поясничной мышцы остаётся низкой, а активность мышц живота растёт с углом сгибания туловища. Пресс всё равно активен при движениях со сгибанием бедра, поэтому различие — в акценте по ЭМГ, а не в доказанном росте. Сгибатели бедра в приложении не отслеживаются и не получают зачёта в цели."),
    evidenceLevel: "limited",
    refIds: [
      "andersson1997_abs_hipflexor_emg",
      "juker1998_psoas_abwall_emg"
    ]
  },
  {
    topic: L("Weekly volume dose-response", "Недельный объём: зависимость «доза — эффект»"),
    text: L("More weekly hard sets produce more hypertrophy with diminishing returns (more pronounced for strength). About 10 or more sets per muscle per week is supported as a reference; in trained men 12-20 vs >20 sets mostly did not differ. Supports the app's targets as references, not quotas.", "Больше тяжёлых подходов в неделю даёт больше гипертрофии с убывающей отдачей (она выражена сильнее для силы). Около 10 и более подходов на мышцу в неделю подтверждается как ориентир; у тренированных мужчин 12–20 и > 20 подходов в основном не различались. Это обосновывает цели приложения как ориентиры, а не нормы."),
    evidenceLevel: "strong",
    refIds: [
      "pelland2026_volume_frequency",
      "schoenfeld2017_volume",
      "bazvalle2022_volume",
      "schoenfeld2019_volume_rct",
      "currier2026_acsm_position"
    ]
  },
  {
    topic: L("Fractional counting of indirect sets", "Дробный учёт косвенных подходов"),
    text: L("Pelland 2026 found counting indirect sets as 0.5 had stronger relative evidence than counting them as 1 or 0. This supports fractional coefficients in principle; the app's finer 0.25/0.75 steps are practical assumptions not tested by that model.", "Pelland 2026 показал, что учёт косвенных подходов как 0,5 имел более сильную относительную поддержку данными, чем их учёт как 1 или 0. Это в принципе обосновывает дробные коэффициенты; более мелкие шаги приложения 0,25 / 0,75 — практические допущения, не проверенные этой моделью."),
    evidenceLevel: "moderate",
    refIds: [
      "pelland2026_volume_frequency"
    ]
  },
  {
    topic: L("Per-session volume ceiling", "Потолок объёма за одну тренировку"),
    text: L("No peer-reviewed, PubMed-indexed analysis of per-session volume was found. The ~11 fractional sets per session taper rests only on a preprint (Remmert 2025, no PMID, excluded) and must be labelled an assumption. Pelland 2026 modelled weekly volume and frequency, not per-session volume.", "Рецензированного анализа объёма за одну тренировку, индексированного в PubMed, не найдено. Плавное снижение зачёта после ~11 дробных подходов за тренировку опирается только на препринт (Remmert 2025, без PMID, исключён) и должно быть помечено как допущение. Pelland 2026 моделировал недельный объём и частоту, а не объём за одну тренировку."),
    evidenceLevel: "very_limited",
    refIds: [
      "pelland2026_volume_frequency"
    ]
  },
  {
    topic: L("Proximity to failure / RIR", "Близость к отказу / RIR"),
    text: L("Hypertrophy improves as sets end closer to failure, but momentary failure was not clearly better than stopping short (about 1-3 RIR) in multi-set training, and costs more acute fatigue. Any advantage for failure was trivial in pooled data and only a tendency in a single-set-per-exercise routine. Supports credit 1.0 for RIR 0-3 with declining credit above (the exact credit steps are assumptions).", "Гипертрофия возрастает, когда подходы заканчиваются ближе к отказу, но моментальный отказ не был явно лучше, чем остановка чуть раньше (около 1–3 RIR), в тренировке из нескольких подходов и обходится большей немедленной усталостью. Любое преимущество отказа было незначительным в объединённых данных и лишь тенденцией в программе с одним подходом на упражнение. Это обосновывает зачёт 1,0 для RIR 0–3 с убывающим зачётом выше (точные ступени зачёта — допущения)."),
    evidenceLevel: "strong",
    refIds: [
      "robinson2024_proximity_failure",
      "refalo2023_failure_meta",
      "refalo2024_failure_rct",
      "hermann2025_single_set_failure",
      "currier2026_acsm_position"
    ]
  },
  {
    topic: L("RIR self-estimation accuracy", "Точность самооценки RIR"),
    text: L("Lifters underpredict reps left by about one on average, with very high between-study heterogeneity; accuracy is better near failure, in sets of 12 reps or fewer and slightly in later sets, and improved with practice in one trial. Logged RIR in high-rep sets should be treated as less precise.", "Занимающиеся занижают число оставшихся повторений в среднем примерно на одно, при очень высокой неоднородности между исследованиями; точность выше вблизи отказа, в подходах на 12 повторений и меньше и немного выше в более поздних подходах, а в одном исследовании она улучшалась с практикой. Записанный RIR в подходах с большим числом повторений следует считать менее точным."),
    evidenceLevel: "moderate",
    refIds: [
      "halperin2022_rir_accuracy",
      "hermann2025_single_set_failure"
    ]
  },
  {
    topic: L("Load range", "Диапазон весов"),
    text: L("When sets go to failure, low, moderate and high loads give similar hypertrophy; heavier loads give more 1RM strength. Supports counting roughly 5-30 rep sets equally for size when taken close to failure.", "Когда подходы выполняются до отказа, малые, умеренные и большие веса дают сходную гипертрофию; более тяжёлые веса дают больший прирост силы в 1RM. Это обосновывает равный учёт для роста подходов примерно на 5–30 повторений, когда они выполняются близко к отказу."),
    evidenceLevel: "strong",
    refIds: [
      "schoenfeld2017_load",
      "lopez2021_load_network"
    ]
  },
  {
    topic: L("Rest intervals", "Интервалы отдыха"),
    text: L("Pooled estimates leaned toward a small hypertrophy advantage for rests longer than about 60 s (credible intervals included zero), with no appreciable further difference beyond about 90 s. One trained-men RCT favoured 3 min over 1 min. A rep drop after a much shorter rest should be attributed to rest, not strength loss.", "Объединённые оценки склонялись к небольшому преимуществу для гипертрофии при отдыхе дольше примерно 60 с (байесовские доверительные интервалы включали ноль), без заметной дальнейшей разницы после примерно 90 с. Одно РКИ на тренированных мужчинах показало преимущество 3 мин перед 1 мин. Падение повторений после намного более короткого отдыха следует относить на счёт отдыха, а не потери силы."),
    evidenceLevel: "moderate",
    refIds: [
      "singer2024_rest",
      "schoenfeld2016_rest"
    ]
  },
  {
    topic: L("Frequency at equated volume", "Частота при равном объёме"),
    text: L("With weekly volume equated, how many sessions a muscle's work is split across does not meaningfully change hypertrophy; frequency mainly helps by making more volume feasible, and it helps strength. Supports spreading the weekly target over sessions without a fixed frequency rule.", "При равном недельном объёме то, на сколько тренировок разделена работа на мышцу, существенно не меняет гипертрофию; частота помогает главным образом тем, что делает выполнимым больший объём, и она помогает силе. Это обосновывает распределение недельной цели по тренировкам без жёсткого правила частоты."),
    evidenceLevel: "strong",
    refIds: [
      "schoenfeld2019_frequency",
      "pelland2026_volume_frequency",
      "currier2026_acsm_position"
    ]
  },
  {
    topic: L("Range of motion and lengthened partials", "Амплитуда и частичные повторения в растянутом положении"),
    text: L("Full ROM beats partial ROM overall for strength and lower-limb hypertrophy, but partials at long muscle lengths roughly match full ROM (and occasionally exceed it), while short-length partials underperform. Supports partial ROM credit ×0.8 and lengthened partials ×1.0, with the ×0.8 value itself an assumption.", "Полная амплитуда в целом превосходит частичную для силы и гипертрофии нижних конечностей, но частичные повторения при большой длине мышцы примерно соответствуют полной амплитуде (а иногда превосходят её), тогда как частичные при малой длине уступают. Это обосновывает зачёт ×0,8 для частичной амплитуды и ×1,0 для частичных повторений в растянутом положении, причём само значение ×0,8 — допущение."),
    evidenceLevel: "moderate",
    refIds: [
      "pallares2021_rom",
      "kassiano2023_rom_review",
      "wolf2025_lengthened_partials",
      "currier2026_acsm_position"
    ]
  },
  {
    topic: L("Progression method", "Метод прогрессии"),
    text: L("Adding reps at a fixed load and adding load at a fixed rep range produced similar hypertrophy over 8 weeks in trained people, consistent with double progression (reps first, then load).", "Добавление повторений при постоянном весе и добавление веса при постоянном диапазоне повторений дали сходную гипертрофию за 8 недель у тренированных людей, что согласуется с двойной прогрессией (сначала повторения, затем вес)."),
    evidenceLevel: "moderate",
    refIds: [
      "plotkin2022_progression"
    ]
  },
  {
    topic: L("Recovery time course", "Ход восстановления во времени"),
    text: L("Sets to failure prolonged recovery of neuromuscular function and fatigue markers to roughly 24-48 h compared with non-failure sets of equal volume (acute data). Damage is greatest in the first sessions of a new programme and fades over about 3 weeks; damage is not required for growth; evidence that fatigue accumulates across sessions is equivocal. Consistent with adding time for failure sets and new exercises, but the app's specific windows are assumptions.", "Подходы до отказа удлиняли восстановление нервно-мышечной функции и маркеров усталости примерно до 24–48 ч по сравнению с подходами не до отказа при равном объёме (краткосрочные данные). Повреждение наибольшее в первых тренировках новой программы и сходит на нет примерно за 3 недели; повреждение не обязательно для роста; данные о том, что усталость накапливается от тренировки к тренировке, неоднозначны. Это согласуется с добавлением времени за подходы до отказа и новые упражнения, но конкретные окна приложения — допущения."),
    evidenceLevel: "limited",
    refIds: [
      "morannavarro2017_recovery_failure",
      "damas2016_damage_mps",
      "damas2018_damage_review",
      "kataoka2022_fatigue_accumulation"
    ]
  },
  {
    topic: L("Deloads", "Разгрузки"),
    text: L("A week of full cessation did not reduce lower-body hypertrophy but reduced lower-body strength gains in trained people; reducing sets and frequency in single weeks did not blunt growth in untrained men. Coaches define a deload as planned reduced training stress for fatigue management. No evidence that deloads improve hypertrophy; treat them as fatigue management.", "Неделя полного прекращения тренировок не снизила гипертрофию нижней части тела, но снизила прирост силы нижней части тела у тренированных людей; сокращение числа подходов и частоты в отдельные недели не ослабило рост у нетренированных мужчин. Тренеры определяют разгрузку как запланированное снижение тренировочного стресса для управления усталостью. Данных о том, что разгрузки улучшают гипертрофию, нет; считайте их управлением усталостью."),
    evidenceLevel: "limited",
    refIds: [
      "coleman2024_deload",
      "pancar2026_deload",
      "bell2023_deload_delphi"
    ]
  },
  {
    topic: L("Warm-up practice", "Практика разминки"),
    text: L("Only acute performance data exist: one crossover found no effect of warm-up type on reps to failure, another found a brief heavy warm-up allowed more total session volume. No long-term hypertrophy evidence; warm-up sets should not count toward volume.", "Есть только краткосрочные данные о работоспособности: одно перекрёстное исследование не обнаружило влияния типа разминки на число повторений до отказа, другое показало, что короткая тяжёлая разминка позволила выполнить больший суммарный объём за тренировку. Долгосрочных данных о гипертрофии нет; разминочные подходы не должны засчитываться в объём."),
    evidenceLevel: "very_limited",
    refIds: [
      "ribeiro2014_warmup",
      "viveiros2024_warmup_load"
    ]
  },
  {
    topic: L("Drop sets", "Дроп-сеты"),
    text: L("Drop sets produced hypertrophy similar to traditional sets, sometimes in much less time. This does not establish a per-segment credit; the app's ×0.5 for drop segments is an assumption.", "Дроп-сеты давали гипертрофию, сходную с обычными подходами, иногда за гораздо меньшее время. Это не задаёт зачёт для отдельного сегмента; ×0,5 для сегментов дроп-сета в приложении — допущение."),
    evidenceLevel: "limited",
    refIds: [
      "sodal2023_drop_sets"
    ]
  }
]);
