/**
 * "How does your body feel?" — one optional check before training (owner 2026-11-25: the recovery window is a rule of
 * thumb; how a muscle feels is the owner's own signal, asked for EVERY muscle, in a way that is pleasant to use).
 * A quiet one-line card; "Check" opens the body: tap a muscle once = a bit sore (+12 h on its recovery), twice = sore
 * (+24 h and not suggested today), a third time clears it. Stored in today's daily log, which the recovery estimate,
 * the plan, the suggestions and the fit score all read. Never blocks; changeable any time.
 */
import { useState } from 'react';
import { TRACKED_MUSCLES } from '../../domain/muscles';
import { sorenessCandidates } from '../../domain/recovery';
import type { DailyLog, MuscleId } from '../../domain/types';
import { L } from '../../i18n';
import { store, useData } from '../../lib/store';
import { useAnalysis, useNames } from '../hooks';
import { BodyMap } from './BodyMap';
import { Button, cx, Modal } from './ui';

const NEXT: Record<number, number> = { 0: 2, 2: 3, 3: 0 };
const FILL = { 0: '#68738a', 2: '#f59e0b', 3: '#f43f5e' } as const;

/** Today's answer and how to change it — shared by the card and the sheet. */
function useSoreness() {
  const data = useData();
  const a = useAnalysis();
  const log: DailyLog | undefined = data.daily.find((d) => d.date === a.today);
  const answered = log?.soreness != null;
  const level = (m: MuscleId): 0 | 2 | 3 => { const v = log?.soreness?.[m] ?? 0; return v >= 3 ? 3 : v >= 2 ? 2 : 0; };
  const save = (soreness: Partial<Record<MuscleId, number>>) => void store.saveDaily({ ...(log ?? { id: a.today, date: a.today }), soreness });
  const tap = (m: MuscleId) => {
    const next = { ...(log?.soreness ?? {}) };
    const v = NEXT[level(m)];
    if (v) next[m] = v; else delete next[m];
    save(next);
  };
  const marked = TRACKED_MUSCLES.filter((m) => level(m) > 0);
  return { a, answered, level, save, tap, marked };
}

/** Whether today's body check was answered (the training mode asks it first when not). */
export function useSorenessAnswered(): boolean {
  return useSoreness().answered;
}

/**
 * The body check itself: the body map and every muscle as a chip. With nothing marked the footer says "All good —
 * nothing sore" (saves the answer), once something is marked it says "Done". `intro` = the training mode's first step.
 */
export function SorenessSheet({ open, onClose, intro = false }: { open: boolean; onClose: () => void; intro?: boolean }) {
  const names = useNames();
  const { a, answered, level, save, tap, marked } = useSoreness();
  const recent = new Set(sorenessCandidates(a.planRecovery, a.today));
  const finish = () => { if (!answered) save({}); onClose(); };
  return (
    <Modal open={open} onClose={onClose} title={intro ? L('Before you start: anything sore?', 'Перед началом: что-нибудь болит?') : L('Tap what is sore', 'Нажмите на то, что болит')}
      footer={<Button variant="primary" className="w-full" onClick={finish} data-testid="sore-done">{marked.length ? L('Done', 'Готово') : L('All good — nothing sore', 'Всё хорошо — ничего не болит')}</Button>}>
      <p className="mb-2 text-sm text-ink-600 dark:text-ink-300">{L('Tap a muscle once = a bit sore, twice = sore, again = clear. It only changes what is suggested today — nothing is blocked.', 'Нажмите на мышцу: один раз — немного болит, два — болит, ещё раз — сбросить. Меняются только сегодняшние подсказки — ничего не блокируется.')}</p>
      <BodyMap muscles={a.muscles} compact onSelect={tap}
        paint={(m) => ({ fill: FILL[level(m)], opacity: level(m) ? 0.9 : recent.has(m) ? 0.45 : 0.22 })}
        footer={(
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: FILL[2] }} />{L('a bit sore', 'немного болит')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: FILL[3] }} />{L('sore', 'болит')}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full opacity-50" style={{ background: FILL[0] }} />{L('trained in the last 4 days', 'нагрузка за последние 4 дня')}</span>
            </div>
            {/* The same choice as a list: every muscle, large tap targets (the drawing has small areas on a phone). */}
            <div className="flex flex-wrap gap-1.5" data-testid="sore-chips">
              {TRACKED_MUSCLES.map((m) => {
                const v = level(m);
                return (
                  <button key={m} type="button" onClick={() => tap(m)} aria-pressed={v > 0} data-testid="sore-chip" data-muscle={m} data-level={v}
                    className={cx('min-h-[44px] rounded-full px-3 text-[13px] font-medium', v === 3 ? 'bg-rose-500/20 text-rose-800 dark:text-rose-200' : v === 2 ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>
                    {names.muscle(m)}{v === 3 ? L(' · sore', ' · болит') : v === 2 ? L(' · a bit', ' · немного') : ''}
                  </button>
                );
              })}
            </div>
          </div>
        )} />
    </Modal>
  );
}

/** The card (plan card, training overview): the question across the full width, two equal answers below it. */
export function SorenessAsk({ className }: { className?: string }) {
  const names = useNames();
  const [open, setOpen] = useState(false);
  const { answered, level, save, marked } = useSoreness();
  const summary = !answered ? L('Optional — it tunes today\'s suggestions', 'Необязательно — уточняет сегодняшние подсказки')
    : marked.length ? marked.map((m) => `${names.muscle(m)}${level(m) === 3 ? L(' (sore)', ' (болит)') : L(' (a bit)', ' (немного)')}`).join(' · ')
      : L('Nothing sore today', 'Сегодня ничего не болит');
  return (
    <div className={cx('rounded-xl border border-ink-200 px-3.5 py-3 dark:border-ink-700', className)} data-testid="soreness-ask" data-answered={answered ? 'true' : 'false'}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-900 dark:text-white">{L('How does your body feel?', 'Как чувствует себя тело?')}</p>
          <p className="break-words text-xs text-ink-500" data-testid="soreness-summary">{summary}</p>
        </div>
        {answered && <button type="button" onClick={() => setOpen(true)} data-testid="sore-open" className="min-h-[44px] shrink-0 rounded-xl border border-ink-200 px-3 text-[13px] font-semibold text-ink-700 dark:border-ink-700 dark:text-ink-200">{L('Change', 'Изменить')}</button>}
      </div>
      {!answered && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => save({})} data-testid="sore-none" className="min-h-[44px] rounded-xl border border-ink-200 px-2 text-[13px] font-semibold text-ink-700 dark:border-ink-700 dark:text-ink-200">{L('All good', 'Всё хорошо')}</button>
          <button type="button" onClick={() => setOpen(true)} data-testid="sore-open" className="min-h-[44px] rounded-xl bg-accent-500 px-2 text-[13px] font-semibold text-ink-950">{L('Something is sore', 'Что-то болит')}</button>
        </div>
      )}
      <SorenessSheet open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
