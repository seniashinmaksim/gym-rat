import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MuscleWeek } from '../../domain/analysis';
import { formatDate } from '../../domain/dates';
import { defaultIncrement, warmupFor } from '../../domain/progression';
import { assessDeload, buildSnapshot, pendingSnapshot, weeklyReport } from '../../domain/reports';
import { store } from '../../lib/store';
import { activeWorkout } from '../Layout';
import type { MuscleId } from '../../domain/types';
import { useData } from '../../lib/store';
import { BodyMap, type BodyMapMode } from '../components/BodyMap';
import { IconAlert, IconChevronDown, IconImport, IconPlus, IconReport } from '../components/icons';
import { Badge, Button, Callout, Card, CardTitle, ConfidenceBadge, cx, Empty, fmt, Page, Segmented, VolumeBar, Why } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

type Filter = 'open' | 'all' | 'done';

export function DashboardPage() {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [filter, setFilter] = useState<Filter>('open');
  const [open, setOpen] = useState<MuscleId | null>(null);
  const [mapMode, setMapMode] = useState<BodyMapMode>('volume');
  const deload = useMemo(() => assessDeload(data, a), [data, a]);
  const active = activeWorkout(data.workouts);
  // Automatic weekly report: freeze the targets of the week that just finished (once).
  const pending = pendingSnapshot(a, data);
  useEffect(() => {
    if (pending) void store.saveSnapshot(buildSnapshot(pending, a.targets, data));
  }, [pending?.range.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    const rank = (m: MuscleWeek) => (m.remainingToPreferred <= 0 ? -1 : m.todayLeft > 0 ? 1000 + m.remainingToPreferred : m.remainingToPreferred);
    return [...a.muscles].sort((x, y) => rank(y) - rank(x));
  }, [a.muscles]);
  const openList = sorted.filter((m) => m.remainingToPreferred > 0);
  const doneList = sorted.filter((m) => m.remainingToPreferred <= 0);
  const list = filter === 'open' ? openList : filter === 'done' ? doneList : sorted;
  const todayList = openList.filter((m) => m.todayShare > 0);
  const todayOpen = todayList.filter((m) => m.todayLeft > 0);
  const totalEffective = a.muscles.reduce((s, m) => s + m.completed, 0);
  const uncertain = a.muscles.reduce((s, m) => s + m.volume.uncertainEffective, 0);
  const lastComplete = [...a.weeks].reverse().find((w) => w.complete);
  const lastReport = lastComplete ? weeklyReport(lastComplete, a, data) : null;

  const subtitle = (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>{formatDate(a.week.start, { day: 'numeric', month: 'short' })} – {formatDate(a.week.end, { day: 'numeric', month: 'short' })}</span>
      <span className="text-ink-300 dark:text-ink-600">•</span>
      <span>{a.sessionsThisWeek} session{a.sessionsThisWeek === 1 ? '' : 's'} logged</span>
      <span className="text-ink-300 dark:text-ink-600">•</span>
      <span>{a.daysLeft} day{a.daysLeft === 1 ? '' : 's'} left · ~{a.sessionsLeftInclToday} session{a.sessionsLeftInclToday === 1 ? '' : 's'} likely</span>
    </span>
  );

  if (!data.workouts.length) {
    return (
      <Page title="This week" subtitle={subtitle}>
        <LearningBanner />
        <Empty title="No workouts yet" action={<div className="flex flex-wrap justify-center gap-2"><Link to="/log"><Button variant="primary"><IconPlus size={16} />Log a workout</Button></Link><Link to="/import"><Button><IconImport size={16} />Import from Claude</Button></Link></div>}>
          Log your first session, or describe it to Claude and paste the JSON. The first 30 days are for learning how you actually train. Every number on this page starts as a provisional reference until then.
        </Empty>
      </Page>
    );
  }

  return (
    <Page title="This week" subtitle={subtitle} actions={<Link to={active ? `/log/${active.id}` : '/log'}><Button variant="primary"><IconPlus size={16} />{active ? 'Resume workout' : 'Log workout'}</Button></Link>}>
      <LearningBanner />
      {deload.recommend && (
        <Callout tone="warn" icon={<IconAlert size={18} />} title="Possible accumulated fatigue">
          {deload.summary} <Link to="/periodization" className="font-semibold underline">See indicators</Link>
        </Callout>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 dark:border-ink-800 sm:px-5">
            <div>
              <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">Remaining quality sets</h2>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {!openList.length ? 'Every muscle has reached its target this week.'
                  : !todayList.length ? 'Nothing is due today — open muscles are still recovering.'
                    : todayOpen.length === 0 ? <>Today's share is done for all <b className="text-ink-800 dark:text-ink-100">{todayList.length}</b> muscles. Rest well.</>
                      : <><b className="text-ink-800 dark:text-ink-100">{todayOpen.length}</b> muscle{todayOpen.length === 1 ? '' : 's'} to train today · biggest gaps: {todayOpen.slice(0, 3).map((m) => names.muscle(m.muscle)).join(', ')}</>}
              </p>
            </div>
            <Segmented size="sm" value={filter} onChange={setFilter} options={[
              { value: 'open', label: `To do · ${openList.length}` },
              { value: 'done', label: `Met · ${doneList.length}` },
              { value: 'all', label: 'All' },
            ]} />
          </div>
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_76px_84px] gap-3 px-5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:grid">
            <span>Muscle</span><span>Effective sets this week</span><span className="text-right">Left</span><span className="text-right">Today</span>
          </div>
          <ul className="divide-y divide-ink-100 dark:divide-ink-800/70">
            {list.map((m) => <MuscleRow key={m.muscle} m={m} open={open === m.muscle} onToggle={() => setOpen(open === m.muscle ? null : m.muscle)} />)}
            {!list.length && <li className="px-5 py-8 text-center text-sm text-ink-500">Nothing here.</li>}
          </ul>
          {filter === 'open' && doneList.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-100 px-4 py-3 dark:border-ink-800 sm:px-5">
              <span className="mr-1 text-xs text-ink-500">Target met:</span>
              {doneList.map((m) => <Badge key={m.muscle} tone={m.status === 'over' ? 'violet' : 'good'}>{names.muscle(m.muscle)}</Badge>)}
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardTitle right={<Segmented size="sm" value={mapMode} onChange={setMapMode} options={[{ value: 'volume', label: 'Volume' }, { value: 'recovery', label: 'Recovery' }]} />}>Body map</CardTitle>
            <BodyMap muscles={a.muscles} mode={mapMode} selected={open} onSelect={(m) => { setFilter('all'); setOpen(m); document.getElementById(`row-${m}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} compact />
          </Card>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Effective sets" value={fmt(totalEffective)} sub={uncertain > 0 ? `${fmt(uncertain)} with unknown effort` : 'all with known effort'} />
            <MiniStat label="Working sets" value={String(a.current.totalWorkingSets)} sub={`${a.current.totalWarmupSets} warm-ups excluded`} />
          </div>
          {lastReport && (
            <Card>
              <CardTitle hint={`${formatDate(lastReport.range.start, { day: 'numeric', month: 'short' })} – ${formatDate(lastReport.range.end, { day: 'numeric', month: 'short' })}`} right={<Link to="/reports" className="-my-2 inline-flex min-h-[44px] items-center text-xs font-medium text-accent-600 hover:underline dark:text-accent-400"><IconReport size={14} className="mr-1" />Full report</Link>}>Last week</CardTitle>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-ink-500">Sessions</span><span className="font-medium tabular-nums">{lastReport.sessions}</span></div>
                <div className="flex justify-between"><span className="text-ink-500">Muscles at target</span><span className="font-medium tabular-nums">{lastReport.reached.length} / {lastReport.rows.length}</span></div>
                {lastReport.short.length > 0 && <div className="text-xs text-ink-500">Fell short: <span className="text-ink-700 dark:text-ink-200">{lastReport.short.map((m) => names.muscle(m)).join(', ')}</span></div>}
                <p className="rounded-xl bg-ink-50 p-2.5 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">{lastReport.recommendations[0]}</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink-900 dark:text-white">{value}</div>
      <div className="text-[11px] text-ink-500">{sub}</div>
    </div>
  );
}

const REC_DOT: Record<string, string> = { likely_recovered: 'bg-emerald-500', recovering: 'bg-amber-500', insufficient_data: 'bg-ink-400' };
const REC_LABEL: Record<string, string> = { likely_recovered: 'Likely recovered', recovering: 'Recovering', insufficient_data: 'No recovery data' };

function MuscleRow({ m, open, onToggle }: { m: MuscleWeek; open: boolean; onToggle: () => void }) {
  const names = useNames();
  const done = m.remainingToPreferred <= 0;
  return (
    <li id={`row-${m.muscle}`} className={cx('transition-colors', open && 'bg-ink-50/70 dark:bg-ink-950/40')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 text-left sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_76px_84px] sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cx('h-2 w-2 shrink-0 rounded-full', REC_DOT[m.recovery.status])} aria-label={REC_LABEL[m.recovery.status]} />
            <span className="truncate font-medium text-ink-900 dark:text-white">{names.muscle(m.muscle)}</span>
            <IconChevronDown size={14} className={cx('shrink-0 text-ink-400 transition', open && 'rotate-180')} />
          </div>
          {names.muscleSub(m.muscle) && <div className="ml-4 truncate text-[11px] text-ink-400">{names.muscleSub(m.muscle)}</div>}
        </div>

        {/* Remaining: mobile shows next to name */}
        <div className="text-right sm:order-3">
          <div className={cx('text-2xl font-semibold leading-none tabular-nums tracking-tight', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-900 dark:text-white')}>
            {done ? '✓' : fmt(m.remainingToPreferred)}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-400 sm:hidden">{done ? 'done' : 'left'}</div>
        </div>

        <div className="col-span-2 sm:order-2 sm:col-span-1">
          <VolumeBar completed={m.completed} min={m.target.min} preferred={m.target.preferred} max={m.target.max} uncertain={m.volume.uncertainEffective} />
          <div className="mt-1.5 flex items-center justify-between text-[11px] tabular-nums text-ink-500 dark:text-ink-400">
            <span><b className="font-semibold text-ink-700 dark:text-ink-200">{fmt(m.completed)}</b> / {fmt(m.target.preferred)}{m.target.provisional && <span className="ml-1 text-amber-600 dark:text-amber-400">prov.</span>}</span>
            <span className="sm:hidden">{todayChip(m)}</span>
            <span className="hidden sm:inline">{m.volume.directSets}d · {m.volume.indirectSets}i</span>
          </div>
        </div>

        <div className="hidden text-right sm:order-4 sm:block">{todayChip(m)}</div>
      </button>
      {open && <MuscleDetail m={m} />}
    </li>
  );
}

function todayChip(m: MuscleWeek) {
  if (m.remainingToPreferred <= 0) return <Badge tone={m.status === 'over' ? 'violet' : 'good'}>{m.status === 'over' ? 'Above range' : 'Done'}</Badge>;
  if (m.todayShare > 0 && m.todayLeft <= 0) return <Badge tone="good">✓ today</Badge>;
  if (m.todayBlocked) return <Badge tone="warn">Recovering</Badge>;
  if (m.todayLeft > 0) return <Badge tone="accent">{m.doneToday > 0 ? `${fmt(m.todayLeft)} more today` : `today ≈ ${fmt(m.todayLeft)}`}</Badge>;
  return <Badge>—</Badge>;
}

function MuscleDetail({ m }: { m: MuscleWeek }) {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const eqById = new Map(data.equipment.map((e) => [e.id, e]));
  const options = a.progression
    .filter((p) => (a.registry.get(p.exerciseId)?.contributions[m.muscle] ?? 0) >= 0.75)
    .slice(0, 4);
  const lastDate = m.recovery.lastStimulusDate;

  return (
    <div className="space-y-4 px-4 pb-5 sm:px-5">
      <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{m.explanation}</p>
      <div className={cx('rounded-xl border px-3 py-2.5 text-sm',
        m.moreVolumeJustified === 'yes' ? 'border-sky-500/30 bg-sky-500/5' : m.moreVolumeJustified === 'no' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5')}>
        <span className="font-semibold">{{ yes: 'More volume justified', no: 'No more needed', wait: 'Wait', caution: 'Caution' }[m.moreVolumeJustified]}: </span>
        <span className="text-ink-700 dark:text-ink-200">{m.justification}</span>
        <div className="mt-1 text-xs text-ink-500">
          {m.todayShare > 0
            ? <>Today ≈ {m.todayShare} effective set{m.todayShare === 1 ? '' : 's'}{m.doneToday > 0 ? ` (${fmt(m.doneToday)} done)` : ''} — {m.todayNote}.</>
            : <>Today: {m.todayNote}.</>}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs sm:grid-cols-4">
        <Fact k="Target range" v={<span className="inline-flex items-center gap-1.5">{fmt(m.target.min)}–{fmt(m.target.max)} <ConfidenceBadge c={m.target.confidence} provisional={m.target.provisional} /></span>} />
        <Fact k="Direct / indirect raw sets" v={`${m.volume.directSets} / ${m.volume.indirectSets}`} />
        <Fact k="Effective direct / indirect" v={`${fmt(m.volume.effectiveDirect)} / ${fmt(m.volume.effectiveIndirect)}`} />
        <Fact k="Low-effort / unknown sets" v={`${m.volume.lowEffortSets} / ${m.volume.unknownEffortSets}`} />
        <Fact k="Last significant session" v={lastDate ? `${formatDate(lastDate)} · ${fmt(m.recovery.lastStimulusSets)} sets` : '—'} />
        <Fact k="Recovery estimate" v={<span>{REC_LABEL[m.recovery.status]}{m.recovery.hoursSince != null ? ` · ${m.recovery.hoursSince} h ago` : ''}</span>} />
        <Fact k="Strength trend" v={m.trend.overall === 'unknown' ? 'Not enough data' : `${m.trend.overall} (${m.trend.exercises} exercise${m.trend.exercises === 1 ? '' : 's'})`} />
        <Fact k="Remaining to lower end" v={fmt(m.remainingToMin)} />
      </dl>

      <Why label="How this target was set">
        {m.target.rationale.map((r, i) => <p key={i}>{r}</p>)}
        {m.recovery.factors.map((f, i) => <p key={`f${i}`} className="text-ink-500">Recovery: {f}</p>)}
      </Why>

      {options.length > 0 ? (
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Your exercises for this muscle</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((p) => {
              const def = a.registry.get(p.exerciseId);
              const eq = p.equipmentId ? eqById.get(p.equipmentId) : undefined;
              const inc = eq?.incrementsKg?.length ? Math.min(...eq.incrementsKg) : defaultIncrement(def?.equipmentKind, p.loadMode);
              const wu = warmupFor(def, p.next.weight, inc, 0);
              return (
                <div key={p.key} className="rounded-xl border border-ink-200 bg-white p-3 dark:border-ink-800 dark:bg-ink-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{names.ex(def, p.exerciseId)}</div>
                      <div className="truncate text-[11px] text-ink-500">{p.scopeLabel}{p.current ? ` · last ${formatDate(p.current.date, { day: 'numeric', month: 'short' })}` : ''}</div>
                    </div>
                    <Badge tone={p.next.action === 'increase' ? 'good' : p.next.action === 'reduce' ? 'warn' : 'neutral'}>{p.next.action}</Badge>
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-lg font-semibold tabular-nums">{p.next.weight != null ? `${fmt(p.next.weight, 2)} kg` : 'BW'}</span>
                    <span className="text-xs text-ink-500">{p.next.repTarget[0]}–{p.next.repTarget[1]} reps · RIR {p.next.rirTarget}</span>
                  </div>
                  <Why label="Why & warm-up">
                    <p>{p.next.reason}</p>
                    <p className="text-ink-500">Warm-up: {wu.sets.length ? wu.sets.map((s) => `${s.weight != null ? `${fmt(s.weight, 2)} kg` : 'BW'} × ${s.reps}`).join(' → ') : 'none'}. {wu.reason}</p>
                  </Why>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-500">No personal history for exercises that train this muscle directly yet. Your first sessions will calibrate load suggestions.</p>
      )}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-ink-400">{k}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-ink-800 dark:text-ink-100">{v}</dd>
    </div>
  );
}

function LearningBanner() {
  const a = useAnalysis();
  const l = a.learning;
  if (!l.active) return null;
  const pct = l.lengthDays ? Math.min(100, Math.round(((l.dayNumber || 0) / l.lengthDays) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">Learning Mode{l.startDate ? ` · day ${l.dayNumber} of ${l.lengthDays}` : ''}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            {l.message} Targets are provisional reference ranges. Nothing is classified as "lagging" until there's enough of your own data.
          </p>
        </div>
        <div className="text-right text-xs text-amber-800/80 dark:text-amber-200/80">{l.sessions} sessions · {l.completeWeeks} full weeks</div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-amber-500/15"><div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
