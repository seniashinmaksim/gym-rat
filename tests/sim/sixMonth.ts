/**
 * Deterministic SIX-MONTH synthetic training history (26 weeks, Mon 2026-05-25 → Sun 2026-11-22).
 * Synthetic data only — no real person, no real gym. Fixed seed → identical output on every run.
 *
 * Realism on purpose: 2–4 sessions/week on varying weekdays and times, varying exercise order,
 * noisy reps, RIR 0–3, failure / stopped-before sets, occasional technique problems, rest 60–210 s,
 * warm-ups on the big lifts, two gyms with different machines and stack increments.
 *
 * Built-in scenarios (the test file checks the app against each):
 *  A  consistent progression   incline DB press, pec deck (gym A), leg extension, EZ curl, pull-ups, squat
 *  B  missed training          week 7: 2 consecutive sessions missed · week 11: whole week · weeks 17–18
 *  C  performance decline      straight-bar pushdown on cable A from week 19: fewer reps, lower RIR,
 *                              worse technique, shorter rest
 *  D  accidental weights       lateral raise too light (wk 6) / too heavy + bad technique (wk 14),
 *                              incline DB press too light (wk 20)
 *  E  progress + poor recovery weeks 23–24: short sleep, fatigue 4/5, soreness; squat still improves,
 *                              chest work declines
 *  P  plateau                  Romanian deadlift stuck at the same load and reps from week 12
 * Plus: 26 weeks of body weight (morning/evening, late entries, several per day, gaps, slow gain with a
 * stable phase), waist every ~4 weeks, progress-photo metadata, bodyweight → weighted pull-ups with two
 * grip widths, a session that crosses midnight, equipment identified later, per-side cable laterals.
 */
import type { AppData } from '../../src/domain/appdata';
import { defaultSettings } from '../../src/domain/defaults';
import type { BodyMeasurement, DailyLog, Equipment, Location, Photo, Variation, Workout, WorkoutExercise, WorkoutSet } from '../../src/domain/types';

export const SIM_START = '2026-05-25'; // Monday, week 1
export const SIM_WEEKS = 26;
export const SIM_END = '2026-11-22'; // Sunday, week 26

// ---------------------------------------------------------------- deterministic helpers

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dayAdd(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const weekStartOf = (week: number) => dayAdd(SIM_START, (week - 1) * 7);
const pad = (n: number) => String(n).padStart(2, '0');
const hm = (min: number) => `${pad(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad(((min % 60) + 60) % 60)}`;

// ---------------------------------------------------------------- gyms & equipment

const T0 = '2026-05-25T08:00:00Z';
export const LOCATIONS: Location[] = [
  { id: 'gym_a', name: 'Synthetic Gym A', photoIds: [], freeWeightIncrementsKg: [2.5], createdAt: T0 },
  { id: 'gym_b', name: 'Synthetic Gym B', photoIds: [], freeWeightIncrementsKg: [2], createdAt: '2026-07-20T08:00:00Z' },
];

function eq(id: string, locationId: string, name: string, kind: Equipment['kind'], inc: number[], exerciseIds: string[], extra: Partial<Equipment> = {}): Equipment {
  return {
    id, locationId, name, kind, manufacturer: null, model: null, identified: false, incrementsKg: inc, settings: {}, exerciseIds,
    photoIds: [], createdAt: T0, updatedAt: T0, ...extra,
  };
}

export const EQUIPMENT: Equipment[] = [
  eq('pd_a', 'gym_a', 'Pec deck A', 'machine', [5], ['pec_deck'], { manufacturer: 'Technogym (synthetic)', identified: true, settings: { seat: '4' }, photoIds: ['ph_pd_a'] }),
  eq('cable_a', 'gym_a', 'Cable station A', 'cable', [2.5], ['triceps_pushdown_bar', 'cable_lateral_raise']),
  eq('legext_a', 'gym_a', 'Leg extension A', 'machine', [5], ['leg_extension'], { settings: { seat: '3', 'shin pad': '2' } }),
  eq('mbc_a', 'gym_a', 'Biceps curl machine A', 'machine', [5], ['machine_biceps_curl'], { settings: { seat: '2' } }),
  eq('slc_a', 'gym_a', 'Seated leg curl A', 'machine', [5], ['seated_leg_curl']),
  eq('ez_a', 'gym_a', 'EZ bar A', 'barbell', [2.5], ['ez_bar_curl'], { barWeightKg: 10 }),
  eq('straps_a', 'gym_a', 'Ab straps A', 'bodyweight', [], ['hanging_knee_raise_pelvic_curl']),
  // Gym B: different machines. pd_b is first unknown (week 9) and identified in week 15 — same id, same history.
  eq('pd_b', 'gym_b', 'Pec deck B', 'machine', [2.5], ['pec_deck'], {
    manufacturer: 'Synthetic Make', model: 'Fly 2', identified: true, photoIds: ['ph_pd_b'], createdAt: '2026-07-20T08:00:00Z', updatedAt: '2026-09-02T08:00:00Z',
    notes: 'Added week 9 as "make unknown"; identified from the photo in week 15.',
  }),
  eq('cable_b', 'gym_b', 'Cable station B', 'cable', [5], ['triceps_pushdown_bar', 'cable_lateral_raise'], { createdAt: '2026-07-20T08:00:00Z' }),
  eq('llc_b', 'gym_b', 'Lying leg curl B', 'machine', [5], ['lying_leg_curl'], { createdAt: '2026-07-20T08:00:00Z' }),
  eq('legext_b', 'gym_b', 'Leg extension B', 'machine', [7], ['leg_extension'], { createdAt: '2026-07-20T08:00:00Z' }),
];

// ---------------------------------------------------------------- exercise models

interface Lift {
  id: string;
  /** Equipment per gym; undefined → free weights (no equipment id). */
  eq?: { gym_a?: string; gym_b?: string };
  range: [number, number];
  w0: number;
  /** Load step per gym (dumbbells use the gym's steps). */
  step: { gym_a: number; gym_b: number };
  sets: number;
  loadMode?: WorkoutSet['loadMode'];
  variation?: Variation;
  warmups?: [number, number][]; // [fraction of working load, reps]
  perSide?: boolean;
  bodyweight?: boolean;
}

const L: Record<string, Lift> = {
  incline: { id: 'incline_dumbbell_press', range: [8, 12], w0: 22.5, step: { gym_a: 2.5, gym_b: 2 }, sets: 3, variation: { benchAngleDeg: 30 }, warmups: [[0.5, 10], [0.75, 5]] },
  pecdeck: { id: 'pec_deck', eq: { gym_a: 'pd_a', gym_b: 'pd_b' }, range: [10, 15], w0: 45, step: { gym_a: 5, gym_b: 2.5 }, sets: 3 },
  latraise: { id: 'lateral_raise', range: [12, 20], w0: 10, step: { gym_a: 2.5, gym_b: 2 }, sets: 3 },
  cablelat: { id: 'cable_lateral_raise', eq: { gym_a: 'cable_a', gym_b: 'cable_b' }, range: [12, 20], w0: 5, step: { gym_a: 2.5, gym_b: 5 }, sets: 2, perSide: true, variation: { unilateral: true } },
  pushdown: { id: 'triceps_pushdown_bar', eq: { gym_a: 'cable_a', gym_b: 'cable_b' }, range: [10, 15], w0: 30, step: { gym_a: 2.5, gym_b: 5 }, sets: 3 },
  mcurl: { id: 'machine_biceps_curl', eq: { gym_a: 'mbc_a' }, range: [10, 12], w0: 35, step: { gym_a: 5, gym_b: 5 }, sets: 3 },
  ezcurl: { id: 'ez_bar_curl', eq: { gym_a: 'ez_a' }, range: [8, 12], w0: 30, step: { gym_a: 2.5, gym_b: 2 }, sets: 3, variation: { position: 'standing' } },
  squat: { id: 'back_squat', range: [6, 10], w0: 80, step: { gym_a: 2.5, gym_b: 2.5 }, sets: 3, warmups: [[0.25, 10], [0.6, 5], [0.8, 3]] },
  legext: { id: 'leg_extension', eq: { gym_a: 'legext_a', gym_b: 'legext_b' }, range: [10, 15], w0: 50, step: { gym_a: 5, gym_b: 7 }, sets: 3 },
  rdl: { id: 'romanian_deadlift', range: [8, 10], w0: 70, step: { gym_a: 5, gym_b: 5 }, sets: 3, warmups: [[0.6, 6]] },
  slc: { id: 'seated_leg_curl', eq: { gym_a: 'slc_a' }, range: [10, 12], w0: 40, step: { gym_a: 5, gym_b: 5 }, sets: 3 },
  llc: { id: 'lying_leg_curl', eq: { gym_b: 'llc_b' }, range: [10, 12], w0: 30, step: { gym_a: 5, gym_b: 5 }, sets: 3 },
  straps: { id: 'hanging_knee_raise_pelvic_curl', eq: { gym_a: 'straps_a' }, range: [10, 20], w0: 0, step: { gym_a: 0, gym_b: 0 }, sets: 2, bodyweight: true, loadMode: 'bodyweight_plus' },
  legraise: { id: 'hanging_leg_raise', range: [8, 15], w0: 0, step: { gym_a: 0, gym_b: 0 }, sets: 2, bodyweight: true, loadMode: 'bodyweight_plus' },
  pullBW: { id: 'pull_up', range: [6, 12], w0: 0, step: { gym_a: 0, gym_b: 0 }, sets: 3, bodyweight: true, loadMode: 'bodyweight_plus', variation: { loading: 'bodyweight', gripWidth: 'shoulder' } },
  pullBWwide: { id: 'pull_up', range: [5, 10], w0: 0, step: { gym_a: 0, gym_b: 0 }, sets: 2, bodyweight: true, loadMode: 'bodyweight_plus', variation: { loading: 'bodyweight', gripWidth: 'wide' } },
  pullW: { id: 'pull_up', range: [5, 8], w0: 5, step: { gym_a: 2.5, gym_b: 2.5 }, sets: 3, loadMode: 'bodyweight_plus', variation: { loading: 'weighted', gripWidth: 'wide' } },
};

const TEMPLATES: Record<'gym_a' | 'gym_b', string[][]> = {
  gym_a: [
    ['incline', 'pecdeck', 'latraise', 'squat', 'slc', 'pushdown', 'straps'],
    ['PULL', 'legext', 'rdl', 'mcurl', 'cablelat', 'pecdeck', 'straps'],
    ['incline', 'PULL', 'squat', 'slc', 'ezcurl', 'pushdown', 'latraise'],
  ],
  gym_b: [
    ['incline', 'pecdeck', 'latraise', 'squat', 'llc', 'pushdown', 'legraise'],
    ['PULL', 'legext', 'rdl', 'ezcurl', 'cablelat', 'pecdeck', 'legraise'],
  ],
};

// Weekday offsets (0 = Monday) per week; [] = missed week. Scenario B lives here.
const DAY_PATTERNS = [[0, 2, 4], [0, 1, 3, 5], [1, 3, 6], [0, 2, 4, 6], [1, 4, 6], [0, 3, 5]];
export const MISSED = { week7Sessions: [0], emptyWeeks: [11, 17, 18] };
const GYM_B_WEEKS = new Set([9, 10, 15, 16, 22]);
export const POOR_RECOVERY_WEEKS = new Set([23, 24]);

// ---------------------------------------------------------------- generator

export interface SimMeta {
  /** Sessions the simulated person intended (3–4/week) vs performed — "missed" is a simulation fact, not app data. */
  planned: number;
  performed: number;
  wrongWeightSetIds: string[];
  midnightWorkoutId: string;
  typoWorkoutId: string;
  typoSetId: string;
}

export function generateSixMonths(seed = 20261121): { data: AppData; meta: SimMeta } {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const noise = () => (rnd() < 0.2 ? -1 : rnd() < 0.1 ? 1 : 0);
  let n = 0;
  const id = (p: string) => `${p}${(n++).toString(36)}`;

  const state = new Map<string, { w: number; base: number; topHits: number }>();
  const workouts: Workout[] = [];
  const meta: SimMeta = { planned: 0, performed: 0, wrongWeightSetIds: [], midnightWorkoutId: '', typoWorkoutId: '', typoSetId: '' };
  let rot = { gym_a: 0, gym_b: 0 };

  for (let week = 1; week <= SIM_WEEKS; week++) {
    const pattern = DAY_PATTERNS[(week * 7 + Math.floor(rnd() * 3)) % DAY_PATTERNS.length];
    meta.planned += pattern.length;
    let days = pattern;
    if (MISSED.emptyWeeks.includes(week)) days = [];
    if (week === 7) days = MISSED.week7Sessions; // the next two planned sessions were missed
    for (const [si, dow] of days.entries()) {
      const date = dayAdd(weekStartOf(week), dow);
      const gym: 'gym_a' | 'gym_b' = GYM_B_WEEKS.has(week) || (week === 20 && si === 1) ? 'gym_b' : 'gym_a';
      const tpl = [...TEMPLATES[gym][rot[gym]++ % TEMPLATES[gym].length]];
      // Different exercise order: swap a random adjacent pair half of the time.
      if (rnd() < 0.5) { const i = Math.floor(rnd() * (tpl.length - 1)); [tpl[i], tpl[i + 1]] = [tpl[i + 1], tpl[i]]; }
      const poor = POOR_RECOVERY_WEEKS.has(week);
      const midnight = week === 13 && si === 1;
      let startMin = midnight ? 23 * 60 + 20 : pick([6 * 60 + 30, 7 * 60 + 15, 12 * 60, 17 * 60 + 30, 18 * 60 + 15, 19 * 60 + 40]);
      let clock = startMin;
      const exercises: WorkoutExercise[] = [];

      for (const slot of tpl) {
        const liftKey = slot === 'PULL' ? (week <= 10 ? (week % 3 === 0 ? 'pullBWwide' : 'pullBW') : (week % 4 === 0 ? 'pullBW' : 'pullW')) : slot;
        const lift = L[liftKey];
        const eqId = lift.eq?.[gym] ?? null;
        const sk = `${lift.id}|${eqId ?? 'free'}|${JSON.stringify(lift.variation ?? {})}`;
        // A different machine at gym B starts at a different stack number (on that machine's own steps).
        const stepB = lift.step.gym_b || 1;
        if (!state.has(sk)) state.set(sk, { w: gym === 'gym_b' && eqId ? Math.round((lift.w0 * 0.9) / stepB) * stepB : lift.w0, base: lift.range[0] + 1, topHits: 0 });
        const st = state.get(sk)!;
        const [lo, hi] = lift.range;
        const sets: WorkoutSet[] = [];
        // Warm-ups (never counted)
        for (const [f, r] of lift.warmups ?? []) {
          sets.push(mk(Math.round((st.w * f) / 2.5) * 2.5, r, null, { type: 'warmup', restSecBefore: null }));
        }
        // Scenario modifiers
        const decline = lift.id === 'triceps_pushdown_bar' && eqId === 'cable_a' && week >= 19;
        const chestDown = poor && (lift.id === 'pec_deck' || lift.id === 'incline_dumbbell_press');
        const plateau = lift.id === 'romanian_deadlift' && week >= 12;
        const afterBreak = week === 19 || week === 12;
        const nSets = lift.sets;
        for (let i = 0; i < (lift.perSide ? nSets * 2 : nSets); i++) {
          const k = lift.perSide ? Math.floor(i / 2) : i;
          let reps = Math.max(1, st.base - k + noise() - (afterBreak ? 1 : 0) - (chestDown ? 2 : 0));
          let rir: number | null = k === nSets - 1 ? (rnd() < 0.35 ? 0 : 1) : pick([1, 2, 2, 3]);
          let rest = pick([90, 120, 120, 150, 180, 210]);
          const extra: Partial<WorkoutSet> = {};
          if (plateau) { reps = [8, 8, 7][k] ?? 7; rir = 2; }
          if (decline) {
            const sinceStart = workouts.filter((x) => x.date >= weekStartOf(19)).length;
            reps = Math.max(5, hi - 3 - Math.floor(sinceStart / 3) - k);
            rir = k === 0 ? 1 : 0;
            rest = Math.max(55, 120 - sinceStart * 4);
            if (k === nSets - 1 && sinceStart > 4) { extra.technique = 'compromised'; extra.technicalFailure = true; }
            else if (sinceStart > 2) extra.technique = 'slightly_degraded';
          }
          if (chestDown) rir = k === 0 ? 1 : 0;
          if (rir === 0 && k === nSets - 1 && !decline) { extra.failure = 'muscular'; }
          else if (rir != null && rir >= 2 && rnd() < 0.3) extra.failure = 'none';
          if (lift.bodyweight && rnd() < 0.15 && k === nSets - 1) { rir = null; extra.failure = 'uncertain'; }
          const set = mk(lift.bodyweight ? 0 : st.w, reps, rir, { restSecBefore: i === 0 || (lift.perSide && i % 2 === 1) ? null : rest, loadMode: lift.loadMode ?? 'total', ...extra, ...(lift.perSide ? { side: i % 2 === 0 ? 'left' : 'right' } : {}) });
          sets.push(set);
        }
        // Scenario D: accidental weights
        if (lift.id === 'lateral_raise' && week === 6 && sets.length > 1) {
          const s = sets[1];
          Object.assign(s, { weightKg: st.w - 5, intendedWeightKg: st.w, reps: hi, rir: 4, weightAccuracy: 'too_light', feel: 'wrong_light', failure: undefined });
          meta.wrongWeightSetIds.push(s.id);
        }
        if (lift.id === 'lateral_raise' && week === 14) {
          const s = sets[0];
          Object.assign(s, { weightKg: st.w + 5, intendedWeightKg: st.w, reps: 7, rir: 0, weightAccuracy: 'too_heavy', feel: 'wrong_heavy', technique: 'compromised', failure: undefined });
          meta.wrongWeightSetIds.push(s.id);
        }
        if (lift.id === 'incline_dumbbell_press' && week === 20 && si === 0) {
          const s = sets.find((x) => x.type === 'working')!;
          Object.assign(s, { weightKg: st.w - 7.5, intendedWeightKg: st.w, reps: 18, rir: 3, weightAccuracy: 'too_light', feel: 'wrong_light', failure: undefined });
          meta.wrongWeightSetIds.push(s.id);
        }
        // Timestamps
        for (const s of sets) { clock += s.type === 'warmup' ? 2 : 3; }
        exercises.push({
          id: id('e'), order: exercises.length, exerciseId: lift.id, exerciseConfidence: 'confirmed', equipmentId: eqId, equipmentConfidence: eqId ? 'confirmed' : 'unknown',
          ...(lift.variation ? { variation: { ...lift.variation } } : {}), sets,
          ...(eqId === 'pd_a' ? { settings: { seat: '4' } } : {}),
        });
        // Double progression as the simulated person follows it (not the app's code).
        const work = sets.filter((s) => s.type === 'working' && !s.weightAccuracy);
        const allTop = work.length > 0 && work.every((s) => (s.reps ?? 0) >= hi);
        if (!decline && !plateau && !chestDown) {
          st.topHits = allTop ? st.topHits + 1 : 0;
          if (st.topHits >= 2 && !lift.bodyweight) { const w1 = st.w + lift.step[gym];
            // Same estimated strength at the heavier load (Epley): 12.5 kg × 22 → 15 kg × ~17, 80 kg × 12 → 82.5 kg × ~11.
            st.base = Math.max(lo + 1, Math.round(((st.w * (1 + st.base / 30)) / w1 - 1) * 30));
            st.w = w1; st.topHits = 0; }
          // Reps drop ~1 per set, so the first set has to reach hi + (sets − 1) before ALL sets reach hi.
          // A trained lifter: roughly one extra rep every 3–4 sessions (≈ +10–30 % estimated strength in 6 months).
          else if (st.base < hi + lift.sets - 1 && rnd() < (POOR_RECOVERY_WEEKS.has(week) && lift.id !== 'back_squat' ? 0.08 : 0.28)) st.base++;
          if (lift.bodyweight && st.base > hi + 2) st.base = hi + 2;
        }
        if (decline) st.topHits = 0;
      }
      const dur = Math.max(45, clock - startMin + pick([0, 5, 10]));
      const w: Workout = {
        id: id('w'), schemaVersion: 1, date, startTime: hm(startMin), endTime: hm(startMin + dur), durationMin: dur,
        locationId: gym, locationConfidence: 'confirmed', exercises, source: 'live', finishedAt: `${date}T23:59:00Z`,
        createdAt: `${date}T${hm(startMin)}:00Z`, updatedAt: `${date}T${hm(startMin)}:00Z`,
        ...(poor ? { wellness: { fatigue: 4, sleepHours: 5.2, soreness: { chest: 3, quads: 2 } } } : {}),
      };
      if (midnight) meta.midnightWorkoutId = w.id;
      workouts.push(w);
      meta.performed++;
    }
  }

  // Journey 7 material: a typo (250 kg instead of 50) on a pec deck set in week 21 — corrected by the test.
  const typoW = workouts.find((w) => w.date >= weekStartOf(21) && w.exercises.some((e) => e.equipmentId === 'pd_a'))!;
  const typoEx = typoW.exercises.find((e) => e.equipmentId === 'pd_a')!;
  const typoSet = typoEx.sets.find((s) => s.type === 'working')!;
  meta.typoWorkoutId = typoW.id;
  meta.typoSetId = typoSet.id;

  // ---------------------------------------------------------------- body weight, waist, photos, daily logs
  const body: BodyMeasurement[] = [];
  const brnd = mulberry32(seed + 1);
  for (let d = 0; d < SIM_WEEKS * 7; d++) {
    const date = dayAdd(SIM_START, d);
    const week = Math.floor(d / 7) + 1;
    if (brnd() < 0.18) continue; // missing days
    // Gradual gain 76.0 → ~79.0 with a stable phase in weeks 10–15.
    const trendKg = 76 + Math.min(d, 63) * 0.022 + Math.max(0, d - 105) * 0.02;
    const daily = Math.round((trendKg + (brnd() - 0.5) * 1.2) * 10) / 10;
    const late = brnd() < 0.12; // typed in 1–3 days later
    body.push({
      id: id('bw'), date, time: '07:0' + Math.floor(brnd() * 10), condition: 'morning_fasted', weightKg: daily, photoIds: [],
      enteredAt: late ? `${dayAdd(date, 1 + Math.floor(brnd() * 3))}T21:00:00Z` : `${date}T07:10:00Z`,
    });
    if (brnd() < 0.15) body.push({ id: id('bw'), date, time: '21:30', condition: 'evening', weightKg: Math.round((daily + 0.9) * 10) / 10, photoIds: [], enteredAt: `${date}T21:31:00Z` });
    if (d % 28 === 0) body.push({ id: id('bw'), date, time: '07:30', waistCm: 82 + week * 0.04, photoIds: [`ph_prog_${week}`], enteredAt: `${date}T07:31:00Z` });
  }
  // One weigh-in with a time but no condition, and an old-style date-only entry.
  body.push({ id: id('bw'), date: dayAdd(SIM_START, 40), time: null, weightKg: 77.1, photoIds: [] });

  const photos: Photo[] = [
    { id: 'ph_pd_a', kind: 'equipment', ownerId: 'pd_a', mime: 'image/jpeg', takenAt: T0 },
    { id: 'ph_pd_b', kind: 'equipment', ownerId: 'pd_b', mime: 'image/jpeg', takenAt: '2026-09-02T08:00:00Z' },
    ...body.flatMap((b) => b.photoIds.map((p): Photo => ({ id: p, kind: 'progress', ownerId: b.id, mime: 'image/jpeg', takenAt: `${b.date}T07:30:00Z`, pose: 'front' }))),
  ];

  const daily: DailyLog[] = [];
  for (const week of POOR_RECOVERY_WEEKS) for (let k = 0; k < 7; k++) {
    const date = dayAdd(weekStartOf(week), k);
    daily.push({ id: date, date, sleepHours: 5.1, sleepQuality: 2, fatigue: 4, energy: 2, soreness: { chest: 3, quads: 2, hamstrings: 1 } });
  }

  const settings = { ...defaultSettings(), timezone: 'UTC', learning: { startDate: SIM_START, endedOn: null, lengthDays: 30 } };
  const data: AppData = {
    settings, workouts, locations: LOCATIONS.map((l) => ({ ...l })), equipment: EQUIPMENT.map((e) => ({ ...e, settings: { ...e.settings } })),
    exerciseOverrides: [], customExercises: [], photos, body, daily, blocks: [], imports: [], snapshots: [],
  };
  return { data, meta };

  function mk(weight: number | null, reps: number | null, rir: number | null, extra: Partial<WorkoutSet> = {}): WorkoutSet {
    return { id: id('s'), type: 'working', weightKg: weight, loadMode: 'total', reps, rir, rirSource: rir == null ? 'unknown' : 'reported', restSecBefore: null, ...extra };
  }
}

/** Workouts up to and including `date` (what the app would have known on that day). */
export function asOf(data: AppData, date: string): AppData {
  return {
    ...data,
    workouts: data.workouts.filter((w) => w.date <= date),
    body: data.body.filter((b) => b.date <= date),
    daily: data.daily.filter((d) => d.date <= date),
  };
}
