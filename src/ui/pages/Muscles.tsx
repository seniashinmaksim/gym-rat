import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, CartesianGrid, Legend, Line, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { statusLabel, type MuscleWeek, type WeekStatus } from '../../domain/analysis';
import { formatDate } from '../../domain/dates';
import { MUSCLE_BY_ID, TRACKED_MUSCLES } from '../../domain/muscles';
import type { MuscleId, MusclePriority } from '../../domain/types';
import { store, useData } from '../../lib/store';
import { IconEdit, IconInfo } from '../components/icons';
import {
  Badge, Button, Callout, Card, CardTitle, ConfidenceBadge, cx, Field, fmt, Input, Modal, NumInput, Page, Segmented, Select, Stat,
  Table, Td, toast, VolumeBar, Why,
} from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const STATUS_TONE: Record<WeekStatus, 'good' | 'violet' | 'info' | 'warn' | 'bad' | 'neutral'> = {
  done: 'good', over: 'violet', on_track: 'info', behind: 'warn', at_risk: 'bad', no_data: 'neutral',
};

const GROUP_COLORS: Record<string, string> = { push: '#14b8a6', pull: '#0ea5e9', arms: '#8b5cf6', legs: '#f59e0b', core: '#f43f5e' };
const GROUP_LABEL: Record<string, string> = { push: 'Chest & shoulders', pull: 'Back', arms: 'Arms', legs: 'Legs', core: 'Core' };

type SortKey = 'remaining' | 'pct' | 'name';

export function MusclesPage() {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [sort, setSort] = useState<SortKey>('remaining');
  const [editing, setEditing] = useState<MuscleId | null>(null);

  const rows = useMemo(() => {
    const r = [...a.muscles];
    if (sort === 'remaining') r.sort((x, y) => y.remainingToPreferred - x.remainingToPreferred || x.pctOfPreferred - y.pctOfPreferred);
    else if (sort === 'pct') r.sort((x, y) => x.pctOfPreferred - y.pctOfPreferred);
    else r.sort((x, y) => names.muscle(x.muscle).localeCompare(names.muscle(y.muscle)));
    return r;
  }, [a.muscles, sort, names]);

  const totals = useMemo(() => {
    const eff = a.muscles.reduce((s, m) => s + m.completed, 0);
    const remaining = a.muscles.reduce((s, m) => s + m.remainingToPreferred, 0);
    const met = a.muscles.filter((m) => m.status === 'done' || m.status === 'over').length;
    const uncertain = a.muscles.reduce((s, m) => s + m.volume.uncertainEffective, 0);
    return { eff, remaining, met, uncertain };
  }, [a.muscles]);

  const weekLabel = `${formatDate(a.week.start, { day: 'numeric', month: 'short' })} – ${formatDate(a.week.end, { day: 'numeric', month: 'short' })}`;

  return (
    <Page
      title="Muscle analytics"
      subtitle={<>Week {weekLabel} · {a.sessionsThisWeek} session{a.sessionsThisWeek === 1 ? '' : 's'} · {a.daysLeft} day{a.daysLeft === 1 ? '' : 's'} left</>}
      actions={<Segmented<SortKey> size="sm" value={sort} onChange={setSort} options={[{ value: 'remaining', label: 'Most remaining' }, { value: 'pct', label: 'Least done' }, { value: 'name', label: 'A–Z' }]} />}
    >
      {a.learning.active && (
        <Callout tone="warn" icon={<IconInfo size={18} />} title="Targets are provisional">
          {a.learning.message} Reference ranges come from the hypertrophy literature, not from your data yet — they are orientation, not quotas.
        </Callout>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Effective sets" value={fmt(totals.eff)} sub="all muscles, this week" />
        <Stat label="Remaining" value={fmt(totals.remaining)} sub="to preferred targets" tone={totals.remaining > 0 ? 'warn' : 'good'} />
        <Stat label="Targets met" value={`${totals.met}/${a.muscles.length}`} sub="muscles at or above target" tone={totals.met === a.muscles.length ? 'good' : undefined} />
        <Stat label="Uncertain" value={fmt(totals.uncertain)} sub="effective sets lacking RIR" tone={totals.uncertain > 0 ? 'warn' : undefined} />
      </div>

      <SetLegend />

      {/* Desktop / tablet table */}
      <Card className="hidden sm:block" padded={false}>
        <div className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle hint="Tap the pencil to inspect a target's reasoning, override it, or change the muscle's priority.">This week, every muscle</CardTitle>
        </div>
        <Table head={['Muscle', 'Target', 'Effective', 'Direct', 'Indirect', 'Fractional', 'Eff. dir / ind', 'Uncertain', 'To min', 'To target', '%', 'Status', '']}>
          {rows.map((m) => (
            <tr key={m.muscle} className="hover:bg-ink-50 dark:hover:bg-ink-850/60">
              <Td right={false} className="font-medium text-ink-900 dark:text-white">
                <div>{names.muscle(m.muscle)}</div>
                {names.muscleSub(m.muscle) && <div className="text-[11px] font-normal text-ink-400">{names.muscleSub(m.muscle)}</div>}
              </Td>
              <Td>
                <div className="flex flex-col items-end gap-0.5">
                  <span>{fmt(m.target.min)}–<b>{fmt(m.target.preferred)}</b>–{fmt(m.target.max)}</span>
                  <span className="flex gap-1">
                    {m.target.source === 'manual' ? <Badge tone="accent">Manual</Badge> : <ConfidenceBadge c={m.target.confidence} provisional={m.target.provisional} />}
                    {data.settings.priorities[m.muscle] && data.settings.priorities[m.muscle] !== 'normal' && <Badge tone="neutral">{data.settings.priorities[m.muscle]}</Badge>}
                  </span>
                </div>
              </Td>
              <Td className="font-semibold text-ink-900 dark:text-white">{fmt(m.completed)}</Td>
              <Td>{m.volume.directSets}</Td>
              <Td>{m.volume.indirectSets}</Td>
              <Td className="text-ink-500">{fmt(m.volume.fractional)}</Td>
              <Td className="text-ink-500">{fmt(m.volume.effectiveDirect)} / {fmt(m.volume.effectiveIndirect)}</Td>
              <Td className={m.volume.uncertainEffective > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ink-400'}>{fmt(m.volume.uncertainEffective)}</Td>
              <Td>{fmt(m.remainingToMin)}</Td>
              <Td className="font-semibold text-ink-900 dark:text-white">{fmt(m.remainingToPreferred)}</Td>
              <Td>{Math.round(m.pctOfPreferred * 100)}%</Td>
              <Td><Badge tone={STATUS_TONE[m.status]}>{statusLabel(m.status)}</Badge></Td>
              <Td>
                <button onClick={() => setEditing(m.muscle)} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-800 dark:hover:text-white" aria-label={`Edit target for ${names.muscle(m.muscle)}`}>
                  <IconEdit size={15} />
                </button>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {rows.map((m) => <MuscleCard key={m.muscle} m={m} onEdit={() => setEditing(m.muscle)} />)}
      </div>

      <RegionCard />

      <HistoryCard />

      {editing && <TargetEditor muscle={editing} mw={a.muscles.find((x) => x.muscle === editing)!} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function SetLegend() {
  return (
    <Card>
      <div className="grid gap-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300 md:grid-cols-3">
        <div>
          <div className="mb-0.5 font-semibold text-ink-900 dark:text-white">Raw working sets <span className="font-normal text-ink-400">(observed)</span></div>
          Every non-warm-up set you logged that involves the muscle. <b>Direct</b> = the muscle is a primary mover (coefficient ≥ 0.75); <b>Indirect</b> = secondary or minor contributor.
        </div>
        <div>
          <div className="mb-0.5 font-semibold text-ink-900 dark:text-white">Fractional sets <span className="font-normal text-ink-400">(model)</span></div>
          Sum of exercise coefficients — direct 1.0, significant secondary 0.5, minor 0.25 — ignoring effort. Coefficients are practical estimates, not measured activation.
        </div>
        <div>
          <div className="mb-0.5 font-semibold text-ink-900 dark:text-white">Effective sets <span className="font-normal text-ink-400">(estimate)</span></div>
          Fractional sets × effort credit (RIR 0–3 = full credit). Sets without RIR count provisionally and are shown as <span className="text-amber-600 dark:text-amber-400">uncertain</span>.
        </div>
      </div>
    </Card>
  );
}

function MuscleCard({ m, onEdit }: { m: MuscleWeek; onEdit: () => void }) {
  const names = useNames();
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-ink-900 dark:text-white">{names.muscle(m.muscle)}</div>
          {names.muscleSub(m.muscle) && <div className="text-[11px] text-ink-400">{names.muscleSub(m.muscle)}</div>}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={STATUS_TONE[m.status]}>{statusLabel(m.status)}</Badge>
          <button onClick={onEdit} className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Edit target"><IconEdit size={15} /></button>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <div className="tabular-nums">
          <span className="text-2xl font-semibold text-ink-900 dark:text-white">{fmt(m.remainingToPreferred)}</span>
          <span className="ml-1 text-xs text-ink-500">left of {fmt(m.target.preferred)}</span>
        </div>
        <span className="text-xs tabular-nums text-ink-500">{fmt(m.completed)} done</span>
      </div>
      <div className="mt-2"><VolumeBar completed={m.completed} min={m.target.min} preferred={m.target.preferred} max={m.target.max} uncertain={m.volume.uncertainEffective} /></div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
        <MiniStat k="Direct sets" v={m.volume.directSets} />
        <MiniStat k="Indirect sets" v={m.volume.indirectSets} />
        <MiniStat k="Fractional" v={fmt(m.volume.fractional)} />
        <MiniStat k="Eff. direct" v={fmt(m.volume.effectiveDirect)} />
        <MiniStat k="Eff. indirect" v={fmt(m.volume.effectiveIndirect)} />
        <MiniStat k="Uncertain" v={fmt(m.volume.uncertainEffective)} warn={m.volume.uncertainEffective > 0} />
        <MiniStat k="To min" v={fmt(m.remainingToMin)} />
        <MiniStat k="Range" v={`${fmt(m.target.min)}–${fmt(m.target.max)}`} />
        <MiniStat k="Done" v={`${Math.round(m.pctOfPreferred * 100)}%`} />
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.target.source === 'manual' ? <Badge tone="accent">Manual target</Badge> : <ConfidenceBadge c={m.target.confidence} provisional={m.target.provisional} />}
      </div>
      <div className="mt-2">
        <Why>
          <p>{m.explanation}</p>
          <p>{m.justification}</p>
        </Why>
      </div>
    </Card>
  );
}

function MiniStat({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-ink-400">{k}</dt>
      <dd className={cx('tabular-nums font-medium', warn ? 'text-amber-600 dark:text-amber-400' : 'text-ink-800 dark:text-ink-100')}>{v}</dd>
    </div>
  );
}

function RegionCard() {
  const a = useAnalysis();
  const chest = a.current.muscles.chest.effective;
  const up = a.current.regions.upper_chest;
  const low = a.current.regions.lower_chest;
  const share = (v: number) => (chest > 0 ? Math.round((v / chest) * 100) : 0);
  return (
    <Card>
      <CardTitle hint="Upper and lower chest are regions of one muscle (pectoralis major), not separate muscles, so they have no targets of their own. Shown as a share of this week's chest work. Shares can overlap or add up to under 100% because flat work spreads across the whole muscle.">
        Chest regional emphasis
      </CardTitle>
      {chest <= 0 ? (
        <p className="text-sm text-ink-500">No chest work logged this week yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {[{ k: 'Upper chest emphasis', v: up }, { k: 'Lower chest emphasis', v: low }].map(({ k, v }) => (
            <div key={k}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-ink-800 dark:text-ink-100">{k}</span>
                <span className="tabular-nums text-ink-500">{fmt(v.effective)} eff. · {v.sets} sets · <b className="text-ink-900 dark:text-white">{share(v.effective)}%</b></span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-ink-100 dark:bg-ink-800">
                <div className="h-2 rounded-full bg-accent-500" style={{ width: `${Math.min(100, share(v.effective))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-ink-400">Emphasis follows the exercise and the bench angle you record (e.g. 15–45° incline, upper-chest emphasis).</p>
    </Card>
  );
}

function HistoryCard() {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [mode, setMode] = useState<'single' | 'groups'>('single');
  const defaultMuscle = useMemo(() => [...a.muscles].sort((x, y) => y.remainingToPreferred - x.remainingToPreferred)[0]?.muscle ?? 'chest', [a.muscles]);
  const [muscle, setMuscle] = useState<MuscleId>(defaultMuscle);

  const weeks = a.weeks.slice(-16);
  const single = weeks.map((w) => {
    const snap = data.snapshots.find((s) => s.weekStart === w.range.start)?.targets[muscle];
    const mv = w.volume.muscles[muscle];
    return {
      week: w.range.start.slice(5),
      direct: mv.effectiveDirect,
      indirect: mv.effectiveIndirect,
      effective: mv.effective,
      target: snap?.preferred ?? a.targets[muscle].preferred,
    };
  });
  const groups = weeks.map((w) => {
    const row: Record<string, number | string> = { week: w.range.start.slice(5) };
    for (const g of Object.keys(GROUP_COLORS)) row[g] = 0;
    for (const m of TRACKED_MUSCLES) {
      const g = MUSCLE_BY_ID[m].group;
      row[g] = Math.round(((row[g] as number) + w.volume.muscles[m].effective) * 10) / 10;
    }
    return row;
  });
  const t = a.targets[muscle];

  return (
    <Card>
      <CardTitle
        hint={mode === 'single' ? 'Weekly effective sets split into direct and indirect contributions. The dashed line is the target that applied that week (frozen snapshot when available, otherwise the current target).' : 'Weekly effective sets summed by body region. Regions overlap where exercises train several muscles.'}
        right={<Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'single', label: 'One muscle' }, { value: 'groups', label: 'All regions' }]} />}
      >
        Weekly trend
      </CardTitle>
      {weeks.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">Log workouts to build a weekly history.</p>
      ) : mode === 'single' ? (
        <>
          <div className="mb-3 max-w-xs">
            <Select value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleId)} aria-label="Muscle">
              {TRACKED_MUSCLES.map((m) => <option key={m} value={m}>{names.muscle(m)}</option>)}
            </Select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={single} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="week" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(135,145,165,0.08)' }} />
                <Bar dataKey="direct" name="Direct (effective)" stackId="v" fill="#14b8a6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="indirect" name="Indirect (effective)" stackId="v" fill="#5eead4" fillOpacity={0.55} radius={[4, 4, 0, 0]} />
                <Line dataKey="target" name="Target" type="stepAfter" stroke="#8791a5" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
                <ReferenceLine y={t.min} stroke="#f59e0b" strokeOpacity={0.5} strokeDasharray="2 4" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">Amber dotted line: current lower end ({fmt(t.min)}). Volume is always recomputed from raw sets, so edits to exercise coefficients apply retroactively.</p>
        </>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={groups} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip />
              {Object.entries(GROUP_COLORS).map(([g, c]) => (
                <Area key={g} type="monotone" dataKey={g} name={GROUP_LABEL[g]} stackId="g" stroke={c} fill={c} fillOpacity={0.35} />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function TargetEditor({ muscle, mw, onClose }: { muscle: MuscleId; mw: MuscleWeek; onClose: () => void }) {
  const data = useData();
  const names = useNames();
  const existing = data.settings.targetOverrides[muscle];
  const [min, setMin] = useState<number | null>(existing?.min ?? mw.target.min);
  const [pref, setPref] = useState<number | null>(existing?.preferred ?? mw.target.preferred);
  const [max, setMax] = useState<number | null>(existing?.max ?? mw.target.max);
  const [note, setNote] = useState(existing?.note ?? '');
  const [priority, setPriority] = useState<MusclePriority>(data.settings.priorities[muscle] ?? 'normal');
  const [busy, setBusy] = useState(false);
  const ref = MUSCLE_BY_ID[muscle].reference;

  const valid = min != null && pref != null && max != null && min >= 0 && min <= pref && pref <= max && max <= 40;

  const savePriority = async (p: MusclePriority) => {
    const pr = { ...data.settings.priorities };
    if (p === 'normal') delete pr[muscle];
    else pr[muscle] = p;
    await store.saveSettings({ priorities: pr });
  };

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await store.saveSettings({ targetOverrides: { ...data.settings.targetOverrides, [muscle]: { min: min!, preferred: pref!, max: max!, note: note.trim() || undefined } } });
      await savePriority(priority);
      toast(`${names.muscle(muscle)} target saved`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const clearOverride = async () => {
    setBusy(true);
    try {
      const o = { ...data.settings.targetOverrides };
      delete o[muscle];
      await store.saveSettings({ targetOverrides: o });
      await savePriority(priority);
      toast('Returned to the automatic target', 'info');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${names.muscle(muscle)} · weekly target`}
      footer={
        <>
          {existing && <Button variant="ghost" onClick={clearOverride} disabled={busy}>Use automatic</Button>}
          <Button variant="secondary" onClick={async () => { await savePriority(priority); toast('Priority saved'); onClose(); }} disabled={busy}>Save priority only</Button>
          <Button variant="primary" onClick={save} disabled={!valid || busy}>Save override</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-ink-900 dark:text-white">Current: {fmt(mw.target.min)}–{fmt(mw.target.preferred)}–{fmt(mw.target.max)}</span>
            {mw.target.source === 'manual' ? <Badge tone="accent">Manual</Badge> : <ConfidenceBadge c={mw.target.confidence} provisional={mw.target.provisional} />}
            <Badge tone="neutral">source: {mw.target.source}</Badge>
          </div>
          <div className="mt-1 text-xs text-ink-500">
            Personal baseline: {mw.target.baseline != null ? `${fmt(mw.target.baseline)} effective sets/week (median of recent complete weeks)` : 'not enough complete weeks yet'}
            {ref && <> · Literature reference: {ref.min}–{ref.preferred}–{ref.max}</>}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
            {mw.target.rationale.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">Priority</div>
          <Segmented<MusclePriority> value={priority} onChange={setPriority} options={[{ value: 'high', label: 'High' }, { value: 'normal', label: 'Normal' }, { value: 'maintain', label: 'Maintain' }]} />
          <p className="mt-1 text-[11px] text-ink-500">High nudges the automatic target up by ~2 sets (within the upper bound); Maintain lowers it to roughly maintenance volume. Ignored while a manual override is set.</p>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">Manual override (effective sets / week)</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Lower end"><NumInput value={min} onChange={setMin} step={0.5} /></Field>
            <Field label="Preferred"><NumInput value={pref} onChange={setPref} step={0.5} /></Field>
            <Field label="Upper bound"><NumInput value={max} onChange={setMax} step={0.5} /></Field>
          </div>
          {!valid && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">Needs 0 ≤ lower ≤ preferred ≤ upper ≤ 40.</p>}
          <Field label="Note (why you chose this)" className="mt-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. specialization block for side delts" /></Field>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">A manual target replaces the automatic one until cleared. Past weeks keep their frozen snapshots where available. More volume has diminishing returns — raise targets gradually and watch recovery and progression.</p>
        </div>
      </div>
    </Modal>
  );
}
