/**
 * Part 10: the CURATED formula dependency map — nodes (with their code location and rule ids) and the views. The tests
 * of a node are not listed here: the generator finds the test files that call it directly.
 * Every edge must be backed by the real code graph (scripts/formula-graph.mjs):
 *   kind 'call'  — the consumer references the provider directly (import + use);
 *   kind 'cond'  — the same, but only on a branch (the note says when);
 *   kind 'data'  — a value flows through a shared object: the provider's code (comments excluded) names `field`, the consumer
 *                  reads `.field`, and (unless the provider is a stored type) both reach a common caller within 3 references;
 *                  a text-level check — the meaning of each data edge was verified by hand (review 2026-11-24);
 *   kind 'agg'   — an aggregation into a hub (a direct reference too);
 *   kind 'ui'    — a screen reads the value (a direct reference, usually through useAnalysis).
 * `via` lists intermediate declarations when the link is a chain of direct references (each hop must exist).
 * Layers: A input · B set level · C exercise / muscle · D week · E planning & decisions · F screens.
 * Node kinds: input · formula · rule (a threshold-based decision) · aggregation · decision · ui.
 */

const D = 'src/domain/';
export const NODES = {
  // ---- A: input data (types; `fields` are the ones the formulas read)
  in_set: { layer: 'A', kind: 'input', label: 'Logged set\nkg · reps · RIR · effort tap\nfailure · type · side · time', ref: `${D}types#WorkoutSet` },
  in_ex: { layer: 'A', kind: 'input', label: 'Exercise entry\nexercise · machine\nconfiguration · order', ref: `${D}types#WorkoutExercise` },
  in_workout: { layer: 'A', kind: 'input', label: 'Workout\ndate · start / end · gym\nbusy machines', ref: `${D}types#Workout` },
  in_lib: { layer: 'A', kind: 'input', label: 'Exercise library\n(84 exercises, coefficients)', ref: 'src/data/exercises#SEED_EXERCISES' },
  in_body: { layer: 'A', kind: 'input', label: 'Weigh-ins\n(measured date + time)', ref: `${D}types#BodyMeasurement` },
  in_settings: { layer: 'A', kind: 'input', label: 'Settings\nquality model · targets\npriorities · planned moves', ref: `${D}types#Settings` },

  // ---- B: set level
  rir_range: { layer: 'B', kind: 'rule', label: 'Effort tap → RIR range\nEASY 3–4 · GOOD 1–3 …', ref: `${D}feedback#estimatedRirRange`, rules: ['feel_estimated_rir', 'unknown_effort'] },
  reported: { layer: 'B', kind: 'formula', label: 'Reported reserve\n(RIR, failure, tap)', ref: `${D}perception#reportedRir`, rules: ['failure_no_bonus'] },
  objective: { layer: 'B', kind: 'formula', label: 'Reserve from the numbers\nmin(Epley, Brzycki) · ≤ 20 reps\nnext-set drop · short rest', ref: `${D}perception#objectiveForSets`, rules: ['perception_check'] },
  cross: { layer: 'B', kind: 'rule', label: 'Answer vs numbers\n(ramp override ≤ 75 %)', ref: `${D}perception#crossCheck`, rules: ['perception_check'] },
  credit_rir: { layer: 'B', kind: 'rule', label: 'RIR → effort credit\n0–3: 1 · 4: 0.6 · 5: 0.3 …', ref: `${D}perception#creditForRir`, rules: ['rir_credit_table'] },
  assess: { layer: 'B', kind: 'formula', label: 'Set quality credit\neffort × technique × ROM\n× drop × < 5 reps', ref: `${D}quality#assessSet`, rules: ['rir_credit_table', 'compromised_technique', 'drop_and_low_reps', 'rom_partials', 'unknown_effort'] },
  warmups: { layer: 'B', kind: 'rule', label: 'Automatic warm-ups\n(no credit by the numbers)', ref: `${D}perception#reclassifyWarmups`, rules: ['warmup_by_reserve', 'warmups_not_counted'] },
  failure: { layer: 'B', kind: 'aggregation', label: 'Failure profile\n(share stopped before failure)', ref: `${D}failure#failureProfile`, rules: ['failure_share', 'failure_no_bonus'] },
  stopped: { layer: 'B', kind: 'rule', label: 'Stopped before failure?\n(RIR ≥ 1 or EASY / GOOD / HARD)', ref: `${D}failure#stoppedBeforeFailureInferred`, rules: ['failure_share'] },
  logset: { layer: 'B', kind: 'decision', label: 'logSet()\nsave · rest · re-tag warm-ups', ref: `${D}liveFlow#logSet`, rules: ['log_after_set'] },

  // ---- C: exercise / muscle
  registry: { layer: 'C', kind: 'formula', label: 'Exercise registry\n(library + custom + overrides)', ref: `${D}registry#buildRegistry`, rules: ['fractional_coefficients'] },
  coef: { layer: 'C', kind: 'rule', label: 'Coefficients\nlibrary · override · bench angle · grip', ref: `${D}registry#resolveCoefficients`, rules: ['fractional_coefficients', 'bench_angle_groups', 'supinated_vertical_pull'] },
  volume: { layer: 'C', kind: 'formula', label: 'Effective sets per muscle\ncoef × credit · sides paired', ref: `${D}volume#computeVolume`, rules: ['fractional_coefficients', 'regional_emphasis_not_added'] },
  taper: { layer: 'C', kind: 'rule', label: 'Per-session note\n(> ~11 sets, ×1 by default)', ref: `${D}quality#taperBeyondCap`, rules: ['session_taper'] },
  perf: { layer: 'C', kind: 'formula', label: 'Strength index\nRIR-adjusted Epley / reps', ref: `${D}progression#sessionPerf`, rules: ['index_scale', 'index_basis'] },
  preload: { layer: 'C', kind: 'rule', label: 'Session-order context\n(≥ 2 sets before → pre-loaded)', ref: `${D}preload#preloadFor`, rules: ['preload_context'] },
  bodyidx: { layer: 'C', kind: 'formula', label: 'Body + belt\n(weigh-in ≤ 28 days)', ref: `${D}bodyweight#bodyKgForIndex`, rules: ['index_scale'] },
  basewin: { layer: 'C', kind: 'rule', label: 'Base window\n≤3 → 24 h … > 12 → 72 h', ref: `${D}recovery#baseWindowHours`, rules: ['recovery_windows'] },
  recovery: { layer: 'C', kind: 'formula', label: 'Recovery windows\n(every session of 7 days,\nlatest end decides)', ref: `${D}recovery#estimateRecovery`, rules: ['recovery_windows'] },

  // ---- D: week
  weekly: { layer: 'D', kind: 'aggregation', label: 'Weekly buckets\n(partial first week)', ref: `${D}history#weeklyHistory`, rules: [] },
  volresp: { layer: 'D', kind: 'rule', label: 'Individual volume\n±1–2 on evidence', ref: `${D}volumeResponse#volumeDecision`, rules: ['volume_individual'] },
  targets: { layer: 'D', kind: 'formula', label: 'Weekly targets\n(reference → your level)', ref: `${D}targets#computeTargets`, rules: ['weekly_target_reference', 'volume_individual'] },
  usual: { layer: 'D', kind: 'rule', label: 'Usual training days\n(≥ ½ of 4 full weeks)', ref: `${D}weekPlan#usualTrainingDays`, rules: ['todays_share'] },
  fit: { layer: 'D', kind: 'decision', label: "Today's share\n(recovery-aware week fit)", ref: `${D}weekPlan#fitToday`, rules: ['todays_share'] },
  extra: { layer: 'D', kind: 'decision', label: 'Extra short session\n(≥ 2 on a muscle / ≥ 4)', ref: `${D}weekPlan#suggestExtraSession`, rules: ['todays_share'] },
  prog: { layer: 'D', kind: 'aggregation', label: 'Histories · trend · plateau\n(like with like)', ref: `${D}progression#buildProgression`, rules: ['plateau', 'single_bad_session', 'sustained_decline', 'index_basis'] },
  trend: { layer: 'D', kind: 'rule', label: 'Trend class\n±1 %/session · 6 in 8 weeks', ref: `${D}progression#classifyTrend`, rules: ['plateau', 'single_bad_session', 'sustained_decline'] },
  nextload: { layer: 'D', kind: 'decision', label: 'Double progression\nINCREASE / KEEP / REDUCE', ref: `${D}progression#suggestNextLoad`, rules: ['double_progression', 'benchmark_exclusion', 'rest_attribution'] },
  baseline: { layer: 'D', kind: 'formula', label: 'Baseline & progress %\n(first 28 days)', ref: `${D}baseline#strengthProgress`, rules: [] },
  analyze: { layer: 'D', kind: 'aggregation', label: 'analyze()\nthe week, per muscle:\ndone · target · left · today · recovery', ref: `${D}analysis#analyze`, rules: ['todays_share', 'weekly_target_reference'] },

  // ---- E: planning & decisions
  readiness: { layer: 'E', kind: 'rule', label: 'Operating mode\n& calibration', ref: `${D}readiness#readinessReport`, rules: ['planner_modes', 'planner_calibration'] },
  prescribe: { layer: 'E', kind: 'formula', label: 'Prescription\nsets · kg · reps · RIR · rest', ref: `${D}prescription#prescribe`, rules: ['presc_set_count', 'presc_rep_ranges', 'presc_rir_targets', 'presc_rest', 'presc_confidence'] },
  alloc: { layer: 'E', kind: 'formula', label: 'Set allocation\n(one routine, final order)', ref: `${D}planner#allocateSets`, rules: ['planner_session_allocation'] },
  planner: { layer: 'E', kind: 'decision', label: 'Next workout plan', ref: `${D}planner#generateWorkout`, rules: ['planner_session_allocation', 'exercise_order', 'planner_returning'] },
  replan: { layer: 'E', kind: 'decision', label: 'Live re-plan\n(from what was done)', ref: `${D}planner#replanPending`, rules: ['planner_live_reassessment'] },
  replace: { layer: 'E', kind: 'decision', label: 'Replacement options\n(same primary, free machine)', ref: `${D}planner#replacementOptions`, rules: [] },
  fatigue: { layer: 'E', kind: 'rule', label: 'Fatigue cost\nHIGH / MODERATE / LOW', ref: `${D}fatigue#fatigueCostOf`, rules: ['fatigue_cost'] },
  choice: { layer: 'E', kind: 'decision', label: 'Exercise choice\nrecovery · volume · fatigue\norder · decline · safety', ref: `${D}exerciseChoice#assessChoice`, rules: ['choice_status', 'exercise_order'] },
  choicelearn: { layer: 'E', kind: 'rule', label: 'Learning from overrides\n(≥ 2 of 3 held up)', ref: `${D}exerciseChoice#choiceOutcomes`, rules: ['choice_learning'] },
  upcoming: { layer: 'E', kind: 'formula', label: 'Upcoming usual sessions\n(usual exercises ≥ ½)', ref: `${D}sequence#upcomingSessions`, rules: ['next_session_interference'] },
  forward: { layer: 'E', kind: 'decision', label: 'Forward checks\nrecovery · interference\n≥ 12 h limit · < 4 weeks tips', ref: `${D}sequence#forwardChecks`, rules: ['next_session_interference'] },
  kept: { layer: 'E', kind: 'rule', label: 'Softening from Keep today\n(≥ 2 of 3 comparable ≥ 97 %)', ref: `${D}sequence#keptOutcome`, rules: ['next_session_interference'] },
  moveday: { layer: 'E', kind: 'decision', label: 'Best day to move to', ref: `${D}sequence#bestMoveDay`, rules: ['next_session_interference'] },
  partners: { layer: 'E', kind: 'rule', label: 'Usual pairs move together\n(≥ 70 % adjacent, last 6)', ref: `${D}sequence#movePartners`, rules: ['next_session_interference'] },
  moves: { layer: 'E', kind: 'formula', label: 'Open moves', ref: `${D}sequence#activeMoves`, rules: [] },
  habit: { layer: 'E', kind: 'formula', label: 'Habit line\n(held up / lower k of 3)', ref: `${D}sequence#forwardHabit`, rules: ['next_session_interference'] },
  optimality: { layer: 'E', kind: 'decision', label: 'Optimality score 0–100\n100 − points · caps\nnot today · less optimal · suitable', ref: `${D}optimality#optimality`, rules: ['exercise_optimality'] },
  rank: { layer: 'E', kind: 'formula', label: 'Ranking\n(group, score, familiarity, name)', ref: `${D}optimality#rankOptions`, rules: ['exercise_optimality'] },
  wcheck: { layer: 'E', kind: 'aggregation', label: 'Check the numbers\n(one workout, step by step)', ref: `${D}workoutCheck#workoutCheck`, rules: [] },

  // ---- F: screens
  ui_analysis: { layer: 'F', kind: 'ui', label: 'useAnalysis()\n(recomputed every minute)', ref: 'src/ui/hooks#useAnalysis' },
  ui_week: { layer: 'F', kind: 'ui', label: 'Week screen', ref: 'src/ui/pages/Dashboard#DashboardPage' },
  ui_moved: { layer: 'F', kind: 'ui', label: 'Moved card', ref: 'src/ui/pages/Dashboard#MovedCard' },
  ui_habitline: { layer: 'F', kind: 'ui', label: 'Habit line', ref: 'src/ui/pages/Dashboard#HabitLine' },
  ui_plan: { layer: 'F', kind: 'ui', label: 'Your next workout\n(plan card)', ref: 'src/ui/components/NextWorkout#NextWorkoutCard' },
  ui_itemrow: { layer: 'F', kind: 'ui', label: 'Plan item\n(Replace options)', ref: 'src/ui/components/NextWorkout#ItemRow' },
  ui_train: { layer: 'F', kind: 'ui', label: 'Training mode\n(Next exercise chooser)', ref: 'src/ui/pages/Train#TrainSession' },
  ui_sets: { layer: 'F', kind: 'ui', label: 'Training mode\nset entry', ref: 'src/ui/pages/Train#ExerciseScreens' },
  ui_overview: { layer: 'F', kind: 'ui', label: 'Training overview\n(Replace sheet)', ref: 'src/ui/pages/Train#Overview' },
  ui_picker: { layer: 'F', kind: 'ui', label: 'Exercise picker\n(dot · Best now · warning)', ref: 'src/ui/pages/Logger#ExercisePicker' },
  ui_check: { layer: 'F', kind: 'ui', label: 'History → Check the numbers', ref: 'src/ui/pages/WorkoutCheck#WorkoutCheckPage' },
  ui_strength: { layer: 'F', kind: 'ui', label: 'Strength screen', ref: 'src/ui/pages/Strength#StrengthPage' },
  ui_science: { layer: 'F', kind: 'ui', label: 'Science screen\n(principle vs number)', ref: 'src/ui/pages/Science#RuleList' },
  ui_rules_registry: { layer: 'A', kind: 'input', label: 'Rule registry\n(rules.ts, static data)', ref: 'src/data/scientific-evidence/rules#RULES' },
  targetp: { layer: 'E', kind: 'formula', label: 'Exercise target\nsets · kg · reps · RIR', ref: `${D}planner#targetFromPrescription`, rules: ['presc_set_count', 'presc_rir_targets'] },
  prefill: { layer: 'E', kind: 'formula', label: 'Pre-filled weight & reps\n(this session · last time · plan)', ref: `${D}liveFlow#prefillNext`, rules: ['log_after_set'] },
  wsource: { layer: 'E', kind: 'decision', label: 'Weight source\nsmart · copied', ref: `${D}liveFlow#weightSource`, rules: ['log_after_set'] },
  adapt: { layer: 'E', kind: 'rule', label: 'Remaining sets re-check\none step · more / fewer reps', ref: `${D}prescription#adaptRemaining`, rules: ['presc_set_by_set'] },
  offer: { layer: 'E', kind: 'decision', label: 'Offer after a set\nUse / Keep the plan', ref: `${D}liveFlow#nextSetsOffer`, rules: ['presc_set_by_set'] },
  prescrec: { layer: 'B', kind: 'formula', label: 'What was prescribed\n(stored per set)', ref: `${D}liveFlow#prescribedFor`, rules: [] },
  heldup: { layer: 'E', kind: 'rule', label: 'Held up? (comparable)\nreserve · rest · context · 97 %', ref: `${D}outcomes#heldUp`, rules: ['choice_learning'] },
  ui_rest: { layer: 'F', kind: 'ui', label: 'Training mode\nrest screen', ref: 'src/ui/pages/Train#RestScreen' },
  sessionend: { layer: 'C', kind: 'rule', label: 'Session end time\nend · start + duration\n· last set · 18:00 assumed', ref: `${D}dates#sessionEndVirtualMs`, rules: ['recovery_windows'] },
  weighins: { layer: 'C', kind: 'formula', label: 'Weigh-ins\n(valid, sorted)', ref: `${D}bodyweight#weighIns`, rules: [] },
  deload: { layer: 'D', kind: 'decision', label: 'Deload check', ref: `${D}reports#assessDeload`, rules: [] },
  mapspread: { layer: 'D', kind: 'formula', label: 'Plausible range\n(uncertain mappings)', ref: `${D}mappingUncertainty#mappingSpread`, rules: [] },
  rulechecks: { layer: 'E', kind: 'formula', label: 'Rules of thumb\nvs your data', ref: `${D}ruleChecks#ruleChecks`, rules: ['recovery_windows', 'exercise_order'] },
  ui_muscledetail: { layer: 'F', kind: 'ui', label: 'Week → muscle detail', ref: 'src/ui/pages/Dashboard#MuscleDetail' },
  ui_rulecheck: { layer: 'F', kind: 'ui', label: 'Settings → rules of thumb', ref: 'src/ui/pages/Settings#RuleChecksCard' },
  ui_progress: { layer: 'F', kind: 'ui', label: 'Strength → progress table', ref: 'src/ui/pages/Strength#ProgressTable' },
};

/** Edge helper: [from, to, kind?, note?, extra?] */
const e = (from, to, kind = 'call', note, extra = {}) => ({ from, to, kind, ...(note ? { note } : {}), ...extra });

export const VIEWS = [
  {
    id: 'overview', title: 'Overview — raw data to screens',
    intro: 'One node per formula family, left to right: input → set → exercise / muscle → week → decisions → screens.',
    edges: [
      e('in_set', 'assess', 'data', 'reads rir, effort, feel, technique, rom, type', { field: 'rir' }),
      e('in_set', 'objective', 'data', 'reads weightKg, reps, restSecBefore', { field: 'reps' }),
      e('in_settings', 'analyze', 'data', 'the quality model (credits, numbers check)', { field: 'quality' }),
      e('in_workout', 'sessionend', 'data', 'end time, else start + duration, else last ticked set', { field: 'endTime' }),
      e('in_body', 'weighins', 'data', 'weigh-ins (measured date + time)', { field: 'weightKg' }), e('weighins', 'bodyidx', 'call', 'the latest before the session, up to 28 days old', { via: ['src/domain/bodyweight#bodyWeightForSession'] }),
      e('rir_range', 'assess'), e('cross', 'assess'), e('credit_rir', 'assess'),
      e('objective', 'volume', 'cond', 'only when "check effort against the numbers" is on'),
      e('in_lib', 'registry'), e('registry', 'coef', 'data', 'each exercise’s contributions', { field: 'contributions' }), e('registry', 'analyze', 'agg'),
      e('assess', 'volume'), e('coef', 'volume'),
      e('volume', 'recovery'), e('sessionend', 'recovery'), e('volume', 'weekly'), e('volume', 'analyze', 'agg'),
      e('perf', 'prog'), e('bodyidx', 'analyze', 'call', 'passed into buildProgression as the body-weight callback'), e('prog', 'analyze', 'agg'), e('recovery', 'analyze', 'agg'), e('targets', 'analyze', 'agg'), e('weekly', 'analyze', 'agg'),
      e('fit', 'analyze', 'cond', 'only with usual days known, for a muscle still open and not held'), e('usual', 'analyze', 'agg'),
      e('analyze', 'ui_analysis', 'ui'),
      e('analyze', 'choice', 'data', 'planRecovery, muscles, progression', { field: 'planRecovery' }),
      e('analyze', 'upcoming', 'data', 'usual training days', { field: 'usualDays' }), e('upcoming', 'forward'),
      e('analyze', 'prescribe', 'data', 'muscles (today’s share)', { field: 'muscles' }),
      e('volume', 'prescribe', 'call', 'today’s volume recomputed (see audit C-9)'), e('volume', 'forward', 'call', 'today’s volume recomputed', { via: ['src/domain/sequence#doneToday'] }),
      e('in_workout', 'choice', 'data', 'the live session: done sets, busy machines', { field: 'busyEquipment' }),
      e('prescribe', 'planner'), e('prescribe', 'replan'), e('readiness', 'planner'), e('in_settings', 'planner', 'data', 'priority muscles first (×1.3 / ×0.6)', { field: 'priorities' }),
      e('choice', 'optimality'), e('forward', 'optimality'),
      e('ui_analysis', 'ui_week', 'ui'), e('planner', 'ui_plan', 'ui'), e('readiness', 'ui_plan', 'ui'), e('replan', 'ui_train', 'ui'), e('optimality', 'ui_train', 'ui'), e('optimality', 'ui_picker', 'ui'), e('choice', 'ui_picker', 'ui'), e('forward', 'ui_picker', 'ui'), e('forward', 'ui_plan', 'ui'),
      e('wcheck', 'ui_check', 'ui'), e('volume', 'wcheck'), e('assess', 'wcheck'),
      e('ui_rules_registry', 'ui_science', 'ui'),
    ],
  },
  {
    id: 'set-level', title: 'Set level — what one logged set is worth',
    intro: 'A set’s effort credit comes from the logged RIR, else the effort tap’s range, cross-checked against the numbers of the same exercise that day. The stored answer is never rewritten.',
    edges: [
      e('in_set', 'reported', 'data', 'rir, failure, effort', { field: 'rir' }),
      e('in_set', 'objective', 'data', 'weightKg, reps, restSecBefore', { field: 'reps' }),
      e('reported', 'objective'), e('reported', 'cross'),
      e('rir_range', 'assess'), e('cross', 'assess'), e('credit_rir', 'assess'),
      e('objective', 'warmups', 'cond', 'only when the numbers check is on (off: automatic tags are removed)'), e('cross', 'warmups'), e('credit_rir', 'warmups'),
      e('warmups', 'logset', 'call', 'after every log / edit / undo'),
      e('objective', 'volume', 'cond', 'only when the numbers check is on'), e('assess', 'volume'),
      e('assess', 'wcheck'), e('objective', 'wcheck'),
      e('logset', 'ui_sets', 'ui'), e('wcheck', 'ui_check', 'ui'),
      e('in_set', 'stopped', 'data', 'failure, rir, effort tap', { field: 'rir' }), e('stopped', 'failure', 'call', 'counted per set', { via: ['src/domain/failure#add'] }),
      e('failure', 'analyze', 'agg'),
    ],
  },
  {
    id: 'volume-week', title: 'Volume, weekly targets and today’s share',
    intro: 'Effective sets per muscle = coefficient × set credit, summed per week; targets start at the reference and follow the owner’s own response; today’s share fits the rest of the week outside the recovery windows.',
    edges: [
      e('coef', 'volume'), e('assess', 'volume'), e('taper', 'volume', 'call', 'called for every session; it changes a number only when the multiplier ≠ 1 (default ×1)'),
      e('volume', 'weekly'), e('weekly', 'analyze', 'agg'), e('volume', 'analyze', 'agg'),
      e('volresp', 'targets'), e('in_settings', 'targets', 'data', 'target overrides, priorities', { field: 'targetOverrides' }), e('targets', 'analyze', 'agg'),
      e('usual', 'analyze', 'agg'), e('basewin', 'fit', 'call', 'the later days’ windows', { via: ['src/domain/weekPlan#sessionWindowH', 'src/domain/weekPlan#bestLater'] }),
      e('fit', 'analyze', 'cond', 'only with usual days known, for a muscle still open and not held'),
      e('extra', 'analyze', 'cond', 'only with usual days known and not dismissed for the week'),
      e('recovery', 'analyze', 'agg'),
      e('analyze', 'ui_analysis', 'ui'), e('ui_analysis', 'ui_week', 'ui'), e('mapspread', 'ui_muscledetail', 'ui'), e('deload', 'ui_week', 'ui'),
    ],
  },
  {
    id: 'strength', title: 'Strength index, trend and double progression',
    intro: 'Like with like: one history per exercise × machine × configuration; the index is RIR-adjusted Epley (or reps for bodyweight), compared in the same session-order context.',
    edges: [
      e('perf', 'prog'), e('preload', 'prog'), e('trend', 'prog'), e('nextload', 'prog'),
      e('in_body', 'weighins', 'data', 'weigh-ins', { field: 'weightKg' }), e('weighins', 'bodyidx', 'call', 'latest before the session', { via: ['src/domain/bodyweight#bodyWeightForSession'] }),
      e('bodyidx', 'analyze', 'call', 'passed into buildProgression as the body-weight callback'),
      e('prog', 'analyze', 'agg'),
      e('trend', 'prescribe'), e('nextload', 'prescribe'), e('preload', 'prescribe'),
      e('prog', 'baseline', 'data', 'the history’s sessions', { field: 'sessions' }),
      e('analyze', 'ui_analysis', 'ui'), e('ui_analysis', 'ui_strength', 'ui'), e('baseline', 'ui_progress', 'ui'),
    ],
  },
  {
    id: 'planning', title: 'Planning and recommendation pipeline',
    intro: 'The plan is built from today’s open share; sets are sized by one routine in the final order; during the workout every exercise not started is re-prescribed from what was actually done.',
    edges: [
      e('analyze', 'prescribe', 'data', 'muscles (today’s share)', { field: 'muscles' }), e('volume', 'prescribe', 'call', 'today’s volume recomputed'),
      e('readiness', 'planner'), e('prescribe', 'planner'), e('alloc', 'planner'), e('fatigue', 'planner'), e('moves', 'planner', 'cond', 'moved exercises dated today or earlier'),
      e('in_settings', 'planner', 'data', 'priority muscles (×1.3 / ×0.6, first in the order)', { field: 'priorities' }),
      e('prescribe', 'replan'), e('alloc', 'replan'), e('volume', 'replan', 'call', 'what was actually done'),
      e('planner', 'ui_plan', 'ui'), e('readiness', 'ui_plan', 'ui'), e('replan', 'ui_train', 'ui'),
      e('replace', 'ui_plan', 'ui'), e('replace', 'ui_overview', 'ui'),
      e('fatigue', 'choice'), e('choicelearn', 'choice'), e('in_workout', 'choice', 'data', 'the live session: done sets, busy machines', { field: 'busyEquipment' }), e('choice', 'ui_picker', 'ui'),
    ],
  },
  {
    id: 'recovery-interference', title: 'Recovery and next-session interference',
    intro: 'Recovery holds a muscle only from EARLIER sessions; the forward checks look at the owner’s next usual sessions — recovery before a session that trains the muscle directly, and interference with a priority lift that uses it.',
    edges: [
      e('basewin', 'recovery'), e('volume', 'recovery'), e('in_workout', 'sessionend', 'data', 'end time', { field: 'endTime' }), e('sessionend', 'recovery'), e('recovery', 'analyze', 'agg'),
      e('analyze', 'choice', 'data', 'planRecovery (hours left)', { field: 'planRecovery' }),
      e('analyze', 'upcoming', 'data', 'usual training days', { field: 'usualDays' }),
      e('upcoming', 'forward'), e('kept', 'forward', 'cond', 'only an interference LIMIT can be softened'), e('coef', 'forward'), e('volume', 'forward', 'call', 'today’s done sets', { via: ['src/domain/sequence#doneToday'] }),
      e('basewin', 'moveday', 'call', 'session window', { via: ['src/domain/weekPlan#sessionWindowH'] }),
      e('upcoming', 'moveday'), e('upcoming', 'partners'), e('kept', 'habit'),
      e('forward', 'ui_picker', 'ui'), e('forward', 'ui_plan', 'ui'), e('moveday', 'ui_plan', 'ui'), e('partners', 'ui_plan', 'ui'),
      e('moves', 'ui_moved', 'ui'), e('habit', 'ui_habitline', 'ui'), e('moves', 'planner', 'cond', 'moved exercises dated today or earlier'),
      e('rulechecks', 'ui_rulecheck', 'ui'), e('basewin', 'rulechecks'),
    ],
  },
  {
    id: 'training', title: 'Training mode — set by set (restored 2026-11-24)',
    intro: 'The plan becomes a target per exercise; each set is pre-filled (with where the weight came from), logged with what was prescribed for it, and re-checked: a change of the remaining sets is offered, never applied silently.',
    edges: [
      e('prescribe', 'targetp', 'data', 'the prescription’s sets (reps, RIR)', { field: 'sets' }),
      e('targetp', 'prefill', 'data', 'target weight', { field: 'weightKg' }), e('in_ex', 'logset', 'data', 'the stored target of the exercise (reps, RIR per set)', { field: 'target' }),
      e('in_set', 'prefill', 'data', 'last time’s and this session’s sets', { field: 'weightKg' }),
      e('prefill', 'ui_sets', 'ui'), e('wsource', 'ui_sets', 'ui'),
      e('prescrec', 'logset', 'call', 'after the warm-up re-check; pairs share one', { via: ['src/domain/liveFlow#withPrescribed'] }), e('warmups', 'logset'),
      e('adapt', 'offer'), e('offer', 'ui_sets', 'ui'), e('offer', 'ui_rest', 'ui', 'passed down to the rest screen', { via: ['src/ui/pages/Train#ExerciseScreens'] }),
      e('logset', 'ui_sets', 'ui'),
    ],
  },
  {
    id: 'optimality', title: 'Exercise optimality score (Part 9)',
    intro: 'No new model: one deduction per existing finding, caps for missing data, a separate NOT TODAY group that never gets a number.',
    edges: [
      e('choice', 'optimality'), e('forward', 'optimality'),
      e('analyze', 'optimality', 'data', 'muscles (week met), usualDays', { field: 'usualDays' }),
      e('in_workout', 'optimality', 'data', 'busy machines, the live session', { field: 'busyEquipment' }),
      e('choicelearn', 'choice', 'cond', 'a softened primary hold costs 25 instead of NOT TODAY'), e('heldup', 'choicelearn'), e('heldup', 'kept'),
      e('kept', 'forward', 'cond', 'a softened interference is a tip (−10)'),
      e('optimality', 'rank', 'data', 'group, score, sessions', { field: 'score' }),
      e('rank', 'ui_train', 'ui'), e('rank', 'ui_picker', 'ui'), e('rank', 'ui_itemrow', 'ui'), e('rank', 'ui_overview', 'ui'),
      e('replace', 'ui_itemrow', 'call', 'options come from the plan card', { via: ['src/ui/components/NextWorkout#NextWorkoutCard'] }),
    ],
  },
];
