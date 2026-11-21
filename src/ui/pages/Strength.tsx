import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, formatDuration } from '../../domain/dates';
import { FEEL_BY_ID, formatRirRange, EFFORT_RIR_ESTIMATE } from '../../domain/feedback';
import { adviceFor, adviceLabel, progressionKey, loadMap, loadMapNote, warmupFor, type AdviceKind, type ProgressionSeries, type SetPoint } from '../../domain/progression';
import { loadUnitLabel } from '../../domain/registry';
import { store, useData } from '../../lib/store';
import { assignBenchAngle } from '../../domain/bulkEdit';
import { strengthProgress } from '../../domain/baseline';
import { bodyLoadSessions, bodyWeightNote, bodyWeightRelevant, pullUpLoadingAdvice } from '../../domain/bodyweight';
import { loadStep } from '../../domain/increments';
import { IconChevronDown, IconSearch } from '../components/icons';
import { Badge, Button, Card, confirmAction, Empty, Input, NumInput, Page, Segmented, Table, Td, Why, cx, fmt, toast } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

/**
 * Strength — simple on the surface: one recommendation per exercise history and one chart.
 * The analysis behind it (benchmark sets, feedback, rest, plateau checks, load calibration) lives in
 * src/domain/progression.ts; details open on demand.
 */

const ADVICE_TONE: Record<AdviceKind, 'good' | 'info' | 'warn' | 'neutral' | 'violet'> = { increase: 'good', keep: 'info', reduce: 'warn', plateau: 'violet', not_enough_data: 'neutral' };

export function StrengthPage() {
  const a = useAnalysis();
  const names = useNames();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const selected = params.get('k');
  const setSelected = (k: string | null) => setParams(k ? { k } : {}, { replace: true });

  useEffect(() => {
    if (selected) window.setTimeout(() => document.getElementById('series-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, [selected]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = a.progression.filter((p) => {
      if (!needle) return true;
      const def = a.registry.get(p.exerciseId);
      return [def?.name.en, def?.name.ru, p.exerciseId, p.scopeLabel].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
    const m = new Map<string, ProgressionSeries[]>();
    for (const p of filtered) m.set(p.exerciseId, [...(m.get(p.exerciseId) ?? []), p]);
    return [...m.entries()].sort((x, y) => (y[1][0].current?.date ?? '').localeCompare(x[1][0].current?.date ?? ''));
  }, [a.progression, a.registry, q]);

  const sel = a.progression.find((p) => p.key === selected) ?? null;

  if (!a.progression.length) {
    return (
      <Page title="Strength" subtitle="Per exercise and per machine.">
        <Empty title="No strength history yet">Log working sets with weight and reps (and RIR or how the set felt). Recommendations get reliable after a few comparable sessions on the same exercise and machine.</Empty>
      </Page>
    );
  }

  return (
    <Page title="Strength" subtitle="One recommendation per exercise. Each machine and configuration has its own history.">
      <ProgressTable />
      <div className="relative">
        <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input placeholder="Search exercise or machine" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={cx('space-y-4', sel && 'hidden lg:block')}>
          {groups.length === 0 && <Empty title="No matches">Try another search.</Empty>}
          {groups.map(([exerciseId, series]) => (
            <div key={exerciseId}>
              <h2 className="mb-1.5 px-1 text-sm font-semibold text-ink-900 dark:text-white">{names.ex(a.registry.get(exerciseId), exerciseId)}</h2>
              <div className="space-y-2">
                {series.map((p) => <SeriesCard key={p.key} p={p} active={p.key === selected} onClick={() => setSelected(p.key === selected ? null : p.key)} />)}
              </div>
            </div>
          ))}
        </div>
        <div id="series-detail" className="scroll-mt-20 lg:sticky lg:top-4 lg:self-start">
          {sel ? <SeriesDetail p={sel} onBack={() => setSelected(null)} /> : (
            <Card className="hidden lg:block"><p className="py-10 text-center text-sm text-ink-500">Select an exercise to see its chart and recommendation.</p></Card>
          )}
        </div>
      </div>
    </Page>
  );
}

const isBodyweight = (p: ProgressionSeries) => p.loadMode === 'bodyweight_plus' && (p.current?.topWeight ?? 0) === 0;

function SeriesCard({ p, active, onClick }: { p: ProgressionSeries; active: boolean; onClick: () => void }) {
  const adv = adviceFor(p);
  const bw = isBodyweight(p);
  const cur = p.current;
  return (
    <button type="button" onClick={onClick}
      className={cx('flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl border bg-white px-3.5 py-2.5 text-left transition dark:bg-ink-900',
        active ? 'border-accent-500 ring-2 ring-accent-500/20' : 'border-ink-200 dark:border-ink-800')}>
      <span className="min-w-0">
        <span className="block truncate text-xs text-ink-500">{p.scopeLabel}</span>
        <span className="block text-sm tabular-nums text-ink-900 dark:text-white">
          {cur ? <>{bw || cur.topWeight == null ? '' : `${fmt(cur.topWeight, 2)} kg × `}{cur.topReps ?? '?'}{bw ? ' reps' : ''}</> : '—'}
          {cur && <span className="text-xs text-ink-400"> · {formatDate(cur.date, { day: 'numeric', month: 'short' })}</span>}
        </span>
      </span>
      <Badge tone={ADVICE_TONE[adv.kind]}>{adv.label}{(adv.kind === 'increase' || adv.kind === 'reduce') && p.next.weight != null ? ` · ${fmt(p.next.weight, 2)} kg` : ''}</Badge>
    </button>
  );
}

type ChartMode = 'weight' | 'reps' | 'both';

function SeriesDetail({ p, onBack }: { p: ProgressionSeries; onBack: () => void }) {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [mode, setMode] = useState<ChartMode>('both');
  const def = a.registry.get(p.exerciseId);
  const adv = adviceFor(p);
  const bw = isBodyweight(p);
  const unit = loadUnitLabel(def, p.loadMode);
  const eq = p.equipmentId ? data.equipment.find((e) => e.id === p.equipmentId) : undefined;
  const lastGym = data.locations.find((l) => l.id === data.workouts.find((w) => w.id === p.current?.workoutId)?.locationId) ?? null;
  const inc = loadStep(eq, lastGym, def?.equipmentKind, p.loadMode).step;
  const chart = p.sessions.map((s) => ({
    date: s.date.slice(5),
    weight: bw ? null : s.topWeight,
    reps: s.topReps,
    flagged: !s.representative,
  }));
  const loads = loadMap(p);
  const loadNote = loadMapNote(loads);
  const warm = warmupFor(def, p.next.weight, inc, 0);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="flex min-h-[44px] items-center gap-1 text-sm font-medium text-accent-600 lg:hidden dark:text-accent-400">← All exercises</button>
      <Card>
        <h2 className="text-base font-semibold text-ink-900 dark:text-white">{names.ex(def, p.exerciseId)}</h2>
        <p className="text-xs text-ink-500">{p.scopeLabel} · {unit}{def ? ` · ${def.repRange[0]}–${def.repRange[1]} reps` : ''}</p>
        <div className={cx('mt-3 rounded-xl border p-3', {
          increase: 'border-emerald-500/40 bg-emerald-500/5', keep: 'border-sky-500/30 bg-sky-500/5', reduce: 'border-amber-500/40 bg-amber-500/5',
          plateau: 'border-violet-500/30 bg-violet-500/5', not_enough_data: 'border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-950',
        }[adv.kind])}>
          <div className="text-sm font-bold tracking-wide text-ink-900 dark:text-white">{adviceLabel(p, adv.kind)}</div>
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
            <Num k="Previous" v={p.previous?.topWeight != null && !bw ? `${fmt(p.previous.topWeight, 2)} kg` : p.previous ? `${p.previous.topReps ?? '—'} reps` : '—'} />
            <Num k="Current" v={p.current?.topWeight != null && !bw ? `${fmt(p.current.topWeight, 2)} kg` : p.current ? `${p.current.topReps ?? '—'} reps` : '—'} />
            <Num k="Best reps" v={String(Math.max(0, ...p.sessions.flatMap((x) => x.sets.map((q) => q.reps ?? 0))) || '—')} />
            <Num k="Next" v={p.next.weight != null && !bw ? `${fmt(p.next.weight, 2)} kg` : bw ? 'BW' : '—'} />
            <Num k="Reps" v={`${p.next.repTarget[0]}–${p.next.repTarget[1]}`} />
            <Num k="Target RIR" v={String(p.next.rirTarget)} />
          </dl>
          <div className="mt-1"><Why label="Why"><p>{adv.text}</p>{!bw && <p>Smallest step {fmt(inc, 2)} kg.</p>}</Why></div>
        </div>
        {def?.variationFields?.includes('angle') && p.variantLabel == null && p.sessions.length > 0 && <AssignAngle p={p} name={names.ex(def, p.exerciseId)} />}
      </Card>
      {bodyWeightRelevant(p.exerciseId, def?.equipmentKind) && <BodyContext p={p} kind={bodyWeightRelevant(p.exerciseId, def?.equipmentKind)!} repTop={def?.repRange[1] ?? 12} />}

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">History</span>
          {!bw && <Segmented<ChartMode> size="sm" value={mode} onChange={setMode} options={[{ value: 'weight', label: 'Weight' }, { value: 'reps', label: 'Reps' }, { value: 'both', label: 'Both' }]} />}
        </div>
        {p.sessions.length >= 2 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                {(mode !== 'reps' && !bw) && <YAxis yAxisId="w" tickLine={false} axisLine={false} domain={['auto', 'auto']} />}
                {(mode !== 'weight' || bw) && <YAxis yAxisId="r" orientation={mode === 'both' && !bw ? 'right' : 'left'} tickLine={false} axisLine={false} allowDecimals={false} domain={['auto', 'auto']} />}
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11, left: 0, width: '100%' }} />
                {(mode !== 'reps' && !bw) && <Line yAxisId="w" type="monotone" dataKey="weight" name="Top weight (kg)" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />}
                {(mode !== 'weight' || bw) && <Line yAxisId="r" type="monotone" dataKey="reps" name="Reps (top set)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-xs text-ink-500">The chart appears after the second session.</p>}
        {p.sessions.some((s) => !s.representative) && <p className="mt-1 text-[11px] text-ink-500">Sessions flagged as wrong weight, pain or broken technique are shown but not used to judge progress.</p>}
      </Card>

      <Section title="Set-by-set feedback" hint="Every working set, as recorded">
        <FeedbackTable p={p} />
      </Section>

      <Section title="Your loads" hint={loadNote ?? 'Tap how sets felt to calibrate'}>
        {loads.length ? (
          <ul className="space-y-1 text-xs">
            {loads.map((l) => (
              <li key={l.weight} className="flex items-center justify-between gap-2">
                <span className="tabular-nums font-medium">{fmt(l.weight, 2)} kg <span className="font-normal text-ink-500">· {l.sets} set{l.sets === 1 ? '' : 's'}</span></span>
                <Badge tone={{ right: 'good', too_easy: 'info', too_heavy: 'warn', mixed: 'neutral', no_feedback: 'neutral' }[l.verdict] as 'good'}>{{ right: 'feels right', too_easy: 'too easy', too_heavy: 'too heavy', mixed: 'mixed', no_feedback: 'not rated' }[l.verdict]}</Badge>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-ink-500">No loads yet.</p>}
        <p className="mt-2 text-[11px] text-ink-500">Learned only for this exercise on this equipment and configuration — the same number on another machine can feel completely different.</p>
      </Section>

      <Section title="Personal bests">
        <PersonalBests p={p} bw={bw} />
      </Section>

      <Section title="Effort & rest">
        <Table head={['Date', 'Avg RIR', 'Avg rest', 'Trend note']} dense>
          {[...p.sessions].reverse().map((s) => (
            <tr key={s.workoutId + s.date}>
              <Td right={false}>{formatDate(s.date, { day: 'numeric', month: 'short' })}</Td>
              <Td>{fmt(s.avgRir)}</Td>
              <Td>{formatDuration(s.restAvgSec)}</Td>
              <Td className="whitespace-normal text-[11px]">{!s.representative ? 'not a benchmark' : s.fatigued ? 'high fatigue / short sleep' : ''}</Td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-[11px] text-ink-500">{p.trend.evidence}</p>
      </Section>

      <Section title="Warm-up" hint={warm.sets.length ? warm.sets.map((s) => `${s.weight != null ? `${fmt(s.weight, 2)} kg` : 'BW'} × ${s.reps}`).join(' → ') : 'none needed'}>
        <p className="text-xs text-ink-500">{warm.reason} Assumes this is your first exercise for these muscles.</p>
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card padded={false}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left sm:px-5">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink-900 dark:text-white">{title}</span>
          {hint && <span className="block truncate text-[11px] text-ink-500">{hint}</span>}
        </span>
        <IconChevronDown size={16} className={cx('shrink-0 text-ink-400 transition', open && 'rotate-180')} />
      </button>
      {open && <div className="border-t border-ink-100 px-4 py-3 dark:border-ink-800 sm:px-5">{children}</div>}
    </Card>
  );
}

function feelText(x: SetPoint): string {
  if (x.feel) return FEEL_BY_ID[x.feel].label;
  return '—';
}

function FeedbackTable({ p }: { p: ProgressionSeries }) {
  const rows = [...p.sessions].reverse().flatMap((s) => s.sets.map((x, i) => ({ s, x, i })));
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[340px] text-xs tabular-nums">
        <thead><tr className="text-left text-[10px] uppercase tracking-wider text-ink-400"><th className="px-4 py-1 sm:px-0">Date</th><th>kg</th><th>Reps</th><th>Felt</th><th className="pr-4 text-right sm:pr-0">RIR</th></tr></thead>
        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
          {rows.map(({ s, x, i }) => (
            <tr key={`${s.workoutId}-${i}`} className={cx(!x.benchmark && 'text-ink-400')}>
              <td className="px-4 py-1.5 sm:px-0">{i === 0 ? formatDate(s.date, { day: 'numeric', month: 'short' }) : ''}</td>
              <td>{x.side ? `${x.side === 'left' ? 'L' : 'R'} ` : ''}{x.weight != null ? fmt(x.weight, 2) : 'BW'}</td>
              <td>{x.reps ?? '?'}</td>
              <td className="max-w-[120px] truncate" title={x.excluded ? `Not a benchmark: ${x.excluded}` : ''}>{feelText(x)}{x.excluded ? ' ⚑' : ''}</td>
              <td className="pr-4 text-right sm:pr-0">{x.rir != null ? x.rir : x.effort ? <span className="text-ink-400">≈{formatRirRange(EFFORT_RIR_ESTIMATE[x.effort])}</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-4 text-[11px] text-ink-500 sm:px-0">⚑ = kept but not used to judge progress (wrong weight, pain or broken technique). ≈ = RIR estimated from how the set felt, not logged.</p>
    </div>
  );
}

/** Heaviest working set (any reps) and most reps in one set, from this history only. */
function PersonalBests({ p, bw }: { p: ProgressionSeries; bw: boolean }) {
  let heaviest: { weight: number; reps: number; date: string } | null = null;
  let mostReps: { weight: number | null; reps: number; date: string } | null = null;
  const assisted = p.loadMode === 'assisted';
  for (const s of p.sessions) for (const x of s.sets) {
    if (!x.benchmark || x.reps == null || x.reps <= 0) continue; // a wrong-weight or broken-technique set is not a PR
    if (x.weight != null && (!heaviest || (assisted ? x.weight < heaviest.weight : x.weight > heaviest.weight) || (x.weight === heaviest.weight && x.reps > heaviest.reps))) heaviest = { weight: x.weight, reps: x.reps, date: s.date };
    if (!mostReps || x.reps > mostReps.reps || (x.reps === mostReps.reps && (x.weight ?? 0) > (mostReps.weight ?? 0))) mostReps = { weight: x.weight, reps: x.reps, date: s.date };
  }
  return (
    <dl className="grid grid-cols-2 gap-3 text-xs">
      {!bw && <div><dt className="text-ink-500">Heaviest</dt><dd className="text-sm font-semibold tabular-nums">{heaviest ? `${fmt(heaviest.weight, 2)} kg × ${heaviest.reps}` : '—'}</dd><dd className="text-ink-400">{heaviest ? formatDate(heaviest.date) : ''}</dd></div>}
      <div><dt className="text-ink-500">Most reps</dt><dd className="text-sm font-semibold tabular-nums">{mostReps ? `${mostReps.reps}${mostReps.weight != null && !bw ? ` @ ${fmt(mostReps.weight, 2)} kg` : ''}` : '—'}</dd><dd className="text-ink-400">{mostReps ? formatDate(mostReps.date) : ''}</dd></div>
    </dl>
  );
}

/** One-time: give earlier sessions logged without a bench angle the angle you actually used (audited). */
function AssignAngle({ p, name }: { p: ProgressionSeries; name: string }) {
  const data = useData();
  const a = useAnalysis();
  const [open, setOpen] = useState(false);
  const [angle, setAngle] = useState<number | null>(null);
  // An incline exercise done flat is a different exercise (as in the logger), so no "Flat" here.
  const incline = a.registry.get(p.exerciseId)?.pattern === 'incline_push';
  const n = p.sessions.length;
  const apply = async () => {
    if (angle == null) return;
    if (!confirmAction(`Set ${angle}° on ${n} earlier session${n === 1 ? '' : 's'} of ${name} that had no angle? Weights and reps stay as logged; the angle can change how those sets are credited to upper chest / front delts. Each workout gets an audit note.`)) return;
    const def = a.registry.get(p.exerciseId);
    const changed = assignBenchAngle(data.workouts, { workoutIds: p.sessions.map((s) => s.workoutId), exerciseId: p.exerciseId, equipmentId: p.equipmentId, exerciseName: name, matches: (e, w) => progressionKey(e, w, def) === p.key }, angle, new Date().toISOString());
    for (const w of changed) await store.saveWorkout(w);
    toast(`${changed.length} workout${changed.length === 1 ? '' : 's'} updated`);
    setOpen(false);
  };
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-2 min-h-[40px] text-left text-xs text-accent-600 underline decoration-dotted underline-offset-2 dark:text-accent-400">These {n} session{n === 1 ? '' : 's'} have no bench angle — assign the angle you used</button>;
  return (
    <div className="mt-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950">
      <div className="text-xs font-medium text-ink-700 dark:text-ink-200">Angle used in these {n} session{n === 1 ? '' : 's'}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(incline ? [15, 30, 45] : [0, 15, 30, 45]).map((d) => (
          <button key={d} type="button" onClick={() => setAngle(d)} aria-pressed={angle === d}
            className={cx('h-10 rounded-full px-3.5 text-[13px] font-medium', angle === d ? 'bg-accent-500 text-ink-950' : 'bg-white text-ink-600 shadow-sm dark:bg-ink-800 dark:text-ink-300')}>{d === 0 ? 'Flat' : `${d}°`}</button>
        ))}
        <div className="w-24"><NumInput value={angle != null && ![0, 15, 30, 45].includes(angle) ? angle : null} onChange={setAngle} placeholder="other °" /></div>
      </div>
      <p className="mt-2 text-[11px] text-ink-500">Only entries without an angle change. Weights and reps stay as logged; each workout records the correction.</p>
      <div className="mt-2 flex gap-2"><Button size="sm" variant="primary" disabled={angle == null} onClick={apply}>Apply</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>
  );
}

function Num({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-[10px] uppercase tracking-wider text-ink-500">{k}</dt><dd className="text-sm font-semibold tabular-nums text-ink-900 dark:text-white">{v}</dd></div>;
}

/** Body weight before each session next to the external load (belt / barbell), kept separate. */
function BodyContext({ p, kind, repTop }: { p: ProgressionSeries; kind: 'system' | 'context'; repTop: number }) {
  const data = useData();
  const rows = bodyLoadSessions(p, data.workouts, data.body, kind).slice(-8).reverse();
  const note = bodyWeightNote(bodyLoadSessions(p, data.workouts, data.body, kind), kind);
  const advice = pullUpLoadingAdvice(p, repTop);
  return (
    <Card>
      <div className="mb-2 text-sm font-semibold">Body weight</div>
      <Table dense head={['Date', 'Body', kind === 'system' ? 'Added' : 'Bar', 'Best reps', ...(kind === 'system' ? ['≈ Total (est.)'] : [])]}>
        {rows.map((r) => (
          <tr key={r.workoutId}>
            <Td right={false}>{formatDate(r.date, { day: 'numeric', month: 'short' })}</Td>
            <Td>{r.body.kg != null ? `${fmt(r.body.kg)}${r.body.status === 'outdated' ? '*' : ''}` : '—'}</Td>
            <Td>{r.externalKg != null ? fmt(r.externalKg, 2) : '—'}</Td>
            <Td>{r.bestReps ?? '—'}</Td>
            {kind === 'system' && <Td>{r.estSystemKg != null ? fmt(r.estSystemKg) : '—'}</Td>}
          </tr>
        ))}
      </Table>
      {note && <p className="mt-2 text-xs text-ink-600 dark:text-ink-300">{note}</p>}
      {advice && <p className="mt-1 text-xs font-medium text-accent-700 dark:text-accent-300">{advice}</p>}
      <p className="mt-1 text-[11px] text-ink-400">Body weight = latest weigh-in before each session{kind === 'system' ? '; total = body + added weight, an estimate' : '; never added to the bar'}. * older than 7 days.</p>
    </Card>
  );
}

/** Exercise · Baseline · Current · Progress — % only from comparable, representative sessions. */
function ProgressTable() {
  const a = useAnalysis();
  const names = useNames();
  const rows = a.progression.map((p) => ({ p, s: strengthProgress(p, a.today) })).filter((r) => r.s.baseline)
    .sort((x, y) => (y.s.pct ?? -999) - (x.s.pct ?? -999));
  if (!rows.length) return null;
  const kg = (r: { p: ProgressionSeries }, w: number | null | undefined, idx: number | undefined) =>
    r.p.loadMode === 'bodyweight_plus' && !w ? (idx != null ? `${fmt(idx)} reps` : '—') : w != null ? `${fmt(w, 2)} kg` : '—';
  return (
    <Card padded={false}>
      <div className="flex items-baseline justify-between px-4 pt-3 sm:px-5"><span className="text-sm font-semibold">Progress vs baseline</span><span className="text-[10px] uppercase tracking-wider text-ink-400">first 4 weeks → last 4</span></div>
      <Table dense head={['Exercise', 'Baseline', 'Current', 'Est. strength']}>
        {rows.map((r) => (
          <tr key={r.p.key}>
            <Td right={false} className="max-w-[9rem] truncate">{names.ex(a.registry.get(r.p.exerciseId), r.p.exerciseId)}{r.p.variantLabel ? <span className="text-ink-400"> · {r.p.variantLabel}</span> : null}</Td>
            <Td>{kg(r, r.s.baseline?.topWeight, r.s.baseline?.index)}</Td>
            <Td>{r.s.current ? kg(r, r.s.current.topWeight, r.s.current.index) : '—'}</Td>
            <Td className={cx('font-semibold', r.s.pct == null ? 'text-ink-400' : r.s.pct >= 2 ? 'text-emerald-600 dark:text-emerald-400' : r.s.pct <= -2 ? 'text-amber-600 dark:text-amber-400' : '')}>{r.s.pct == null ? 'MORE DATA' : `${r.s.pct > 0 ? '+' : ''}${fmt(r.s.pct)}%${r.p.sessions.at(-1)?.indexKind === 'reps' ? ' reps' : ''}`}</Td>
          </tr>
        ))}
      </Table>
      <div className="px-4 pb-3 sm:px-5"><Why label="How"><p>Estimated strength on that exact machine and setup: weight, reps and RIR of the best clean set (RIR-adjusted Epley). Baseline = first 4 weeks of that history (≥ 2 sessions); current = last ≤ 3 sessions in the last 4 weeks (≥ 2). Bodyweight work ("reps") uses reps + RIR instead. Baseline/Current columns show the median top weight. Wrong-weight, pain and technique-issue sets never count. An estimate of strength, not muscle growth.</p></Why></div>
    </Card>
  );
}
