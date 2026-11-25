import { describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { addDays, weekOf, daysLeftInWeek } from '../src/domain/dates';
import { DEFAULT_QUALITY } from '../src/domain/defaults';
import { classifyTrend, suggestNextLoad, sessionPerf, warmupFor, buildProgression } from '../src/domain/progression';
import { assessSet } from '../src/domain/quality';
import { buildRegistry, resolveCoefficients } from '../src/domain/registry';
import { computeVolume } from '../src/domain/volume';
import { SEED_BY_ID } from '../src/data/exercises';
import { data, ex, set, workout } from './fixtures';

const reg = buildRegistry([], []);

describe('set quality', () => {
  it('excludes warm-ups and grades by RIR', () => {
    expect(assessSet(set(20, 10, 5, { type: 'warmup' }), DEFAULT_QUALITY).credit).toBe(0);
    expect(assessSet(set(50, 10, 2), DEFAULT_QUALITY).credit).toBe(1);
    expect(assessSet(set(50, 10, 0), DEFAULT_QUALITY).tier).toBe('high_effort');
    expect(assessSet(set(50, 10, 4), DEFAULT_QUALITY).credit).toBe(0.6);
    expect(assessSet(set(50, 10, 8), DEFAULT_QUALITY).credit).toBe(0);
  });
  it('keeps unknown-effort sets but flags them as uncertain', () => {
    const q = assessSet(set(50, 10, null), DEFAULT_QUALITY);
    expect(q.credit).toBe(DEFAULT_QUALITY.unknownRirCredit);
    expect(q.uncertain).toBe(true);
  });
  it('treats to-failure as RIR 0 and discounts drop sets and partials', () => {
    expect(assessSet(set(50, 10, null, { toFailure: true }), DEFAULT_QUALITY).credit).toBe(1);
    expect(assessSet(set(50, 10, 1, { type: 'drop' }), DEFAULT_QUALITY).credit).toBe(0.5);
    expect(assessSet(set(50, 10, 1, { rom: 'partial' }), DEFAULT_QUALITY).credit).toBe(0.8);
    expect(assessSet(set(50, 10, 6), DEFAULT_QUALITY).credit).toBe(0.15);
  });
});

describe('fractional volume', () => {
  it('counts direct 1.0 and secondary 0.5, separately from effort', () => {
    const w = workout('2026-11-16', [ex('incline_chest_press', [set(45, 10, 2), set(45, 10, 2), set(45, 9, 1)])]);
    const v = computeVolume([w], reg, DEFAULT_QUALITY);
    expect(v.muscles.chest.effective).toBe(3);
    expect(v.muscles.chest.directSets).toBe(3);
    expect(v.muscles.triceps.effective).toBe(1.5);
    expect(v.muscles.triceps.indirectSets).toBe(3);
    expect(v.muscles.front_delts.effective).toBe(1.5);
    // Regions are tracked but never added to chest.
    expect(v.regions.upper_chest.effective).toBe(3);
    expect(v.muscles.biceps.effective).toBe(0);
  });
  it('pec deck gives no triceps credit', () => {
    const v = computeVolume([workout('2026-11-16', [ex('pec_deck', [set(40, 12, 2)])])], reg, DEFAULT_QUALITY);
    expect(v.muscles.triceps.effective).toBe(0);
    expect(v.muscles.chest.effective).toBe(1);
  });
  it('separates raw working sets from effective volume', () => {
    const v = computeVolume([workout('2026-11-16', [ex('lateral_raise', [set(10, 15, 8), set(10, 15, 2)])])], reg, DEFAULT_QUALITY);
    expect(v.muscles.side_delts.rawWorkingSets).toBe(2);
    expect(v.muscles.side_delts.effective).toBe(1);
  });
  it('recalculates history when coefficients are overridden', () => {
    const w = workout('2026-11-16', [ex('lat_pulldown', [set(50, 12, 2)])]);
    const before = computeVolume([w], reg, DEFAULT_QUALITY).muscles.biceps.effective;
    const reg2 = buildRegistry([], [{ id: 'lat_pulldown', contributions: { ...SEED_BY_ID.lat_pulldown.contributions, biceps: 0.25 }, updatedAt: '' }]);
    const after = computeVolume([w], reg2, DEFAULT_QUALITY).muscles.biceps.effective;
    expect(before).toBe(0.5);
    expect(after).toBe(0.25);
  });
  it('adapts coefficients to bench angle', () => {
    const flat = resolveCoefficients(SEED_BY_ID.dumbbell_bench_press, { benchAngleDeg: 0 });
    const incline = resolveCoefficients(SEED_BY_ID.dumbbell_bench_press, { benchAngleDeg: 30 });
    const steep = resolveCoefficients(SEED_BY_ID.dumbbell_bench_press, { benchAngleDeg: 60 });
    expect(flat.regions.upper_chest).toBeUndefined();
    expect(incline.regions.upper_chest).toBe(1);
    expect(steep.contributions.front_delts).toBe(0.75);
    expect(steep.contributions.chest).toBe(0.75);
  });
});

describe('weeks', () => {
  it('uses Monday-start weeks by default', () => {
    expect(weekOf('2026-11-21', 1)).toEqual({ start: '2026-11-16', end: '2026-11-22' }); // Saturday
    expect(weekOf('2026-11-16', 1).start).toBe('2026-11-16');
    expect(weekOf('2026-11-22', 0).start).toBe('2026-11-22'); // Sunday-start
    expect(daysLeftInWeek('2026-11-21', weekOf('2026-11-21', 1))).toBe(2);
  });
});

describe('remaining sets', () => {
  it('remaining = max(0, target − completed) and never negative', () => {
    const now = new Date('2026-11-18T12:00:00Z'); // Wednesday
    const d = data([
      workout('2026-11-16', [ex('preacher_curl', [set(20, 10, 1), set(20, 10, 1), set(20, 9, 1)]), ex('back_squat', Array.from({ length: 20 }, () => set(100, 8, 2)))]),
    ]);
    const a = analyze(d, now);
    const biceps = a.muscles.find((m) => m.muscle === 'biceps')!;
    expect(biceps.completed).toBe(3);
    expect(biceps.target.provisional).toBe(false); // owner 2026-11-25: targets are static (the reference); the own level is an observation
    expect(biceps.remainingToPreferred).toBe(biceps.target.preferred - 3);
    const quads = a.muscles.find((m) => m.muscle === 'quads')!;
    expect(quads.remainingToPreferred).toBe(0);
    expect(quads.moreVolumeJustified).toBe('no');
    expect(quads.todayShare).toBe(0);
  });
  it('splits remaining sets across likely sessions left, and holds muscles still recovering from an earlier session', () => {
    const now = new Date('2026-11-17T19:30:00Z'); // Tuesday evening
    const d = data([
      // Yesterday: a big biceps session (10 effective sets → ~60 h window), so biceps is held today.
      workout('2026-11-16', [ex('preacher_curl', Array.from({ length: 10 }, () => set(20, 10, 1)))], { startTime: '18:00' }),
    ]);
    const a = analyze(d, now);
    const biceps = a.muscles.find((m) => m.muscle === 'biceps')!;
    expect(biceps.recovery.status).toBe('recovering');
    expect(biceps.todayBlocked).toBe(true);
    expect(biceps.todayShare).toBe(0);
    const side = a.muscles.find((m) => m.muscle === 'side_delts')!;
    expect(side.todayShare).toBeGreaterThan(0);
    expect(side.todayShare).toBeLessThanOrEqual(d.settings.perSessionSetCap);
  });
});

describe('progression', () => {
  const mk = (date: string, w: number, reps: number[], rir = 1) =>
    workout(date, [ex('lat_pulldown', reps.map((r) => set(w, r, rir)), 'eq_1')]);

  it('does not increase load after a single top-of-range session', () => {
    const ws = [mk('2026-11-01', 50, [10, 10, 9]), mk('2026-11-05', 50, [12, 12, 12])];
    const perf = ws.map((w) => sessionPerf(w, w.exercises[0])!);
    const t = classifyTrend(perf, '2026-11-06');
    const next = suggestNextLoad(perf, [8, 12], 2, 5, t);
    expect(next.action).toBe('hold');
  });
  it('increases by the equipment increment after two consecutive top-of-range sessions', () => {
    const ws = [mk('2026-11-01', 50, [12, 12, 12]), mk('2026-11-05', 50, [12, 12, 12])];
    const perf = ws.map((w) => sessionPerf(w, w.exercises[0])!);
    const next = suggestNextLoad(perf, [8, 12], 2, 5, classifyTrend(perf, '2026-11-06'));
    expect(next.action).toBe('increase');
    expect(next.weight).toBe(55);
  });
  it('classifies progressing / declining / insufficient data', () => {
    const up = [mk('2026-10-01', 50, [8, 8]), mk('2026-10-08', 52.5, [9, 9]), mk('2026-10-15', 55, [10, 9])].map((w) => sessionPerf(w, w.exercises[0])!);
    expect(classifyTrend(up, '2026-10-20').cls).toBe('progressing');
    const down = [mk('2026-10-01', 60, [10, 10]), mk('2026-10-08', 55, [9, 9]), mk('2026-10-15', 50, [8, 7])].map((w) => sessionPerf(w, w.exercises[0])!);
    expect(classifyTrend(down, '2026-10-20').cls).toBe('declining');
    expect(classifyTrend(up.slice(0, 2), '2026-10-20').cls).toBe('insufficient_data');
  });
  it('never merges histories from different machines', () => {
    const ws = [
      workout('2026-11-01', [ex('lat_pulldown', [set(50, 10)], 'eq_a')]),
      workout('2026-11-03', [ex('lat_pulldown', [set(70, 10)], 'eq_b')]),
    ];
    const series = buildProgression(ws, reg, [], [], 2, '2026-11-05');
    expect(series.length).toBe(2);
    expect(new Set(series.map((s) => s.key)).size).toBe(2);
  });
  it('gives exercise-specific warm-ups', () => {
    const squat = warmupFor(SEED_BY_ID.back_squat, 100, 2.5, 0);
    expect(squat.sets.length).toBe(3);
    expect(squat.sets[0].weight).toBe(50);
    expect(warmupFor(SEED_BY_ID.lateral_raise, 10, 1, 4).sets.length).toBe(0);
  });
});

describe('learning mode', () => {
  it('stays provisional during the first 30 days and individualizes afterwards', () => {
    const start = '2026-09-01';
    const ws = [];
    for (let i = 0; i < 70; i += 3) ws.push(workout(addDays(start, i), [ex('preacher_curl', [set(20 + i / 10, 10, 1), set(20 + i / 10, 10, 1), set(20 + i / 10, 10, 1)])]));
    const early = analyze(data(ws.filter((w) => w.date < '2026-09-20')), new Date('2026-09-20T12:00:00Z'));
    expect(early.learning.active).toBe(true);
    expect(early.targets.biceps.provisional).toBe(false); // owner 2026-11-25: targets are static (the reference); the own level is an observation
    const later = analyze(data(ws), new Date('2026-11-10T12:00:00Z'));
    expect(later.learning.active).toBe(false);
    expect(later.targets.biceps.provisional).toBe(false);
    expect(later.targets.biceps.source).toBe('reference'); // owner 2026-11-25: static targets
    expect(later.targets.biceps.baseline).not.toBeNull();
  });
});
