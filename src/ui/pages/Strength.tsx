import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, formatDuration } from '../../domain/dates';
import { FEEL_BY_ID, formatRirRange, EFFORT_RIR_ESTIMATE } from '../../domain/feedback';
import { adviceFor, defaultIncrement, loadMap, loadMapNote, warmupFor, type AdviceKind, type ProgressionSeries, type SetPoint } from '../../domain/progression';
import { loadUnitLabel } from '../../domain/registry';
import { useData } from '../../lib/store';
import { IconChevronDown, IconSearch } from '../components/icons';
import { Badge, Card, Empty, Input, Page, Segmented, Table, Td, cx, fmt } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

/**
 * Strength — simple on the surface: one recommendation per exercise history and one chart.
 * The analysis behind it (benchmark sets, feedback, rest, plateau checks, load calibration) lives in
 * src/domain/progression.ts; details open on demand.
 */

const ADVICE_TONE: Record<AdviceKind, 'good' | 'info' | 'warn' | 'neutral' | 'violet'> = { increase: 'good', keep: 'info', reduce: 'warn', plateau: 'violet', not_enough_data: 'neutral' };

export function StrengthPage() {
  const a = useAnalysis();
  const names = useNames();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const selected = params.get('k');
  const setSelected = (k: string | null) => setParams(k ? { k } : {}, { replace: true });

  useEffect(() => {
    if (selected) window.setTimeout(() => document.getElementById('series-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [selected]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = a.progression.filter((p) => {
      if (!needle) return true;
      const def = a.registry.get(p.exerciseId);
      return [def?.name.en, def?.name.ru, p.exerciseId, p.scopeLabel].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
    const m = new Map<string, ProgressionSeries[]>();
    for (const p of filtered) m.set(p.exerciseId, [...(m.get(p.exerciseId) ?? []), p]);
    return [...m.entries()].sort((x, y) => (y[1][0].current?.date ?? '').localeCompare(x[1][0].current?.date ?? ''));
  }, [a.progression, a.registry, q]);

  const sel = a.progression.find((p) => p.key === selected) ?? null;

  if (!a.progression.length) {
    return (
      <Page title="Strength" subtitle="Per exercise and per machine.">
        <Empty title="No strength history yet">Log working sets with weight and reps (and RIR or how the set felt). Recommendations get reliable after a few comparable sessions on the same exercise and machine.</Empty>
      </Page>
    );
  }

  return (
    <Page title="Strength" subtitle="One recommendation per exercise. Each machine and configuration has its own history.">
      <div className="relative">
        <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input placeholder="Search exercise or machine" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={cx('space-y-4', sel && 'hidden lg:block')}>
          {groups.length === 0 && <Empty title="No matches">Try another search.</Empty>}
          {groups.map(([exerciseId, series]) => (
            <div key={exerciseId}>
              <h2 className="mb-1.5 px-1 text-sm font-semibold text-ink-900 dark:text-white">{names.ex(a.registry.get(exerciseId), exerciseId)}</h2>
              <div className="space-y-2">
                {series.map((p) => <SeriesCard key={p.key} p={p} active={p.key === selected} onClick={() => setSelected(p.key === selected ? null : p.key)} />)}
              </div>
            </div>
          ))}
        </div>
        <div id="series-detail" className="scroll-mt-20 lg:sticky lg:top-4 lg:self-start">
          {sel ? <SeriesDetail p={sel} onBack={() => setSelected(null)} /> : (
            <Card className="hidden lg:block"><p className="py-10 text-center text-sm text-ink-500">Select an exercise to see its chart and recommendation.</p></Card>
          )}
        </div>
      </div>
    </Page>
  );
}

const isBodyweight = (p: ProgressionSeries) => p.loadMode === 'bodyweight_plus' && (p.current?.topWeight ?? 0) === 0;

function SeriesCard({ p, active, onClick }: { p: ProgressionSeries; active: boolean; onClick: () => void }) {
  const adv = adviceFor(p);
  const bw = isBodyweight(p);
  const cur = p.current;
  return (
    <button type="button" onClick={onClick}
      className={cx('flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border bg-white px-3.5 py-2.5 text-left transition dark:bg-ink-900',
        active ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-ink-200 dark:border-ink-800')}>
      <span className="min-w-0">
        <span className="block truncate text-xs text-ink-500">{p.scopeLabel}</span>
        <span className="block text-sm tabular-nums text-ink-900 dark:text-white">
          {cur ? <>{bw || cur.topWeight == null ? '' : `${fmt(cur.topWeight, 2)} kg × `}{cur.topReps ?? '?'}{bw ? ' reps' : ''}</> : '—'}
          {cur && <span className="text-xs text-ink-400"> · {formatDate(cur.date, { day: 'numeric', month: 'short' })}</span>}
        </span>
      </span>
      <Badge tone={ADVICE_TONE[adv.kind]}>{adv.label}{(adv.kind === 'increase' || adv.kind === 'reduce') && p.next.weight != null ? ` · ${fmt(p.next.weight, 2)} kg` : ''}</Badge>
    </button>
  );
}

type ChartMode = 'weight' | 'reps' | 'both';

function SeriesDetail({ p, onBack }: { p: ProgressionSeries; onBack: () => void }) {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [mode, setMode] = useState<ChartMode>('both');
  const def = a.registry.get(p.exerciseId);
  const adv = adviceFor(p);
  const bw = isBodyweight(p);
  const unit = loadUnitLabel(def, p.loadMode);
  const eq = p.equipmentId ? data.equipment.find((e) => e.id === p.equipmentId) : undefined;
  const inc = eq?.incrementsKg?.length ? Math.min(...eq.incrementsKg) : defaultIncrement(def?.equipmentKind, p.loadMode);
  const chart = p.sessions.map((s) => ({
    date: s.date.slice(5),
    weight: bw ? null : s.topWeight,
    reps: s.topReps,
    flagged: !s.representative,
  }));
  const loads = loadMap(p);
  const loadNote = loadMapNote(loads);
  const warm = warmupFor(def, p.next.weight, inc, 0);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent-600 lg:hidden dark:text-accent-400">← All exercises</button>
      <Card>
        <h2 className="text-base font-semibold text-ink-900 dark:text-white">{names.ex(def, p.exerciseId)}</h2>
        <p className="text-xs text-ink-500">{p.scopeLabel} · {unit}{def ? ` · ${def.repRange[0]}–${def.repRange[1]} reps` : ''}</p>
        <div className={cx('mt-3 rounded-xl border p-3', {
          increase: 'border-emerald-500/40 bg-emerald-500/5', keep: 'border-sky-500/30 bg-sky-500/5', reduce: 'border-amber-500/40 bg-amber-500/5',
          plateau: 'border-violet-500/30 bg-violet-500/5', not_enough_data: 'border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-950',
        }[adv.kind])}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-ink-900 dark:text-white">{adv.label}</span>
            {p.next.weight != null && !bw && <span className="text-lg font-semibold tabular-nums">{fmt(p.next.weight, 2)} kg</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-600 dark:text-ink-300">{adv.text}</p>
          <p className="mt-1 text-[11px] text-ink-500">Next: {p.next.repTarget[0]}–{p.next.repTarget[1]} reps, ~{p.next.rirTarget} reps in reserve{!bw ? ` · smallest step ${fmt(inc, 2)} kg` : ''}.</p>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">History</span>
          {!bw && <Segmented<ChartMode> size="sm" value={mode} onChange={setMode} options={[{ value: 'weight', label: 'Weight' }, { value: 'reps', label: 'Reps' }, { value: 'both', label: 'Both' }]} />}
        </div>
        {p.sessions.length >= 2 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                {(mode !== 'reps' && !bw) && <YAxis yAxisId="w" tickLine={false} axisLine={false} domain={['auto', 'auto']} />}
                {(mode !== 'weight' || bw) && <YAxis yAxisId="r" orientation={mode === 'both' && !bw ? 'right' : 'left'} tickLine={false} axisLine={false} allowDecimals={false} domain={['auto', 'auto']} />}
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(mode !== 'reps' && !bw) && <Line yAxisId="w" type="monotone" dataKey="weight" name="Top weight (kg)" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />}
                {(mode !== 'weight' || bw) && <Line yAxisId="r" type="monotone" dataKey="reps" name="Reps (top set)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-xs text-ink-500">The chart appears after the second session.</p>}
        {p.sessions.some((s) => !s.representative) && <p className="mt-1 text-[11px] text-ink-500">Sessions flagged as wrong weight, pain or broken technique are shown but not used to judge progress.</p>}
      </Card>

      <Section title="Set-by-set feedback" hint="Every working set, as recorded">
        <FeedbackTable p={p} />
      </Section>

      <Section title="Your loads" hint={loadNote ?? 'Tap how sets felt to calibrate'}>
        {loads.length ? (
          <ul className="space-y-1 text-xs">
            {loads.map((l) => (
              <li key={l.weight} className="flex items-center justify-between gap-2">
                <span className="tabular-nums font-medium">{fmt(l.weight, 2)} kg <span className="font-normal text-ink-500">· {l.sets} set{l.sets === 1 ? '' : 's'}</span></span>
                <Badge tone={{ right: 'good', too_easy: 'info', too_heavy: 'warn', mixed: 'neutral', no_feedback: 'neutral' }[l.verdict] as 'good'}>{{ right: 'feels right', too_easy: 'too easy', too_heavy: 'too heavy', mixed: 'mixed', no_feedback: 'not rated' }[l.verdict]}</Badge>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink-500">No loads yet.</p>}
        <p className="mt-2 text-[11px] text-ink-500">Learned only for this exercise on this equipment and configuration — the same number on another machine can feel completely different.</p>
      </Section>

      <Section title="Personal bests">
        <PersonalBests p={p} bw={bw} />
      </Section>

      <Section title="Effort & rest">
        <Table head={['Date', 'Avg RIR', 'Avg rest', 'Trend note']} dense>
          {[...p.sessions].reverse().map((s) => (
            <tr key={s.workoutId + s.date}>
              <Td right={false}>{formatDate(s.date, { day: 'numeric', month: 'short' })}</Td>
              <Td>{fmt(s.avgRir)}</Td>
              <Td>{formatDuration(s.restAvgSec)}</Td>
              <Td className="whitespace-normal text-[11px]">{!s.representative ? 'not a benchmark' : s.fatigued ? 'high fatigue / short sleep' : ''}</Td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-[11px] text-ink-500">{p.trend.evidence}</p>
      </Section>

      <Section title="Warm-up" hint={warm.sets.length ? warm.sets.map((s) => `${s.weight != null ? `${fmt(s.weight, 2)} kg` : 'BW'} × ${s.reps}`).join(' → ') : 'none needed'}>
        <p className="text-xs text-ink-500">{warm.reason} Assumes this is your first exercise for these muscles.</p>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left sm:px-5">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900 dark:text-white">{title}</span>
          {hint && <span className="block truncate text-[11px] text-ink-500">{hint}</span>}
        </span>
        <IconChevronDown size={16} className={cx('shrink-0 text-ink-400 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-ink-100 px-4 py-3 dark:border-ink-800 sm:px-5">{children}</div>}
    </Card>
  );
}

function feelText(x: SetPoint): string {
  if (x.feel) return FEEL_BY_ID[x.feel].label;
  return '—';
}

function FeedbackTable({ p }: { p: ProgressionSeries }) {
  const rows = [...p.sessions].reverse().flatMap((s) => s.sets.map((x, i) => ({ s, x, i })));
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[340px] text-xs tabular-nums">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-ink-400"><th className="px-4 py-1 sm:px-0">Date</th><th>kg</th><th>Reps</th><th>Felt</th><th className="pr-4 text-right sm:pr-0">RIR</th></tr></thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {rows.map(({ s, x, i }) => (
            <tr key={`${s.workoutId}-${i}`} className={cx(!x.benchmark && 'text-ink-400')}>
              <td className="px-4 py-1.5 sm:px-0">{i === 0 ? formatDate(s.date, { day: 'numeric', month: 'short' }) : ''}</td>
              <td>{x.side ? `${x.side === 'left' ? 'L' : 'R'} ` : ''}{x.weight != null ? fmt(x.weight, 2) : 'BW'}</td>
              <td>{x.reps ?? '?'}</td>
              <td className="max-w-[120px] truncate" title={x.excluded ? `Not a benchmark: ${x.excluded}` : ''}>{feelText(x)}{x.excluded ? ' ⚑' : ''}</td>
              <td className="pr-4 text-right sm:pr-0">{x.rir != null ? x.rir : x.effort ? <span className="text-ink-400">≈{formatRirRange(EFFORT_RIR_ESTIMATE[x.effort])}</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-4 text-[11px] text-ink-500 sm:px-0">⚑ = kept but not used to judge progress (wrong weight, pain or broken technique). ≈ = RIR estimated from how the set felt, not logged.</p>
    </div>
  );
}

/** Heaviest working set (any reps) and most reps in one set, from this history only. */
function PersonalBests({ p, bw }: { p: ProgressionSeries; bw: boolean }) {
  let heaviest: { weight: number; reps: number; date: string } | null = null;
  let mostReps: { weight: number | null; reps: number; date: string } | null = null;
  const assisted = p.loadMode === 'assisted';
  for (const s of p.sessions) for (const x of s.sets) {
    if (!x.benchmark || x.reps == null || x.reps <= 0) continue; // a wrong-weight or broken-technique set is not a PR
    if (x.weight != null && (!heaviest || (assisted ? x.weight < heaviest.weight : x.weight > heaviest.weight) || (x.weight === heaviest.weight && x.reps > heaviest.reps))) heaviest = { weight: x.weight, reps: x.reps, date: s.date };
    if (!mostReps || x.reps > mostReps.reps || (x.reps === mostReps.reps && (x.weight ?? 0) > (mostReps.weight ?? 0))) mostReps = { weight: x.weight, reps: x.reps, date: s.date };
  }
  return (
    <dl className="grid grid-cols-2 gap-3 text-xs">
      {!bw && <div><dt className="text-ink-500">Heaviest</dt><dd className="text-sm font-semibold tabular-nums">{heaviest ? `${fmt(heaviest.weight, 2)} kg × ${heaviest.reps}` : '—'}</dd><dd className="text-ink-400">{heaviest ? formatDate(heaviest.date) : ''}</dd></div>}
      <div><dt className="text-ink-500">Most reps</dt><dd className="text-sm font-semibold tabular-nums">{mostReps ? `${mostReps.reps}${mostReps.weight != null && !bw ? ` @ ${fmt(mostReps.weight, 2)} kg` : ''}` : '—'}</dd><dd className="text-ink-400">{mostReps ? formatDate(mostReps.date) : ''}</dd></div>
    </dl>
  );
}
