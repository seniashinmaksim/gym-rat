/**
 * Failure status (v1.3): kept separate from RIR, consistency checks, set quality, progression,
 * recovery, the failure profile and the related weakness fixes. All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { feelPatch } from '../src/domain/feedback';
import { effectiveFailure, failureConsistency, failureProfile, isFailureSetForFatigue, techniqueWithFailure } from '../src/domain/failure';
import { buildProgression, sessionPerf } from '../src/domain/progression';
import { assessSet } from '../src/domain/quality';
import { MOVEMENT_FAMILIES, movementFamily, sameMovement } from '../src/domain/recovery';
import { weeklyReport, weeklySummary } from '../src/domain/reports';
import { buildRegistry } from '../src/domain/registry';
import type { Location, SetFeel, Workout, WorkoutSet } from '../src/domain/types';
import { computeVolume } from '../src/domain/volume';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const q = (s: WorkoutSet) => assessSet(s, DEFAULT_QUALITY);
const fb = (s: WorkoutSet, f: SetFeel): WorkoutSet => ({ ...s, ...feelPatch(s, f) });
const times = (n: number, mk: () => WorkoutSet) => Array.from({ length: n }, mk);

describe('failure status vs RIR — consistency messages', () => {
  it('is quiet when consistent or unknown', () => {
    expect(failureConsistency(set(40, 12, 0, { failure: 'muscular' }))).toBeNull();
    expect(failureConsistency(set(40, 12, 1, { failure: 'muscular' }))).toBeNull();
    expect(failureConsistency(set(40, 12, 2, { failure: 'none' }))).toBeNull();
    expect(failureConsistency(set(40, 12, null, { failure: 'uncertain' }))).toBeNull();
    expect(failureConsistency(set(40, 12, 0))).toBeNull(); // old data: nothing to compare
    expect(failureConsistency(set(40, 12, 3, { failure: 'muscular', type: 'warmup' }))).toBeNull();
  });
  it('muscular failure but RIR ≥ 2 → gentle note; RIR is never changed', () => {
    const s = set(40, 12, 3, { failure: 'muscular' });
    expect(failureConsistency(s)).toMatch(/muscular failure, but RIR 3/);
    expect(s.rir).toBe(3);
  });
  it('stopped before failure but RIR 0 or Fail → note', () => {
    expect(failureConsistency(set(40, 12, 0, { failure: 'none' }))).toMatch(/stopped before failure, but RIR 0/);
    expect(failureConsistency(set(40, 12, null, { failure: 'none', toFailure: true }))).toMatch(/"Fail"/);
  });
  it('technique gave out before the muscle', () => {
    expect(failureConsistency(set(40, 12, 0, { failure: 'muscular', technicalFailure: true }))).toBe('Technique gave out before the muscle — counted as technical failure, not a clean failure set.');
    expect(failureConsistency(set(40, 12, 0, { technicalFailure: true }))).toMatch(/may still have had a rep/);
  });
});

describe('effective failure status (analysis only)', () => {
  it('uses the failure field, else the Fail chip, else unknown — never invented from RIR 0', () => {
    expect(effectiveFailure(set(40, 12, 2, { failure: 'none' }))).toMatchObject({ status: 'none', source: 'recorded' });
    expect(effectiveFailure(set(40, 12, null, { toFailure: true }))).toMatchObject({ status: 'muscular', source: 'to_failure', label: 'Muscular failure (reported via Fail / to_failure)' });
    expect(effectiveFailure(set(40, 12, 0))).toMatchObject({ status: 'unknown', source: 'none' });
    expect(effectiveFailure(set(40, 12, null))).toMatchObject({ status: 'unknown' });
  });
  it('fatigue counting includes Fail, RIR 0, muscular and technical failure', () => {
    expect([set(1, 1, 0), set(1, 1, null, { toFailure: true }), set(1, 1, null, { failure: 'muscular' }), set(1, 1, 2, { technicalFailure: true })].every(isFailureSetForFatigue)).toBe(true);
    expect(isFailureSetForFatigue(set(1, 1, 1, { failure: 'none' }))).toBe(false);
    expect(isFailureSetForFatigue(set(1, 1, null, { failure: 'uncertain' }))).toBe(false);
  });
});

describe('set quality with failure fields', () => {
  it('muscular failure without RIR ≈ RIR 0, labelled, and counted as recorded effort (not an estimate)', () => {
    const a = q(set(40, 12, null, { failure: 'muscular' }));
    expect(a).toMatchObject({ credit: 1, tier: 'high_effort', status: 'good', estimated: false, effortSource: 'failure_status', uncertain: false });
    expect(a.reasons.join(' ')).toMatch(/failure status/);
  });
  it('no extra credit for failure vs 1–3 RIR', () => {
    const fail = q(set(40, 12, 0, { failure: 'muscular' })).credit;
    expect(fail).toBe(q(set(40, 12, 2)).credit);
    expect(fail).toBe(q(set(40, 12, 3)).credit);
    expect(q(set(40, 12, null, { toFailure: true })).credit).toBe(q(set(40, 12, 1)).credit);
  });
  it('"stopped before failure" without RIR invents no number (provisional, or the feel estimate)', () => {
    const a = q(set(40, 12, null, { failure: 'none' }));
    expect(a).toMatchObject({ credit: DEFAULT_QUALITY.unknownRirCredit, tier: 'unknown', effortSource: 'none' });
    const felt = q(fb(set(40, 12, null, { failure: 'none' }), 'just_right'));
    expect(felt).toMatchObject({ effortSource: 'feel', estimated: true });
    expect(q(set(40, 12, null, { failure: 'uncertain' })).effortSource).toBe('none');
  });
  it('technical failure → technique counted as compromised (×0.7) unless explicitly good', () => {
    const t = q(set(40, 12, 1, { technicalFailure: true }));
    expect(t).toMatchObject({ credit: 0.7, status: 'compromised' });
    expect(t.reasons.join(' ')).toMatch(/Technical failure/);
    expect(q(set(40, 12, 1, { technicalFailure: true, technique: 'good' })).credit).toBe(1);
    expect(techniqueWithFailure(set(40, 12, 1, { technicalFailure: true, technique: 'slightly_degraded' }))).toBe('compromised');
  });
  it('a technical-failure set is never a clean muscular-failure set (no RIR-0 credit from the failure status)', () => {
    const a = q(set(40, 12, null, { failure: 'muscular', technicalFailure: true }));
    expect(a.effortSource).toBe('none');
    expect(a.status).toBe('compromised');
  });
  it('old sets without failure fields are assessed exactly as before', () => {
    expect(q(set(40, 12, null))).toMatchObject({ credit: 0.75, status: 'uncertain', effortSource: 'none' });
    expect(q(set(40, 12, 2))).toMatchObject({ credit: 1, status: 'good', effortSource: 'rir' });
    expect(q(set(40, 12, null, { toFailure: true }))).toMatchObject({ credit: 1, effortSource: 'to_failure' });
  });
});

describe('volume: good vs good (estimated)', () => {
  it('counts good sets whose effort came only from feel separately', () => {
    const w = workout('2026-11-20', [ex('pec_deck', [set(40, 12, 2), fb(set(40, 12, null), 'just_right'), set(40, 12, null, { failure: 'muscular' }), set(40, 12, null)], 'pd')]);
    const v = computeVolume([w], reg, DEFAULT_QUALITY).muscles.chest;
    expect(v.status.good).toBe(3); // unchanged meaning: all good-quality sets
    expect(v.goodEstimated).toBe(1); // of which effort only estimated from feel
    expect(v.status.uncertain).toBe(1);
  });
});

describe('progression with failure status', () => {
  const pec = (d: string, sets: WorkoutSet[]) => workout(d, [ex('pec_deck', sets, 'pd')]);
  const hi = reg.get('pec_deck')!.repRange[1];
  it('technical-failure sets are excluded from the benchmark', () => {
    const w = pec('2026-11-10', [set(40, hi, 1), set(40, hi, null, { technicalFailure: true })]);
    const p = sessionPerf(w, w.exercises[0])!;
    expect(p.sets[0].benchmark).toBe(true);
    expect(p.sets[1]).toMatchObject({ benchmark: false, excluded: 'technical failure (technique gave out)' });
    const all = pec('2026-11-12', [set(40, hi, 0, { technicalFailure: true }), set(40, hi, 0, { technicalFailure: true })]);
    expect(sessionPerf(all, all.exercises[0])!.representative).toBe(false);
  });
  it('reps at clean muscular failure are valid performance (≈ RIR 0 for the index)', () => {
    const w = pec('2026-11-10', [set(40, 12, null, { failure: 'muscular' })]);
    const p = sessionPerf(w, w.exercises[0])!;
    expect(p.representative).toBe(true);
    expect(p.topRir).toBe(0);
    expect(p.e1rm).toBe(56);
  });
  it('failure at the top of the range still needs two consecutive sessions', () => {
    const s = () => times(3, () => set(40, hi, null, { failure: 'muscular' }));
    expect(buildProgression([pec('2026-11-10', s())], reg, [], [], 2, '2026-11-21')[0].next.action).toBe('hold');
    expect(buildProgression([pec('2026-11-10', s()), pec('2026-11-13', s())], reg, [], [], 2, '2026-11-21')[0].next.action).toBe('increase');
  });
  it('"stopped before failure" alone is NOT recorded effort (it says nothing about how close the set was); muscular failure is', () => {
    const none = () => times(3, () => set(40, hi, null, { failure: 'none' }));
    expect(buildProgression([pec('2026-11-10', none()), pec('2026-11-13', none())], reg, [], [], 2, '2026-11-21')[0].next.action).toBe('hold');
    const fail = () => times(3, () => set(40, hi, null, { failure: 'muscular' }));
    expect(buildProgression([pec('2026-11-10', fail()), pec('2026-11-13', fail())], reg, [], [], 2, '2026-11-21')[0].next.action).toBe('increase');
    const unknown = () => times(3, () => set(40, hi, null));
    const p = buildProgression([pec('2026-11-10', unknown()), pec('2026-11-13', unknown())], reg, [], [], 2, '2026-11-21')[0];
    expect(p.next.action).toBe('hold');
    expect(p.next.reason).toMatch(/Effort was not recorded/);
  });
});

describe('load steps use the per-gym free-weight jumps (loadStep)', () => {
  const top = (d: string) => workout(d, [ex('incline_dumbbell_press', times(3, () => set(25, 12, 2)), null, { variation: { benchAngleDeg: 30 } })]);
  const ws = [top('2026-11-10'), top('2026-11-13')];
  it('default dumbbell step without a gym setting', () => {
    const p = buildProgression(ws, reg, [], [], 2, '2026-11-21')[0];
    expect(p).toMatchObject({ incrementSource: 'default', locationId: 'gym_a' });
    expect(p.next).toMatchObject({ action: 'increase', weight: 27, increment: 2 });
  });
  it('2.5 kg jumps set for the gym', () => {
    const locs: Location[] = [{ id: 'gym_a', name: 'Gym A', photoIds: [], createdAt: '', freeWeightIncrementsKg: [2.5] }];
    const p = buildProgression(ws, reg, [], [], 2, '2026-11-21', true, locs)[0];
    expect(p.incrementSource).toBe('gym_free_weights');
    expect(p.next).toMatchObject({ action: 'increase', weight: 27.5, increment: 2.5 });
    // also through analyze (data.locations)
    const a = analyze(data(ws, { locations: locs }), new Date('2026-11-21T09:00:00Z'));
    expect(a.progression[0].next.increment).toBe(2.5);
  });
});

describe('recovery', () => {
  const now = new Date('2026-11-20T19:00:00Z');
  const chestWindow = (sets: WorkoutSet[]) =>
    analyze(data([workout('2026-11-20', [ex('pec_deck', sets, 'pd')], { startTime: '17:00', endTime: '18:00' })]), now).recovery.chest;
  it('counts recorded muscular / technical failure sets for the +12 h failure rule (pair-aware)', () => {
    const base = chestWindow(times(4, () => set(40, 12, 2))).windowHours!;
    const fail = chestWindow([set(40, 12, 2), set(40, 12, 2), set(40, 12, null, { failure: 'muscular' }), set(40, 12, 2, { technicalFailure: true })]);
    expect(fail.windowHours).toBe(base + 12);
    expect(fail.factors.join(' ')).toMatch(/2 sets to failure/);
    // one failure set is not enough
    expect(chestWindow([set(40, 12, 2), set(40, 12, 2), set(40, 12, 2), set(40, 12, null, { failure: 'muscular' })]).windowHours).toBe(base);
    // "stopped before failure" never counts
    expect(chestWindow(times(4, () => set(40, 12, 1, { failure: 'none' }))).windowHours).toBe(base);
  });
  it('a left + right pair to failure is one failure set', () => {
    const now2 = new Date('2026-11-20T19:00:00Z');
    const legs = (sets: WorkoutSet[]) => analyze(data([workout('2026-11-20', [ex('standing_leg_curl', sets, 'lc', { variation: { unilateral: true } })], { startTime: '17:00', endTime: '18:00' })]), now2).recovery.hamstrings;
    const base = legs([set(20, 12, 2, { side: 'left' }), set(20, 12, 2, { side: 'right' }), set(20, 12, 2, { side: 'left' }), set(20, 12, 2, { side: 'right' })]).windowHours!;
    const pairFail = legs([set(20, 12, 2, { side: 'left' }), set(20, 12, 2, { side: 'right' }), set(20, 12, null, { side: 'left', failure: 'muscular' }), set(20, 12, null, { side: 'right', failure: 'muscular' })]);
    expect(pairFail.windowHours).toBe(base);
  });

  describe('novelty after an id split', () => {
    const tri = (prevId: string, lastId: string) => analyze(data([
      workout('2026-11-10', [ex(prevId, times(4, () => set(30, 12, 2)), 'cab')]),
      workout('2026-11-20', [ex(lastId, times(4, () => set(30, 12, 2)), 'cab')], { startTime: '17:00', endTime: '18:00' }),
    ]), now).recovery.triceps;
    it('pushdown → rope pushdown is the same movement (no +12 h)', () => {
      const same = tri('triceps_pushdown_rope', 'triceps_pushdown_rope');
      const split = tri('triceps_pushdown', 'triceps_pushdown_rope');
      const novel = tri('skull_crusher', 'triceps_pushdown_rope');
      expect(split.windowHours).toBe(same.windowHours);
      expect(novel.windowHours).toBe(same.windowHours! + 12);
      expect(novel.factors.join(' ')).toMatch(/new to you/);
    });
    it('family map: the listed pairs only', () => {
      expect(sameMovement('barbell_curl', 'ez_bar_curl')).toBe(true);
      expect(sameMovement('preacher_curl', 'machine_biceps_curl')).toBe(true);
      expect(sameMovement('romanian_deadlift', 'dumbbell_romanian_deadlift')).toBe(true);
      expect(sameMovement('triceps_pushdown_bar', 'triceps_pushdown_rope')).toBe(true);
      expect(sameMovement('hanging_leg_raise', 'hanging_knee_raise_pelvic_curl')).toBe(false);
      expect(movementFamily('pec_deck')).toBe('pec_deck');
      expect(MOVEMENT_FAMILIES.flat().every((id) => reg.has(id))).toBe(true);
    });
  });
});

describe('failure profile', () => {
  const range = { start: '2026-11-16', end: '2026-11-22' };
  const prof = (ws: Workout[]) => failureProfile(data(ws), range, reg);
  const ids = (p: ReturnType<typeof prof>) => p.flags.map((f) => f.id);

  it('not enough data below 6 recorded sets; old data has nothing recorded', () => {
    const old = prof([workout('2026-11-17', [ex('pec_deck', times(8, () => set(40, 12, 0)), 'pd')])]);
    expect(old.totals).toMatchObject({ workingSets: 8, recorded: 0, muscular: 0, shareAtFailure: null });
    expect(ids(old)).toEqual(['not_enough_data']);
    const few = prof([workout('2026-11-17', [ex('pec_deck', times(3, () => set(40, 12, 0, { failure: 'muscular' })), 'pd')])]);
    expect(ids(few)).toEqual(['not_enough_data']);
    expect(few.line).toMatch(/only 3 sets/);
  });

  it('frequently to failure, mostly on isolation', () => {
    const p = prof([workout('2026-11-17', [ex('pec_deck', times(8, () => set(40, 12, 0, { failure: 'muscular' })), 'pd')])]);
    expect(ids(p)).toEqual(['frequently_to_failure', 'failure_mostly_isolation']);
    expect(p.exercises[0]).toMatchObject({ exerciseId: 'pec_deck', category: 'stable_isolation', muscular: 8, shareAtFailure: 1 });
    expect(p.muscles.find((m) => m.muscle === 'chest')!.muscular).toBe(8);
    expect(p.muscles.some((m) => m.muscle === 'front_delts')).toBe(false); // primary muscles only (coefficient 1.0)
    const why = p.flags.map((f) => f.why).join(' ');
    expect(why).not.toMatch(/more (muscle|growth)|superior/i);
    expect(p.line).toBe('100% of recorded sets reached muscular failure.');
  });

  it('usually stops short (RIR)', () => {
    const p = prof([workout('2026-11-17', [ex('pec_deck', times(10, () => set(40, 12, 2, { failure: 'none' })), 'pd')])]);
    expect(ids(p)).toEqual(['usually_rir']);
  });

  it('failure often on compounds (technique-first lifts listed)', () => {
    const p = prof([workout('2026-11-17', [
      ex('back_squat', times(4, () => set(100, 8, 0, { failure: 'muscular' }))),
      ex('pec_deck', times(4, () => set(40, 12, 2, { failure: 'none' })), 'pd'),
    ])]);
    expect(ids(p)).toContain('failure_often_compounds');
    expect(p.flags.find((f) => f.id === 'failure_often_compounds')!.exerciseIds).toEqual(['back_squat']);
    expect(p.exercises.find((e) => e.exerciseId === 'back_squat')!.category).toBe('technique_first_compound');
    expect(p.muscles.find((m) => m.muscle === 'quads')!.muscular).toBe(4);
  });

  it('technique gives out before the muscle', () => {
    const p = prof([workout('2026-11-17', [
      ex('lateral_raise', [set(10, 15, null, { technicalFailure: true }), set(10, 14, null, { failure: 'muscular', technicalFailure: true }), set(10, 13, null, { technicalFailure: true })]),
      ex('pec_deck', times(4, () => set(40, 12, 2, { failure: 'none' })), 'pd'),
    ])]);
    expect(ids(p)).toContain('technical_before_muscular');
    const lat = p.exercises.find((e) => e.exerciseId === 'lateral_raise')!;
    expect(lat).toMatchObject({ technical: 3, muscular: 0, recorded: 3 });
  });

  it('ignores warm-ups, planned sets and other weeks; pairs left/right', () => {
    const p = prof([
      workout('2026-11-17', [ex('standing_leg_curl', [
        set(20, 12, 0, { side: 'left', failure: 'muscular' }), set(20, 12, 0, { side: 'right', failure: 'muscular' }),
        set(10, 10, 5, { type: 'warmup', failure: 'none' }), set(20, 12, null, { planned: true, failure: 'muscular' }),
      ], 'lc', { variation: { unilateral: true } })]),
      workout('2026-11-01', [ex('pec_deck', times(5, () => set(40, 12, 0, { failure: 'muscular' })), 'pd')]),
    ]);
    expect(p.totals).toMatchObject({ workingSets: 1, recorded: 1, muscular: 1 });
  });

  it('is on the analysis, the weekly report and (as one line) the weekly summary', () => {
    const ws = [workout('2026-11-10', [ex('pec_deck', times(8, () => set(40, 12, 0, { failure: 'muscular' })), 'pd')])];
    const a = analyze(data(ws), new Date('2026-11-16T09:00:00Z'));
    expect(a.failure.range.start).toBe('2026-11-16');
    const bucket = a.weeks.find((w) => w.range.start === '2026-11-09')!;
    const rep = weeklyReport(bucket, a, data(ws));
    expect(rep.failure.totals.muscular).toBe(8);
    expect(weeklySummary(rep, a).failureLine).toBe('100% of recorded sets reached muscular failure.');
  });
});
