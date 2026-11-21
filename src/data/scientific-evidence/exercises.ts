// Generated from the verified research pass (2026-11-21). See SCIENTIFIC_METHOD.md.
// Edit by hand only together with tests/evidence.test.ts; never add a reference without verifying its PMID and DOI.

export interface ExerciseEvidence {
  /** Ids from src/data/exercises.ts. */
  exerciseIds: string[];
  text: string;
  refIds: string[];
  /** true = based on EMG, acute, strength-only or extrapolated data, not measured growth for these exercises. */
  indirect: boolean;
}

export const EXERCISE_EVIDENCE: ExerciseEvidence[] = [
  {
    exerciseIds: [
      "incline_barbell_press",
      "incline_dumbbell_press",
      "smith_incline_press",
      "incline_chest_press"
    ],
    text: "In one small long-term trial in untrained men, incline bench pressing grew the upper pectoral site more than flat pressing while strength gains matched. This is the only direct regional-growth evidence for inclines; it used a barbell, and the other variants are extrapolations.",
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
    text: "Most EMG studies show about 30-45 degree inclines shifting excitation toward the clavicular head, though one found no whole-lift difference. Steeper angles (above about 45 degrees) move work to the anterior deltoid. This is consistent with the app's coarse angle groups as an assumption, not a measured growth effect.",
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
    text: "No training study shows decline pressing grows the lower chest more than flat pressing. In EMG, decline matched flat for the sternocostal head and had the lowest anterior deltoid excitation. This is consistent with the app capping front delts on declines, but the evidence is indirect.",
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
    text: "In recreationally trained men over 10 weeks, dumbbell press and dumbbell fly produced similar whole-muscle and regional pectoral thickness gains. Both can be treated as productive chest exercises.",
    refIds: [
      "dellavanzi2026_press_vs_fly"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "pec_deck"
    ],
    text: "Pec deck alone thickened the clavicular (about 17-18%) and sternocostal (about 21%) regions similarly over 12 weeks in untrained men, so it gives no regional emphasis. In these beginners one set to failure matched three sets.",
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
    text: "No hypertrophy trial of cable flys (including low-to-high) was found. Their chest credit is extrapolated from the dumbbell fly and pec deck trials, and any upper-chest emphasis claimed for low-to-high flys is unverified.",
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
    text: "In trained men, machine and barbell bench press grew the pectoralis major similarly, and meta-analyses find no hypertrophy difference between free weights and machines. Strength gains are modality-specific, so loads on different equipment should not be compared.",
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
    text: "In bodybuilders, a chest press machine produced less clavicular and lateral deltoid EMG than barbell presses and less triceps EMG than flat or decline barbell pressing. This acute data does not override the long-term finding of similar growth.",
    refIds: [
      "coratella2020_press_variations"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: "Ten weeks of bench press training (MRI) enlarged the pectoralis major, pectoralis minor, anterior deltoid and triceps. Pectoralis major gained more than triceps, and the medial deltoid least. This is consistent with secondary credit for triceps and front delts on presses; the exact 0.5 coefficient remains an assumption.",
    refIds: [
      "lanza2024_bench_muscles"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: "Full-ROM bench press beat top-range partials for 1RM and velocity gains, and gains shrank as the range shortened. Muscle size was not measured, and no chest trial of lengthened (bottom-range) partials was found.",
    refIds: [
      "martinezcava2022_bench_rom"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: "Bench training with an elastic device (which assists at the bottom and allows about 10% heavier loads) gave the same pectoral thickness and 1RM gains as normal benching. The altered resistance profile was not superior.",
    refIds: [
      "gavanda2026_elastic_bench"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "push_up"
    ],
    text: "Push-ups adjusted to about 40% of bench 1RM increased pectoralis major and triceps thickness comparably to low-load bench press over 8 weeks. The trial was very small, so treat this as tentative.",
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
    text: "Grip widths of roughly 1-2 times shoulder width change lat EMG little and inconsistently; narrow and medium grips allowed slightly heavier 6RM loads than a very wide grip (Andersen V 2014; Buonsenso 2025; Di Fonza 2026). Pulling to the front of the face is the setup most consistently tied to higher lat EMG. Supports not treating grip width as a history key and not crediting one width with more lat volume. No long-term growth data compare these variants.",
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
    text: "Underhand vs overhand grip: lat EMG was similar in pull-ups and chin-ups while chin-ups raised biceps and pec EMG (Youdas 2010); in pulldowns an overhand grip gave slightly higher lat EMG and grip did not change biceps EMG (Lusk 2010; Buonsenso 2025). The app's rule crediting supinated vertical pulls with biceps at 0.75 or more rests only on mixed acute EMG, not hypertrophy data; keep it labelled as an assumption.",
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
    text: "Pulldown-only training grew the elbow flexors about as much as curl-only training in untrained men over 10 weeks, so a vertical pull is real biceps work and deserves fractional biceps credit; lat size was not measured in this trial.",
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
    text: "Pull-ups and chin-ups produced very high lat EMG regardless of grip, and pull-up grip variations generally showed similar lat activation (Youdas 2010; Di Fonza 2026). No study here compares pull-ups directly with pulldowns, and none measured long-term lat size for either.",
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
    text: "Seated rows gave the highest middle-trapezius/rhomboid EMG among the pulldowns and rows tested and a lat-to-biceps ratio similar to wide-grip pulldowns; cueing scapular retraction did not change mid-trap/rhomboid activity (Lehman 2004). In seated rows, a narrower grip and less elbow flare were each tied to higher lat EMG in separate studies (Di Fonza 2026). This supports crediting rows to both lats and upper_back, but the split is an assumption: no vertical-vs-horizontal pulling hypertrophy trial was found.",
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
    text: "Shrugs gave the highest upper-trapezius EMG of the exercises tested (Ekstrom 2003; Andersen LL 2008). Trapezius fibre growth has been shown with strength training (Kadi 2000) and neck/shoulder strength training (Andersen LL 2014), but no trial isolates shrugs. A traps 1.0 coefficient is a reasonable practical estimate.",
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
    text: "In women with neck pain, lateral raises and upright rows produced trapezius EMG close to shrugs despite much lighter loads (Andersen LL 2008). This hints that a traps 0.25 coefficient for lateral raises may understate trap involvement, but EMG is not a validated hypertrophy predictor (Vigotsky 2022), so do not change coefficients on this alone; treat as an open question.",
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
    text: "Prone horizontal shoulder extension with external rotation (a rear-delt-fly-like pattern) produced among the highest middle-trapezius EMG (Ekstrom 2003), suggesting these movements also load the upper_back. Acute EMG only; deltoids were not measured in that study.",
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
    text: "Dumbbell and cable lateral raises produced similar side-delt growth over 8 weeks in trained lifters when ROM was matched and sets were taken to failure. Choose by comfort, equipment and consistency. A hypertrophy advantage from the cable's resistance profile or lengthened-position loading is untested (ROM was matched in the only trial).",
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
    text: "EMG on humeral rotation is mixed: in one bodybuilder study a neutral humerus beat external rotation, bent elbow and frontal raise for middle-delt activity, while internal rotation increased rear-delt, upper-trap and triceps activity; a systematic review ranked internally rotated lateral raises highest for the middle delt. Activation only; not shown to change growth.",
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
    text: "Ten weeks of barbell bench press grew the anterior deltoid but gave the smallest response in the side deltoid (MRI). Supports front delts about 0.5 and little or no side-delt credit for flat pressing. Applying this to dumbbell or machine flat presses is an extrapolation.",
    refIds: [
      "lanza2024_bench_muscles"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "barbell_bench_press"
    ],
    text: "Side-delt EMG during bench press is very low.",
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
    text: "Shoulder pressing gave the highest anterior-delt EMG of four exercises and substantial middle-delt EMG in one study; barbell pressing excited the delts more than a machine shoulder press, and behind-the-neck pressing more middle and rear delt than front pressing. No long-term trial confirms side-delt growth from overhead pressing, so side-delt credit for presses is an estimate.",
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
    text: "On a reverse fly machine a neutral (palms-facing) grip modestly increased rear-delt and infraspinatus EMG versus a pronated grip. Activation only.",
    refIds: [
      "schoenfeld2013_reverse_fly_grip"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "front_raise"
    ],
    text: "The frontal raise mainly activates the anterior deltoid and pectoralis major (EMG); no evidence that it adds front-delt growth beyond adequate pressing volume.",
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
    text: "Overhead cable extensions produced about 1.4 times the whole-triceps growth (1.5 times for the long head) of neutral-arm cable extensions in a 12-week MRI trial, with roughly a third less load. Loads are not comparable between the two, so keep separate histories. The neutral-arm (pushdown-like) condition still grew the triceps about 14%; the evidence favors adding an overhead variant, not dropping pushdowns. The trial did not test rope or bar pushdowns specifically.",
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
    text: "Incline curls grew the biceps somewhat more and preacher curls grew the brachialis and brachioradialis somewhat more, with similar total elbow flexor growth (MRI, 12 weeks, untrained). An ultrasound trial in women found a significant within-group gain only with preacher curls (distal site) but no significant between-group difference. Treat them as roughly equivalent for weekly elbow-flexor volume, with small muscle-specific emphasis.",
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
    text: "With resistance profiles matched by cables, shoulder-flexed (preacher) and shoulder-extended cable curls showed no significant difference in biceps or brachialis thickness gains. Barbell preacher curls (hardest with the elbow extended) and cable preacher curls (hardest near full flexion) also grew the biceps similarly, with the barbell version giving more strength only at the most extended angle.",
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
    text: "Within a curl, the bottom (elbow-extended, lengthened) part of the range appears more valuable than the top: lengthened-range partials grew the distal biceps or elbow flexor thickness more than short-range partials. This supports full ROM (or lengthened partials) over short-range partials; it does not show lengthened partials beat full ROM.",
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
    text: "Dumbbell rows grew the elbow flexors about half as much as biceps curls in an 8-week within-subject trial in 10 untrained men. This is loosely consistent with a partial (about 0.5) biceps credit for rows, though one small study cannot pin down a coefficient.",
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
    text: "A program of only pulldowns and bench presses grew the elbow flexors about as much as the same program plus curls and extensions in untrained men over 10 weeks; in trained men, arm circumference gains were also similar with or without isolation work. These short, small trials cannot rule out a small benefit of direct arm work.",
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
    text: "Bench press alone increased triceps thickness while no biceps thickness change was detected over 24 weeks (n=7, no control), consistent with a triceps credit and no biceps credit for presses.",
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
    text: "No long-term hypertrophy trial of hammer curls, wrist curls or reverse curls was found among verified sources; any brachialis or forearm emphasis attributed to them rests on anatomy and EMG-type reasoning, not measured growth.",
    refIds: [],
    indirect: true
  },
  {
    exerciseIds: [
      "leg_extension"
    ],
    text: "In these trials, leg extension was the exercise that consistently grew the rectus femoris, and it grew the vasti about as much as leg press. The quads 1.0 coefficient is supported. One trial found a reclined backrest (about 40 deg hip flexion) grew the rectus femoris more than an upright 90 deg seat, so the backrest setting is worth recording.",
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
    text: "Squats grew the vasti, gluteus maximus and adductors but barely grew the rectus femoris and hamstrings. Full depth beat half depth for glutes and adductors, and deep beat shallow for front-thigh size in one trial. This is consistent with quads 1, glutes 0.5, adductors 0.5 and no hamstring credit; the glute and adductor values may be conservative for deep squats. Recording depth is justified.",
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
    text: "In one MRI trial, leg press grew the vasti as much as knee extension and also grew the gluteus maximus (about 15%) and adductor magnus (about 6%), but not the rectus femoris. This is consistent with quads 1, glutes 0.5 and adductors 0.5.",
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
    text: "In a 12-week within-person trial, seated curls grew the hamstrings more than lying curls (about 14% vs 9%), mainly in the two-joint muscles. Both grew the hamstrings, so hamstrings 1.0 for both is reasonable, and the seated curl is the better pick when both are available.",
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
    text: "No long-term hypertrophy trial of the RDL or the 45 deg back extension was found. Indirect support: a hip-extension exercise grew the biceps femoris long head more than Nordics, and hip-flexed hamstring work favoured the hamstring muscles that also extend the hip. The RDL hamstrings 1.0 and back-extension hamstrings 0.5 coefficients are reasonable inferences but have not been tested directly.",
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
    text: "On MRI (untrained, 9 weeks), hip thrusts and squats grew the glutes similarly, and an ultrasound trial in trained women favoured squats. Hip thrusts produced little hamstring growth and less adductor growth than squats, consistent with glutes 1, hamstrings 0.25 and adductors 0.25.",
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
    text: "Higher acute glute EMG did not predict more growth.",
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
    text: "Straight-knee calf raises grew both gastrocnemius heads and the soleus. On a horizontal leg-press calf raise, partials in the stretched (heel-down) half grew the medial gastrocnemius more than full range or top-half reps. Calves 1.0 is supported.",
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
    text: "In one small MRI trial, seated (knee 90 deg) calf raises produced no significant gastrocnemius growth, while the soleus grew about as much as with standing raises. Whole-calf growth was roughly 40% of standing raises (2.1% vs 5.6%). The current calves 1.0 may overstate whole-calf credit; a value around 0.5 would fit this trial, but it is a single small study in untrained people, so treat this as a suggestion.",
    refIds: [
      "kinoshita2023_standing_vs_seated_calf"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "hip_adduction"
    ],
    text: "No long-term hypertrophy trial of the hip adduction machine was found. The adductors 1.0 coefficient rests on anatomy, not on measured growth.",
    refIds: [],
    indirect: true
  },
  {
    exerciseIds: [
      "hanging_knee_raise_pelvic_curl"
    ],
    text: "Hanging knee-ups in ab straps were among the exercises with the highest upper and lower rectus abdominis, oblique and latissimus EMG; they were not among those with the highest rectus femoris activity in that study. Separately, abdominal activity rises with trunk-curl angle. This is consistent with the owner's pelvic-curl technique, but the technique itself was not tested, and all of this is activation data: no trial shows this exercise grows the abs more than others.",
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
    text: "Leg lifts that flex mainly at the hip strongly recruit the hip flexors (iliacus, psoas, sartorius, rectus femoris); two-leg lifts also require abdominal activation (EMG). The app's rule of full ab credit only when the pelvis curls up is a practical assumption; there are no hypertrophy data for this exercise.",
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
    text: "Curl-up and crunch-type trunk flexion activates the abdominal wall while keeping psoas activity low, unlike full sit-ups (intramuscular EMG), and abdominal EMG rises with greater trunk-flexion angle. No long-term hypertrophy comparisons between crunch variations were found.",
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
    text: "The prone bridge produced higher rectus abdominis EMG than light-to-moderate squats, front squats or military presses, and the side bridge gave high abdominal-wall activity with low psoas activity.",
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
    text: "Adding bodyweight stabilization exercises (including plank-type holds) to soccer training gave no extra trunk muscle growth on MRI in adolescents. High activation here has not translated into documented hypertrophy.",
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
    text: "At 80% 1RM, squats and deadlifts produced high lumbar and upper erector spinae EMG, well above bodyweight and instability exercises, without a rise in lower-abdominal or external-oblique EMG. At light-to-moderate loads the front squat gave erector EMG as high as the superman. There is no long-term evidence that these lifts grow the rectus abdominis; erector growth from them is plausible but not demonstrated in lifters.",
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
    text: "In patients with low back pain, 2 months of deadlift training changed lumbar multifidus thickness about as much as low-load motor-control exercise, with the thinner side catching up in both groups. This is not evidence of erector hypertrophy in healthy lifters.",
    refIds: [
      "berglund2017_deadlift_multifidus"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "romanian_deadlift"
    ],
    text: "In trained men, 10 weeks of RDLs increased RDL 1RM but not isolated lumbar extension torque, suggesting the hips rather than the lumbar extensors drove the gain. Strength-only evidence; muscle size was not measured.",
    refIds: [
      "fisher2013_rdl_lumbar"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "back_extension"
    ],
    text: "Roman chair and bench back extensions activate the lumbar extensors, but a review of training studies suggests that without pelvic restraint they may yield weaker specific lumbar-extensor adaptations than isolated lumbar extension machines, because the hip extensors contribute heavily. The app's spinal_erectors coefficient of 1.0 for this exercise is a practical assumption, not a measured value.",
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
    text: "In trained lifters, leg press stopped at about 2 RIR and leg extension at about 1 RIR produced the same quadriceps growth as sets to momentary failure, with less acute fatigue.",
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
    text: "Progressing by reps at a fixed load and progressing load at fixed reps gave broadly similar quad and calf growth over 8 weeks (the study's straight-leg calf raise is mapped to standing_calf_raise); consistent with double progression.",
    refIds: [
      "plotkin2022_progression"
    ],
    indirect: false
  },
  {
    exerciseIds: [
      "leg_extension"
    ],
    text: "Dropping to once weekly with 2 sets in weeks 4 and 8 did not reduce quadriceps thickness or 10RM gains from unilateral leg extension in untrained men (the paired biceps curl variant was not specified, so it is not mapped).",
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
    text: "Acute data only: sets to failure slowed recovery of bar velocity and jump performance, out to roughly 24-48 h, compared with equal-volume non-failure sets.",
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
    text: "Acute data only: general, specific or combined warm-ups did not change total reps in 4 sets to failure at 80% 1RM compared with no warm-up.",
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
    text: "Acute data only: a short, heavy warm-up (5 reps at 80% of the 10RM load) allowed more total session volume than lighter, longer warm-ups; per exercise the difference was clear only for bench press.",
    refIds: [
      "viveiros2024_warmup_load"
    ],
    indirect: true
  },
  {
    exerciseIds: [
      "lat_pulldown"
    ],
    text: "Unilateral lat pulldown 10RM (strength-endurance, not muscle size) improved similarly with lengthened partials and full ROM upper-body training.",
    refIds: [
      "wolf2025_lengthened_partials"
    ],
    indirect: true
  }
];

export function evidenceForExercise(exerciseId: string): ExerciseEvidence[] {
  return EXERCISE_EVIDENCE.filter((e) => e.exerciseIds.includes(exerciseId));
}
