import { useMemo, useState } from 'react';
import { SEED_BY_ID } from '../../data/exercises';
import { EXERCISE_AUDIT_BY_ID } from '../../data/scientific-evidence/exerciseAudit';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, involvement, muscleName } from '../../domain/muscles';
import { searchExercises } from '../../domain/registry';
import type { EquipmentKind, ExerciseDef, ExerciseOverride, MovementPattern, MuscleId, RegionId } from '../../domain/types';
import { slugId } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { formatDate } from '../../domain/dates';
import { IconInfo, IconPlus, IconSearch } from '../components/icons';
import {
  Badge, Button, Callout, Card, CardTitle, Empty, Field, Input, Modal, NumInput, Page, Segmented, Select, TextArea, cx, fmt, toast,
} from '../components/ui';
import { useAnalysis, useNames } from '../hooks';
import { KG, L, getLang, ruPlural } from '../../i18n';

const PATTERNS: MovementPattern[] = [
  'horizontal_push', 'incline_push', 'vertical_push', 'chest_fly', 'horizontal_pull', 'vertical_pull', 'shoulder_abduction', 'rear_delt',
  'shrug', 'elbow_flexion', 'elbow_extension', 'wrist', 'squat', 'hinge', 'lunge', 'knee_extension', 'knee_flexion', 'hip_extension',
  'hip_adduction', 'hip_abduction', 'calf', 'core', 'back_extension', 'carry', 'other',
];
const KINDS: EquipmentKind[] = ['machine', 'plate_loaded', 'cable', 'smith', 'barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band', 'other'];
const COEFS = ['0', '0.25', '0.5', '0.75', '1'] as const;
// Movement patterns, equipment kinds, categories and trend classes are stored codes: only the shown label is translated.
const CODE_RU: Record<string, string> = {
  horizontal_push: 'горизонтальный жим', incline_push: 'наклонный жим', vertical_push: 'вертикальный жим', chest_fly: 'сведение рук',
  horizontal_pull: 'горизонтальная тяга', vertical_pull: 'вертикальная тяга', shoulder_abduction: 'отведение плеча', rear_delt: 'задние дельты',
  shrug: 'шраги', elbow_flexion: 'сгибание локтя', elbow_extension: 'разгибание локтя', wrist: 'запястья', squat: 'приседание',
  hinge: 'тазовый наклон', lunge: 'выпад', knee_extension: 'разгибание колена', knee_flexion: 'сгибание колена', hip_extension: 'разгибание бедра',
  hip_adduction: 'приведение бедра', hip_abduction: 'отведение бедра', calf: 'икры', core: 'кор', back_extension: 'разгибание спины',
  carry: 'переноска', other: 'другое',
  machine: 'тренажёр', plate_loaded: 'на дисках', cable: 'блок', smith: 'Смит', barbell: 'штанга', dumbbell: 'гантели',
  kettlebell: 'гиря', bodyweight: 'свой вес', band: 'эспандер',
  compound: 'базовое', isolation: 'изолирующее',
  progressing: 'прогресс', stable: 'стабильно', plateau: 'плато', declining: 'снижение', insufficient_data: 'мало данных',
  high: 'высокая', moderate: 'средняя', low: 'низкая',
};
const pretty = (s: string) => (getLang() === 'ru' ? CODE_RU[s] ?? s.replace(/_/g, ' ') : s.replace(/_/g, ' '));

export function ExercisesPage() {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | ''>('');
  const [category, setCategory] = useState<'all' | 'compound' | 'isolation'>('all');
  const [kind, setKind] = useState<EquipmentKind | ''>('');
  const [pattern, setPattern] = useState<MovementPattern | ''>('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const usage = useMemo(() => {
    const m = new Map<string, { sessions: number; last: string | null; instances: number }>();
    for (const p of a.progression) {
      const u = m.get(p.exerciseId) ?? { sessions: 0, last: null, instances: 0 };
      u.sessions += p.sessions.length;
      u.instances += 1;
      const d = p.current?.date ?? null;
      if (d && (!u.last || d > u.last)) u.last = d;
      m.set(p.exerciseId, u);
    }
    return m;
  }, [a.progression]);

  const list = useMemo(() => {
    let defs: ExerciseDef[] = q.trim() ? searchExercises(a.registry, q, 200) : [...a.registry.values()].sort((x, y) => (names.lang === 'ru' ? x.name.ru.localeCompare(y.name.ru, 'ru') : x.name.en.localeCompare(y.name.en)));
    if (muscle) defs = defs.filter((d) => (d.contributions[muscle] ?? 0) > 0).sort((x, y) => (y.contributions[muscle] ?? 0) - (x.contributions[muscle] ?? 0));
    if (category !== 'all') defs = defs.filter((d) => d.category === category);
    if (kind) defs = defs.filter((d) => d.equipmentKind === kind);
    if (pattern) defs = defs.filter((d) => d.pattern === pattern);
    if (onlyMine) defs = defs.filter((d) => usage.has(d.id));
    return defs;
  }, [a.registry, q, muscle, category, kind, pattern, onlyMine, usage, names.lang]);

  const overridden = new Set(data.exerciseOverrides.map((o) => o.id));
  const selected = open ? a.registry.get(open) : undefined;

  return (
    <Page
      title={L('Exercise database', 'База упражнений')}
      subtitle={L(`${a.registry.size} exercises · fractional set coefficients · English & Russian names`, `${a.registry.size} ${ruPlural(a.registry.size, 'упражнение', 'упражнения', 'упражнений')} · дробные коэффициенты подходов · названия на русском и английском`)}
      actions={<Button variant="primary" onClick={() => setCreating(true)}><IconPlus size={16} /> {L('Custom exercise', 'Своё упражнение')}</Button>}
    >
      <Callout tone="info" icon={<IconInfo size={18} />} title={L('Coefficients: 1 direct · 0.5 secondary · 0.25 minor', 'Коэффициенты: 1 — основная · 0,5 — вторичная · 0,25 — малая')}>{L('Estimates, not activation measurements. Edits recalculate all history.', 'Это оценки, а не измерения активации. Правки пересчитывают всю историю.')}</Callout>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Search: pulldown, жим лежа, pec deck…', 'Поиск: жим лёжа, pulldown, пек-дек…')} className="pl-9" />
          </div>
          <Segmented value={category} onChange={setCategory} options={[{ value: 'all', label: L('All', 'Все') }, { value: 'compound', label: L('Compound', 'Базовые') }, { value: 'isolation', label: L('Isolation', 'Изолирующие') }]} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleId | '')} aria-label={L('Filter by muscle', 'Фильтр по мышце')}>
            <option value="">{L('Any muscle', 'Любая мышца')}</option>
            {TRACKED_MUSCLES.map((m) => <option key={m} value={m}>{L(`${muscleName(m)} · ${muscleName(m, 'ru')}`, `${muscleName(m, 'ru')} · ${muscleName(m)}`)}</option>)}
          </Select>
          <Select value={pattern} onChange={(e) => setPattern(e.target.value as MovementPattern | '')} aria-label={L('Filter by movement pattern', 'Фильтр по типу движения')}>
            <option value="">{L('Any movement', 'Любое движение')}</option>
            {PATTERNS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}
          </Select>
          <Select value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind | '')} aria-label={L('Filter by equipment', 'Фильтр по оборудованию')}>
            <option value="">{L('Any equipment', 'Любое оборудование')}</option>
            {KINDS.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}
          </Select>
          <button type="button" onClick={() => setOnlyMine(!onlyMine)}
            className={cx('h-10 rounded-xl border px-3 text-sm font-medium transition', onlyMine ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300')}>
            {onlyMine ? '✓ ' : ''}{L("Only exercises I've done", 'Только из моих тренировок')}
          </button>
        </div>
        <div className="mt-2 text-xs text-ink-500">{L(`${list.length} result${list.length === 1 ? '' : 's'}${muscle ? ` · sorted by ${muscleName(muscle).toLowerCase()} coefficient` : ''}`, `${list.length} ${ruPlural(list.length, 'результат', 'результата', 'результатов')}${muscle ? ` · сортировка по коэффициенту: ${muscleName(muscle, 'ru').toLowerCase()}` : ''}`)}</div>
      </Card>

      {list.length === 0 ? (
        <Empty title={L('No exercises match', 'Ничего не найдено')} action={<Button onClick={() => setCreating(true)}>{L('Create a custom exercise', 'Создать своё упражнение')}</Button>}>{L('Try a different spelling, or add it as a custom exercise.', 'Попробуйте другое написание или добавьте своё упражнение.')}</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => {
            const u = usage.get(d.id);
            const entries = Object.entries(d.contributions).filter(([, c]) => (c ?? 0) > 0).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0)) as [MuscleId, number][];
            return (
              <button key={d.id} type="button" onClick={() => setOpen(d.id)}
                className="group flex w-full min-w-0 flex-col rounded-2xl border border-ink-200 bg-white p-4 text-left transition hover:border-accent-500/60 hover:shadow-md dark:border-ink-800 dark:bg-ink-900 dark:hover:border-accent-500/50">
                <div className="flex w-full min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink-900 dark:text-white">{L(d.name.en, d.name.ru)}</div>
                    <div className="truncate text-xs text-ink-500 dark:text-ink-400">{L(d.name.ru, d.name.en)}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={d.category === 'compound' ? 'info' : 'neutral'}>{pretty(d.category)}</Badge>
                    {d.custom && <Badge tone="violet">{L('custom', 'своё')}</Badge>}
                    {overridden.has(d.id) && <Badge tone="warn">{L('edited', 'изменено')}</Badge>}
                  </div>
                </div>
                <div className="mt-3 flex w-full min-w-0 flex-wrap gap-1">
                  {entries.map(([m, c]) => (
                    <span key={m} className={cx('inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium',
                      involvement(c) === 'direct' ? 'bg-accent-500/15 text-accent-600 dark:text-accent-400' : involvement(c) === 'indirect' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400')}>
                      {names.muscle(m)} <span className="tabular-nums opacity-70">{c}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-ink-500 dark:text-ink-400">
                  <span>{pretty(d.equipmentKind)}</span>
                  <span>{d.repRange[0]}–{d.repRange[1]} {L('reps', 'повт.')}</span>
                  <span>{L('rest', 'отдых')} ~{Math.round(d.defaultRestSec / 15) * 15}{L('s', ' с')}</span>
                  {u ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{L(`${u.sessions} session${u.sessions === 1 ? '' : 's'}`, `${u.sessions} ${ruPlural(u.sessions, 'тренировка', 'тренировки', 'тренировок')}`)}</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ExerciseDetail
          key={selected.id}
          def={selected}
          seed={SEED_BY_ID[selected.id]}
          override={data.exerciseOverrides.find((o) => o.id === selected.id)}
          usage={usage.get(selected.id)}
          defaultRir={data.settings.defaultTargetRir}
          onClose={() => setOpen(null)}
          exName={names.ex}
        />
      )}
      {creating && <CustomExerciseForm onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
    </Page>
  );
}

function ExerciseDetail({ def, seed, override, usage, defaultRir, onClose }: {
  def: ExerciseDef;
  seed?: ExerciseDef;
  override?: ExerciseOverride;
  usage?: { sessions: number; last: string | null; instances: number };
  defaultRir: number;
  onClose: () => void;
  exName: (d: ExerciseDef | undefined) => string;
}) {
  const a = useAnalysis();
  const names = useNames();
  const [coefs, setCoefs] = useState<Partial<Record<MuscleId, number>>>({ ...def.contributions });
  const [regions, setRegions] = useState<Partial<Record<RegionId, number>>>({ ...(def.regionEmphasis ?? {}) });
  const [repLo, setRepLo] = useState<number | null>(def.repRange[0]);
  const [repHi, setRepHi] = useState<number | null>(def.repRange[1]);
  const [rir, setRir] = useState<number | null>(override?.targetRir ?? defaultRir);
  const [rest, setRest] = useState<number | null>(def.defaultRestSec);
  const [notes, setNotes] = useState(override?.notes ?? '');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = showAll ? TRACKED_MUSCLES : TRACKED_MUSCLES.filter((m) => (coefs[m] ?? 0) > 0 || (def.contributions[m] ?? 0) > 0);
  const series = a.progression.filter((p) => p.exerciseId === def.id);
  const dirty = JSON.stringify(clean(coefs)) !== JSON.stringify(clean(def.contributions))
    || JSON.stringify(clean(regions)) !== JSON.stringify(clean(def.regionEmphasis ?? {}))
    || repLo !== def.repRange[0] || repHi !== def.repRange[1] || rest !== def.defaultRestSec
    || rir !== (override?.targetRir ?? defaultRir) || notes !== (override?.notes ?? '');

  const save = async () => {
    if (repLo == null || repHi == null || repLo < 1 || repHi < repLo) return toast(L('Rep range must be valid (low ≤ high)', 'Диапазон повторений задан неверно (мин. ≤ макс.)'), 'bad');
    setBusy(true);
    try {
      await store.saveOverride({
        id: def.id,
        contributions: clean(coefs),
        regionEmphasis: clean(regions),
        repRange: [repLo, repHi],
        targetRir: rir ?? undefined,
        defaultRestSec: rest ?? undefined,
        notes: notes || undefined,
        updatedAt: new Date().toISOString(),
      });
      toast(L('Saved — historical volume recalculated', 'Сохранено — объём в истории пересчитан'));
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(L('Reset this exercise to its default coefficients and settings? Your history will be recalculated with the defaults.', 'Сбросить коэффициенты и настройки этого упражнения к значениям по умолчанию? История будет пересчитана с ними.'))) return;
    await store.deleteOverride(def.id);
    toast(L('Reset to default', 'Сброшено к значениям по умолчанию'));
    onClose();
  };

  const removeCustom = async () => {
    const used = series.length > 0;
    if (!window.confirm(used ? L('This custom exercise has logged history. Deleting it makes those sets uncountable (they will show as an unknown exercise). Delete anyway?', 'У этого упражнения есть записанная история. После удаления эти подходы нельзя будет учесть (они будут показаны как неизвестное упражнение). Всё равно удалить?') : L('Delete this custom exercise?', 'Удалить это своё упражнение?'))) return;
    await store.deleteCustomExercise(def.id);
    if (override) await store.deleteOverride(def.id);
    toast(L('Custom exercise deleted', 'Своё упражнение удалено'));
    onClose();
  };

  return (
    <Modal open onClose={onClose} wide title={<span>{L(def.name.en, def.name.ru)} <span className="font-normal text-ink-500">· {L(def.name.ru, def.name.en)}</span></span>}
      footer={<>
        {def.custom && <Button variant="danger" onClick={removeCustom} className="mr-auto">{L('Delete', 'Удалить')}</Button>}
        {override && <Button variant="ghost" onClick={reset} className={def.custom ? '' : 'mr-auto'}>{L('Reset to default', 'Сбросить')}</Button>}
        <Button onClick={onClose}>{L('Close', 'Закрыть')}</Button>
        <Button variant="primary" onClick={save} disabled={!dirty || busy}>{busy ? L('Saving…', 'Сохранение…') : L('Save changes', 'Сохранить')}</Button>
      </>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="info">{pretty(def.category)}</Badge>
          <Badge>{pretty(def.pattern)}</Badge>
          <Badge>{pretty(def.equipmentKind)}</Badge>
          {def.angleSensitive && <Badge tone="accent">{L('bench-angle sensitive', 'зависит от угла скамьи')}</Badge>}
          {def.custom && <Badge tone="violet">{L('custom', 'своё')}</Badge>}
          {override && <Badge tone="warn">{L('edited', 'изменено')} {formatDate(override.updatedAt.slice(0, 10))}</Badge>}
        </div>

        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{L('Biomechanics', 'Биомеханика')}</h4>
          <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{def.biomechanics || L('No notes.', 'Заметок нет.')}</p>
          {def.angleSensitive && (
            <p className="mt-2 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
              {L('When you record a bench angle, coefficients adapt automatically: decline (≤ −5°) → lower-chest emphasis and less front-delt work; flat → whole pec; 10–45° → upper-chest emphasis; above 45° → behaves more like an overhead press (chest 0.75, front delts 0.75).',
                'Когда вы указываете угол скамьи, коэффициенты подстраиваются автоматически: отрицательный наклон (≤ −5°) → акцент на низ груди и меньше работы передних дельт; горизонтально → вся грудная мышца; 10–45° → акцент на верх груди; выше 45° → ближе к жиму над головой (грудь 0,75, передние дельты 0,75).')}
            </p>
          )}
          {def.aliases.length > 0 && <p className="mt-2 text-xs text-ink-500">{L('Also recognised as:', 'Также распознаётся как:')} {def.aliases.join(' · ')}</p>}
          {EXERCISE_AUDIT_BY_ID[def.id] && !def.custom && (() => {
            const au = EXERCISE_AUDIT_BY_ID[def.id];
            return (
              <div className="mt-3 rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300" data-testid="mapping-audit">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold uppercase tracking-wide text-ink-500">{L('Muscle mapping', 'Участие мышц')}</span>
                  <Badge tone={au.verdict === 'uncertain' ? 'warn' : 'good'}>{au.verdict === 'uncertain' ? L('UNCERTAIN', 'НЕОПРЕДЕЛЁННО') : au.verdict === 'corrected' ? L('CORRECTED', 'ИСПРАВЛЕНО') : L('VERIFIED', 'ПРОВЕРЕНО')}</Badge>
                  <Badge>{L(`${au.confidence} confidence`, `уверенность: ${CODE_RU[au.confidence] ?? au.confidence}`)}</Badge>
                </div>
                <p>{au.rationale}</p>
                {au.stabilizers.length > 0 && <p className="mt-1">{L('Stabilisers only (not counted as trained):', 'Только стабилизаторы (не считаются тренируемыми):')} {au.stabilizers.map((m) => muscleName(m, getLang())).join(', ')}.</p>}
                {au.previous && <p className="mt-1">{L('Before the audit:', 'До аудита:')} {Object.entries(au.previous).map(([m, c]) => `${muscleName(m as MuscleId, getLang())} ${c}`).join(', ')}.</p>}
                {au.limitations && <p className="mt-1 text-ink-500">{L('Limits:', 'Ограничения:')} {au.limitations}</p>}
              </div>
            );
          })()}
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-ink-50 p-3 text-center dark:bg-ink-950">
          <div><div className="text-[11px] uppercase tracking-wide text-ink-500">{L('Sessions', 'Тренировки')}</div><div className="text-lg font-semibold tabular-nums">{usage?.sessions ?? 0}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-ink-500">{L('Last used', 'Последний раз')}</div><div className="text-sm font-semibold">{usage?.last ? formatDate(usage.last) : '—'}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-ink-500">{L('Equipment', 'Оборудование')}</div><div className="text-lg font-semibold tabular-nums">{usage?.instances ?? 0}</div></div>
        </div>
        {series.length > 0 && (
          <div className="space-y-1">
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2 text-xs dark:border-ink-800">
                <span className="truncate text-ink-700 dark:text-ink-200">{s.scopeLabel}</span>
                <span className="shrink-0 tabular-nums text-ink-500">
                  {s.current?.topWeight != null ? `${fmt(s.current.topWeight)} ${KG()} × ${s.current.topReps ?? '?'}` : '—'} · <TrendBadge cls={s.trend.cls} />
                </span>
              </div>
            ))}
            <p className="text-[11px] text-ink-500">{L('Each machine keeps its own history — loads are never compared across equipment.', 'У каждого тренажёра своя история — веса на разном оборудовании не сравниваются.')}</p>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{L('Muscle coefficients', 'Коэффициенты мышц')}</h4>
            <button type="button" className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400" onClick={() => setShowAll(!showAll)}>
              {showAll ? L('Show involved only', 'Только задействованные') : L('Show all muscles', 'Показать все мышцы')}
            </button>
          </div>
          <Callout tone="warn">{L('Changing a coefficient recalculates the weekly volume of', 'Изменение коэффициента пересчитывает недельный объём')} <b>{L('all historical workouts', 'всех прошлых тренировок')}</b> {L('that used this exercise. Coefficients are practical estimates, not activation measurements.', 'с этим упражнением. Коэффициенты — практические оценки, а не измерения активации.')}</Callout>
          <div className="mt-3 space-y-2">
            {visible.map((m) => {
              const changed = (coefs[m] ?? 0) !== ((seed ?? def).contributions[m] ?? 0);
              return (
                <div key={m} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-800 dark:text-ink-100">{names.muscle(m)} {changed && <span className="text-[10px] text-amber-600 dark:text-amber-400">{L('• changed', '• изменено')}</span>}</div>
                    <div className="text-[11px] text-ink-500">{L(MUSCLE_BY_ID[m].name.ru, MUSCLE_BY_ID[m].name.en)} · {labelFor(coefs[m] ?? 0)}</div>
                  </div>
                  <Segmented size="sm" value={String(coefs[m] ?? 0) as (typeof COEFS)[number]} onChange={(v) => setCoefs({ ...coefs, [m]: Number(v) })}
                    options={COEFS.map((c) => ({ value: c, label: c }))} />
                </div>
              );
            })}
          </div>
        </div>

        {(coefs.chest ?? 0) > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">{L('Pec regional emphasis', 'Акцент по отделам груди')}</h4>
            <p className="mb-2 text-[11px] text-ink-500">{L('Upper/lower chest are emphasis areas of the same muscle — tracked as a share of chest work, never added to the chest total.', 'Верх и низ груди — зоны акцента одной мышцы: учитываются как доля работы на грудь и никогда не прибавляются к её итогу.')}</p>
            {(['upper_chest', 'lower_chest'] as RegionId[]).map((r) => (
              <div key={r} className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink-800 dark:text-ink-100">{muscleName(r, getLang())}</span>
                <Segmented size="sm" value={String(regions[r] ?? 0) as (typeof COEFS)[number]} onChange={(v) => setRegions({ ...regions, [r]: Number(v) })}
                  options={(['0', '0.5', '1'] as const).map((c) => ({ value: c, label: c }))} />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label={L('Rep range low', 'Повторения, мин.')}><NumInput value={repLo} onChange={setRepLo} /></Field>
          <Field label={L('Rep range high', 'Повторения, макс.')}><NumInput value={repHi} onChange={setRepHi} /></Field>
          <Field label={L('Target RIR', 'Целевой RIR')} hint={L('Used for double progression', 'Для двойной прогрессии')}><NumInput value={rir} onChange={setRir} /></Field>
          <Field label={L('Default rest (s)', 'Отдых по умолч. (с)')}><NumInput value={rest} onChange={setRest} /></Field>
        </div>
        <Field label={L('Personal notes (technique, cues, setup)', 'Личные заметки (техника, подсказки, настройка)')}>
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="font-sans text-sm" placeholder={L('e.g. elbows ~45°, pause at chest', 'напр. локти ~45°, пауза у груди')} />
        </Field>
      </div>
    </Modal>
  );
}

function TrendBadge({ cls }: { cls: string }) {
  const tone = cls === 'progressing' ? 'good' : cls === 'declining' ? 'bad' : cls === 'plateau' ? 'warn' : cls === 'stable' ? 'info' : 'neutral';
  return <Badge tone={tone}>{getLang() === 'ru' ? CODE_RU[cls] ?? cls.replace('_', ' ') : cls.replace('_', ' ')}</Badge>;
}

function labelFor(c: number) {
  const i = involvement(c);
  return i === 'direct' ? L('direct', 'основная') : i === 'indirect' ? L('significant secondary', 'значимая вторичная') : i === 'minor' ? L('minor', 'малая') : L('not involved', 'не участвует');
}

function clean<T extends string>(o: Partial<Record<T, number>>): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  for (const k of Object.keys(o).sort() as T[]) if ((o[k] ?? 0) > 0) out[k] = o[k];
  return out;
}

function CustomExerciseForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [en, setEn] = useState('');
  const [ru, setRu] = useState('');
  const [aliases, setAliases] = useState('');
  const [pattern, setPattern] = useState<MovementPattern>('other');
  const [category, setCategory] = useState<'compound' | 'isolation'>('isolation');
  const [kind, setKind] = useState<EquipmentKind>('machine');
  const [coefs, setCoefs] = useState<Partial<Record<MuscleId, number>>>({});
  const [repLo, setRepLo] = useState<number | null>(8);
  const [repHi, setRepHi] = useState<number | null>(12);
  const [rest, setRest] = useState<number | null>(90);
  const [bio, setBio] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const primary = Object.values(coefs).some((c) => (c ?? 0) >= 0.75);

  const save = async () => {
    setErr(null);
    if (!en.trim()) return setErr(L('English name is required.', 'Укажите название на английском.'));
    if (!primary) return setErr(L('Set at least one muscle as a direct target (0.75 or 1).', 'Отметьте хотя бы одну мышцу как основную (0,75 или 1).'));
    if (repLo == null || repHi == null || repLo < 1 || repHi < repLo) return setErr(L('Rep range must be valid.', 'Диапазон повторений задан неверно.'));
    const id = slugId(en, 'custom');
    await store.saveCustomExercise({
      id,
      name: { en: en.trim(), ru: ru.trim() || en.trim() },
      aliases: aliases.split(',').map((s) => s.trim()).filter(Boolean),
      pattern,
      category,
      equipmentKind: kind,
      contributions: clean(coefs),
      repRange: [repLo, repHi],
      defaultRestSec: rest ?? 90,
      biomechanics: bio.trim(),
      custom: true,
    });
    toast(L('Custom exercise created', 'Своё упражнение создано'));
    onCreated(id);
  };

  return (
    <Modal open onClose={onClose} wide title={L('Create custom exercise', 'Создать своё упражнение')}
      footer={<><Button onClick={onClose}>{L('Cancel', 'Отмена')}</Button><Button variant="primary" onClick={save}>{L('Create', 'Создать')}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={L('Name (English)', 'Название (английский)')}><Input value={en} onChange={(e) => setEn(e.target.value)} placeholder={L('e.g. Seated cable chest fly', 'напр. Seated cable chest fly')} /></Field>
          <Field label="Название (русский)"><Input value={ru} onChange={(e) => setRu(e.target.value)} placeholder="напр. Сведение рук сидя" /></Field>
        </div>
        <Field label={L('Aliases', 'Синонимы')} hint={L('Comma-separated names Claude or you might use, in any language. Improves matching on import.', 'Через запятую: названия, которыми можете пользоваться вы или Claude, на любом языке. Улучшает сопоставление при импорте.')}>
          <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="seated fly, сведение сидя" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={L('Movement pattern', 'Тип движения')}>
            <Select value={pattern} onChange={(e) => setPattern(e.target.value as MovementPattern)}>{PATTERNS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select>
          </Field>
          <Field label={L('Equipment type', 'Тип оборудования')}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind)}>{KINDS.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}</Select>
          </Field>
          <Field label={L('Category', 'Категория')}>
            <Segmented value={category} onChange={setCategory} options={[{ value: 'compound', label: L('Compound', 'Базовое') }, { value: 'isolation', label: L('Isolation', 'Изолирующее') }]} />
          </Field>
        </div>
        <Card className="!p-3">
          <CardTitle hint={L('1.0 direct · 0.5 significant secondary · 0.25 minor. Leave uninvolved muscles at 0.', '1,0 — основная · 0,5 — значимая вторичная · 0,25 — малая. Незадействованным мышцам оставьте 0.')}>{L('Muscle coefficients', 'Коэффициенты мышц')}</CardTitle>
          <div className="space-y-2">
            {TRACKED_MUSCLES.map((m) => (
              <div key={m} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink-800 dark:text-ink-100">{L(muscleName(m), muscleName(m, 'ru'))} <span className="text-[11px] text-ink-500">· {L(muscleName(m, 'ru'), muscleName(m))}</span></span>
                <Segmented size="sm" value={String(coefs[m] ?? 0) as (typeof COEFS)[number]} onChange={(v) => setCoefs({ ...coefs, [m]: Number(v) })}
                  options={COEFS.map((c) => ({ value: c, label: c }))} />
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-3 gap-3">
          <Field label={L('Reps low', 'Повт., мин.')}><NumInput value={repLo} onChange={setRepLo} /></Field>
          <Field label={L('Reps high', 'Повт., макс.')}><NumInput value={repHi} onChange={setRepHi} /></Field>
          <Field label={L('Rest (s)', 'Отдых (с)')}><NumInput value={rest} onChange={setRest} /></Field>
        </div>
        <Field label={L('Biomechanics notes', 'Заметки по биомеханике')}><TextArea value={bio} onChange={(e) => setBio(e.target.value)} className="font-sans text-sm" placeholder={L('Which joint actions, where it is hardest, what changes emphasis…', 'Какие движения в суставах, где тяжелее всего, что меняет акцент…')} /></Field>
        {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
      </div>
    </Modal>
  );
}
