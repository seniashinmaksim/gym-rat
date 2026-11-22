/**
 * Rule registry: every numeric adjustment the analytics and prescription engines make, with its
 * rationale, basis (research-derived vs practical heuristic), confidence, where it is configured and
 * which verified references support it. Nothing here is personal data.
 *
 * Principles (SCIENTIFIC_METHOD.md): one transparent model — coefficient × set quality, with a
 * per-session taper. Adjustments are not stacked arbitrarily; each set credits each muscle once.
 * Where evidence is weak, a rule is an explanatory note or a heuristic, never presented as a finding.
 */
export type RuleBasis = 'research' | 'research_informed_heuristic' | 'heuristic';
export type RuleArea = 'volume' | 'effort' | 'exercise' | 'session' | 'recovery' | 'progression' | 'prescription' | 'execution' | 'choice' | 'planner';

export interface Rule {
  id: string;
  area: RuleArea;
  /** What the engine does, in one sentence. */
  rule: string;
  /** Default value(s) as used by the code. */
  value: string;
  rationale: string;
  basis: RuleBasis;
  confidence: 'high' | 'moderate' | 'low';
  /** Settings path when the owner can change it, else null. */
  configurable: string | null;
  /** Ids in REFERENCES (src/data/scientific-evidence/references.ts). Empty only for heuristics. */
  refIds: string[];
  /** Source file implementing it (for audits). */
  implementedIn: string;
}

export const RULES: Rule[] = [
  // ---- Volume
  {
    id: 'fractional_coefficients', area: 'volume',
    rule: 'Each set credits every muscle once by a coefficient: 1 direct, 0.5 significant secondary, 0.25 minor, 0 none.',
    value: '1 / 0.5 / 0.25 / 0', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: 'Exercise database → coefficients',
    rationale: 'Fractional counting of indirect sets predicts growth better than counting only direct sets or counting indirect sets fully; the exact coefficient per exercise is a practical estimate, not a measurement.',
    refIds: ['pelland2026_volume_frequency', 'gentil2015_mj_vs_sj', 'mannarino2021_curl_vs_row', 'lanza2024_bench_muscles'], implementedIn: 'src/domain/volume.ts, src/data/exercises.ts',
  },
  {
    id: 'weekly_target_reference', area: 'volume',
    rule: 'Weekly reference ≈ 10–12 effective sets per muscle (lower end 6 for large muscles); upper bounds mark diminishing returns, not harm.',
    value: 'preferred ≈ 10–12, min 6', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: 'Muscles → target per muscle',
    rationale: 'Dose–response with diminishing returns; a reference, not a quota. Personal baseline replaces it after Learning Mode.',
    refIds: ['schoenfeld2017_volume', 'pelland2026_volume_frequency', 'bazvalle2022_volume', 'currier2026_acsm_position'], implementedIn: 'src/domain/targets.ts, src/domain/muscles.ts',
  },
  {
    id: 'regional_emphasis_not_added', area: 'volume',
    rule: 'Upper/lower chest are tracked as shares of chest work and never added to the chest total.',
    value: 'share only', basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: 'Regional hypertrophy differences with bench angle are small and inconsistent; avoids double counting.',
    refIds: ['chaves2020_incline', 'varovic2025_muscle_length'], implementedIn: 'src/domain/registry.ts, src/domain/volume.ts',
  },
  // ---- Effort
  {
    id: 'rir_credit_table', area: 'effort',
    rule: 'Set credit by reps in reserve: 0–3 → 1.0, 4 → 0.6, 5 → 0.3, 6–7 → 0.15, ≥ 8 → 0.',
    value: '[1,1,1,1,0.6,0.3,0.15,0.15,0]', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: 'Settings → Set-quality model',
    rationale: 'Hypertrophy is similar from failure to a few reps short, and declines further from failure; the exact steps beyond 3 RIR are a practical interpolation.',
    refIds: ['refalo2023_failure_meta', 'robinson2024_proximity_failure', 'refalo2024_failure_rct'], implementedIn: 'src/domain/quality.ts',
  },
  {
    id: 'failure_no_bonus', area: 'effort',
    rule: 'Reaching muscular failure earns no extra credit over 1–3 RIR; a failure answer without RIR is treated like RIR 0 (estimate). A set that ended because form broke (technical failure) is counted as compromised technique.',
    value: 'failure = RIR 0 band (credit 1.0); technical failure ×0.7', basis: 'research', confidence: 'moderate', configurable: null,
    rationale: 'Pooled evidence does not show failure training to be superior for hypertrophy to stopping slightly short; technique breakdown changes what the target muscle was loaded with.',
    refIds: ['refalo2023_failure_meta', 'refalo2024_failure_rct', 'robinson2024_proximity_failure', 'hermann2025_single_set_failure'], implementedIn: 'src/domain/quality.ts, src/domain/failure.ts',
  },
  {
    id: 'unknown_effort', area: 'effort',
    rule: 'No RIR, feel or failure answer → provisional credit 0.75 (shown as uncertain).',
    value: '0.75', basis: 'heuristic', confidence: 'low', configurable: 'Settings → Set-quality model',
    rationale: 'Working sets are usually reasonably hard, but without information full credit would overstate effort.', refIds: [], implementedIn: 'src/domain/quality.ts',
  },
  {
    id: 'feel_estimated_rir', area: 'effort',
    rule: 'Without RIR, "how did it feel" gives an estimated RIR range whose higher-RIR end goes through the RIR table; labelled an estimate.',
    value: 'very easy 5+, easy 3–4, appropriate 1–3, hard 1–2, near max 0–1', basis: 'heuristic', confidence: 'low', configurable: 'Settings → use feel when no RIR',
    rationale: 'Self-rated effort is imprecise, especially far from failure; the conservative end avoids overstating credit.', refIds: ['halperin2022_rir_accuracy'], implementedIn: 'src/domain/feedback.ts',
  },
  {
    id: 'compromised_technique', area: 'effort',
    rule: 'Compromised technique → ×0.7; pain → kept but flagged uncertain, never "good quality".',
    value: '×0.7', basis: 'heuristic', confidence: 'low', configurable: 'Settings → Set-quality model',
    rationale: 'Momentum or a shortened range shifts load away from the target muscle; the size of the reduction is a judgement call.', refIds: [], implementedIn: 'src/domain/quality.ts',
  },
  {
    id: 'drop_and_low_reps', area: 'effort',
    rule: 'Drop-set segments after the first ×0.5; sets under 5 reps ×0.8 (not timed holds).',
    value: '×0.5, ×0.8', basis: 'research_informed_heuristic', confidence: 'low', configurable: 'Settings → Set-quality model',
    rationale: 'Drop segments are short continuations of one set; very heavy low-rep sets give less hypertrophy per set than moderate loads at equal sets.', refIds: ['sodal2023_drop_sets', 'schoenfeld2017_load', 'lopez2021_load_network'], implementedIn: 'src/domain/quality.ts',
  },
  // ---- Exercise
  {
    id: 'rom_partials', area: 'exercise',
    rule: 'Unspecified partial reps ×0.8; lengthened partials ×1.0 (no bonus).',
    value: '×0.8 / ×1.0', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: 'Settings → Set-quality model',
    rationale: 'Training at long muscle lengths is at least as good as full range; short-length partials appear inferior.', refIds: ['pallares2021_rom', 'kassiano2023_rom_review', 'wolf2025_lengthened_partials', 'pedrosa2023_arm_curl_initial_rom', 'kassiano2023_calf_lengthened'], implementedIn: 'src/domain/quality.ts',
  },
  {
    id: 'bench_angle_groups', area: 'exercise',
    rule: 'Bench angle changes coefficients only in coarse groups (decline, flat < 10°, incline 10–45°, steep > 45°); the exact angle only separates strength histories.',
    value: 'groups', basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: 'Mostly EMG plus few hypertrophy trials — not enough for per-degree coefficients.', refIds: ['chaves2020_incline', 'rodriguezridao2020_bench_angles', 'lauver2016_bench_angle'], implementedIn: 'src/domain/registry.ts',
  },
  {
    id: 'supinated_vertical_pull', area: 'exercise',
    rule: 'Underhand grip on pulldowns/pull-ups → biceps coefficient at least 0.75.',
    value: '≥ 0.75', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Elbow-flexor demand is higher with a supinated grip (biomechanics and EMG — indirect evidence).', refIds: ['youdas2010_pullup_chinup', 'lusk2010_pulldown_grip'], implementedIn: 'src/domain/registry.ts',
  },
  {
    id: 'hip_flexion_not_abs', area: 'exercise',
    rule: 'Hanging knee raise with pelvic curl credits the abs; a pure hip-flexion leg lift would not (hip flexors are not tracked).',
    value: 'abs 1 only with pelvic curl', basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: 'Rectus abdominis flexes the spine/tilts the pelvis; hip flexion is done by the hip flexors. Direct hypertrophy evidence for the abs is limited.', refIds: ['andersson1997_abs_hipflexor_emg', 'juker1998_psoas_abwall_emg'], implementedIn: 'src/data/exercises.ts',
  },
  // ---- Session
  {
    id: 'session_taper', area: 'session',
    rule: 'Within one session, a muscle\'s effective sets above ~11 count ×0.5 (tapered, not zeroed).',
    value: 'cap 11, ×0.5', basis: 'heuristic', confidence: 'low', configurable: 'Settings → Set-quality model',
    rationale: 'Per-session volume appears to show diminishing returns. The ~11-set figure comes from a 2025 preprint that has no PubMed record yet, so it is NOT in the verified library — treated as a soft heuristic (tapered, not zeroed).', refIds: [], implementedIn: 'src/domain/volume.ts',
  },
  {
    id: 'todays_share', area: 'session',
    rule: "Today's share = remaining weekly sets ÷ sessions likely left, at most ~60 % of the weekly target and ≤ 10 per muscle; never more than what is left; leftovers carry over, never crammed.",
    value: '≤ 60 %, ≤ 10', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Spreads volume across the week (frequency matters little at equal volume, but very large single-session doses show diminishing returns).', refIds: ['schoenfeld2019_frequency', 'pelland2026_volume_frequency'], implementedIn: 'src/domain/analysis.ts',
  },
  // ---- Recovery
  {
    id: 'recovery_windows', area: 'recovery',
    rule: 'Recovery window by the last significant session: ≤3 sets 24 h, ≤6 36 h, ≤9 48 h, ≤12 60 h, more 72 h; +12 h for ≥ 2 failure sets, a new exercise, a large muscle after > 9 sets, short sleep or high fatigue; +12/24 h for soreness. Counted from when the session ended.',
    value: '24–72 h (+modifiers)', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Performance and damage markers usually recover within 24–72 h, longer after high volume, failure or unaccustomed work; advice, not a rule.', refIds: ['morannavarro2017_recovery_failure', 'damas2018_damage_review'], implementedIn: 'src/domain/recovery.ts',
  },
  // ---- Progression
  {
    id: 'double_progression', area: 'progression',
    rule: 'Increase load only after all working sets reach the top of the rep range with effort recorded in two consecutive sessions (one session if every set was clearly too light); never right after pain; reduce only when technique broke down on at least half the session\'s sets.',
    value: '2 sessions / 1 if RIR ≥ target + 2', basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Progressive overload over time is what matters; requiring repeat performance avoids reacting to one good day.', refIds: ['plotkin2022_progression', 'currier2026_acsm_position'], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'benchmark_exclusion', area: 'progression',
    rule: 'Wrong-weight, pain, compromised-technique and technical-failure sets stay in history but never judge progress.',
    value: 'excluded', basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: 'They do not reflect comparable performance.', refIds: [], implementedIn: 'src/domain/progression.ts, src/domain/feedback.ts',
  },
  {
    id: 'plateau', area: 'progression',
    rule: 'Possible plateau: ≥ 4 representative sessions over ≥ 21 days with no new best in the last two; fatigued sessions set aside; check load, rest, technique, effort and recovery before adding volume.',
    value: '4 sessions / 21 days', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Short-term noise is large; a plateau call needs several comparable sessions.', refIds: [], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'single_bad_session', area: 'progression',
    rule: 'A lone latest session ≥ 5 % below the usual level (or ≥ 5 % below the previous session and under the usual level) is set aside: the trend is judged on the sessions before it. A decline by slope also needs the last two sessions below the first.',
    value: '5 %', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Day-to-day performance varies with sleep, food and stress; one bad day must not create a plateau, a decline or a load reduction.', refIds: [], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'sustained_decline', area: 'progression',
    rule: 'Declining also when, over ≥ 6 comparable sessions in 8 weeks, the median of the last 3 is ≥ 8 % below the median of the first 3 and all of the last 3 are below all of the first 3.',
    value: '8 % over 8 weeks', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Slow declines of ~1 % per session never cross the per-session slope threshold within 6 sessions, yet add up to a clear loss over two months.', refIds: [], implementedIn: 'src/domain/progression.ts',
  },
  {
    id: 'index_scale', area: 'progression',
    rule: 'A kg-based index (RIR-adjusted Epley), a body + belt index (weighted pull-ups / dips, body weight known before the session — an estimate) and a reps-based index (reps + RIR) are never compared: trends and progress % use only sessions on the latest scale. Belt-only Epley (no body weight logged) never produces a %.',
    value: 'same scale only', basis: 'heuristic', confidence: 'high', configurable: null,
    rationale: 'The two indices have different units; a bodyweight set of 12 reps (index 13) followed by a +5 kg set (index 6.8) is not a 48 % loss.', refIds: [], implementedIn: 'src/domain/progression.ts, src/domain/baseline.ts',
  },
  {
    id: 'rest_attribution', area: 'progression',
    rule: 'A rep drop after a clearly shorter rest (< 70 % of the usual) is attributed to rest, not strength loss.',
    value: '< 70 % of median', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Longer rests preserve more repetitions in later sets.', refIds: ['schoenfeld2016_rest', 'singer2024_rest'], implementedIn: 'src/domain/progression.ts',
  },
  // ---- Prescription
  {
    id: 'presc_rir_targets', area: 'prescription',
    rule: 'Target RIR: machines/isolation 1–2; free-weight compounds 2–3; +1 after recent technique breakdown or technical failure; never failure on every set.',
    value: '1–2 / 2–3', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Stopping a few reps short gives similar growth with less fatigue; stable machines make proximity to failure easier to judge and safer.', refIds: ['refalo2023_failure_meta', 'robinson2024_proximity_failure', 'halperin2022_rir_accuracy'], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'presc_rep_ranges', area: 'prescription',
    rule: "Rep range per set comes from the owner's own reps at that load on that machine, kept inside a broad exercise range (isolation ~8–20, compounds ~5–12).",
    value: 'personal', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Similar hypertrophy across a wide load range when sets are hard; ranges are for practicality, not magic.', refIds: ['schoenfeld2017_load', 'lopez2021_load_network'], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'presc_set_count', area: 'prescription',
    rule: "Sets = today's share for the exercise's primary muscle ÷ its coefficient − sets already done for that muscle today; 1…4 (isolation) or 1…5 (compound); 0 with a reason when the week is covered or the muscle is still recovering.",
    value: '≤ 4 / ≤ 5', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Follows the weekly plan without cramming; caps keep single-exercise volume practical.', refIds: [], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'presc_rest', area: 'prescription',
    rule: "Rest = the owner's median rest on that machine, bounded (isolation 60–180 s, compounds 120–300 s).",
    value: 'personal, bounded', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Very short rests reduce volume load; longer rests modestly favour hypertrophy in multi-joint lifts.', refIds: ['singer2024_rest', 'schoenfeld2016_rest'], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'presc_confidence', area: 'prescription',
    rule: 'Confidence high = ≥ 4 comparable sessions in 8 weeks, moderate = 2–3, low = 0–1 ("calibrating"); calendar days alone never unlock it.',
    value: '4 / 2–3 / 0–1', basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Honest uncertainty: a new machine or variation has no comparable history.', refIds: [], implementedIn: 'src/domain/prescription.ts',
  },
  {
    id: 'warmups_not_counted', area: 'prescription',
    rule: 'Warm-up sets are generated per exercise (fewer when the muscle was already trained this session) and never count as volume.',
    value: 'not counted', basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Warm-ups prepare the movement; they are far from failure.', refIds: ['ribeiro2014_warmup', 'viveiros2024_warmup_load'], implementedIn: 'src/domain/progression.ts, src/domain/prescription.ts',
  },
  // ---- Execution / tempo
  {
    id: 'tempo_no_credit', area: 'execution',
    rule: 'Tempo never adds or removes volume credit: no bonus for slow negatives, no downgrade for a faster eccentric. Only momentum or a shortened range, reported as technique, can change credit (via the technique rule).',
    value: 'no multiplier', basis: 'research', confidence: 'moderate', configurable: null,
    rationale: 'Pooled evidence shows similar hypertrophy over a wide range of repetition durations; very slow reps are not superior.', refIds: ['enes2025_tempo', 'schoenfeld2015_repduration', 'amdi2025_eccduration', 'dasilva2025_ecc_con'], implementedIn: 'src/domain/quality.ts, src/data/scientific-evidence/tempo.ts',
  },

  // ---- Exercise choice, order and fatigue cost (Part 5)
  {
    id: 'fatigue_cost', area: 'choice',
    rule: 'Each exercise has a fatigue cost for the rest of the session: HIGH (heavy free-weight squat / hinge / lunge, barbell presses and rows, weighted pull-ups / dips), MODERATE (machine and dumbbell compounds, bodyweight pull-ups), LOW (single-joint isolation).',
    value: 'high / moderate / low', basis: 'research_informed_heuristic', confidence: 'low', configurable: null,
    rationale: 'Exercises done after demanding work lose repetitions and load (acute data), and fatigue partly carries over to the repetition capacity of other muscles. No long-term trial quantifies a per-exercise cost, so the classes are a practical estimate, not calories and not difficulty.',
    refIds: ['spreuwenberg2006_squat_order', 'behm2021_nonlocal_fatigue', 'simao2012_exercise_order_review'], implementedIn: 'src/data/exercises.ts, src/domain/fatigue.ts',
  },
  {
    id: 'exercise_order', area: 'choice',
    rule: 'Default order HIGH → MODERATE → LOW fatigue cost, larger muscles first; a priority muscle (high priority or the largest recovered weekly deficit) may go first even as isolation. Order advice is a soft suggestion ("CONSIDER LATER"), never a block.',
    value: 'compound first unless prioritised', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: 'Muscles → priority',
    rationale: 'Whatever is trained first gains more strength and gets more repetitions; hypertrophy differs little or not at all between orders (meta-analysis). So order protects performance of the lifts that matter most; it is not a growth rule.',
    refIds: ['nunes2021_exercise_order', 'simao2012_exercise_order_review', 'spineti2010_order_strength_volume', 'avelar2019_order_hypertrophy', 'brandao2020_mj_sj_order', 'hermann2026_pre_exhaustion', 'acsm2009_progression'], implementedIn: 'src/domain/exerciseChoice.ts, src/domain/planner.ts',
  },
  {
    id: 'choice_status', area: 'choice',
    rule: 'Exercise choice: CONSIDER ALTERNATIVE when the primary muscle is still inside its recovery window, a significant synergist (coefficient ≥ 0.5) is and an alternative spares it, or the primary is above its weekly upper bound; ACCEPTABLE when a synergist is loaded without an alternative, the week is already met or the trend is declining; GOOD otherwise. A weekly deficit never overrides recovery.',
    value: 'good / acceptable / reconsider', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Combines the existing recovery, volume and trend heuristics into one transparent call with the reason shown; it never blocks and never claims a biological state.',
    refIds: [], implementedIn: 'src/domain/exerciseChoice.ts',
  },
  {
    id: 'choice_learning', area: 'choice',
    rule: 'A recovery warning for an exercise is softened to ACCEPTABLE only after ≥ 3 overridden warnings whose next comparable performance was not lower (≥ 2 of 3). One workout never changes anything; subjective feedback alone is never proof.',
    value: '≥ 3 observations', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Personal responses vary; repeated observations are needed before a heuristic is relaxed.',
    refIds: [], implementedIn: 'src/domain/exerciseChoice.ts',
  },
  // ---- Planner (Part 5)
  {
    id: 'planner_modes', area: 'planner',
    rule: 'LEARNING until ≥ 8 well-documented workouts over ≥ 21 days with gyms identified and ≥ 3 frequent exercises calibrated (PROVISIONAL ADAPTIVE); FULL ADAPTIVE after ≥ 10 well-documented workouts over ≥ 28 days with calibrated familiar exercises covering ≥ 80 % of the major muscles\' weekly targets. Never by calendar alone.',
    value: '8 / 21 d → 10 / 28 d + 80 %', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Personal prescriptions need comparable, well-logged exposures per exercise and machine; badly logged sessions do not count.',
    refIds: [], implementedIn: 'src/domain/readiness.ts',
  },
  {
    id: 'planner_session_allocation', area: 'planner',
    rule: 'Sets are allocated for the WHOLE session: the open share of today for each muscle (capped, catch-up-free) is covered by fractional contributions of all planned exercises, without overshoot; muscles still recovering get no sets.',
    value: 'today share − planned contributions', basis: 'research_informed_heuristic', confidence: 'moderate', configurable: 'Settings → Set-quality model',
    rationale: 'Fractional counting of indirect work and the per-session taper; avoids the first exercise of a muscle taking the whole share of the day.',
    refIds: ['pelland2026_volume_frequency', 'schoenfeld2017_volume'], implementedIn: 'src/domain/planner.ts',
  },
  {
    id: 'planner_calibration', area: 'planner',
    rule: 'Loads only from the same exercise × machine × configuration history on its real increments: calibrated (≥ 2 comparable sessions with effort), provisional (1 session or older history), needs data (no kg — "pick a load for 10–12 reps at RIR 2–3"). Kg is never transferred between machines.',
    value: '2 / 1 / 0 comparable sessions', basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Loads on two machines are not comparable (cam profile, ratio, friction).',
    refIds: [], implementedIn: 'src/domain/planner.ts, src/domain/readiness.ts',
  },
  {
    id: 'planner_returning', area: 'planner',
    rule: 'After ≥ 10 days without training the plan is marked "returning"; after > 14 days loads start one step below the last comparable session. Missed sessions never add catch-up volume.',
    value: '10 / 14 days', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'Short breaks cost little; a cautious first session back protects technique and recovery.',
    refIds: [], implementedIn: 'src/domain/planner.ts',
  },
  {
    id: 'planner_learning', area: 'planner',
    rule: 'Preferences shift only after ≥ 3 repeated choices at the same gym (e.g. always replaces X with Y). Substitutions because equipment was busy, and pain-related skips, never count as a preference.',
    value: '≥ 3, busy excluded', basis: 'heuristic', confidence: 'low', configurable: null,
    rationale: 'An occupied machine says nothing about what the owner prefers; one decision is not a pattern.',
    refIds: [], implementedIn: 'src/domain/planner.ts',
  },
  {
    id: 'volume_individual', area: 'volume',
    rule: 'After Learning Mode each muscle target starts from its own baseline and changes only on evidence: +1–2 when stalled with consistent technique, adequate effort (RIR ≤ 3), good recovery, a stable volume for ≥ 3 weeks and no history of more volume failing; −1–2 (or back to the earlier productive level) on repeated decline with adequate effort, consistently poor recovery, technique breakdown on ≥ 25 % of sets, or a recent increase without better performance; otherwise hold. Never raised only because it is below a generic reference.',
    value: '±1–2 effective sets/week', basis: 'research_informed_heuristic', confidence: 'low', configurable: 'Muscles → target per muscle',
    rationale: 'Volume shows a dose–response with diminishing returns and large individual differences; the productive volume of each muscle has to be found from its own response, gradually, not from a population average.',
    refIds: ['pelland2026_volume_frequency', 'schoenfeld2017_volume', 'bazvalle2022_volume'], implementedIn: 'src/domain/volumeResponse.ts, src/domain/targets.ts',
  },
  {
    id: 'planner_live_reassessment', area: 'planner',
    rule: 'During a workout every exercise not yet started is re-prescribed from what was ACTUALLY done (any order): sets from the open share minus completed contributions, warm-ups from completed same-muscle work, order advice from completed demanding lifts. Untouched planned sets update; edited sets are never overwritten.',
    value: 'on every completed set / reorder', basis: 'heuristic', confidence: 'moderate', configurable: null,
    rationale: 'Real gyms have busy machines; the planned order is never assumed to have been followed.',
    refIds: [], implementedIn: 'src/domain/planner.ts, src/ui/pages/Logger.tsx',
  },
];

export const RULE_BY_ID: Record<string, Rule> = Object.fromEntries(RULES.map((r) => [r.id, r]));
