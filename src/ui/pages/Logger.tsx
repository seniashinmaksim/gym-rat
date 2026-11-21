import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activeWorkout } from '../Layout';
import { localNowParts, formatDate, formatDuration } from '../../domain/dates';
import { defaultIncrement, progressionKey, warmupFor } from '../../domain/progression';
import { assessSet } from '../../domain/quality';
import { resolveCoefficients, searchExercises } from '../../domain/registry';
import type { Equipment, EquipmentKind, ExerciseDef, LoadMode, Location, MuscleId, SetType, Workout, WorkoutExercise, WorkoutSet } from '../../domain/types';
import { sessionMuscleEffective } from '../../domain/volume';
import { slugId, uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { IconCheck, IconChevronDown, IconPlus, IconSearch, IconTimer, IconTrash } from '../components/icons';
import { Badge, Button, Card, CardTitle, confirmAction, cx, Empty, Field, fmt, Input, Modal, NumInput, Page, Select, Stepper, TextArea, toast, Why } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const MACHINE_KINDS: EquipmentKind[] = ['machine', 'plate_loaded', 'cable', 'smith'];

export function LoggerPage() {
  const { id } = useParams();
  const data = useData();
  const workout = id ? data.workouts.find((w) => w.id === id) : undefined;
  if (id && !workout) return <Page title="Workout not found"><Empty title="This workout does not exist." action={<Link to="/log"><Button>Start a new one</Button></Link>} /></Page>;
  if (!workout) return <StartSession />;
  return <SessionEditor key={workout.id} initial={workout} />;
}

// ---------------------------------------------------------------- Start

function StartSession() {
  const data = useData();
  const nav = useNavigate();
  const now = localNowParts(data.settings.timezone);
  const lastLoc = [...data.workouts].reverse().find((w) => w.locationId)?.locationId ?? data.locations[0]?.id ?? '';
  const [date, setDate] = useState(now.date);
  const [time, setTime] = useState(now.time);
  const [loc, setLoc] = useState<string>(lastLoc);
  const [newGym, setNewGym] = useState('');
  const recent = [...data.workouts].reverse().slice(0, 4);
  const active = activeWorkout(data.workouts);

  const start = async () => {
    let locationId: string | null = loc || null;
    if (loc === '__new' && newGym.trim()) {
      const l: Location = { id: slugId(newGym, 'gym'), name: newGym.trim(), photoIds: [], createdAt: new Date().toISOString() };
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
    <Page title="Log workout" subtitle="Start a session. Every set is saved encrypted as you go, so the weekly numbers update live.">
      {active && (
        <Link to={`/log/${active.id}`} className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-accent-500/40 bg-accent-500/10 px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink-900 dark:text-white">Workout in progress</span>
            <span className="block truncate text-xs text-ink-500">Started {active.startTime ?? ''} · {active.exercises.length} exercise{active.exercises.length === 1 ? '' : 's'}</span>
          </span>
          <span className="flex h-11 shrink-0 items-center rounded-xl bg-accent-500 px-4 text-sm font-semibold text-ink-950">Resume</span>
        </Link>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Start time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Gym">
              <Select value={loc} onChange={(e) => setLoc(e.target.value)}>
                {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                <option value="__new">{data.locations.length ? '+ New gym / unknown…' : 'New gym…'}</option>
              </Select>
            </Field>
          </div>
          {(loc === '__new' || !data.locations.length) && (
            <Field className="mt-4" label="New gym name" hint="Leave empty to log the session with an unknown location."><Input value={newGym} onChange={(e) => { setNewGym(e.target.value); setLoc('__new'); }} placeholder="e.g. Gym A" /></Field>
          )}
          <Button variant="primary" size="lg" className="mt-5 w-full sm:w-auto" onClick={start}>Start session</Button>
        </Card>
        <Card>
          <CardTitle hint="Prefer talking? Describe the workout to Claude and paste the JSON.">Other ways to log</CardTitle>
          <Link to="/import"><Button className="w-full">Import from Claude</Button></Link>
          {recent.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Recent sessions</div>
              {recent.map((w) => (
                <Link key={w.id} to={`/log/${w.id}`} className="flex items-center justify-between rounded-xl px-2.5 py-2 text-sm hover:bg-ink-100 dark:hover:bg-ink-800">
                  <span>{formatDate(w.date)}</span><span className="text-xs text-ink-500">{w.exercises.length} exercises</span>
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

function SessionEditor({ initial }: { initial: Workout }) {
  const data = useData();
  const a = useAnalysis();
  const nav = useNavigate();
  const [w, setW] = useState<Workout>(initial);
  const [picker, setPicker] = useState(false);
  const [lastDone, setLastDone] = useState<{ at: number; restTarget: number } | null>(null);
  // After ✓, bring the next set to the middle of the screen (clear of the floating rest timer).
  const [focusSet, setFocusSet] = useState<string | null>(null);
  useEffect(() => {
    if (!focusSet) return;
    const t = window.setTimeout(() => document.getElementById(`set-${focusSet}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    return () => window.clearTimeout(t);
  }, [focusSet]);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef(w);
  latest.current = w;

  // Debounced autosave (encrypted write).
  const update = useCallback((fn: (w: Workout) => Workout) => {
    setW((prev) => {
      const next = fn(prev);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void store.saveWorkout(next), 350);
      return next;
    });
  }, []);
  useEffect(() => () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      void store.saveWorkout(latest.current);
    }
  }, []);

  const location = data.locations.find((l) => l.id === w.locationId);
  // While a live session is open, new sets are "planned" (pre-filled, not counted) until ticked.
  const live = !w.endTime;
  const sessionEff = useMemo(() => sessionMuscleEffective(w, a.registry, data.settings.quality), [w, a.registry, data.settings.quality]);

  const addExercise = (def: ExerciseDef) => {
    setPicker(false);
    const eq = data.equipment.find((e) => e.exerciseIds.includes(def.id) && e.locationId === w.locationId) ?? null;
    const prev = lastSessionFor(data.workouts, def.id, eq?.id ?? null, w.id);
    const series = a.progression.find((p) => p.exerciseId === def.id && (eq ? p.equipmentId === eq.id : true));
    // Prefill from what was actually done last time (suggested load if an increase is due); never invent reps.
    // The pre-filled set is only a plan: it counts once you tick it.
    const lastWorking = prev?.sets.find((s) => s.type === 'working' && !s.planned);
    const firstWeight = series?.next.weight ?? lastWorking?.weightKg ?? null;
    const firstReps = series?.next.action === 'increase' ? series.next.repTarget[0] : lastWorking?.reps ?? null;
    const ex: WorkoutExercise = {
      id: uid('we'), order: w.exercises.length, exerciseId: def.id, exerciseConfidence: 'confirmed',
      equipmentId: eq?.id ?? null, equipmentConfidence: eq ? 'confirmed' : 'unknown',
      settings: eq ? { ...eq.settings } : undefined,
      variation: prev?.variation ? { ...prev.variation } : undefined,
      sets: [newSet('working', firstWeight, firstReps, defaultLoadMode(def), live)],
      startedAt: new Date().toISOString(),
    };
    update((x) => ({ ...x, exercises: [...x.exercises, ex] }));
  };

  /** ✓ toggles a set: done (counted, timer starts, next set pre-filled) ↔ not done. */
  const completeSet = (exId: string, setId: string) => {
    const nowMs = Date.now();
    const ex = w.exercises.find((e) => e.id === exId);
    const target = ex?.sets.find((s) => s.id === setId);
    if (!ex || !target) return;
    if (target.completedAt) {
      update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id !== exId ? e : {
        ...e, sets: e.sets.map((s) => {
          if (s.id !== setId) return s;
          const { completedAt: _c, ...rest } = s;
          void _c;
          return { ...rest, planned: live ? true : undefined, ...(s.restSource === 'timer' ? { restSecBefore: null, restSource: undefined } : {}) };
        }),
      })) }));
      return;
    }
    const prevSession = lastSessionFor(data.workouts, ex.exerciseId, ex.equipmentId, w.id);
    // Live session: if this is the last set, pre-fill the next one (same load; last time's reps for that set if known).
    const idx = ex.sets.findIndex((s) => s.id === setId);
    let next: WorkoutSet | null = null;
    if (live && idx === ex.sets.length - 1 && target.type !== 'warmup') {
      const n = ex.sets.filter((s) => s.type === 'working').length;
      const prevReps = prevSession?.sets.filter((s) => s.type === 'working' && !s.planned)[n]?.reps;
      next = newSet('working', target.weightKg, prevReps ?? target.reps, target.loadMode, true);
    }
    setFocusSet(next?.id ?? ex.sets[idx + 1]?.id ?? null);
    update((x) => ({ ...x, exercises: x.exercises.map((e) => {
      if (e.id !== exId) return e;
      let sets = e.sets.map((s) => {
        if (s.id !== setId) return s;
        const done: WorkoutSet = { ...s, planned: undefined, completedAt: new Date(nowMs).toISOString() };
        // Rest measured by the timer: time since the previous completed set minus an estimate of set duration (≈3 s/rep).
        if (lastDone && s.restSecBefore == null && e.sets.some((o) => o.completedAt)) {
          const gap = Math.round((nowMs - lastDone.at) / 1000 - (s.reps ?? 8) * 3);
          if (gap > 0 && gap < 1800) {
            done.restSecBefore = gap;
            done.restSource = 'timer';
          }
        }
        return done;
      });
      if (next && sets[sets.length - 1]?.id === setId) sets = [...sets, next];
      return { ...e, sets };
    }) }));
    const def = a.registry.get(ex.exerciseId);
    setLastDone({ at: nowMs, restTarget: def?.defaultRestSec ?? 120 });
  };

  const finish = async () => {
    // Sets that were pre-filled but never performed (not ticked, no RIR) are dropped, never saved as volume.
    const unticked = latest.current.exercises.reduce((n, e) => n + e.sets.filter((s) => s.planned).length, 0);
    const exercises = latest.current.exercises
      .map((e) => ({ ...e, sets: e.sets.filter((s) => !s.planned) }))
      .filter((e) => e.sets.length > 0)
      .map((e, i) => ({ ...e, order: i }));
    const x = { ...latest.current, exercises };
    if (!x.exercises.length) {
      await store.deleteWorkout(x.id);
      nav('/');
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
    const final = { ...x, endTime: x.endTime ?? (x.date === now.date ? now.time : null), durationMin };
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setW(final);
    await store.saveWorkout(final);
    toast(unticked ? `Workout saved · ${unticked} unticked set${unticked === 1 ? '' : 's'} left out` : 'Workout saved');
    nav('/');
  };

  const remove = async () => {
    if (!confirmAction('Delete this workout permanently?')) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    await store.deleteWorkout(w.id);
    nav('/history');
  };

  return (
    <Page
      title={live ? 'Workout in progress' : 'Edit workout'}
      subtitle={<span>{formatDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}{location ? ` · ${location.name}` : ' · gym unknown'}</span>}
      actions={<><Button variant="ghost" onClick={remove} aria-label="Delete workout" className="w-11 px-0"><IconTrash size={18} /></Button><Button variant="primary" onClick={finish}><IconCheck size={16} />{live ? 'Finish' : 'Save'}</Button></>}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <MobileRemainingStrip sessionEff={sessionEff} />
          <SessionMeta w={w} update={update} />
          {w.exercises.map((ex, i) => (
            <ExerciseCard key={ex.id} index={i} w={w} ex={ex} live={live} update={update} onComplete={completeSet} />
          ))}
          <button type="button" onClick={() => setPicker(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-300 py-5 text-sm font-semibold text-ink-600 transition hover:border-accent-500 hover:text-accent-600 dark:border-ink-700 dark:text-ink-300 dark:hover:text-accent-400">
            <IconPlus size={18} /> Add exercise
          </button>
          <Wellness w={w} update={update} />
        </div>
        <div className="lg:sticky lg:top-4 lg:self-start">
          <LiveRemaining sessionEff={sessionEff} />
        </div>
      </div>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercise} locationId={w.locationId} />
      {lastDone && <RestTimer since={lastDone.at} target={lastDone.restTarget} onDismiss={() => setLastDone(null)} />}
      <div className="h-6" aria-hidden />
    </Page>
  );
}

function newSet(type: SetType, weight: number | null, reps: number | null, loadMode: LoadMode = 'total', planned = false): WorkoutSet {
  return { id: uid('s'), type, weightKg: weight, loadMode, reps, rir: null, rirSource: 'unknown', restSecBefore: null, ...(planned ? { planned: true } : {}) };
}

function defaultLoadMode(def: ExerciseDef): LoadMode {
  if (def.id === 'assisted_pull_up') return 'assisted';
  if (def.equipmentKind === 'bodyweight') return 'bodyweight_plus';
  return 'total';
}

function lastSessionFor(workouts: Workout[], exerciseId: string, equipmentId: string | null, excludeId: string): WorkoutExercise | null {
  for (let i = workouts.length - 1; i >= 0; i--) {
    const w = workouts[i];
    if (w.id === excludeId) continue;
    const e = w.exercises.find((x) => x.exerciseId === exerciseId && (equipmentId == null || x.equipmentId === equipmentId));
    if (e) return e;
  }
  return null;
}

// ---------------------------------------------------------------- Session meta & wellness

function SessionMeta({ w, update }: { w: Workout; update: (fn: (w: Workout) => Workout) => void }) {
  const data = useData();
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-sm sm:px-5">
        <span className="font-medium text-ink-700 dark:text-ink-200">Session details</span>
        <span className="flex items-center gap-2 text-xs text-ink-500">{w.startTime ?? '--:--'}{w.endTime ? `–${w.endTime}` : ''} <IconChevronDown size={14} className={cx('transition', open && 'rotate-180')} /></span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-ink-100 px-4 py-4 dark:border-ink-800 sm:grid-cols-4 sm:px-5">
          <Field label="Date"><Input type="date" value={w.date} onChange={(e) => update((x) => ({ ...x, date: e.target.value }))} /></Field>
          <Field label="Gym">
            <Select value={w.locationId ?? ''} onChange={(e) => update((x) => ({ ...x, locationId: e.target.value || null, locationConfidence: e.target.value ? 'confirmed' : 'unknown' }))}>
              <option value="">Unknown</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
          <Field label="Start"><Input type="time" value={w.startTime ?? ''} onChange={(e) => update((x) => ({ ...x, startTime: e.target.value || null }))} /></Field>
          <Field label="End"><Input type="time" value={w.endTime ?? ''} onChange={(e) => update((x) => ({ ...x, endTime: e.target.value || null }))} /></Field>
          <Field label="Notes" className="sm:col-span-4"><TextArea className="font-sans text-sm" value={w.notes ?? ''} onChange={(e) => update((x) => ({ ...x, notes: e.target.value }))} /></Field>
        </div>
      )}
    </Card>
  );
}

function Wellness({ w, update }: { w: Workout; update: (fn: (w: Workout) => Workout) => void }) {
  const well = w.wellness ?? {};
  const set = (k: 'fatigue' | 'energy', v: number | null) => update((x) => ({ ...x, wellness: { ...(x.wellness ?? {}), [k]: v } }));
  return (
    <Card>
      <CardTitle hint="Optional. Used only for recovery and deload estimates.">How do you feel?</CardTitle>
      <div className="grid gap-4 sm:grid-cols-3">
        <ScalePick label="Fatigue (1 fresh – 5 exhausted)" value={well.fatigue ?? null} onChange={(v) => set('fatigue', v)} />
        <ScalePick label="Energy (1 low – 5 great)" value={well.energy ?? null} onChange={(v) => set('energy', v)} />
        <Field label="Sleep last night (h)"><NumInput value={well.sleepHours ?? null} onChange={(v) => update((x) => ({ ...x, wellness: { ...(x.wellness ?? {}), sleepHours: v } }))} step={0.5} /></Field>
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

function ExerciseCard({ index, w, ex, live, update, onComplete }: {
  index: number; w: Workout; ex: WorkoutExercise; live: boolean; update: (fn: (w: Workout) => Workout) => void; onComplete: (exId: string, setId: string) => void;
}) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const def = a.registry.get(ex.exerciseId);
  const eq = ex.equipmentId ? data.equipment.find((e) => e.id === ex.equipmentId) : undefined;
  const [showVar, setShowVar] = useState(false);
  const [newEq, setNewEq] = useState(false);
  const needsMachine = def ? MACHINE_KINDS.includes(def.equipmentKind) : false;
  const inc = eq?.incrementsKg?.length ? Math.min(...eq.incrementsKg) : defaultIncrement(def?.equipmentKind, ex.sets[0]?.loadMode);

  const setEx = (fn: (e: WorkoutExercise) => WorkoutExercise) => update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === ex.id ? fn(e) : e)) }));
  const setSet = (sid: string, patch: Partial<WorkoutSet>) => setEx((e) => ({ ...e, sets: e.sets.map((s) => (s.id === sid ? { ...s, ...patch } : s)) }));

  const key = def ? progressionKey(ex, w, def) : '';
  const series = a.progression.find((p) => p.key === key);
  const prev = lastSessionFor(data.workouts.filter((x) => x.date <= w.date), ex.exerciseId, ex.equipmentId, w.id);
  const priorSameMuscle = useMemo(() => {
    if (!def) return 0;
    const primary = Object.entries(def.contributions).filter(([, c]) => (c ?? 0) >= 0.75).map(([m]) => m);
    let n = 0;
    for (const o of w.exercises.slice(0, index)) {
      const od = a.registry.get(o.exerciseId);
      if (od && primary.some((m) => ((od.contributions as Record<string, number>)[m] ?? 0) >= 0.5)) n += o.sets.filter((s) => s.type !== 'warmup').length;
    }
    return n;
  }, [def, w.exercises, index, a.registry]);
  const target = series?.next ?? null;
  const wu = warmupFor(def, target?.weight ?? ex.sets.find((s) => s.type === 'working')?.weightKg ?? null, inc, priorSameMuscle);
  const resolved = def ? resolveCoefficients(def, ex.variation) : null;
  const eqOptions = data.equipment.filter((e) => !w.locationId || e.locationId === w.locationId || e.locationId == null);

  const addSet = (type: SetType = 'working') => {
    const last = [...ex.sets].reverse().find((s) => s.type === type) ?? ex.sets[ex.sets.length - 1];
    setEx((e) => ({ ...e, sets: [...e.sets, newSet(type, last?.weightKg ?? null, last?.reps ?? null, last?.loadMode, live)] }));
  };
  const addWarmups = () => {
    if (!wu.sets.length) return;
    setEx((e) => ({ ...e, sets: [...wu.sets.map((s) => newSet('warmup', s.weight, s.reps, e.sets[0]?.loadMode, live)), ...e.sets] }));
  };

  return (
    <Card padded={false}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">{index + 1}</span>
            <h3 className="truncate text-base font-semibold text-ink-900 dark:text-white">{names.ex(def, ex.exerciseNameRaw ?? ex.exerciseId)}</h3>
          </div>
          {names.exSub(def) && <div className="ml-8 text-xs text-ink-400">{names.exSub(def)}</div>}
          {resolved && (
            <div className="ml-8 mt-1.5 flex flex-wrap gap-1">
              {Object.entries(resolved.contributions).filter(([, c]) => (c ?? 0) > 0).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0)).map(([m, c]) => (
                <Badge key={m} tone={(c ?? 0) >= 0.75 ? 'accent' : 'neutral'}>{names.muscle(m as MuscleId)} {c}</Badge>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="-mr-2 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-400 hover:bg-ink-100 hover:text-rose-500 active:text-rose-500 dark:hover:bg-ink-800" aria-label="Remove exercise"
          onClick={() => confirmAction('Remove this exercise and its sets?') && update((x) => ({ ...x, exercises: x.exercises.filter((e) => e.id !== ex.id).map((e, i) => ({ ...e, order: i })) }))}>
          <IconTrash size={16} />
        </button>
      </div>

      <div className="mt-3 grid gap-2 px-4 sm:grid-cols-[1fr_auto] sm:px-5">
        <Select value={ex.equipmentId ?? ''} onChange={(e) => {
          if (e.target.value === '__new') return setNewEq(true);
          const chosen = data.equipment.find((q) => q.id === e.target.value);
          setEx((x) => ({ ...x, equipmentId: chosen?.id ?? null, equipmentConfidence: chosen ? 'confirmed' : 'unknown', settings: chosen ? { ...chosen.settings, ...(x.settings ?? {}) } : x.settings }));
        }} className={cx(needsMachine && !ex.equipmentId && 'border-amber-500/60')}>
          <option value="">{needsMachine ? 'Which machine? (not identified)' : 'Free weights / no specific equipment'}</option>
          {eqOptions.map((q) => <option key={q.id} value={q.id}>{q.name}{q.manufacturer ? ` · ${q.manufacturer}` : ''}{q.exerciseIds.includes(ex.exerciseId) ? ' ★' : ''}</option>)}
          <option value="__new">+ New machine at this gym…</option>
        </Select>
        <Button size="md" variant="ghost" onClick={() => setShowVar(!showVar)}>Setup {showVar ? '▴' : '▾'}</Button>
      </div>
      {needsMachine && !ex.equipmentId && <p className="px-4 pt-1.5 text-[11px] text-amber-700 dark:text-amber-300 sm:px-5">Different machines are tracked separately, and their loads are never compared. Pick or add this machine to keep its history clean.</p>}

      {showVar && (
        <div className="mx-4 mt-3 grid gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950 sm:mx-5 sm:grid-cols-4">
          {def?.angleSensitive && (
            <Field label="Bench angle (°)" hint="0 flat, 30 incline, −15 decline"><NumInput value={ex.variation?.benchAngleDeg ?? null} onChange={(v) => setEx((e) => ({ ...e, variation: { ...(e.variation ?? {}), benchAngleDeg: v } }))} /></Field>
          )}
          <Field label="Grip"><Select value={ex.variation?.grip ?? ''} onChange={(e) => setEx((x) => ({ ...x, variation: { ...(x.variation ?? {}), grip: e.target.value || null } }))}>
            <option value="">—</option><option value="pronated">Pronated</option><option value="supinated">Supinated</option><option value="neutral">Neutral</option><option value="mixed">Mixed</option>
          </Select></Field>
          <Field label="Grip width"><Select value={ex.variation?.gripWidth ?? ''} onChange={(e) => setEx((x) => ({ ...x, variation: { ...(x.variation ?? {}), gripWidth: e.target.value || null } }))}>
            <option value="">—</option><option value="narrow">Narrow</option><option value="shoulder">Shoulder</option><option value="wide">Wide</option>
          </Select></Field>
          <Field label="Range of motion"><Select value={ex.variation?.rom ?? ''} onChange={(e) => setEx((x) => ({ ...x, variation: { ...(x.variation ?? {}), rom: (e.target.value || null) as WorkoutExercise['variation'] extends infer V ? V extends { rom?: infer R } ? R : never : never } }))}>
            <option value="">Full (default)</option><option value="full">Full</option><option value="lengthened_partial">Lengthened partials</option><option value="partial">Partial</option>
          </Select></Field>
          <SettingsEditor settings={ex.settings ?? {}} onChange={(s) => setEx((x) => ({ ...x, settings: s }))}
            onSaveDefault={eq ? () => { void store.saveEquipment({ ...eq, settings: { ...(ex.settings ?? {}) } }); toast('Saved as this machine\'s default settings'); } : undefined} />
        </div>
      )}

      <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 sm:mx-5">
        {prev ? <span>Last time: <b className="font-medium text-ink-700 dark:text-ink-200">{prev.sets.filter((s) => s.type === 'working' && !s.planned).map((s) => `${s.weightKg ?? 'BW'}×${s.reps ?? '?'}${s.rir != null ? `@${s.rir}` : ''}`).join(', ')}</b></span> : <span>No history on this {ex.equipmentId ? 'machine' : 'exercise'} yet — calibration session.</span>}
        {target && <Badge tone={target.action === 'increase' ? 'good' : target.action === 'reduce' ? 'warn' : 'neutral'}>{target.action === 'increase' ? '↑' : target.action === 'reduce' ? '↓' : '='} {target.weight != null ? `${fmt(target.weight, 2)} kg` : 'BW'} · {target.repTarget[0]}–{target.repTarget[1]}</Badge>}
      </div>
      {(target || wu.sets.length > 0) && (
        <div className="mx-4 mt-1 sm:mx-5">
          <Why label="Suggestion & warm-up">
            {target && <p>{target.reason}</p>}
            <p>Warm-up: {wu.sets.length ? wu.sets.map((s) => `${s.weight != null ? `${fmt(s.weight, 2)} kg` : 'BW'} × ${s.reps}`).join(' → ') : 'none'} — {wu.reason}</p>
            {wu.sets.length > 0 && !ex.sets.some((s) => s.type === 'warmup') && <Button size="sm" className="mt-1" onClick={addWarmups}>Add these warm-up sets</Button>}
          </Why>
        </div>
      )}

      <div className="mt-3 border-t border-ink-100 dark:border-ink-800">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:px-5">
          <span>Set</span><span className="text-center">Weight kg</span><span className="text-center">Reps</span>
        </div>
        {index === 0 && <p className="px-4 pb-1 text-[11px] leading-snug text-ink-500 sm:px-5">Numbers below the reps are <b className="font-semibold">RIR</b> — reps you still had left. Tap one, then ✓ to count the set.</p>}
        {ex.sets.map((s, i) => (
          <SetRow key={s.id} s={s} n={ex.sets.slice(0, i + 1).filter((x) => x.type === s.type).length} inc={inc} onChange={(p) => setSet(s.id, p)}
            onRemove={() => setEx((e) => ({ ...e, sets: e.sets.filter((x) => x.id !== s.id) }))} onComplete={() => onComplete(ex.id, s.id)} />
        ))}
        <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
          <Button size="sm" onClick={() => addSet('working')}><IconPlus size={14} />Set</Button>
          <Button size="sm" variant="ghost" onClick={() => addSet('warmup')}>+ Warm-up</Button>
          <Button size="sm" variant="ghost" onClick={() => addSet('drop')}>+ Drop</Button>
        </div>
      </div>
      <NewEquipmentModal open={newEq} onClose={() => setNewEq(false)} def={def} locationId={w.locationId}
        onCreated={(q) => { setNewEq(false); setEx((x) => ({ ...x, equipmentId: q.id, equipmentConfidence: 'confirmed' })); }} />
    </Card>
  );
}

function SettingsEditor({ settings, onChange, onSaveDefault }: { settings: Record<string, string>; onChange: (s: Record<string, string>) => void; onSaveDefault?: () => void }) {
  const [k, setK] = useState('');
  const entries = Object.entries(settings);
  return (
    <div className="sm:col-span-4">
      <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">Machine settings</div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-center overflow-hidden rounded-lg border border-ink-200 dark:border-ink-700">
            <span className="bg-ink-100 px-2 py-1 text-xs text-ink-600 dark:bg-ink-800 dark:text-ink-300">{key}</span>
            <input className="w-16 bg-transparent px-2 py-1 text-xs outline-none" value={val} onChange={(e) => onChange({ ...settings, [key]: e.target.value })} />
            <button type="button" className="px-1.5 text-ink-400 hover:text-rose-500" onClick={() => { const n = { ...settings }; delete n[key]; onChange(n); }} aria-label={`Remove ${key}`}>×</button>
          </div>
        ))}
        <form className="flex" onSubmit={(e) => { e.preventDefault(); if (k.trim()) { onChange({ ...settings, [k.trim()]: '' }); setK(''); } }}>
          <input className="w-28 rounded-lg border border-dashed border-ink-300 bg-transparent px-2 py-1 text-xs outline-none dark:border-ink-700" placeholder="+ seat, pad…" value={k} onChange={(e) => setK(e.target.value)} />
        </form>
        {onSaveDefault && entries.length > 0 && <Button size="sm" variant="ghost" onClick={onSaveDefault}>Remember for this machine</Button>}
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
function SetRow({ s, n, inc, onChange, onRemove, onComplete }: { s: WorkoutSet; n: number; inc: number; onChange: (p: Partial<WorkoutSet>) => void; onRemove: () => void; onComplete: () => void }) {
  const data = useData();
  const [info, setInfo] = useState(false);
  const q = assessSet(s, data.settings.quality);
  const done = !!s.completedAt;
  const warm = s.type === 'warmup';
  const tag = warm ? 'W' : s.type === 'drop' ? 'D' : String(n);
  const planned = !!s.planned;
  // Choosing an RIR means the set was performed, so it starts counting (✓ additionally starts the rest timer).
  const setRir = (v: number | null, failure = false) => onChange({ rir: v, rirSource: v == null ? 'unknown' : 'reported', toFailure: failure, ...(v != null ? { planned: undefined } : {}) });
  return (
    <div id={`set-${s.id}`} className={cx('scroll-mt-32 border-l-[3px] border-t border-t-ink-100 px-4 py-3 first:border-t-0 dark:border-t-ink-800/60 sm:px-5',
      done ? 'border-l-emerald-500 bg-emerald-500/[0.05]' : planned ? 'border-l-ink-300 dark:border-l-ink-600' : 'border-l-transparent', warm && 'bg-ink-50/60 dark:bg-ink-950/30')}>
      <div className="grid grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
        <button type="button" aria-label="Change set type (working / warm-up / drop)" onClick={() => onChange({ type: s.type === 'working' ? 'warmup' : s.type === 'warmup' ? 'drop' : 'working' })}
          className={cx('h-11 w-11 rounded-xl text-sm font-bold active:scale-95', warm ? 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300' : s.type === 'drop' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'bg-accent-500/15 text-accent-600 dark:text-accent-400')}>{tag}</button>
        <Stepper value={s.weightKg} onChange={(v) => onChange({ weightKg: v })} step={inc} label="weight" />
        <Stepper value={s.reps} onChange={(v) => onChange({ reps: v == null ? null : Math.round(v) })} step={1} label="reps" />
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        {warm ? (
          <span className="flex-1 text-xs text-ink-500">Warm-up · never counted as volume</span>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-1" role="group" aria-label="Reps in reserve (RIR)">
            <span className="hidden w-9 text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:inline">RIR</span>
            {RIR_OPTIONS.map((o) => (
              <button key={o.label} type="button" onClick={() => setRir(s.rir === o.v && !s.toFailure ? null : o.v)} aria-pressed={s.rir === o.v && !s.toFailure}
                className={cx('h-11 min-w-0 flex-1 rounded-lg text-sm font-semibold tabular-nums transition active:scale-95 sm:flex-none sm:px-3',
                  s.rir === o.v && !s.toFailure ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{o.label}</button>
            ))}
            <button type="button" onClick={() => setRir(s.toFailure ? null : 0, !s.toFailure)} aria-pressed={!!s.toFailure}
              className={cx('h-11 min-w-0 flex-[1.3] rounded-lg text-xs font-semibold transition active:scale-95 sm:flex-none sm:px-3', s.toFailure ? 'bg-rose-500 text-white' : 'bg-rose-500/10 text-rose-600 dark:text-rose-300')}>Fail</button>
          </div>
        )}
        <button type="button" onClick={onComplete} aria-label={done ? 'Set completed' : 'Complete set'}
          className={cx('flex h-11 w-14 shrink-0 items-center justify-center rounded-xl transition active:scale-95', done ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300')}>
          <IconCheck size={22} />
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-500">
        <div className="flex min-w-0 items-center gap-2">
          {!warm && (
            <button type="button" onClick={() => setInfo(!info)} aria-expanded={info} className="min-h-[44px] truncate text-left underline decoration-dotted underline-offset-2">
              {planned ? 'Not counted — tap ✓' : s.rir == null && !s.toFailure ? `counts ${q.credit} · RIR not set` : `counts ${q.credit}`}
            </button>
          )}
          <label className="flex min-h-[44px] shrink-0 items-center gap-1">
            <IconTimer size={14} />
            <input aria-label="Rest before set (seconds)" inputMode="numeric" className="h-9 w-14 rounded-md bg-transparent px-1 text-center outline-none placeholder:text-ink-400 focus:bg-ink-100 dark:focus:bg-ink-800" placeholder="rest s"
              value={s.restSecBefore ?? ''} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); onChange({ restSecBefore: v ? Number(v) : null, restSource: v ? 'manual' : undefined }); }} />
            {s.restSource === 'timer' && <span className="text-accent-600 dark:text-accent-400">auto</span>}
          </label>
        </div>
        <button type="button" onClick={onRemove} className="min-h-[44px] shrink-0 px-2 text-ink-400 active:text-rose-500">Remove</button>
      </div>
      {info && !warm && (
        <div className="mt-1 rounded-lg bg-ink-50 p-2.5 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">
          {planned && <div className="mb-1 font-medium">Pre-filled from last time. It is not counted until you tick ✓ (or pick an RIR). Unticked sets are left out when you finish.</div>}
          {q.reasons.map((r, i) => <div key={i}>• {r}</div>)}
          <div className="mt-1 text-ink-400">RIR = reps in reserve: how many more clean reps you could have done. 0–3 counts fully.</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Live remaining

function LiveRemaining({ sessionEff }: { sessionEff: Partial<Record<MuscleId, number>> }) {
  const a = useAnalysis();
  const names = useNames();
  const rows = [...a.muscles].sort((x, y) => (sessionEff[y.muscle] ?? 0) - (sessionEff[x.muscle] ?? 0) || y.remainingToPreferred - x.remainingToPreferred);
  const touched = rows.filter((m) => (sessionEff[m.muscle] ?? 0) > 0);
  const open = rows.filter((m) => (sessionEff[m.muscle] ?? 0) === 0 && m.todayLeft > 0).sort((x, y) => y.todayLeft - x.todayLeft).slice(0, 8);
  return (
    <Card>
      <CardTitle hint="Updates as you log, counting indirect work (e.g. pulldowns count toward biceps).">Today & this week</CardTitle>
      {touched.length > 0 && (
        <div className="space-y-2.5">
          {touched.map((m) => (
            <div key={m.muscle}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{names.muscle(m.muscle)}</span>
                <span className="tabular-nums text-xs text-ink-500">+{fmt(sessionEff[m.muscle])} today{m.todayLeft > 0 ? ` · ${fmt(m.todayLeft)} more` : ''} · <b className={cx('text-sm', m.remainingToPreferred <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-900 dark:text-white')}>{m.remainingToPreferred <= 0 ? 'week done' : `${fmt(m.remainingToPreferred)} wk`}</b></span>
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
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Still due today</div>
          <div className="flex flex-wrap gap-1.5">
            {open.map((m) => <Badge key={m.muscle}>{names.muscle(m.muscle)} ≈{fmt(m.todayLeft)} · {fmt(m.remainingToPreferred)} wk</Badge>)}
          </div>
        </div>
      )}
      {!touched.length && !open.length && <p className="text-sm text-ink-500">All targets met this week.</p>}
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
    <div className="sticky top-[57px] z-20 -mx-4 border-b border-ink-200 bg-ink-50/90 px-4 py-2 backdrop-blur-md dark:border-ink-800 dark:bg-ink-950/90 lg:hidden">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Today · sets still due <span className="normal-case tracking-normal text-ink-400">(week left)</span></div>
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

// ---------------------------------------------------------------- Rest timer

function RestTimer({ since, target, onDismiss }: { since: number; target: number; onDismiss: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  const el = Math.floor((now - since) / 1000);
  const pct = Math.min(1, el / target);
  const ready = el >= target;
  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 lg:bottom-6 lg:left-64">
      <div className={cx('flex items-center gap-3 rounded-2xl border px-4 py-2.5 shadow-xl backdrop-blur-md', ready ? 'border-emerald-500/40 bg-emerald-500/15' : 'border-ink-200 bg-white/90 dark:border-ink-700 dark:bg-ink-900/90')}>
        <svg width="34" height="34" viewBox="0 0 36 36" className="-rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" className="stroke-ink-200 dark:stroke-ink-700" />
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${pct * 94.2} 94.2`} className={ready ? 'stroke-emerald-500' : 'stroke-accent-500'} />
        </svg>
        <div>
          <div className="text-lg font-semibold tabular-nums leading-none">{formatDuration(el)}</div>
          <div className="text-[11px] text-ink-500">{ready ? 'Typical rest reached' : `typical ~${formatDuration(target)}`}</div>
        </div>
        <button type="button" onClick={onDismiss} className="-mr-2 ml-1 h-11 rounded-xl px-3 text-sm text-ink-500 hover:bg-ink-100 active:bg-ink-200 dark:hover:bg-ink-800 dark:active:bg-ink-700">Hide</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Pickers

function ExercisePicker({ open, onClose, onPick, locationId }: { open: boolean; onClose: () => void; onPick: (d: ExerciseDef) => void; locationId: string | null }) {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | null>(null);
  useEffect(() => { if (open) { setQ(''); setMuscle(null); } }, [open]);

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

  return (
    <Modal open={open} onClose={onClose} title="Add exercise" wide>
      <div className="relative">
        <IconSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input autoFocus={!coarse} type="search" enterKeyHint="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in English or Russian… (e.g. pulldown, жим)" className="pl-9" />
      </div>
      {needs.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Due today — tap to filter</div>
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
            <button type="button" onClick={() => onPick(d)} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-1 py-2.5 text-left hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800/50 dark:active:bg-ink-800">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{names.ex(d)}</div>
                <div className="truncate text-xs text-ink-500">{d.name.ru} · {Object.entries(d.contributions).filter(([, c]) => (c ?? 0) >= 0.75).map(([m]) => names.muscle(m as MuscleId)).join(', ')}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                {atGym.has(d.id) && <Badge tone="info">at this gym</Badge>}
                {(usage.get(d.id) ?? 0) > 0 && <Badge>{usage.get(d.id)}×</Badge>}
              </div>
            </button>
          </li>
        ))}
        {!results.length && <li className="py-6 text-center text-sm text-ink-500">No match. Create a custom exercise in the Exercise database.</li>}
      </ul>
    </Modal>
  );
}

function NewEquipmentModal({ open, onClose, def, locationId, onCreated }: { open: boolean; onClose: () => void; def?: ExerciseDef; locationId: string | null; onCreated: (e: Equipment) => void }) {
  const data = useData();
  const gym = data.locations.find((l) => l.id === locationId);
  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [incs, setIncs] = useState('');
  const [kind, setKind] = useState<EquipmentKind>('machine');
  useEffect(() => {
    if (open) {
      setName(def ? `${def.name.en}${gym ? ` — ${gym.name}` : ''}` : '');
      setKind(def?.equipmentKind && MACHINE_KINDS.includes(def.equipmentKind) ? def.equipmentKind : 'machine');
      setIncs(String(defaultIncrement(def?.equipmentKind)));
      setManufacturer('');
      setModel('');
    }
  }, [open, def, gym]);
  const create = async () => {
    const ts = new Date().toISOString();
    const e: Equipment = {
      id: slugId(name || 'machine', 'eq'), locationId, name: name.trim() || 'Unnamed machine', kind,
      manufacturer: manufacturer.trim() || null, model: model.trim() || null, identified: !!manufacturer.trim(),
      incrementsKg: incs.split(/[,; ]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => x > 0),
      settings: {}, exerciseIds: def ? [def.id] : [], photoIds: [], createdAt: ts, updatedAt: ts,
    };
    await store.saveEquipment(e);
    toast('Machine added');
    onCreated(e);
  };
  return (
    <Modal open={open} onClose={onClose} title="New machine" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={create}>Add machine</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Manufacturer" hint="Leave empty if unknown — identify later."><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Technogym" /></Field>
        <Field label="Model"><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
        <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind)}>
          {(['machine', 'plate_loaded', 'cable', 'smith', 'other'] as EquipmentKind[]).map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
        </Select></Field>
        <Field label="Weight increments (kg)" hint="e.g. 5 or 2.5, 5"><Input value={incs} onChange={(e) => setIncs(e.target.value)} /></Field>
      </div>
      <p className="mt-3 text-xs text-ink-500">Add photos, settings and details later under Equipment & gyms.</p>
    </Modal>
  );
}

