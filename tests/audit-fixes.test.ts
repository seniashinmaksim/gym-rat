/**
 * Fixes for the findings of the formula audit (docs/FORMULA_AUDIT.md, sections 2 and 5).
 * One block per finding id. Synthetic histories only; expected values are computed by hand in the comments.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import type { AppData } from '../src/domain/appdata';
import { strengthProgress } from '../src/domain/baseline';
import { bodyLoadSessions, bodyWeightNote } from '../src/domain/bodyweight';
import { isIsoDate } from '../src/domain/dates';
import { defaultSettings } from '../src/domain/defaults';
import { effortCoverage, effortDistribution } from '../src/domain/effort';
import { assessChoice } from '../src/domain/exerciseChoice';
import { fatigueCostOf, sessionLoad } from '../src/domain/fatigue';
import { generateWorkout, sessionPatterns } from '../src/domain/planner';
import { assessSet } from '../src/domain/quality';
import { buildRegistry } from '../src/domain/registry';
import { assessDeload, baselineReport, monthlyBodyReport, weeklyReport } from '../src/domain/reports';
import { summarizeSession } from '../src/domain/sessionSummary';
import type { BodyMeasurement, Equipment, Workout, WorkoutSet } from '../src/domain/types';
import { computeVolume } from '../src/domain/volume';
import { RULE_BY_ID } from '../src/data/scientific-evidence/rules';
import { data, ex, set, workout } from './fixtures';
import { dataQualityHistory, dayAfterLast } from './sim/dataQuality';

const reg = buildRegistry([], []);
const Q = defaultSettings().quality;
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const noon = (d: string) => new Date(`${d}T12:00:00Z`);
const many = (n: number, w: number, r: number, rir: number | null = 2, extra: Partial<WorkoutSet> = {}) => Array.from({ length: n }, () => set(w, r, rir, extra));
const bm = (date: string, kg: number | null, extra: Partial<BodyMeasurement> = {}): BodyMeasurement => ({ id: `b-${date}-${kg}`, date, time: '08:00', weightKg: kg, photoIds: [], ...extra });
const muscle = (a: ReturnType<typeof analyze>, m: string) => a.muscles.find((x) => x.muscle === m)!;

// ------------------------------------------------------------------------------------------------ group A

describe('A-1 the "new exercise" +12 h needs a performed working set', () => {
  const first = workout('2026-11-02', [ex('triceps_pushdown_bar', many(3, 30, 12))]);
  const second = (skull: WorkoutSet[]) => workout('2026-11-16', [ex('triceps_pushdown_bar', many(3, 30, 12)), ex('skull_crusher', skull)], { startTime: '18:00', endTime: '19:00' });
  const window = (skull: WorkoutSet[]) => analyze(data([first, second(skull)]), noon('2026-11-17')).recovery.triceps.windowHours;
  it('a card holding only a warm-up does not make the session "new": 3 effective sets → 24 h', () => {
    expect(window([set(20, 10, null, { type: 'warmup' })])).toBe(24);
  });
  it('a card holding only an unticked planned set: 24 h as well', () => {
    expect(window([set(30, 10, null, { planned: true })])).toBe(24);
  });
  it('control: one performed working set of the new exercise → 4 sets → 36 h + 12 h = 48 h', () => {
    expect(window([set(30, 10, 2)])).toBe(48);
  });
});

describe('A-2 impossible calendar dates are rejected', () => {
  it('30 February is not a date; real dates (incl. 29 February in a leap year) are', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-12-31')).toBe(true);
    expect(isIsoDate('26-12-31')).toBe(false);
  });
});

describe('A-3 an explicitly stored Learning-Mode start date wins', () => {
  // 8 weeks, Monday + Thursday from 2026-06-01 → 16 sessions; the last one is 2026-07-23.
  const ws = Array.from({ length: 16 }, (_, k) => workout(add('2026-06-01', Math.floor(k / 2) * 7 + (k % 2) * 3), [ex('pec_deck', many(3, 60, 12))]));
  const withStart = (startDate: string | null): AppData => {
    const d = data(ws);
    d.settings = { ...d.settings, learning: { startDate, endedOn: null, lengthDays: 30 } };
    return d;
  };
  it('"Restart from today" with 8 weeks of history → day 1, active', () => {
    const l = analyze(withStart('2026-07-27'), noon('2026-07-27')).learning;
    expect(l.startDate).toBe('2026-07-27');
    expect(l.dayNumber).toBe(1);
    expect(l.active).toBe(true);
    expect(l.sessions).toBe(0);
  });
  it('no stored date → the first workout (2026-06-01 → 27 July is day 57, complete)', () => {
    const l = analyze(withStart(null), noon('2026-07-27')).learning;
    expect(l.startDate).toBe('2026-06-01');
    expect(l.dayNumber).toBe(57);
    expect(l.active).toBe(false);
  });
});

describe('A-4 a workout counts as "trained today" only with a performed set', () => {
  // Sunday 2026-11-22: 1 day left in the week, default 3 sessions / week → 1 session left incl. today.
  const earlier = [workout('2026-11-16', [ex('pec_deck', many(3, 60, 12))]), workout('2026-11-18', [ex('pec_deck', many(2, 60, 12))])];
  const today = (exercises: Workout['exercises']) => analyze(data([...earlier, workout('2026-11-22', exercises)]), noon('2026-11-22'));
  it('an opened, empty workout changes nothing', () => {
    const none = analyze(data(earlier), noon('2026-11-22'));
    for (const a of [today([]), today([ex('pec_deck', [])]), today([ex('pec_deck', [set(60, 12, null, { planned: true })])])]) {
      expect(a.trainedToday).toBe(false);
      expect(a.expectedRemainingSessions).toBe(none.expectedRemainingSessions);
      expect(muscle(a, 'chest').status).toBe(muscle(none, 'chest').status);
    }
    expect(none.expectedRemainingSessions).toBe(1);
  });
  it('one performed set → trained today (no further session expected this week)', () => {
    const a = today([ex('pec_deck', [set(60, 12, 2)])]);
    expect(a.trainedToday).toBe(true);
    expect(a.expectedRemainingSessions).toBe(0);
  });
});

describe('A-5 failure sets and novelty use the coefficients of the logged variation', () => {
  it('bench at −10° (front delts 0.25) taken to failure does not extend the front-delt window', () => {
    const first = workout('2026-11-02', [ex('overhead_press', many(3, 40, 8)), ex('barbell_bench_press', many(2, 80, 8), null, { variation: { benchAngleDeg: -10 } })]);
    const last = workout('2026-11-16', [ex('overhead_press', many(3, 40, 8)), ex('barbell_bench_press', many(2, 80, 8, 0), null, { variation: { benchAngleDeg: -10 } })], { startTime: '18:00', endTime: '19:00' });
    const r = analyze(data([first, last]), noon('2026-11-17')).recovery;
    // Front delts: 3 OHP sets × 1.0 = 3 significant sets → 24 h; the decline bench only counts 0.25 (not significant).
    expect(r.front_delts.lastStimulusSets).toBe(3);
    expect(r.front_delts.windowHours).toBe(24);
    // Chest: 2 sets to failure at coefficient 1 → 24 h + 12 h.
    expect(r.chest.windowHours).toBe(36);
  });
});

describe('A-7 "Fail" and the failure answer are handled the same way when technique gave out', () => {
  it('technique gave out → effort unknown (0.75) × technique 0.7 = 0.53 on both paths', () => {
    expect(assessSet(set(60, 10, null, { failure: 'muscular', technicalFailure: true }), Q).credit).toBe(0.53);
    const chip = assessSet(set(60, 10, null, { toFailure: true, technicalFailure: true }), Q);
    expect(chip.credit).toBe(0.53);
    expect(chip.effortSource).toBe('none');
  });
  it('a clean failure set and a logged RIR are unchanged', () => {
    expect(assessSet(set(60, 10, null, { toFailure: true }), Q).credit).toBe(1);
    expect(assessSet(set(60, 10, null, { failure: 'muscular' }), Q).credit).toBe(1);
    expect(assessSet(set(60, 10, 0, { toFailure: true, technicalFailure: true }), Q).credit).toBe(0.7); // RIR 0 was typed: kept
  });
  it('the effort distribution puts both in "unknown", not in the RIR 0 column', () => {
    const w = workout('2026-11-16', [ex('pec_deck', [set(60, 10, null, { toFailure: true, technicalFailure: true }), set(60, 10, null, { failure: 'muscular', technicalFailure: true }), set(60, 10, null, { toFailure: true })])]);
    const d = effortDistribution([w], { start: '2026-11-16', end: '2026-11-22' });
    expect(d).toMatchObject({ rir0: 1, unknown: 2, compromised: 2, total: 3 });
  });
});

describe('A-8 an answer without effort information is not "effort recorded"', () => {
  const r = { start: '2026-11-16', end: '2026-11-22' };
  it('six sets marked only "pain" (credited the provisional 0.75) → all six are missing, nudge', () => {
    const pain = Array.from({ length: 6 }, () => set(40, 10, null, { feel: 'pain', pain: { area: 'Shoulder' } }));
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', pain)])], r)).toEqual({ counted: 6, missing: 6, nudge: true });
    const wrong = Array.from({ length: 6 }, () => set(40, 10, null, { feel: 'wrong_light', weightAccuracy: 'too_light' }));
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', wrong)])], r).missing).toBe(6);
  });
  it('an effort answer still counts', () => {
    const ok = Array.from({ length: 6 }, () => set(40, 10, null, { feel: 'just_right', effort: 'appropriate' }));
    expect(effortCoverage([workout('2026-11-17', [ex('pec_deck', ok)])], r)).toEqual({ counted: 6, missing: 0, nudge: false });
  });
});

describe('A-9 the confidence text says what the confidence field says', () => {
  it('Learning Mode ended by hand after 2 complete weeks → "low" in both places', () => {
    const ws = [0, 2, 4, 7, 9, 11].map((n) => workout(add('2026-11-02', n), [ex('pec_deck', many(3, 60, 12))]));
    const d = data(ws);
    d.settings = { ...d.settings, learning: { startDate: '2026-11-02', endedOn: '2026-11-15', lengthDays: 30 } };
    const t = analyze(d, noon('2026-11-16')).targets.chest;
    expect(t.source).toBe('individualized');
    expect(t.confidence).toBe('low');
    const line = t.rationale.find((x) => x.startsWith('Confidence'))!;
    expect(line.startsWith('Confidence low')).toBe(true);
  });
});

describe('A-10 a muscle on "maintain" is never raised', () => {
  it('stalled chest (would be +1–2 sets) stays at its own level when marked maintain', () => {
    const base = dataQualityHistory({ sessions: 18, trend: 'flat' });
    const plain = analyze(base, dayAfterLast(base, 3)).targets.chest;
    expect(plain.volumeAction).toBe('increase');
    const d: AppData = { ...base, settings: { ...base.settings, priorities: { ...base.settings.priorities, chest: 'maintain' } } };
    const t = analyze(d, dayAfterLast(d, 3)).targets.chest;
    expect(t.volumeAction).toBe('hold');
    expect(t.preferred).toBe(t.baseline);
    expect(t.rationale.join(' ')).toMatch(/maintain/i);
  });
});

describe('A-11 the floor of the per-session cap is documented', () => {
  it('rule text names the floor of 3', () => {
    expect(RULE_BY_ID.todays_share.rule).toMatch(/at least 3/);
  });
});

describe('A-12 "Target met" and the status agree just below the target', () => {
  it('11.9 of 12 effective sets (0 left after rounding to half sets) → done', () => {
    // 6 + 5 sets at RIR 2 (credit 1) + one at RIR 4 (0.6) + one at RIR 5 (0.3) = 11.9.
    const ws = [
      workout('2026-11-16', [ex('pec_deck', many(6, 60, 12))]),
      workout('2026-11-18', [ex('pec_deck', many(5, 60, 12))]),
      workout('2026-11-20', [ex('pec_deck', [set(60, 12, 4), set(60, 12, 5)])]),
    ];
    const d = data(ws);
    d.settings = { ...d.settings, targetOverrides: { chest: { min: 6, preferred: 12, max: 18 } } };
    const c = muscle(analyze(d, noon('2026-11-21')), 'chest');
    expect(c.completed).toBe(11.9);
    expect(c.remainingToPreferred).toBe(0);
    expect(c.status).toBe('done');
    expect(c.todayNote).toBe('Target met');
  });
  it('11.5 of 12 (0.5 left) stays "on track"', () => {
    const ws = [workout('2026-11-16', [ex('pec_deck', many(6, 60, 12))]), workout('2026-11-18', [ex('pec_deck', many(5, 60, 12))]), workout('2026-11-20', [ex('pec_deck', [set(60, 12, 4, { rom: 'partial' })])])];
    const d = data(ws);
    d.settings = { ...d.settings, targetOverrides: { chest: { min: 6, preferred: 12, max: 18 } } };
    const c = muscle(analyze(d, noon('2026-11-21')), 'chest');
    expect(c.completed).toBe(11.48); // 11 + 0.6 × 0.8
    expect(c.remainingToPreferred).toBe(0.5);
    expect(c.status).toBe('on_track');
  });
});

describe('A-13 the unused legacy plan is gone', () => {
  it('analyze() no longer returns `plan` (the planner works from todayShare)', () => {
    expect('plan' in analyze(data([workout('2026-11-16', [ex('pec_deck', many(3, 60, 12))])]), noon('2026-11-17'))).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------ group F (M)

describe('F-3 "two sessions in a row" must be close in time', () => {
  // Pec deck, range 10–15: 2 × 15 at 60 kg in both sessions.
  const next = (firstDate: string, lastDate: string) => analyze(data([firstDate, lastDate].map((d) => workout(d, [ex('pec_deck', many(2, 60, 15, null), 'pd_a')]))), noon(add(lastDate, 1))).progression[0].next;
  it('2 March and 16 November (259 days apart) → not yet an increase', () => {
    const n = next('2026-03-02', '2026-11-16');
    expect(n.action).toBe('hold');
    expect(n.weight).toBe(60);
    expect(n.reason).toMatch(/259 days/);
  });
  it('56 days apart still counts; 57 does not', () => {
    expect(next('2026-09-21', '2026-11-16').action).toBe('increase');
    expect(next('2026-09-20', '2026-11-16').action).toBe('hold');
  });
});

describe('F-4 the second reduce rule is documented', () => {
  it('rule `double_progression` names it', () => {
    expect(RULE_BY_ID.double_progression.rule).toMatch(/most sets fall under the range while the trend is declining/);
  });
});

describe('F-5 regional chest emphasis follows the per-session ceiling', () => {
  it('14 incline dumbbell press sets in one session: chest 12.5 and upper-chest emphasis 12.5 (not 14)', () => {
    // Ceiling 11: 11 + 3 × 0.5 = 12.5. The emphasis is a share of chest work, so it can never exceed it.
    const v = computeVolume([workout('2026-11-16', [ex('incline_dumbbell_press', many(14, 25, 10, 1))])], reg, Q);
    expect(v.muscles.chest.effective).toBe(12.5);
    expect(v.regions.upper_chest.effective).toBe(12.5);
    expect(v.regions.upper_chest.sets).toBe(14);
  });
  it('below the ceiling nothing changes (8 sets → 8 and 8)', () => {
    const v = computeVolume([workout('2026-11-16', [ex('incline_dumbbell_press', many(8, 25, 10, 1))])], reg, Q);
    expect(v.muscles.chest.effective).toBe(8);
    expect(v.regions.upper_chest.effective).toBe(8);
  });
});

describe('F-6 "best" stays within the latest index kind', () => {
  it('bodyweight dips (reps index 21) then dips with a belt (kg index 13 / 13.3) → best 13.3, not 21', () => {
    const bw = (w: number, r: number) => [set(w, r, 1, { loadMode: 'bodyweight_plus' })];
    const ws = [
      workout('2026-11-02', [ex('dips', bw(0, 20))]), // reps + RIR = 21
      workout('2026-11-05', [ex('dips', bw(0, 20))]),
      workout('2026-11-09', [ex('dips', bw(10, 8))]), // 10 × (1 + 9/30) = 13
      workout('2026-11-12', [ex('dips', bw(10, 9))]), // 10 × (1 + 10/30) = 13.3
    ];
    const p = analyze(data(ws), noon('2026-11-13')).progression[0];
    expect(p.sessions.map((s) => s.indexKind)).toEqual(['reps', 'reps', 'load', 'load']);
    expect(p.best).toMatchObject({ e1rm: 13.3, weight: 10, reps: 9, date: '2026-11-12' });
  });
});

// ------------------------------------------------------------------------------------------------ group B

describe('B-1 weekly progressed / declined survives a session without an index', () => {
  it('a better session on Monday and an all-"pain" session on Wednesday → still "progressed"', () => {
    // Before the week: 60 × 12 @ RIR 2 = 88. Monday: 60 × 13 @ RIR 2 = 60 × 1.5 = 90 (> 88 × 1.005).
    const ws = [
      workout('2026-11-09', [ex('pec_deck', [set(60, 12, 2)], 'pd_a')]),
      workout('2026-11-12', [ex('pec_deck', [set(60, 12, 2)], 'pd_a')]),
      workout('2026-11-16', [ex('pec_deck', [set(60, 13, 2)], 'pd_a')]),
      workout('2026-11-18', [ex('pec_deck', [set(60, 10, 2, { feel: 'pain', pain: { area: 'Shoulder' } })], 'pd_a')]),
    ];
    const d = data(ws);
    const a = analyze(d, noon('2026-11-20'));
    const rep = weeklyReport(a.weeks.find((w) => w.range.start === '2026-11-16')!, a, d);
    expect(rep.progressed.map((x) => x.exerciseId)).toEqual(['pec_deck']);
    expect(rep.progressed[0].evidence).toMatch(/index 90\.0 vs recent best 88\.0/);
    expect(rep.declined).toEqual([]);
  });
});

describe('B-2 the deload check ignores sessions without an index', () => {
  const hist = (id: string, eq: string, last: WorkoutSet) => [
    workout('2026-11-02', [ex(id, [set(60, 12, 3)], eq)]),
    workout('2026-11-05', [ex(id, [set(60, 12, 3)], eq)]),
    workout('2026-11-09', [ex(id, [set(60, 13, 3)], eq)]),
    workout('2026-11-12', [ex(id, [last], eq)]),
  ];
  const creep = (last: () => WorkoutSet) => {
    const d = data([...hist('pec_deck', 'pd_a', last()), ...hist('leg_extension', 'le_a', last())]);
    return assessDeload(d, analyze(d, noon('2026-11-13'))).indicators.find((i) => i.label === 'Same performance feels harder')!;
  };
  it('two exercises improving, the last session of each flagged as pain → no "feels harder"', () => {
    const c = creep(() => set(60, 13, 1, { feel: 'pain', pain: { area: 'Shoulder' } }));
    expect(c.present).toBe(false);
    expect(c.detail).toMatch(/^0 exercise/);
  });
  it('control: the same reps at RIR 1 instead of RIR 3 without better performance → 2 exercises', () => {
    // 60 × 12 @ RIR 3 = 90 → 60 × 12 @ RIR 1 = 86; average RIR 3 → 1.
    const c = creep(() => set(60, 12, 1));
    expect(c.present).toBe(true);
    expect(c.detail).toMatch(/^2 exercise/);
  });
});

describe('B-3 the monthly weight note does not depend on floating-point noise', () => {
  const notes = (prev: number, cur: number, waistPrev = 85, waistCur = 85) =>
    monthlyBodyReport(data([], { body: [bm('2026-10-10', prev, { waistCm: waistPrev }), bm('2026-11-10', cur, { waistCm: waistCur })] }), '2026-11-23').notes.length;
  it('+0.3 kg is the same answer whatever the absolute weights (80.0 → 80.3 and 80.1 → 80.4): not above 0.3', () => {
    expect(notes(80.0, 80.3)).toBe(2);
    expect(notes(80.1, 80.4)).toBe(2);
  });
  it('+0.4 kg with a stable waist → the note appears; −0.3 / −0.4 likewise', () => {
    expect(notes(80.0, 80.4)).toBe(3);
    expect(notes(80.1, 80.5)).toBe(3);
    expect(notes(80.4, 80.1)).toBe(2);
    expect(notes(80.4, 80.0)).toBe(3);
  });
  it('waist +0.5 cm counts as stable whatever the absolute values (85.1 → 85.6)', () => {
    expect(notes(80.0, 80.4, 85.1, 85.6)).toBe(3);
  });
});

describe('B-4 progress % follows the latest index kind', () => {
  it('2 bodyweight dip sessions, then 7 weekly sessions with a belt → a % on the belt sessions', () => {
    // Body 80 kg (weighed the day before each belt session). Belt 10 kg × 8 @ RIR 2 → 90 × (1 + 10/30) = 120;
    // from the 5th belt session 9 reps → 90 × (1 + 11/30) = 123. Baseline (first 28 days of the belt history) =
    // median(120 × 4) = 120; current = median(123, 123, 123) → +2.5 %.
    const belt = (k: number) => add('2026-09-14', k * 7);
    const ws = [
      workout('2026-09-07', [ex('dips', [set(0, 15, 2, { loadMode: 'bodyweight_plus' })])]),
      workout('2026-09-10', [ex('dips', [set(0, 15, 2, { loadMode: 'bodyweight_plus' })])]),
      ...Array.from({ length: 7 }, (_, k) => workout(belt(k), [ex('dips', [set(10, k < 4 ? 8 : 9, 2, { loadMode: 'bodyweight_plus' })])])),
    ];
    const d = data(ws, { body: Array.from({ length: 7 }, (_, k) => bm(add(belt(k), -1), 80)) });
    const today = add(belt(6), 1);
    const p = analyze(d, noon(today)).progression[0];
    expect(p.sessions.map((s) => s.indexKind)).toEqual(['reps', 'reps', 'system', 'system', 'system', 'system', 'system', 'system', 'system']);
    const sp = strengthProgress(p, today);
    expect(sp.status).toBe('ok');
    expect(sp.baseline).toMatchObject({ index: 120, sessions: 4, from: belt(0) });
    expect(sp.pct).toBe(2.5);
  });
});

describe('B-6 the baseline report counts a muscular-failure answer as known effort', () => {
  it('6 sets with RIR 2 and one "muscular failure" without RIR → effort known on 100 %, average RIR 12 / 7 = 1.7', () => {
    const d = data([workout('2026-11-16', [ex('pec_deck', [...many(6, 60, 12), set(60, 10, null, { failure: 'muscular' })])])]);
    const r = baselineReport(d, analyze(d, noon('2026-11-17')))!;
    expect(r.effort.rirKnownPct).toBe(100);
    expect(r.effort.avgRir).toBe(1.7);
    expect(r.effort.nearFailurePct).toBe(100);
  });
  it('technique gave out → not a known RIR (6 of 7 = 86 %)', () => {
    const d = data([workout('2026-11-16', [ex('pec_deck', [...many(6, 60, 12), set(60, 10, null, { failure: 'muscular', technicalFailure: true })])])]);
    expect(baselineReport(d, analyze(d, noon('2026-11-17')))!.effort.rirKnownPct).toBe(86);
  });
});

describe('B-7 an outdated weigh-in does not feed the body + belt index', () => {
  const pull = (date: string) => workout(date, [ex('pull_up', [set(10, 8, 2, { loadMode: 'bodyweight_plus' })], null, { variation: { loading: 'weighted' } })]);
  const body = [bm('2026-06-01', 80)];
  const ws = [pull('2026-06-03'), pull('2026-10-29')]; // 2 and 150 days after the only weigh-in
  const d = data(ws, { body });
  const p = analyze(d, noon('2026-10-30')).progression[0];
  it('2 days old → body + belt (90 × (1 + 10/30) = 120); 150 days old → belt only (10 × (1 + 10/30) = 13.3)', () => {
    expect(p.sessions.map((s) => [s.indexKind, s.index])).toEqual([['system', 120], ['load', 13.3]]);
  });
  it('no estimated system mass and no "body weight stable" sentence from the outdated weigh-in', () => {
    const sessions = bodyLoadSessions(p, ws, body, 'system');
    expect(sessions.map((s) => [s.body.status, s.estSystemKg])).toEqual([['ok', 90], ['outdated', null]]);
    expect(bodyWeightNote(sessions, 'system')).toMatch(/not recorded around these sessions/);
  });
});

describe('B-9 the summary\'s average rest covers working sets only', () => {
  it('rests 120, 90, 100 s + a drop segment after 8 s → 103 s (310 / 3), not 80', () => {
    const w = workout('2026-11-16', [ex('pec_deck', [
      set(60, 12, 2), set(60, 11, 2, { restSecBefore: 120 }), set(60, 10, 2, { restSecBefore: 90 }), set(60, 9, 2, { restSecBefore: 100 }),
      set(40, 8, null, { type: 'drop', restSecBefore: 8 }),
    ])]);
    expect(summarizeSession(w, [w], reg, Q, { date: '2026-11-16', time: '19:00' }).avgRestSec).toBe(103);
  });
});

describe('B-10 weighted dips / pull-ups are HIGH fatigue cost from the performed sets', () => {
  const belt = (kg: number, extra: Partial<WorkoutSet> = {}) => [set(kg, 8, 2, { loadMode: 'bodyweight_plus', ...extra })];
  it('dips + 20 kg and pull-ups + 10 kg without `loading` → HIGH; bodyweight stays MODERATE', () => {
    expect(fatigueCostOf(reg.get('dips'), undefined, belt(20))).toBe('high');
    expect(fatigueCostOf(reg.get('pull_up'), { loading: 'bodyweight' }, belt(10))).toBe('high');
    expect(fatigueCostOf(reg.get('dips'), undefined, belt(0))).toBe('moderate');
    expect(fatigueCostOf(reg.get('dips'), undefined, [])).toBe('moderate');
    // an unticked planned set or a warm-up with a belt does not count; other exercises are untouched
    expect(fatigueCostOf(reg.get('dips'), undefined, belt(20, { planned: true }))).toBe('moderate');
    expect(fatigueCostOf(reg.get('pec_deck'), undefined, belt(20))).toBe('low');
  });
  it('the session load lists them as demanding lifts', () => {
    const w = workout('2026-11-16', [ex('dips', belt(20)), ex('pull_up', belt(0))]);
    expect(sessionLoad(w, reg, Q).highCostDone).toEqual(['dips']);
  });
});

describe('B-12 the session load counts a left + right pair as one set', () => {
  it('2 left + 2 right to failure → 2 sets, 2 failure sets (not "heavy")', () => {
    const side = (s: 'left' | 'right') => set(10, 12, null, { side: s, toFailure: true });
    const w = workout('2026-11-16', [ex('cable_lateral_raise', [side('left'), side('right'), side('left'), side('right')], null, { variation: { unilateral: true } })]);
    const l = sessionLoad(w, reg, Q);
    expect(l.workingSets).toBe(2);
    expect(l.failureSets).toBe(2);
    expect(l.level).toBe('fresh');
  });
});

// ------------------------------------------------------------------------------------------------ group C

describe('C-1 pain hold and "avoid" also apply to the new-exercise path', () => {
  const eq = (id: string, name: string, exerciseIds: string[]): Equipment => ({
    id, locationId: 'gym_a', name, kind: 'machine', identified: true, incrementsKg: [5], minKg: 5, maxKg: 150, settings: {}, exerciseIds, photoIds: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  });
  // 14 sessions (Mon / Thu, 7 weeks): pec deck 2 × 12 (chest 2 / session → 4 / week) + leg extension 3 × 12.
  const base = (): Workout[] => Array.from({ length: 14 }, (_, k) => workout(add('2026-09-28', Math.floor(k / 2) * 7 + (k % 2) * 3), [
    ex('pec_deck', many(2, 60, 12), 'pd_a'), ex('leg_extension', many(3, 50, 12), 'le_a'),
  ], { startTime: '18:00', endTime: '19:00' }));
  const build = (decide: (ws: Workout[]) => Workout[]) => {
    const d = data(decide(base()), { equipment: [eq('pd_a', 'Pec deck A', ['pec_deck']), eq('le_a', 'Leg extension A', ['leg_extension'])] });
    // The owner's OWN chest target: 8–14 / week, so 4 / week is a persistent deficit (below the lower end for 2 weeks).
    d.settings = { ...d.settings, learning: { startDate: '2026-09-28', endedOn: '2026-10-30', lengthDays: 30 }, targetOverrides: { chest: { min: 8, preferred: 10, max: 14 } } };
    const now = noon('2026-11-16'); // Monday; the last session was Thursday 2026-11-12
    const a = analyze(d, now);
    return generateWorkout({ data: d, analysis: a, now });
  };
  it('control: without a pain decision the pec deck is planned (familiar)', () => {
    const g = build((ws) => ws);
    expect(g.items.find((i) => i.exerciseId === 'pec_deck')?.familiar).toBe(true);
  });
  it('pec deck skipped for pain 4 days ago → not planned at all, also not as a "new" exercise', () => {
    const g = build((ws) => ws.map((w, i) => (i === ws.length - 1 ? { ...w, planDecisions: [{ action: 'skipped' as const, exerciseId: 'pec_deck', equipmentId: 'pd_a', reason: 'pain' as const, at: `${w.date}T18:30:00Z` }] } : w)));
    expect(g.items.map((i) => i.exerciseId)).not.toContain('pec_deck');
    expect(g.items.flatMap((i) => i.why).join(' ')).not.toMatch(/Pec deck.*new to you/i);
  });

  // A second gym (gym_b) where the pec deck was never done: its familiar history (machine pd_a) is not available
  // there, so the planner reaches the "new exercise" path, where pd_b is linked to the pec deck.
  const atGymB = (decisions: boolean) => {
    const sat = ['2026-10-31', '2026-11-07', '2026-11-14'].map((dt) => workout(dt, [ex('leg_extension', many(3, 50, 12), 'le_b')], {
      locationId: 'gym_b', startTime: '10:00', endTime: '10:30',
      ...(decisions ? { planDecisions: [{ action: 'skipped' as const, exerciseId: 'pec_deck', equipmentId: 'pd_b', reason: 'preference' as const, at: `${dt}T10:10:00Z` }] } : {}),
    }));
    const d = data([...base(), ...sat], {
      locations: [{ id: 'gym_a', name: 'Gym A', photoIds: [], createdAt: '' }, { id: 'gym_b', name: 'Gym B', photoIds: [], createdAt: '' }],
      equipment: [eq('pd_a', 'Pec deck A', ['pec_deck']), eq('le_a', 'Leg extension A', ['leg_extension']), { ...eq('pd_b', 'Pec deck B', ['pec_deck']), locationId: 'gym_b' }, { ...eq('le_b', 'Leg extension B', ['leg_extension']), locationId: 'gym_b' }],
    });
    d.settings = { ...d.settings, learning: { startDate: '2026-09-28', endedOn: '2026-10-30', lengthDays: 30 }, targetOverrides: { chest: { min: 8, preferred: 10, max: 14 } } };
    const now = noon('2026-11-16');
    return generateWorkout({ data: d, analysis: analyze(d, now), now, locationId: 'gym_b' });
  };
  it('an exercise with 14 sessions on record is never called "new to you" (another machine at another gym)', () => {
    const it0 = atGymB(false).items.find((i) => i.exerciseId === 'pec_deck')!;
    expect(it0).toMatchObject({ equipmentId: 'pd_b', familiar: false });
    expect(it0.why.join(' ')).toMatch(/done before \(14 sessions\)/);
    expect(it0.why.join(' ')).not.toMatch(/new to you/);
  });
  it('skipped there three times by choice ("avoid") → not brought back through the new-exercise path', () => {
    expect(atGymB(true).items.map((i) => i.exerciseId)).not.toContain('pec_deck');
  });
});

describe('C-3 volume is reduced for a decline only when effort is known and adequate', () => {
  const chest = (edit: (s: WorkoutSet) => WorkoutSet) => {
    const d = dataQualityHistory({ sessions: 16, trend: 'down' });
    d.workouts = d.workouts.map((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map(edit) })) }));
    const a = analyze(d, dayAfterLast(d, 3));
    return { t: a.targets.chest, trend: muscle(a, 'chest').trend.overall };
  };
  it('control: declining with RIR 2 on every set → reduce "with adequate effort"', () => {
    const { t, trend } = chest((s) => s);
    expect(trend).toBe('declining');
    expect(t.volumeAction).toBe('reduce');
    expect(t.rationale.join(' ')).toMatch(/with adequate effort/);
  });
  it('declining, NO effort recorded → hold, and the reason says effort is not recorded', () => {
    const { t, trend } = chest((s) => ({ ...s, rir: null, rirSource: 'unknown' }));
    expect(trend).toBe('declining');
    expect(t.volumeAction).toBe('hold');
    expect(t.preferred).toBe(t.baseline);
    expect(t.rationale.join(' ')).toMatch(/effort .* is not recorded/);
    expect(t.rationale.join(' ')).not.toMatch(/with adequate effort/);
  });
  it('declining, every set "too easy" → hold: closer to failure first', () => {
    const { t } = chest((s) => ({ ...s, rir: null, rirSource: 'unknown', feel: 'too_easy', effort: 'very_easy' }));
    expect(t.volumeAction).toBe('hold');
    expect(t.rationale.join(' ')).toMatch(/closer to failure/);
  });
  it('declining, RIR 5 on every set → hold with the true reason (not "the volume changed recently")', () => {
    const { t } = chest((s) => ({ ...s, rir: 5 }));
    expect(t.volumeAction).toBe('hold');
    expect(t.rationale.join(' ')).toMatch(/closer to failure/);
    expect(t.rationale.join(' ')).not.toMatch(/volume changed recently/);
  });
});

describe('C-5 the usual session size pairs left and right', () => {
  it('3 left + 3 right + 3 normal sets per session → 6 sets, not 9', () => {
    const sides = [0, 1, 2].flatMap(() => [set(10, 12, 2, { side: 'left' }), set(10, 12, 2, { side: 'right' })]);
    const ws = ['2026-11-09', '2026-11-12', '2026-11-16'].map((dt) => workout(dt, [ex('cable_lateral_raise', sides.map((s) => ({ ...s, id: `${s.id}-${dt}` })), null, { variation: { unilateral: true } }), ex('pec_deck', many(3, 60, 12))]));
    const d = data(ws);
    expect(sessionPatterns(d, analyze(d, noon('2026-11-17'))).usualSets).toBe(6);
  });
});

describe('C-7 "left today" is one formula', () => {
  it('share 4, done 3.75 → 0 left on the Week screen and on the choice card (not 0.5)', () => {
    // Chest target 12. Mon + Wed: 4 pec-deck sets each (8). Sunday: 4 left ÷ 1 session → share 4.
    // Sunday so far: 3 pec-deck sets (3.0) + 1 close-grip bench set (chest 0.75) = 3.75.
    const todayW = workout('2026-11-22', [ex('pec_deck', many(3, 60, 12)), ex('close_grip_bench', [set(60, 8, 2)])], { startTime: '10:00' });
    const d = data([workout('2026-11-16', [ex('pec_deck', many(4, 60, 12))]), workout('2026-11-18', [ex('pec_deck', many(4, 60, 12))]), todayW]);
    d.settings = { ...d.settings, targetOverrides: { chest: { min: 6, preferred: 12, max: 18 } } };
    const a = analyze(d, noon('2026-11-22'));
    const c = muscle(a, 'chest');
    expect([c.todayShare, c.doneToday, c.todayLeft]).toEqual([4, 3.75, 0]);
    const line = assessChoice({ data: d, analysis: a, workout: todayW, exerciseId: 'pec_deck', alternatives: false }).muscles[0];
    expect(line.muscle).toBe('chest');
    expect(line.todayLeft).toBe(0);
  });
});

describe('C-8 every muscle with coefficient ≥ 0.5 gets a state', () => {
  it('biceps loaded yesterday: the barbell row (biceps is its 4th muscle) is assessed like the cable row (3rd)', () => {
    // 6 curl sets yesterday, ended 19:00 → 36 h window, 19 h left at noon.
    const d = data([workout('2026-11-02', [ex('barbell_curl', many(6, 30, 10)), ex('barbell_row', many(3, 60, 10)), ex('seated_cable_row', many(3, 50, 10))]),
      workout('2026-11-16', [ex('barbell_curl', many(6, 30, 10))], { startTime: '18:00', endTime: '19:00' })]);
    const a = analyze(d, noon('2026-11-17'));
    expect(a.planRecovery.biceps.status).toBe('recovering');
    const cable = assessChoice({ data: d, analysis: a, workout: null, exerciseId: 'seated_cable_row', alternatives: false });
    const bar = assessChoice({ data: d, analysis: a, workout: null, exerciseId: 'barbell_row', alternatives: false });
    expect(cable.muscles.find((m) => m.muscle === 'biceps')?.state).toBe('RECENTLY_LOADED');
    expect(bar.muscles.find((m) => m.muscle === 'biceps')?.state).toBe('RECENTLY_LOADED');
    expect(bar.status).toBe(cable.status);
    expect(bar.status).not.toBe('good');
  });
});

describe('C-9 the rule text of the operating modes matches the code', () => {
  it('names the machine-link share, not "gyms identified"', () => {
    const r = RULE_BY_ID.planner_modes.rule;
    expect(r).not.toMatch(/gyms identified/);
    expect(r).toMatch(/≥ 80 % of machine exercises linked to a machine/);
  });
});
