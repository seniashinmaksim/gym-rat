import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { diffDays, formatDate } from '../../domain/dates';
import { monthlyBodyReport, weeklyWeightAverages } from '../../domain/reports';
import type { BodyMeasurement, Photo } from '../../domain/types';
import { uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { IconAlert, IconCamera, IconScale, IconTrash } from '../components/icons';
import { PhotoThumb, PhotoViewer } from '../components/PhotoGrid';
import {
  Badge, Button, Callout, Card, CardTitle, Empty, Field, Input, NumInput, Page, Segmented, Select, Stat, Table, Td, TextArea, fmt, toast,
} from '../components/ui';
import { useAnalysis, usePhotoUrl } from '../hooks';

type FieldKey = 'weightKg' | 'waistCm' | 'chestCm' | 'shouldersCm' | 'armsCm' | 'forearmsCm' | 'thighsCm' | 'calvesCm';
const FIELDS: { key: FieldKey; label: string; ru: string; unit: string; step: number }[] = [
  { key: 'weightKg', label: 'Body weight', ru: 'Вес', unit: 'kg', step: 0.1 },
  { key: 'waistCm', label: 'Waist', ru: 'Талия', unit: 'cm', step: 0.5 },
  { key: 'chestCm', label: 'Chest', ru: 'Грудь', unit: 'cm', step: 0.5 },
  { key: 'shouldersCm', label: 'Shoulders', ru: 'Плечи', unit: 'cm', step: 0.5 },
  { key: 'armsCm', label: 'Arms', ru: 'Бицепс', unit: 'cm', step: 0.5 },
  { key: 'forearmsCm', label: 'Forearms', ru: 'Предплечья', unit: 'cm', step: 0.5 },
  { key: 'thighsCm', label: 'Thighs', ru: 'Бёдра', unit: 'cm', step: 0.5 },
  { key: 'calvesCm', label: 'Calves', ru: 'Икры', unit: 'cm', step: 0.5 },
];
const LABEL: Record<string, { label: string; unit: string }> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
type Tab = 'overview' | 'log' | 'photos';

export function BodyPage() {
  const data = useData();
  const a = useAnalysis();
  const [tab, setTab] = useState<Tab>('overview');
  const sorted = useMemo(() => [...data.body].sort((x, y) => x.date.localeCompare(y.date)), [data.body]);
  const weekly = useMemo(() => weeklyWeightAverages(data, data.settings.weekStartsOn), [data]);
  const report = useMemo(() => monthlyBodyReport(data, a.today), [data, a.today]);
  const lastWeek = weekly[weekly.length - 1];
  const prevWeek = weekly[weekly.length - 2];
  const delta = lastWeek && prevWeek ? lastWeek.avg - prevWeek.avg : null;
  const last28 = weekly.filter((w) => diffDays(a.today, w.week) <= 35);
  const monthlyRate = last28.length >= 2 ? ((last28[last28.length - 1].avg - last28[0].avg) / Math.max(1, diffDays(last28[last28.length - 1].week, last28[0].week))) * 30 : null;
  const latestWaist = [...sorted].reverse().find((b) => b.waistCm != null)?.waistCm ?? null;

  return (
    <Page title="Body tracking" subtitle="Weight, circumferences and progress photos — all encrypted on this device"
      actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'log', label: 'Log' }, { value: 'photos', label: 'Photos' }]} />}>
      <Callout tone="warn" icon={<IconAlert size={18} />} title="What these numbers can and can't tell you">
        Body weight and tape measurements cannot measure muscle mass. Day-to-day weight swings of 1–2 kg are mostly water, glycogen, salt and gut content.
        Use weekly averages and month-to-month trends; a rising weight with a stable waist is <i>consistent with</i> lean gain, not proof of it.
      </Callout>

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="This week's avg" value={lastWeek ? `${fmt(lastWeek.avg)} kg` : '—'} sub={lastWeek ? `${lastWeek.n} weigh-in${lastWeek.n === 1 ? '' : 's'}` : 'No weigh-ins yet'} />
            <Stat label="vs last week" value={delta != null ? `${delta > 0 ? '+' : ''}${fmt(delta, 2)} kg` : '—'} sub="Weekly average change" />
            <Stat label="Monthly rate" value={monthlyRate != null ? `${monthlyRate > 0 ? '+' : ''}${fmt(monthlyRate, 2)} kg` : '—'} sub="Estimated from ~5 weeks" />
            <Stat label="Latest waist" value={latestWaist != null ? `${fmt(latestWaist)} cm` : '—'} sub="Watch alongside weight" />
          </div>

          <Card>
            <CardTitle hint="Dots: individual weigh-ins. Line: weekly average — the number worth watching.">Body weight</CardTitle>
            <WeightChart body={sorted} weekly={weekly} />
          </Card>

          <Card>
            <CardTitle hint="Average of the last 30 days vs the 30 days before.">Monthly report</CardTitle>
            <Table head={['Measure', 'Last 30 days', 'Previous 30', 'Change']}>
              {report.rows.map((r) => {
                const d = r.current != null && r.previous != null ? r.current - r.previous : null;
                return (
                  <tr key={r.field}>
                    <Td right={false} className="font-medium">{LABEL[r.field].label}</Td>
                    <Td>{r.current != null ? `${fmt(r.current)} ${LABEL[r.field].unit}` : '—'}</Td>
                    <Td>{r.previous != null ? `${fmt(r.previous)} ${LABEL[r.field].unit}` : '—'}</Td>
                    <Td className={d == null ? '' : d > 0 ? 'text-emerald-600 dark:text-emerald-400' : d < 0 ? 'text-amber-600 dark:text-amber-400' : ''}>{d != null ? `${d > 0 ? '+' : ''}${fmt(d)}` : '—'}</Td>
                  </tr>
                );
              })}
            </Table>
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
              {report.notes.map((n) => <li key={n} className="flex gap-2"><span className="text-accent-500">•</span>{n}</li>)}
            </ul>
          </Card>

          <MiniTrends body={sorted} />
        </>
      )}

      {tab === 'log' && (
        <>
          <MeasurementForm today={a.today} />
          <Card>
            <CardTitle hint="Newest first">History</CardTitle>
            {sorted.length === 0 ? <Empty title="No measurements yet">Add your first weigh-in above. Morning, after the bathroom, before food gives the most consistent readings.</Empty> : (
              <Table dense head={['Date', ...FIELDS.map((f) => `${f.label} (${f.unit})`), '']}>
                {[...sorted].reverse().map((b) => (
                  <tr key={b.id}>
                    <Td right={false}>{formatDate(b.date)}{b.notes ? <span title={b.notes} className="ml-1 text-ink-400">✎</span> : null}</Td>
                    {FIELDS.map((f) => <Td key={f.key}>{fmt(b[f.key])}</Td>)}
                    <Td>
                      <button type="button" aria-label="Delete measurement" className="rounded-lg p-1 text-ink-400 hover:bg-rose-500/10 hover:text-rose-600"
                        onClick={async () => { if (window.confirm(`Delete the ${b.date} entry?`)) { await store.deleteBody(b.id); toast('Entry deleted'); } }}>
                        <IconTrash size={14} />
                      </button>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}

      {tab === 'photos' && <ProgressPhotos today={a.today} />}
    </Page>
  );
}

function MeasurementForm({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const [vals, setVals] = useState<Partial<Record<FieldKey, number | null>>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const any = Object.values(vals).some((v) => v != null);

  const save = async () => {
    if (!any) return toast('Enter at least one measurement', 'bad');
    setBusy(true);
    try {
      const rec: BodyMeasurement = { id: uid('bm'), date, photoIds: [], notes: notes.trim() || undefined };
      for (const f of FIELDS) if (vals[f.key] != null) rec[f.key] = vals[f.key];
      await store.saveBody(rec);
      setVals({});
      setNotes('');
      toast('Measurement saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle hint="Leave anything you didn't measure empty — nothing is filled in for you.">New measurement</CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        {FIELDS.map((f) => (
          <Field key={f.key} label={<>{f.label} <span className="text-ink-400">· {f.ru} ({f.unit})</span></>}>
            <NumInput value={vals[f.key] ?? null} step={f.step} onChange={(v) => setVals({ ...vals, [f.key]: v })} />
          </Field>
        ))}
      </div>
      <Field label="Notes" className="mt-3"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] font-sans text-sm" placeholder="e.g. after a salty dinner, measured relaxed" /></Field>
      <div className="mt-3 flex justify-end"><Button variant="primary" onClick={save} disabled={busy || !any}><IconScale size={16} /> Save measurement</Button></div>
    </Card>
  );
}

function WeightChart({ body, weekly }: { body: BodyMeasurement[]; weekly: { week: string; avg: number }[] }) {
  const points = body.filter((b) => b.weightKg != null);
  if (points.length === 0) return <Empty title="No weigh-ins yet">Log body weight a few times a week to see a reliable weekly average.</Empty>;
  const toT = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const daily = points.map((b) => ({ t: toT(b.date), weight: b.weightKg as number }));
  const avg = weekly.map((w) => ({ t: toT(w.week) + 3 * 86_400_000, avg: w.avg }));
  const all = [...daily.map((d) => d.weight), ...avg.map((d) => d.avg)];
  const lo = Math.floor(Math.min(...all) - 1);
  const hi = Math.ceil(Math.max(...all) + 1);
  const fmtT = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin - 86400000', 'dataMax + 86400000']} tickFormatter={fmtT} scale="time" allowDuplicatedCategory={false} />
          <YAxis domain={[lo, hi]} unit=" kg" width={58} />
          <Tooltip labelFormatter={(t) => fmtT(Number(t))} formatter={(v: number, n: string) => [`${fmt(v)} kg`, n === 'avg' ? 'Weekly average' : 'Weigh-in']} />
          <Scatter data={daily} dataKey="weight" name="weight" fill="#8791a5" fillOpacity={0.55} />
          <Line data={avg} dataKey="avg" name="avg" type="monotone" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 3, fill: '#14b8a6' }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MiniTrends({ body }: { body: BodyMeasurement[] }) {
  const series = FIELDS.filter((f) => f.key !== 'weightKg').map((f) => ({
    f,
    pts: body.filter((b) => b[f.key] != null).map((b) => ({ date: b.date, v: b[f.key] as number })),
  }));
  const withData = series.filter((s) => s.pts.length > 0);
  if (!withData.length) return <Card><CardTitle hint="Measure the same spot, relaxed, at the same time of day — ideally every 2–4 weeks.">Circumferences</CardTitle><p className="text-sm text-ink-500">No circumference measurements yet.</p></Card>;
  return (
    <Card>
      <CardTitle hint="Measure the same spot, relaxed, at the same time of day — ideally every 2–4 weeks.">Circumferences</CardTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {withData.map(({ f, pts }) => {
          const first = pts[0].v;
          const last = pts[pts.length - 1].v;
          const d = last - first;
          return (
            <div key={f.key} className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{f.label}</span>
                {pts.length > 1 && <Badge tone={d > 0 ? (f.key === 'waistCm' ? 'warn' : 'good') : d < 0 ? (f.key === 'waistCm' ? 'good' : 'warn') : 'neutral'}>{d > 0 ? '+' : ''}{fmt(d)}</Badge>}
              </div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{fmt(last)} <span className="text-xs font-normal text-ink-500">{f.unit}</span></div>
              <div className="mt-1 h-10">
                {pts.length > 1 ? (
                  <ResponsiveContainer>
                    <LineChart data={pts} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                      <YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                      <Line dataKey="v" type="monotone" stroke="#14b8a6" strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <span className="text-[11px] text-ink-400">One reading — trend after the next</span>}
              </div>
              <div className="text-[10px] text-ink-400">{pts.length} reading{pts.length === 1 ? '' : 's'} since {formatDate(pts[0].date)}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProgressPhotos({ today }: { today: string }) {
  const data = useData();
  const [pose, setPose] = useState<'front' | 'side' | 'back'>('front');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'front' | 'side' | 'back'>('all');
  const [view, setView] = useState<string | null>(null);
  const photos = useMemo(() => data.photos.filter((p) => p.kind === 'progress').sort((x, y) => y.takenAt.localeCompare(x.takenAt)), [data.photos]);
  const shown = photos.filter((p) => filter === 'all' || p.pose === filter);
  const [leftId, setLeftId] = useState<string>('');
  const [rightId, setRightId] = useState<string>('');
  const left = photos.find((p) => p.id === leftId) ?? photos[photos.length - 1];
  const right = photos.find((p) => p.id === rightId) ?? photos[0];

  const byDate = useMemo(() => {
    const m = new Map<string, Photo[]>();
    for (const p of shown) {
      const d = p.takenAt.slice(0, 10);
      m.set(d, [...(m.get(d) ?? []), p]);
    }
    return [...m.entries()];
  }, [shown]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) await store.addPhoto(f, { kind: 'progress', pose, takenAt: `${date}T12:00:00.000Z` });
      toast(`${files.length} photo${files.length > 1 ? 's' : ''} encrypted and saved`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const weightNear = (iso: string) => {
    const d = iso.slice(0, 10);
    let best: { w: number; gap: number } | null = null;
    for (const b of data.body) {
      if (b.weightKg == null) continue;
      const gap = Math.abs(diffDays(b.date, d));
      if (gap <= 7 && (!best || gap < best.gap)) best = { w: b.weightKg, gap };
    }
    return best?.w ?? null;
  };

  const label = (p: Photo) => `${formatDate(p.takenAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })} · ${p.pose ?? 'other'}`;

  return (
    <>
      <Card>
        <CardTitle hint="Same lighting, distance, pose and time of day make comparisons meaningful. Photos are re-encoded (removing location metadata) and encrypted before storage.">Add progress photos</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Date"><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Pose"><Segmented value={pose} onChange={setPose} options={[{ value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} /></Field>
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent-500 px-4 text-sm font-semibold text-ink-950 shadow-sm hover:bg-accent-400 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            <IconCamera size={16} /> {busy ? 'Encrypting…' : 'Choose photos'}
            <input type="file" accept="image/*" capture="user" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </Card>

      {photos.length >= 2 && left && right && (
        <Card>
          <CardTitle hint="Pick any two photos. Weight shown is the nearest weigh-in within 7 days.">Side-by-side comparison</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            {[{ p: left, set: setLeftId, val: left.id }, { p: right, set: setRightId, val: right.id }].map(({ p, set, val }, i) => {
              const w = weightNear(p.takenAt);
              return (
                <div key={i} className="space-y-2">
                  <Select value={val} onChange={(e) => set(e.target.value)} aria-label={i === 0 ? 'Before photo' : 'After photo'}>
                    {photos.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
                  </Select>
                  <ComparePhoto id={p.id} onClick={() => setView(p.id)} />
                  <div className="text-center text-xs text-ink-500">{label(p)}{w != null ? ` · ${fmt(w)} kg` : ''}</div>
                </div>
              );
            })}
          </div>
          <CompareSummary a={left} b={right} weightNear={weightNear} />
        </Card>
      )}

      <Card>
        <CardTitle right={<Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} />}>
          Gallery
        </CardTitle>
        {byDate.length === 0 ? <Empty title="No progress photos">Add a front, side and back photo today to set your baseline.</Empty> : (
          <div className="space-y-4">
            {byDate.map(([d, ps]) => (
              <div key={d}>
                <div className="mb-2 text-xs font-semibold text-ink-600 dark:text-ink-300">{formatDate(d, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div className="flex flex-wrap gap-2">
                  {ps.map((p) => (
                    <div key={p.id} className="group relative">
                      <PhotoThumb id={p.id} className="h-36 w-28" onClick={() => setView(p.id)} alt={`${p.pose} progress photo`} />
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] capitalize text-white">{p.pose ?? 'other'}</span>
                      <button type="button" aria-label="Delete photo" onClick={async () => { if (window.confirm('Delete this progress photo permanently?')) { await store.deletePhoto(p.id); toast('Photo deleted'); } }}
                        className="absolute right-1 top-1 rounded-lg bg-black/60 p-1 text-white opacity-90 hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100">
                        <IconTrash size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <PhotoViewer id={view} onClose={() => setView(null)} />
    </>
  );
}

function ComparePhoto({ id, onClick }: { id: string; onClick: () => void }) {
  const url = usePhotoUrl(id);
  return (
    <button type="button" onClick={onClick} className="block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-ink-100 dark:bg-ink-800">
      {url ? <img src={url} alt="Progress" className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse" />}
    </button>
  );
}

function CompareSummary({ a, b, weightNear }: { a: Photo; b: Photo; weightNear: (iso: string) => number | null }) {
  const [first, second] = a.takenAt <= b.takenAt ? [a, b] : [b, a];
  const days = diffDays(second.takenAt.slice(0, 10), first.takenAt.slice(0, 10));
  const w1 = weightNear(first.takenAt);
  const w2 = weightNear(second.takenAt);
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
      <Badge tone="info">{days} day{days === 1 ? '' : 's'} apart</Badge>
      {w1 != null && w2 != null ? <Badge tone="accent">weight {w2 - w1 > 0 ? '+' : ''}{fmt(w2 - w1)} kg</Badge> : <Badge>no weigh-ins near both dates</Badge>}
      {first.pose !== second.pose && <Badge tone="warn">different poses</Badge>}
    </div>
  );
}
