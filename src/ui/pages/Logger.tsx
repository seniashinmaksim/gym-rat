import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { activeWorkout } from '../Layout';
import { localNowParts, formatDate, formatDuration } from '../../domain/dates';
import { humanize, progressionKey, variationParts, warmupFor } from '../../domain/progression';
import { assessSet, countedSetCount, mergeSides, sideFactors } from '../../domain/quality';
import { ACCURACY_LABEL, EFFORT_LABEL, estimatedRirRange, FEEL_BY_ID, FEEL_OPTIONS, feelPatch, formatRirRange, PAIN_AREAS, techniqueOf, TECHNIQUE_LABEL, withCorrections, isFinished } from '../../domain/feedback';
import { loadUnitLabel, resolveCoefficients, searchExercises } from '../../domain/registry';
import type { Effort, Equipment, ExecutionFeedback, FailureStatus, EquipmentKind, ExerciseDef, LoadMode, Location, MuscleId, SetFeel, SetType, Technique, Variation, VariationField, WeightAccuracy, Workout, WorkoutExercise, WorkoutSet } from '../../domain/types';
import { sessionMuscleEffective } from '../../domain/volume';
import { slugId, uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { IconCheck, IconChevronDown, IconPlus, IconSearch, IconTimer, IconTrash } from '../components/icons';
import { EquipmentPicker } from '../components/EquipmentPicker';
import { EquipmentForm } from './Equipment';
import { loadStep } from '../../domain/increments';
import { failureConsistency } from '../../domain/failure';
import { EXECUTION_FEEDBACK, tempoFor } from '../../data/scientific-evidence/tempo';
import { adaptRemaining, prescribe, PRESCRIPTION_ENGINE, toSetPrescription, type Prescription } from '../../domain/prescription';
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

  // Debounced autosave (encrypted write).
  const update = useCallback((fn: (w: Workout) => Workout) => {
    setW((prev) => {
      // Edits to a FINISHED workout are corrections: keep original → corrected values (audit trail).
      const next = withCorrections(initialRef.current, fn(prev), new Date().toISOString(), (id) => registryRef.current.get(id)?.name.en ?? id);
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
  const live = !isFinished(w);
  const sessionEff = useMemo(() => sessionMuscleEffective(w, a.registry, data.settings.quality), [w, a.registry, data.settings.quality]);

  const addExercise = (def: ExerciseDef) => {
    setPicker(false);
    const eq = data.equipment.find((e) => e.exerciseIds.includes(def.id) && e.locationId === w.locationId) ?? null;
    const prev = lastSessionFor(data.workouts, def.id, eq?.id ?? null, w.id);
    // Same configuration as last time (angle, attachment, one side at a time…), else the exercise's default.
    const variation = prev?.variation ? { ...prev.variation } : def.defaultVariation ? { ...def.defaultVariation } : undefined;
    const draft: WorkoutExercise = {
      id: uid('we'), order: w.exercises.length, exerciseId: def.id, exerciseConfidence: 'confirmed',
      equipmentId: eq?.id ?? null, equipmentConfidence: eq ? 'confirmed' : 'unknown',
      settings: eq && Object.keys(eq.settings).length ? { ...eq.settings } : undefined,
      variation, sets: [], startedAt: new Date().toISOString(),
    };
    const series = a.progression.find((p) => p.key === progressionKey(draft, w, def));
    // Prefill from what was actually done last time (suggested load if an increase is due); never invent reps.
    // The pre-filled set is only a plan: it counts once you tick it.
    const lastWorking = prev?.sets.find((s) => s.type === 'working' && !s.planned);
    const firstWeight = series?.next.weight ?? lastWorking?.weightKg ?? null;
    const firstReps = series?.next.action === 'increase' ? series.next.repTarget[0] : lastWorking?.reps ?? null;
    const perSideLast = prev ? prev.sets.some((s) => s.side) : !!def.defaultVariation?.unilateral;
    // Live session with a prescription: one planned set per prescribed working set, each carrying what was
    // prescribed (stored separately from what will be performed). Otherwise one planned set as before.
    const plan = live ? safePrescribe(data, a, { ...w, exercises: [...w.exercises, draft] }, w.exercises.length) : null;
    let sets: WorkoutSet[];
    if (plan && plan.setCount > 0 && !perSideLast) {
      sets = plan.sets.map((ps) => ({ ...newSet('working', ps.weightKg ?? firstWeight, ps.repsMin, plan.loadMode ?? defaultLoadMode(def), true), prescribed: toSetPrescription(ps, 'working') }));
    } else {
      const first = newSet('working', firstWeight, firstReps, defaultLoadMode(def), live);
      // Left/right logging continues if it was used last time (or is the exercise's default, e.g. standing leg curl).
      if (perSideLast) first.side = 'left';
      sets = [first];
    }
    const ex: WorkoutExercise = { ...draft, sets };
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
    // When the sets came from a prescription, the plan already has the right number of sets (add more with "+ Set").
    const planCovered = ex.sets.some((s) => s.prescribed?.kind === 'working') && target.side !== 'left';
    if (live && idx === ex.sets.length - 1 && target.type !== 'warmup' && !planCovered) {
      // Per-side logging alternates: after the left side comes the right side (same load), and vice versa.
      const side = target.side ? (target.side === 'left' ? 'right' : 'left') : undefined;
      const same = (s: WorkoutSet) => s.type === 'working' && (s.side ?? null) === (side ?? null);
      const n = ex.sets.filter(same).length;
      const prevReps = prevSession?.sets.filter((s) => same(s) && !s.planned)[n]?.reps;
      next = newSet('working', target.weightKg, prevReps ?? target.reps, target.loadMode, true);
      if (side) next.side = side;
    }
    setFocusSet({ done: setId, tick: nowMs });
    update((x) => ({ ...x, exercises: x.exercises.map((e) => {
      if (e.id !== exId) return e;
      let sets = e.sets.map((s) => {
        if (s.id !== setId) return s;
        const done: WorkoutSet = { ...s, planned: undefined, completedAt: new Date(nowMs).toISOString() };
        // Rest measured by the timer: time since the previous completed set minus an estimate of set duration (≈3 s/rep).
        // The second side of a left/right pair follows the first directly — that gap is not rest between sets.
        const i = e.sets.findIndex((o) => o.id === s.id);
        const before = e.sets[i - 1];
        const secondSide = !!(s.side && before?.side && before.side !== s.side && before.type === s.type);
        if (lastDone && !secondSide && s.restSecBefore == null && e.sets.some((o) => o.completedAt)) {
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
    const final = { ...x, finishedAt: x.finishedAt ?? new Date().toISOString(), exercises: x.exercises.map(dropEmptySettings), endTime: x.endTime ?? (x.date === now.date ? now.time : null), durationMin };
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

type SidesMode = 'both' | 'one_lr' | 'one';

/** Setting names offered by the template but left blank are not stored. */
function dropEmptySettings(e: WorkoutExercise): WorkoutExercise {
  if (!e.settings) return e;
  const kept = Object.fromEntries(Object.entries(e.settings).filter(([, v]) => v.trim() !== ''));
  return { ...e, settings: Object.keys(kept).length ? kept : undefined };
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
        <div className="grid grid-cols-1 gap-3 border-t border-ink-100 px-4 py-4 dark:border-ink-800 sm:grid-cols-4 sm:px-5">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
  const [pickEq, setPickEq] = useState(false);
  const [editEq, setEditEq] = useState<Equipment | null>(null);
  const needsMachine = def ? MACHINE_KINDS.includes(def.equipmentKind) : false;
  const gym = data.locations.find((l) => l.id === w.locationId) ?? null;
  const inc = loadStep(eq, gym, def?.equipmentKind, ex.sets[0]?.loadMode).step;

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
      if (od && primary.some((m) => ((od.contributions as Record<string, number>)[m] ?? 0) >= 0.5)) n += countedSetCount(o.sets);
    }
    return n;
  }, [def, w.exercises, index, a.registry]);
  const target = series?.next ?? null;
  const wu = warmupFor(def, target?.weight ?? ex.sets.find((s) => s.type === 'working')?.weightKg ?? null, inc, priorSameMuscle);
  const plan = useMemo(() => (live ? safePrescribe(data, a, w, index) : null), [live, data, a, w, index]);
  const resolved = def ? resolveCoefficients(def, ex.variation) : null;
  // A machine created or edited from here brings its remembered settings once (the session's own values win).
  // Only right after the owner created/picked a machine here, and only in a live session — opening an
  // older workout must never write settings into it.
  const pendingEqSettings = useRef(false);
  useEffect(() => {
    if (!pendingEqSettings.current || !live || !eq) return;
    pendingEqSettings.current = false;
    if (Object.keys(eq.settings).length && !Object.values(ex.settings ?? {}).some((v) => v.trim())) setEx((x) => ({ ...x, settings: { ...eq.settings, ...(x.settings ?? {}) } }));
  }, [eq?.id, eq?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // Choosing a machine loads its remembered settings (the session's own values win).
  const chooseEq = (chosen: Equipment | null) => setEx((x) => ({ ...x, equipmentId: chosen?.id ?? null, equipmentConfidence: chosen ? 'confirmed' : 'unknown', settings: chosen ? { ...chosen.settings, ...(x.settings ?? {}) } : x.settings }));

  // Left/right logging is a property of the sets themselves (any set with a side), separate from
  // `variation.unilateral`, which keeps its v1.0 meaning: one limb at a time, one set = both sides done.
  const perSide = ex.sets.some((s) => s.side);
  const pairs = sideFactors(ex.sets);
  const addSet = (type: SetType = 'working') => {
    const last = [...ex.sets].reverse().find((s) => s.type === type) ?? ex.sets[ex.sets.length - 1];
    const s = newSet(type, last?.weightKg ?? null, last?.reps ?? null, last?.loadMode, live);
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
      const tagLogged = logged > 0 && confirmAction(`Tag the ${logged} set${logged === 1 ? '' : 's'} already logged as left/right (L, R, L…)? Each L+R pair then counts as one set.`);
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
      if (!confirmAction(`Merge the left/right sets into ${n} set${n === 1 ? '' : 's'}? Each pair keeps the left side's weight, reps and RIR.`)) return;
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
  const unit = loadUnitLabel(def, ex.sets.find((s) => s.type !== 'warmup')?.loadMode ?? ex.sets[0]?.loadMode);
  const barKind = def && (def.equipmentKind === 'barbell' || def.equipmentKind === 'smith');
  const addWarmups = () => {
    if (plan && plan.warmups.length) {
      setEx((e) => ({ ...e, sets: [...plan.warmups.map((s) => ({ ...newSet('warmup', s.weightKg, s.reps, e.sets[0]?.loadMode, live), prescribed: toSetPrescription(s, 'warmup') })), ...e.sets] }));
      return;
    }
    if (!wu.sets.length) return;
    setEx((e) => ({ ...e, sets: [...wu.sets.map((s) => newSet('warmup', s.weight, s.reps, e.sets[0]?.loadMode, live)), ...e.sets] }));
  };
  // Set-by-set: after a set is done, re-check the remaining planned sets against what actually happened.
  const doneWorking = ex.sets.filter((s) => s.type === 'working' && !s.planned);
  const plannedWorking = ex.sets.filter((s) => s.type === 'working' && s.planned);
  // Sets added beyond the prescription continue the last prescribed set, so they are re-checked too.
  const totalWorking = doneWorking.length + plannedWorking.length;
  const planFull = plan && plan.sets.length > 0 && totalWorking > plan.sets.length
    ? { ...plan, sets: [...plan.sets, ...Array.from({ length: totalWorking - plan.sets.length }, () => plan.sets[plan.sets.length - 1])] }
    : plan;
  const adapt = planFull && planFull.sets.length > 0 && doneWorking.length > 0 && plannedWorking.length > 0 ? adaptRemaining(planFull, doneWorking, inc) : null;
  const applyAdapt = () => {
    if (!adapt) return;
    let k = 0;
    setEx((e) => ({ ...e, sets: e.sets.map((x) => {
      if (x.type !== 'working' || !x.planned) return x;
      const ps = adapt.sets[k] ?? adapt.sets[adapt.sets.length - 1];
      k++;
      return ps ? { ...x, weightKg: ps.weightKg ?? x.weightKg, reps: ps.repsMin, prescribed: { ...toSetPrescription(ps, 'working'), engine: `${PRESCRIPTION_ENGINE}+adapt` } } : x;
    }) }));
    toast('Remaining sets updated');
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

      <ExecutionCue exerciseId={ex.exerciseId} />
      <div className="mt-3 grid grid-cols-1 gap-2 px-4 sm:grid-cols-[1fr_auto] sm:px-5">
        <button type="button" onClick={() => setPickEq(true)}
          className={cx('flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-xl border bg-white px-3 text-left text-sm dark:bg-ink-900', needsMachine && !ex.equipmentId ? 'border-amber-500/60' : 'border-ink-200 dark:border-ink-700')}>
          <span className="min-w-0 truncate">
            {eq ? <><span className="font-medium text-ink-900 dark:text-white">{eq.name}</span>{eq.manufacturer ? <span className="text-ink-500"> · {eq.manufacturer}</span> : null}{eq.locationId && eq.locationId !== w.locationId ? <span className="text-amber-600"> · other gym</span> : null}</>
              : <span className="text-ink-500">{needsMachine ? 'Which machine? (not identified)' : 'Free weights / no specific equipment'}</span>}
          </span>
          <IconChevronDown size={16} className="shrink-0 text-ink-400" />
        </button>
        <Button size="md" variant="ghost" onClick={() => setShowVar(!showVar)}>Setup {showVar ? '▴' : '▾'}</Button>
      </div>
      {needsMachine && !ex.equipmentId && <p className="px-4 pt-1.5 text-[11px] text-amber-700 dark:text-amber-300 sm:px-5">Different machines are tracked separately, and their loads are never compared. Pick or add this machine to keep its history clean.</p>}
      {!showVar && (setupSummary.length > 0 || (def?.variationFields?.length ?? 0) > 0 || (def?.settingTemplate?.length ?? 0) > 0) && (
        <button type="button" onClick={() => setShowVar(true)} className="mx-4 mt-1.5 flex min-h-[40px] max-w-full items-center gap-1.5 text-left text-xs text-ink-500 sm:mx-5">
          {setupSummary.length ? <span className="truncate"><span className="font-medium text-ink-700 dark:text-ink-200">Setup:</span> {setupSummary.join(' · ')}</span>
            : <span className="underline decoration-dotted underline-offset-2">Set {[def?.variationFields?.includes('angle') ? 'bench angle' : null, def?.variationFields?.includes('unilateral') ? 'one side / both' : null, def?.settingTemplate?.length ? def.settingTemplate.slice(0, 2).join(', ') : null].filter(Boolean).join(', ') || 'variation'}</span>}
        </button>
      )}

      {showVar && (
        <div className="mx-4 mt-3 grid grid-cols-1 gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950 sm:mx-5 sm:grid-cols-4">
          {def && <VariationChips def={def} v={ex.variation} onChange={setVar} notes={resolved?.notes ?? []} sides={sidesMode} onSides={setSides} showSides={!!def.variationFields?.includes('unilateral') || perSide} />}
          <MoreOptions rom={ex.variation?.rom ?? null} onRom={(rom) => setVar({ rom })} />
          <SettingsEditor settings={ex.settings ?? {}} template={def?.settingTemplate ?? []} onChange={(s) => setEx((x) => ({ ...x, settings: s }))}
            onSaveDefault={eq ? () => { void store.saveEquipment({ ...eq, settings: Object.fromEntries(Object.entries(ex.settings ?? {}).filter(([, v]) => v.trim())), updatedAt: new Date().toISOString() }); toast('Saved as this machine\'s default settings'); } : undefined} />
        </div>
      )}

      {plan ? (
        <TodayPlan plan={plan} unit={unit} hasWarmups={ex.sets.some((s) => s.type === 'warmup')} onAddWarmups={addWarmups} adapt={adapt} onApplyAdapt={applyAdapt}
          last={prev ? prev.sets.filter((s) => s.type === 'working' && !s.planned).map((s) => `${s.side ? (s.side === 'left' ? 'L ' : 'R ') : ''}${s.weightKg ?? 'BW'}×${s.reps ?? '?'}${s.rir != null ? `@${s.rir}` : ''}`).join(', ') : null} />
      ) : (
        <>
          <div className="mx-4 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500 sm:mx-5">
            {prev ? <span>Last time: <b className="font-medium text-ink-700 dark:text-ink-200">{prev.sets.filter((s) => s.type === 'working' && !s.planned).map((s) => `${s.side ? (s.side === 'left' ? 'L ' : 'R ') : ''}${s.weightKg ?? 'BW'}×${s.reps ?? '?'}${s.rir != null ? `@${s.rir}` : ''}`).join(', ')}</b></span> : <span>No history on this {ex.equipmentId ? 'machine' : 'exercise'} yet — calibration session.</span>}
            {target && target.weight != null && <Badge tone={target.action === 'increase' ? 'good' : target.action === 'reduce' ? 'warn' : 'neutral'}>{target.action === 'increase' ? '↑' : target.action === 'reduce' ? '↓' : '='} {fmt(target.weight, 2)} kg · {target.repTarget[0]}–{target.repTarget[1]}</Badge>}
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
        </>
      )}

      <div className="mt-3 border-t border-ink-100 dark:border-ink-800">
        <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] min-[360px]:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] gap-2 px-4 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:px-5">
          <span>Set</span><span className="text-center normal-case tracking-normal">{unit}</span><span className="text-center">Reps</span>
        </div>
        {barKind && (
          <p className="px-4 pb-1 text-[11px] text-ink-500 sm:px-5">
            {eq?.barWeightKg != null ? `Bar ${fmt(eq.barWeightKg, 2)} kg — plates = total − ${fmt(eq.barWeightKg, 2)} kg.` : 'Enter the total you lifted. Bar weight unknown — never assumed (set it on the bar\'s equipment entry if you know it).'}
          </p>
        )}
        {perSide && <p className="px-4 pb-1 text-[11px] text-ink-500 sm:px-5">One side at a time: log a left and a right set — each pair counts as <b className="font-semibold">one</b> set.</p>}
        {index === 0 && <p className="px-4 pb-1 text-[11px] leading-snug text-ink-500 sm:px-5">Numbers below the reps are <b className="font-semibold">RIR</b> — reps you still had left. Tap one, then ✓ to count the set.</p>}
        {ex.sets.map((s, i) => (
          <SetRow key={s.id} s={s} live={live} pair={pairs.get(s.id) ?? 1} n={ex.sets.slice(0, i + 1).filter((x) => x.type === s.type && (x.side ?? null) === (s.side ?? null)).length} inc={inc} sideToggle={perSide} onChange={(p) => setSet(s.id, p)}
            onRemove={() => setEx((e) => ({ ...e, sets: e.sets.filter((x) => x.id !== s.id) }))} onComplete={() => onComplete(ex.id, s.id)} />
        ))}
        <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
          <Button size="sm" onClick={() => addSet('working')}><IconPlus size={14} />Set</Button>
          <Button size="sm" variant="ghost" onClick={() => addSet('warmup')}>+ Warm-up</Button>
          <Button size="sm" variant="ghost" onClick={() => addSet('drop')}>+ Drop</Button>
        </div>
      </div>
      <EquipmentPicker open={pickEq} onClose={() => setPickEq(false)} locationId={w.locationId} def={def} currentId={ex.equipmentId}
        onPick={(chosen) => { setPickEq(false); chooseEq(chosen); }}
        onNew={() => { setPickEq(false); setNewEq(true); }}
        onEdit={(q) => { setPickEq(false); setEditEq(q); }} />
      {newEq && <EquipmentForm eq={null} defaultLocation={w.locationId} defaultExerciseId={def?.id} defaultKind={def?.equipmentKind}
        defaultName={def ? names.ex(def) : ''} onClose={() => setNewEq(false)}
        onSaved={(id) => { setNewEq(false); pendingEqSettings.current = true; setEx((x) => ({ ...x, equipmentId: id, equipmentConfidence: 'confirmed' })); }} />}
      {editEq && <EquipmentForm eq={editEq} defaultLocation={w.locationId} onClose={() => setEditEq(null)} onSaved={() => setEditEq(null)} />}
    </Card>
  );
}

const ANGLE_CHIPS = [0, 15, 30, 45];
const CHOICES: Partial<Record<VariationField, { key: keyof Variation; label: string; options: [string, string][] }>> = {
  attachment: { key: 'attachment', label: 'Attachment', options: [['straight_bar', 'Straight bar'], ['rope', 'Rope'], ['v_bar', 'V-bar'], ['single_handle', 'Handle'], ['cuff', 'Cuff']] },
  position: { key: 'position', label: 'Position', options: [['standing', 'Standing'], ['seated', 'Seated']] },
  execution: { key: 'execution', label: 'Execution', options: [['simultaneous', 'Both arms together'], ['alternating', 'Alternating']] },
  legs: { key: 'legs', label: 'Legs', options: [['straight', 'Straight'], ['bent', 'Bent knees']] },
  depth: { key: 'depth', label: 'Depth', options: [['above_parallel', 'Above parallel'], ['parallel', 'Parallel'], ['below_parallel', 'Below parallel']] },
  barPosition: { key: 'barPosition', label: 'Bar position', options: [['high_bar', 'High bar'], ['low_bar', 'Low bar']] },
  stance: { key: 'stance', label: 'Stance', options: [['narrow', 'Narrow'], ['shoulder', 'Shoulder'], ['wide', 'Wide']] },
  grip: { key: 'grip', label: 'Grip', options: [['pronated', 'Overhand'], ['supinated', 'Underhand'], ['neutral', 'Neutral'], ['mixed', 'Mixed']] },
  gripWidth: { key: 'gripWidth', label: 'Grip width', options: [['narrow', 'Narrow'], ['shoulder', 'Shoulder'], ['wide', 'Wide']] },
};
/** Fields kept for the owner's records that do not change muscle credit (said so in the Setup panel). */
const RECORD_ONLY: Partial<Record<VariationField, string>> = {
  depth: "Recorded for your history; doesn't change muscle credit.",
  barPosition: "Recorded for your history; doesn't change muscle credit.",
  stance: "Recorded for your history; doesn't change muscle credit.",
  execution: "Recorded for your history; doesn't change muscle credit.",
  gripWidth: "Recorded for your history; doesn't change muscle credit.",
};
const RANGE_OPTIONS: [NonNullable<Variation['rom']>, string][] = [['full', 'Full'], ['lengthened_partial', 'Lengthened partials'], ['partial', 'Partial']];

/** Range of motion is rarely changed, so it sits behind "More options" (shown open when a value is set). */
function MoreOptions({ rom, onRom }: { rom: Variation['rom'] | null; onRom: (r: Variation['rom'] | null) => void }) {
  const [open, setOpen] = useState(!!rom);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="min-h-[40px] text-left text-xs text-ink-500 underline decoration-dotted underline-offset-2 sm:col-span-4">More options (range of motion)</button>;
  return (
    <div className="sm:col-span-4">
      <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">Range of motion</div>
      <div className="flex flex-wrap gap-1.5">
        {RANGE_OPTIONS.map(([v, label]) => <Chip key={v} on={rom === v} onClick={() => onRom(rom === v ? null : v)}>{label}</Chip>)}
      </div>
      <p className="mt-1 text-[11px] text-ink-400">Not set = full range. Partial reps count a little less; lengthened partials count fully (Settings → Set-quality model).</p>
    </div>
  );
}

function humanizeDepth(d: string): string {
  return CHOICES.depth?.options.find(([v]) => v === d)?.[1].toLowerCase() ?? humanize(d);
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx('h-10 rounded-full px-3.5 text-[13px] font-medium transition active:scale-95', on ? 'bg-accent-500 text-ink-950' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{children}</button>
  );
}

/** Touch chips for the variation fields this exercise uses (bench angle, attachment, one side at a time…). */
function VariationChips({ def, v, onChange, notes, sides, onSides, showSides }: { def: ExerciseDef; v?: Variation; onChange: (p: Partial<Variation>) => void; notes: string[]; sides: SidesMode; onSides: (m: SidesMode) => void; showSides: boolean }) {
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
          <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">Bench angle</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((d) => <Chip key={d} on={angle === d} onClick={() => onChange({ benchAngleDeg: angle === d ? null : d })}>{d === 0 ? 'Flat' : `${d}°`}</Chip>)}
            <div className="w-24"><NumInput value={angle != null && !ANGLE_CHIPS.includes(angle) ? angle : null} onChange={(x) => onChange({ benchAngleDeg: x })} placeholder="other °" /></div>
          </div>
          {notes.length > 0 && <p className="mt-1 text-[11px] text-ink-500">{notes.join(' ')}</p>}
          <p className="mt-0.5 text-[11px] text-ink-400">Each angle keeps its own strength history. Muscle credit uses coarse groups only (flat / incline / steep); evidence doesn't support finer steps.</p>
        </div>
      )}
      {showSides && (
        <div>
          <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">Sides</div>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={sides === 'both'} onClick={() => onSides('both')}>Both together</Chip>
            <Chip on={sides === 'one_lr'} onClick={() => onSides('one_lr')}>One side, log L and R</Chip>
            <Chip on={sides === 'one'} onClick={() => onSides('one')}>One side, one row per round</Chip>
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
            {f === 'grip' && def.pattern === 'vertical_pull' && <p className="mt-1 text-[11px] text-ink-400">An underhand grip gives the biceps more credit on pulldowns and pull-ups.</p>}
          </div>
        );
      })}
    </div>
  );
}

function SettingsEditor({ settings, template, onChange, onSaveDefault }: { settings: Record<string, string>; template: string[]; onChange: (s: Record<string, string>) => void; onSaveDefault?: () => void }) {
  const [k, setK] = useState('');
  // Template names (seat, arm pad…) are always offered; blank ones are not stored.
  const keys = [...template, ...Object.keys(settings).filter((x) => !template.includes(x))];
  const filled = Object.values(settings).some((x) => x.trim());
  return (
    <div className="sm:col-span-4">
      <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">{template.length ? 'Machine settings' : 'Other settings (optional)'}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {keys.map((key) => (
          <label key={key} className="min-w-0">
            <span className="flex items-center justify-between text-[11px] text-ink-500">
              <span className="truncate">{key}</span>
              {!template.includes(key) && <button type="button" className="h-6 px-1.5 text-ink-400 active:text-rose-500" onClick={() => { const n = { ...settings }; delete n[key]; onChange(n); }} aria-label={`Remove ${key}`}>×</button>}
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
          <input className="h-10 w-36 rounded-lg border border-dashed border-ink-300 bg-transparent px-2 text-sm outline-none dark:border-ink-700" placeholder="+ other setting" enterKeyHint="done" value={k} onChange={(e) => setK(e.target.value)} />
        </form>
        {onSaveDefault && filled && <Button size="sm" variant="ghost" onClick={onSaveDefault}>Remember for this machine</Button>}
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
function SetRow({ s, n, inc, pair, live, sideToggle, onChange, onRemove, onComplete }: { s: WorkoutSet; n: number; inc: number; pair: number; live: boolean; sideToggle: boolean; onChange: (p: Partial<WorkoutSet>) => void; onRemove: () => void; onComplete: () => void }) {
  const data = useData();
  const [info, setInfo] = useState(false);
  const q = assessSet(s, data.settings.quality);
  const done = !!s.completedAt;
  const warm = s.type === 'warmup';
  const sideTag = s.side === 'left' ? 'L' : s.side === 'right' ? 'R' : '';
  const tag = warm ? 'W' : s.type === 'drop' ? `D${sideTag}` : `${n}${sideTag}`;
  const planned = !!s.planned;
  // Choosing an RIR means the set was performed, so it starts counting (✓ additionally starts the rest timer).
  // RIR and the failure answer are separate fields: picking an RIR never changes the failure answer.
  const setRir = (v: number | null) => onChange({ rir: v, rirSource: v == null ? 'unknown' : 'reported', ...(v != null ? { planned: undefined } : {}) });
  return (
    <div id={`set-${s.id}`} className={cx('scroll-mt-32 border-l-[3px] border-t border-t-ink-100 px-4 py-3 first:border-t-0 dark:border-t-ink-800/60 sm:px-5',
      done ? 'border-l-emerald-500 bg-emerald-500/[0.05]' : planned ? 'border-l-ink-300 dark:border-l-ink-600' : 'border-l-transparent', warm && 'bg-ink-50/60 dark:bg-ink-950/30')}>
      <div className="grid grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)] min-[360px]:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
        <button type="button" aria-label="Change set type (working / warm-up / drop)" onClick={() => onChange({ type: s.type === 'working' ? 'warmup' : s.type === 'warmup' ? 'drop' : 'working' })}
          className={cx('h-11 w-9 rounded-xl text-sm font-bold active:scale-95 min-[360px]:w-11', warm ? 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300' : s.type === 'drop' ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300' : 'bg-accent-500/15 text-accent-600 dark:text-accent-400')}>{tag}</button>
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
              <button key={o.label} type="button" onClick={() => setRir(s.rir === o.v ? null : o.v)} aria-pressed={s.rir === o.v}
                className={cx('h-11 min-w-0 flex-1 rounded-lg text-sm font-semibold tabular-nums transition active:scale-95 sm:flex-none sm:px-3',
                  s.rir === o.v ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{o.label}</button>
            ))}
          </div>
        )}
        <button type="button" onClick={onComplete} aria-label={done ? 'Set completed' : 'Complete set'}
          className={cx('flex h-11 w-14 shrink-0 items-center justify-center rounded-xl transition active:scale-95', done ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300')}>
          <IconCheck size={22} />
        </button>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-500">
        <div className="flex min-w-0 items-center gap-2">
          {sideToggle && !warm && (
            <button type="button" aria-label="Side (left / right / both)" onClick={() => onChange({ side: s.side === 'left' ? 'right' : s.side === 'right' ? undefined : 'left' })}
              className="flex h-9 min-w-[44px] shrink-0 items-center justify-center rounded-lg bg-ink-100 px-2 text-xs font-semibold text-ink-700 active:scale-95 dark:bg-ink-800 dark:text-ink-200">{s.side === 'right' ? 'Right' : s.side === 'left' ? 'Left' : 'Both'}</button>
          )}
          {!warm && (
            <button type="button" onClick={() => setInfo(!info)} aria-expanded={info} className="min-h-[44px] truncate text-left underline decoration-dotted underline-offset-2">
              {planned ? (s.prescribed && s.prescribed.kind === 'working' ? `Plan ${s.prescribed.repsMin === s.prescribed.repsMax ? s.prescribed.repsMin : `${s.prescribed.repsMin}–${s.prescribed.repsMax}`} reps · RIR ${s.prescribed.rirMin}–${s.prescribed.rirMax} — tap ✓` : 'Not counted — tap ✓') : `counts ${Math.round(q.credit * pair * 100) / 100}${pair < 1 ? ' (L+R pair)' : ''}${s.rir == null && !s.toFailure ? ' · RIR not set' : ''}`}
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
      {!warm && !planned && (done || !live || s.rir != null || !!s.toFailure) && <FailureQuestion s={s} onChange={onChange} />}
      {!warm && !planned && (done || !live || s.rir != null || !!s.toFailure) && <SetFeedback s={s} onChange={onChange} startOpen={live} />}
      {info && !warm && (
        <div className="mt-1 rounded-lg bg-ink-50 p-2.5 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">
          {s.side && <div className="mb-1">This is the {s.side} side. A left set and a right set together count as one set.</div>}
          {planned && <div className="mb-1 font-medium">Pre-filled from last time. It is not counted until you tick ✓ (or pick an RIR). Unticked sets are left out when you finish.</div>}
          {q.reasons.map((r, i) => <div key={i}>• {r}</div>)}
          <div className="mt-1 text-ink-400">RIR = reps in reserve: how many more clean reps you could have done. 0–3 counts fully.</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Execution cue (tempo model)

/**
 * One short line: lowering · lifting · pause. Details on tap. Guidance only — tempo never changes
 * how a set is counted (see src/data/scientific-evidence/tempo.ts and rule `tempo_no_credit`).
 */
function ExecutionCue({ exerciseId }: { exerciseId: string }) {
  const [open, setOpen] = useState(false);
  const t = tempoFor(exerciseId);
  if (!t) return null;
  const ecc = t.eccentricSec ? `↓ ${t.eccentricSec[0] === t.eccentricSec[1] ? t.eccentricSec[0] : `${t.eccentricSec[0]}–${t.eccentricSec[1]}`} s` : '↓ controlled';
  const con = t.maxIntent === 'no' ? '↑ smooth' : t.maxIntent === 'yes_controlled' ? '↑ strong, stable' : '↑ fast intent';
  const pause = t.pause === 'none' ? null : t.pauseWhere ? `pause: ${t.pauseWhere.split(/[,(]/)[0].trim()}` : 'brief pause';
  return (
    <div className="px-4 sm:px-5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1.5 flex min-h-[36px] max-w-full items-center gap-1.5 text-left text-xs text-ink-600 dark:text-ink-300">
        <span className="shrink-0 rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 dark:bg-ink-800">Form</span>
        <span className="truncate tabular-nums">{[ecc, con, pause].filter(Boolean).join(' · ')}</span>
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded-lg bg-ink-50 p-2.5 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">
          <ul className="list-disc space-y-0.5 pl-4">{t.cues.map((c) => <li key={c}>{c}</li>)}</ul>
          <p><b className="font-medium">Lowering:</b> {t.eccentric}. <b className="font-medium">Lifting:</b> {t.concentric}.{t.pauseWhere ? <> <b className="font-medium">Pause:</b> {t.pauseWhere}.</> : null}</p>
          <p><b className="font-medium">Range:</b> {t.rom}</p>
          {t.avoid.length > 0 && <p><b className="font-medium">Avoid:</b> {t.avoid.join(' · ')}</p>}
          <p className="text-ink-500">{t.why} Fast intent means trying to move the weight quickly while staying in control — no bouncing, swinging or cutting the range. Reps slow down near failure; that is normal. Confidence: {t.confidence.replace('_', ' ')}.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Today's workout (prescription)

/** The prescription never throws into the UI: on any error the card falls back to the classic hints. */
function safePrescribe(data: ReturnType<typeof useData>, a: ReturnType<typeof useAnalysis>, workout: Workout, exerciseIndex: number): Prescription | null {
  try {
    return prescribe({ data, analysis: a, now: new Date(), workout, exerciseIndex });
  } catch (e) {
    if (import.meta.env.DEV) console.warn('prescribe failed', e);
    return null;
  }
}

const restText = (r: [number, number]) => { const f = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; return r[0] === r[1] ? f(r[0]) : `${f(r[0])}–${f(r[1])}`; };
const repText = (lo: number, hi: number) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

/**
 * "Today" for one exercise: warm-ups, then working sets (weight × reps, target RIR), rest, and the
 * load call — one short line each. Reasons sit behind "Why". Research details stay on the Science page.
 */
function TodayPlan({ plan, unit, hasWarmups, onAddWarmups, adapt, onApplyAdapt, last }: {
  plan: Prescription; unit: string; hasWarmups: boolean; onAddWarmups: () => void;
  adapt: ReturnType<typeof adaptRemaining> | null; onApplyAdapt: () => void; last: string | null;
}) {
  const kg = (x: number | null) => (x == null ? '—' : fmt(x, 2));
  const same = plan.sets.every((x) => x.weightKg === plan.sets[0]?.weightKg);
  const decision = ({ increase: ['↑ Increase', 'good'], keep: ['= Keep', 'neutral'], reduce: ['↓ Reduce', 'warn'], calibrate: ['Calibrating', 'info'] } as const)[plan.decision];
  return (
    <div className="mx-4 mt-3 rounded-xl border border-accent-500/25 bg-accent-500/[0.04] p-3 sm:mx-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent-700 dark:text-accent-300">Today</span>
        <span className="flex flex-wrap gap-1">
          <Badge tone={decision[1]}>{decision[0]}</Badge>
          <Badge tone={plan.confidence === 'high' ? 'good' : plan.confidence === 'moderate' ? 'neutral' : 'warn'}>{plan.confidence} confidence</Badge>
        </span>
      </div>
      {plan.setCount === 0 ? (
        <p className="mt-1.5 text-sm text-ink-700 dark:text-ink-200">No sets needed today. <span className="text-ink-500">{plan.setCountReason}</span></p>
      ) : (
        <div className="mt-1.5 space-y-1 text-sm tabular-nums text-ink-800 dark:text-ink-100">
          {plan.warmups.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-xs text-ink-500">Warm-up</span>
              <span>{plan.warmups.map((x) => `${kg(x.weightKg)}×${x.reps}`).join(' → ')}</span>
              {!hasWarmups && <button type="button" onClick={onAddWarmups} className="min-h-[36px] rounded-lg px-2 text-xs font-semibold text-accent-600 dark:text-accent-400">Add</button>}
            </div>
          )}
          <div>
            <span className="font-semibold">{plan.setCount} set{plan.setCount === 1 ? '' : 's'}</span>
            {same && plan.sets[0] ? <> · {kg(plan.sets[0].weightKg)} <span className="text-xs text-ink-500">{unit}</span></> : null}
            {' · '}{same ? plan.sets.map((x) => repText(x.repsMin, x.repsMax)).join(', ') : plan.sets.map((x) => `${kg(x.weightKg)}×${repText(x.repsMin, x.repsMax)}`).join(', ')} reps
          </div>
          <div className="text-xs text-ink-600 dark:text-ink-300">RIR {plan.rirTarget[0]}–{plan.rirTarget[1]} · rest {restText(plan.rest.range)}</div>
        </div>
      )}
      {adapt && adapt.change !== 'none' && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/70 p-2 text-xs dark:bg-ink-900/70">
          <span className="min-w-0 flex-1 text-ink-700 dark:text-ink-200">{adapt.change === 'defer' ? 'Keep the plan — ' : 'Next sets: '}{adapt.why}</span>
          {adapt.change !== 'defer' && <Button size="sm" variant="primary" onClick={onApplyAdapt}>Apply</Button>}
        </div>
      )}
      <div className="mt-1">
        <Why label="Why">
          <p>{plan.decisionWhy}</p>
          {plan.setCount > 0 && <p>{plan.setCountReason}</p>}
          <p>{plan.rirReason}</p>
          <p>{plan.rest.reason}</p>
          {plan.warmups.length > 0 && <p>Warm-up: {plan.warmupReason}</p>}
          <p>{plan.confidenceReason}</p>
          {plan.notes.filter((n) => ![plan.decisionWhy, plan.confidenceReason, plan.rest.reason, plan.rirReason, plan.setCountReason, plan.warmupReason].some((t) => t.toLowerCase().includes(n.slice(0, 28).toLowerCase()))).map((n, i) => <p key={i}>{n}</p>)}
          {last && <p>Last time: {last}</p>}
        </Why>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Failure question

const FAILURE_OPTIONS: { id: FailureStatus; label: string; hint: string }[] = [
  { id: 'muscular', label: 'Failure', hint: 'Could not do another full rep with good form.' },
  { id: 'none', label: 'Stopped before', hint: 'Stopped by choice — at least one more rep was possible.' },
  { id: 'uncertain', label: 'Not sure', hint: 'Unsure whether it was real muscular failure.' },
];

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
      <div className="flex items-center gap-1.5" role="group" aria-label="Did you reach muscular failure?">
        <span className="w-14 shrink-0 text-[10px] font-semibold uppercase leading-tight tracking-wider text-ink-400">Failure?</span>
        {FAILURE_OPTIONS.map((o) => (
          <button key={o.id} type="button" aria-pressed={cur === o.id} title={o.hint} onClick={() => pick(o.id)}
            className={cx('h-10 min-w-0 flex-1 rounded-lg px-1 text-[12px] font-medium leading-tight transition active:scale-95',
              cur === o.id ? (o.id === 'muscular' ? 'bg-rose-500 text-white' : o.id === 'none' ? 'bg-accent-500 text-ink-950' : 'bg-ink-500 text-white') : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{o.label}</button>
        ))}
      </div>
      {cur === 'muscular' && (
        <div className="mt-1 flex items-center gap-1.5 pl-[3.875rem]">
          <button type="button" aria-pressed={s.technicalFailure === true} onClick={() => onChange({ technicalFailure: s.technicalFailure === true ? undefined : true })}
            className={cx('h-9 rounded-lg px-3 text-[12px] font-medium active:scale-95', s.technicalFailure ? 'bg-amber-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>Form broke first</button>
          <span className="text-[11px] text-ink-400">optional</span>
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
function SetFeedback({ s, onChange, startOpen }: { s: WorkoutSet; onChange: (p: Partial<WorkoutSet>) => void; startOpen: boolean }) {
  // Live: the question opens right after the set. Editing a past workout: one small button per set.
  const [open, setOpen] = useState(!s.feel && startOpen);
  const [details, setDetails] = useState(false); // hooks before any early return
  if (!open && !s.feel) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 min-h-[40px] text-[12px] font-medium text-accent-600 dark:text-accent-400">+ How did it feel?</button>
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
        <button type="button" onClick={() => setOpen(true)} className={cx('flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 font-medium', FEEL_TONE[sel.id])}>
          {sel.title}{s.pain?.area ? ` · ${s.pain.area}` : ''}{s.intendedWeightKg != null ? ` · meant ${fmt(s.intendedWeightKg, 2)} kg` : ''} <span className="text-[10px] opacity-70">change</span>
        </button>
        {est && <span className="text-ink-500">RIR ≈ {formatRirRange(est)} (estimate)</span>}
        {s.notes && <span className="truncate text-ink-500">“{s.notes}”</span>}
      </div>
    );
  }
  return (
    <div className="mt-1.5 rounded-xl bg-ink-50 p-2 dark:bg-ink-950/60">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-ink-500">
        <span className="font-semibold uppercase tracking-wider">How did it feel?</span>
        <span>optional</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="How did this set feel?">
        {FEEL_OPTIONS.map((o) => (
          <button key={o.id} type="button" aria-pressed={s.feel === o.id} onClick={() => pick(o.id)}
            className={cx('min-h-[44px] rounded-lg px-1 text-[12px] font-medium leading-tight transition active:scale-95',
              s.feel === o.id ? FEEL_TONE[o.id] + ' ring-2 ring-current/30' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{o.label}</button>
        ))}
      </div>
      {sel && <p className="mt-1.5 text-[11px] leading-snug text-ink-500">{sel.description}{est ? ` No RIR logged: RIR ≈ ${formatRirRange(est)} (estimate, not measured).` : ''}</p>}
      {s.feel === 'pain' && (
        <div className="mt-2 space-y-2">
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-[11px] leading-snug text-rose-700 dark:text-rose-300">
            Stop or change the movement if it hurts — don't push through pain. This app can't diagnose anything; if it persists or is sharp, get it checked. The set is kept but not counted as a normal quality set.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PAIN_AREAS.map((a) => (
              <button key={a} type="button" aria-pressed={s.pain?.area === a} onClick={() => onChange({ pain: { area: s.pain?.area === a ? '' : a, note: s.pain?.note } })}
                className={cx('h-10 rounded-full px-3 text-[12px] font-medium', s.pain?.area === a ? 'bg-rose-500 text-white' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{a}</button>
            ))}
          </div>
          <input className="h-10 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm outline-none dark:border-ink-700 dark:bg-ink-900" placeholder="What did it feel like? (optional)"
            value={s.pain?.note ?? ''} onChange={(e) => onChange({ pain: { area: s.pain?.area ?? '', note: e.target.value || undefined } })} />
        </div>
      )}
      {(s.feel === 'wrong_light' || s.feel === 'wrong_heavy') && (
        <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-600 dark:text-ink-300">
          <span className="shrink-0">Meant to use</span>
          <div className="w-28"><NumInput value={s.intendedWeightKg ?? null} onChange={(v) => onChange({ intendedWeightKg: v })} placeholder="kg (optional)" step={0.5} /></div>
        </label>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" onClick={() => setDetails(!details)} aria-expanded={details} className="min-h-[40px] text-[12px] font-medium text-accent-600 dark:text-accent-400">{details ? 'Hide details' : 'Details & note'}</button>
        {sel && <button type="button" onClick={() => setOpen(false)} className="min-h-[40px] px-2 text-[12px] text-ink-500">Done</button>}
      </div>
      {details && (
        <div className="mt-1 space-y-2">
          <DimRow label="Effort" value={s.effort} options={Object.entries(EFFORT_LABEL) as [Effort, string][]} onPick={(v) => onChange({ effort: v })} />
          <DimRow label="Weight" value={s.weightAccuracy} options={Object.entries(ACCURACY_LABEL) as [WeightAccuracy, string][]} onPick={(v) => onChange({ weightAccuracy: v })} />
          <DimRow label="Execution" value={s.execution} options={EXECUTION_FEEDBACK.map((o) => [o.id, o.label]) as [ExecutionFeedback, string][]} onPick={(v) => onChange({ execution: v })} />
          <DimRow label="Technique" value={techniqueOf(s)} options={Object.entries(TECHNIQUE_LABEL) as [Technique, string][]} onPick={(v) => onChange({ technique: v, ...(s.techniqueOk === false ? { techniqueOk: undefined } : {}) })} />
          <input className="h-10 w-full rounded-lg border border-ink-200 bg-white px-2 text-sm outline-none dark:border-ink-700 dark:bg-ink-900" placeholder="Note (e.g. lost balance on the last reps)"
            value={s.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} />
          <p className="text-[11px] text-ink-400">RIR stays separate — log it with the numbers above if you know it.</p>
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
            className={cx('min-h-[40px] rounded-full px-3 text-[12px] font-medium', value === v ? 'bg-accent-500 text-ink-950' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{l}</button>
        ))}
      </div>
    </div>
  );
}

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


