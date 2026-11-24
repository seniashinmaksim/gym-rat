// Generated from the verified research pass (2026-11-21). See SCIENTIFIC_METHOD.md.
// Edit by hand only together with tests/evidence.test.ts; never add a reference without verifying its PMID and DOI.

import { L, byLang } from '../../i18n/core';

export interface ExerciseEvidence {
  /** Ids from src/data/exercises.ts. */
  exerciseIds: string[];
  text: string;
  refIds: string[];
  /** true = based on EMG, acute, strength-only or extrapolated data, not measured growth for these exercises. */
  indirect: boolean;
}

export const EXERCISE_EVIDENCE: ExerciseEvidence[] = byLang(() => [
  {
    exerciseIds: [
      "incline_barbell_press",
      "incline_dumbbell_press",
      "smith_incline_press",
      "incline_chest_press"
    ],
    text: L("In one small long-term trial in untrained men, incline bench pressing grew the upper pectoral site more than flat pressing while strength gains matched. This is the only direct regional-growth evidence for inclines; it used a barbell, and the other variants are extrapolations.", "В одном небольшом длительном исследовании на нетренированных мужчинах жим на наклонной скамье увеличил верхнюю часть грудной мышцы сильнее, чем жим на горизонтальной, при одинаковом приросте силы. Это единственное прямое свидетельство регионального роста для наклонных жимов; в нём использовалась штанга, а остальные варианты — экстраполяция."),
    refIds: [
      "chaves2020_incline"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "incline_barbell_press",
      "incline_dumbbell_press",
      "smith_incline_press",
      "incline_chest_press"
    ],
    text: L("Most EMG studies show about 30-45 degree inclines shifting excitation toward the clavicular head, though one found no whole-lift difference. Steeper angles (above about 45 degrees) move work to the anterior deltoid. This is consistent with the app's coarse angle groups as an assumption, not a measured growth effect.", "Большинство ЭМГ-исследований показывает, что наклон около 30–45 градусов смещает возбуждение к ключичной головке, хотя в одном разницы за всё движение не нашли. Более крутые углы (примерно выше 45 градусов) переносят работу на переднюю дельту. Это согласуется с грубыми группами углов в приложении как допущение, а не как измеренный эффект роста."),
    refIds: [
      "rodriguezridao2020_bench_angles",
      "cabral2022_hdemg_incline",
      "lauver2016_bench_angle",
      "coratella2020_press_variations",
      "albarello2022_inclination"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "decline_press"
    ],
    text: L("No training study shows decline pressing grows the lower chest more than flat pressing. In EMG, decline matched flat for the sternocostal head and had the lowest anterior deltoid excitation. This is consistent with the app capping front delts on declines, but the evidence is indirect.", "Ни одно тренировочное исследование не показывает, что жим с отрицательным наклоном растит низ груди сильнее, чем жим на горизонтальной скамье. По ЭМГ отрицательный наклон не отличался от горизонтального для грудино-рёберной головки и давал наименьшее возбуждение передней дельты. Это согласуется с тем, что приложение ограничивает зачёт передних дельт при отрицательном наклоне, но данные косвенные."),
    refIds: [
      "coratella2020_press_variations",
      "lauver2016_bench_angle"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "dumbbell_bench_press",
      "dumbbell_fly"
    ],
    text: L("In recreationally trained men over 10 weeks, dumbbell press and dumbbell fly produced similar whole-muscle and regional pectoral thickness gains. Both can be treated as productive chest exercises.", "У мужчин с любительским опытом тренировок за 10 недель жим гантелей и разводка гантелей дали сходный прирост толщины грудной мышцы — и в целом, и по отдельным участкам. Оба можно считать продуктивными упражнениями для груди."),
    refIds: [
      "dellavanzi2026_press_vs_fly"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "pec_deck"
    ],
    text: L("Pec deck alone thickened the clavicular (about 17-18%) and sternocostal (about 21%) regions similarly over 12 weeks in untrained men, so it gives no regional emphasis. In these beginners one set to failure matched three sets.", "Один только пек-дек за 12 недель у нетренированных мужчин увеличил толщину ключичного (около 17–18 %) и грудино-рёберного (около 21 %) участков примерно одинаково, то есть регионального акцента он не даёт. У этих новичков один подход до отказа дал то же, что три подхода."),
    refIds: [
      "pinto2025_pecdeck"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "cable_fly",
      "low_to_high_cable_fly"
    ],
    text: L("No hypertrophy trial of cable flys (including low-to-high) was found. Their chest credit is extrapolated from the dumbbell fly and pec deck trials, and any upper-chest emphasis claimed for low-to-high flys is unverified.", "Исследований гипертрофии для сведений в кроссовере (включая сведение снизу вверх) не найдено. Их зачёт для груди экстраполирован из исследований разводки гантелей и пек-дека, а акцент на верх груди, приписываемый сведениям снизу вверх, не подтверждён."),
    refIds: [
      "dellavanzi2026_press_vs_fly",
      "pinto2025_pecdeck"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "machine_chest_press",
      "barbell_bench_press"
    ],
    text: L("In trained men, machine and barbell bench press grew the pectoralis major similarly, and meta-analyses find no hypertrophy difference between free weights and machines. Strength gains are modality-specific, so loads on different equipment should not be compared.", "У тренированных мужчин жим в тренажёре и жим штанги лёжа увеличили большую грудную мышцу примерно одинаково, а метаанализы не находят разницы в гипертрофии между свободными весами и тренажёрами. Прирост силы специфичен для вида оборудования, поэтому веса на разном оборудовании сравнивать не следует."),
    refIds: [
      "hernandezbelmonte2023_freeweight_machine",
      "haugen2023_freeweight_machine",
      "heidel2022_machines_freeweights"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "machine_chest_press",
      "barbell_bench_press"
    ],
    text: L("In bodybuilders, a chest press machine produced less clavicular and lateral deltoid EMG than barbell presses and less triceps EMG than flat or decline barbell pressing. This acute data does not override the long-term finding of similar growth.", "У бодибилдеров тренажёр для жима от груди давал меньшую ЭМГ ключичной части и средней дельты, чем жимы штанги, и меньшую ЭМГ трицепса, чем жим штанги на горизонтальной скамье или с отрицательным наклоном. Эти срочные данные не отменяют долгосрочного вывода о сходном росте."),
    refIds: [
      "coratella2020_press_variations"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: L("Ten weeks of bench press training (MRI) enlarged the pectoralis major, pectoralis minor, anterior deltoid and triceps. Pectoralis major gained more than triceps, and the medial deltoid least. This is consistent with secondary credit for triceps and front delts on presses; the exact 0.5 coefficient remains an assumption.", "Десять недель тренировок в жиме лёжа (МРТ) увеличили большую грудную, малую грудную, переднюю дельту и трицепс. Большая грудная выросла сильнее трицепса, а средняя дельта — меньше всего. Это согласуется с вторичным зачётом для трицепса и передних дельт в жимах; точный коэффициент 0,5 остаётся допущением."),
    refIds: [
      "lanza2024_bench_muscles"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: L("Full-ROM bench press beat top-range partials for 1RM and velocity gains, and gains shrank as the range shortened. Muscle size was not measured, and no chest trial of lengthened (bottom-range) partials was found.", "Жим лёжа в полной амплитуде превзошёл частичные повторения в верхней части амплитуды по приросту 1RM и скорости, и прирост уменьшался по мере сокращения амплитуды. Размер мышц не измеряли, а исследований частичных повторений в растянутом положении (в нижней части амплитуды) для груди не найдено."),
    refIds: [
      "martinezcava2022_bench_rom"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: L("Bench training with an elastic device (which assists at the bottom and allows about 10% heavier loads) gave the same pectoral thickness and 1RM gains as normal benching. The altered resistance profile was not superior.", "Тренировки в жиме лёжа с эластичным устройством (оно помогает внизу и позволяет брать примерно на 10 % больший вес) дали тот же прирост толщины грудной мышцы и 1RM, что и обычный жим. Изменённый профиль сопротивления преимущества не дал."),
    refIds: [
      "gavanda2026_elastic_bench"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "push_up"
    ],
    text: L("Push-ups adjusted to about 40% of bench 1RM increased pectoralis major and triceps thickness comparably to low-load bench press over 8 weeks. The trial was very small, so treat this as tentative.", "Отжимания, подобранные примерно под 40 % от 1RM в жиме лёжа, за 8 недель увеличили толщину большой грудной и трицепса сопоставимо с жимом лёжа с малым весом. Исследование было очень маленьким, поэтому считайте это предварительным выводом."),
    refIds: [
      "kikuchi2017_pushup"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "lat_pulldown",
      "close_grip_pulldown",
      "machine_pulldown"
    ],
    text: L("Grip widths of roughly 1-2 times shoulder width change lat EMG little and inconsistently; narrow and medium grips allowed slightly heavier 6RM loads than a very wide grip (Andersen V 2014; Buonsenso 2025; Di Fonza 2026). Pulling to the front of the face is the setup most consistently tied to higher lat EMG. Supports not treating grip width as a history key and not crediting one width with more lat volume. No long-term growth data compare these variants.", "Ширина хвата примерно в 1–2 ширины плеч меняет ЭМГ широчайших мало и непоследовательно; узкий и средний хват позволяли брать чуть больший вес на 6RM, чем очень широкий (Andersen V 2014; Buonsenso 2025; Di Fonza 2026). Тяга к передней части лица — вариант, наиболее последовательно связанный с более высокой ЭМГ широчайших. Это поддерживает решение не делать ширину хвата ключом истории и не засчитывать какой-то одной ширине больший объём для широчайших. Долгосрочных данных о росте, сравнивающих эти варианты, нет."),
    refIds: [
      "andersen2014_pulldown_grip",
      "buonsenso2025_pulldown_variants",
      "difonza2026_lat_emg_review",
      "lusk2010_pulldown_grip"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "lat_pulldown",
      "pull_up"
    ],
    text: L("Underhand vs overhand grip: lat EMG was similar in pull-ups and chin-ups while chin-ups raised biceps and pec EMG (Youdas 2010); in pulldowns an overhand grip gave slightly higher lat EMG and grip did not change biceps EMG (Lusk 2010; Buonsenso 2025). The app's rule crediting supinated vertical pulls with biceps at 0.75 or more rests only on mixed acute EMG, not hypertrophy data; keep it labelled as an assumption.", "Обратный хват против прямого: ЭМГ широчайших была сходной в подтягиваниях прямым и обратным хватом, при этом обратный хват повышал ЭМГ бицепса и грудных (Youdas 2010); в тяге верхнего блока прямой хват давал чуть более высокую ЭМГ широчайших, а хват не менял ЭМГ бицепса (Lusk 2010; Buonsenso 2025). Правило приложения, по которому вертикальные тяги супинированным хватом получают зачёт бицепса 0,75 и выше, опирается только на неоднозначные срочные данные ЭМГ, а не на данные о гипертрофии; оно должно оставаться помеченным как допущение."),
    refIds: [
      "youdas2010_pullup_chinup",
      "lusk2010_pulldown_grip",
      "buonsenso2025_pulldown_variants"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "lat_pulldown"
    ],
    text: L("Pulldown-only training grew the elbow flexors about as much as curl-only training in untrained men over 10 weeks, so a vertical pull is real biceps work and deserves fractional biceps credit; lat size was not measured in this trial.", "Тренировки только с тягой верхнего блока за 10 недель увеличили сгибатели локтя у нетренированных мужчин примерно так же, как тренировки только со сгибаниями, поэтому вертикальная тяга — реальная работа для бицепса и заслуживает частичного зачёта бицепса; размер широчайших в этом исследовании не измеряли."),
    refIds: [
      "gentil2015_mj_vs_sj"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "pull_up",
      "assisted_pull_up"
    ],
    text: L("Pull-ups and chin-ups produced very high lat EMG regardless of grip, and pull-up grip variations generally showed similar lat activation (Youdas 2010; Di Fonza 2026). No study here compares pull-ups directly with pulldowns, and none measured long-term lat size for either.", "Подтягивания прямым и обратным хватом давали очень высокую ЭМГ широчайших независимо от хвата, а варианты хвата в подтягиваниях в целом показывали сходную активацию широчайших (Youdas 2010; Di Fonza 2026). Ни одно из этих исследований не сравнивает подтягивания напрямую с тягой верхнего блока, и ни в одном не измеряли долгосрочное изменение размера широчайших ни для того, ни для другого."),
    refIds: [
      "youdas2010_pullup_chinup",
      "difonza2026_lat_emg_review"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "seated_cable_row",
      "chest_supported_row",
      "barbell_row",
      "dumbbell_row",
      "t_bar_row"
    ],
    text: L("Seated rows gave the highest middle-trapezius/rhomboid EMG among the pulldowns and rows tested and a lat-to-biceps ratio similar to wide-grip pulldowns; cueing scapular retraction did not change mid-trap/rhomboid activity (Lehman 2004). In seated rows, a narrower grip and less elbow flare were each tied to higher lat EMG in separate studies (Di Fonza 2026). This supports crediting rows to both lats and upper_back, but the split is an assumption: no vertical-vs-horizontal pulling hypertrophy trial was found.", "Тяга сидя дала наивысшую ЭМГ средней части трапеции и ромбовидных среди испытанных тяг верхнего блока и горизонтальных тяг, а соотношение активности широчайших и бицепса было близким к тяге верхнего блока широким хватом; указание сводить лопатки не изменило активность средней трапеции и ромбовидных (Lehman 2004). В тяге сидя более узкий хват и меньшее разведение локтей в отдельных исследованиях были связаны с более высокой ЭМГ широчайших (Di Fonza 2026). Это поддерживает зачёт горизонтальных тяг и для lats, и для upper_back, но распределение — допущение: исследований гипертрофии, сравнивающих вертикальные и горизонтальные тяги, не найдено."),
    refIds: [
      "lehman2004_row_pulldown",
      "difonza2026_lat_emg_review"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "shrug"
    ],
    text: L("Shrugs gave the highest upper-trapezius EMG of the exercises tested (Ekstrom 2003; Andersen LL 2008). Trapezius fibre growth has been shown with strength training (Kadi 2000) and neck/shoulder strength training (Andersen LL 2014), but no trial isolates shrugs. A traps 1.0 coefficient is a reasonable practical estimate.", "Шраги дали наивысшую ЭМГ верхней части трапеции среди испытанных упражнений (Ekstrom 2003; Andersen LL 2008). Рост волокон трапеции показан при силовых тренировках (Kadi 2000) и при силовых тренировках для шеи и плеч (Andersen LL 2014), но ни одно исследование не изучает шраги отдельно. Коэффициент 1,0 для трапеций — разумная практическая оценка."),
    refIds: [
      "ekstrom2003_trapezius_emg",
      "andersen2008_trapezius_emg",
      "andersen2014_trapezius_rct",
      "kadi2000_trapezius"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "lateral_raise",
      "upright_row"
    ],
    text: L("In women with neck pain, lateral raises and upright rows produced trapezius EMG close to shrugs despite much lighter loads (Andersen LL 2008). This hints that a traps 0.25 coefficient for lateral raises may understate trap involvement, but EMG is not a validated hypertrophy predictor (Vigotsky 2022), so do not change coefficients on this alone; treat as an open question.", "У женщин с болью в шее махи в стороны и тяга к подбородку давали ЭМГ трапеции, близкую к шрагам, несмотря на гораздо меньший вес (Andersen LL 2008). Это намекает, что коэффициент 0,25 для трапеций в махах в стороны может занижать участие трапеций, но ЭМГ не является проверенным предиктором гипертрофии (Vigotsky 2022), поэтому менять коэффициенты только на этом основании не следует; считайте это открытым вопросом."),
    refIds: [
      "andersen2008_trapezius_emg",
      "vigotsky2022_emg_proxy"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "rear_delt_fly",
      "reverse_pec_deck"
    ],
    text: L("Prone horizontal shoulder extension with external rotation (a rear-delt-fly-like pattern) produced among the highest middle-trapezius EMG (Ekstrom 2003), suggesting these movements also load the upper_back. Acute EMG only; deltoids were not measured in that study.", "Горизонтальное разгибание плеча лёжа на животе с наружной ротацией (движение, похожее на разводку на заднюю дельту) дало одну из самых высоких ЭМГ средней части трапеции (Ekstrom 2003), что позволяет предположить, что эти движения нагружают и upper_back. Только срочные данные ЭМГ; дельты в том исследовании не измеряли."),
    refIds: [
      "ekstrom2003_trapezius_emg"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "lateral_raise",
      "cable_lateral_raise"
    ],
    text: L("Dumbbell and cable lateral raises produced similar side-delt growth over 8 weeks in trained lifters when ROM was matched and sets were taken to failure. Choose by comfort, equipment and consistency. A hypertrophy advantage from the cable's resistance profile or lengthened-position loading is untested (ROM was matched in the only trial).", "Махи в стороны с гантелями и в кроссовере за 8 недель дали сходный рост средней дельты у тренированных атлетов, когда амплитуда была уравнена, а подходы выполнялись до отказа. Выбирайте по удобству, оборудованию и регулярности. Преимущество для гипертрофии от профиля сопротивления блока или от нагрузки в растянутом положении не проверено (в единственном исследовании амплитуда была уравнена)."),
    refIds: [
      "larsen2025_lateral_raise"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "lateral_raise",
      "cable_lateral_raise",
      "machine_lateral_raise"
    ],
    text: L("EMG on humeral rotation is mixed: in one bodybuilder study a neutral humerus beat external rotation, bent elbow and frontal raise for middle-delt activity, while internal rotation increased rear-delt, upper-trap and triceps activity; a systematic review ranked internally rotated lateral raises highest for the middle delt. Activation only; not shown to change growth.", "Данные ЭМГ о ротации плечевой кости неоднозначны: в одном исследовании на бодибилдерах нейтральное положение плеча превзошло наружную ротацию, согнутый локоть и подъём перед собой по активности средней дельты, а внутренняя ротация повышала активность задней дельты, верхней части трапеции и трицепса; систематический обзор поставил махи в стороны с внутренней ротацией на первое место для средней дельты. Только активация; изменение роста не показано."),
    refIds: [
      "coratella2020_lateral_raise_emg",
      "rabello2024_deltoid_emg_sr"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: L("Ten weeks of barbell bench press grew the anterior deltoid but gave the smallest response in the side deltoid (MRI). Supports front delts about 0.5 and little or no side-delt credit for flat pressing. Applying this to dumbbell or machine flat presses is an extrapolation.", "Десять недель жима штанги лёжа увеличили переднюю дельту, но дали наименьший отклик в средней дельте (МРТ). Это поддерживает коэффициент около 0,5 для передних дельт и малый или нулевой зачёт средних дельт в жиме на горизонтальной скамье. Перенос этого на горизонтальные жимы гантелей или в тренажёре — экстраполяция."),
    refIds: [
      "lanza2024_bench_muscles"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: L("Side-delt EMG during bench press is very low.", "ЭМГ средней дельты в жиме лёжа очень низкая."),
    refIds: [
      "campos2020_deltoid_emg"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "overhead_press",
      "dumbbell_shoulder_press",
      "machine_shoulder_press"
    ],
    text: L("Shoulder pressing gave the highest anterior-delt EMG of four exercises and substantial middle-delt EMG in one study; barbell pressing excited the delts more than a machine shoulder press, and behind-the-neck pressing more middle and rear delt than front pressing. No long-term trial confirms side-delt growth from overhead pressing, so side-delt credit for presses is an estimate.", "В одном исследовании жим над головой дал наивысшую ЭМГ передней дельты из четырёх упражнений и существенную ЭМГ средней дельты; жим штанги возбуждал дельты сильнее, чем жим вверх в тренажёре, а жим из-за головы — сильнее среднюю и заднюю дельту, чем жим с груди. Ни одно длительное исследование не подтверждает рост средней дельты от жимов над головой, поэтому зачёт средней дельты для жимов — оценка."),
    refIds: [
      "campos2020_deltoid_emg",
      "coratella2022_overhead_press_emg"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "reverse_pec_deck"
    ],
    text: L("On a reverse fly machine a neutral (palms-facing) grip modestly increased rear-delt and infraspinatus EMG versus a pronated grip. Activation only.", "В тренажёре для обратных разведений нейтральный хват (ладони друг к другу) умеренно повышал ЭМГ задней дельты и подостной мышцы по сравнению с пронированным хватом. Только активация."),
    refIds: [
      "schoenfeld2013_reverse_fly_grip"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "front_raise"
    ],
    text: L("The frontal raise mainly activates the anterior deltoid and pectoralis major (EMG); no evidence that it adds front-delt growth beyond adequate pressing volume.", "Подъём перед собой в основном активирует переднюю дельту и большую грудную (ЭМГ); нет данных, что он добавляет рост передней дельты сверх достаточного объёма жимов."),
    refIds: [
      "coratella2020_lateral_raise_emg"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "overhead_triceps_extension",
      "triceps_pushdown",
      "triceps_pushdown_bar",
      "triceps_pushdown_rope"
    ],
    text: L("Overhead cable extensions produced about 1.4 times the whole-triceps growth (1.5 times for the long head) of neutral-arm cable extensions in a 12-week MRI trial, with roughly a third less load. Loads are not comparable between the two, so keep separate histories. The neutral-arm (pushdown-like) condition still grew the triceps about 14%; the evidence favors adding an overhead variant, not dropping pushdowns. The trial did not test rope or bar pushdowns specifically.", "Разгибания на блоке из-за головы в 12-недельном исследовании с МРТ дали примерно в 1,4 раза больший рост всего трицепса (в 1,5 раза для длинной головки), чем разгибания на блоке с руками вдоль тела, при весе примерно на треть меньше. Веса в этих двух вариантах несопоставимы, поэтому ведите отдельные истории. Вариант с руками вдоль тела (похожий на разгибания на блоке вниз) всё равно увеличил трицепс примерно на 14 %; данные говорят в пользу добавления варианта из-за головы, а не отказа от разгибаний на блоке. Разгибания именно с канатом или с прямой рукоятью в исследовании не проверялись."),
    refIds: [
      "maeo2023_triceps_overhead"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "incline_dumbbell_curl",
      "preacher_curl"
    ],
    text: L("Incline curls grew the biceps somewhat more and preacher curls grew the brachialis and brachioradialis somewhat more, with similar total elbow flexor growth (MRI, 12 weeks, untrained). An ultrasound trial in women found a significant within-group gain only with preacher curls (distal site) but no significant between-group difference. Treat them as roughly equivalent for weekly elbow-flexor volume, with small muscle-specific emphasis.", "Сгибания на наклонной скамье увеличили бицепс несколько сильнее, а сгибания на скамье Скотта несколько сильнее увеличили плечевую и плечелучевую мышцы, при сходном общем росте сгибателей локтя (МРТ, 12 недель, нетренированные). В исследовании с УЗИ на женщинах значимый прирост внутри группы был только при сгибаниях на скамье Скотта (дистальный участок), но значимой разницы между группами не было. Считайте их примерно равноценными для недельного объёма сгибателей локтя, с небольшим акцентом на отдельные мышцы."),
    refIds: [
      "kobayashi2026_incline_vs_preacher",
      "zabaletakorta2023_incline_vs_preacher"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "preacher_curl",
      "cable_curl"
    ],
    text: L("With resistance profiles matched by cables, shoulder-flexed (preacher) and shoulder-extended cable curls showed no significant difference in biceps or brachialis thickness gains. Barbell preacher curls (hardest with the elbow extended) and cable preacher curls (hardest near full flexion) also grew the biceps similarly, with the barbell version giving more strength only at the most extended angle.", "Когда профили сопротивления были уравнены с помощью блоков, сгибания на блоке с согнутым плечом (как на скамье Скотта) и с разогнутым плечом не показали значимой разницы в приросте толщины бицепса или плечевой мышцы. Сгибания на скамье Скотта со штангой (труднее всего при разогнутом локте) и на блоке (труднее всего ближе к полному сгибанию) тоже увеличили бицепс сходно, причём вариант со штангой дал больше силы только в самом разогнутом положении."),
    refIds: [
      "attarieh2025_preacher_vs_bayesian",
      "nunes2020_cable_vs_barbell_preacher"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "preacher_curl",
      "dumbbell_curl",
      "barbell_curl",
      "ez_bar_curl",
      "machine_biceps_curl"
    ],
    text: L("Within a curl, the bottom (elbow-extended, lengthened) part of the range appears more valuable than the top: lengthened-range partials grew the distal biceps or elbow flexor thickness more than short-range partials. This supports full ROM (or lengthened partials) over short-range partials; it does not show lengthened partials beat full ROM.", "В сгибании нижняя часть амплитуды (локоть разогнут, растянутое положение), по-видимому, ценнее верхней: частичные повторения в растянутой части амплитуды увеличили толщину дистальной части бицепса или сгибателей локтя сильнее, чем частичные повторения в укороченной части. Это поддерживает полную амплитуду (или частичные повторения в растянутом положении) против коротких частичных повторений; это не показывает, что частичные повторения в растянутом положении лучше полной амплитуды."),
    refIds: [
      "pedrosa2023_arm_curl_initial_rom",
      "sato2021_elbow_angle_training",
      "kassiano2023_rom_review"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "dumbbell_row",
      "dumbbell_curl"
    ],
    text: L("Dumbbell rows grew the elbow flexors about half as much as biceps curls in an 8-week within-subject trial in 10 untrained men. This is loosely consistent with a partial (about 0.5) biceps credit for rows, though one small study cannot pin down a coefficient.", "Тяга гантели увеличила сгибатели локтя примерно вдвое меньше, чем сгибания на бицепс, в 8-недельном внутрииндивидуальном исследовании на 10 нетренированных мужчинах. Это в общих чертах согласуется с частичным (около 0,5) зачётом бицепса для тяг, хотя одно небольшое исследование не может точно определить коэффициент."),
    refIds: [
      "mannarino2021_curl_vs_row"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "lat_pulldown",
      "barbell_bench_press"
    ],
    text: L("A program of only pulldowns and bench presses grew the elbow flexors about as much as the same program plus curls and extensions in untrained men over 10 weeks; in trained men, arm circumference gains were also similar with or without isolation work. These short, small trials cannot rule out a small benefit of direct arm work.", "Программа только из тяги верхнего блока и жима лёжа за 10 недель увеличила сгибатели локтя у нетренированных мужчин примерно так же, как та же программа с добавлением сгибаний и разгибаний; у тренированных мужчин прирост обхвата руки тоже был сходным с изолирующей работой и без неё. Эти короткие небольшие исследования не могут исключить небольшую пользу прямой работы на руки."),
    refIds: [
      "gentil2013_adding_single_joint",
      "defranca2015_single_joint_trained"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: L("Bench press alone increased triceps thickness while no biceps thickness change was detected over 24 weeks (n=7, no control), consistent with a triceps credit and no biceps credit for presses.", "Один только жим лёжа увеличил толщину трицепса, а изменения толщины бицепса за 24 недели не обнаружено (n=7, без контрольной группы), что согласуется с зачётом трицепса и отсутствием зачёта бицепса для жимов."),
    refIds: [
      "ogasawara2012_bench_press_arm"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "hammer_curl",
      "wrist_curl",
      "reverse_curl"
    ],
    text: L("No long-term hypertrophy trial of hammer curls, wrist curls or reverse curls was found among verified sources; any brachialis or forearm emphasis attributed to them rests on anatomy and EMG-type reasoning, not measured growth.", "Среди проверенных источников не найдено длительных исследований гипертрофии для молотков, сгибаний запястий или обратных сгибаний; любой акцент на плечевую мышцу или предплечья, который им приписывают, опирается на анатомию и рассуждения по типу ЭМГ, а не на измеренный рост."),
    refIds: [],
    indirect: true
  },
  {
    exerciseIds: [
      "leg_extension"
    ],
    text: L("In these trials, leg extension was the exercise that consistently grew the rectus femoris, and it grew the vasti about as much as leg press. The quads 1.0 coefficient is supported. One trial found a reclined backrest (about 40 deg hip flexion) grew the rectus femoris more than an upright 90 deg seat, so the backrest setting is worth recording.", "В этих исследованиях разгибания ног были упражнением, которое стабильно увеличивало прямую мышцу бедра, а широкие мышцы бедра оно увеличивало примерно так же, как жим ногами. Коэффициент 1,0 для квадрицепсов подтверждается. В одном исследовании откинутая спинка (около 40° сгибания в тазобедренном суставе) увеличила прямую мышцу бедра сильнее, чем вертикальная посадка под 90°, поэтому положение спинки стоит записывать."),
    refIds: [
      "kinoshita2026_legext_vs_legpress",
      "kassiano2026_squat_vs_legext",
      "zabaleta2021_exerciseselection",
      "larsen2025_hipangle_legext"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "back_squat",
      "smith_squat"
    ],
    text: L("Squats grew the vasti, gluteus maximus and adductors but barely grew the rectus femoris and hamstrings. Full depth beat half depth for glutes and adductors, and deep beat shallow for front-thigh size in one trial. Since the 2026-11-22 audit the app credits full-depth squats with quads 1, glutes 0.75, adductors 0.75 and no hamstring credit; above-parallel squats keep glutes and adductors at 0.5 (registry depth rule). Recording depth is justified.", "Приседания увеличили широкие мышцы бедра, большую ягодичную и приводящие, но почти не увеличили прямую мышцу бедра и мышцы задней поверхности бедра. Полная глубина превзошла половинную для ягодичных и приводящих, а в одном исследовании глубокие приседания превзошли неглубокие по размеру передней поверхности бедра. После аудита 2026-11-22 приложение засчитывает приседаниям в полную глубину квадрицепсы 1, ягодичные 0,75, приводящие 0,75 и не даёт зачёта бицепсу бедра; приседания выше параллели оставляют ягодичные и приводящие на 0,5 (правило глубины в реестре). Записывать глубину оправданно."),
    refIds: [
      "kubo2019_squatdepth",
      "bloomquist2013_squatrom",
      "plotkin2023_hipthrust_vs_squat",
      "kassiano2026_squat_vs_legext",
      "barbalho2020_squat_vs_hipthrust"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "leg_press"
    ],
    text: L("In one MRI trial, leg press grew the vasti as much as knee extension and also grew the gluteus maximus (about 15%) and adductor magnus (about 6%), but not the rectus femoris. This is consistent with quads 1, glutes 0.5 and adductors 0.5.", "В одном исследовании с МРТ жим ногами увеличил широкие мышцы бедра так же, как разгибание в колене, а также увеличил большую ягодичную (около 15 %) и большую приводящую (около 6 %), но не прямую мышцу бедра. Это согласуется с коэффициентами: квадрицепсы 1, ягодичные 0,5, приводящие 0,5."),
    refIds: [
      "kinoshita2026_legext_vs_legpress"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "seated_leg_curl",
      "lying_leg_curl"
    ],
    text: L("In a 12-week within-person trial, seated curls grew the hamstrings more than lying curls (about 14% vs 9%), mainly in the two-joint muscles. Both grew the hamstrings, so hamstrings 1.0 for both is reasonable, and the seated curl is the better pick when both are available.", "В 12-недельном внутрииндивидуальном исследовании сгибания ног сидя увеличили мышцы задней поверхности бедра сильнее, чем сгибания лёжа (около 14 % против 9 %), в основном за счёт двусуставных мышц. Оба варианта увеличили эти мышцы, поэтому коэффициент 1,0 для бицепса бедра в обоих разумен, а сгибания сидя — лучший выбор, когда доступны оба."),
    refIds: [
      "maeo2021_seated_vs_prone_curl",
      "maeo2024_nordic_vs_lset"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "romanian_deadlift",
      "dumbbell_romanian_deadlift",
      "back_extension"
    ],
    text: L("No long-term hypertrophy trial of the RDL or the 45 deg back extension was found. Indirect support: a hip-extension exercise grew the biceps femoris long head more than Nordics, and hip-flexed hamstring work favoured the hamstring muscles that also extend the hip. The RDL hamstrings 1.0 and back-extension hamstrings 0.5 coefficients are reasonable inferences but have not been tested directly.", "Длительных исследований гипертрофии для румынской тяги или гиперэкстензии под 45° не найдено. Косвенная поддержка: упражнение на разгибание бедра увеличило длинную головку двуглавой мышцы бедра сильнее, чем нордические сгибания, а работа на заднюю поверхность бедра с согнутым тазобедренным суставом сильнее развивала те её мышцы, которые также разгибают бедро. Коэффициенты бицепса бедра 1,0 для румынской тяги и 0,5 для гиперэкстензии — разумные выводы, но напрямую они не проверялись."),
    refIds: [
      "bourne2017_nordic_vs_hipext",
      "maeo2024_nordic_vs_lset"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "hip_thrust"
    ],
    text: L("On MRI (untrained, 9 weeks), hip thrusts and squats grew the glutes similarly, and an ultrasound trial in trained women favoured squats. Hip thrusts produced little hamstring growth and less adductor growth than squats, consistent with glutes 1, hamstrings 0.25 and adductors 0.25.", "По МРТ (нетренированные, 9 недель) ягодичный мост и приседания увеличили ягодичные сходно, а исследование с УЗИ на тренированных женщинах показало преимущество приседаний. Ягодичный мост дал малый рост мышц задней поверхности бедра и меньший рост приводящих, чем приседания, что согласуется с коэффициентами: ягодичные 1, бицепс бедра 0,25, приводящие 0,25."),
    refIds: [
      "plotkin2023_hipthrust_vs_squat",
      "barbalho2020_squat_vs_hipthrust",
      "krauseneto2025_glutemax_ma"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "hip_thrust"
    ],
    text: L("Higher acute glute EMG did not predict more growth.", "Более высокая срочная ЭМГ ягодичных не предсказала большего роста."),
    refIds: [
      "contreras2015_hipthrust_squat_emg",
      "plotkin2023_hipthrust_vs_squat"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "standing_calf_raise",
      "leg_press_calf_raise"
    ],
    text: L("Straight-knee calf raises grew both gastrocnemius heads and the soleus. On a horizontal leg-press calf raise, partials in the stretched (heel-down) half grew the medial gastrocnemius more than full range or top-half reps. Calves 1.0 is supported.", "Подъёмы на носки с прямым коленом увеличили обе головки икроножной мышцы и камбаловидную. В подъёмах на носки в горизонтальном жиме ногами частичные повторения в растянутой половине (пятка внизу) увеличили медиальную головку икроножной сильнее, чем полная амплитуда или повторения в верхней половине. Коэффициент 1,0 для икр подтверждается."),
    refIds: [
      "kinoshita2023_standing_vs_seated_calf",
      "kassiano2023_calf_lengthened",
      "kassiano2024_calf_volume"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "seated_calf_raise"
    ],
    text: L("In one small MRI trial, seated (knee 90 deg) calf raises produced no significant gastrocnemius growth, while the soleus grew about as much as with standing raises. Whole-calf growth was roughly 40% of standing raises (2.1% vs 5.6%). The current calves 1.0 may overstate whole-calf credit; a value around 0.5 would fit this trial, but it is a single small study in untrained people, so treat this as a suggestion.", "В одном небольшом исследовании с МРТ подъёмы на носки сидя (колено 90°) не дали значимого роста икроножной мышцы, а камбаловидная выросла примерно так же, как при подъёмах стоя. Рост икры в целом составил около 40 % от подъёмов стоя (2,1 % против 5,6 %). Текущий коэффициент 1,0 для икр может завышать зачёт для икры в целом; значение около 0,5 соответствовало бы этому исследованию, но это единственное небольшое исследование на нетренированных людях, поэтому считайте это предложением."),
    refIds: [
      "kinoshita2023_standing_vs_seated_calf"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "hip_adduction"
    ],
    text: L("No long-term hypertrophy trial of the hip adduction machine was found. The adductors 1.0 coefficient rests on anatomy, not on measured growth.", "Длительных исследований гипертрофии для тренажёра на сведение ног не найдено. Коэффициент 1,0 для приводящих опирается на анатомию, а не на измеренный рост."),
    refIds: [],
    indirect: true
  },
  {
    exerciseIds: [
      "hanging_knee_raise_pelvic_curl"
    ],
    text: L("Hanging knee-ups in ab straps were among the exercises with the highest upper and lower rectus abdominis, oblique and latissimus EMG; they were not among those with the highest rectus femoris activity in that study. Separately, abdominal activity rises with trunk-curl angle. This is consistent with the owner's pelvic-curl technique, but the technique itself was not tested, and all of this is activation data: no trial shows this exercise grows the abs more than others.", "Подъёмы коленей в висе в петлях были среди упражнений с наивысшей ЭМГ верхней и нижней части прямой мышцы живота, косых мышц и широчайших; в том исследовании они не вошли в число упражнений с наивысшей активностью прямой мышцы бедра. Отдельно показано, что активность мышц живота растёт с углом скручивания туловища. Это согласуется с техникой владельца со скручиванием таза, но сама техника не проверялась, и всё это данные об активации: ни одно исследование не показывает, что это упражнение растит пресс сильнее других."),
    refIds: [
      "escamilla2006_abs_emg",
      "andersson1997_abs_hipflexor_emg"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "hanging_leg_raise"
    ],
    text: L("Leg lifts that flex mainly at the hip strongly recruit the hip flexors (iliacus, psoas, sartorius, rectus femoris); two-leg lifts also require abdominal activation (EMG). The app's rule of full ab credit only when the pelvis curls up is a practical assumption; there are no hypertrophy data for this exercise.", "Подъёмы ног, при которых сгибание идёт в основном в тазобедренном суставе, сильно включают сгибатели бедра (подвздошную, поясничную, портняжную, прямую мышцу бедра); подъёмы двух ног также требуют активации мышц живота (ЭМГ). Правило приложения — полный зачёт пресса только тогда, когда таз подкручивается вверх, — практическое допущение; данных о гипертрофии для этого упражнения нет."),
    refIds: [
      "andersson1997_abs_hipflexor_emg",
      "juker1998_psoas_abwall_emg"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "crunch",
      "cable_crunch",
      "ab_machine"
    ],
    text: L("Curl-up and crunch-type trunk flexion activates the abdominal wall while keeping psoas activity low, unlike full sit-ups (intramuscular EMG), and abdominal EMG rises with greater trunk-flexion angle. No long-term hypertrophy comparisons between crunch variations were found.", "Сгибание туловища по типу скручиваний активирует брюшную стенку при низкой активности поясничной мышцы, в отличие от полных подъёмов туловища (внутримышечная ЭМГ), а ЭМГ мышц живота растёт с увеличением угла сгибания туловища. Длительных сравнений гипертрофии между вариантами скручиваний не найдено."),
    refIds: [
      "juker1998_psoas_abwall_emg",
      "andersson1997_abs_hipflexor_emg"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "plank"
    ],
    text: L("The prone bridge produced higher rectus abdominis EMG than light-to-moderate squats, front squats or military presses, and the side bridge gave high abdominal-wall activity with low psoas activity.", "Планка на предплечьях дала более высокую ЭМГ прямой мышцы живота, чем приседания, фронтальные приседания или армейский жим с лёгкой и умеренной нагрузкой, а боковая планка давала высокую активность брюшной стенки при низкой активности поясничной мышцы."),
    refIds: [
      "comfort2011_trunk_emg",
      "juker1998_psoas_abwall_emg"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "plank"
    ],
    text: L("Adding bodyweight stabilization exercises (including plank-type holds) to soccer training gave no extra trunk muscle growth on MRI in adolescents. High activation here has not translated into documented hypertrophy.", "Добавление стабилизационных упражнений с весом тела (включая удержания по типу планки) к футбольным тренировкам не дало дополнительного роста мышц туловища по МРТ у подростков. Высокая активация здесь не привела к документально подтверждённой гипертрофии."),
    refIds: [
      "hoshikawa2013_stabilization"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "back_squat",
      "front_squat",
      "deadlift"
    ],
    text: L("At 80% 1RM, squats and deadlifts produced high lumbar and upper erector spinae EMG, well above bodyweight and instability exercises, without a rise in lower-abdominal or external-oblique EMG. At light-to-moderate loads the front squat gave erector EMG as high as the superman. There is no long-term evidence that these lifts grow the rectus abdominis; erector growth from them is plausible but not demonstrated in lifters.", "При 80 % от 1RM приседания и становая тяга давали высокую ЭМГ поясничной и верхней части мышцы, выпрямляющей позвоночник, намного выше, чем упражнения с весом тела и на неустойчивой опоре, без роста ЭМГ нижней части живота или наружной косой мышцы. При лёгкой и умеренной нагрузке фронтальные приседания давали ЭМГ разгибателей такую же высокую, как упражнение «супермен». Долгосрочных данных о том, что эти упражнения растят прямую мышцу живота, нет; рост разгибателей от них правдоподобен, но у тренирующихся с отягощениями не показан."),
    refIds: [
      "hamlyn2007_trunk_emg",
      "comfort2011_trunk_emg",
      "martuscello2013_core_emg_sr",
      "olivalozano2020_core_emg_sr"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "deadlift"
    ],
    text: L("In patients with low back pain, 2 months of deadlift training changed lumbar multifidus thickness about as much as low-load motor-control exercise, with the thinner side catching up in both groups. This is not evidence of erector hypertrophy in healthy lifters.", "У пациентов с болью в пояснице 2 месяца тренировок в становой тяге изменили толщину поясничной многораздельной мышцы примерно так же, как упражнения на моторный контроль с малой нагрузкой, причём более тонкая сторона догнала другую в обеих группах. Это не свидетельство гипертрофии разгибателей у здоровых тренирующихся."),
    refIds: [
      "berglund2017_deadlift_multifidus"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "romanian_deadlift"
    ],
    text: L("In trained men, 10 weeks of RDLs increased RDL 1RM but not isolated lumbar extension torque, suggesting the hips rather than the lumbar extensors drove the gain. Strength-only evidence; muscle size was not measured.", "У тренированных мужчин 10 недель румынской тяги увеличили 1RM в румынской тяге, но не момент силы в изолированном разгибании поясницы, что позволяет предположить, что прирост обеспечили бёдра, а не разгибатели поясницы. Данные только о силе; размер мышц не измеряли."),
    refIds: [
      "fisher2013_rdl_lumbar"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "back_extension"
    ],
    text: L("Roman chair and bench back extensions activate the lumbar extensors, but a review of training studies suggests that without pelvic restraint they may yield weaker specific lumbar-extensor adaptations than isolated lumbar extension machines, because the hip extensors contribute heavily. The app's spinal_erectors coefficient of 1.0 for this exercise is a practical assumption, not a measured value.", "Гиперэкстензии на римском стуле и на скамье активируют разгибатели поясницы, но обзор тренировочных исследований предполагает, что без фиксации таза они могут давать более слабые специфические адаптации разгибателей поясницы, чем тренажёры для изолированного разгибания поясницы, потому что значительную часть работы берут на себя разгибатели бедра. Коэффициент 1,0 для spinal_erectors в этом упражнении — практическое допущение, а не измеренное значение."),
    refIds: [
      "steele2015_lumbar_extensors"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "leg_press",
      "leg_extension"
    ],
    text: L("In trained lifters, leg press stopped at about 2 RIR and leg extension at about 1 RIR produced the same quadriceps growth as sets to momentary failure, with less acute fatigue.", "У тренированных атлетов жим ногами, остановленный примерно за 2 RIR, и разгибания ног, остановленные примерно за 1 RIR, дали тот же рост квадрицепса, что и подходы до моментального отказа, при меньшем срочном утомлении."),
    refIds: [
      "refalo2024_failure_rct"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "back_squat",
      "leg_extension",
      "standing_calf_raise",
      "seated_calf_raise"
    ],
    text: L("Progressing by reps at a fixed load and progressing load at fixed reps gave broadly similar quad and calf growth over 8 weeks (the study's straight-leg calf raise is mapped to standing_calf_raise); consistent with double progression.", "Прогрессия по повторениям при фиксированном весе и прогрессия по весу при фиксированных повторениях дали в целом сходный рост квадрицепсов и икр за 8 недель (подъём на носки с прямыми ногами из исследования сопоставлен со standing_calf_raise); это согласуется с двойной прогрессией."),
    refIds: [
      "plotkin2022_progression"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "leg_extension"
    ],
    text: L("Dropping to once weekly with 2 sets in weeks 4 and 8 did not reduce quadriceps thickness or 10RM gains from unilateral leg extension in untrained men (the paired biceps curl variant was not specified, so it is not mapped).", "Снижение до одной тренировки в неделю с 2 подходами на 4-й и 8-й неделях не уменьшило прирост толщины квадрицепса и 10RM от разгибаний одной ноги у нетренированных мужчин (вариант парного сгибания на бицепс не был указан, поэтому он не сопоставлен)."),
    refIds: [
      "pancar2026_deload"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "barbell_bench_press",
      "back_squat"
    ],
    text: L("Acute data only: sets to failure slowed recovery of bar velocity and jump performance, out to roughly 24-48 h, compared with equal-volume non-failure sets.", "Только срочные данные: подходы до отказа замедляли восстановление скорости штанги и результата в прыжке, примерно до 24–48 ч, по сравнению с подходами не до отказа при равном объёме."),
    refIds: [
      "morannavarro2017_recovery_failure"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "barbell_bench_press",
      "back_squat"
    ],
    text: L("Acute data only: general, specific or combined warm-ups did not change total reps in 4 sets to failure at 80% 1RM compared with no warm-up.", "Только срочные данные: общая, специальная или комбинированная разминка не изменила общее число повторений в 4 подходах до отказа при 80 % от 1RM по сравнению с отсутствием разминки."),
    refIds: [
      "ribeiro2014_warmup"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "barbell_bench_press",
      "leg_press",
      "lat_pulldown"
    ],
    text: L("Acute data only: a short, heavy warm-up (5 reps at 80% of the 10RM load) allowed more total session volume than lighter, longer warm-ups; per exercise the difference was clear only for bench press.", "Только срочные данные: короткая тяжёлая разминка (5 повторений с 80 % от веса на 10RM) позволила набрать больший общий объём тренировки, чем более лёгкие и длинные разминки; по отдельным упражнениям разница была явной только для жима лёжа."),
    refIds: [
      "viveiros2024_warmup_load"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "lat_pulldown"
    ],
    text: L("Unilateral lat pulldown 10RM (strength-endurance, not muscle size) improved similarly with lengthened partials and full ROM upper-body training.", "10RM в тяге верхнего блока одной рукой (силовая выносливость, а не размер мышц) улучшился сходно при тренировках верха тела с частичными повторениями в растянутом положении и в полной амплитуде."),
    refIds: [
      "wolf2025_lengthened_partials"
    ],
    indirect: true
  }
]);

export function evidenceForExercise(exerciseId: string): ExerciseEvidence[] {
  return EXERCISE_EVIDENCE.filter((e) => e.exerciseIds.includes(exerciseId));
}
