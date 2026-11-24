/**
 * F.10: in Russian, no engine text may still be English. Runs the whole engine (analysis, progression,
 * prescriptions, readiness, the planner) on the 26-week synthetic history with the language set to Russian
 * and looks for any three-word English phrase in its output. Names the owner typed (machines, gyms) and
 * stored codes (the benchmark-exclusion code) are data, not texts, and are left out.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { analyze } from '../src/domain/analysis';
import { generateWorkout } from '../src/domain/planner';
import { prescribe } from '../src/domain/prescription';
import { readinessReport } from '../src/domain/readiness';
import { setLang } from '../src/i18n/core';
import { generateSixMonths, SIM_END } from './sim/sixMonth';

afterAll(() => setLang('en', false));

describe('Russian engine output', () => {
  it('contains no English phrase', () => {
    setLang('ru', false);
    const { data } = generateSixMonths();
    const now = new Date(`${SIM_END}T20:00:00Z`);
    const names = [...data.equipment.map((e) => e.name), ...data.locations.map((l) => l.name)].sort((x, y) => y.length - x.length);
    const english: string[] = [];
    const walk = (v: unknown, path: string, depth = 0) => {
      if (depth > 10 || v == null) return;
      if (typeof v === 'string') {
        let t = v;
        for (const n of names) t = t.split(n).join('');
        const m = t.match(/\b[A-Za-z]{3,}\s+[a-z]{3,}\s+[a-z]{2,}\b/);
        if (m) english.push(`${path.replace(/\.\d+/g, '[]')}: ${m[0]} — in «${v.slice(0, 120)}»`);
        return;
      }
      if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}.${i}`, depth + 1)); return; }
      if (typeof v === 'object') for (const [k, x] of Object.entries(v as object)) {
        if (k === 'registry' || k === 'excluded' || k === 'rawInput') continue; // the library object; a stored code; the owner's own message
        walk(x, `${path}.${k}`, depth + 1);
      }
    };
    const a = analyze(data, now);
    walk(a, 'analysis');
    for (const w of data.workouts.slice(-4)) for (let i = 0; i < w.exercises.length; i++) walk(prescribe({ data, analysis: a, workout: w, exerciseIndex: i, now }), 'prescription');
    const r = readinessReport(data, a);
    walk(r, 'readiness');
    walk(generateWorkout({ data, analysis: a, readiness: r, now }), 'plan');
    expect([...new Set(english)]).toEqual([]);
  });
});
