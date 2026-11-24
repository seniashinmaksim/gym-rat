/**
 * Part 10 — the formula dependency map stays true to the code (FIX_PLAN J.3):
 *  - every node points at a real declaration, every edge is backed by a real reference / data flow (scripts/formula-map.mjs);
 *  - every rule id exists in rules.ts and the doc's Mermaid blocks, traceability table and SVGs are regenerated from it;
 *  - the worked examples in docs/FORMULA_DEPENDENCY_MAP.md are recomputed here with the real formulas (synthetic data).
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-ignore — dev-only ESM script without type declarations
import { renderDoc, ruleBases, svg, validate } from '../scripts/formula-map.mjs';
// @ts-ignore — dev-only ESM script without type declarations
import { buildGraph } from '../scripts/formula-graph.mjs';
// @ts-ignore — dev-only ESM script without type declarations
import { NODES, VIEWS } from '../scripts/formula-map.views.mjs';
import { RULES } from '../src/data/scientific-evidence/rules';
import { analyze } from '../src/domain/analysis';
import { buildRegistry } from '../src/domain/registry';
import { computeVolume } from '../src/domain/volume';
import { bestMoveDay, forwardChecks, movePartners } from '../src/domain/sequence';
import { generateWorkout } from '../src/domain/planner';
import { readinessReport } from '../src/domain/readiness';
import { optimality } from '../src/domain/optimality';
import { data, ex, set, workout } from './fixtures';
import type { Workout, WorkoutExercise } from '../src/domain/types';

const DOC = 'docs/FORMULA_DEPENDENCY_MAP.md';

describe('the map is backed by the code', () => {
  const graph = buildGraph({ texts: true });
  it('every node exists and every edge is a real reference or data flow', () => {
    expect(validate(graph)).toEqual([]);
  });
  it('every rule id on a node is in the rule registry, with the same basis', () => {
    const bases = ruleBases();
    for (const n of Object.values(NODES) as { rules?: string[] }[]) for (const r of n.rules ?? []) {
      const rule = RULES.find((x) => x.id === r);
      expect(rule, r).toBeDefined();
      expect(bases[r]).toBe(rule!.basis);
    }
  });
  it('every major family is present (input → set → muscle → week → decisions → screens)', () => {
    const layers = new Set((Object.values(NODES) as { layer: string }[]).map((n) => n.layer));
    expect([...layers].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    for (const id of ['assess', 'volume', 'recovery', 'targets', 'fit', 'prog', 'nextload', 'prescribe', 'planner', 'replan', 'choice', 'forward', 'optimality']) expect(NODES[id], id).toBeDefined();
    expect(VIEWS.map((v: { id: string }) => v.id)).toEqual(['overview', 'set-level', 'volume-week', 'strength', 'planning', 'recovery-interference', 'optimality']);
  });
  it('the doc and the SVGs are up to date (run `node scripts/formula-map.mjs` after a change)', () => {
    const { texts, ...plain } = graph; void texts;
    const doc = fs.readFileSync(DOC, 'utf8');
    expect(renderDoc(doc, plain, ruleBases())).toBe(doc);
    for (const v of VIEWS) expect(fs.readFileSync(`docs/diagrams/${v.id}.svg`, 'utf8')).toBe(svg(v, ruleBases()) + '\n');
  });
});

// ---------------------------------------------------------------- worked examples (values quoted in the doc)

const times = <T>(n: number, mk: () => T) => Array.from({ length: n }, mk);

describe('worked example 1 — logging sets → weekly volume', () => {
  it('pec deck 4 × 40 kg × 12 @ RIR 2 → chest 4.0, front delts 1.0; incline press 1 set with EASY → chest 0.8, triceps 0.4, front delts 0.4', () => {
    const reg = buildRegistry([], []);
    const d = data([]);
    const w = workout('2026-11-16', [
      ex('pec_deck', times(4, () => set(40, 12, 2)), 'pd'),
      ex('incline_dumbbell_press', [set(26, 10, null, { effort: 'easy' })]),
    ]);
    const v = computeVolume([w], reg, d.settings.quality).muscles;
    expect(v.chest?.effective).toBeCloseTo(4.8, 5);
    expect(v.front_delts?.effective).toBeCloseTo(1.4, 5);
    expect(v.triceps?.effective).toBeCloseTo(0.4, 5);
  });
});

// The Part 8 / Part 9 week: Mon pec deck + curls, Tue pull-ups + rows, Thu legs + pec deck (4 full weeks).
const pec = (n: number) => ex('pec_deck', times(n, () => set(40, 12, 2)), 'pd');
const curls = (n: number) => ex('machine_biceps_curl', times(n, () => set(30, 10, 1)), 'bc');
const pullups = (n: number) => ex('pull_up', times(n, () => set(0, 8, 2, { loadMode: 'bodyweight_plus' })), null, { variation: { loading: 'bodyweight', gripWidth: 'shoulder' } });
const rows = (n: number) => ex('seated_cable_row', times(n, () => set(50, 10, 2)), 'row');
const legs = (n: number) => ex('leg_extension', times(n, () => set(50, 12, 2)), 'le');
const day = (dd: string, exs: WorkoutExercise[]) => workout(dd, exs, { startTime: '17:00', endTime: '18:00' });
function week(): { d: ReturnType<typeof data>; w: Workout } {
  const out: Workout[] = [];
  for (const [mon, tu, th] of [['2026-10-19', '2026-10-20', '2026-10-22'], ['2026-10-26', '2026-10-27', '2026-10-29'], ['2026-11-02', '2026-11-03', '2026-11-05'], ['2026-11-09', '2026-11-10', '2026-11-12']]) {
    out.push(day(mon, [pec(4), curls(4)]), day(tu, [pullups(4), rows(3)]), day(th, [legs(3), pec(3)]));
  }
  const w = workout('2026-11-16', [pec(4)], { startTime: '17:00' });
  return { d: data([...out, w]), w };
}
const NOW = new Date('2026-11-16T17:30:00Z');

describe('worked examples 2 and 3 — choosing the next exercise, moving one', () => {
  it('Monday after 4 pec-deck sets: 2 pull-ups score 100; 4 curls are NOT TODAY (Tuesday pull-ups, 12 h of the biceps window left)', () => {
    const { d, w } = week();
    const a = analyze(d, NOW);
    expect(optimality({ data: d, analysis: a, workout: w, exerciseId: 'pull_up', sets: 2 }).score).toBe(100);
    const curl = optimality({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(curl.group).toBe('not_today');
    const f = forwardChecks({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 });
    expect(f.map((x) => [x.check, x.severity, x.date, x.muscle, x.affectsExerciseId, x.hoursLeft])).toEqual([['interference', 'limit', '2026-11-17', 'biceps', 'pull_up', 12]]);
    expect(bestMoveDay({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 })).toEqual({ date: '2026-11-17', clean: true });
  });
  it('the reason text of the curls (example 2.2)', () => {
    const { d, w } = week();
    const a = analyze(d, NOW);
    expect(optimality({ data: d, analysis: a, workout: w, exerciseId: 'machine_biceps_curl', sets: 4 }).reason).toMatch(/May reduce Tuesday's pull-up — biceps still recovering\./);
  });
  it('example 2.3: triceps week met → incline press −20, pec deck ranks above it', () => {
    const { d, w } = week();
    const d2 = { ...d, settings: { ...d.settings, targetOverrides: { triceps: { min: 0, preferred: 0.5, max: 4 } } } };
    const tri = { ...w, exercises: [...w.exercises, ex('triceps_pushdown_rope', [set(25, 12, 2)])] };
    const d3 = { ...d2, workouts: d2.workouts.map((x) => (x.id === w.id ? tri : x)) };
    const a = analyze(d3, NOW);
    const inc = optimality({ data: d3, analysis: a, workout: tri, exerciseId: 'incline_dumbbell_press' });
    const fly = optimality({ data: d3, analysis: a, workout: tri, exerciseId: 'pec_deck', equipmentId: 'pd' });
    expect(inc.deductions.find((x) => x.factor === 'secondary_week_met')?.points).toBe(20);
    expect(fly.score!).toBeGreaterThan(inc.score!);
  });
  it('example 3: the curls move alone, and Tuesday’s plan puts them after the pull-ups', () => {
    const { d, w } = week();
    const a = analyze(d, NOW);
    expect(movePartners(d, a, 'machine_biceps_curl', ['pec_deck', 'machine_biceps_curl'], '2026-11-17')).toEqual([]);
    const move = { id: 'mv', exerciseId: 'machine_biceps_curl', equipmentId: 'bc', sets: 4, fromDate: '2026-11-16', date: '2026-11-17', reason: 'synthetic', createdAt: '2026-11-16T17:40:00Z' };
    const done = { ...w, endTime: '18:00' };
    const dT = { ...d, workouts: d.workouts.map((x) => (x.id === w.id ? done : x)), settings: { ...d.settings, plannedMoves: [move] } };
    const tue = new Date('2026-11-17T16:00:00Z');
    const aT = analyze(dT, tue);
    const plan = generateWorkout({ data: dT, analysis: aT, now: tue, locationId: 'gym_a', readiness: readinessReport(dT, aT) }).items.map((x) => x.exerciseId);
    expect(plan).toContain('machine_biceps_curl');
    expect(plan.indexOf('pull_up')).toBeGreaterThanOrEqual(0);
    expect(plan.indexOf('machine_biceps_curl')).toBeGreaterThan(plan.indexOf('pull_up'));
    expect(plan).toEqual(['pull_up', 'machine_biceps_curl']);
  });
});
