import { accentHex } from '../accent';
import { useMemo, useState } from 'react';
import { CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { diffDays, formatDate, localNowParts } from '../../domain/dates';
import { latestWeighIn, rollingAverage, weeklyTrend, weighInsOn, weightSeries } from '../../domain/bodyweight';
import { AddBodyWeight } from '../components/AddBodyWeight';
import { monthlyBodyReport, weeklyWeightAverages } from '../../domain/reports';
import type { BodyMeasurement, Photo } from '../../domain/types';
import { uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { IconCamera, IconEdit, IconPlus, IconScale, IconTrash } from '../components/icons';
import { PhotoThumb, PhotoViewer } from '../components/PhotoGrid';
import {
  Badge, Button, Card, CardTitle, Empty, Field, Input, NumInput, Page, Segmented, Select, Stat, Table, Td, TextArea, fmt, toast, undoToast,
} from '../components/ui';
import { useAnalysis, useDraftSync, usePhotoUrl } from '../hooks';
import { L, NP, KG, getLang, locale, ruPlural } from '../../i18n';

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
const LABEL: Record<string, { key: FieldKey; label: string; ru: string; unit: string }> = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
/** Name and unit of a measurement in the current language (the table itself holds both languages). */
const fieldName = (f: { key: FieldKey; label: string; ru: string }): string => L(f.label, f.key === 'weightKg' ? 'Вес тела' : f.ru);
const unitName = (unit: string): string => (unit === 'kg' ? L('kg', 'кг') : unit === 'cm' ? L('cm', 'см') : unit);
/** Stored pose code → label (the stored value is never translated). */
const poseLabel = (pose: Photo['pose'] | null | undefined): string => {
  const p = pose ?? 'other';
  return L(p, { front: 'спереди', side: 'сбоку', back: 'сзади', other: 'другое' }[p] ?? p);
};
type Tab = 'overview' | 'log' | 'photos';

export function BodyPage() {
  const data = useData();
  const a = useAnalysis();
  const [tab, setTab] = useState<Tab>('overview');
  const sorted = useMemo(() => [...data.body].sort((x, y) => x.date.localeCompare(y.date)), [data.body]);
  const weekly = useMemo(() => weeklyWeightAverages(data, data.settings.weekStartsOn), [data]);
  const report = useMemo(() => monthlyBodyReport(data, a.today), [data, a.today]);
  const last28 = weekly.filter((w) => diffDays(a.today, w.week) <= 35);
  const monthlyRate = last28.length >= 2 ? ((last28[last28.length - 1].avg - last28[0].avg) / Math.max(1, diffDays(last28[last28.length - 1].week, last28[0].week))) * 30 : null;
  const latestWaist = [...sorted].reverse().find((b) => b.waistCm != null)?.waistCm ?? null;
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);
  const last = latestWeighIn(data.body);
  const todayN = weighInsOn(data.body, a.today).length;
  const avg7 = rollingAverage(data.body, a.today);
  const trend = weeklyTrend(data.body, a.today);

  return (
    <Page title={L('Body', 'Тело')} subtitle={L('Encrypted on this device', 'Зашифровано на этом устройстве')}
      actions={<><Button variant="primary" onClick={() => setAddOpen(true)}><IconPlus size={16} />{L('Body weight', 'Вес тела')}</Button><Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: L('Overview', 'Обзор') }, { value: 'log', label: L('Log', 'Журнал') }, { value: 'photos', label: L('Photos', 'Фото') }]} /></>}>
      <AddBodyWeight open={addOpen} onClose={() => setAddOpen(false)} />
      <AddBodyWeight open={!!editing} entry={editing} extraFields={FIELDS.filter((f) => f.key !== 'weightKg') as never} onClose={() => setEditing(null)} />

      {tab === 'overview' && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={L('Latest', 'Последнее')} value={last ? `${fmt(last.kg)} ${KG()}` : '—'} sub={last ? `${formatDate(last.date, { day: 'numeric', month: 'short' })}${last.time ? ` ${last.time}` : ''} · ${L('today', 'сегодня')} ${todayN}` : L('No weigh-ins yet', 'Взвешиваний пока нет')} />
            <Stat label={L('7-day average', 'Среднее за 7 дней')} value={avg7 ? `${fmt(avg7.kg)} ${KG()}` : '—'} sub={avg7 ? NP(avg7.days, ['day', 'days'], ['день', 'дня', 'дней']) : '—'} />
            {/* 0.1 kg resolution: body weight swings far more than 0.01 kg a day. */}
            <Stat label={L('Week trend', 'Тренд за неделю')} value={trend != null ? `${trend > 0 ? '+' : ''}${fmt(trend, 1)} ${KG()}` : '—'} sub={monthlyRate != null ? `${monthlyRate > 0 ? '+' : ''}${fmt(monthlyRate, 1)} ${L('kg / month (5-wk trend)', 'кг / мес. (тренд за 5 нед.)')}` : L('7-day avg vs last week', 'среднее за 7 дней к прошлой неделе')} />
            <Stat label={L('Waist', 'Талия')} value={latestWaist != null ? `${fmt(latestWaist)} ${L('cm', 'см')}` : '—'} sub={L('latest', 'последний замер')} />
          </div>

          <Card>
            <CardTitle hint={L('Dots: weigh-ins. Line: 7-day average. Daily swings are mostly water and food.', 'Точки — взвешивания. Линия — среднее за 7 дней. Суточные колебания — в основном вода и еда.')}>{L('Body weight', 'Вес тела')}</CardTitle>
            <WeightChart body={sorted} />
          </Card>

          <Card>
            <CardTitle hint={L('Average of the last 30 days vs the 30 days before.', 'Среднее за последние 30 дней и за 30 дней до них.')}>{L('Monthly report', 'Отчёт за месяц')}</CardTitle>
            <Table head={[L('Measure', 'Показатель'), L('Last 30 days', 'Последние 30 дн.'), L('Previous 30', 'Предыдущие 30'), L('Change', 'Изменение')]}>
              {report.rows.map((r) => {
                const d = r.current != null && r.previous != null ? r.current - r.previous : null;
                return (
                  <tr key={r.field}>
                    <Td right={false} className="font-medium">{fieldName(LABEL[r.field])}</Td>
                    <Td>{r.current != null ? `${fmt(r.current)} ${unitName(LABEL[r.field].unit)}` : '—'}</Td>
                    <Td>{r.previous != null ? `${fmt(r.previous)} ${unitName(LABEL[r.field].unit)}` : '—'}</Td>
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
            <CardTitle hint={L('Newest first', 'Сначала новые')}>{L('History', 'История')}</CardTitle>
            {sorted.length === 0 ? <Empty title={L('No measurements yet', 'Замеров пока нет')}>{L('Add your first weigh-in above. Morning, after the bathroom, before food gives the most consistent readings.', 'Добавьте первое взвешивание выше. Самые стабильные показания — утром, после туалета, до еды.')}</Empty> : (
              <Table dense head={[L('Date', 'Дата'), ...FIELDS.map((f) => `${fieldName(f)} (${unitName(f.unit)})`), '']}>
                {[...sorted].reverse().map((b) => (
                  <tr key={b.id}>
                    <Td right={false}>{formatDate(b.date)}{b.time ? <span className="ml-1 tabular-nums text-ink-500">{b.time}</span> : null}{b.notes ? <span title={b.notes} className="ml-1 text-ink-400">✎</span> : null}</Td>
                    {FIELDS.map((f) => <Td key={f.key}>{fmt(b[f.key])}</Td>)}
                    <Td>
                      <span className="inline-flex">
                        <button type="button" aria-label={L(`Edit entry ${b.date}`, `Изменить запись ${b.date}`)} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
                          onClick={() => setEditing(b)}>
                          <IconEdit size={15} />
                        </button>
                        <button type="button" aria-label={L('Delete measurement', 'Удалить замер')} className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-400 hover:bg-rose-500/10 hover:text-rose-600"
                          onClick={async () => { await store.deleteBody(b.id); undoToast(L(`Entry from ${b.date} deleted`, `Запись за ${b.date} удалена`), () => store.saveBody(b)); }}>
                          <IconTrash size={15} />
                        </button>
                      </span>
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
  const data = useData();
  const kept = useMemo(() => store.getDraft<{ date: string; time: string; vals: Partial<Record<FieldKey, number | null>>; notes: string }>('measurement:new'), []);
  const [date, setDate] = useState(kept?.date ?? today);
  const [time, setTime] = useState(() => kept?.time ?? localNowParts(data.settings.timezone).time);
  const [vals, setVals] = useState<Partial<Record<FieldKey, number | null>>>(kept?.vals ?? {});
  const [notes, setNotes] = useState(kept?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const any = Object.values(vals).some((v) => v != null);
  const clearMeasDraft = useDraftSync('measurement:new', { date, time, vals, notes }, any || !!notes.trim(), { clearWhenInactive: true });
  const [restored, setRestored] = useState(!!kept);

  const save = async () => {
    if (!any) return toast(L('Enter at least one measurement', 'Введите хотя бы один замер'), 'bad');
    setBusy(true);
    try {
      const rec: BodyMeasurement = { id: uid('bm'), date, time: /^\d{2}:\d{2}$/.test(time) ? time : null, enteredAt: new Date().toISOString(), photoIds: [], notes: notes.trim() || undefined };
      for (const f of FIELDS) if (vals[f.key] != null) rec[f.key] = vals[f.key];
      await store.saveBody(rec);
      setVals({});
      setNotes('');
      clearMeasDraft();
      setRestored(false);
      undoToast(L('Measurement saved', 'Замер сохранён'), () => store.deleteBody(rec.id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle hint={L("Leave anything you didn't measure empty — nothing is filled in for you.", 'Что не измеряли — оставьте пустым: за вас ничего не заполняется.')}>{L('New measurement', 'Новый замер')}</CardTitle>
      {restored && (
        <p className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-accent-500/10 px-3 py-1.5 text-xs text-accent-700 dark:text-accent-300" data-testid="draft-restored">
          <span>{L(`Unsaved measurement restored (date ${date} ${time}) — check the date before saving.`, `Несохранённый замер восстановлен (дата ${date} ${time}) — проверьте дату перед сохранением.`)}</span>
          <button type="button" className="min-h-[36px] px-2 font-semibold" onClick={() => { clearMeasDraft(); setRestored(false); setVals({}); setNotes(''); setDate(today); setTime(localNowParts(data.settings.timezone).time); }}>{L('Discard', 'Сбросить')}</button>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Field label={L('Date', 'Дата')}><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={L('Time', 'Время')}><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        {FIELDS.map((f) => (
          <Field key={f.key} label={getLang() === 'ru' ? <>{fieldName(f)} <span className="text-ink-400">({unitName(f.unit)})</span></> : <>{f.label} <span className="text-ink-400">· {f.ru} ({f.unit})</span></>}>
            <NumInput value={vals[f.key] ?? null} step={f.step} onChange={(v) => setVals({ ...vals, [f.key]: v })} />
          </Field>
        ))}
      </div>
      <Field label={L('Notes', 'Заметки')} className="mt-3"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[60px] font-sans text-sm" placeholder={L('e.g. after a salty dinner, measured relaxed', 'например: после солёного ужина, мышцы расслаблены')} /></Field>
      <div className="mt-3 flex justify-end"><Button variant="primary" onClick={save} disabled={busy || !any}><IconScale size={16} /> {L('Save measurement', 'Сохранить замер')}</Button></div>
    </Card>
  );
}

function WeightChart({ body }: { body: BodyMeasurement[] }) {
  const { points, avg } = weightSeries(body);
  if (points.length === 0) return <Empty title={L('No weigh-ins yet', 'Взвешиваний пока нет')}>{L('Tap “Body weight” to add one — any time of day.', 'Нажмите «Вес тела», чтобы добавить взвешивание, — в любое время дня.')}</Empty>;
  const toT = (d: string, t: string | null = null) => Date.parse(`${d}T${t ?? '12:00'}:00Z`);
  const daily = points.map((b) => ({ t: toT(b.date, b.time), weight: b.kg }));
  const line = avg.map((x) => ({ t: toT(x.date), avg: x.kg }));
  const all = [...daily.map((d) => d.weight), ...line.map((d) => d.avg)];
  const lo = Math.floor(Math.min(...all) - 1);
  const hi = Math.ceil(Math.max(...all) + 1);
  const fmtT = (t: number) => new Date(t).toLocaleDateString(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <ComposedChart margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="t" type="number" domain={['dataMin - 86400000', 'dataMax + 86400000']} tickFormatter={fmtT} scale="time" allowDuplicatedCategory={false} />
          <YAxis domain={[lo, hi]} unit={L(' kg', ' кг')} width={58} />
          <Tooltip labelFormatter={(t) => fmtT(Number(t))} formatter={(v: number, n: string) => [`${fmt(v)} ${KG()}`, n === 'avg' ? L('7-day average', 'Среднее за 7 дней') : L('Weigh-in', 'Взвешивание')]} />
          <Scatter data={daily} dataKey="weight" name="weight" fill="#8791a5" fillOpacity={0.55} />
          <Line data={line} dataKey="avg" name="avg" type="monotone" stroke={accentHex(500)} strokeWidth={2.5} dot={false} isAnimationActive={false} />
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
  if (!withData.length) return <Card><CardTitle hint={L('Measure the same spot, relaxed, at the same time of day — ideally every 2–4 weeks.', 'Измеряйте в одном и том же месте, расслабленно, в одно время дня — лучше раз в 2–4 недели.')}>{L('Circumferences', 'Обхваты')}</CardTitle><p className="text-sm text-ink-500">{L('No circumference measurements yet.', 'Замеров обхватов пока нет.')}</p></Card>;
  return (
    <Card>
      <CardTitle hint={L('Measure the same spot, relaxed, at the same time of day — ideally every 2–4 weeks.', 'Измеряйте в одном и том же месте, расслабленно, в одно время дня — лучше раз в 2–4 недели.')}>{L('Circumferences', 'Обхваты')}</CardTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {withData.map(({ f, pts }) => {
          const first = pts[0].v;
          const last = pts[pts.length - 1].v;
          const d = last - first;
          return (
            <div key={f.key} className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{fieldName(f)}</span>
                {pts.length > 1 && <Badge tone={d > 0 ? (f.key === 'waistCm' ? 'warn' : 'good') : d < 0 ? (f.key === 'waistCm' ? 'good' : 'warn') : 'neutral'}>{d > 0 ? '+' : ''}{fmt(d)}</Badge>}
              </div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{fmt(last)} <span className="text-xs font-normal text-ink-500">{unitName(f.unit)}</span></div>
              <div className="mt-1 h-10">
                {pts.length > 1 ? (
                  <ResponsiveContainer>
                    <LineChart data={pts} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                      <YAxis hide domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                      <Line dataKey="v" type="monotone" stroke={accentHex(500)} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : <span className="text-[11px] text-ink-400">{L('One reading — trend after the next', 'Один замер — тренд после следующего')}</span>}
              </div>
              <div className="text-[10px] text-ink-400">{L(`${pts.length} reading${pts.length === 1 ? '' : 's'} since ${formatDate(pts[0].date)}`, `${pts.length} ${ruPlural(pts.length, 'замер', 'замера', 'замеров')} с ${formatDate(pts[0].date)}`)}</div>
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
      toast(L(`${files.length} photo${files.length > 1 ? 's' : ''} encrypted and saved`, `Фото зашифрованы и сохранены: ${files.length}`));
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

  const label = (p: Photo) => `${formatDate(p.takenAt.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })} · ${poseLabel(p.pose)}`;

  return (
    <>
      <Card>
        <CardTitle hint={L('Same lighting, distance, pose and time of day make comparisons meaningful. Photos are re-encoded (removing location metadata) and encrypted before storage.', 'Одинаковые свет, расстояние, ракурс и время дня делают сравнение осмысленным. Фото перекодируются (данные о месте съёмки удаляются) и шифруются перед сохранением.')}>{L('Add progress photos', 'Добавить фото прогресса')}</CardTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={L('Date', 'Дата')}><Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={L('Pose', 'Ракурс')}><Segmented value={pose} onChange={setPose} options={[{ value: 'front', label: L('Front', 'Спереди') }, { value: 'side', label: L('Side', 'Сбоку') }, { value: 'back', label: L('Back', 'Сзади') }]} /></Field>
          <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent-500 px-4 text-sm font-semibold text-ink-950 shadow-sm hover:bg-accent-400 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            <IconCamera size={16} /> {busy ? L('Encrypting…', 'Шифрование…') : L('Choose photos', 'Выбрать фото')}
            <input type="file" accept="image/*" capture="user" multiple className="hidden" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </Card>

      {photos.length >= 2 && left && right && (
        <Card>
          <CardTitle hint={L('Pick any two photos. Weight shown is the nearest weigh-in within 7 days.', 'Выберите любые два фото. Вес — ближайшее взвешивание в пределах 7 дней.')}>{L('Side-by-side comparison', 'Сравнение рядом')}</CardTitle>
          <div className="grid grid-cols-2 gap-3">
            {[{ p: left, set: setLeftId, val: left.id }, { p: right, set: setRightId, val: right.id }].map(({ p, set, val }, i) => {
              const w = weightNear(p.takenAt);
              return (
                <div key={i} className="space-y-2">
                  <Select value={val} onChange={(e) => set(e.target.value)} aria-label={i === 0 ? L('Before photo', 'Фото «до»') : L('After photo', 'Фото «после»')}>
                    {photos.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
                  </Select>
                  <ComparePhoto id={p.id} onClick={() => setView(p.id)} />
                  <div className="text-center text-xs text-ink-500">{label(p)}{w != null ? ` · ${fmt(w)} ${KG()}` : ''}</div>
                </div>
              );
            })}
          </div>
          <CompareSummary a={left} b={right} weightNear={weightNear} />
        </Card>
      )}

      <Card>
        <CardTitle right={<Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: L('All', 'Все') }, { value: 'front', label: L('Front', 'Спереди') }, { value: 'side', label: L('Side', 'Сбоку') }, { value: 'back', label: L('Back', 'Сзади') }]} />}>
          {L('Gallery', 'Галерея')}
        </CardTitle>
        {byDate.length === 0 ? <Empty title={L('No progress photos', 'Фото прогресса нет')}>{L('Add a front, side and back photo today to set your baseline.', 'Добавьте сегодня фото спереди, сбоку и сзади — это будет ваш базовый уровень.')}</Empty> : (
          <div className="space-y-4">
            {byDate.map(([d, ps]) => (
              <div key={d}>
                <div className="mb-2 text-xs font-semibold text-ink-600 dark:text-ink-300">{formatDate(d, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div className="flex flex-wrap gap-2">
                  {ps.map((p) => (
                    <div key={p.id} className="group relative">
                      <PhotoThumb id={p.id} className="h-36 w-28" onClick={() => setView(p.id)} alt={L(`${p.pose} progress photo`, `Фото прогресса: ${poseLabel(p.pose)}`)} />
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] capitalize text-white">{poseLabel(p.pose)}</span>
                      <button type="button" aria-label={L('Delete photo', 'Удалить фото')} onClick={async () => { if (window.confirm(L('Delete this progress photo permanently?', 'Удалить это фото прогресса навсегда?'))) { await store.deletePhoto(p.id); toast(L('Photo deleted', 'Фото удалено')); } }}
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
      {url ? <img src={url} alt={L('Progress', 'Прогресс')} className="h-full w-full object-cover" /> : <span className="block h-full w-full animate-pulse" />}
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
      <Badge tone="info">{L(`${days} day${days === 1 ? '' : 's'} apart`, `разница: ${days} ${ruPlural(days, 'день', 'дня', 'дней')}`)}</Badge>
      {w1 != null && w2 != null ? <Badge tone="accent">{L('weight', 'вес')} {w2 - w1 > 0 ? '+' : ''}{fmt(w2 - w1)} {KG()}</Badge> : <Badge>{L('no weigh-ins near both dates', 'нет взвешиваний рядом с обеими датами')}</Badge>}
      {first.pose !== second.pose && <Badge tone="warn">{L('different poses', 'разные ракурсы')}</Badge>}
    </div>
  );
}
