// Generated from the verified research pass (2026-11-21). See SCIENTIFIC_METHOD.md.
// Edit by hand only together with tests/evidence.test.ts; never add a reference without verifying its PMID and DOI.

export interface GeneralEvidence {
  topic: string;
  text: string;
  /** strong | moderate | limited | very_limited, sometimes qualified (e.g. "moderate (limbs); none for chest"). */
  evidenceLevel: string;
  refIds: string[];
}

export const GENERAL_EVIDENCE: GeneralEvidence[] = [
  {
    topic: "Muscle length / lengthened partials",
    text: "A meta-analysis of 12 studies found only trivial regional-growth differences between training at longer and shorter mean muscle lengths, with a slight distal lean toward longer lengths. A systematic review found full ROM or initial-range partials generally beat final-range partials for several limb muscles, with exceptions such as the triceps. Neither abstract reports chest data, so lengthened-partial advice for the chest is extrapolation.",
    evidenceLevel: "moderate (limbs); none for chest",
    refIds: [
      "varovic2025_muscle_length",
      "kassiano2023_rom_review"
    ]
  },
  {
    topic: "Free weights vs machines",
    text: "Hypertrophy is similar with free weights and machines, and strength gains are specific to the trained modality. This supports separate strength histories per equipment instance while weekly muscle volume is shared.",
    evidenceLevel: "moderate",
    refIds: [
      "haugen2023_freeweight_machine",
      "heidel2022_machines_freeweights",
      "hernandezbelmonte2023_freeweight_machine"
    ]
  },
  {
    topic: "Isolation vs compound for chest",
    text: "Dumbbell flys grew the pectoralis as much as dumbbell presses, and pec deck alone produced clear pectoral growth. Single-joint chest work is a valid primary chest stimulus, with no triceps credit for flys.",
    evidenceLevel: "limited",
    refIds: [
      "dellavanzi2026_press_vs_fly",
      "pinto2025_pecdeck"
    ]
  },
  {
    topic: "Regional (upper/lower) chest",
    text: "Regional pectoral growth from exercise choice rests on one small long-term incline trial plus acute EMG and swelling studies, which partly disagree. Pec deck and dumbbell press vs fly showed no regional differences. Keep upper/lower chest as display-only emphasis shares that are never added to the chest total.",
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
    topic: "Stretching",
    text: "Prolonged daily static pectoral stretching (15 min, 4 days a week) matched resistance training for pectoral thickness in active people. It is impractical and does not show benefit added to lifting, so no recommendation follows for a lifter.",
    evidenceLevel: "limited",
    refIds: [
      "wohlann2024_pec_stretch"
    ]
  },
  {
    topic: "EMG is not proof of hypertrophy",
    text: "Higher acute surface-EMG amplitude has not been validated as a predictor of long-term muscle growth. Nearly all back-specific exercise-selection evidence (grip width, grip orientation, elbow path, vertical vs horizontal pulls) is EMG-based, so the app should present it as indirect evidence, not as proven hypertrophy differences.",
    evidenceLevel: "moderate",
    refIds: [
      "vigotsky2022_emg_proxy",
      "difonza2026_lat_emg_review"
    ]
  },
  {
    topic: "Back hypertrophy evidence gap",
    text: "Long-term size data for back muscles are scarce: one small MRI/biopsy trial for the lats, a few small (partly clinical) studies for the upper trapezius, and none found for rhomboids/middle trapezius. No longitudinal trial compared vertical vs horizontal pulling, grip widths or elbow paths for back growth. Back-exercise muscle credit should be labelled as practical estimates.",
    evidenceLevel: "limited",
    refIds: [
      "paoli2016_latissimus",
      "kadi2000_trapezius",
      "andersen2014_trapezius_rct",
      "bartolomei2021_split_traps"
    ]
  },
  {
    topic: "Multi-joint pulls and arm credit",
    text: "In untrained men, lat-pulldown-only training produced elbow-flexor growth similar to curl-only training, supporting fractional (non-zero) biceps credit for pulling exercises; the exact coefficient remains an estimate.",
    evidenceLevel: "limited",
    refIds: [
      "gentil2015_mj_vs_sj"
    ]
  },
  {
    topic: "Regional deltoid hypertrophy / exercise variation",
    text: "The three deltoid heads are activated by different movements (EMG), and one bench-press trial showed uneven growth across the muscles involved, with the side delt lagging. A systematic review on exercise variation suggests a few anatomically distinct exercises (e.g. a press, a lateral raise and a rear-delt movement) are more sensible than rotating many redundant ones; deltoid-specific trials of this are lacking.",
    evidenceLevel: "limited",
    refIds: [
      "kassiano2022_exercise_variation",
      "lanza2024_bench_muscles",
      "rabello2024_deltoid_emg_sr"
    ]
  },
  {
    topic: "Do presses train the front delts enough?",
    text: "Bench pressing alone grew the anterior deltoid in men whose training status the abstract does not state; no trial tested whether front-delt isolation adds anything on top of pressing. Reasonable default: credit presses to the front delts and do not prompt extra front-raise work, labelled as an inference.",
    evidenceLevel: "limited",
    refIds: [
      "lanza2024_bench_muscles",
      "campos2020_deltoid_emg"
    ]
  },
  {
    topic: "Long muscle length (arms)",
    text: "In arm studies, emphasizing the stretched position helped or did not hurt: overhead triceps extension beat neutral-arm extension (MRI), and elbow-extended-range curl partials beat flexed-range partials. When full-range curls differ only in shoulder position or resistance curve, total elbow flexor growth was similar. Exception: one triceps study found mid-range partials beat full ROM. Practical summary: use full ROM, avoid short-range partials, and include an overhead triceps movement.",
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
    topic: "Direct vs indirect arm training",
    text: "Compound pulls and presses grow the biceps and triceps respectively, so fractional credit from rows/pulldowns to biceps and from presses to triceps is reasonable (the exact 0.5 value is an assumption). Curls grew the elbow flexors more than rows set-for-set in one small trial, while adding isolation work to a compound program showed no detectable extra benefit in short, small trials. Evidence is limited: mostly untrained participants and short durations.",
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
    topic: "Regional (nonuniform) arm hypertrophy",
    text: "Arm muscles do not grow uniformly along their length, and exercise choice or range can shift where growth occurs (e.g. distal biceps with lengthened-range curls, middle triceps with a multi-joint exercise). The app tracks whole muscles, so regional effects should be explained as emphasis, not counted as extra volume.",
    evidenceLevel: "limited",
    refIds: [
      "wakahara2013_nonuniform_triceps",
      "pedrosa2023_arm_curl_initial_rom",
      "zabaletakorta2023_incline_vs_preacher",
      "kobayashi2026_incline_vs_preacher"
    ]
  },
  {
    topic: "Range of motion and muscle length",
    text: "Pooled studies favoured full over partial ROM for lower-limb growth. A later Bayesian meta-analysis found that training at longer or shorter mean muscle lengths gave practically equivalent regional growth, with only a small, non-decisive distal trend. Some individual trials still favoured lengthened positions for particular muscles: seated leg curl, standing calf raise, stretched-half calf partials and reclined leg extension. Treat lengthened emphasis as a sensible tiebreaker, not a large universal effect.",
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
    topic: "Two-joint thigh muscles and compound exercises",
    text: "Compound leg exercises grew the two-joint thigh muscles little. Squats and leg press barely grew the rectus femoris, and squats and hip thrusts barely grew the hamstrings. Leg extension grew the rectus femoris in every trial that compared it with a compound. Leg curls grew the hamstrings, although no trial compared them directly with squats.",
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
    topic: "EMG vs growth",
    text: "The hip thrust showed higher acute glute EMG than the squat, but in a later MRI training study this did not translate into more glute growth. Treat EMG as a hint about which muscles are working, not as proof of hypertrophy.",
    evidenceLevel: "limited",
    refIds: [
      "contreras2015_hipthrust_squat_emg",
      "plotkin2023_hipthrust_vs_squat"
    ]
  },
  {
    topic: "Core activation vs hypertrophy",
    text: "Two systematic reviews of acute EMG found free-weight lifts among the highest for erector spinae activity (and, in one review, rectus abdominis and external oblique), with multifidus results mixed between reviews. Such activation has not been shown to produce trunk muscle growth in long-term trials, so trunk exercise rankings in the app are activation-based assumptions.",
    evidenceLevel: "limited",
    refIds: [
      "martuscello2013_core_emg_sr",
      "olivalozano2020_core_emg_sr"
    ]
  },
  {
    topic: "Hip flexors are not abs",
    text: "Hip-flexion movements (sit-ups, leg lifts) strongly recruit the iliopsoas and rectus femoris, whereas curl-ups keep psoas low and abdominal activity grows with trunk-flexion angle. The abs are still active during hip-flexion movements, so the difference is one of emphasis in EMG, not proven growth. Hip flexors are not tracked in the app and earn no target credit.",
    evidenceLevel: "limited",
    refIds: [
      "andersson1997_abs_hipflexor_emg",
      "juker1998_psoas_abwall_emg"
    ]
  },
  {
    topic: "Weekly volume dose-response",
    text: "More weekly hard sets produce more hypertrophy with diminishing returns (more pronounced for strength). About 10 or more sets per muscle per week is supported as a reference; in trained men 12-20 vs >20 sets mostly did not differ. Supports the app's targets as references, not quotas.",
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
    topic: "Fractional counting of indirect sets",
    text: "Pelland 2026 found counting indirect sets as 0.5 had stronger relative evidence than counting them as 1 or 0. This supports fractional coefficients in principle; the app's finer 0.25/0.75 steps are practical assumptions not tested by that model.",
    evidenceLevel: "moderate",
    refIds: [
      "pelland2026_volume_frequency"
    ]
  },
  {
    topic: "Per-session volume ceiling",
    text: "No peer-reviewed, PubMed-indexed analysis of per-session volume was found. The ~11 fractional sets per session taper rests only on a preprint (Remmert 2025, no PMID, excluded) and must be labelled an assumption. Pelland 2026 modelled weekly volume and frequency, not per-session volume.",
    evidenceLevel: "very_limited",
    refIds: [
      "pelland2026_volume_frequency"
    ]
  },
  {
    topic: "Proximity to failure / RIR",
    text: "Hypertrophy improves as sets end closer to failure, but momentary failure was not clearly better than stopping short (about 1-3 RIR) in multi-set training, and costs more acute fatigue. Any advantage for failure was trivial in pooled data and only a tendency in a single-set-per-exercise routine. Supports credit 1.0 for RIR 0-3 with declining credit above (the exact credit steps are assumptions).",
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
    topic: "RIR self-estimation accuracy",
    text: "Lifters underpredict reps left by about one on average, with very high between-study heterogeneity; accuracy is better near failure, in sets of 12 reps or fewer and slightly in later sets, and improved with practice in one trial. Logged RIR in high-rep sets should be treated as less precise.",
    evidenceLevel: "moderate",
    refIds: [
      "halperin2022_rir_accuracy",
      "hermann2025_single_set_failure"
    ]
  },
  {
    topic: "Load range",
    text: "When sets go to failure, low, moderate and high loads give similar hypertrophy; heavier loads give more 1RM strength. Supports counting roughly 5-30 rep sets equally for size when taken close to failure.",
    evidenceLevel: "strong",
    refIds: [
      "schoenfeld2017_load",
      "lopez2021_load_network"
    ]
  },
  {
    topic: "Rest intervals",
    text: "Pooled estimates leaned toward a small hypertrophy advantage for rests longer than about 60 s (credible intervals included zero), with no appreciable further difference beyond about 90 s. One trained-men RCT favoured 3 min over 1 min. A rep drop after a much shorter rest should be attributed to rest, not strength loss.",
    evidenceLevel: "moderate",
    refIds: [
      "singer2024_rest",
      "schoenfeld2016_rest"
    ]
  },
  {
    topic: "Frequency at equated volume",
    text: "With weekly volume equated, how many sessions a muscle's work is split across does not meaningfully change hypertrophy; frequency mainly helps by making more volume feasible, and it helps strength. Supports spreading the weekly target over sessions without a fixed frequency rule.",
    evidenceLevel: "strong",
    refIds: [
      "schoenfeld2019_frequency",
      "pelland2026_volume_frequency",
      "currier2026_acsm_position"
    ]
  },
  {
    topic: "Range of motion and lengthened partials",
    text: "Full ROM beats partial ROM overall for strength and lower-limb hypertrophy, but partials at long muscle lengths roughly match full ROM (and occasionally exceed it), while short-length partials underperform. Supports partial ROM credit ×0.8 and lengthened partials ×1.0, with the ×0.8 value itself an assumption.",
    evidenceLevel: "moderate",
    refIds: [
      "pallares2021_rom",
      "kassiano2023_rom_review",
      "wolf2025_lengthened_partials",
      "currier2026_acsm_position"
    ]
  },
  {
    topic: "Progression method",
    text: "Adding reps at a fixed load and adding load at a fixed rep range produced similar hypertrophy over 8 weeks in trained people, consistent with double progression (reps first, then load).",
    evidenceLevel: "moderate",
    refIds: [
      "plotkin2022_progression"
    ]
  },
  {
    topic: "Recovery time course",
    text: "Sets to failure prolonged recovery of neuromuscular function and fatigue markers to roughly 24-48 h compared with non-failure sets of equal volume (acute data). Damage is greatest in the first sessions of a new programme and fades over about 3 weeks; damage is not required for growth; evidence that fatigue accumulates across sessions is equivocal. Consistent with adding time for failure sets and new exercises, but the app's specific windows are assumptions.",
    evidenceLevel: "limited",
    refIds: [
      "morannavarro2017_recovery_failure",
      "damas2016_damage_mps",
      "damas2018_damage_review",
      "kataoka2022_fatigue_accumulation"
    ]
  },
  {
    topic: "Deloads",
    text: "A week of full cessation did not reduce lower-body hypertrophy but reduced lower-body strength gains in trained people; reducing sets and frequency in single weeks did not blunt growth in untrained men. Coaches define a deload as planned reduced training stress for fatigue management. No evidence that deloads improve hypertrophy; treat them as fatigue management.",
    evidenceLevel: "limited",
    refIds: [
      "coleman2024_deload",
      "pancar2026_deload",
      "bell2023_deload_delphi"
    ]
  },
  {
    topic: "Warm-up practice",
    text: "Only acute performance data exist: one crossover found no effect of warm-up type on reps to failure, another found a brief heavy warm-up allowed more total session volume. No long-term hypertrophy evidence; warm-up sets should not count toward volume.",
    evidenceLevel: "very_limited",
    refIds: [
      "ribeiro2014_warmup",
      "viveiros2024_warmup_load"
    ]
  },
  {
    topic: "Drop sets",
    text: "Drop sets produced hypertrophy similar to traditional sets, sometimes in much less time. This does not establish a per-segment credit; the app's ×0.5 for drop segments is an assumption.",
    evidenceLevel: "limited",
    refIds: [
      "sodal2023_drop_sets"
    ]
  }
];
