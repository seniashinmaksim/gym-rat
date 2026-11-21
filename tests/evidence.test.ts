import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '../src/data/exercises';
import {
  EXERCISE_EVIDENCE,
  GENERAL_EVIDENCE,
  INDIRECT_OUTCOMES,
  MUSCLE_EVIDENCE,
  REFERENCES,
  REFERENCE_BY_ID,
} from '../src/data/scientific-evidence';
import { MUSCLE_IDS } from '../src/domain/types';

const muscleFindings = Object.values(MUSCLE_EVIDENCE).flatMap((m) => m.findings);
const citedFindings = [...muscleFindings, ...EXERCISE_EVIDENCE];

describe('research library: references', () => {
  it('every reference has doi, pmid, design, outcome, confidence and finding', () => {
    for (const r of REFERENCES) {
      expect(r.doi, r.id).toMatch(/^10\.\d{4,9}\/\S+$/);
      expect(r.pmid, r.id).toMatch(/^\d{6,9}$/);
      expect(r.url, r.id).toBe(`https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/`);
      expect(r.design, r.id).toBeTruthy();
      expect(r.outcome, r.id).toBeTruthy();
      expect(['high', 'moderate', 'low'], r.id).toContain(r.confidence);
      expect(r.finding.length, r.id).toBeGreaterThan(20);
      expect(r.verifiedOn).toBe('2026-11-21');
      for (const m of r.muscles) expect(MUSCLE_IDS as readonly string[], r.id).toContain(m);
    }
  });

  it('ids, DOIs and PMIDs are unique', () => {
    const uniq = (xs: string[]) => new Set(xs).size === xs.length;
    expect(uniq(REFERENCES.map((r) => r.id))).toBe(true);
    expect(uniq(REFERENCES.map((r) => r.doi.toLowerCase()))).toBe(true);
    expect(uniq(REFERENCES.map((r) => r.pmid))).toBe(true);
    expect(Object.keys(REFERENCE_BY_ID)).toHaveLength(REFERENCES.length);
  });
});

describe('research library: citations', () => {
  it('every cited refId exists', () => {
    const all = [...citedFindings.flatMap((f) => f.refIds), ...GENERAL_EVIDENCE.flatMap((g) => g.refIds)];
    for (const id of all) expect(REFERENCE_BY_ID[id], id).toBeDefined();
  });

  it('EMG / acute / MPS references are only cited by findings marked indirect', () => {
    for (const f of citedFindings) {
      if (f.indirect) continue;
      for (const id of f.refIds) {
        expect(INDIRECT_OUTCOMES, `${id} in "${f.text.slice(0, 60)}"`).not.toContain(REFERENCE_BY_ID[id].outcome);
      }
    }
  });

  it('a finding without references is marked indirect', () => {
    for (const f of citedFindings) if (f.refIds.length === 0) expect(f.indirect, f.text.slice(0, 60)).toBe(true);
  });
});

describe('research library: muscles', () => {
  it('every MuscleId has an entry', () => {
    for (const m of MUSCLE_IDS) {
      expect(MUSCLE_EVIDENCE[m], m).toBeDefined();
      expect(MUSCLE_EVIDENCE[m].muscle).toBe(m);
      expect(MUSCLE_EVIDENCE[m].summary.length, m).toBeGreaterThan(20);
    }
  });

  it('muscles with no references are marked limited or very limited and explain why', () => {
    for (const m of MUSCLE_IDS) {
      const e = MUSCLE_EVIDENCE[m];
      const refs = e.findings.flatMap((f) => f.refIds);
      if (refs.length === 0) {
        expect(['limited', 'very_limited'], m).toContain(e.evidenceLevel);
        expect(e.limitation?.length ?? 0, m).toBeGreaterThan(0);
      }
      if (e.evidenceLevel === 'limited' || e.evidenceLevel === 'very_limited') {
        expect(e.limitation?.length ?? 0, m).toBeGreaterThan(0);
      }
    }
  });

  it('indirectOnly matches the findings', () => {
    for (const m of MUSCLE_IDS) {
      const e = MUSCLE_EVIDENCE[m];
      expect(e.indirectOnly, m).toBe(e.findings.length > 0 && e.findings.every((f) => f.indirect));
    }
  });
});

describe('research library: exercises', () => {
  it('every exercise id exists in the exercise library', () => {
    const ids = new Set(SEED_EXERCISES.map((e) => e.id));
    for (const e of EXERCISE_EVIDENCE) {
      expect(e.exerciseIds.length).toBeGreaterThan(0);
      for (const id of e.exerciseIds) expect(ids.has(id), id).toBe(true);
    }
  });
});
