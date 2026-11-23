import { Component, lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './lib/store';
import { Toaster } from './ui/components/ui';
import { Layout } from './ui/Layout';
import { LockScreen } from './ui/pages/LockScreen';
import { DashboardPage } from './ui/pages/Dashboard';

/**
 * After a new deployment, an open tab may request code chunks that no longer exist.
 * Reload once to pick up the new build instead of showing an error.
 */
function loadChunk<T>(fn: () => Promise<T>): Promise<T> {
  return fn().then(
    (m) => {
      try { sessionStorage.removeItem('gymrat-chunk-reload'); } catch { /* ignore */ }
      return m;
    },
    (err) => {
      let reloaded = false;
      try { reloaded = sessionStorage.getItem('gymrat-chunk-reload') === '1'; sessionStorage.setItem('gymrat-chunk-reload', '1'); } catch { /* ignore */ }
      if (!reloaded) window.location.reload();
      throw err;
    },
  );
}

const LoggerPage = lazy(() => loadChunk(() => import('./ui/pages/Train')).then((m) => ({ default: m.LogPage })));
const ImportPage = lazy(() => loadChunk(() => import('./ui/pages/Import')).then((m) => ({ default: m.ImportPage })));
const HistoryPage = lazy(() => loadChunk(() => import('./ui/pages/History')).then((m) => ({ default: m.HistoryPage })));
const MusclesPage = lazy(() => loadChunk(() => import('./ui/pages/Muscles')).then((m) => ({ default: m.MusclesPage })));
const RecoveryPage = lazy(() => loadChunk(() => import('./ui/pages/Recovery')).then((m) => ({ default: m.RecoveryPage })));
const StrengthPage = lazy(() => loadChunk(() => import('./ui/pages/Strength')).then((m) => ({ default: m.StrengthPage })));
const ReportsPage = lazy(() => loadChunk(() => import('./ui/pages/Reports')).then((m) => ({ default: m.ReportsPage })));
const PeriodizationPage = lazy(() => loadChunk(() => import('./ui/pages/Periodization')).then((m) => ({ default: m.PeriodizationPage })));
const ExercisesPage = lazy(() => loadChunk(() => import('./ui/pages/Exercises')).then((m) => ({ default: m.ExercisesPage })));
const EquipmentPage = lazy(() => loadChunk(() => import('./ui/pages/Equipment')).then((m) => ({ default: m.EquipmentPage })));
const BodyPage = lazy(() => loadChunk(() => import('./ui/pages/Body')).then((m) => ({ default: m.BodyPage })));
const SciencePage = lazy(() => loadChunk(() => import('./ui/pages/Science')).then((m) => ({ default: m.SciencePage })));
const SettingsPage = lazy(() => loadChunk(() => import('./ui/pages/Settings')).then((m) => ({ default: m.SettingsPage })));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-6 pt-10">
        <h1 className="text-lg font-semibold">This screen hit an error</h1>
        <p className="mt-2 text-sm text-ink-500">Your data is safe — nothing was changed. Details: {this.state.error.message}</p>
        <button className="mt-4 rounded-xl bg-accent-500 px-4 py-2 text-sm font-semibold text-ink-950" onClick={() => { this.setState({ error: null }); location.hash = '#/'; }}>Back to dashboard</button>
      </div>
    );
  }
}

function Loading() {
  return <div className="mx-auto max-w-6xl px-6 pt-8"><div className="h-8 w-48 animate-pulse rounded-lg bg-ink-200 dark:bg-ink-800" /><div className="mt-6 h-64 animate-pulse rounded-2xl bg-ink-200/60 dark:bg-ink-800/60" /></div>;
}

export function App() {
  const { status } = useStore();
  if (status !== 'unlocked') return <LockScreen />;
  return (
    <HashRouter>
      <Layout>
        <ErrorBoundary>
        <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/log" element={<LoggerPage />} />
          <Route path="/log/:id" element={<LoggerPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/muscles" element={<MusclesPage />} />
          <Route path="/recovery" element={<RecoveryPage />} />
          <Route path="/strength" element={<StrengthPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/periodization" element={<PeriodizationPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/equipment" element={<EquipmentPage />} />
          <Route path="/body" element={<BodyPage />} />
          <Route path="/science" element={<SciencePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
      </Layout>
      <Toaster />
    </HashRouter>
  );
}
