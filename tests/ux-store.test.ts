/**
 * UX audit (2026-11-22) — data safety through the REAL encrypted store (fake IndexedDB):
 *  - an edit still pending when the vault locks is written before the key is dropped (it used to be lost);
 *  - unsaved form drafts are encrypted at rest, survive lock + unlock, are not part of backups, and can be cleared;
 *  - Undo of a deleted workout puts back the identical record.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as db from '../src/lib/db';
import { store } from '../src/lib/store';
import { createBackup } from '../src/lib/backup';
import type { Workout } from '../src/domain/types';
import { ex, set, workout } from './fixtures';

const PW = 'synthetic-ux-store-pw-01';

async function freshVault() {
  db.useDatabase(`gymrat-ux-${Math.random()}`);
  await store.init();
  await store.setup(PW);
}
const tick = () => new Promise((r) => setTimeout(r, 30));

describe('pending edits are written before the vault locks', () => {
  it('a flush registered with onBeforeLock runs while the key is still there; the edit is stored', async () => {
    await freshVault();
    const w = workout('2026-11-20', [ex('pec_deck', [set(45, 12, 1)], 'pd_a')], { source: 'live' });
    await store.saveWorkout(w);
    // The logger keeps an edit in a 350 ms debounce; Lock now arrives before it fires.
    const pending: Workout = { ...w, exercises: [{ ...w.exercises[0], sets: [{ ...w.exercises[0].sets[0], reps: 14 }] }] };
    const off = store.onBeforeLock(() => { void store.saveWorkout(pending); });
    store.lock();
    off();
    await tick();
    await store.unlock(PW);
    expect(store.getState().data!.workouts[0].exercises[0].sets[0].reps).toBe(14);
  });
  it('a save that finishes after the lock never crashes and never resurrects plaintext in memory', async () => {
    await freshVault();
    const w = workout('2026-11-20', [ex('pec_deck', [set(45, 12, 1)], 'pd_a')]);
    const p = store.saveWorkout(w);
    store.lock();
    await expect(p).resolves.toBeUndefined();
    expect(store.getState().data).toBeNull();
    await store.unlock(PW);
    expect(store.getState().data!.workouts).toHaveLength(1);
  });
});

describe('encrypted drafts', () => {
  it('survive lock + unlock, are encrypted at rest, cleared on demand', async () => {
    await freshVault();
    await store.saveDraft('bodyweight:new', { kg: 81.7, note: 'synthetic draft note' });
    store.lock();
    expect(store.getDraft('bodyweight:new')).toBeUndefined(); // nothing readable while locked
    const raw = JSON.stringify(await db.rawRecordRows());
    expect(raw).not.toContain('synthetic draft note');
    expect(raw).not.toContain('81.7');
    await store.unlock(PW);
    expect(store.getDraft('bodyweight:new')).toEqual({ kg: 81.7, note: 'synthetic draft note' });
    await store.clearDraft('bodyweight:new');
    store.lock();
    await store.unlock(PW);
    expect(store.getDraft('bodyweight:new')).toBeUndefined();
  });
  it('are not part of a backup', async () => {
    await freshVault();
    await store.saveDraft('import', { text: 'synthetic pasted json' });
    const backup = await createBackup(store.getState().data!, async () => null, 'synthetic-backup-pw-01');
    expect(JSON.stringify(store.getState().data)).not.toContain('synthetic pasted json');
    expect(backup).toBeTruthy();
  });
  it('a draft written while locked is ignored (no key → nothing stored)', async () => {
    await freshVault();
    store.lock();
    await store.saveDraft('x', { a: 1 });
    await store.unlock(PW);
    expect(store.getDraft('x')).toBeUndefined();
  });
});

describe('undo of a delete restores the identical record', () => {
  it('putWorkoutAsIs keeps every field, including updatedAt', async () => {
    await freshVault();
    const w = workout('2026-11-20', [ex('pec_deck', [set(45, 12, 1), set(45, 11, 1)], 'pd_a')]);
    await store.saveWorkout(w);
    const saved = store.getState().data!.workouts[0];
    await store.deleteWorkout(saved.id);
    expect(store.getState().data!.workouts).toHaveLength(0);
    await store.putWorkoutAsIs(saved);
    expect(store.getState().data!.workouts[0]).toEqual(saved);
    store.lock();
    await store.unlock(PW);
    expect(store.getState().data!.workouts[0]).toEqual(saved);
  });
});

describe('review fixes', () => {
  it('draft record ids are opaque (no exercise / gym id readable at rest); write → clear in order', async () => {
    await freshVault();
    const id = 'equipment:new:pec_deck:synthetic_gym_a';
    const w = store.saveDraft(id, { name: 'x' });
    const c = store.clearDraft(id); // issued while the write is still encrypting
    await Promise.all([w, c]);
    const rows = JSON.stringify(await db.rawRecordRows());
    expect(rows).not.toContain('synthetic_gym_a');
    expect(rows).not.toContain('pec_deck');
    store.lock();
    await store.unlock(PW);
    expect(store.getDraft(id)).toBeUndefined(); // the delete was not overtaken by the earlier write
  });
});
