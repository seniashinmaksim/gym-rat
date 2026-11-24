/**
 * State of ONE workout being edited: the in-memory copy, the encrypted autosave and Undo.
 *
 *  - `update(fn)` applies a change; it is written debounced (350 ms), or at once with `{ now: true }`
 *    (a logged set is never left in a timer);
 *  - pending writes are flushed when the page hides, the screen unmounts and right before the vault locks;
 *  - `undoable(msg, revert)` shows a short confirmation with Undo. An undo reaches the workout even when
 *    this screen was closed and re-opened meanwhile (`liveEditors`), and says so when nothing could be undone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isFinished, withCorrections } from '../../domain/feedback';
import type { Workout } from '../../domain/types';
import { store } from '../../lib/store';
import { L } from '../../i18n';
import { toast, undoToast } from '../components/ui';
import { liveEditors, type WorkoutUpdate } from './liveEditors';

export function useLiveWorkout(initial: Workout, describe: (exerciseId: string) => string = (id) => id) {
  const [w, setW] = useState<Workout>(initial);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const saveTimer = useRef<number | null>(null);
  const initialRef = useRef(initial);
  const describeRef = useRef(describe);
  describeRef.current = describe;
  // The newest copy, updated synchronously by `update` (several changes in one tick build on each other).
  const latest = useRef(w);
  // Writes of one workout are strictly ordered: an Undo saved right after a removal can never be
  // overtaken by the earlier (slower) write.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const queue = useCallback(<T,>(job: () => Promise<T>): Promise<T> => {
    const p = chain.current.catch(() => undefined).then(job);
    chain.current = p;
    return p;
  }, []);
  const write = useCallback((next: Workout) => queue(() => store.saveWorkout(next)), [queue]);

  const update: WorkoutUpdate = useCallback((fn, opts) => {
    if (!mounted.current) {
      const other = liveEditors.get(initialRef.current.id);
      if (other && other !== updateRef.current) { other(fn, opts); return; }
      const cur = store.getState().data?.workouts.find((x) => x.id === initialRef.current.id);
      if (cur) void write(withCorrections(initialRef.current, fn(cur), new Date().toISOString(), (id) => describeRef.current(id))).catch(() => undefined);
      return;
    }
    // Computed from the latest copy OUTSIDE the state updater: an updater may run twice (StrictMode) and
    // must not start timers or writes.
    const prev = latest.current;
    const next = withCorrections(initialRef.current, fn(prev), new Date().toISOString(), (id) => describeRef.current(id));
    if (next === prev) return;
    latest.current = next;
    setW(next);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (opts?.now) {
      saveTimer.current = null;
      void write(next).catch(() => toast(L('Could not save — the set is kept on screen; it will be saved with the next change', 'Не удалось сохранить — подход остаётся на экране и сохранится со следующим изменением'), 'bad'));
    } else {
      saveTimer.current = window.setTimeout(() => { saveTimer.current = null; void write(latest.current).catch(() => undefined); }, 350);
    }
  }, [write]);
  const updateRef = useRef(update);
  updateRef.current = update;
  useEffect(() => {
    liveEditors.set(initial.id, update);
    return () => { if (liveEditors.get(initial.id) === update) liveEditors.delete(initial.id); };
  }, [initial.id, update]);

  const undoable = useCallback((msg: string, revert: (x: Workout) => Workout) => undoToast(msg, () => {
    const safe = (x: Workout) => {
      const r = revert(x);
      // A finished workout never gets unperformed (planned) sets back.
      return r !== x && isFinished(r) ? { ...r, exercises: r.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => !s.planned) })) } : r;
    };
    const cur = mounted.current ? latest.current : store.getState().data?.workouts.find((x) => x.id === initialRef.current.id);
    if (cur && safe(cur) === cur) return false;
    update(safe, { now: true });
    return true;
  }), [update]);

  /** Drop a pending debounced save (before delete / finish): the unmount flush must not write it back. */
  const cancelSave = useCallback(() => { if (saveTimer.current) window.clearTimeout(saveTimer.current); saveTimer.current = null; }, []);
  /** Replace the in-memory copy without scheduling a write (the caller saves). */
  const replace = useCallback((next: Workout) => { cancelSave(); latest.current = next; setW(next); }, [cancelSave]);

  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void write(latest.current).catch(() => undefined);
      }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    const offLock = store.onBeforeLock(flush);
    return () => {
      offLock();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [write]);

  return { w, update, undoable, cancelSave, replace, latest, queue };
}
