import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, dayOfWeek, formatDate, formatDuration } from '../../domain/dates';
import { workoutToExport, IMPORT_SCHEMA_ID, IMPORT_SCHEMA_VERSION } from '../../domain/importer';
import { assessSet, type EffortTier } from '../../domain/quality';
import type { MuscleId, Workout } from '../../domain/types';
import { sessionMuscleEffective } from '../../domain/volume';
import { store, useData } from '../../lib/store';
import { IconChevron, IconChevronDown, IconCopy, IconEdit, IconMapPin, IconTimer, IconTrash } from '../components/icons';
import { Badge, Button, Card, Empty, Page, Segmented, cx, confirmAction, fmt, toast } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIER_TONE: Record<EffortTier, 'neutral' | 'good' | 'info' | 'warn' | 'bad' | 'violet'> = {
  warmup: 'neutral',
  high_effort: 'good',
  working: 'info',
  low_effort: 'warn',
  unknown: 'neutral',
};
const TIER_LABEL: Record<EffortTier, string> = {
  warmup: 'Warm-up',
  high_effort: 'High effort',
  working: 'Working',
  low_effort: 'Low effort',
  unknown: 'Effort ?',
};

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
      title="Workout history"
      subtitle={`${data.workouts.length} sessions recorded · ${monthSessions} in ${monthLabel(month)}`}
      actions={<Button variant="primary" onClick={() => (window.location.hash = '#/log')}>Log workout</Button>}
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
                <button className="text-xs text-accent-600 hover:underline dark:text-accent-400" onClick={() => setSelectedDay(null)}>Show all</button>
              </div>
            ) : (
              <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'all', label: 'All sessions' }, { value: 'month', label: monthLabel(month) }]} />
            )}
            <span className="text-xs text-ink-500">{list.length} session{list.length === 1 ? '' : 's'}</span>
          </div>
          {list.length === 0 ? (
            <Empty title={selectedDay ? 'No session on this day' : 'No workouts yet'}>
              {selectedDay ? 'Pick a day with a dot, or clear the selection.' : 'Log a workout or import one from Claude to start building your history.'}
            </Empty>
          ) : (
            list.map((w) => <SessionCard key={w.id} w={w} gym={w.locationId ? locName.get(w.locationId) ?? 'Unknown gym' : 'Gym not set'} names={names} />)
          )}
        </div>
      </div>
    </Page>
  );
}

function monthLabel(m: string) {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
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
        <button className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 active:bg-ink-200 dark:hover:bg-ink-800" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month">
          <IconChevron size={18} className="rotate-180" />
        </button>
        <div className="text-sm font-semibold text-ink-900 dark:text-white">{monthLabel(month)}</div>
        <button className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 active:bg-ink-200 dark:hover:bg-ink-800" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month">
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
              aria-label={`${d}${n ? `, ${n} session${n > 1 ? 's' : ''}` : ''}`}
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

function MonthSummary({ month, workouts }: { month: string; workouts: Workout[] }) {
  const ws = workouts.filter((w) => w.date.startsWith(month));
  const sets = ws.reduce((s, w) => s + w.exercises.reduce((a, e) => a + e.sets.filter((x) => x.type !== 'warmup').length, 0), 0);
  const durs = ws.map(durationOf).filter((x): x is number => x != null);
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        ['Sessions', ws.length],
        ['Working sets', sets],
        ['Avg duration', avgDur != null ? `${avgDur} min` : '—'],
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
  const working = w.exercises.reduce((s, e) => s + e.sets.filter((x) => x.type !== 'warmup').length, 0);
  const dur = durationOf(w);

  const copyJson = async () => {
    const payload = { schema: IMPORT_SCHEMA_ID, schema_version: IMPORT_SCHEMA_VERSION, workouts: [workoutToExport(w)] };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      toast('Workout JSON copied');
    } catch {
      toast('Clipboard unavailable', 'bad');
    }
  };
  const del = async () => {
    if (!confirmAction(`Delete the workout from ${w.date}? This cannot be undone.`)) return;
    await store.deleteWorkout(w.id);
    toast('Workout deleted', 'info');
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
            {w.locationConfidence !== 'confirmed' && w.locationId && <Badge tone="warn">{w.locationConfidence}</Badge>}
            {w.startTime && <span className="text-xs text-ink-500">{w.startTime}{w.endTime ? `–${w.endTime}` : ''}</span>}
            {dur != null && <span className="inline-flex items-center gap-1 text-xs text-ink-500"><IconTimer size={12} />{dur} min</span>}
          </div>
          <div className="mt-1 text-xs text-ink-500 dark:text-ink-400">
            {w.exercises.length} exercise{w.exercises.length === 1 ? '' : 's'} · {working} working sets · <span className="capitalize">{w.source.replace('_', ' ')}</span>
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
              ex.variation?.benchAngleDeg != null ? `${ex.variation.benchAngleDeg}° bench` : null,
              ex.variation?.grip ? `${ex.variation.grip} grip` : null,
              ex.variation?.gripWidth ? `${ex.variation.gripWidth} width` : null,
              ex.variation?.stance ?? null,
              ex.variation?.rom && ex.variation.rom !== 'full' ? ex.variation.rom.replace('_', ' ') : null,
              ex.variation?.unilateral ? 'unilateral' : null,
            ].filter(Boolean);
            const settings = Object.entries(ex.settings ?? {});
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
                      <span>{eq ? `${eq.name}${eq.manufacturer ? ` · ${eq.manufacturer}` : ''}` : 'Equipment not identified'}</span>
                      {ex.equipmentConfidence !== 'confirmed' && ex.equipmentId && <Badge tone="warn">{ex.equipmentConfidence}</Badge>}
                      {ex.exerciseConfidence !== 'confirmed' && <Badge tone="warn">exercise {ex.exerciseConfidence}</Badge>}
                      {varBits.length > 0 && <span>· {varBits.join(' · ')}</span>}
                      {settings.length > 0 && <span>· {settings.map(([k, v]) => `${k}: ${v}`).join(', ')}</span>}
                    </div>
                  </div>
                </div>
                <div className="-mx-4 mt-2 overflow-x-auto sm:mx-0">
                  <table className="w-full min-w-[480px] text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-ink-400">
                        <th className="px-2 py-1 text-left font-medium">#</th>
                        <th className="px-2 py-1 text-left font-medium">Type</th>
                        <th className="px-2 py-1 text-right font-medium">Weight</th>
                        <th className="px-2 py-1 text-right font-medium">Reps</th>
                        <th className="px-2 py-1 text-right font-medium">RIR</th>
                        <th className="px-2 py-1 text-right font-medium">Rest before</th>
                        <th className="px-2 py-1 text-right font-medium">Effort</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800/70">
                      {ex.sets.map((s, k) => {
                        const q = assessSet(s, data.settings.quality);
                        const load = s.weightKg == null ? '—' : `${fmt(s.weightKg, 2)} kg${s.loadMode === 'per_side' ? ' /side' : s.loadMode === 'bodyweight_plus' ? ' + BW' : s.loadMode === 'assisted' ? ' assist' : ''}`;
                        return (
                          <tr key={s.id} className={cx('tabular-nums', s.type === 'warmup' && 'text-ink-400')}>
                            <td className="px-2 py-1.5">{k + 1}</td>
                            <td className="px-2 py-1.5 capitalize">{s.type}{s.toFailure ? ' · failure' : ''}{s.rom && s.rom !== 'full' ? ` · ${s.rom.replace('_', ' ')}` : ''}</td>
                            <td className="px-2 py-1.5 text-right">{load}</td>
                            <td className="px-2 py-1.5 text-right">{s.reps ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right">{s.rir ?? '—'}{s.rir != null && s.rirSource === 'inferred' ? '*' : ''}</td>
                            <td className="px-2 py-1.5 text-right">{formatDuration(s.restSecBefore)}</td>
                            <td className="px-2 py-1.5 text-right" title={q.reasons.join('\n')}>
                              <Badge tone={TIER_TONE[q.tier]}>{TIER_LABEL[q.tier]}{s.type !== 'warmup' ? ` ×${q.credit}` : ''}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(ex.restAfterSec != null || ex.notes) && (
                  <div className="mt-1 text-[11px] text-ink-500">
                    {ex.restAfterSec != null && <span>Rest before next exercise: {formatDuration(ex.restAfterSec)}. </span>}
                    {ex.notes && <span>{ex.notes}</span>}
                  </div>
                )}
              </div>
            );
          })}

          {w.wellness && (w.wellness.fatigue != null || w.wellness.energy != null || w.wellness.sleepHours != null || w.wellness.sessionRpe != null || Object.keys(w.wellness.soreness ?? {}).length > 0) && (
            <div className="rounded-xl bg-ink-50 p-3 text-xs dark:bg-ink-950">
              <div className="mb-1 font-semibold text-ink-700 dark:text-ink-200">Wellness (self-reported)</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-600 dark:text-ink-300">
                {w.wellness.fatigue != null && <span>Fatigue {w.wellness.fatigue}/5</span>}
                {w.wellness.energy != null && <span>Energy {w.wellness.energy}/5</span>}
                {w.wellness.sleepHours != null && <span>Sleep {w.wellness.sleepHours} h</span>}
                {w.wellness.sessionRpe != null && <span>Session RPE {w.wellness.sessionRpe}</span>}
                {Object.entries(w.wellness.soreness ?? {}).map(([m, v]) => <span key={m}>{names.muscle(m as MuscleId)} soreness {v}/4</span>)}
              </div>
            </div>
          )}

          {w.notes && <p className="whitespace-pre-wrap text-xs text-ink-600 dark:text-ink-300">{w.notes}</p>}

          {w.uncertainties && w.uncertainties.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-100">
              <div className="mb-1 font-semibold">Recorded uncertainties</div>
              <ul className="list-disc space-y-0.5 pl-4">{w.uncertainties.map((u, i) => <li key={i}>{u}</li>)}</ul>
            </div>
          )}

          {w.rawInput && (
            <div>
              <button className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800 dark:hover:text-ink-200" onClick={() => setShowRaw(!showRaw)}>
                <IconChevronDown size={12} className={cx('transition', showRaw && 'rotate-180')} /> Original message
              </button>
              {showRaw && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-ink-50 p-3 font-mono text-[11px] text-ink-600 dark:bg-ink-950 dark:text-ink-300">{w.rawInput}</pre>}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => nav(`/log/${w.id}`)}><IconEdit size={14} /> Edit</Button>
            <Button size="sm" onClick={copyJson}><IconCopy size={14} /> Copy JSON</Button>
            <Button size="sm" variant="ghost" className="text-rose-600 dark:text-rose-400" onClick={del}><IconTrash size={14} /> Delete</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

