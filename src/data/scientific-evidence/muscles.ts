// Generated from the verified research pass (2026-11-21). See SCIENTIFIC_METHOD.md.
// Edit by hand only together with tests/evidence.test.ts; never add a reference without verifying its PMID and DOI.
import type { MuscleId } from '../../domain/types';
import { L, byLang } from '../../i18n/core';

export type EvidenceLevel = 'strong' | 'moderate' | 'limited' | 'very_limited';

export interface EvidenceFinding {
  text: string;
  refIds: string[];
  /** true = based on EMG, acute, mechanistic or extrapolated data, not measured long-term growth. */
  indirect: boolean;
}

export interface MuscleEvidence {
  muscle: MuscleId;
  summary: string;
  evidenceLevel: EvidenceLevel;
  /** true when every finding for this muscle is indirect. */
  indirectOnly: boolean;
  findings: EvidenceFinding[];
  limitation?: string;
}

export const MUSCLE_EVIDENCE: Record<MuscleId, MuscleEvidence> = byLang(() => ({
  chest: {
    muscle: "chest",
    summary: L("The pectoralis major grows with presses, flys, pec deck and push-ups. At similar effort no chest exercise, and neither free weights nor machines, has clearly outperformed another.", "Большая грудная мышца растёт от жимов, разводок, пек-дека и отжиманий. При схожем усилии ни одно упражнение для груди, как и ни свободные веса, ни тренажёры, не показали явного превосходства."),
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: L("Several small long-term trials show the pectoralis major grows with barbell bench press, load-matched push-ups, dumbbell press, dumbbell fly, pec deck, machine bench press and even prolonged daily stretching. With similar effort, no chest exercise or modality has clearly outperformed another, and meta-analyses find similar growth with free weights and machines.", "Несколько небольших долгосрочных исследований показывают, что большая грудная мышца растёт от жима штанги лёжа, отжиманий с уравненной нагрузкой, жима гантелей, разводки гантелей, пек-дека, жима лёжа в тренажёре и даже от длительной ежедневной растяжки. При схожем усилии ни одно упражнение для груди и ни один вид отягощения не показали явного превосходства, а метаанализы находят схожий рост при работе со свободными весами и в тренажёрах."),
        refIds: [
          "lanza2024_bench_muscles",
          "dellavanzi2026_press_vs_fly",
          "pinto2025_pecdeck",
          "kikuchi2017_pushup",
          "hernandezbelmonte2023_freeweight_machine",
          "haugen2023_freeweight_machine",
          "heidel2022_machines_freeweights",
          "gavanda2026_elastic_bench",
          "wohlann2024_pec_stretch"
        ],
        indirect: false
      }
    ],
    limitation: L("Mostly small, short trials. Regional (upper/lower) emphasis is covered separately and never added to the chest total.", "В основном небольшие и короткие исследования. Региональный акцент (верх/низ) рассматривается отдельно и никогда не прибавляется к сумме для грудных.")
  },
  upper_chest: {
    muscle: "upper_chest",
    summary: L("Incline pressing may emphasise the upper pectoral region: one small long-term trial supports it, EMG results are mixed, and pec deck showed no regional emphasis. Plausible, not proven.", "Жимы на наклонной скамье, возможно, акцентируют верхнюю часть грудной мышцы: это подтверждает одно небольшое долгосрочное исследование, результаты ЭМГ неоднозначны, а пек-дек регионального акцента не показал. Правдоподобно, но не доказано."),
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: L("Only one long-term trial (untrained men, once weekly, angle not stated in the abstract) found incline pressing grew the upper pectoral site more than flat pressing. Pec deck grew the clavicular and sternocostal regions equally. Upper-chest emphasis from inclines is plausible, not proven.", "Только в одном долгосрочном исследовании (нетренированные мужчины, раз в неделю, угол в аннотации не указан) жим на наклонной скамье увеличил верхнюю часть грудной мышцы больше, чем жим на горизонтальной. Пек-дек одинаково увеличил ключичную и грудино-рёберную части. Акцент на верх груди от наклонных жимов правдоподобен, но не доказан."),
        refIds: [
          "chaves2020_incline",
          "pinto2025_pecdeck"
        ],
        indirect: false
      },
      {
        text: L("Acute EMG and swelling studies mostly show inclines shifting work toward the clavicular head.", "Исследования разовой нагрузки с ЭМГ и измерением отёка мышц в основном показывают, что наклон смещает работу к ключичной головке."),
        refIds: [
          "albarello2022_inclination",
          "cabral2022_hdemg_incline"
        ],
        indirect: true
      },
      {
        text: L("Any best angle comes from EMG only, and the EMG results are mixed. One study found upper-pec EMG peaked near 30 degrees. Another found no difference across the whole lift, with inclines higher only in part of it. Above about 45 degrees the anterior deltoid takes over. No hypertrophy trial compares specific angles, which supports coarse angle groups rather than per-degree coefficients.", "Вывод о лучшем угле опирается только на ЭМГ, а результаты ЭМГ неоднозначны. В одном исследовании ЭМГ верха груди достигала пика около 30 градусов. В другом различий за всё движение не нашли, а на наклонной скамье активность была выше лишь в его части. Выше примерно 45 градусов основную работу берёт на себя передняя дельта. Ни одно исследование гипертрофии не сравнивает конкретные углы, что говорит в пользу грубых групп углов, а не коэффициентов для каждого градуса."),
        refIds: [
          "rodriguezridao2020_bench_angles",
          "lauver2016_bench_angle",
          "coratella2020_press_variations"
        ],
        indirect: true
      }
    ],
    limitation: L("One long-term trial in untrained men; any best angle rests on EMG only. Display-only emphasis, never added to the chest total.", "Одно долгосрочное исследование на нетренированных мужчинах; вывод о лучшем угле опирается только на ЭМГ. Акцент только для показа, никогда не прибавляется к сумме для грудных.")
  },
  lower_chest: {
    muscle: "lower_chest",
    summary: L("No long-term trial of decline pressing or lower-chest emphasis was found. EMG suggests flat pressing already covers the lower region.", "Долгосрочных исследований жима на скамье с отрицательным наклоном или акцента на низ груди не найдено. ЭМГ указывает, что жим на горизонтальной скамье уже охватывает нижнюю часть."),
    evidenceLevel: "very_limited",
    indirectOnly: true,
    findings: [
      {
        text: L("No long-term hypertrophy trial of decline pressing or lower-chest emphasis was found. In EMG studies, sternocostal and lower-pec excitation is as high or higher on flat and decline pressing than on steep inclines, and decline did not beat flat. Flat pressing appears to cover the lower region, and decline offers no proven extra growth. EMG only.", "Долгосрочных исследований гипертрофии при жиме на скамье с отрицательным наклоном или при акценте на низ груди не найдено. В исследованиях ЭМГ возбуждение грудино-рёберной и нижней частей грудной мышцы при жиме на горизонтальной скамье и с отрицательным наклоном такое же или выше, чем на крутом наклоне, а отрицательный наклон не превзошёл горизонтальный жим. Судя по всему, жим на горизонтальной скамье охватывает нижнюю часть, а отрицательный наклон не даёт доказанного дополнительного роста. Только ЭМГ."),
        refIds: [
          "coratella2020_press_variations",
          "lauver2016_bench_angle",
          "rodriguezridao2020_bench_angles",
          "cabral2022_hdemg_incline"
        ],
        indirect: true
      }
    ],
    limitation: L("EMG only; no hypertrophy data. Display-only emphasis, never added to the chest total.", "Только ЭМГ; данных о гипертрофии нет. Акцент только для показа, никогда не прибавляется к сумме для грудных.")
  },
  lats: {
    muscle: "lats",
    summary: L("The lats grow with resistance training (one small MRI trial in novices), but no long-term trial compares pulling exercises, grips or elbow paths. Exercise-choice evidence is acute EMG only.", "Широчайшие растут от силовых тренировок (одно небольшое исследование с МРТ на новичках), но ни одно долгосрочное исследование не сравнивает тяговые упражнения, хваты или траектории локтей. Данные о выборе упражнений — только ЭМГ при разовой нагрузке."),
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: L("Direct evidence that the latissimus dorsi grows with resistance training is thin: one small 8-week trial in novices showed increases in lat cross-sectional area (MRI) and fibre size (Paoli 2016). No long-term trial compares pulling exercises, grip widths, grip orientations or elbow paths for lat growth.", "Прямых данных о том, что широчайшая мышца спины растёт от силовых тренировок, мало: одно небольшое 8-недельное исследование на новичках показало увеличение площади поперечного сечения широчайшей (МРТ) и размера волокон (Paoli 2016). Ни одно долгосрочное исследование не сравнивает тяговые упражнения, ширину хвата, ориентацию хвата или траектории локтей по росту широчайших."),
        refIds: [
          "paoli2016_latissimus"
        ],
        indirect: false
      },
      {
        text: L("Exercise-choice evidence is acute EMG only: grip-width effects are small and inconsistent (Andersen V 2014; Buonsenso 2025; Di Fonza 2026), an overhand grip gave slightly higher lat EMG than underhand in one pulldown study (Lusk 2010), pull-up and chin-up lat EMG were similar (Youdas 2010), and front pulldowns and rows with a narrower grip or less elbow flare were tied to higher lat EMG (Di Fonza 2026). No hypertrophy evidence favours one vertical pull or row over another; the 1.0 lat coefficient for these exercises is a practical estimate.", "Данные о выборе упражнений — только ЭМГ при разовой нагрузке: влияние ширины хвата невелико и непостоянно (Andersen V 2014; Buonsenso 2025; Di Fonza 2026), в одном исследовании тяги верхнего блока хват сверху дал чуть более высокую ЭМГ широчайших, чем хват снизу (Lusk 2010), ЭМГ широчайших в подтягиваниях прямым и обратным хватом была схожей (Youdas 2010), а тяги верхнего блока к груди и горизонтальные тяги с более узким хватом или меньшим разведением локтей были связаны с более высокой ЭМГ широчайших (Di Fonza 2026). Данных о гипертрофии в пользу какой-либо одной вертикальной или горизонтальной тяги нет; коэффициент 1,0 для широчайших в этих упражнениях — практическая оценка."),
        refIds: [
          "andersen2014_pulldown_grip",
          "lusk2010_pulldown_grip",
          "buonsenso2025_pulldown_variants",
          "youdas2010_pullup_chinup",
          "difonza2026_lat_emg_review",
          "vigotsky2022_emg_proxy"
        ],
        indirect: true
      }
    ],
    limitation: L("Lat coefficients for pulldowns, pull-ups and rows are practical estimates.", "Коэффициенты широчайших для тяг верхнего блока, подтягиваний и горизонтальных тяг — практические оценки.")
  },
  upper_back: {
    muscle: "upper_back",
    summary: L("No long-term size data for the rhomboids or middle trapezius were found. Rows and rear-delt-fly-like movements show high activation in EMG only.", "Долгосрочных данных о размере ромбовидных мышц или средней части трапеции не найдено. Высокую активацию в горизонтальных тягах и движениях, похожих на разводку на задние дельты, показывает только ЭМГ."),
    evidenceLevel: "very_limited",
    indirectOnly: true,
    findings: [
      {
        text: L("No long-term hypertrophy study measuring rhomboid or middle-trapezius size was found. Evidence is acute EMG only: seated rows gave the highest mid-trap/rhomboid activity among pulldowns and rows, and cueing scapular retraction did not change it (Lehman 2004); prone horizontal extension with external rotation (rear-delt-fly-like) strongly activated the middle trapezius (Ekstrom 2003); pulldown grip did not change middle-trapezius EMG (Lusk 2010; Buonsenso 2025). Coefficients for upper_back are assumptions; label as very limited evidence.", "Долгосрочных исследований гипертрофии с измерением размера ромбовидных мышц или средней части трапеции не найдено. Данные — только ЭМГ при разовой нагрузке: тяги сидя дали наибольшую активность средней части трапеции и ромбовидных среди тяг верхнего блока и горизонтальных тяг, а подсказка сводить лопатки её не изменила (Lehman 2004); горизонтальное разгибание лёжа на животе с наружной ротацией (похоже на разводку на задние дельты) сильно активировало среднюю часть трапеции (Ekstrom 2003); хват в тяге верхнего блока не менял ЭМГ средней части трапеции (Lusk 2010; Buonsenso 2025). Коэффициенты для верха спины — допущения; помечать как очень ограниченные данные."),
        refIds: [
          "lehman2004_row_pulldown",
          "ekstrom2003_trapezius_emg",
          "lusk2010_pulldown_grip",
          "buonsenso2025_pulldown_variants",
          "vigotsky2022_emg_proxy"
        ],
        indirect: true
      }
    ],
    limitation: L("EMG only; upper-back coefficients are assumptions.", "Только ЭМГ; коэффициенты для верха спины — допущения.")
  },
  traps: {
    muscle: "traps",
    summary: L("Upper-trapezius hypertrophy has been shown in small, partly clinical studies. Ranking exercises for the traps (shrugs highest) rests on EMG.", "Гипертрофия верхней части трапеции показана в небольших, отчасти клинических исследованиях. Ранжирование упражнений для трапеций (шраги — выше всех) опирается на ЭМГ."),
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: L("The upper trapezius can hypertrophy with training: fibre-level growth after 10 weeks of strength training in women (Kadi 2000) and with specific neck/shoulder strength training in women with trapezius myalgia (Andersen LL 2014), and increased ultrasound thickness of the upper trapezius in trained men on general programmes (Bartolomei 2021). These studies are small, partly clinical, and do not compare exercises. Trap coefficients are practical estimates.", "Верхняя часть трапеции способна к гипертрофии при тренировках: рост на уровне волокон после 10 недель силовых тренировок у женщин (Kadi 2000) и при специальных силовых тренировках шеи и плеч у женщин с миалгией трапециевидной мышцы (Andersen LL 2014), а также увеличение толщины верхней части трапеции по УЗИ у тренированных мужчин на общих программах (Bartolomei 2021). Эти исследования небольшие, отчасти клинические и не сравнивают упражнения. Коэффициенты трапеций — практические оценки."),
        refIds: [
          "kadi2000_trapezius",
          "andersen2014_trapezius_rct",
          "bartolomei2021_split_traps"
        ],
        indirect: false
      },
      {
        text: L("Exercise ranking rests on EMG: shrugs gave the highest upper-trap activation, with lateral raises and upright rows close behind at lighter loads (Andersen LL 2008; Ekstrom 2003).", "Ранжирование упражнений опирается на ЭМГ: шраги дали наибольшую активацию верхней части трапеции, махи в стороны и тяга к подбородку с более лёгкими весами — немного меньше (Andersen LL 2008; Ekstrom 2003)."),
        refIds: [
          "andersen2008_trapezius_emg",
          "ekstrom2003_trapezius_emg"
        ],
        indirect: true
      }
    ],
    limitation: L("Small studies that do not compare exercises; trap coefficients are practical estimates.", "Небольшие исследования, не сравнивающие упражнения; коэффициенты трапеций — практические оценки.")
  },
  front_delts: {
    muscle: "front_delts",
    summary: L("Bench pressing alone grew the anterior deltoid (MRI). Whether front-raise isolation adds growth on top of pressing is untested.", "Один только жим лёжа увеличил переднюю дельту (МРТ). Даёт ли изолированная работа — подъёмы перед собой — дополнительный рост сверх жимов, не проверялось."),
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: L("In a 10-week MRI trial, bench press alone grew the anterior deltoid more than no training, so pressing does train the front delts. A front-delt coefficient of about 0.5 for presses fits this. No trial tested whether adding front raises on top of pressing adds growth. Not prompting extra front-delt isolation when pressing volume is adequate is an inference, not a tested result.", "В 10-недельном исследовании с МРТ один только жим лёжа увеличил переднюю дельту больше, чем отсутствие тренировок, то есть жимы действительно тренируют передние дельты. Коэффициент передних дельт около 0,5 для жимов с этим согласуется. Ни одно исследование не проверяло, даёт ли добавление подъёмов перед собой к жимам дополнительный рост. Не предлагать дополнительную изолированную работу на передние дельты при достаточном объёме жимов — это умозаключение, а не проверенный результат."),
        refIds: [
          "lanza2024_bench_muscles"
        ],
        indirect: false
      },
      {
        text: L("EMG agrees that presses and horizontal-adduction movements (incline and flat) strongly activate the anterior deltoid; one study found the shoulder press highest of four exercises. A higher value for steep incline or overhead pressing rests on EMG only and is an estimate.", "ЭМГ подтверждает, что жимы и движения с горизонтальным приведением (на наклонной и горизонтальной скамье) сильно активируют переднюю дельту; в одном исследовании жим на плечи показал наибольшее значение из четырёх упражнений. Более высокое значение для жима на крутом наклоне или над головой опирается только на ЭМГ и является оценкой."),
        refIds: [
          "rabello2024_deltoid_emg_sr",
          "campos2020_deltoid_emg",
          "coratella2022_overhead_press_emg"
        ],
        indirect: true
      }
    ],
    limitation: L("One long-term trial; higher credit for steep incline or overhead pressing rests on EMG only.", "Одно долгосрочное исследование; более высокий зачёт для жима на крутом наклоне или над головой опирается только на ЭМГ.")
  },
  side_delts: {
    muscle: "side_delts",
    summary: L("Dumbbell and cable lateral raises grew the side delts similarly in one trial, and bench pressing grew them least of the muscles measured. Side-delt credit for overhead pressing is an EMG-based estimate.", "Махи в стороны с гантелями и на блоке в одном исследовании увеличили средние дельты схожим образом, а жим лёжа увеличил их меньше всех измеренных мышц. Зачёт средним дельтам за жим над головой — оценка на основе ЭМГ."),
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: L("One 8-week trial in trained lifters found dumbbell and cable lateral raises (ROM matched, sets to failure) both increased side-delt thickness by roughly 3-5%, with no meaningful difference between them. In a bench-press-only trial the side delt grew less than every other muscle measured.", "Одно 8-недельное исследование на тренированных людях показало, что махи в стороны с гантелями и на блоке (амплитуда уравнена, подходы до отказа) увеличили толщину средней дельты примерно на 3–5 %, без значимой разницы между ними. В исследовании, где выполняли только жим лёжа, средняя дельта выросла меньше любой другой измеренной мышцы."),
        refIds: [
          "larsen2025_lateral_raise",
          "lanza2024_bench_muscles"
        ],
        indirect: false
      },
      {
        text: L("Side-delt EMG during bench press and fly is very low, so chest pressing should get little or no side-delt credit. Overhead pressing shows side-delt EMG approaching lateral-raise levels, but no hypertrophy trial confirms that it grows the side delt as much, so any press credit is an estimate.", "ЭМГ средней дельты в жиме лёжа и разводке очень низкая, поэтому жимы на грудь должны давать средним дельтам малый зачёт или не давать его вовсе. В жиме над головой ЭМГ средней дельты приближается к уровню махов в стороны, но ни одно исследование гипертрофии не подтверждает, что он увеличивает среднюю дельту так же, поэтому любой зачёт за жимы — оценка."),
        refIds: [
          "lanza2024_bench_muscles",
          "campos2020_deltoid_emg",
          "coratella2020_lateral_raise_emg",
          "rabello2024_deltoid_emg_sr"
        ],
        indirect: true
      }
    ],
    limitation: L("Few long-term trials; overhead-press credit is not confirmed by hypertrophy data.", "Мало долгосрочных исследований; зачёт за жим над головой не подтверждён данными о гипертрофии.")
  },
  rear_delts: {
    muscle: "rear_delts",
    summary: L("No long-term posterior-deltoid hypertrophy trial passed our sourcing rules; all evidence is EMG.", "Ни одно долгосрочное исследование гипертрофии задней дельты не прошло наши правила отбора источников; все данные — ЭМГ."),
    evidenceLevel: "very_limited",
    indirectOnly: true,
    findings: [
      {
        text: L("No long-term hypertrophy trial of the posterior deltoid passed our sourcing rules; evidence is EMG only. A systematic review ranked pull-ups and inverted rows highest for posterior-delt activation; on a reverse fly machine a neutral grip modestly increased posterior-delt EMG versus a pronated grip. Rear-delt coefficients for rows, reverse pec deck, rear-delt flys and face pulls are practical estimates; no face-pull study passed our sourcing rules.", "Ни одно долгосрочное исследование гипертрофии задней дельты не прошло наши правила отбора источников; данные — только ЭМГ. Систематический обзор поставил подтягивания и горизонтальные подтягивания на первое место по активации задней дельты; в тренажёре для обратных разведений нейтральный хват умеренно повышал ЭМГ задней дельты по сравнению с пронированным. Коэффициенты задних дельт для горизонтальных тяг, обратной бабочки, разводок на задние дельты и тяги к лицу — практические оценки; ни одно исследование тяги к лицу не прошло наши правила отбора источников."),
        refIds: [
          "rabello2024_deltoid_emg_sr",
          "schoenfeld2013_reverse_fly_grip",
          "campos2020_deltoid_emg"
        ],
        indirect: true
      }
    ],
    limitation: L("EMG only; rear-delt coefficients for rows, reverse pec deck, rear-delt flys and face pulls are practical estimates.", "Только ЭМГ; коэффициенты задних дельт для горизонтальных тяг, обратной бабочки, разводок на задние дельты и тяги к лицу — практические оценки.")
  },
  biceps: {
    muscle: "biceps",
    summary: L("Curls reliably grow the elbow flexors. Long-muscle-length emphasis tends to help, shoulder position matters only modestly, and compound pulls give real but smaller elbow-flexor growth.", "Сгибания рук надёжно увеличивают сгибатели локтя. Акцент на большой длине мышцы, как правило, помогает, положение плеча влияет лишь умеренно, а многосуставные тяги дают реальный, но меньший рост сгибателей локтя."),
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: L("Lat-pulldown-only training grew the elbow flexors about as much as curl-only training in untrained men over 10 weeks (Gentil 2015), supporting substantial (non-zero) biceps credit for vertical pulls; the exact 0.5 value remains a practical estimate, and the result may not transfer to trained lifters.", "Тренировки с одной только тягой верхнего блока увеличили сгибатели локтя примерно так же, как тренировки с одними сгибаниями, у нетренированных мужчин за 10 недель (Gentil 2015), что поддерживает существенный (ненулевой) зачёт бицепсу за вертикальные тяги; точное значение 0,5 остаётся практической оценкой, и результат может не переноситься на тренированных людей."),
        refIds: [
          "gentil2015_mj_vs_sj"
        ],
        indirect: false
      },
      {
        text: L("EMG on whether an underhand grip adds biceps work is mixed: higher biceps EMG in chin-ups than pull-ups (Youdas 2010), but no grip effect on biceps EMG in pulldowns (Lusk 2010; Buonsenso 2025).", "Данные ЭМГ о том, добавляет ли хват снизу работу бицепсу, неоднозначны: ЭМГ бицепса выше в подтягиваниях обратным хватом, чем прямым (Youdas 2010), но в тягах верхнего блока хват на ЭМГ бицепса не влиял (Lusk 2010; Buonsenso 2025)."),
        refIds: [
          "youdas2010_pullup_chinup",
          "lusk2010_pulldown_grip",
          "buonsenso2025_pulldown_variants"
        ],
        indirect: true
      },
      {
        text: L("Curls reliably grow the elbow flexors over 5-12 weeks. Emphasis at long muscle length (elbow extended) tends to help: lengthened-range partials beat short-range partials for distal or overall elbow flexor growth (Pedrosa 2023, Sato 2021; Kassiano 2023 review). Shoulder position matters only modestly: incline curls favored the biceps somewhat and preacher curls the brachialis, with similar total elbow flexor growth (Kobayashi 2026); cable preacher vs shoulder-extended cable curls showed no significant difference (Attarieh 2025); barbell vs cable preacher curls grew the biceps similarly (Nunes 2020); an incline vs preacher trial in women found no significant between-group difference (Zabaleta-Korta 2023). Most trials are small, short and in untrained people.", "Сгибания рук надёжно увеличивают сгибатели локтя за 5–12 недель. Акцент на большой длине мышцы (локоть разогнут), как правило, помогает: частичные повторения в растянутой части амплитуды превзошли частичные в укороченной по росту дистальной части или сгибателей локтя в целом (Pedrosa 2023, Sato 2021; обзор Kassiano 2023). Положение плеча влияет лишь умеренно: сгибания на наклонной скамье несколько больше развивали бицепс, а на скамье Скотта — плечевую мышцу, при схожем общем росте сгибателей локтя (Kobayashi 2026); сгибания на блоке на скамье Скотта и сгибания на блоке с отведённым назад плечом значимо не различались (Attarieh 2025); сгибания на скамье Скотта со штангой и на блоке увеличили бицепс схожим образом (Nunes 2020); исследование на женщинах, сравнившее наклонную скамью и скамью Скотта, не нашло значимой разницы между группами (Zabaleta-Korta 2023). Большинство исследований небольшие, короткие и проведены на нетренированных людях."),
        refIds: [
          "kobayashi2026_incline_vs_preacher",
          "attarieh2025_preacher_vs_bayesian",
          "nunes2020_cable_vs_barbell_preacher",
          "pedrosa2023_arm_curl_initial_rom",
          "sato2021_elbow_angle_training",
          "kassiano2023_rom_review",
          "zabaletakorta2023_incline_vs_preacher"
        ],
        indirect: false
      },
      {
        text: L("Brachialis (tracked under biceps in the app): measured separately in only a few trials. It grew with both curl types and somewhat more with preacher (shoulder-flexed) than incline curls by MRI (Kobayashi 2026); ultrasound showed no significant difference between cable preacher and shoulder-extended cable curls (Attarieh 2025). No long-term trial isolating hammer/neutral-grip curls for the brachialis was found.", "Плечевая мышца (в приложении учитывается вместе с бицепсом): отдельно измерялась лишь в нескольких исследованиях. Она росла при обоих видах сгибаний и по МРТ несколько больше на скамье Скотта (плечо согнуто), чем на наклонной скамье (Kobayashi 2026); УЗИ не показало значимой разницы между сгибаниями на блоке на скамье Скотта и сгибаниями на блоке с отведённым назад плечом (Attarieh 2025). Долгосрочных исследований, изолирующих «молотки» / сгибания нейтральным хватом для плечевой мышцы, не найдено."),
        refIds: [
          "kobayashi2026_incline_vs_preacher",
          "attarieh2025_preacher_vs_bayesian"
        ],
        indirect: false
      },
      {
        text: L("Compound pulls grow the elbow flexors, but less than curls in a direct comparison (dumbbell rows about 5% vs curls about 11% thickness in 10 untrained men; Mannarino 2021). Adding curls/extensions to pulldowns and bench presses produced no detectable extra arm growth over 8-10 weeks in beginners or trained men (Gentil 2013; de França 2015), though those trials were small, short and one used only circumference. No biceps thickness change was detected after 24 weeks of bench press alone (Ogasawara 2012, n=7).", "Многосуставные тяги увеличивают сгибатели локтя, но в прямом сравнении меньше, чем сгибания (толщина: тяга гантели — около 5 %, сгибания — около 11 %, 10 нетренированных мужчин; Mannarino 2021). Добавление сгибаний и разгибаний к тягам верхнего блока и жимам лёжа не дало заметного дополнительного роста рук за 8–10 недель ни у новичков, ни у тренированных мужчин (Gentil 2013; de França 2015), хотя эти исследования были небольшими и короткими, а в одном измеряли только обхват. После 24 недель одного только жима лёжа изменения толщины бицепса не обнаружено (Ogasawara 2012, n=7)."),
        refIds: [
          "mannarino2021_curl_vs_row",
          "gentil2013_adding_single_joint",
          "defranca2015_single_joint_trained",
          "ogasawara2012_bench_press_arm"
        ],
        indirect: false
      },
      {
        text: L("Elbow-flexor growth showed a volume dose-response in one trained-men RCT, but moderate (12-20) and high (>20) weekly volumes did not differ in pooled data. Lengthened partials matched full ROM, and stretched-range training beat short-range partials. Reduced-set deload weeks did not blunt growth in untrained men.", "Рост сгибателей локтя показал зависимость «доза — эффект» от объёма в одном РКИ на тренированных мужчинах, но умеренный (12–20) и высокий (>20) недельный объём в объединённых данных не различались. Частичные повторения в растянутом положении дали столько же, сколько полная амплитуда, а тренировка в растянутой части амплитуды превзошла частичные повторения в укороченной. Разгрузочные недели с уменьшенным числом подходов не ослабили рост у нетренированных мужчин."),
        refIds: [
          "schoenfeld2019_volume_rct",
          "bazvalle2022_volume",
          "wolf2025_lengthened_partials",
          "kassiano2023_rom_review",
          "pancar2026_deload"
        ],
        indirect: false
      }
    ],
    limitation: L("Most trials are small, short and in untrained people. The brachialis is tracked under biceps.", "Большинство исследований небольшие, короткие и проведены на нетренированных людях. Плечевая мышца учитывается вместе с бицепсом.")
  },
  triceps: {
    muscle: "triceps",
    summary: L("Overhead elbow extensions grew the triceps about 1.4 times as much as neutral-arm extensions in one MRI trial, and pressing also grows the triceps. Volume and rest findings for the triceps are mixed.", "Разгибания рук из-за головы в одном исследовании с МРТ увеличили трицепс примерно в 1,4 раза больше, чем разгибания с опущенным плечом, и жимы тоже увеличивают трицепс. Данные об объёме и отдыхе для трицепса неоднозначны."),
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: L("Overhead (shoulder-flexed) cable elbow extensions grew the whole triceps about 1.4 times as much as neutral-arm (pushdown-like) extensions over 12 weeks, mostly via the long head, despite lighter loads (Maeo 2023, MRI). This is one well-controlled trial; it supports including an overhead extension alongside pushdowns. A mid-range partial study reported larger triceps gains than full ROM in trained men (Goto 2019, summarized in Kassiano 2023), but it is a single study with unusually large gains.", "Разгибания на блоке из-за головы (плечо согнуто) увеличили весь трицепс примерно в 1,4 раза больше, чем разгибания с опущенным плечом (как в разгибаниях на блоке вниз), за 12 недель, в основном за счёт длинной головки, несмотря на меньшие веса (Maeo 2023, МРТ). Это одно хорошо контролируемое исследование; оно говорит в пользу того, чтобы наряду с разгибаниями на блоке вниз выполнять разгибание из-за головы. В исследовании частичных повторений в средней части амплитуды у тренированных мужчин прирост трицепса был больше, чем при полной амплитуде (Goto 2019, изложено в Kassiano 2023), но это единственное исследование с необычно большим приростом."),
        refIds: [
          "maeo2023_triceps_overhead",
          "kassiano2023_rom_review",
          "goto2019_partial_rom_triceps"
        ],
        indirect: false
      },
      {
        text: L("Multi-joint pressing grows the triceps: bench press alone increased triceps thickness in untrained men (Ogasawara 2012, n=7, no control), and a multi-joint elbow-extensor exercise grew the triceps by MRI, unevenly along its length (Wakahara 2013). Adding direct arm work to a multi-joint program showed no significant extra arm circumference gain in trained men (de França 2015), an insensitive measure.", "Многосуставные жимы увеличивают трицепс: один только жим лёжа увеличил толщину трицепса у нетренированных мужчин (Ogasawara 2012, n=7, без контрольной группы), а многосуставное упражнение на разгибатели локтя увеличило трицепс по МРТ, неравномерно по его длине (Wakahara 2013). Добавление прямой работы на руки к многосуставной программе не дало значимого дополнительного прироста обхвата руки у тренированных мужчин (de França 2015); обхват — малочувствительный показатель."),
        refIds: [
          "ogasawara2012_bench_press_arm",
          "wakahara2013_nonuniform_triceps",
          "defranca2015_single_joint_trained"
        ],
        indirect: false
      },
      {
        text: L("Of the three muscles pooled by Baz-Valle 2022, only the triceps grew more with >20 than with 12-20 weekly sets (few trials), yet in one RCT higher volume did not significantly favour the elbow extensors. Lengthened partials and full ROM grew the triceps similarly, while one older study favoured mid-range partials. Longer rest showed only a non-significant trend.", "Из трёх мышц, объединённых в Baz-Valle 2022, только трицепс рос больше при >20, чем при 12–20 подходах в неделю (исследований мало), однако в одном РКИ больший объём не дал значимого преимущества разгибателям локтя. Частичные повторения в растянутом положении и полная амплитуда увеличили трицепс схожим образом, тогда как одно более старое исследование было в пользу частичных повторений в средней части амплитуды. Более длинный отдых показал лишь незначимую тенденцию."),
        refIds: [
          "bazvalle2022_volume",
          "schoenfeld2019_volume_rct",
          "wolf2025_lengthened_partials",
          "kassiano2023_rom_review",
          "schoenfeld2016_rest"
        ],
        indirect: false
      }
    ],
    limitation: L("The overhead advantage rests on one well-controlled trial; the mid-range partial result is a single study.", "Преимущество разгибаний из-за головы опирается на одно хорошо контролируемое исследование; результат по частичным повторениям в средней части амплитуды — единственное исследование.")
  },
  forearms: {
    muscle: "forearms",
    summary: L("Only one trial measured a forearm muscle (the brachioradialis grew with curls). No long-term trial of wrist curls, reverse curls or grip work was found.", "Только в одном исследовании измеряли мышцу предплечья (плечелучевая росла от сгибаний рук). Долгосрочных исследований сгибаний запястий, обратных сгибаний или работы на хват не найдено."),
    evidenceLevel: "very_limited",
    indirectOnly: false,
    findings: [
      {
        text: L("Brachioradialis (a forearm elbow flexor) grew about 13-18% by MRI after 12 weeks of dumbbell curls, somewhat more with preacher than incline curls (Kobayashi 2026). This is the only direct long-term forearm-size evidence found and covers one forearm muscle only; it gives some support for a small forearm credit from curls.", "Плечелучевая мышца (сгибатель локтя, расположенный на предплечье) выросла примерно на 13–18 % по МРТ после 12 недель сгибаний с гантелями, несколько больше на скамье Скотта, чем на наклонной скамье (Kobayashi 2026). Это единственные найденные прямые долгосрочные данные о размере предплечья, и они касаются только одной его мышцы; они дают некоторую поддержку небольшому зачёту предплечьям за сгибания рук."),
        refIds: [
          "kobayashi2026_incline_vs_preacher"
        ],
        indirect: false
      },
      {
        text: L("No long-term hypertrophy trial of the wrist flexors or extensors (wrist curls, reverse curls, grip work) in healthy adults was found among the verified sources. Forearm coefficients for wrist curls, reverse curls and carries are practical assumptions, not evidence-based.", "Среди проверенных источников не найдено долгосрочных исследований гипертрофии сгибателей или разгибателей запястья (сгибания запястий, обратные сгибания, работа на хват) у здоровых взрослых. Коэффициенты предплечий для сгибаний запястий, обратных сгибаний и переносок — практические допущения, не основанные на данных исследований."),
        refIds: [],
        indirect: true
      }
    ],
    limitation: L("Forearm coefficients for wrist curls, reverse curls and carries are practical assumptions.", "Коэффициенты предплечий для сгибаний запястий, обратных сгибаний и переносок — практические допущения.")
  },
  quads: {
    muscle: "quads",
    summary: L("The best-studied muscle. The vasti grow with squats, leg press and leg extension; the rectus femoris grows mainly with leg extension. Full depth/ROM and stopping 1-2 RIR short of failure are supported.", "Самая изученная мышца. Широкие мышцы бедра растут от приседаний, жима ногами и разгибаний ног; прямая мышца бедра — в основном от разгибаний ног. Полная глубина и амплитуда и остановка за 1–2 RIR до отказа подтверждаются данными."),
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: L("Several long-term trials (mostly untrained participants, MRI or ultrasound) show that the vasti grow with squats, leg press and leg extension. Leg press and knee extension grew the vasti about equally, while one trial found squats grew the distal vastus lateralis more than leg extension. The rectus femoris grew clearly with leg extension but little or not at all with squats or leg press. Deep squats grew the front thigh more than shallow squats in one trial and similarly in another, and pooled studies favour full ROM for lower-limb growth. Leg extensions with a reclined hip (40 deg) grew the rectus femoris more than an upright 90 deg seat.", "Несколько долгосрочных исследований (в основном нетренированные участники, МРТ или УЗИ) показывают, что широкие мышцы бедра растут от приседаний, жима ногами и разгибаний ног. Жим ногами и разгибания ног увеличили широкие мышцы примерно одинаково, а в одном исследовании приседания увеличили дистальную часть латеральной широкой мышцы больше, чем разгибания ног. Прямая мышца бедра заметно росла от разгибаний ног, но мало или совсем не росла от приседаний и жима ногами. Глубокие приседания увеличили переднюю поверхность бедра больше, чем неглубокие, в одном исследовании и схожим образом — в другом, а объединённые исследования говорят в пользу полной амплитуды для роста мышц ног. Разгибания ног с откинутой спинкой (угол в тазобедренном суставе 40°) увеличили прямую мышцу бедра больше, чем при вертикальной посадке под 90°."),
        refIds: [
          "kubo2019_squatdepth",
          "bloomquist2013_squatrom",
          "kassiano2026_squat_vs_legext",
          "kinoshita2026_legext_vs_legpress",
          "zabaleta2021_exerciseselection",
          "larsen2025_hipangle_legext",
          "pallares2021_rom"
        ],
        indirect: false
      },
      {
        text: L("Quadriceps are the best-studied muscle for general training variables: growth rose with weekly volume in trained men (Schoenfeld 2019 RCT), though 12-20 vs >20 weekly sets did not differ in pooled data (Baz-Valle 2022); stopping at 1-2 RIR matched momentary failure (Refalo 2024); 3-min rests beat 1-min rests in one RCT; full ROM or stretched-position partials beat short-length partials; rep and load progression grew the quads similarly.", "Квадрицепсы — самая изученная мышца в отношении общих тренировочных переменных: рост увеличивался с недельным объёмом у тренированных мужчин (РКИ Schoenfeld 2019), хотя 12–20 и >20 подходов в неделю в объединённых данных не различались (Baz-Valle 2022); остановка за 1–2 RIR дала столько же, сколько работа до моментального отказа (Refalo 2024); отдых 3 мин превзошёл отдых 1 мин в одном РКИ; полная амплитуда или частичные повторения в растянутом положении превзошли частичные в укороченном; прогрессия по повторениям и по весу увеличила квадрицепсы схожим образом."),
        refIds: [
          "schoenfeld2019_volume_rct",
          "bazvalle2022_volume",
          "refalo2024_failure_rct",
          "schoenfeld2016_rest",
          "kassiano2023_rom_review",
          "plotkin2022_progression"
        ],
        indirect: false
      }
    ],
    limitation: L("Mostly untrained participants and short trials.", "В основном нетренированные участники и короткие исследования.")
  },
  hamstrings: {
    muscle: "hamstrings",
    summary: L("Seated (hip-flexed) leg curls grew the hamstrings more than lying curls; squats and hip thrusts grew them little. No long-term RDL trial was found.", "Сгибания ног сидя (тазобедренный сустав согнут) увеличили бицепс бедра больше, чем сгибания лёжа; приседания и ягодичный мост увеличили его мало. Долгосрочных исследований румынской тяги не найдено."),
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: L("Seated leg curls (hip flexed) grew the hamstrings more than lying curls, mainly in the two-joint muscles. Hip-flexed eccentric curls grew them more than Nordics. A hip-extension exercise grew the biceps femoris long head more than Nordics. On MRI, squats and hip thrusts produced little or no hamstring growth, which supports giving squats no hamstring credit. No long-term trial of the Romanian deadlift itself was found.", "Сгибания ног сидя (тазобедренный сустав согнут) увеличили бицепс бедра больше, чем сгибания лёжа, в основном в двусуставных мышцах. Эксцентрические сгибания с согнутым тазобедренным суставом увеличили его больше, чем нордические сгибания. Упражнение на разгибание бедра увеличило длинную головку двуглавой мышцы бедра больше, чем нордические сгибания. По МРТ приседания и ягодичный мост дали малый рост бицепса бедра или не дали его вовсе, что поддерживает решение не давать приседаниям зачёта для бицепса бедра. Долгосрочных исследований собственно румынской тяги не найдено."),
        refIds: [
          "maeo2021_seated_vs_prone_curl",
          "maeo2024_nordic_vs_lset",
          "bourne2017_nordic_vs_hipext",
          "kubo2019_squatdepth",
          "plotkin2023_hipthrust_vs_squat"
        ],
        indirect: false
      }
    ],
    limitation: L("RDL and back-extension hamstring credit is inferred, not tested directly.", "Зачёт бицепсу бедра за румынскую тягу и гиперэкстензию выведен логически, а не проверен напрямую.")
  },
  glutes: {
    muscle: "glutes",
    summary: L("The gluteus maximus grows with many loaded hip-extension exercises. Hip thrusts and squats grew it similarly on MRI, and full squats beat half squats.", "Большая ягодичная мышца растёт от многих упражнений на разгибание бедра с отягощением. Ягодичный мост и приседания по МРТ увеличили её схожим образом, а полные приседания превзошли полуприседы."),
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: L("Gluteus maximus grows with many loaded hip-extension exercises (meta-analysis, moderate pooled effect). On MRI, hip thrusts and squats grew the glutes about equally, while one ultrasound study in trained women favoured squats. Full squats grew the glutes about three times more than half squats, and leg press grew them by about 15%.", "Большая ягодичная мышца растёт от многих упражнений на разгибание бедра с отягощением (метаанализ, умеренный объединённый эффект). По МРТ ягодичный мост и приседания увеличили ягодичные примерно одинаково, тогда как одно исследование с УЗИ на тренированных женщинах было в пользу приседаний. Полные приседания увеличили ягодичные примерно в три раза больше, чем полуприседы, а жим ногами увеличил их примерно на 15 %."),
        refIds: [
          "krauseneto2025_glutemax_ma",
          "plotkin2023_hipthrust_vs_squat",
          "barbalho2020_squat_vs_hipthrust",
          "kubo2019_squatdepth",
          "kinoshita2026_legext_vs_legpress"
        ],
        indirect: false
      },
      {
        text: L("Higher acute glute EMG during hip thrusts did not translate into more growth.", "Более высокая ЭМГ ягодичных при разовой нагрузке в ягодичном мосте не обернулась большим ростом."),
        refIds: [
          "contreras2015_hipthrust_squat_emg",
          "plotkin2023_hipthrust_vs_squat"
        ],
        indirect: true
      }
    ],
    limitation: L("Trials disagree on hip thrust vs squat (MRI vs ultrasound, untrained vs trained).", "Исследования расходятся в сравнении ягодичного моста и приседаний (МРТ и УЗИ, нетренированные и тренированные).")
  },
  calves: {
    muscle: "calves",
    summary: L("Standing calf raises grew the gastrocnemius far more than seated raises. Stretched-half partials and higher weekly volume helped in small trials.", "Подъёмы на носки стоя увеличили икроножную мышцу намного больше, чем подъёмы сидя. Частичные повторения в растянутой половине амплитуды и больший недельный объём помогли в небольших исследованиях."),
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: L("A few small trials, mostly in untrained people, suggest three things. Standing (straight-knee) calf raises grew the gastrocnemius far more than seated raises, while the soleus grew similarly in both. Partials in the stretched half grew the medial gastrocnemius more than full or top-half reps. Twelve weekly sets beat six for most calf sites over 6 weeks.", "Несколько небольших исследований, в основном на нетренированных людях, указывают на три вещи. Подъёмы на носки стоя (колено прямое) увеличили икроножную мышцу намного больше, чем подъёмы сидя, тогда как камбаловидная росла схожим образом в обоих вариантах. Частичные повторения в растянутой половине амплитуды увеличили медиальную головку икроножной больше, чем полные повторения или повторения в верхней половине. Двенадцать подходов в неделю превзошли шесть для большинства участков икр за 6 недель."),
        refIds: [
          "kinoshita2023_standing_vs_seated_calf",
          "kassiano2023_calf_lengthened",
          "kassiano2024_calf_volume"
        ],
        indirect: false
      },
      {
        text: L("Calf growth was similar with rep-based and load-based progression, and a one-week training break did not change triceps surae growth; evidence on general training variables for calves is thin.", "Рост икр был схожим при прогрессии по повторениям и по весу, а недельный перерыв в тренировках не изменил рост трёхглавой мышцы голени; данных об общих тренировочных переменных для икр мало."),
        refIds: [
          "plotkin2022_progression",
          "coleman2024_deload"
        ],
        indirect: false
      }
    ],
    limitation: L("A few small trials, mostly in untrained people.", "Несколько небольших исследований, в основном на нетренированных людях.")
  },
  abs: {
    muscle: "abs",
    summary: L("Direct long-term size evidence for the rectus abdominis is very thin. Exercise choice rests mostly on EMG, so ab targets and coefficients are practical assumptions.", "Прямых долгосрочных данных о размере прямой мышцы живота очень мало. Выбор упражнений опирается в основном на ЭМГ, поэтому цели и коэффициенты для пресса — практические допущения."),
    evidenceLevel: "very_limited",
    indirectOnly: false,
    findings: [
      {
        text: L("Direct long-term size evidence for the rectus abdominis is very thin. One RCT in older adults found 12 weeks of trunk strengthening enlarged the rectus abdominis on ultrasound. A 6-month MRI study in adolescent soccer players found that adding bodyweight stabilization work gave no extra trunk muscle growth. No trial in young trained lifters measuring rectus abdominis size after loaded crunch-type or hanging training was found.", "Прямых долгосрочных данных о размере прямой мышцы живота очень мало. Одно РКИ на пожилых людях показало, что 12 недель укрепления мышц туловища увеличили прямую мышцу живота по УЗИ. 6-месячное исследование с МРТ на футболистах-подростках показало, что добавление стабилизационных упражнений с весом тела не дало дополнительного роста мышц туловища. Исследований на молодых тренированных людях с измерением размера прямой мышцы живота после скручиваний с отягощением или упражнений в висе не найдено."),
        refIds: [
          "shahtahmassebi2019_trunk",
          "hoshikawa2013_stabilization"
        ],
        indirect: false
      },
      {
        text: L("Exercise choice rests mostly on EMG (activation, not growth), so the app's abs targets and coefficients are practical assumptions.", "Выбор упражнений опирается в основном на ЭМГ (активация, а не рост), поэтому цели и коэффициенты для пресса в приложении — практические допущения."),
        refIds: [
          "escamilla2006_abs_emg",
          "andersson1997_abs_hipflexor_emg",
          "juker1998_psoas_abwall_emg",
          "olivalozano2020_core_emg_sr"
        ],
        indirect: true
      },
      {
        text: L("Spinal flexion versus hip flexion (EMG only): hip-flexion movements (sit-ups, leg lifts) strongly recruit the hip flexors (iliacus, psoas, rectus femoris), while curl-ups keep psoas low. Abdominal activity rises as the trunk curls further but falls with increasing angle in hip-flexion sit-ups; the abs are still clearly active in hip-flexion sit-ups and two-leg lifts. This is consistent with, but does not prove, the app's choice to give full ab credit only when trunk flexion or a posterior pelvic tilt is included; no growth comparison exists.", "Сгибание позвоночника и сгибание бедра (только ЭМГ): движения со сгибанием бедра (подъёмы туловища, подъёмы ног) сильно включают сгибатели бедра (подвздошную, поясничную, прямую мышцу бедра), тогда как скручивания оставляют активность поясничной мышцы низкой. Активность мышц живота растёт по мере скручивания туловища, но падает с увеличением угла в подъёмах туловища со сгибанием бедра; при этом в подъёмах туловища со сгибанием бедра и в подъёмах двух ног пресс всё же явно активен. Это согласуется с решением приложения давать полный зачёт прессу только при сгибании туловища или заднем наклоне таза, но не доказывает его; сравнений по росту нет."),
        refIds: [
          "andersson1997_abs_hipflexor_emg",
          "juker1998_psoas_abwall_emg",
          "escamilla2006_abs_emg"
        ],
        indirect: true
      },
      {
        text: L("Do squats and deadlifts grow the abs? In acute EMG, heavy squats and deadlifts raised erector activity but not lower-abdominal or external-oblique activity, and a plank gave more rectus abdominis activity than light-to-moderate squats or presses. One systematic review found free-weight exercises among the highest for rectus abdominis EMG, so results are mixed. No long-term trial shows squats or deadlifts enlarge the rectus abdominis; a coefficient of 0 or a minor value is an assumption consistent with these indirect data.", "Увеличивают ли пресс приседания и становая тяга? В ЭМГ при разовой нагрузке тяжёлые приседания и становая тяга повышали активность разгибателей спины, но не нижней части живота и не наружной косой мышцы, а планка дала большую активность прямой мышцы живота, чем приседания или жимы с лёгким и средним весом. Один систематический обзор отнёс упражнения со свободными весами к числу дающих наибольшую ЭМГ прямой мышцы живота, так что результаты неоднозначны. Ни одно долгосрочное исследование не показывает, что приседания или становая тяга увеличивают прямую мышцу живота; коэффициент 0 или небольшое значение — допущение, согласующееся с этими косвенными данными."),
        refIds: [
          "hamlyn2007_trunk_emg",
          "comfort2011_trunk_emg",
          "olivalozano2020_core_emg_sr"
        ],
        indirect: true
      }
    ],
    limitation: L("No trial in young trained lifters measured ab size after loaded crunch-type or hanging training.", "Ни одно исследование на молодых тренированных людях не измеряло размер пресса после скручиваний с отягощением или упражнений в висе.")
  },
  spinal_erectors: {
    muscle: "spinal_erectors",
    summary: L("Long-term erector size data are scarce and mixed. Heavy lifts produce high erector EMG, but erector growth in lifters has not been demonstrated.", "Долгосрочных данных о размере разгибателей спины мало, и они неоднозначны. Тяжёлые упражнения дают высокую ЭМГ разгибателей, но рост разгибателей у тренирующихся с отягощениями не показан."),
    evidenceLevel: "very_limited",
    indirectOnly: false,
    findings: [
      {
        text: L("Long-term size data on the erector spinae and multifidus are scarce and mixed. Trunk training enlarged multifidus in older adults; a 24-week back and core program in healthy firefighters did not; in low-back-pain patients 2 months of deadlifts changed multifidus thickness no more than low-load motor-control work; in adolescents added stabilization work gave no extra erector growth on MRI. No trial in young trained lifters measured erector size after back extensions, deadlifts or squats. Erector targets are rough assumptions.", "Долгосрочных данных о размере мышцы, выпрямляющей позвоночник, и многораздельной мышцы мало, и они неоднозначны. Тренировка мышц туловища увеличила многораздельную мышцу у пожилых людей; 24-недельная программа для спины и кора у здоровых пожарных — нет; у пациентов с болью в пояснице 2 месяца становой тяги изменили толщину многораздельной мышцы не больше, чем упражнения на двигательный контроль с малой нагрузкой; у подростков добавленная стабилизационная работа не дала дополнительного роста разгибателей по МРТ. Ни одно исследование на молодых тренированных людях не измеряло размер разгибателей после гиперэкстензий, становой тяги или приседаний. Цели для разгибателей спины — грубые допущения."),
        refIds: [
          "shahtahmassebi2019_trunk",
          "mayer2015_firefighters_multifidus",
          "berglund2017_deadlift_multifidus",
          "hoshikawa2013_stabilization"
        ],
        indirect: false
      },
      {
        text: L("Heavy free-weight lifts (squats, deadlifts, front squats) produce high erector spinae EMG, often above bodyweight back and core exercises; for the multifidus the picture is mixed (higher in free weights than ball/device work in one review, highest in traditional core exercises in another). Training studies suggest compound lifts and back extensions without pelvic restraint give smaller specific lumbar-extensor adaptations than isolated lumbar extension, and RDL training did not raise isolated lumbar extension torque. Activation and strength data only; fractional erector credit for these lifts is an assumption.", "Тяжёлые упражнения со свободными весами (приседания, становая тяга, фронтальные приседания) дают высокую ЭМГ мышцы, выпрямляющей позвоночник, часто выше, чем упражнения для спины и кора с весом тела; для многораздельной мышцы картина неоднозначна (в одном обзоре выше со свободными весами, чем в упражнениях на мяче и приспособлениях, в другом — наибольшая в традиционных упражнениях для кора). Тренировочные исследования указывают, что многосуставные упражнения и гиперэкстензии без фиксации таза дают меньшие специфические адаптации разгибателей поясницы, чем изолированное разгибание поясницы, а тренировки с румынской тягой не повысили момент силы в изолированном разгибании поясницы. Только данные об активации и силе; дробный зачёт разгибателям спины за эти упражнения — допущение."),
        refIds: [
          "hamlyn2007_trunk_emg",
          "comfort2011_trunk_emg",
          "martuscello2013_core_emg_sr",
          "olivalozano2020_core_emg_sr",
          "steele2015_lumbar_extensors",
          "fisher2013_rdl_lumbar"
        ],
        indirect: true
      }
    ],
    limitation: L("Erector targets and coefficients are rough assumptions.", "Цели и коэффициенты для разгибателей спины — грубые допущения.")
  },
  adductors: {
    muscle: "adductors",
    summary: L("Adductor growth has been measured only as a secondary outcome (more with full squats, and more with squats than hip thrusts). No trial of the adduction machine was found.", "Рост приводящих измеряли только как вторичный показатель (больше при полных приседаниях и больше от приседаний, чем от ягодичного моста). Исследований тренажёра для сведения ног не найдено."),
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: L("Adductor growth has been measured only as a secondary outcome in squat, leg-press and hip-thrust trials. Adductors grew with both squat depths, significantly more with full squats; the adductor magnus grew with leg press but not with knee extension; and squats grew the adductors more than hip thrusts. No long-term trial of the hip adduction machine was found, so there is no direct evidence for adductor isolation work.", "Рост приводящих измеряли только как вторичный показатель в исследованиях приседаний, жима ногами и ягодичного моста. Приводящие росли при обеих глубинах приседа, значимо больше при полных приседаниях; большая приводящая мышца росла от жима ногами, но не от разгибаний ног; а приседания увеличили приводящие больше, чем ягодичный мост. Долгосрочных исследований тренажёра для сведения ног не найдено, поэтому прямых данных об изолированной работе на приводящие нет."),
        refIds: [
          "kubo2019_squatdepth",
          "kinoshita2026_legext_vs_legpress",
          "plotkin2023_hipthrust_vs_squat"
        ],
        indirect: false
      }
    ],
    limitation: L("No direct evidence for adductor isolation work.", "Прямых данных об изолированной работе на приводящие нет.")
  }
}));
