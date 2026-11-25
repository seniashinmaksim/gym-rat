import { accentHex } from '../accent';
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { diffDays, formatDate } from '../../domain/dates';
import { TRACKED_MUSCLES } from '../../domain/muscles';
import { qualitySetTotal } from '../../domain/volume';
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
import { L, byLang, getLang } from '../../i18n';

const KIND_LABEL: Record<TrainingBlock['kind'], string> = byLang(() => ({
  accumulation: L('Accumulation', 'Накопление'), maintenance: L('Maintenance', 'Поддержание'), deload: L('Deload', 'Разгрузка'), specialization: L('Specialization', 'Специализация'), other: L('Other', 'Другое'),
}));

export function PeriodizationPage() {
  const a = useAnalysis();
  const data = useData();
  const [editing, setEditing] = useState<TrainingBlock | 'new' | null>(null);
  const block = currentBlock(data, a.today);
  const deload = useMemo(() => assessDeload(data, a), [data, a]);
  const blocks = [...data.blocks].sort((x, y) => y.startDate.localeCompare(x.startDate));

  return (
    <Page
      title={L('Periodization', 'Периодизация')}
      subtitle={L('Flexible training blocks, volume trends and evidence-based deload signals.', 'Гибкие тренировочные блоки, тренды объёма и обоснованные сигналы к разгрузке.')}
      actions={<Button variant="primary" onClick={() => setEditing('new')}><IconPlus size={16} /> {L('New block', 'Новый блок')}</Button>}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CurrentBlockCard block={block} today={a.today} onEdit={(b) => setEditing(b)} onNew={() => setEditing('new')} />
        <DeloadCard deload={deload} />
      </div>

      <ProgressionHealth />
      <VolumeTrendCard />
      <HeatTable />

      <Card>
        <CardTitle hint={L("All blocks, newest first. Blocks organize your history. They don't change how volume is counted.", 'Все блоки, сначала новые. Блоки упорядочивают историю. На подсчёт объёма они не влияют.')}>{L('Block history', 'История блоков')}</CardTitle>
        {blocks.length === 0 ? (
          <p className="text-sm text-ink-500">{L('No blocks yet. Blocks are optional: a 4–8 week frame helps compare progress between phases.', 'Блоков пока нет. Они необязательны: рамка в 4–8 недель помогает сравнивать прогресс между этапами.')}</p>
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
                      {active && <Badge tone="accent">{L('Active', 'Активный')}</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {formatDate(b.startDate)} → {end ? formatDate(end) : L('ongoing', 'идёт')} · {L(`${Math.max(0, weeks)} wk of ${b.plannedWeeks} planned`, `${Math.max(0, weeks)} нед. из ${b.plannedWeeks} по плану`)}{b.focus ? ` · ${b.focus}` : ''}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(b)} aria-label={L('Edit block', 'Изменить блок')}><IconEdit size={15} /></Button>
                    <Button size="sm" variant="ghost" aria-label={L('Delete block', 'Удалить блок')} onClick={async () => {
                      if (!confirmAction(L(`Delete block "${b.name}"? Workouts are not affected.`, `Удалить блок «${b.name}»? Тренировки не затрагиваются.`))) return;
                      await store.deleteBlock(b.id);
                      toast(L('Block deleted', 'Блок удалён'), 'info');
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
        <CardTitle>{L('Current block', 'Текущий блок')}</CardTitle>
        <Empty title={L('No active block', 'Нет активного блока')} action={<Button variant="secondary" onClick={onNew}><IconLayers size={16} /> {L('Start a block', 'Начать блок')}</Button>}>
          {L('Blocks are an organizational frame (typically 4–8 weeks), not a growth mechanism. Changing phases does not create more hypertrophy by itself.', 'Блоки — способ организации (обычно 4–8 недель), а не механизм роста. Смена этапа сама по себе не даёт больше гипертрофии.')}
        </Empty>
      </Card>
    );
  }
  const week = Math.floor(diffDays(today, block.startDate) / 7) + 1;
  const pct = Math.min(100, (week / Math.max(1, block.plannedWeeks)) * 100);
  const over = week > block.plannedWeeks;
  const endBlock = async () => {
    if (!confirmAction(L(`End "${block.name}" today?`, `Завершить «${block.name}» сегодня?`))) return;
    await store.saveBlock({ ...block, endDate: today });
    toast(L('Block ended', 'Блок завершён'));
  };
  return (
    <Card>
      <CardTitle right={<Badge tone="accent">{KIND_LABEL[block.kind]}</Badge>}>{L('Current block', 'Текущий блок')}</CardTitle>
      <div className="text-lg font-semibold text-ink-900 dark:text-white">{block.name}</div>
      {block.focus && <div className="text-sm text-ink-500">{block.focus}</div>}
      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-3xl font-semibold tabular-nums text-ink-900 dark:text-white">{L(`Week ${week}`, `Неделя ${week}`)}</span>
        <span className="text-sm text-ink-500">{L(`of ${block.plannedWeeks} planned`, `из ${block.plannedWeeks} по плану`)}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {Array.from({ length: Math.max(block.plannedWeeks, week) }, (_, i) => (
          <div key={i} className={cx('h-2 flex-1 rounded-full', i < week ? (i >= block.plannedWeeks ? 'bg-violet-500' : 'bg-accent-500') : 'bg-ink-100 dark:bg-ink-800')} />
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-500">
        {L('Started', 'Начат')} {formatDate(block.startDate)}. {over
          ? L('Past the planned length. That is fine if you are still progressing; the plan is a frame, not a deadline.', 'Плановый срок пройден. Это нормально, если прогресс продолжается: план — рамка, а не крайний срок.')
          : L(`${Math.round(pct)}% through the planned frame.`, `Пройдено ${Math.round(pct)}% планового срока.`)}
      </p>
      {block.notes && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-ink-50 p-2.5 text-xs text-ink-600 dark:bg-ink-950 dark:text-ink-300">{block.notes}</p>}
      <div className="mt-4 flex gap-2">
        <Button size="sm" onClick={() => onEdit(block)}><IconEdit size={14} /> {L('Edit', 'Изменить')}</Button>
        <Button size="sm" variant="ghost" onClick={endBlock}>{L('End block today', 'Завершить блок сегодня')}</Button>
      </div>
    </Card>
  );
}

function DeloadCard({ deload }: { deload: ReturnType<typeof assessDeload> }) {
  return (
    <Card>
      <CardTitle hint={L('Deloads are NOT scheduled automatically every Nth week. One is suggested only when ≥3 independent fatigue indicators coincide.', 'Разгрузка НЕ назначается автоматически каждую N-ю неделю. Она предлагается, только когда совпадают ≥3 независимых признака усталости.')}
        right={<Badge tone={deload.recommend ? 'warn' : deload.score > 0 ? 'info' : 'good'}>{L(`${deload.score}/${deload.indicators.length} signals`, `${deload.score}/${deload.indicators.length} сигналов`)}</Badge>}>
        {L('Deload assessment', 'Нужна ли разгрузка')}
      </CardTitle>
      <Callout tone={deload.recommend ? 'warn' : 'good'} icon={deload.recommend ? <IconAlert size={18} /> : <IconCheck size={18} />} title={deload.recommend ? L('A deload may help', 'Разгрузка может помочь') : L('No deload needed', 'Разгрузка не нужна')}>
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
          <p>{L('Each indicator is an observation from your logs (performance trends, RIR, check-ins, weekly volume). None of them proves accumulated fatigue on its own, so the app waits for several to agree.', 'Каждый признак — наблюдение из ваших записей (тренды результатов, RIR, самочувствие, недельный объём). Ни один из них сам по себе не доказывает накопленную усталость, поэтому приложение ждёт совпадения нескольких.')}</p>
          <p>{L('Deload research is limited. A short period of reduced volume (≈ half the sets, moderate loads, RIR 3–4) is a common, low-risk way to let performance rebound. It is not required on a fixed schedule.', 'Исследований разгрузки мало. Короткий период сниженного объёма (≈ половина подходов, умеренные веса, RIR 3–4) — распространённый способ с низким риском дать результатам восстановиться. По жёсткому графику он не обязателен.')}</p>
        </Why>
      </div>
    </Card>
  );
}

const TREND_META: Record<TrendClass, { label: string; tone: 'good' | 'info' | 'warn' | 'bad' | undefined }> = byLang(() => ({
  progressing: { label: L('Progressing', 'Прогресс'), tone: 'good' },
  stable: { label: L('Stable', 'Стабильно'), tone: undefined },
  plateau: { label: L('Possible plateau', 'Возможное плато'), tone: 'warn' },
  declining: { label: L('Declining', 'Снижение'), tone: 'bad' },
  insufficient_data: { label: L('Too little data', 'Мало данных'), tone: undefined },
}));

function ProgressionHealth() {
  const a = useAnalysis();
  const names = useNames();
  const active = a.progression.filter((p) => p.current && diffDays(a.today, p.current.date) <= 42);
  const counts = (Object.keys(TREND_META) as TrendClass[]).map((k) => ({ k, n: active.filter((p) => p.trend.cls === k).length }));
  const concerning = active.filter((p) => p.trend.cls === 'declining' || p.trend.cls === 'plateau');
  return (
    <Card>
      <CardTitle hint={L('Exercise × equipment histories trained in the last 6 weeks. Each machine is tracked separately and loads are never compared across machines.', 'Истории «упражнение × оборудование» за последние 6 недель. Каждый тренажёр ведётся отдельно, веса между тренажёрами не сравниваются.')}>{L('Progression health', 'Состояние прогрессии')}</CardTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {counts.map(({ k, n }) => <Stat key={k} label={TREND_META[k].label} value={n} tone={n > 0 ? (TREND_META[k].tone === 'info' ? undefined : TREND_META[k].tone === 'bad' ? 'bad' : TREND_META[k].tone === 'warn' ? 'warn' : TREND_META[k].tone === 'good' ? 'good' : undefined) : undefined} />)}
      </div>
      {concerning.length > 0 && (
        <ul className="mt-4 space-y-2">
          {concerning.slice(0, 8).map((p) => (
            <li key={p.key} className="rounded-xl bg-ink-50 p-3 text-sm dark:bg-ink-950">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink-900 dark:text-white">{names.ex(a.registry.get(p.exerciseId), exerciseLabel(undefined, getLang(), p.exerciseId))}</span>
                <span className="text-xs text-ink-500">{p.scopeLabel}</span>
                <Badge tone={p.trend.cls === 'declining' ? 'bad' : 'warn'}>{TREND_META[p.trend.cls].label}</Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{p.trend.evidence}</p>
            </li>
          ))}
        </ul>
      )}
      {active.length === 0 && <p className="mt-3 text-sm text-ink-500">{L('No recent exercise histories yet.', 'Недавних историй упражнений пока нет.')}</p>}
    </Card>
  );
}

function VolumeTrendCard() {
  const a = useAnalysis();
  const data = useData();
  const rows = volumeTrend(a.weeks, 12, (ws) => qualitySetTotal(ws, a.registry, data.settings.quality));
  return (
    <Card>
      <CardTitle hint={L('Quality sets — every working set counted once, weighted by effort (bars) and number of sessions (line) per week. Rising volume should come with stable or improving performance; if performance drops while volume rises, that is a warning sign.', 'Качественные подходы — каждый рабочий подход считается один раз, с учётом усилия (столбцы) — и число тренировок (линия) по неделям. Объём должен расти при стабильных или растущих результатах; если результаты падают, а объём растёт — это тревожный признак.')}>{L('Volume trend · last 12 weeks', 'Тренд объёма · последние 12 недель')}</CardTitle>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">{L('No weekly history yet.', 'Недельной истории пока нет.')}</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 0, left: -14, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} />
              <YAxis yAxisId="v" tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis yAxisId="s" orientation="right" tickLine={false} axisLine={false} allowDecimals={false} width={24} />
              <Tooltip cursor={{ fill: 'rgba(135,145,165,0.08)' }} />
              <Bar yAxisId="v" dataKey="total" name={L('Quality sets', 'Качественные подходы')} fill={accentHex(500)} fillOpacity={0.75} radius={[5, 5, 0, 0]} />
              <Line yAxisId="s" dataKey="sessions" name={L('Sessions', 'Тренировки')} stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
              <Legend wrapperStyle={{ fontSize: 11, left: 0, width: '100%' }} />
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
      <CardTitle hint={L('Effective sets per muscle per week, coloured against the current target: amber = below lower end · blue = within range · green = target met · violet = above upper bound.', 'Эффективные подходы на мышцу по неделям; цвет — относительно текущей цели: жёлтый = ниже нижней границы · синий = в диапазоне · зелёный = цель выполнена · фиолетовый = выше верхней границы.')}>{L('Weekly volume by muscle · last 8 weeks', 'Недельный объём по мышцам · последние 8 недель')}</CardTitle>
      <div className="scroll-x">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-ink-400">
              <th className="text-left font-medium">{L('Muscle', 'Мышца')}</th>
              {weeks.map((w) => <th key={w.range.start} className="font-medium tabular-nums">{w.range.start.slice(5)}{!w.complete && '*'}</th>)}
              <th className="font-medium">{L('Target', 'Цель')}</th>
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
      <p className="mt-2 text-[11px] text-ink-400">{L("* current, unfinished week. Colours use today's targets; frozen weekly snapshots are shown in Reports.", '* текущая, незавершённая неделя. Цвета считаются по сегодняшним целям; зафиксированные недельные снимки — в «Отчётах».')}</p>
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
      toast(block ? L('Block updated', 'Блок обновлён') : L('Block created', 'Блок создан'));
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={block ? L('Edit block', 'Изменить блок') : L('New training block', 'Новый тренировочный блок')}
      footer={<><Button variant="ghost" onClick={onClose}>{L('Cancel', 'Отмена')}</Button><Button variant="primary" onClick={save} disabled={!valid || busy}>{L('Save', 'Сохранить')}</Button></>}>
      <div className="space-y-3">
        <Field label={L('Name', 'Название')}><Input value={b.name} onChange={(e) => set('name', e.target.value)} placeholder={L('e.g. Winter accumulation', 'напр. Зимнее накопление')} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={L('Type', 'Тип')}>
            <Select value={b.kind} onChange={(e) => set('kind', e.target.value as TrainingBlock['kind'])}>
              {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          <Field label={L('Planned weeks', 'Недель по плану')} hint={b.plannedWeeks < 4 || b.plannedWeeks > 8 ? L('Outside the usual 4–8 week frame. That is fine if intentional.', 'Вне обычной рамки 4–8 недель. Это нормально, если так задумано.') : L('Typical frame: 4–8 weeks', 'Обычная рамка: 4–8 недель')}>
            <Stepper value={b.plannedWeeks} onChange={(v) => set('plannedWeeks', Math.max(1, Math.min(16, Math.round(v ?? 1))))} min={1} label={L('Planned weeks', 'Недель по плану')} />
          </Field>
          <Field label={L('Start date', 'Дата начала')}><Input type="date" value={b.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>
          <Field label={L('End date (optional)', 'Окончание (необяз.)')}><Input type="date" value={b.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} /></Field>
        </div>
        <Field label={L('Focus (optional)', 'Акцент (необязательно)')}><Input value={b.focus ?? ''} onChange={(e) => set('focus', e.target.value)} placeholder={L('e.g. bring up side delts & hamstrings', 'напр. подтянуть средние дельты и бицепс бедра')} /></Field>
        <Field label={L('Notes (optional)', 'Заметки (необязательно)')}><TextArea value={b.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className="font-sans text-sm" /></Field>
      </div>
    </Modal>
  );
}
