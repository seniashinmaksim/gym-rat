import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { diffDays, formatDate } from '../../domain/dates';
import { TRACKED_MUSCLES } from '../../domain/muscles';
import type { TrendClass } from '../../domain/progression';
import { exerciseLabel } from '../../domain/registry';
import { assessDeload, currentBlock, volumeTrend } from '../../domain/reports';
import type { TrainingBlock } from '../../domain/types';
import { uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { IconAlert, IconCheck, IconEdit, IconLayers, IconPlus, IconTrash, IconX } from '../components/icons';
import {
  Badge, Button, Callout, Card, CardTitle, confirmAction, cx, Empty, Field, fmt, Input, Modal, Page, Select, Stat, Stepper, TextArea, toast, Why,
} from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const KIND_LABEL: Record<TrainingBlock['kind'], string> = {
  accumulation: 'Accumulation', maintenance: 'Maintenance', deload: 'Deload', specialization: 'Specialization', other: 'Other',
};

export function PeriodizationPage() {
  const a = useAnalysis();
  const data = useData();
  const [editing, setEditing] = useState<TrainingBlock | 'new' | null>(null);
  const block = currentBlock(data, a.today);
  const deload = useMemo(() => assessDeload(data, a), [data, a]);
  const blocks = [...data.blocks].sort((x, y) => y.startDate.localeCompare(x.startDate));

  return (
    <Page
      title="Periodization"
      subtitle="Flexible training blocks, volume trends and evidence-based deload signals."
      actions={<Button variant="primary" onClick={() => setEditing('new')}><IconPlus size={16} /> New block</Button>}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <CurrentBlockCard block={block} today={a.today} onEdit={(b) => setEditing(b)} onNew={() => setEditing('new')} />
        <DeloadCard deload={deload} />
      </div>

      <ProgressionHealth />
      <VolumeTrendCard />
      <HeatTable />

      <Card>
        <CardTitle hint="All blocks, newest first. Blocks organize your history. They don't change how volume is counted.">Block history</CardTitle>
        {blocks.length === 0 ? (
          <p className="text-sm text-ink-500">No blocks yet. Blocks are optional: a 4–8 week frame helps compare progress between phases.</p>
        ) : (
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {blocks.map((b) => {
              const end = b.endDate ?? null;
              const weeks = Math.floor(diffDays(end && end < a.today ? end : a.today, b.startDate) / 7) + 1;
              const active = block?.id === b.id;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink-900 dark:text-white">{b.name}</span>
                      <Badge tone="neutral">{KIND_LABEL[b.kind]}</Badge>
                      {active && <Badge tone="accent">Active</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {formatDate(b.startDate)} → {end ? formatDate(end) : 'ongoing'} · {Math.max(0, weeks)} wk of {b.plannedWeeks} planned{b.focus ? ` · ${b.focus}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(b)} aria-label="Edit block"><IconEdit size={15} /></Button>
                    <Button size="sm" variant="ghost" aria-label="Delete block" onClick={async () => {
                      if (!confirmAction(`Delete block "${b.name}"? Workouts are not affected.`)) return;
                      await store.deleteBlock(b.id);
                      toast('Block deleted', 'info');
                    }}><IconTrash size={15} /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {editing && <BlockEditor block={editing === 'new' ? null : editing} today={a.today} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function CurrentBlockCard({ block, today, onEdit, onNew }: { block: TrainingBlock | null; today: string; onEdit: (b: TrainingBlock) => void; onNew: () => void }) {
  if (!block) {
    return (
      <Card>
        <CardTitle>Current block</CardTitle>
        <Empty title="No active block" action={<Button variant="secondary" onClick={onNew}><IconLayers size={16} /> Start a block</Button>}>
          Blocks are an organizational frame (typically 4–8 weeks), not a growth mechanism. Changing phases does not create more hypertrophy by itself.
        </Empty>
      </Card>
    );
  }
  const week = Math.floor(diffDays(today, block.startDate) / 7) + 1;
  const pct = Math.min(100, (week / Math.max(1, block.plannedWeeks)) * 100);
  const over = week > block.plannedWeeks;
  const endBlock = async () => {
    if (!confirmAction(`End "${block.name}" today?`)) return;
    await store.saveBlock({ ...block, endDate: today });
    toast('Block ended');
  };
  return (
    <Card>
      <CardTitle right={<Badge tone="accent">{KIND_LABEL[block.kind]}</Badge>}>Current block</CardTitle>
      <div className="text-lg font-semibold text-ink-900 dark:text-white">{block.name}</div>
      {block.focus && <div className="text-sm text-ink-500">{block.focus}</div>}
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-3xl font-semibold tabular-nums text-ink-900 dark:text-white">Week {week}</span>
        <span className="text-sm text-ink-500">of {block.plannedWeeks} planned</span>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: Math.max(block.plannedWeeks, week) }, (_, i) => (
          <div key={i} className={cx('h-2 flex-1 rounded-full', i < week ? (i >= block.plannedWeeks ? 'bg-violet-500' : 'bg-accent-500') : 'bg-ink-100 dark:bg-ink-800')} />
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-500">
        Started {formatDate(block.startDate)}. {over
          ? 'Past the planned length. That is fine if you are still progressing; the plan is a frame, not a deadline.'
          : `${Math.round(pct)}% through the planned frame.`}
      </p>
      {block.notes && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ink-50 p-2.5 text-xs text-ink-600 dark:bg-ink-950 dark:text-ink-300">{block.notes}</p>}
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => onEdit(block)}><IconEdit size={14} /> Edit</Button>
        <Button size="sm" variant="ghost" onClick={endBlock}>End block today</Button>
      </div>
    </Card>
  );
}

function DeloadCard({ deload }: { deload: ReturnType<typeof assessDeload> }) {
  return (
    <Card>
      <CardTitle hint="Deloads are NOT scheduled automatically every Nth week. One is suggested only when ≥3 independent fatigue indicators coincide."
        right={<Badge tone={deload.recommend ? 'warn' : deload.score > 0 ? 'info' : 'good'}>{deload.score}/{deload.indicators.length} signals</Badge>}>
        Deload assessment
      </CardTitle>
      <Callout tone={deload.recommend ? 'warn' : 'good'} icon={deload.recommend ? <IconAlert size={18} /> : <IconCheck size={18} />} title={deload.recommend ? 'A deload may help' : 'No deload needed'}>
        {deload.summary}
      </Callout>
      <ul className="mt-3 space-y-2">
        {deload.indicators.map((i) => (
          <li key={i.label} className="flex gap-2.5 text-sm">
            <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', i.present ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-ink-100 text-ink-400 dark:bg-ink-800')}>
              {i.present ? <IconAlert size={12} /> : <IconX size={12} />}
            </span>
            <div className="min-w-0">
              <div className={cx('font-medium', i.present ? 'text-ink-900 dark:text-white' : 'text-ink-500')}>{i.label}</div>
              <div className="text-xs text-ink-500">{i.detail}</div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Why>
          <p>Each indicator is an observation from your logs (performance trends, RIR, check-ins, weekly volume). None of them proves accumulated fatigue on its own, so the app waits for several to agree.</p>
          <p>Deload research is limited. A short period of reduced volume (≈ half the sets, moderate loads, RIR 3–4) is a common, low-risk way to let performance rebound. It is not required on a fixed schedule.</p>
        </Why>
      </div>
    </Card>
  );
}

const TREND_META: Record<TrendClass, { label: string; tone: 'good' | 'info' | 'warn' | 'bad' | undefined }> = {
  progressing: { label: 'Progressing', tone: 'good' },
  stable: { label: 'Stable', tone: undefined },
  plateau: { label: 'Possible plateau', tone: 'warn' },
  declining: { label: 'Declining', tone: 'bad' },
  insufficient_data: { label: 'Too little data', tone: undefined },
};

function ProgressionHealth() {
  const a = useAnalysis();
  const names = useNames();
  const active = a.progression.filter((p) => p.current && diffDays(a.today, p.current.date) <= 42);
  const counts = (Object.keys(TREND_META) as TrendClass[]).map((k) => ({ k, n: active.filter((p) => p.trend.cls === k).length }));
  const concerning = active.filter((p) => p.trend.cls === 'declining' || p.trend.cls === 'plateau');
  return (
    <Card>
      <CardTitle hint="Exercise × equipment histories trained in the last 6 weeks. Each machine is tracked separately and loads are never compared across machines.">Progression health</CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {counts.map(({ k, n }) => <Stat key={k} label={TREND_META[k].label} value={n} tone={n > 0 ? (TREND_META[k].tone === 'info' ? undefined : TREND_META[k].tone === 'bad' ? 'bad' : TREND_META[k].tone === 'warn' ? 'warn' : TREND_META[k].tone === 'good' ? 'good' : undefined) : undefined} />)}
      </div>
      {concerning.length > 0 && (
        <ul className="mt-4 space-y-2">
          {concerning.slice(0, 8).map((p) => (
            <li key={p.key} className="rounded-xl bg-ink-50 p-3 text-sm dark:bg-ink-950">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink-900 dark:text-white">{names.ex(a.registry.get(p.exerciseId), exerciseLabel(undefined, 'en', p.exerciseId))}</span>
                <span className="text-xs text-ink-500">{p.scopeLabel}</span>
                <Badge tone={p.trend.cls === 'declining' ? 'bad' : 'warn'}>{TREND_META[p.trend.cls].label}</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{p.trend.evidence}</p>
            </li>
          ))}
        </ul>
      )}
      {active.length === 0 && <p className="mt-3 text-sm text-ink-500">No recent exercise histories yet.</p>}
    </Card>
  );
}

function VolumeTrendCard() {
  const a = useAnalysis();
  const rows = volumeTrend(a.weeks, 12);
  return (
    <Card>
      <CardTitle hint="Total effective sets across all muscles (bars) and number of sessions (line) per week. Rising volume should come with stable or improving performance; if performance drops while volume rises, that is a warning sign.">Volume trend · last 12 weeks</CardTitle>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">No weekly history yet.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 0, left: -14, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} />
              <YAxis yAxisId="v" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis yAxisId="s" orientation="right" tickLine={false} axisLine={false} allowDecimals={false} width={24} />
              <Tooltip cursor={{ fill: 'rgba(135,145,165,0.08)' }} />
              <Bar yAxisId="v" dataKey="total" name="Effective sets" fill="#14b8a6" fillOpacity={0.75} radius={[5, 5, 0, 0]} />
              <Line yAxisId="s" dataKey="sessions" name="Sessions" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function HeatTable() {
  const a = useAnalysis();
  const names = useNames();
  const weeks = a.weeks.slice(-8);
  if (!weeks.length) return null;
  const cellStyle = (eff: number, m: (typeof TRACKED_MUSCLES)[number]) => {
    const t = a.targets[m];
    if (eff <= 0) return { background: 'transparent', color: undefined as string | undefined };
    const r = t.preferred > 0 ? eff / t.preferred : 1;
    const color = eff > t.max ? '139,92,246' : r >= 1 ? '16,185,129' : eff >= t.min ? '14,165,233' : '245,158,11';
    const alpha = 0.18 + 0.5 * Math.min(1, r);
    return { background: `rgba(${color},${alpha.toFixed(2)})`, color: undefined };
  };
  return (
    <Card>
      <CardTitle hint="Effective sets per muscle per week, coloured against the current target: amber = below lower end · blue = within range · green = target met · violet = above upper bound.">Weekly volume by muscle · last 8 weeks</CardTitle>
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-ink-400">
              <th className="text-left font-medium">Muscle</th>
              {weeks.map((w) => <th key={w.range.start} className="font-medium tabular-nums">{w.range.start.slice(5)}{!w.complete && '*'}</th>)}
              <th className="font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {TRACKED_MUSCLES.map((m) => (
              <tr key={m}>
                <td className="whitespace-nowrap pr-2 text-ink-700 dark:text-ink-200">{names.muscle(m)}</td>
                {weeks.map((w) => {
                  const eff = w.volume.muscles[m].effective;
                  return (
                    <td key={w.range.start} className="rounded-md py-1.5 text-center tabular-nums text-ink-800 dark:text-ink-100" style={cellStyle(eff, m)}>
                      {eff > 0 ? fmt(eff) : <span className="text-ink-300 dark:text-ink-600">·</span>}
                    </td>
                  );
                })}
                <td className="text-center tabular-nums text-ink-500">{fmt(a.targets[m].preferred)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-ink-400">* current, unfinished week. Colours use today's targets; frozen weekly snapshots are shown in Reports.</p>
    </Card>
  );
}

function BlockEditor({ block, today, onClose }: { block: TrainingBlock | null; today: string; onClose: () => void }) {
  const [b, setB] = useState<TrainingBlock>(() => block ?? { id: uid('blk'), name: '', startDate: today, endDate: null, plannedWeeks: 6, kind: 'accumulation', focus: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TrainingBlock>(k: K, v: TrainingBlock[K]) => setB((x) => ({ ...x, [k]: v }));
  const valid = b.name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(b.startDate) && (!b.endDate || b.endDate >= b.startDate) && b.plannedWeeks >= 1;
  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await store.saveBlock({ ...b, name: b.name.trim(), focus: b.focus?.trim() || undefined, notes: b.notes?.trim() || undefined, endDate: b.endDate || null });
      toast(block ? 'Block updated' : 'Block created');
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={block ? 'Edit block' : 'New training block'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={!valid || busy}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name"><Input value={b.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Winter accumulation" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={b.kind} onChange={(e) => set('kind', e.target.value as TrainingBlock['kind'])}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Planned weeks" hint={b.plannedWeeks < 4 || b.plannedWeeks > 8 ? 'Outside the usual 4–8 week frame. That is fine if intentional.' : 'Typical frame: 4–8 weeks'}>
            <Stepper value={b.plannedWeeks} onChange={(v) => set('plannedWeeks', Math.max(1, Math.min(16, Math.round(v ?? 1))))} min={1} label="Planned weeks" />
          </Field>
          <Field label="Start date"><Input type="date" value={b.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label="End date (optional)"><Input type="date" value={b.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} /></Field>
        </div>
        <Field label="Focus (optional)"><Input value={b.focus ?? ''} onChange={(e) => set('focus', e.target.value)} placeholder="e.g. bring up side delts & hamstrings" /></Field>
        <Field label="Notes (optional)"><TextArea value={b.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className="font-sans text-sm" /></Field>
      </div>
    </Modal>
  );
}
