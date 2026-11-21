// Generated from the verified research pass (2026-11-21). See SCIENTIFIC_METHOD.md.
// Edit by hand only together with tests/evidence.test.ts; never add a reference without verifying its PMID and DOI.
import type { MuscleId } from '../../domain/types';

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

export const MUSCLE_EVIDENCE: Record<MuscleId, MuscleEvidence> = {
  chest: {
    muscle: "chest",
    summary: "The pectoralis major grows with presses, flys, pec deck and push-ups. At similar effort no chest exercise, and neither free weights nor machines, has clearly outperformed another.",
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: "Several small long-term trials show the pectoralis major grows with barbell bench press, load-matched push-ups, dumbbell press, dumbbell fly, pec deck, machine bench press and even prolonged daily stretching. With similar effort, no chest exercise or modality has clearly outperformed another, and meta-analyses find similar growth with free weights and machines.",
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
    limitation: "Mostly small, short trials. Regional (upper/lower) emphasis is covered separately and never added to the chest total."
  },
  upper_chest: {
    muscle: "upper_chest",
    summary: "Incline pressing may emphasise the upper pectoral region: one small long-term trial supports it, EMG results are mixed, and pec deck showed no regional emphasis. Plausible, not proven.",
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: "Only one long-term trial (untrained men, once weekly, angle not stated in the abstract) found incline pressing grew the upper pectoral site more than flat pressing. Pec deck grew the clavicular and sternocostal regions equally. Upper-chest emphasis from inclines is plausible, not proven.",
        refIds: [
          "chaves2020_incline",
          "pinto2025_pecdeck"
        ],
        indirect: false
      },
      {
        text: "Acute EMG and swelling studies mostly show inclines shifting work toward the clavicular head.",
        refIds: [
          "albarello2022_inclination",
          "cabral2022_hdemg_incline"
        ],
        indirect: true
      },
      {
        text: "Any best angle comes from EMG only, and the EMG results are mixed. One study found upper-pec EMG peaked near 30 degrees. Another found no difference across the whole lift, with inclines higher only in part of it. Above about 45 degrees the anterior deltoid takes over. No hypertrophy trial compares specific angles, which supports coarse angle groups rather than per-degree coefficients.",
        refIds: [
          "rodriguezridao2020_bench_angles",
          "lauver2016_bench_angle",
          "coratella2020_press_variations"
        ],
        indirect: true
      }
    ],
    limitation: "One long-term trial in untrained men; any best angle rests on EMG only. Display-only emphasis, never added to the chest total."
  },
  lower_chest: {
    muscle: "lower_chest",
    summary: "No long-term trial of decline pressing or lower-chest emphasis was found. EMG suggests flat pressing already covers the lower region.",
    evidenceLevel: "very_limited",
    indirectOnly: true,
    findings: [
      {
        text: "No long-term hypertrophy trial of decline pressing or lower-chest emphasis was found. In EMG studies, sternocostal and lower-pec excitation is as high or higher on flat and decline pressing than on steep inclines, and decline did not beat flat. Flat pressing appears to cover the lower region, and decline offers no proven extra growth. EMG only.",
        refIds: [
          "coratella2020_press_variations",
          "lauver2016_bench_angle",
          "rodriguezridao2020_bench_angles",
          "cabral2022_hdemg_incline"
        ],
        indirect: true
      }
    ],
    limitation: "EMG only; no hypertrophy data. Display-only emphasis, never added to the chest total."
  },
  lats: {
    muscle: "lats",
    summary: "The lats grow with resistance training (one small MRI trial in novices), but no long-term trial compares pulling exercises, grips or elbow paths. Exercise-choice evidence is acute EMG only.",
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: "Direct evidence that the latissimus dorsi grows with resistance training is thin: one small 8-week trial in novices showed increases in lat cross-sectional area (MRI) and fibre size (Paoli 2016). No long-term trial compares pulling exercises, grip widths, grip orientations or elbow paths for lat growth.",
        refIds: [
          "paoli2016_latissimus"
        ],
        indirect: false
      },
      {
        text: "Exercise-choice evidence is acute EMG only: grip-width effects are small and inconsistent (Andersen V 2014; Buonsenso 2025; Di Fonza 2026), an overhand grip gave slightly higher lat EMG than underhand in one pulldown study (Lusk 2010), pull-up and chin-up lat EMG were similar (Youdas 2010), and front pulldowns and rows with a narrower grip or less elbow flare were tied to higher lat EMG (Di Fonza 2026). No hypertrophy evidence favours one vertical pull or row over another; the 1.0 lat coefficient for these exercises is a practical estimate.",
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
    limitation: "Lat coefficients for pulldowns, pull-ups and rows are practical estimates."
  },
  upper_back: {
    muscle: "upper_back",
    summary: "No long-term size data for the rhomboids or middle trapezius were found. Rows and rear-delt-fly-like movements show high activation in EMG only.",
    evidenceLevel: "very_limited",
    indirectOnly: true,
    findings: [
      {
        text: "No long-term hypertrophy study measuring rhomboid or middle-trapezius size was found. Evidence is acute EMG only: seated rows gave the highest mid-trap/rhomboid activity among pulldowns and rows, and cueing scapular retraction did not change it (Lehman 2004); prone horizontal extension with external rotation (rear-delt-fly-like) strongly activated the middle trapezius (Ekstrom 2003); pulldown grip did not change middle-trapezius EMG (Lusk 2010; Buonsenso 2025). Coefficients for upper_back are assumptions; label as very limited evidence.",
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
    limitation: "EMG only; upper-back coefficients are assumptions."
  },
  traps: {
    muscle: "traps",
    summary: "Upper-trapezius hypertrophy has been shown in small, partly clinical studies. Ranking exercises for the traps (shrugs highest) rests on EMG.",
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: "The upper trapezius can hypertrophy with training: fibre-level growth after 10 weeks of strength training in women (Kadi 2000) and with specific neck/shoulder strength training in women with trapezius myalgia (Andersen LL 2014), and increased ultrasound thickness of the upper trapezius in trained men on general programmes (Bartolomei 2021). These studies are small, partly clinical, and do not compare exercises. Trap coefficients are practical estimates.",
        refIds: [
          "kadi2000_trapezius",
          "andersen2014_trapezius_rct",
          "bartolomei2021_split_traps"
        ],
        indirect: false
      },
      {
        text: "Exercise ranking rests on EMG: shrugs gave the highest upper-trap activation, with lateral raises and upright rows close behind at lighter loads (Andersen LL 2008; Ekstrom 2003).",
        refIds: [
          "andersen2008_trapezius_emg",
          "ekstrom2003_trapezius_emg"
        ],
        indirect: true
      }
    ],
    limitation: "Small studies that do not compare exercises; trap coefficients are practical estimates."
  },
  front_delts: {
    muscle: "front_delts",
    summary: "Bench pressing alone grew the anterior deltoid (MRI). Whether front-raise isolation adds growth on top of pressing is untested.",
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: "In a 10-week MRI trial, bench press alone grew the anterior deltoid more than no training, so pressing does train the front delts. A front-delt coefficient of about 0.5 for presses fits this. No trial tested whether adding front raises on top of pressing adds growth. Not prompting extra front-delt isolation when pressing volume is adequate is an inference, not a tested result.",
        refIds: [
          "lanza2024_bench_muscles"
        ],
        indirect: false
      },
      {
        text: "EMG agrees that presses and horizontal-adduction movements (incline and flat) strongly activate the anterior deltoid; one study found the shoulder press highest of four exercises. A higher value for steep incline or overhead pressing rests on EMG only and is an estimate.",
        refIds: [
          "rabello2024_deltoid_emg_sr",
          "campos2020_deltoid_emg",
          "coratella2022_overhead_press_emg"
        ],
        indirect: true
      }
    ],
    limitation: "One long-term trial; higher credit for steep incline or overhead pressing rests on EMG only."
  },
  side_delts: {
    muscle: "side_delts",
    summary: "Dumbbell and cable lateral raises grew the side delts similarly in one trial, and bench pressing grew them least of the muscles measured. Side-delt credit for overhead pressing is an EMG-based estimate.",
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: "One 8-week trial in trained lifters found dumbbell and cable lateral raises (ROM matched, sets to failure) both increased side-delt thickness by roughly 3-5%, with no meaningful difference between them. In a bench-press-only trial the side delt grew less than every other muscle measured.",
        refIds: [
          "larsen2025_lateral_raise",
          "lanza2024_bench_muscles"
        ],
        indirect: false
      },
      {
        text: "Side-delt EMG during bench press and fly is very low, so chest pressing should get little or no side-delt credit. Overhead pressing shows side-delt EMG approaching lateral-raise levels, but no hypertrophy trial confirms that it grows the side delt as much, so any press credit is an estimate.",
        refIds: [
          "lanza2024_bench_muscles",
          "campos2020_deltoid_emg",
          "coratella2020_lateral_raise_emg",
          "rabello2024_deltoid_emg_sr"
        ],
        indirect: true
      }
    ],
    limitation: "Few long-term trials; overhead-press credit is not confirmed by hypertrophy data."
  },
  rear_delts: {
    muscle: "rear_delts",
    summary: "No long-term posterior-deltoid hypertrophy trial passed our sourcing rules; all evidence is EMG.",
    evidenceLevel: "very_limited",
    indirectOnly: true,
    findings: [
      {
        text: "No long-term hypertrophy trial of the posterior deltoid passed our sourcing rules; evidence is EMG only. A systematic review ranked pull-ups and inverted rows highest for posterior-delt activation; on a reverse fly machine a neutral grip modestly increased posterior-delt EMG versus a pronated grip. Rear-delt coefficients for rows, reverse pec deck, rear-delt flys and face pulls are practical estimates; no face-pull study passed our sourcing rules.",
        refIds: [
          "rabello2024_deltoid_emg_sr",
          "schoenfeld2013_reverse_fly_grip",
          "campos2020_deltoid_emg"
        ],
        indirect: true
      }
    ],
    limitation: "EMG only; rear-delt coefficients for rows, reverse pec deck, rear-delt flys and face pulls are practical estimates."
  },
  biceps: {
    muscle: "biceps",
    summary: "Curls reliably grow the elbow flexors. Long-muscle-length emphasis tends to help, shoulder position matters only modestly, and compound pulls give real but smaller elbow-flexor growth.",
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: "Lat-pulldown-only training grew the elbow flexors about as much as curl-only training in untrained men over 10 weeks (Gentil 2015), supporting substantial (non-zero) biceps credit for vertical pulls; the exact 0.5 value remains a practical estimate, and the result may not transfer to trained lifters.",
        refIds: [
          "gentil2015_mj_vs_sj"
        ],
        indirect: false
      },
      {
        text: "EMG on whether an underhand grip adds biceps work is mixed: higher biceps EMG in chin-ups than pull-ups (Youdas 2010), but no grip effect on biceps EMG in pulldowns (Lusk 2010; Buonsenso 2025).",
        refIds: [
          "youdas2010_pullup_chinup",
          "lusk2010_pulldown_grip",
          "buonsenso2025_pulldown_variants"
        ],
        indirect: true
      },
      {
        text: "Curls reliably grow the elbow flexors over 5-12 weeks. Emphasis at long muscle length (elbow extended) tends to help: lengthened-range partials beat short-range partials for distal or overall elbow flexor growth (Pedrosa 2023, Sato 2021; Kassiano 2023 review). Shoulder position matters only modestly: incline curls favored the biceps somewhat and preacher curls the brachialis, with similar total elbow flexor growth (Kobayashi 2026); cable preacher vs shoulder-extended cable curls showed no significant difference (Attarieh 2025); barbell vs cable preacher curls grew the biceps similarly (Nunes 2020); an incline vs preacher trial in women found no significant between-group difference (Zabaleta-Korta 2023). Most trials are small, short and in untrained people.",
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
        text: "Brachialis (tracked under biceps in the app): measured separately in only a few trials. It grew with both curl types and somewhat more with preacher (shoulder-flexed) than incline curls by MRI (Kobayashi 2026); ultrasound showed no significant difference between cable preacher and shoulder-extended cable curls (Attarieh 2025). No long-term trial isolating hammer/neutral-grip curls for the brachialis was found.",
        refIds: [
          "kobayashi2026_incline_vs_preacher",
          "attarieh2025_preacher_vs_bayesian"
        ],
        indirect: false
      },
      {
        text: "Compound pulls grow the elbow flexors, but less than curls in a direct comparison (dumbbell rows about 5% vs curls about 11% thickness in 10 untrained men; Mannarino 2021). Adding curls/extensions to pulldowns and bench presses produced no detectable extra arm growth over 8-10 weeks in beginners or trained men (Gentil 2013; de França 2015), though those trials were small, short and one used only circumference. No biceps thickness change was detected after 24 weeks of bench press alone (Ogasawara 2012, n=7).",
        refIds: [
          "mannarino2021_curl_vs_row",
          "gentil2013_adding_single_joint",
          "defranca2015_single_joint_trained",
          "ogasawara2012_bench_press_arm"
        ],
        indirect: false
      },
      {
        text: "Elbow-flexor growth showed a volume dose-response in one trained-men RCT, but moderate (12-20) and high (>20) weekly volumes did not differ in pooled data. Lengthened partials matched full ROM, and stretched-range training beat short-range partials. Reduced-set deload weeks did not blunt growth in untrained men.",
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
    limitation: "Most trials are small, short and in untrained people. The brachialis is tracked under biceps."
  },
  triceps: {
    muscle: "triceps",
    summary: "Overhead elbow extensions grew the triceps about 1.4 times as much as neutral-arm extensions in one MRI trial, and pressing also grows the triceps. Volume and rest findings for the triceps are mixed.",
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: "Overhead (shoulder-flexed) cable elbow extensions grew the whole triceps about 1.4 times as much as neutral-arm (pushdown-like) extensions over 12 weeks, mostly via the long head, despite lighter loads (Maeo 2023, MRI). This is one well-controlled trial; it supports including an overhead extension alongside pushdowns. A mid-range partial study reported larger triceps gains than full ROM in trained men (Goto 2019, summarized in Kassiano 2023), but it is a single study with unusually large gains.",
        refIds: [
          "maeo2023_triceps_overhead",
          "kassiano2023_rom_review",
          "goto2019_partial_rom_triceps"
        ],
        indirect: false
      },
      {
        text: "Multi-joint pressing grows the triceps: bench press alone increased triceps thickness in untrained men (Ogasawara 2012, n=7, no control), and a multi-joint elbow-extensor exercise grew the triceps by MRI, unevenly along its length (Wakahara 2013). Adding direct arm work to a multi-joint program showed no significant extra arm circumference gain in trained men (de França 2015), an insensitive measure.",
        refIds: [
          "ogasawara2012_bench_press_arm",
          "wakahara2013_nonuniform_triceps",
          "defranca2015_single_joint_trained"
        ],
        indirect: false
      },
      {
        text: "Of the three muscles pooled by Baz-Valle 2022, only the triceps grew more with >20 than with 12-20 weekly sets (few trials), yet in one RCT higher volume did not significantly favour the elbow extensors. Lengthened partials and full ROM grew the triceps similarly, while one older study favoured mid-range partials. Longer rest showed only a non-significant trend.",
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
    limitation: "The overhead advantage rests on one well-controlled trial; the mid-range partial result is a single study."
  },
  forearms: {
    muscle: "forearms",
    summary: "Only one trial measured a forearm muscle (the brachioradialis grew with curls). No long-term trial of wrist curls, reverse curls or grip work was found.",
    evidenceLevel: "very_limited",
    indirectOnly: false,
    findings: [
      {
        text: "Brachioradialis (a forearm elbow flexor) grew about 13-18% by MRI after 12 weeks of dumbbell curls, somewhat more with preacher than incline curls (Kobayashi 2026). This is the only direct long-term forearm-size evidence found and covers one forearm muscle only; it gives some support for a small forearm credit from curls.",
        refIds: [
          "kobayashi2026_incline_vs_preacher"
        ],
        indirect: false
      },
      {
        text: "No long-term hypertrophy trial of the wrist flexors or extensors (wrist curls, reverse curls, grip work) in healthy adults was found among the verified sources. Forearm coefficients for wrist curls, reverse curls and carries are practical assumptions, not evidence-based.",
        refIds: [],
        indirect: true
      }
    ],
    limitation: "Forearm coefficients for wrist curls, reverse curls and carries are practical assumptions."
  },
  quads: {
    muscle: "quads",
    summary: "The best-studied muscle. The vasti grow with squats, leg press and leg extension; the rectus femoris grows mainly with leg extension. Full depth/ROM and stopping 1-2 RIR short of failure are supported.",
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: "Several long-term trials (mostly untrained participants, MRI or ultrasound) show that the vasti grow with squats, leg press and leg extension. Leg press and knee extension grew the vasti about equally, while one trial found squats grew the distal vastus lateralis more than leg extension. The rectus femoris grew clearly with leg extension but little or not at all with squats or leg press. Deep squats grew the front thigh more than shallow squats in one trial and similarly in another, and pooled studies favour full ROM for lower-limb growth. Leg extensions with a reclined hip (40 deg) grew the rectus femoris more than an upright 90 deg seat.",
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
        text: "Quadriceps are the best-studied muscle for general training variables: growth rose with weekly volume in trained men (Schoenfeld 2019 RCT), though 12-20 vs >20 weekly sets did not differ in pooled data (Baz-Valle 2022); stopping at 1-2 RIR matched momentary failure (Refalo 2024); 3-min rests beat 1-min rests in one RCT; full ROM or stretched-position partials beat short-length partials; rep and load progression grew the quads similarly.",
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
    limitation: "Mostly untrained participants and short trials."
  },
  hamstrings: {
    muscle: "hamstrings",
    summary: "Seated (hip-flexed) leg curls grew the hamstrings more than lying curls; squats and hip thrusts grew them little. No long-term RDL trial was found.",
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: "Seated leg curls (hip flexed) grew the hamstrings more than lying curls, mainly in the two-joint muscles. Hip-flexed eccentric curls grew them more than Nordics. A hip-extension exercise grew the biceps femoris long head more than Nordics. On MRI, squats and hip thrusts produced little or no hamstring growth, which supports giving squats no hamstring credit. No long-term trial of the Romanian deadlift itself was found.",
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
    limitation: "RDL and back-extension hamstring credit is inferred, not tested directly."
  },
  glutes: {
    muscle: "glutes",
    summary: "The gluteus maximus grows with many loaded hip-extension exercises. Hip thrusts and squats grew it similarly on MRI, and full squats beat half squats.",
    evidenceLevel: "moderate",
    indirectOnly: false,
    findings: [
      {
        text: "Gluteus maximus grows with many loaded hip-extension exercises (meta-analysis, moderate pooled effect). On MRI, hip thrusts and squats grew the glutes about equally, while one ultrasound study in trained women favoured squats. Full squats grew the glutes about three times more than half squats, and leg press grew them by about 15%.",
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
        text: "Higher acute glute EMG during hip thrusts did not translate into more growth.",
        refIds: [
          "contreras2015_hipthrust_squat_emg",
          "plotkin2023_hipthrust_vs_squat"
        ],
        indirect: true
      }
    ],
    limitation: "Trials disagree on hip thrust vs squat (MRI vs ultrasound, untrained vs trained)."
  },
  calves: {
    muscle: "calves",
    summary: "Standing calf raises grew the gastrocnemius far more than seated raises. Stretched-half partials and higher weekly volume helped in small trials.",
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: "A few small trials, mostly in untrained people, suggest three things. Standing (straight-knee) calf raises grew the gastrocnemius far more than seated raises, while the soleus grew similarly in both. Partials in the stretched half grew the medial gastrocnemius more than full or top-half reps. Twelve weekly sets beat six for most calf sites over 6 weeks.",
        refIds: [
          "kinoshita2023_standing_vs_seated_calf",
          "kassiano2023_calf_lengthened",
          "kassiano2024_calf_volume"
        ],
        indirect: false
      },
      {
        text: "Calf growth was similar with rep-based and load-based progression, and a one-week training break did not change triceps surae growth; evidence on general training variables for calves is thin.",
        refIds: [
          "plotkin2022_progression",
          "coleman2024_deload"
        ],
        indirect: false
      }
    ],
    limitation: "A few small trials, mostly in untrained people."
  },
  abs: {
    muscle: "abs",
    summary: "Direct long-term size evidence for the rectus abdominis is very thin. Exercise choice rests mostly on EMG, so ab targets and coefficients are practical assumptions.",
    evidenceLevel: "very_limited",
    indirectOnly: false,
    findings: [
      {
        text: "Direct long-term size evidence for the rectus abdominis is very thin. One RCT in older adults found 12 weeks of trunk strengthening enlarged the rectus abdominis on ultrasound. A 6-month MRI study in adolescent soccer players found that adding bodyweight stabilization work gave no extra trunk muscle growth. No trial in young trained lifters measuring rectus abdominis size after loaded crunch-type or hanging training was found.",
        refIds: [
          "shahtahmassebi2019_trunk",
          "hoshikawa2013_stabilization"
        ],
        indirect: false
      },
      {
        text: "Exercise choice rests mostly on EMG (activation, not growth), so the app's abs targets and coefficients are practical assumptions.",
        refIds: [
          "escamilla2006_abs_emg",
          "andersson1997_abs_hipflexor_emg",
          "juker1998_psoas_abwall_emg",
          "olivalozano2020_core_emg_sr"
        ],
        indirect: true
      },
      {
        text: "Spinal flexion versus hip flexion (EMG only): hip-flexion movements (sit-ups, leg lifts) strongly recruit the hip flexors (iliacus, psoas, rectus femoris), while curl-ups keep psoas low. Abdominal activity rises as the trunk curls further but falls with increasing angle in hip-flexion sit-ups; the abs are still clearly active in hip-flexion sit-ups and two-leg lifts. This is consistent with, but does not prove, the app's choice to give full ab credit only when trunk flexion or a posterior pelvic tilt is included; no growth comparison exists.",
        refIds: [
          "andersson1997_abs_hipflexor_emg",
          "juker1998_psoas_abwall_emg",
          "escamilla2006_abs_emg"
        ],
        indirect: true
      },
      {
        text: "Do squats and deadlifts grow the abs? In acute EMG, heavy squats and deadlifts raised erector activity but not lower-abdominal or external-oblique activity, and a plank gave more rectus abdominis activity than light-to-moderate squats or presses. One systematic review found free-weight exercises among the highest for rectus abdominis EMG, so results are mixed. No long-term trial shows squats or deadlifts enlarge the rectus abdominis; a coefficient of 0 or a minor value is an assumption consistent with these indirect data.",
        refIds: [
          "hamlyn2007_trunk_emg",
          "comfort2011_trunk_emg",
          "olivalozano2020_core_emg_sr"
        ],
        indirect: true
      }
    ],
    limitation: "No trial in young trained lifters measured ab size after loaded crunch-type or hanging training."
  },
  spinal_erectors: {
    muscle: "spinal_erectors",
    summary: "Long-term erector size data are scarce and mixed. Heavy lifts produce high erector EMG, but erector growth in lifters has not been demonstrated.",
    evidenceLevel: "very_limited",
    indirectOnly: false,
    findings: [
      {
        text: "Long-term size data on the erector spinae and multifidus are scarce and mixed. Trunk training enlarged multifidus in older adults; a 24-week back and core program in healthy firefighters did not; in low-back-pain patients 2 months of deadlifts changed multifidus thickness no more than low-load motor-control work; in adolescents added stabilization work gave no extra erector growth on MRI. No trial in young trained lifters measured erector size after back extensions, deadlifts or squats. Erector targets are rough assumptions.",
        refIds: [
          "shahtahmassebi2019_trunk",
          "mayer2015_firefighters_multifidus",
          "berglund2017_deadlift_multifidus",
          "hoshikawa2013_stabilization"
        ],
        indirect: false
      },
      {
        text: "Heavy free-weight lifts (squats, deadlifts, front squats) produce high erector spinae EMG, often above bodyweight back and core exercises; for the multifidus the picture is mixed (higher in free weights than ball/device work in one review, highest in traditional core exercises in another). Training studies suggest compound lifts and back extensions without pelvic restraint give smaller specific lumbar-extensor adaptations than isolated lumbar extension, and RDL training did not raise isolated lumbar extension torque. Activation and strength data only; fractional erector credit for these lifts is an assumption.",
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
    limitation: "Erector targets and coefficients are rough assumptions."
  },
  adductors: {
    muscle: "adductors",
    summary: "Adductor growth has been measured only as a secondary outcome (more with full squats, and more with squats than hip thrusts). No trial of the adduction machine was found.",
    evidenceLevel: "limited",
    indirectOnly: false,
    findings: [
      {
        text: "Adductor growth has been measured only as a secondary outcome in squat, leg-press and hip-thrust trials. Adductors grew with both squat depths, significantly more with full squats; the adductor magnus grew with leg press but not with knee extension; and squats grew the adductors more than hip thrusts. No long-term trial of the hip adduction machine was found, so there is no direct evidence for adductor isolation work.",
        refIds: [
          "kubo2019_squatdepth",
          "kinoshita2026_legext_vs_legpress",
          "plotkin2023_hipthrust_vs_squat"
        ],
        indirect: false
      }
    ],
    limitation: "No direct evidence for adductor isolation work."
  }
};
