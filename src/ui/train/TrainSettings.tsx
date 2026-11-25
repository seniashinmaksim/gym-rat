/**
 * Settings for the training mode (Part 6): rest timer length, accent colour, the "check effort against
 * the numbers" switch, and how the owner's effort answers compare with the numbers so far.
 */
import { useMemo } from 'react';
import { clampRest, mmss, REST_DEFAULT_SEC, REST_STEP_SEC } from '../../domain/liveFlow';
import { BIAS_MIN_SETS, perceptionBias } from '../../domain/perception';
import { L } from '../../i18n';
import { store, useData } from '../../lib/store';
import { Card, CardTitle, cx, Toggle } from '../components/ui';

const ACCENTS: ['ember' | 'volt' | 'ice', string][] = [['ember', '#ff5a1f'], ['volt', '#c6f432'], ['ice', '#38bdf8']];
const accentName = (a: 'ember' | 'volt' | 'ice') => ({ ember: L('Ember', 'Огонь'), volt: L('Volt', 'Вольт'), ice: L('Ice', 'Лёд') }[a]);

export function TrainingCard() {
  const data = useData();
  const s = data.settings;
  const rest = clampRest(s.restDefaultSec ?? REST_DEFAULT_SEC);
  const accent = s.trainAccent ?? 'ember';
  const q = s.quality;
  const bias = useMemo(() => perceptionBias(data.workouts.flatMap((w) => w.exercises.map((e) => e.sets)), q.useFeelWhenNoRir !== false), [data.workouts, q.useFeelWhenNoRir]);
  const btn = 'flex h-12 w-14 items-center justify-center rounded-xl border border-ink-200 text-base font-semibold text-ink-800 active:bg-ink-100 dark:border-ink-700 dark:text-ink-100 dark:active:bg-ink-800';
  const verdict = bias.verdict === 'rates_harder' ? L('You tend to rate sets HARDER than the numbers show. The app already relies on the numbers where they are clear.', 'Вы склонны оценивать подходы ТЯЖЕЛЕЕ, чем показывают числа. Там, где числа однозначны, приложение уже опирается на них.')
    : bias.verdict === 'rates_easier' ? L('You tend to rate sets EASIER than the numbers show: sets you called easy were often followed by a clear drop in reps.', 'Вы склонны оценивать подходы ЛЕГЧЕ, чем показывают числа: после «лёгких» подходов повторения часто заметно падали.')
      : bias.verdict === 'mixed' ? L('Your answers differ from the numbers in both directions — no single tendency.', 'Ваши ответы расходятся с числами в обе стороны — единой тенденции нет.')
        : bias.verdict === 'matches' ? L('Your answers mostly agree with the numbers.', 'Ваши ответы в основном совпадают с числами.')
          : L(`Not enough data yet: ${bias.compared} of ${BIAS_MIN_SETS} sets that have both an effort answer and a clear next set.`, `Пока мало данных: ${bias.compared} из ${BIAS_MIN_SETS} подходов, где есть и ответ об усилии, и показательный следующий подход.`);
  return (
    <Card className="lg:col-span-2">
      <CardTitle hint={L('The full-screen mode you log a workout in.', 'Полноэкранный режим записи тренировки.')}>{L('Training mode', 'Режим тренировки')}</CardTitle>
      <div className="grid gap-5 sm:grid-cols-2" data-testid="training-settings">
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Rest timer after every set', 'Таймер отдыха после каждого подхода')}</div>
          <div className="flex items-center gap-3">
            <button type="button" className={btn} onClick={() => void store.saveSettings({ restDefaultSec: clampRest(rest - REST_STEP_SEC) })} aria-label={L('15 seconds less', 'На 15 секунд меньше')} data-testid="rest-default-minus">−15</button>
            <span className="w-16 text-center text-2xl font-bold tabular-nums text-ink-900 dark:text-white" data-testid="rest-default">{mmss(rest)}</span>
            <button type="button" className={btn} onClick={() => void store.saveSettings({ restDefaultSec: clampRest(rest + REST_STEP_SEC) })} aria-label={L('15 seconds more', 'На 15 секунд больше')} data-testid="rest-default-plus">+15</button>
          </div>
          <p className="mt-1.5 text-xs text-ink-500">{L('Starts by itself when a set is logged. −15 / +15 during a rest changes it for that exercise only.', 'Запускается сам после записи подхода. −15 / +15 во время отдыха меняют его только для этого упражнения.')}</p>
        </div>
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Accent colour — the whole app', 'Цвет акцента — всё приложение')}</div>
          <div className="flex gap-2" role="radiogroup" aria-label={L('Accent colour', 'Цвет акцента')}>
            {ACCENTS.map(([id, hex]) => (
              <button key={id} type="button" role="radio" aria-checked={accent === id} onClick={() => void store.saveSettings({ trainAccent: id })} data-testid={`accent-${id}`}
                className={cx('flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border px-2 text-sm font-semibold', accent === id ? 'border-ink-900 dark:border-white' : 'border-ink-200 dark:border-ink-700')}>
                <span className="h-4 w-4 rounded-full" style={{ background: hex }} aria-hidden />{accentName(id)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Toggle checked={q.useNumbersCheck !== false} onChange={(v) => void store.saveSettings({ quality: { ...q, useNumbersCheck: v } })}
          label={<span>{L('Check effort against the numbers', 'Сверять усилие с числами')} <span className="block text-xs text-ink-500">{L('A light set before your best set counts as a warm-up even without an answer; a clear drop in reps on the next set counts as a hard set. Your own answers are never rewritten. Off: only what you report counts, and no set is tagged as a warm-up automatically.', 'Лёгкий подход перед лучшим считается разминочным даже без ответа; заметное падение повторений в следующем подходе считается тяжёлым подходом. Ваши ответы не переписываются. Выключено: учитывается только то, что вы указали, и разминочные подходы автоматически не отмечаются.')}</span></span>} />
      </div>
      <div className="mt-4 rounded-xl border border-ink-200 p-3 dark:border-ink-800" data-testid="perception-bias">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">{L('Your effort answers vs the numbers', 'Ваши ответы об усилии и числа')}</div>
        <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">{verdict}</p>
        {bias.compared > 0 && (
          <p className="mt-1 text-xs tabular-nums text-ink-500">
            {L(`${bias.compared} sets compared: ${bias.agree} agree, ${bias.feltHarder} rated harder, ${bias.feltEasier} rated easier.`, `Сравнено подходов: ${bias.compared}; совпало: ${bias.agree}, оценено тяжелее: ${bias.feltHarder}, легче: ${bias.feltEasier}.`)}
          </p>
        )}
        <p className="mt-1 text-xs text-ink-500">{L('Observation only (reps on the next set at the same weight after a normal rest). Nothing is changed automatically.', 'Только наблюдение (повторения в следующем подходе с тем же весом после обычного отдыха). Автоматически ничего не меняется.')}</p>
      </div>
    </Card>
  );
}
