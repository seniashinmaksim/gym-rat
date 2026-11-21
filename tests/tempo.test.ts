/** Exercise-specific execution model: complete, sourced, and never a volume multiplier. */
import { describe, expect, it } from 'vitest';
import { SEED_EXERCISES } from '../src/data/exercises';
import { REFERENCE_BY_ID, REFERENCES } from '../src/data/scientific-evidence/references';
import { EXECUTION_FEEDBACK, TEMPO_PRINCIPLES, TEMPO_PROFILES, tempoFor } from '../src/data/scientific-evidence/tempo';

describe('tempo model', () => {
  it('every library exercise has a profile with short cues and honest confidence', () => {
    for (const e of SEED_EXERCISES) {
      const p = tempoFor(e.id);
      expect(p, e.id).not.toBeNull();
      expect(p!.cues.length, e.id).toBeGreaterThanOrEqual(1);
      for (const c of p!.cues) expect(c.length, `${e.id}: ${c}`).toBeLessThanOrEqual(48);
      expect(['moderate', 'low', 'very_low']).toContain(p!.confidence);
    }
  });
  it('no default 5–10 s negatives', () => {
    for (const p of TEMPO_PROFILES) if (p.eccentricSec) expect(p.eccentricSec[1], p.exerciseIds.join()).toBeLessThanOrEqual(4);
  });
  it('heavy free-weight compounds put stability first; owner-specific exercises are covered individually', () => {
    for (const id of ['back_squat', 'romanian_deadlift']) expect(tempoFor(id)!.maxIntent).toBe('yes_controlled');
    for (const id of ['incline_dumbbell_press', 'pec_deck', 'triceps_pushdown_bar', 'machine_biceps_curl', 'ez_bar_curl', 'lateral_raise', 'cable_lateral_raise', 'back_squat', 'leg_extension', 'romanian_deadlift', 'seated_leg_curl', 'lying_leg_curl', 'hanging_knee_raise_pelvic_curl']) {
      expect(tempoFor(id), id).not.toBeNull();
    }
  });
  it('every cited reference exists and is verified (DOI + PMID); DOIs stay unique after the merge', () => {
    for (const p of [...TEMPO_PROFILES, ...TEMPO_PRINCIPLES]) for (const id of p.refIds) expect(REFERENCE_BY_ID[id], id).toBeDefined();
    const dois = REFERENCES.map((r) => r.doi.toLowerCase());
    expect(new Set(dois).size).toBe(dois.length);
    expect(REFERENCE_BY_ID.enes2025_tempo?.pmid).toBe('42709703');
  });
  it('execution feedback options map to the stored field values', () => {
    expect(EXECUTION_FEEDBACK.map((f) => f.id).sort()).toEqual(['ecc_too_fast', 'ecc_too_slow', 'followed', 'lost_concentric_control', 'momentum', 'short_rom']);
  });
});
