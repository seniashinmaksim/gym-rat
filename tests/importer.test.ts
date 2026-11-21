import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDraft, draftBlockers, parseImportJson, type WorkoutInT } from '../src/domain/importer';
import { buildRegistry } from '../src/domain/registry';
import type { Equipment } from '../src/domain/types';
import { data } from './fixtures';

const reg = buildRegistry([], []);

const bare = {
  date: '2026-11-21',
  location_id: 'gym_a',
  exercises: [{ exercise_id: 'lat_pulldown', sets: [{ weight_kg: 50, reps: 12, rir: 2 }] }],
};

function first(json: unknown): WorkoutInT {
  const r = parseImportJson(JSON.stringify(json));
  expect(r.errors).toEqual([]);
  expect(r.ok).toBe(true);
  return r.workouts[0];
}

const eq: Equipment = {
  id: 'eq_1', locationId: 'gym_a', name: 'Lat pulldown station', kind: 'cable', identified: false, incrementsKg: [5],
  settings: {}, exerciseIds: ['lat_pulldown'], photoIds: [], createdAt: '', updatedAt: '',
};

describe('parseImportJson', () => {
  it('accepts an envelope, a bare workout, an array and fenced JSON', () => {
    expect(parseImportJson(JSON.stringify({ schema: 'gymrat.workout', schema_version: '1.0', workouts: [bare] })).ok).toBe(true);
    expect(parseImportJson(JSON.stringify(bare)).ok).toBe(true);
    const arr = parseImportJson(JSON.stringify([bare, { ...bare, date: '2026-11-22' }]));
    expect(arr.ok).toBe(true);
    expect(arr.workouts).toHaveLength(2);
    const fenced = parseImportJson('Here you go:\n```json\n' + JSON.stringify(bare) + '\n```\n');
    expect(fenced.ok).toBe(true);
  });

  it('rejects invalid JSON, bad dates, unknown keys and missing exercise identity', () => {
    expect(parseImportJson('{nope').ok).toBe(false);
    expect(parseImportJson(JSON.stringify({ ...bare, date: '21.11.2026' })).ok).toBe(false);
    expect(parseImportJson(JSON.stringify({ ...bare, mood: 'great' })).ok).toBe(false);
    const badSet = { ...bare, exercises: [{ exercise_id: 'lat_pulldown', sets: [{ weight_kg: 50, reps: 12, weight_lbs: 110 }] }] };
    expect(parseImportJson(JSON.stringify(badSet)).ok).toBe(false);
    const noId = { ...bare, exercises: [{ sets: [{ weight_kg: 50, reps: 12 }] }] };
    const r = parseImportJson(JSON.stringify(noId));
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('exercise_id or exercise_name_raw');
  });

  it('requires weight_kg and reps keys (null allowed, never omitted)', () => {
    expect(parseImportJson(JSON.stringify({ ...bare, exercises: [{ exercise_id: 'lat_pulldown', sets: [{ reps: 12 }] }] })).ok).toBe(false);
    expect(parseImportJson(JSON.stringify({ ...bare, exercises: [{ exercise_id: 'lat_pulldown', sets: [{ weight_kg: null, reps: null }] }] })).ok).toBe(true);
  });

  it('rejects unsupported schema versions', () => {
    const r = parseImportJson(JSON.stringify({ schema: 'gymrat.workout', schema_version: '2.0', workouts: [bare] }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('Unsupported schema_version');
  });

  it('applies set defaults', () => {
    const w = first(bare);
    expect(w.exercises[0].sets[0].type).toBe('working');
    expect(w.exercises[0].sets[0].load_mode).toBe('total');
  });

  it('validates the shipped synthetic example', () => {
    const text = readFileSync(new URL('../examples/synthetic-workout.json', import.meta.url), 'utf8');
    const r = parseImportJson(text);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe('buildDraft', () => {
  it('resolves known exercise ids and confirmed location ids', async () => {
    const d = await buildDraft(first(bare), data([]), reg);
    expect(d.workout.exercises[0].exerciseId).toBe('lat_pulldown');
    expect(d.workout.locationId).toBe('gym_a');
    expect(d.workout.locationConfidence).toBe('confirmed');
    expect(draftBlockers(d)).toEqual([]);
  });

  it('fuzzy-matches an exact English name', async () => {
    const w = first({ date: '2026-11-21', exercises: [{ exercise_name_raw: 'Lat pulldown', sets: [{ weight_kg: 50, reps: 10 }] }] });
    const d = await buildDraft(w, data([]), reg);
    expect(d.workout.exercises[0].exerciseId).toBe('lat_pulldown');
    expect(d.exercises[0].exerciseConfidence).toBe('probable');
  });

  it('flags unrecognised names as a blocker and offers suggestions', async () => {
    const w = first({ date: '2026-11-21', exercises: [{ exercise_name_raw: 'Zercher wombat hold', sets: [{ weight_kg: 50, reps: 10 }] }] });
    const d = await buildDraft(w, data([]), reg);
    expect(d.workout.exercises[0].exerciseId.startsWith('unresolved:')).toBe(true);
    expect(draftBlockers(d).length).toBe(1);
    expect(d.issues.some((i) => i.level === 'error')).toBe(true);
  });

  it('suggests the right library entry for an alias even when not auto-resolved', async () => {
    const w = first({ date: '2026-11-21', exercises: [{ exercise_name_raw: 'Incline chest press', sets: [{ weight_kg: 45, reps: 10 }] }] });
    const d = await buildDraft(w, data([]), reg);
    expect(d.exercises[0].exerciseSuggestions).toContain('incline_chest_press');
  });

  it('expands count and attaches RIR only to the stated set', async () => {
    const w = first({
      date: '2026-11-21',
      exercises: [{ exercise_id: 'incline_chest_press', sets: [{ weight_kg: 45, reps: 10, count: 2 }, { weight_kg: 45, reps: 10, rir: 2 }] }],
    });
    const d = await buildDraft(w, data([]), reg);
    const sets = d.workout.exercises[0].sets;
    expect(sets).toHaveLength(3);
    expect(sets.map((s) => s.rir)).toEqual([null, null, 2]);
    expect(sets.map((s) => s.rirSource)).toEqual(['unknown', 'unknown', 'reported']);
    expect(new Set(sets.map((s) => s.id)).size).toBe(3);
  });

  it('applies rest_between_sets_sec to every set after the first', async () => {
    const w = first({ date: '2026-11-21', exercises: [{ exercise_id: 'lat_pulldown', rest_between_sets_sec: 120, sets: [{ weight_kg: 50, reps: 12, count: 3 }] }] });
    const d = await buildDraft(w, data([]), reg);
    expect(d.workout.exercises[0].sets.map((s) => s.restSecBefore)).toEqual([null, 120, 120]);
  });

  it('never invents missing values', async () => {
    const w = first({ date: '2026-11-21', exercises: [{ exercise_id: 'lat_pulldown', sets: [{ weight_kg: null, reps: 12 }] }] });
    const d = await buildDraft(w, data([]), reg);
    const s = d.workout.exercises[0].sets[0];
    expect(s.weightKg).toBeNull();
    expect(s.rir).toBeNull();
    expect(d.workout.locationId).toBeNull();
    expect(d.workout.locationConfidence).toBe('unknown');
  });

  it('blocks duplicates by content hash', async () => {
    const w = first(bare);
    const d1 = await buildDraft(w, data([]), reg);
    const existing = data([], { imports: [{ id: 'imp1', hash: d1.hash, workoutId: 'w_old', importedAt: '', source: 'claude_import' }] });
    const d2 = await buildDraft(w, existing, reg);
    expect(d2.duplicateOf).toBe('w_old');
    expect(draftBlockers(d2)).toContain('Duplicate workout');
  });

  it('blocks duplicates by client_ref', async () => {
    const d1 = await buildDraft(first({ ...bare, client_ref: 'msg-42' }), data([]), reg);
    const saved = { ...d1.workout, id: 'w_saved', importHash: 'different' };
    const d2 = await buildDraft(first({ ...bare, client_ref: 'msg-42', exercises: [{ exercise_id: 'pec_deck', sets: [{ weight_kg: 40, reps: 12 }] }] }), data([saved]), reg);
    expect(d2.duplicateOf).toBe('w_saved');
  });

  it('warns about another workout on the same day and location', async () => {
    const d1 = await buildDraft(first(bare), data([]), reg);
    const other = first({ ...bare, exercises: [{ exercise_id: 'pec_deck', sets: [{ weight_kg: 40, reps: 12 }] }] });
    const d2 = await buildDraft(other, data([{ ...d1.workout, id: 'w_same_day' }]), reg);
    expect(d2.duplicateOf).toBeNull();
    expect(d2.issues.some((i) => i.path === 'date' && i.level === 'warning')).toBe(true);
  });

  it('matches locations by name hint only as a suggestion', async () => {
    const w = first({ date: '2026-11-21', location: { name_hint: 'gym a' }, exercises: bare.exercises });
    const d = await buildDraft(w, data([]), reg);
    expect(d.workout.locationId).toBeNull();
    expect(d.locationSuggestions).toContain('gym_a');
  });

  it('matches an equipment instance linked to the exercise at this gym as probable', async () => {
    const d = await buildDraft(first(bare), data([], { equipment: [eq] }), reg);
    expect(d.workout.exercises[0].equipmentId).toBe('eq_1');
    expect(d.exercises[0].equipmentConfidence).toBe('probable');
  });

  it('confirms an explicit equipment id and warns about large load jumps on the same machine', async () => {
    const prev = await buildDraft(first({ ...bare, date: '2026-11-14', exercises: [{ exercise_id: 'lat_pulldown', equipment_id: 'eq_1', sets: [{ weight_kg: 50, reps: 10 }] }] }), data([], { equipment: [eq] }), reg);
    const w = first({ ...bare, exercises: [{ exercise_id: 'lat_pulldown', equipment_id: 'eq_1', sets: [{ weight_kg: 90, reps: 10 }] }] });
    const d = await buildDraft(w, data([prev.workout], { equipment: [eq] }), reg);
    expect(d.exercises[0].equipmentConfidence).toBe('confirmed');
    expect(d.issues.some((i) => i.message.includes('differs a lot'))).toBe(true);
  });

  it('warns when a machine exercise has no identified equipment', async () => {
    const w = first({ date: '2026-11-21', location_id: 'gym_a', exercises: [{ exercise_id: 'pec_deck', sets: [{ weight_kg: 40, reps: 12 }] }] });
    const d = await buildDraft(w, data([]), reg);
    expect(d.workout.exercises[0].equipmentId).toBeNull();
    expect(d.issues.some((i) => i.path === 'exercises[0].equipment')).toBe(true);
  });
});

describe('documentation examples', () => {
  it('every JSON block in WORKOUT_PARSING.md is a valid import', () => {
    const md = readFileSync(new URL('../WORKOUT_PARSING.md', import.meta.url), 'utf8');
    const blocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThanOrEqual(10);
    for (const b of blocks) {
      const r = parseImportJson(b);
      expect(r.errors, b.slice(0, 80)).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });
});
