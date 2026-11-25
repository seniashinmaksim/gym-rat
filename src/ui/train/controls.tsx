/**
 * Training-mode controls (docs/DESIGN.md §5–6): buttons, the big editable number, the weight ruler,
 * the rest ring and the effort answers. Colours come from the `.train` CSS variables.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { EFFORT_TAPS, mmss, type EffortTap } from '../../domain/liveFlow';
import { MAX_WEIGHT_KG, STEP_CHOICES, stepFrom } from '../../domain/weights';
import { KG, L, num, parseDecimal } from '../../i18n';
import { cx } from '../components/ui';

// ---------------------------------------------------------------- buttons

type TVariant = 'primary' | 'secondary' | 'quiet' | 'danger' | 'finish';
export function TButton({ variant = 'secondary', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: TVariant }) {
  const v = {
    primary: 'min-h-[64px] w-full bg-t-accent text-t-on font-display text-2xl font-extrabold uppercase tracking-wide',
    secondary: 'min-h-[52px] border border-t-line bg-t-surface text-t-text font-display text-lg font-bold uppercase tracking-wide',
    quiet: 'min-h-[48px] min-w-[48px] text-t-dim text-sm font-semibold',
    danger: 'min-h-[48px] border border-t-danger text-t-danger text-sm font-semibold',
    finish: 'min-h-[56px] w-full border-2 border-t-text text-t-text font-display text-lg font-bold uppercase tracking-wide',
  }[variant];
  return (
    <button type="button" {...(variant === 'primary' ? { 'data-primary': 'true' } : {})}
      className={cx('inline-flex select-none items-center justify-center gap-2 rounded-xl px-4 text-center leading-tight transition active:scale-[0.98] active:brightness-90 disabled:pointer-events-none disabled:opacity-40', v, className)} {...rest}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- big editable number

/** A large number; tap it to type (decimal keypad; comma or dot). An invalid entry is discarded. */
export function BigNumber({ value, onChange, label, suffix, decimals = true, testId }: { value: number | null; onChange: (v: number | null) => void; label: string; suffix?: string; decimals?: boolean; testId?: string }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text == null) return;
    const t = text.trim();
    if (t === '') onChange(null);
    else {
      const n = parseDecimal(t);
      if (n != null && n >= 0 && n <= (decimals ? MAX_WEIGHT_KG : 200)) onChange(decimals ? Math.round(n * 100) / 100 : Math.round(n));
    }
    setText(null);
  };
  return (
    <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
      {text != null ? (
        <input autoFocus inputMode={decimals ? 'decimal' : 'numeric'} aria-label={label} data-testid={testId} value={text}
          onChange={(e) => setText(e.target.value.replace(decimals ? /[^0-9.,]/g : /[^0-9]/g, ''))}
          onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          className="t-num w-full min-w-0 max-w-[9rem] rounded-xl border border-t-accent bg-t-bg px-1 text-center font-display text-num-xl font-extrabold text-t-text outline-none" />
      ) : (
        <button type="button" aria-label={`${label}: ${value == null ? '—' : num(value)}. ${L('Tap to type', 'Нажмите, чтобы ввести')}`} data-testid={testId}
          onClick={() => setText(value == null ? '' : num(value))}
          className="t-num min-h-[56px] min-w-[4.5rem] rounded-xl px-2 font-display text-num-xl font-extrabold text-t-text">
          {value == null ? '—' : num(value)}
        </button>
      )}
      {suffix && text == null && <span className="font-display text-xl font-bold text-t-dim">{suffix}</span>}
    </div>
  );
}

const stepBtn = 'flex h-14 w-16 shrink-0 items-center justify-center rounded-xl border border-t-line bg-t-surface font-display text-xl font-bold text-t-text active:brightness-125 max-[379px]:w-12';

// ---------------------------------------------------------------- weight control with ruler

const TICK = 14; // px per step

/**
 * Weight: big number (tap to type any value), ± one real step, and a ruler to swipe. The ruler snaps to
 * the step while it is being dragged; a typed off-grid value is shown exactly and never snapped.
 */
export function WeightControl({ value, onChange, step, onStepClick, unit }: { value: number | null; onChange: (v: number | null) => void; step: number; onStepClick: () => void; unit: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Every scroll that is NOT one of our own (pre-fill, ±, typing, the snap) is the owner turning the ruler. Our own
  // scrolls are recognised by their target position — never by "is a finger down", which missed slow drags with a
  // pause, a second swipe right after the first, and iOS momentum (owner 2026-11-25: "it turns but the weight stays").
  const own = useRef<{ x: number; until: number } | null>(null);
  const touching = useRef(false);
  const lastUser = useRef(0);
  const settle = useRef<number | null>(null);
  const [pad, setPad] = useState(160);
  const max = Math.min(MAX_WEIGHT_KG, 400);
  const width = (max / step) * TICK;
  const moveTo = (el: HTMLDivElement, to: number, smooth = false) => {
    // A typed weight above the ruler's end (450 kg) parks the ruler at its end — still OUR scroll, never a new value.
    const x = Math.max(0, Math.min(to, el.scrollWidth - el.clientWidth));
    own.current = { x, until: Date.now() + (smooth ? 600 : 250) };
    if (smooth) el.scrollTo({ left: x, behavior: 'smooth' }); else el.scrollLeft = x;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setPad(Math.round(el.clientWidth / 2));
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  // Follow the value (typed, ± or pre-filled) — not while the owner is turning the ruler (the value came from it).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || touching.current || Date.now() - lastUser.current < 250) return;
    const x = ((value ?? 0) / step) * TICK;
    if (Math.abs(el.scrollLeft - x) > 0.75) moveTo(el, x);
  }, [value, step, pad]);

  const snap = () => {
    const el = ref.current;
    settle.current = null;
    if (!el) return;
    // Finger still down (a pause in a slow drag): keep listening, snap when it is lifted.
    if (touching.current) { settle.current = window.setTimeout(snap, 140); return; }
    const target = Math.round(el.scrollLeft / TICK) * TICK;
    if (Math.abs(el.scrollLeft - target) > 0.75) moveTo(el, target, true);
  };
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const o = own.current;
    if (o && Date.now() < o.until && Math.abs(el.scrollLeft - o.x) <= TICK / 2 + 1 && !touching.current) return; // our own scroll
    own.current = null;
    lastUser.current = Date.now();
    const v = Math.max(0, Math.min(max, Math.round(el.scrollLeft / TICK) * step));
    const r = Math.round(v * 100) / 100;
    if (r !== value) onChange(r);
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(snap, 140);
  };
  const grab = () => { touching.current = true; own.current = null; };
  const release = () => { touching.current = false; if (!settle.current) settle.current = window.setTimeout(snap, 140); };
  useEffect(() => () => { if (settle.current) window.clearTimeout(settle.current); }, []);

  const major = step * 5;
  const first = Math.max(0, Math.floor(((value ?? 0) - major * 4) / major) * major);
  const labels = Array.from({ length: 10 }, (_, i) => first + i * major).filter((v) => v <= max);

  return (
    <div data-testid="weight-control">
      <div className="flex items-center justify-between">
        <span className="t-label">{L('Weight', 'Вес')} · {unit}</span>
        <button type="button" onClick={onStepClick} data-testid="step-chip" className="-mr-2 flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-t-dim" aria-label={L(`Step ${num(step)} kg. Change step`, `Шаг ${num(step)} кг. Изменить шаг`)}>
          {L('step', 'шаг')} <span className="rounded-md border border-t-line px-1.5 py-0.5 text-t-text">{num(step)} {KG()}</span>
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" data-testid="weight-minus" className={stepBtn} aria-label={L(`Decrease weight by ${num(step)} kg`, `Уменьшить вес на ${num(step)} кг`)} onClick={() => onChange(stepFrom(value, step, -1))}>−{num(step)}</button>
        <BigNumber value={value} onChange={onChange} label={L('Weight', 'Вес')} suffix={KG()} testId="weight-value" />
        <button type="button" data-testid="weight-plus" className={stepBtn} aria-label={L(`Increase weight by ${num(step)} kg`, `Увеличить вес на ${num(step)} кг`)} onClick={() => onChange(stepFrom(value, step, 1))}>+{num(step)}</button>
      </div>
      <div className="relative mt-1 h-11" aria-hidden>
        <div ref={ref} data-testid="weight-ruler" className="t-ruler absolute inset-0 overflow-x-scroll" onScroll={onScroll} onTouchStart={grab} onTouchEnd={release} onTouchCancel={release} onMouseDown={grab} onMouseUp={release} onMouseLeave={release}>
          <div className="relative h-full" style={{ width: width + pad * 2 }}>
            <div className="t-ruler-track absolute top-0 h-6" style={{ left: pad, width: width + 2 }} />
            {labels.map((v) => (
              <span key={v} className="t-num absolute top-6 -translate-x-1/2 text-[10px] font-semibold text-t-dim" style={{ left: pad + (v / step) * TICK }}>{num(v)}</span>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute left-1/2 top-0 h-7 w-[3px] -translate-x-1/2 rounded-full bg-t-accent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-t-bg to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-t-bg to-transparent" />
      </div>
    </div>
  );
}

export function RepsControl({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div data-testid="reps-control">
      <span className="t-label">{L('Reps', 'Повторения')}</span>
      <div className="flex items-center gap-2">
        <button type="button" className={stepBtn} aria-label={L('One rep fewer', 'На одно повторение меньше')} onClick={() => onChange(Math.max(0, (value ?? 0) - 1))}>−1</button>
        <BigNumber value={value} onChange={onChange} label={L('Reps', 'Повторения')} decimals={false} testId="reps-value" />
        <button type="button" className={stepBtn} aria-label={L('One rep more', 'На одно повторение больше')} onClick={() => onChange(Math.min(200, (value ?? 0) + 1))}>+1</button>
      </div>
    </div>
  );
}

/** Step choices (kg). One tap; the caller remembers it for the machine / gym. */
export function StepChoices({ current, onPick }: { current: number; onPick: (step: number) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="step-choices">
      {STEP_CHOICES.map((s) => (
        <button key={s} type="button" aria-pressed={current === s} onClick={() => onPick(s)}
          className={cx('t-num h-14 rounded-xl border font-display text-xl font-bold', current === s ? 'border-accent-500 bg-accent-500 text-ink-950' : 'border-ink-200 bg-ink-50 text-ink-900 dark:border-ink-700 dark:bg-ink-850 dark:text-white')}>
          {num(s)} {KG()}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- rest ring

/** Large centred circle: remaining time in very large digits, the ring emptying; "GO" and counting up at zero. */
export function RestRing({ remainingSec, targetSec, paused, text, overSec = 0 }: { remainingSec: number; targetSec: number; paused: boolean; text: string; overSec?: number }) {
  const done = remainingSec <= 0;
  // Before zero: the part of the planned rest still left. After zero: the current 15-second lap (+15, +15 … until NEXT SET).
  const frac = done ? (overSec % 15) / 15 : Math.max(0, Math.min(1, remainingSec / Math.max(1, targetSec)));
  const R = 46;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative mx-auto aspect-square w-[min(84vw,max(36vh,calc(100vh_-_460px)),26rem)]" data-testid="rest-ring" data-done={done ? 'true' : 'false'}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--t-line)" strokeWidth="4" />
        <circle cx="50" cy="50" r={R} fill="none" stroke={done ? 'var(--t-good)' : 'var(--t-accent)'} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - frac)} style={{ transition: 'stroke-dashoffset 0.3s linear' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="t-label" data-testid="rest-label">{done ? L(`Rest · +${mmss(overSec)}`, `Отдых · +${mmss(overSec)}`) : paused ? L('Rest · paused', 'Отдых · пауза') : L('Rest', 'Отдых')}</span>
        <span role="timer" aria-live="off" data-testid="rest-digits" className={cx('t-num font-display text-hero font-extrabold', done ? 'text-t-good' : 'text-t-text')}>{text}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- effort answers

export const effortLabel = (t: EffortTap): string => ({
  // FAILED = muscular failure: the most reps possible, not one more with good form (not a missed or botched rep).
  easy: L('Easy', 'Легко'), good: L('Good', 'Хорошо'), hard: L('Hard', 'Тяжело'), failed: L('Max', 'Отказ'),
}[t]);
export const effortHint = (t: EffortTap): string => ({
  easy: L('3+ left', '3+ в запасе'), good: L('1–2 left', '1–2 в запасе'), hard: L('~1 left', '~1 в запасе'), failed: L('not one more', 'больше ни одного'),
}[t]);

export function EffortRow({ value, onPick, dark = true }: { value: EffortTap | null; onPick: (t: EffortTap) => void; dark?: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="group" aria-label={L('How was the set?', 'Как прошёл подход?')} data-testid="effort-row">
      {EFFORT_TAPS.map((t) => {
        const on = value === t;
        return (
          <button key={t} type="button" aria-pressed={on} onClick={() => onPick(t)}
            className={cx('flex min-h-[56px] flex-col items-center justify-center rounded-xl border px-1 py-1.5 leading-tight active:scale-[0.98]',
              dark ? (on ? 'border-t-accent bg-t-accent text-t-on' : 'border-t-line bg-t-surface text-t-text')
                : (on ? 'border-accent-500 bg-accent-500 text-ink-950' : 'border-ink-200 bg-ink-50 text-ink-900 dark:border-ink-700 dark:bg-ink-850 dark:text-white'))}>
            <span className="max-w-full font-display text-[clamp(0.8125rem,3.9vw,1rem)] font-extrabold uppercase tracking-normal">{effortLabel(t)}</span>
            <span className={cx('text-[10px] font-medium', on ? 'opacity-80' : dark ? 'text-t-dim' : 'text-ink-500')}>{effortHint(t)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function TLabel({ children }: { children: ReactNode }) {
  return <span className="t-label">{children}</span>;
}
