/**
 * Workout check (Part 6, F.9): History → a workout → Check. Shows every number the app derives from that
 * workout, step by step, from the same engine (`src/domain/workoutCheck.ts`). Read-only.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate } from '../../domain/dates';
import type { Objective } from '../../domain/perception';
import { adviceFor, adviceLabel } from '../../domain/progression';
import type { MuscleId, WorkoutSet } from '../../domain/types';
import { workoutCheck, type CheckExercise, type CheckSet } from '../../domain/workoutCheck';
import { KG, L, NP, num } from '../../i18n';
import { useData } from '../../lib/store';
import { Badge, Button, Callout, Card, CardTitle, cx, Empty, Page } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';
import { effortLabel } from '../train/controls';

const kg = (v: number | null) => (v == null ? '—' : num(v));

function saidText(c: CheckSet): string {
  const s = c.set;
  if (s.rir != null) return L(`${s.rir === 5 ? '5+' : s.rir} in reserve`, `${s.rir === 5 ? '5+' : s.rir} в запасе`);
  if (c.report.tap) return effortLabel(c.report.tap);
  if (s.failure === 'none') return L('stopped before failure', 'до отказа не дошёл');
  if (s.failure === 'uncertain') return L('not sure', 'не уверен');
  return L('no answer', 'нет ответа');
}

function numbersText(o: Objective | null, off: boolean): string {
  if (off) return L('check switched off', 'проверка выключена');
  if (!o || o.kind === 'none') return L('nothing clear', 'ничего определённого');
  if (o.kind === 'ramp') return L(`≈ ${num(o.estRir ?? 0, 0)} reps in reserve — ${num(o.possibleReps ?? 0, 0)} were possible at this weight, judging by your best set`, `≈ ${num(o.estRir ?? 0, 0)} повт. в запасе — судя по лучшему подходу, с этим весом было возможно ${num(o.possibleReps ?? 0, 0)}`);
  if (o.kind === 'backoff') return L(`lighter set after the best one: ≈ ${num(o.estRir ?? 0, 0)} reps in reserve (rough)`, `облегчённый подход после лучшего: ≈ ${num(o.estRir ?? 0, 0)} повт. в запасе (грубо)`);
  if (o.band === 'hard') return L('reps fell by 2 or more on the next set — it was close to the limit', 'в следующем подходе на 2+ повт. меньше — подход был близок к пределу');
  if (o.band === 'reserve') return L('the next set matched or beat it — some reserve was left', 'следующий подход не хуже — запас оставался');
  return L('nothing clear', 'ничего определённого');
}

const sourceText = (c: CheckSet): string => {
  if (c.set.type === 'warmup') return c.set.typeSource === 'auto' ? L('warm-up (found from the numbers)', 'разминочный (по числам)') : L('warm-up', 'разминочный');
  switch (c.quality.effortSource) {
    case 'rir': return L('your reps in reserve', 'ваш запас повторов');
    case 'to_failure': case 'failure_status': return L('your failure answer', 'ваш ответ об отказе');
    case 'feel': return L('your answer (estimate)', 'ваш ответ (оценка)');
    case 'numbers': return L('the numbers', 'числа');
    default: return L('no effort known — provisional', 'усилие неизвестно — предварительно');
  }
};

function SetLine({ c, off }: { c: CheckSet; off: boolean }) {
  const [open, setOpen] = useState(false);
  const s: WorkoutSet = c.set;
  const warm = s.type === 'warmup';
  return (
    <li className="border-t border-ink-100 py-2 first:border-t-0 dark:border-ink-800" data-testid="check-set">
      <button type="button" className="flex min-h-[44px] w-full items-center gap-3 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="w-5 shrink-0 text-xs font-semibold text-ink-400">{c.n}</span>
        <span className="min-w-0 flex-1">
          <span className={cx('tabular-nums text-sm font-semibold text-ink-900 dark:text-white', warm && 'opacity-60')}>{kg(s.weightKg)} × {s.reps ?? '—'}</span>
          {s.side && <span className="ml-1.5 text-[11px] font-semibold uppercase text-ink-500">{s.side === 'left' ? L('L', 'Л') : L('R', 'П')}</span>}
          {warm && <span className="ml-1.5 text-[11px] font-semibold uppercase text-ink-500">{L('warm-up', 'разминка')}</span>}
          {s.type === 'drop' && <span className="ml-1.5 text-[11px] font-semibold uppercase text-ink-500">{L('drop', 'дроп')}</span>}
          <span className="block break-words text-xs text-ink-500">{saidText(c)}{c.disagreement ? ` · ${c.disagreement === 'felt_harder' ? L('felt harder than the numbers show', 'по ощущениям тяжелее, чем по числам') : L('felt easier than the numbers show', 'по ощущениям легче, чем по числам')}` : ''}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-base font-bold tabular-nums text-ink-900 dark:text-white" data-testid="check-credit">{num(c.quality.credit * c.factor)}</span>
          <span className="block text-[10px] uppercase tracking-wide text-ink-400">{L('credit', 'зачёт')}</span>
        </span>
      </button>
      {open && (
        <dl className="mb-1 ml-8 space-y-1 text-xs text-ink-600 dark:text-ink-300" data-testid="check-set-detail">
          <div><dt className="inline font-semibold">{L('You said', 'Ваш ответ')}: </dt><dd className="inline">{saidText(c)}{c.report.reservedAs != null && s.rir == null ? L(` (counted as ${c.report.reservedAs} in reserve)`, ` (считается как ${c.report.reservedAs} в запасе)`) : ''}</dd></div>
          <div><dt className="inline font-semibold">{L('The numbers say', 'По числам')}: </dt><dd className="inline">{warm && s.typeSource !== 'auto' ? '—' : numbersText(c.objective, off)}</dd></div>
          <div><dt className="inline font-semibold">{L('Credit decided by', 'Зачёт определён по')}: </dt><dd className="inline">{sourceText(c)}{c.factor !== 1 ? L(` · one side of a pair (× ${num(c.factor)})`, ` · одна сторона пары (× ${num(c.factor)})`) : ''}</dd></div>
          {c.quality.reasons.length > 0 && <div><dt className="inline font-semibold">{L('Steps', 'Шаги')}: </dt><dd className="inline">{c.quality.reasons.join(' · ')}</dd></div>}
        </dl>
      )}
    </li>
  );
}

function ExerciseBlock({ e, off }: { e: CheckExercise; off: boolean }) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const def = a.registry.get(e.entry.exerciseId);
  const eq = e.entry.equipmentId ? data.equipment.find((x) => x.id === e.entry.equipmentId) : undefined;
  const h = e.history;
  const adv = h ? adviceFor(h.series) : null;
  const delta = h?.session?.index != null && h.previous?.index != null && h.previous.index > 0 && (h.session.indexKind ?? null) === (h.previous.indexKind ?? null)
    ? (h.session.index / h.previous.index - 1) * 100 : null;
  return (
    <Card>
      <CardTitle hint={eq ? eq.name : undefined} right={<span className="text-xs text-ink-500">{NP(e.workingSets, ['set', 'sets'], ['подход', 'подхода', 'подходов'])}{e.warmups ? ` + ${e.warmups} ${L('warm-up', 'разм.')}` : ''}</span>}>
        {names.ex(def, e.entry.exerciseNameRaw ?? e.entry.exerciseId)}
      </CardTitle>
      {!e.known && <Callout tone="warn">{L('This exercise is not in the library, so its sets are not credited to any muscle.', 'Этого упражнения нет в базе, поэтому его подходы не идут в зачёт ни одной мышце.')}</Callout>}
      <ol>{e.sets.map((c) => <SetLine key={c.set.id} c={c} off={off} />)}</ol>

      {e.muscles.length > 0 && (
        <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800" data-testid="check-muscle-parts">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{L('Muscles: share × credit of the sets', 'Мышцы: доля × зачёт подходов')}</div>
          <ul className="space-y-0.5 text-sm">
            {e.muscles.map((m) => (
              <li key={m.muscle} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words text-ink-700 dark:text-ink-200">{names.muscle(m.muscle)}</span>
                <span className="shrink-0 tabular-nums text-ink-500">{num(m.coefficient)} × {num(m.creditSets)} = <b className="text-ink-900 dark:text-white">{num(m.effective)}</b></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3 text-sm text-ink-700 dark:border-ink-800 dark:text-ink-200" data-testid="check-history">
        <p>
          <b>{L('Order', 'Порядок')}:</b>{' '}
          {e.context.bucket === 'preloaded'
            ? L(`done after ${num(e.context.sets)} sets that already worked ${e.context.muscle ? names.muscle(e.context.muscle as MuscleId) : 'the same muscle'} (${e.context.from.map((id) => names.ex(a.registry.get(id), id)).join(', ')}) — compared with sessions in the same position, or adjusted for it.`,
              `после ${num(e.context.sets)} подх., уже нагрузивших мышцу «${e.context.muscle ? names.muscle(e.context.muscle as MuscleId) : 'ту же'}» (${e.context.from.map((id) => names.ex(a.registry.get(id), id)).join(', ')}) — сравнивается с тренировками в том же положении или с поправкой.`)
            : L('done fresh (no earlier exercise had loaded its main muscle by 2 sets or more).', 'на свежие силы (до него основная мышца не получила 2 и более подходов).')}
        </p>
        {h?.session ? (
          <>
            <p>
              <b>{L('Strength index', 'Индекс силы')}:</b>{' '}
              {h.session.index != null ? num(h.session.index, 1) : L('not scored (no clean set to compare)', 'не оценён (нет чистого подхода для сравнения)')}
              {h.session.index != null && <span className="text-ink-500"> · {h.series.indexBasis === 'rir' ? L('weight, reps and reps in reserve', 'вес, повторения и запас') : L('weight and reps only (some session has no reps in reserve)', 'только вес и повторения (не везде записан запас)')}</span>}
              {h.previous?.index != null && <span className="text-ink-500"> · {L('previous', 'прошлая')}: {num(h.previous.index, 1)}{delta != null ? ` (${delta >= 0 ? '+' : '−'}${num(Math.abs(delta), 1)} %)` : ''}</span>}
            </p>
            <p className="text-xs text-ink-500">
              {h.series.compare.basis === 'single_context' ? L('All sessions of this history were done in the same position.', 'Все тренировки этой истории выполнены в одном положении.')
                : h.series.compare.basis === 'same_context' ? L('Trend and decision use only sessions done in the same position as the latest one.', 'Тренд и решение учитывают только тренировки в том же положении, что и последняя.')
                  : L(`Too few sessions in one position: sessions done after same-muscle work are raised by ${num((h.series.compare.dropPerSet ?? 0) * 100, 1)} % per earlier set before comparing.`, `Мало тренировок в одном положении: результаты после нагрузки на ту же мышцу перед сравнением повышаются на ${num((h.series.compare.dropPerSet ?? 0) * 100, 1)} % за каждый предыдущий подход.`)}
            </p>
            {adv && <p data-testid="check-decision"><b>{L('Next time', 'В следующий раз')}:</b> <Badge tone={adv.kind === 'increase' ? 'good' : adv.kind === 'reduce' ? 'warn' : 'neutral'}>{adviceLabel(h.series, adv.kind)}</Badge> <span className="text-ink-600 dark:text-ink-300">{adv.text}</span></p>}
            <p className="text-xs text-ink-500">{L('The decision is for the whole history of this exercise on this machine, as of today — not only this workout.', 'Решение относится ко всей истории этого упражнения на этом тренажёре на сегодня, а не только к этой тренировке.')}</p>
          </>
        ) : <p className="text-ink-500">{L('No history yet for this exercise on this machine and setup.', 'Для этого упражнения на этом тренажёре и с этой настройкой истории пока нет.')}</p>}
      </div>
    </Card>
  );
}

export function WorkoutCheckPage() {
  const { id } = useParams();
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const w = data.workouts.find((x) => x.id === id);
  const check = useMemo(() => (w ? workoutCheck(w, a.registry, data.settings.quality, a.progression) : null), [w, a.registry, a.progression, data.settings.quality]);
  if (!w || !check) return <Page title={L('Workout check', 'Проверка тренировки')}><Empty title={L('This workout does not exist.', 'Такой тренировки нет.')} action={<Link to="/history"><Button>{L('History', 'История')}</Button></Link>} /></Page>;
  const off = data.settings.quality.useNumbersCheck === false;
  const gym = data.locations.find((l) => l.id === w.locationId);
  return (
    <Page title={L('Workout check', 'Проверка тренировки')} subtitle={`${formatDate(w.date, { weekday: 'long', day: 'numeric', month: 'long' })}${gym ? ` · ${gym.name}` : ''}`}
      actions={<Link to="/history"><Button variant="ghost">{L('History', 'История')}</Button></Link>}>
      <div className="space-y-4" data-testid="workout-check">
        <p className="text-sm text-ink-600 dark:text-ink-300">
          {L('Every number the app takes from this workout, step by step. Tap a set to see how its credit was decided. Nothing here changes your data.',
            'Все числа, которые приложение берёт из этой тренировки, шаг за шагом. Нажмите на подход, чтобы увидеть, как определён его зачёт. Здесь ничего не меняется в данных.')}
        </p>
        {!check.exercises.length && <Empty title={L('No exercise in this workout.', 'В этой тренировке нет упражнений.')} />}
        {check.exercises.map((e) => <ExerciseBlock key={e.entry.id} e={e} off={off} />)}

        {check.muscles.length > 0 && (
          <Card>
            <CardTitle hint={L('What this workout adds to the week (effective sets)', 'Что эта тренировка добавляет к неделе (эффективные подходы)')}>{L('Per muscle', 'По мышцам')}</CardTitle>
            <ul className="divide-y divide-ink-100 dark:divide-ink-800" data-testid="check-muscles">
              {check.muscles.map((m) => (
                <li key={m.muscle} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 break-words text-sm font-semibold text-ink-900 dark:text-white">{names.muscle(m.muscle)}</span>
                    <span className="shrink-0 text-base font-bold tabular-nums text-ink-900 dark:text-white" data-testid="check-muscle-total">{num(m.counted)}</span>
                  </div>
                  <div className="text-xs tabular-nums text-ink-500">
                    {m.parts.map((p) => `${names.ex(a.registry.get(p.exerciseId), p.exerciseId)} ${num(p.effective)}`).join(' + ')}
                    {m.parts.length > 1 || m.tapered ? ` = ${num(m.sum)}` : ''}
                    {m.tapered && check.ceiling != null ? L(` → counted ${num(m.counted)}: above ${num(check.ceiling)} effective sets in one workout, further sets count less (your setting)`, ` → в зачёт ${num(m.counted)}: сверх ${num(check.ceiling)} эффективных подходов за тренировку дальнейшие считаются меньше (ваша настройка)`) : ''}
                    {!m.tapered && check.ceiling != null && m.sum > check.ceiling ? L(` · more than ~${num(check.ceiling)} effective sets in one workout: each extra set likely adds less (a rule of thumb — still counted in full)`, ` · больше ~${num(check.ceiling)} эффективных подходов за тренировку: каждый следующий, вероятно, даёт меньше (практическое правило — засчитывается полностью)`) : ''}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-500">{L(`Weights are in ${KG()} as you logged them. Shares per muscle are practical estimates, not measurements (see Science).`, `Веса — в ${KG()}, как вы их записали. Доли по мышцам — практические оценки, а не измерения (см. «Наука»).`)}</p>
          </Card>
        )}
      </div>
    </Page>
  );
}
