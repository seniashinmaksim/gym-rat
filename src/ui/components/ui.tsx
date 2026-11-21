import { useEffect, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { TargetConfidence } from '../../domain/types';
import { IconChevronDown, IconInfo, IconX } from './icons';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- Layout primitives

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('rounded-2xl border border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900 dark:shadow-none', padded && 'p-4 sm:p-5', className)}>
      {children}
    </section>
  );
}

export function CardTitle({ children, hint, right }: { children: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">{children}</h2>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4' }[cols];
  return <div className={cx('grid gap-4', cols === 4 ? c : `grid-cols-1 ${c}`)}>{children}</div>;
}

// ---------------------------------------------------------------- Controls

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const v = {
    primary: 'bg-accent-500 text-ink-950 hover:bg-accent-400 font-semibold shadow-sm',
    secondary: 'bg-ink-100 text-ink-800 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-100 dark:hover:bg-ink-700',
    ghost: 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800',
    danger: 'bg-rose-600 text-white hover:bg-rose-500',
  }[variant];
  const s = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-5 text-base' }[size];
  return (
    <button type="button" className={cx('inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40', v, s, className)} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-medium text-ink-600 dark:text-ink-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-ink-500 dark:text-ink-400">{hint}</span>}
    </label>
  );
}

const inputCls = 'h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/25 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100 dark:placeholder:text-ink-500';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(inputCls, className)} {...rest} />;
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'h-auto min-h-[96px] py-2 font-mono text-xs leading-relaxed', className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238791a5' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

/** Numeric input that keeps "empty" distinct from 0 (never invents a value). */
export function NumInput({ value, onChange, step = 1, min, max, placeholder, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: number | null | undefined; onChange: (v: number | null) => void; step?: number }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    const parsed = text === '' ? null : Number(text.replace(',', '.'));
    if (parsed !== (value ?? null)) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      inputMode="decimal"
      className={cx(inputCls, 'text-center tabular-nums', className)}
      value={text}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder ?? '—'}
      onChange={(e) => {
        const t = e.target.value.replace(/[^0-9.,-]/g, '');
        setText(t);
        if (t === '') onChange(null);
        else {
          const n = Number(t.replace(',', '.'));
          if (Number.isFinite(n)) onChange(n);
        }
      }}
      {...rest}
    />
  );
}

export function Stepper({ value, onChange, step = 1, min = 0, label, suffix }: { value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; label?: string; suffix?: string }) {
  const bump = (d: number) => onChange(Math.max(min, Math.round(((value ?? 0) + d) * 100) / 100));
  return (
    <div className="flex h-11 items-stretch overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
      <button type="button" aria-label={`Decrease ${label ?? ''}`} className="w-10 shrink-0 bg-ink-50 text-xl text-ink-500 active:bg-ink-200 dark:bg-ink-850 dark:active:bg-ink-700" onClick={() => bump(-step)}>−</button>
      <div className="relative min-w-0 flex-1">
        <NumInput value={value} onChange={onChange} className="h-full rounded-none border-0 px-1 text-base font-semibold focus:ring-0 dark:bg-ink-950" aria-label={label} />
        {suffix && <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-ink-400">{suffix}</span>}
      </div>
      <button type="button" aria-label={`Increase ${label ?? ''}`} className="w-10 shrink-0 bg-ink-50 text-xl text-ink-500 active:bg-ink-200 dark:bg-ink-850 dark:active:bg-ink-700" onClick={() => bump(step)}>+</button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-xl bg-ink-100 p-1 dark:bg-ink-850" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('rounded-lg font-medium transition', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
            value === o.value ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm text-ink-700 dark:text-ink-200">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-accent-500' : 'bg-ink-300 dark:bg-ink-700')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition', checked ? 'left-[22px]' : 'left-0.5')} />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------- Display

type Tone = 'neutral' | 'good' | 'info' | 'warn' | 'bad' | 'violet' | 'accent';
const toneCls: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  good: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  bad: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  accent: 'bg-accent-500/15 text-accent-600 dark:text-accent-400',
};

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', toneCls[tone], className)}>{children}</span>;
}

export function ConfidenceBadge({ c, provisional }: { c: TargetConfidence; provisional?: boolean }) {
  if (provisional) return <Badge tone="warn" title="Learning Mode — reference value, not individualized">Provisional</Badge>;
  return <Badge tone={c === 'high' ? 'good' : c === 'moderate' ? 'info' : 'neutral'} title="Confidence in this target">{c} confidence</Badge>;
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const t = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'bad' ? 'text-rose-600 dark:text-rose-400' : 'text-ink-900 dark:text-white';
  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-3.5 dark:border-ink-800 dark:bg-ink-900">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold tabular-nums tracking-tight', t)}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{sub}</div>}
    </div>
  );
}

/** Progress bar with optional lower-bound marker; overflow past preferred shown in violet. */
export function VolumeBar({ completed, min, preferred, max, uncertain = 0, height = 8 }: { completed: number; min: number; preferred: number; max: number; uncertain?: number; height?: number }) {
  const scale = Math.max(max, completed, preferred) || 1;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const done = completed >= preferred;
  const over = completed > max;
  const color = over ? 'bg-violet-500' : done ? 'bg-emerald-500' : completed >= min ? 'bg-sky-500' : 'bg-amber-500';
  const certain = Math.max(0, completed - uncertain);
  return (
    <div className="relative w-full rounded-full bg-ink-100 dark:bg-ink-800" style={{ height }}>
      <div className={cx('absolute inset-y-0 left-0 rounded-full opacity-40', color)} style={{ width: pct(completed) }} />
      <div className={cx('absolute inset-y-0 left-0 rounded-full', color)} style={{ width: pct(certain) }} />
      {min > 0 && min < preferred && <div className="absolute -top-0.5 h-[calc(100%+4px)] w-px bg-ink-400/70 dark:bg-ink-500" style={{ left: pct(min) }} title={`Lower end ${min}`} />}
      <div className="absolute -top-1 h-[calc(100%+8px)] w-0.5 rounded bg-ink-900 dark:bg-white" style={{ left: pct(preferred) }} title={`Target ${preferred}`} />
    </div>
  );
}

export function Why({ children, label = 'Why?' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:underline dark:text-accent-400">
        <IconInfo size={13} /> {label}
        <IconChevronDown size={12} className={cx('transition', open && 'rotate-180')} />
      </button>
      {open && <div className="mt-2 space-y-1.5 rounded-xl bg-ink-50 p-3 text-xs leading-relaxed text-ink-600 dark:bg-ink-950 dark:text-ink-300">{children}</div>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-300 px-6 py-10 text-center dark:border-ink-700">
      <div className="text-sm font-semibold text-ink-800 dark:text-ink-100">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-ink-500 dark:text-ink-400">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Callout({ tone = 'info', title, children, icon }: { tone?: 'info' | 'warn' | 'good' | 'bad'; title?: ReactNode; children: ReactNode; icon?: ReactNode }) {
  const t = {
    info: 'border-sky-500/30 bg-sky-500/5 text-sky-900 dark:text-sky-100',
    warn: 'border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-100',
    good: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100',
    bad: 'border-rose-500/40 bg-rose-500/5 text-rose-900 dark:text-rose-100',
  }[tone];
  return (
    <div className={cx('flex gap-3 rounded-2xl border p-3.5 text-sm', t)}>
      {icon && <div className="mt-0.5 shrink-0 opacity-80">{icon}</div>}
      <div className="min-w-0 space-y-1">
        {title && <div className="font-semibold">{title}</div>}
        <div className="leading-relaxed opacity-90">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cx('relative flex max-h-[92vh] w-full flex-col rounded-t-3xl border border-ink-200 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-900 sm:rounded-3xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4 dark:border-ink-800">
          <h3 id={id} className="text-base font-semibold text-ink-900 dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800" aria-label="Close"><IconX size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3 dark:border-ink-800">{footer}</div>}
      </div>
    </div>
  );
}

export function Table({ head, children, dense }: { head: ReactNode[]; children: ReactNode; dense?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-[11px] uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
            {head.map((h, i) => <th key={i} className={cx('whitespace-nowrap px-3 font-medium', dense ? 'py-1.5' : 'py-2', i > 0 && 'text-right')}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800/70">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className, right = true }: { children: ReactNode; className?: string; right?: boolean }) {
  return <td className={cx('whitespace-nowrap px-3 py-2 tabular-nums', right && 'text-right', className)}>{children}</td>;
}

export function fmt(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  return Number.isInteger(r) ? String(r) : r.toFixed(digits);
}

/** Tiny toast system. */
let toastFn: ((t: { msg: string; tone?: 'good' | 'bad' | 'info' }) => void) | null = null;
export function toast(msg: string, tone: 'good' | 'bad' | 'info' = 'good') {
  toastFn?.({ msg, tone });
}
export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string; tone?: string }[]>([]);
  useEffect(() => {
    toastFn = (t) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, ...t }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
    };
    return () => {
      toastFn = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
      {items.map((t) => (
        <div key={t.id} className={cx('pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg',
          t.tone === 'bad' ? 'bg-rose-600 text-white' : t.tone === 'info' ? 'bg-ink-800 text-white' : 'bg-emerald-600 text-white')}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function confirmAction(message: string): boolean {
  return window.confirm(message);
}
