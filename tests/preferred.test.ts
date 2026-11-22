/**
 * The owner's preferred exercises as first-class citizens (FIX_PLAN.md). All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '../src/data/exercises';
import { analyze } from '../src/domain/analysis';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { buildDraft, parseImportJson, workoutHash, workoutToExport, type WorkoutInT } from '../src/domain/importer';
import { buildProgression, progressionKey, sessionPerf } from '../src/domain/progression';
import { countedSetCount, mergeSides, sideFactors } from '../src/domain/quality';
import { buildRegistry, loadUnitLabel, normalizeName, resolveCoefficients } from '../src/domain/registry';
import type { Equipment } from '../src/domain/types';
import { computeVolume } from '../src/domain/volume';
import { sha256Hex } from '../src/lib/crypto';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const vol = (ws: Parameters<typeof computeVolume>[0]) => computeVolume(ws, reg, DEFAULT_QUALITY);

/** How a name typed by the owner resolves in the importer (exact name / alias match). */
async function resolveName(name: string): Promise<string | null> {
  const d = await buildDraft({ date: '2026-11-18', exercises: [{ exercise_name_raw: name, sets: [{ type: 'working', weight_kg: 10, load_mode: 'total', reps: 10 }] }] } as WorkoutInT, data([]), reg);
  return d.exercises[0].exerciseId;
}

const PREFERRED: Record<string, string[]> = {
  '1 incline DB press': ['incline_dumbbell_press'],
  '2 straight-bar pushdown': ['triceps_pushdown_bar', 'triceps_pushdown_rope', 'triceps_pushdown'],
  '3 pec deck': ['pec_deck'],
  '4 biceps curls': ['machine_biceps_curl', 'preacher_curl', 'ez_bar_curl'],
  '5 lateral raises': ['lateral_raise', 'cable_lateral_raise'],
  '6 quads': ['back_squat', 'leg_extension'],
  '7 hamstrings': ['romanian_deadlift', 'dumbbell_romanian_deadlift', 'seated_leg_curl', 'lying_leg_curl', 'standing_leg_curl'],
  '8 hanging ab straps': ['hanging_knee_raise_pelvic_curl'],
};

describe('exercise database', () => {
  it('has all eight categories with EN + RU names, coefficients and a rep range', () => {
    for (const ids of Object.values(PREFERRED)) for (const id of ids) {
      const d = reg.get(id);
      expect(d, id).toBeDefined();
      expect(d!.name.en.length).toBeGreaterThan(2);
      expect(d!.name.ru.length).toBeGreaterThan(2);
      expect(Object.keys(d!.contributions).length).toBeGreaterThan(0);
      expect(d!.repRange[1]).toBeGreaterThanOrEqual(d!.repRange[0]);
    }
  });
  it('ids are unique and every alias/name belongs to exactly one exercise', () => {
    const ids = SEED_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const e of SEED_EXERCISES) {
      for (const n of new Set([e.name.en, e.name.ru, e.id.replace(/_/g, ' '), ...e.aliases].map(normalizeName))) {
        const o = owner.get(n);
        if (o && o !== e.id) clashes.push(`${n}: ${o} / ${e.id}`);
        owner.set(n, e.id);
      }
    }
    expect(clashes).toEqual([]);
  });
  it('names resolve to the right variation', async () => {
    expect(await resolveName('straight bar pushdown')).toBe('triceps_pushdown_bar');
    expect(await resolveName('rope pushdown')).toBe('triceps_pushdown_rope');
    expect(await resolveName('pushdown')).toBe('triceps_pushdown');
    expect(await resolveName('EZ curl')).toBe('ez_bar_curl');
    expect(await resolveName('machine curl')).toBe('machine_biceps_curl');
    expect(await resolveName('scott curl')).toBe('preacher_curl');
    expect(await resolveName('dumbbell RDL')).toBe('dumbbell_romanian_deadlift');
    expect(await resolveName('RDL')).toBe('romanian_deadlift');
    expect(await resolveName('standing leg curl')).toBe('standing_leg_curl');
    expect(await resolveName('ab straps')).toBe('hanging_knee_raise_pelvic_curl');
    expect(await resolveName('подъем коленей в петлях')).toBe('hanging_knee_raise_pelvic_curl');
    expect(await resolveName('leg raise')).toBe('hanging_leg_raise');
  });
  it('existing ids are kept so old history still resolves', () => {
    for (const id of ['triceps_pushdown', 'barbell_curl', 'preacher_curl', 'hanging_leg_raise', 'romanian_deadlift', 'lying_leg_curl', 'seated_leg_curl']) expect(reg.has(id)).toBe(true);
  });
  it('offers the owner\'s machine settings and variation controls', () => {
    expect(reg.get('pec_deck')!.settingTemplate).toEqual(['seat', 'handle position']);
    expect(reg.get('machine_biceps_curl')!.settingTemplate).toContain('arm pad');
    expect(reg.get('leg_extension')!.settingTemplate).toEqual(['seat', 'backrest', 'shin pad']);
    expect(reg.get('seated_leg_curl')!.settingTemplate).toContain('ankle pad');
    expect(reg.get('cable_lateral_raise')!.settingTemplate).toContain('pulley height');
    expect(reg.get('triceps_pushdown_bar')!.settingTemplate).toContain('cable height');
    expect(reg.get('incline_dumbbell_press')!.variationFields).toContain('angle');
    expect(reg.get('lateral_raise')!.variationFields).toEqual(expect.arrayContaining(['position', 'execution', 'unilateral']));
    expect(reg.get('back_squat')!.variationFields).toEqual(expect.arrayContaining(['depth', 'barPosition', 'stance']));
  });
});

describe('muscle coefficients (direct and indirect)', () => {
  const c = (id: string, angle?: number) => resolveCoefficients(reg.get(id)!, angle != null ? { benchAngleDeg: angle } : undefined).contributions;
  it('incline DB press: chest 1, front delts 0.5, triceps 0.5 at 15/30/45°; steep angle shifts to delts', () => {
    for (const a of [15, 30, 45]) expect(c('incline_dumbbell_press', a)).toMatchObject({ chest: 1, front_delts: 0.5, triceps: 0.5 });
    expect(c('incline_dumbbell_press', 60)).toMatchObject({ chest: 0.75, front_delts: 0.75 });
  });
  it('pec deck: chest only (front delts minor), no triceps', () => {
    expect(c('pec_deck')).toEqual({ chest: 1, front_delts: 0.25 });
  });
  it('pushdowns, curls, raises, legs and abs hit the right muscles', () => {
    expect(c('triceps_pushdown_bar')).toEqual({ triceps: 1 });
    expect(c('triceps_pushdown_rope')).toEqual({ triceps: 1 });
    expect(c('machine_biceps_curl').biceps).toBe(1);
    expect(c('ez_bar_curl').biceps).toBe(1);
    expect(c('lateral_raise').side_delts).toBe(1);
    expect(c('cable_lateral_raise').side_delts).toBe(1);
    expect(c('back_squat')).toEqual({ quads: 1, glutes: 0.75, adductors: 0.75, spinal_erectors: 0.25 }); // audit 2026-11-22 (Kubo 2019, full depth)
    expect(c('leg_extension')).toEqual({ quads: 1 });
    expect(c('romanian_deadlift')).toEqual({ hamstrings: 1, glutes: 0.75, adductors: 0.5, spinal_erectors: 0.25 }); // audit: grip/traps are stabilisers
    expect(c('dumbbell_romanian_deadlift')).toEqual(c('romanian_deadlift'));
    for (const id of ['seated_leg_curl', 'lying_leg_curl', 'standing_leg_curl']) expect(c(id).hamstrings).toBe(1);
    expect(c('romanian_deadlift').quads).toBeUndefined();
    expect(c('leg_extension').hamstrings).toBeUndefined();
  });
  it('ab straps (pelvic curl) = full ab set, no forearm credit; the bar version keeps its grip credit', () => {
    expect(c('hanging_knee_raise_pelvic_curl')).toEqual({ abs: 1 });
    expect(c('hanging_leg_raise').forearms).toBe(0.25);
  });
  it('one incline press set + one pushdown set: triceps gets 0.5 indirect + 1 direct', () => {
    const v = vol([workout('2026-11-18', [ex('incline_dumbbell_press', [set(25, 10, 2)], null, { variation: { benchAngleDeg: 30 } }), ex('triceps_pushdown_bar', [set(25, 12, 1)])])]);
    expect(v.muscles.triceps.effective).toBe(1.5);
    expect(v.muscles.triceps.directSets).toBe(1);
    expect(v.muscles.triceps.indirectSets).toBe(1);
    expect(v.muscles.chest.effective).toBe(1);
    expect(v.muscles.front_delts.effective).toBe(0.5);
    expect(v.regions.upper_chest.effective).toBe(1);
  });
});

describe('weights', () => {
  it('dumbbell weight is per dumbbell: "25 kg each hand" stays 25, never 50', async () => {
    const d = await buildDraft({ date: '2026-11-18', exercises: [{ exercise_id: 'incline_dumbbell_press', variation: { bench_angle_deg: 30 }, sets: [{ type: 'working', weight_kg: 25, load_mode: 'total', reps: 10, rir: 2, count: 3 }] }] } as WorkoutInT, data([]), reg);
    expect(d.workout.exercises[0].sets.map((s) => s.weightKg)).toEqual([25, 25, 25]);
    expect(loadUnitLabel(reg.get('incline_dumbbell_press'), 'total')).toBe('kg per dumbbell');
    expect(loadUnitLabel(reg.get('lateral_raise'), 'total')).toBe('kg per dumbbell');
  });
  it('EZ bar / barbell: the reported total is stored as-is and no bar weight is assumed', async () => {
    const d = await buildDraft({ date: '2026-11-18', exercises: [{ exercise_id: 'ez_bar_curl', sets: [{ type: 'working', weight_kg: 30, load_mode: 'total', reps: 10 }] }] } as WorkoutInT, data([]), reg);
    expect(d.workout.exercises[0].sets[0].weightKg).toBe(30);
    expect(loadUnitLabel(reg.get('ez_bar_curl'), 'total')).toBe('kg total');
    expect(loadUnitLabel(reg.get('back_squat'), 'total')).toBe('kg total');
    expect(loadUnitLabel(reg.get('pec_deck'), 'total')).toBe('kg on stack');
  });
});

describe('warm-ups and unilateral counting', () => {
  it('warm-up sets never add volume', () => {
    const v = vol([workout('2026-11-18', [ex('back_squat', [set(60, 8, null, { type: 'warmup' }), set(100, 6, 2)])])]);
    expect(v.muscles.quads.effective).toBe(1);
    expect(v.totalWarmupSets).toBe(1);
    expect(v.totalWorkingSets).toBe(1);
  });
  it('3 left + 3 right = 3 sets for the muscle, not 6', () => {
    const sides = ['left', 'right', 'left', 'right', 'left', 'right'] as const;
    const w = workout('2026-11-18', [ex('cable_lateral_raise', sides.map((s) => set(7.5, 12, 1, { side: s })), null, { variation: { unilateral: true } })]);
    const v = vol([w]);
    expect(v.muscles.side_delts.effective).toBe(3);
    expect(v.muscles.side_delts.rawWorkingSets).toBe(3);
    expect(v.totalWorkingSets).toBe(3);
    expect(countedSetCount(w.exercises[0].sets)).toBe(3);
  });
  it('an unpaired side counts as one set; pair credit is the average of the two sides', () => {
    const sets = [set(10, 12, 1, { side: 'left' }), set(10, 12, 1, { side: 'right' }), set(10, 12, 1, { side: 'left' })];
    expect(countedSetCount(sets)).toBe(2);
    const f = sideFactors(sets);
    expect([...f.values()]).toEqual([0.5, 0.5, 1]);
    // RIR 1 (credit 1.0) left + RIR 4 (credit 0.6) right → one set worth 0.8
    const v = vol([workout('2026-11-18', [ex('standing_leg_curl', [set(20, 12, 1, { side: 'left' }), set(20, 12, 4, { side: 'right' })])])]);
    expect(v.muscles.hamstrings.effective).toBe(0.8);
  });
  it('sets without sides (both limbs or one-arm row done both sides) still count once each', () => {
    expect(countedSetCount([set(30, 10), set(30, 10), set(30, 10)])).toBe(3);
  });
});

describe('separate histories, shared muscle volume', () => {
  const w1 = workout('2026-11-10', [
    ex('triceps_pushdown_bar', [set(30, 12, 1)], 'cable_1'),
    ex('triceps_pushdown_rope', [set(20, 12, 1)], 'cable_1'),
    ex('lateral_raise', [set(10, 15, 1)]),
    ex('cable_lateral_raise', [set(5, 15, 1, { side: 'left' }), set(5, 15, 1, { side: 'right' })], 'cable_1', { variation: { unilateral: true } }),
    ex('machine_biceps_curl', [set(35, 10, 1)], 'curl_m'),
    ex('ez_bar_curl', [set(30, 10, 1)]),
    ex('back_squat', [set(100, 6, 2)]),
    ex('leg_extension', [set(60, 12, 1)], 'legext'),
    ex('romanian_deadlift', [set(100, 8, 2)]),
    ex('seated_leg_curl', [set(50, 12, 1)], 'slc'),
    ex('hanging_knee_raise_pelvic_curl', [set(0, 12, 1, { loadMode: 'bodyweight_plus' })]),
  ]);
  const prog = buildProgression([w1], reg, [], [], 2, '2026-11-18');
  const ids = prog.map((p) => p.exerciseId);
  it('each preferred variation has its own progression history', () => {
    for (const id of ['triceps_pushdown_bar', 'triceps_pushdown_rope', 'lateral_raise', 'cable_lateral_raise', 'machine_biceps_curl', 'ez_bar_curl', 'back_squat', 'leg_extension', 'romanian_deadlift', 'seated_leg_curl', 'hanging_knee_raise_pelvic_curl']) {
      expect(ids.filter((x) => x === id).length, id).toBe(1);
    }
  });
  it('but they add up in the same muscle volume', () => {
    const v = vol([w1]);
    expect(v.muscles.triceps.effective).toBe(2);
    expect(v.muscles.side_delts.effective).toBe(2);
    expect(v.muscles.quads.effective).toBe(2);
    expect(v.muscles.hamstrings.effective).toBe(2);
    expect(v.muscles.abs.effective).toBe(1);
    expect(v.muscles.biceps.effective).toBe(2);
  });
  it('bench angles keep separate histories (15° vs 45°); unspecified keeps the old key', () => {
    const mk = (d: string, angle: number | null) => workout(d, [ex('incline_dumbbell_press', [set(25, 10, 2)], null, angle != null ? { variation: { benchAngleDeg: angle } } : {})]);
    const p = buildProgression([mk('2026-11-01', 15), mk('2026-11-04', 45), mk('2026-11-07', null)], reg, [], [], 2, '2026-11-18');
    expect(p.map((x) => x.key).sort()).toEqual(['incline_dumbbell_press::free', 'incline_dumbbell_press::free|angle=15', 'incline_dumbbell_press::free|angle=45']);
    expect(p.find((x) => x.key.endsWith('angle=45'))!.scopeLabel).toBe('Free weights · 45°');
  });
  it('the same pec deck model at two gyms never shares a history', () => {
    const eq: Equipment[] = [
      { id: 'pd_a', locationId: 'gym_a', name: 'Pec deck (Gym A)', kind: 'machine', identified: true, incrementsKg: [5], settings: { seat: '4' }, exerciseIds: ['pec_deck'], photoIds: [], createdAt: '', updatedAt: '' },
      { id: 'pd_b', locationId: 'gym_b', name: 'Pec deck (Gym B)', kind: 'machine', identified: true, incrementsKg: [2.5], settings: {}, exerciseIds: ['pec_deck'], photoIds: [], createdAt: '', updatedAt: '' },
    ];
    const ws = [
      workout('2026-11-02', [ex('pec_deck', [set(45, 12, 1)], 'pd_a')]),
      workout('2026-11-05', [ex('pec_deck', [set(60, 12, 1)], 'pd_b')], { locationId: 'gym_b' }),
    ];
    const p = buildProgression(ws, reg, eq, [], 2, '2026-11-18');
    expect(p.length).toBe(2);
    expect(p.map((x) => x.next.increment).sort()).toEqual([2.5, 5]);
    // and without an equipment id, unidentified machines at different gyms are also kept apart
    const keys = ws.map((w) => progressionKey({ ...w.exercises[0], equipmentId: null }, w, reg.get('pec_deck')));
    expect(new Set(keys).size).toBe(2);
  });
  it('per-side performance is kept in the session record', () => {
    const perf = sessionPerf(w1, w1.exercises[3])!;
    expect(perf.sets.map((s) => s.side)).toEqual(['left', 'right']);
  });
  it('the double-progression load rule needs two sessions of evidence', () => {
    const top = (d: string) => workout(d, [ex('pec_deck', [set(45, 15, 1), set(45, 15, 1), set(45, 15, 1)], 'pd_a')]);
    expect(buildProgression([top('2026-11-10')], reg, [], [], 2, '2026-11-18')[0].next.action).toBe('hold');
    expect(buildProgression([top('2026-11-10'), top('2026-11-13')], reg, [], [], 2, '2026-11-18')[0].next.action).toBe('increase');
  });
});

describe('dashboard integration', () => {
  it('saving a workout immediately lowers the remaining sets', () => {
    const now = new Date('2026-11-18T20:00:00Z');
    const before = analyze(data([]), now);
    const after = analyze(data([workout('2026-11-18', [
      ex('incline_dumbbell_press', [set(25, 10, 2), set(25, 10, 2), set(25, 9, 1)], null, { variation: { benchAngleDeg: 30 } }),
      ex('hanging_knee_raise_pelvic_curl', [set(0, 12, 1), set(0, 12, 1)]),
    ])]), now);
    const m = (a: typeof before, id: string) => a.muscles.find((x) => x.muscle === id)!;
    expect(m(after, 'chest').completed).toBe(3);
    expect(m(after, 'chest').remainingToPreferred).toBe(m(before, 'chest').remainingToPreferred - 3);
    expect(m(after, 'triceps').completed).toBe(1.5);
    expect(m(after, 'abs').completed).toBe(2);
  });
});

describe('import v1.1', () => {
  it("parses the owner's example message as Claude would encode it", async () => {
    const json = {
      schema: 'gymrat.workout', schema_version: '1.1',
      workouts: [{
        date: '2026-11-18', location: { name_hint: 'Gym A', confidence: 'probable' },
        raw_input: 'Today I trained at Gym A. Incline dumbbell press, 25 kg each hand, 3 sets of 10, RIR 2. Pec deck, 45 kg, 3 sets of 12, RIR 1. Cable triceps pushdown with a straight bar, 25 kg, 3 sets of 12.',
        exercises: [
          { exercise_id: 'incline_dumbbell_press', exercise_name_raw: 'Incline dumbbell press', sets: [{ weight_kg: 25, reps: 10, rir: 2, count: 3 }] },
          { exercise_id: 'pec_deck', exercise_name_raw: 'Pec deck', equipment: { name_hint: 'pec deck', confidence: 'uncertain' }, sets: [{ weight_kg: 45, reps: 12, rir: 1, count: 3 }] },
          { exercise_id: 'triceps_pushdown_bar', exercise_name_raw: 'Cable triceps pushdown with a straight bar', equipment: { name_hint: 'cable machine', confidence: 'uncertain' }, sets: [{ weight_kg: 25, reps: 12, count: 3 }] },
        ],
        uncertainties: ['Bench angle not given', 'Pushdown RIR not given', 'Rest not given'],
      }],
    };
    const r = parseImportJson(JSON.stringify(json));
    expect(r.ok).toBe(true);
    const d = await buildDraft(r.workouts[0], data([]), reg);
    expect(d.workout.locationId).toBe(null); // name hint only → owner confirms the gym
    expect(d.locationSuggestions).toEqual(['gym_a']);
    const [press, deck, push] = d.workout.exercises;
    expect(press.sets.map((s) => [s.weightKg, s.reps, s.rir])).toEqual([[25, 10, 2], [25, 10, 2], [25, 10, 2]]);
    expect(deck.sets.length).toBe(3);
    expect(deck.equipmentId).toBe(null); // never guessed
    expect(push.sets.every((s) => s.rir == null && s.rirSource === 'unknown')).toBe(true);
    expect(d.issues.filter((i) => i.message.includes('machine not identified')).length).toBe(2);
  });
  it('keeps sides, variation and settings, and round-trips through export', async () => {
    const w: WorkoutInT = {
      date: '2026-11-18',
      exercises: [{
        exercise_id: 'cable_lateral_raise', variation: { attachment: 'cuff', position: 'standing' }, settings: { 'pulley height': 'lowest' }, rest_between_sets_sec: 60,
        sets: [{ type: 'warmup', weight_kg: 2.5, load_mode: 'total', reps: 12 }, { type: 'working', weight_kg: 7.5, load_mode: 'total', reps: 12, rir: 1, side: 'left' }, { type: 'working', weight_kg: 7.5, load_mode: 'total', reps: 11, rir: 1, side: 'right' }],
      }],
    } as WorkoutInT;
    const d = await buildDraft(w, data([]), reg);
    const e = d.workout.exercises[0];
    expect(e.variation).toMatchObject({ attachment: 'cuff', position: 'standing', unilateral: true });
    expect(e.settings).toEqual({ 'pulley height': 'lowest' });
    expect(e.sets.map((s) => s.side ?? null)).toEqual([null, 'left', 'right']);
    expect(e.sets[2].restSecBefore).toBe(60);
    const back = workoutToExport(d.workout);
    expect(back.exercises[0].sets.map((s) => s.side ?? null)).toEqual([null, 'left', 'right']);
    expect(back.exercises[0].variation).toMatchObject({ attachment: 'cuff', position: 'standing', unilateral: true });
    const again = parseImportJson(JSON.stringify({ schema_version: '1.1', workouts: [back] }));
    expect(again.ok).toBe(true);
  });
  it('v1.0 imports still validate and hash exactly as before (no duplicate re-imports)', async () => {
    const w = workout('2026-11-18', [ex('pec_deck', [set(45, 12, 1)], 'pd_a')]);
    const old = await sha256Hex(JSON.stringify({ d: w.date, l: w.locationId, e: w.exercises.map((e) => [e.exerciseId, e.equipmentId, e.sets.map((s) => [s.type, s.weightKg, s.reps, s.rir])]) }));
    expect(await workoutHash(w)).toBe(old);
    expect(parseImportJson(JSON.stringify({ schema_version: '1.0', workouts: [{ date: '2026-11-18', exercises: [{ exercise_id: 'pec_deck', sets: [{ weight_kg: 45, reps: 12 }] }] }] })).ok).toBe(true);
  });
});

describe('docs stay in sync with the exercise database', () => {
  it('every exercise_id in WORKOUT_PARSING.md exists, and CLAUDE.md lists every seed id', async () => {
    const { readFileSync } = await import('node:fs');
    const parsing = readFileSync(new URL('../WORKOUT_PARSING.md', import.meta.url), 'utf8');
    const used = [...parsing.matchAll(/"exercise_id": "([a-z_]+)"/g)].map((m) => m[1]);
    expect(used.filter((id) => !reg.has(id))).toEqual([]);
    const claude = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
    const listed = new Set([...claude.matchAll(/^\| ([a-z_]+) \|/gm)].map((m) => m[1]).filter((id) => id !== 'exercise_id'));
    expect(SEED_EXERCISES.map((e) => e.id).filter((id) => !listed.has(id))).toEqual([]);
    expect([...listed].filter((id) => !reg.has(id))).toEqual([]);
  });
});

describe('review regressions', () => {
  const w = (e: ReturnType<typeof ex>) => workout('2026-11-01', [e]);
  const key = (e: ReturnType<typeof ex>) => progressionKey(e, w(e), reg.get(e.exerciseId));
  it('fields that existed before v1.1 do not re-key old histories (except the bench angle)', () => {
    expect(key(ex('lat_pulldown', [set(50, 10)], 'eq1', { variation: { grip: 'supinated' } }))).toBe('lat_pulldown::eq1');
    expect(key(ex('dumbbell_row', [set(30, 10)], null, { variation: { unilateral: true } }))).toBe('dumbbell_row::free');
    expect(key(ex('bulgarian_split_squat', [set(20, 10)], null, { variation: { unilateral: true } }))).toBe('bulgarian_split_squat::free');
    expect(key(ex('incline_dumbbell_press', [set(25, 10)], null, { variation: { benchAngleDeg: 30 } }))).toBe('incline_dumbbell_press::free|angle=30');
  });
  it('unilateral without sides keeps the v1.0 meaning: each set counts once', () => {
    const v = vol([w(ex('bulgarian_split_squat', [set(20, 10, 1), set(20, 10, 1), set(20, 10, 1)], null, { variation: { unilateral: true } }))]);
    expect(v.muscles.quads.effective).toBe(3);
  });
  it('leaving left/right logging merges pairs instead of doubling the count', () => {
    const sets = [set(20, 12, 1, { side: 'left' }), set(20, 11, 1, { side: 'right' }), set(20, 12, 1, { side: 'left' }), set(20, 10, 2, { side: 'right' }), set(20, 9, 1, { side: 'left' })];
    const before = countedSetCount(sets);
    const merged = mergeSides(sets);
    expect(before).toBe(3);
    expect(merged.length).toBe(3);
    expect(countedSetCount(merged)).toBe(3);
    expect(merged.every((s) => s.side === undefined)).toBe(true);
    expect(merged.map((s) => s.reps)).toEqual([12, 12, 9]);
  });
});
