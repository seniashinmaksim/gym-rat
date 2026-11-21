import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MuscleWeek } from '../../domain/analysis';
import { formatDate, diffDays } from '../../domain/dates';
import { adviceFor, adviceLabel, type AdviceKind, type ProgressionSeries } from '../../domain/progression';
import { assessDeload, buildSnapshot, pendingSnapshot, weeklyReport } from '../../domain/reports';
import { store } from '../../lib/store';
import { activeWorkout } from '../Layout';
import type { MuscleId } from '../../domain/types';
import { effortCoverage, effortDistribution } from '../../domain/effort';
import { latestWeighIn, rollingAverage, weeklyTrend } from '../../domain/bodyweight';
import { AddBodyWeight } from '../components/AddBodyWeight';
import { useData } from '../../lib/store';
import { BodyMap, type BodyMapMode } from '../components/BodyMap';
import { IconAlert, IconChevronDown, IconImport, IconPlus } from '../components/icons';
import { Badge, Button, Callout, Card, ConfidenceBadge, cx, Empty, fmt, Page, Segmented, VolumeBar, Why } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

/**
 * Main screen — deliberately simple. It answers two questions:
 *   1. How many quality sets are still left per muscle this week?
 *   2. For the exercises I'm doing: increase, keep or reduce the weight?
 * Everything else (body map, statistics, last week) is one tap away under "More details".
 * All numbers come from the domain layer (analysis.ts / progression.ts) — nothing is computed here.
 */
export function DashboardPage() {
  const a = useAnalysis();
  const data = useData();
  const [open, setOpen] = useState<MuscleId | null>(null);
  const [more, setMore] = useState(false);
  const deload = useMemo(() => assessDeload(data, a), [data, a]);
  const active = activeWorkout(data.workouts);
  const effort = useMemo(() => effortCoverage(data.workouts, a.week), [data.workouts, a.week]);
  // Automatic weekly report: freeze the targets of the week that just finished (once).
  const pending = pendingSnapshot(a, data);
  useEffect(() => {
    if (pending) void store.saveSnapshot(buildSnapshot(pending, a.targets, data));
  }, [pending?.range.start]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => {
    const rank = (m: MuscleWeek) => (m.remainingToPreferred <= 0 ? -1 : m.todayLeft > 0 ? 1000 + m.remainingToPreferred : m.remainingToPreferred);
    return [...a.muscles].sort((x, y) => rank(y) - rank(x));
  }, [a.muscles]);

  const subtitle = (
    <span>{formatDate(a.week.start, { day: 'numeric', month: 'short' })} – {formatDate(a.week.end, { day: 'numeric', month: 'short' })} · {a.daysLeft} day{a.daysLeft === 1 ? '' : 's'} left</span>
  );

  if (!data.workouts.length) {
    return (
      <Page title="This week" subtitle={subtitle}>
        <Empty title="No workouts yet" action={<div className="flex flex-wrap justify-center gap-2"><Link to="/log"><Button variant="primary"><IconPlus size={16} />Log a workout</Button></Link><Link to="/import"><Button><IconImport size={16} />Import from Claude</Button></Link></div>}>
          Log your first session, or describe it to Claude and paste the JSON. For the first 30 days the weekly targets are provisional while the app learns how you train.
        </Empty>
      </Page>
    );
  }

  return (
    <Page title="This week" subtitle={subtitle} actions={<Link to={active ? `/log/${active.id}` : '/log'}><Button variant="primary"><IconPlus size={16} />{active ? 'Resume' : 'Log workout'}</Button></Link>}>
      {effort.nudge && (
        <Callout tone="info" title={`${effort.missing} / ${effort.counted} sets without RIR or feel`}>
          Counted as provisional (0.75). One tap after ✓ fixes it.
        </Callout>
      )}
      {deload.recommend && (
        <Callout tone="warn" icon={<IconAlert size={18} />} title="Possible accumulated fatigue">
          {deload.summary} <Link to="/periodization" className="font-semibold underline">See why</Link>
        </Callout>
      )}

      <Card padded={false}>
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3 dark:border-ink-800 sm:px-5">
          <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">Quality sets</h2>
          <span className="flex items-center gap-1.5">
            {a.learning.active && <Badge tone="warn">PROVISIONAL</Badge>}
            <span className="text-xs tabular-nums text-ink-500">{fmt(a.muscles.reduce((t, m) => t + m.completed, 0))} done</span>
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:px-5">
          <span>Muscle</span><span className="w-[4.5rem] text-right">Done / target</span><span className="w-12 text-right">Left</span>
        </div>
        <ul className="divide-y divide-ink-100 dark:divide-ink-800/70">
          {sorted.map((m) => <MuscleRow key={m.muscle} m={m} open={open === m.muscle} onToggle={() => setOpen(open === m.muscle ? null : m.muscle)} />)}
        </ul>
      </Card>

      <WeekStrip />

      <NextWeights />

      <div>
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more} className="flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-ink-600 dark:text-ink-300">
          More details <IconChevronDown size={14} className={cx('transition', more && 'rotate-180')} />
        </button>
        {more && <MoreDetails />}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- Muscle list

function MuscleRow({ m, open, onToggle }: { m: MuscleWeek; open: boolean; onToggle: () => void }) {
  const names = useNames();
  const done = m.remainingToPreferred <= 0;
  return (
    <li id={`row-${m.muscle}`} className={cx('transition-colors', open && 'bg-ink-50/70 dark:bg-ink-950/40')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full px-4 py-2.5 text-left sm:px-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-ink-900 dark:text-white">{names.muscle(m.muscle)}</span>
            {statusChip(m)}
          </span>
          <span className="w-[4.5rem] text-right text-sm tabular-nums text-ink-600 dark:text-ink-300">{fmt(m.completed)} / {fmt(m.target.preferred)}</span>
          <span className={cx('w-12 text-right text-base font-semibold tabular-nums', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-ink-900 dark:text-white')}>{done ? (m.status === 'over' ? 'OVER' : 'DONE') : fmt(m.remainingToPreferred)}</span>
        </div>
        <div className="mt-1.5"><VolumeBar completed={m.completed} min={m.target.min} preferred={m.target.preferred} max={m.target.max} uncertain={m.volume.uncertainEffective} height={4} /></div>
      </button>
      {open && <div className="px-4 pb-4 sm:px-5"><MuscleDetail m={m} /></div>}
    </li>
  );
}

/** One small tag: today's share, or recovery (never both). */
function statusChip(m: MuscleWeek) {
  if (m.todayBlocked || m.recovery.status === 'recovering') return <Badge tone="warn">RECOVERING</Badge>;
  if (m.remainingToPreferred <= 0) return null;
  if (m.todayLeft > 0) return <Badge tone="accent">today {fmt(m.todayLeft)}</Badge>;
  return null;
}

/** Opened on tap: the plain-language reason, the quality breakdown and the exercises for this muscle. */
function MuscleDetail({ m }: { m: MuscleWeek }) {
  const a = useAnalysis();
  const names = useNames();
  const st = m.volume.status;
  const series = a.progression.filter((p) => (a.registry.get(p.exerciseId)?.contributions[m.muscle] ?? 0) >= 0.75).slice(0, 4);
  return (
    <div className="space-y-3 text-sm">
      <p className="leading-relaxed text-ink-700 dark:text-ink-200">
        {fmt(m.completed)} of {fmt(m.target.preferred)} quality sets done{m.target.provisional ? ' (provisional target)' : ''}. {m.todayShare > 0 ? `Today ≈ ${fmt(m.todayShare)}${m.doneToday > 0 ? ` (${fmt(m.doneToday)} done)` : ''}.` : m.todayNote ? `Today: ${m.todayNote}.` : ''}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-ink-50 p-3 text-xs dark:bg-ink-950 sm:grid-cols-4">
        <Fact k="Sets performed" v={fmt(m.volume.rawWorkingSets)} />
        <Fact k="Good quality" v={fmt(st.good - m.volume.goodEstimated)} />
        {m.volume.goodEstimated > 0 && <Fact k="Good (estimated)" v={fmt(m.volume.goodEstimated)} />}
        <Fact k="Too easy" v={fmt(st.easy)} />
        <Fact k="Technique issues" v={fmt(st.compromised)} />
        {st.pain > 0 && <Fact k="Pain flagged" v={fmt(st.pain)} />}
        <Fact k="Uncertain volume" v={fmt(m.volume.uncertainEffective)} />
      </dl>
      <p className="text-xs text-ink-500">{m.justification}</p>
      {series.length > 0 && (
        <ul className="space-y-1.5">
          {series.map((p) => <AdviceRow key={p.key} p={p} />)}
        </ul>
      )}
      <Why label="How this is calculated">
        <p>{m.explanation}</p>
        <p>{m.justification}</p>
        <p>Target {fmt(m.target.min)}–{fmt(m.target.max)} (preferred {fmt(m.target.preferred)}) <ConfidenceBadge c={m.target.confidence} provisional={m.target.provisional} /></p>
        {m.target.rationale.map((r, i) => <p key={i}>{r}</p>)}
        <p className="text-ink-500">Quality sets = direct + indirect fractional sets × set quality (RIR or how the set felt, technique). Warm-ups never count. Numbers are estimates, not a measure of muscle growth. {names.muscle(m.muscle)} recovery: {m.recovery.factors.join(' ')}</p>
      </Why>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-ink-500">{k}</dt>
      <dd className="font-semibold tabular-nums text-ink-800 dark:text-ink-100">{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- Next weights

const ADVICE_TONE: Record<AdviceKind, 'good' | 'info' | 'warn' | 'neutral' | 'violet'> = { increase: 'good', keep: 'info', reduce: 'warn', plateau: 'violet', not_enough_data: 'neutral' };
const ADVICE_RANK: Record<AdviceKind, number> = { reduce: 0, increase: 1, plateau: 2, keep: 3, not_enough_data: 4 };



function AdviceRow({ p }: { p: ProgressionSeries }) {
  const a = useAnalysis();
  const names = useNames();
  const adv = adviceFor(p);
  const def = a.registry.get(p.exerciseId);
  return (
    <li>
      <Link to={`/strength?k=${encodeURIComponent(p.key)}`} className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-3 py-2 dark:border-ink-800 dark:bg-ink-900">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-ink-900 dark:text-white">{names.ex(def, p.exerciseId)}</span>
          <span className="block truncate text-[11px] text-ink-500">{p.scopeLabel}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone={ADVICE_TONE[adv.kind]}>{adviceLabel(p, adv.kind)}</Badge>
        </span>
      </Link>
    </li>
  );
}

/** Exercises trained in the last 3 weeks with one recommendation each; changes first. */
function NextWeights() {
  const a = useAnalysis();
  const [all, setAll] = useState(false);
  const recent = a.progression
    .filter((p) => p.current && diffDays(a.today, p.current.date) <= 21)
    .sort((x, y) => ADVICE_RANK[adviceFor(x).kind] - ADVICE_RANK[adviceFor(y).kind] || (y.current?.date ?? '').localeCompare(x.current?.date ?? ''));
  if (!recent.length) return null;
  const shown = all ? recent : recent.slice(0, 6);
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">Next weights</h2>
        <Link to="/strength" className="inline-flex min-h-[40px] items-center text-xs font-medium text-accent-600 dark:text-accent-400">All exercises</Link>
      </div>
      <ul className="space-y-1.5">{shown.map((p) => <AdviceRow key={p.key} p={p} />)}</ul>
      {recent.length > 6 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 min-h-[40px] text-xs font-medium text-ink-500">{all ? 'Show fewer' : `Show all ${recent.length}`}</button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- Effort + body weight (one line each)

function WeekStrip() {
  const a = useAnalysis();
  const data = useData();
  const [add, setAdd] = useState(false);
  const eff = useMemo(() => effortDistribution(data.workouts, a.week), [data.workouts, a.week]);
  const last = latestWeighIn(data.body);
  const avg = rollingAverage(data.body, a.today);
  const trend = weeklyTrend(data.body, a.today);
  const cell = (k: string, v: string) => <span className="flex flex-col"><span className="text-[10px] uppercase tracking-wider text-ink-400">{k}</span><span className="text-sm font-semibold tabular-nums text-ink-900 dark:text-white">{v}</span></span>;
  return (
    <Card className="!py-3">
      {eff.total > 0 && (
        <div className="grid grid-cols-6 gap-1 text-center">
          {cell('RIR 0', String(eff.rir0))}{cell('RIR 1', String(eff.rir1))}{cell('RIR 2', String(eff.rir2))}{cell('3+', String(eff.rir3plus))}{cell('?', String(eff.unknown))}{cell('Avg', eff.avgRir != null ? fmt(eff.avgRir) : '—')}
        </div>
      )}
      <div className={cx('flex items-center justify-between gap-2', eff.total > 0 && 'mt-3 border-t border-ink-100 pt-3 dark:border-ink-800')}>
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
          {cell('Body', last ? `${fmt(last.kg)} kg` : '—')}
          {cell('7-day', avg ? `${fmt(avg.kg)} kg` : '—')}
          {cell('Week', trend != null ? `${trend > 0 ? '+' : ''}${fmt(trend, 2)} kg` : '—')}
        </div>
        <Button size="sm" onClick={() => setAdd(true)}><IconPlus size={14} />Weight</Button>
      </div>
      <AddBodyWeight open={add} onClose={() => setAdd(false)} />
    </Card>
  );
}

// ---------------------------------------------------------------- More details (on demand)

function MoreDetails() {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [mapMode, setMapMode] = useState<BodyMapMode>('volume');
  const lastComplete = [...a.weeks].reverse().find((w) => w.complete);
  const lastReport = lastComplete ? weeklyReport(lastComplete, a, data) : null;
  const totalEffective = a.muscles.reduce((s, m) => s + m.completed, 0);
  const uncertain = a.muscles.reduce((s, m) => s + m.volume.uncertainEffective, 0);
  return (
    <div className="mt-2 space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Body map</span><Segmented size="sm" value={mapMode} onChange={setMapMode} options={[{ value: 'volume', label: 'Volume' }, { value: 'recovery', label: 'Recovery' }]} /></div>
        <BodyMap muscles={a.muscles} mode={mapMode} selected={null} onSelect={(m) => document.getElementById(`row-${m}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} compact />
      </Card>
      <Card>
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <Fact k="Sessions this week" v={a.sessionsThisWeek} />
          <Fact k="Quality sets (all muscles)" v={fmt(totalEffective)} />
          <Fact k="Working sets" v={a.current.totalWorkingSets} />
          <Fact k="Uncertain (estimated, unknown effort or pain)" v={fmt(uncertain)} />
        </dl>
      </Card>
      {lastReport && (
        <Card>
          <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">Last week</span><Link to="/reports" className="inline-flex min-h-[40px] items-center text-xs font-medium text-accent-600 dark:text-accent-400">Weekly report</Link></div>
          <p className="text-xs text-ink-600 dark:text-ink-300">{lastReport.reached.length} of {lastReport.rows.length} muscles at target{lastReport.short.length ? ` · short: ${lastReport.short.map((m) => names.muscle(m)).join(', ')}` : ''}.</p>
        </Card>
      )}
    </div>
  );
}
