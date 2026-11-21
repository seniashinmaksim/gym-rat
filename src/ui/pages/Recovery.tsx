import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MuscleWeek } from '../../domain/analysis';
import { addDays, formatDate } from '../../domain/dates';
import { TRACKED_MUSCLES } from '../../domain/muscles';
import type { RecoveryStatus } from '../../domain/recovery';
import type { DailyLog, MuscleId } from '../../domain/types';
import { store, useData } from '../../lib/store';
import { BodyMap } from '../components/BodyMap';
import { IconChevronDown, IconInfo } from '../components/icons';
import { Badge, Button, Callout, Card, CardTitle, cx, Field, fmt, Input, NumInput, Page, Segmented, toast, Why } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const STATUS: Record<RecoveryStatus, { label: string; tone: 'good' | 'warn' | 'neutral'; bar: string }> = {
  likely_recovered: { label: 'Likely recovered', tone: 'good', bar: 'bg-emerald-500' },
  recovering: { label: 'Recovering', tone: 'warn', bar: 'bg-amber-500' },
  insufficient_data: { label: 'Insufficient data', tone: 'neutral', bar: 'bg-ink-400' },
};
const ORDER: Record<RecoveryStatus, number> = { recovering: 0, likely_recovered: 1, insufficient_data: 2 };

export function RecoveryPage() {
  const a = useAnalysis();
  const [selected, setSelected] = useState<MuscleId | null>(null);
  const [filter, setFilter] = useState<'all' | RecoveryStatus>('all');

  const sorted = useMemo(() => [...a.muscles].sort((x, y) => {
    const o = ORDER[x.recovery.status] - ORDER[y.recovery.status];
    if (o) return o;
    return (x.recovery.readiness ?? 2) - (y.recovery.readiness ?? 2);
  }), [a.muscles]);
  const shown = sorted.filter((m) => filter === 'all' || m.recovery.status === filter);
  const counts = {
    recovering: a.muscles.filter((m) => m.recovery.status === 'recovering').length,
    likely_recovered: a.muscles.filter((m) => m.recovery.status === 'likely_recovered').length,
    insufficient_data: a.muscles.filter((m) => m.recovery.status === 'insufficient_data').length,
  };

  const select = (m: MuscleId) => {
    setSelected(m);
    setFilter('all');
    requestAnimationFrame(() => document.getElementById(`rec-${m}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  return (
    <Page title="Recovery" subtitle="Probabilistic readiness estimates per muscle. Guidance only. The app cannot see the true biological state of a muscle.">
      <Callout tone="info" icon={<IconInfo size={18} />} title="How to read this">
        Estimates combine the <b>size of your last significant session</b> for each muscle (observed), a <b>heuristic recovery window</b> of ~24–72 h, longer after failure sets or new exercises (assumption), and your <b>soreness, sleep and fatigue</b> check-ins (self-reported).
        A muscle below its weekly target is not pushed for more work while it is likely still recovering.
      </Callout>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        <Card>
          <CardTitle hint="Colour = estimated status, intensity = readiness.">Readiness map</CardTitle>
          <BodyMap muscles={a.muscles} mode="recovery" selected={selected} onSelect={select} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {(['recovering', 'likely_recovered', 'insufficient_data'] as RecoveryStatus[]).map((s) => (
              <div key={s} className="rounded-xl bg-ink-50 py-2 dark:bg-ink-950">
                <div className="text-lg font-semibold tabular-nums text-ink-900 dark:text-white">{counts[s]}</div>
                <div className="text-[10px] uppercase tracking-wide text-ink-500">{STATUS[s].label}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">Per muscle</h2>
            <Segmented<'all' | RecoveryStatus> size="sm" value={filter} onChange={setFilter} options={[
              { value: 'all', label: 'All' }, { value: 'recovering', label: 'Recovering' }, { value: 'likely_recovered', label: 'Recovered' }, { value: 'insufficient_data', label: 'No data' },
            ]} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((m) => <RecoveryCard key={m.muscle} m={m} active={selected === m.muscle} onClick={() => setSelected(m.muscle)} />)}
          </div>
          {shown.length === 0 && <p className="py-6 text-center text-sm text-ink-500">No muscles in this category.</p>}
        </div>
      </div>

      <CheckIn />
      <WellnessChart />
    </Page>
  );
}

function RecoveryCard({ m, active, onClick }: { m: MuscleWeek; active: boolean; onClick: () => void }) {
  const names = useNames();
  const r = m.recovery;
  const st = STATUS[r.status];
  const readiness = r.readiness ?? 0;
  const hoursLeft = r.windowHours != null && r.hoursSince != null ? Math.max(0, r.windowHours - r.hoursSince) : null;
  return (
    <div id={`rec-${m.muscle}`} onClick={onClick}
      className={cx('rounded-2xl border bg-white p-4 transition dark:bg-ink-900', active ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-ink-200 dark:border-ink-800')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-ink-900 dark:text-white">{names.muscle(m.muscle)}</div>
          {names.muscleSub(m.muscle) && <div className="text-[11px] text-ink-400">{names.muscleSub(m.muscle)}</div>}
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>

      {r.status !== 'insufficient_data' ? (
        <>
          <div className="mt-3 flex items-baseline justify-between text-xs">
            <span className="text-ink-500">Estimated readiness</span>
            <span className="tabular-nums font-medium text-ink-800 dark:text-ink-100">{Math.round(readiness * 100)}%{hoursLeft ? ` · ~${hoursLeft} h to go` : ''}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-ink-100 dark:bg-ink-800">
            <div className={cx('h-2 rounded-full transition-all', st.bar)} style={{ width: `${Math.round(readiness * 100)}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
            <KV k="Since last" v={r.hoursSince != null ? `${r.hoursSince} h` : '—'} />
            <KV k="Window" v={r.windowHours != null ? `${r.windowHours} h` : '—'} />
            <KV k="Last stimulus" v={r.lastStimulusDate ? `${formatDate(r.lastStimulusDate, { day: 'numeric', month: 'short' })}${r.lastStimulusTime ? `, ${r.lastStimulusTime}${r.lastStimulusTimeSource === 'assumed' ? '?' : ''}` : ''}` : '—'} />
            <KV k="Last sets" v={fmt(r.lastStimulusSets)} />
            <KV k="7-day eff." v={fmt(r.recent7dEffective)} />
            <KV k="7-day dir / ind" v={`${r.recent7dDirect} / ${r.recent7dIndirect}`} />
            <KV k="Exposures 14 d" v={r.exposures14d} />
            <KV k="Soreness" v={r.soreness != null ? `${r.soreness}/4` : '—'} />
            <KV k="Weekly left" v={fmt(m.remainingToPreferred)} />
          </dl>
        </>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-ink-500">No session with enough effective sets for this muscle is on record, so readiness cannot be estimated.
          {r.recent7dEffective > 0 && <> Recent indirect work: {fmt(r.recent7dEffective)} effective sets in 7 days.</>}</p>
      )}

      <div className="mt-3">
        <Why label="Reasoning">
          {r.factors.map((f, i) => <p key={i}>• {f}</p>)}
          <p className="text-ink-400">Heuristic estimate, not a measurement. Recovery varies with experience, nutrition, stress and exercise choice.</p>
        </Why>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-ink-400">{k}</dt>
      <dd className="tabular-nums font-medium text-ink-800 dark:text-ink-100">{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- Daily check-in

function Rating({ value, onChange, labels }: { value: number | null | undefined; onChange: (v: number | null) => void; labels: [string, string] }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(value === n ? null : n)}
            className={cx('h-10 flex-1 rounded-xl border text-sm font-semibold tabular-nums transition',
              value === n ? 'border-accent-500 bg-accent-500 text-ink-950' : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800')}>
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-400"><span>{labels[0]}</span><span>{labels[1]}</span></div>
    </div>
  );
}

const SORE_CLS = ['bg-ink-200 text-ink-700 dark:bg-ink-700 dark:text-ink-200', 'bg-emerald-500/80 text-white', 'bg-amber-400 text-ink-950', 'bg-orange-500 text-white', 'bg-rose-600 text-white'];

function CheckIn() {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const today = a.today;
  const existing = data.daily.find((d) => d.id === today);
  return <CheckInForm key={today + (existing ? 'e' : 'n')} today={today} existing={existing} showOptional={data.settings.showOptionalTracking} names={names} />;
}

function CheckInForm({ today, existing, showOptional, names }: { today: string; existing?: DailyLog; showOptional: boolean; names: ReturnType<typeof useNames> }) {
  const [log, setLog] = useState<DailyLog>(() => existing ?? { id: today, date: today, soreness: {} });
  const [optOpen, setOptOpen] = useState(() => !!(existing && (existing.proteinG ?? existing.calories ?? existing.creatineG ?? existing.wheyServings ?? existing.notes)));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DailyLog>(k: K, v: DailyLog[K]) => setLog((l) => ({ ...l, [k]: v }));
  const setSore = (m: MuscleId, v: number) => setLog((l) => {
    const s = { ...(l.soreness ?? {}) };
    if (s[m] === v) delete s[m];
    else s[m] = v;
    return { ...l, soreness: s };
  });

  const save = async () => {
    setBusy(true);
    try {
      await store.saveDaily({ ...log, id: today, date: today });
      toast('Check-in saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle hint={<>Takes ~20 seconds. Soreness, sleep and fatigue lengthen the recovery estimates. Everything is optional; leave unknown fields blank (blank ≠ 0).</>}
        right={<Badge tone={existing ? 'good' : 'neutral'}>{existing ? 'Saved today' : formatDate(today)}</Badge>}>
        Daily check-in
      </CardTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Sleep last night (hours)"><NumInput value={log.sleepHours} onChange={(v) => set('sleepHours', v)} step={0.25} placeholder="e.g. 7.5" /></Field>
        <Field label="Sleep quality"><Rating value={log.sleepQuality} onChange={(v) => set('sleepQuality', v)} labels={['Poor', 'Excellent']} /></Field>
        <Field label="Energy"><Rating value={log.energy} onChange={(v) => set('energy', v)} labels={['Very low', 'Excellent']} /></Field>
        <Field label="General fatigue"><Rating value={log.fatigue} onChange={(v) => set('fatigue', v)} labels={['Fresh', 'Exhausted']} /></Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-ink-600 dark:text-ink-300">Muscle soreness (0 none · 4 severe). Tap again to clear.</span>
          <span className="flex gap-1">{[0, 1, 2, 3, 4].map((n) => <span key={n} className={cx('rounded px-1.5 text-[10px] font-semibold', SORE_CLS[n])}>{n}</span>)}</span>
        </div>
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {TRACKED_MUSCLES.map((m) => {
            const v = log.soreness?.[m];
            return (
              <div key={m} className="flex items-center justify-between gap-2 py-0.5">
                <span className="truncate text-sm text-ink-700 dark:text-ink-200">{names.muscle(m)}</span>
                <div className="flex shrink-0 gap-1">
                  {[0, 1, 2, 3, 4].map((n) => (
                    <button key={n} type="button" onClick={() => setSore(m, n)} aria-label={`${names.muscle(m)} soreness ${n}`}
                      className={cx('h-10 w-10 rounded-lg text-sm font-semibold tabular-nums transition active:scale-95 sm:h-7 sm:w-7 sm:text-xs',
                        v === n ? SORE_CLS[n] : 'bg-ink-100 text-ink-400 hover:bg-ink-200 dark:bg-ink-850 dark:text-ink-500 dark:hover:bg-ink-800')}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showOptional && (
        <div className="mt-5 rounded-2xl border border-ink-200 dark:border-ink-800">
          <button type="button" onClick={() => setOptOpen(!optOpen)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink-700 dark:text-ink-200">
            Nutrition & supplements (optional)
            <IconChevronDown size={16} className={cx('transition', optOpen && 'rotate-180')} />
          </button>
          {optOpen && (
            <div className="grid gap-3 border-t border-ink-200 p-4 dark:border-ink-800 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Protein (g)"><NumInput value={log.proteinG} onChange={(v) => set('proteinG', v)} /></Field>
              <Field label="Calories (kcal)"><NumInput value={log.calories} onChange={(v) => set('calories', v)} /></Field>
              <Field label="Creatine (g)"><NumInput value={log.creatineG} onChange={(v) => set('creatineG', v)} step={0.5} /></Field>
              <Field label="Whey (servings)"><NumInput value={log.wheyServings} onChange={(v) => set('wheyServings', v)} step={0.5} /></Field>
              <Field label="Notes" className="sm:col-span-2 lg:col-span-4"><Input value={log.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} placeholder="Stress, illness, travel…" /></Field>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={save} disabled={busy}>{existing ? 'Update check-in' : 'Save check-in'}</Button>
      </div>
    </Card>
  );
}

function WellnessChart() {
  const a = useAnalysis();
  const data = useData();
  const rows = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(a.today, -i);
      const log = data.daily.find((x) => x.date === d);
      const ws = data.workouts.filter((w) => w.date === d && w.wellness);
      const sleep = log?.sleepHours ?? ws.map((w) => w.wellness?.sleepHours).find((x) => x != null) ?? null;
      const fatigue = log?.fatigue ?? ws.map((w) => w.wellness?.fatigue).find((x) => x != null) ?? null;
      const soreVals = Object.values(log?.soreness ?? {}).filter((x): x is number => x != null);
      out.push({ day: formatDate(d, { day: 'numeric', month: 'short' }), sleep, fatigue, soreness: soreVals.length ? Math.max(...soreVals) : null });
    }
    return out;
  }, [a.today, data.daily, data.workouts]);
  const hasAny = rows.some((r) => r.sleep != null || r.fatigue != null || r.soreness != null);

  return (
    <Card>
      <CardTitle hint="Sleep in hours (bars, left axis); fatigue 1–5 and peak soreness 0–4 (lines, right axis). Gaps = nothing logged.">Last 14 days</CardTitle>
      {!hasAny ? (
        <p className="py-8 text-center text-sm text-ink-500">No check-ins yet. Daily check-ins make recovery estimates and deload signals more reliable.</p>
      ) : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="h" tickLine={false} axisLine={false} domain={[0, 10]} />
              <YAxis yAxisId="s" orientation="right" tickLine={false} axisLine={false} domain={[0, 5]} width={28} />
              <Tooltip cursor={{ fill: 'rgba(135,145,165,0.08)' }} />
              <Bar yAxisId="h" dataKey="sleep" name="Sleep (h)" fill="#0ea5e9" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
              <Line yAxisId="s" dataKey="fatigue" name="Fatigue (1–5)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
              <Line yAxisId="s" dataKey="soreness" name="Peak soreness (0–4)" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
