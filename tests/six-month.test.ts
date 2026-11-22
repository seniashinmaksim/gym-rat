/**
 * SIX-MONTH QA SIMULATION — the app's analytics run against 26 weeks of realistic synthetic training
 * and are compared with INDEPENDENT reference calculations (tests/sim/reference.ts).
 * Deterministic: fixed seed, fixed clock (every analysis gets an explicit `now`), timezone UTC.
 * Writes test-artifacts/six-month-audit/six-month-report.{json,md} (git-ignored).
 */
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { analyze, type Analysis } from '../src/domain/analysis';
import { prescribe } from '../src/domain/prescription';
import { strengthProgress, hypertrophyAssessment, periodStats } from '../src/domain/baseline';
import { bodyLoadSessions, bodyWeightForSession, rollingAverage } from '../src/domain/bodyweight';
import { summarizeSession } from '../src/domain/sessionSummary';
import { computeVolume } from '../src/domain/volume';
import { withCorrections } from '../src/domain/feedback';
import type { ProgressionSeries } from '../src/domain/progression';
import type { AppData } from '../src/domain/appdata';
import type { Workout } from '../src/domain/types';
import { asOf, dayAdd, generateSixMonths, MISSED, SIM_END, SIM_START, SIM_WEEKS, weekStartOf } from './sim/sixMonth';
import { REF_COEF, ref7dAverage, refBodyBefore, refEffective, refIndex, refMonday, refProgressPct, refRawSets, refTonnage } from './sim/reference';

const { data, meta } = generateSixMonths();
const at = (date: string, time = '20:00') => new Date(`${date}T${time}:00Z`);
const sunday = (week: number) => dayAdd(weekStartOf(week), 6);
/** What the app knew at `date time`: same-day workouts only if they had started by then. */
const known = (d: AppData, date: string, time: string): AppData => { const x = asOf(d, date); return { ...x, workouts: x.workouts.filter((w) => w.date < date || (w.startTime ?? '00:00') <= time) }; };
const run = (d: AppData, date: string, time = '20:00') => analyze(known(d, date, time), at(date, time));
const series = (a: Analysis, pred: (p: ProgressionSeries) => boolean) => a.progression.filter(pred);
const one = (a: Analysis, pred: (p: ProgressionSeries) => boolean) => { const s = series(a, pred); expect(s.length, 'exactly one matching history').toBe(1); return s[0]; };
const MUSCLES = [...new Set(Object.values(REF_COEF).flatMap((c) => Object.keys(c)))];
const inWeek = (week: number) => data.workouts.filter((w) => w.date >= weekStartOf(week) && w.date <= sunday(week));

// Report collected while testing (numbers only — every value was compared with the reference).
const report: Record<string, unknown> = { seed: 20261121, period: `${SIM_START} → ${SIM_END}`, weeks: SIM_WEEKS };
const checks: { id: string; input: string; expected: string; actual: string; diff: string; result: 'PASS' | 'FAIL' }[] = [];
function check(id: string, input: string, expected: number, actual: number, tol: number) {
  const diff = Math.abs(expected - actual);
  checks.push({ id, input, expected: String(+expected.toFixed(3)), actual: String(actual), diff: diff.toFixed(3), result: diff <= tol ? 'PASS' : 'FAIL' });
  expect(diff, `${id}: ${input} — expected ${expected}, app ${actual}`).toBeLessThanOrEqual(tol);
}

afterAll(() => {
  const out = path.join('test-artifacts', 'six-month-audit');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'six-month-report.json'), JSON.stringify({ ...report, checks }, null, 2));
  const fails = checks.filter((c) => c.result === 'FAIL').length;
  const md = [
    '# Six-month synthetic simulation — app vs independent reference', '',
    `Checks: ${checks.length}, failed: ${fails}`, '',
    '| Check | Input | Expected | Actual | Diff | Result |', '|---|---|---|---|---|---|',
    ...checks.map((c) => `| ${c.id} | ${c.input} | ${c.expected} | ${c.actual} | ${c.diff} | ${c.result} |`),
  ].join('\n');
  fs.writeFileSync(path.join(out, 'six-month-checks.md'), md);
});

// ======================================================================== generation sanity

describe('simulation sanity (input data is realistic, not identical every week)', () => {
  it('26 weeks, 2–4 sessions in normal weeks, the planned gaps, varied times and orders', () => {
    const perWeek = Array.from({ length: SIM_WEEKS }, (_, i) => inWeek(i + 1).length);
    report.sessionsPerWeek = perWeek;
    report.sessions = { performed: meta.performed, planned: meta.planned, missed: meta.planned - meta.performed };
    expect(perWeek.reduce((a, b) => a + b, 0)).toBe(data.workouts.length);
    for (const wk of MISSED.emptyWeeks) expect(perWeek[wk - 1]).toBe(0);
    expect(perWeek[6]).toBe(1);
    const normal = perWeek.filter((_, i) => ![7, ...MISSED.emptyWeeks].includes(i + 1));
    expect(Math.min(...normal)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...normal)).toBeLessThanOrEqual(4);
    const avg = normal.reduce((a, b) => a + b, 0) / normal.length;
    expect(avg).toBeGreaterThan(3);
    expect(avg).toBeLessThan(4);
    expect(new Set(data.workouts.map((w) => w.startTime)).size).toBeGreaterThan(4);
    expect(new Set(data.workouts.map((w) => w.exercises.map((e) => e.exerciseId).join())).size).toBeGreaterThan(5);
    expect(new Set(data.workouts.map((w) => w.locationId))).toEqual(new Set(['gym_a', 'gym_b']));
    const allSets = data.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));
    expect(allSets.filter((s) => s.type === 'warmup').length).toBeGreaterThan(50);
    expect(allSets.filter((s) => s.failure === 'muscular').length).toBeGreaterThan(30);
    expect(allSets.filter((s) => s.failure === 'none').length).toBeGreaterThan(30);
    expect(allSets.filter((s) => s.technique === 'compromised').length).toBeGreaterThan(0);
    expect(new Set(allSets.map((s) => s.restSecBefore).filter(Boolean)).size).toBeGreaterThan(4);
    expect(new Set(allSets.map((s) => s.rir))).toEqual(new Set([0, 1, 2, 3, 4, null]));
    report.totalWorkingSets = allSets.filter((s) => s.type === 'working').length;
    report.totalWarmupSets = allSets.filter((s) => s.type === 'warmup').length;
  });
});

// ======================================================================== weekly volume vs reference (all weeks)

describe('weekly muscle volume — app equals the independent reference for EVERY week and muscle', () => {
  it('end-of-week effective sets, raw direct/indirect counts, and archived weeks', () => {
    const final = run(data, SIM_END, '23:59');
    const weekly: Record<string, Record<string, number>> = {};
    for (let week = 1; week <= SIM_WEEKS; week++) {
      const end = sunday(week);
      const a = run(data, end, '23:59');
      expect(a.week.start).toBe(weekStartOf(week));
      const ws = inWeek(week);
      const ref = refEffective(ws);
      const raw = refRawSets(ws);
      weekly[`W${week}`] = {};
      for (const m of MUSCLES) {
        const app = a.muscles.find((x) => x.muscle === m)!;
        const exp = Math.round((ref[m] ?? 0) * 100) / 100;
        if (week % 5 === 1 || ['chest', 'side_delts', 'quads', 'hamstrings'].includes(m)) check(`vol W${week} ${m}`, `${ws.length} sessions`, exp, app.completed, 0.011);
        else expect(app.completed, `W${week} ${m}`).toBeCloseTo(exp, 2);
        expect(app.volume.directSets + app.volume.indirectSets).toBeCloseTo((raw[m]?.direct ?? 0) + (raw[m]?.indirect ?? 0), 5);
        // Archived week in the FINAL analysis: unchanged, derived from the same raw sets.
        const archived = final.weeks.find((b) => b.range.start === weekStartOf(week))!;
        expect(archived.volume.muscles[m as keyof typeof archived.volume.muscles].effective).toBeCloseTo(exp, 2);
        expect(archived.workouts.length).toBe(ws.length);
        weekly[`W${week}`][m] = app.completed;
      }
    }
    report.weeklyEffective = weekly;
  });

  it('remaining = max(0, target − completed), half-set rounding, for every muscle mid-week', () => {
    const a = run(data, dayAdd(weekStartOf(14), 3), '21:00');
    for (const m of a.muscles) {
      const exp = Math.round(Math.max(0, m.target.preferred - m.completed) * 2) / 2;
      expect(m.remainingToPreferred, m.muscle).toBe(exp);
    }
  });
});

// ======================================================================== calendar & recovery continuity

describe('week transitions, missed weeks and continuous recovery', () => {
  it('Monday 00:01 → new counters at 0, previous week archived intact, recovery NOT reset', () => {
    const lastSun = sunday(12);
    const mon = dayAdd(lastSun, 1);
    const sun = run(data, lastSun, '23:59');
    const a = run(data, mon, '00:01');
    expect(a.week.start).toBe(mon);
    for (const m of a.muscles) expect(m.completed, m.muscle).toBe(0);
    const prev = a.weeks.find((b) => b.range.start === weekStartOf(12))!;
    expect(prev.workouts.map((w) => w.id)).toEqual(inWeek(12).map((w) => w.id));
    // Recovery keeps the last stimulus from last week (dates/times identical to Sunday night's view).
    for (const m of ['chest', 'quads', 'lats'] as const) {
      expect(a.recovery[m].lastStimulusDate, m).toBe(sun.recovery[m].lastStimulusDate);
      expect(a.recovery[m].lastStimulusDate, m).not.toBeNull();
    }
  });

  it('a session crossing midnight counts in the week it started; recovery runs from its real end', () => {
    const w = data.workouts.find((x) => x.id === meta.midnightWorkoutId)!;
    expect(w.startTime).toBe('23:20');
    expect(w.endTime! < w.startTime!).toBe(true); // ended after midnight
    const next = dayAdd(w.date, 1);
    const a = run(data, next, '08:00');
    expect(a.weeks.find((b) => b.workouts.some((x) => x.id === w.id))!.range.start).toBe(refMonday(w.date));
    const chestDate = a.recovery.chest.lastStimulusDate;
    if (w.exercises.some((e) => REF_COEF[e.exerciseId].chest)) {
      expect(chestDate).toBe(w.date);
      expect(a.recovery.chest.lastStimulusTime).toBe(w.endTime);
    }
  });

  it('missed weeks: no fictional workouts; empty weeks show 0; history and last stimulus survive', () => {
    const a = run(data, dayAdd(weekStartOf(19), 0), '06:00'); // before the first session after the 2-week gap
    for (const wk of MISSED.emptyWeeks) {
      const b = a.weeks.find((x) => x.range.start === weekStartOf(wk))!;
      expect(b.workouts).toHaveLength(0);
      expect(Object.values(b.volume.muscles).every((v) => v.effective === 0)).toBe(true);
    }
    expect(a.weeks.reduce((n, b) => n + b.workouts.length, 0)).toBe(data.workouts.filter((w) => w.date < weekStartOf(19)).length);
    const lastChest = [...inWeek(16)].reverse().find((w) => w.exercises.some((e) => REF_COEF[e.exerciseId].chest))!;
    expect(a.recovery.chest.lastStimulusDate).toBe(lastChest.date); // continuous, not reset
    expect(a.recovery.chest.status).toBe('likely_recovered');
  });

  it('after missing two weeks the app does NOT try to make up missed sets', () => {
    const date = weekStartOf(19);
    const a = run(data, date, '06:00');
    const normal = run(data, weekStartOf(14), '06:00'); // a Monday in a normal week
    for (const m of a.muscles) {
      expect(m.completed).toBe(0);
      // Whole sets: a share is at least 1 when anything is open (never more than what is left this week).
      expect(m.todayShare, m.muscle).toBeLessThanOrEqual(Math.max(Math.min(1, m.remainingToPreferred), Math.min(m.target.preferred * 0.6, data.settings.perSessionSetCap)) + 1e-9);
      expect(m.todayShare, m.muscle).toBeLessThanOrEqual(m.remainingToPreferred + 1e-9);
      // The weekly target itself is not raised to compensate for the gap.
      const n = normal.muscles.find((x) => x.muscle === m.muscle)!;
      expect(m.target.preferred, m.muscle).toBeLessThanOrEqual(n.target.preferred + 2);
    }
    report.afterGap = Object.fromEntries(a.muscles.filter((m) => MUSCLES.includes(m.muscle)).map((m) => [m.muscle, { target: m.target.preferred, todayShare: m.todayShare }]));
  });

  it('missed week 7 sessions: week 7 only shows the one real session', () => {
    const a = run(data, sunday(7), '23:59');
    expect(a.sessionsThisWeek).toBe(1);
    expect(a.muscles.find((m) => m.muscle === 'chest')!.completed).toBeCloseTo(Math.round((refEffective(inWeek(7)).chest ?? 0) * 100) / 100, 2);
  });
});

// ======================================================================== lifecycle stages

describe('weeks 1–4: learning and calibration', () => {
  it('no confident recommendations from a thin history; baseline phase; provisional targets', () => {
    const d1 = data.workouts[0].date;
    const a1 = run(data, d1, '23:00');
    expect(a1.learning.active).toBe(true);
    expect(a1.muscles.every((m) => m.target.provisional || m.target.source !== 'individualized')).toBe(true);
    for (const p of a1.progression) expect(p.trend.cls).toBe('insufficient_data');
    // Prescription for the second session: only one comparable session → low confidence, calibrating.
    const d2 = data.workouts[1].date;
    const w2 = data.workouts[1];
    const a2 = run(data, dayAdd(d2, -1), '23:00');
    const i = w2.exercises.findIndex((e) => e.exerciseId === 'pec_deck' || e.exerciseId === 'incline_dumbbell_press' || e.exerciseId === 'back_squat');
    if (i >= 0) {
      const p = prescribe({ data: asOf(data, dayAdd(d2, -1)), analysis: a2, now: at(d2, '06:00'), workout: { ...w2, exercises: w2.exercises.map((e) => ({ ...e, sets: [] })) }, exerciseIndex: i });
      expect(['low', 'moderate']).toContain(p.confidence);
    }
    const a4 = run(data, sunday(4));
    const progress = a4.progression.map((p) => strengthProgress(p, a4.today));
    expect(progress.every((s) => s.pct == null)).toBe(true); // no % inside the baseline window
    const ha = hypertrophyAssessment({ data: asOf(data, sunday(4)), today: a4.today, startDate: SIM_START, progress, current: periodStats(asOf(data, sunday(4)), dayAdd(a4.today, -27), a4.today, (ws) => eff(ws)), previous: null, targetPerWeek: 100, effortKnownShare: 0.9 });
    expect(ha.status).toBe('establishing_baseline');
    report.week4 = { learningActive: a4.learning.active, hypertrophy: ha.status };
  });
});

const eff = (ws: Workout[]) => Object.fromEntries(Object.entries(computeVolume(ws, analyze(data, at(SIM_END)).registry, data.settings.quality).muscles).map(([m, x]) => [m, x.effective]));

describe('weeks 5–8: initial personalisation', () => {
  it('squat & incline prescriptions: warm-ups below the working load, real increments, sane reps/RIR/rest', () => {
    const w = inWeek(8).find((x) => x.exercises.some((e) => e.exerciseId === 'back_squat'))!;
    const before = dayAdd(w.date, -1);
    const a = run(data, before, '23:00');
    const rows: Record<string, unknown> = {};
    for (const id of ['back_squat', 'incline_dumbbell_press', 'pec_deck', 'leg_extension']) {
      const i = w.exercises.findIndex((e) => e.exerciseId === id);
      if (i < 0) continue;
      const p = prescribe({ data: asOf(data, before), analysis: a, now: at(w.date, '06:00'), workout: { ...w, exercises: w.exercises.map((e) => ({ ...e, sets: [] })) }, exerciseIndex: i });
      const work = p.workingWeightKg;
      expect(work, id).not.toBeNull();
      const lastTop = Math.max(...data.workouts.filter((x) => x.date < w.date && x.locationId === w.locationId).flatMap((x) => x.exercises.filter((e) => e.exerciseId === id && e.equipmentId === w.exercises[i].equipmentId).flatMap((e) => e.sets.filter((s) => s.type === 'working' && !s.weightAccuracy).map((s) => s.weightKg ?? 0))));
      // Never more than one real step above the heaviest clean load used so far on this setup.
      expect(work! - lastTop, id).toBeLessThanOrEqual(p.step + 1e-9);
      expect(Math.abs((work! / p.step) - Math.round(work! / p.step)), `${id} on its real step`).toBeLessThan(1e-6);
      expect(p.rirTarget[0]).toBeGreaterThanOrEqual(0);
      expect(p.rirTarget[1]).toBeLessThanOrEqual(3);
      expect(p.rest.range[0]).toBeGreaterThanOrEqual(60);
      for (const s of p.sets) { expect(s.repsMin).toBeGreaterThanOrEqual(p.repBounds[0]); expect(s.repsMax).toBeLessThanOrEqual(p.repBounds[1]); expect(s.repsMin).toBeLessThanOrEqual(s.repsMax); }
      if (id === 'back_squat' || id === 'incline_dumbbell_press') {
        expect(p.warmups.length, `${id} warm-ups`).toBeGreaterThan(0);
        for (const wu of p.warmups) expect(wu.weightKg ?? 0).toBeLessThan(work!);
      }
      expect(['moderate', 'high']).toContain(p.confidence);
      rows[id] = { weight: work, step: p.step, sets: p.setCount, reps: p.sets.map((s) => `${s.repsMin}–${s.repsMax}`), rir: p.rirTarget, rest: p.rest.range, warmups: p.warmups.map((x) => x.weightKg), confidence: p.confidence, decision: p.decision };
    }
    report.week8Prescriptions = rows;
  });
});

describe('weeks 9–12: first progress assessment', () => {
  it('strength % per history matches the independent reference; growth is a separate status, never a %', () => {
    const today = sunday(12);
    const a = run(data, today);
    const rows: Record<string, unknown> = {};
    for (const p of a.progression) {
      const app = strengthProgress(p, today);
      const ws = new Map(data.workouts.map((w) => [w.id, w]));
      const refSessions = p.sessions.map((s) => {
        const w = ws.get(s.workoutId)!;
        const sets = w.exercises.filter((e) => e.exerciseId === p.exerciseId && (e.equipmentId ?? null) === (p.equipmentId ?? null)).flatMap((e) => e.sets);
        return { date: s.date, index: refIndex(sets, refBodyBefore(data.body, w.date, w.startTime ?? null)?.kg ?? null) };
      });
      const ref = refProgressPct(refSessions, today);
      if (ref && app.pct != null) {
        check(`progress% ${p.key}`, `${p.sessions.length} sessions to ${today}`, Math.round(ref.pct * 10) / 10, app.pct, 0.15);
        rows[p.key] = { baseline: app.baseline?.index, current: app.current?.index, pct: app.pct };
      } else expect(app.pct, p.key).toBeNull();
    }
    expect(Object.keys(rows).length).toBeGreaterThan(3);
    report.week12Progress = rows;
  });
});

describe('scenario P: plateau (RDL stuck from week 12)', () => {
  it('is reported as a possible plateau only after enough comparable sessions over ≥ 3 weeks', () => {
    // RDL never left 70 kg in this simulation (reps 9–11); with < 4 sessions it is never called a plateau.
    const early = one(run(data, sunday(2)), (p) => p.exerciseId === 'romanian_deadlift');
    expect(early.trend.cls).toBe('insufficient_data');
    const late = one(run(data, sunday(16)), (p) => p.exerciseId === 'romanian_deadlift');
    expect(late.trend.cls).toBe('plateau');
    expect(late.next.action).not.toBe('increase');
    report.rdl = { week12: early.trend.cls, week16: late.trend.cls, advice: late.next.action };
  });
});

describe('weeks 13–20: equipment histories stay separate', () => {
  const a = run(data, sunday(20));
  it('pec deck A (Technogym, 5 kg steps) and pec deck B (2.5 kg steps) are separate histories', () => {
    const A = one(a, (p) => p.exerciseId === 'pec_deck' && p.equipmentId === 'pd_a');
    const B = one(a, (p) => p.exerciseId === 'pec_deck' && p.equipmentId === 'pd_b');
    expect(A.key).not.toBe(B.key);
    const gymB = new Set(data.workouts.filter((w) => w.locationId === 'gym_b').map((w) => w.id));
    expect(B.sessions.every((s) => gymB.has(s.workoutId))).toBe(true);
    expect(A.sessions.some((s) => gymB.has(s.workoutId))).toBe(false);
    // Identified later (week 15) but one continuous history: sessions before AND after identification.
    expect(B.sessions.some((s) => s.date < '2026-09-02')).toBe(true);
    expect(B.sessions.some((s) => s.date > '2026-09-02')).toBe(true);
    expect(B.next.increment).toBe(2.5);
    expect(A.next.increment).toBe(5);
  });
  it('cable A vs cable B, leg extension A vs B (7 kg steps), EZ bar A vs an unknown bar: never merged', () => {
    expect(series(a, (p) => p.exerciseId === 'triceps_pushdown_bar').map((p) => p.equipmentId).sort()).toEqual(['cable_a', 'cable_b']);
    expect(one(a, (p) => p.exerciseId === 'leg_extension' && p.equipmentId === 'legext_b').next.increment).toBe(7);
    const ez = series(a, (p) => p.exerciseId === 'ez_bar_curl');
    expect(ez.length).toBe(2);
    // The unknown bar's loads are exactly what was logged — no bar weight invented or added.
    const free = ez.find((p) => !p.equipmentId)!;
    const logged = new Set(data.workouts.flatMap((w) => w.exercises.filter((e) => e.exerciseId === 'ez_bar_curl' && !e.equipmentId).flatMap((e) => e.sets.filter((s) => s.type === 'working').map((s) => s.weightKg))));
    for (const s of free.sessions) expect(logged.has(s.topWeight)).toBe(true);
  });
  it('pull-ups: 4 separate histories (bodyweight/weighted × grip width)', () => {
    const keys = series(a, (p) => p.exerciseId === 'pull_up').map((p) => p.key).sort();
    expect(keys).toEqual(['pull_up::free|load=bodyweight|gw=shoulder', 'pull_up::free|load=bodyweight|gw=wide', 'pull_up::free|load=weighted|gw=wide']);
  });
});

// ======================================================================== scenarios C, D, E

describe('scenario C: declining pushdown on cable A (weeks 19–26)', () => {
  it('detects the decline, does not suggest more load, and does not raise the triceps target', () => {
    const a = run(data, SIM_END);
    const p = one(a, (x) => x.exerciseId === 'triceps_pushdown_bar' && x.equipmentId === 'cable_a');
    expect(p.trend.cls).toBe('declining'); // index ~49 → 36 over 8 weeks, slow but sustained
    expect(p.next.action).not.toBe('increase');
    const t18 = run(data, sunday(16)).muscles.find((m) => m.muscle === 'triceps')!.target.preferred;
    const t26 = a.muscles.find((m) => m.muscle === 'triceps')!;
    expect(t26.target.preferred).toBeLessThanOrEqual(t18);
    report.pushdownCableA = { trend: p.trend.cls, evidence: p.trend.evidence, next: p.next.action, nextKg: p.next.weight, tricepsTarget: { wk16: t18, wk26: t26.target.preferred } };
  });
  it('one bad session alone is not a plateau or a decline (pec deck A, 4 reps fewer on every set)', () => {
    for (const wk of [6, 8, 13, 16, 21]) {
      const end = sunday(wk);
      const base = known(data, end, '23:59');
      const last = [...base.workouts].reverse().find((w) => w.exercises.some((e) => e.equipmentId === 'pd_a'))!;
      const bad: Workout = { ...last, id: `bad${wk}`, date: dayAdd(end, 1), exercises: last.exercises.filter((e) => e.equipmentId === 'pd_a').map((e) => ({ ...e, id: `${e.id}b`, sets: e.sets.map((s) => ({ ...s, id: `${s.id}b`, reps: Math.max(1, (s.reps ?? 0) - 4) })) })) };
      const before = one(analyze(base, at(end, '23:59')), (x) => x.equipmentId === 'pd_a').trend.cls;
      const after = one(analyze({ ...base, workouts: [...base.workouts, bad] }, at(dayAdd(end, 1), '22:00')), (x) => x.equipmentId === 'pd_a');
      // A single bad session must never CREATE a plateau or a decline (an existing one may stay).
      if (!/declining|plateau/.test(before)) expect(after.trend.cls, `week ${wk}: ${before} → ${after.trend.cls}`).not.toMatch(/declining|plateau/);
      else expect(after.trend.cls).toBe(before);
      expect(after.next.action, `week ${wk}`).not.toBe('reduce');
    }
  });
});

describe('scenario D: accidental weights', () => {
  const a = run(data, SIM_END);
  it('wrong-weight sets are stored as entered, count by effort, but are never progression benchmarks', () => {
    const all = data.workouts.flatMap((w) => w.exercises.flatMap((e) => e.sets));
    for (const id of meta.wrongWeightSetIds) {
      const s = all.find((x) => x.id === id)!;
      expect(s.weightAccuracy).toMatch(/too_/);
      expect(s.intendedWeightKg).not.toBe(s.weightKg); // original value kept
    }
    const lat = one(a, (p) => p.exerciseId === 'lateral_raise');
    const heavy = all.find((s) => meta.wrongWeightSetIds.includes(s.id) && s.weightAccuracy === 'too_heavy')!;
    const pts = lat.sessions.flatMap((s) => s.sets).filter((p) => p.weight === heavy.weightKg && p.reps === heavy.reps);
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every((p) => !p.benchmark)).toBe(true);
    // The heavy mistake would have been the best e1rm; it is not.
    const cleanBest = Math.max(...lat.sessions.filter((s) => s.e1rm != null).map((s) => s.e1rm as number));
    expect(lat.best.e1rm).toBe(cleanBest);
    expect(lat.best.weight).not.toBe(heavy.weightKg);
    expect(lat.next.weight).toBeLessThan(heavy.weightKg as number);
  });
});

describe('scenario E: progress with poor recovery (weeks 23–24)', () => {
  it('soreness/sleep/fatigue lengthen recovery, block "more volume", no load increases where performance fell', () => {
    const date = dayAdd(weekStartOf(24), 3);
    const a = run(data, date, '07:00');
    const calm = run(data, dayAdd(weekStartOf(21), 3), '07:00');
    expect(a.recovery.chest.soreness).toBeGreaterThan(0);
    expect(a.recovery.chest.factors.join(' ')).toMatch(/sore/i);
    const chest = a.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.moreVolumeJustified).not.toBe('yes');
    expect(chest.target.preferred).toBeLessThanOrEqual(calm.muscles.find((m) => m.muscle === 'chest')!.target.preferred);
    for (const id of ['incline_dumbbell_press']) {
      const p = one(a, (x) => x.exerciseId === id);
      expect(p.next.action, id).not.toBe('increase');
    }
    // Squat performance kept rising: the app may still progress it — performance and recovery are judged separately.
    const sq = one(a, (x) => x.exerciseId === 'back_squat');
    report.poorRecovery = { chestRecovery: a.recovery.chest.status, chestWindowH: a.recovery.chest.windowHours, calmWindowH: calm.recovery.chest.windowHours, chestMoreVolume: chest.moreVolumeJustified, inclineNext: one(a, (x) => x.exerciseId === 'incline_dumbbell_press').next.action, squatTrend: sq.trend.cls, squatNext: sq.next.action };
  });
});

// ======================================================================== body weight & pull-ups

describe('body weight (26 weeks) and pull-ups', () => {
  it('7-day average (mean of daily means) equals the reference on every Sunday', () => {
    const rows: Record<string, number> = {};
    for (let week = 1; week <= SIM_WEEKS; week++) {
      const end = sunday(week);
      const ref = ref7dAverage(data.body, end)!;
      const app = rollingAverage(data.body, end)!.kg;
      // The app rounds to 0.01 kg; the reference is unrounded → allowed difference = half a rounding step.
      if (week % 4 === 0 || week === 1) check(`7-day avg W${week}`, `weigh-ins ${dayAdd(end, -6)}…${end}`, ref, app, 0.0051);
      else expect(Math.abs(app - ref)).toBeLessThanOrEqual(0.0051);
      rows[`W${week}`] = app;
    }
    report.bodyWeight7d = rows;
    expect(rows.W26 - rows.W1).toBeGreaterThan(1.5); // gradual gain is visible
  });

  it('every workout gets the latest weigh-in taken BEFORE it started (late entries included)', () => {
    let late = 0;
    for (const w of data.workouts) {
      const app = bodyWeightForSession(data.body, w);
      const ref = refBodyBefore(data.body, w.date, w.startTime ?? null);
      expect(app.kg, w.date).toBe(ref?.kg ?? null);
      if (ref) expect(app.status).toBe(ref.outdated ? 'outdated' : 'ok');
      if (data.body.some((b) => b.date === w.date && b.enteredAt && b.enteredAt.slice(0, 10) > b.date)) late++;
    }
    expect(late).toBeGreaterThan(0);
  });

  it('weighted pull-ups: body and belt stay separate; system mass = body before session + belt (estimate)', () => {
    const a = run(data, SIM_END);
    const p = one(a, (x) => x.key === 'pull_up::free|load=weighted|gw=wide');
    const rows = bodyLoadSessions(p, data.workouts, data.body, 'system');
    const byId = new Map(data.workouts.map((w) => [w.id, w]));
    let n = 0;
    for (const r of rows) {
      const w = byId.get(r.workoutId)!;
      const belt = Math.max(...w.exercises.filter((e) => e.exerciseId === 'pull_up' && e.variation?.loading === 'weighted').flatMap((e) => e.sets.filter((s) => s.type === 'working').map((s) => s.weightKg ?? 0)));
      expect(r.externalKg).toBe(belt); // the set stores the belt only
      const b = refBodyBefore(data.body, w.date, w.startTime ?? null);
      if (b) {
        const exp = Math.round((b.kg + belt) * 10) / 10;
        if (n++ < 4) check(`pull-up system kg ${w.date}`, `body ${b.kg} + belt ${belt}`, exp, r.estSystemKg!, 0.051);
        else expect(r.estSystemKg).toBeCloseTo(exp, 1);
      }
    }
    for (const w of data.workouts) for (const e of w.exercises) if (e.exerciseId === 'pull_up') for (const s of e.sets) expect(s.weightKg).toBeLessThanOrEqual(10); // body weight never stored on a set
    report.pullUps = Object.fromEntries(series(a, (x) => x.exerciseId === 'pull_up').map((x) => [x.key, { sessions: x.sessions.length, best: x.best, trend: x.trend.cls, next: x.next.action }]));
  });
});

// ======================================================================== tonnage, correction

describe('session summaries and corrections', () => {
  it('tonnage of EVERY session = Σ weight × reps of working sets (warm-ups excluded)', () => {
    const reg = analyze(data, at(SIM_END)).registry;
    let total = 0;
    for (const [i, w] of data.workouts.entries()) {
      const s = summarizeSession(w, data.workouts, reg, data.settings.quality, { date: w.date, time: '23:59' });
      const exp = Math.round(refTonnage(w));
      if (i < 3) check(`tonnage ${w.date}`, `${w.exercises.length} exercises`, exp, s.tonnageKg, 0.5);
      else expect(s.tonnageKg).toBe(exp);
      total += exp;
    }
    report.totalTonnageKg = total;
  });

  it('a typo (250 kg on pec deck A) and its correction: stats follow, unrelated data unchanged, audit kept', () => {
    const w0 = data.workouts.find((w) => w.id === meta.typoWorkoutId)!;
    const good = w0.exercises.flatMap((e) => e.sets).find((s) => s.id === meta.typoSetId)!.weightKg!;
    const typo: Workout = { ...w0, exercises: w0.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => (s.id === meta.typoSetId ? { ...s, weightKg: 250 } : s)) })) };
    const withTypo = { ...data, workouts: data.workouts.map((w) => (w.id === w0.id ? typo : w)) };
    const aTypo = run(withTypo, SIM_END);
    const aGood = run(data, SIM_END);
    const pdT = one(aTypo, (p) => p.equipmentId === 'pd_a');
    expect(pdT.best.weight).toBe(250); // the typo is visible as entered…
    const fixed = withCorrections(typo, w0, '2026-11-22T10:00:00Z');
    const corr = fixed.exercises.flatMap((e) => e.sets).find((s) => s.id === meta.typoSetId)!;
    expect(corr.weightKg).toBe(good);
    expect(corr.corrections?.[0]).toMatchObject({ field: 'weightKg', from: 250, to: good });
    const aFixed = run({ ...data, workouts: data.workouts.map((w) => (w.id === w0.id ? fixed : w)) }, SIM_END);
    expect(one(aFixed, (p) => p.equipmentId === 'pd_a').best).toEqual(one(aGood, (p) => p.equipmentId === 'pd_a').best);
    // Unrelated histories and every week's volume are identical to the never-typo'd data.
    for (const p of aGood.progression.filter((x) => x.equipmentId !== 'pd_a')) expect(aFixed.progression.find((x) => x.key === p.key)!.sessions).toEqual(p.sessions);
    for (const b of aGood.weeks) expect(aFixed.weeks.find((x) => x.range.start === b.range.start)!.volume.muscles).toEqual(b.volume.muscles);
    expect(aTypo.weeks.map((b) => b.volume.muscles.chest.effective)).toEqual(aGood.weeks.map((b) => b.volume.muscles.chest.effective)); // weight never changes set counts
  });
});

// ======================================================================== the 26-week report

describe('26-week synthetic report', () => {
  it('collects what the app would show after 26 weeks', () => {
    const a = run(data, SIM_END, '21:00');
    const progress = a.progression.map((p) => ({ p, s: strengthProgress(p, a.today) }));
    report.final = {
      sessionsCompleted: data.workouts.length,
      strength: Object.fromEntries(progress.map(({ p, s }) => [p.key, { sessions: p.sessions.length, trend: p.trend.cls, next: `${p.next.action}${p.next.weight != null ? ` ${p.next.weight} kg` : ''}`, baseline: s.baseline?.index ?? null, current: s.current?.index ?? null, pct: s.pct }])),
      recovery: Object.fromEntries(a.muscles.filter((m) => MUSCLES.includes(m.muscle)).map((m) => [m.muscle, { status: m.recovery.status, last: m.recovery.lastStimulusDate, windowH: m.recovery.windowHours, target: m.target.preferred, targetSource: m.target.source }])),
      equipment: data.equipment.map((e) => ({ id: e.id, gym: e.locationId, steps: e.incrementsKg, histories: a.progression.filter((p) => p.equipmentId === e.id).map((p) => p.key) })),
      plateaus: a.progression.filter((p) => p.trend.cls === 'plateau').map((p) => p.key),
      declining: a.progression.filter((p) => p.trend.cls === 'declining').map((p) => p.key),
    };
    // Never a growth %: the assessment API has no percentage field at all.
    const cur = periodStats(data, dayAdd(a.today, -27), a.today, eff);
    const prev = periodStats(data, dayAdd(a.today, -55), dayAdd(a.today, -28), eff);
    const ha = hypertrophyAssessment({ data, today: a.today, startDate: SIM_START, progress: progress.map((x) => x.s), current: cur, previous: prev, targetPerWeek: a.muscles.reduce((t, m) => t + m.target.preferred, 0), effortKnownShare: 0.95 });
    expect(JSON.stringify(ha)).not.toMatch(/"pct"|growth %|% muscle/i);
    expect(ha.phase).toBe('assessment');
    report.final = { ...(report.final as object), growthSignals: { status: ha.status, confidence: ha.confidence, indicators: ha.indicators } };
    expect(progress.filter(({ s }) => s.status === 'ok').length).toBeGreaterThan(4);
  });
});
