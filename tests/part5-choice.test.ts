/**
 * Part 5 — exercise-choice assistant (E.1) and exercise order / fatigue cost (E.2). Synthetic data, UTC.
 * Expected values are derived by hand from the documented rules (CLAUDE.md §D recovery windows, rule
 * `choice_status`, `exercise_order`, `fatigue_cost`), not read back from the implementation.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { assessChoice, choiceOutcomes, isAcknowledged, needsPrompt } from '../src/domain/exerciseChoice';
import { fatigueCostOf, sessionLoad } from '../src/domain/fatigue';
import { SEED_BY_ID } from '../src/data/exercises';
import type { AppData } from '../src/domain/appdata';
import type { Equipment, Workout } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const EQ = (id: string, name: string, exerciseIds: string[]): Equipment => ({
  id, locationId: 'gym_a', name, kind: 'machine', identified: true, incrementsKg: [5], minKg: 5, maxKg: 150, settings: {}, exerciseIds, photoIds: [], createdAt: '', updatedAt: '',
});
const EQUIP = [EQ('pd_a', 'Pec deck A', ['pec_deck']), { ...EQ('cable_a', 'Cable A', ['triceps_pushdown_bar']), kind: 'cable' as const }, EQ('legext_a', 'Leg extension A', ['leg_extension'])];

/** Familiar history 2–3 weeks back (all recovered): every exercise used 2× at gym_a. */
const familiar = (): Workout[] => ['2026-11-02', '2026-11-05'].map((d) => workout(d, [
  ex('incline_dumbbell_press', [set(25, 10), set(25, 9)], null, { variation: { benchAngleDeg: 30 } }),
  ex('pec_deck', [set(45, 12), set(45, 11)], 'pd_a'),
  ex('triceps_pushdown_bar', [set(30, 12), set(30, 11)], 'cable_a'),
  ex('back_squat', [set(80, 8), set(80, 8)]),
  ex('romanian_deadlift', [set(70, 10), set(70, 9)]),
  ex('leg_extension', [set(50, 12), set(50, 12)], 'legext_a'),
  ex('lateral_raise', [set(10, 15), set(10, 14)]),
], { startTime: '18:00', endTime: '19:10' }));

const D = (ws: Workout[], patch: Partial<AppData> = {}) => data([...familiar(), ...ws], { equipment: EQUIP.map((e) => ({ ...e })), ...patch });
const live = (date: string, exs = [] as Workout['exercises'], extra: Partial<Workout> = {}): Workout => workout(date, exs, { id: 'live', source: 'live', startTime: '17:00', ...extra });

function assess(d: AppData, now: string, w: Workout | null, exerciseId: string, extra: Partial<Parameters<typeof assessChoice>[0]> = {}) {
  const all = w ? { ...d, workouts: [...d.workouts.filter((x) => x.id !== w.id), w] } : d;
  const a = analyze(all, new Date(now));
  return assessChoice({ data: all, analysis: a, workout: w, exerciseId, ...extra });
}

const heavyChest = (date: string, end = '19:00') => workout(date, [ex('incline_dumbbell_press', Array.from({ length: 10 }, () => set(25, 10, 1)), null, { variation: { benchAngleDeg: 30 } })], { startTime: '17:30', endTime: end });

describe('exercise-choice assistant (E.1)', () => {
  it('1 heavy recent training → CONSIDER ALTERNATIVE (recovery); chest RECENTLY LOADED', () => {
    // 10 effective chest sets ended 19:00 yesterday → window 60 h (+12 h large muscle > 9 sets) → ~59 h left at 08:00.
    const c = assess(D([heavyChest('2026-11-18')]), '2026-11-19T08:00:00Z', live('2026-11-19'), 'incline_dumbbell_press');
    expect(c.status).toBe('reconsider');
    expect(c.reasonKind).toBe('recovery');
    expect(c.label).toBe('CONSIDER ALTERNATIVE');
    expect(c.muscles[0]).toMatchObject({ muscle: 'chest', state: 'RECENTLY_LOADED', source: 'earlier_session' });
  });
  it('2 light training yesterday (below the significant-stimulus threshold) → GOOD', () => {
    const light = workout('2026-11-18', [ex('incline_dumbbell_press', [set(25, 10, 3)], null, { variation: { benchAngleDeg: 30 } })], { startTime: '17:30', endTime: '17:45' });
    const c = assess(D([light]), '2026-11-19T08:00:00Z', live('2026-11-19'), 'incline_dumbbell_press');
    expect(c.status).toBe('good');
    expect(c.muscles[0].state).toBe('LIKELY_READY');
  });
  it('3 primary ready but a significant synergist loaded → CONSIDER ALTERNATIVE with Pec deck (spares triceps)', () => {
    const tri = workout('2026-11-18', [ex('triceps_pushdown_bar', Array.from({ length: 8 }, () => set(30, 12, 1)), 'cable_a')], { startTime: '18:00', endTime: '18:40' });
    const c = assess(D([tri]), '2026-11-19T08:00:00Z', live('2026-11-19'), 'incline_dumbbell_press');
    expect(c.muscles.find((m) => m.muscle === 'chest')!.state).toBe('LIKELY_READY');
    expect(c.muscles.find((m) => m.muscle === 'triceps')!.state).toBe('RECENTLY_LOADED');
    expect(c.status).toBe('reconsider');
    expect(c.alternatives[0]).toMatchObject({ exerciseId: 'pec_deck', equipmentId: 'pd_a', kind: 'same_muscle' });
    expect(c.alternatives.length).toBeLessThanOrEqual(2);
  });
  it('4 weekly target reached → ACCEPTABLE (volume); above the upper bound → CONSIDER ALTERNATIVE', () => {
    // Mon + Tue chest work (recovered by Friday evening): 12 effective sets ≥ provisional preferred 12.
    const mon = workout('2026-11-16', [ex('pec_deck', Array.from({ length: 6 }, () => set(45, 12, 1)), 'pd_a')], { startTime: '08:00', endTime: '08:40' });
    const tue = workout('2026-11-17', [ex('pec_deck', Array.from({ length: 6 }, () => set(45, 12, 1)), 'pd_a')], { startTime: '08:00', endTime: '08:40' });
    const met = assess(D([mon, tue]), '2026-11-20T18:00:00Z', live('2026-11-20'), 'pec_deck');
    expect(met.status).toBe('acceptable');
    expect(met.reasonKind).toBe('volume');
    const wed = workout('2026-11-18', [ex('pec_deck', Array.from({ length: 8 }, () => set(45, 12, 1)), 'pd_a')], { startTime: '08:00', endTime: '08:40' });
    const over = assess(D([mon, tue, wed]), '2026-11-21T18:00:00Z', live('2026-11-21'), 'pec_deck');
    expect(over.status).toBe('reconsider');
    expect(over.reasonKind).toBe('volume');
  });
  it('5 big recovered deficit → GOOD with the sets left today', () => {
    const c = assess(D([]), '2026-11-16T17:00:00Z', live('2026-11-16'), 'pec_deck');
    expect(c.status).toBe('good');
    expect(c.muscles[0].text).toMatch(/Chest: READY · \d+(\.\d)? SETS? LEFT TODAY/);
  });
  it('6 decline over comparable sessions → ACCEPTABLE (decline), never a recovery claim', () => {
    const dates = ['2026-10-26', '2026-10-29', '2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12'];
    const reps = [12, 11, 10, 9, 8, 7];
    const ws = dates.map((d, i) => workout(d, [ex('pec_deck', [set(45, reps[i], 1), set(45, reps[i] - 1, 1)], 'pd_a')], { startTime: '18:00', endTime: '18:30' }));
    const c = assess(data(ws, { equipment: EQUIP.map((e) => ({ ...e })) }), '2026-11-16T17:00:00Z', live('2026-11-16'), 'pec_deck', { equipmentId: 'pd_a' });
    expect(c.status).toBe('acceptable');
    expect(c.reasonKind).toBe('decline');
  });
  it('7 unknown session time near the end of the window → RECOVERY UNCERTAIN, low confidence, never CONSIDER ALTERNATIVE', () => {
    // No start/end time → assumed 18:00; 6 chest sets → 36 h window; at 18:00 next day 24 h passed → 12 h left.
    const noTime = workout('2026-11-18', [ex('pec_deck', Array.from({ length: 6 }, () => set(45, 12, 2)), 'pd_a')], { startTime: null });
    const c = assess(D([noTime]), '2026-11-19T18:00:00Z', live('2026-11-19'), 'pec_deck');
    expect(c.muscles[0].state).toBe('RECOVERY_UNCERTAIN');
    expect(c.status).toBe('acceptable');
    expect(c.confidence).toBe('low');
  });
  it('8/9 no suitable alternative → ACCEPTABLE, no invented option', () => {
    const tri = workout('2026-11-18', [ex('triceps_pushdown_bar', Array.from({ length: 8 }, () => set(30, 12, 1)), 'cable_a')], { startTime: '18:00', endTime: '18:40' });
    // No pec deck in the history and no machine for it at this gym.
    const hist = familiar().map((w) => ({ ...w, exercises: w.exercises.filter((e) => e.exerciseId !== 'pec_deck') }));
    const d = data([...hist, tri], { equipment: EQUIP.filter((e) => e.id !== 'pd_a').map((e) => ({ ...e })) });
    const c = assess(d, '2026-11-19T08:00:00Z', live('2026-11-19'), 'incline_dumbbell_press');
    expect(c.alternatives.filter((x) => x.kind === 'same_muscle')).toHaveLength(0);
    expect(c.status).toBe('acceptable');
    expect(c.why.join(' ')).toMatch(/no familiar option here spares|No better familiar option/);
  });
  it('10 overrides are learned only after ≥ 3 observations (softened, never "unsuitable")', () => {
    // Each override: warned (recovery) but continued; performance index the same as the previous session.
    // Two clean sessions first (owner 2026-11-24: the baseline is the median of ≥ 2 earlier sessions not themselves overridden).
    const base = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
    const mk = (n: number) => base.slice(0, n + 2).map((d, i) => workout(d, [ex('pec_deck', [set(45, 12, 1), set(45, 11, 1)], 'pd_a',
      i > 1 ? { choice: { status: 'reconsider', reasonKind: 'recovery', followed: 'continued', at: `${d}T18:00:00Z` } } : {})], { startTime: '18:00', endTime: '18:30' }));
    const recent = workout('2026-11-18', [ex('pec_deck', Array.from({ length: 10 }, () => set(45, 12, 1)), 'pd_a')], { startTime: '17:30', endTime: '19:00' });
    const two = data([...mk(2), recent], { equipment: EQUIP.map((e) => ({ ...e })) });
    const three = data([...mk(3), recent], { equipment: EQUIP.map((e) => ({ ...e })) });
    const now = '2026-11-19T08:00:00Z';
    expect(choiceOutcomes(two, analyze(two, new Date(now))).get('pec_deck')!.softened).toBe(false);
    expect(assess(two, now, live('2026-11-19'), 'pec_deck', { equipmentId: 'pd_a' }).status).toBe('reconsider');
    const c3 = assess(three, now, live('2026-11-19'), 'pec_deck', { equipmentId: 'pd_a' });
    expect(c3.status).toBe('acceptable');
    expect(c3.softened).toBe(true);
  });
  it('11 the same warning is not repeated without new information; changed inputs ask again', () => {
    const d = D([heavyChest('2026-11-18')]);
    const w0 = live('2026-11-19');
    const c = assess(d, '2026-11-19T08:00:00Z', w0, 'incline_dumbbell_press');
    expect(needsPrompt(w0, c)).toBe(true);
    const acked = { ...w0, choiceAcks: [{ key: c.key, at: '2026-11-19T08:01:00Z' }] };
    expect(isAcknowledged(acked, c)).toBe(true);
    expect(needsPrompt(acked, assess(d, '2026-11-19T08:05:00Z', acked, 'incline_dumbbell_press'))).toBe(false);
    // Next day: chest window still open but the triceps state changed → a different key → asked again.
    const later = assess(d, '2026-11-20T21:00:00Z', acked, 'incline_dumbbell_press');
    expect(later.key === c.key).toBe(false);
  });
  it('12 recovery is still present after the Monday reset (weekly counters at 0)', () => {
    const sun = heavyChest('2026-11-22', '20:00');
    const c = assess(D([sun]), '2026-11-23T08:00:00Z', live('2026-11-23'), 'incline_dumbbell_press');
    const a = analyze(D([sun]), new Date('2026-11-23T08:00:00Z'));
    expect(a.muscles.find((m) => m.muscle === 'chest')!.completed).toBe(0);
    expect(c.reasonKind).toBe('recovery');
  });
  it('13 pain → a separate SAFETY line; the status is unchanged by it', () => {
    const painless = workout('2026-11-16', [ex('lateral_raise', [set(10, 15), set(10, 14)])], { startTime: '18:00', endTime: '18:20' });
    const painful = workout('2026-11-16', [ex('lateral_raise', [set(10, 15), set(10, 14, 2, { pain: { area: 'Shoulder' }, feel: 'pain' })])], { startTime: '18:00', endTime: '18:20' });
    const a = assess(D([painless]), '2026-11-19T17:00:00Z', live('2026-11-19'), 'incline_dumbbell_press');
    const b = assess(D([painful]), '2026-11-19T17:00:00Z', live('2026-11-19'), 'incline_dumbbell_press');
    expect(a.safety).toBeNull();
    expect(b.safety).toMatch(/SAFETY: shoulder pain/);
    expect(b.status).toBe(a.status);
    expect(b.why.join(' ')).not.toMatch(/pain/i); // never mixed into fatigue reasons
  });
});

describe('fatigue cost and exercise order (E.2)', () => {
  it('fatigue cost classes: squat / RDL / deadlift HIGH, incline DB press MODERATE, pec deck LOW; weighted pull-up HIGH', () => {
    expect(fatigueCostOf(SEED_BY_ID.back_squat)).toBe('high');
    expect(fatigueCostOf(SEED_BY_ID.romanian_deadlift)).toBe('high');
    expect(fatigueCostOf(SEED_BY_ID.deadlift)).toBe('high');
    expect(fatigueCostOf(SEED_BY_ID.incline_dumbbell_press)).toBe('moderate');
    expect(fatigueCostOf(SEED_BY_ID.pec_deck)).toBe('low');
    expect(fatigueCostOf(SEED_BY_ID.pull_up, { loading: 'bodyweight' })).toBe('moderate');
    expect(fatigueCostOf(SEED_BY_ID.pull_up, { loading: 'weighted' })).toBe('high');
  });
  it('a demanding lift early in a fresh session is a GOOD CHOICE (position FIRST HALF)', () => {
    const c = assess(D([]), '2026-11-16T17:00:00Z', live('2026-11-16'), 'back_squat');
    expect(c.status).toBe('good');
    expect(c.fatigueCost).toBe('high');
    expect(c.position).toBe('FIRST HALF');
    expect(c.why.join(' ')).toMatch(/good point/);
  });
  it('isolation of a synergist before a planned compound → CONSIDER LATER; a priority muscle overrides it', () => {
    const pending = ex('incline_dumbbell_press', [set(25, 10, null, { planned: true })], null, { variation: { benchAngleDeg: 30 } });
    const w = live('2026-11-16', [pending]);
    const c = assess(D([]), '2026-11-16T17:00:00Z', w, 'triceps_pushdown_bar');
    expect(c.status).toBe('reconsider');
    expect(c.label).toBe('CONSIDER LATER');
    expect(c.alternatives[0]).toMatchObject({ exerciseId: 'incline_dumbbell_press', kind: 'do_first' });
    const d = D([]);
    d.settings = { ...d.settings, priorities: { triceps: 'high' } };
    expect(assess(d, '2026-11-16T17:00:00Z', w, 'triceps_pushdown_bar').reasonKind).not.toBe('order');
  });
  it('recent demanding lifts in THIS session change the advice: after squat + RDL, another HIGH lower lift → reconsider (fatigue), cheaper option offered', () => {
    const done = (id: string, at: string) => ex(id, [set(80, 8, 2, { completedAt: at }), set(80, 8, 2, { completedAt: at })]);
    const w = live('2026-11-16', [done('back_squat', '2026-11-16T17:10:00Z'), done('romanian_deadlift', '2026-11-16T17:30:00Z')]);
    const c = assess(D([]), '2026-11-16T17:45:00Z', w, 'deadlift');
    expect(c.status).toBe('reconsider');
    expect(c.reasonKind).toBe('fatigue');
    // Recovery and fatigue are separate dimensions: the muscles themselves are not "recently loaded" from an earlier session.
    expect(c.muscles.every((m) => m.source !== 'earlier_session')).toBe(true);
  });
  it('the whole current session is considered in the order it was ACTUALLY done (not the card order)', () => {
    const w = live('2026-11-16', [
      ex('pec_deck', [set(45, 12, 2, { planned: true })], 'pd_a'),
      ex('back_squat', [set(80, 8, 2, { completedAt: '2026-11-16T17:10:00Z' })]),
    ]);
    const a = analyze(D([w]), new Date('2026-11-16T17:20:00Z'));
    const l = sessionLoad(w, a.registry, D([]).settings.quality);
    expect(l.exercisesDone).toBe(1);
    expect(l.highCostDone).toEqual(['back_squat']);
    expect(l.muscles.chest ?? 0).toBe(0); // the planned pec deck set counts for nothing
  });
  it('every recommendation is advice: nothing is blocked, nothing in the stored data changes', () => {
    const d = D([heavyChest('2026-11-18')]);
    const before = JSON.stringify(d);
    const c = assess(d, '2026-11-19T08:00:00Z', live('2026-11-19'), 'incline_dumbbell_press');
    expect(Object.keys(c)).not.toContain('blocked');
    expect(JSON.stringify(d)).toBe(before);
  });
});
