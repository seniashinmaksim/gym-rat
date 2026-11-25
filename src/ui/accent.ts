/**
 * ONE accent colour for the whole app (owner 2026-11-25: the main screens were teal, the training mode orange).
 * The palette lives in CSS variables on <html data-accent="…"> (src/index.css); Tailwind's `accent-*` classes and the
 * training mode's `--t-accent` both read them. The choice is `settings.trainAccent` (default ember); it is mirrored
 * outside the vault (`gymrat-accent`, not personal data) so the lock screen has the same colour.
 */
export type AccentId = 'ember' | 'volt' | 'ice';
export const DEFAULT_ACCENT: AccentId = 'ember';
const KEY = 'gymrat-accent';

/** Hex values for places that cannot read a CSS variable (chart strokes). Must match src/index.css. */
export const ACCENT_HEX: Record<AccentId, { 300: string; 400: string; 500: string; 600: string }> = {
  ember: { 300: '#fdba74', 400: '#ff8a4c', 500: '#ff5a1f', 600: '#ea4a10' },
  volt: { 300: '#e3fa8a', 400: '#d4f75c', 500: '#c6f432', 600: '#5d7c00' },
  ice: { 300: '#bae6fd', 400: '#7dd3fc', 500: '#38bdf8', 600: '#0284c7' },
};

const valid = (x: unknown): x is AccentId => x === 'ember' || x === 'volt' || x === 'ice';

export function storedAccent(): AccentId {
  try { const v = localStorage.getItem(KEY); return valid(v) ? v : DEFAULT_ACCENT; } catch { return DEFAULT_ACCENT; }
}

export function applyAccent(id: AccentId | undefined | null): void {
  const a = valid(id) ? id : DEFAULT_ACCENT;
  if (typeof document !== 'undefined') document.documentElement.dataset.accent = a;
  try { localStorage.setItem(KEY, a); } catch { /* private mode */ }
}

/** The current accent's hex for a chart line. */
export function accentHex(shade: 300 | 400 | 500 | 600 = 500, id: AccentId | undefined | null = undefined): string {
  const a = valid(id) ? id : typeof document !== 'undefined' && valid(document.documentElement.dataset.accent) ? document.documentElement.dataset.accent as AccentId : DEFAULT_ACCENT;
  return ACCENT_HEX[a][shade];
}
