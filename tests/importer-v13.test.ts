/**
 * Import schema v1.3 (failure status, technical failure, execution feedback, prescriptions) and
 * the "looks like a workout you already have" warning. All data is synthetic.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/lib/crypto';
import {
  IMPORT_SCHEMA_VERSION, buildDraft, draftBlockers, findLikelyDuplicate, parseImportJson, workoutFingerprint, workoutHash, workoutToExport,
} from '../src/domain/importer';
import { buildRegistry } from '../src/domain/registry';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);

const v13 = {
  schema: 'gymrat.workout',
  schema_version: '1.3',
  workouts: [{
    client_ref: 'test-v13-1',
    date: '2026-11-21',
    location_id: 'gym_a',
    exercises: [{
      exercise_id: 'pec_deck',
      sets: [
        { weight_kg: 40, reps: 12, rir: 0, failure_status: 'muscular_failure', technical_failure: false, execution_feedback: 'followed',
          prescribed: { weight_kg: 40, reps_min: 10, reps_max: 15, rir_min: 1, rir_max: 2, rest_sec: 90, kind: 'working' } },
        { weight_kg: 40, reps: 11, rir: 2, failure_status: 'no_failure', failure_notes: 'stopped, could have done 2 more' },
        { weight_kg: 40, reps: 10, failure_status: 'uncertain', technical_failure: true, execution_feedback: 'lost_concentric_control' },
        { weight_kg: 40, reps: 9, rir: 3, failure_status: 'muscular_failure' },
      ],
    }],
  }],
};

describe('import schema v1.3 fields (current version 1.4)', () => {
  it('current version is 1.4 and the shipped example uses it', () => {
    expect(IMPORT_SCHEMA_VERSION).toBe('1.4');
    const text = readFileSync(new URL('../examples/synthetic-workout.json', import.meta.url), 'utf8');
    expect(JSON.parse(text).schema_version).toBe('1.4');
    expect(parseImportJson(text).ok).toBe(true);
  });

  it('older payloads (1.0–1.2) are still valid', () => {
    for (const v of ['1.0', '1.1', '1.2', 1]) {
      const r = parseImportJson(JSON.stringify({ schema_version: v, workouts: [{ date: '2026-11-21', exercises: [{ exercise_id: 'pec_deck', sets: [{ weight_kg: 40, reps: 12, to_failure: true }] }] }] }));
      expect(r.errors).toEqual([]);
    }
  });

  it('rejects bad values in the new fields (strict)', () => {
    const bad = (set: Record<string, unknown>) => parseImportJson(JSON.stringify({ date: '2026-11-21', exercises: [{ exercise_id: 'pec_deck', sets: [{ weight_kg: 40, reps: 12, ...set }] }] })).ok;
    expect(bad({ failure_status: 'muscular' })).toBe(false);
    expect(bad({ execution_feedback: 'great' })).toBe(false);
    expect(bad({ prescribed: { weight_kg: 40, reps_min: 10, reps_max: 12, rir_min: 1, rir_max: 2 } })).toBe(false); // kind required
    expect(bad({ prescribed: { weight_kg: 40, reps_min: 10, reps_max: 12, rir_min: 1, rir_max: 2, kind: 'working', extra: 1 } })).toBe(false);
    expect(bad({ technical_failure: null })).toBe(true);
  });

  it('maps to the stored fields, never touching RIR, and round-trips through the exporter', async () => {
    const r = parseImportJson(JSON.stringify(v13));
    expect(r.errors).toEqual([]);
    const d = await buildDraft(r.workouts[0], data([]), reg);
    const [a, b, c, e] = d.workout.exercises[0].sets;
    expect(a).toMatchObject({ rir: 0, failure: 'muscular', technicalFailure: false, execution: 'followed', prescribed: { weightKg: 40, repsMin: 10, repsMax: 15, rirMin: 1, rirMax: 2, restSec: 90, kind: 'working', engine: 'import' } });
    expect(b).toMatchObject({ rir: 2, failure: 'none', failureNote: 'stopped, could have done 2 more' });
    expect(c).toMatchObject({ rir: null, failure: 'uncertain', technicalFailure: true, execution: 'lost_concentric_control' });
    expect(e).toMatchObject({ rir: 3, failure: 'muscular' });
    // gentle consistency notes as info issues
    const infos = d.issues.filter((i) => i.level === 'info').map((i) => i.message).join(' ');
    expect(infos).toMatch(/muscular failure, but RIR 3/);

    const back = workoutToExport(d.workout);
    expect(back.exercises[0].sets[0]).toMatchObject({ failure_status: 'muscular_failure', technical_failure: false, execution_feedback: 'followed', prescribed: { weight_kg: 40, reps_min: 10, reps_max: 15, rir_min: 1, rir_max: 2, rest_sec: 90, kind: 'working', engine: 'import' } });
    expect(back.exercises[0].sets[1]).toMatchObject({ failure_status: 'no_failure', failure_notes: 'stopped, could have done 2 more' });
    expect(back.exercises[0].sets[2]).toMatchObject({ failure_status: 'uncertain', technical_failure: true });
    const again = parseImportJson(JSON.stringify({ schema_version: IMPORT_SCHEMA_VERSION, workouts: [back] }));
    expect(again.errors).toEqual([]);
    const d2 = await buildDraft(again.workouts[0], data([]), reg);
    expect(d2.workout.exercises[0].sets.map((s) => [s.failure, s.technicalFailure ?? null, s.execution ?? null])).toEqual(d.workout.exercises[0].sets.map((s) => [s.failure, s.technicalFailure ?? null, s.execution ?? null]));
    expect(d2.hash).toBe(d.hash);
  });

  it('old sets export without any v1.3 keys (lazy migration: absent = unknown)', () => {
    const w = workout('2026-11-21', [ex('pec_deck', [set(40, 12, 2)], 'pd')]);
    const s = workoutToExport(w).exercises[0].sets[0];
    for (const k of ['failure_status', 'technical_failure', 'failure_notes', 'execution_feedback', 'prescribed']) expect(k in s).toBe(false);
  });

  it('the duplicate hash of sets without the new fields is unchanged (v1.0 formula)', async () => {
    const w = workout('2026-11-21', [ex('pec_deck', [set(40, 12, 2), set(40, 10, null)], 'pd')]);
    const legacy = await sha256Hex(JSON.stringify({
      d: w.date, l: w.locationId,
      e: w.exercises.map((e) => [e.exerciseId, e.equipmentId, e.sets.map((s) => [s.type, s.weightKg, s.reps, s.rir])]),
    }));
    expect(await workoutHash(w)).toBe(legacy);
    // an execution answer or a prescription does not change it either
    const w2 = { ...w, exercises: [{ ...w.exercises[0], sets: w.exercises[0].sets.map((s) => ({ ...s, execution: 'followed' as const })) }] };
    expect(await workoutHash(w2)).toBe(legacy);
    // a failure status does
    const w3 = { ...w, exercises: [{ ...w.exercises[0], sets: w.exercises[0].sets.map((s) => ({ ...s, failure: 'none' as const })) }] };
    expect(await workoutHash(w3)).not.toBe(legacy);
  });
});

describe('"looks like a workout you already have" (name-only re-imports)', () => {
  const existing = workout('2026-11-21', [ex('lat_pulldown', [set(50, 12, 2), set(50, 10, 1)], null), ex('pec_deck', [set(40, 12, 2)], 'pd')]);
  const incoming = (sets: { weight_kg: number; reps: number; rir: number }[], date = '2026-11-21') => ({
    date, location_id: 'gym_a',
    exercises: [
      { exercise_id: 'close_grip_pulldown', sets: sets.slice(0, 2) },
      { exercise_name_raw: 'butterfly', sets: sets.slice(2) },
    ],
  });
  const same = [{ weight_kg: 50, reps: 10, rir: 1 }, { weight_kg: 50, reps: 12, rir: 2 }, { weight_kg: 40, reps: 12, rir: 2 }];

  it('warns (does not block) when date, gym and working sets match, ignoring exercise ids', async () => {
    const r = parseImportJson(JSON.stringify(incoming(same)));
    const d = await buildDraft(r.workouts[0], data([existing]), reg);
    expect(d.duplicateOf).toBeNull();
    expect(d.likelyDuplicateOf).toBe(existing.id);
    expect(d.issues[0]).toMatchObject({ level: 'warning' });
    expect(d.issues[0].message).toMatch(/Looks like a workout you already have/);
    expect(draftBlockers(d)).not.toContain('Duplicate workout');
  });

  it('no warning when the sets or the date differ', async () => {
    const other = [{ weight_kg: 50, reps: 11, rir: 1 }, ...same.slice(1)];
    const d = await buildDraft(parseImportJson(JSON.stringify(incoming(other))).workouts[0], data([existing]), reg);
    expect(d.likelyDuplicateOf).toBeNull();
    expect(findLikelyDuplicate({ ...existing, date: '2026-11-22' }, [existing])).toBeNull();
  });

  it('fingerprint ignores warm-ups, planned sets and exercise ids', () => {
    const a = workout('2026-11-21', [ex('lat_pulldown', [set(20, 10, 5, { type: 'warmup' }), set(50, 12, 2)])]);
    const b = workout('2026-11-21', [ex('close_grip_pulldown', [set(50, 12, 2), set(50, 12, 2, { planned: true })])]);
    expect(workoutFingerprint(a)).toBe(workoutFingerprint(b));
    expect(workoutFingerprint(workout('2026-11-21', [ex('lat_pulldown', [set(20, 10, 5, { type: 'warmup' })])]))).toBeNull();
  });
});
