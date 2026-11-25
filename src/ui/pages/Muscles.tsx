import { accentHex } from '../accent';
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
import { L, byLang, num, ruPlural } from '../../i18n';

const STATUS_TONE: Record<WeekStatus, 'good' | 'violet' | 'info' | 'warn' | 'bad' | 'neutral'> = {
  done: 'good', over: 'violet', on_track: 'info', behind: 'warn', at_risk: 'bad', no_data: 'neutral',
};

const GROUP_COLORS: Record<string, string> = { push: '#14b8a6', pull: '#0ea5e9', arms: '#8b5cf6', legs: '#f59e0b', core: '#f43f5e' };
const GROUP_LABEL: Record<string, string> = byLang(() => ({ push: L('Chest & shoulders', 'Грудь и плечи'), pull: L('Back', 'Спина'), arms: L('Arms', 'Руки'), legs: L('Legs', 'Ноги'), core: L('Core', 'Кор') }));
const priorityLabel = (p: MusclePriority): string => (p === 'high' ? L('high', 'высокий') : p === 'maintain' ? L('maintain', 'поддержание') : L('normal', 'обычный'));
const sourceLabel = (s: 'reference' | 'individualized' | 'manual'): string => (s === 'reference' ? L('reference', 'ориентир из исследований') : s === 'individualized' ? L('individualized', 'по вашим данным') : L('manual', 'вручную'));
/** Chart tooltips: decimal comma in Russian. */
const tipNum = (v: unknown): string => (typeof v === 'number' ? num(v) : String(v));

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
      title={L('Muscle analytics', 'Аналитика по мышцам')}
      subtitle={<>{L(`Week ${weekLabel} · ${a.sessionsThisWeek} session${a.sessionsThisWeek === 1 ? '' : 's'} · ${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left`, `Неделя ${weekLabel} · ${a.sessionsThisWeek} ${ruPlural(a.sessionsThisWeek, 'тренировка', 'тренировки', 'тренировок')} · ${ruPlural(a.daysLeft, 'остался', 'осталось', 'осталось')} ${a.daysLeft} ${ruPlural(a.daysLeft, 'день', 'дня', 'дней')}`)}</>}
      actions={<Segmented<SortKey> size="sm" value={sort} onChange={setSort} options={[{ value: 'remaining', label: L('Most remaining', 'Больше осталось') }, { value: 'pct', label: L('Least done', 'Меньше сделано') }, { value: 'name', label: L('A–Z', 'А–Я') }]} />}
    >
      {a.learning.active && (
        <Callout tone="warn" icon={<IconInfo size={18} />} title={L('PROVISIONAL targets', 'ПРЕДВАРИТЕЛЬНЫЕ цели')}>{L('Literature reference ranges until your own baseline is ready.', 'Ориентиры из исследований, пока не готов ваш базовый уровень.')}</Callout>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={L('Effective sets', 'Эфф. подходы')} value={fmt(totals.eff)} sub={L('all muscles, this week', 'все мышцы, эта неделя')} />
        <Stat label={L('Remaining', 'Осталось')} value={fmt(totals.remaining)} sub={L('to preferred targets', 'до недельных целей')} tone={totals.remaining > 0 ? 'warn' : 'good'} />
        <Stat label={L('Targets met', 'Цели выполнены')} value={`${totals.met}/${a.muscles.length}`} sub={L('muscles at or above target', 'мышц на цели или выше')} tone={totals.met === a.muscles.length ? 'good' : undefined} />
        <Stat label={L('Uncertain', 'Под вопросом')} value={fmt(totals.uncertain)} sub={L('effective sets lacking RIR', 'эфф. подходы без RIR')} tone={totals.uncertain > 0 ? 'warn' : undefined} />
      </div>

      <SetLegend />

      {/* Desktop / tablet table */}
      <Card className="hidden sm:block" padded={false}>
        <div className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardTitle hint={L("Tap the pencil to inspect a target's reasoning, override it, or change the muscle's priority.", 'Нажмите на карандаш, чтобы посмотреть обоснование цели, задать её вручную или изменить приоритет мышцы.')}>{L('This week, every muscle', 'Эта неделя, все мышцы')}</CardTitle>
        </div>
        <Table head={[L('Muscle', 'Мышца'), L('Target', 'Цель'), L('Effective', 'Эфф.'), L('Direct', 'Прямые'), L('Indirect', 'Косвенные'), L('Fractional', 'Дробные'), L('Eff. dir / ind', 'Эфф. прям. / косв.'), L('Uncertain', 'Под вопросом'), L('To min', 'До мин.'), L('To target', 'До цели'), '%', L('Status', 'Статус'), '']}>
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
                    {m.target.source === 'manual' ? <Badge tone="accent">{L('Manual', 'Вручную')}</Badge> : <ConfidenceBadge c={m.target.confidence} provisional={m.target.provisional} />}
                    {data.settings.priorities[m.muscle] && data.settings.priorities[m.muscle] !== 'normal' && <Badge tone="neutral">{priorityLabel(data.settings.priorities[m.muscle]!)}</Badge>}
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
                <button onClick={() => setEditing(m.muscle)} className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900 dark:hover:bg-ink-800 dark:hover:text-white" aria-label={L(`Edit target for ${names.muscle(m.muscle)}`, `Изменить цель: ${names.muscle(m.muscle)}`)}>
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
      <div className="grid grid-cols-1 gap-3 text-xs leading-relaxed text-ink-600 dark:text-ink-300 md:grid-cols-3">
        <div>
          <div className="mb-0.5 font-semibold text-ink-900 dark:text-white">{L('Raw working sets', 'Рабочие подходы без поправок')} <span className="font-normal text-ink-400">{L('(observed)', '(наблюдение)')}</span></div>
          {L('Every non-warm-up set you logged that involves the muscle. ', 'Каждый записанный неразминочный подход, в котором участвует мышца. ')}<b>{L('Direct', 'Прямые')}</b>{L(' = the muscle is a primary mover (coefficient ≥ 0.75); ', ' — мышца работает как основная (коэффициент ≥ 0,75); ')}<b>{L('Indirect', 'Косвенные')}</b>{L(' = secondary or minor contributor.', ' — вспомогательная или небольшая роль.')}
        </div>
        <div>
          <div className="mb-0.5 font-semibold text-ink-900 dark:text-white">{L('Fractional sets', 'Дробные подходы')} <span className="font-normal text-ink-400">{L('(model)', '(модель)')}</span></div>
          {L('Sum of exercise coefficients — direct 1.0, significant secondary 0.5, minor 0.25 — ignoring effort. Coefficients are practical estimates, not measured activation.', 'Сумма коэффициентов упражнений — прямая работа 1,0, заметная вспомогательная 0,5, небольшая 0,25 — без учёта усилия. Коэффициенты — практические оценки, а не измеренная активация.')}
        </div>
        <div>
          <div className="mb-0.5 font-semibold text-ink-900 dark:text-white">{L('Effective sets', 'Эффективные подходы')} <span className="font-normal text-ink-400">{L('(estimate)', '(оценка)')}</span></div>
          {L('Fractional sets × effort credit (RIR 0–3 = full credit). Sets without RIR count provisionally and are shown as ', 'Дробные подходы × зачёт за усилие (RIR 0–3 — полный зачёт). Подходы без RIR засчитываются предварительно и показаны как ')}<span className="text-amber-600 dark:text-amber-400">{L('uncertain', '«под вопросом»')}</span>.
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
          <button onClick={onEdit} className="-mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label={L('Edit target', 'Изменить цель')}><IconEdit size={15} /></button>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between">
        <div className="tabular-nums">
          <span className="text-2xl font-semibold text-ink-900 dark:text-white">{fmt(m.remainingToPreferred)}</span>
          <span className="ml-1 text-xs text-ink-500">{L(`left of ${fmt(m.target.preferred)}`, `осталось из ${fmt(m.target.preferred)}`)}</span>
        </div>
        <span className="text-xs tabular-nums text-ink-500">{L(`${fmt(m.completed)} done`, `${fmt(m.completed)} сделано`)}</span>
      </div>
      <div className="mt-2"><VolumeBar completed={m.completed} min={m.target.min} preferred={m.target.preferred} max={m.target.max} uncertain={m.volume.uncertainEffective} /></div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
        <MiniStat k={L('Direct sets', 'Прямые подх.')} v={m.volume.directSets} />
        <MiniStat k={L('Indirect sets', 'Косв. подх.')} v={m.volume.indirectSets} />
        <MiniStat k={L('Fractional', 'Дробные')} v={fmt(m.volume.fractional)} />
        <MiniStat k={L('Eff. direct', 'Эфф. прямые')} v={fmt(m.volume.effectiveDirect)} />
        <MiniStat k={L('Eff. indirect', 'Эфф. косв.')} v={fmt(m.volume.effectiveIndirect)} />
        <MiniStat k={L('Uncertain', 'Под вопросом')} v={fmt(m.volume.uncertainEffective)} warn={m.volume.uncertainEffective > 0} />
        <MiniStat k={L('To min', 'До мин.')} v={fmt(m.remainingToMin)} />
        <MiniStat k={L('Range', 'Диапазон')} v={`${fmt(m.target.min)}–${fmt(m.target.max)}`} />
        <MiniStat k={L('Done', 'Сделано')} v={`${Math.round(m.pctOfPreferred * 100)}%`} />
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {m.target.source === 'manual' ? <Badge tone="accent">{L('Manual target', 'Цель вручную')}</Badge> : <ConfidenceBadge c={m.target.confidence} provisional={m.target.provisional} />}
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
      <CardTitle hint={L("Upper and lower chest are regions of one muscle (pectoralis major), not separate muscles, so they have no targets of their own. Shown as a share of this week's chest work. Shares can overlap or add up to under 100% because flat work spreads across the whole muscle.", 'Верх и низ груди — участки одной мышцы (большой грудной), а не отдельные мышцы, поэтому своих целей у них нет. Показаны как доля работы на грудь за эту неделю. Доли могут пересекаться или давать в сумме меньше 100%, потому что работа на горизонтальной скамье распределяется по всей мышце.')}>
        {L('Chest regional emphasis', 'Акцент по участкам груди')}
      </CardTitle>
      {chest <= 0 ? (
        <p className="text-sm text-ink-500">{L('No chest work logged this week yet.', 'На этой неделе работы на грудь пока нет.')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[{ k: L('Upper chest emphasis', 'Акцент на верх груди'), v: up }, { k: L('Lower chest emphasis', 'Акцент на низ груди'), v: low }].map(({ k, v }) => (
            <div key={k}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-ink-800 dark:text-ink-100">{k}</span>
                <span className="tabular-nums text-ink-500">{L(`${fmt(v.effective)} eff. · ${v.sets} sets · `, `${fmt(v.effective)} эфф. · ${v.sets} подх. · `)}<b className="text-ink-900 dark:text-white">{share(v.effective)}%</b></span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-ink-100 dark:bg-ink-800">
                <div className="h-2 rounded-full bg-accent-500" style={{ width: `${Math.min(100, share(v.effective))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-ink-400">{L('Emphasis follows the exercise and the bench angle you record (e.g. 15–45° incline, upper-chest emphasis).', 'Акцент зависит от упражнения и записанного угла скамьи (например, наклон 15–45° — акцент на верх груди).')}</p>
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
        hint={mode === 'single' ? L('Weekly effective sets split into direct and indirect contributions. The dashed line is the target that applied that week (frozen snapshot when available, otherwise the current target).', 'Эффективные подходы за неделю, разделённые на прямой и косвенный вклад. Штриховая линия — цель, действовавшая в ту неделю (сохранённый снимок, если он есть, иначе текущая цель).') : L('Weekly effective sets summed by body region. Regions overlap where exercises train several muscles.', 'Эффективные подходы за неделю по областям тела. Области пересекаются там, где упражнение нагружает несколько мышц.')}
        right={<Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'single', label: L('One muscle', 'Одна мышца') }, { value: 'groups', label: L('All regions', 'Все области') }]} />}
      >
        {L('Weekly trend', 'Тренд по неделям')}
      </CardTitle>
      {weeks.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">{L('Log workouts to build a weekly history.', 'Записывайте тренировки — появится история по неделям.')}</p>
      ) : mode === 'single' ? (
        <>
          <div className="mb-3 max-w-xs">
            <Select value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleId)} aria-label={L('Muscle', 'Мышца')}>
              {TRACKED_MUSCLES.map((m) => <option key={m} value={m}>{names.muscle(m)}</option>)}
            </Select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={single} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="week" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(135,145,165,0.08)' }} formatter={tipNum} />
                <Bar dataKey="direct" name={L('Direct (effective)', 'Прямые (эфф.)')} stackId="v" fill={accentHex(500)} radius={[0, 0, 0, 0]} />
                <Bar dataKey="indirect" name={L('Indirect (effective)', 'Косвенные (эфф.)')} stackId="v" fill={accentHex(300)} fillOpacity={0.55} radius={[4, 4, 0, 0]} />
                <Line dataKey="target" name={L('Target', 'Цель')} type="stepAfter" stroke="#8791a5" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
                <ReferenceLine y={t.min} stroke="#f59e0b" strokeOpacity={0.5} strokeDasharray="2 4" />
                <Legend wrapperStyle={{ fontSize: 11, left: 0, width: '100%' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-ink-400">{L(`Amber dotted line: current lower end (${fmt(t.min)}). Volume is always recomputed from raw sets, so edits to exercise coefficients apply retroactively.`, `Жёлтый пунктир — текущая нижняя граница (${fmt(t.min)}). Объём всегда пересчитывается из исходных подходов, поэтому изменения коэффициентов упражнений действуют и на прошлые недели.`)}</p>
        </>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={groups} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip formatter={tipNum} />
              {Object.entries(GROUP_COLORS).map(([g, c]) => (
                <Area key={g} type="monotone" dataKey={g} name={GROUP_LABEL[g]} stackId="g" stroke={c} fill={c} fillOpacity={0.35} />
              ))}
              <Legend wrapperStyle={{ fontSize: 11, left: 0, width: '100%' }} />
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
      toast(L(`${names.muscle(muscle)} target saved`, `Цель сохранена: ${names.muscle(muscle)}`));
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
      toast(L('Returned to the automatic target', 'Возвращена автоматическая цель'), 'info');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={L(`${names.muscle(muscle)} · weekly target`, `${names.muscle(muscle)} · недельная цель`)}
      footer={
        <>
          {existing && <Button variant="ghost" onClick={clearOverride} disabled={busy}>{L('Use automatic', 'Автоматическая')}</Button>}
          <Button variant="secondary" onClick={async () => { await savePriority(priority); toast(L('Priority saved', 'Приоритет сохранён')); onClose(); }} disabled={busy}>{L('Save priority only', 'Только приоритет')}</Button>
          <Button variant="primary" onClick={save} disabled={!valid || busy}>{L('Save override', 'Сохранить цель')}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-ink-900 dark:text-white">{L('Current:', 'Сейчас:')} {fmt(mw.target.min)}–{fmt(mw.target.preferred)}–{fmt(mw.target.max)}</span>
            {mw.target.source === 'manual' ? <Badge tone="accent">{L('Manual', 'Вручную')}</Badge> : <ConfidenceBadge c={mw.target.confidence} provisional={mw.target.provisional} />}
            <Badge tone="neutral">{L(`source: ${mw.target.source}`, `источник: ${sourceLabel(mw.target.source)}`)}</Badge>
          </div>
          <div className="mt-1 text-xs text-ink-500">
            {L('Personal baseline:', 'Личный базовый уровень:')} {mw.target.baseline != null ? L(`${fmt(mw.target.baseline)} effective sets/week (median of recent complete weeks)`, `${fmt(mw.target.baseline)} эфф. подходов в неделю (медиана последних полных недель)`) : L('not enough complete weeks yet', 'полных недель пока недостаточно')}
            {ref && <> · {L('Literature reference:', 'Ориентир из исследований:')} {ref.min}–{ref.preferred}–{ref.max}</>}
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
            {mw.target.rationale.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Priority', 'Приоритет')}</div>
          <Segmented<MusclePriority> value={priority} onChange={setPriority} options={[{ value: 'high', label: L('High', 'Высокий') }, { value: 'normal', label: L('Normal', 'Обычный') }, { value: 'maintain', label: L('Maintain', 'Поддержание') }]} />
          <p className="mt-1 text-[11px] text-ink-500">{L('High nudges the automatic target up by ~2 sets (within the upper bound); Maintain lowers it to roughly maintenance volume. Ignored while a manual override is set.', '«Высокий» поднимает автоматическую цель примерно на 2 подхода (в пределах верхней границы); «Поддержание» снижает её примерно до поддерживающего объёма. Не действует, пока задана ручная цель.')}</p>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Manual override (effective sets / week)', 'Ручная цель (эффективных подходов в неделю)')}</div>
          <div className="grid grid-cols-3 gap-2">
            <Field label={L('Lower end', 'Нижняя гр.')}><NumInput value={min} onChange={setMin} step={0.5} /></Field>
            <Field label={L('Preferred', 'Цель')}><NumInput value={pref} onChange={setPref} step={0.5} /></Field>
            <Field label={L('Upper bound', 'Верхняя гр.')}><NumInput value={max} onChange={setMax} step={0.5} /></Field>
          </div>
          {!valid && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{L('Needs 0 ≤ lower ≤ preferred ≤ upper ≤ 40.', 'Нужно: 0 ≤ нижняя ≤ цель ≤ верхняя ≤ 40.')}</p>}
          <Field label={L('Note (why you chose this)', 'Заметка (почему так)')} className="mt-2"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('e.g. specialization block for side delts', 'напр. акцент на средние дельты')} /></Field>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-500">{L('A manual target replaces the automatic one until cleared. Past weeks keep their frozen snapshots where available. More volume has diminishing returns — raise targets gradually and watch recovery and progression.', 'Ручная цель заменяет автоматическую, пока вы её не сбросите. Прошлые недели сохраняют свои снимки, где они есть. Отдача от дополнительного объёма убывает — повышайте цели постепенно и следите за восстановлением и прогрессией.')}</p>
        </div>
      </div>
    </Modal>
  );
}
