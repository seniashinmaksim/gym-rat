/**
 * Language layer (Part 6, F.10). Two languages, English and Russian.
 *
 * Every user-visible text is written as a pair at the place it is used: `L('Rest', 'Отдых')`.
 * A text therefore cannot exist in one language only, and its context is visible next to it.
 * The current language is a module-level value so that the pure domain functions (reasons, notes,
 * warnings) can produce their texts in it without any React or storage dependency; the default is
 * English, which is what the unit tests run in.
 *
 * The language code is stored OUTSIDE the vault (localStorage) so the lock screen can use it —
 * a language code is not personal data. It is also mirrored in the encrypted settings.
 *
 * This file has no React dependency (the domain imports it); the hook lives in `index.ts`.
 */
export type Lang = 'en' | 'ru';
const KEY = 'gymrat-lang';

let current: Lang = 'en';
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang, persist = true): void {
  if (lang !== 'en' && lang !== 'ru') return;
  const changed = lang !== current;
  current = lang;
  if (persist) {
    try { localStorage.setItem(KEY, lang); } catch { /* storage unavailable: the choice lasts for this visit */ }
  }
  try { document.documentElement.lang = lang; } catch { /* no DOM (tests) */ }
  if (changed) for (const fn of listeners) fn();
}

/** Stored choice → else Russian when the browser is Russian → else English. */
export function detectLang(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'ru' || s === 'en') return s;
  } catch { /* ignore */ }
  try {
    if (typeof navigator !== 'undefined' && /^ru\b/i.test(navigator.language ?? '')) return 'ru';
  } catch { /* ignore */ }
  return 'en';
}

/** Was a language chosen explicitly on this device? (Otherwise the vault's setting may decide.) */
export function hasStoredLang(): boolean {
  try { return localStorage.getItem(KEY) != null; } catch { return false; }
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The text in the current language. */
export function L(en: string, ru: string): string {
  return current === 'ru' ? ru : en;
}

/** Russian plural form: 1 подход · 2 подхода · 5 подходов (also 21 подход, 11 подходов, 1.5 подхода). */
export function ruPlural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (!Number.isInteger(abs)) return few;
  const d10 = abs % 10;
  const d100 = abs % 100;
  if (d10 === 1 && d100 !== 11) return one;
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
  return many;
}

/** A counted noun in the current language: `P(3, ['set', 'sets'], ['подход', 'подхода', 'подходов'])` → "sets" / "подхода". */
export function P(n: number, en: [string, string], ru: [string, string, string]): string {
  return current === 'ru' ? ruPlural(n, ru[0], ru[1], ru[2]) : (n === 1 ? en[0] : en[1]);
}

/** "3 sets" / "3 подхода". */
export function NP(n: number, en: [string, string], ru: [string, string, string]): string {
  return `${num(n)} ${P(n, en, ru)}`;
}

export const locale = (): string => (current === 'ru' ? 'ru-RU' : 'en-GB');

/** A number for display: decimal comma in Russian, at most `digits` decimals, no trailing zeros. */
export function num(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return String(n);
  const f = 10 ** digits;
  const s = String(Math.round(n * f + Math.sign(n) * 1e-9) / f);
  return current === 'ru' ? s.replace('.', ',') : s;
}

/** Parses what a person types: "62,5" and "62.5" are both 62.5; anything else → null. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(/\s+/g, '').replace(',', '.');
  if (t === '' || !/^-?\d*\.?\d*$/.test(t) || t === '-' || t === '.' || t === '-.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const KG = () => L('kg', 'кг');
