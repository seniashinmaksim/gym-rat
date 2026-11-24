import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MuscleWeek } from '../../domain/analysis';
import { addDays, formatDate } from '../../domain/dates';
import { TRACKED_MUSCLES } from '../../domain/muscles';
import type { RecoveryStatus } from '../../domain/recovery';
import type { DailyLog, MuscleId } from '../../domain/types';
import { store, useData } from '../../lib/store';
import { BodyMap } from '../components/BodyMap';
import { IconChevronDown } from '../components/icons';
import { Badge, Button, Card, CardTitle, cx, Field, fmt, Input, NumInput, Page, Segmented, toast, Why } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';
import { L, byLang, num, ruPlural } from '../../i18n';

const STATUS: Record<RecoveryStatus, { label: string; short: string; tone: 'good' | 'warn' | 'neutral'; bar: string }> = byLang(() => ({
  likely_recovered: { label: L('READY', 'ГОТОВА'), short: L('READY', 'ГОТОВА'), tone: 'good', bar: 'bg-emerald-500' },
  recovering: { label: L('RECOVERING', 'ВОССТАНАВЛИВАЕТСЯ'), short: L('RECOVERING', 'ВОССТАН.'), tone: 'warn', bar: 'bg-amber-500' },
  insufficient_data: { label: L('UNKNOWN', 'НЕТ ДАННЫХ'), short: L('UNKNOWN', 'НЕТ ДАННЫХ'), tone: 'neutral', bar: 'bg-ink-400' },
}));
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
    <Page title={L('Recovery', 'Восстановление')} subtitle={L('Estimates per muscle — not a measurement. Counted from when each session ended.', 'Оценка по каждой мышце — не измерение. Отсчёт идёт от конца тренировки.')}>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_1fr]">
        <Card>
          <CardTitle hint={L('Colour = estimated status, intensity = readiness.', 'Цвет — оценка состояния, насыщенность — готовность.')}>{L('Readiness map', 'Карта готовности')}</CardTitle>
          <BodyMap muscles={a.muscles} mode="recovery" selected={selected} onSelect={select} />
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {(['recovering', 'likely_recovered', 'insufficient_data'] as RecoveryStatus[]).map((s) => (
              <div key={s} className="rounded-xl bg-ink-50 py-2 dark:bg-ink-950">
                <div className="text-lg font-semibold tabular-nums text-ink-900 dark:text-white">{counts[s]}</div>
                <div className="text-[10px] uppercase tracking-wide text-ink-500">{STATUS[s].short}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">{L('Per muscle', 'По мышцам')}</h2>
            <Segmented<'all' | RecoveryStatus> size="sm" value={filter} onChange={setFilter} options={[
              { value: 'all', label: L('All', 'Все') }, { value: 'recovering', label: L('Recovering', 'Восстанавливается') }, { value: 'likely_recovered', label: L('Ready', 'Готова') }, { value: 'insufficient_data', label: L('Unknown', 'Нет данных') },
            ]} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {shown.map((m) => <RecoveryCard key={m.muscle} m={m} active={selected === m.muscle} onClick={() => setSelected(m.muscle)} />)}
          </div>
          {shown.length === 0 && <p className="py-6 text-center text-sm text-ink-500">{L('No muscles in this category.', 'В этой категории мышц нет.')}</p>}
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
            <span className="text-ink-500">{L('Estimated readiness', 'Готовность (оценка)')}</span>
            <span className="tabular-nums font-medium text-ink-800 dark:text-ink-100">{Math.round(readiness * 100)}%{hoursLeft ? L(` · ~${hoursLeft} h to go`, ` · ещё ~${num(hoursLeft)} ч`) : ''}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-ink-100 dark:bg-ink-800">
            <div className={cx('h-2 rounded-full transition-all', st.bar)} style={{ width: `${Math.round(readiness * 100)}%` }} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
            <KV k={L('Since last', 'Прошло')} v={r.hoursSince != null ? L(`${r.hoursSince} h`, `${num(r.hoursSince)} ч`) : '—'} />
            <KV k={L('Window', 'Окно')} v={r.windowHours != null ? L(`${r.windowHours} h`, `${num(r.windowHours)} ч`) : '—'} />
            <KV k={L('Last stimulus', 'Посл. нагрузка')} v={r.lastStimulusDate ? `${formatDate(r.lastStimulusDate, { day: 'numeric', month: 'short' })}${r.lastStimulusTime ? `, ${r.lastStimulusTime}${r.lastStimulusTimeSource === 'assumed' ? '?' : ''}` : ''}` : '—'} />
            <KV k={L('Last sets', 'Посл. подходы')} v={fmt(r.lastStimulusSets)} />
            <KV k={L('7-day eff.', 'Эфф. за 7 дн.')} v={fmt(r.recent7dEffective)} />
            <KV k={L('7-day dir / ind', 'Прям. / косв., 7 дн.')} v={`${r.recent7dDirect} / ${r.recent7dIndirect}`} />
            <KV k={L('Exposures 14 d', 'Нагрузок, 14 дн.')} v={r.exposures14d} />
            <KV k={L('Soreness', 'Крепатура')} v={r.soreness != null ? `${r.soreness}/4` : '—'} />
            <KV k={L('Weekly left', 'Осталось на нед.')} v={fmt(m.remainingToPreferred)} />
          </dl>
        </>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-ink-500">{L('No session with enough effective sets for this muscle is on record, so readiness cannot be estimated.', 'Нет записанной тренировки с достаточным числом эффективных подходов на эту мышцу, поэтому готовность оценить нельзя.')}
          {r.recent7dEffective > 0 && <> {L(`Recent indirect work: ${fmt(r.recent7dEffective)} effective sets in 7 days.`, `Недавняя косвенная работа: ${fmt(r.recent7dEffective)} ${ruPlural(Math.round(r.recent7dEffective * 10) / 10, 'эффективный подход', 'эффективных подхода', 'эффективных подходов')} за 7 дней.`)}</>}</p>
      )}

      <div className="mt-3">
        <Why label={L('Reasoning', 'Обоснование')}>
          {r.factors.map((f, i) => <p key={i}>• {f}</p>)}
          <p className="text-ink-400">{L('Heuristic estimate, not a measurement. Recovery varies with experience, nutrition, stress and exercise choice.', 'Эвристическая оценка, не измерение. Восстановление зависит от стажа, питания, стресса и выбора упражнений.')}</p>
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
      toast(L('Check-in saved', 'Отметка сохранена'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle hint={<>{L('Takes ~20 seconds. Soreness, sleep and fatigue lengthen the recovery estimates. Everything is optional; leave unknown fields blank (blank ≠ 0).', 'Занимает около 20 секунд. Крепатура, сон и усталость удлиняют оценку восстановления. Всё по желанию; неизвестные поля оставляйте пустыми (пусто ≠ 0).')}</>}
        right={<Badge tone={existing ? 'good' : 'neutral'}>{existing ? L('Saved today', 'Сохранено сегодня') : formatDate(today)}</Badge>}>
        {L('Daily check-in', 'Ежедневная отметка')}
      </CardTitle>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={L('Sleep last night (hours)', 'Сон прошлой ночью (часы)')}><NumInput value={log.sleepHours} onChange={(v) => set('sleepHours', v)} step={0.25} placeholder={L('e.g. 7.5', 'напр. 7,5')} /></Field>
        <Field label={L('Sleep quality', 'Качество сна')}><Rating value={log.sleepQuality} onChange={(v) => set('sleepQuality', v)} labels={[L('Poor', 'Плохое'), L('Excellent', 'Отличное')]} /></Field>
        <Field label={L('Energy', 'Энергия')}><Rating value={log.energy} onChange={(v) => set('energy', v)} labels={[L('Very low', 'Очень мало'), L('Excellent', 'Отлично')]} /></Field>
        <Field label={L('General fatigue', 'Общая усталость')}><Rating value={log.fatigue} onChange={(v) => set('fatigue', v)} labels={[L('Fresh', 'Свежесть'), L('Exhausted', 'Без сил')]} /></Field>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{L('Muscle soreness (0 none · 4 severe). Tap again to clear.', 'Крепатура (0 — нет · 4 — сильная). Нажмите ещё раз, чтобы убрать.')}</span>
          <span className="flex gap-1">{[0, 1, 2, 3, 4].map((n) => <span key={n} className={cx('rounded px-1.5 text-[10px] font-semibold', SORE_CLS[n])}>{n}</span>)}</span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {TRACKED_MUSCLES.map((m) => {
            const v = log.soreness?.[m];
            return (
              <div key={m} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-0.5">
                <span className="min-w-[6rem] flex-1 text-sm text-ink-700 dark:text-ink-200 break-words">{names.muscle(m)}</span>
                <div className="flex shrink-0 gap-1">
                  {[0, 1, 2, 3, 4].map((n) => (
                    <button key={n} type="button" onClick={() => setSore(m, n)} aria-label={L(`${names.muscle(m)} soreness ${n}`, `${names.muscle(m)}: крепатура ${n}`)}
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
            {L('Nutrition & supplements (optional)', 'Питание и добавки (по желанию)')}
            <IconChevronDown size={16} className={cx('transition', optOpen && 'rotate-180')} />
          </button>
          {optOpen && (
            <div className="grid grid-cols-1 gap-3 border-t border-ink-200 p-4 dark:border-ink-800 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={L('Protein (g)', 'Белок (г)')}><NumInput value={log.proteinG} onChange={(v) => set('proteinG', v)} /></Field>
              <Field label={L('Calories (kcal)', 'Калории (ккал)')}><NumInput value={log.calories} onChange={(v) => set('calories', v)} /></Field>
              <Field label={L('Creatine (g)', 'Креатин (г)')}><NumInput value={log.creatineG} onChange={(v) => set('creatineG', v)} step={0.5} /></Field>
              <Field label={L('Whey (servings)', 'Протеин (порции)')}><NumInput value={log.wheyServings} onChange={(v) => set('wheyServings', v)} step={0.5} /></Field>
              <Field label={L('Notes', 'Заметки')} className="sm:col-span-2 lg:col-span-4"><Input value={log.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} placeholder={L('Stress, illness, travel…', 'Стресс, болезнь, поездки…')} /></Field>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={save} disabled={busy}>{existing ? L('Update check-in', 'Обновить отметку') : L('Save check-in', 'Сохранить отметку')}</Button>
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
      <CardTitle hint={L('Sleep in hours (bars, left axis); fatigue 1–5 and peak soreness 0–4 (lines, right axis). Gaps = nothing logged.', 'Сон в часах (столбцы, левая ось); усталость 1–5 и максимальная крепатура 0–4 (линии, правая ось). Пропуски — ничего не записано.')}>{L('Last 14 days', 'Последние 14 дней')}</CardTitle>
      {!hasAny ? (
        <p className="py-8 text-center text-sm text-ink-500">{L('No check-ins yet. Daily check-ins make recovery estimates and deload signals more reliable.', 'Отметок пока нет. С ежедневными отметками оценки восстановления и сигналы к разгрузке надёжнее.')}</p>
      ) : (
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 0, left: -18, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis yAxisId="h" tickLine={false} axisLine={false} domain={[0, 10]} />
              <YAxis yAxisId="s" orientation="right" tickLine={false} axisLine={false} domain={[0, 5]} width={28} />
              <Tooltip cursor={{ fill: 'rgba(135,145,165,0.08)' }} formatter={(v: unknown) => (typeof v === 'number' ? num(v) : String(v))} />
              <Bar yAxisId="h" dataKey="sleep" name={L('Sleep (h)', 'Сон (ч)')} fill="#0ea5e9" fillOpacity={0.6} radius={[4, 4, 0, 0]} />
              <Line yAxisId="s" dataKey="fatigue" name={L('Fatigue (1–5)', 'Усталость (1–5)')} stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
              <Line yAxisId="s" dataKey="soreness" name={L('Peak soreness (0–4)', 'Макс. крепатура (0–4)')} stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 3" dot={{ r: 2 }} connectNulls />
              <Legend wrapperStyle={{ fontSize: 11, left: 0, width: '100%' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
