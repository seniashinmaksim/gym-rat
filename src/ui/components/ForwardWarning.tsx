/**
 * Part 8: the short forward warning next to an exercise — why it is not ideal today, what it affects, the better day —
 * with [Move to …] and [Keep today]. A REAL LIMIT and a RECOMMENDATION look different. Never blocks; nothing is removed.
 */
import type { ForwardFinding } from '../../domain/sequence';
import { formatDate } from '../../domain/dates';
import { L } from '../../i18n';
import { Badge, Button } from './ui';

export function ForwardWarning({ findings, moveDate, clean, onMove, onKeep, compact }: {
  findings: ForwardFinding[];
  /** The proposed day (null = no usual day known). */
  moveDate: string | null;
  /** false: even the proposed day still overlaps (best feasible). */
  clean: boolean;
  onMove?: () => void;
  onKeep?: () => void;
  compact?: boolean;
}) {
  if (!findings.length) return null;
  const limit = findings.some((f) => f.severity === 'limit');
  // Three distinct categories: a recovery window still open · next-session performance · a tip (optional).
  const label = findings.some((f) => f.severity === 'limit' && f.check === 'recovery') ? L('Recovery limit', 'Предел восстановления')
    : limit ? L('Next-session performance', 'Результат следующей тренировки') : L('Tip', 'Совет');
  const day = moveDate ? formatDate(moveDate, { weekday: 'short', day: 'numeric' }) : null;
  return (
    <div data-testid="forward-warning" className={`rounded-xl border px-3 py-2 text-xs ${limit ? 'border-amber-500/50 bg-amber-500/10' : 'border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-800/60'}`}>
      <div className="flex flex-wrap items-start gap-2">
        <Badge tone={limit ? 'warn' : 'neutral'}>{label}</Badge>
        <span className="min-w-0 flex-1 break-words text-ink-700 dark:text-ink-200">
          {findings.map((f) => f.text).join(' ')}
          {day && !compact ? ' ' + (clean ? L(`Better on ${day}.`, `Лучше: ${day}.`) : L(`${day} is the best option, but still overlaps.`, `${day} — лучший вариант, но пересечение остаётся.`)) : ''}
        </span>
      </div>
      {(onMove || onKeep) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {onMove && day && <Button size="sm" variant={limit ? 'primary' : 'secondary'} onClick={onMove} data-testid="forward-move">{L(`Move to ${day}`, `Перенести: ${day}`)}</Button>}
          {onKeep && <Button size="sm" onClick={onKeep} data-testid="forward-keep">{L('Keep today', 'Оставить сегодня')}</Button>}
        </div>
      )}
    </div>
  );
}
