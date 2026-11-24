import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, dayOfWeek, formatDate, formatDuration } from '../../domain/dates';
import { workoutToExport, IMPORT_SCHEMA_ID, IMPORT_SCHEMA_VERSION } from '../../domain/importer';
import { humanize } from '../../domain/progression';
import { FEEL_BY_ID, painAreaLabel } from '../../domain/feedback';
import { assessSet, countedSetCount, sideFactors, type EffortTier } from '../../domain/quality';
import type { Confidence, MuscleId, Rom, Workout, WorkoutSource } from '../../domain/types';
import { sessionMuscleEffective } from '../../domain/volume';
import { store, useData } from '../../lib/store';
import { IconChevron, IconChevronDown, IconCopy, IconEdit, IconMapPin, IconTimer, IconTrash } from '../components/icons';
import { Badge, Button, Card, Empty, Page, Segmented, confirmAction, cx, fmt, toast, undoToast } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';
import { L, NP, byLang, locale, num, ruPlural } from '../../i18n';

const DOW_LABELS: string[] = byLang(() => [L('Sun', 'Вс'), L('Mon', 'Пн'), L('Tue', 'Вт'), L('Wed', 'Ср'), L('Thu', 'Чт'), L('Fri', 'Пт'), L('Sat', 'Сб')]);

// Stored codes → labels (the stored value itself is never translated).
const confLabel = (c: Confidence): string => L(c, { confirmed: 'подтверждено', probable: 'вероятно', uncertain: 'под вопросом', unknown: 'неизвестно' }[c] ?? c);
const sourceLabel = (s: WorkoutSource): string => L(s.replace('_', ' '), { manual: 'вручную', live: 'запись в зале', claude_import: 'импорт из Claude', json_import: 'импорт JSON', quick_text: 'быстрый текст' }[s] ?? s);
const romLabel = (r: Rom): string => L(r.replace('_', ' '), { full: 'полная амплитуда', partial: 'частичная амплитуда', lengthened_partial: 'частичная в растяжении' }[r] ?? r);
const GRIP_RU: Record<string, string> = { pronated: 'прямой', supinated: 'обратный', neutral: 'нейтральный', mixed: 'разнохват' };
const WIDTH_RU: Record<string, string> = { narrow: 'узкий', shoulder: 'на ширине плеч', wide: 'широкий' };

const TIER_TONE: Record<EffortTier, 'neutral' | 'good' | 'info' | 'warn' | 'bad' | 'violet'> = {
  warmup: 'neutral',
  high_effort: 'good',
  working: 'info',
  low_effort: 'warn',
  unknown: 'neutral',
};
const TIER_LABEL: Record<EffortTier, string> = byLang(() => ({
  warmup: L('Warm-up', 'Разминка'),
  high_effort: L('High effort', 'Выс. усилие'),
  working: L('Working', 'Рабочий'),
  low_effort: L('Low effort', 'Низк. усилие'),
  unknown: L('Effort ?', 'Усилие ?'),
}));

function durationOf(w: Workout): number | null {
  if (w.durationMin != null) return w.durationMin;
  if (!w.startTime || !w.endTime) return null;
  const [sh, sm] = w.startTime.split(':').map(Number);
  const [eh, em] = w.endTime.split(':').map(Number);
  let d = eh * 60 + em - (sh * 60 + sm);
  if (d < 0) d += 1440;
  return d;
}

export function HistoryPage() {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const [month, setMonth] = useState(() => a.today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [view, setView] = useState<'all' | 'month'>('all');

  const byDate = useMemo(() => {
    const m = new Map<string, Workout[]>();
    for (const w of data.workouts) {
      const arr = m.get(w.date) ?? [];
      arr.push(w);
      m.set(w.date, arr);
    }
    return m;
  }, [data.workouts]);

  const locName = useMemo(() => new Map(data.locations.map((l) => [l.id, l.name])), [data.locations]);

  const list = useMemo(() => {
    let ws = [...data.workouts].sort((x, y) => (y.date + (y.startTime ?? '')).localeCompare(x.date + (x.startTime ?? '')));
    if (selectedDay) ws = ws.filter((w) => w.date === selectedDay);
    else if (view === 'month') ws = ws.filter((w) => w.date.startsWith(month));
    return ws;
  }, [data.workouts, selectedDay, view, month]);

  const monthSessions = data.workouts.filter((w) => w.date.startsWith(month)).length;

  return (
    <Page
      title={L('Workout history', 'История тренировок')}
      subtitle={L(`${data.workouts.length} sessions recorded · ${monthSessions} in ${monthLabel(month)}`, `Записано тренировок: ${data.workouts.length} · ${monthLabel(month)}: ${monthSessions}`)}
      actions={<Button variant="primary" onClick={() => (window.location.hash = '#/log')}>{L('Log workout', 'Записать тренировку')}</Button>}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <Calendar
              month={month}
              setMonth={(m) => { setMonth(m); setSelectedDay(null); }}
              weekStartsOn={data.settings.weekStartsOn}
              today={a.today}
              byDate={byDate}
              selected={selectedDay}
              onSelect={(d) => setSelectedDay(d === selectedDay ? null : d)}
            />
          </Card>
          <MonthSummary month={month} workouts={data.workouts} />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {selectedDay ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-ink-900 dark:text-white">{formatDate(selectedDay, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                <button className="text-xs text-accent-600 hover:underline dark:text-accent-400" onClick={() => setSelectedDay(null)}>{L('Show all', 'Показать все')}</button>
              </div>
            ) : (
              <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'all', label: L('All sessions', 'Все тренировки') }, { value: 'month', label: monthLabel(month) }]} />
            )}
            <span className="text-xs text-ink-500">{NP(list.length, ['session', 'sessions'], ['тренировка', 'тренировки', 'тренировок'])}</span>
          </div>
          {list.length === 0 ? (
            <Empty title={selectedDay ? L('No session on this day', 'В этот день тренировки не было') : L('No workouts yet', 'Тренировок пока нет')}>
              {selectedDay ? L('Pick a day with a dot, or clear the selection.', 'Выберите день с точкой или сбросьте выбор.') : L('Log a workout or import one from Claude to start building your history.', 'Запишите тренировку или импортируйте её из Claude — так начнётся ваша история.')}
            </Empty>
          ) : (
            list.map((w) => <SessionCard key={w.id} w={w} gym={w.locationId ? locName.get(w.locationId) ?? L('Unknown gym', 'Неизвестный зал') : L('Gym not set', 'Зал не указан')} names={names} />)
          )}
        </div>
      </div>
    </Page>
  );
}

function monthLabel(m: string) {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shiftMonth(m: string, d: number) {
  const [y, mo] = m.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1 + d, 1));
  return dt.toISOString().slice(0, 7);
}

function Calendar({ month, setMonth, weekStartsOn, today, byDate, selected, onSelect }: {
  month: string;
  setMonth: (m: string) => void;
  weekStartsOn: number;
  today: string;
  byDate: Map<string, Workout[]>;
  selected: string | null;
  onSelect: (d: string) => void;
}) {
  const first = `${month}-01`;
  const offset = (dayOfWeek(first) - weekStartsOn + 7) % 7;
  const start = addDays(first, -offset);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = cells.slice(35).every((d) => !d.startsWith(month)) ? cells.slice(0, 35) : cells;
  const labels = Array.from({ length: 7 }, (_, i) => DOW_LABELS[(weekStartsOn + i) % 7]);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 active:bg-ink-200 dark:hover:bg-ink-800" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={L('Previous month', 'Предыдущий месяц')}>
          <IconChevron size={18} className="rotate-180" />
        </button>
        <div className="text-sm font-semibold text-ink-900 dark:text-white">{monthLabel(month)}</div>
        <button className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 active:bg-ink-200 dark:hover:bg-ink-800" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={L('Next month', 'Следующий месяц')}>
          <IconChevron size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide text-ink-400">
        {labels.map((l) => <div key={l} className="py-1">{l}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {rows.map((d) => {
          const inMonth = d.startsWith(month);
          const n = byDate.get(d)?.length ?? 0;
          const isToday = d === today;
          const isSel = d === selected;
          return (
            <button
              key={d}
              onClick={() => n && onSelect(d)}
              disabled={!n}
              className={cx(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs tabular-nums transition',
                !inMonth && 'opacity-35',
                n ? 'font-semibold text-ink-900 hover:bg-accent-500/10 dark:text-white' : 'text-ink-500 dark:text-ink-500',
                isSel && 'bg-accent-500 !text-ink-950',
                isToday && !isSel && 'ring-1 ring-accent-500',
              )}
              aria-label={L(`${d}${n ? `, ${n} session${n > 1 ? 's' : ''}` : ''}`, `${d}${n ? `, ${n} ${ruPlural(n, 'тренировка', 'тренировки', 'тренировок')}` : ''}`)}
            >
              {Number(d.slice(8))}
              {n > 0 && (
                <span className="absolute bottom-1 flex gap-0.5">
                  {Array.from({ length: Math.min(n, 3) }).map((_, i) => (
                    <span key={i} className={cx('h-1 w-1 rounded-full', isSel ? 'bg-ink-950' : 'bg-accent-500')} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CORR_LABEL = byLang(() => ({ weightKg: L('weight', 'вес'), reps: L('reps', 'повт.'), rir: 'RIR', type: L('type', 'тип'), side: L('side', 'сторона'), failure: L('failure', 'отказ'), technicalFailure: L('form broke', 'техника нарушена'), toFailure: L('to failure', 'до отказа') }));

function MonthSummary({ month, workouts }: { month: string; workouts: Workout[] }) {
  const ws = workouts.filter((w) => w.date.startsWith(month));
  const sets = ws.reduce((s, w) => s + w.exercises.reduce((a, e) => a + countedSetCount(e.sets), 0), 0);
  const durs = ws.map(durationOf).filter((x): x is number => x != null);
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        [L('Sessions', 'Тренировки'), ws.length],
        [L('Working sets', 'Рабочие подх.'), sets],
        [L('Avg duration', 'Ср. время'), avgDur != null ? `${avgDur} ${L('min', 'мин')}` : '—'],
      ].map(([l, v]) => (
        <div key={String(l)} className="rounded-2xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
          <div className="text-[10px] font-medium uppercase tracking-wide text-ink-500">{l}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-ink-900 dark:text-white">{v}</div>
        </div>
      ))}
    </div>
  );
}

function SessionCard({ w, gym, names }: { w: Workout; gym: string; names: ReturnType<typeof useNames> }) {
  const data = useData();
  const a = useAnalysis();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);
  const eff = useMemo(() => sessionMuscleEffective(w, a.registry, data.settings.quality), [w, a.registry, data.settings.quality]);
  const topMuscles = (Object.entries(eff) as [MuscleId, number][]).sort((x, y) => y[1] - x[1]).slice(0, 4);
  const working = w.exercises.reduce((s, e) => s + countedSetCount(e.sets), 0);
  const dur = durationOf(w);

  const copyJson = async () => {
    const payload = { schema: IMPORT_SCHEMA_ID, schema_version: IMPORT_SCHEMA_VERSION, workouts: [workoutToExport(w)] };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast(L('Workout JSON copied', 'JSON тренировки скопирован'));
    } catch {
      toast(L('Clipboard unavailable', 'Буфер обмена недоступен'), 'bad');
    }
  };
  // A whole workout: ask first, and Undo puts the identical record back for a few seconds after.
  const del = async () => {
    if (!confirmAction(L(`Delete the workout from ${w.date}? You can undo it for a few seconds.`, `Удалить тренировку за ${w.date}? Несколько секунд это можно отменить.`))) return;
    const copy = w;
    await store.deleteWorkout(w.id);
    undoToast(L(`Workout from ${w.date} deleted`, `Тренировка за ${w.date} удалена`), () => store.putWorkoutAsIs(copy));
  };

  return (
    <Card padded={false}>
      <button className="flex w-full items-start gap-3 p-4 text-left sm:p-5" onClick={() => setOpen(!open)} aria-expanded={open}>
        <div className="flex w-12 shrink-0 flex-col items-center rounded-xl bg-ink-100 py-1.5 dark:bg-ink-800">
          <span className="text-[10px] font-semibold uppercase text-ink-500">{formatDate(w.date, { weekday: 'short' })}</span>
          <span className="text-lg font-semibold leading-tight tabular-nums text-ink-900 dark:text-white">{Number(w.date.slice(8))}</span>
          <span className="text-[10px] text-ink-500">{formatDate(w.date, { month: 'short' })}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1 font-semibold text-ink-900 dark:text-white"><IconMapPin size={14} />{gym}</span>
            {w.locationConfidence !== 'confirmed' && w.locationId && <Badge tone="warn">{confLabel(w.locationConfidence)}</Badge>}
            {w.startTime && <span className="text-xs text-ink-500">{w.startTime}{w.endTime ? `–${w.endTime}` : ''}</span>}
            {dur != null && <span className="inline-flex items-center gap-1 text-xs text-ink-500"><IconTimer size={12} />{dur} {L('min', 'мин')}</span>}
          </div>
          <div className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            {NP(w.exercises.length, ['exercise', 'exercises'], ['упражнение', 'упражнения', 'упражнений'])} · {working} {L('working sets', ruPlural(working, 'рабочий подход', 'рабочих подхода', 'рабочих подходов'))} · <span className="capitalize">{sourceLabel(w.source)}</span>
          </div>
          {topMuscles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {topMuscles.map(([m, v]) => <Badge key={m} tone="accent">{names.muscle(m)} {fmt(v)}</Badge>)}
            </div>
          )}
        </div>
        <IconChevronDown size={18} className={cx('mt-1 shrink-0 text-ink-400 transition', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-ink-100 px-4 pb-4 pt-4 dark:border-ink-800 sm:px-5">
          {w.exercises.map((ex, i) => {
            const def = a.registry.get(ex.exerciseId);
            const eq = ex.equipmentId ? eqById.get(ex.equipmentId) : undefined;
            const varBits = [
              ex.variation?.benchAngleDeg != null ? L(`${ex.variation.benchAngleDeg}° bench`, `скамья ${ex.variation.benchAngleDeg}°`) : null,
              ex.variation?.grip ? L(`${ex.variation.grip} grip`, `хват: ${GRIP_RU[ex.variation.grip] ?? ex.variation.grip}`) : null,
              ex.variation?.gripWidth ? L(`${ex.variation.gripWidth} width`, `ширина хвата: ${WIDTH_RU[ex.variation.gripWidth] ?? ex.variation.gripWidth}`) : null,
              ex.variation?.stance ?? null,
              ex.variation?.rom && ex.variation.rom !== 'full' ? romLabel(ex.variation.rom) : null,
              ex.variation?.unilateral ? L('one side at a time', 'по одной стороне') : null,
              ex.variation?.attachment ? humanize(ex.variation.attachment) : null,
              ex.variation?.position ? humanize(ex.variation.position) : null,
              ex.variation?.execution ? humanize(ex.variation.execution) : null,
              ex.variation?.legs ? humanize(ex.variation.legs) : null,
              ex.variation?.depth ? L(`depth: ${humanize(ex.variation.depth)}`, `глубина: ${humanize(ex.variation.depth)}`) : null,
              ex.variation?.barPosition ? humanize(ex.variation.barPosition) : null,
            ].filter(Boolean);
            const settings = Object.entries(ex.settings ?? {}).filter(([, v]) => String(v).trim() !== '');
            const pair = sideFactors(ex.sets);
            return (
              <div key={ex.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-ink-900 dark:text-white">
                      <span className="mr-1.5 text-xs tabular-nums text-ink-400">{i + 1}.</span>
                      {names.ex(def, ex.exerciseNameRaw ?? ex.exerciseId)}
                      {names.exSub(def) && <span className="ml-1.5 text-xs font-normal text-ink-500">{names.exSub(def)}</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-ink-500">
                      <span>{eq ? `${eq.name}${eq.manufacturer ? ` · ${eq.manufacturer}` : ''}` : L('Equipment not identified', 'Оборудование не определено')}</span>
                      {ex.equipmentConfidence !== 'confirmed' && ex.equipmentId && <Badge tone="warn">{confLabel(ex.equipmentConfidence)}</Badge>}
                      {ex.exerciseConfidence !== 'confirmed' && <Badge tone="warn">{L(`exercise ${ex.exerciseConfidence}`, `упражнение: ${confLabel(ex.exerciseConfidence)}`)}</Badge>}
                      {varBits.length > 0 && <span>· {varBits.join(' · ')}</span>}
                      {settings.length > 0 && <span>· {settings.map(([k, v]) => `${k}: ${v}`).join(', ')}</span>}
                    </div>
                  </div>
                </div>
                <div className="scroll-x mt-2">
                  <table className="w-full min-w-[480px] text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-ink-400">
                        <th className="px-2 py-1 text-left font-medium">#</th>
                        <th className="px-2 py-1 text-left font-medium">{L('Type', 'Тип')}</th>
                        <th className="px-2 py-1 text-right font-medium">{L('Weight', 'Вес')}</th>
                        <th className="px-2 py-1 text-right font-medium">{L('Reps', 'Повт.')}</th>
                        <th className="px-2 py-1 text-right font-medium">RIR</th>
                        <th className="px-2 py-1 text-right font-medium">{L('Rest before', 'Отдых до')}</th>
                        <th className="px-2 py-1 text-right font-medium">{L('Effort', 'Усилие')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800/70">
                      {ex.sets.map((s, k) => {
                        const q = assessSet(s, data.settings.quality);
                        const load = s.weightKg == null ? '—' : `${fmt(s.weightKg, 2)} ${L('kg', 'кг')}${s.loadMode === 'per_side' ? L(' /side', ' на сторону') : s.loadMode === 'bodyweight_plus' ? L(' + BW', ' + вес тела') : s.loadMode === 'assisted' ? L(' assist', ' помощь') : ''}`;
                        // A tag only for what differs from an ordinary working set: warm-up, drop, side (plus failure / partial ROM).
                        const tags = [
                          s.type === 'warmup' ? L('Warm-up', 'Разминка') : s.type === 'drop' ? L('Drop', 'Дроп') : null,
                          s.side ? (s.side === 'left' ? L('L', 'Л') : L('R', 'П')) : null,
                          s.toFailure ? L('failure', 'отказ') : null,
                          s.rom && s.rom !== 'full' ? romLabel(s.rom) : null,
                        ].filter(Boolean);
                        return (
                          <tr key={s.id} className={cx('tabular-nums', s.type === 'warmup' && 'text-ink-400')}>
                            <td className="px-2 py-1.5">{k + 1}</td>
                            <td className="px-2 py-1.5">
                              {tags.length > 0 && <span className="capitalize">{tags.join(' · ')}</span>}
                              {s.feel && <span className="block text-[10px] text-ink-500">{FEEL_BY_ID[s.feel].title}{s.pain?.area ? ` · ${painAreaLabel(s.pain.area)}` : ''}{s.intendedWeightKg != null ? L(` · meant ${fmt(s.intendedWeightKg, 2)} kg`, ` · планировалось ${fmt(s.intendedWeightKg, 2)} кг`) : ''}</span>}
                              {s.notes && <span className="block text-[10px] italic text-ink-500">“{s.notes}”</span>}
                              {s.corrections?.length ? <span className="block text-[10px] text-amber-700 dark:text-amber-300">{L('corrected: ', 'исправлено: ')}{s.corrections.map((c) => `${CORR_LABEL[c.field]} ${c.from ?? '—'} → ${c.to ?? '—'}`).join(', ')}</span> : null}
                            </td>
                            <td className="px-2 py-1.5 text-right">{load}</td>
                            <td className="px-2 py-1.5 text-right">{s.reps ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right">{s.rir ?? '—'}{s.rir != null && s.rirSource === 'inferred' ? '*' : ''}</td>
                            <td className="px-2 py-1.5 text-right">{formatDuration(s.restSecBefore)}</td>
                            <td className="px-2 py-1.5 text-right" title={q.reasons.join('\n')}>
                              <Badge tone={TIER_TONE[q.tier]}>{TIER_LABEL[q.tier]}{s.type !== 'warmup' ? ` ×${num(Math.round(q.credit * (pair.get(s.id) ?? 1) * 100) / 100)}${(pair.get(s.id) ?? 1) < 1 ? L(' (pair)', ' (пара)') : ''}` : ''}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(ex.restAfterSec != null || ex.notes) && (
                  <div className="mt-1 text-[11px] text-ink-500">
                    {ex.restAfterSec != null && <span>{L('Rest before next exercise:', 'Отдых перед следующим упражнением:')} {formatDuration(ex.restAfterSec)}. </span>}
                    {ex.notes && <span>{ex.notes}</span>}
                  </div>
                )}
              </div>
            );
          })}

          {w.wellness && (w.wellness.fatigue != null || w.wellness.energy != null || w.wellness.sleepHours != null || w.wellness.sessionRpe != null || Object.keys(w.wellness.soreness ?? {}).length > 0) && (
            <div className="rounded-xl bg-ink-50 p-3 text-xs dark:bg-ink-950">
              <div className="mb-1 font-semibold text-ink-700 dark:text-ink-200">{L('Wellness (self-reported)', 'Самочувствие (по вашей оценке)')}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-600 dark:text-ink-300">
                {w.wellness.fatigue != null && <span>{L('Fatigue', 'Усталость')} {w.wellness.fatigue}/5</span>}
                {w.wellness.energy != null && <span>{L('Energy', 'Энергия')} {w.wellness.energy}/5</span>}
                {w.wellness.sleepHours != null && <span>{L(`Sleep ${w.wellness.sleepHours} h`, `Сон ${num(w.wellness.sleepHours)} ч`)}</span>}
                {w.wellness.sessionRpe != null && <span>{L('Session RPE', 'RPE тренировки')} {w.wellness.sessionRpe}</span>}
                {Object.entries(w.wellness.soreness ?? {}).map(([m, v]) => <span key={m}>{L(`${names.muscle(m as MuscleId)} soreness ${v}/4`, `${names.muscle(m as MuscleId)}: боль в мышцах ${v}/4`)}</span>)}
              </div>
            </div>
          )}

          {w.notes && <p className="whitespace-pre-wrap text-xs text-ink-600 dark:text-ink-300">{w.notes}</p>}
          {w.audit?.length ? <div className="text-[11px] text-amber-700 dark:text-amber-300">{w.audit.map((x, i) => <div key={i}>{L('Correction', 'Исправление')} ({formatDate(x.at.slice(0, 10))}): {x.note}</div>)}</div> : null}

          {w.uncertainties && w.uncertainties.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-100">
              <div className="mb-1 font-semibold">{L('Recorded uncertainties', 'Записанные неясности')}</div>
              <ul className="list-disc space-y-0.5 pl-4">{w.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul>
            </div>
          )}

          {w.rawInput && (
            <div>
              <button className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800 dark:hover:text-ink-200" onClick={() => setShowRaw(!showRaw)}>
                <IconChevronDown size={12} className={cx('transition', showRaw && 'rotate-180')} /> {L('Original message', 'Исходное сообщение')}
              </button>
              {showRaw && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-50 p-3 font-mono text-[11px] text-ink-600 dark:bg-ink-950 dark:text-ink-300">{w.rawInput}</pre>}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => nav(`/log/${w.id}`)}><IconEdit size={14} /> {L('Edit', 'Изменить')}</Button>
            <Button size="sm" onClick={() => nav(`/check/${w.id}`)} data-testid="open-check">{L('Check the numbers', 'Проверить расчёты')}</Button>
            <Button size="sm" onClick={copyJson}><IconCopy size={14} /> {L('Copy JSON', 'Копировать JSON')}</Button>
            <Button size="sm" variant="ghost" className="text-rose-600 dark:text-rose-400" onClick={del}><IconTrash size={14} /> {L('Delete', 'Удалить')}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

