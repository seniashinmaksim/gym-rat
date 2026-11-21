import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts';
import { formatDate, formatDuration } from '../../domain/dates';
import { defaultIncrement, warmupFor, type ProgressionSeries, type TrendClass } from '../../domain/progression';
import { useData } from '../../lib/store';
import { IconAlert, IconSearch, IconTrend } from '../components/icons';
import { Badge, Callout, Card, CardTitle, Empty, Input, Page, Segmented, Stat, Table, Td, Why, cx, fmt } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const TREND_TONE: Record<TrendClass, 'good' | 'info' | 'warn' | 'bad' | 'neutral'> = {
  progressing: 'good',
  stable: 'info',
  plateau: 'warn',
  declining: 'bad',
  insufficient_data: 'neutral',
};
const TREND_LABEL: Record<TrendClass, string> = {
  progressing: 'Progressing',
  stable: 'Stable',
  plateau: 'Possible plateau',
  declining: 'Declining',
  insufficient_data: 'Not enough data',
};
const ACTION_LABEL = { increase: 'Increase load', hold: 'Keep load', reduce: 'Reduce load', calibrate: 'Calibrate' } as const;
const ACTION_TONE = { increase: 'good', hold: 'info', reduce: 'warn', calibrate: 'neutral' } as const;

type Filter = 'all' | TrendClass;

export function StrengthPage() {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null);

  const eqById = useMemo(() => new Map(data.equipment.map((e) => [e.id, e])), [data.equipment]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = a.progression.filter((p) => {
      if (filter !== 'all' && p.trend.cls !== filter) return false;
      if (!needle) return true;
      const def = a.registry.get(p.exerciseId);
      const hay = [def?.name.en, def?.name.ru, p.exerciseId, p.scopeLabel].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
    const m = new Map<string, ProgressionSeries[]>();
    for (const p of filtered) {
      const arr = m.get(p.exerciseId) ?? [];
      arr.push(p);
      m.set(p.exerciseId, arr);
    }
    return [...m.entries()].sort((x, y) => (y[1][0].current?.date ?? '').localeCompare(x[1][0].current?.date ?? ''));
  }, [a.progression, a.registry, q, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { progressing: 0, stable: 0, plateau: 0, declining: 0, insufficient_data: 0 };
    a.progression.forEach((p) => c[p.trend.cls]++);
    return c;
  }, [a.progression]);

  const sel = a.progression.find((p) => p.key === selected) ?? null;

  if (!a.progression.length) {
    return (
      <Page title="Strength progression" subtitle="Per exercise and per machine.">
        <Empty title="No strength history yet">Log working sets with weight, reps and RIR. After 3 sessions on the same exercise and machine, trends appear here.</Empty>
      </Page>
    );
  }

  return (
    <Page title="Strength progression" subtitle="Each exercise × equipment instance is tracked as its own history.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Progressing" value={counts.progressing} tone="good" sub="exercise histories" />
        <Stat label="Stable" value={counts.stable} sub="holding steady" />
        <Stat label="Plateau / declining" value={counts.plateau + counts.declining} tone={counts.plateau + counts.declining ? 'warn' : undefined} sub={`${counts.plateau} plateau · ${counts.declining} declining`} />
        <Stat label="Calibrating" value={counts.insufficient_data} sub="< 3 comparable sessions" />
      </div>

      <Callout tone="info" icon={<IconAlert size={16} />}>
        Different machines are tracked separately; numbers are not comparable across machines. The performance index is an Epley-style estimate (weight × reps + RIR), useful only for comparing sessions on the same equipment — it is not a true 1RM and does not measure muscle growth.
      </Callout>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input placeholder="Search exercise or machine" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <div className="overflow-x-auto">
          <Segmented<Filter>
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'progressing', label: 'Progressing' },
              { value: 'stable', label: 'Stable' },
              { value: 'plateau', label: 'Plateau' },
              { value: 'declining', label: 'Declining' },
              { value: 'insufficient_data', label: 'New' },
            ]}
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          {groups.length === 0 && <Empty title="No matches">Try another search or filter.</Empty>}
          {groups.map(([exerciseId, series]) => {
            const def = a.registry.get(exerciseId);
            return (
              <div key={exerciseId}>
                <div className="mb-2 flex items-baseline gap-2 px-1">
                  <h2 className="text-sm font-semibold text-ink-900 dark:text-white">{names.ex(def, exerciseId)}</h2>
                  {names.exSub(def) && <span className="text-xs text-ink-500">{names.exSub(def)}</span>}
                  {series.length > 1 && <Badge>{series.length} machines</Badge>}
                </div>
                <div className="space-y-2">
                  {series.map((p) => (
                    <SeriesCard key={p.key} p={p} active={p.key === selected} onClick={() => setSelected(p.key === selected ? null : p.key)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          {sel ? (
            <SeriesDetail p={sel} incrementFor={(p) => {
              const eq = p.equipmentId ? eqById.get(p.equipmentId) : undefined;
              return eq?.incrementsKg?.length ? Math.min(...eq.incrementsKg) : defaultIncrement(a.registry.get(p.exerciseId)?.equipmentKind, p.loadMode);
            }} />
          ) : (
            <Card>
              <div className="flex flex-col items-center py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-600 dark:text-accent-400"><IconTrend size={22} /></span>
                <div className="mt-3 text-sm font-semibold text-ink-900 dark:text-white">Select an exercise history</div>
                <p className="mt-1 max-w-xs text-xs text-ink-500">Charts, session table, next-load suggestion and warm-up plan appear here.</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function SeriesCard({ p, active, onClick }: { p: ProgressionSeries; active: boolean; onClick: () => void }) {
  const cur = p.current;
  const prev = p.previous;
  const top = (s: typeof cur) => (s ? `${s.topWeight != null ? `${fmt(s.topWeight, 2)} kg × ` : ''}${s.topReps ?? '?'}${s.topRir != null ? ` @${s.topRir}` : ''}` : '—');
  const delta = cur?.index != null && prev?.index != null ? cur.index - prev.index : null;
  return (
    <button
      onClick={onClick}
      className={cx(
        'w-full rounded-2xl border bg-white p-3.5 text-left transition dark:bg-ink-900',
        active ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-ink-200 hover:border-ink-300 dark:border-ink-800 dark:hover:border-ink-700',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-ink-500">{p.scopeLabel}</div>
          <div className="mt-0.5 text-sm tabular-nums text-ink-900 dark:text-white">
            <span className="font-semibold">{top(cur)}</span>
            <span className="text-xs text-ink-400"> · prev {top(prev)}</span>
          </div>
        </div>
        <Badge tone={TREND_TONE[p.trend.cls]}>{TREND_LABEL[p.trend.cls]}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
        <span>{p.sessions.length} session{p.sessions.length === 1 ? '' : 's'}</span>
        {cur && <span>last {formatDate(cur.date)}</span>}
        {delta != null && (
          <span className={cx('tabular-nums', delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : delta < 0 ? 'text-rose-600 dark:text-rose-400' : '')}>
            index {delta > 0 ? '+' : ''}{fmt(delta)}
          </span>
        )}
        <span className="ml-auto">
          <Badge tone={ACTION_TONE[p.next.action]}>{ACTION_LABEL[p.next.action]}{p.next.weight != null && p.next.action !== 'calibrate' ? ` · ${fmt(p.next.weight, 2)} kg` : ''}</Badge>
        </span>
      </div>
    </button>
  );
}

function SeriesDetail({ p, incrementFor }: { p: ProgressionSeries; incrementFor: (p: ProgressionSeries) => number }) {
  const a = useAnalysis();
  const names = useNames();
  const def = a.registry.get(p.exerciseId);
  const inc = incrementFor(p);
  const warm = warmupFor(def, p.next.weight, inc, 0);
  const chart = p.sessions.map((s) => ({
    date: s.date.slice(5),
    index: s.index,
    top: s.topWeight,
    reps: s.totalReps,
    rir: s.avgRir,
  }));
  const loadLabel = p.loadMode === 'per_side' ? ' per side' : p.loadMode === 'assisted' ? ' assistance' : p.loadMode === 'bodyweight_plus' ? ' added' : '';

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle hint={`${p.scopeLabel}${def ? ` · rep range ${def.repRange[0]}–${def.repRange[1]}` : ''}`} right={<Badge tone={TREND_TONE[p.trend.cls]}>{TREND_LABEL[p.trend.cls]}</Badge>}>
          {names.ex(def, p.exerciseId)}
        </CardTitle>
        <Why label="Trend evidence">
          <p>{p.trend.evidence}</p>
          <p className="text-ink-500">Classification uses up to 6 sessions from the last 8 weeks on this exact equipment. ≥ +1%/session = progressing; ≤ −1.5% with a lower latest session = declining; no new best for 2 sessions over ≥ 3 weeks = possible plateau. Strength trends describe performance, not muscle growth.</p>
        </Why>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniStat label="Current top set" value={p.current?.topWeight != null ? `${fmt(p.current.topWeight, 2)} kg` : '—'} sub={p.current ? `× ${p.current.topReps ?? '?'}${p.current.topRir != null ? ` @ RIR ${p.current.topRir}` : ''}` : ''} />
          <MiniStat label="Previous" value={p.previous?.topWeight != null ? `${fmt(p.previous.topWeight, 2)} kg` : '—'} sub={p.previous ? `× ${p.previous.topReps ?? '?'}${p.previous.topRir != null ? ` @ RIR ${p.previous.topRir}` : ''}` : ''} />
          <MiniStat label="Best" value={p.best.weight != null ? `${fmt(p.best.weight, 2)} kg` : p.best.reps != null ? `${p.best.reps} reps` : '—'} sub={p.best.date ? `${p.best.reps != null && p.best.weight != null ? `× ${p.best.reps} · ` : ''}${formatDate(p.best.date)}` : ''} />
        </div>
      </Card>

      <Card>
        <CardTitle hint="Suggestion for the next session on this machine (double progression)." right={<Badge tone={ACTION_TONE[p.next.action]}>{ACTION_LABEL[p.next.action]}</Badge>}>
          Next session
        </CardTitle>
        <div className="grid grid-cols-3 gap-2">
          <MiniStat label="Working weight" value={p.next.weight != null ? `${fmt(p.next.weight, 2)} kg` : '—'} sub={loadLabel ? loadLabel.trim() : 'estimate'} />
          <MiniStat label="Rep target" value={`${p.next.repTarget[0]}–${p.next.repTarget[1]}`} sub="per working set" />
          <MiniStat label="Target RIR" value={`≤ ${p.next.rirTarget}`} sub={`step ${fmt(inc, 2)} kg`} />
        </div>
        <div className="mt-3"><Why><p>{p.next.reason}</p><p className="text-ink-500">Loads only increase after all working sets reach the top of the range at the intended effort in two consecutive sessions; a single good set never triggers an increase.</p></Why></div>

        <div className="mt-4 border-t border-ink-100 pt-3 dark:border-ink-800">
          <div className="mb-2 text-xs font-semibold text-ink-700 dark:text-ink-200">Suggested warm-up</div>
          {warm.sets.length ? (
            <div className="flex flex-wrap gap-2">
              {warm.sets.map((s, i) => (
                <span key={i} className="rounded-lg bg-ink-100 px-2.5 py-1 text-xs tabular-nums text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                  {s.weight != null ? `${fmt(s.weight, 2)} kg` : 'BW'} × {s.reps}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-ink-500">No warm-up sets needed.</span>
          )}
          <p className="mt-2 text-[11px] text-ink-500">{warm.reason} Assumes this is the first exercise for these muscles — skip ramp sets if they are already warm.</p>
        </div>
      </Card>

      {p.sessions.length >= 2 ? (
        <>
          <Card>
            <CardTitle hint="Epley-style estimate from your best set incl. RIR. Same equipment only.">Performance index (this machine only)</CardTitle>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis yAxisId="l" tickLine={false} axisLine={false} domain={['auto', 'auto']} />
                  <YAxis yAxisId="r" orientation="right" hide domain={['auto', 'auto']} />
                  <Tooltip />
                  <Line yAxisId="l" type="monotone" dataKey="index" name="Performance index" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                  <Line yAxisId="r" type="monotone" dataKey="top" name="Top weight (kg)" stroke="#8791a5" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardTitle hint="Working sets only">Total reps</CardTitle>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'rgba(135,145,165,0.1)' }} />
                    <Bar dataKey="reps" name="Total reps" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card>
              <CardTitle hint="Lower = closer to failure">Average RIR</CardTitle>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: -24 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} reversed domain={[0, 'auto']} allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="rir" name="Avg RIR" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Callout tone="info">One session recorded on this equipment — charts appear after the second session; trends after the third.</Callout>
      )}

      <Card>
        <CardTitle hint="Newest first">Sessions</CardTitle>
        <Table head={['Date', 'Sets (kg × reps @RIR)', 'Index', 'Reps', 'Avg RIR', 'Avg rest']} dense>
          {[...p.sessions].reverse().map((s) => (
            <tr key={s.workoutId + s.date}>
              <Td right={false}>{formatDate(s.date)}</Td>
              <Td className="max-w-[260px] whitespace-normal text-xs">
                {s.sets.map((x) => `${x.weight != null ? fmt(x.weight, 2) : 'BW'}×${x.reps ?? '?'}${x.rir != null ? `@${x.rir}` : ''}`).join(', ')}
              </Td>
              <Td>{fmt(s.index)}</Td>
              <Td>{s.totalReps}</Td>
              <Td>{fmt(s.avgRir)}</Td>
              <Td>{formatDuration(s.restAvgSec)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-ink-50 p-2.5 dark:bg-ink-950">
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-ink-900 dark:text-white">{value}</div>
      {sub && <div className="text-[11px] tabular-nums text-ink-500">{sub}</div>}
    </div>
  );
}
