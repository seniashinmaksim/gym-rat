import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, localNowParts } from '../../domain/dates';
import { addMoves, bestMoveDay, forwardChecks, movePartners } from '../../domain/sequence';
import type { MuscleId } from '../../domain/types';
import { ForwardWarning } from './ForwardWarning';
import { ScoredRow } from './Optimality';
import { optimality, rankOptions } from '../../domain/optimality';
import { choiceOutcomes } from '../../domain/exerciseChoice';
import { generateWorkout, replacementOptions, workoutFromPlan, type GeneratedWorkout, type ItemEdit, type PlanItem } from '../../domain/planner';
import { stepLoad, variationParts } from '../../domain/progression';
import { MODE_LABEL, readinessReport } from '../../domain/readiness';
import type { PlanDecision, PlanDecisionReason, Variation } from '../../domain/types';
import { uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { activeWorkout } from '../Layout';
import { useAnalysis, useDraftSync, useNames } from '../hooks';
import { Badge, Button, Card, cx, fmt, Select, toast, undoToast, Why } from './ui';
import { byLang, KG, L, ruPlural } from '../../i18n';

interface PlanDraft {
  date: string; loc: string | null; exclude: string[]; force: { exerciseId: string; equipmentId: string | null; variation?: Variation }[];
  skipped: string[]; edits: Record<string, ItemEdit>; decisions: PlanDecision[]; replaced: { from: string; to: string }[];
}
const REASONS: [PlanDecisionReason, string][] = byLang(() => [['busy', L('Machine busy', 'Тренажёр занят')], ['time', L('No time', 'Нет времени')], ['preference', L('Prefer another', 'Хочу другое')], ['pain', L('Pain', 'Боль')]]);
const restText = (r: [number, number]) => { const f = (x: number) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`; return r[0] === r[1] ? f(r[0]) : `${f(r[0])}–${f(r[1])}`; };

/**
 * "YOUR NEXT WORKOUT" — the planner's proposal (Part 5). Mode badge LEARNING / PROVISIONAL / ADAPTIVE.
 * Learning mode shows one line (suggestions on tap). Each item: exercise · machine · warm-ups ·
 * sets × kg × reps · RIR · rest, with provisional / calibrate marks; tap for Replace / Skip / Edit.
 * Start creates a live workout; the plan snapshot is stored separately from what is performed.
 */
const NO_OPTIONS: ReturnType<typeof replacementOptions> = [];

export function NextWorkoutCard() {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const nav = useNavigate();
  const readiness = useMemo(() => readinessReport(data, a), [data, a]);
  const lastLoc = [...data.workouts].sort((x, y) => y.date.localeCompare(x.date)).find((w) => w.locationId)?.locationId ?? data.locations[0]?.id ?? null;
  // Plan edits made before Start are kept for today as an encrypted draft (leaving the screen, reload, lock).
  const today = localNowParts(data.settings.timezone).date;
  const saved = useMemo(() => { const d = store.getDraft<PlanDraft>('plan'); return d && d.date === today ? d : null; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [loc, setLoc] = useState<string | null>(saved?.loc ?? lastLoc);
  const [exclude, setExclude] = useState<string[]>(saved?.exclude ?? []);
  const [force, setForce] = useState<{ exerciseId: string; equipmentId: string | null; variation?: Variation }[]>(saved?.force ?? []);
  const [skipped, setSkipped] = useState<string[]>(saved?.skipped ?? []);
  const [edits, setEdits] = useState<Record<string, ItemEdit>>(saved?.edits ?? {});
  const [decisions, setDecisions] = useState<PlanDecision[]>(saved?.decisions ?? []);
  const [replaced, setReplaced] = useState<{ from: string; to: string }[]>(saved?.replaced ?? []);
  const touched = skipped.length + replaced.length + Object.keys(edits).length > 0 || loc !== lastLoc;
  const clearPlanDraft = useDraftSync<PlanDraft>('plan', { date: today, loc, exclude, force, skipped, edits, decisions, replaced }, touched);
  const reset = () => { setExclude([]); setForce([]); setSkipped([]); setEdits({}); setDecisions([]); setReplaced([]); clearPlanDraft(); };
  const [showLearning, setShowLearning] = useState(false);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [reason, setReason] = useState<PlanDecisionReason | null>(null);
  const [busy, setBusy] = useState(false);

  const gen: GeneratedWorkout = useMemo(() => generateWorkout({ data, analysis: a, now: new Date(), locationId: loc, readiness, exclude, force }), [data, a, loc, readiness, exclude, force]);
  const items = gen.items.filter((it) => !skipped.includes(it.exerciseId));
  // Part 8: what each planned exercise would do to the next usual sessions (cumulative over the plan, in order).
  const fwd = useMemo(() => {
    const acc: Partial<Record<MuscleId, number>> = {};
    return items.map((it) => {
      const before = { ...acc };
      const f = forwardChecks({ data, analysis: a, workout: null, exerciseId: it.exerciseId, sets: it.setCount, variation: it.variation, extraDone: { ...acc } });
      for (const [m, v] of Object.entries(it.contributes) as [MuscleId, number][]) acc[m] = (acc[m] ?? 0) + v;
      return { before, f, move: f.length ? bestMoveDay({ data, analysis: a, workout: null, exerciseId: it.exerciseId, sets: it.setCount, variation: it.variation, extraDone: { ...acc } }) : null };
    });
  }, [items, data, a]);
  /** Move a planned exercise to the proposed day: kept as a planned move (never skipped), with Undo. */
  const moveItem = async (it: PlanItem, w: { f: { text: string }[]; move: { date: string } | null }) => {
    if (!w.move) return;
    const before = data.settings.plannedMoves ?? [];
    const date = w.move.date;
    // Part 8 #10: the exercises usually done with it move too, unless moving them would create a conflict of their own.
    const partners = movePartners(data, a, it.exerciseId, items.map((x) => x.exerciseId), date).map((id) => items.find((x) => x.exerciseId === id)!).filter(Boolean);
    const group = [it, ...partners];
    const reason = w.f.map((x) => x.text).join(' ');
    const moves = group.map((g) => ({ id: uid(), exerciseId: g.exerciseId, equipmentId: g.equipmentId, ...(g.variation ? { variation: g.variation } : {}), sets: g.setCount, fromDate: a.today, date, reason, createdAt: new Date().toISOString() }));
    const ids = group.map((g) => g.exerciseId);
    await store.saveSettings({ plannedMoves: addMoves(before, moves) });
    setExclude((x) => [...x, ...ids]);
    const label = group.map((g) => names.ex(a.registry.get(g.exerciseId))).join(' + ');
    const day = formatDate(date, { weekday: 'short', day: 'numeric' });
    undoToast(L(`${label} moved to ${day}`, `${label}: перенесено на ${day}`), async () => {
      await store.saveSettings({ plannedMoves: before });
      setExclude((x) => x.filter((y) => !ids.includes(y)));
    });
  };
  if (activeWorkout(data.workouts)) return null;

  const mode = readiness.mode;
  const learning = mode === 'learning';
  const tone = mode === 'full' ? 'good' : mode === 'provisional' ? 'info' : 'warn';
  const decide = (d: Omit<PlanDecision, 'at'>) => setDecisions((xs) => [...xs, { ...d, at: new Date().toISOString() }]);

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const now = localNowParts(data.settings.timezone);
      const plan = { ...gen, items: items.map((it, i) => ({ ...it, order: i })) };
      const byOrder: Record<number, ItemEdit> = {};
      plan.items.forEach((it) => { if (edits[it.exerciseId]) byOrder[it.order] = edits[it.exerciseId]; });
      const ds = [...decisions, ...Object.keys(edits).filter((id) => plan.items.some((it) => it.exerciseId === id)).map((id): PlanDecision => ({ action: 'edited', exerciseId: id, at: new Date().toISOString() }))];
      const w = workoutFromPlan(plan, { id: uid('w'), date: now.date, startTime: now.time, nowIso: new Date().toISOString(), uid: () => uid('s') }, byOrder, ds);
      await store.saveWorkout(w);
      clearPlanDraft();
      if (!data.settings.learning.startDate) await store.saveSettings({ learning: { ...data.settings.learning, startDate: now.date } });
      nav(`/log/${w.id}`);
    } catch {
      toast(L('Could not start the workout', 'Не удалось начать тренировку'), 'bad');
      setBusy(false);
    }
  };

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 dark:border-ink-800 sm:px-5">
      <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">{L('Your next workout', 'Следующая тренировка')}</h2>
      <Badge tone={tone}>{MODE_LABEL[mode]}</Badge>
    </div>
  );

  if (learning && !showLearning) {
    return (
      <Card padded={false}>
        {header}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5" data-testid="next-workout-learning">
          <span className="min-w-0 text-sm text-ink-700 dark:text-ink-200">{L('Learning', 'Знакомство')}: {readiness.next[0] ?? L(`${readiness.wellDocumented} well-documented workouts`, `${readiness.wellDocumented} ${ruPlural(readiness.wellDocumented, 'хорошо записанная тренировка', 'хорошо записанные тренировки', 'хорошо записанных тренировок')}`)}</span>
          <Button size="sm" variant="ghost" onClick={() => setShowLearning(true)}>{L('Suggestions', 'Предложения')}</Button>
        </div>
      </Card>
    );
  }


  return (
    <Card padded={false}>
      {header}
      <div className="space-y-2 px-4 pt-3 sm:px-5">
        {learning && <p className="text-xs text-amber-700 dark:text-amber-300">{L(`PROVISIONAL suggestions — still learning (${readiness.next.join(' · ')}).`, `ПРЕДВАРИТЕЛЬНЫЕ предложения — приложение ещё знакомится с вашими тренировками (${readiness.next.join(' · ')}).`)}</p>}
        {mode === 'provisional' && readiness.next.length > 0 && <p className="text-xs text-ink-500">{L('Full adaptive after', 'Полный адаптивный режим после')}: {readiness.next.join(' · ')}</p>}
        {data.locations.length > 1 && (
          <Select aria-label={L('Gym', 'Зал')} value={loc ?? ''} onChange={(e) => { setLoc(e.target.value || null); setExclude([]); setForce([]); setSkipped([]); setEdits({}); setReplaced([]); }}>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </Select>
        )}
        {gen.returning && <p className="text-xs text-amber-700 dark:text-amber-300">{gen.notes.find((n) => /^(Returning|Возвра)/.test(n))}</p>}
      </div>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink-600 dark:text-ink-300 sm:px-5">{gen.notes.find((n) => /^(Nothing|Ничего|Сегодня нич)/.test(n)) ?? L('Nothing planned — every muscle is done or recovering.', 'Ничего не запланировано — по всем мышцам цель выполнена или идёт восстановление.')}</p>
      ) : (
        <ol className="mt-2 divide-y divide-ink-100 dark:divide-ink-800/70" data-testid="next-workout-list">
          {items.map((it, i) => (
            <ItemRow key={it.exerciseId} footer={fwd[i]?.f.length ? (
              <div className="px-4 pb-3 sm:px-5"><ForwardWarning findings={fwd[i].f} moveDate={fwd[i].move?.date ?? null} clean={fwd[i].move?.clean ?? false} onMove={() => void moveItem(it, fwd[i])} /></div>
            ) : null} n={i + 1} it={it} edit={edits[it.exerciseId]} open={openItem === it.exerciseId}
              onToggle={() => { setOpenItem(openItem === it.exerciseId ? null : it.exerciseId); setReplacing(null); }}
              name={names.ex(a.registry.get(it.exerciseId))} eqName={it.equipmentId ? data.equipment.find((e) => e.id === it.equipmentId)?.name ?? null : null}
              onSkip={() => { setSkipped((s) => [...s, it.exerciseId]); decide({ action: 'skipped', exerciseId: it.exerciseId, equipmentId: it.equipmentId, reason }); setOpenItem(null); setReason(null); }}
              onEdit={(e) => setEdits((x) => ({ ...x, [it.exerciseId]: { ...x[it.exerciseId], ...e } }))}
              replacing={replacing === it.exerciseId}
              onReplace={() => setReplacing(replacing === it.exerciseId ? null : it.exerciseId)}
              reason={reason} setReason={setReason}
              options={replacing === it.exerciseId ? replacementOptions(data, a, null, it.exerciseId, [], loc) : NO_OPTIONS}
              planCtx={{ sets: it.setCount, extraDone: fwd[i]?.before ?? {}, locationId: loc }}
              exName={(id) => names.ex(a.registry.get(id))}
              onPickReplacement={(o) => {
                decide({ action: 'replaced', exerciseId: it.exerciseId, equipmentId: it.equipmentId, replacement: { exerciseId: o.exerciseId, equipmentId: o.equipmentId }, reason });
                setReplaced((r) => [...r, { from: it.exerciseId, to: o.exerciseId }]);
                setExclude((x) => [...x, it.exerciseId]);
                setForce((f) => [...f, { exerciseId: o.exerciseId, equipmentId: o.equipmentId, variation: o.variation }]);
                setReplacing(null); setOpenItem(null); setReason(null);
              }} />
          ))}
        </ol>
      )}
      <div className="space-y-2 px-4 pb-4 pt-2 sm:px-5">
        {(skipped.length > 0 || replaced.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="plan-changes">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Changed', 'Изменено')}</span>
            {skipped.map((id) => (
              <button key={`s-${id}`} type="button" aria-label={L(`Bring back ${names.ex(a.registry.get(id))}`, `Вернуть: ${names.ex(a.registry.get(id))}`)} className="h-11 rounded-full bg-ink-100 px-3.5 text-xs font-medium text-ink-700 active:scale-95 dark:bg-ink-800 dark:text-ink-200"
                onClick={() => { setSkipped((s) => s.filter((x) => x !== id)); setDecisions((ds) => ds.filter((d) => !(d.action === 'skipped' && d.exerciseId === id))); }}>↺ {names.ex(a.registry.get(id))} <span className="text-ink-400">{L('skipped', 'пропущено')}</span></button>
            ))}
            {replaced.map((r) => (
              <button key={`r-${r.from}`} type="button" aria-label={L(`Undo replacing ${names.ex(a.registry.get(r.from))}`, `Отменить замену: ${names.ex(a.registry.get(r.from))}`)} className="h-11 rounded-full bg-ink-100 px-3.5 text-xs font-medium text-ink-700 active:scale-95 dark:bg-ink-800 dark:text-ink-200"
                onClick={() => {
                  setExclude((x) => x.filter((y) => y !== r.from)); setForce((f) => f.filter((y) => y.exerciseId !== r.to)); setReplaced((xs) => xs.filter((y) => y !== r));
                  setDecisions((ds) => ds.filter((d) => !(d.action === 'replaced' && d.exerciseId === r.from)));
                }}>↺ {names.ex(a.registry.get(r.from))} <span className="text-ink-400">→ {names.ex(a.registry.get(r.to))}</span></button>
            ))}
            <button type="button" className="h-11 px-2 text-xs font-medium text-ink-500 underline decoration-dotted underline-offset-2" onClick={reset}>{L('Reset plan', 'Сбросить план')}</button>
          </div>
        )}
        {gen.skippedMuscles.length > 0 && <p className="text-xs text-ink-500">{L('Not today', 'Не сегодня')}: {gen.skippedMuscles.slice(0, 5).map((s) => `${names.muscle(s.muscle).toLowerCase()} (${s.reason})`).join(' · ')}</p>}
        {items.length > 0 && <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={start}>{L('Start', 'Начать')}</Button>}
        <Why label={L('How this was planned', 'Как составлен план')}>
          <p>{L("Sets cover today's open share per muscle (capped, never catch-up), counting indirect work, from exercises you already do at this gym; heavy lifts first. Loads come only from that machine's own history.", 'Подходы закрывают оставшуюся долю на сегодня по каждой мышце (с ограничением, без навёрстывания) с учётом косвенной работы — упражнениями, которые вы уже делаете в этом зале; тяжёлые упражнения идут первыми. Веса берутся только из истории этого же тренажёра.')}</p>
          {gen.notes.map((n, i) => <p key={i}>{n}</p>)}
          <p>{L(`Mode ${MODE_LABEL[mode]}: ${readiness.wellDocumented} well-documented workouts over ${readiness.spanDays} days; ${readiness.calibratedFrequent} regular exercises calibrated; ${Math.round(readiness.coverage * 100)} % of major-muscle targets covered.`, `Режим ${MODE_LABEL[mode]}: хорошо записанных тренировок — ${readiness.wellDocumented} за ${readiness.spanDays} ${ruPlural(readiness.spanDays, 'день', 'дня', 'дней')}; откалибровано регулярных упражнений — ${readiness.calibratedFrequent}; покрыто ${Math.round(readiness.coverage * 100)} % целей по крупным мышцам.`)}</p>
        </Why>
      </div>
    </Card>
  );
}

function ItemRow({ footer, n, it, edit, open, onToggle, name, eqName, onSkip, onEdit, replacing, onReplace, options, exName, onPickReplacement, reason, setReason, planCtx }: {
  n: number; it: PlanItem; edit?: ItemEdit; open: boolean; onToggle: () => void; name: string; eqName: string | null;
  onSkip: () => void; onEdit: (e: ItemEdit) => void; replacing: boolean; onReplace: () => void;
  options: ReturnType<typeof replacementOptions>; exName: (id: string) => string; onPickReplacement: (o: ReturnType<typeof replacementOptions>[number]) => void;
  /** Part 9: the plan slot's context (sets, what the earlier plan items give each muscle, the gym). */
  planCtx: { sets: number; extraDone: Partial<Record<MuscleId, number>>; locationId: string | null };
  reason: PlanDecisionReason | null; setReason: (r: PlanDecisionReason | null) => void;
  /** Part 8: the short forward warning, inside the row (one list item per exercise). */
  footer?: ReactNode;
}) {
  const data = useData();
  const a = useAnalysis();
  // Part 9: the replacement options with their fit score for the planned session (no live workout yet), high → low.
  // Scored in the plan slot: same sets, the earlier items' contributions, the chosen gym (review 2026-11-24).
  const ranked = useMemo(() => {
    if (!options.length) return [];
    const outcomes = choiceOutcomes(data, a);
    return rankOptions(options.map((o) => ({ ...optimality({ data, analysis: a, workout: null, exerciseId: o.exerciseId, equipmentId: o.equipmentId, variation: o.variation ?? null, outcomes, sets: planCtx.sets, extraDone: planCtx.extraDone, locationId: planCtx.locationId }), opt: o })), exName);
  }, [options, data, a]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = it.prescription;
  const sets = edit?.sets ?? it.setCount;
  const kg = edit?.weightKg !== undefined ? edit.weightKg : p.workingWeightKg;
  const reps = p.sets[0] ? (p.sets[0].repsMin === p.sets[0].repsMax ? `${p.sets[0].repsMin}` : `${p.sets[0].repsMin}–${p.sets[0].repsMax}`) : '—';
  const mark = it.calibration === 'needs_data' ? <Badge tone="warn">{L('calibrate', 'калибровка')}</Badge> : it.calibration === 'provisional' ? <Badge tone="info">{L('provisional', 'предварит.')}</Badge> : null;
  const step = p.step || 2.5;
  const variant = variationParts(it.variation, a.registry.get(it.exerciseId)).map((x) => x.label).join(' · ') || null;
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[56px] w-full items-start gap-3 px-4 py-2.5 text-left sm:px-5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-xs font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">{n}</span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 text-sm font-semibold text-ink-900 dark:text-white break-words">{name}</span>
            {mark}
            {it.safety && <Badge tone="bad">{L('pain', 'боль')}</Badge>}
          </span>
          {(eqName || variant) && <span className="min-w-0 block text-xs text-ink-500 break-words">{[eqName, variant].filter(Boolean).join(' · ')}</span>}
          <span className="block text-xs tabular-nums text-ink-700 dark:text-ink-200">
            {p.warmups.length > 0 && <span className="text-ink-500">{L(`${p.warmups.length} warm-up${p.warmups.length === 1 ? '' : 's'}`, `${p.warmups.length} разм.`)} · </span>}
            <b className="font-semibold">{sets} × {kg == null ? (p.loadMode === 'bodyweight_plus' ? L('BW', 'свой вес') : `? ${KG()}`) : `${fmt(kg, 2)} ${KG()}`} × {reps}</b>
            {' · '}RIR {p.rirTarget[0]}–{p.rirTarget[1]} · {L('rest', 'отдых')} {restText(p.rest.range)}
          </span>
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-3 sm:px-5">
          <ul className="space-y-0.5 text-xs text-ink-600 dark:text-ink-300">{it.why.map((t, i) => <li key={i}>{t}</li>)}</ul>
          {it.safety && <p className="rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300">{it.safety}</p>}
          <div className="flex flex-wrap items-center gap-2" aria-label={L('Edit', 'Изменить')}>
            <span className="text-xs text-ink-500">{L('Sets', 'Подходы')}</span>
            <Button size="sm" aria-label={L('One set fewer', 'На подход меньше')} onClick={() => onEdit({ sets: Math.max(1, sets - 1) })}>−</Button>
            <span className="w-6 text-center text-sm tabular-nums">{sets}</span>
            <Button size="sm" aria-label={L('One set more', 'На подход больше')} onClick={() => onEdit({ sets: Math.min(8, sets + 1) })}>+</Button>
            {kg != null && p.loadMode !== 'assisted' && (
              <>
                <span className="ml-2 text-xs text-ink-500">{KG()}</span>
                <Button size="sm" aria-label={L('Lighter', 'Легче')} onClick={() => onEdit({ weightKg: stepLoad(kg, -step, step) })}>−</Button>
                <span className="w-12 text-center text-sm tabular-nums">{fmt(kg, 2)}</span>
                <Button size="sm" aria-label={L('Heavier', 'Тяжелее')} onClick={() => onEdit({ weightKg: stepLoad(kg, step, step) })}>+</Button>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" aria-label={L('Reason (optional)', 'Причина (необязательно)')}>
            {REASONS.map(([r, label]) => (
              <button key={r} type="button" aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)}
                className={cx('h-9 rounded-full px-3 text-xs font-medium', reason === r ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{label}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="md" className="flex-1" onClick={onReplace}>{L('Replace', 'Заменить')}</Button>
            <Button size="md" variant="ghost" className="flex-1" onClick={onSkip}>{L('Skip', 'Пропустить')}</Button>
          </div>
          {replacing && (
            <div className="space-y-1.5" data-testid="replace-options">
              {options.length === 0 && <p className="text-xs text-ink-500">{L('No familiar alternative here for this muscle.', 'В этом зале нет знакомой замены для этой мышцы.')}</p>}
              {ranked.map(({ opt: o, ...sc }) => (
                <ScoredRow key={`${o.exerciseId}|${o.equipmentId ?? ''}`} o={sc}>
                  <button type="button" onClick={() => onPickReplacement(o)} className="flex min-h-[48px] w-full flex-col items-start justify-center rounded-xl border border-ink-200 px-3 py-2 text-left dark:border-ink-700">
                    <span className="break-words text-sm font-medium text-ink-900 dark:text-white">{exName(o.exerciseId)}</span>
                    <span className="break-words text-xs text-ink-500">{o.why}</span>
                  </button>
                </ScoredRow>
              ))}
            </div>
          )}
        </div>
      )}
      {footer}
    </li>
  );
}

