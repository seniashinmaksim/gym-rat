/**
 * Audit 3 (2026-11-25): doc = code = hand calculation for progression, learning rules, sequencing, the optimality
 * score and the set-by-set offer. Every expected value is typed by hand from the documented rule (CLAUDE.md sections
 * D, G, H, I, L, M, N, O, P and rules.ts); the arithmetic is in the comment above it. Synthetic data only.
 * `it.fails` = a reproduced mismatch (expected by the documented rule vs what the code returns) — see the comment.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import type { AppData } from '../src/domain/appdata';
import { strengthProgress } from '../src/domain/baseline';
import { choiceOutcomes } from '../src/domain/exerciseChoice';
import { loadStep } from '../src/domain/increments';
import { applyOffer, keepOffer, nextSetsOffer, prescribedFor, weightSource } from '../src/domain/liveFlow';
import { bandOf, optimality, rankOptions, type Optimality } from '../src/domain/optimality';
import { heldUp, outcomeAt, softenedFrom } from '../src/domain/outcomes';
import { expectedRepDrop, measuredDrop, preloadFactor } from '../src/domain/preload';
import { adaptRemaining, type Prescription } from '../src/domain/prescription';
import { classifyTrend, comparableSessions, epley, sessionPerf, stepLoad, suggestNextLoad, type ProgressionSeries, type SessionPerf, type Trend } from '../src/domain/progression';
import { isShortRest, usualRestSec } from '../src/domain/rest';
import { activeMoves, addMoves, forwardChecks, keptOutcome, movePartners, usualSetCount } from '../src/domain/sequence';
import type { ExerciseTarget, PlannedMove, Workout, WorkoutExercise, WorkoutSet } from '../src/domain/types';
import { fitToday, sessionWindowH, usualTrainingDays } from '../src/domain/weekPlan';
import { setLang } from '../src/i18n/core';
import { data, ex, set, workout } from './fixtures';

setLang('en');
const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);
const add = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const D0 = '2026-09-07';

/** A session point with a given index (literal, so the trend arithmetic is exactly the numbers typed here). */
const sp = (date: string, index: number, x: Partial<SessionPerf> = {}): SessionPerf => ({
  workoutId: date, date, sets: [], topWeight: null, topReps: null, topRir: null, e1rm: index, index, indexRaw: index, indexKind: 'load',
  representative: true, totalReps: 0, volumeLoad: 0, avgRir: null, rirKnownRatio: 0, restAvgSec: null, fatigued: false, ...x,
});
const series = (idx: number[], gapDays = 7, x: Partial<SessionPerf> = {}) => idx.map((v, i) => sp(add(D0, i * gapDays), v, x));
const lastDate = (s: SessionPerf[]) => s[s.length - 1].date;
/** A session point from real sets. */
const perf = (date: string, sets: WorkoutSet[], basis: 'rir' | 'reps' = 'rir', body: number | null = null, id = 'pec_deck') => {
  const e = ex(id, sets, 'm1');
  return sessionPerf(workout(date, [e]), e, true, body, basis) as SessionPerf;
};
const STABLE: Trend = { cls: 'stable', evidence: '', relSlopePerSession: 0, sessionsUsed: 0 };
const DECLINING: Trend = { ...STABLE, cls: 'declining' };

// ====================================================================== 1. strength index, trend, double progression
describe('1a. strength index', () => {
  it('Epley with RIR: 40 kg × 10, RIR 2 → 40 × (1 + 12/30) = 56; reps + RIR are capped at 30', () => {
    expect(epley(40, 10, 2)).toBeCloseTo(56, 9);
    expect(epley(50, 28, 5)).toBeCloseTo(100, 9); // 50 × (1 + 30/30)
    expect(epley(40, 10, null)).toBeCloseTo(53.3333, 3);
  });
  it('RIR basis vs reps-only basis on the same sets', () => {
    const sets = () => [set(40, 10, 2), set(40, 11, null)];
    // rir basis: 40×(1+12/30) = 56 vs 40×(1+11/30) = 54.67 → 56. reps basis: 53.33 vs 54.67 → 54.67 (the 11-rep set).
    const a = perf(D0, sets(), 'rir');
    expect(a.index).toBe(56); expect(a.topReps).toBe(10); expect(a.indexKind).toBe('load');
    const b = perf(D0, sets(), 'reps');
    expect(b.index).toBe(54.7); expect(b.topReps).toBe(11);
  });
  it('body + belt: 80 kg body + 10 kg belt × 8, RIR 1 → 90 × (1 + 9/30) = 117 ("system"); no body weight → belt only 13 ("load")', () => {
    const sets = () => [set(10, 8, 1, { loadMode: 'bodyweight_plus' })];
    const withBody = perf(D0, sets(), 'rir', 80, 'pull_up');
    expect(withBody.index).toBe(117); expect(withBody.indexKind).toBe('system');
    const without = perf(D0, sets(), 'rir', null, 'pull_up');
    expect(without.index).toBe(13); expect(without.indexKind).toBe('load');
  });
  it('bodyweight only (0 kg) → reps + RIR = 10, kind "reps"; assisted → reps + RIR, the assistance is not in the index', () => {
    const bw = perf(D0, [set(0, 8, 2, { loadMode: 'bodyweight_plus' })], 'rir', 80, 'pull_up');
    expect(bw.index).toBe(10); expect(bw.indexKind).toBe('reps');
    const as = perf(D0, [set(40, 8, 1, { loadMode: 'assisted' }), set(30, 6, 1, { loadMode: 'assisted' })], 'rir', null, 'assisted_pull_up');
    expect(as.index).toBe(9); expect(as.indexKind).toBe('reps'); expect(as.topWeight).toBe(40); // the EASIER set (more help) is "top"
  });
});

describe('1b. trend classification', () => {
  it('< 3 sessions → insufficient data', () => {
    expect(classifyTrend(series([100, 105]), add(D0, 7)).cls).toBe('insufficient_data');
    expect(classifyTrend([], D0).cls).toBe('insufficient_data');
  });
  it('boundary +1 % per session: 100/101/102 → slope 1 ÷ mean 101 = 0.990 % → stable; 100/101.1/102.2 → 1.1/101.1 = 1.088 % → progressing', () => {
    const a = series([100, 101, 102]);
    expect(classifyTrend(a, lastDate(a)).cls).toBe('stable');
    const b = series([100, 101.1, 102.2]);
    expect(classifyTrend(b, lastDate(b)).cls).toBe('progressing');
  });
  it('declining: 100/98/96 → slope −2 ÷ 98 = −2.04 % ≤ −1.5 %, last < first', () => {
    const a = series([100, 98, 96]);
    const t = classifyTrend(a, lastDate(a));
    expect(t.cls).toBe('declining');
    expect(t.relSlopePerSession as number).toBeCloseTo(-2 / 98, 9);
  });
  it('one bad latest session with 4 sessions (100/100/99/90: usual = median 100, 90 is 10 % under) is set aside → stable', () => {
    const a = series([100, 100, 99, 90]);
    expect(classifyTrend(a, lastDate(a)).cls).toBe('stable');
  });
  // CLAUDE.md §D: "one bad latest session (≥ 5 % under the usual level) is set aside — it never creates … a decline".
  // The guard needs n ≥ 4 (progression.ts:316). With exactly 3 sessions 100/99/90 (slope −5 ÷ 96.33 = −5.2 %, 99 < 100)
  // the single bad day IS classified "declining". Expected by the doc: not declining. Actual: declining.
  // Third analysis: the DOC was made precise (§D: the guard needs ≥ 4 sessions) — extending the guard to 3 sessions would
  // also hide a steady decline 100 / 96 / 92 / 88. Open question for the owner (map doc §13).
  it('owner 2026-11-25: with exactly 3 sessions one bad last session is "stable" (wait for a fourth); a steady fall is still a decline', () => {
    const a = series([100, 99, 90]); // first two level (99 >= 98), last 90 < 99 x 0.95
    expect(classifyTrend(a, lastDate(a)).cls).toBe('stable');
    const b = series([100, 96, 92]); // 96 < 98: not level; slope -4 / 96 = -4.2 % -> declining
    expect(classifyTrend(b, lastDate(b)).cls).toBe('declining');
  });
  it('plateau: 4 sessions over exactly 21 days, no new best in the last 2 → plateau; over 20 days → stable', () => {
    const a = series([100, 100, 100, 100], 7); // span 21
    expect(classifyTrend(a, lastDate(a)).cls).toBe('plateau');
    const b = [sp(D0, 100), sp(add(D0, 7), 100), sp(add(D0, 14), 100), sp(add(D0, 20), 100)];
    expect(classifyTrend(b, lastDate(b)).cls).toBe('stable');
    const c = series([100, 100, 100], 14); // 3 sessions over 28 days: needs ≥ 4
    expect(classifyTrend(c, lastDate(c)).cls).toBe('stable');
  });
  it('a higher working load in the last two sessions is progress, not a plateau (index 69 ≥ 97 % of 70 = 67.9)', () => {
    const idx = [70, 70, 69, 69.5];
    const top = [50, 50, 52.5, 52.5];
    const a = idx.map((v, i) => sp(add(D0, i * 7), v, { topWeight: top[i] }));
    expect(classifyTrend(a, lastDate(a)).cls).toBe('stable');
    const same = idx.map((v, i) => sp(add(D0, i * 7), v, { topWeight: 50 }));
    expect(classifyTrend(same, lastDate(same)).cls).toBe('plateau');
    // 67.8 < 67.9 → the heavier load came with a clearly lower index → still a plateau
    const low = [70, 70, 67.8, 67.8].map((v, i) => sp(add(D0, i * 7), v, { topWeight: top[i] }));
    expect(classifyTrend(low, lastDate(low)).cls).toBe('plateau');
  });
  it('sustained decline: 9 sessions in 48 days, first three 100, last six 92 (−8 %) → declining although the 6-session slope is 0; 93 (−7 %) → not', () => {
    const a = series([100, 100, 100, 92, 92, 92, 92, 92, 92], 6);
    expect(classifyTrend(a, lastDate(a)).cls).toBe('declining');
    const b = series([100, 100, 100, 93, 93, 93, 93, 93, 93], 6);
    expect(classifyTrend(b, lastDate(b)).cls).toBe('plateau');
  });
  it('sessions older than 56 days are not used; day 56 still is', () => {
    const a = series([100, 98, 96], 7); // last session at D0 + 14
    expect(classifyTrend(a, add(D0, 56)).cls).toBe('declining'); // the first one is exactly 56 days old
    expect(classifyTrend(a, add(D0, 57)).cls).toBe('insufficient_data');
  });
  it('kg-based and reps-based indices are never compared: 3 reps sessions then 2 load sessions → insufficient data', () => {
    const a = [...series([10, 10, 10], 7, { indexKind: 'reps' }), sp(add(D0, 21), 13), sp(add(D0, 28), 13)];
    const t = classifyTrend(a, lastDate(a));
    expect(t.cls).toBe('insufficient_data'); expect(t.sessionsUsed).toBe(2);
  });
  // FORMULA CHOICE (documented: the index of assisted work is reps + RIR; "assistance loads are left out"): four weeks
  // of real progress on an assisted pull-up — 40 → 35 → 30 → 25 kg of help at 10 reps, RIR 2 — has the index 12, 12,
  // 12, 12 and is called a PLATEAU. The "higher working load is progress, not a plateau" rule (Part 7) is not applied.
  it('FORMULA CHOICE: less assistance at the same reps is read as a plateau', () => {
    const a = [40, 35, 30, 25].map((kg, i) => perf(add(D0, i * 7), times(3, () => set(kg, 10, 2, { loadMode: 'assisted' })), 'rir', null, 'assisted_pull_up'));
    expect(a.map((s) => s.index)).toEqual([12, 12, 12, 12]);
    expect(classifyTrend(a, lastDate(a)).cls).toBe('plateau');
  });
});

describe('1c. double progression (rep range 8–12, target RIR 2, step 2.5 kg)', () => {
  const R: [number, number] = [8, 12];
  const top = (d: string, kg = 40, extra: Partial<WorkoutSet> = {}) => perf(d, times(3, () => set(kg, 12, null, extra)));
  const next = (s: SessionPerf[], inc = 2.5, trend = STABLE, mode = 'total') => suggestNextLoad(s, R, 2, inc, trend, mode);
  it('empty history → calibrate; one session at the top → keep; two in a row → +2.5 kg (no effort answer needed)', () => {
    expect(next([]).action).toBe('calibrate');
    const one = next([top(D0)]);
    expect([one.action, one.weight]).toEqual(['hold', 40]);
    const two = next([top(D0), top(add(D0, 7))]);
    expect([two.action, two.weight]).toEqual(['increase', 42.5]);
  });
  it('two sessions 56 days apart count, 57 days apart do not', () => {
    expect(next([top(D0), top(add(D0, 56))]).action).toBe('increase');
    const far = next([top(D0), top(add(D0, 57))]);
    expect([far.action, far.weight]).toEqual(['hold', 40]);
  });
  it('one set short (12, 12, 11) → keep; lighter back-off sets are ignored (40×12, 40×12, 35×15)', () => {
    const short = (d: string) => perf(d, [set(40, 12, null), set(40, 12, null), set(40, 11, null)]);
    expect(next([short(D0), short(add(D0, 7))]).action).toBe('hold');
    const backoff = (d: string) => perf(d, [set(40, 12, null), set(40, 12, null), set(35, 15, null)]);
    expect(next([backoff(D0), backoff(add(D0, 7))]).weight).toBe(42.5);
  });
  it('one-session shortcut: every set at the top with RIR 4 (= target + 2) → increase; RIR 3 → keep; reps falling 13 → 12 → keep', () => {
    expect(next([perf(D0, times(3, () => set(40, 12, 4)))]).action).toBe('increase');
    expect(next([perf(D0, times(3, () => set(40, 12, 3)))]).action).toBe('hold');
    expect(next([perf(D0, [set(40, 13, 4), set(40, 12, 4)])]).action).toBe('hold');
    expect(next([perf(D0, [set(40, 12, 4)])]).action).toBe('hold'); // one set is never enough
  });
  // DOC WRONG (imprecise): CLAUDE.md §D / §G say the shortcut needs "at least two sets" clearly too light. The code
  // (progression.ts:550) and its own comment need EVERY set at the working load to be clearly light (and ≥ 2 of them):
  // 12 @ RIR 4, 12 @ RIR 4, 12 with no answer → by the CLAUDE.md wording "increase", by the code "keep".
  it('DOC WRONG: two clearly light sets out of three do not trigger the one-session shortcut (the code needs every set)', () => {
    expect(next([perf(D0, [set(40, 12, 4), set(40, 12, 4), set(40, 12, null)])]).action).toBe('hold');
  });
  it('assisted: the step goes DOWN (30 → 25 kg of help), never below 0; no help left → keep 0', () => {
    const a = (d: string, kg: number) => perf(d, times(2, () => set(kg, 12, null, { loadMode: 'assisted' })), 'rir', null, 'assisted_pull_up');
    const n1 = next([a(D0, 30), a(add(D0, 7), 30)], 5, STABLE, 'assisted');
    expect([n1.action, n1.weight]).toEqual(['increase', 25]);
    expect(next([a(D0, 2.5), a(add(D0, 7), 2.5)], 5, STABLE, 'assisted').weight).toBe(0);
    const n0 = next([a(D0, 0), a(add(D0, 7), 0)], 5, STABLE, 'assisted');
    expect([n0.action, n0.weight]).toEqual(['hold', 0]);
  });
  it('bodyweight (0 kg, bodyweight_plus) → keep and add reps', () => {
    const b = (d: string) => perf(d, times(2, () => set(0, 12, null, { loadMode: 'bodyweight_plus' })), 'rir', null, 'pull_up');
    const n = next([b(D0), b(add(D0, 7))], 2.5, STABLE, 'bodyweight_plus');
    expect([n.action, n.weight]).toEqual(['hold', 0]);
  });
  it('reduce: technique broke on 2 of 3 sets → one step down 40 → 37.5; a clean load within 1.5 steps is used instead (42.5 → 40 with a 2-kg step)', () => {
    const br = { technique: 'compromised' as const };
    const n = next([perf(D0, [set(40, 8, null, br), set(40, 8, null, br), set(40, 8, null)])]);
    expect([n.action, n.weight]).toEqual(['reduce', 37.5]);
    const m = next([perf(D0, [set(40, 10, null), set(42.5, 8, null, br), set(42.5, 8, null, br)])], 2);
    expect([m.action, m.weight]).toEqual(['reduce', 40]); // |42.5 − 40| = 2.5 ≤ 1.5 × 2 = 3
  });
  it('one subjective answer never reduces (1 of 2 sets broke, reps inside the range, nothing the session before)', () => {
    const n = next([perf(D0, [set(40, 10, null), set(40, 9, null, { technique: 'compromised' })])]);
    expect([n.action, n.weight]).toEqual(['hold', 40]);
    // … but confirmed by the numbers (that set under the bottom of the range: 7 < 8) → reduce
    expect(next([perf(D0, [set(40, 10, null), set(40, 7, null, { technique: 'compromised' })])]).action).toBe('reduce');
  });
  it('assisted reduce = MORE help: 20 → 25', () => {
    const br = { technique: 'compromised' as const, loadMode: 'assisted' as const };
    const n = next([perf(D0, [set(20, 8, null, br), set(20, 8, null, br)], 'rir', null, 'assisted_pull_up')], 5, STABLE, 'assisted');
    expect([n.action, n.weight]).toEqual(['reduce', 25]);
  });
  it('second reduce rule: most sets under 8 reps AND a declining trend → 37.5; stable trend → keep; a short rest explains it → keep', () => {
    const low = perf(D0, [set(40, 7, null), set(40, 6, null), set(40, 6, null)]);
    expect(next([low], 2.5, DECLINING).weight).toBe(37.5);
    expect(next([low], 2.5, STABLE).action).toBe('hold');
    // Owner 2026-11-25: the REAL usual rest counts. 60 s where 60 s is usual is not short -> the rule applies (reduce);
    // the same drop after 60 s where the usual rest is 150 s -> the rest explains it -> keep.
    const usual60 = perf(D0, [set(40, 9, null), set(40, 6, null, { restSecBefore: 60 }), set(40, 6, null, { restSecBefore: 60 })]);
    expect(next([usual60], 2.5, DECLINING).action).toBe('reduce');
    const usual150 = perf(D0, [set(40, 9, null), set(40, 6, null, { restSecBefore: 60 }), set(40, 6, null, { restSecBefore: 150 }), set(40, 6, null, { restSecBefore: 150 })]);
    expect(next([usual150], 2.5, DECLINING).action).toBe('hold');
  });
  it('never an increase right after pain', () => {
    const pain = perf(add(D0, 7), [set(40, 12, null), set(40, 12, null), set(40, 12, null, { feel: 'pain' })]);
    expect(next([top(D0), pain]).action).toBe('hold');
  });
  // DOC STALE (working tree of 2026-11-25, uncommitted): CLAUDE.md §L still says "barbells 2.5 kg; plates per side 1.25 kg".
  // increments.ts now gives a bar 5 kg (2.5 per side) — "owner 2026-11-25: the smallest plates are 2.5 kg". At HEAD a8dbca5
  // the values were 2.5 / 1.25 as documented. The numbers below are the working tree's.
  it('load steps: bar 5 (2.5 per side), dumbbells 2, machine 2.5; equipment step wins; 25 kg + 2 = 27 (not snapped to 28)', () => {
    expect(loadStep(null, null, 'plate_loaded', 'per_side').step).toBe(2.5);
    expect(loadStep(null, null, 'plate_loaded', 'total').step).toBe(5);
    expect(loadStep(null, null, 'barbell').step).toBe(5);
    expect(loadStep(null, null, 'machine').step).toBe(2.5);
    expect(loadStep(null, null, 'dumbbell').step).toBe(2);
    expect(loadStep({ incrementsKg: [5, 2.5] }, { freeWeightIncrementsKg: [1] }, 'dumbbell')).toEqual({ step: 2.5, source: 'equipment' });
    expect(loadStep(null, { freeWeightIncrementsKg: [2.5, 1] }, 'dumbbell')).toEqual({ step: 1, source: 'gym_free_weights' });
    expect(stepLoad(25, 2, 2)).toBe(27);
    expect(stepLoad(24, 2, 2)).toBe(26);
    expect(stepLoad(2.5, -5, 5)).toBe(0);
  });
});

describe('1d. baseline, progress % and session order', () => {
  const S = (sessions: SessionPerf[], loadMode = 'total') => ({ key: 'k', exerciseId: 'pec_deck', sessions, loadMode } as unknown as ProgressionSeries);
  it('baseline = median of the first 28 days (100, 102 → 101); current = median of the last ≤ 3 in 28 days (104, 106, 108 → 106); +4.95 % → 5.0', () => {
    const s = [sp(D0, 100), sp(add(D0, 7), 102), sp(add(D0, 30), 104), sp(add(D0, 40), 106), sp(add(D0, 50), 108)];
    const p = strengthProgress(S(s), add(D0, 55));
    expect(p.baseline?.index).toBe(101); expect(p.current?.index).toBe(106); expect(p.pct).toBe(5);
  });
  it('day 27 still belongs to the baseline, day 28 does not; one baseline session → more data', () => {
    const s = [sp(D0, 100), sp(add(D0, 27), 110), sp(add(D0, 28), 120), sp(add(D0, 35), 120)];
    const p = strengthProgress(S(s), add(D0, 36));
    expect(p.baseline?.index).toBe(105); expect(p.current?.index).toBe(120);
    expect(strengthProgress(S([sp(D0, 100), sp(add(D0, 28), 120), sp(add(D0, 35), 120)]), add(D0, 36)).status).toBe('more_data');
  });
  it('a belt-only index never gives a %', () => {
    const s = [sp(D0, 13), sp(add(D0, 7), 13), sp(add(D0, 30), 20), sp(add(D0, 40), 20)];
    expect(strengthProgress(S(s, 'bodyweight_plus'), add(D0, 41)).pct).toBeNull();
  });
  it('pre-load: 1 % per set capped at 6 %; 12 reps after 3 sets → 1 rep, after 5 → 2; measured drop (1 − 94/100) ÷ 3 = 2 %, capped at 3 %', () => {
    expect(preloadFactor(3)).toBeCloseTo(1.03, 9);
    expect(preloadFactor(10)).toBeCloseTo(1.06, 9);
    expect(expectedRepDrop(12, 3)).toBe(1); // 42 × 0.03 / 1.03 = 1.22
    expect(expectedRepDrop(12, 5)).toBe(2); // 42 × 0.05 / 1.05 = 2.0
    const m = (pre: number) => measuredDrop([{ index: 100, context: 'fresh' }, { index: 100, context: 'fresh' }, { index: pre, preload: 3, context: 'preloaded' }, { index: pre, preload: 3, context: 'preloaded' }]);
    expect(m(94) as number).toBeCloseTo(0.02, 9);
    expect(m(80)).toBe(0.03);
    expect(measuredDrop([{ index: 100, context: 'fresh' }, { index: 94, preload: 3, context: 'preloaded' }])).toBeNull();
  });
  it('fewer than 3 sessions in the latest context → the pre-loaded index is normalised: 97 × 1.03 = 99.91', () => {
    const s = [sp(D0, 100, { context: 'fresh', preload: 0 }), sp(add(D0, 7), 100, { context: 'fresh', preload: 0 }), sp(add(D0, 14), 97, { context: 'preloaded', preload: 3 })];
    const c = comparableSessions(s);
    expect(c.compare.basis).toBe('adjusted');
    expect(c.sessions[2].index).toBe(99.9);
    expect(c.sessions[2].indexRaw as number).toBeCloseTo(99.91, 9);
  });
});

// ====================================================================== 2. learning rules and comparability
describe('2a. rest.ts — one definition', () => {
  it('usual rest (owner 2026-11-25: the REAL usual): today\'s median of >= 3 rests, else the history; 150 s only when nothing is known', () => {
    expect(usualRestSec([], null)).toBe(150);
    expect(usualRestSec([200, 200], 100)).toBe(100); // only 2 today -> the history's 100, as it is
    expect(usualRestSec([200, 200, 220], 100)).toBe(200);
    expect(usualRestSec([100, 100, 100], 300)).toBe(100); // today's median 100, as it is
    expect(usualRestSec([null, 240], 240)).toBe(240);
  });
  it('short = strictly under 70 %: 104 s vs 150 → short, 105 s → not; 139 vs 200 → short, 140 → not; unknown → normal', () => {
    expect(isShortRest(104, 150)).toBe(true);
    expect(isShortRest(105, 150)).toBe(false);
    expect(isShortRest(104, 60)).toBe(false); // usual 60 s: short is under 42 s
    expect(isShortRest(41, 60)).toBe(true);
    expect(isShortRest(104, null)).toBe(true); // usual unknown -> 150 s assumed
    expect(isShortRest(139, 200)).toBe(true);
    expect(isShortRest(140, 200)).toBe(false);
    expect(isShortRest(null, 200)).toBe(false);
    expect(isShortRest(0, 200)).toBe(false);
  });
});

describe('2b. outcomes.ts — heldUp / outcomeAt / softenedFrom', () => {
  it('97 % boundary on a kg index: 97 vs 100 held, 96.9 lower; baseline = MEDIAN (100, 104 → 102: 99 held, 98.9 lower)', () => {
    expect(heldUp(sp('d', 97), [sp('a', 100), sp('b', 100)])).toBe(true);
    expect(heldUp(sp('d', 96.9), [sp('a', 100), sp('b', 100)])).toBe(false);
    expect(heldUp(sp('d', 99), [sp('a', 100), sp('b', 104)])).toBe(true); // 99/102 = 0.9706
    expect(heldUp(sp('d', 98.9), [sp('a', 100), sp('b', 104)])).toBe(false); // 0.9696
  });
  it('a reps index is compared on the Epley scale: 9 vs 10 → 1.3/1.3333 = 0.975 held (raw 0.90 would be "lower"); 8 → 0.95 lower', () => {
    const r = { indexKind: 'reps' as const };
    expect(heldUp(sp('d', 9, r), [sp('a', 10, r), sp('b', 10, r)])).toBe(true);
    expect(heldUp(sp('d', 8, r), [sp('a', 10, r), sp('b', 10, r)])).toBe(false);
  });
  it('not comparable → null: reserve ≥ 2 away, rest < 70 % of the baseline, another place in the session, another index kind, nothing to compare', () => {
    const base = [sp('a', 100, { topRir: 2, restAvgSec: 200, context: 'fresh' }), sp('b', 100, { topRir: 2, restAvgSec: 200, context: 'fresh' })];
    expect(heldUp(sp('d', 100, { topRir: 4 }), base)).toBeNull();
    expect(heldUp(sp('d', 100, { topRir: 3 }), base)).toBe(true);
    expect(heldUp(sp('d', 100, { topRir: null }), base)).toBe(true); // unknown reserve is compared
    expect(heldUp(sp('d', 100, { restAvgSec: 139 }), base)).toBeNull();
    expect(heldUp(sp('d', 100, { restAvgSec: 140 }), base)).toBe(true);
    expect(heldUp(sp('d', 100, { context: 'preloaded' }), base)).toBeNull();
    expect(heldUp(sp('d', 100, { context: 'preloaded' }), [base[0], sp('b', 100, { context: 'preloaded' })])).toBe(true);
    expect(heldUp(sp('d', 100), [sp('a', 100), sp('b', 10, { indexKind: 'reps' })])).toBeNull();
    expect(heldUp(sp('d', 100), [])).toBeNull();
    expect(heldUp(sp('d', 100, { representative: false }), base)).toBeNull();
  });
  // FORMULA CHOICE (rest.ts floor, CLAUDE.md §G) vs CLAUDE.md §N ("an average rest < 70 % of the baseline's"): the usual
  // rest is never taken below 150 s, so with a baseline average rest of 100 s a session with the SAME 100 s rest is
  // "shorter than 70 %" (100 < 105) and is skipped. On an exercise always rested ≤ 104 s nothing is ever learned.
  it('RESOLVED (owner 2026-11-25): the same 100 s rest as the baseline is comparable; under 70 % of it is not', () => {
    const base = [sp('a', 100, { restAvgSec: 100 }), sp('b', 100, { restAvgSec: 100 })];
    expect(heldUp(sp('d', 100, { restAvgSec: 100 }), base)).toBe(true);
    expect(heldUp(sp('d', 100, { restAvgSec: 69 }), base)).toBeNull();
  });
  it('outcomeAt: the median of the last ≤ 3 earlier sessions that were not under a warning; ≥ 2 needed', () => {
    const s = [sp('a', 200), sp('b', 90), sp('c', 110), sp('d', 100), sp('e', 97)];
    expect(outcomeAt(s, 4, () => false)).toBe(true); // last three 90, 110, 100 → median 100 → 97 % held (with 200 in: median 105 → lower)
    expect(outcomeAt(s, 4, (x) => x.date === 'd')).toBe(false); // 200, 90, 110 → median 110 → 0.882
    expect(outcomeAt([sp('a', 100), sp('b', 100), sp('c', 97)], 2, () => false)).toBe(true); // exactly 2
    expect(outcomeAt([sp('a', 100), sp('b', 97)], 1, () => false)).toBeNull(); // 1 is not enough
    expect(outcomeAt([sp('a', 100), sp('b', 100), sp('c', 97)], 2, (x) => x.date === 'b')).toBeNull();
    expect(outcomeAt([], 0, () => false)).toBeNull();
  });
  it('softened: ≥ 3 observations and ≥ 2 of the LAST 3 held up', () => {
    expect(softenedFrom([])).toBe(false);
    expect(softenedFrom([true, true])).toBe(false);
    expect(softenedFrom([true, true, false])).toBe(true);
    expect(softenedFrom([true, false, false])).toBe(false);
    expect(softenedFrom([false, false, false, true, true])).toBe(true);
    expect(softenedFrom([true, true, true, false, false])).toBe(false); // a later drop restores the limit
  });
});

// ---- callers: seven weeks Mon (pec deck + curls) / Tue (pull-ups) / Thu (legs); the last three Mondays are done against a
// recovery warning on the pec deck (Part 5) and with a kept forward warning on the curls → pull-ups (Part 8).
const NOW = new Date('2026-11-16T17:30:00Z');
const day = (d: string, exs: WorkoutExercise[]) => workout(d, exs, { startTime: '17:00', endTime: '18:00' });
const legs = (n = 3) => ex('leg_extension', times(n, () => set(50, 12, 2)), 'le');
const pullBw = (reps: number, n = 3) => ex('pull_up', times(n, () => set(0, reps, 2, { loadMode: 'bodyweight_plus' })), null, { variation: { loading: 'bodyweight', gripWidth: 'shoulder' } });
const OVERRIDE = { choice: { status: 'reconsider', reasonKind: 'recovery', followed: 'continued' } } as unknown as Partial<WorkoutExercise>;
function learningHistory(pecReps: number[], pullReps: number[]): Workout[] {
  const out: Workout[] = [];
  const n = 4 + pecReps.length;
  for (let i = 0; i < n; i++) {
    const mon = add('2026-11-16', -7 * (n - i));
    const k = i - 4;
    const pec = ex('pec_deck', times(3, () => set(40, k >= 0 ? pecReps[k] : 12, 2)), 'pd', k >= 0 ? OVERRIDE : {});
    const curls = ex('machine_biceps_curl', times(4, () => set(30, 10, 1)), 'bc', k >= 0 ? { forwardKept: { affectsExerciseId: 'pull_up', date: mon, muscle: 'biceps' } } : {});
    out.push(day(mon, [pec, curls]), day(add(mon, 1), [pullBw(k >= 0 ? pullReps[k] : 10)]), day(add(mon, 3), [legs()]));
  }
  return out;
}
describe('2c. the two callers use the same check', () => {
  // Pec deck index (RIR basis): 40 × (1 + 14/30) = 58.67 at 12 reps; 11 reps → 57.33 (97.7 % held); 10 reps → 56 (95.5 % lower).
  // Pull-ups (reps + RIR): 12 at 10 reps; 9 reps → 11: (1 + 11/30) ÷ (1 + 12/30) = 97.6 % held; 8 reps → 10: 95.2 % lower.
  it('Part 5 choiceOutcomes: overridden sessions 11, 11, 10 reps → 3 observations, 2 held → softened; 11, 10, 10 → not', () => {
    const d1 = data(learningHistory([11, 11, 10], [10, 10, 10]));
    const o1 = choiceOutcomes(d1, analyze(d1, NOW)).get('pec_deck');
    expect(o1).toMatchObject({ observations: 3, notLower: 2, softened: true });
    const d2 = data(learningHistory([11, 10, 10], [10, 10, 10]));
    expect(choiceOutcomes(d2, analyze(d2, NOW)).get('pec_deck')).toMatchObject({ observations: 3, notLower: 1, softened: false });
    const d3 = data(learningHistory([11, 11], [10, 10]));
    expect(choiceOutcomes(d3, analyze(d3, NOW)).get('pec_deck')).toMatchObject({ observations: 2, softened: false });
  });
  it('Part 8 keptOutcome: the next pull-up sessions 9, 9, 8 reps → 2 of 3 held → softened; 9, 8, 8 → not; two kept → nothing learned', () => {
    const d1 = data(learningHistory([12, 12, 12], [9, 9, 8]));
    expect(keptOutcome(d1, analyze(d1, NOW), 'machine_biceps_curl', 'pull_up')).toMatchObject({ observations: 3, notLower: 2, lower: 1, softened: true });
    const d2 = data(learningHistory([12, 12, 12], [9, 8, 8]));
    expect(keptOutcome(d2, analyze(d2, NOW), 'machine_biceps_curl', 'pull_up')).toMatchObject({ observations: 3, notLower: 1, softened: false });
    const d3 = data(learningHistory([12, 12], [9, 9]));
    expect(keptOutcome(d3, analyze(d3, NOW), 'machine_biceps_curl', 'pull_up')).toMatchObject({ observations: 2, softened: false });
  });
});

// ====================================================================== 3. usual days, week fit, forward checks, moves
describe('3a. usual days', () => {
  const wk = (start: string, offs: number[]) => ({ dates: offs.map((o) => add(start, o)) });
  const M = (k: number) => add('2026-10-05', 7 * k); // Mondays
  it('fewer than 3 weeks → unknown; Mon / Wed / Fri in 3 weeks → [1, 3, 5]', () => {
    expect(usualTrainingDays([wk(M(0), [0, 2, 4]), wk(M(1), [0, 2, 4])])).toBeNull();
    expect(usualTrainingDays([wk(M(0), [0, 2, 4]), wk(M(1), [0, 2, 4]), wk(M(2), [0, 2, 4])])).toEqual([1, 3, 5]);
  });
  it('a weekday in 2 of 4 weeks (50 %) is usual, in 1 of 4 is not', () => {
    expect(usualTrainingDays([wk(M(0), [0, 2]), wk(M(1), [0, 2]), wk(M(2), [0]), wk(M(3), [0, 5])])).toEqual([1, 3]);
  });
  it('alternating weeks (6 "usual" days > 3 per week + 1) → no fixed schedule', () => {
    expect(usualTrainingDays([wk(M(0), [0, 2, 4]), wk(M(1), [1, 3, 5]), wk(M(2), [0, 2, 4]), wk(M(3), [1, 3, 5])])).toBeNull();
  });
  // DOC WRONG: CLAUDE.md "Weekly targets" says usual days = "weekdays trained in ≥ half of the last ≤ 8 complete weeks";
  // §N and the code (weekPlan.ts:26, USUAL_LOOKBACK_WEEKS = 4) use the last 4. Four weeks of Mondays, then four weeks of
  // Wednesdays: by the "last 8" wording Mon (4/8) and Wed (4/8) → [1, 3]; the code → [3].
  it('DOC WRONG: only the last 4 weeks count, not the last 8', () => {
    const weeks = [...[0, 1, 2, 3].map((k) => wk(M(k), [0])), ...[4, 5, 6, 7].map((k) => wk(M(k), [2]))];
    expect(usualTrainingDays(weeks)).toEqual([3]);
  });
});

describe('3b. recovery-aware share of today (windows 24 / 36 / 48 / 60 h, 6 h tolerance)', () => {
  const F = { large: false, toleranceH: 6 };
  it('6 left, even share 3, next usual day in 2 days: 3 today (24 h window) + 3 then → fits', () => {
    expect(fitToday({ ...F, remaining: 6, cap: 6, base: 3, later: [2] })).toEqual({ share: 3, reachable: 6, shortBy: 0, raised: false });
  });
  it('tolerance boundary: a 30 h window (24 + 6 known today) leaves exactly 6 h at tomorrow\'s session → tomorrow still counts', () => {
    expect(fitToday({ ...F, remaining: 6, cap: 3, base: 3, later: [1], todayExtraH: 6 })).toMatchObject({ share: 3, shortBy: 0 });
  });
  // FORMULA CHOICE: 8 left, even share 4, next usual day TOMORROW. 4–6 sets → 36 h → tomorrow held; the search goes UP
  // first, so the answer is "all 8 today" although 3 today (24 h) + 5 tomorrow also completes the week with less in one session.
  it('RESOLVED (owner 2026-11-25): the share closest to the even one that finishes the week - 3 today + 5 tomorrow, not 8 today', () => {
    // 8 left, even share 4, tomorrow the only later day: 4 today -> 36 h -> tomorrow held; 5 -> 36 h -> held; 3 -> 24 h -> tomorrow takes 5.
    expect(fitToday({ ...F, remaining: 8, cap: 10, base: 4, later: [1] })).toMatchObject({ share: 3, shortBy: 0, raised: false });
  });
  // CODE WRONG AT HEAD a8dbca5 (weekPlan.ts:124), FIXED in the uncommitted working tree of 2026-11-25: the downward search
  // dropped `todayExtraH`. 12 left, cap 7, even share 6, next usual day tomorrow, +12 h known today (e.g. ≥ 2 failure sets).
  // Upward: 6 → 36 + 12 = 48 h, 7 → 48 + 12 = 60 h: tomorrow is held → 6, 7. Downward WITH the 12 h: 3 sets → 24 + 12 =
  // 36 h → 24 h < 36 − 6 → tomorrow is held as well → nothing beats 7 today (reachable 7, short by 5). HEAD forgot the
  // 12 h there, saw a 24 h window and answered { share: 3, reachable: 10, shortBy: 2 } ("3 today + 7 tomorrow").
  it('the smaller-share search keeps the hours already known to lengthen today\'s window (wrong at HEAD, fixed in the working tree)', () => {
    expect(fitToday({ ...F, remaining: 12, cap: 7, base: 6, later: [1], todayExtraH: 12 })).toEqual({ share: 7, reachable: 7, shortBy: 5, raised: true });
    // without the extra hours the smaller share is right: 3 today (24 h) + 7 tomorrow = 10 of 12
    expect(fitToday({ ...F, remaining: 12, cap: 7, base: 6, later: [1] })).toEqual({ share: 3, reachable: 10, shortBy: 2, raised: false });
  });
  // RISK → reproduced as arithmetic: sessions are assumed at the same time of day (gaps are multiples of 24 h) and every
  // window is a multiple of 12 h, so the hours left at an upcoming session are a multiple of 12: either ≤ 0 (nothing) or
  // ≥ 12 (a limit). "Less than 12 h = a tip" (CLAUDE.md §N) can never come from the hours; tips only come from softening.
  it('RISK: "6–12 h left = a tip" is unreachable — every hours-left value is a multiple of 12', () => {
    const lefts = new Set<number>();
    for (let sets = 0.5; sets <= 15; sets += 0.5) for (const large of [true, false]) for (const extra of [0, 12, 24, 36]) for (const days of [1, 2, 3, 4]) {
      lefts.add(sessionWindowH(sets, large, extra) - 24 * days);
    }
    expect([...lefts].filter((h) => h > 6 && h < 12)).toEqual([]);
    expect([...lefts].every((h) => h % 12 === 0)).toBe(true);
  });
});

// Four full weeks: Mon pec deck + curls, Tue pull-ups + rows (or a bench press), Thu legs + pec deck + pushdowns.
const pec = (n: number, rir = 2) => ex('pec_deck', times(n, () => set(40, 12, rir)), 'pd');
const curls = (n: number, rir = 1) => ex('machine_biceps_curl', times(n, () => set(30, 10, rir)), 'bc');
const rows = (n: number) => ex('seated_cable_row', times(n, () => set(50, 10, 2)), 'row');
const pushdown = (n: number) => ex('triceps_pushdown_rope', times(n, () => set(25, 12, 2)), 'tp');
const bench = (n: number) => ex('barbell_bench_press', times(n, () => set(60, 8, 2)));
const EQUIPMENT = [
  { id: 'pd', name: 'Pec deck', locationId: 'gym_a', exerciseIds: ['pec_deck'], photoIds: [], createdAt: '' },
  { id: 'bc', name: 'Curl machine', locationId: 'gym_a', exerciseIds: ['machine_biceps_curl'], photoIds: [], createdAt: '' },
  { id: 'row', name: 'Cable row', locationId: 'gym_a', exerciseIds: ['seated_cable_row'], photoIds: [], createdAt: '' },
  { id: 'le', name: 'Leg extension', locationId: 'gym_a', exerciseIds: ['leg_extension'], photoIds: [], createdAt: '' },
  { id: 'tp', name: 'Cable station', locationId: 'gym_a', exerciseIds: ['triceps_pushdown_rope'], photoIds: [], createdAt: '' },
] as unknown as AppData['equipment'];
const MONDAYS = ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'];
const usualWeeks = (tue: () => WorkoutExercise[] = () => [pullBw(8, 4), rows(3)]) =>
  MONDAYS.flatMap((m) => [day(m, [pec(4), curls(4)]), day(add(m, 1), tue()), day(add(m, 3), [legs(3), pec(3), pushdown(2)])]);
function setup(hist: Workout[], live: WorkoutExercise[] = [], extra: Partial<Workout> = {}) {
  const w = workout('2026-11-16', live, { startTime: '17:00', ...extra });
  const d = data([...hist, w], { equipment: EQUIPMENT });
  return { d, a: analyze(d, NOW), w };
}

describe('3c. forward checks (Monday → Tuesday, 24 h)', () => {
  it('3 curl sets → 24 h window, over by Tuesday → nothing; 4 sets → 36 h → 12 h left → a limit on Tuesday\'s pull-ups (biceps 0.5)', () => {
    const { d, a, w } = setup(usualWeeks());
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 3 })).toEqual([]);
    const f = forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ check: 'interference', severity: 'limit', date: '2026-11-17', muscle: 'biceps', affectsExerciseId: 'pull_up', hoursLeft: 12 });
  });
  it('no usual days (2 weeks of history) → no forward checks at all', () => {
    const { d, a, w } = setup(usualWeeks().slice(6));
    expect(forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 6 })).toEqual([]);
  });
  // CLAUDE.md §N, three categories: "Recovery limit (an open window before a session that trains the muscle DIRECTLY;
  // never softened by habits) · Next-session performance (interference; may become a tip)". Tuesday = bench press
  // (chest 1.0, a compound → high priority), chest week not met. 4 pec-deck sets on Monday → 36 h → 12 h left on Tuesday.
  // Both definitions apply; the code (sequence.ts:184–188) looks for the interference first and stops, so the finding is
  // "interference" and CAN be softened by "Keep today" habits. Expected by the doc: the recovery limit. Actual: interference.
  it('FIXED (third analysis): an open window before a session that trains the muscle directly is reported as a recovery limit', () => {
    const { d, a, w } = setup(usualWeeks(() => [bench(3)]));
    const f = forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'pec_deck', sets: 4 });
    expect(f[0]).toMatchObject({ severity: 'limit', date: '2026-11-17', muscle: 'chest', affectsExerciseId: 'barbell_bench_press', hoursLeft: 12 });
    expect(f[0].check).toBe('recovery');
  });
});

describe('3d. moves, pairs, usual set count', () => {
  const mv = (x: Partial<PlannedMove>): PlannedMove => ({ id: 'm', exerciseId: 'machine_biceps_curl', equipmentId: 'bc', sets: 4, fromDate: '2026-11-16', date: '2026-11-19', ...x } as PlannedMove);
  it('a new move of an exercise replaces its open one; the earlier list is untouched', () => {
    const before = [mv({ id: 'a' }), mv({ id: 'b', exerciseId: 'pec_deck' })];
    const after = addMoves(before, [mv({ id: 'c', date: '2026-11-20' })]);
    expect(after.map((m) => m.id)).toEqual(['b', 'c']);
    expect(before.map((m) => m.id)).toEqual(['a', 'b']);
  });
  it('a move stays open until the exercise is performed AFTER the day it was moved from (same day or warm-up only does not close it)', () => {
    const settings = (d: AppData) => ({ ...d, settings: { ...d.settings, plannedMoves: [mv({})] } });
    const sameDay = settings(data([day('2026-11-16', [curls(2)])]));
    expect(activeMoves(sameDay)).toHaveLength(1);
    const warm = settings(data([day('2026-11-19', [ex('machine_biceps_curl', [set(10, 10, null, { type: 'warmup' })], 'bc')])]));
    expect(activeMoves(warm)).toHaveLength(1);
    const done = settings(data([day('2026-11-19', [curls(1)])]));
    expect(activeMoves(done)).toHaveLength(0);
  });
  it('usual set count: median of the last ≤ 6 sessions; 3 left + 3 right = 3; unknown → 3', () => {
    expect(usualSetCount([], 'pec_deck')).toBe(3);
    expect(usualSetCount([2, 2, 2, 4, 4, 4, 5].map((n, i) => day(add(D0, i), [pec(n)])), 'pec_deck')).toBe(4); // last six 2,2,4,4,4,5 → median 4
    const sides = ex('cable_lateral_raise', [...times(3, () => set(5, 12, 2, { side: 'left' })), ...times(3, () => set(5, 12, 2, { side: 'right' }))], 'cl');
    expect(usualSetCount([day(D0, [sides])], 'cable_lateral_raise')).toBe(3);
  });
  it('pairs: adjacent in 5 of the last 6 sessions (83 %) → move together; 4 of 6 (67 % < 70 %) → not', () => {
    const hammer = () => ex('hammer_curl', times(3, () => set(14, 10, 1)), null);
    const mondays = (apart: number) => Array.from({ length: 6 }, (_, i) => add('2026-11-16', -7 * (6 - i))).flatMap((m, i) => [
      day(m, i < apart ? [curls(4), pec(4), hammer()] : [curls(4), hammer()]), day(add(m, 1), [legs()]), day(add(m, 3), [legs()])]);
    const ids = ['pec_deck', 'machine_biceps_curl', 'hammer_curl'];
    const live = workout('2026-11-16', [pec(4)], { startTime: '17:00' });
    const d5 = data([...mondays(1), live]);
    expect(movePartners(d5, analyze(d5, NOW), 'machine_biceps_curl', ids, '2026-11-17')).toEqual(['hammer_curl']);
    const d4 = data([...mondays(2), live]);
    expect(movePartners(d4, analyze(d4, NOW), 'machine_biceps_curl', ids, '2026-11-17')).toEqual([]);
  });
});

// ====================================================================== 4. optimality score
describe('4. optimality score', () => {
  const score = (o: Optimality) => [o.group, o.score] as const;
  it('unknown exercise → 5, less optimal', () => {
    const { d, a, w } = setup(usualWeeks(), [pec(4)]);
    expect(score(optimality({ data: d, analysis: a, workout: w, exerciseId: 'no_such_exercise' }))).toEqual(['less_optimal', 5]);
  });
  it('familiar, open, nothing against it → 100 suitable', () => {
    const { d, a, w } = setup(usualWeeks(), [pec(4)]);
    expect(score(optimality({ data: d, analysis: a, workout: w, exerciseId: 'pull_up', sets: 2 }))).toEqual(['suitable', 100]);
  });
  it('caps come first: a new machine exercise with no machine known → min(70, 80) = 70 → below 75 → less optimal, low confidence', () => {
    const { d, a, w } = setup(usualWeeks(), [pec(4)]);
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'seated_leg_curl' });
    expect(o.caps.map((c) => c.factor).sort()).toEqual(['new_exercise', 'unknown_machine']);
    expect(o.deductions).toEqual([]);
    expect(score(o)).toEqual(['less_optimal', 70]);
    expect(o.confidence).toBe('low');
  });
  it('no history at all → min(60 no history, 70 new, 90 no usual days) = 60', () => {
    const { d, a, w } = setup([], []);
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'pull_up', sets: 2 });
    expect(o.caps.map((c) => c.factor).sort()).toEqual(['new_exercise', 'no_history', 'no_usual_days']);
    expect(score(o)).toEqual(['less_optimal', 60]);
  });
  it('machine busy: 100 − 40 = 60 → less optimal', () => {
    const { d, a, w } = setup(usualWeeks(), [pec(4)], { busyEquipment: [{ equipmentId: 'le', at: '2026-11-16T17:20:00Z' }] });
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'leg_extension', equipmentId: 'le' });
    expect(o.deductions.map((x) => [x.factor, x.points])).toEqual([['machine_busy', 40]]);
    expect(score(o)).toEqual(['less_optimal', 60]);
  });
  it('a Part 8 limit → NOT TODAY, no number (4 curl sets before Tuesday\'s pull-ups)', () => {
    const { d, a, w } = setup(usualWeeks(), [pec(4)]);
    const o = optimality({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(score(o)).toEqual(['not_today', null]);
    expect(o.band).toBeNull(); expect(o.deductions).toEqual([]);
  });
  it('bands: 85 very good · 75–80 good · 50–70 less optimal · below 50 poor', () => {
    expect([100, 85, 80, 75, 70, 50, 45, 5].map(bandOf)).toEqual(['very_good', 'very_good', 'good', 'good', 'fair', 'fair', 'poor', 'poor']);
  });
  it('ranking: suitable → less optimal → not today; high → low; ties: more sessions, then the name, then the id', () => {
    const o = (exerciseId: string, group: Optimality['group'], sc: number | null, sessions: number) => ({ exerciseId, equipmentId: null, group, score: sc, sessions } as Optimality);
    const list = [o('nt', 'not_today', null, 99), o('lo90', 'less_optimal', 90, 9), o('s75', 'suitable', 75, 1), o('b', 'suitable', 90, 3), o('a', 'suitable', 90, 3), o('c', 'suitable', 90, 5), o('z', 'suitable', 95, 0)];
    const names: Record<string, string> = { a: 'Same', b: 'Same' };
    const ranked = rankOptions(list, (id) => names[id] ?? id).map((x) => x.exerciseId);
    expect(ranked).toEqual(['z', 'c', 'a', 'b', 's75', 'lo90', 'nt']);
    expect(rankOptions([...list].reverse(), (id) => names[id] ?? id).map((x) => x.exerciseId)).toEqual(ranked);
  });
});

// ====================================================================== 5. set-by-set offer and the weight mark
describe('5a. adaptRemaining (target 40 kg, 8–12 reps, RIR 1–2, step 2.5 kg)', () => {
  const P = (x: Record<string, unknown> = {}, n = 3) => ({
    sets: times(n, () => ({ weightKg: 40, repsMin: 8, repsMax: 12, rirMin: 1, rirMax: 2, restSec: null })),
    loadMode: 'total', minKg: null, maxKg: null, rest: { medianSec: null }, ...x,
  } as unknown as Prescription);
  const out = (r: ReturnType<typeof adaptRemaining>) => [r.change, r.sets[0]?.weightKg, r.sets[0]?.repsMin, r.sets[0]?.repsMax];
  it('12 reps with RIR 4 (= top of the RIR target + 2) → +2.5 kg for the 2 remaining sets; RIR 3 → no change', () => {
    const r = adaptRemaining(P(), [set(40, 12, 4)], 2.5);
    expect(out(r)).toEqual(['add_load', 42.5, 8, 12]); expect(r.sets).toHaveLength(2);
    expect(adaptRemaining(P(), [set(40, 12, 3)], 2.5).change).toBe('none');
    expect(adaptRemaining(P(), [set(40, 11, 4)], 2.5).change).toBe('none'); // not at the top
  });
  it('the EASY tap counts only in the training mode (easyTap)', () => {
    const easy = () => [set(40, 12, null, { effort: 'easy', feel: 'bit_easy' })];
    expect(adaptRemaining(P(), easy(), 2.5, { easyTap: true }).change).toBe('add_load');
    expect(adaptRemaining(P(), easy(), 2.5).change).toBe('none');
  });
  it('machine limits: at the stack\'s maximum → +2 reps instead; assisted → less help (20 → 15), at 0 or at the minimum → +2 reps', () => {
    expect(out(adaptRemaining(P({ maxKg: 40 }), [set(40, 12, 4)], 2.5))).toEqual(['add_reps', 40, 10, 14]);
    expect(out(adaptRemaining(P({ maxKg: 42.5 }), [set(40, 12, 4)], 2.5))).toEqual(['add_load', 42.5, 8, 12]);
    const as = (kg: number) => [set(kg, 12, 4, { loadMode: 'assisted' })];
    expect(out(adaptRemaining(P({ loadMode: 'assisted' }), as(20), 5))).toEqual(['add_load', 15, 8, 12]);
    expect(adaptRemaining(P({ loadMode: 'assisted' }), as(0), 5).change).toBe('add_reps');
    expect(adaptRemaining(P({ loadMode: 'assisted', minKg: 20 }), as(20), 5).change).toBe('add_reps');
  });
  it('technique broke at the limit → one step down 40 → 37.5; at the machine\'s minimum → 2 reps earlier (6–10); assisted → more help', () => {
    const broke = (x: Partial<WorkoutSet> = {}) => [set(40, 8, 0, { technique: 'compromised', ...x })];
    expect(out(adaptRemaining(P(), broke(), 2.5))).toEqual(['reduce', 37.5, 8, 12]);
    expect(out(adaptRemaining(P({ minKg: 40 }), broke(), 2.5))).toEqual(['reduce', 40, 6, 10]);
    expect(out(adaptRemaining(P({ loadMode: 'assisted' }), broke({ loadMode: 'assisted' }), 5))).toEqual(['reduce', 45, 8, 12]);
    // broken technique with reps in reserve on ONE set → no change
    expect(adaptRemaining(P(), [set(40, 8, 2, { technique: 'compromised' })], 2.5).change).toBe('none');
  });
  it('reps well under the range (≤ 8 − 2 = 6): one set → nothing yet; two sets after a normal rest → aim for 5–7', () => {
    expect(adaptRemaining(P(), [set(40, 6, null)], 2.5).change).toBe('defer');
    expect(adaptRemaining(P(), [set(40, 7, null)], 2.5).change).toBe('none'); // 7 is not "well under"
    expect(out(adaptRemaining(P(), [set(40, 6, null), set(40, 6, null, { restSecBefore: 180 })], 2.5))).toEqual(['reduce', 40, 5, 7]);
    expect(out(adaptRemaining(P(), [set(40, 6, null), set(40, 6, null)], 2.5))).toEqual(['reduce', 40, 5, 7]); // unknown rest = normal
  });
  it('the 70 % rest boundary: after 104 s (< 105 = 70 % of 150) the drop is the rest → no change; after 105 s → fewer reps', () => {
    expect(adaptRemaining(P(), [set(40, 6, null), set(40, 6, null, { restSecBefore: 104 })], 2.5).change).toBe('none');
    expect(adaptRemaining(P(), [set(40, 6, null), set(40, 6, null, { restSecBefore: 105 })], 2.5).change).toBe('reduce');
    // usual rest 240 s from the history → short below 168 s
    expect(adaptRemaining(P({ rest: { medianSec: 240 } }), [set(40, 6, null), set(40, 6, null, { restSecBefore: 167 })], 2.5).change).toBe('none');
    expect(adaptRemaining(P({ rest: { medianSec: 240 } }), [set(40, 6, null), set(40, 6, null, { restSecBefore: 168 })], 2.5).change).toBe('reduce');
  });
  // FORMULA CHOICE / RISK: rule presc_set_by_set says "≥ 2 sets well under the range AFTER A NORMAL REST". Only the LAST
  // set's rest is checked (prescription.ts, offCount): a set that fell short after a 60 s rest still counts as one of the two.
  it('RESOLVED (owner 2026-11-25): a set that fell short after a short rest is not one of the two', () => {
    // No history: usual rest 150 s assumed -> 60 s is short. Set 2 (60 s) does not count, set 3 (180 s) does -> one set -> keep the plan.
    const r = adaptRemaining(P({}, 4), [set(40, 10, null), set(40, 6, null, { restSecBefore: 60 }), set(40, 6, null, { restSecBefore: 180 })], 2.5);
    expect(r.change).toBe('defer');
    // Both after a normal rest -> two sets -> fewer reps.
    const r2 = adaptRemaining(P({}, 4), [set(40, 10, null), set(40, 6, null, { restSecBefore: 170 }), set(40, 6, null, { restSecBefore: 180 })], 2.5);
    expect(r2.change).toBe('reduce');
  });
  it('pain → never a change', () => {
    expect(adaptRemaining(P(), [set(40, 12, 4, { feel: 'pain' })], 2.5).change).toBe('none');
  });
});

// NOTE: the working tree of 2026-11-25 (uncommitted) changed this family while the audit ran: `nextSetsOffer` no longer
// offers a load step from the EASY tap or a logged RIR ("only real analysis"), and adds 'calc' / 'find_weight' for a
// target without a weight. CLAUDE.md §L / §P and rule presc_set_by_set still describe the committed behaviour
// ("EASY with reps at the top → one step up"). The tests below state what the working tree does, with the hand numbers.
describe('5b. the offer in the training mode and the weight mark', () => {
  const T = (x: Partial<ExerciseTarget> = {}): ExerciseTarget => ({ sets: 3, weightKg: 40, reps: [{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 8, max: 12 }], rir: [{ min: 1, max: 2 }], engine: 'presc-1', ...x });
  const done = (kg: number, reps: number, at: string, x: Partial<WorkoutSet> = {}) => set(kg, reps, null, { completedAt: at, ...x });
  /** `target: null` = no target at all. */
  const E = (sets: WorkoutSet[], target: ExerciseTarget | null = T(), x: Partial<WorkoutExercise> = {}) => ex('pec_deck', sets, 'pd', { ...(target ? { target } : {}), ...x });
  const easy = { effort: 'easy' as const, feel: 'bit_easy' as const };
  // DOC STALE vs working tree: §L "EASY with reps at the top → one step up within the machine's limits".
  it('DOC STALE: EASY at the top of the range no longer offers +2.5 kg (documented: it does)', () => {
    expect(nextSetsOffer(E([done(40, 12, '2026-11-16T17:05:00Z', easy)]), 2.5)).toBeNull();
  });
  // FORMULA CHOICE (working tree): 12 reps with a LOGGED RIR 4 (target 1–2). `adaptRemaining` still says add_load, the offer
  // drops it — but at the machine's maximum the same set DOES produce an offer ("+2 reps"). Too easy below the maximum →
  // nothing; too easy at the maximum → an offer.
  it('RESOLVED (third analysis): clearly too easy (logged RIR 4) gives no in-session offer anywhere — below the maximum, at it, or on bodyweight', () => {
    const e = E([done(40, 12, 't', { rir: 4 })]);
    expect(nextSetsOffer(e, 2.5)).toBeNull();
    expect(nextSetsOffer(e, 2.5, { maxKg: 40 })).toBeNull();
    const pu = ex('pull_up', [done(0, 12, 't', { rir: 4, loadMode: 'bodyweight_plus' })], null, { target: T({ weightKg: 0 }), variation: { loading: 'bodyweight' } });
    expect(nextSetsOffer(pu, 2.5)).toBeNull();
  });
  it('no offer: no target, an old target without RIR, nothing done, all sets done, GOOD at the top', () => {
    expect(nextSetsOffer(E([done(40, 6, 'a'), done(40, 6, 'b')], null), 2.5)).toBeNull();
    expect(nextSetsOffer(E([done(40, 6, 'a'), done(40, 6, 'b')], T({ rir: undefined })), 2.5)).toBeNull();
    expect(nextSetsOffer(E([]), 2.5)).toBeNull();
    expect(nextSetsOffer(E(times(3, () => done(40, 6, 't'))), 2.5)).toBeNull();
    expect(nextSetsOffer(E([done(40, 12, 't', { effort: 'appropriate', feel: 'just_right' })]), 2.5)).toBeNull();
  });
  it('two sets well under the range → offer 5–7 reps; Keep the plan → not asked again; Use → only the remaining set changes, no second offer', () => {
    const e = E([done(40, 6, '2026-11-16T17:05:00Z'), done(40, 6, '2026-11-16T17:09:00Z')]);
    const o = nextSetsOffer(e, 2.5);
    expect(o).toMatchObject({ change: 'reduce', weightKg: 40, reps: { min: 5, max: 7 } });
    expect(nextSetsOffer(keepOffer(e, o!), 2.5)).toBeNull();
    const used = applyOffer(e, o!, '2026-11-16T17:10:00Z');
    expect(used.target).toMatchObject({ weightKg: 40, sets: 3, adapted: { change: 'reduce', fromKg: 40 } });
    expect(used.target!.reps).toEqual([{ min: 8, max: 12 }, { min: 8, max: 12 }, { min: 5, max: 7 }]);
    expect(nextSetsOffer(used, 2.5)).toBeNull();
    expect(prescribedFor(used.target!, 2)).toMatchObject({ weightKg: 40, repsMin: 5, repsMax: 7, rirMin: 1, rirMax: 2 });
    expect(prescribedFor(used.target!, 1)).toMatchObject({ repsMin: 8, repsMax: 12 });
  });
  it('technique broke at the limit → offer one step down (40 → 37.5); Use → the target weight is 37.5, from 40', () => {
    const e = E([done(40, 8, '2026-11-16T17:05:00Z', { rir: 0, technique: 'compromised' })]);
    const o = nextSetsOffer(e, 2.5);
    expect(o).toMatchObject({ change: 'reduce', weightKg: 37.5 });
    expect(applyOffer(e, o!, '2026-11-16T17:06:00Z').target).toMatchObject({ weightKg: 37.5, adapted: { fromKg: 40 } });
    expect(nextSetsOffer(e, 2.5, { minKg: 40 })).toMatchObject({ change: 'reduce', weightKg: 40, reps: { min: 6, max: 10 } });
  });
  // Working tree only (not in CLAUDE.md yet): a target WITHOUT a weight. HARD tap = 0.5 reps left: 50 kg × 8 →
  // 50 × (1 + 8.5/30) = 64.17; for 8–12 reps (10) with 1–2 left (1.5): 64.17 ÷ (1 + 11.5/30) = 46.39 → down to the 2.5 step = 45.
  // To failure: 50 × (1 + 8/30) = 63.33 ÷ 1.3833 = 45.78 → 45. EASY at the top → a note without a number.
  it('calibrating (no weight in the target): the weight is calculated from a hard set; an easy set only gives a note', () => {
    const t = T({ weightKg: null });
    const hard = nextSetsOffer(E([done(50, 8, 't', { effort: 'near_max', feel: 'hard_good' })], t), 2.5);
    expect(hard).toMatchObject({ change: 'calc', weightKg: 45, reps: null });
    expect(nextSetsOffer(E([done(50, 8, 't', { failure: 'muscular' })], t), 2.5)).toMatchObject({ change: 'calc', weightKg: 45 });
    expect(nextSetsOffer(E([done(50, 8, 't', { effort: 'near_max' })], t), 2.5, { maxKg: 40 })).toMatchObject({ change: 'calc', weightKg: 40 });
    const e = E([done(20, 12, 't', easy)], t);
    const note = nextSetsOffer(e, 2.5);
    expect(note).toMatchObject({ change: 'find_weight', weightKg: null });
    expect(applyOffer(e, note!, 'u')).toBe(e); // a note changes nothing
    expect(nextSetsOffer(E([done(20, 10, 't', { effort: 'appropriate' })], t), 2.5)).toBeNull();
  });
  // CODE WRONG (minor, liveFlow.ts applyOffer): the rep list "the last entry repeats" can be SHORTER than the sets done
  // (a target with one rep entry, or more sets than the prescription had). `t.reps.slice(0, n)` then keeps fewer than n
  // entries and the offer's range lands on a set that is ALREADY DONE: target 3 × 8–12 stored as one entry, 2 sets done,
  // Use "5–7" → reps = [8–12, 5–7] → set 2 (done, prescribed 8–12) now reads 5–7. Expected: set 2 stays 8–12, set 3 = 5–7.
  it('FIXED (third analysis): Use after n sets must not change the rep range of sets already done (short rep list)', () => {
    const e = E([done(40, 6, '2026-11-16T17:05:00Z'), done(40, 6, '2026-11-16T17:09:00Z')], T({ reps: [{ min: 8, max: 12 }] }));
    const used = applyOffer(e, nextSetsOffer(e, 2.5)!, '2026-11-16T17:10:00Z');
    expect(prescribedFor(used.target!, 2)).toMatchObject({ repsMin: 5, repsMax: 7 });
    expect(prescribedFor(used.target!, 1)).toMatchObject({ repsMin: 8, repsMax: 12 });
  });
  it('weight mark: smart (differs from last time / confirms it / changed with Use), copied (no target), none (typed or edited by the owner)', () => {
    const last = E([done(40, 12, 'a'), done(40, 12, 'b')], null);
    expect(weightSource(E([], T({ weightKg: 42.5 })), last, 42.5)).toBe('adjusted');
    expect(weightSource(E([], T({ weightKg: 40 })), last, 40)).toBe('kept');
    expect(weightSource(E([], T({ weightKg: 42.5 })), last, 40)).toBe('copied'); // last time's weight, the plan declined
    expect(weightSource(E([], null), last, 40)).toBe('copied');
    expect(weightSource(E([], T({ weightKg: 42.5 })), last, 45)).toBeNull();
    expect(weightSource(E([], T({ weightKg: 42.5, edited: true })), last, 42.5)).toBeNull();
    expect(weightSource(E([], T({ weightKg: 40, adapted: { change: 'reduce', fromKg: 42.5, why: '', at: 't' } })), last, 40)).toBe('adjusted');
    expect(weightSource(E([], T()), last, null)).toBeNull();
    expect(weightSource(E([done(37.5, 12, 'c')], null), last, 37.5)).toBe('session');
    expect(weightSource(E([], null), null, 40)).toBeNull();
  });
  // RISK → reproduced: with a target and NO earlier session the mark is "kept" ("same as last time") although there is no last time.
  it('RISK: a target without any earlier session is marked "kept" (there is no "last time" to be the same as)', () => {
    expect(weightSource(E([], T({ weightKg: 40 })), null, 40)).toBe('adjusted'); // no last time → never "same as last time"
  });
});

// ====================================================================== 2d. one result counted twice
describe('2d. Part 8 learning counts a result once per kept warning, not once per session', () => {
  // CODE WRONG (sequence.ts keptOutcome, the loop over `kept`): every kept record looks for the affected exercise's first
  // session within 2 days, so two kept records (curls kept on Monday AND on Tuesday) both find Wednesday's pull-ups.
  // Two weeks like that = 2 real pull-up results (9 reps: 11 vs 12 → 97.6 % held; 10 reps: held) but 4 observations →
  // "3 observations, softened". Rule: ≥ 3 COMPARABLE RESULTS are needed → with 2 results nothing is learned.
  it('FIXED (third analysis): two real results must not become three observations', () => {
    const curlsK = (kept?: string) => ex('machine_biceps_curl', times(4, () => set(30, 10, 1)), 'bc', kept ? { forwardKept: { affectsExerciseId: 'pull_up', date: kept, muscle: 'biceps' } } : {});
    const ws: Workout[] = [];
    for (let i = 0; i < 6; i++) {
      const mon = add('2026-11-16', -7 * (6 - i));
      const k = i >= 4;
      ws.push(day(mon, [curlsK(k ? mon : undefined)]), day(add(mon, 1), [curlsK(k ? add(mon, 1) : undefined)]), day(add(mon, 2), [pullBw(i === 4 ? 9 : 10)]));
    }
    const d = data(ws);
    const o = keptOutcome(d, analyze(d, NOW), 'machine_biceps_curl', 'pull_up');
    expect(o.observations).toBe(2);
    expect(o.softened).toBe(false);
  });
});
