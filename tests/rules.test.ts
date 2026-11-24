/** Every calculation adjustment is documented and cites verified references (or says it is a heuristic). */
import { afterEach, describe, expect, it } from 'vitest';
import { REFERENCE_BY_ID } from '../src/data/scientific-evidence/references';
import { RULES } from '../src/data/scientific-evidence/rules';
import { setLang } from '../src/i18n/core';

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

/**
 * Part 7 (owner): every rule separates the PRINCIPLE (what research supports) from the NUMBER (threshold, multiplier,
 * coefficient — a heuristic unless a study gives it), in both languages. A heuristic number is never presented as
 * established, and a study named in a principle must be one the rule cites.
 */
describe('principle vs number', () => {
  afterEach(() => setLang('en', false));
  const CYR = /[А-Яа-яЁё]/;
  /** "Name 2024" / "Name et al. 2024" — a study named in the text. */
  const CITE = /(\p{Lu}[\p{L}'’-]+)(?: et al\.?)? ((?:19|20)\d\d)\b/gu;
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const pairs = () => {
    setLang('en', false);
    const en = RULES.map((r) => ({ id: r.id, basis: r.basis, refIds: [...r.refIds], principle: r.principle, number: r.number }));
    setLang('ru', false);
    const ru = RULES.map((r) => ({ id: r.id, principle: r.principle, number: r.number }));
    setLang('en', false);
    return en.map((e, i) => ({ ...e, ru: ru[i] }));
  };

  it('every rule has a principle and a number in English and in Russian', () => {
    for (const r of pairs()) {
      expect(r.ru.id).toBe(r.id);
      for (const t of [r.principle, r.number]) { expect(t.length, r.id).toBeGreaterThan(10); expect(CYR.test(t), `${r.id}: English text has Cyrillic`).toBe(false); }
      for (const t of [r.ru.principle, r.ru.number]) { expect(t.length, r.id).toBeGreaterThan(10); expect(CYR.test(t), `${r.id}: Russian text is not Russian`).toBe(true); }
    }
  });

  it('a rule without references says that its principle is a practical choice, not research', () => {
    for (const r of pairs().filter((x) => x.refIds.length === 0)) {
      expect(r.principle, r.id).toMatch(/^None — a practical choice of the app/);
      expect(r.ru.principle, r.id).toMatch(/^Нет — практический выбор приложения/);
    }
  });

  it("a heuristic rule's number names no study and says it is the app's choice", () => {
    for (const r of pairs().filter((x) => x.basis === 'heuristic')) {
      for (const t of [r.number, r.ru.number]) {
        expect([...t.matchAll(CITE)].map((m) => m[0]), r.id).toEqual([]);
        for (const id of r.refIds) expect(t, r.id).not.toContain(id);
      }
      expect(r.number, r.id).toMatch(/heuristic|practical choice|chosen by the app|design rule/i);
      expect(r.ru.number, r.id).toMatch(/практическ|выбран|правило устройства/i);
    }
  });

  it('every study named in a principle or a number is one the rule cites; EMG / acute ones are called indirect', () => {
    for (const r of pairs()) {
      for (const [text, indirect] of [[r.principle, /indirect/i], [r.number, /indirect/i], [r.ru.principle, /косвенн/i], [r.ru.number, /косвенн/i]] as const) {
        for (const m of text.matchAll(CITE)) {
          const [name, year] = [norm(m[1]), Number(m[2])];
          const ref = r.refIds.map((id) => REFERENCE_BY_ID[id]).find((x) => x.year === year && norm(x.authors).startsWith(name));
          expect(ref, `${r.id}: "${m[0]}" is not among its references`).toBeDefined();
          if (ref && (ref.outcome === 'emg_activation' || ref.design === 'acute_emg')) expect(text, `${r.id}: ${m[0]} is EMG — must be called indirect`).toMatch(indirect);
        }
      }
    }
  });
});
