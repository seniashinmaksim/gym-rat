import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { activeWorkout } from '../Layout';
import { localNowParts, formatDate } from '../../domain/dates';
import { humanize, progressionKey, variationParts, warmupFor } from '../../domain/progression';
import { assessSet, countedSetCount, isSecondSide, mergeSides, sideFactors } from '../../domain/quality';
import { ACCURACY_LABEL, EFFORT_LABEL, estimatedRirRange, FEEL_BY_ID, FEEL_OPTIONS, feelPatch, formatRirRange, PAIN_AREAS, techniqueOf, TECHNIQUE_LABEL, withCorrections, isFinished } from '../../domain/feedback';
import { loadUnitLabel, resolveCoefficients, searchExercises } from '../../domain/registry';
import type { Effort, Equipment, ExecutionFeedback, FailureStatus, EquipmentKind, ExerciseDef, LoadMode, Location, MuscleId, SetFeel, SetType, Technique, Variation, VariationField, WeightAccuracy, Workout, WorkoutExercise, WorkoutSet } from '../../domain/types';
import { sessionMuscleEffective } from '../../domain/volume';
import { slugId, uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { liveEditors } from '../train/liveEditors';
import { IconCheck, IconChevronDown, IconEdit, IconPlus, IconSearch, IconTimer, IconTrash } from '../components/icons';
import { EquipmentPicker } from '../components/EquipmentPicker';
import { EquipmentForm } from './Equipment';
import { loadStep } from '../../domain/increments';
import { failureConsistency } from '../../domain/failure';
import { bodyWeightForSession, bodyWeightRelevant, pullUpLoadingAdvice } from '../../domain/bodyweight';
import type { ProgressionSeries } from '../../domain/progression';
import { AddBodyWeight } from '../components/AddBodyWeight';
import { EXECUTION_FEEDBACK, tempoFor } from '../../data/scientific-evidence/tempo';
import { measuredRestSec, type SessionSummary } from '../../domain/sessionSummary';
import { prescribe, type Prescription } from '../../domain/prescription';
import { Badge, Button, Card, CardTitle, confirmAction, cx, Field, fmt, Input, Modal, NumInput, Page, Select, Stepper, TextArea, toast, undoToast, Why } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';
import { byLang, KG, L, locale, num, ruPlural } from '../../i18n';
import { assessChoice, choiceOutcomes, needsPrompt, type ChoiceAssessment } from '../../domain/exerciseChoice';
import { ChoiceCard, ChoiceDot } from '../components/ChoiceCard';
import { uncertainMuscles } from '../../domain/mappingUncertainty';
import type { ExerciseChoiceRecord } from '../../domain/types';

const MACHINE_KINDS: EquipmentKind[] = ['machine', 'plate_loaded', 'cable', 'smith'];


// ---------------------------------------------------------------- Start

export function StartSession() {
  const data = useData();
  const nav = useNavigate();
  const now = localNowParts(data.settings.timezone);
  const lastLoc = [...data.workouts].reverse().find((w) => w.locationId)?.locationId ?? data.locations[0]?.id ?? '';
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [loc, setLoc] = useState<string>(lastLoc);
  const [newGym, setNewGym] = useState('');
  const [newGymAddr, setNewGymAddr] = useState('');
  const recent = [...data.workouts].reverse().slice(0, 4);
  const active = activeWorkout(data.workouts);

  const start = async () => {
    let locationId: string | null = loc || null;
    if (loc === '__new' && newGym.trim()) {
      const l: Location = { id: slugId(newGym, 'gym'), name: newGym.trim(), ...(newGymAddr.trim() ? { address: newGymAddr.trim() } : {}), photoIds: [], createdAt: new Date().toISOString() };
      await store.saveLocation(l);
      locationId = l.id;
    } else if (loc === '__new') locationId = null;
    const ts = new Date().toISOString();
    const w: Workout = {
      id: uid('w'), schemaVersion: 1, date, startTime: time, endTime: null, durationMin: null, locationId,
      locationConfidence: locationId ? 'confirmed' : 'unknown', exercises: [], source: 'live', createdAt: ts, updatedAt: ts,
    };
    await store.saveWorkout(w);
    if (!data.settings.learning.startDate) await store.saveSettings({ learning: { ...data.settings.learning, startDate: date } });
    nav(`/log/${w.id}`, { replace: true });
  };

  return (
    <Page title={L('Start workout', 'Начать тренировку')} subtitle={L('Pick your gym and go. Every set is saved as you log it.', 'Выберите зал и начинайте. Каждый подход сохраняется сразу после записи.')}>
      {active && (
        <Link to={`/log/${active.id}`} className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-accent-500/40 bg-accent-500/10 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink-900 dark:text-white">{L('Workout in progress', 'Тренировка идёт')}</span>
            <span className="block truncate text-xs text-ink-500">{L(`Started ${active.startTime ?? ''} · ${active.exercises.length} exercise${active.exercises.length === 1 ? '' : 's'}`, `Начата ${active.startTime ?? ''} · ${active.exercises.length} ${ruPlural(active.exercises.length, 'упражнение', 'упражнения', 'упражнений')}`)}</span>
          </span>
          <span className="flex h-11 shrink-0 items-center rounded-xl bg-accent-500 px-4 text-sm font-semibold text-ink-950">{L('Resume', 'Продолжить')}</span>
        </Link>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={L('Date', 'Дата')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label={L('Start time', 'Время начала')}><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label={L('Gym', 'Зал')}>
              <Select value={loc} onChange={(e) => setLoc(e.target.value)}>
                {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                <option value="__new">{data.locations.length ? L('+ New gym / unknown…', '+ Новый зал / неизвестен…') : L('New gym…', 'Новый зал…')}</option>
              </Select>
            </Field>
          </div>
          {(loc === '__new' || !data.locations.length) && (
            <>
              <Field className="mt-4" label={L('New gym name', 'Название нового зала')} hint={L('Remembered for next time. Leave empty for an unknown gym.', 'Запомнится на будущее. Оставьте пустым, если зал неизвестен.')}><Input value={newGym} onChange={(e) => { setNewGym(e.target.value); setLoc('__new'); }} placeholder={L('e.g. Gym A', 'напр. Зал А')} /></Field>
              {newGym.trim() && <Field className="mt-3" label={L('Address or note (optional)', 'Адрес или заметка (необязательно)')}><Input value={newGymAddr} onChange={(e) => setNewGymAddr(e.target.value)} placeholder={L('Optional', 'Необязательно')} /></Field>}
            </>
          )}
          <Button variant="primary" size="lg" className="mt-5 w-full sm:w-auto" onClick={start}>{L('Start session', 'Начать тренировку')}</Button>
        </Card>
        <Card>
          <CardTitle hint={L('Prefer talking? Describe the workout to Claude and paste the JSON.', 'Удобнее словами? Опишите тренировку Claude и вставьте JSON.')}>{L('Other ways to log', 'Другие способы записи')}</CardTitle>
          <Link to="/import"><Button className="w-full">{L('Import from Claude', 'Импорт из Claude')}</Button></Link>
          {recent.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Recent sessions', 'Недавние тренировки')}</div>
              {recent.map((w) => (
                <Link key={w.id} to={`/log/${w.id}`} className="flex items-center justify-between rounded-xl px-2.5 py-2 text-sm hover:bg-ink-100 dark:hover:bg-ink-800">
                  <span>{formatDate(w.date)}</span><span className="text-xs text-ink-500">{L(`${w.exercises.length} exercises`, `${w.exercises.length} ${ruPlural(w.exercises.length, 'упражнение', 'упражнения', 'упражнений')}`)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- Editor


export function SessionEditor({ initial }: { initial: Workout }) {
  const data = useData();
  const a = useAnalysis();
  const nav = useNavigate();
  const [w, setW] = useState<Workout>(initial);
  const [picker, setPicker] = useState(false);
  /** Card whose exercise is being corrected ("Change exercise"), else null. */
  const [changing, setChanging] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const tickGuard = useRef(new Map<string, number>()); // set id → when it was ticked (double-tap guard)
  const finishing = useRef(false);
  // After ✓, keep the just-finished set and its one-tap feedback on screen (top, below the sticky
  // header) — the next set follows right under it. Only scroll when the feedback would be hidden.
  const [focusSet, setFocusSet] = useState<{ done: string; tick: number } | null>(null);
  useEffect(() => {
    if (!focusSet) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`set-${focusSet.done}`);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const bottomLimit = window.innerHeight - 150; // bottom nav + floating rest timer
      if (r.top < 110 || r.bottom > bottomLimit) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [focusSet]);
  const saveTimer = useRef<number | null>(null);
  const initialRef = useRef(initial);
  const registryRef = useRef(a.registry);
  registryRef.current = a.registry;
  const latest = useRef(w);
  latest.current = w;

  // Autosave (encrypted write): debounced while typing, IMMEDIATE for a completed set, and flushed
  // whenever the page is hidden (phone locked, app switched, reload) so a performed set is never lost.
  const update = useCallback((fn: (w: Workout) => Workout, opts?: { now?: boolean }) => {
    if (!mounted.current) {
      // This editor is gone (e.g. Undo tapped on another screen). If the workout is open again, the open
      // editor applies it (its state would otherwise overwrite the record); else the saved record is updated.
      const other = liveEditors.get(initialRef.current.id);
      if (other && other !== updateRef.current) { other(fn, opts); return; }
      const cur = store.getState().data?.workouts.find((x) => x.id === initialRef.current.id);
      if (cur) void store.saveWorkout(withCorrections(initialRef.current, fn(cur), new Date().toISOString(), (id) => registryRef.current.get(id)?.name.en ?? id));
      return;
    }
    setW((prev) => {
      // Edits to a FINISHED workout are corrections: keep original → corrected values (audit trail).
      const next = withCorrections(initialRef.current, fn(prev), new Date().toISOString(), (id) => registryRef.current.get(id)?.name.en ?? id);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      if (opts?.now) {
        saveTimer.current = null;
        void store.saveWorkout(next).catch(() => toast(L('Could not save — the set is kept on screen; it will be saved with the next change', 'Не удалось сохранить — подход остаётся на экране и сохранится при следующем изменении'), 'bad'));
      } else {
        saveTimer.current = window.setTimeout(() => { saveTimer.current = null; void store.saveWorkout(next); }, 350);
      }
      return next;
    });
  }, []);
  const updateRef = useRef(update);
  updateRef.current = update;
  useEffect(() => {
    liveEditors.set(initial.id, update);
    return () => { if (liveEditors.get(initial.id) === update) liveEditors.delete(initial.id); };
  }, [initial.id, update]);
  /**
   * A change that can be reversed with one tap: a short confirmation with Undo (applies `revert`).
   * A finished workout never gets planned (unticked) sets back; a revert that changes nothing says so.
   */
  const undoable = useCallback((msg: string, revert: (x: Workout) => Workout) => undoToast(msg, () => {
    const safe = (x: Workout) => {
      const r = revert(x);
      return r !== x && isFinished(r) ? { ...r, exercises: r.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => !s.planned) })) } : r;
    };
    const cur = mounted.current ? latest.current : store.getState().data?.workouts.find((x) => x.id === initialRef.current.id);
    if (cur && safe(cur) === cur) return false;
    update(safe, { now: true });
    return true;
  }), [update]);
  /** Drop a pending debounced save (before delete / finish): the unmount flush must not write it back. */
  const cancelSave = () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); saveTimer.current = null; };
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void store.saveWorkout(latest.current);
      }
    };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    // "Lock now" / auto-lock right after typing: write the pending edit while the key is still there.
    const offLock = store.onBeforeLock(flush);
    return () => {
      offLock();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const location = data.locations.find((l) => l.id === w.locationId);
  const sessionEff = useMemo(() => sessionMuscleEffective(w, a.registry, data.settings.quality), [w, a.registry, data.settings.quality]);

  /** Build a new exercise card. `base` = the session it joins. */
  const buildExercise = (def: ExerciseDef, base: Workout): WorkoutExercise => {
    const eq = data.equipment.find((e) => e.exerciseIds.includes(def.id) && e.locationId === w.locationId && !(w.busyEquipment ?? []).some((b) => b.equipmentId === e.id)) ?? null;
    const prev = lastSessionFor(data.workouts, def.id, eq?.id ?? null, w.id);
    // Same configuration as last time (angle, attachment, one side at a time…), else the exercise's default.
    const variation = prev?.variation ? { ...prev.variation } : def.defaultVariation ? { ...def.defaultVariation } : undefined;
    const draft: WorkoutExercise = {
      id: uid('we'), order: base.exercises.length, exerciseId: def.id, exerciseConfidence: 'confirmed',
      equipmentId: eq?.id ?? null, equipmentConfidence: eq ? 'confirmed' : 'unknown',
      settings: eq && Object.keys(eq.settings).length ? { ...eq.settings } : undefined,
      variation, sets: [], startedAt: new Date().toISOString(),
    };
    const series = a.progression.find((p) => p.key === progressionKey(draft, w, def));
    // Prefill from what was actually done last time (suggested load if an increase is due); never invent reps.
    const lastWorking = prev?.sets.find((s) => s.type === 'working' && !s.planned);
    const firstWeight = series?.next.weight ?? lastWorking?.weightKg ?? null;
    const firstReps = series?.next.action === 'increase' ? series.next.repTarget[0] : lastWorking?.reps ?? null;
    const perSideLast = prev ? prev.sets.some((s) => s.side) : !!def.defaultVariation?.unilateral;
    const first = newSet('working', firstWeight, firstReps, defaultLoadMode(def));
    // Left/right logging continues if it was used last time (or is the exercise's default, e.g. standing leg curl).
    if (perSideLast) first.side = 'left';
    return { ...draft, sets: [first] };
  };
  const addExercise = (def: ExerciseDef) => {
    setPicker(false);
    const ex = buildExercise(def, w);
    update((x) => ({ ...x, exercises: [...x.exercises, { ...ex, order: x.exercises.length }] }));
  };
  /**
   * Correct a wrong exercise on a card. Nothing performed yet -> a fresh card for the right exercise (new plan).
   * Sets already performed -> kept as they are (they were done), only the exercise changes; the machine is kept
   * when it is linked to the new exercise. One tap on Undo restores the card.
   */
  const changeExercise = (exId: string, def: ExerciseDef) => {
    const old = w.exercises.find((e) => e.id === exId);
    if (!old || old.exerciseId === def.id) return;
    const performed = old.sets.filter((s) => !s.planned);
    let next: WorkoutExercise;
    if (!performed.length) {
      const base = { ...w, exercises: w.exercises.filter((e) => e.id !== exId) };
      next = { ...buildExercise(def, base), id: old.id, order: old.order };
    } else {
      // The sets were done on that machine: it stays (linking it to the new exercise is the owner's choice).
      const { plannedCount: _p, choice: _c, planItem: _i, exerciseNameRaw: _r, ...rest } = old;
      void _p; void _c; void _i; void _r;
      // Recorded variation values the new exercise also uses are kept (e.g. bench angle); the rest is dropped.
      const keepKeys = new Set<string>(['unilateral', 'rom', ...(def.variationFields ?? []).map((f) => (f === 'angle' ? 'benchAngleDeg' : f))]);
      const keptVar = Object.fromEntries(Object.entries(old.variation ?? {}).filter(([k, v]) => keepKeys.has(k) && v != null));
      const variation = { ...(def.defaultVariation ?? {}), ...keptVar };
      next = { ...rest, exerciseId: def.id, exerciseConfidence: 'confirmed', variation: Object.keys(variation).length ? variation : undefined, sets: performed };
    }
    update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === exId ? next : e)) }), { now: true });
    undoable(L(`Changed to ${def.name.en}`, `Упражнение изменено: ${def.name.ru}`), (x) => {
      const e = x.exercises.find((y) => y.id === exId);
      if (!e || e.exerciseId !== def.id) return x;
      // Exercise-level fields go back; the sets stay as they are now (edits and sets done since are kept).
      // A fresh card that was never started gets the original planned sets back.
      const sets = performed.length || e.sets.some((s2) => !s2.planned) ? e.sets : old.sets;
      return { ...x, exercises: x.exercises.map((y) => (y.id === exId ? { ...old, sets } : y)) };
    });
  };

  /** ✓ toggles a set: done (counted) ↔ not done. */
  const completeSet = (exId: string, setId: string) => {
    const nowMs = Date.now();
    const ex = w.exercises.find((e) => e.id === exId);
    const target = ex?.sets.find((s) => s.id === setId);
    if (!ex || !target) return;
    // A quick second tap (fat finger / double tap) must not undo a set that was just completed.
    if (target.completedAt && nowMs - (tickGuard.current.get(setId) ?? 0) < 1500) return;
    if (target.completedAt) {
      update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id !== exId ? e : {
        ...e, sets: e.sets.map((s) => {
          if (s.id !== setId) return s;
          const { completedAt: _c, ...rest } = s;
          void _c;
          return { ...rest, planned: undefined, ...(s.restSource === 'timer' ? { restSecBefore: null, restSource: undefined } : {}) };
        }),
      })) }));
      return;
    }
    setFocusSet({ done: setId, tick: nowMs });
    update((x) => ({ ...x, exercises: x.exercises.map((e) => {
      if (e.id !== exId) return e;
      const sets = e.sets.map((s) => {
        if (s.id !== setId) return s;
        const done: WorkoutSet = { ...s, planned: undefined, completedAt: new Date(nowMs).toISOString() };
        // Rest measured by the timer: time since the previous completed set minus an estimate of set duration (≈3 s/rep).
        // The second side of a left/right pair follows the first directly — that gap is not rest between sets.
        const i = e.sets.findIndex((o) => o.id === s.id);
        const secondSide = isSecondSide(e.sets, i);
        // Rest = since the previous completed set of THIS exercise (time between exercises is not rest).
        const prevDone = e.sets.filter((o) => o.id !== s.id && o.completedAt).map((o) => o.completedAt as string).sort().pop();
        const gap = !secondSide && s.restSecBefore == null ? measuredRestSec(prevDone, nowMs, s.reps) : null;
        if (gap != null) {
          done.restSecBefore = gap;
          done.restSource = 'timer';
        }
        return done;
      });
      return { ...e, sets };
    }) }), { now: true });
    tickGuard.current.set(setId, nowMs);
  };

  const finish = async () => {
    if (finishing.current) return; // double tap on Finish
    finishing.current = true;
    try { await finishInner(); } finally { finishing.current = false; }
  };
  const finishInner = async () => {
    // Sets that were pre-filled but never performed (not ticked, no RIR) are dropped, never saved as volume.
    const unticked = latest.current.exercises.reduce((n, e) => n + e.sets.filter((s) => s.planned).length, 0);
    const exercises = latest.current.exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => !s.planned) }))
      .filter((e) => e.sets.length > 0)
      .map((e, i) => ({ ...e, order: i }));
    const snapshot = latest.current;
    const x = { ...latest.current, exercises };
    cancelSave();
    if (!x.exercises.length) {
      // Nothing was performed: the empty session is discarded - never silently (Undo brings it back).
      await store.deleteWorkout(x.id);
      nav('/');
      undoToast(L('Nothing was logged — workout discarded', 'Ничего не записано — тренировка удалена'), async () => { await store.putWorkoutAsIs(snapshot); window.location.hash = `#/log/${snapshot.id}`; });
      return;
    }
    const now = localNowParts(data.settings.timezone);
    let durationMin = x.durationMin ?? null;
    if (!durationMin && x.startTime && x.date === now.date) {
      const [sh, sm] = x.startTime.split(':').map(Number);
      const [eh, em] = now.time.split(':').map(Number);
      const d = eh * 60 + em - (sh * 60 + sm);
      if (d > 0 && d < 400) durationMin = d;
    }
    const final = { ...x, finishedAt: x.finishedAt ?? new Date().toISOString(), exercises: x.exercises.map(dropEmptySettings), endTime: x.endTime ?? (x.date === now.date ? now.time : null), durationMin };
    cancelSave();
    setW(final);
    await store.saveWorkout(final);
    toast(unticked ? L(`Workout saved · ${unticked} unticked set${unticked === 1 ? '' : 's'} left out`, `Тренировка сохранена · неотмеченные подходы не включены: ${unticked}`) : L('Workout saved', 'Тренировка сохранена'));
    nav('/history');
  };

  const remove = async () => {
    // Deleting a whole session is rare and costly: ask first (the Undo below is a second safety net).
    if (!confirmAction(L('Delete this whole workout? You can undo it for a few seconds.', 'Удалить всю тренировку? Несколько секунд это можно отменить.'))) return;
    const copy = latest.current;
    cancelSave();
    await store.deleteWorkout(w.id);
    nav('/history');
    undoToast(L('Workout deleted', 'Тренировка удалена'), async () => { await store.putWorkoutAsIs(copy); window.location.hash = `#/log/${copy.id}`; });
  };

  return (
    <Page
      title={L('Edit workout', 'Изменить тренировку')}
      subtitle={<span>{formatDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}{location ? ` · ${location.name}` : L(' · gym unknown', ' · зал не указан')}</span>}
      actions={<><Button variant="ghost" onClick={remove} aria-label={L('Delete workout', 'Удалить тренировку')} className="w-11 px-0"><IconTrash size={18} /></Button><Button variant="primary" onClick={finish}><IconCheck size={16} />{L('Save', 'Сохранить')}</Button></>}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <MobileRemainingStrip sessionEff={sessionEff} />
          <SessionMeta w={w} update={update} />
          {w.exercises.map((ex, i) => (
            <ExerciseCard key={ex.id} index={i} w={w} ex={ex} update={update} onComplete={completeSet} undoable={undoable} onChange={() => setChanging(ex.id)} />
          ))}
          <button type="button" onClick={() => setPicker(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-300 py-5 text-sm font-semibold text-ink-600 transition hover:border-accent-500 hover:text-accent-600 dark:border-ink-700 dark:text-ink-300 dark:hover:text-accent-400">
            <IconPlus size={18} /> {L('Add exercise', 'Добавить упражнение')}
          </button>
          <Wellness w={w} update={update} />
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <LiveRemaining sessionEff={sessionEff} />
        </div>
      </div>
      <ExercisePicker open={picker || !!changing} title={changing ? L('Change exercise', 'Сменить упражнение') : L('Add exercise', 'Добавить упражнение')} onClose={() => { setPicker(false); setChanging(null); }}
        onPick={changing ? (d) => { const id = changing; setChanging(null); changeExercise(id, d); } : addExercise} locationId={w.locationId} workout={null} />
      <div className="h-6" aria-hidden />
    </Page>
  );
}

export interface AddOpts {
  equipmentId?: string | null;
  variation?: Variation;
  /** Exercise-choice record (Part 5) when the assistant was shown. */
  choice?: ExerciseChoiceRecord;
  /** Answered warning: not repeated in this session unless the inputs change. */
  ackKey?: string;
}

function newSet(type: SetType, weight: number | null, reps: number | null, loadMode: LoadMode = 'total', planned = false): WorkoutSet {
  return { id: uid('s'), type, weightKg: weight, loadMode, reps, rir: null, rirSource: 'unknown', restSecBefore: null, ...(planned ? { planned: true } : {}) };
}

type SidesMode = 'both' | 'one_lr' | 'one';

/** Setting names offered by the template but left blank are not stored. */
function dropEmptySettings(e: WorkoutExercise): WorkoutExercise {
  if (!e.settings) return e;
  const kept = Object.fromEntries(Object.entries(e.settings).filter(([, v]) => v.trim() !== ''));
  return { ...e, settings: Object.keys(kept).length ? kept : undefined };
}

export function defaultLoadMode(def: ExerciseDef): LoadMode {
  if (def.id === 'assisted_pull_up') return 'assisted';
  if (def.equipmentKind === 'bodyweight') return 'bodyweight_plus';
  return 'total';
}

export function lastSessionFor(workouts: Workout[], exerciseId: string, equipmentId: string | null, excludeId: string): WorkoutExercise | null {
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i];
    if (w.id === excludeId) continue;
    const e = w.exercises.find((x) => x.exerciseId === exerciseId && (equipmentId == null || x.equipmentId === equipmentId));
    if (e) return e;
  }
  return null;
}

// ---------------------------------------------------------------- Session meta & wellness

export function SessionMeta({ w, update }: { w: Workout; update: (fn: (w: Workout) => Workout) => void }) {
  const data = useData();
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-sm sm:px-5">
        <span className="font-medium text-ink-700 dark:text-ink-200">{L('Session details', 'Детали тренировки')}</span>
        <span className="flex items-center gap-2 text-xs text-ink-500">{w.startTime ?? '--:--'}{w.endTime ? `–${w.endTime}` : ''} <IconChevronDown size={14} className={cx('transition', open && 'rotate-180')} /></span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-ink-100 px-4 py-4 dark:border-ink-800 sm:grid-cols-4 sm:px-5">
          <Field label={L('Date', 'Дата')}><Input type="date" value={w.date} onChange={(e) => update((x) => ({ ...x, date: e.target.value }))} /></Field>
          <Field label={L('Gym', 'Зал')}>
            <Select value={w.locationId ?? ''} onChange={(e) => update((x) => ({ ...x, locationId: e.target.value || null, locationConfidence: e.target.value ? 'confirmed' : 'unknown' }))}>
              <option value="">{L('Unknown', 'Неизвестен')}</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label={L('Start', 'Начало')}><Input type="time" value={w.startTime ?? ''} onChange={(e) => update((x) => ({ ...x, startTime: e.target.value || null }))} /></Field>
          <Field label={L('End', 'Конец')}><Input type="time" value={w.endTime ?? ''} onChange={(e) => update((x) => ({ ...x, endTime: e.target.value || null }))} /></Field>
          <Field label={L('Notes', 'Заметки')} className="sm:col-span-4"><TextArea className="font-sans text-sm" value={w.notes ?? ''} onChange={(e) => update((x) => ({ ...x, notes: e.target.value }))} /></Field>
        </div>
      )}
    </Card>
  );
}

export function Wellness({ w, update }: { w: Workout; update: (fn: (w: Workout) => Workout) => void }) {
  const well = w.wellness ?? {};
  const set = (k: 'fatigue' | 'energy', v: number | null) => update((x) => ({ ...x, wellness: { ...(x.wellness ?? {}), [k]: v } }));
  return (
    <Card>
      <CardTitle hint={L('Optional. Used only for recovery and deload estimates.', 'Необязательно. Используется только для оценки восстановления и разгрузки.')}>{L('How do you feel?', 'Как самочувствие?')}</CardTitle>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ScalePick label={L('Fatigue (1 fresh – 5 exhausted)', 'Усталость (1 свежесть – 5 без сил)')} value={well.fatigue ?? null} onChange={(v) => set('fatigue', v)} />
        <ScalePick label={L('Energy (1 low – 5 great)', 'Энергия (1 мало – 5 много)')} value={well.energy ?? null} onChange={(v) => set('energy', v)} />
        <Field label={L('Sleep last night (h)', 'Сон прошлой ночью (ч)')}><NumInput value={well.sleepHours ?? null} onChange={(v) => update((x) => ({ ...x, wellness: { ...(x.wellness ?? {}), sleepHours: v } }))} step={0.5} /></Field>
      </div>
    </Card>
  );
}

function ScalePick({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">{label}</div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(value === n ? null : n)}
            className={cx('h-10 flex-1 rounded-xl text-sm font-semibold transition', value === n ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{n}</button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Exercise card

function ExerciseCard({ index, w, ex, update, onComplete, undoable, onChange }: {
  index: number; w: Workout; ex: WorkoutExercise; update: (fn: (w: Workout) => Workout, opts?: { now?: boolean }) => void; onComplete: (exId: string, setId: string) => void;
  undoable: (msg: string, revert: (x: Workout) => Workout) => void; onChange: () => void;
}) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const def = a.registry.get(ex.exerciseId);
  const eq = ex.equipmentId ? data.equipment.find((e) => e.id === ex.equipmentId) : undefined;
  const [showVar, setShowVar] = useState(false);
  const [newEq, setNewEq] = useState(false);
  const [pickEq, setPickEq] = useState(false);
  const [editEq, setEditEq] = useState<Equipment | null>(null);
  const needsMachine = def ? MACHINE_KINDS.includes(def.equipmentKind) : false;
  const gym = data.locations.find((l) => l.id === w.locationId) ?? null;
  const inc = loadStep(eq, gym, def?.equipmentKind, ex.sets[0]?.loadMode).step;

  const setEx = (fn: (e: WorkoutExercise) => WorkoutExercise) => update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === ex.id ? fn(e) : e)) }));
  const setSet = (sid: string, patch: Partial<WorkoutSet>) => setEx((e) => ({ ...e, sets: e.sets.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }));
  const exName = names.ex(def, ex.exerciseNameRaw ?? ex.exerciseId);
  /** Remove a set at once (no dialog); Undo puts it back in the same place. */
  const removeSet = (s: WorkoutSet) => {
    const i = ex.sets.findIndex((x) => x.id === s.id);
    update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === ex.id ? { ...e, sets: e.sets.filter((y) => y.id !== s.id) } : e)) }), { now: true });
    undoable(s.completedAt || !s.planned ? L('Set removed', 'Подход удалён') : L('Planned set removed', 'Запланированный подход удалён'), (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id !== ex.id || e.sets.some((y) => y.id === s.id) ? e : { ...e, sets: [...e.sets.slice(0, i), s, ...e.sets.slice(i)] })) }));
  };
  const removeExercise = () => {
    const copy = ex;
    update((x) => ({ ...x, exercises: x.exercises.filter((e) => e.id !== ex.id).map((e, i) => ({ ...e, order: i })) }), { now: true });
    undoable(L(`${exName} removed`, `Удалено: ${exName}`), (x) => (x.exercises.some((e) => e.id === copy.id) ? x
      : { ...x, exercises: [...x.exercises.slice(0, index), copy, ...x.exercises.slice(index)].map((e, i) => ({ ...e, order: i })) }));
  };

  const key = def ? progressionKey(ex, w, def) : '';
  const series = a.progression.find((p) => p.key === key);
  const prev = lastSessionFor(data.workouts.filter((x) => x.date <= w.date), ex.exerciseId, ex.equipmentId, w.id);
  const priorSameMuscle = useMemo(() => {
    if (!def) return 0;
    const primary = Object.entries(def.contributions).filter(([, c]) => (c ?? 0) >= 0.75).map(([m]) => m);
    let n = 0;
    for (const o of w.exercises.slice(0, index)) {
      const od = a.registry.get(o.exerciseId);
      if (od && primary.some((m) => ((od.contributions as Record<string, number>)[m] ?? 0) >= 0.5)) n += countedSetCount(o.sets);
    }
    return n;
  }, [def, w.exercises, index, a.registry]);
  const target = series?.next ?? null;
  const wu = warmupFor(def, target?.weight ?? ex.sets.find((s) => s.type === 'working')?.weightKg ?? null, inc, priorSameMuscle);
  const resolved = def ? resolveCoefficients(def, ex.variation) : null;
  // Choosing a machine loads its remembered settings (the session's own values win).
  const chooseEq = (chosen: Equipment | null) => setEx((x) => ({ ...x, equipmentId: chosen?.id ?? null, equipmentConfidence: chosen ? 'confirmed' : 'unknown', settings: chosen ? { ...chosen.settings, ...(x.settings ?? {}) } : x.settings }));

  // Left/right logging is a property of the sets themselves (any set with a side), separate from
  // `variation.unilateral`, which keeps its v1.0 meaning: one limb at a time, one set = both sides done.
  const perSide = ex.sets.some((s) => s.side);
  const pairs = sideFactors(ex.sets);
  const addSet = (type: SetType = 'working') => {
    const last = [...ex.sets].reverse().find((s) => s.type === type) ?? ex.sets[ex.sets.length - 1];
    const s = newSet(type, last?.weightKg ?? null, last?.reps ?? null, last?.loadMode);
    // Left/right logging: alternate left → right → left…
    if (perSide && type !== 'warmup') s.side = last?.side === 'left' ? 'right' : 'left';
    setEx((e) => ({ ...e, sets: [...e.sets, s] }));
  };
  const setVar = (patch: Partial<NonNullable<WorkoutExercise['variation']>>) => setEx((e) => ({ ...e, variation: { ...(e.variation ?? {}), ...patch } }));
  const sidesMode: SidesMode = perSide ? 'one_lr' : ex.variation?.unilateral ? 'one' : 'both';
  const setSides = (mode: SidesMode) => {
    if (mode === sidesMode) return;
    if (mode === 'one_lr') {
      // Sets not yet performed get alternating sides (left, right, left…). Sets already logged are only
      // re-tagged after confirmation, because tagging them makes each L+R pair count as ONE set.
      const logged = ex.sets.filter((s) => !s.planned && s.type !== 'warmup' && !s.side).length;
      const tagLogged = logged > 0 && confirmAction(L(`Tag the ${logged} set${logged === 1 ? '' : 's'} already logged as left/right (L, R, L…)? Each L+R pair then counts as one set.`, `Пометить уже записанные подходы (${logged}) как левую и правую сторону (Л, П, Л…)? Тогда каждая пара Л+П считается одним подходом.`));
      let k = 0;
      setEx((e) => {
        const sets = e.sets.map((s) => (s.type === 'warmup' || s.side || (!s.planned && !tagLogged) ? s : { ...s, side: k++ % 2 === 0 ? 'left' as const : 'right' as const }));
        // Nothing left to tag (all sets logged, declined): add the next set as a left side so the mode sticks.
        if (!sets.some((s) => s.side)) {
          const last = [...sets].reverse().find((s) => s.type !== 'warmup');
          sets.push({ ...newSet('working', last?.weightKg ?? null, last?.reps ?? null, last?.loadMode, true), side: 'left' });
        }
        return { ...e, variation: { ...(e.variation ?? {}), unilateral: true }, sets };
      });
      return;
    }
    // Leaving left/right logging: never silently turn a pair into two sets.
    if (perSide) {
      const n = countedSetCount(ex.sets.filter((s) => s.side));
      if (!confirmAction(L(`Merge the left/right sets into ${n} set${n === 1 ? '' : 's'}? Each pair keeps the left side's weight, reps and RIR.`, `Объединить подходы левой и правой стороны в ${n} ${ruPlural(n, 'подход', 'подхода', 'подходов')}? В каждой паре останутся вес, повторения и RIR левой стороны.`))) return;
    }
    setEx((e) => ({ ...e, variation: { ...(e.variation ?? {}), unilateral: mode === 'one' }, sets: mergeSides(e.sets) }));
  };
  const setupSummary = [
    ...variationParts(ex.variation, def).map((p) => p.label),
    ex.variation?.depth ? humanizeDepth(ex.variation.depth) : null,
    ex.variation?.barPosition ? humanize(ex.variation.barPosition) : null,
    ex.variation?.execution ? humanize(ex.variation.execution) : null,
    ...Object.entries(ex.settings ?? {}).filter(([, v]) => v.trim()).map(([k, v]) => `${k} ${v}`),
  ].filter(Boolean) as string[];
  const unit = unitLabel(loadUnitLabel(def, ex.sets.find((s) => s.type !== 'warmup')?.loadMode ?? ex.sets[0]?.loadMode));
  const barKind = def && (def.equipmentKind === 'barbell' || def.equipmentKind === 'smith');
  const addWarmups = () => {
    if (!wu.sets.length) return;
    setEx((e) => ({ ...e, sets: [...wu.sets.map((s) => newSet('warmup', s.weight, s.reps, e.sets[0]?.loadMode)), ...e.sets] }));
  };

  return (
    <Card padded={false}>
      <div id={`ex-${ex.id}`} className="flex scroll-mt-28 items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">{index + 1}</span>
            <h3 className="truncate text-base font-semibold text-ink-900 dark:text-white">{names.ex(def, ex.exerciseNameRaw ?? ex.exerciseId)}</h3>
          </div>
          {names.exSub(def) && <div className="ml-8 text-xs text-ink-400">{names.exSub(def)}</div>}
          {resolved && (
            <div className="ml-8 mt-1.5 flex flex-wrap gap-1">
              {Object.entries(resolved.contributions).filter(([, c]) => (c ?? 0) > 0).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0)).map(([m, c]) => {
                const r = uncertainMuscles(ex.exerciseId, data.exerciseOverrides)[m as MuscleId];
                return <Badge key={m} tone={(c ?? 0) >= 0.75 ? 'accent' : 'neutral'} title={r ? L(`Uncertain mapping: plausible ${r[0]}–${r[1]} (exercise audit). Counted as ${c}.`, `Оценка участия неточная: правдоподобно ${num(r[0])}–${num(r[1])} (аудит упражнений). Засчитано ${num(c ?? 0)}.`) : undefined}>{names.muscle(m as MuscleId)} {L(String(c), num(c ?? 0))}{r ? L(` (${r[0]}–${r[1]}?)`, ` (${num(r[0])}–${num(r[1])}?)`) : ''}</Badge>;
              })}
            </div>
          )}
        </div>
        <div className="-mr-2 -mt-1.5 flex shrink-0">
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-400 hover:bg-ink-100 hover:text-ink-700 active:bg-ink-100 dark:hover:bg-ink-800" aria-label={L('Change exercise', 'Сменить упражнение')} title={L('Wrong exercise? Change it — logged sets are kept', 'Не то упражнение? Смените его — записанные подходы сохранятся')}
            onClick={onChange}>
            <IconEdit size={16} />
          </button>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-400 hover:bg-ink-100 hover:text-rose-500 active:text-rose-500 dark:hover:bg-ink-800" aria-label={L('Remove exercise', 'Удалить упражнение')}
            onClick={removeExercise}>
            <IconTrash size={16} />
          </button>
        </div>
      </div>

      <ExecutionCue exerciseId={ex.exerciseId} />
      <BodyLine w={w} ex={ex} kind={def?.equipmentKind} series={series ?? null} repTop={def?.repRange[1] ?? 12} />
      <div className="mt-3 grid grid-cols-1 gap-2 px-4 sm:grid-cols-[1fr_auto] sm:px-5">
        <button type="button" onClick={() => setPickEq(true)}
          className={cx('flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-xl border bg-white px-3 text-left text-sm dark:bg-ink-900', needsMachine && !ex.equipmentId ? 'border-amber-500/60' : 'border-ink-200 dark:border-ink-700')}>
          <span className="min-w-0 truncate">
            {eq ? <><span className="font-medium text-ink-900 dark:text-white">{eq.name}</span>{eq.manufacturer ? <span className="text-ink-500"> · {eq.manufacturer}</span> : null}{eq.locationId && eq.locationId !== w.locationId ? <span className="text-amber-600">{L(' · other gym', ' · другой зал')}</span> : null}</>
              : <span className="text-ink-500">{needsMachine ? L('Which machine? (not identified)', 'Какой тренажёр? (не указан)') : L('Free weights / no specific equipment', 'Свободные веса / без конкретного оборудования')}</span>}
          </span>
          <IconChevronDown size={16} className="shrink-0 text-ink-400" />
        </button>
        <Button size="md" variant="ghost" onClick={() => setShowVar(!showVar)}>{L('Setup', 'Настройка')} {showVar ? '▴' : '▾'}</Button>
      </div>
      {needsMachine && !ex.equipmentId && <p className="px-4 pt-1.5 text-[11px] text-amber-700 dark:text-amber-300 sm:px-5">{L('Different machines are tracked separately, and their loads are never compared. Pick or add this machine to keep its history clean.', 'Разные тренажёры учитываются отдельно, их веса никогда не сравниваются. Выберите или добавьте этот тренажёр, чтобы его история оставалась чистой.')}</p>}
      {!showVar && (setupSummary.length > 0 || (def?.variationFields?.length ?? 0) > 0 || (def?.settingTemplate?.length ?? 0) > 0) && (
        <button type="button" onClick={() => setShowVar(true)} className="mx-4 mt-1.5 flex min-h-[40px] max-w-full items-center gap-1.5 text-left text-xs text-ink-500 sm:mx-5">
          {setupSummary.length ? <span className="truncate"><span className="font-medium text-ink-700 dark:text-ink-200">{L('Setup:', 'Настройка:')}</span> {setupSummary.join(' · ')}</span>
            : <span className="underline decoration-dotted underline-offset-2">{L('Set', 'Указать:')} {[def?.variationFields?.includes('angle') ? L('bench angle', 'угол скамьи') : null, def?.variationFields?.includes('unilateral') ? L('one side / both', 'одна сторона / обе') : null, def?.settingTemplate?.length ? def.settingTemplate.slice(0, 2).join(', ') : null].filter(Boolean).join(', ') || L('variation', 'вариант')}</span>}
        </button>
      )}

      {showVar && (
        <div className="mx-4 mt-3 grid grid-cols-1 gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950 sm:mx-5 sm:grid-cols-4">
          {def && <VariationChips def={def} v={ex.variation} onChange={setVar} notes={resolved?.notes ?? []} sides={sidesMode} onSides={setSides} showSides={!!def.variationFields?.includes('unilateral') || perSide} />}
          <MoreOptions rom={ex.variation?.rom ?? null} onRom={(rom) => setVar({ rom })} />
          <SettingsEditor settings={ex.settings ?? {}} template={def?.settingTemplate ?? []} onChange={(s) => setEx((x) => ({ ...x, settings: s }))}
            onSaveDefault={eq ? () => { void store.saveEquipment({ ...eq, settings: Object.fromEntries(Object.entries(ex.settings ?? {}).filter(([, v]) => v.trim())), updatedAt: new Date().toISOString() }); toast(L('Saved as this machine\'s default settings', 'Сохранено как настройки этого тренажёра по умолчанию')); } : undefined} />
        </div>
      )}

      <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 sm:mx-5">
        {prev ? <span>{L('Last time:', 'В прошлый раз:')} <b className="font-medium text-ink-700 dark:text-ink-200">{prev.sets.filter((s) => s.type === 'working' && !s.planned).map((s) => `${s.side ? (s.side === 'left' ? L('L ', 'Л ') : L('R ', 'П ')) : ''}${s.weightKg == null ? L('BW', 'св. вес') : L(String(s.weightKg), num(s.weightKg))}×${s.reps ?? '?'}${s.rir != null ? `@${s.rir}` : ''}`).join(', ')}</b></span> : <span>{L(`No history on this ${ex.equipmentId ? 'machine' : 'exercise'} yet — calibration session.`, ex.equipmentId ? 'На этом тренажёре пока нет истории — калибровочная тренировка.' : 'По этому упражнению пока нет истории — калибровочная тренировка.')}</span>}
        {target && target.weight != null && <Badge tone={target.action === 'increase' ? 'good' : target.action === 'reduce' ? 'warn' : 'neutral'}>{target.action === 'increase' ? '↑' : target.action === 'reduce' ? '↓' : '='} {fmt(target.weight, 2)} {KG()} · {target.repTarget[0]}–{target.repTarget[1]}</Badge>}
      </div>
      {(target || wu.sets.length > 0) && (
        <div className="mx-4 mt-1 sm:mx-5">
          <Why label={L('Suggestion & warm-up', 'Рекомендация и разминка')}>
            {target && <p>{target.reason}</p>}
            <p>{L('Warm-up:', 'Разминка:')} {wu.sets.length ? wu.sets.map((s) => `${s.weight != null ? `${fmt(s.weight, 2)} ${KG()}` : L('BW', 'св. вес')} × ${s.reps}`).join(' → ') : L('none', 'нет')} — {wu.reason}</p>
            {wu.sets.length > 0 && !ex.sets.some((s) => s.type === 'warmup') && <Button size="sm" className="mt-1" onClick={addWarmups}>{L('Add these warm-up sets', 'Добавить эти разминочные подходы')}</Button>}
          </Why>
        </div>
      )}

      <div className="mt-3 border-t border-ink-100 dark:border-ink-800">
        <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] min-[360px]:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:px-5">
          <span>{L('Set', 'Подход')}</span><span className="text-center normal-case tracking-normal">{unit}</span><span className="text-center">{L('Reps', 'Повт.')}</span>
        </div>
        {barKind && (
          <p className="px-4 pb-1 text-[11px] text-ink-500 sm:px-5">
            {eq?.barWeightKg != null ? L(`Bar ${fmt(eq.barWeightKg, 2)} kg — plates = total − ${fmt(eq.barWeightKg, 2)} kg.`, `Гриф ${fmt(eq.barWeightKg, 2)} кг — диски = общий вес − ${fmt(eq.barWeightKg, 2)} кг.`) : L('Enter the total you lifted. Bar weight unknown — never assumed (set it on the bar\'s equipment entry if you know it).', 'Вводите общий поднятый вес. Вес грифа неизвестен и не подставляется (укажите его в записи оборудования, если знаете).')}
          </p>
        )}
        {perSide && <p className="px-4 pb-1 text-[11px] text-ink-500 sm:px-5">{L('One side at a time: log a left and a right set — each pair counts as ', 'По одной стороне: запишите левый и правый подход — каждая пара считается за ')}<b className="font-semibold">{L('one', 'один')}</b>{L(' set.', ' подход.')}</p>}
        {index === 0 && <p className="px-4 pb-1 text-[11px] leading-snug text-ink-500 sm:px-5">{L('Numbers below the reps are ', 'Числа под повторениями — это ')}<b className="font-semibold">RIR</b>{L(' — reps you still had left. Tap one, then ✓ to count the set.', ': сколько повторений оставалось в запасе. Нажмите число, затем ✓, чтобы засчитать подход.')}</p>}
        {ex.sets.map((s, i) => (
          <SetRow key={s.id} s={s} pair={pairs.get(s.id) ?? 1} n={ex.sets.slice(0, i + 1).filter((x) => x.type === s.type && (x.side ?? null) === (s.side ?? null)).length} inc={inc} sideToggle={perSide} onChange={(p) => setSet(s.id, p)}
            onRemove={() => removeSet(s)} onComplete={() => onComplete(ex.id, s.id)} />
        ))}
        <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
          <Button size="md" onClick={() => addSet('working')}><IconPlus size={14} />{L('Set', 'Подход')}</Button>
          <Button size="md" variant="ghost" onClick={() => addSet('warmup')}>{L('+ Warm-up', '+ Разминка')}</Button>
          <Button size="md" variant="ghost" onClick={() => addSet('drop')}>{L('+ Drop', '+ Дроп')}</Button>
        </div>
      </div>
      <EquipmentPicker open={pickEq} onClose={() => setPickEq(false)} locationId={w.locationId} def={def} currentId={ex.equipmentId}
        onPick={(chosen) => { setPickEq(false); chooseEq(chosen); }}
        onNew={() => { setPickEq(false); setNewEq(true); }}
        onEdit={(q) => { setPickEq(false); setEditEq(q); }} />
      {newEq && <EquipmentForm eq={null} defaultLocation={w.locationId} defaultExerciseId={def?.id} defaultKind={def?.equipmentKind}
        defaultName={def ? names.ex(def) : ''} onClose={() => setNewEq(false)}
        onSaved={(id) => { setNewEq(false); setEx((x) => ({ ...x, equipmentId: id, equipmentConfidence: 'confirmed' })); }} />}
      {editEq && <EquipmentForm eq={editEq} defaultLocation={w.locationId} onClose={() => setEditEq(null)} onSaved={() => setEditEq(null)} />}
    </Card>
  );
}

/** The load unit as shown: the library gives the English label, this adds the Russian twin. */
const unitLabel = (en: string): string => L(en, ({
  'kg assistance': 'кг помощи', 'kg added': 'кг доп. веса', 'kg per side': 'кг на сторону', 'kg per dumbbell': 'кг одна гантель',
  'kg total': 'кг всего', 'kg on stack': 'кг на блоке', 'kg plates': 'кг дисков', kg: 'кг',
} as Record<string, string>)[en] ?? en);

const ANGLE_CHIPS = [0, 15, 30, 45];
const CHOICES: Partial<Record<VariationField, { key: keyof Variation; label: string; options: [string, string][] }>> = byLang(() => ({
  attachment: { key: 'attachment', label: L('Attachment', 'Рукоять'), options: [['straight_bar', L('Straight bar', 'Прямая')], ['rope', L('Rope', 'Канат')], ['v_bar', L('V-bar', 'V-образная')], ['single_handle', L('Handle', 'Одиночная')], ['cuff', L('Cuff', 'Манжета')]] },
  position: { key: 'position', label: L('Position', 'Положение'), options: [['standing', L('Standing', 'Стоя')], ['seated', L('Seated', 'Сидя')]] },
  execution: { key: 'execution', label: L('Execution', 'Выполнение'), options: [['simultaneous', L('Both arms together', 'Обе руки вместе')], ['alternating', L('Alternating', 'Поочерёдно')]] },
  legs: { key: 'legs', label: L('Legs', 'Ноги'), options: [['straight', L('Straight', 'Прямые')], ['bent', L('Bent knees', 'Согнутые')]] },
  depth: { key: 'depth', label: L('Depth', 'Глубина'), options: [['above_parallel', L('Above parallel', 'Выше параллели')], ['parallel', L('Parallel', 'До параллели')], ['below_parallel', L('Below parallel', 'Ниже параллели')]] },
  barPosition: { key: 'barPosition', label: L('Bar position', 'Положение грифа'), options: [['high_bar', L('High bar', 'Высокое')], ['low_bar', L('Low bar', 'Низкое')]] },
  stance: { key: 'stance', label: L('Stance', 'Постановка ног'), options: [['narrow', L('Narrow', 'Узкая')], ['shoulder', L('Shoulder', 'По ширине плеч')], ['wide', L('Wide', 'Широкая')]] },
  grip: { key: 'grip', label: L('Grip', 'Хват'), options: [['pronated', L('Overhand', 'Прямой')], ['supinated', L('Underhand', 'Обратный')], ['neutral', L('Neutral', 'Нейтральный')], ['mixed', L('Mixed', 'Разнохват')]] },
  gripWidth: { key: 'gripWidth', label: L('Grip width', 'Ширина хвата'), options: [['narrow', L('Narrow', 'Узкий')], ['shoulder', L('Shoulder', 'По ширине плеч')], ['wide', L('Wide', 'Широкий')]] },
  loading: { key: 'loading', label: L('Load', 'Вес'), options: [['bodyweight', L('Bodyweight', 'Свой вес')], ['weighted', L('Weighted (belt)', 'С отягощением (пояс)')]] },
}));
/** Fields kept for the owner's records that do not change muscle credit (said so in the Setup panel). */
const RECORD_ONLY: Partial<Record<VariationField, string>> = byLang(() => ({
  depth: L("Recorded for your history; doesn't change muscle credit.", 'Записывается для вашей истории; на зачёт мышцам не влияет.'),
  barPosition: L("Recorded for your history; doesn't change muscle credit.", 'Записывается для вашей истории; на зачёт мышцам не влияет.'),
  stance: L("Recorded for your history; doesn't change muscle credit.", 'Записывается для вашей истории; на зачёт мышцам не влияет.'),
  execution: L("Recorded for your history; doesn't change muscle credit.", 'Записывается для вашей истории; на зачёт мышцам не влияет.'),
  gripWidth: L("Recorded for your history; doesn't change muscle credit.", 'Записывается для вашей истории; на зачёт мышцам не влияет.'),
}));
const RANGE_OPTIONS: [NonNullable<Variation['rom']>, string][] = byLang(() => [['full', L('Full', 'Полная')], ['lengthened_partial', L('Lengthened partials', 'Частичные в растяжении')], ['partial', L('Partial', 'Частичная')]] as [NonNullable<Variation['rom']>, string][]);

/** Range of motion is rarely changed, so it sits behind "More options" (shown open when a value is set). */
export function MoreOptions({ rom, onRom }: { rom: Variation['rom'] | null; onRom: (r: Variation['rom'] | null) => void }) {
  const [open, setOpen] = useState(!!rom);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="min-h-[40px] text-left text-xs text-ink-500 underline decoration-dotted underline-offset-2 sm:col-span-4">{L('More options (range of motion)', 'Ещё параметры (амплитуда)')}</button>;
  return (
    <div className="sm:col-span-4">
      <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Range of motion', 'Амплитуда')}</div>
      <div className="flex flex-wrap gap-1.5">
        {RANGE_OPTIONS.map(([v, label]) => <Chip key={v} on={rom === v} onClick={() => onRom(rom === v ? null : v)}>{label}</Chip>)}
      </div>
      <p className="mt-1 text-[11px] text-ink-400">{L('Not set = full range. Partial reps count a little less; lengthened partials count fully (Settings → Set-quality model).', 'Не указано = полная амплитуда. Частичные повторения засчитываются чуть меньше; частичные в растянутом положении — полностью (Настройки → Модель качества подхода).')}</p>
    </div>
  );
}

function humanizeDepth(d: string): string {
  return CHOICES.depth?.options.find(([v]) => v === d)?.[1].toLowerCase() ?? humanize(d);
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx('h-11 rounded-full px-3.5 text-[13px] font-medium transition active:scale-95', on ? 'bg-accent-500 text-ink-950' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{children}</button>
  );
}

/** Touch chips for the variation fields this exercise uses (bench angle, attachment, one side at a time…). */
export function VariationChips({ def, v, onChange, notes, sides, onSides, showSides }: { def: ExerciseDef; v?: Variation; onChange: (p: Partial<Variation>) => void; notes: string[]; sides: SidesMode; onSides: (m: SidesMode) => void; showSides: boolean }) {
  // Grip fields appear only where they matter; a value logged earlier is still shown (and editable).
  const fields = [...(def.variationFields ?? []), ...(['grip', 'gripWidth'] as VariationField[]).filter((f) => !def.variationFields?.includes(f) && v?.[f as 'grip' | 'gripWidth'])];
  if (!fields.length && !showSides) return null;
  const angle = v?.benchAngleDeg ?? null;
  // An incline exercise done flat is a different exercise (e.g. dumbbell bench press), so no "Flat" chip there.
  const chips = def.pattern === 'incline_push' ? ANGLE_CHIPS.filter((d) => d > 0) : ANGLE_CHIPS;
  return (
    <div className="space-y-3 sm:col-span-4">
      {fields.includes('angle') && (
        <div>
          <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Bench angle', 'Угол скамьи')}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((d) => <Chip key={d} on={angle === d} onClick={() => onChange({ benchAngleDeg: angle === d ? null : d })}>{d === 0 ? L('Flat', 'Горизонт.') : `${d}°`}</Chip>)}
            <div className="w-24"><NumInput value={angle != null && !ANGLE_CHIPS.includes(angle) ? angle : null} onChange={(x) => onChange({ benchAngleDeg: x })} placeholder={L('other °', 'другой °')} /></div>
          </div>
          {notes.length > 0 && <p className="mt-1 text-[11px] text-ink-500">{notes.join(' ')}</p>}
          <p className="mt-0.5 text-[11px] text-ink-400">{L("Each angle keeps its own strength history. Muscle credit uses coarse groups only (flat / incline / steep); evidence doesn't support finer steps.", 'У каждого угла своя история силы. Зачёт мышцам считается только по грубым группам (горизонтально / наклон / крутой наклон): данные исследований не позволяют делить точнее.')}</p>
        </div>
      )}
      {showSides && (
        <div>
          <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Sides', 'Стороны')}</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={sides === 'both'} onClick={() => onSides('both')}>{L('Both together', 'Обе вместе')}</Chip>
            <Chip on={sides === 'one_lr'} onClick={() => onSides('one_lr')}>{L('One side, log L and R', 'По одной, записывать Л и П')}</Chip>
            <Chip on={sides === 'one'} onClick={() => onSides('one')}>{L('One side, one row per round', 'По одной, одна строка на круг')}</Chip>
          </div>
        </div>
      )}
      {fields.map((f) => {
        const c = CHOICES[f];
        if (!c) return null;
        const cur = (v?.[c.key] as string | null | undefined) ?? null;
        return (
          <div key={f}>
            <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">{c.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {c.options.map(([val, label]) => <Chip key={val} on={cur === val} onClick={() => onChange({ [c.key]: cur === val ? null : val } as Partial<Variation>)}>{label}</Chip>)}
            </div>
            {RECORD_ONLY[f] && <p className="mt-1 text-[11px] text-ink-400">{RECORD_ONLY[f]}</p>}
            {f === 'grip' && def.pattern === 'vertical_pull' && <p className="mt-1 text-[11px] text-ink-400">{L('An underhand grip gives the biceps more credit on pulldowns and pull-ups.', 'Обратный хват даёт бицепсу больший зачёт в тягах сверху и подтягиваниях.')}</p>}
          </div>
        );
      })}
    </div>
  );
}

export function SettingsEditor({ settings, template, onChange, onSaveDefault }: { settings: Record<string, string>; template: string[]; onChange: (s: Record<string, string>) => void; onSaveDefault?: () => void }) {
  const [k, setK] = useState('');
  // Template names (seat, arm pad…) are always offered; blank ones are not stored.
  const keys = [...template, ...Object.keys(settings).filter((x) => !template.includes(x))];
  const filled = Object.values(settings).some((x) => x.trim());
  return (
    <div className="sm:col-span-4">
      <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">{template.length ? L('Machine settings', 'Настройки тренажёра') : L('Other settings (optional)', 'Другие настройки (необязательно)')}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {keys.map((key) => (
          <label key={key} className="min-w-0">
            <span className="flex items-center justify-between text-[11px] text-ink-500">
              <span className="truncate">{key}</span>
              {!template.includes(key) && <button type="button" className="h-6 px-1.5 text-ink-400 active:text-rose-500" onClick={() => { const n = { ...settings }; delete n[key]; onChange(n); }} aria-label={L(`Remove ${key}`, `Удалить «${key}»`)}>×</button>}
            </span>
            <input className="mt-0.5 h-10 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm outline-none focus:border-accent-500 dark:border-ink-700 dark:bg-ink-900" value={settings[key] ?? ''} placeholder="—"
              onChange={(e) => {
                // Template names left blank are not stored (they are always offered anyway).
                const n = { ...settings, [key]: e.target.value };
                if (template.includes(key) && !e.target.value.trim()) delete n[key];
                onChange(n);
              }} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <form className="flex" onSubmit={(e) => { e.preventDefault(); if (k.trim()) { onChange({ ...settings, [k.trim()]: settings[k.trim()] ?? '' }); setK(''); } }}>
          <input className="h-10 w-36 rounded-lg border border-dashed border-ink-300 bg-transparent px-2 text-sm outline-none dark:border-ink-700" placeholder={L('+ other setting', '+ другая настройка')} enterKeyHint="done" value={k} onChange={(e) => setK(e.target.value)} />
        </form>
        {onSaveDefault && filled && <Button size="sm" variant="ghost" onClick={onSaveDefault}>{L('Remember for this machine', 'Запомнить для тренажёра')}</Button>}
      </div>
    </div>
  );
}

const RIR_OPTIONS: { v: number | null; label: string }[] = [
  { v: 0, label: '0' }, { v: 1, label: '1' }, { v: 2, label: '2' }, { v: 3, label: '3' }, { v: 4, label: '4' }, { v: 5, label: '5+' },
];

/**
 * Touch-first set row. Row 1: set type + large weight/reps steppers. Row 2: one-tap RIR chips + big ✓.
 * Every tap target is ≥ 40px; explanations open on tap (no hover-only information).
 */
function SetRow({ s, n, inc, pair, sideToggle, onChange, onRemove, onComplete }: { s: WorkoutSet; n: number; inc: number; pair: number; sideToggle: boolean; onChange: (p: Partial<WorkoutSet>) => void; onRemove: () => void; onComplete: () => void }) {
  const data = useData();
  const [info, setInfo] = useState(false);
  const q = assessSet(s, data.settings.quality);
  const done = !!s.completedAt;
  const warm = s.type === 'warmup';
  const sideTag = s.side === 'left' ? L('L', 'Л') : s.side === 'right' ? L('R', 'П') : '';
  const tag = warm ? L('W', 'Р') : s.type === 'drop' ? `${L('D', 'Д')}${sideTag}` : `${n}${sideTag}`;
  const planned = !!s.planned;
  // Choosing an RIR means the set was performed, so it starts counting.
  // RIR and the failure answer are separate fields: picking an RIR never changes the failure answer.
  const setRir = (v: number | null) => onChange({ rir: v, rirSource: v == null ? 'unknown' : 'reported', ...(v != null ? { planned: undefined } : {}) });
  return (
    <div id={`set-${s.id}`} className={cx('scroll-mt-32 border-l-[3px] border-t border-t-ink-100 px-3 py-3 first:border-t-0 dark:border-t-ink-800/60 sm:px-5',
      done ? 'border-l-emerald-500 bg-emerald-500/[0.05]' : planned ? 'border-l-ink-300 dark:border-l-ink-600' : 'border-l-transparent', warm && 'bg-ink-50/60 dark:bg-ink-950/30')}>
      <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] min-[360px]:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5">
        <button type="button" aria-label={L('Change set type (working / warm-up / drop)', 'Сменить тип подхода (рабочий / разминочный / дроп)')} onClick={() => onChange({ type: s.type === 'working' ? 'warmup' : s.type === 'warmup' ? 'drop' : 'working' })}
          className={cx('h-12 w-9 rounded-xl text-sm font-bold active:scale-95 min-[360px]:w-11', warm ? 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300' : s.type === 'drop' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'bg-accent-500/15 text-accent-600 dark:text-accent-400')}>{tag}</button>
        <Stepper value={s.weightKg} onChange={(v) => onChange({ weightKg: v })} step={inc} label={L('weight', 'вес')} />
        <Stepper value={s.reps} onChange={(v) => onChange({ reps: v == null ? null : Math.round(v) })} step={1} label={L('reps', 'повторения')} />
      </div>

      <div className="mt-2 flex items-center gap-[3px] sm:gap-1.5">
        {warm ? (
          <span className="flex-1 text-xs text-ink-500">{L('Warm-up · never counted as volume', 'Разминка · в объём не входит')}</span>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-[3px] sm:gap-1" role="group" aria-label={L('Reps in reserve (RIR)', 'Повторы в запасе (RIR)')}>
            <span className="hidden w-9 text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:inline">RIR</span>
            {RIR_OPTIONS.map((o) => (
              <button key={o.label} type="button" onClick={() => setRir(s.rir === o.v ? null : o.v)} aria-pressed={s.rir === o.v}
                className={cx('h-11 min-w-0 flex-1 rounded-lg text-sm font-semibold tabular-nums transition active:scale-95 sm:flex-none sm:px-3',
                  s.rir === o.v ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{o.label}</button>
            ))}
          </div>
        )}
        <button type="button" onClick={onComplete} aria-label={done ? L('Set completed', 'Подход выполнен') : L('Complete set', 'Отметить подход')}
          className={cx('flex h-11 w-[46px] shrink-0 items-center justify-center rounded-xl transition active:scale-95 sm:w-14', done ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300')}>
          <IconCheck size={22} />
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-500">
        <div className="flex min-w-0 items-center gap-2">
          {sideToggle && !warm && (
            <button type="button" aria-label={L('Side (left / right / both)', 'Сторона (левая / правая / обе)')} onClick={() => onChange({ side: s.side === 'left' ? 'right' : s.side === 'right' ? undefined : 'left' })}
              className="flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-lg bg-ink-100 px-2 text-xs font-semibold text-ink-700 active:scale-95 dark:bg-ink-800 dark:text-ink-200">{s.side === 'right' ? L('Right', 'Правая') : s.side === 'left' ? L('Left', 'Левая') : L('Both', 'Обе')}</button>
          )}
          {!warm && (
            <button type="button" onClick={() => setInfo(!info)} aria-expanded={info} className="min-h-[44px] truncate text-left underline decoration-dotted underline-offset-2">
              {planned ? L('Not counted — tap ✓', 'Не засчитан — нажмите ✓') : L(`counts ${Math.round(q.credit * pair * 100) / 100}${pair < 1 ? ' (L+R pair)' : ''}${s.rir == null && !s.toFailure ? ' · RIR not set' : ''}`, `в зачёт ${num(Math.round(q.credit * pair * 100) / 100)}${pair < 1 ? ' (пара Л+П)' : ''}${s.rir == null && !s.toFailure ? ' · RIR не указан' : ''}`)}
            </button>
          )}
          <label className="flex min-h-[44px] shrink-0 items-center gap-1">
            <IconTimer size={14} />
            <input aria-label={L('Rest before set (seconds)', 'Отдых перед подходом (секунды)')} inputMode="numeric" className="h-11 w-14 rounded-md bg-transparent px-1 text-center outline-none placeholder:text-ink-400 focus:bg-ink-100 dark:focus:bg-ink-800" placeholder={L('rest s', 'отдых, с')}
              value={s.restSecBefore ?? ''} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); onChange({ restSecBefore: v ? Number(v) : null, restSource: v ? 'manual' : undefined }); }} />
            {s.restSource === 'timer' && <span className="text-accent-600 dark:text-accent-400">{L('auto', 'авто')}</span>}
          </label>
        </div>
        <button type="button" onClick={onRemove} className="min-h-[44px] min-w-[44px] shrink-0 px-2 text-ink-400 active:text-rose-500">{L('Remove', 'Удалить')}</button>
      </div>
      {!warm && !planned && <FailureQuestion s={s} onChange={onChange} />}
      {!warm && !planned && <SetFeedback s={s} onChange={onChange} />}
      {info && !warm && (
        <div className="mt-1 rounded-lg bg-ink-50 p-2.5 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">
          {s.side && <div className="mb-1">{L(`This is the ${s.side} side. A left set and a right set together count as one set.`, `Это ${s.side === 'left' ? 'левая' : 'правая'} сторона. Левый и правый подход вместе считаются одним подходом.`)}</div>}
          {planned && <div className="mb-1 font-medium">{L('Pre-filled from last time. It is not counted until you tick ✓ (or pick an RIR). Unticked sets are left out when you finish.', 'Подход заполнен заранее. Он не засчитывается, пока вы не нажмёте ✓ (или не выберете RIR). Неотмеченные подходы при сохранении не включаются.')}</div>}
          {q.reasons.map((r, i) => <div key={i}>• {r}</div>)}
          <div className="mt-1 text-ink-400">{L('RIR = reps in reserve: how many more clean reps you could have done. 0–3 counts fully.', 'RIR — повторы в запасе: сколько ещё чистых повторений вы могли бы сделать. 0–3 засчитывается полностью.')}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Body weight context (pull-ups, dips, squats…)

/**
 * The body weight that applies to this session (latest weigh-in BEFORE it started) next to the
 * exercise. Bodyweight exercises: body + belt shown separately, the sum labelled an estimate.
 * Squats etc.: context only — never added to the bar. Missing body weight never blocks logging.
 */
function BodyLine({ w, ex, kind, series, repTop }: { w: Workout; ex: WorkoutExercise; kind?: EquipmentKind; series: ProgressionSeries | null; repTop: number }) {
  const data = useData();
  const [add, setAdd] = useState(false);
  const rel = bodyWeightRelevant(ex.exerciseId, kind);
  if (!rel) return null;
  const b = bodyWeightForSession(data.body, w);
  const belt = ex.variation?.loading === 'weighted' ? Math.max(0, ...ex.sets.filter((s) => s.type === 'working' && s.weightKg != null).map((s) => s.weightKg as number)) : 0;
  const advice = series ? pullUpLoadingAdvice(series, repTop) : null;
  return (
    <div className="px-4 sm:px-5">
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-ink-600 dark:text-ink-300">
        <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 dark:bg-ink-800">{L('Body', 'Тело')}</span>
        {b.kg == null ? <span className="text-ink-500">{L('not logged', 'не записан')}</span> : (
          <span>
            {fmt(b.kg)} {KG()}
            <span className="text-ink-400"> · {b.date === w.date ? b.time ?? L('today', 'сегодня') : formatDate(b.date!, { day: 'numeric', month: 'short' })}{b.status === 'outdated' ? L(' · outdated', ' · устарел') : ''}</span>
            {rel === 'system' && belt > 0 && <> · {L('belt', 'пояс')} {fmt(belt)} {KG()} · <span title={L('Body + belt: an estimate of system mass, not the force through the movement', 'Тело + пояс: оценка общей массы, а не усилия в движении')}>≈ {fmt(b.kg + belt)} {L('kg est.', 'кг, оценка')}</span></>}
            {rel === 'context' && <span className="text-ink-400">{L(' · context only', ' · только для справки')}</span>}
          </span>
        )}
        <button type="button" onClick={() => setAdd(true)} className="min-h-[32px] rounded-lg px-1.5 font-semibold text-accent-600 dark:text-accent-400">{L('+ weight', '+ вес')}</button>
      </div>
      {advice && <p className="mt-0.5 text-[11px] text-accent-700 dark:text-accent-300">{advice}</p>}
      <AddBodyWeight open={add} onClose={() => setAdd(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- Execution cue (tempo model)

/**
 * One short line: lowering · lifting · pause. Details on tap. Guidance only — tempo never changes
 * how a set is counted (see src/data/scientific-evidence/tempo.ts and rule `tempo_no_credit`).
 */
export function ExecutionCue({ exerciseId }: { exerciseId: string }) {
  const [open, setOpen] = useState(false);
  const t = tempoFor(exerciseId);
  if (!t) return null;
  const eccSec = t.eccentricSec ? (t.eccentricSec[0] === t.eccentricSec[1] ? `${t.eccentricSec[0]}` : `${t.eccentricSec[0]}–${t.eccentricSec[1]}`) : '';
  const ecc = t.eccentricSec ? L(`↓ ${eccSec} s`, `↓ ${eccSec} с`) : L('↓ controlled', '↓ под контролем');
  const con = t.maxIntent === 'no' ? L('↑ smooth', '↑ плавно') : t.maxIntent === 'yes_controlled' ? L('↑ strong, stable', '↑ мощно, стабильно') : L('↑ fast intent', '↑ с намерением быстро');
  const pause = t.pause === 'none' ? null : t.pauseWhere ? L(`pause: ${t.pauseWhere.split(/[,(]/)[0].trim()}`, `пауза: ${t.pauseWhere.split(/[,(]/)[0].trim()}`) : L('brief pause', 'короткая пауза');
  const confidence = L(t.confidence.replace('_', ' '), ({ moderate: 'средняя', low: 'низкая', very_low: 'очень низкая' } as Record<string, string>)[t.confidence] ?? t.confidence);
  return (
    <div className="px-4 sm:px-5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1.5 flex min-h-[36px] max-w-full items-center gap-1.5 text-left text-xs text-ink-600 dark:text-ink-300">
        <span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 dark:bg-ink-800">{L('Form', 'Техника')}</span>
        <span className="truncate tabular-nums">{[ecc, con, pause].filter(Boolean).join(' · ')}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded-lg bg-ink-50 p-2.5 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">
          <ul className="list-disc space-y-0.5 pl-4">{t.cues.map((c) => <li key={c}>{c}</li>)}</ul>
          <p><b className="font-medium">{L('Lowering:', 'Опускание:')}</b> {t.eccentric}. <b className="font-medium">{L('Lifting:', 'Подъём:')}</b> {t.concentric}.{t.pauseWhere ? <> <b className="font-medium">{L('Pause:', 'Пауза:')}</b> {t.pauseWhere}.</> : null}</p>
          <p><b className="font-medium">{L('Range:', 'Амплитуда:')}</b> {t.rom}</p>
          {t.avoid.length > 0 && <p><b className="font-medium">{L('Avoid:', 'Избегайте:')}</b> {t.avoid.join(' · ')}</p>}
          <p className="text-ink-500">{t.why} {L(`Fast intent means trying to move the weight quickly while staying in control — no bouncing, swinging or cutting the range. Reps slow down near failure; that is normal. Confidence: ${confidence}.`, `«С намерением быстро» — значит стараться двигать вес быстро, сохраняя контроль: без отбивов, раскачки и сокращения амплитуды. Ближе к отказу повторения замедляются — это нормально. Уверенность: ${confidence}.`)}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Today's workout (prescription)

/** The prescription never throws into the UI: on any error the card falls back to the classic hints. */
export function safePrescribe(data: ReturnType<typeof useData>, a: ReturnType<typeof useAnalysis>, workout: Workout, exerciseIndex: number, setCount?: { count: number; reason: string }): Prescription | null {
  try {
    return prescribe({ data, analysis: a, now: new Date(), workout, exerciseIndex, ...(setCount ? { setCount } : {}) });
  } catch (e) {
    if (import.meta.env.DEV) console.warn('prescribe failed', e);
    return null;
  }
}

// ---------------------------------------------------------------- Failure question

const FAILURE_OPTIONS: { id: FailureStatus; label: string; hint: string }[] = byLang(() => [
  { id: 'muscular', label: L('Failure', 'Отказ'), hint: L('Could not do another full rep with good form.', 'Ещё одно полное повторение с хорошей техникой сделать не получилось.') },
  { id: 'none', label: L('Stopped before', 'До отказа'), hint: L('Stopped by choice — at least one more rep was possible.', 'Остановились сами — можно было сделать ещё хотя бы одно повторение.') },
  { id: 'uncertain', label: L('Not sure', 'Не уверен'), hint: L('Unsure whether it was real muscular failure.', 'Неясно, был ли это настоящий мышечный отказ.') },
] as { id: FailureStatus; label: string; hint: string }[]);

/**
 * "Did you reach muscular failure?" — one optional tap, separate from RIR (never changes it).
 * After "Failure", one more optional tap says whether technique gave out first (technical failure).
 * A gentle note appears when the answer and the logged RIR disagree; either can be corrected.
 */
function FailureQuestion({ s, onChange }: { s: WorkoutSet; onChange: (p: Partial<WorkoutSet>) => void }) {
  // Older sets: the "Fail" chip / import to_failure is shown as Failure (it was the owner's own report).
  const cur: FailureStatus | undefined = s.failure ?? (s.toFailure ? 'muscular' : undefined);
  // Only the failure answer changes. RIR and the older "Fail"/to_failure report are never altered here —
  // a disagreement is shown as a note so the owner can correct whichever is wrong.
  const pick = (f: FailureStatus) => {
    if (s.failure === f) return onChange({ failure: undefined, technicalFailure: undefined });
    onChange({ failure: f, ...(f !== 'muscular' ? { technicalFailure: undefined } : {}) });
  };
  const note = failureConsistency({ ...s, failure: cur });
  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-1.5" role="group" aria-label={L('Did you reach muscular failure?', 'Дошли до мышечного отказа?')}>
        <span className="w-14 shrink-0 text-[10px] font-semibold uppercase leading-tight tracking-wider text-ink-400">{L('Failure?', 'Отказ?')}</span>
        {FAILURE_OPTIONS.map((o) => (
          <button key={o.id} type="button" aria-pressed={cur === o.id} title={o.hint} onClick={() => pick(o.id)}
            className={cx('h-11 min-w-0 flex-1 rounded-lg px-1 text-[12px] font-medium leading-tight transition active:scale-95',
              cur === o.id ? (o.id === 'muscular' ? 'bg-rose-500 text-white' : o.id === 'none' ? 'bg-accent-500 text-ink-950' : 'bg-ink-500 text-white') : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{o.label}</button>
        ))}
      </div>
      {cur === 'muscular' && (
        <div className="mt-1 flex items-center gap-1.5 pl-[3.875rem]">
          <button type="button" aria-pressed={s.technicalFailure === true} onClick={() => onChange({ technicalFailure: s.technicalFailure === true ? undefined : true })}
            className={cx('h-11 rounded-lg px-3 text-[12px] font-medium active:scale-95', s.technicalFailure ? 'bg-amber-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{L('Form broke first', 'Сначала подвела техника')}</button>
          <span className="text-[11px] text-ink-400">{L('optional', 'необязательно')}</span>
        </div>
      )}
      {note && <p className="mt-1 pl-[3.875rem] text-[11px] leading-snug text-amber-700 dark:text-amber-300">{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- Per-set feedback

/**
 * "How did this set feel?" — one tap. Stores the answer plus three separate dimensions
 * (effort, weight accuracy, technique) that can be adjusted under Details. RIR is untouched.
 */
function SetFeedback({ s, onChange }: { s: WorkoutSet; onChange: (p: Partial<WorkoutSet>) => void }) {
  // Editing a past workout: one small button per set.
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false); // hooks before any early return
  if (!open && !s.feel) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-[44px] text-[12px] font-medium text-accent-600 dark:text-accent-400">{L('+ How did it feel?', '+ Как ощущался подход?')}</button>
    );
  }
  const sel = s.feel ? FEEL_BY_ID[s.feel] : null;
  const est = estimatedRirRange(s);
  const pick = (f: SetFeel) => {
    const patch = feelPatch(s, f);
    onChange(patch);
    // Collapse after a plain answer; keep open where a follow-up is useful (pain area, intended weight).
    if (patch.feel && f !== 'pain' && f !== 'wrong_light' && f !== 'wrong_heavy') setOpen(false);
  };
  if (!open && sel) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setOpen(true)} className={cx('flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 font-medium', FEEL_TONE[sel.id])}>
          {sel.title}{s.pain?.area ? ` · ${painArea(s.pain.area)}` : ''}{s.intendedWeightKg != null ? L(` · meant ${fmt(s.intendedWeightKg, 2)} kg`, ` · планировали ${fmt(s.intendedWeightKg, 2)} кг`) : ''} <span className="text-[10px] opacity-70">{L('change', 'изменить')}</span>
        </button>
        {est && <span className="text-ink-500">RIR ≈ {formatRirRange(est)} {L('(estimate)', '(оценка)')}</span>}
        {s.notes && <span className="truncate text-ink-500">“{s.notes}”</span>}
      </div>
    );
  }
  return (
    <div className="mt-1.5 rounded-xl bg-ink-50 p-2 dark:bg-ink-950/60">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-500">
        <span className="font-semibold uppercase tracking-wider">{L('How did it feel?', 'Как ощущался подход?')}</span>
        <span>{L('optional', 'необязательно')}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={L('How did this set feel?', 'Как ощущался этот подход?')}>
        {FEEL_OPTIONS.map((o) => (
          <button key={o.id} type="button" aria-pressed={s.feel === o.id} onClick={() => pick(o.id)}
            className={cx('min-h-[44px] rounded-lg px-1 text-[12px] font-medium leading-tight transition active:scale-95',
              s.feel === o.id ? FEEL_TONE[o.id] + ' ring-2 ring-current/30' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{o.label}</button>
        ))}
      </div>
      {sel && <p className="mt-1.5 text-[11px] leading-snug text-ink-500">{sel.description}{est ? L(` No RIR logged: RIR ≈ ${formatRirRange(est)} (estimate, not measured).`, ` RIR не записан: RIR ≈ ${formatRirRange(est)} (оценка, не измерение).`) : ''}</p>}
      {s.feel === 'pain' && (
        <div className="mt-2 space-y-2">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] leading-snug text-rose-700 dark:text-rose-300">
            {L("Stop or change the movement if it hurts — don't push through pain. This app can't diagnose anything; if it persists or is sharp, get it checked. The set is kept but not counted as a normal quality set.", 'Если больно, остановитесь или смените движение — не работайте через боль. Приложение ничего не диагностирует; если боль острая или не проходит, обратитесь к врачу. Подход сохраняется, но не считается обычным качественным подходом.')}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PAIN_AREAS.map((a) => (
              <button key={a} type="button" aria-pressed={s.pain?.area === a} onClick={() => onChange({ pain: { area: s.pain?.area === a ? '' : a, note: s.pain?.note } })}
                className={cx('h-11 rounded-full px-3 text-[12px] font-medium', s.pain?.area === a ? 'bg-rose-500 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{painArea(a)}</button>
            ))}
          </div>
          <input className="h-11 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm outline-none dark:border-ink-700 dark:bg-ink-900" placeholder={L('What did it feel like? (optional)', 'Как это ощущалось? (необязательно)')}
            value={s.pain?.note ?? ''} onChange={(e) => onChange({ pain: { area: s.pain?.area ?? '', note: e.target.value || undefined } })} />
        </div>
      )}
      {(s.feel === 'wrong_light' || s.feel === 'wrong_heavy') && (
        <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-600 dark:text-ink-300">
          <span className="shrink-0">{L('Meant to use', 'Планировали')}</span>
          <div className="w-28"><NumInput value={s.intendedWeightKg ?? null} onChange={(v) => onChange({ intendedWeightKg: v })} placeholder={L('kg (optional)', 'кг (необязательно)')} step={0.5} /></div>
        </label>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="min-h-[44px] text-[12px] font-medium text-accent-600 dark:text-accent-400">{details ? L('Hide details', 'Скрыть детали') : L('Details & note', 'Детали и заметка')}</button>
        {sel && <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] min-w-[44px] px-2 text-[12px] text-ink-500">{L('Done', 'Готово')}</button>}
      </div>
      {details && (
        <div className="mt-1 space-y-2">
          <DimRow label={L('Effort', 'Усилие')} value={s.effort} options={Object.entries(EFFORT_LABEL) as [Effort, string][]} onPick={(v) => onChange({ effort: v })} />
          <DimRow label={L('Weight', 'Вес')} value={s.weightAccuracy} options={Object.entries(ACCURACY_LABEL) as [WeightAccuracy, string][]} onPick={(v) => onChange({ weightAccuracy: v })} />
          <DimRow label={L('Execution', 'Выполнение')} value={s.execution} options={EXECUTION_FEEDBACK.map((o) => [o.id, o.label]) as [ExecutionFeedback, string][]} onPick={(v) => onChange({ execution: v })} />
          <DimRow label={L('Technique', 'Техника')} value={techniqueOf(s)} options={Object.entries(TECHNIQUE_LABEL) as [Technique, string][]} onPick={(v) => onChange({ technique: v, ...(s.techniqueOk === false ? { techniqueOk: undefined } : {}) })} />
          <input className="h-11 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm outline-none dark:border-ink-700 dark:bg-ink-900" placeholder={L('Note (e.g. lost balance on the last reps)', 'Заметка (напр. потеря равновесия в последних повторениях)')}
            value={s.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} />
          <p className="text-[11px] text-ink-400">{L('RIR stays separate — log it with the numbers above if you know it.', 'RIR записывается отдельно — отметьте его числами выше, если знаете.')}</p>
        </div>
      )}
    </div>
  );
}

function DimRow<T extends string>({ label, value, options, onPick }: { label: string; value: T | undefined; options: [T, string][]; onPick: (v: T | undefined) => void }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium text-ink-500">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onPick(value === v ? undefined : v)}
            className={cx('min-h-[44px] rounded-full px-3 text-[12px] font-medium', value === v ? 'bg-accent-500 text-ink-950' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{l}</button>
        ))}
      </div>
    </div>
  );
}

/** Pain areas are stored in English (the set keeps the value); this is the text shown. */
const painArea = (a: string): string => L(a, ({ Shoulder: 'Плечо', Elbow: 'Локоть', Wrist: 'Запястье', Neck: 'Шея', 'Upper back': 'Верх спины', 'Lower back': 'Поясница', Hip: 'Бедро', Knee: 'Колено', Ankle: 'Голеностоп', Other: 'Другое' } as Record<string, string>)[a] ?? a);

const FEEL_TONE: Record<SetFeel, string> = {
  too_easy: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  bit_easy: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  just_right: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  hard_good: 'bg-emerald-600/20 text-emerald-800 dark:text-emerald-200',
  too_heavy_form: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  wrong_light: 'bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-200',
  wrong_heavy: 'bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-200',
  pain: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

// ---------------------------------------------------------------- Live remaining

function LiveRemaining({ sessionEff }: { sessionEff: Partial<Record<MuscleId, number>> }) {
  const a = useAnalysis();
  const names = useNames();
  const rows = [...a.muscles].sort((x, y) => (sessionEff[y.muscle] ?? 0) - (sessionEff[x.muscle] ?? 0) || y.remainingToPreferred - x.remainingToPreferred);
  const touched = rows.filter((m) => (sessionEff[m.muscle] ?? 0) > 0);
  const open = rows.filter((m) => (sessionEff[m.muscle] ?? 0) === 0 && m.todayLeft > 0).sort((x, y) => y.todayLeft - x.todayLeft).slice(0, 8);
  return (
    <Card>
      <CardTitle hint={L('Updates as you log, counting indirect work (e.g. pulldowns count toward biceps).', 'Обновляется по мере записи, с учётом косвенной работы (напр. тяги сверху идут в зачёт бицепсу).')}>{L('Today & this week', 'Сегодня и эта неделя')}</CardTitle>
      {touched.length > 0 && (
        <div className="space-y-2.5">
          {touched.map((m) => (
            <div key={m.muscle}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{names.muscle(m.muscle)}</span>
                <span className="tabular-nums text-xs text-ink-500">+{fmt(sessionEff[m.muscle])} {L('today', 'сегодня')}{m.todayLeft > 0 ? L(` · ${fmt(m.todayLeft)} more`, ` · ещё ${fmt(m.todayLeft)}`) : ''} · <b className={cx('text-sm', m.remainingToPreferred <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-900 dark:text-white')}>{m.remainingToPreferred <= 0 ? L('week done', 'неделя закрыта') : L(`${fmt(m.remainingToPreferred)} wk`, `${fmt(m.remainingToPreferred)} на нед.`)}</b></span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div className={cx('h-full rounded-full transition-all duration-500', m.remainingToPreferred <= 0 ? 'bg-emerald-500' : 'bg-accent-500')} style={{ width: `${Math.min(100, m.pctOfPreferred * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {open.length > 0 && (
        <div className={cx(touched.length > 0 && 'mt-4 border-t border-ink-100 pt-3 dark:border-ink-800')}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Still due today', 'Ещё на сегодня')}</div>
          <div className="flex flex-wrap gap-1.5">
            {open.map((m) => <Badge key={m.muscle}>{names.muscle(m.muscle)} ≈{fmt(m.todayLeft)} · {fmt(m.remainingToPreferred)} {L('wk', 'на нед.')}</Badge>)}
          </div>
        </div>
      )}
      {!touched.length && !open.length && <p className="text-sm text-ink-500">{L('All targets met this week.', 'Все цели этой недели выполнены.')}</p>}
    </Card>
  );
}

/** Phones: sticky chip strip so remaining sets stay visible while logging. */
function MobileRemainingStrip({ sessionEff }: { sessionEff: Partial<Record<MuscleId, number>> }) {
  const a = useAnalysis();
  const names = useNames();
  // Today's plan first (what is still due this session), then muscles already covered today.
  const due = a.muscles.filter((m) => m.todayLeft > 0).sort((x, y) => y.todayLeft - x.todayLeft || y.remainingToPreferred - x.remainingToPreferred);
  const covered = a.muscles.filter((m) => m.todayLeft <= 0 && (sessionEff[m.muscle] ?? 0) > 0 && m.todayShare > 0);
  const rows = [...due, ...covered];
  if (!rows.length) return null;
  return (
    <div className="sticky top-[57px] z-20 -mx-4 border-b border-ink-200 bg-ink-50/90 px-4 py-2 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/90 lg:hidden [@media(max-height:500px)]:static">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">{L('Today · sets still due', 'Сегодня · осталось подходов')} <span className="normal-case tracking-normal text-ink-400">{L('(week left)', '(на неделю)')}</span></div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {rows.map((m) => {
          const ok = m.todayLeft <= 0;
          return (
            <span key={m.muscle} className={cx('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums', ok ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-white text-ink-700 shadow-sm dark:bg-ink-800 dark:text-ink-200')}>
              {names.muscle(m.muscle)} {ok ? '✓' : <b className="font-semibold text-ink-900 dark:text-white">{fmt(m.todayLeft)}</b>} <span className="text-ink-400">({fmt(m.remainingToPreferred)})</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

const mmss = (sec: number) => `${sec < 0 ? '-' : ''}${Math.floor(Math.abs(sec) / 60)}:${String(Math.abs(sec) % 60).padStart(2, '0')}`;

/** End-of-workout numbers. One button. */
export function SummaryModal({ s, onDone, onBack }: { s: SessionSummary; onDone: () => void; onBack?: () => void }) {
  const a = useAnalysis();
  const names = useNames();
  const stat = (k: string, v: string) => <div className="rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-950"><div className="text-[10px] uppercase tracking-wider text-ink-500">{k}</div><div className="text-lg font-semibold tabular-nums text-ink-900 dark:text-white">{v}</div></div>;
  return (
    <Modal open onClose={onDone} title={L('Workout saved', 'Тренировка сохранена')} footer={<>{onBack && <Button className="flex-1" onClick={onBack}>{L('Back to workout', 'Вернуться к тренировке')}</Button>}<Button variant="primary" className="flex-1" onClick={onDone}>{L('Done', 'Готово')}</Button></>}>
      <div className="grid grid-cols-3 gap-2">
        {stat(L('Duration', 'Время'), s.durationMin != null ? L(`${s.durationMin} min`, `${s.durationMin} мин`) : '—')}
        {stat(L('Exercises', 'Упражнения'), String(s.exercises))}
        {stat(L('Sets', 'Подходы'), String(s.workingSets))}
        {stat(L('Warm-ups', 'Разминка'), String(s.warmupSets))}
        {stat(L('Tonnage', 'Тоннаж'), `${s.tonnageKg.toLocaleString(locale())} ${KG()}`)}
        {stat(L('Avg rest', 'Ср. отдых'), s.avgRestSec != null ? mmss(s.avgRestSec) : '—')}
      </div>
      {s.muscles.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Effective sets', 'Эффективные подходы')}</div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
            {s.muscles.map((m) => <li key={m.muscle} className="flex justify-between gap-2"><span className="truncate">{names.muscle(m.muscle)}</span><b className="font-semibold">+{fmt(m.effective, 2)}</b></li>)}
          </ul>
        </div>
      )}
      {s.records.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Records', 'Рекорды')}</div>
          <ul className="space-y-0.5 text-sm">{s.records.map((r) => <li key={r.exerciseId + r.kind}>{r.kind === 'weight' ? '↑' : '+'} {names.ex(a.registry.get(r.exerciseId), r.exerciseId)}: <b className="font-semibold tabular-nums">{r.text}</b></li>)}</ul>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
        <Badge tone="neutral">{L('Failure sets', 'Подходы до отказа')} {s.muscularFailureSets}</Badge>
        {s.technicalFailureSets > 0 && <Badge tone="warn">{L('Form broke', 'Отказ по технике')} {s.technicalFailureSets}</Badge>}
        {s.compromisedSets > 0 && <Badge tone="warn">{L('Technique issues', 'Проблемы с техникой')} {s.compromisedSets}</Badge>}
        {s.skippedExercises > 0 && <Badge tone="neutral">{L('Skipped', 'Пропущено')} {s.skippedExercises}</Badge>}
      </div>
      <p className="mt-3 text-[11px] text-ink-500">{L('Tonnage = weight × reps as logged (per dumbbell for dumbbells). Weekly numbers are already updated.', 'Тоннаж = вес × повторения, как записано (для гантелей — вес одной гантели). Недельные показатели уже обновлены.')}</p>
    </Modal>
  );
}

// ---------------------------------------------------------------- Pickers

export function ExercisePicker({ open, onClose, onPick, locationId, workout, title }: { open: boolean; onClose: () => void; onPick: (d: ExerciseDef, opts?: AddOpts) => void; locationId: string | null; workout: Workout | null; title?: string }) {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  const [card, setCard] = useState<{ def: ExerciseDef; a: ChoiceAssessment } | null>(null);
  // The default title follows the language (a default parameter would freeze it); callers pass the pair already resolved.
  const addTitle = L('Add exercise', 'Добавить упражнение');
  const heading = title ?? addTitle;
  const isAdd = title == null || title === 'Add exercise' || title === addTitle;
  useEffect(() => { if (open) { setQ(''); setMuscle(null); setCard(null); } }, [open]);
  const outcomes = useMemo(() => (open && workout ? choiceOutcomes(data, a) : new Map()), [open, workout, data, a]);
  const badge = (d: ExerciseDef) => (workout ? assessChoice({ data, analysis: a, workout, exerciseId: d.id, alternatives: false, outcomes }) : null);
  const choose = (d: ExerciseDef) => {
    if (!workout) return onPick(d);
    const full = assessChoice({ data, analysis: a, workout, exerciseId: d.id, outcomes });
    if (!needsPrompt(workout, full)) return onPick(d);
    setCard({ def: d, a: full });
  };
  const record = (c: ChoiceAssessment, followed: ExerciseChoiceRecord['followed'], replaced?: string): ExerciseChoiceRecord => ({
    status: c.status, reasonKind: c.reasonKind, alternativeOffered: c.alternatives[0]?.exerciseId ?? null, followed, ...(replaced ? { replacedExerciseId: replaced } : {}), at: new Date().toISOString(),
  });

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of data.workouts) for (const e of w.exercises) m.set(e.exerciseId, (m.get(e.exerciseId) ?? 0) + 1);
    return m;
  }, [data.workouts]);
  const atGym = useMemo(() => new Set(data.equipment.filter((e) => e.locationId === locationId).flatMap((e) => e.exerciseIds)), [data.equipment, locationId]);

  const results = useMemo(() => {
    let list = q ? searchExercises(a.registry, q, 40) : [...a.registry.values()];
    if (muscle) list = list.filter((d) => (d.contributions[muscle] ?? 0) >= 0.75);
    return [...list].sort((x, y) => (q ? 0 : (usage.get(y.id) ?? 0) + (atGym.has(y.id) ? 3 : 0) - (usage.get(x.id) ?? 0) - (atGym.has(x.id) ? 3 : 0))).slice(0, 40);
  }, [q, muscle, a.registry, usage, atGym]);

  const needs = a.muscles.filter((m) => m.todayLeft > 0).sort((x, y) => y.todayLeft - x.todayLeft).slice(0, 8);
  // On touch phones, opening the keyboard immediately would hide the muscle filter.
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  if (card) {
    return (
      <Modal open={open} onClose={onClose} title={addTitle} wide>
        <ChoiceCard a={card.a} name={names.ex(card.def)} altName={(id) => names.ex(a.registry.get(id))}
          onContinue={() => onPick(card.def, { choice: record(card.a, 'continued'), ackKey: card.a.key })}
          onAlternative={(alt) => {
            const d = a.registry.get(alt.exerciseId);
            if (!d) return;
            if (alt.kind === 'do_first') {
              // Already in the session: go to that card instead of adding a duplicate.
              onClose();
              const target = workout?.exercises.find((e) => e.exerciseId === alt.exerciseId && !e.skipped);
              if (target) window.setTimeout(() => document.getElementById(`ex-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
              return;
            }
            onPick(d, { equipmentId: alt.equipmentId, choice: record(card.a, 'alternative', card.def.id), ackKey: card.a.key });
          }} />
        <button type="button" onClick={() => setCard(null)} className="mt-2 min-h-[44px] text-sm font-medium text-ink-600 dark:text-ink-300">{L('← Back to the list', '← Назад к списку')}</button>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={heading} wide>
      {!isAdd && <p className="mb-2 text-xs text-ink-500">{L('Sets you already did stay on the card; only the exercise changes.', 'Выполненные подходы остаются на карточке; меняется только упражнение.')}</p>}
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input autoFocus={!coarse} type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Search in English or Russian… (e.g. pulldown, жим)', 'Поиск на русском или английском… (напр. жим, pulldown)')} className="pl-9" />
      </div>
      {needs.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Due today — tap to filter', 'На сегодня — нажмите для фильтра')}</div>
          <div className="flex flex-wrap gap-1.5">
            {needs.map((m) => (
              <button key={m.muscle} type="button" onClick={() => setMuscle(muscle === m.muscle ? null : m.muscle)}
                aria-pressed={muscle === m.muscle}
                className={cx('h-10 rounded-full px-3.5 text-[13px] font-medium transition active:scale-95', muscle === m.muscle ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>
                {names.muscle(m.muscle)} · {fmt(m.todayLeft)}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
        {results.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => choose(d)} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-1 py-2.5 text-left hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800/50 dark:active:bg-ink-800">
              <div className="flex min-w-0 items-center gap-2">
                {(() => { const b = badge(d); return b ? <ChoiceDot a={b} /> : null; })()}
                <div className="min-w-0">
                <div className="truncate text-sm font-medium">{names.ex(d)}</div>
                <div className="truncate text-xs text-ink-500">{L(d.name.ru, d.name.en)} · {Object.entries(d.contributions).filter(([, c]) => (c ?? 0) >= 0.75).map(([m]) => names.muscle(m as MuscleId)).join(', ')}</div>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {atGym.has(d.id) && <Badge tone="info">{L('at this gym', 'в этом зале')}</Badge>}
                {(usage.get(d.id) ?? 0) > 0 && <Badge>{usage.get(d.id)}×</Badge>}
              </div>
            </button>
          </li>
        ))}
        {!results.length && <li className="py-6 text-center text-sm text-ink-500">{L('No match. Create a custom exercise in the Exercise database.', 'Ничего не найдено. Создайте своё упражнение в базе упражнений.')}</li>}
      </ul>
    </Modal>
  );
}
