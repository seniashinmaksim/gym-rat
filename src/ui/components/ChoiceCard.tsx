import { choiceLabelText, type ChoiceAssessment, type ChoiceStatus } from '../../domain/exerciseChoice';
import type { ExerciseDef } from '../../domain/types';
import { Badge, Button, cx, Why } from './ui';
import { L } from '../../i18n';

/** Stored enum values → the words shown in Russian (the English texts keep the raw values). */
const costRu = (c: ChoiceAssessment['fatigueCost']) => ({ high: 'ВЫСОКОЕ', moderate: 'УМЕРЕННОЕ', low: 'НИЗКОЕ' }[c] ?? String(c).toUpperCase());
const positionRu = (p: ChoiceAssessment['position']) => (p === 'FIRST HALF' ? 'ПЕРВАЯ ПОЛОВИНА' : p === 'SECOND HALF' ? 'ВТОРАЯ ПОЛОВИНА' : p);
const confidenceRu = (c: ChoiceAssessment['confidence']) => ({ high: 'высокая', moderate: 'средняя', low: 'низкая' }[c] ?? c);

export const STATUS_TONE: Record<ChoiceStatus, 'good' | 'warn' | 'bad'> = { good: 'good', acceptable: 'warn', reconsider: 'bad' };
const DOT: Record<ChoiceStatus, string> = { good: 'bg-emerald-500', acceptable: 'bg-amber-500', reconsider: 'bg-rose-500' };

/** Small status dot for picker rows (with an accessible label). */
export function ChoiceDot({ a }: { a: Pick<ChoiceAssessment, 'status' | 'label'> }) {
  return <span role="img" aria-label={choiceLabelText(a.label)} title={choiceLabelText(a.label)} className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', DOT[a.status])} />;
}

/**
 * Compact exercise-choice card: name · status · ≤ 3 muscle lines · safety (separate) · alternatives ·
 * Why. Never blocks: [Use alternative] [Continue].
 */
export function ChoiceCard({ a, name, altName, onContinue, onAlternative }: {
  a: ChoiceAssessment;
  name: string;
  altName: (exerciseId: string) => string;
  onContinue: () => void;
  onAlternative: (alt: ChoiceAssessment['alternatives'][number]) => void;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-700 dark:bg-ink-900" data-testid="choice-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold text-ink-900 dark:text-white break-words">{name}</span>
        <Badge tone={STATUS_TONE[a.status]}>{choiceLabelText(a.label)}</Badge>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs tabular-nums text-ink-600 dark:text-ink-300">
        {a.muscles.map((m) => <li key={m.muscle}>{m.text}</li>)}
        <li>{L(`Fatigue cost: ${a.fatigueCost.toUpperCase()} · Position: ${a.position}`, `Утомление: ${costRu(a.fatigueCost)} · Место в тренировке: ${positionRu(a.position)}`)}</li>
      </ul>
      {a.safety && <p className="mt-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300">{a.safety}</p>}
      {a.status !== 'good' && a.why[0] && <p className="mt-2 text-xs text-ink-700 dark:text-ink-200">{a.why[0]}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.alternatives.map((alt) => (
          <Button key={alt.exerciseId} size="md" variant="primary" className="min-w-0 max-w-full" onClick={() => onAlternative(alt)}>
            <span className="min-w-0 break-words">{alt.kind === 'do_first' ? L('First: ', 'Сначала: ') : L('Use ', 'Взять: ')}{altName(alt.exerciseId)}</span>
          </Button>
        ))}
        <Button size="md" onClick={onContinue}>{L('Continue', 'Продолжить')}</Button>
      </div>
      <div className="mt-1">
        <Why>
          {a.why.map((t, i) => <p key={i}>{t}</p>)}
          {a.alternatives.map((alt) => <p key={alt.exerciseId}>{L('Alternative', 'Замена')} — {alt.why}</p>)}
          <p>{L(`Confidence: ${a.confidence}. Advice only — it never blocks you.`, `Уверенность: ${confidenceRu(a.confidence)}. Это только совет — он ничего не запрещает.`)}</p>
        </Why>
      </div>
    </div>
  );
}

export type { ExerciseDef };
