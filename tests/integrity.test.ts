/**
 * Data integrity through the REAL encrypted store (fake IndexedDB in Node): six months of synthetic
 * history, refresh/lock/unlock, interrupted workouts, duplicate taps, corrections, old-format records
 * (migration), backup/restore, and performance with 6 / 12 / 24 months of data.
 * Synthetic data and throwaway passwords only.
 */
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as db from '../src/lib/db';
import { store } from '../src/lib/store';
import { createBackup, readBackup } from '../src/lib/backup';
import { analyze } from '../src/domain/analysis';
import { withCorrections } from '../src/domain/feedback';
import { migrateSettings } from '../src/domain/defaults';
import { bodyWeightForSession } from '../src/domain/bodyweight';
import { buildProgression } from '../src/domain/progression';
import { buildRegistry } from '../src/domain/registry';
import { parseImportJson } from '../src/domain/importer';
import type { AppData } from '../src/domain/appdata';
import type { Workout } from '../src/domain/types';
import { generateSixMonths, dayAdd } from './sim/sixMonth';

const PW = 'synthetic-integrity-vault-03'; // throwaway test password
const perf: Record<string, number> = {};
const time = async <T,>(label: string, fn: () => Promise<T> | T): Promise<T> => { const t = performance.now(); const r = await fn(); perf[label] = Math.round(performance.now() - t); return r; };
/** Content comparison independent of storage order (IndexedDB returns records sorted by key). */
const canon = (d: AppData) => JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Array.isArray(v) ? [...v].sort((a, b) => String(a.id).localeCompare(String(b.id))) : v]))));

async function freshVault() {
  db.useDatabase(`gymrat-integrity-${Math.random()}`);
  await store.init();
  await store.setup(PW);
}
/** A browser refresh: the in-memory key is gone; the vault must be unlocked again. */
async function refresh() {
  store.lock();
  await store.init();
  expect(store.getState().status).toBe('locked');
  expect(store.getState().data).toBeNull();
}

afterAll(() => {
  const out = path.join('test-artifacts', 'six-month-audit');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'performance.json'), JSON.stringify(perf, null, 2));
});

describe('six months through the encrypted store', () => {
  it('save → refresh → wrong password rejected → unlock → every record identical; no plaintext at rest', async () => {
    const { data } = generateSixMonths();
    await freshVault();
    await time('store.replaceAll 6 months (encrypt + write)', () => store.replaceAll(data, [{ id: 'ph_pd_a', bytes: new Uint8Array([9, 8, 7]) }]));
    await refresh();
    await expect(store.unlock('not-the-password')).rejects.toThrow();
    expect(store.getState().status).toBe('locked');
    await time('unlock + decrypt 6 months', () => store.unlock(PW));
    const back = store.getState().data!;
    const A = canon(back), B = canon({ ...data, settings: migrateSettings(data.settings) });
    expect(A).toEqual(B);
    expect(back.workouts.length).toBe(data.workouts.length);
    const raw = JSON.stringify(await db.rawRecordRows());
    for (const secret of ['Synthetic Gym A', 'Pec deck A', 'Technogym', 'morning_fasted', '2026-08-', 'incline_dumbbell_press']) expect(raw).not.toContain(secret);
    expect(new Uint8Array((await store.photoBytes('ph_pd_a'))!)).toEqual(new Uint8Array([9, 8, 7]));
  }, 60_000);

  it('interrupted workout: ticked sets survive a refresh; repeated saves never duplicate', async () => {
    const { data } = generateSixMonths();
    await freshVault();
    await store.replaceAll({ ...data, workouts: data.workouts.slice(0, 20) }, []);
    const live: Workout = { ...data.workouts[20], id: 'live-1', source: 'live', finishedAt: null, endTime: null, exercises: data.workouts[20].exercises.slice(0, 2).map((e) => ({ ...e, sets: e.sets.slice(0, 3).map((s, i) => ({ ...s, completedAt: `2026-11-21T18:0${i}:00Z` })) })) };
    await store.saveWorkout(live);
    await store.saveWorkout(live); // double tap / repeated autosave
    await store.saveWorkout({ ...live });
    await refresh();
    await store.unlock(PW);
    const ws = store.getState().data!.workouts;
    expect(ws.filter((w) => w.id === 'live-1')).toHaveLength(1);
    const got = ws.find((w) => w.id === 'live-1')!;
    expect(got.exercises.flatMap((e) => e.sets.map((s) => s.id))).toEqual(live.exercises.flatMap((e) => e.sets.map((s) => s.id)));
    expect(got.finishedAt ?? null).toBeNull(); // still resumable as unfinished
    expect(ws).toHaveLength(21);
  }, 60_000);

  it('a correction is stored with its audit trail; every other record is untouched', async () => {
    const { data } = generateSixMonths();
    await freshVault();
    await store.replaceAll(data, []);
    const before = canon(store.getState().data!);
    const w = data.workouts[30];
    const s0 = w.exercises[0].sets.find((s) => s.type === 'working')!;
    const edited = { ...w, exercises: w.exercises.map((e, i) => (i ? e : { ...e, sets: e.sets.map((s) => (s.id === s0.id ? { ...s, reps: (s.reps ?? 0) + 1 } : s)) })) };
    await store.saveWorkout(withCorrections(w, edited, '2026-11-21T19:00:00Z'));
    await refresh();
    await store.unlock(PW);
    const after = canon(store.getState().data!);
    const changed = after.workouts.find((x: Workout) => x.id === w.id);
    const set = changed.exercises[0].sets.find((s: { id: string }) => s.id === s0.id);
    expect(set.reps).toBe((s0.reps ?? 0) + 1);
    expect(set.corrections[0]).toMatchObject({ field: 'reps', from: s0.reps, to: (s0.reps ?? 0) + 1 });
    expect(after.workouts.filter((x: Workout) => x.id !== w.id)).toEqual(before.workouts.filter((x: Workout) => x.id !== w.id));
    expect(after.body).toEqual(before.body);
    expect(after.equipment).toEqual(before.equipment);
  }, 60_000);

  it('deleting a workout removes it for good (it does not come back after a refresh)', async () => {
    const { data } = generateSixMonths();
    await freshVault();
    await store.replaceAll({ ...data, workouts: data.workouts.slice(0, 5) }, []);
    await store.deleteWorkout(data.workouts[2].id);
    await refresh();
    await store.unlock(PW);
    expect(store.getState().data!.workouts.map((w) => w.id)).toEqual(data.workouts.slice(0, 5).filter((_, i) => i !== 2).map((w) => w.id));
  }, 60_000);
});

describe('old record formats (migration: nothing is rewritten, everything still works)', () => {
  it('v1.0-style records: no failure/feel fields, techniqueOk:false, date-only weigh-ins, partial settings', async () => {
    const old: Workout = {
      id: 'old-1', schemaVersion: 1, date: '2026-03-02', locationId: 'gym_a', locationConfidence: 'confirmed', source: 'claude_import', createdAt: '2026-03-02T20:00:00Z', updatedAt: '2026-03-02T20:00:00Z',
      exercises: [
        { id: 'oe1', order: 0, exerciseId: 'pec_deck', exerciseConfidence: 'confirmed', equipmentId: null, equipmentConfidence: 'unknown', sets: [
          { id: 'os1', type: 'working', weightKg: 40, loadMode: 'total', reps: 12, rir: 2, rirSource: 'reported', restSecBefore: null },
          { id: 'os2', type: 'working', weightKg: 40, loadMode: 'total', reps: 10, rir: null, rirSource: 'unknown', restSecBefore: null, techniqueOk: false },
        ] },
        { id: 'oe2', order: 1, exerciseId: 'pull_up', exerciseConfidence: 'confirmed', equipmentId: null, equipmentConfidence: 'unknown', sets: [
          { id: 'os3', type: 'working', weightKg: 0, loadMode: 'bodyweight_plus', reps: 8, rir: 1, rirSource: 'reported', restSecBefore: null },
        ] },
      ],
    };
    await freshVault();
    const partialSettings = { id: 'settings', timezone: 'UTC', weekStartsOn: 1 } as unknown as AppData['settings'];
    await store.replaceAll({ ...store.getState().data!, settings: partialSettings, workouts: [old], body: [{ id: 'ob1', date: '2026-03-01', weightKg: 78, photoIds: [] }] }, []);
    await refresh();
    await store.unlock(PW);
    const d = store.getState().data!;
    expect(d.settings.quality.rirCredit).toEqual([1, 1, 1, 1, 0.6, 0.3, 0.15, 0.15, 0]); // filled from defaults
    expect(d.settings.timezone).toBe('UTC'); // user value kept
    expect(d.workouts[0]).toEqual(old); // stored record not rewritten
    const a = analyze(d, new Date('2026-03-02T21:00:00Z'));
    // 1 × RIR 2 → 1.0  +  unknown 0.75 × compromised 0.7 = 0.525 → 0.53  → chest 1.53
    expect(a.muscles.find((m) => m.muscle === 'chest')!.completed).toBe(1.53);
    expect(a.progression.find((p) => p.exerciseId === 'pull_up')!.key).toBe('pull_up::free|load=bodyweight');
    expect(bodyWeightForSession(d.body, old)).toMatchObject({ kg: 78, status: 'ok' });
  }, 60_000);

  it('imports of every schema version 1.0–1.4 are accepted; 2.x is refused', () => {
    for (const v of ['1.0', '1.1', '1.2', '1.3', '1.4']) {
      const r = parseImportJson(JSON.stringify({ schema: 'gymrat.workout', schema_version: v, workouts: [{ date: '2026-11-20', exercises: [{ exercise_id: 'pec_deck', sets: [{ weight_kg: 40, reps: 10 }] }] }] }));
      expect(r.ok, v).toBe(true);
    }
    expect(parseImportJson(JSON.stringify({ schema: 'gymrat.workout', schema_version: '2.0', workouts: [] })).ok).toBe(false);
  });
});

// ---------------------------------------------------------------- performance & long-term reliability

function months(n: 6 | 12 | 24): AppData {
  const blocks = n / 6;
  // The NEWEST block always uses the default seed, so its current week equals the 6-month simulation.
  const parts = Array.from({ length: blocks }, (_, i) => generateSixMonths(20261121 + (blocks - 1 - i)).data);
  const shift = (i: number) => (blocks - 1 - i) * -182; // oldest block first, last block ends 2026-11-22
  const out = { ...parts[blocks - 1], workouts: [] as Workout[], body: [] as AppData['body'], daily: [] as AppData['daily'] };
  parts.forEach((p, i) => {
    const s = shift(i);
    out.workouts.push(...p.workouts.map((w) => ({ ...w, id: `${w.id}-${i}`, date: dayAdd(w.date, s), exercises: w.exercises.map((e) => ({ ...e, id: `${e.id}-${i}`, sets: e.sets.map((x) => ({ ...x, id: `${x.id}-${i}` })) })) })));
    out.body.push(...p.body.map((b) => ({ ...b, id: `${b.id}-${i}`, date: dayAdd(b.date, s) })));
    out.daily.push(...p.daily.map((d) => ({ ...d, id: dayAdd(d.date, s), date: dayAdd(d.date, s) })));
  });
  out.settings = { ...out.settings, learning: { startDate: out.workouts[0].date, endedOn: null, lengthDays: 30 } };
  return out;
}

describe('performance with 6, 12 and 24 months of history', () => {
  for (const n of [6, 12, 24] as const) {
    it(`${n} months: full analysis, progression and weekly history stay fast and correct`, async () => {
      const d = months(n);
      const now = new Date('2026-11-22T20:00:00Z');
      analyze(d, now); // warm-up (JIT)
      const a = await time(`analyze() ${n} months (${d.workouts.length} workouts)`, () => analyze(d, now));
      await time(`buildProgression ${n} months`, () => buildProgression(d.workouts, buildRegistry([], []), d.equipment, [], 2, '2026-11-22'));
      expect(a.weeks.reduce((t, b) => t + b.workouts.length, 0)).toBe(d.workouts.length); // nothing lost
      expect(perf[`analyze() ${n} months (${d.workouts.length} workouts)`]).toBeLessThan(n === 24 ? 4000 : 2500);
      // Long histories do not change the current week's numbers (only the data in it matters).
      if (n === 24) {
        const six = analyze(months(6), now);
        expect(a.muscles.map((m) => m.completed)).toEqual(six.muscles.map((m) => m.completed));
      }
    }, 60_000);
  }

  it('24 months: encrypted save, unlock, backup and restore', async () => {
    const d = months(24);
    await freshVault();
    await time('store.replaceAll 24 months', () => store.replaceAll(d, []));
    await refresh();
    await time('unlock + decrypt 24 months', () => store.unlock(PW));
    expect(store.getState().data!.workouts.length).toBe(d.workouts.length);
    const file = await time('createBackup 24 months', () => createBackup(store.getState().data!, async () => null, 'synthetic-backup-pass'));
    const text = JSON.stringify(file);
    perf['backup file size KB (24 months)'] = Math.round(text.length / 1024);
    const back = await time('readBackup 24 months', () => readBackup(text, 'synthetic-backup-pass'));
    expect(canon(back.data)).toEqual(canon(store.getState().data!));
    await time('restore (replaceAll) 24 months', () => store.replaceAll(back.data, back.photos));
    expect(canon(store.getState().data!)).toEqual(canon(back.data));
  }, 120_000);
});
