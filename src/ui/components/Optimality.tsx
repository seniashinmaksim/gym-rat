/**
 * Part 9: the fit score next to a suggestion, and its "why" on tap. A NOT TODAY option never shows a number — only the
 * label and its reason. The footnote keeps the number honest: it ranks options for this moment, not growth.
 */
import { useState, type ReactNode } from 'react';
import { bandText, type Optimality } from '../../domain/optimality';
import { L } from '../../i18n';
import { cx } from './ui';

const TONE = {
  suitable: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  less_optimal: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  not_today: 'bg-rose-500/15 text-rose-800 dark:text-rose-300',
} as const;

/** The score pill: a tap target of its own (≥ 44 px) that toggles the why. */
export function ScoreButton({ o, open, onToggle }: { o: Optimality; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} data-testid="opt-score" data-score={o.score ?? ''} data-group={o.group}
      aria-label={o.score != null ? L(`Fit ${o.score} of 100, ${bandText(o.band!)} — why`, `Оценка ${o.score} из 100, ${bandText(o.band!)} — почему`) : L('Not today — why', 'Не сегодня — почему')}
      className={cx('flex min-h-[44px] min-w-[52px] shrink-0 flex-col items-center justify-center rounded-xl px-2 text-center', TONE[o.group])}>
      {o.score != null
        ? <span className="font-display text-lg font-bold leading-none tabular-nums">{o.score}</span>
        : <span className="text-[11px] font-bold uppercase leading-tight">{L('Not today', 'Не сегодня')}</span>}
      <span className="text-[10px] font-semibold leading-tight underline decoration-dotted">{L('why', 'почему')}</span>
    </button>
  );
}

/** The why lines (deductions, caps or the reason) and the honest footnote. */
export function ScoreWhy({ o }: { o: Optimality }) {
  return (
    <div className="mt-1.5 space-y-1 rounded-lg bg-ink-50 px-2.5 py-2 text-xs text-ink-700 dark:bg-ink-800/60 dark:text-ink-200" data-testid="opt-why">
      {o.score != null && <p className="font-semibold">{L(`${o.score} / 100 — ${bandText(o.band!)}`, `${o.score} / 100 — ${bandText(o.band!)}`)}{o.confidence === 'low' ? L(' · low confidence', ' · уверенность низкая') : ''}</p>}
      <ul className="space-y-0.5">{o.why.map((t, i) => <li key={i} className="break-words">{t}</li>)}</ul>
      <p className="text-[11px] text-ink-500">{o.score != null
        ? L('Ranks the options for right now from your data. 95 vs 90 is no difference in growth.', 'Ранжирует варианты на текущий момент по вашим данным. 95 против 90 — не разница в росте.')
        : L('Shown so you can still choose it — nothing is blocked.', 'Показано, чтобы вы всё равно могли выбрать, — ничего не заблокировано.')}</p>
    </div>
  );
}

/** One suggestion row: the main button (whatever it does) + the score pill + the why below it. */
export function ScoredRow({ o, children, testId }: { o: Optimality; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid={testId ?? 'opt-row'} data-group={o.group} data-score={o.score ?? ''}>
      <div className="flex items-stretch gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <ScoreButton o={o} open={open} onToggle={() => setOpen(!open)} />
      </div>
      {open && <ScoreWhy o={o} />}
    </div>
  );
}
