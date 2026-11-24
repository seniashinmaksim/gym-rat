import { useState } from 'react';
import { useData } from '../../lib/store';
import { MUSCLE_EVIDENCE } from '../../data/scientific-evidence/muscles';
import { REFERENCE_BY_ID, REFERENCES } from '../../data/scientific-evidence/references';
import { RULES } from '../../data/scientific-evidence/rules';
import { TRACKED_MUSCLES } from '../../domain/muscles';
import { useNames } from '../hooks';
import { Badge, Callout, Card, CardTitle, cx, Page, Segmented } from '../components/ui';
import { byLang, L, num } from '../../i18n';

type Quality = 'umbrella' | 'meta' | 'rct' | 'consensus' | 'preprint' | 'observational';
interface Ref {
  key: string;
  cite: string;
  doi?: string;
  pmid?: string;
  topic: string;
  quality: Quality;
  finding: string;
  usedFor: string;
}

const Q_LABEL: Record<Quality, { label: string; tone: 'good' | 'info' | 'neutral' | 'warn' | 'violet' }> = {
  umbrella: { label: 'Umbrella review', tone: 'good' },
  meta: { label: 'Meta-analysis', tone: 'good' },
  rct: { label: 'RCT', tone: 'info' },
  consensus: { label: 'Expert consensus', tone: 'neutral' },
  preprint: { label: 'Preprint · not peer reviewed', tone: 'warn' },
  observational: { label: 'Observational', tone: 'neutral' },
};

/** Verified references (see docs/RESEARCH.md). Findings are paraphrased. */
const REFS: Ref[] = [
  { key: 'pelland', topic: 'Volume & frequency', quality: 'meta', doi: '10.1007/s40279-025-02344-w',
    cite: 'Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC. The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains. Sports Med 2026;56(2):481–505.',
    finding: 'Hypertrophy keeps rising with weekly sets but with diminishing returns (square-root shape, no inverted U). About 4 sets/week gives detectable growth, 5–10 is the most efficient band, and growth continues past 18 at lower efficiency. Counting indirect sets as 0.5 fit the data best. At equal volume, frequency barely affects hypertrophy but helps strength.',
    usedFor: 'Fractional set counting (direct 1.0 / indirect 0.5), reference ranges, treating weekly maximums as diminishing returns rather than harm, and not forcing a specific frequency.' },
  { key: 'acsm', topic: 'General prescription', quality: 'umbrella', doi: '10.1249/MSS.0000000000003897',
    cite: 'Currier BS, et al. (incl. Schoenfeld BJ, Phillips SM). ACSM Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. Med Sci Sports Exerc 2026;58(4):851–872.',
    finding: 'Overview of 137 systematic reviews. Hypertrophy benefits from ≥10 sets/week with a dose-response. Load did not matter across ~30–100% 1RM. Failure is not required (~2–3 RIR is sufficient). Frequency did not matter with volume equated. Rest-interval and ROM effects on hypertrophy could not be determined. Progressive overload is likely needed long term.',
    usedFor: 'Overall framing: effort-based set quality instead of "heavy only", ~10+ set reference point, progression tracking, and no mandatory training to failure.' },
  { key: 'robinson', topic: 'Proximity to failure', quality: 'meta', doi: '10.1007/s40279-024-02069-2',
    cite: 'Robinson ZP, Pelland JC, Remmert JF, Refalo MC, Jukic I, Steele J, Zourdos MC. Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions. Sports Med 2024;54(9):2209–2231.',
    finding: 'Hypertrophy increased as sets ended closer to failure, non-linearly (steepest near 0 RIR, flattening at higher RIR). Strength gains were similar across a wide RIR range. RIR was estimated from study descriptions — exploratory.',
    usedFor: 'Graded effort credit: full credit 0–3 RIR, tapering at 4–7, none at 8+.' },
  { key: 'refalo', topic: 'Proximity to failure', quality: 'meta', doi: '10.1007/s40279-022-01784-y',
    cite: 'Refalo MC, Helms ER, Trexler ET, Hamilton DL, Fyfe JJ. Influence of Resistance Training Proximity-to-Failure on Skeletal Muscle Hypertrophy: A Systematic Review with Meta-analysis. Sports Med 2023;53(3):649–665.',
    finding: 'Only a trivial advantage for set failure vs non-failure, and no significant difference for momentary failure. Getting reasonably close matters; reaching absolute failure adds little.',
    usedFor: 'Failure is never required. RIR 0–3 earns the same credit.' },
  { key: 'refalo24', topic: 'Proximity to failure', quality: 'rct', doi: '10.1080/02640414.2024.2321021',
    cite: 'Refalo MC, et al. J Sports Sci 2024;42(1):85–101.',
    finding: 'In trained lifters, each leg trained either to failure or to ~1–2 RIR gave virtually identical quadriceps growth.',
    usedFor: 'Supports full credit at 1–2 RIR.' },
  { key: 'schoen17load', topic: 'Load / rep range', quality: 'meta', doi: '10.1519/JSC.0000000000002200',
    cite: 'Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW. Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training. J Strength Cond Res 2017;31(12):3508–3523.',
    finding: 'With sets to failure, hypertrophy was similar for loads ≤60% and >60% 1RM; maximal strength favoured heavy loads.',
    usedFor: '"Heavy" is not required for growth. The app rewards effort and progression on each machine, not absolute load.' },
  { key: 'lopez', topic: 'Load / rep range', quality: 'meta', doi: '10.1249/MSS.0000000000002585',
    cite: 'Lopez P, et al. Resistance Training Load Effects on Muscle Hypertrophy and Strength Gain. Med Sci Sports Exerc 2021;53(6):1206–1216.',
    finding: 'Network meta-analysis: no hypertrophy difference between low (>15RM), moderate (9–15RM) and high (≤8RM) loads when sets went to failure. Strength favoured moderate and high loads.',
    usedFor: 'Rep ranges ~5–30 all count as productive. The default rep ranges are practical, not mandatory.' },
  { key: 'schoen16', topic: 'Load / rep range', quality: 'rct', pmid: '27928218',
    cite: 'Schoenfeld BJ, Contreras B, Vigotsky AD, Peterson M. Differential Effects of Heavy Versus Moderate Loads on Measures of Strength and Hypertrophy in Resistance-Trained Men. J Sports Sci Med 2016;15(4):715–722. (No DOI registered; verified by PMID.)',
    finding: 'With sets equated, 2–4RM sets gave more strength and 8–12RM sets gave more thigh growth.',
    usedFor: 'Very-low-rep sets (<5 reps) credited ×0.8 per set — a directional heuristic.' },
  { key: 'schoen17vol', topic: 'Volume', quality: 'meta', doi: '10.1080/02640414.2016.1210197',
    cite: 'Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly resistance training volume and increases in muscle mass. J Sports Sci 2017;35(11):1073–1082.',
    finding: 'Graded dose-response: each additional weekly set was associated with more growth; ≥10 sets/muscle/week suggested.',
    usedFor: 'Reference ranges.' },
  { key: 'baz', topic: 'Volume', quality: 'meta', doi: '10.2478/hukin-2022-0017',
    cite: 'Baz-Valle E, et al. A Systematic Review of The Effects of Different Resistance Training Volumes on Muscle Hypertrophy. J Hum Kinet 2022;81:199–210.',
    finding: 'In trained men, 12–20 vs >20 weekly sets showed no difference for quadriceps or biceps (some benefit for triceps). Small evidence base.',
    usedFor: 'Upper bounds treated as efficiency limits; individualization rather than ever-increasing volume.' },
  { key: 'freq', topic: 'Frequency', quality: 'meta', doi: '10.1080/02640414.2018.1555906',
    cite: 'Schoenfeld BJ, Grgic J, Krieger J. How many times per week should a muscle be trained to maximize muscle hypertrophy? J Sports Sci 2019;37(11):1286–1295.',
    finding: 'With volume equated, frequency had no meaningful effect on hypertrophy; higher frequency mostly helps by enabling more volume.',
    usedFor: 'No forced split. Remaining sets are spread across the sessions you are likely to have ("today ≈ N").' },
  { key: 'remmert', topic: 'Per-session volume', quality: 'preprint', doi: '10.51224/SRXIV.537',
    cite: 'Remmert JF, et al. Is There Too Much of a Good Thing? Meta-Regressions of the Effect of Per-Session Volume on Hypertrophy and Strength. SportRxiv 2025 (preprint).',
    finding: 'Per-session volume helped with diminishing returns; no detectable further hypertrophy benefit beyond ~11 fractional sets per muscle per session.',
    usedFor: 'Per-session ceiling: credit above ~11 effective sets per muscle per session is halved; "today ≈ N" is capped (≤10, ≤60% of the weekly target). Not peer reviewed.' },
  { key: 'singer', topic: 'Rest intervals', quality: 'meta', doi: '10.3389/fspor.2024.1429789',
    cite: 'Singer A, et al. Give it a rest: a systematic review with Bayesian meta-analysis on the effect of inter-set rest interval duration on muscle hypertrophy. Front Sports Act Living 2024;6:1429789.',
    finding: 'Resting more than ~60 s gave a small hypertrophy benefit; little further difference beyond ~90 s.',
    usedFor: 'Rest is recorded and analysed (rep retention by rest bucket), not prescribed rigidly. Per-exercise default rests are 60–210 s.' },
  { key: 'schoenrest', topic: 'Rest intervals', quality: 'rct', doi: '10.1519/JSC.0000000000001272',
    cite: 'Schoenfeld BJ, et al. Longer Interset Rest Periods Enhance Muscle Strength and Hypertrophy in Resistance-Trained Men. J Strength Cond Res 2016;30(7):1805–1812.',
    finding: '3-minute rest beat 1-minute rest for strength and thigh growth in trained men.',
    usedFor: 'Longer default rest for heavy compounds.' },
  { key: 'pallares', topic: 'Range of motion', quality: 'meta', doi: '10.1111/sms.14006',
    cite: 'Pallarés JG, et al. Effects of range of motion on resistance training adaptations: a systematic review and meta-analysis. Scand J Med Sci Sports 2021;31(10):1866–1881.',
    finding: 'Full ROM beat partial ROM for strength and lower-limb hypertrophy (partials not split by muscle length).',
    usedFor: 'Unspecified partials receive ×0.8 credit.' },
  { key: 'wolf', topic: 'Range of motion', quality: 'meta', doi: '10.47206/ijsc.v3i1.182',
    cite: 'Wolf M, et al. Partial vs Full Range of Motion Resistance Training: A Systematic Review and Meta-Analysis. Int J Strength Cond 2023;3(1).',
    finding: 'Overall only a trivial edge for full ROM; subgroup data suggest partials at long muscle lengths may be as good as or better than full ROM.',
    usedFor: 'Lengthened partials receive full credit (×1.0).' },
  { key: 'pedrosa', topic: 'Range of motion', quality: 'rct', doi: '10.1080/17461391.2021.1927199',
    cite: 'Pedrosa GF, et al. Partial range of motion training elicits favorable improvements in muscular adaptations when carried out at long muscle lengths. Eur J Sport Sci 2022;22(8):1250–1260.',
    finding: 'Knee-extension partials at long muscle lengths produced greater regional quadriceps growth than full ROM; short-length partials did not.',
    usedFor: 'Distinguishing lengthened from other partials.' },
  { key: 'kassiano', topic: 'Range of motion', quality: 'rct', doi: '10.1519/JSC.0000000000004460',
    cite: 'Kassiano W, et al. Greater Gastrocnemius Muscle Hypertrophy After Partial Range of Motion Training Performed at Long Muscle Lengths. J Strength Cond Res 2023;37(9):1746–1753.',
    finding: 'Calf partials at long lengths grew the medial gastrocnemius ~15% vs ~7% for full ROM and ~3% for short-length partials.',
    usedFor: 'Same as above.' },
  { key: 'maeo21', topic: 'Exercise selection', quality: 'rct', doi: '10.1249/MSS.0000000000002523',
    cite: 'Maeo S, et al. Greater Hamstrings Muscle Hypertrophy but Similar Damage Protection after Training at Long versus Short Muscle Lengths. Med Sci Sports Exerc 2021;53(4):825–837.',
    finding: 'Seated leg curls (hamstrings lengthened) beat prone leg curls for hamstring growth.',
    usedFor: 'Biomechanics notes in the exercise database.' },
  { key: 'maeo23', topic: 'Exercise selection', quality: 'rct', doi: '10.1080/17461391.2022.2100279',
    cite: 'Maeo S, et al. Triceps brachii hypertrophy is substantially greater after elbow extension training performed in the overhead versus neutral arm position. Eur J Sport Sci 2023;23(7):1240–1250.',
    finding: 'Overhead extensions gave ~1.4× the triceps growth of neutral-arm extensions, despite lighter loads.',
    usedFor: 'Biomechanics notes in the exercise database.' },
  { key: 'plotkin', topic: 'Progression', quality: 'rct', doi: '10.7717/peerj.14142',
    cite: 'Plotkin D, et al. Progressive overload without progressing load? The effects of load or repetition progression on muscular adaptations. PeerJ 2022;10:e14142.',
    finding: 'Adding reps at a fixed load and adding load at fixed reps produced similar hypertrophy.',
    usedFor: 'Double progression: add reps first, then load.' },
  { key: 'coleman', topic: 'Deloads', quality: 'rct', doi: '10.7717/peerj.16777',
    cite: 'Coleman M, et al. Gaining more from doing less? The effects of a one-week deload period during supervised resistance training on muscular adaptations. PeerJ 2024;12:e16777.',
    finding: 'A full week off midway through a 9-week program did not change hypertrophy but slightly reduced strength gains.',
    usedFor: 'Deloads are never scheduled automatically. When suggested, they reduce volume and effort rather than stopping training.' },
  { key: 'bell', topic: 'Deloads', quality: 'consensus', doi: '10.1186/s40798-023-00633-0',
    cite: 'Bell L, et al. Overview and practical recommendations on deloading: a Delphi consensus. Sports Med Open 2023;9:87.',
    finding: 'Coaches agreed deloads can be planned or autoregulated, reduce volume and/or proximity to failure, and should follow individual fatigue — no fixed interval or validated trigger.',
    usedFor: 'Deload suggestion only when several independent fatigue indicators coincide (threshold is a heuristic).' },
  { key: 'moran', topic: 'Recovery', quality: 'rct', doi: '10.1007/s00421-017-3725-7',
    cite: 'Morán-Navarro R, et al. Time course of recovery following resistance training leading or not to failure. Eur J Appl Physiol 2017;117(12):2387–2399.',
    finding: 'Training to failure slowed recovery by roughly 24–48 h compared with equal-volume non-failure sets.',
    usedFor: 'Recovery window +12 h after multiple failure sets.' },
  { key: 'damas', topic: 'Recovery', quality: 'rct', doi: '10.1113/JP272472',
    cite: 'Damas F, et al. Resistance training-induced changes in integrated myofibrillar protein synthesis are related to hypertrophy only after attenuation of muscle damage. J Physiol 2016;594(18):5209–5222.',
    finding: 'Muscle damage is highest in early sessions of new training and fades within ~3 weeks (repeated-bout effect); damage is not required for growth.',
    usedFor: 'Recovery window +12 h after an exercise that is new to you.' },
  { key: 'halperin', topic: 'RIR accuracy', quality: 'meta', doi: '10.1007/s40279-021-01559-x',
    cite: 'Halperin I, et al. Accuracy in Predicting Repetitions to Task Failure in Resistance Exercise: A Scoping Review and Exploratory Meta-analysis. Sports Med 2022;52(2):377–390.',
    finding: 'Lifters misjudged reps in reserve by about 1 rep on average, with wider errors in high-rep sets (>12) and early in a set.',
    usedFor: 'RIR is treated as an estimate. Credit stays flat across 0–3 so small errors do not change the numbers.' },
  { key: 'sodal', topic: 'Advanced techniques', quality: 'meta', doi: '10.1186/s40798-023-00620-5',
    cite: 'Sødal LK, et al. Effects of Drop Sets on Skeletal Muscle Hypertrophy: A Systematic Review and Meta-analysis. Sports Med Open 2023;9:66.',
    finding: 'Drop sets produced hypertrophy similar to traditional sets, often in less time.',
    usedFor: 'Each drop segment counts ×0.5 — a conservative heuristic, not a measured value.' },
  { key: 'morton', topic: 'Nutrition', quality: 'meta', doi: '10.1136/bjsports-2017-097608',
    cite: 'Morton RW, et al. A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength. Br J Sports Med 2018;52(6):376–384.',
    finding: 'Gains in fat-free mass plateaued around 1.6 g/kg/day total protein (95% CI up to ~2.2).',
    usedFor: 'Optional protein logging context. Your whey simply helps reach the daily total.' },
  { key: 'burke', topic: 'Nutrition', quality: 'meta', doi: '10.3390/nu15092116',
    cite: 'Burke R, et al. The Effects of Creatine Supplementation Combined with Resistance Training on Regional Measures of Muscle Hypertrophy: A Systematic Review with Meta-Analysis. Nutrients 2023;15(9):2116.',
    finding: 'Creatine plus training gave a small additional hypertrophy effect.',
    usedFor: 'Context only. You already use creatine; the app recommends no additional supplements.' },
];

const ALGORITHMS: { title: string; body: string[]; basis: string; status: 'evidence' | 'heuristic' | 'mixed' }[] = byLang(() => [
  { title: L('Fractional set counting', 'Дробный подсчёт подходов'), status: 'evidence', basis: 'Pelland 2026',
    body: [L('Each working set credits each muscle once with its exercise coefficient: 1.0 direct, 0.5 significant secondary, 0.25 minor, 0 insignificant. Example: hip abduction counts 0.5 for glutes because it trains the glute medius, not the gluteus maximus.', 'Каждый рабочий подход засчитывается каждой мышце один раз с коэффициентом упражнения: 1,0 — прямая нагрузка, 0,5 — существенная вторичная, 0,25 — небольшая, 0 — незначительная. Пример: разведение ног в тренажёре даёт ягодицам 0,5, потому что нагружает среднюю ягодичную мышцу, а не большую.'), L('Bench angle (heuristic): flat < 10°, incline 10–45° (upper-chest emphasis, front delts ≥ 0.5), steep > 45° (chest 0.75, front delts 0.75). Evidence on angle is mostly EMG plus a few training studies, so 15°, 30° and 45° get the same credit; the exact angle only keeps separate strength histories.', 'Угол скамьи (эвристика): горизонтальная < 10°, наклонная 10–45° (акцент на верх груди, передние дельты ≥ 0,5), крутой наклон > 45° (грудь 0,75, передние дельты 0,75). Данные об угле — в основном ЭМГ и несколько тренировочных исследований, поэтому 15°, 30° и 45° получают одинаковый зачёт; точный угол лишь разделяет истории силы.'), L('Ab straps: the knee raise with a pelvic curl (posterior pelvic tilt + spinal flexion) counts as a full ab set. A leg lift done mainly by hip flexion would train the hip flexors rather than the abs, so it is not logged as that exercise. Arms rest in the straps, so there is no forearm credit.', 'Петли для пресса: подъём коленей со скручиванием таза (задний наклон таза + сгибание позвоночника) считается полным подходом на пресс. Подъём ног в основном за счёт сгибания в тазобедренном суставе нагружал бы сгибатели бедра, а не пресс, поэтому как это упражнение он не записывается. Руки лежат в петлях, поэтому предплечьям ничего не засчитывается.'), L('One side at a time: a left set and a right set together count as ONE set (3 left + 3 right = 3 sets), each side contributing half, so the pair counts as the average of the two sides.', 'По одной стороне: левый и правый подходы вместе считаются за ОДИН подход (3 левых + 3 правых = 3 подхода); каждая сторона даёт половину, так что пара засчитывается как среднее двух сторон.'), L('Upper/lower chest are regional emphasis of the pectoralis major. They are tracked as a share of chest work and never added to the chest total.', 'Верх и низ груди — региональный акцент большой грудной мышцы. Они учитываются как доля работы на грудь и никогда не прибавляются к общему объёму груди.'), L('Coefficients live in the exercise database and can be edited. All historical volume is recomputed from raw sets, so edits apply retroactively.', 'Коэффициенты хранятся в базе упражнений, их можно менять. Весь прошлый объём пересчитывается из исходных подходов, поэтому правки действуют и на прошлое.'), L('The 0.25 tier and per-exercise values are practical estimates, not activation measurements.', 'Уровень 0,25 и значения по упражнениям — практические оценки, а не измерения активации.')] },
  { title: L('Set quality (effort) — separate from muscle participation', 'Качество подхода (усилие) — отдельно от участия мышц'), status: 'mixed', basis: 'Refalo 2023, Robinson 2024, ACSM 2026, Pallarés 2021, Wolf 2023',
    body: [L('Warm-ups: 0. RIR 0–3: 1.0. RIR 4: 0.6. RIR 5: 0.3. RIR 6–7: 0.15. RIR 8+: 0.', 'Разминка: 0. RIR 0–3: 1,0. RIR 4: 0,6. RIR 5: 0,3. RIR 6–7: 0,15. RIR 8+: 0.'), L('Unknown RIR: 0.75 provisional, flagged as uncertain and shown as a lighter band on the progress bars.', 'RIR неизвестен: 0,75 предварительно; помечается как неточное и показывается более светлой полосой на шкалах прогресса.'), L('Partial ROM ×0.8, lengthened partials ×1.0, drop segments ×0.5, compromised technique ×0.7, sets under 5 reps ×0.8 (not applied to timed exercises such as planks). ROM set in the logger\'s Setup applies to every set of that exercise.', 'Неполная амплитуда ×0,8, частичные в растянутом положении ×1,0, сегменты дроп-сета ×0,5, нарушенная техника ×0,7, подходы короче 5 повторений ×0,8 (не относится к упражнениям на время, например к планке). Амплитуда, заданная в настройке упражнения в журнале, действует на все его подходы.'), L('Per-session ceiling: within one session, a muscle\'s effective sets above ~11 count at half credit (Remmert 2025, preprint: no detectable extra growth past ~11 fractional sets per session). Tapered, never zeroed.', 'Потолок за тренировку: в пределах одной тренировки эффективные подходы мышцы сверх ~11 засчитываются наполовину (Remmert 2025, препринт: сверх ~11 дробных подходов за тренировку дополнительного роста не обнаружено). Зачёт снижается, но не обнуляется.'), L('Pre-filled sets in the logger count only after you tick ✓ (or pick an RIR) — a suggestion is never counted as work.', 'Заранее заполненные подходы в журнале считаются только после отметки ✓ (или выбора RIR) — предложение никогда не засчитывается как работа.'), L('Not applied: Halperin 2022 found lifters under-estimate reps in reserve by ~1 rep on average (more in sets above 12 reps). The error varies widely between people, so the app uses your reported RIR as-is rather than shifting every high-rep set down a credit tier.', 'Не применяется: по Halperin 2022, люди занижают число повторов в запасе в среднем на ~1 (сильнее в подходах длиннее 12 повторений). Ошибка сильно различается от человека к человеку, поэтому приложение берёт ваш RIR как есть, а не сдвигает каждый многоповторный подход на ступень зачёта ниже.'), L('Effective sets = coefficient × quality. Raw set counts are always shown alongside.', 'Эффективные подходы = коэффициент × качество. Исходное число подходов всегда показано рядом.')] },
  { title: L('Weekly targets', 'Недельные цели'), status: 'mixed', basis: 'ACSM 2026, Pelland 2026, Schoenfeld 2017, Baz-Valle 2022',
    body: [L('Learning Mode (≈30 days): provisional reference ranges (preferred ≈10–12 effective sets for most muscles, lower for muscles with heavy indirect work; lower end 6 for large muscles because ~4 sets already give detectable growth and 5–10 is the most efficient range, Pelland 2026). Nothing is labelled lagging.', 'Режим знакомства (≈30 дней): предварительные ориентиры (предпочтительно ≈10–12 эффективных подходов для большинства мышц, меньше — для мышц с большой косвенной нагрузкой; нижняя граница 6 для крупных мышц, потому что уже ~4 подхода дают заметный рост, а 5–10 — самый эффективный диапазон, Pelland 2026). Ни одна мышца не помечается как отстающая.'), L('After calibration: the baseline is the median of your recent complete weeks. Below the reference minimum → increase gradually (≈ +2 sets or +25%). Within range and progressing → keep. Stalled with good recovery → +2. Declining → hold or reduce.', 'После калибровки: базовый уровень — медиана ваших последних полных недель. Ниже минимального ориентира → повышать постепенно (≈ +2 подхода или +25%). В диапазоне и есть прогресс → оставить. Застой при хорошем восстановлении → +2. Спад → оставить или снизить.'), L('Upper bounds mark diminishing returns and fatigue cost, not harm.', 'Верхние границы отмечают убывающую отдачу и цену усталости, а не вред.'), L('During a deload block (Periodization) all targets are halved: reduced volume and effort rather than full rest (Bell 2023; Coleman 2024).', 'Во время блока разгрузки (Периодизация) все цели уменьшаются вдвое: меньше объём и усилие, а не полный отдых (Bell 2023; Coleman 2024).'), L('Confidence (low/moderate/high) rises with weeks of data, RIR completeness, progression evidence and consistency.', 'Уверенность (низкая/средняя/высокая) растёт с числом недель данных, полнотой RIR, данными о прогрессии и регулярностью.')] },
  { title: L('Remaining sets and "today ≈ N"', 'Оставшиеся подходы и «сегодня ≈ N»'), status: 'heuristic', basis: L('Schoenfeld 2019 (frequency), Remmert 2025 (preprint)', 'Schoenfeld 2019 (частота), Remmert 2025 (препринт)'),
    body: [L('Remaining = max(0, target − completed effective sets).', 'Осталось = max(0, цель − выполненные эффективные подходы).'), L('Today ≈ (what was left when the day started) ÷ (sessions likely left this week, including today). It is fixed for the day, so it doesn\'t shrink while you log; the chip shows what is still open ("2 more today", then "✓ today").', 'Сегодня ≈ (сколько оставалось на начало дня) ÷ (сколько тренировок, вероятно, осталось на этой неделе, включая сегодняшнюю). Значение фиксируется на день и не уменьшается, пока вы записываете подходы; метка показывает, что ещё не сделано («ещё 2 сегодня», затем «✓ сегодня»).'), L('Per-session cap per muscle: at most ~60% of the weekly target (so the week is spread over ≥2 sessions, in line with ACSM 2026) and never more than 10. Whatever doesn\'t fit in the sessions left simply carries over — cramming adds fatigue with diminishing returns.', 'Предел на мышцу за тренировку: не больше ~60% недельной цели (чтобы неделя делилась минимум на 2 тренировки, как в ACSM 2026) и не больше 10. Что не помещается в оставшиеся тренировки, просто переносится — попытка втиснуть всё добавляет усталость при убывающей отдаче.'), L('Muscles still recovering from an EARLIER session (more than ~6 h left on the heuristic window) show "Recovering" instead of a number. Today\'s own sets never block today. You can still train them; it is advice.', 'Мышцы, которые ещё восстанавливаются после БОЛЕЕ РАННЕЙ тренировки (по эвристическому окну осталось больше ~6 ч), показывают «Восстанавливается» вместо числа. Сегодняшние подходы никогда не блокируют сегодняшний день. Тренировать их всё равно можно — это совет.'), L('"At risk" means reaching the target would need more than the per-session cap in the sessions left.', '«Под угрозой» значит: чтобы достичь цели, в оставшихся тренировках понадобилось бы больше предела на тренировку.')] },
  { title: L('Recovery estimate', 'Оценка восстановления'), status: 'heuristic', basis: 'Morán-Navarro 2017, Damas 2016',
    body: [L('Counted from when that session ended — the moment you ticked its last set, else its end time, start + duration or start time (18:00 assumed if no time was recorded) — up to now. The estimate refreshes every minute and whenever you reopen the app.', 'Отсчёт идёт от конца той тренировки — момента отметки последнего подхода, иначе времени окончания, начала + длительности или времени начала (если время не записано, принимается 18:00) — и до текущего момента. Оценка обновляется каждую минуту и при каждом открытии приложения.'), L('Window from the last significant session: ≤3 effective sets 24 h, ≤6 sets 36 h, ≤9 sets 48 h, ≤12 sets 60 h, more 72 h; +12 h for a large muscle after more than 9 sets. Familiar, non-failure work largely recovers within 24–48 h, so a normal Mon/Wed/Fri full-body rhythm is not flagged.', 'Окно от последней значимой тренировки: ≤3 эффективных подходов — 24 ч, ≤6 — 36 ч, ≤9 — 48 ч, ≤12 — 60 ч, больше — 72 ч; +12 ч для крупной мышцы после более чем 9 подходов. Привычная работа без отказа в основном восстанавливается за 24–48 ч, поэтому обычный ритм «пн/ср/пт на всё тело» не отмечается.'), L('Extended by ≥2 sets to failure (+12 h; failure slows recovery by roughly a day, Morán-Navarro 2017), an exercise new to you in the last 3 weeks (+12 h; repeated-bout effect, Damas 2016/2018), soreness (+12/24 h), sleep under 6 h (+12 h) and high fatigue (+12 h).', 'Окно удлиняют: ≥2 подхода до отказа (+12 ч; отказ замедляет восстановление примерно на сутки, Morán-Navarro 2017), упражнение, новое для вас в последние 3 недели (+12 ч; эффект повторной нагрузки, Damas 2016/2018), боль в мышцах (+12/24 ч), сон меньше 6 ч (+12 ч) и сильная усталость (+12 ч).'), L('Statuses: Likely recovered, Recovering, Insufficient data. These are probabilities, not biology.', 'Статусы: «Вероятно, восстановилась», «Восстанавливается», «Недостаточно данных». Это вероятности, а не биология.')] },
  { title: L('How the set felt (per-set feedback)', 'Как ощущался подход (оценка каждого подхода)'), status: 'heuristic', basis: L('Practical assumptions; RIR table from Refalo 2023, Robinson 2024', 'Практические допущения; таблица RIR — по Refalo 2023, Robinson 2024'),
    body: [L('One tap after each set stores your answer plus three separate dimensions: effort, whether the weight was the one you meant, and technique. "Very hard, good technique" is a good set; "too heavy, technique compromised" is not the same thing.', 'Одно нажатие после подхода сохраняет ваш ответ и три отдельных измерения: усилие, был ли вес тем, который вы задумали, и технику. «Очень тяжело, техника хорошая» — хороший подход; «слишком тяжело, техника нарушена» — не то же самое.'), L('A logged RIR always decides the effort credit. Without RIR, your feel gives an estimated RIR range (too easy ≈ 5+, a little easy ≈ 3–4, just right ≈ 1–3, very hard ≈ 0–1); its higher-RIR end goes through the same RIR table (5 for the open "5+"), and it is shown as an estimate. RIR itself stays empty. This can be switched off in Settings.', 'Записанный RIR всегда определяет зачёт за усилие. Без RIR ощущение даёт оценку диапазона RIR (слишком легко ≈ 5+, немного легко ≈ 3–4, в самый раз ≈ 1–3, очень тяжело ≈ 0–1); его граница с бóльшим RIR проходит через ту же таблицу RIR (для открытого «5+» берётся 5), и результат показывается как оценка. Сам RIR остаётся пустым. Это можно отключить в настройках.'), L('Compromised technique keeps the existing ×0.7. Pain is kept and counted by effort but never as a good-quality set. An accidental wrong weight still counts as volume by its effort, but is never used to judge strength progress.', 'Нарушенная техника сохраняет прежний множитель ×0,7. Подход с болью остаётся и засчитывается по усилию, но никогда не считается качественным. Случайно взятый не тот вес всё равно идёт в объём по усилию, но никогда не используется для оценки прогресса в силе.'), L('Nothing is deleted: every performed set stays in your history with its feedback.', 'Ничего не удаляется: каждый выполненный подход остаётся в истории вместе с оценкой.')] },
  { title: L('Strength progression', 'Прогрессия силы'), status: 'mixed', basis: 'Plotkin 2022',
    body: [L('Tracked per exercise × equipment instance × configuration. Different machines are never compared, and neither are different configurations of one exercise (exact bench angle, cable attachment, one side at a time, standing/seated, straight/bent legs). Entries without that information share an "unspecified" history. Variations still add to the same muscle\'s weekly volume.', 'Ведётся отдельно для каждого сочетания упражнение × тренажёр × конфигурация. Разные тренажёры никогда не сравниваются, как и разные конфигурации одного упражнения (точный угол скамьи, рукоять блока, по одной стороне, стоя/сидя, прямые/согнутые ноги). Записи без этих сведений делят общую историю «не указано». Варианты при этом идут в недельный объём той же мышцы.'), L('Performance index = RIR-adjusted Epley estimate for loaded sets, or reps + RIR for bodyweight. It is only valid for comparing sessions on the same equipment.', 'Индекс результата = оценка по Эпли с поправкой на RIR для подходов с весом или повторения + RIR для упражнений с собственным весом. Он годится только для сравнения тренировок на одном и том же оборудовании.'), L('Trend over the last ≤6 sessions in 8 weeks: progressing (≥ +1%/session), declining (≤ −1.5%/session), possible plateau (no new best in 2 sessions over ≥3 weeks), otherwise stable. Fewer than 3 sessions = insufficient data.', 'Тренд за последние ≤6 тренировок в пределах 8 недель: рост (≥ +1%/тренировку), спад (≤ −1,5%/тренировку), возможное плато (нет нового рекорда за 2 тренировки на протяжении ≥3 недель), иначе стабильно. Меньше 3 тренировок = недостаточно данных.'), L('Only representative sets judge progress: wrong-weight, painful and broken-technique sets are shown but excluded. Plateau = no new best in the last 2 of ≥ 4 comparable sessions over ≥ 3 weeks, with sessions under high fatigue or short sleep set aside. A rep drop after clearly shorter rest is put down to rest, not load.', 'Прогресс оценивают только показательные подходы: подходы не с тем весом, с болью и с нарушенной техникой показываются, но не учитываются. Плато = нет нового рекорда в последних 2 из ≥ 4 сопоставимых тренировок за ≥ 3 недели; тренировки при сильной усталости или коротком сне не учитываются. Падение повторений после заметно более короткого отдыха объясняется отдыхом, а не весом.'), L('Double progression: increase load when all working sets at your working load reach the top of the rep range (with RIR or how it felt recorded) in two consecutive sessions. Exception: if every set reached the top and was clearly too light (≥ target RIR + 2, or felt "too easy"), one session is enough. Never after a session with pain. Reduce by about one step only when technique broke down on at least half the sets — never just because a set was hard. Lighter back-off sets are ignored; assistance never goes below 0. Adding reps and adding load grow muscle similarly (Plotkin 2022).', 'Двойная прогрессия: повышайте вес, когда все рабочие подходы с рабочим весом достигают верха диапазона повторений (с записанным RIR или ощущением) на двух тренировках подряд. Исключение: если каждый подход достиг верха и был явно слишком лёгким (≥ целевой RIR + 2 или ощущался «слишком легко»), достаточно одной тренировки. Никогда — после тренировки с болью. Снижать примерно на один шаг только тогда, когда техника нарушилась хотя бы в половине подходов, — и никогда лишь потому, что подход был тяжёлым. Более лёгкие подходы после основных не учитываются; помощь в гравитроне не опускается ниже 0. Добавление повторений и добавление веса растят мышцы примерно одинаково (Plotkin 2022).')] },
  { title: L('Deload suggestion', 'Предложение разгрузки'), status: 'heuristic', basis: 'Bell 2023, Coleman 2024',
    body: [L('Seven independent indicators: multiple exercises declining, same performance feeling harder, elevated fatigue, short sleep, persistent soreness, volume above range for 2+ weeks, a long block with stalling.', 'Семь независимых признаков: спад в нескольких упражнениях, тот же результат даётся тяжелее, повышенная усталость, короткий сон, стойкая боль в мышцах, объём выше диапазона 2+ недели, долгий блок с застоем.'), L('A deload is suggested only when ≥3 coincide (the threshold itself is a heuristic). Never on a fixed schedule. If you start a deload block, targets halve automatically.', 'Разгрузка предлагается, только когда совпадают ≥3 признака (сам порог — эвристика). Никогда — по фиксированному расписанию. Если вы начинаете блок разгрузки, цели автоматически уменьшаются вдвое.')] },
]);

export function SciencePage() {
  const [tab, setTab] = useState<'muscles' | 'rules' | 'algorithms' | 'refs'>('muscles');
  const [topic, setTopic] = useState<string>('All');
  const data = useData();
  const topics = ['All', ...Array.from(new Set(REFS.map((r) => r.topic)))];
  const refs = topic === 'All' ? REFS : REFS.filter((r) => r.topic === topic);

  return (
    <Page title={L('Scientific sources', 'Научные источники')} subtitle={L('What the evidence says, how each algorithm uses it, and where the app relies on assumptions instead.', 'Что говорят исследования, как их использует каждый алгоритм и где приложение опирается на допущения.')}>
      <Callout tone="info" title={L('On “heavy weight”', 'О «тяжёлом весе»')}>
        {L('Muscles grow from hard sets taken close to failure, done consistently and progressed over time. When sets are near failure, growth is similar across roughly 5–30 reps (≈30–85% 1RM). Heavy loads mainly build maximal strength. So the app rewards effort (RIR) and progression on each machine, not absolute heaviness.', 'Мышцы растут от тяжёлых подходов, доведённых близко к отказу, — при регулярности и прогрессии со временем. Когда подходы близки к отказу, рост сходен примерно в диапазоне 5–30 повторений (≈30–85% 1RM). Большие веса в основном развивают максимальную силу. Поэтому приложение оценивает усилие (RIR) и прогрессию на каждом тренажёре, а не абсолютный вес.')}
      </Callout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'muscles', label: L('By muscle', 'По мышцам') }, { value: 'rules', label: L(`Rules · ${RULES.length}`, `Правила · ${RULES.length}`) }, { value: 'algorithms', label: L('Algorithms', 'Алгоритмы') }, { value: 'refs', label: L(`Sources · ${REFERENCES.length}`, `Источники · ${REFERENCES.length}`) }]} />
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Badge tone="good">{L('Evidence-based', 'По исследованиям')}</Badge><Badge tone="info">{L('Mixed', 'Смешанное')}</Badge><Badge tone="warn">{L('Heuristic', 'Эвристика')}</Badge>
        </div>
      </div>

      {tab === 'muscles' ? <MuscleLibrary /> : tab === 'rules' ? <RuleList /> : tab === 'refs' ? <SourceList /> : tab === 'algorithms' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ALGORITHMS.map((a) => (
            <Card key={a.title}>
              <CardTitle hint={L(`Basis: ${a.basis}`, `Основание: ${a.basis}`)} right={<Badge tone={a.status === 'evidence' ? 'good' : a.status === 'mixed' ? 'info' : 'warn'}>{a.status === 'evidence' ? L('Evidence-based', 'По исследованиям') : a.status === 'mixed' ? L('Evidence + heuristics', 'Исследования + эвристики') : L('Heuristic', 'Эвристика')}</Badge>}>{a.title}</CardTitle>
              <ul className="space-y-1.5 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                {a.body.map((b, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-500" />{b}</li>)}
              </ul>
            </Card>
          ))}
          <Card className="lg:col-span-2">
            <CardTitle hint={L('These values are yours to change in Settings → Set-quality model.', 'Эти значения можно изменить: Настройки → Модель качества подходов.')}>{L('Your current quality model', 'Ваша текущая модель качества')}</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs tabular-nums">
              {data.settings.quality.rirCredit.map((c, i) => <Badge key={i}>RIR {i}{i === data.settings.quality.rirCredit.length - 1 ? '+' : ''}: {num(c)}</Badge>)}
              <Badge>{L('unknown', 'неизвестен')}: {num(data.settings.quality.unknownRirCredit)}</Badge>
              <Badge>{L('partial', 'неполная')}: {num(data.settings.quality.partialRomCredit)}</Badge>
              <Badge>{L('drop', 'дроп')}: {num(data.settings.quality.dropSetCredit)}</Badge>
            </div>
          </Card>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <button key={t} type="button" onClick={() => setTopic(t)} className={cx('rounded-full px-3 py-1 text-xs font-medium transition', topic === t ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{t}</button>
            ))}
          </div>
          <div className="space-y-3">
            {refs.map((r) => (
              <Card key={r.key}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={Q_LABEL[r.quality].tone}>{Q_LABEL[r.quality].label}</Badge>
                  <Badge>{r.topic}</Badge>
                </div>
                <p className="mt-2 text-sm font-medium leading-snug text-ink-900 dark:text-white">{r.cite}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">{r.finding}</p>
                <p className="mt-2 rounded-xl bg-ink-50 px-3 py-2 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300"><b className="text-ink-800 dark:text-ink-100">In this app:</b> {r.usedFor}</p>
                <div className="mt-2 text-xs">
                  {r.doi ? <a className="font-mono text-accent-600 hover:underline dark:text-accent-400" href={`https://doi.org/${r.doi}`} target="_blank" rel="noopener noreferrer">doi:{r.doi}</a>
                    : r.pmid ? <a className="font-mono text-accent-600 hover:underline dark:text-accent-400" href={`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`} target="_blank" rel="noopener noreferrer">PMID {r.pmid}</a> : null}
                </div>
              </Card>
            ))}
          </div>
          <p className="text-xs text-ink-500">All references were checked for title, authors, journal, year and a resolving DOI (docs/RESEARCH.md). Findings are paraphrased summaries; read the papers for detail.</p>
        </>
      )}
      <Callout tone="warn">{L('The app never recommends anabolic steroids, performance-enhancing drugs, or supplements beyond the whey and creatine you already use. Strength and volume trends are not proof of muscle growth.', 'Приложение никогда не рекомендует анаболические стероиды, допинг и добавки сверх сывороточного протеина и креатина, которые вы уже принимаете. Тренды силы и объёма не доказывают рост мышц.')}</Callout>
    </Page>
  );
}

const LEVEL_TONE = { strong: 'good', moderate: 'info', limited: 'warn', very_limited: 'warn' } as const;
const LEVEL_LABEL: Record<keyof typeof LEVEL_TONE, string> = byLang(() => ({ strong: L('Strong', 'Сильные'), moderate: L('Moderate', 'Умеренные'), limited: L('Limited', 'Ограниченные'), very_limited: L('Very limited', 'Очень ограниченные') }));

/** Study design as shown in a source line (the stored value stays the enum). */
function designLabel(design: string): string {
  const en = design.replace(/_/g, ' ');
  const ru: Record<string, string> = {
    meta_analysis: 'метаанализ', systematic_review: 'систематический обзор', rct: 'РКИ', longitudinal_trial: 'длительное исследование',
    narrative_review: 'обзор литературы', cross_sectional: 'поперечное исследование', acute_emg: 'разовое ЭМГ-исследование', acute_other: 'разовое исследование',
    position_stand: 'официальная позиция',
  };
  return L(en, ru[design] ?? en);
}

function confidenceLabel(c: 'high' | 'moderate' | 'low'): string {
  return L(`${c} confidence`, `уверенность: ${{ high: 'высокая', moderate: 'средняя', low: 'низкая' }[c]}`);
}

function RefLine({ id }: { id: string }) {
  const r = REFERENCE_BY_ID[id];
  if (!r) return null;
  return (
    <li className="text-[11px] leading-snug text-ink-500">
      <a href={r.url} target="_blank" rel="noreferrer noopener" className="font-medium text-accent-700 underline decoration-dotted underline-offset-2 dark:text-accent-300">{r.authors} {r.year}</a>
      {' · '}{r.journal} · {designLabel(r.design)}{['emg_activation', 'acute_mps_or_damage'].includes(r.outcome) ? L(' · indirect', ' · косвенно') : ''} — {r.finding}
    </li>
  );
}

/** Verified evidence per tracked muscle (src/data/scientific-evidence). Collapsed by default. */
function MuscleLibrary() {
  const names = useNames();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card padded={false}>
      <ul className="divide-y divide-ink-100 dark:divide-ink-800">
        {TRACKED_MUSCLES.map((m) => {
          const e = MUSCLE_EVIDENCE[m];
          if (!e) return null;
          const isOpen = open === m;
          return (
            <li key={m}>
              <button type="button" onClick={() => setOpen(isOpen ? null : m)} aria-expanded={isOpen} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink-900 dark:text-white">{names.muscle(m)}</span>
                  <span className="block truncate text-xs text-ink-500">{e.summary}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge tone={LEVEL_TONE[e.evidenceLevel]}>{LEVEL_LABEL[e.evidenceLevel]}</Badge>
                  {e.indirectOnly && <Badge tone="warn">{L('indirect only', 'только косвенные')}</Badge>}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-2 px-4 pb-4 text-xs leading-relaxed text-ink-700 dark:text-ink-200">
                  {e.findings.map((f, i) => (
                    <div key={i}>
                      <p>{f.indirect && <Badge tone="warn">{L('indirect', 'косвенно')}</Badge>} {f.text}</p>
                      <ul className="mt-1 space-y-1 pl-2">{f.refIds.map((id) => <RefLine key={id} id={id} />)}</ul>
                    </div>
                  ))}
                  {e.limitation && <p className="text-ink-500"><b className="font-medium">{L('Limitation:', 'Ограничение:')}</b> {e.limitation}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-ink-100 px-4 py-3 text-[11px] text-ink-500 dark:border-ink-800">{L('Every source was checked on 2026-11-21: its PubMed ID resolves and its DOI matches Crossref. EMG and short-term (acute) studies are marked indirect: they are not proof of growth. Research is done once, during development; the app makes no network calls.', 'Каждый источник проверен 21.11.2026: его PubMed ID находится, а DOI совпадает с Crossref. ЭМГ и краткосрочные (разовые) исследования помечены как косвенные: они не доказывают рост. Поиск исследований выполняется один раз, при разработке; приложение не делает сетевых запросов.')}</p>
    </Card>
  );
}

/** Every number the engine uses, with its basis and confidence. */
function RuleList() {
  const [open, setOpen] = useState<string | null>(null);
  const basis = { research: [L('Research', 'Исследования'), 'good'], research_informed_heuristic: [L('Research + judgement', 'Исследования + оценка'), 'info'], heuristic: [L('Heuristic', 'Эвристика'), 'warn'] } as const;
  return (
    <Card padded={false}>
      <ul className="divide-y divide-ink-100 dark:divide-ink-800">
        {RULES.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
              <span className="min-w-0 text-sm text-ink-800 dark:text-ink-100">{r.rule}</span>
              <span className="flex shrink-0 flex-col items-end gap-1"><Badge tone={basis[r.basis][1]}>{basis[r.basis][0]}</Badge><span className="text-[10px] text-ink-400">{confidenceLabel(r.confidence)}</span></span>
            </button>
            {open === r.id && (
              <div className="space-y-1.5 px-4 pb-4 text-xs leading-relaxed text-ink-700 dark:text-ink-200">
                <p><b className="font-medium">{L('Value:', 'Значение:')}</b> {r.value}{r.configurable ? L(` · change it in ${r.configurable}`, ` · изменить: ${r.configurable}`) : ''}</p>
                <p>{r.rationale}</p>
                {r.refIds.length > 0 && <ul className="space-y-1 pl-2">{r.refIds.map((id) => <RefLine key={id} id={id} />)}</ul>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** All verified sources, newest first. */
function SourceList() {
  const [q, setQ] = useState('');
  const list = [...REFERENCES].sort((a, b) => b.year - a.year).filter((r) => !q.trim() || `${r.title} ${r.authors} ${r.finding}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Card>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Search sources', 'Поиск по источникам')} aria-label={L('Search sources', 'Поиск по источникам')} className="mb-3 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none dark:border-ink-700 dark:bg-ink-900" />
      <ul className="space-y-2">{list.map((r) => <RefLine key={r.id} id={r.id} />)}</ul>
    </Card>
  );
}
