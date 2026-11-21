/** Every calculation adjustment is documented and cites verified references (or says it is a heuristic). */
import { describe, expect, it } from 'vitest';
import { REFERENCE_BY_ID } from '../src/data/scientific-evidence/references';
import { RULES } from '../src/data/scientific-evidence/rules';

describe('rule registry', () => {
  it('ids are unique and every rule has a rationale, value, confidence and implementation pointer', () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    for (const r of RULES) {
      expect(r.rationale.length, r.id).toBeGreaterThan(20);
      expect(r.value, r.id).toBeTruthy();
      expect(['high', 'moderate', 'low']).toContain(r.confidence);
      expect(r.implementedIn, r.id).toMatch(/src\//);
    }
  });
  it('research-based rules cite at least one verified reference; every cited id exists', () => {
    for (const r of RULES) {
      for (const id of r.refIds) expect(REFERENCE_BY_ID[id], `${r.id} → ${id}`).toBeDefined();
      if (r.basis !== 'heuristic') expect(r.refIds.length, r.id).toBeGreaterThan(0);
    }
  });
  it('a rule resting only on EMG / acute data is never labelled research', () => {
    for (const r of RULES.filter((x) => x.basis === 'research')) {
      const direct = r.refIds.filter((id) => !['emg_activation', 'acute_mps_or_damage'].includes(REFERENCE_BY_ID[id].outcome));
      expect(direct.length, r.id).toBeGreaterThan(0);
    }
  });
});
