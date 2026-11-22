import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { Workout } from '../domain/types';
import { store, useData } from '../lib/store';
import {
  IconBook, IconCalendar, IconDashboard, IconFlask, IconHeart, IconImport, IconLayers, IconLock, IconMachine, IconMoon,
  IconMore, IconMuscle, IconPlus, IconReport, IconScale, IconSettings, IconSun, IconTimer, IconTrend, IconX,
} from './components/icons';
import { cx, useBackToClose } from './components/ui';
import { applyTheme, useAutoLock } from './hooks';

type NavItem = { to: string; label: string; short?: string; icon: (p: { size?: number }) => JSX.Element };

export const NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Train', items: [
    { to: '/', label: 'Dashboard', icon: IconDashboard },
    { to: '/log', label: 'Log workout', icon: IconPlus },
    { to: '/import', label: 'Import from Claude', short: 'Import', icon: IconImport },
    { to: '/history', label: 'Workout history', short: 'History', icon: IconCalendar },
  ] },
  { section: 'Analyze', items: [
    { to: '/muscles', label: 'Muscle analytics', short: 'Muscles', icon: IconMuscle },
    { to: '/recovery', label: 'Recovery', icon: IconHeart },
    { to: '/strength', label: 'Strength progression', short: 'Strength', icon: IconTrend },
    { to: '/reports', label: 'Reports', icon: IconReport },
    { to: '/periodization', label: 'Periodization', icon: IconLayers },
  ] },
  { section: 'Library', items: [
    { to: '/exercises', label: 'Exercise database', short: 'Exercises', icon: IconBook },
    { to: '/equipment', label: 'Equipment & gyms', short: 'Equipment', icon: IconMachine },
    { to: '/body', label: 'Body tracking', short: 'Body', icon: IconScale },
    { to: '/science', label: 'Scientific sources', short: 'Science', icon: IconFlask },
    { to: '/settings', label: 'Settings & backup', short: 'Settings', icon: IconSettings },
  ] },
];

const BOTTOM: NavItem[] = [
  { to: '/', label: 'Week', icon: IconDashboard },
  { to: '/history', label: 'History', icon: IconCalendar },
  { to: '/log', label: 'Log', icon: IconPlus },
  { to: '/strength', label: 'Strength', icon: IconTrend },
];

export function Layout({ children }: { children: ReactNode }) {
  const data = useData();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useBackToClose(more, () => setMore(false));
  useAutoLock(data.settings.autoLockMinutes);
  useEffect(() => applyTheme(data.settings.theme), [data.settings.theme]);
  useEffect(() => {
    setMore(false);
    window.scrollTo({ top: 0 });
  }, [loc.pathname]);

  const toggleTheme = () => {
    const dark = document.documentElement.classList.contains('dark');
    void store.saveSettings({ theme: dark ? 'light' : 'dark' });
  };

  // Derive from the saved setting (the <html> class is only updated after this render).
  const t = data.settings.theme;
  const isDark = t === 'dark' || (t === 'system' && typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  // The + button resumes a live workout started today that hasn't been finished yet.
  const active = activeWorkout(data.workouts);
  const logTo = active ? `/log/${active.id}` : '/log';

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-200 bg-white/70 px-3 py-4 backdrop-blur dark:border-ink-800 dark:bg-ink-950/70 lg:flex">
        <Brand />
        <nav className="mt-5 flex-1 space-y-5 overflow-y-auto pr-1">
          {NAV.map((g) => (
            <div key={g.section}>
              <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{g.section}</div>
              <div className="space-y-0.5">
                {g.items.map((it) => <SideLink key={it.to} item={it} />)}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-3 flex gap-2 border-t border-ink-200 pt-3 dark:border-ink-800">
          <button onClick={toggleTheme} className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Toggle theme">
            {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <button onClick={() => store.lock()} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-ink-100 text-sm font-medium text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700">
            <IconLock size={16} /> Lock now
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center [@media(max-height:500px)]:static justify-between border-b border-ink-200 bg-ink-50/85 px-3 py-1.5 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/85 lg:hidden" style={{ paddingTop: 'max(6px, env(safe-area-inset-top))' }}>
        <Brand small />
        <div className="flex">
          <button onClick={toggleTheme} className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 active:bg-ink-200 dark:active:bg-ink-800" aria-label="Toggle theme">{isDark ? <IconSun size={20} /> : <IconMoon size={20} />}</button>
          <button onClick={() => store.lock()} className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 active:bg-ink-200 dark:active:bg-ink-800" aria-label="Lock now"><IconLock size={20} /></button>
        </div>
      </header>

      <main className="min-w-0 flex-1">
        {/* An unfinished live workout can be resumed from every screen (one tap). */}
        {active && !loc.pathname.startsWith('/log') && (
          <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6">
            <NavLink to={logTo} className="flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border border-accent-500/40 bg-accent-500/10 px-4 py-2" data-testid="resume-banner">
              <span className="min-w-0 truncate text-sm"><b className="font-semibold text-ink-900 dark:text-white">Workout in progress</b><span className="text-ink-500"> · started {active.startTime ?? ''}</span></span>
              <span className="flex h-10 shrink-0 items-center rounded-xl bg-accent-500 px-4 text-sm font-semibold text-ink-950">Resume</span>
            </NavLink>
          </div>
        )}
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/90 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/90 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {BOTTOM.map((it) => it.to === '/log' ? (
            <NavLink key={it.to} to={logTo} className="relative flex items-center justify-center py-2" aria-label={active ? 'Resume workout in progress' : 'Log workout'}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500 text-ink-950 shadow-lg shadow-accent-500/30">{active ? <IconTimer size={22} /> : <IconPlus size={22} />}</span>
              {active && <span className="absolute right-[calc(50%-26px)] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-rose-500 dark:border-ink-900" aria-hidden />}
            </NavLink>
          ) : (
            <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-accent-600 dark:text-accent-400' : 'text-ink-500')}>
              <it.icon size={21} />{it.label}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-ink-500"><IconMore size={21} />More</button>
        </div>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-ink-200 bg-white p-4 pb-[max(2rem,env(safe-area-inset-bottom))] dark:border-ink-800 dark:bg-ink-900">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">All screens</span>
              <button onClick={() => setMore(false)} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-500" aria-label="Close"><IconX size={20} /></button>
            </div>
            {NAV.map((g) => (
              <div key={g.section} className="mb-3">
                <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">{g.section}</div>
                <div className="grid grid-cols-2 gap-2">
                  {g.items.map((it) => (
                    <NavLink key={it.to} to={it.to === '/log' ? logTo : it.to} end={it.to === '/'} className={({ isActive }) => cx('flex min-h-[48px] items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm', isActive ? 'border-accent-500/50 bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'border-ink-200 text-ink-700 dark:border-ink-800 dark:text-ink-200')}>
                      <it.icon size={18} /> <span className="truncate">{it.short ?? it.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** A live workout dated today (or yesterday, for late sessions) that has not been finished. */
export function activeWorkout(workouts: Workout[]): Workout | null {
  const now = Date.now();
  const recent = workouts.filter((w) => w.source === 'live' && !w.endTime && now - Date.parse(w.createdAt) < 16 * 3_600_000);
  return recent.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => cx(
      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition',
      isActive ? 'bg-accent-500/10 font-semibold text-accent-600 dark:text-accent-400' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800/70 dark:hover:text-white',
    )}>
      <item.icon size={18} /> {item.label}
    </NavLink>
  );
}

export function Brand({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <svg width={small ? 26 : 30} height={small ? 26 : 30} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-ink-900 dark:fill-ink-800" />
        <rect x="5" y="13" width="4" height="6" rx="1" fill="#14b8a6" /><rect x="23" y="13" width="4" height="6" rx="1" fill="#14b8a6" />
        <rect x="9" y="10" width="3" height="12" rx="1" fill="#5eead4" /><rect x="20" y="10" width="3" height="12" rx="1" fill="#5eead4" />
        <rect x="12" y="15" width="8" height="2" fill="#5eead4" />
      </svg>
      <div className="leading-tight">
        <div className={cx('font-semibold tracking-tight text-ink-900 dark:text-white', small ? 'text-sm' : 'text-[15px]')}>Gym Rat</div>
        {!small && <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400">Hypertrophy analytics</div>}
      </div>
    </div>
  );
}
