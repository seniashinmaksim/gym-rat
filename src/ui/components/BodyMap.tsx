import { useState, type ReactNode } from 'react';
import type { MuscleWeek } from '../../domain/analysis';
import { muscleName } from '../../domain/muscles';
import type { MuscleId } from '../../domain/types';
import { cx, fmt } from './ui';
import { getLang, L } from '../../i18n';

/** Recovery status (a stored value) → the words shown. */
const recoveryLabel = (s: MuscleWeek['recovery']['status']) =>
  L(s.replace('_', ' '), s === 'likely_recovered' ? 'вероятно восстановилась' : s === 'recovering' ? 'восстанавливается' : 'мало данных');

/**
 * Front/back anatomical map. Each muscle is drawn once on the left half and mirrored.
 * Colour = weekly status (or recovery status); intensity = share of target completed.
 */

type Shape = { m: MuscleId; d: string };

const SILHOUETTE =
  'M110 66 L100 66 L99 80 C86 84 70 86 62 92 C50 98 46 112 46 128 C44 150 46 170 48 186 C44 206 38 230 36 252 C34 260 38 266 44 264 C48 262 52 256 54 250 C60 230 66 210 70 190 L72 170 C74 196 74 220 72 240 C70 252 68 262 68 276 C66 310 68 340 74 372 C72 392 72 412 76 430 L72 444 L97 444 L96 430 C100 412 100 392 98 376 C104 350 106 320 108 296 L110 292 Z';

const FRONT: Shape[] = [
  { m: 'traps', d: 'M101 76 C95 84 86 87 77 90 L99 93 Z' },
  { m: 'side_delts', d: 'M72 90 C58 90 49 102 48 120 C49 126 52 128 55 126 C56 112 62 100 72 94 Z' },
  { m: 'front_delts', d: 'M75 92 C65 100 59 112 57 126 C63 122 70 118 77 116 C81 108 85 99 88 93 Z' },
  { m: 'chest', d: 'M108 96 L108 150 C96 156 80 154 73 144 C69 132 72 121 78 114 C84 104 94 96 108 96 Z' },
  { m: 'biceps', d: 'M57 131 C53 143 51 161 53 179 C57 183 64 183 68 179 C71 163 71 146 70 128 C65 126 60 127 57 131 Z' },
  { m: 'forearms', d: 'M52 188 C46 206 42 226 40 248 C44 252 50 252 54 250 C60 232 66 212 68 190 C62 186 56 186 52 188 Z' },
  { m: 'abs', d: 'M93 158 L108 158 L108 234 C102 236 97 235 93 231 C90 207 90 182 93 158 Z' },
  { m: 'quads', d: 'M74 264 C68 293 70 332 78 370 C86 374 94 374 100 368 C102 340 100 302 97 270 C91 262 82 259 74 264 Z' },
  { m: 'adductors', d: 'M108 262 L108 330 C104 316 101 296 99 272 C101 266 104 263 108 262 Z' },
  { m: 'calves', d: 'M81 384 C76 399 76 416 80 428 L89 428 C93 414 95 399 93 384 C89 381 85 381 81 384 Z' },
];

const BACK: Shape[] = [
  { m: 'traps', d: 'M110 70 L98 76 C90 84 81 88 73 92 C85 97 96 106 103 128 L110 152 Z' },
  { m: 'side_delts', d: 'M72 90 C58 90 49 102 48 120 C49 126 52 128 55 126 C56 112 62 100 72 94 Z' },
  { m: 'rear_delts', d: 'M73 93 C62 98 56 108 55 122 C61 119 68 115 75 112 C78 106 80 99 80 95 Z' },
  { m: 'upper_back', d: 'M81 98 C89 106 97 117 102 131 L103 148 C93 145 84 136 79 124 C77 114 78 105 81 98 Z' },
  { m: 'lats', d: 'M77 128 C85 141 96 151 105 157 L105 198 C95 202 86 197 80 189 C74 169 73 147 77 128 Z' },
  { m: 'spinal_erectors', d: 'M100 166 C98 194 96 218 96 240 L108 240 L108 164 Z' },
  { m: 'triceps', d: 'M55 129 C51 145 51 164 53 182 C58 186 64 186 68 182 C70 164 70 146 68 128 C63 124 58 125 55 129 Z' },
  { m: 'forearms', d: 'M52 188 C46 206 42 226 40 248 C44 252 50 252 54 250 C60 232 66 212 68 190 C62 186 56 186 52 188 Z' },
  { m: 'glutes', d: 'M108 246 L108 296 C96 302 83 298 75 288 C71 272 73 257 81 248 C90 242 100 242 108 246 Z' },
  { m: 'hamstrings', d: 'M76 302 C72 326 74 351 80 372 C88 376 96 376 102 372 C106 350 106 323 104 304 C94 308 84 306 76 302 Z' },
  { m: 'calves', d: 'M80 384 C74 400 74 418 82 430 L96 430 C100 416 100 399 96 384 C90 380 84 380 80 384 Z' },
];

const REGION_OUTLINES = {
  upper_chest: 'M108 96 C94 96 84 104 78 114 C76 118 75 121 75 123 C86 118 98 116 108 116 Z',
  lower_chest: 'M108 136 L108 150 C96 156 80 154 73 144 C84 144 98 140 108 136 Z',
};

const STATUS_FILL: Record<string, string> = {
  done: '#10b981',
  over: '#8b5cf6',
  on_track: '#0ea5e9',
  behind: '#f59e0b',
  at_risk: '#f43f5e',
  no_data: '#68738a',
  likely_recovered: '#10b981',
  recovering: '#f59e0b',
  insufficient_data: '#68738a',
};

export type BodyMapMode = 'volume' | 'recovery';

export function BodyMap({ muscles, mode = 'volume', selected, onSelect, compact, paint, footer }: {
  muscles: MuscleWeek[];
  mode?: BodyMapMode;
  selected?: MuscleId | null;
  onSelect?: (m: MuscleId) => void;
  compact?: boolean;
  /** Own colours per muscle (e.g. the soreness check) instead of the status colours. */
  paint?: (m: MuscleId) => { fill: string; opacity: number };
  /** Shown instead of the info line / legend. */
  footer?: ReactNode;
}) {
  const [hover, setHover] = useState<MuscleId | null>(null);
  const byId = new Map(muscles.map((m) => [m.muscle, m]));
  const active = hover ?? selected ?? null;
  const info = active ? byId.get(active) : undefined;

  const style = (m: MuscleId) => {
    if (paint) return paint(m);
    const mw = byId.get(m);
    if (!mw) return { fill: '#68738a', opacity: 0.25 };
    if (mode === 'recovery') {
      const r = mw.recovery;
      return { fill: STATUS_FILL[r.status], opacity: r.status === 'insufficient_data' ? 0.25 : 0.45 + 0.5 * (r.readiness ?? 0.5) };
    }
    if (mw.completed <= 0) return { fill: '#68738a', opacity: 0.22 };
    return { fill: STATUS_FILL[mw.status], opacity: 0.35 + 0.6 * Math.min(1, mw.pctOfPreferred) };
  };

  const renderShapes = (shapes: Shape[]) => shapes.map((s) => {
    const st = style(s.m);
    const isActive = active === s.m;
    return (
      <path
        key={s.m + s.d.slice(0, 12)}
        d={s.d}
        fill={st.fill}
        fillOpacity={st.opacity}
        style={isActive ? { stroke: 'currentColor', strokeWidth: 2 } : undefined}
        strokeWidth={1.3}
        strokeLinejoin="round"
        className="cursor-pointer stroke-white transition-[fill-opacity] duration-300 hover:brightness-110 focus:outline-none dark:stroke-ink-900"
        onMouseEnter={() => setHover(s.m)}
        onMouseLeave={() => setHover(null)}
        onClick={() => onSelect?.(s.m)}
        role="button"
        tabIndex={0}
        aria-label={muscleName(s.m, getLang())}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(s.m)}
      />
    );
  });

  const figure = (shapes: Shape[], label: string, front: boolean) => (
    <figure className="flex flex-1 flex-col items-center">
      <svg viewBox="30 20 160 432" className={cx('w-full text-ink-900 dark:text-white', compact ? 'max-h-[260px]' : 'max-h-[380px]')} role="img" aria-label={L(`${label} muscle map`, `Карта мышц: ${label.toLowerCase()}`)}>
        <g className="fill-ink-200 dark:fill-ink-800">
          <ellipse cx="110" cy="42" rx="20" ry="25" />
          <path d={SILHOUETTE} />
          <path d={SILHOUETTE} transform="translate(220 0) scale(-1 1)" />
        </g>
        <g>{renderShapes(shapes)}</g>
        <g transform="translate(220 0) scale(-1 1)">{renderShapes(shapes)}</g>
        {front && (
          <g className="pointer-events-none" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="0.8" strokeDasharray="2 2">
            {Object.values(REGION_OUTLINES).map((d) => (
              <g key={d}><path d={d} /><path d={d} transform="translate(220 0) scale(-1 1)" /></g>
            ))}
            <path d="M93 182 H127 M93 206 H127 M110 158 V234" strokeDasharray="none" strokeOpacity="0.18" />
          </g>
        )}
      </svg>
      <figcaption className="mt-1 text-[11px] font-medium uppercase tracking-wider text-ink-400">{label}</figcaption>
    </figure>
  );

  return (
    <div>
      <div className="flex gap-2">
        {figure(FRONT, L('Front', 'Спереди'), true)}
        {figure(BACK, L('Back', 'Сзади'), false)}
      </div>
      {footer !== undefined ? footer : <div className="mt-3 min-h-[44px] rounded-xl bg-ink-50 px-3 py-2 text-xs dark:bg-ink-950">
        {info ? (
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-semibold text-ink-900 dark:text-white">{muscleName(info.muscle, getLang())}</span>
            {mode === 'volume' ? (
              <span className="tabular-nums text-ink-600 dark:text-ink-300">
                {fmt(info.completed)} / {fmt(info.target.preferred)} {L('sets', 'подх.')} · {L('', 'осталось ')}<b>{fmt(info.remainingToPreferred)}</b>{L(' left', '')}
              </span>
            ) : (
              <span className="text-ink-600 dark:text-ink-300">{recoveryLabel(info.recovery.status)}{info.recovery.hoursSince != null ? L(` · ${info.recovery.hoursSince} h since`, ` · ${info.recovery.hoursSince} ч назад`) : ''}</span>
            )}
          </div>
        ) : (
          <Legend mode={mode} />
        )}
      </div>}
    </div>
  );
}

function Legend({ mode }: { mode: BodyMapMode }) {
  const items = mode === 'volume'
    ? [['done', L('Target met', 'Цель достигнута')], ['on_track', L('On track', 'По плану')], ['behind', L('Behind', 'Отстаёт')], ['at_risk', L('At risk', 'Под угрозой')], ['over', L('Above range', 'Выше диапазона')]]
    : [['likely_recovered', L('Likely recovered', 'Вероятно восстановилась')], ['recovering', L('Recovering', 'Восстанавливается')], ['insufficient_data', L('No data', 'Нет данных')]];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-ink-500 dark:text-ink-400">
      {items.map(([k, l]) => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_FILL[k] }} />{l}</span>
      ))}
      <span className="text-ink-400">{L('· Tap a muscle', '· Нажмите на мышцу')}</span>
    </div>
  );
}

export { STATUS_FILL };
