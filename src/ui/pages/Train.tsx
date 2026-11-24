/**
 * Training mode (Part 6, F.2 / F.5 / F.6): a full-screen, dark, distraction-free flow for a live workout.
 *
 *   SET ENTRY  →  LOG SET  →  REST (2:30 ring, effort tap)  →  NEXT SET … →  NEXT EXERCISE
 *
 * A set exists only once it was done and logged; the plan is a target line. One primary action per
 * screen. Everything else (order, Later, Machine busy, Replace, Change, Skip, add, session details,
 * Finish) lives in the overview. Design rules: docs/DESIGN.md.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatDate, localNowParts } from '../../domain/dates';
import { isFinished } from '../../domain/feedback';
import { loadStep } from '../../domain/increments';
import {
  ANY_DOUBLE_TAP_MS, adjustRest, applyOffer, keepOffer, clearOtherRestEnds, clockStartMs, editSet, effortTapOf, effortTapPatch, exerciseProgress, isDoubleTap, lastEntryFor, lastLogged, logSet, mmss, nextSetsOffer, prefillNext, restState, restTargetFor, weightSource, type NextSetsOffer,
  setDelta, setScore, toggleWarmup, REST_DEFAULT_SEC, REST_STEP_SEC, type EffortTap,
} from '../../domain/liveFlow';
import { applyPendingUpdate, replacementOptions, replanPending, targetFromPrescription, type ReplacementOption } from '../../domain/planner';
import { optimality, rankOptions, type Optimality } from '../../domain/optimality';
import { choiceOutcomes } from '../../domain/exerciseChoice';
import { progressionKey } from '../../domain/progression';
import { loadUnitLabel, MACHINE_KINDS } from '../../domain/registry';
import { minutesBetween, summarizeSession, type SessionSummary } from '../../domain/sessionSummary';
import type { Equipment, ExerciseDef, LoadMode, PlanDecision, PlanDecisionReason, Side, Workout, WorkoutExercise, WorkoutSet } from '../../domain/types';
import { stepTarget, withChosenStep } from '../../domain/weights';
import { PAIN_AREAS } from '../../domain/feedback';
import { KG, L, NP, num } from '../../i18n';
import { uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { EquipmentPicker } from '../components/EquipmentPicker';
import { ScoredRow } from '../components/Optimality';
import { IconBrain, IconCheck, IconChevron, IconCopy, IconMore, IconPlus } from '../components/icons';
import { Button, confirmAction, cx, Empty, Input, Modal, Page, toast, undoToast } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';
import { EffortRow, effortLabel, RepsControl, RestRing, StepChoices, TButton, TLabel, WeightControl } from '../train/controls';
import { useLiveWorkout } from '../train/useLiveWorkout';
import { EquipmentForm } from './Equipment';
import {
  defaultLoadMode, ExecutionCue, ExercisePicker, lastSessionFor, safePrescribe, SessionEditor, SessionMeta, SettingsEditor, StartSession, SummaryModal, VariationChips, Wellness, type AddOpts,
} from './Logger';

export function LogPage() {
  const { id } = useParams();
  const data = useData();
  const workout = id ? data.workouts.find((w) => w.id === id) : undefined;
  if (id && !workout) return <Page title={L('Workout not found', 'Тренировка не найдена')}><Empty title={L('This workout does not exist.', 'Такой тренировки нет.')} action={<Link to="/log"><Button>{L('Start a new one', 'Начать новую')}</Button></Link>} /></Page>;
  if (!workout) return <StartSession />;
  // A live, unfinished workout opens in training mode; everything else in the detailed editor.
  return <LogMode key={workout.id} workout={workout} />;
}

/** Decided once per opened workout: finishing it must not swap the screen under the summary. */
function LogMode({ workout }: { workout: Workout }) {
  const [live] = useState(() => !isFinished(workout));
  return live ? <TrainSession initial={workout} /> : <SessionEditor initial={workout} />;
}

// ---------------------------------------------------------------- helpers

const done = (e: WorkoutExercise) => e.sets.filter((s) => !s.planned);
const kgText = (v: number | null) => (v == null ? '—' : num(v));
const setText = (s: Pick<WorkoutSet, 'weightKg' | 'reps'>) => `${kgText(s.weightKg)} × ${s.reps ?? '—'}`;

/** "60 × 12 · 11 · 10" — consecutive sets at the same weight are grouped. */
function setsLine(sets: WorkoutSet[]): string {
  const parts: string[] = [];
  let w: number | null | undefined;
  for (const s of sets) {
    if (s.weightKg === w && parts.length) parts[parts.length - 1] += ` · ${s.reps ?? '—'}`;
    else parts.push(setText(s));
    w = s.weightKg;
  }
  return parts.join('   ');
}

function targetLine(e: WorkoutExercise): string | null {
  const t = e.target;
  if (!t) return null;
  if (t.sets <= 0) return L('optional today', 'сегодня по желанию');
  const r = t.reps[0];
  const reps = r ? (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`) : '';
  return `${t.sets} × ${t.weightKg != null ? `${num(t.weightKg)} ${KG()} × ` : ''}${reps}`;
}

/** The exercise to work on: the one of the last logged set unless it was closed, else the first open one. */
function pickCurrent(w: Workout): string | null {
  const l = lastLogged(w);
  const lastEx = l ? w.exercises.find((e) => e.id === l.exerciseId) : undefined;
  if (lastEx && !lastEx.doneAt && !lastEx.skipped) return lastEx.id;
  const open = w.exercises.find((e) => !e.skipped && !e.doneAt && !exerciseProgress(e).reached);
  return open?.id ?? null;
}

const unitLabel = (def: ExerciseDef | undefined, mode: LoadMode): string => {
  return loadUnitLabel(def, mode); // already in the current language
};

type View = 'set' | 'rest' | 'overview';
const REASONS: [PlanDecisionReason, () => string][] = [
  ['busy', () => L('Machine busy', 'Тренажёр занят')], ['time', () => L('No time', 'Нет времени')], ['preference', () => L('Prefer another', 'Хочу другое')], ['pain', () => L('Pain', 'Боль')],
];

// ---------------------------------------------------------------- session

function TrainSession({ initial }: { initial: Workout }) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const nav = useNavigate();
  const registryRef = useRef(a.registry);
  registryRef.current = a.registry;
  const { w, update, undoable, cancelSave, replace, latest, queue } = useLiveWorkout(initial, (id) => registryRef.current.get(id)?.name.en ?? id);

  const [curId, setCurId] = useState<string | null>(() => pickCurrent(initial));
  const [view, setView] = useState<View>(() => {
    if (!initial.exercises.length || !pickCurrent(initial)) return 'overview';
    const r = restState(initial, Date.now(), data.settings.restDefaultSec);
    const restEx = r ? initial.exercises.find((e) => e.id === r.exerciseId) : undefined;
    const ended = !!restEx?.restEndedAt && Date.parse(restEx.restEndedAt) > Date.now() - r!.elapsedSec * 1000;
    const lastSet = restEx?.sets.find((s) => s.id === r?.setId);
    const sides = restEx?.sets.filter((s) => !s.planned && s.side) ?? [];
    const midPair = lastSet?.side === 'left' && sides.filter((s) => s.side === 'left').length > sides.filter((s) => s.side === 'right').length;
    return r && !ended && !midPair && r.elapsedSec < 30 * 60 && r.exerciseId === pickCurrent(initial) ? 'rest' : 'set';
  });
  const [picker, setPicker] = useState<'add' | { change: string } | null>(() => (initial.exercises.length ? null : 'add'));
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [preFinish, setPreFinish] = useState<Workout | null>(null);
  const finishing = useRef(false);
  const [adjusted, setAdjusted] = useState<Record<string, string>>({});
  const [perSide, setPerSide] = useState<Record<string, boolean>>({});
  const [sessionStep, setSessionStep] = useState<Record<string, number>>({});

  // The training screens are always dark; sheets opened from here follow.
  useEffect(() => {
    const root = document.documentElement;
    const had = root.classList.contains('dark');
    root.classList.add('dark');
    return () => { if (!had) root.classList.remove('dark'); };
  }, []);

  const cur = w.exercises.find((e) => e.id === curId) ?? null;
  const exName = useCallback((e: WorkoutExercise) => names.ex(a.registry.get(e.exerciseId), e.exerciseNameRaw ?? e.exerciseId), [names, a.registry]);
  const setEx = useCallback((exId: string, fn: (e: WorkoutExercise) => WorkoutExercise, now = false) => update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === exId ? fn(e) : e)) }), { now }), [update]);

  // ---- building and changing exercises
  const buildExercise = (def: ExerciseDef, base: Workout, opts: AddOpts = {}): WorkoutExercise => {
    const eq = (opts.equipmentId ? data.equipment.find((e) => e.id === opts.equipmentId) : undefined)
      ?? data.equipment.find((e) => e.exerciseIds.includes(def.id) && e.locationId === w.locationId && !(w.busyEquipment ?? []).some((b) => b.equipmentId === e.id)) ?? null;
    const prev = lastSessionFor(data.workouts, def.id, eq?.id ?? null, w.id);
    const variation = opts.variation ? { ...opts.variation } : prev?.variation ? { ...prev.variation } : def.defaultVariation ? { ...def.defaultVariation } : undefined;
    const draft: WorkoutExercise = {
      id: uid('we'), order: base.exercises.length, exerciseId: def.id, exerciseConfidence: 'confirmed',
      equipmentId: eq?.id ?? null, equipmentConfidence: eq ? 'confirmed' : 'unknown',
      settings: eq && Object.keys(eq.settings).length ? { ...eq.settings } : undefined, variation, sets: [],
    };
    // Today's target (a plan line, never set rows).
    const p = safePrescribe(data, a, { ...base, exercises: [...base.exercises, draft] }, base.exercises.length);
    return { ...draft, ...(p ? { target: targetFromPrescription(p) } : {}), ...(opts.choice ? { choice: opts.choice } : {}), ...(opts.forwardKept ? { forwardKept: opts.forwardKept } : {}) };
  };
  const addExercise = (def: ExerciseDef, opts: AddOpts = {}) => {
    setPicker(null);
    const ex = buildExercise(def, w, opts);
    const at = new Date().toISOString();
    update((x) => ({ ...x, exercises: [...x.exercises, { ...ex, order: x.exercises.length }], ...(opts.ackKey || opts.forwardAck ? { choiceAcks: [...(x.choiceAcks ?? []), ...[opts.ackKey, opts.forwardAck].filter((k): k is string => !!k).map((key) => ({ key, at }))] } : {}) }), { now: true });
    setCurId(ex.id);
    setView('set');
  };
  const changeExercise = (exId: string, def: ExerciseDef) => {
    const old = w.exercises.find((e) => e.id === exId);
    if (!old || old.exerciseId === def.id) return;
    const performed = done(old);
    let next: WorkoutExercise;
    if (!performed.length) {
      const base = { ...w, exercises: w.exercises.filter((e) => e.id !== exId) };
      next = { ...buildExercise(def, base), id: old.id, order: old.order };
    } else {
      // The sets were done: they stay as they are, only the exercise changes (machine and shared settings kept).
      const { plannedCount: _p, choice: _c, planItem: _i, exerciseNameRaw: _r, target: _t, ...rest } = old;
      void _p; void _c; void _i; void _r; void _t;
      const keepKeys = new Set<string>(['unilateral', 'rom', ...(def.variationFields ?? []).map((f) => (f === 'angle' ? 'benchAngleDeg' : f))]);
      const keptVar = Object.fromEntries(Object.entries(old.variation ?? {}).filter(([k, v]) => keepKeys.has(k) && v != null));
      const variation = { ...(def.defaultVariation ?? {}), ...keptVar };
      next = { ...rest, exerciseId: def.id, exerciseConfidence: 'confirmed', variation: Object.keys(variation).length ? variation : undefined, sets: performed };
    }
    update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === exId ? next : e)) }), { now: true });
    undoable(L(`Changed to ${names.ex(def)}`, `Заменено на: ${names.ex(def)}`), (x) => {
      const e = x.exercises.find((y) => y.id === exId);
      if (!e || e.exerciseId !== def.id) return x;
      if (done(e).length > performed.length) return x; // sets were logged on the new exercise since: nothing to undo
      const sets = performed.length ? e.sets : old.sets;
      return { ...x, exercises: x.exercises.map((y) => (y.id === exId ? { ...old, sets } : y)) };
    });
  };
  const replaceExercise = (exId: string, o: ReplacementOption, reason: PlanDecisionReason | null) => {
    const old = w.exercises.find((e) => e.id === exId);
    const def = a.registry.get(o.exerciseId);
    if (!old || !def) return;
    const base = { ...w, exercises: w.exercises.filter((e) => e.id !== exId) };
    const fresh = buildExercise(def, base, { equipmentId: o.equipmentId, variation: o.variation });
    const d: PlanDecision = { action: 'replaced', exerciseId: old.exerciseId, equipmentId: old.equipmentId, replacement: { exerciseId: o.exerciseId, equipmentId: fresh.equipmentId }, reason, at: new Date().toISOString() };
    update((x) => {
      const xs = [...x.exercises];
      const i = xs.findIndex((e) => e.id === exId);
      if (i < 0) return x;
      xs[i] = { ...fresh, order: i };
      return { ...x, exercises: xs, planDecisions: [...(x.planDecisions ?? []), d] };
    }, { now: true });
    if (curId === exId) setCurId(fresh.id);
    undoable(L(`Replaced with ${names.ex(def)}`, `Заменено на: ${names.ex(def)}`), (x) => {
      const i = x.exercises.findIndex((e) => e.id === fresh.id);
      if (i < 0 || done(x.exercises[i]).length) return x; // performed sets are never thrown away by an undo
      const xs = [...x.exercises];
      xs[i] = { ...old, order: i };
      return { ...x, exercises: xs, planDecisions: (x.planDecisions ?? []).filter((y) => y.at !== d.at) };
    });
  };
  const postpone = (exId: string) => {
    const at = new Date().toISOString();
    const from = w.exercises.findIndex((y) => y.id === exId);
    const prevDeferred = w.exercises[from]?.deferredAt;
    update((x) => {
      const e = x.exercises.find((y) => y.id === exId);
      if (!e) return x;
      const rest = x.exercises.filter((y) => y.id !== exId);
      return { ...x, exercises: [...rest, { ...e, deferredAt: at }].map((y, i) => ({ ...y, order: i })), planDecisions: [...(x.planDecisions ?? []), { action: 'later', exerciseId: e.exerciseId, equipmentId: e.equipmentId, reason: null, at }] };
    }, { now: true });
    undoable(L('Moved to the end (Later)', 'Перенесено в конец (Позже)'), (x) => {
      const e = x.exercises.find((y) => y.id === exId);
      if (!e) return x;
      const rest = x.exercises.filter((y) => y.id !== exId);
      const xs = [...rest.slice(0, Math.max(0, from)), { ...e, deferredAt: prevDeferred }, ...rest.slice(Math.max(0, from))].map((y, i) => ({ ...y, order: i }));
      return { ...x, exercises: xs, planDecisions: (x.planDecisions ?? []).filter((d) => d.at !== at) };
    });
  };
  const markBusy = (exId: string) => {
    const at = new Date().toISOString();
    update((x) => {
      const e = x.exercises.find((y) => y.id === exId);
      if (!e || !e.equipmentId) return x;
      const list = (x.busyEquipment ?? []).some((b) => b.equipmentId === e.equipmentId) ? x.busyEquipment ?? [] : [...(x.busyEquipment ?? []), { equipmentId: e.equipmentId, at }];
      return { ...x, busyEquipment: list, planDecisions: [...(x.planDecisions ?? []), { action: 'busy', exerciseId: e.exerciseId, equipmentId: e.equipmentId, reason: 'busy', at }] };
    }, { now: true });
    undoable(L('Machine marked busy for this session', 'Тренажёр отмечен занятым на эту тренировку'), (x) => ({ ...x, busyEquipment: (x.busyEquipment ?? []).filter((b) => b.at !== at), planDecisions: (x.planDecisions ?? []).filter((d) => d.at !== at) }));
  };
  const freeMachine = (equipmentId: string) => update((x) => ({ ...x, busyEquipment: (x.busyEquipment ?? []).filter((b) => b.equipmentId !== equipmentId) }), { now: true });
  const skip = (exId: string) => {
    const e0 = w.exercises.find((e) => e.id === exId);
    if (!e0) return;
    const at = new Date().toISOString();
    if (e0.skipped) { setEx(exId, (e) => ({ ...e, skipped: false }), true); return; }
    update((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === exId ? { ...e, skipped: true } : e)), planDecisions: [...(x.planDecisions ?? []), { action: 'skipped', exerciseId: e0.exerciseId, equipmentId: e0.equipmentId, reason: null, at }] }), { now: true });
    if (curId === exId) { setCurId(null); setView('overview'); }
    undoable(L(`${exName(e0)} skipped`, `Пропущено: ${exName(e0)}`), (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === exId ? { ...e, skipped: false } : e)), planDecisions: (x.planDecisions ?? []).filter((d) => d.at !== at) }));
  };
  const move = (exId: string, dir: -1 | 1) => update((x) => {
    const i = x.exercises.findIndex((e) => e.id === exId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= x.exercises.length) return x;
    const xs = [...x.exercises];
    [xs[i], xs[j]] = [xs[j], xs[i]];
    return { ...x, exercises: xs.map((e, k) => ({ ...e, order: k })), planDecisions: [...(x.planDecisions ?? []), { action: 'reordered', exerciseId: x.exercises[i].exerciseId, equipmentId: x.exercises[i].equipmentId, reason: null, at: new Date().toISOString() }] };
  }, { now: true });
  const removeExercise = (exId: string) => {
    const index = w.exercises.findIndex((e) => e.id === exId);
    const copy = w.exercises[index];
    if (!copy) return;
    update((x) => ({ ...x, exercises: x.exercises.filter((e) => e.id !== exId).map((e, i) => ({ ...e, order: i })) }), { now: true });
    if (curId === exId) { setCurId(null); setView('overview'); }
    undoable(L(`${exName(copy)} removed`, `Удалено: ${exName(copy)}`), (x) => (x.exercises.some((e) => e.id === copy.id) ? x
      : { ...x, exercises: [...x.exercises.slice(0, index), copy, ...x.exercises.slice(index)].map((e, i) => ({ ...e, order: i })) }));
  };

  // ---- E.9: whenever what was DONE changes, exercises not started are re-targeted from the real session.
  const doneSig = w.exercises.map((e) => `${e.skipped ? 's' : ''}:${e.sets.filter((x) => !x.planned && x.type !== 'warmup').map((x) => x.id).join('.')}`).join('|');
  const lastSig = useRef<{ sig: string; n: number } | null>(null);
  useEffect(() => {
    const prevSig = lastSig.current;
    lastSig.current = { sig: doneSig, n: w.exercises.length };
    if (!prevSig || prevSig.n !== w.exercises.length || prevSig.sig === doneSig) return;
    let ups: ReturnType<typeof replanPending>;
    try { ups = replanPending(data, a, latest.current, new Date()); } catch { return; }
    const notes: Record<string, string> = {};
    const patched = new Map<string, WorkoutExercise>();
    for (const u of ups) {
      const e = latest.current.exercises[u.exerciseIndex];
      if (!e) continue;
      const next = applyPendingUpdate(e, u);
      if (next) { patched.set(e.id, next); notes[e.id] = u.reason; }
    }
    if (!patched.size) return;
    setAdjusted((x) => ({ ...x, ...notes }));
    update((x) => ({ ...x, exercises: x.exercises.map((e) => patched.get(e.id) ?? e) }));
  }, [doneSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- finish / delete
  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const snapshot = latest.current;
      const skipped = snapshot.exercises.filter((e) => e.skipped).length;
      const exercises = snapshot.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => !s.planned) })).filter((e) => e.sets.length > 0).map((e, i) => ({ ...e, order: i }));
      cancelSave();
      if (!exercises.length) {
        await queue(() => store.deleteWorkout(snapshot.id));
        nav('/');
        undoToast(L('Nothing was logged — workout discarded', 'Ничего не записано — тренировка удалена'), async () => { await store.putWorkoutAsIs(snapshot); window.location.hash = `#/log/${snapshot.id}`; });
        return;
      }
      const now = localNowParts(data.settings.timezone);
      const durationMin = snapshot.durationMin ?? minutesBetween(snapshot.date, snapshot.startTime, now);
      const final: Workout = {
        ...snapshot, exercises: exercises.map((e) => (e.settings ? { ...e, settings: Object.fromEntries(Object.entries(e.settings).filter(([, v]) => v.trim() !== '')) } : e)),
        finishedAt: new Date().toISOString(), endTime: snapshot.endTime ?? (snapshot.date === now.date ? now.time : null), durationMin: durationMin && durationMin > 0 ? durationMin : null,
      };
      replace(final);
      // After every write still on its way (a set logged a moment ago must not land on top of the finished workout).
      await queue(() => store.saveWorkout(final));
      setPreFinish(snapshot);
      toast(L('Workout saved', 'Тренировка сохранена'));
      setSummary({ ...summarizeSession(final, [...data.workouts.filter((o) => o.id !== final.id), final], a.registry, data.settings.quality, now), skippedExercises: skipped });
    } finally { finishing.current = false; }
  };
  const backToWorkout = () => {
    const s = preFinish;
    if (!s) return;
    setSummary(null);
    setPreFinish(null);
    replace(s);
    void queue(() => store.putWorkoutAsIs({ ...s, updatedAt: new Date().toISOString() }));
    setView('overview');
    toast(L('Back in the workout — nothing was lost', 'Вы снова в тренировке — ничего не потеряно'), 'info');
  };
  const removeWorkout = async () => {
    if (!confirmAction(L('Delete this whole workout? You can undo it for a few seconds.', 'Удалить всю тренировку? Несколько секунд это можно отменить.'))) return;
    const copy = latest.current;
    cancelSave();
    await queue(() => store.deleteWorkout(copy.id)); // after any write still on its way
    nav('/history');
    undoToast(L('Workout deleted', 'Тренировка удалена'), async () => { await store.putWorkoutAsIs(copy); window.location.hash = `#/log/${copy.id}`; });
  };

  const open = (exId: string) => { setCurId(exId); setView('set'); if (w.exercises.find((e) => e.id === exId)?.doneAt) setEx(exId, (e) => ({ ...e, doneAt: undefined })); };
  const nextExercise = () => {
    if (cur) {
      const exId = cur.id;
      const p = exerciseProgress(cur);
      setEx(exId, (e) => ({ ...e, doneAt: new Date().toISOString() }), true);
      // Stopped before the target: say so, and one tap brings the exercise back.
      if (!p.reached && p.done > 0) {
        const name = exName(cur);
        undoToast(p.target ? L(`${name}: finished after ${p.done} of ${p.target} sets`, `${name}: завершено после ${p.done} из ${p.target} подх.`) : L(`${name}: finished`, `${name}: завершено`), () => {
          const now = latest.current.exercises.find((e) => e.id === exId);
          if (!now || !now.doneAt) return false;
          setEx(exId, (e) => ({ ...e, doneAt: undefined }), true);
          setChooser(null);
          setCurId(exId);
          setView('set');
          return true;
        });
      }
    }
    const next = w.exercises.find((e) => e.id !== cur?.id && !e.skipped && !e.doneAt && !exerciseProgress(e).reached);
    if (next) { setCurId(next.id); setView('set'); } else { setCurId(null); setView('overview'); }
  };
  /** Close the current exercise (Undo when before its target) and let the owner pick what comes next. */
  const chooseNext = () => {
    const from = cur?.id ?? null;
    if (cur) nextExercise();
    setCurId(null);
    setView('overview');
    setChooser(from ?? 'none');
  };
  const [chooser, setChooser] = useState<string | null>(null);
  const openList = w.exercises.filter((e) => e.id !== chooser && !e.skipped && !e.doneAt && !exerciseProgress(e).reached);
  // Part 9: each remaining exercise with its fit score for THIS moment, sorted high → low; "not today" listed apart.
  const ranked = useMemo(() => {
    if (chooser == null) return [];
    const outcomes = choiceOutcomes(data, a);
    return rankOptions(openList.map((e) => ({
      ...optimality({ data, analysis: a, workout: w, exerciseId: e.exerciseId, equipmentId: e.equipmentId, variation: e.variation ?? null, outcomes, ...(e.target ? { sets: Math.max(1, e.target.sets - exerciseProgress(e).done) } : {}) }), ex: e,
    })), (id) => names.ex(a.registry.get(id)));
  }, [chooser, w, data, a, names]); // eslint-disable-line react-hooks/exhaustive-deps

  const accent = data.settings.trainAccent ?? 'ember';
  const active = w.exercises.filter((e) => !e.skipped);
  const position = cur ? `${active.findIndex((e) => e.id === cur.id) + 1} / ${active.length}` : '';

  return (
    <div className="train fixed inset-0 z-[45] flex flex-col overflow-hidden" data-accent={accent} data-testid="train" data-view={summary ? 'summary' : view}>
      {view === 'overview' || !cur ? (
        <Overview w={w} curId={curId} exName={exName} adjusted={adjusted} update={update}
          onOpen={open} onBack={cur ? () => setView('set') : null} onAdd={() => setPicker('add')} onFinish={finish} onDelete={removeWorkout}
          onLater={postpone} onBusy={markBusy} onFree={freeMachine} onReplace={replaceExercise} onChange={(id) => setPicker({ change: id })} onSkip={skip} onMove={move} onRemove={removeExercise} />
      ) : (
        <ExerciseScreens key={cur.id} w={w} ex={cur} view={view} setView={setView} position={position} exName={exName(cur)}
          setEx={setEx} updateAll={update} undoable={undoable} onNextExercise={nextExercise} onChooseNext={chooseNext} hasNext={w.exercises.some((e) => e.id !== cur.id && !e.skipped && !e.doneAt && !exerciseProgress(e).reached)}
          perSide={perSide[cur.id]} setPerSide={(v) => setPerSide((m) => ({ ...m, [cur.id]: v }))}
          sessionStep={sessionStep[cur.id]} setSessionStep={(v) => setSessionStep((m) => ({ ...m, [cur.id]: v }))}
          onLater={() => { postpone(cur.id); setCurId(null); setView('overview'); }} onSkip={() => skip(cur.id)} onChange={() => setPicker({ change: cur.id })} />
      )}
      <ExercisePicker open={!!picker} title={picker && picker !== 'add' ? L('Change exercise', 'Сменить упражнение') : L('Add exercise', 'Добавить упражнение')} onClose={() => setPicker(null)}
        onPick={picker && picker !== 'add' ? (d) => { const id = picker.change; setPicker(null); changeExercise(id, d); } : addExercise} locationId={w.locationId} workout={picker === 'add' ? w : null} />
      {summary && <SummaryModal s={summary} onDone={() => nav('/')} onBack={preFinish ? backToWorkout : undefined} />}
      <Modal open={chooser != null && !picker} onClose={() => setChooser(null)} title={L('Next exercise', 'Следующее упражнение')}>
        <div className="space-y-2" data-testid="next-chooser">
          {ranked.map((o: Optimality & { ex: WorkoutExercise }, i) => (
            <div key={o.ex.id}>
              {o.group === 'not_today' && (i === 0 || ranked[i - 1].group !== 'not_today') && <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Not recommended today', 'Сегодня не рекомендуется')}</p>}
              <ScoredRow o={o}>
                <button type="button" onClick={() => { setChooser(null); open(o.ex.id); }} data-testid="next-choice"
                  className={cx('flex min-h-[56px] w-full flex-col items-start justify-center rounded-xl border px-3 py-2 text-left', i === 0 && o.group === 'suitable' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-200 dark:border-ink-700')}>
                  <span className="break-words text-sm font-semibold text-ink-900 dark:text-white">{exName(o.ex)}</span>
                  <span className="break-words text-xs text-ink-500">{[targetLine(o.ex), i === 0 && o.group === 'suitable' ? L('best fit now', 'лучше всего сейчас') : ''].filter(Boolean).join(' · ')}</span>
                </button>
              </ScoredRow>
            </div>
          ))}
          {!openList.length && <p className="text-sm text-ink-500">{L('Everything planned is done. Add another exercise, or finish the workout in the overview.', 'Всё запланированное сделано. Добавьте ещё упражнение или завершите тренировку в обзоре.')}</p>}
          <Button size="lg" variant={openList.length ? 'secondary' : 'primary'} className="w-full" onClick={() => { setChooser(null); setPicker('add'); }} data-testid="next-add"><IconPlus size={18} />{L('Add exercise', 'Добавить упражнение')}</Button>
          <button type="button" className="min-h-[48px] w-full text-sm font-semibold text-ink-500 underline" onClick={() => setChooser(null)} data-testid="next-overview">{L('Overview', 'Обзор')}</button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- top bar with the workout clock

function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    const vis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [ms]);
  return now;
}

function Clock({ w }: { w: Workout }) {
  const now = useNow(1000);
  const start = clockStartMs(w);
  if (start == null) return <span className="t-num text-sm font-semibold text-t-dim" data-testid="workout-clock" data-running="false">0:00</span>;
  const sec = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(sec / 3600);
  const text = h ? `${h}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}` : mmss(sec);
  return <span className="t-num text-sm font-semibold text-t-dim" data-testid="workout-clock" data-running="true" aria-label={L('Workout time', 'Время тренировки')}>{text}</span>;
}

function TopBar({ left, center, right }: { left: ReactNode; center: ReactNode; right: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-2 pt-[max(0.25rem,env(safe-area-inset-top))]">
      <div className="flex min-w-[48px] justify-start">{left}</div>
      <div className="flex min-w-0 items-center gap-3">{center}</div>
      <div className="flex min-w-[48px] justify-end">{right}</div>
    </div>
  );
}

const quietBtn = 'flex h-12 min-w-[48px] items-center justify-center rounded-xl px-2 text-t-dim active:bg-t-surface';

// ---------------------------------------------------------------- set entry + rest for one exercise

function ExerciseScreens({ w, ex, view, setView, position, exName, setEx, updateAll, undoable, onNextExercise, onChooseNext, hasNext, perSide, setPerSide, sessionStep, setSessionStep, onLater, onSkip, onChange }: {
  w: Workout; ex: WorkoutExercise; view: View; setView: (v: View) => void; position: string; exName: string;
  setEx: (exId: string, fn: (e: WorkoutExercise) => WorkoutExercise, now?: boolean) => void;
  updateAll: (fn: (w: Workout) => Workout, opts?: { now?: boolean }) => void;
  undoable: (msg: string, revert: (x: Workout) => Workout) => void; onNextExercise: () => void; onChooseNext: () => void; hasNext: boolean;
  perSide: boolean | undefined; setPerSide: (v: boolean) => void; sessionStep: number | undefined; setSessionStep: (v: number) => void;
  onLater: () => void; onSkip: () => void; onChange: () => void;
}) {
  const data = useData();
  const a = useAnalysis();
  const model = data.settings.quality;
  const def = a.registry.get(ex.exerciseId);
  const eq = ex.equipmentId ? data.equipment.find((e) => e.id === ex.equipmentId) : undefined;
  const gym = data.locations.find((l) => l.id === w.locationId) ?? null;
  const sets = done(ex);
  // Like with like: the same exercise × machine × configuration (bench angle, attachment, …), performed sets only.
  const histKey = def ? progressionKey(ex, w, def) : `${ex.exerciseId}::${ex.equipmentId ?? ''}`;
  const last = useMemo(() => lastEntryFor(data.workouts, w, ex, (e, o) => progressionKey(e, o, a.registry.get(e.exerciseId))), [data.workouts, w.id, w.date, w.locationId, histKey, a.registry]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSets = last ? done(last) : [];
  const [modeChoice, setModeChoice] = useState<LoadMode | null>(null);
  const loadMode: LoadMode = sets[sets.length - 1]?.loadMode ?? modeChoice ?? lastSets.find((s) => s.type === 'working')?.loadMode ?? (def ? defaultLoadMode(def) : 'total');
  const stepInfo = loadStep(eq, gym, eq?.kind ?? def?.equipmentKind, loadMode);
  const step = stepInfo.source === 'default' && sessionStep ? sessionStep : stepInfo.step;
  const sides = perSide ?? (sets.some((s) => s.side) || (!sets.length && (lastSets.some((s) => s.side))));
  const nextSide: Side | undefined = sides ? (sets[sets.length - 1]?.side === 'left' ? 'right' : 'left') : undefined;
  const progress = exerciseProgress(ex);

  // Values offered for the set about to be logged (never counted until LOG SET).
  const fill = useMemo(() => prefillNext(ex, last), [ex, last]);
  const [weight, setWeight] = useState<number | null>(fill.weightKg);
  const [reps, setReps] = useState<number | null>(fill.reps);
  // Changes of the target (a Use, also a reps-only one) refresh the pre-filled values too.
  const fillKey = `${sets.length}:${last?.id ?? ''}:${ex.target?.weightKg ?? ''}:${JSON.stringify(ex.target?.reps ?? [])}:${ex.target?.adapted?.at ?? ''}`;
  // How the set went: answered together with weight and reps, before LOG SET (optional; cleared after each set).
  const [tap, setTap] = useState<EffortTap | null>(null);
  const lastTapSide = useRef<Side | undefined>(undefined);
  const seenKey = useRef(fillKey);
  const prevLen = useRef(sets.length);
  useEffect(() => {
    if (seenKey.current === fillKey) return;
    seenKey.current = fillKey;
    const shrank = sets.length < prevLen.current;
    prevLen.current = sets.length;
    // A set removed (or a removal undone the other way) keeps whatever was typed for the next set.
    if (shrank) return;
    // The answer given for the left side also stands for the right side of the pair.
    if (nextSide !== 'right') setTap(null);
    // Second side of a pair: same values as the first side.
    const prevSet = sets[sets.length - 1];
    if (nextSide === 'right' && prevSet) { setWeight(prevSet.weightKg); setReps(prevSet.reps); return; }
    setWeight(fill.weightKg);
    setReps(fill.reps);
  }, [fillKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // C-1: after a set, the remaining sets are re-checked — an OFFER (Use / Keep), never applied silently.
  const useOffer = (o: NextSetsOffer) => {
    const before = ex;
    setEx(ex.id, (e) => applyOffer(e, o, new Date().toISOString()), true);
    undoable(L('Next sets changed', 'Следующие подходы изменены'), (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === before.id ? { ...e, target: before.target } : e)) }));
  };
  // Where the weight in the field came from (owner 2026-11-24): adjusted by the analysis · kept by it · only copied.
  const source = weightSource(ex, last, weight);

  const [sheet, setSheet] = useState<null | 'step' | 'why' | 'setup' | 'menu' | { set: string }>(null);
  const [pickEq, setPickEq] = useState(false);
  const [newEq, setNewEq] = useState(false);
  const [editEq, setEditEq] = useState<Equipment | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const tapGuard = useRef(0);

  const series = useMemo(() => (def ? a.progression.find((p) => p.key === progressionKey(ex, w, def)) : undefined), [a.progression, def, ex, w]);
  const bestBefore = useMemo(() => {
    let b = 0;
    for (const s of series?.sessions ?? []) {
      if (s.workoutId === w.id) continue;
      for (const p of s.sets) if (p.benchmark) b = Math.max(b, setScore(p.weight, p.reps) ?? 0);
    }
    return b;
  }, [series, w.id]);
  // The machine's limits and the owner's usual rest on this history (the short-rest rule: a drop after a short rest is
  // the rest, not the load).
  const restMedian = useMemo(() => {
    const xs = (series?.sessions ?? []).map((x) => x.restAvgSec).filter((r): r is number => r != null).sort((p, q) => p - q);
    return xs.length ? xs[xs.length >> 1] : null;
  }, [series]);
  const offer = useMemo(() => (progress.reached ? null : nextSetsOffer(ex, stepInfo.step, { minKg: eq?.minKg ?? null, maxKg: eq?.maxKg ?? null, restMedianSec: restMedian })), [ex, stepInfo.step, progress.reached, eq, restMedian]);

  const log = () => {
    const nowMs = Date.now();
    // A second tap within 1.5 s is a double tap — unless it is the other side of a left / right pair.
    if (nowMs - tapGuard.current < ANY_DOUBLE_TAP_MS || (nowMs - tapGuard.current < 1500 && lastTapSide.current === nextSide)) return;
    if (reps == null || reps < 1) { toast(L('Enter the reps you did', 'Введите число повторений'), 'bad'); return; }
    const kg = weight ?? (loadMode === 'bodyweight_plus' ? 0 : null);
    if (kg == null) { toast(L('Enter the weight', 'Введите вес'), 'bad'); return; }
    const entry = { weightKg: kg, reps, loadMode, ...(nextSide ? { side: nextSide } : {}) };
    if (isDoubleTap(ex, entry, nowMs)) return;
    tapGuard.current = nowMs;
    lastTapSide.current = nextSide;
    const id = uid('s');
    const answer = tap;
    const logOne = (e: WorkoutExercise) => {
      const logged = logSet(e, entry, nowMs, id, model);
      const s = logged.sets.find((x) => x.id === id);
      return answer && s ? editSet(logged, id, effortTapPatch(s, answer), model) : logged;
    };
    // A NEXT SET mark left on another exercise no longer applies once this set is logged.
    updateAll((x) => clearOtherRestEnds({ ...x, exercises: x.exercises.map((e) => (e.id === ex.id ? logOne(e) : e)) }, ex.id), { now: true });
    if (nextSide !== 'left') setTap(null);
    setFlash(id);
    try { navigator.vibrate?.(30); } catch { /* no vibration */ }
    // After the left side comes the right side directly; rest starts after the pair.
    if (nextSide !== 'left') setView('rest');
  };

  const chooseStep = (s: number) => {
    setSheet(null);
    const t = stepTarget(eq, gym, eq?.kind ?? def?.equipmentKind);
    if (t.kind === 'equipment' && eq) { void store.saveEquipment({ ...eq, incrementsKg: withChosenStep(eq.incrementsKg, s) }); toast(L(`Step ${num(s)} kg remembered for ${eq.name}`, `Шаг ${num(s)} кг запомнен: ${eq.name}`), 'info'); }
    else if (t.kind === 'gym_free_weights' && gym) { void store.saveLocation({ ...gym, freeWeightIncrementsKg: withChosenStep(gym.freeWeightIncrementsKg, s) }); toast(L(`Step ${num(s)} kg remembered for the dumbbells at ${gym.name}`, `Шаг ${num(s)} кг запомнен для гантелей: ${gym.name}`), 'info'); }
    else { setSessionStep(s); toast(L(`Step ${num(s)} kg for this workout — link a machine to remember it`, `Шаг ${num(s)} кг на эту тренировку — привяжите тренажёр, чтобы запомнить`), 'info'); }
  };
  const chooseEq = (chosen: Equipment | null) => setEx(ex.id, (x) => ({ ...x, equipmentId: chosen?.id ?? null, equipmentConfidence: chosen ? 'confirmed' : 'unknown', settings: chosen ? { ...chosen.settings, ...(x.settings ?? {}) } : x.settings }), true);
  const patchSet = (setId: string, patch: Partial<WorkoutSet>) => setEx(ex.id, (e) => editSet(e, setId, patch, model), true);
  const removeSet = (s: WorkoutSet) => {
    const i = ex.sets.findIndex((x) => x.id === s.id);
    setEx(ex.id, (e) => editSet(e, s.id, null, model), true);
    setSheet(null);
    undoable(L('Set removed', 'Подход удалён'), (x) => ({ ...x, exercises: x.exercises.map((e) => (e.id !== ex.id || e.sets.some((y) => y.id === s.id) ? e : editSet({ ...e, sets: [...e.sets.slice(0, i), s, ...e.sets.slice(i)] }, s.id, {}, model))) }));
  };
  // Only what is asked for the NEXT sets changes; sets already logged per side stay exactly as logged.
  const toggleSides = () => {
    setPerSide(!sides);
    setSheet(null);
  };
  const MODES: [LoadMode, string][] = [
    ['total', L('Total weight', 'Общий вес')], ['per_side', L('Plates per side', 'Диски на сторону')],
    ['assisted', L('Assistance (less = harder)', 'Помощь (меньше = тяжелее)')], ['bodyweight_plus', L('Added to body weight', 'Доп. вес к весу тела')],
  ];
  const chooseMode = (mode: LoadMode) => {
    setModeChoice(mode);
    // One machine, one way of counting: the sets of this exercise logged today follow.
    if (sets.some((s) => s.loadMode !== mode)) setEx(ex.id, (e) => ({ ...e, sets: e.sets.map((s) => (s.loadMode === mode ? s : { ...s, loadMode: mode })) }), true);
  };

  const lastSet = sets[sets.length - 1] ?? null;
  const editing = sheet && typeof sheet === 'object' ? ex.sets.find((s) => s.id === sheet.set) ?? null : null;
  const unit = unitLabel(def, loadMode);
  const eqLine = eq ? eq.name : def && MACHINE_KINDS.has(def.equipmentKind) ? L('Machine not set — tap to choose', 'Тренажёр не выбран — нажмите') : null;
  const target = targetLine(ex);

  const chips = (
    <div className="flex flex-wrap gap-2" data-testid="set-chips">
      {sets.map((s, i) => {
        const d = s.type === 'warmup' ? null : setDelta(ex, s.id, last);
        const score = setScore(s.weightKg, s.reps) ?? 0;
        const best = s.type === 'working' && bestBefore > 0 && score > bestBefore + 1e-9 && !sets.slice(0, i).some((o) => (setScore(o.weightKg, o.reps) ?? 0) >= score);
        const tap = effortTapOf(s);
        return (
          <button key={s.id} type="button" onClick={() => setSheet({ set: s.id })} data-testid="set-chip" data-type={s.type}
            aria-label={L(`Set ${i + 1}: ${setText(s)}. Edit`, `Подход ${i + 1}: ${setText(s)}. Изменить`)}
            className={cx('t-num flex min-h-[48px] items-center gap-2 rounded-xl border border-t-line bg-t-surface px-3 text-left', flash === s.id && (best ? 't-flash-good' : 't-flash'), s.type === 'warmup' && 'opacity-60')}>
            <span className="text-xs font-bold text-t-dim">{i + 1}</span>
            <span className="font-display text-xl font-bold">{setText(s)}</span>
            {s.type === 'warmup' && <span className="rounded bg-t-line px-1.5 py-0.5 text-[10px] font-bold uppercase" title={L('Warm-up (not counted)', 'Разминочный (не в зачёт)')}>{L('W', 'Р')}</span>}
            {s.type === 'drop' && <span className="rounded bg-t-line px-1.5 py-0.5 text-[10px] font-bold uppercase">{L('Drop', 'Дроп')}</span>}
            {s.side && <span className="rounded bg-t-line px-1.5 py-0.5 text-[10px] font-bold uppercase">{s.side === 'left' ? L('L', 'Л') : L('R', 'П')}</span>}
            {best ? <span className="text-xs font-extrabold text-t-good" data-testid="chip-best">{L('BEST', 'РЕКОРД')}</span>
              : d && d.kind !== 'new' ? <span className={cx('text-xs font-extrabold', d.kind === 'up' ? 'text-t-good' : d.kind === 'down' ? 'text-t-warn' : 'text-t-dim')} data-testid="chip-delta">{d.kg != null ? `${d.kg > 0 ? '+' : '−'}${num(Math.abs(d.kg))} ${KG()}` : d.reps === 0 ? '=' : `${(d.reps as number) > 0 ? '+' : '−'}${Math.abs(d.reps as number)}`}</span> : null}
            {tap && <span className="text-[10px] font-semibold uppercase text-t-dim">{effortLabel(tap)}</span>}
          </button>
        );
      })}
    </div>
  );

  const head = (
    <TopBar
      left={<button type="button" className={quietBtn} onClick={() => setView('overview')} aria-label={L('Workout overview', 'Обзор тренировки')} data-testid="to-overview"><IconChevron size={22} className="rotate-180" /></button>}
      center={<><Clock w={w} /><span className="t-num text-sm font-semibold text-t-dim" data-testid="position">{position}</span></>}
      right={<button type="button" className={quietBtn} onClick={() => setSheet('menu')} aria-label={L('Exercise options', 'Действия с упражнением')} data-testid="exercise-menu"><IconMore size={22} /></button>}
    />
  );

  const sheets = (
    <>
      <Modal open={sheet === 'step'} onClose={() => setSheet(null)} title={L('Weight step', 'Шаг веса')}>
        <p className="mb-3 text-sm text-ink-500">{eq ? L(`The smallest step on ${eq.name}. Remembered for this machine.`, `Наименьший шаг на «${eq.name}». Запоминается для этого тренажёра.`) : L('The smallest step you can add here. Any weight can also be typed — tap the number.', 'Наименьший шаг, который здесь можно добавить. Любой вес можно ввести вручную — нажмите на число.')}</p>
        <StepChoices current={step} onPick={chooseStep} />
      </Modal>
      {sheet === 'why' && <WhySheet w={w} ex={ex} onClose={() => setSheet(null)} />}
      <Modal open={sheet === 'setup'} onClose={() => setSheet(null)} title={L('Setup', 'Настройка')}>
        {def && <VariationChips def={def} v={ex.variation} onChange={(p) => setEx(ex.id, (e) => ({ ...e, variation: { ...(e.variation ?? {}), ...p } }))} notes={[]} sides="both" onSides={() => undefined} showSides={false} />}
        <div className="mt-3"><SettingsEditor settings={ex.settings ?? {}} template={def?.settingTemplate ?? []} onChange={(s) => setEx(ex.id, (e) => ({ ...e, settings: s }))}
          onSaveDefault={eq ? () => { void store.saveEquipment({ ...eq, settings: { ...eq.settings, ...Object.fromEntries(Object.entries(ex.settings ?? {}).filter(([, v]) => v.trim())) } }); toast(L('Remembered for this machine', 'Запомнено для этого тренажёра')); } : undefined} /></div>
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">{L('The weight you enter is', 'Вводимый вес — это')}</div>
          <div className="flex flex-wrap gap-2" data-testid="load-mode">
            {MODES.map(([mode, label]) => <Toggle key={mode} on={loadMode === mode} onClick={() => chooseMode(mode)}>{label}</Toggle>)}
          </div>
        </div>
        {def && <div className="mt-3"><ExecutionCue exerciseId={def.id} /></div>}
        <label className="mt-3 block text-xs font-medium text-ink-600 dark:text-ink-300">{L('Note', 'Заметка')}
          <Input className="mt-1" value={ex.notes ?? ''} onChange={(e) => setEx(ex.id, (x) => ({ ...x, notes: e.target.value || undefined }))} placeholder={L('Optional', 'Необязательно')} />
        </label>
      </Modal>
      <Modal open={sheet === 'menu'} onClose={() => setSheet(null)} title={exName}>
        <div className="grid grid-cols-1 gap-2">
          <Button size="lg" onClick={() => setSheet('setup')}>{L('Setup and form', 'Настройка и техника')}</Button>
          <Button size="lg" onClick={() => { setSheet(null); setPickEq(true); }}>{L('Change machine', 'Сменить тренажёр')}</Button>
          <Button size="lg" onClick={toggleSides} aria-pressed={sides}>{sides ? L('Log both sides together', 'Записывать обе стороны вместе') : L('Log left / right separately', 'Записывать левую / правую отдельно')}</Button>
          <Button size="lg" onClick={() => { setSheet(null); onChange(); }}>{L('Change exercise', 'Сменить упражнение')}</Button>
          {sets.length > 0 && <Button size="lg" onClick={() => { setSheet(null); onChooseNext(); }} data-testid="finish-exercise">{progress.reached || progress.target == null ? L('Finish this exercise', 'Завершить упражнение') : L(`Finish this exercise (${progress.done} of ${progress.target} sets)`, `Завершить упражнение (${progress.done} из ${progress.target} подх.)`)}</Button>}
          {!sets.length && <Button size="lg" onClick={() => { setSheet(null); onLater(); }}>{L('Later', 'Позже')}</Button>}
          {!sets.length && <Button size="lg" variant="ghost" onClick={() => { setSheet(null); onSkip(); }}>{L('Skip this exercise', 'Пропустить упражнение')}</Button>}
        </div>
      </Modal>
      {editing && <SetSheet s={editing} n={sets.findIndex((x) => x.id === editing.id) + 1} step={step} unit={unit} onClose={() => setSheet(null)} onPatch={(p) => patchSet(editing.id, p)}
        onWarmup={() => setEx(ex.id, (e) => toggleWarmup(e, editing.id), true)} onRemove={() => removeSet(editing)} />}
      <EquipmentPicker open={pickEq} onClose={() => setPickEq(false)} locationId={w.locationId} def={def} currentId={ex.equipmentId}
        onPick={(e) => { chooseEq(e); setPickEq(false); }} onNew={() => { setPickEq(false); setNewEq(true); }} onEdit={(e) => { setPickEq(false); setEditEq(e); }} />
      {(newEq || editEq) && (
        <EquipmentForm eq={editEq} defaultLocation={w.locationId} defaultExerciseId={def?.id} defaultKind={def?.equipmentKind}
          onClose={() => { setNewEq(false); setEditEq(null); }}
          onSaved={(id) => {
            setNewEq(false); setEditEq(null);
            const saved = store.getState().data?.equipment.find((e) => e.id === id);
            // The store normally has it already; if not, the link is still made by id.
            if (saved) chooseEq(saved); else setEx(ex.id, (x) => ({ ...x, equipmentId: id, equipmentConfidence: 'confirmed' }), true);
          }} />
      )}
    </>
  );

  if (view === 'rest' && lastSet) {
    return (
      <>
        {head}
        <RestScreen w={w} ex={ex} set={lastSet} exName={exName} n={sets.length} reached={progress.reached} hasNext={hasNext}
          offer={offer} onUseOffer={useOffer} onKeepOffer={() => { if (offer) setEx(ex.id, (e) => keepOffer(e, offer), true); }}
          onMore={() => setSheet({ set: lastSet.id })} onChooseNext={onChooseNext}
          onAdjust={(d) => setEx(ex.id, (e) => adjustRest(e, d, data.settings.restDefaultSec), true)}
          onNextSet={() => { setEx(ex.id, (e) => ({ ...e, restEndedAt: new Date().toISOString() }), true); setView('set'); }} onNextExercise={onNextExercise} />
        {sheets}
      </>
    );
  }

  return (
    <>
      {head}
      <div className="flex min-h-0 flex-1 flex-col landscape:max-lg:flex-row">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-1">
          <h1 className={cx('break-words font-display font-extrabold uppercase leading-none tracking-tight [text-wrap:balance]', exName.length > 26 ? 'text-2xl' : 'text-title')} data-testid="exercise-name">{exName}</h1>
          {eqLine && <button type="button" onClick={() => setPickEq(true)} className="flex min-h-[44px] min-w-[44px] items-center text-left text-sm text-t-dim" data-testid="machine-line">{eqLine}{ex.settings && Object.values(ex.settings).some((v) => v.trim()) ? ` · ${Object.entries(ex.settings).filter(([, v]) => v.trim()).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}</button>}
          <dl className="mt-3 space-y-1.5">
            <div data-testid="last-time">
              <dt className="t-label">{L('Last time', 'В прошлый раз')}</dt>
              <dd className="t-num font-display text-xl font-bold text-t-text">{lastSets.length ? setsLine(lastSets) : <span className="text-base font-semibold text-t-dim">{L('first time here', 'здесь впервые')}</span>}</dd>
            </div>
            {target && (
              <div data-testid="today-target">
                <dt className="t-label">{L('Today', 'Сегодня')}</dt>
                <dd className="flex flex-wrap items-baseline gap-x-3">
                  <span className="t-num font-display text-xl font-bold text-t-accent">{target}</span>
                  {fill.alt && <button type="button" className="min-h-[44px] min-w-[44px] text-xs font-semibold text-t-dim underline" onClick={() => { const alt = fill.alt!.weightKg; setWeight(alt); const r = lastSets[sets.length]?.weightKg === alt ? lastSets[sets.length]?.reps : lastSets.find((x) => x.weightKg === alt)?.reps; if (r != null) setReps(r); }} data-testid="use-last">{L(`use last time's ${num(fill.alt.weightKg)} kg`, `взять прошлые ${num(fill.alt.weightKg)} кг`)}</button>}
                  <button type="button" className="min-h-[44px] min-w-[44px] text-xs font-semibold text-t-dim underline" onClick={() => setSheet('why')} data-testid="why">{L('Why', 'Почему')}</button>
                </dd>
              </div>
            )}
          </dl>
          {sets.length > 0 && <div className="mt-3">{chips}</div>}
          {lastSet && <RestPill w={w} onOpen={() => setView('rest')} />}
        </div>
        <div className="shrink-0 space-y-2 border-t border-t-line bg-t-bg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 landscape:max-lg:w-1/2 landscape:max-lg:overflow-y-auto landscape:max-lg:border-l landscape:max-lg:border-t-0" data-testid="entry">
          {sides && <div className="flex items-center gap-2"><TLabel>{L('Side', 'Сторона')}</TLabel><span className="rounded-md bg-t-surface px-2 py-1 text-xs font-bold uppercase" data-testid="side">{nextSide === 'left' ? L('Left', 'Левая') : L('Right', 'Правая')}</span></div>}
          {source && <WeightSource source={source} planKg={ex.target?.weightKg ?? null} weightKg={weight} lastKg={(lastSets[sets.length] ?? lastSets.filter((s) => s.type === 'working').at(-1))?.weightKg ?? null} />}
          <WeightControl value={weight} onChange={setWeight} step={step} onStepClick={() => setSheet('step')} unit={unit} />
          <RepsControl value={reps} onChange={setReps} />
          <div data-testid="effort-entry">
            <TLabel>{L('How did it go? (optional)', 'Как прошёл? (необязательно)')}</TLabel>
            <div className="mt-1"><EffortRow value={tap} onPick={(t) => setTap(tap === t ? null : t)} /></div>
          </div>
          <TButton variant="primary" className="landscape:max-lg:sticky landscape:max-lg:bottom-0 landscape:max-lg:z-10" onClick={log} data-testid="log-set">{L('Log set', 'Записать подход')}{sets.length ? ` ${sets.length + 1}` : ''}</TButton>
        </div>
      </div>
      {sheets}
    </>
  );
}

/** Small rest indicator on the set-entry screen; tap = back to the big timer. */
function RestPill({ w, onOpen }: { w: Workout; onOpen: () => void }) {
  const data = useData();
  const now = useNow(500);
  const r = restState(w, now, data.settings.restDefaultSec);
  if (!r || r.elapsedSec > 30 * 60) return null;
  const ex = w.exercises.find((e) => e.id === r.exerciseId);
  const setAt = Date.parse(ex?.sets.find((s) => s.id === r.setId)?.completedAt ?? '');
  const endAt = ex?.restEndedAt ? Date.parse(ex.restEndedAt) : NaN;
  // Rest ended with NEXT SET: show how long it actually was (this is what is recorded with the next set).
  if (Number.isFinite(endAt) && Number.isFinite(setAt) && endAt > setAt) {
    return (
      <button type="button" onClick={onOpen} data-testid="rest-pill" data-ended="true" className="t-num mt-3 flex min-h-[48px] items-center gap-2 rounded-xl border border-t-line px-3 font-display text-lg font-bold text-t-text">
        <span className="t-label">{L('Rested', 'Отдых был')}</span>{mmss(Math.round((endAt - setAt) / 1000))}
      </button>
    );
  }
  return (
    <button type="button" onClick={onOpen} data-testid="rest-pill" className={cx('t-num mt-3 flex min-h-[48px] items-center gap-2 rounded-xl border px-3 font-display text-lg font-bold', r.done ? 'border-t-good text-t-good' : 'border-t-line text-t-text')}>
      <span className="t-label">{L('Rest', 'Отдых')}</span>
      {mmss(r.done ? r.elapsedSec : r.remainingSec)}
    </button>
  );
}

// ---------------------------------------------------------------- rest screen

/**
 * Where the pre-filled weight came from — only what matters (owner 2026-11-24): SMART (the analysis set it: changed from
 * last time, confirmed it, or adjusted after a set) or COPIED (nothing analysed). The note says how it compares with last time.
 */
function WeightSource({ source, planKg, weightKg, lastKg }: { source: 'adjusted' | 'kept' | 'copied' | 'session'; planKg: number | null; weightKg: number | null; lastKg: number | null }) {
  const smart = source === 'adjusted' || source === 'kept';
  const diff = weightKg != null && lastKg != null ? Math.round((weightKg - lastKg) * 100) / 100 : null;
  const vs = diff == null ? '' : diff === 0 ? L(' · same as last time', ' · как в прошлый раз')
    : L(` · ${diff > 0 ? '+' : '−'}${num(Math.abs(diff))} kg vs last time`, ` · ${diff > 0 ? '+' : '−'}${num(Math.abs(diff))} кг к прошлому разу`);
  return (
    <p className={cx('flex items-center gap-1.5 text-xs font-semibold', smart ? 'text-t-accent' : 'text-t-dim')} data-testid="weight-source" data-source={smart ? 'smart' : 'copied'}>
      {smart ? <IconBrain size={16} /> : <IconCopy size={16} />}
      <span className="min-w-0 break-words">{smart ? L('Smart weight', 'Умный вес') + vs
        : source === 'session' ? (planKg != null && planKg !== weightKg ? L(`Same as your previous set — the analysis suggests ${num(planKg)} kg`, `Как в прошлом подходе — анализ предлагает ${num(planKg)} кг`) : L('Same as your previous set', 'Как в прошлом подходе'))
        : planKg != null ? L(`Copied from last time — the analysis suggests ${num(planKg)} kg`, `Скопировано с прошлого раза — анализ предлагает ${num(planKg)} кг`)
          : L('Copied from last time — not analysed', 'Скопировано с прошлого раза — без анализа')}</span>
    </p>
  );
}

function RestScreen({ w, ex, set, exName, n, reached, hasNext, onMore, onAdjust, onNextSet, onNextExercise, onChooseNext, offer, onUseOffer, onKeepOffer }: {
  w: Workout; ex: WorkoutExercise; set: WorkoutSet; exName: string; n: number; reached: boolean; hasNext: boolean;
  onMore: () => void; onAdjust: (deltaSec: number) => void; onNextSet: () => void; onNextExercise: () => void; onChooseNext: () => void;
  offer: NextSetsOffer | null; onUseOffer: (o: NextSetsOffer) => void; onKeepOffer: () => void;
}) {
  const data = useData();
  const now = useNow(250);
  // The primary button sits where LOG SET was: a double tap on LOG SET must not skip the rest screen.
  const shownAt = useRef(Date.now());
  const guarded = (fn: () => void) => () => { if (Date.now() - shownAt.current >= 700) fn(); };
  const key = `gymrat.rest.${w.id}.${set.id}`;
  type T = { pausedAt: number | null; paused: number };
  const read = (): T => { try { return { pausedAt: null, paused: 0, ...JSON.parse(sessionStorage.getItem(key) || '{}') }; } catch { return { pausedAt: null, paused: 0 }; } };
  const [t, setT] = useState<T>(read);
  useEffect(() => setT(read()), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (v: T) => { setT(v); try { sessionStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode: kept in memory */ } };
  const pausedMs = t.paused + (t.pausedAt ? now - t.pausedAt : 0);
  const r = restState(w, now, data.settings.restDefaultSec, pausedMs);
  const target = restTargetFor(ex, data.settings.restDefaultSec);
  const remaining = r && r.setId === set.id ? r.remainingSec : target;

  // At zero: vibrate once. Keep the screen awake while resting (where the browser supports it).
  const alerted = useRef(false);
  useEffect(() => {
    if (remaining <= 0 && remaining > -3 && !alerted.current) { alerted.current = true; try { navigator.vibrate?.([200, 100, 200]); } catch { /* no vibration */ } }
    if (remaining > 0) alerted.current = false;
  }, [remaining]);
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const nv = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const get = () => { nv.wakeLock?.request('screen').then((l) => { if (gone) void l.release(); else lock = l; }).catch(() => undefined); };
    get();
    const vis = () => { if (document.visibilityState === 'visible') get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { gone = true; document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => undefined); };
  }, []);

  // After zero the timer keeps going in 15-second laps until NEXT SET: the digits show the whole rest so far.
  const over = Math.max(0, -remaining);
  const text = remaining > 0 ? mmss(remaining) : mmss(target + over);
  const side = 'flex h-16 w-20 items-center justify-center rounded-xl border border-t-line bg-t-surface font-display text-2xl font-bold text-t-text active:brightness-125 max-[379px]:w-16';
  return (
    <div className="flex min-h-0 flex-1 flex-col landscape:max-lg:flex-row" data-testid="rest-screen">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        <p className="mb-1 max-w-full break-words text-center text-sm font-semibold text-t-dim [text-wrap:balance]">
          <span className="uppercase">{exName}</span> · {L(`set ${n}`, `подход ${n}`)}: <span className="t-num text-t-text">{setText(set)}</span>
          {effortTapOf(set) && <span className="text-t-text"> · {effortLabel(effortTapOf(set) as EffortTap)}</span>}
          {' '}<button type="button" className="inline-flex min-h-[44px] min-w-[48px] items-center justify-center px-2 align-middle text-xs font-semibold text-t-dim underline" onClick={onMore} data-testid="more">{L('edit', 'изменить')}</button>
        </p>
        {offer && (
          <div className="mb-2 w-full max-w-sm rounded-xl border border-t-accent/60 bg-t-surface px-3 py-2" data-testid="set-offer" data-change={offer.change}>
            <p className="flex items-start gap-1.5 text-sm font-semibold text-t-text"><IconBrain size={18} className="mt-0.5 shrink-0 text-t-accent" />
              <span className="min-w-0 break-words">{offer.change === 'add_load' || (offer.change === 'reduce' && offer.weightKg !== ex.target?.weightKg)
                ? L(`Next sets: ${num(offer.weightKg ?? 0)} kg (${offer.change === 'add_load' ? 'heavier' : 'lighter'})`, `Следующие подходы: ${num(offer.weightKg ?? 0)} кг (${offer.change === 'add_load' ? 'тяжелее' : 'легче'})`)
                : L(`Next sets: ${offer.reps?.min}–${offer.reps?.max} reps`, `Следующие подходы: ${offer.reps?.min}–${offer.reps?.max} повт.`)}</span></p>
            <p className="mt-0.5 break-words text-xs text-t-dim">{offer.why}</p>
            <div className="mt-1.5 flex gap-2">
              <button type="button" className="min-h-[44px] flex-1 rounded-lg border border-t-accent px-3 text-sm font-bold text-t-accent" onClick={() => onUseOffer(offer)} data-testid="offer-use">{L('Use', 'Принять')}</button>
              <button type="button" className="min-h-[44px] flex-1 rounded-lg border border-t-line px-3 text-sm font-semibold text-t-dim" onClick={onKeepOffer} data-testid="offer-keep">{L('Keep the plan', 'Оставить план')}</button>
            </div>
          </div>
        )}
        <RestRing remainingSec={remaining} targetSec={target} paused={!!t.pausedAt} text={text} overSec={over} />
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className={side} onClick={() => onAdjust(-REST_STEP_SEC)} aria-label={L('15 seconds less rest', 'На 15 секунд меньше отдыха')} data-testid="rest-minus">−15</button>
          <button type="button" className="flex h-12 min-w-[48px] items-center justify-center rounded-xl px-3 text-sm font-semibold text-t-dim" aria-label={t.pausedAt ? L('Resume the timer', 'Продолжить таймер') : L('Pause the timer', 'Пауза таймера')}
            onClick={() => save(t.pausedAt ? { paused: t.paused + (Date.now() - t.pausedAt), pausedAt: null } : { ...t, pausedAt: Date.now() })} data-testid="rest-pause">{t.pausedAt ? '▶' : '❚❚'}</button>
          <button type="button" className={side} onClick={() => onAdjust(REST_STEP_SEC)} aria-label={L('15 seconds more rest', 'На 15 секунд больше отдыха')} data-testid="rest-plus">+15</button>
        </div>
      </div>
      <div className="shrink-0 space-y-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 landscape:max-lg:flex landscape:max-lg:w-1/2 landscape:max-lg:flex-col landscape:max-lg:justify-center">
        {reached && hasNext ? (
          <>
            <TButton variant="secondary" className="w-full" onClick={guarded(onNextSet)} data-testid="one-more">{L('One more set', 'Ещё подход')}</TButton>
            <TButton variant="primary" onClick={guarded(onNextExercise)} data-testid="next-exercise">{L('Next exercise', 'Следующее упражнение')}</TButton>
          </>
        ) : reached ? (
          <>
            <TButton variant="secondary" className="w-full" onClick={guarded(onNextSet)} data-testid="one-more">{L('One more set', 'Ещё подход')}</TButton>
            <TButton variant="primary" onClick={guarded(onChooseNext)} data-testid="next-exercise">{L('Choose next exercise', 'Выбрать следующее')}</TButton>
          </>
        ) : (
          <>
            <TButton variant="primary" onClick={guarded(onNextSet)} data-testid="next-set">{L('Next set', 'Следующий подход')}</TButton>
            <div className="flex justify-center pt-1">
              <button type="button" className="min-h-[44px] px-3 text-center text-sm font-semibold text-t-dim underline" onClick={guarded(onChooseNext)} data-testid="stop-early">
                {L('Enough — choose next exercise', 'Хватит — выбрать следующее')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sheets

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cx('min-h-[48px] rounded-xl border px-3 text-sm font-semibold', on ? 'border-accent-500 bg-accent-500 text-ink-950' : 'border-ink-200 bg-ink-50 text-ink-800 dark:border-ink-700 dark:bg-ink-850 dark:text-ink-100')}>{children}</button>;
}

/** Edit one logged set: weight, reps, effort, flags, warm-up tag, note, remove. */
function SetSheet({ s, n, step, unit, onClose, onPatch, onWarmup, onRemove }: {
  s: WorkoutSet; n: number; step: number; unit: string; onClose: () => void; onPatch: (p: Partial<WorkoutSet>) => void; onWarmup: () => void; onRemove: () => void;
}) {
  const broke = s.technique === 'compromised' || s.technique === 'failed';
  const wrong = s.weightAccuracy === 'too_light' || s.weightAccuracy === 'too_heavy';
  const rirs = [0, 1, 2, 3, 4, 5];
  return (
    <Modal open onClose={onClose} title={L(`Set ${n}`, `Подход ${n}`)} footer={<Button variant="primary" className="w-full" onClick={onClose}>{L('Done', 'Готово')}</Button>}>
      <div className="train space-y-3 rounded-2xl p-3" data-testid="set-sheet">
        <WeightControl value={s.weightKg} onChange={(v) => onPatch({ weightKg: v })} step={step} onStepClick={() => undefined} unit={unit} />
        <RepsControl value={s.reps} onChange={(v) => onPatch({ reps: v })} />
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">{L('How was it?', 'Как прошёл?')}</div>
          <EffortRow dark={false} value={effortTapOf(s)} onPick={(t) => onPatch(effortTapPatch(s, t))} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Toggle on={broke} onClick={() => onPatch({ technique: broke ? undefined : 'compromised' })}>{L('Form broke', 'Техника нарушилась')}</Toggle>
          <Toggle on={wrong} onClick={() => onPatch({ weightAccuracy: wrong ? undefined : 'too_heavy' })}>{L('Wrong weight', 'Не тот вес')}</Toggle>
          <Toggle on={!!s.pain} onClick={() => onPatch({ pain: s.pain ? undefined : { area: '' } })}>{L('Pain', 'Боль')}</Toggle>
          {s.type !== 'drop' && <Toggle on={s.type === 'warmup'} onClick={onWarmup}>{L('Warm-up (not counted)', 'Разминочный (не в зачёт)')}</Toggle>}
        </div>
        {wrong && (
          <div className="flex flex-wrap gap-2">
            <Toggle on={s.weightAccuracy === 'too_light'} onClick={() => onPatch({ weightAccuracy: 'too_light' })}>{L('Too light by mistake', 'Случайно слишком лёгкий')}</Toggle>
            <Toggle on={s.weightAccuracy === 'too_heavy'} onClick={() => onPatch({ weightAccuracy: 'too_heavy' })}>{L('Too heavy by mistake', 'Случайно слишком тяжёлый')}</Toggle>
          </div>
        )}
        {s.pain && (
          <div className="flex flex-wrap gap-2" aria-label={L('Where?', 'Где?')}>
            {PAIN_AREAS.map((area) => <Toggle key={area} on={s.pain?.area === area} onClick={() => onPatch({ pain: { ...(s.pain ?? { area: '' }), area } })}>{painArea(area)}</Toggle>)}
          </div>
        )}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">{L('Exact reps in reserve (optional)', 'Точный запас повторов (необязательно)')}</div>
          <div className="flex flex-wrap gap-2">
            {rirs.map((r) => <Toggle key={r} on={s.rir === r} onClick={() => onPatch(s.rir === r ? { rir: null, rirSource: 'unknown' } : { rir: r, rirSource: 'reported' })}>{r === 5 ? '5+' : String(r)}</Toggle>)}
          </div>
        </div>
        <label className="block text-xs font-medium text-ink-600 dark:text-ink-300">{L('Note', 'Заметка')}
          <Input className="mt-1" value={s.notes ?? ''} onChange={(e) => onPatch({ notes: e.target.value || undefined })} placeholder={L('Optional', 'Необязательно')} />
        </label>
        <div className="pt-4">
          <button type="button" onClick={onRemove} data-testid="remove-set" className="min-h-[48px] w-full rounded-xl border border-rose-500 px-4 text-sm font-semibold text-rose-600 dark:text-rose-400">{L('Remove this set', 'Удалить этот подход')}</button>
        </div>
      </div>
    </Modal>
  );
}

const painArea = (a: string): string => L(a, ({ Shoulder: 'Плечо', Elbow: 'Локоть', Wrist: 'Запястье', Neck: 'Шея', 'Upper back': 'Верх спины', 'Lower back': 'Поясница', Hip: 'Бедро', Knee: 'Колено', Ankle: 'Голеностоп', Other: 'Другое' } as Record<string, string>)[a] ?? a);

/** Why this target: the prescription's reasons, warm-up suggestion and rest advice (text only). */
function WhySheet({ w, ex, onClose }: { w: Workout; ex: WorkoutExercise; onClose: () => void }) {
  const data = useData();
  const a = useAnalysis();
  const index = w.exercises.findIndex((e) => e.id === ex.id);
  const p = useMemo(() => safePrescribe(data, a, w, index, ex.target ? { count: ex.target.sets, reason: L('Planned for the whole session (re-checked against what you actually did).', 'Запланировано на всю тренировку (сверено с тем, что уже сделано).') } : undefined), [data, a, w, index, ex.target]);
  return (
    <Modal open onClose={onClose} title={L('Why this target', 'Почему такая цель')}>
      {!p ? <p className="text-sm text-ink-500">{L('No target could be calculated for this exercise yet.', 'Для этого упражнения пока не удалось рассчитать цель.')}</p> : (
        <div className="space-y-3 text-sm text-ink-700 dark:text-ink-200" data-testid="why-sheet">
          <p><b>{L('Load', 'Вес')}:</b> {p.decisionWhy}</p>
          <p><b>{L('Sets', 'Подходы')}:</b> {p.setCountReason}</p>
          {p.warmups.length > 0 && <p><b>{L('Warm-up suggestion', 'Разминка (совет)')}:</b> {p.warmups.map((x) => `${x.weightKg != null ? num(x.weightKg) : '—'} × ${x.reps}`).join(' → ')}. {p.warmupReason}</p>}
          <p><b>{L('Effort', 'Усилие')}:</b> {p.rirReason}</p>
          <p><b>{L('Rest', 'Отдых')}:</b> {p.rest.reason}</p>
          {p.context.bucket === 'preloaded' && <p><b>{L('Order', 'Порядок')}:</b> {L(`This comes after ${num(p.context.sets)} sets that already worked the same muscle.`, `Перед этим уже сделано ${num(p.context.sets)} подх. на ту же мышцу.`)}</p>}
          {p.notes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-ink-500">{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          <p className="text-xs text-ink-500">{p.confidenceReason}</p>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- overview

function Overview({ w, curId, exName, adjusted, update, onOpen, onBack, onAdd, onFinish, onDelete, onLater, onBusy, onFree, onReplace, onChange, onSkip, onMove, onRemove }: {
  w: Workout; curId: string | null; exName: (e: WorkoutExercise) => string; adjusted: Record<string, string>; update: (fn: (w: Workout) => Workout, opts?: { now?: boolean }) => void;
  onOpen: (exId: string) => void; onBack: (() => void) | null; onAdd: () => void; onFinish: () => void; onDelete: () => void;
  onLater: (exId: string) => void; onBusy: (exId: string) => void; onFree: (equipmentId: string) => void; onReplace: (exId: string, o: ReplacementOption, reason: PlanDecisionReason | null) => void;
  onChange: (exId: string) => void; onSkip: (exId: string) => void; onMove: (exId: string, dir: -1 | 1) => void; onRemove: (exId: string) => void;
}) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const [menu, setMenu] = useState<string | null>(null);
  const [replaceFor, setReplaceFor] = useState<string | null>(null);
  const [reason, setReason] = useState<PlanDecisionReason | null>(null);
  const [details, setDetails] = useState(false);
  const [more, setMore] = useState(false);
  const gym = data.locations.find((l) => l.id === w.locationId);
  const m = menu ? w.exercises.find((e) => e.id === menu) ?? null : null;
  const mi = m ? w.exercises.findIndex((e) => e.id === m.id) : -1;
  const rf = replaceFor ? w.exercises.find((e) => e.id === replaceFor) ?? null : null;
  const options = useMemo(() => {
    if (!rf) return [];
    const outcomes = choiceOutcomes(data, a);
    return rankOptions(replacementOptions(data, a, w, rf.exerciseId).map((o) => ({ ...optimality({ data, analysis: a, workout: w, exerciseId: o.exerciseId, equipmentId: o.equipmentId, variation: o.variation ?? null, outcomes }), opt: o })), (id) => names.ex(a.registry.get(id)));
  }, [rf, data, a, w, names]);
  const total = w.exercises.reduce((n, e) => n + done(e).filter((s) => s.type !== 'warmup').length, 0);
  const act = (fn: () => void) => () => { setMenu(null); fn(); };
  // The one primary action here: go on with the current exercise, else the first open one.
  const openEx = (e: WorkoutExercise) => !e.skipped && !e.doneAt && !exerciseProgress(e).reached;
  const nextUp = w.exercises.find((e) => e.id === curId && openEx(e)) ?? w.exercises.find(openEx) ?? null;

  return (
    <>
      <TopBar
        left={onBack ? <button type="button" className={quietBtn} onClick={onBack} aria-label={L('Back to the set', 'Назад к подходу')} data-testid="back-to-set"><IconChevron size={22} className="rotate-180" /></button> : <Link to="/" className={quietBtn} aria-label={L('Leave training mode (the workout stays open)', 'Выйти из режима тренировки (тренировка остаётся открытой)')} data-testid="leave"><IconChevron size={22} className="rotate-180" /></Link>}
        center={<><Clock w={w} /><span className="text-sm font-semibold text-t-dim">{NP(total, ['set', 'sets'], ['подход', 'подхода', 'подходов'])}</span></>}
        right={<button type="button" className={quietBtn} onClick={() => setMore(true)} aria-label={L('Workout options', 'Действия с тренировкой')} data-testid="workout-menu"><IconMore size={22} /></button>}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6" data-testid="overview">
        <h1 className="font-display text-title font-extrabold uppercase leading-none tracking-tight">{L('Workout', 'Тренировка')}</h1>
        <p className="mt-1 text-sm text-t-dim">{formatDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}{gym ? ` · ${gym.name}` : ''}</p>
        <ol className="mt-4 space-y-3">
          {w.exercises.map((e, i) => {
            const p = exerciseProgress(e);
            const isCur = e.id === curId && !e.skipped;
            const state = e.skipped ? L('skipped', 'пропущено') : p.reached || e.doneAt ? L('done', 'готово') : e.deferredAt && !p.done ? L('later', 'позже') : isCur ? L('now', 'сейчас') : '';
            const busy = !!e.equipmentId && (w.busyEquipment ?? []).some((b) => b.equipmentId === e.equipmentId);
            return (
              <li key={e.id} className="flex items-stretch gap-3" data-testid="ov-row" data-state={e.skipped ? 'skipped' : p.reached || e.doneAt ? 'done' : isCur ? 'current' : 'open'}>
                <button type="button" onClick={() => onOpen(e.id)} className={cx('flex min-h-[64px] min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 text-left', isCur ? 'border-t-accent' : 'border-t-line', e.skipped && 'opacity-50')}>
                  <span className={cx('t-num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold', p.reached || e.doneAt ? 'bg-t-good text-t-on' : isCur ? 'bg-t-accent text-t-on' : 'bg-t-surface text-t-dim')}>{p.reached || e.doneAt ? <IconCheck size={16} /> : i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-display text-lg font-bold uppercase leading-tight">{exName(e)}</span>
                    <span className="block break-words text-xs text-t-dim">{[targetLine(e), state, busy ? L('machine busy', 'тренажёр занят') : ''].filter(Boolean).join(' · ')}</span>
                    {adjusted[e.id] && !p.done && <span className="block break-words text-[11px] text-t-accent" data-testid="adjusted-note">{L('Adjusted', 'Уточнено')}: {adjusted[e.id]}</span>}
                  </span>
                  <span className="t-num shrink-0 font-display text-xl font-bold">{p.done}{p.target ? <span className="text-t-dim"> / {p.target}</span> : null}</span>
                </button>
                <button type="button" className="flex w-12 shrink-0 items-center justify-center rounded-xl border border-t-line text-t-dim" onClick={() => setMenu(e.id)} aria-label={L(`Options for ${exName(e)}`, `Действия: ${exName(e)}`)} data-testid="ov-menu"><IconMore size={20} /></button>
              </li>
            );
          })}
        </ol>
        {!w.exercises.length && <p className="mt-6 text-center text-sm text-t-dim">{L('No exercise yet. Add the first one.', 'Пока нет упражнений. Добавьте первое.')}</p>}
        <div className="mt-4"><TButton variant={nextUp ? 'secondary' : 'primary'} className="w-full !text-xl" onClick={onAdd} data-testid="add-exercise"><IconPlus size={20} />{L('Add exercise', 'Добавить упражнение')}</TButton></div>
        <button type="button" className="mt-4 min-h-[48px] text-sm font-semibold text-t-dim underline" onClick={() => setDetails(!details)} aria-expanded={details} data-testid="session-details">{L('Session details (date, gym, how you feel)', 'Детали тренировки (дата, зал, самочувствие)')}</button>
        {details && <div className="mt-2 space-y-3"><SessionMeta w={w} update={update} /><Wellness w={w} update={update} /></div>}
        {/* Finish: only here, at the very end, visually different and far from the main action. */}
        <div className="mb-12 mt-12 border-t border-t-line pt-6">
          <TButton variant="finish" onClick={onFinish} data-testid="finish">{L('Finish workout', 'Завершить тренировку')}</TButton>
        </div>
      </div>
      {nextUp && (
        <div className="shrink-0 border-t border-t-line bg-t-bg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <TButton variant="primary" className="py-2" onClick={() => onOpen(nextUp.id)} data-testid="continue">
            <span className="flex min-w-0 flex-col items-center">
              <span className="text-xs font-bold tracking-[0.12em] opacity-75">{done(nextUp).length ? L('Continue', 'Продолжить') : L('Start', 'Начать')}</span>
              <span className={cx('break-words leading-tight [text-wrap:balance]', exName(nextUp).length > 22 ? 'text-lg' : 'text-xl')}>{exName(nextUp)}</span>
            </span>
          </TButton>
        </div>
      )}

      <Modal open={!!m} onClose={() => setMenu(null)} title={m ? exName(m) : ''}>
        {m && (
          <div className="grid grid-cols-1 gap-2" data-testid="ov-actions">
            <Button size="lg" onClick={act(() => onOpen(m.id))}>{L('Open', 'Открыть')}</Button>
            {!done(m).length && !m.skipped && <Button size="lg" onClick={act(() => onLater(m.id))}>{L('Later (move to the end)', 'Позже (в конец)')}</Button>}
            {m.equipmentId && !m.skipped && ((w.busyEquipment ?? []).some((b) => b.equipmentId === m.equipmentId)
              ? <Button size="lg" onClick={act(() => onFree(m.equipmentId as string))}>{L('Machine free again', 'Тренажёр освободился')}</Button>
              : !done(m).length && <Button size="lg" onClick={act(() => { onBusy(m.id); setReason('busy'); setReplaceFor(m.id); })}>{L('Machine busy', 'Тренажёр занят')}</Button>)}
            {!done(m).length && !m.skipped && <Button size="lg" onClick={act(() => { setReason(null); setReplaceFor(m.id); })}>{L('Replace', 'Заменить')}</Button>}
            <Button size="lg" onClick={act(() => onChange(m.id))}>{L('Change exercise (wrong one picked)', 'Сменить упражнение (выбрано не то)')}</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button size="lg" disabled={mi <= 0} onClick={() => onMove(m.id, -1)} aria-label={L('Move up', 'Выше')}>↑ {L('Up', 'Выше')}</Button>
              <Button size="lg" disabled={mi >= w.exercises.length - 1} onClick={() => onMove(m.id, 1)} aria-label={L('Move down', 'Ниже')}>↓ {L('Down', 'Ниже')}</Button>
            </div>
            <Button size="lg" variant="ghost" onClick={act(() => onSkip(m.id))}>{m.skipped ? L('Not skipped after all', 'Вернуть (не пропускать)') : L('Skip', 'Пропустить')}</Button>
            <div className="pt-4"><button type="button" className="min-h-[48px] w-full rounded-xl border border-rose-500 px-4 text-sm font-semibold text-rose-600 dark:text-rose-400" onClick={act(() => onRemove(m.id))} data-testid="remove-exercise">{L('Remove from this workout', 'Удалить из тренировки')}</button></div>
          </div>
        )}
      </Modal>
      <Modal open={!!rf} onClose={() => setReplaceFor(null)} title={rf ? L(`Replace ${exName(rf)}`, `Заменить: ${exName(rf)}`) : ''}>
        <div className="space-y-2" data-testid="replace-sheet">
          <div className="flex flex-wrap gap-2" aria-label={L('Reason (optional)', 'Причина (необязательно)')}>
            {REASONS.map(([r, label]) => <Toggle key={r} on={reason === r} onClick={() => setReason(reason === r ? null : r)}>{label()}</Toggle>)}
          </div>
          {options.length === 0 && <p className="text-sm text-ink-500">{L('No familiar alternative is available here — add any exercise with “Add exercise”.', 'Знакомой замены здесь нет — добавьте любое упражнение через «Добавить упражнение».')}</p>}
          {rf && options.map(({ opt: o, ...sc }) => (
            <ScoredRow key={`${o.exerciseId}|${o.equipmentId ?? ''}`} o={sc}>
              <button type="button" onClick={() => { const id = rf.id; setReplaceFor(null); onReplace(id, o, reason); }} className="flex min-h-[56px] w-full flex-col items-start justify-center rounded-xl border border-ink-200 px-3 py-2 text-left dark:border-ink-700">
                <span className="break-words text-sm font-semibold text-ink-900 dark:text-white">{names.ex(a.registry.get(o.exerciseId))}{o.equipmentId ? <span className="font-normal text-ink-500"> · {data.equipment.find((e) => e.id === o.equipmentId)?.name}</span> : null}</span>
                <span className="break-words text-xs text-ink-500">{o.why}</span>
              </button>
            </ScoredRow>
          ))}
          {rf && <Button className="w-full" onClick={() => { const id = rf.id; setReplaceFor(null); onLater(id); }}>{L('Do it later instead', 'Лучше сделать позже')}</Button>}
        </div>
      </Modal>
      <Modal open={more} onClose={() => setMore(false)} title={L('Workout', 'Тренировка')}>
        <div className="grid grid-cols-1 gap-2">
          <Link to="/" className="flex min-h-[48px] items-center justify-center rounded-xl bg-ink-100 px-4 text-base font-medium text-ink-800 dark:bg-ink-800 dark:text-ink-100" data-testid="leave-link">{L('Leave training mode (the workout stays open)', 'Выйти из режима тренировки (тренировка остаётся открытой)')}</Link>
          <p className="text-xs text-ink-500">{L(`Rest timer: ${mmss(data.settings.restDefaultSec ?? REST_DEFAULT_SEC)} after every set — change it in Settings, or with −15 / +15 while resting.`, `Таймер отдыха: ${mmss(data.settings.restDefaultSec ?? REST_DEFAULT_SEC)} после каждого подхода — меняется в настройках или кнопками −15 / +15 во время отдыха.`)}</p>
          <div className="pt-6"><button type="button" className="min-h-[48px] w-full rounded-xl border border-rose-500 px-4 text-sm font-semibold text-rose-600 dark:text-rose-400" onClick={() => { setMore(false); onDelete(); }} data-testid="delete-workout">{L('Delete this workout', 'Удалить эту тренировку')}</button></div>
        </div>
      </Modal>
    </>
  );
}

