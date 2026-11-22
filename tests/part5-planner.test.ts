/**
 * Part 5 — readiness / operating modes (E.4), planner (E.3), live re-assessment in real gyms (E.9) and
 * evidence-based weekly volume per muscle (E.10). Synthetic histories from tests/sim/dataQuality.ts.
 * Expected values follow the documented thresholds (rules planner_modes, planner_calibration,
 * planner_session_allocation, planner_live_reassessment, planner_learning, volume_individual).
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import {
  applyPendingUpdate, buildLibrary, generateWorkout, planAdherence, planPreferences, replacementOptions, replanPending,
  untouchedPlanned, workoutFromPlan, type GeneratedWorkout,
} from '../src/domain/planner';
import { documentationGaps, isWellDocumented, readinessReport } from '../src/domain/readiness';
import type { AppData } from '../src/domain/appdata';
import type { Workout, WorkoutSet } from '../src/domain/types';
import { add, dataQualityHistory, dayAfterLast, DQ_START, type DqOptions } from './sim/dataQuality';

const run = (o: DqOptions, nowDays = 2) => {
  const d = dataQualityHistory(o);
  const now = dayAfterLast(d, nowDays);
  const a = analyze(d, now);
  const r = readinessReport(d, a);
  return { d, now, a, r, g: generateWorkout({ data: d, analysis: a, now, readiness: r }) };
};
let n = 0;
const uidT = () => `t${n++}`;

/**
 * A load exists on the equipment when it was already used on THIS history (same exercise × machine ×
 * configuration), or it is whole steps away from such a load, or on the machine's grid (min + k × step).
 */
function onRealGrid(d: AppData, key: string, kg: number, step: number, minKg: number | null): boolean {
  const a = analyze(d, new Date('2027-01-01T00:00:00Z'));
  const used = (a.progression.find((p) => p.key === key)?.sessions ?? []).flatMap((s) => s.sets.map((x) => x.weight)).filter((x): x is number => x != null);
  const whole = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;
  if (used.includes(kg)) return true;
  if (used.some((u) => whole((kg - u) / step))) return true;
  return minKg != null && whole((kg - minKg) / step);
}

describe('operating modes from data quality, never the calendar (E.4)', () => {
  it('2 well-documented workouts → LEARNING; the next step is stated in numbers', () => {
    const { r } = run({ sessions: 2 });
    expect(r.mode).toBe('learning');
    expect(r.next[0]).toBe('2 / 8 well-documented workouts');
  });
  it('6 well-documented workouts → still LEARNING', () => {
    expect(run({ sessions: 6 }).r.mode).toBe('learning');
  });
  it('10 well-documented workouts over 21 days → PROVISIONAL (FULL needs ≥ 28 days)', () => {
    const { r } = run({ sessions: 10 });
    expect(r.wellDocumented).toBe(10);
    expect(r.spanDays).toBe(21);
    expect(r.mode).toBe('provisional');
    expect(r.next.join(' ')).toMatch(/21 \/ 28 days/);
  });
  it('14 well-documented workouts over ≥ 28 days with calibrated familiar exercises → FULL ADAPTIVE', () => {
    expect(run({ sessions: 14 }).r.mode).toBe('full');
  });
  it('12 INCONSISTENTLY logged workouts are NOT ready: LEARNING, nothing calibrated, gaps listed, items only provisional', () => {
    const { r, g, d } = run({ sessions: 12, documentation: 'poor' });
    expect(d.workouts.every((w) => !isWellDocumented(w))).toBe(true);
    expect(r.mode).toBe('learning');
    expect(r.wellDocumented).toBe(0);
    expect(r.calibratedFrequent).toBe(0);
    expect(r.dataGaps.join(' ')).toMatch(/gym not recorded/);
    expect(r.dataGaps.join(' ')).toMatch(/effort/);
    expect(g.stage).toBe('suggestions');
    expect(g.items.every((i) => i.calibration !== 'calibrated')).toBe(true);
  });
  it('the same number of days but too few sessions never unlocks a mode (calendar alone)', () => {
    const sparse = run({ sessions: 5, gaps: [7] }); // 28 days, 5 sessions
    expect(sparse.r.spanDays).toBe(28);
    expect(sparse.r.mode).toBe('learning');
  });
  it('reliable strength data but NO recovery information still reaches FULL (missing sleep/soreness never blocks)', () => {
    const { r } = run({ sessions: 14, noRecoveryInfo: true });
    expect(r.mode).toBe('full');
    const rec = r.areas.find((x) => x.area === 'Recovery information')!;
    expect(rec.level).not.toBe('WELL_CALIBRATED');
  });
  it('irregular frequency is handled (modes from documented sessions, not from a weekly rhythm)', () => {
    const { r, g } = run({ sessions: 12, gaps: [1, 4, 2, 6, 3] });
    expect(['provisional', 'full']).toContain(r.mode);
    expect(g.items.length).toBeGreaterThan(0);
  });
  it('documentation gaps are reported per workout', () => {
    const w = dataQualityHistory({ sessions: 1, documentation: 'poor' }).workouts[0];
    expect(documentationGaps(w)).toEqual(expect.arrayContaining(['no_gym', 'no_times', 'effort_missing']));
  });
});

describe('calibration is per exercise × machine × configuration (E.3/E.4)', () => {
  it('a new machine starts at DEVELOPING while the familiar one stays WELL CALIBRATED; kg is never transferred', () => {
    const { r, a, d, now } = run({ sessions: 14, switchPecDeckAt: 13 });
    const lvl = (eq: string) => r.keys.find((k) => k.exerciseId === 'pec_deck' && k.equipmentId === eq)!.level;
    expect(lvl('pd_a')).toBe('WELL_CALIBRATED');
    expect(lvl('pd_b')).toBe('DEVELOPING');
    // Plan pec deck on B: its load comes only from B's single session (40 kg), never from A (≥ 45 kg).
    const g = generateWorkout({ data: d, analysis: a, now, readiness: r, exclude: ['back_squat', 'pull_up'], force: [{ exerciseId: 'pec_deck', equipmentId: 'pd_b' }] });
    const it = g.items.find((i) => i.exerciseId === 'pec_deck')!;
    expect(it.equipmentId).toBe('pd_b');
    expect(it.calibration).toBe('provisional');
    expect([40, 42.5]).toContain(it.prescription.workingWeightKg);
  });
  it('a machine with no history at all → "needs data": no kg is invented', () => {
    const { a, d, now, r } = run({ sessions: 14 });
    const g = generateWorkout({ data: d, analysis: a, now, readiness: r, force: [{ exerciseId: 'leg_extension', equipmentId: 'legext_a' }] });
    const it = g.items.find((i) => i.exerciseId === 'leg_extension')!;
    expect(it.calibration).toBe('needs_data');
    expect(it.prescription.workingWeightKg).toBeNull();
    expect(it.why.join(' ')).toMatch(/Calibrate: pick a load/);
  });
});

describe('the planner (E.3)', () => {
  const full = () => run({ sessions: 14 });
  it('learns the personal library: frequent exercises, preferred ones, the gym', () => {
    const { d, a, r } = full();
    const lib = buildLibrary(d, a, r);
    const pd = lib.find((e) => e.exerciseId === 'pec_deck')!;
    expect(pd.status).toBe('frequent');
    expect(pd.preferred).toBe(true);
    expect(pd.gyms).toEqual(['gym_a']);
    expect(pd.medianPosition).toBeCloseTo(2 / 6, 5); // third of seven exercises
  });
  it('allocates sets for the WHOLE session: no direct muscle above its open share (+ one set tolerance), no catch-up', () => {
    const { g, a } = full();
    for (const m of a.muscles) {
      const planned = g.planned[m.muscle] ?? 0;
      const direct = g.items.some((i) => i.primary === m.muscle);
      if (direct) expect(planned, m.muscle).toBeLessThanOrEqual((g.budget[m.muscle] ?? 0) + 1.01);
      if (m.todayBlocked) expect(direct, m.muscle).toBe(false);
    }
  });
  it('orders demanding lifts first (HIGH → MODERATE → LOW) unless a muscle is prioritised', () => {
    const { g, d, a, now } = full();
    const rank = { high: 0, moderate: 1, low: 2 } as const;
    const costs = g.items.map((i) => rank[i.fatigueCost]);
    expect([...costs].sort((x, y) => x - y)).toEqual(costs);
    const pri = { ...d, settings: { ...d.settings, priorities: { side_delts: 'high' as const } } };
    const ap = analyze(pri, now);
    const gp = generateWorkout({ data: pri, analysis: ap, now });
    const lat = gp.items.find((i) => i.exerciseId === 'lateral_raise');
    if (lat) expect(lat.order).toBe(0);
    void a;
  });
  it('loads are on the machine\'s real increments (min 5 + k × 5 on Pec deck A) and only from that history', () => {
    const { g, d } = full();
    for (const it of g.items) {
      const kg = it.prescription.workingWeightKg;
      if (kg == null || kg === 0) continue;
      expect(onRealGrid(d, it.prescription.key, kg, it.prescription.step, it.prescription.minKg), `${it.exerciseId} ${kg} step ${it.prescription.step}`).toBe(true);
      expect(it.familiar, it.exerciseId).toBe(true);
    }
  });
  it('skipped muscles are named with the reason (recovering / target met)', () => {
    const d = dataQualityHistory({ sessions: 14 });
    const now = dayAfterLast(d, 1); // the morning after: legs and chest still recovering
    const a = analyze(d, new Date(now.getTime() - 9 * 3600_000));
    const g = generateWorkout({ data: d, analysis: a, now });
    expect(g.skippedMuscles.some((s) => /recovering/.test(s.reason))).toBe(true);
  });
  it('changed preferences are learned from the history (machine chest press replaces incline DB press)', () => {
    const { g } = run({ sessions: 20, preferenceChangeAt: 9 }, 3);
    const ids = g.items.map((i) => i.exerciseId);
    expect(ids).not.toContain('incline_dumbbell_press');
  });
  it('returning after ≥ 15 days: flagged, loads one step down, no catch-up volume', () => {
    const { g } = run({ sessions: 14 }, 16);
    expect(g.returning).toEqual({ daysOff: 16, stepDown: true });
    const pd = g.items.find((i) => i.exerciseId === 'pec_deck');
    if (pd) expect(pd.prescription.notes.join(' ')).toMatch(/one step down/);
    for (const [m, v] of Object.entries(g.planned)) expect(v as number, m).toBeLessThanOrEqual((g.budget[m as keyof typeof g.budget] ?? 0) + 2.01);
  });
  it('repeated non-equipment replacements shift preferences (≥ 3); "machine busy" never does', () => {
    const d = dataQualityHistory({ sessions: 14 });
    const dec = (reason: 'busy' | 'preference' | null) => ({ action: 'replaced' as const, exerciseId: 'pec_deck', equipmentId: 'pd_a', replacement: { exerciseId: 'machine_chest_press', equipmentId: 'mcp_a' }, reason, at: '' });
    const withDecisions = (reason: 'busy' | 'preference' | null, k: number): AppData => ({ ...d, workouts: d.workouts.map((w, i) => (i < k ? { ...w, planDecisions: [dec(reason)] } : w)) });
    expect(planPreferences(withDecisions('busy', 5), add(DQ_START, 60)).avoid.get('gym_a')).toBeUndefined();
    expect(planPreferences(withDecisions('preference', 2), add(DQ_START, 60)).avoid.get('gym_a')).toBeUndefined();
    const p3 = planPreferences(withDecisions('preference', 3), add(DQ_START, 60));
    expect(p3.avoid.get('gym_a')?.has('pec_deck')).toBe(true);
    expect(p3.prefer.get('gym_a')?.has('machine_chest_press')).toBe(true);
  });
  it('nothing in the stored data is changed by planning', () => {
    const { d, a, now } = full();
    const before = JSON.stringify(d);
    generateWorkout({ data: d, analysis: a, now });
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe('start, edit, adherence (E.3)', () => {
  it('Start keeps the plan snapshot separate from the performed sets; edits change planned values only', () => {
    const { g } = run({ sessions: 14 });
    const w = workoutFromPlan(g, { id: 'live', date: '2026-10-20', startTime: '17:00', nowIso: '2026-10-20T17:00:00Z', uid: uidT }, { 0: { sets: g.items[0].setCount + 1 } });
    expect(w.generated!.items[0].sets).toBe(g.items[0].setCount);
    expect(w.exercises[0].sets).toHaveLength(g.items[0].setCount + 1);
    expect(w.exercises.every((e, i) => e.planItem === i && e.sets.every((s) => s.planned && s.prescribed?.kind === 'working'))).toBe(true);
    // Perform item 0 exactly, skip item 1 → adherence
    const done = (s: WorkoutSet): WorkoutSet => ({ ...s, planned: false, completedAt: '2026-10-20T17:10:00Z', rir: 2 });
    const w2: Workout = { ...w, exercises: w.exercises.map((e, i) => (i === 0 ? { ...e, sets: e.sets.slice(0, g.items[0].setCount).map(done) } : i === 1 ? { ...e, skipped: true } : e)) };
    const adh = planAdherence(w2);
    expect(adh[0].result).toBe('followed');
    expect(adh[1].result).toBe('skipped');
  });
});

describe('real gym conditions: order changes, busy machines, re-assessment (E.9)', () => {
  const setup = () => {
    const d = dataQualityHistory({ sessions: 14 });
    const now = dayAfterLast(d, 3);
    const a = analyze(d, now);
    const g: GeneratedWorkout = generateWorkout({ data: d, analysis: a, now });
    const w = workoutFromPlan(g, { id: 'live', date: a.today, startTime: '17:00', nowIso: now.toISOString(), uid: uidT });
    return { d, now, a, g, w };
  };
  it('a chest exercise done FIRST (out of order) reduces the sets of the planned chest press; never assumes the plan order', () => {
    const { d, now, w } = setup();
    const press = w.exercises.findIndex((e) => e.exerciseId === 'incline_dumbbell_press');
    expect(press).toBeGreaterThanOrEqual(0);
    const before = w.exercises[press].sets.length;
    // Pec deck added and done first: 4 sets near failure.
    const pec = { id: 'pec', order: 99, exerciseId: 'pec_deck', exerciseConfidence: 'confirmed' as const, equipmentId: 'pd_a', equipmentConfidence: 'confirmed' as const,
      sets: Array.from({ length: 4 }, (_, i): WorkoutSet => ({ id: `p${i}`, type: 'working', weightKg: 60, loadMode: 'total', reps: 12, rir: 1, rirSource: 'reported', restSecBefore: null, completedAt: now.toISOString() })) };
    const live: Workout = { ...w, exercises: [pec, ...w.exercises] };
    const all = { ...d, workouts: [...d.workouts, live] };
    const ups = replanPending(all, analyze(all, now), live, now);
    const u = ups.find((x) => live.exercises[x.exerciseIndex].exerciseId === 'incline_dumbbell_press')!;
    expect(u.setCount).toBeLessThan(before);
    expect(u.reason).toMatch(/what you actually did/);
    const patched = applyPendingUpdate(live.exercises[u.exerciseIndex], u, uidT)!;
    expect(patched.sets.filter((s) => s.type === 'working')).toHaveLength(u.setCount);
  });
  it('edited planned sets are never overwritten by a re-assessment', () => {
    const { w, d, now } = setup();
    const e0 = w.exercises[0];
    const edited = { ...e0, sets: e0.sets.map((s, i) => (i === 0 ? { ...s, weightKg: (s.weightKg ?? 0) + 5 } : s)) };
    expect(untouchedPlanned(edited.sets[0])).toBe(false);
    const ups = replanPending(d, analyze(d, now), { ...w, exercises: [edited, ...w.exercises.slice(1)] }, now);
    const u = ups.find((x) => x.exerciseIndex === 0)!;
    expect(applyPendingUpdate(edited, { ...u, setCount: 1, prescription: { ...u.prescription, setCount: 1, sets: u.prescription.sets.slice(0, 1) } }, uidT)).toBeNull();
  });
  it('a busy machine is excluded from alternatives; alternatives use available equipment for the same muscle', () => {
    const { d, a, w } = setup();
    const opts = replacementOptions(d, a, { ...w, busyEquipment: [{ equipmentId: 'mcp_a', at: '' }] }, 'pec_deck');
    expect(opts.every((o) => o.equipmentId !== 'mcp_a')).toBe(true);
    expect(opts.every((o) => (a.registry.get(o.exerciseId)!.contributions.chest ?? 0) >= 0.75)).toBe(true);
  });
  it('skipped / postponed exercises keep the original plan and every completed set', () => {
    const { w } = setup();
    const later = { ...w, exercises: [...w.exercises.slice(1), { ...w.exercises[0], deferredAt: '2026-10-20T17:05:00Z' }] };
    expect(later.generated).toEqual(w.generated);
    expect(later.exercises.map((e) => e.id).sort()).toEqual(w.exercises.map((e) => e.id).sort());
  });
});

describe('evidence-based weekly volume per muscle (E.10)', () => {
  const vol = (o: DqOptions, m: string, daysAfter = 3) => {
    const { a } = run(o, daysAfter);
    return a.muscles.find((x) => x.muscle === m)!.target;
  };
  it('progressing → HOLD at the own level, even below the generic reference (no automatic increase)', () => {
    const t = vol({ sessions: 16, trend: 'up' }, 'chest');
    expect(t.volumeAction).toBe('hold');
    expect(t.preferred).toBe(t.baseline);
    expect(t.rationale.join(' ')).toMatch(/Progressing at this volume/);
  });
  it('repeated decline with adequate effort → REDUCE by 1–2', () => {
    const t = vol({ sessions: 16, trend: 'down' }, 'chest');
    expect(t.volumeAction).toBe('reduce');
    expect((t.baseline as number) - t.preferred).toBeGreaterThanOrEqual(1);
    expect((t.baseline as number) - t.preferred).toBeLessThanOrEqual(2);
  });
  it('stalled (no improvement over comparable sessions), stable volume, good recovery → INCREASE by 1–2 only', () => {
    const t = vol({ sessions: 18, trend: 'flat' }, 'chest');
    expect(t.volumeAction).toBe('increase');
    expect(t.preferred - (t.baseline as number)).toBeGreaterThanOrEqual(1);
    expect(t.preferred - (t.baseline as number)).toBeLessThanOrEqual(2);
  });
  it('stalled but recovery consistently poor → no increase', () => {
    const d = dataQualityHistory({ sessions: 18, trend: 'flat' });
    const last = d.workouts[d.workouts.length - 1].date;
    d.daily = [0, 2, 4].map((k) => ({ id: add(last, -k), date: add(last, -k), soreness: { chest: 3 }, sleepHours: 7 }));
    const a = analyze(d, dayAfterLast(d, 3));
    expect(a.muscles.find((x) => x.muscle === 'chest')!.target.volumeAction).not.toBe('increase');
  });
  it('stalled but effort too low (most sets RIR ≥ 4) → hold: closer to failure first', () => {
    const d = dataQualityHistory({ sessions: 18, trend: 'flat' });
    d.workouts = d.workouts.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, rir: 5 })) })) }));
    const t = analyze(d, dayAfterLast(d, 3)).muscles.find((x) => x.muscle === 'chest')!.target;
    expect(t.volumeAction).toBe('hold');
    expect(t.rationale.join(' ')).toMatch(/closer to failure/);
  });
  it('technique deteriorating on ≥ 25 % of recent sets → REDUCE', () => {
    const d = dataQualityHistory({ sessions: 18, trend: 'flat' });
    const cut = d.workouts[d.workouts.length - 6].date;
    d.workouts = d.workouts.map((w) => (w.date < cut ? w : { ...w, exercises: w.exercises.map((e) => (e.exerciseId === 'pec_deck' || e.exerciseId === 'incline_dumbbell_press' ? { ...e, sets: e.sets.map((s, i) => (i === 0 ? { ...s, technique: 'compromised' as const } : s)) } : e)) }));
    const t = analyze(d, dayAfterLast(d, 3)).muscles.find((x) => x.muscle === 'chest')!.target;
    expect(t.volumeAction).toBe('reduce');
  });
  it('more volume that did not help → back to the earlier productive level', () => {
    // Weeks 1–4 progressing at the normal volume; weeks 5–8 the same lifts flat with 3 extra pec-deck sets per session.
    const early = dataQualityHistory({ sessions: 12, trend: 'up' });
    const late = dataQualityHistory({ sessions: 12, trend: 'flat', start: add(early.workouts[11].date, 2) });
    late.workouts = late.workouts.map((w) => ({ ...w, exercises: w.exercises.map((e) => (e.exerciseId === 'pec_deck' ? { ...e, sets: [...e.sets, ...e.sets.map((s) => ({ ...s, id: `${s.id}x` })), { ...e.sets[0], id: `${e.sets[0].id}y` }] } : e)) }));
    // keep the late loads at the level the early phase reached (no artificial drop)
    const d: AppData = { ...early, workouts: [...early.workouts, ...late.workouts.map((w) => ({ ...w, exercises: w.exercises.map((e) => {
      const lastEarly = early.workouts[11].exercises.find((x) => x.exerciseId === e.exerciseId);
      return lastEarly ? { ...e, sets: e.sets.map((s) => ({ ...s, weightKg: lastEarly.sets[0].weightKg })) } : e;
    }) }))] };
    const t = analyze(d, dayAfterLast(d, 3)).muscles.find((x) => x.muscle === 'chest')!.target;
    expect(t.volumeAction).toBe('reduce');
    expect(t.evidence!.recentLevel!).toBeGreaterThan(t.evidence!.earlierLevel!);
    expect(t.preferred).toBeLessThan(t.baseline as number);
  });
  it('right after a training break a stall never raises volume (observe first) — regression from the six-month check', () => {
    const t = vol({ sessions: 18, trend: 'flat', breakAt: 16, breakDays: 14 }, 'chest');
    expect(t.volumeAction).toBe('observe');
    expect(t.preferred).toBe(t.baseline);
    expect(t.rationale.join(' ')).toMatch(/training break/);
  });
  it('each muscle is decided independently (a declining muscle does not change a progressing one)', () => {
    const { a } = run({ sessions: 16, trend: 'down' }, 3);
    const lats = a.muscles.find((x) => x.muscle === 'lats')!.target; // pull-ups: same reps every session
    const chest = a.muscles.find((x) => x.muscle === 'chest')!.target;
    expect(chest.volumeAction).toBe('reduce');
    expect(lats.volumeAction).not.toBe('reduce');
  });
});

describe('a realistic 8-week run following the planner (E.6)', () => {
  it('modes move forward with data, loads stay on real increments from own history, plans adapt, weekly volume is not crammed', () => {
    let d = dataQualityHistory({ sessions: 3 });
    const modes: string[] = [];
    let date = add(d.workouts[2].date, 2);
    const loadsByKey = new Map<string, number[]>();
    for (let s = 0; s < 21; s++) {
      const now = new Date(`${date}T17:00:00Z`);
      const a = analyze(d, now);
      const r = readinessReport(d, a);
      modes.push(r.mode);
      const g = generateWorkout({ data: d, analysis: a, now, readiness: r });
      for (const it of g.items) {
        if (it.calibration === 'calibrated') expect(['SUFFICIENT', 'WELL_CALIBRATED']).toContain(r.keys.find((k) => k.key === it.prescription.key)?.level);
        const kg = it.prescription.workingWeightKg;
        if (kg != null && kg > 0) {
          expect(onRealGrid(d, it.prescription.key, kg, it.prescription.step, it.prescription.minKg), `${it.exerciseId} ${kg}`).toBe(true);
          loadsByKey.set(it.prescription.key, [...(loadsByKey.get(it.prescription.key) ?? []), kg]);
        }
      }
      // Perform the plan: top of the rep range at RIR 2 (calibrate items at 20 kg × 12).
      const w = workoutFromPlan(g, { id: `run${s}`, date, startTime: '17:00', nowIso: now.toISOString(), uid: uidT });
      const performed: Workout = {
        ...w, endTime: '18:15', finishedAt: now.toISOString(),
        exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((x) => ({ ...x, planned: false, weightKg: x.weightKg ?? 20, reps: x.prescribed?.repsMax ?? 12, rir: 2, rirSource: 'reported' as const, completedAt: now.toISOString() })) })),
      };
      d = { ...d, workouts: [...d.workouts, performed] };
      // No week exceeds a muscle's upper bound by cramming.
      const after = analyze(d, now);
      for (const m of after.muscles) expect(m.completed, `${date} ${m.muscle}`).toBeLessThanOrEqual(m.target.max + 2);
      date = add(date, s % 3 === 2 ? 3 : 2);
    }
    const order = { learning: 0, provisional: 1, full: 2 } as const;
    for (let i = 1; i < modes.length; i++) expect(order[modes[i] as keyof typeof order]).toBeGreaterThanOrEqual(order[modes[i - 1] as keyof typeof order]);
    expect(modes[0]).toBe('learning');
    expect(modes[modes.length - 1]).toBe('full');
    // Double progression happened somewhere (top of range reached repeatedly → heavier load).
    expect([...loadsByKey.values()].some((xs) => xs.length >= 3 && xs[xs.length - 1] > xs[0])).toBe(true);
  });
});
