import { useMemo, useState } from 'react';
import { SEED_BY_ID } from '../../data/exercises';
import { MUSCLE_BY_ID, TRACKED_MUSCLES, involvement, muscleName } from '../../domain/muscles';
import { searchExercises } from '../../domain/registry';
import type { EquipmentKind, ExerciseDef, ExerciseOverride, MovementPattern, MuscleId, RegionId } from '../../domain/types';
import { slugId } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { formatDate } from '../../domain/dates';
import { IconInfo, IconPlus, IconSearch } from '../components/icons';
import {
  Badge, Button, Callout, Card, CardTitle, Empty, Field, Input, Modal, NumInput, Page, Segmented, Select, TextArea, cx, fmt, toast,
} from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const PATTERNS: MovementPattern[] = [
  'horizontal_push', 'incline_push', 'vertical_push', 'chest_fly', 'horizontal_pull', 'vertical_pull', 'shoulder_abduction', 'rear_delt',
  'shrug', 'elbow_flexion', 'elbow_extension', 'wrist', 'squat', 'hinge', 'lunge', 'knee_extension', 'knee_flexion', 'hip_extension',
  'hip_adduction', 'hip_abduction', 'calf', 'core', 'back_extension', 'carry', 'other',
];
const KINDS: EquipmentKind[] = ['machine', 'plate_loaded', 'cable', 'smith', 'barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band', 'other'];
const COEFS = ['0', '0.25', '0.5', '0.75', '1'] as const;
const pretty = (s: string) => s.replace(/_/g, ' ');

export function ExercisesPage() {
  const a = useAnalysis();
  const data = useData();
  const names = useNames();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleId | ''>('');
  const [category, setCategory] = useState<'all' | 'compound' | 'isolation'>('all');
  const [kind, setKind] = useState<EquipmentKind | ''>('');
  const [pattern, setPattern] = useState<MovementPattern | ''>('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const usage = useMemo(() => {
    const m = new Map<string, { sessions: number; last: string | null; instances: number }>();
    for (const p of a.progression) {
      const u = m.get(p.exerciseId) ?? { sessions: 0, last: null, instances: 0 };
      u.sessions += p.sessions.length;
      u.instances += 1;
      const d = p.current?.date ?? null;
      if (d && (!u.last || d > u.last)) u.last = d;
      m.set(p.exerciseId, u);
    }
    return m;
  }, [a.progression]);

  const list = useMemo(() => {
    let defs: ExerciseDef[] = q.trim() ? searchExercises(a.registry, q, 200) : [...a.registry.values()].sort((x, y) => x.name.en.localeCompare(y.name.en));
    if (muscle) defs = defs.filter((d) => (d.contributions[muscle] ?? 0) > 0).sort((x, y) => (y.contributions[muscle] ?? 0) - (x.contributions[muscle] ?? 0));
    if (category !== 'all') defs = defs.filter((d) => d.category === category);
    if (kind) defs = defs.filter((d) => d.equipmentKind === kind);
    if (pattern) defs = defs.filter((d) => d.pattern === pattern);
    if (onlyMine) defs = defs.filter((d) => usage.has(d.id));
    return defs;
  }, [a.registry, q, muscle, category, kind, pattern, onlyMine, usage]);

  const overridden = new Set(data.exerciseOverrides.map((o) => o.id));
  const selected = open ? a.registry.get(open) : undefined;

  return (
    <Page
      title="Exercise database"
      subtitle={`${a.registry.size} exercises · fractional set coefficients · English & Russian names`}
      actions={<Button variant="primary" onClick={() => setCreating(true)}><IconPlus size={16} /> Custom exercise</Button>}
    >
      <Callout tone="info" icon={<IconInfo size={18} />} title="Coefficients: 1 direct · 0.5 secondary · 0.25 minor">Estimates, not activation measurements. Edits recalculate all history.</Callout>

      <Card>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: pulldown, жим лежа, pec deck…" className="pl-9" />
          </div>
          <Segmented value={category} onChange={setCategory} options={[{ value: 'all', label: 'All' }, { value: 'compound', label: 'Compound' }, { value: 'isolation', label: 'Isolation' }]} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleId | '')} aria-label="Filter by muscle">
            <option value="">Any muscle</option>
            {TRACKED_MUSCLES.map((m) => <option key={m} value={m}>{muscleName(m)} · {muscleName(m, 'ru')}</option>)}
          </Select>
          <Select value={pattern} onChange={(e) => setPattern(e.target.value as MovementPattern | '')} aria-label="Filter by movement pattern">
            <option value="">Any movement</option>
            {PATTERNS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}
          </Select>
          <Select value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind | '')} aria-label="Filter by equipment">
            <option value="">Any equipment</option>
            {KINDS.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}
          </Select>
          <button type="button" onClick={() => setOnlyMine(!onlyMine)}
            className={cx('h-10 rounded-xl border px-3 text-sm font-medium transition', onlyMine ? 'border-accent-500 bg-accent-500/10 text-accent-600 dark:text-accent-400' : 'border-ink-200 text-ink-600 dark:border-ink-700 dark:text-ink-300')}>
            {onlyMine ? '✓ ' : ''}Only exercises I've done
          </button>
        </div>
        <div className="mt-2 text-xs text-ink-500">{list.length} result{list.length === 1 ? '' : 's'}{muscle ? ` · sorted by ${muscleName(muscle).toLowerCase()} coefficient` : ''}</div>
      </Card>

      {list.length === 0 ? (
        <Empty title="No exercises match" action={<Button onClick={() => setCreating(true)}>Create a custom exercise</Button>}>Try a different spelling, or add it as a custom exercise.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((d) => {
            const u = usage.get(d.id);
            const entries = Object.entries(d.contributions).filter(([, c]) => (c ?? 0) > 0).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0)) as [MuscleId, number][];
            return (
              <button key={d.id} type="button" onClick={() => setOpen(d.id)}
                className="group flex w-full min-w-0 flex-col rounded-2xl border border-ink-200 bg-white p-4 text-left transition hover:border-accent-500/60 hover:shadow-md dark:border-ink-800 dark:bg-ink-900 dark:hover:border-accent-500/50">
                <div className="flex w-full min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-ink-900 dark:text-white">{d.name.en}</div>
                    <div className="truncate text-xs text-ink-500 dark:text-ink-400">{d.name.ru}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={d.category === 'compound' ? 'info' : 'neutral'}>{d.category}</Badge>
                    {d.custom && <Badge tone="violet">custom</Badge>}
                    {overridden.has(d.id) && <Badge tone="warn">edited</Badge>}
                  </div>
                </div>
                <div className="mt-3 flex w-full min-w-0 flex-wrap gap-1">
                  {entries.map(([m, c]) => (
                    <span key={m} className={cx('inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium',
                      involvement(c) === 'direct' ? 'bg-accent-500/15 text-accent-600 dark:text-accent-400' : involvement(c) === 'indirect' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-400')}>
                      {muscleName(m)} <span className="tabular-nums opacity-70">{c}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-[11px] text-ink-500 dark:text-ink-400">
                  <span>{pretty(d.equipmentKind)}</span>
                  <span>{d.repRange[0]}–{d.repRange[1]} reps</span>
                  <span>rest ~{Math.round(d.defaultRestSec / 15) * 15}s</span>
                  {u ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{u.sessions} session{u.sessions === 1 ? '' : 's'}</span> : null}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <ExerciseDetail
          key={selected.id}
          def={selected}
          seed={SEED_BY_ID[selected.id]}
          override={data.exerciseOverrides.find((o) => o.id === selected.id)}
          usage={usage.get(selected.id)}
          defaultRir={data.settings.defaultTargetRir}
          onClose={() => setOpen(null)}
          exName={names.ex}
        />
      )}
      {creating && <CustomExerciseForm onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpen(id); }} />}
    </Page>
  );
}

function ExerciseDetail({ def, seed, override, usage, defaultRir, onClose }: {
  def: ExerciseDef;
  seed?: ExerciseDef;
  override?: ExerciseOverride;
  usage?: { sessions: number; last: string | null; instances: number };
  defaultRir: number;
  onClose: () => void;
  exName: (d: ExerciseDef | undefined) => string;
}) {
  const a = useAnalysis();
  const names = useNames();
  const [coefs, setCoefs] = useState<Partial<Record<MuscleId, number>>>({ ...def.contributions });
  const [regions, setRegions] = useState<Partial<Record<RegionId, number>>>({ ...(def.regionEmphasis ?? {}) });
  const [repLo, setRepLo] = useState<number | null>(def.repRange[0]);
  const [repHi, setRepHi] = useState<number | null>(def.repRange[1]);
  const [rir, setRir] = useState<number | null>(override?.targetRir ?? defaultRir);
  const [rest, setRest] = useState<number | null>(def.defaultRestSec);
  const [notes, setNotes] = useState(override?.notes ?? '');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = showAll ? TRACKED_MUSCLES : TRACKED_MUSCLES.filter((m) => (coefs[m] ?? 0) > 0 || (def.contributions[m] ?? 0) > 0);
  const series = a.progression.filter((p) => p.exerciseId === def.id);
  const dirty = JSON.stringify(clean(coefs)) !== JSON.stringify(clean(def.contributions))
    || JSON.stringify(clean(regions)) !== JSON.stringify(clean(def.regionEmphasis ?? {}))
    || repLo !== def.repRange[0] || repHi !== def.repRange[1] || rest !== def.defaultRestSec
    || rir !== (override?.targetRir ?? defaultRir) || notes !== (override?.notes ?? '');

  const save = async () => {
    if (repLo == null || repHi == null || repLo < 1 || repHi < repLo) return toast('Rep range must be valid (low ≤ high)', 'bad');
    setBusy(true);
    try {
      await store.saveOverride({
        id: def.id,
        contributions: clean(coefs),
        regionEmphasis: clean(regions),
        repRange: [repLo, repHi],
        targetRir: rir ?? undefined,
        defaultRestSec: rest ?? undefined,
        notes: notes || undefined,
        updatedAt: new Date().toISOString(),
      });
      toast('Saved — historical volume recalculated');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset this exercise to its default coefficients and settings? Your history will be recalculated with the defaults.')) return;
    await store.deleteOverride(def.id);
    toast('Reset to default');
    onClose();
  };

  const removeCustom = async () => {
    const used = series.length > 0;
    if (!window.confirm(used ? 'This custom exercise has logged history. Deleting it makes those sets uncountable (they will show as an unknown exercise). Delete anyway?' : 'Delete this custom exercise?')) return;
    await store.deleteCustomExercise(def.id);
    if (override) await store.deleteOverride(def.id);
    toast('Custom exercise deleted');
    onClose();
  };

  return (
    <Modal open onClose={onClose} wide title={<span>{def.name.en} <span className="font-normal text-ink-500">· {def.name.ru}</span></span>}
      footer={<>
        {def.custom && <Button variant="danger" onClick={removeCustom} className="mr-auto">Delete</Button>}
        {override && <Button variant="ghost" onClick={reset} className={def.custom ? '' : 'mr-auto'}>Reset to default</Button>}
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={save} disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
      </>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="info">{def.category}</Badge>
          <Badge>{pretty(def.pattern)}</Badge>
          <Badge>{pretty(def.equipmentKind)}</Badge>
          {def.angleSensitive && <Badge tone="accent">bench-angle sensitive</Badge>}
          {def.custom && <Badge tone="violet">custom</Badge>}
          {override && <Badge tone="warn">edited {formatDate(override.updatedAt.slice(0, 10))}</Badge>}
        </div>

        <div>
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Biomechanics</h4>
          <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{def.biomechanics || 'No notes.'}</p>
          {def.angleSensitive && (
            <p className="mt-2 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
              When you record a bench angle, coefficients adapt automatically: decline (≤ −5°) → lower-chest emphasis and less front-delt work;
              flat → whole pec; 10–45° → upper-chest emphasis; above 45° → behaves more like an overhead press (chest 0.75, front delts 0.75).
            </p>
          )}
          {def.aliases.length > 0 && <p className="mt-2 text-xs text-ink-500">Also recognised as: {def.aliases.join(' · ')}</p>}
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-2xl bg-ink-50 p-3 text-center dark:bg-ink-950">
          <div><div className="text-[11px] uppercase tracking-wide text-ink-500">Sessions</div><div className="text-lg font-semibold tabular-nums">{usage?.sessions ?? 0}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-ink-500">Last used</div><div className="text-sm font-semibold">{usage?.last ? formatDate(usage.last) : '—'}</div></div>
          <div><div className="text-[11px] uppercase tracking-wide text-ink-500">Equipment</div><div className="text-lg font-semibold tabular-nums">{usage?.instances ?? 0}</div></div>
        </div>
        {series.length > 0 && (
          <div className="space-y-1">
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 rounded-xl border border-ink-100 px-3 py-2 text-xs dark:border-ink-800">
                <span className="truncate text-ink-700 dark:text-ink-200">{s.scopeLabel}</span>
                <span className="shrink-0 tabular-nums text-ink-500">
                  {s.current?.topWeight != null ? `${fmt(s.current.topWeight)} kg × ${s.current.topReps ?? '?'}` : '—'} · <TrendBadge cls={s.trend.cls} />
                </span>
              </div>
            ))}
            <p className="text-[11px] text-ink-500">Each machine keeps its own history — loads are never compared across equipment.</p>
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Muscle coefficients</h4>
            <button type="button" className="text-xs font-medium text-accent-600 hover:underline dark:text-accent-400" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show involved only' : 'Show all muscles'}
            </button>
          </div>
          <Callout tone="warn">Changing a coefficient recalculates the weekly volume of <b>all historical workouts</b> that used this exercise. Coefficients are practical estimates, not activation measurements.</Callout>
          <div className="mt-3 space-y-2">
            {visible.map((m) => {
              const changed = (coefs[m] ?? 0) !== ((seed ?? def).contributions[m] ?? 0);
              return (
                <div key={m} className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-800 dark:text-ink-100">{names.muscle(m)} {changed && <span className="text-[10px] text-amber-600 dark:text-amber-400">• changed</span>}</div>
                    <div className="text-[11px] text-ink-500">{MUSCLE_BY_ID[m].name.ru} · {labelFor(coefs[m] ?? 0)}</div>
                  </div>
                  <Segmented size="sm" value={String(coefs[m] ?? 0) as (typeof COEFS)[number]} onChange={(v) => setCoefs({ ...coefs, [m]: Number(v) })}
                    options={COEFS.map((c) => ({ value: c, label: c }))} />
                </div>
              );
            })}
          </div>
        </div>

        {(coefs.chest ?? 0) > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Pec regional emphasis</h4>
            <p className="mb-2 text-[11px] text-ink-500">Upper/lower chest are emphasis areas of the same muscle — tracked as a share of chest work, never added to the chest total.</p>
            {(['upper_chest', 'lower_chest'] as RegionId[]).map((r) => (
              <div key={r} className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink-800 dark:text-ink-100">{muscleName(r)}</span>
                <Segmented size="sm" value={String(regions[r] ?? 0) as (typeof COEFS)[number]} onChange={(v) => setRegions({ ...regions, [r]: Number(v) })}
                  options={(['0', '0.5', '1'] as const).map((c) => ({ value: c, label: c }))} />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Rep range low"><NumInput value={repLo} onChange={setRepLo} /></Field>
          <Field label="Rep range high"><NumInput value={repHi} onChange={setRepHi} /></Field>
          <Field label="Target RIR" hint="Used for double progression"><NumInput value={rir} onChange={setRir} /></Field>
          <Field label="Default rest (s)"><NumInput value={rest} onChange={setRest} /></Field>
        </div>
        <Field label="Personal notes (technique, cues, setup)">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="font-sans text-sm" placeholder="e.g. elbows ~45°, pause at chest" />
        </Field>
      </div>
    </Modal>
  );
}

function TrendBadge({ cls }: { cls: string }) {
  const tone = cls === 'progressing' ? 'good' : cls === 'declining' ? 'bad' : cls === 'plateau' ? 'warn' : cls === 'stable' ? 'info' : 'neutral';
  return <Badge tone={tone}>{cls.replace('_', ' ')}</Badge>;
}

function labelFor(c: number) {
  const i = involvement(c);
  return i === 'direct' ? 'direct' : i === 'indirect' ? 'significant secondary' : i === 'minor' ? 'minor' : 'not involved';
}

function clean<T extends string>(o: Partial<Record<T, number>>): Partial<Record<T, number>> {
  const out: Partial<Record<T, number>> = {};
  for (const k of Object.keys(o).sort() as T[]) if ((o[k] ?? 0) > 0) out[k] = o[k];
  return out;
}

function CustomExerciseForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [en, setEn] = useState('');
  const [ru, setRu] = useState('');
  const [aliases, setAliases] = useState('');
  const [pattern, setPattern] = useState<MovementPattern>('other');
  const [category, setCategory] = useState<'compound' | 'isolation'>('isolation');
  const [kind, setKind] = useState<EquipmentKind>('machine');
  const [coefs, setCoefs] = useState<Partial<Record<MuscleId, number>>>({});
  const [repLo, setRepLo] = useState<number | null>(8);
  const [repHi, setRepHi] = useState<number | null>(12);
  const [rest, setRest] = useState<number | null>(90);
  const [bio, setBio] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const primary = Object.values(coefs).some((c) => (c ?? 0) >= 0.75);

  const save = async () => {
    setErr(null);
    if (!en.trim()) return setErr('English name is required.');
    if (!primary) return setErr('Set at least one muscle as a direct target (0.75 or 1).');
    if (repLo == null || repHi == null || repLo < 1 || repHi < repLo) return setErr('Rep range must be valid.');
    const id = slugId(en, 'custom');
    await store.saveCustomExercise({
      id,
      name: { en: en.trim(), ru: ru.trim() || en.trim() },
      aliases: aliases.split(',').map((s) => s.trim()).filter(Boolean),
      pattern,
      category,
      equipmentKind: kind,
      contributions: clean(coefs),
      repRange: [repLo, repHi],
      defaultRestSec: rest ?? 90,
      biomechanics: bio.trim(),
      custom: true,
    });
    toast('Custom exercise created');
    onCreated(id);
  };

  return (
    <Modal open onClose={onClose} wide title="Create custom exercise"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Create</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name (English)"><Input value={en} onChange={(e) => setEn(e.target.value)} placeholder="e.g. Seated cable chest fly" /></Field>
          <Field label="Название (русский)"><Input value={ru} onChange={(e) => setRu(e.target.value)} placeholder="напр. Сведение рук сидя" /></Field>
        </div>
        <Field label="Aliases" hint="Comma-separated names Claude or you might use, in any language. Improves matching on import.">
          <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="seated fly, сведение сидя" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Movement pattern">
            <Select value={pattern} onChange={(e) => setPattern(e.target.value as MovementPattern)}>{PATTERNS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select>
          </Field>
          <Field label="Equipment type">
            <Select value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind)}>{KINDS.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}</Select>
          </Field>
          <Field label="Category">
            <Segmented value={category} onChange={setCategory} options={[{ value: 'compound', label: 'Compound' }, { value: 'isolation', label: 'Isolation' }]} />
          </Field>
        </div>
        <Card className="!p-3">
          <CardTitle hint="1.0 direct · 0.5 significant secondary · 0.25 minor. Leave uninvolved muscles at 0.">Muscle coefficients</CardTitle>
          <div className="space-y-2">
            {TRACKED_MUSCLES.map((m) => (
              <div key={m} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink-800 dark:text-ink-100">{muscleName(m)} <span className="text-[11px] text-ink-500">· {muscleName(m, 'ru')}</span></span>
                <Segmented size="sm" value={String(coefs[m] ?? 0) as (typeof COEFS)[number]} onChange={(v) => setCoefs({ ...coefs, [m]: Number(v) })}
                  options={COEFS.map((c) => ({ value: c, label: c }))} />
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Reps low"><NumInput value={repLo} onChange={setRepLo} /></Field>
          <Field label="Reps high"><NumInput value={repHi} onChange={setRepHi} /></Field>
          <Field label="Rest (s)"><NumInput value={rest} onChange={setRest} /></Field>
        </div>
        <Field label="Biomechanics notes"><TextArea value={bio} onChange={(e) => setBio(e.target.value)} className="font-sans text-sm" placeholder="Which joint actions, where it is hardest, what changes emphasis…" /></Field>
        {err && <p className="text-sm text-rose-600 dark:text-rose-400">{err}</p>}
      </div>
    </Modal>
  );
}
