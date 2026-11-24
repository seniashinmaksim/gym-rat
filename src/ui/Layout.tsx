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
import { byLang, getLang, hasStoredLang, L, setLang, type Lang } from '../i18n';

type NavItem = { to: string; label: string; short?: string; icon: (p: { size?: number }) => JSX.Element };

export const NAV: { section: string; items: NavItem[] }[] = byLang(() => [
  { section: L('Train', 'Тренировка'), items: [
    { to: '/', label: L('Week', 'Неделя'), icon: IconDashboard },
    { to: '/log', label: L('Log workout', 'Записать тренировку'), short: L('Workout', 'Тренировка'), icon: IconPlus },
    { to: '/import', label: L('Import from Claude', 'Импорт из Claude'), short: L('Import', 'Импорт'), icon: IconImport },
    { to: '/history', label: L('Workout history', 'История тренировок'), short: L('History', 'История'), icon: IconCalendar },
  ] },
  { section: L('Analyze', 'Анализ'), items: [
    { to: '/muscles', label: L('Muscle analytics', 'Анализ по мышцам'), short: L('Muscles', 'Мышцы'), icon: IconMuscle },
    { to: '/recovery', label: L('Recovery', 'Восстановление'), icon: IconHeart },
    { to: '/strength', label: L('Strength progression', 'Прогресс в силе'), short: L('Strength', 'Сила'), icon: IconTrend },
    { to: '/reports', label: L('Reports', 'Отчёты'), icon: IconReport },
    { to: '/periodization', label: L('Periodization', 'Периодизация'), icon: IconLayers },
  ] },
  { section: L('Library', 'Справочники'), items: [
    { to: '/exercises', label: L('Exercise database', 'База упражнений'), short: L('Exercises', 'Упражнения'), icon: IconBook },
    { to: '/equipment', label: L('Equipment & gyms', 'Оборудование и залы'), short: L('Equipment', 'Оборудование'), icon: IconMachine },
    { to: '/body', label: L('Body tracking', 'Тело и замеры'), short: L('Body', 'Тело'), icon: IconScale },
    { to: '/science', label: L('Scientific sources', 'Научные источники'), short: L('Science', 'Наука'), icon: IconFlask },
    { to: '/settings', label: L('Settings & backup', 'Настройки и резервная копия'), short: L('Settings', 'Настройки'), icon: IconSettings },
  ] },
]);

const BOTTOM: NavItem[] = byLang(() => [
  { to: '/', label: L('Week', 'Неделя'), icon: IconDashboard },
  { to: '/history', label: L('History', 'История'), icon: IconCalendar },
  { to: '/log', label: L('Log', 'Запись'), icon: IconPlus },
  { to: '/strength', label: L('Strength', 'Сила'), icon: IconTrend },
]);

/** Switches the app language. Stored outside the vault (the lock screen uses it) and mirrored in the settings when unlocked. */
export function switchLang(to: Lang, save = true) {
  setLang(to);
  if (save && store.getState().status === 'unlocked') void store.saveSettings({ language: to });
}

/** EN / RU switch: shows the language it switches TO. */
export function LangToggle({ className, save = true }: { className?: string; save?: boolean }) {
  const to: Lang = getLang() === 'ru' ? 'en' : 'ru';
  return (
    <button type="button" onClick={() => switchLang(to, save)} data-testid="lang-toggle" data-lang={getLang()} lang={to}
      className={className} aria-label={to === 'ru' ? 'Переключить на русский' : 'Switch to English'}>
      <span className="text-xs font-bold tracking-wide">{to === 'ru' ? 'RU' : 'EN'}</span>
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const data = useData();
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useBackToClose(more, () => setMore(false));
  useAutoLock(data.settings.autoLockMinutes);
  useEffect(() => applyTheme(data.settings.theme), [data.settings.theme]);
  // A device with no stored choice takes the language saved in the vault (e.g. after restoring a backup).
  useEffect(() => { if (!hasStoredLang() && data.settings.language && data.settings.language !== getLang()) setLang(data.settings.language); }, [data.settings.language]);
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
          <button onClick={toggleTheme} className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label={L('Toggle theme', 'Сменить тему')}>
            {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
          </button>
          <LangToggle className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" />
          <button onClick={() => store.lock()} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-ink-100 text-sm font-medium text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700">
            <IconLock size={16} /> {L('Lock now', 'Заблокировать')}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center [@media(max-height:500px)]:static justify-between border-b border-ink-200 bg-ink-50/85 px-3 py-1.5 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/85 lg:hidden" style={{ paddingTop: 'max(6px, env(safe-area-inset-top))' }}>
        <Brand small />
        <div className="flex">
          <button onClick={toggleTheme} className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 active:bg-ink-200 dark:active:bg-ink-800" aria-label={L('Toggle theme', 'Сменить тему')}>{isDark ? <IconSun size={20} /> : <IconMoon size={20} />}</button>
          <LangToggle className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 active:bg-ink-200 dark:active:bg-ink-800" />
          <button onClick={() => store.lock()} className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 active:bg-ink-200 dark:active:bg-ink-800" aria-label={L('Lock now', 'Заблокировать')}><IconLock size={20} /></button>
        </div>
      </header>

      <main className="min-w-0 flex-1">
        {/* An unfinished live workout can be resumed from every screen (one tap). */}
        {active && !loc.pathname.startsWith('/log') && (
          <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6">
            <NavLink to={logTo} className="flex min-h-[48px] items-center justify-between gap-3 rounded-2xl border border-accent-500/40 bg-accent-500/10 px-4 py-2" data-testid="resume-banner">
              <span className="min-w-0 truncate text-sm"><b className="font-semibold text-ink-900 dark:text-white">{L('Workout in progress', 'Идёт тренировка')}</b><span className="text-ink-500"> · {L('started', 'начата в')} {active.startTime ?? ''}</span></span>
              <span className="flex h-10 shrink-0 items-center rounded-xl bg-accent-500 px-4 text-sm font-semibold text-ink-950">{L('Resume', 'Продолжить')}</span>
            </NavLink>
          </div>
        )}
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/90 backdrop-blur-md dark:border-ink-800 dark:bg-ink-900/90 lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto grid max-w-md grid-cols-5">
          {BOTTOM.map((it) => it.to === '/log' ? (
            <NavLink key={it.to} to={logTo} className="relative flex items-center justify-center py-2" aria-label={active ? L('Resume workout in progress', 'Продолжить тренировку') : L('Log workout', 'Записать тренировку')}>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500 text-ink-950 shadow-lg shadow-accent-500/30">{active ? <IconTimer size={22} /> : <IconPlus size={22} />}</span>
              {active && <span className="absolute right-[calc(50%-26px)] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-rose-500 dark:border-ink-900" aria-hidden />}
            </NavLink>
          ) : (
            <NavLink key={it.to} to={it.to} end={it.to === '/'} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-accent-600 dark:text-accent-400' : 'text-ink-500')}>
              <it.icon size={21} />{it.label}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-ink-500"><IconMore size={21} />{L('More', 'Ещё')}</button>
        </div>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-ink-200 bg-white p-4 pb-[max(2rem,env(safe-area-inset-bottom))] dark:border-ink-800 dark:bg-ink-900">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">{L('All screens', 'Все экраны')}</span>
              <button onClick={() => setMore(false)} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-500" aria-label={L('Close', 'Закрыть')}><IconX size={20} /></button>
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
        {!small && <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400">{L('Hypertrophy analytics', 'Аналитика гипертрофии')}</div>}
      </div>
    </div>
  );
}
