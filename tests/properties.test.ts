/**
 * Property-based invariants (fast-check, FIXED seed → reproducible). Random synthetic workouts only.
 */
import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { buildProgression } from '../src/domain/progression';
import { buildRegistry } from '../src/domain/registry';
import { computeVolume, qualitySetTotal } from '../src/domain/volume';
import { defaultSettings } from '../src/domain/defaults';
import { buildDraft, parseImportJson, workoutToExport } from '../src/domain/importer';
import { createBackup, readBackup } from '../src/lib/backup';
import type { Workout, WorkoutExercise, WorkoutSet } from '../src/domain/types';
import { data } from './fixtures';

const SEED = 20261121;
const cfg = (numRuns = 150) => ({ seed: SEED, numRuns });
const reg = buildRegistry([], []);
const model = defaultSettings().quality;
const EXS = ['incline_dumbbell_press', 'pec_deck', 'triceps_pushdown_bar', 'lateral_raise', 'cable_lateral_raise', 'back_squat', 'leg_extension', 'romanian_deadlift', 'seated_leg_curl', 'pull_up', 'machine_biceps_curl', 'ez_bar_curl', 'hanging_knee_raise_pelvic_curl'];
const EQ = [null, 'eq_1', 'eq_2'];
const DATES = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(2026, 9, 5 + i)).toISOString().slice(0, 10)); // Mon 2026-10-05 + 6 weeks

let uidN = 0;
const setArb: fc.Arbitrary<WorkoutSet> = fc.record({
  type: fc.constantFrom<WorkoutSet['type']>('working', 'working', 'working', 'warmup', 'drop'),
  weightKg: fc.option(fc.integer({ min: 0, max: 80 }).map((x) => x * 2.5), { nil: null, freq: 8 }),
  reps: fc.option(fc.integer({ min: 1, max: 25 }), { nil: null, freq: 10 }),
  rir: fc.option(fc.integer({ min: 0, max: 8 }), { nil: null, freq: 3 }),
  failure: fc.option(fc.constantFrom<'muscular' | 'none' | 'uncertain'>('muscular', 'none', 'uncertain'), { nil: undefined, freq: 3 }),
  technique: fc.option(fc.constantFrom<'good' | 'slightly_degraded' | 'compromised'>('good', 'slightly_degraded', 'compromised'), { nil: undefined, freq: 3 }),
  side: fc.option(fc.constantFrom<'left' | 'right'>('left', 'right'), { nil: undefined, freq: 6 }),
}).map((r) => ({ id: `ps${uidN++}`, loadMode: 'total' as const, rirSource: r.rir == null ? 'unknown' as const : 'reported' as const, restSecBefore: null, ...r }));

const exArb: fc.Arbitrary<WorkoutExercise> = fc.record({
  exerciseId: fc.constantFrom(...EXS),
  equipmentId: fc.constantFrom(...EQ),
  sets: fc.array(setArb, { minLength: 1, maxLength: 6 }),
}).map((r, ) => ({ id: `pe${uidN++}`, order: 0, exerciseConfidence: 'confirmed' as const, equipmentConfidence: 'confirmed' as const, ...r }));

const workoutArb: fc.Arbitrary<Workout> = fc.record({
  date: fc.constantFrom(...DATES),
  startTime: fc.constantFrom('06:30', '12:00', '18:00', '21:15'),
  exercises: fc.array(exArb, { minLength: 1, maxLength: 6 }),
}).map((r) => ({ id: `pw${uidN++}`, schemaVersion: 1, locationId: 'gym_a', locationConfidence: 'confirmed' as const, source: 'manual' as const, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...r }));
const historyArb = fc.array(workoutArb, { minLength: 1, maxLength: 12 });

const eff = (ws: Workout[]) => computeVolume(ws, reg, model).muscles;

describe('volume invariants', () => {
  it('adding a valid working set never decreases any muscle\'s weekly volume', () => {
    fc.assert(fc.property(historyArb, fc.nat(), fc.integer({ min: 1, max: 20 }), fc.option(fc.integer({ min: 0, max: 8 }), { nil: null }), (ws, pick, reps, rir) => {
      const before = eff(ws);
      const wi = pick % ws.length;
      const w = ws[wi];
      const ei = pick % w.exercises.length;
      const added: WorkoutSet = { id: `add${uidN++}`, type: 'working', weightKg: 20, loadMode: 'total', reps, rir, rirSource: rir == null ? 'unknown' : 'reported', restSecBefore: null };
      const ws2 = ws.map((x, i) => (i !== wi ? x : { ...x, exercises: x.exercises.map((e, j) => (j !== ei ? e : { ...e, sets: [...e.sets, added] })) }));
      const after = eff(ws2);
      for (const m of Object.keys(before) as (keyof typeof before)[]) expect(after[m].effective).toBeGreaterThanOrEqual(before[m].effective - 1e-9);
    }), cfg());
  });

  it('warm-up sets never contribute to working volume or working-set counts', () => {
    fc.assert(fc.property(historyArb, (ws) => {
      const noWarm = ws.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.type !== 'warmup') })) }));
      const a = computeVolume(ws, reg, model);
      const b = computeVolume(noWarm, reg, model);
      expect(a.totalWorkingSets).toBe(b.totalWorkingSets);
      for (const m of Object.keys(a.muscles) as (keyof typeof a.muscles)[]) {
        expect(a.muscles[m].effective).toBe(b.muscles[m].effective);
        expect(a.muscles[m].rawWorkingSets).toBe(b.muscles[m].rawWorkingSets);
      }
    }), cfg());
  });

  it('credit never exceeds participation: effective ≤ fractional (Σ coefficient); quality sets ≤ working sets', () => {
    fc.assert(fc.property(historyArb, (ws) => {
      const v = computeVolume(ws, reg, model);
      for (const m of Object.values(v.muscles)) expect(m.effective).toBeLessThanOrEqual(m.fractional + 1e-9);
      expect(qualitySetTotal(ws, reg, model)).toBeLessThanOrEqual(v.totalWorkingSets + 1e-9);
    }), cfg());
  });

  it('the order workouts are stored in does not change any number', () => {
    fc.assert(fc.property(historyArb, (ws) => {
      const a = eff(ws), b = eff([...ws].reverse());
      expect(b).toEqual(a);
    }), cfg(80));
  });
});

describe('history invariants', () => {
  it('separate equipment instances never share a progression history', () => {
    fc.assert(fc.property(historyArb, (ws) => {
      const series = buildProgression(ws, reg, [], [], 2, '2026-11-20');
      for (const p of series) {
        const eqs = new Set(p.sessions.flatMap((s) => ws.find((w) => w.id === s.workoutId)!.exercises.filter((e) => e.exerciseId === p.exerciseId).map((e) => e.equipmentId ?? null)));
        expect(eqs.has(p.equipmentId ?? null)).toBe(true);
      }
      const keys = series.map((p) => p.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const p of series) for (const q of series) if (p !== q && p.exerciseId === q.exerciseId && p.equipmentId !== q.equipmentId) expect(p.key).not.toBe(q.key);
    }), cfg(100));
  });

  it('editing one set changes only calculations that depend on it (other weeks, other histories unchanged)', () => {
    fc.assert(fc.property(historyArb, fc.nat(), fc.integer({ min: 1, max: 30 }), (ws, pick, newReps) => {
      const wi = pick % ws.length;
      const target = ws[wi];
      const ex = target.exercises[pick % target.exercises.length];
      const s = ex.sets[pick % ex.sets.length];
      const edited = ws.map((w) => (w !== target ? w : { ...w, exercises: w.exercises.map((e) => (e !== ex ? e : { ...e, sets: e.sets.map((x) => (x !== s ? x : { ...x, reps: newReps })) })) }));
      const monday = (d: string) => { const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); const dow = (new Date(t).getUTCDay() + 6) % 7; return new Date(t - dow * 864e5).toISOString().slice(0, 10); };
      const wk = monday(target.date);
      const others = (xs: Workout[]) => xs.filter((w) => monday(w.date) !== wk);
      expect(eff(others(edited))).toEqual(eff(others(ws)));
      const a = buildProgression(ws, reg, [], [], 2, '2026-11-20');
      const b = buildProgression(edited, reg, [], [], 2, '2026-11-20');
      const touched = new Set(b.filter((p) => p.sessions.some((x) => x.workoutId === target.id)).map((p) => p.key));
      for (const p of a.filter((x) => !touched.has(x.key))) expect(b.find((x) => x.key === p.key)).toEqual(p);
    }), cfg(100));
  });

  it('a new week resets counters but never deletes recovery history', () => {
    fc.assert(fc.property(historyArb, (ws) => {
      const d = data(ws.filter((w) => w.date <= '2026-11-01'));
      if (!d.workouts.length) return;
      const sun = analyze(d, new Date('2026-11-01T23:59:00Z'));
      const mon = analyze(d, new Date('2026-11-02T00:01:00Z'));
      for (const m of mon.muscles) {
        expect(m.completed).toBe(0);
        expect(mon.recovery[m.muscle].lastStimulusDate).toBe(sun.recovery[m.muscle].lastStimulusDate);
      }
      expect(mon.weeks.flatMap((b) => b.workouts).length).toBe(d.workouts.length);
    }), cfg(60));
  });
});

describe('data integrity', () => {
  it('export → import round-trip preserves every performed set (weight, reps, RIR, type, side)', async () => {
    await fc.assert(fc.asyncProperty(workoutArb, async (w) => {
      const json = JSON.stringify({ schema: 'gymrat.workout', schema_version: '1.4', workouts: [workoutToExport(w)] });
      const parsed = parseImportJson(json);
      expect(parsed.errors).toEqual([]);
      const d = data([]);
      const draft = await buildDraft(parsed.workouts[0], d, reg);
      const flat = (x: Workout) => x.exercises.flatMap((e) => e.sets.map((s) => [e.exerciseId, s.type, s.weightKg, s.reps, s.rir, s.side ?? null, s.failure ?? null]));
      expect(flat(draft.workout)).toEqual(flat(w));
    }), cfg(60));
  });

  it('importing the same workout twice is blocked as a duplicate', async () => {
    await fc.assert(fc.asyncProperty(workoutArb, async (w) => {
      const json = JSON.stringify({ schema: 'gymrat.workout', schema_version: '1.4', workouts: [workoutToExport(w)] });
      const input = parseImportJson(json).workouts[0];
      const first = await buildDraft(input, data([]), reg);
      expect(first.duplicateOf).toBeNull();
      const second = await buildDraft(input, data([first.workout]), reg);
      expect(second.duplicateOf).toBe(first.workout.id);
      expect(second.issues[0].level).toBe('error');
    }), cfg(40));
  });

  it('backup → restore returns every record bit-for-bit (encrypted, password-protected)', async () => {
    await fc.assert(fc.asyncProperty(historyArb, async (ws) => {
      const d = data(ws, { body: [{ id: 'b1', date: '2026-10-05', time: '07:00', weightKg: 79.4, photoIds: ['p1'] }], photos: [{ id: 'p1', kind: 'progress', mime: 'image/jpeg', takenAt: '2026-10-05T07:00:00Z' }] });
      const bytes = new Uint8Array([1, 2, 3, 250]);
      const file = await createBackup(d, async () => bytes.buffer, 'synthetic-backup-pass');
      const text = JSON.stringify(file);
      expect(text).not.toContain('79.4'); // no plaintext data in the file
      const back = await readBackup(text, 'synthetic-backup-pass');
      expect(back.data).toEqual(JSON.parse(JSON.stringify(d)));
      expect([...back.photos[0].bytes]).toEqual([...bytes]);
      await expect(readBackup(text, 'wrong-pass')).rejects.toThrow();
    }), { seed: SEED, numRuns: 3 });
  }, 60_000);
});
