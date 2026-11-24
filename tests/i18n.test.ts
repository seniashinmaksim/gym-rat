import { afterEach, describe, expect, it } from 'vitest';
import { byLang, getLang, L, NP, num, P, parseDecimal, ruPlural, setLang } from '../src/i18n/core';

afterEach(() => setLang('en', false));

describe('language layer', () => {
  it('tests run in English by default', () => {
    expect(getLang()).toBe('en');
    expect(L('Rest', 'Отдых')).toBe('Rest');
  });

  it('switches the text of a pair', () => {
    setLang('ru', false);
    expect(L('Rest', 'Отдых')).toBe('Отдых');
  });

  it('Russian plural forms (typed by hand)', () => {
    const f = (n: number) => ruPlural(n, 'подход', 'подхода', 'подходов');
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 0].map(f)).toEqual([
      'подход', 'подхода', 'подхода', 'подходов', 'подходов', 'подходов', 'подходов', 'подход', 'подхода', 'подходов', 'подход', 'подходов', 'подходов',
    ]);
    expect(f(1.5)).toBe('подхода');
  });

  it('counted nouns and numbers in both languages', () => {
    expect(NP(1, ['set', 'sets'], ['подход', 'подхода', 'подходов'])).toBe('1 set');
    expect(P(3, ['set', 'sets'], ['подход', 'подхода', 'подходов'])).toBe('sets');
    expect(num(62.5)).toBe('62.5');
    setLang('ru', false);
    expect(NP(3, ['set', 'sets'], ['подход', 'подхода', 'подходов'])).toBe('3 подхода');
    expect(num(62.5)).toBe('62,5');
    expect(num(60)).toBe('60');
  });

  it('typed numbers accept a comma or a point', () => {
    expect(parseDecimal('62,5')).toBe(62.5);
    expect(parseDecimal('62.5')).toBe(62.5);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });

  it('byLang: a module-level table follows the language and behaves like the plain value', () => {
    let built = 0;
    const items = byLang(() => { built++; return [{ to: '/', label: L('Week', 'Неделя') }, { to: '/body', label: L('Body', 'Тело') }]; });
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(2);
    expect(items.map((x) => x.label)).toEqual(['Week', 'Body']);
    expect([...items][1].label).toBe('Body');
    expect(items.find((x) => x.to === '/body')?.label).toBe('Body');
    setLang('ru', false);
    expect(items.map((x) => x.label)).toEqual(['Неделя', 'Тело']);
    expect(items[0].label).toBe('Неделя');
    setLang('en', false);
    expect(items[0].label).toBe('Week');
    expect(built).toBe(2); // once per language

    const rec = byLang(() => ({ a: L('one', 'один'), b: { c: L('two', 'два') } }));
    expect(Object.keys(rec)).toEqual(['a', 'b']);
    expect(Object.entries(rec).map(([k, v]) => `${k}:${typeof v === 'string' ? v : v.c}`)).toEqual(['a:one', 'b:two']);
    expect({ ...rec }.a).toBe('one');
    expect('a' in rec).toBe(true);
    setLang('ru', false);
    expect(rec.b.c).toBe('два');
    expect(JSON.stringify(rec)).toBe('{"a":"один","b":{"c":"два"}}');
  });
});
