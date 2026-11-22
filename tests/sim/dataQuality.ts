/**
 * Data-quality histories for the planner / readiness tests (Part 5, E.6). Small, deterministic, SYNTHETIC.
 * One gym (gym_a) with five machines; a full-body template; variants change how WELL the sessions are
 * documented, how often they happen, how performance moves, and which equipment / exercises are used.
 */
import type { AppData } from '../../src/domain/appdata';
import { defaultSettings } from '../../src/domain/defaults';
import type { Equipment, Workout, WorkoutExercise, WorkoutSet } from '../../src/domain/types';

export const DQ_START = '2026-09-07'; // a Monday

const ms = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const add = (d: string, n: number) => new Date(ms(d) + n * 86400000).toISOString().slice(0, 10);

const eq = (id: string, name: string, exerciseIds: string[], inc = 5, minKg: number | null = 5): Equipment => ({
  id, locationId: 'gym_a', name, kind: 'machine', identified: true, incrementsKg: [inc], minKg, maxKg: 150, settings: {}, exerciseIds, photoIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});
export const DQ_EQUIPMENT: Equipment[] = [
  eq('pd_a', 'Pec deck A', ['pec_deck']),
  eq('pd_b', 'Pec deck B', ['pec_deck'], 2.5, 2.5),
  { ...eq('cable_a', 'Cable A', ['triceps_pushdown_bar', 'cable_lateral_raise']), kind: 'cable' },
  eq('slc_a', 'Seated leg curl A', ['seated_leg_curl']),
  eq('legext_a', 'Leg extension A', ['leg_extension']),
  eq('mcp_a', 'Chest press A', ['machine_chest_press']),
];

export interface DqOptions {
  sessions: number;
  /** Days between sessions (cycled), default [2, 2, 3] ≈ 3 / week. */
  gaps?: number[];
  start?: string;
  /** 'good' = gym, times, every set with weight + reps + RIR; 'poor' = no gym, no times, no RIR/feel on most sets. */
  documentation?: 'good' | 'poor';
  trend?: 'up' | 'flat' | 'down';
  /** Leave out end times / wellness entirely (strength data still complete). */
  noRecoveryInfo?: boolean;
  /** From this session index on, pec deck is done on machine B (new to the owner). */
  switchPecDeckAt?: number;
  /** From this session index on, incline DB press is replaced by the machine chest press. */
  preferenceChangeAt?: number;
  /** Insert a break of this many days before session index `breakAt`. */
  breakAt?: number;
  breakDays?: number;
}

let id = 0;
const sid = (p: string) => `${p}${id++}`;

function sets(n: number, kg: number, reps: number[], doc: 'good' | 'poor', k: number, extra: Partial<WorkoutSet> = {}): WorkoutSet[] {
  return Array.from({ length: n }, (_, i) => ({
    id: sid('s'), type: 'working', weightKg: kg, loadMode: 'total', reps: reps[Math.min(i, reps.length - 1)],
    rir: doc === 'good' || (doc === 'poor' && (k + i) % 5 === 0) ? 2 : null, rirSource: doc === 'good' ? 'reported' : 'unknown', restSecBefore: i ? 120 : null, ...extra,
  }));
}

/** Load/rep progression by session index for each trend (double progression on real increments). */
function perf(trend: DqOptions['trend'], k: number, base: number, step: number, top: number): { kg: number; reps: number[] } {
  if (trend === 'up') {
    const cycle = Math.floor(k / 3);
    const inCycle = k % 3;
    return { kg: base + cycle * step, reps: [top - 2 + inCycle, top - 2 + inCycle, top - 3 + inCycle] };
  }
  if (trend === 'down') {
    const drop = Math.min(5, Math.floor(k / 2));
    return { kg: base, reps: [top - 1 - drop, top - 2 - drop, top - 3 - drop].map((r) => Math.max(3, r)) };
  }
  return { kg: base, reps: [top - 1, top - 2, top - 3] };
}

export function dataQualityHistory(o: DqOptions): AppData {
  const doc = o.documentation ?? 'good';
  const gaps = o.gaps ?? [2, 2, 3];
  const ws: Workout[] = [];
  let date = o.start ?? DQ_START;
  for (let k = 0; k < o.sessions; k++) {
    if (k > 0) date = add(date, gaps[(k - 1) % gaps.length] + (o.breakAt === k ? (o.breakDays ?? 0) : 0));
    const t = o.trend ?? 'up';
    const sq = perf(t, k, 80, 2.5, 10);
    const ib = perf(t, k, 22.5, 2.5, 12);
    const pd = perf(t, k, 45, 5, 15);
    const lc = perf(t, k, 40, 5, 12);
    const lr = perf(t, k, 10, 1, 15);
    const pu = perf(t, k, 25, 5, 12);
    const pecOnB = o.switchPecDeckAt != null && k >= o.switchPecDeckAt;
    const pressMachine = o.preferenceChangeAt != null && k >= o.preferenceChangeAt;
    const exs: WorkoutExercise[] = [
      { id: sid('e'), order: 0, exerciseId: 'back_squat', exerciseConfidence: 'confirmed', equipmentId: null, equipmentConfidence: 'unknown', sets: sets(3, sq.kg, sq.reps, doc, k) },
      pressMachine
        ? { id: sid('e'), order: 1, exerciseId: 'machine_chest_press', exerciseConfidence: 'confirmed', equipmentId: 'mcp_a', equipmentConfidence: 'confirmed', sets: sets(3, 50 + Math.floor((k - (o.preferenceChangeAt ?? 0)) / 3) * 5, [11, 10, 9], doc, k) }
        : { id: sid('e'), order: 1, exerciseId: 'incline_dumbbell_press', exerciseConfidence: 'confirmed', equipmentId: null, equipmentConfidence: 'unknown', variation: { benchAngleDeg: 30 }, sets: sets(3, ib.kg, ib.reps, doc, k) },
      { id: sid('e'), order: 2, exerciseId: 'pec_deck', exerciseConfidence: 'confirmed', equipmentId: doc === 'poor' && k % 2 ? null : pecOnB ? 'pd_b' : 'pd_a', equipmentConfidence: 'confirmed', sets: sets(2, pecOnB ? 40 : pd.kg, pd.reps, doc, k) },
      { id: sid('e'), order: 3, exerciseId: 'seated_leg_curl', exerciseConfidence: 'confirmed', equipmentId: 'slc_a', equipmentConfidence: 'confirmed', sets: sets(3, lc.kg, lc.reps, doc, k) },
      { id: sid('e'), order: 4, exerciseId: 'lateral_raise', exerciseConfidence: 'confirmed', equipmentId: null, equipmentConfidence: 'unknown', sets: sets(3, lr.kg, lr.reps, doc, k) },
      { id: sid('e'), order: 5, exerciseId: 'triceps_pushdown_bar', exerciseConfidence: 'confirmed', equipmentId: 'cable_a', equipmentConfidence: 'confirmed', sets: sets(2, pu.kg, pu.reps, doc, k) },
      { id: sid('e'), order: 6, exerciseId: 'pull_up', exerciseConfidence: 'confirmed', equipmentId: null, equipmentConfidence: 'unknown', variation: { loading: 'bodyweight' }, sets: sets(3, 0, [10, 9, 8], doc, k, { loadMode: 'bodyweight_plus' }) },
    ];
    const good = doc === 'good';
    ws.push({
      id: sid('w'), schemaVersion: 1, date, startTime: good ? '18:00' : null, endTime: good && !o.noRecoveryInfo ? '19:15' : null,
      durationMin: good && o.noRecoveryInfo ? 75 : null,
      locationId: good ? 'gym_a' : null, locationConfidence: good ? 'confirmed' : 'unknown', exercises: exs, source: 'manual',
      createdAt: `${date}T19:20:00Z`, updatedAt: `${date}T19:20:00Z`,
    });
  }
  return {
    settings: { ...defaultSettings(), timezone: 'UTC', learning: { startDate: o.start ?? DQ_START, endedOn: null, lengthDays: 30 } },
    workouts: ws, locations: [{ id: 'gym_a', name: 'Gym A', photoIds: [], createdAt: '' }], equipment: DQ_EQUIPMENT.map((e) => ({ ...e })),
    exerciseOverrides: [], customExercises: [], photos: [], body: [], daily: [], blocks: [], imports: [], snapshots: [],
  };
}

/** The day after the last session, 17:00 UTC (muscles recovered from a 2–3-day rhythm). */
export function dayAfterLast(d: AppData, days = 2): Date {
  const last = d.workouts.reduce((m, w) => (w.date > m ? w.date : m), d.workouts[0].date);
  return new Date(`${add(last, days)}T17:00:00Z`);
}
