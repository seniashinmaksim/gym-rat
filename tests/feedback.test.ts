/**
 * Per-set feedback (feel / effort / weight accuracy / technique / pain) and the smarter
 * progression rules built on it. All data is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { feelPatch, withCorrections } from '../src/domain/feedback';
import { buildDraft, parseImportJson, workoutToExport } from '../src/domain/importer';
import { adviceFor, buildProgression, classifyTrend, loadMap, loadMapNote, restInsight, sessionPerf, type SessionPerf } from '../src/domain/progression';
import { assessSet } from '../src/domain/quality';
import { weeklyReport, weeklySummary } from '../src/domain/reports';
import { buildRegistry } from '../src/domain/registry';
import type { SetFeel, Workout, WorkoutSet } from '../src/domain/types';
import { computeVolume } from '../src/domain/volume';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);
const fb = (s: WorkoutSet, f: SetFeel): WorkoutSet => ({ ...s, ...feelPatch(s, f) });
const q = (s: WorkoutSet) => assessSet(s, DEFAULT_QUALITY);
const prog = (ws: Workout[]) => buildProgression(ws, reg, [], [], 2, '2026-11-21')[0];
const inc = (d: string, sets: WorkoutSet[], extra: Partial<Workout> = {}) => workout(d, [ex('incline_dumbbell_press', sets, null, { variation: { benchAngleDeg: 30 } })], extra);
const many = (n: number, w: number, reps: number, rir: number | null, f?: SetFeel) => Array.from({ length: n }, () => (f ? fb(set(w, reps, rir), f) : set(w, reps, rir)));

describe('saving feedback', () => {
  it('1. a set marked Too easy is saved with its three dimensions; weight, reps and RIR untouched', () => {
    const s = fb(set(20, 12, null), 'too_easy');
    expect(s).toMatchObject({ feel: 'too_easy', effort: 'very_easy', weightAccuracy: 'correct', weightKg: 20, reps: 12, rir: null });
    expect(s.technique).toBeUndefined();
  });
  it('7. RIR stays separate: "Just right" without RIR keeps RIR unknown; an estimate is only a label', () => {
    const s = fb(set(25, 10, null), 'just_right');
    expect(s.rir).toBeNull();
    const a = q(s);
    expect(a.estimated).toBe(true);
    expect(a.reasons.join(' ')).toMatch(/estimate/);
    // a logged RIR always wins over the feel
    const logged = fb(set(25, 10, 4), 'just_right');
    expect(q(logged).credit).toBe(0.6);
    expect(q(logged).estimated).toBe(false);
  });
  it('8. missing feedback does not invalidate a set', () => {
    const a = q(set(25, 10, 2));
    expect(a.credit).toBe(1);
    expect(a.status).toBe('good');
    expect(q(set(25, 10, null)).status).toBe('uncertain');
  });
  it('9. pain is a separate flag with area and note, and never a high-confidence set', () => {
    const s = { ...fb(set(25, 10, 2), 'pain'), pain: { area: 'Shoulder', note: 'sharp at the bottom' } };
    expect(s.feel).toBe('pain');
    expect(s.pain).toEqual({ area: 'Shoulder', note: 'sharp at the bottom' });
    const a = q(s);
    expect(a.status).toBe('pain');
    expect(a.uncertain).toBe(true);
  });
  it('tapping the chosen feel again clears all feedback', () => {
    const s = fb(set(25, 10, 2), 'too_heavy_form');
    expect({ ...s, ...feelPatch(s, 'too_heavy_form') }).toMatchObject({ feel: undefined, effort: undefined, technique: undefined });
  });
});

describe('effect on volume', () => {
  it('3. a normal challenging set gets normal credit', () => {
    expect(q(fb(set(25, 10, 2), 'just_right'))).toMatchObject({ credit: 1, status: 'good' });
  });
  it('4. very hard with good technique is not downgraded', () => {
    expect(q(fb(set(25, 10, 0), 'hard_good'))).toMatchObject({ credit: 1, status: 'good' });
    expect(q(fb(set(25, 10, null), 'hard_good'))).toMatchObject({ credit: 1, status: 'good' });
  });
  it('5/6. compromised technique is flagged and distinguishable from a heavy clean set', () => {
    const clean = q(fb(set(30, 8, 0), 'hard_good'));
    const broken = q(fb(set(30, 8, 0), 'too_heavy_form'));
    expect(broken.status).toBe('compromised');
    expect(broken.credit).toBe(DEFAULT_QUALITY.compromisedTechniqueCredit);
    expect(clean.status).toBe('good');
    expect(clean.credit).toBe(1);
  });
  it('too easy without RIR counts as a low-effort set (estimated RIR 5+ through the RIR table)', () => {
    expect(q(fb(set(20, 12, null), 'too_easy'))).toMatchObject({ credit: 0.3, status: 'easy', estimated: true });
    expect(q(fb(set(20, 12, null), 'bit_easy'))).toMatchObject({ credit: 0.6, status: 'easy' });
  });
  it('can be switched off: without the feel estimate, no-RIR sets use the provisional 0.75', () => {
    expect(assessSet(fb(set(20, 12, null), 'too_easy'), { ...DEFAULT_QUALITY, useFeelWhenNoRir: false }).credit).toBe(0.75);
  });
  it('per muscle: raw count unchanged, statuses counted separately', () => {
    const w = inc('2026-11-20', [fb(set(25, 10, 2), 'just_right'), fb(set(25, 10, 1), 'hard_good'), fb(set(20, 12, null), 'too_easy')]);
    const v = computeVolume([w], reg, DEFAULT_QUALITY);
    expect(v.muscles.chest.rawWorkingSets).toBe(3);
    expect(v.muscles.chest.status).toMatchObject({ good: 2, easy: 1, compromised: 0 });
    expect(v.muscles.chest.effective).toBe(2.3);
  });
  it('the weekly remaining sets reflect the feedback', () => {
    const now = new Date('2026-11-20T20:00:00Z');
    const good = analyze(data([inc('2026-11-20', many(3, 25, 10, 2, 'just_right'))]), now).muscles.find((m) => m.muscle === 'chest')!;
    const easy = analyze(data([inc('2026-11-20', many(3, 20, 12, null, 'too_easy'))]), now).muscles.find((m) => m.muscle === 'chest')!;
    expect(good.completed).toBe(3);
    expect(easy.completed).toBe(0.9);
    expect(easy.remainingToPreferred).toBeGreaterThan(good.remainingToPreferred);
  });
});

describe('effect on progression', () => {
  it('2. an accidental light weight is not read as strength progression', () => {
    const base = [inc('2026-11-03', many(3, 25, 10, 2)), inc('2026-11-06', many(3, 25, 10, 2)), inc('2026-11-10', many(3, 25, 10, 2))];
    const oops = inc('2026-11-13', many(3, 20, 12, 3, 'wrong_light'));
    const p = prog([...base, oops]);
    const perf = p.sessions[p.sessions.length - 1];
    expect(perf.representative).toBe(false);
    expect(perf.index).toBeNull();
    expect(perf.sets.map((s) => s.weight)).toEqual([20, 20, 20]); // actual performance kept
    expect(p.next.action).toBe('hold');
    expect(p.next.weight).toBe(25);
    expect(p.next.reason).toMatch(/not used as a benchmark/);
  });
  it('Scenario B: just right at RIR 2 is a normal benchmark', () => {
    const perf = sessionPerf(inc('2026-11-13', [fb(set(25, 10, 2), 'just_right')]), inc('2026-11-13', [fb(set(25, 10, 2), 'just_right')]).exercises[0])!;
    expect(perf.representative).toBe(true);
    expect(perf.index).not.toBeNull();
  });
  it('Scenario C: too heavy with broken technique → reduce one step, with a reason', () => {
    const p = prog([inc('2026-11-10', many(3, 25, 10, 2)), inc('2026-11-13', many(3, 30, 8, 0, 'too_heavy_form'))]);
    expect(p.next.action).toBe('reduce');
    expect(p.next.weight).toBe(28);
    expect(p.next.reason).toMatch(/Technique broke down on 3 of 3/);
    expect(p.sessions[1].index).toBeNull();
  });
  it('one broken attempt at a heavier load keeps the clean working weight (no reduction below it)', () => {
    const p = prog([inc('2026-11-10', many(3, 25, 10, 2)), inc('2026-11-13', [...many(3, 25, 10, 1, 'just_right'), fb(set(27.5, 8, 0), 'too_heavy_form')])]);
    expect(p.next.action).toBe('hold');
    expect(p.next.weight).toBe(25);
    expect(p.next.reason).toMatch(/27.5 kg broke your technique on 1 set/);
  });
  it('reduces to the last clean load when most sets broke down at a heavier one', () => {
    const p = prog([inc('2026-11-13', [fb(set(25, 10, 1), 'just_right'), ...many(2, 27.5, 7, 0, 'too_heavy_form')])]);
    expect(p.next.action).toBe('reduce');
    expect(p.next.weight).toBe(25);
  });
  it('never drops more than about one step, even if the last clean load was far lower', () => {
    const p = prog([inc('2026-11-13', [fb(set(15, 12, 2), 'just_right'), ...many(2, 25, 8, 0, 'too_heavy_form')])]);
    expect(p.next).toMatchObject({ action: 'reduce', weight: 23 });
  });
  it('pain in the last session blocks an increase', () => {
    const top = (d: string) => inc(d, many(3, 25, 12, 1));
    const p = prog([top('2026-11-06'), top('2026-11-10'), inc('2026-11-13', many(3, 25, 12, 1, 'pain'))]);
    expect(p.next.action).toBe('hold');
    expect(p.next.reason).toMatch(/no increase after a session with pain/);
  });
  it('"a little too easy" alone does not justify a one-session increase', () => {
    expect(prog([inc('2026-11-13', many(3, 25, 12, null, 'bit_easy'))]).next.action).toBe('hold');
  });
  it('a live session finished on another date still counts as finished for the audit', () => {
    const w = inc('2026-11-10', [set(45, 12, 1)], { source: 'live', endTime: null, finishedAt: '2026-11-21T08:00:00Z' });
    const ed = { ...w, exercises: [{ ...w.exercises[0], sets: [{ ...w.exercises[0].sets[0], reps: 10 }] }] };
    expect(withCorrections(w, ed, 't').exercises[0].sets[0].corrections?.[0]).toMatchObject({ field: 'reps', from: 12, to: 10 });
  });
  it('correction times are kept across autosaves when unchanged', () => {
    const w = inc('2026-11-10', [set(45, 12, 1)], { endTime: '19:00' });
    const ed = { ...w, exercises: [{ ...w.exercises[0], sets: [{ ...w.exercises[0].sets[0], reps: 10 }] }] };
    const t1 = withCorrections(w, ed, 't1');
    expect(withCorrections(w, t1, 't2').exercises[0].sets[0].corrections?.[0].at).toBe('t1');
  });
  it('Scenario D: very hard but clean sets are never a reason to reduce', () => {
    const p = prog([inc('2026-11-10', many(3, 25, 10, 1)), inc('2026-11-13', many(3, 25, 10, 0, 'hard_good'))]);
    expect(p.next.action).not.toBe('reduce');
  });
  it('too easy at the top of the range → increase after one session (smallest increment)', () => {
    const p = prog([inc('2026-11-13', many(3, 20, 12, null, 'too_easy'))]);
    expect(p.next.action).toBe('increase');
    expect(p.next.weight).toBe(22);
  });
  it('feel counts as recorded effort for the two-session rule', () => {
    const p = prog([inc('2026-11-10', many(3, 25, 12, null, 'just_right')), inc('2026-11-13', many(3, 25, 12, null, 'just_right'))]);
    expect(p.next.action).toBe('increase');
    expect(adviceFor(p).kind).toBe('increase');
    expect(adviceFor(p).text).toMatch(/25 → 27 kg/);
  });
  it('one unusually good set never triggers an increase', () => {
    const p = prog([inc('2026-11-13', [fb(set(25, 12, 2), 'just_right'), set(25, 9, 1), set(25, 8, 0)])]);
    expect(p.next.action).toBe('hold');
  });
  it('pain is flagged in the recommendation and never proves progress', () => {
    const p = prog([inc('2026-11-10', many(3, 25, 10, 2)), inc('2026-11-13', [{ ...fb(set(27, 10, 2), 'pain'), pain: { area: 'Shoulder' } }])]);
    expect(p.next.reason).toMatch(/Pain/);
    expect(p.sessions[1].representative).toBe(false);
  });
});

describe('rest, plateaus and calibration', () => {
  it('10. rest duration is kept per set and used to explain a rep drop', () => {
    const r = (reps: number, rest: number | null) => set(25, reps, 1, { restSecBefore: rest });
    const ws = [inc('2026-11-03', [r(10, null), r(10, 120), r(10, 120)]), inc('2026-11-06', [r(10, null), r(10, 120), r(9, 120)]), inc('2026-11-10', [r(10, null), r(10, 120), r(7, 60)])];
    const p = prog(ws);
    expect(p.sessions[2].sets.map((s) => s.restSec)).toEqual([null, 120, 60]);
    expect(restInsight(p.sessions)).toMatch(/shorter rest \(60 s vs your usual ~120 s\)/);
    expect(p.next.action).not.toBe('reduce');
  });
  it('a plateau needs ≥ 4 comparable sessions over ≥ 3 weeks; fatigued sessions are set aside', () => {
    const mk = (d: string, reps: number, fatigued = false): SessionPerf => ({ ...sessionPerf(inc(d, [set(25, reps, 2)]), inc(d, [set(25, reps, 2)]).exercises[0])!, fatigued });
    const flat = [mk('2026-10-20', 10), mk('2026-10-27', 11), mk('2026-11-03', 10), mk('2026-11-10', 10), mk('2026-11-17', 10)];
    expect(classifyTrend(flat, '2026-11-21').cls).toBe('plateau');
    // one bad, fatigued day does not create a plateau on its own
    const oneBad = [mk('2026-10-27', 10), mk('2026-11-03', 11), mk('2026-11-10', 12), mk('2026-11-17', 9, true)];
    expect(classifyTrend(oneBad, '2026-11-21').cls).not.toBe('plateau');
  });
  it('adviceFor gives exactly one of the five recommendations', () => {
    expect(adviceFor(prog([inc('2026-11-13', many(3, 25, 9, 2))])).kind).toBe('not_enough_data');
  });
  it('learns which loads feel right, too easy or too heavy (per exercise × equipment × configuration)', () => {
    const p = prog([inc('2026-11-03', many(3, 22, 12, null, 'too_easy')), inc('2026-11-06', many(3, 25, 10, 2, 'just_right')), inc('2026-11-10', many(2, 30, 7, 0, 'too_heavy_form'))]);
    const m = loadMap(p);
    expect(m.map((x) => [x.weight, x.verdict])).toEqual([[22, 'too_easy'], [25, 'right'], [30, 'too_heavy']]);
    expect(loadMapNote(m)).toMatch(/25 kg/);
  });
});

describe('corrections and old data', () => {
  it('11. corrections to a finished workout keep the original values', () => {
    const original = inc('2026-11-13', [set(45, 12, 1), set(45, 12, 1)], { endTime: '19:00' });
    const s0 = original.exercises[0].sets[0];
    const edited: Workout = { ...original, exercises: [{ ...original.exercises[0], sets: [{ ...s0, weightKg: 50 }] }] };
    const out = withCorrections(original, edited, '2026-11-14T10:00:00Z', () => 'Incline dumbbell press');
    expect(out.exercises[0].sets[0].corrections).toEqual([{ at: '2026-11-14T10:00:00Z', field: 'weightKg', from: 45, to: 50 }]);
    expect(out.audit?.[0].note).toMatch(/Removed working set from Incline dumbbell press: 45 kg × 12/);
    // repeated saves don't duplicate; reverting leaves no trace
    const again = withCorrections(original, out, '2026-11-14T10:01:00Z');
    expect(again.exercises[0].sets[0].corrections?.length).toBe(1);
    const reverted = withCorrections(original, { ...original }, '2026-11-14T10:02:00Z');
    expect(reverted.exercises[0].sets[0].corrections).toBeUndefined();
  });
  it('live sessions are not audited while being logged', () => {
    const live = inc('2026-11-21', [set(45, 12, 1)], { source: 'live', endTime: null });
    const edited = { ...live, exercises: [{ ...live.exercises[0], sets: [{ ...live.exercises[0].sets[0], reps: 10 }] }] };
    expect(withCorrections(live, edited, 'x').exercises[0].sets[0].corrections).toBeUndefined();
  });
  it('12. records without feedback (older data) still work everywhere and nothing is invented', () => {
    const old = inc('2026-11-13', many(3, 25, 10, 2));
    const p = prog([old]);
    expect(p.sessions[0].representative).toBe(true);
    expect(p.sessions[0].sets.every((s) => s.feel === undefined && s.benchmark)).toBe(true);
    expect(workoutToExport(old).exercises[0].sets.every((s) => !('feel' in s))).toBe(true);
    expect(q(set(25, 10, 2, { techniqueOk: false })).status).toBe('compromised');
  });
  it('import v1.2 keeps feedback; v1.0/1.1 still parse', async () => {
    const json = { schema_version: '1.2', workouts: [{ date: '2026-11-13', exercises: [{ exercise_id: 'incline_dumbbell_press', sets: [
      { weight_kg: 20, reps: 12, feel: 'wrong_light', intended_weight_kg: 25 },
      { weight_kg: 25, reps: 10, rir: 2, feel: 'just_right' },
      { weight_kg: 25, reps: 8, feel: 'pain', pain_area: 'Shoulder', pain_note: 'pinch at the bottom' },
      { weight_kg: 25, reps: 9, effort: 'hard', technique: 'slightly_degraded', weight_accuracy: 'correct' },
    ] }] }] };
    const r = parseImportJson(JSON.stringify(json));
    expect(r.errors).toEqual([]);
    const d = await buildDraft(r.workouts[0], data([]), reg);
    const [a, b, c, e] = d.workout.exercises[0].sets;
    expect(a).toMatchObject({ feel: 'wrong_light', weightAccuracy: 'too_light', intendedWeightKg: 25, rir: null });
    expect(b).toMatchObject({ feel: 'just_right', effort: 'appropriate', technique: 'good', rir: 2 });
    expect(c).toMatchObject({ feel: 'pain', pain: { area: 'Shoulder', note: 'pinch at the bottom' } });
    expect(e).toMatchObject({ effort: 'hard', technique: 'slightly_degraded', weightAccuracy: 'correct' });
    expect(e.feel).toBeUndefined();
    const back = workoutToExport(d.workout);
    expect(back.exercises[0].sets[0]).toMatchObject({ feel: 'wrong_light', intended_weight_kg: 25 });
    expect(back.exercises[0].sets[2]).toMatchObject({ pain_area: 'Shoulder', pain_note: 'pinch at the bottom' });
    expect(parseImportJson(JSON.stringify({ schema_version: '1.0', workouts: [{ date: '2026-11-13', exercises: [{ exercise_id: 'pec_deck', sets: [{ weight_kg: 40, reps: 12 }] }] }] })).ok).toBe(true);
  });
});

describe('weekly summary', () => {
  it('answers: muscles behind (+ sets short), progressing, increase / keep-or-reduce, plateaus', () => {
    const ws = [
      inc('2026-11-10', many(3, 25, 12, null, 'just_right')),
      inc('2026-11-13', many(3, 25, 12, null, 'just_right')),
      workout('2026-11-12', [ex('pec_deck', many(3, 50, 10, 0, 'too_heavy_form'), 'pd')]),
    ];
    const a = analyze(data(ws), new Date('2026-11-16T09:00:00Z'));
    const bucket = a.weeks.find((w) => w.range.start === '2026-11-09')!;
    const s = weeklySummary(weeklyReport(bucket, a, data(ws)), a);
    expect(s.increase.join()).toMatch(/Incline dumbbell press .*→ 27 kg/);
    expect(s.reduce.join()).toMatch(/Pec deck .*→ 45 kg/);
    expect(s.behind.find((b) => b.muscle === 'chest')!.left).toBeGreaterThan(0);
    expect(s.behind.some((b) => b.muscle === 'lats')).toBe(true);
  });
});
