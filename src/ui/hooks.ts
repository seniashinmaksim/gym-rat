import { useEffect, useMemo, useState } from 'react';
import { analyze, type Analysis } from '../domain/analysis';
import type { AppData } from '../domain/appdata';
import { muscleName } from '../domain/muscles';
import type { ExerciseDef, MuscleId } from '../domain/types';
import { store, useData } from '../lib/store';

/**
 * Memoized analysis of the whole dataset. Recomputed when data changes, every minute (so recovery
 * windows, "today" and the week roll forward with the clock), and immediately when the app comes
 * back to the foreground — phones pause timers in the background.
 */
export function useAnalysis(): Analysis {
  const data = useData();
  const minute = useMinuteTick();
  return useMemo(() => analyze(data), [data, minute]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function analyzeWith(data: AppData) {
  return analyze(data);
}

function useMinuteTick() {
  const [t, setT] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const tick = () => setT(Math.floor(Date.now() / 60_000));
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    const id = setInterval(tick, 20_000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', tick);
    window.addEventListener('pageshow', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, []);
  return t;
}

/** Exercise display name honouring the EN/RU preference. */
export function useNames() {
  const data = useData();
  const lang = data.settings.exerciseNames;
  return useMemo(() => ({
    ex: (def: ExerciseDef | undefined, fallback = 'Unknown exercise') => {
      if (!def) return fallback;
      if (lang === 'ru') return def.name.ru;
      return def.name.en;
    },
    exSub: (def: ExerciseDef | undefined) => (def && lang === 'both' ? def.name.ru : null),
    muscle: (m: MuscleId) => muscleName(m, lang === 'ru' ? 'ru' : 'en'),
    muscleSub: (m: MuscleId) => (lang === 'both' ? muscleName(m, 'ru') : null),
    lang,
  }), [lang]);
}

/** Applies dark/light theme. Before unlock the preference is read from localStorage (non-sensitive). */
export function applyTheme(theme: 'system' | 'dark' | 'light') {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', !!dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1116' : '#f6f7f9');
  try {
    localStorage.setItem('gymrat-theme', theme);
  } catch {
    /* storage unavailable */
  }
}

export function initialTheme(): 'system' | 'dark' | 'light' {
  try {
    const t = localStorage.getItem('gymrat-theme');
    if (t === 'dark' || t === 'light' || t === 'system') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}

/** Locks the vault after N minutes without user interaction, and when the tab has been hidden that long. */
export function useAutoLock(minutes: number) {
  useEffect(() => {
    if (!minutes || minutes <= 0) return;
    const ms = minutes * 60_000;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const check = () => {
      if (Date.now() - last >= ms) store.lock();
    };
    const id = setInterval(check, 10_000);
    const vis = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [minutes]);
}

export function usePhotoUrl(id: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!id) {
      setUrl(null);
      return;
    }
    store.photoUrl(id).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}
