import { useState } from 'react';
import { useData } from '../../lib/store';
import { MUSCLE_EVIDENCE } from '../../data/scientific-evidence/muscles';
import { REFERENCE_BY_ID, REFERENCES } from '../../data/scientific-evidence/references';
import { RULES } from '../../data/scientific-evidence/rules';
import { TRACKED_MUSCLES } from '../../domain/muscles';
import { useNames } from '../hooks';
import { Badge, Callout, Card, CardTitle, cx, Page, Segmented } from '../components/ui';

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

const ALGORITHMS: { title: string; body: string[]; basis: string; status: 'evidence' | 'heuristic' | 'mixed' }[] = [
  { title: 'Fractional set counting', status: 'evidence', basis: 'Pelland 2026',
    body: ['Each working set credits each muscle once with its exercise coefficient: 1.0 direct, 0.5 significant secondary, 0.25 minor, 0 insignificant. Example: hip abduction counts 0.5 for glutes because it trains the glute medius, not the gluteus maximus.', 'Bench angle (heuristic): flat < 10°, incline 10–45° (upper-chest emphasis, front delts ≥ 0.5), steep > 45° (chest 0.75, front delts 0.75). Evidence on angle is mostly EMG plus a few training studies, so 15°, 30° and 45° get the same credit; the exact angle only keeps separate strength histories.', 'Ab straps: the knee raise with a pelvic curl (posterior pelvic tilt + spinal flexion) counts as a full ab set. A leg lift done mainly by hip flexion would train the hip flexors rather than the abs, so it is not logged as that exercise. Arms rest in the straps, so there is no forearm credit.', 'One side at a time: a left set and a right set together count as ONE set (3 left + 3 right = 3 sets), each side contributing half, so the pair counts as the average of the two sides.', 'Upper/lower chest are regional emphasis of the pectoralis major. They are tracked as a share of chest work and never added to the chest total.', 'Coefficients live in the exercise database and can be edited. All historical volume is recomputed from raw sets, so edits apply retroactively.', 'The 0.25 tier and per-exercise values are practical estimates, not activation measurements.'] },
  { title: 'Set quality (effort) — separate from muscle participation', status: 'mixed', basis: 'Refalo 2023, Robinson 2024, ACSM 2026, Pallarés 2021, Wolf 2023',
    body: ['Warm-ups: 0. RIR 0–3: 1.0. RIR 4: 0.6. RIR 5: 0.3. RIR 6–7: 0.15. RIR 8+: 0.', 'Unknown RIR: 0.75 provisional, flagged as uncertain and shown as a lighter band on the progress bars.', 'Partial ROM ×0.8, lengthened partials ×1.0, drop segments ×0.5, compromised technique ×0.7, sets under 5 reps ×0.8 (not applied to timed exercises such as planks). ROM set in the logger\'s Setup applies to every set of that exercise.', 'Per-session ceiling: within one session, a muscle\'s effective sets above ~11 count at half credit (Remmert 2025, preprint: no detectable extra growth past ~11 fractional sets per session). Tapered, never zeroed.', 'Pre-filled sets in the logger count only after you tick ✓ (or pick an RIR) — a suggestion is never counted as work.', 'Not applied: Halperin 2022 found lifters under-estimate reps in reserve by ~1 rep on average (more in sets above 12 reps). The error varies widely between people, so the app uses your reported RIR as-is rather than shifting every high-rep set down a credit tier.', 'Effective sets = coefficient × quality. Raw set counts are always shown alongside.'] },
  { title: 'Weekly targets', status: 'mixed', basis: 'ACSM 2026, Pelland 2026, Schoenfeld 2017, Baz-Valle 2022',
    body: ['Learning Mode (≈30 days): provisional reference ranges (preferred ≈10–12 effective sets for most muscles, lower for muscles with heavy indirect work; lower end 6 for large muscles because ~4 sets already give detectable growth and 5–10 is the most efficient range, Pelland 2026). Nothing is labelled lagging.', 'After calibration: the baseline is the median of your recent complete weeks. Below the reference minimum → increase gradually (≈ +2 sets or +25%). Within range and progressing → keep. Stalled with good recovery → +2. Declining → hold or reduce.', 'Upper bounds mark diminishing returns and fatigue cost, not harm.', 'During a deload block (Periodization) all targets are halved: reduced volume and effort rather than full rest (Bell 2023; Coleman 2024).', 'Confidence (low/moderate/high) rises with weeks of data, RIR completeness, progression evidence and consistency.'] },
  { title: 'Remaining sets and "today ≈ N"', status: 'heuristic', basis: 'Schoenfeld 2019 (frequency), Remmert 2025 (preprint)',
    body: ['Remaining = max(0, target − completed effective sets).', 'Today ≈ (what was left when the day started) ÷ (sessions likely left this week, including today). It is fixed for the day, so it doesn\'t shrink while you log; the chip shows what is still open ("2 more today", then "✓ today").', 'Per-session cap per muscle: at most ~60% of the weekly target (so the week is spread over ≥2 sessions, in line with ACSM 2026) and never more than 10. Whatever doesn\'t fit in the sessions left simply carries over — cramming adds fatigue with diminishing returns.', 'Muscles still recovering from an EARLIER session (more than ~6 h left on the heuristic window) show "Recovering" instead of a number. Today\'s own sets never block today. You can still train them; it is advice.', '"At risk" means reaching the target would need more than the per-session cap in the sessions left.'] },
  { title: 'Recovery estimate', status: 'heuristic', basis: 'Morán-Navarro 2017, Damas 2016',
    body: ['Counted from when that session ended — the moment you ticked its last set, else its end time, start + duration or start time (18:00 assumed if no time was recorded) — up to now. The estimate refreshes every minute and whenever you reopen the app.', 'Window from the last significant session: ≤3 effective sets 24 h, ≤6 sets 36 h, ≤9 sets 48 h, ≤12 sets 60 h, more 72 h; +12 h for a large muscle after more than 9 sets. Familiar, non-failure work largely recovers within 24–48 h, so a normal Mon/Wed/Fri full-body rhythm is not flagged.', 'Extended by ≥2 sets to failure (+12 h; failure slows recovery by roughly a day, Morán-Navarro 2017), an exercise new to you in the last 3 weeks (+12 h; repeated-bout effect, Damas 2016/2018), soreness (+12/24 h), sleep under 6 h (+12 h) and high fatigue (+12 h).', 'Statuses: Likely recovered, Recovering, Insufficient data. These are probabilities, not biology.'] },
  { title: 'How the set felt (per-set feedback)', status: 'heuristic', basis: 'Practical assumptions; RIR table from Refalo 2023, Robinson 2024',
    body: ['One tap after each set stores your answer plus three separate dimensions: effort, whether the weight was the one you meant, and technique. "Very hard, good technique" is a good set; "too heavy, technique compromised" is not the same thing.', 'A logged RIR always decides the effort credit. Without RIR, your feel gives an estimated RIR range (too easy ≈ 5+, a little easy ≈ 3–4, just right ≈ 1–3, very hard ≈ 0–1); its higher-RIR end goes through the same RIR table (5 for the open "5+"), and it is shown as an estimate. RIR itself stays empty. This can be switched off in Settings.', 'Compromised technique keeps the existing ×0.7. Pain is kept and counted by effort but never as a good-quality set. An accidental wrong weight still counts as volume by its effort, but is never used to judge strength progress.', 'Nothing is deleted: every performed set stays in your history with its feedback.'] },
  { title: 'Strength progression', status: 'mixed', basis: 'Plotkin 2022',
    body: ['Tracked per exercise × equipment instance × configuration. Different machines are never compared, and neither are different configurations of one exercise (exact bench angle, cable attachment, one side at a time, standing/seated, straight/bent legs). Entries without that information share an "unspecified" history. Variations still add to the same muscle\'s weekly volume.', 'Performance index = RIR-adjusted Epley estimate for loaded sets, or reps + RIR for bodyweight. It is only valid for comparing sessions on the same equipment.', 'Trend over the last ≤6 sessions in 8 weeks: progressing (≥ +1%/session), declining (≤ −1.5%/session), possible plateau (no new best in 2 sessions over ≥3 weeks), otherwise stable. Fewer than 3 sessions = insufficient data.', 'Only representative sets judge progress: wrong-weight, painful and broken-technique sets are shown but excluded. Plateau = no new best in the last 2 of ≥ 4 comparable sessions over ≥ 3 weeks, with sessions under high fatigue or short sleep set aside. A rep drop after clearly shorter rest is put down to rest, not load.', 'Double progression: increase load when all working sets at your working load reach the top of the rep range (with RIR or how it felt recorded) in two consecutive sessions. Exception: if every set reached the top and was clearly too light (≥ target RIR + 2, or felt "too easy"), one session is enough. Never after a session with pain. Reduce by about one step only when technique broke down on at least half the sets — never just because a set was hard. Lighter back-off sets are ignored; assistance never goes below 0. Adding reps and adding load grow muscle similarly (Plotkin 2022).'] },
  { title: 'Deload suggestion', status: 'heuristic', basis: 'Bell 2023, Coleman 2024',
    body: ['Seven independent indicators: multiple exercises declining, same performance feeling harder, elevated fatigue, short sleep, persistent soreness, volume above range for 2+ weeks, a long block with stalling.', 'A deload is suggested only when ≥3 coincide (the threshold itself is a heuristic). Never on a fixed schedule. If you start a deload block, targets halve automatically.'] },
];

export function SciencePage() {
  const [tab, setTab] = useState<'muscles' | 'rules' | 'algorithms' | 'refs'>('muscles');
  const [topic, setTopic] = useState<string>('All');
  const data = useData();
  const topics = ['All', ...Array.from(new Set(REFS.map((r) => r.topic)))];
  const refs = topic === 'All' ? REFS : REFS.filter((r) => r.topic === topic);

  return (
    <Page title="Scientific sources" subtitle="What the evidence says, how each algorithm uses it, and where the app relies on assumptions instead.">
      <Callout tone="info" title="On “heavy weight”">
        Muscles grow from hard sets taken close to failure, done consistently and progressed over time. When sets are near failure, growth is similar across roughly 5–30 reps (≈30–85% 1RM). Heavy loads mainly build maximal strength. So the app rewards effort (RIR) and progression on each machine, not absolute heaviness.
      </Callout>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'muscles', label: 'By muscle' }, { value: 'rules', label: `Rules · ${RULES.length}` }, { value: 'algorithms', label: 'Algorithms' }, { value: 'refs', label: `Sources · ${REFERENCES.length}` }]} />
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Badge tone="good">Evidence-based</Badge><Badge tone="info">Mixed</Badge><Badge tone="warn">Heuristic</Badge>
        </div>
      </div>

      {tab === 'muscles' ? <MuscleLibrary /> : tab === 'rules' ? <RuleList /> : tab === 'refs' ? <SourceList /> : tab === 'algorithms' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ALGORITHMS.map((a) => (
            <Card key={a.title}>
              <CardTitle hint={`Basis: ${a.basis}`} right={<Badge tone={a.status === 'evidence' ? 'good' : a.status === 'mixed' ? 'info' : 'warn'}>{a.status === 'evidence' ? 'Evidence-based' : a.status === 'mixed' ? 'Evidence + heuristics' : 'Heuristic'}</Badge>}>{a.title}</CardTitle>
              <ul className="space-y-1.5 text-sm leading-relaxed text-ink-700 dark:text-ink-200">
                {a.body.map((b, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-500" />{b}</li>)}
              </ul>
            </Card>
          ))}
          <Card className="lg:col-span-2">
            <CardTitle hint="These values are yours to change in Settings → Set-quality model.">Your current quality model</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs tabular-nums">
              {data.settings.quality.rirCredit.map((c, i) => <Badge key={i}>RIR {i}{i === data.settings.quality.rirCredit.length - 1 ? '+' : ''}: {c}</Badge>)}
              <Badge>unknown: {data.settings.quality.unknownRirCredit}</Badge>
              <Badge>partial: {data.settings.quality.partialRomCredit}</Badge>
              <Badge>drop: {data.settings.quality.dropSetCredit}</Badge>
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
      <Callout tone="warn">The app never recommends anabolic steroids, performance-enhancing drugs, or supplements beyond the whey and creatine you already use. Strength and volume trends are not proof of muscle growth.</Callout>
    </Page>
  );
}

const LEVEL_TONE = { strong: 'good', moderate: 'info', limited: 'warn', very_limited: 'warn' } as const;
const LEVEL_LABEL = { strong: 'Strong', moderate: 'Moderate', limited: 'Limited', very_limited: 'Very limited' } as const;

function RefLine({ id }: { id: string }) {
  const r = REFERENCE_BY_ID[id];
  if (!r) return null;
  return (
    <li className="text-[11px] leading-snug text-ink-500">
      <a href={r.url} target="_blank" rel="noreferrer noopener" className="font-medium text-accent-700 underline decoration-dotted underline-offset-2 dark:text-accent-300">{r.authors} {r.year}</a>
      {' · '}{r.journal} · {r.design.replace(/_/g, ' ')}{['emg_activation', 'acute_mps_or_damage'].includes(r.outcome) ? ' · indirect' : ''} — {r.finding}
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
                  {e.indirectOnly && <Badge tone="warn">indirect only</Badge>}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-2 px-4 pb-4 text-xs leading-relaxed text-ink-700 dark:text-ink-200">
                  {e.findings.map((f, i) => (
                    <div key={i}>
                      <p>{f.indirect && <Badge tone="warn">indirect</Badge>} {f.text}</p>
                      <ul className="mt-1 space-y-1 pl-2">{f.refIds.map((id) => <RefLine key={id} id={id} />)}</ul>
                    </div>
                  ))}
                  {e.limitation && <p className="text-ink-500"><b className="font-medium">Limitation:</b> {e.limitation}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="border-t border-ink-100 px-4 py-3 text-[11px] text-ink-500 dark:border-ink-800">Every source was checked on 2026-11-21: its PubMed ID resolves and its DOI matches Crossref. EMG and short-term (acute) studies are marked indirect: they are not proof of growth. Research is done once, during development; the app makes no network calls.</p>
    </Card>
  );
}

/** Every number the engine uses, with its basis and confidence. */
function RuleList() {
  const [open, setOpen] = useState<string | null>(null);
  const basis = { research: ['Research', 'good'], research_informed_heuristic: ['Research + judgement', 'info'], heuristic: ['Heuristic', 'warn'] } as const;
  return (
    <Card padded={false}>
      <ul className="divide-y divide-ink-100 dark:divide-ink-800">
        {RULES.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
              <span className="min-w-0 text-sm text-ink-800 dark:text-ink-100">{r.rule}</span>
              <span className="flex shrink-0 flex-col items-end gap-1"><Badge tone={basis[r.basis][1]}>{basis[r.basis][0]}</Badge><span className="text-[10px] text-ink-400">{r.confidence} confidence</span></span>
            </button>
            {open === r.id && (
              <div className="space-y-1.5 px-4 pb-4 text-xs leading-relaxed text-ink-700 dark:text-ink-200">
                <p><b className="font-medium">Value:</b> {r.value}{r.configurable ? ` · change it in ${r.configurable}` : ''}</p>
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
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sources" aria-label="Search sources" className="mb-3 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none dark:border-ink-700 dark:bg-ink-900" />
      <ul className="space-y-2">{list.map((r) => <RefLine key={r.id} id={r.id} />)}</ul>
    </Card>
  );
}
