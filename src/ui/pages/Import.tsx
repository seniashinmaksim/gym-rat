import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate } from '../../domain/dates';
import { variationParts } from '../../domain/progression';
import { countedSetCount } from '../../domain/quality';
import { loadUnitLabel } from '../../domain/registry';
import { buildDraft, draftBlockers, IMPORT_SCHEMA_ID, IMPORT_SCHEMA_VERSION, parseImportJson, type ImportDraft } from '../../domain/importer';
import type { Equipment, Location } from '../../domain/types';
import { slugId, uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { IconAlert, IconCheck, IconCopy, IconImport } from '../components/icons';
import { Badge, Button, Callout, Card, CardTitle, cx, Field, fmt, Input, Page, Select, TextArea, toast, Why } from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const EXAMPLE = `{
  "schema": "${IMPORT_SCHEMA_ID}",
  "schema_version": "${IMPORT_SCHEMA_VERSION}",
  "workouts": [{
    "date": "2026-11-21",
    "location": { "location_id": "gym_a", "name_hint": "Gym A", "confidence": "confirmed" },
    "exercises": [{
      "exercise_id": "incline_chest_press",
      "exercise_name_raw": "Incline chest press",
      "equipment": { "equipment_id": null, "name_hint": "incline press machine", "confidence": "unknown" },
      "sets": [
        { "type": "working", "weight_kg": 45, "reps": 10, "rir": null },
        { "type": "working", "weight_kg": 45, "reps": 10, "rir": null },
        { "type": "working", "weight_kg": 45, "reps": 10, "rir": 2 }
      ]
    }],
    "raw_input": "Today I trained at Gym A. Incline chest press: 3 sets of 10 reps at 45 kg…",
    "uncertainties": ["Machine not identified"]
  }]
}`;

export function ImportPage() {
  const data = useData();
  const a = useAnalysis();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [busy, setBusy] = useState(false);

  const validate = async (src = text) => {
    setErrors([]);
    setDrafts([]);
    const r = parseImportJson(src);
    if (!r.ok) {
      setErrors(r.errors.length ? r.errors : ['No workouts found.']);
      return;
    }
    setBusy(true);
    try {
      setDrafts(await Promise.all(r.workouts.map((w) => buildDraft(w, data, a.registry))));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const t = await f.text();
    setText(t);
    void validate(t);
  };

  const saveAll = async () => {
    setBusy(true);
    try {
      let saved = 0;
      for (const d of drafts) {
        if (draftBlockers(d).length) continue;
        await store.saveWorkout(d.workout);
        await store.addImportLog({ id: uid('imp'), hash: d.hash, workoutId: d.workout.id, importedAt: new Date().toISOString(), source: 'claude_import' });
        // Remember confirmed exercise ↔ machine links for future matching.
        for (const e of d.workout.exercises) {
          if (!e.equipmentId) continue;
          const eq = data.equipment.find((q) => q.id === e.equipmentId);
          if (eq && !eq.exerciseIds.includes(e.exerciseId)) await store.saveEquipment({ ...eq, exerciseIds: [...eq.exerciseIds, e.exerciseId] });
        }
        saved++;
      }
      if (!data.settings.learning.startDate && drafts.length) {
        const first = drafts.map((d) => d.workout.date).sort()[0];
        await store.saveSettings({ learning: { ...data.settings.learning, startDate: first } });
      }
      toast(`${saved} workout${saved === 1 ? '' : 's'} imported`);
      setDrafts([]);
      setText('');
      if (saved) nav('/');
    } finally {
      setBusy(false);
    }
  };

  const blocked = drafts.some((d) => draftBlockers(d).length > 0);

  return (
    <Page title="Import from Claude" subtitle="Paste the JSON Claude generated from your workout description. You review and correct everything before it's saved.">
      {!drafts.length && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste JSON here (```json fences are fine)…" className="min-h-[260px]" spellCheck={false} />
            {errors.length > 0 && (
              <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">
                <div className="mb-1 font-semibold">The JSON doesn't match the schema:</div>
                <ul className="list-disc space-y-0.5 pl-4 font-mono">{errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => validate()} disabled={!text.trim() || busy}><IconImport size={16} />Validate & review</Button>
              <label className="inline-flex h-10 cursor-pointer items-center rounded-xl bg-ink-100 px-4 text-sm font-medium text-ink-800 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-100">
                Open file<input type="file" accept=".json,application/json,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              <Button variant="ghost" onClick={async () => { try { setText(await navigator.clipboard.readText()); } catch { toast('Clipboard not available', 'bad'); } }}>Paste from clipboard</Button>
            </div>
          </Card>
          <Card>
            <CardTitle hint="Schema gymrat.workout v1.0. Details in WORKOUT_PARSING.md and CLAUDE.md.">How it works</CardTitle>
            <ol className="list-decimal space-y-1.5 pl-4 text-sm text-ink-600 dark:text-ink-300">
              <li>Tell Claude about your workout in plain words (English or Russian).</li>
              <li>Claude follows <code className="text-xs">CLAUDE.md</code> and returns JSON. Missing info stays <code className="text-xs">null</code>; nothing is made up.</li>
              <li>Paste it here. Unknown gyms, exercises and machines are flagged for you to match.</li>
              <li>Duplicates are blocked automatically.</li>
            </ol>
            <Why label="Show an example">
              <pre className="overflow-x-auto whitespace-pre text-[10px] leading-snug">{EXAMPLE}</pre>
              <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(EXAMPLE); toast('Example copied', 'info'); }}><IconCopy size={14} />Copy</Button>
            </Why>
            <Why label="Your gym & machine ids (for Claude)">
              <p>Share these ids with Claude so it can match equipment. They contain no training data.</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[10px] leading-snug">{idDirectory(data.locations, data.equipment)}</pre>
              <Button size="sm" onClick={() => { void navigator.clipboard?.writeText(idDirectory(data.locations, data.equipment)); toast('Copied', 'info'); }}><IconCopy size={14} />Copy</Button>
            </Why>
          </Card>
        </div>
      )}

      {drafts.map((d, i) => <DraftCard key={d.key} draft={d} onChange={(nd) => setDrafts((x) => x.map((y, j) => (j === i ? nd : y)))} onRemove={() => setDrafts((x) => x.filter((_, j) => j !== i))} />)}

      {drafts.length > 0 && (
        <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-ink-800 dark:bg-ink-900/95 lg:bottom-4">
          <span className="text-sm text-ink-600 dark:text-ink-300">{blocked ? 'Resolve the red items before saving.' : `${drafts.length} workout${drafts.length === 1 ? '' : 's'} ready.`}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDrafts([])}>Cancel</Button>
            <Button variant="primary" onClick={saveAll} disabled={busy || drafts.every((d) => draftBlockers(d).length > 0)}><IconCheck size={16} />Save {blocked ? 'valid ones' : 'all'}</Button>
          </div>
        </div>
      )}
    </Page>
  );
}

function idDirectory(locations: Location[], equipment: Equipment[]): string {
  const lines: string[] = [];
  for (const l of locations) {
    lines.push(`${l.id}: ${l.name}`);
    for (const e of equipment.filter((q) => q.locationId === l.id)) lines.push(`  ${e.id}: ${e.name}${e.manufacturer ? ` (${e.manufacturer}${e.model ? ` ${e.model}` : ''})` : ''} [${e.kind}] exercises: ${e.exerciseIds.join(', ') || '—'}`);
  }
  const loose = equipment.filter((q) => !q.locationId);
  if (loose.length) lines.push('no location:', ...loose.map((e) => `  ${e.id}: ${e.name}`));
  return lines.join('\n') || 'No gyms or machines saved yet.';
}

function DraftCard({ draft, onChange, onRemove }: { draft: ImportDraft; onChange: (d: ImportDraft) => void; onRemove: () => void }) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const [newGym, setNewGym] = useState(draft.locationHint ?? '');
  const w = draft.workout;
  const blockers = draftBlockers(draft);

  const patchW = (patch: Partial<typeof w>) => onChange({ ...draft, workout: { ...w, ...patch } });
  const patchEx = (i: number, patch: Partial<(typeof w.exercises)[number]>) =>
    onChange({ ...draft, workout: { ...w, exercises: w.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) } });

  const createGym = async () => {
    if (!newGym.trim()) return;
    const l: Location = { id: slugId(newGym, 'gym'), name: newGym.trim(), photoIds: [], createdAt: new Date().toISOString() };
    await store.saveLocation(l);
    patchW({ locationId: l.id, locationConfidence: 'confirmed' });
    toast('Gym created');
  };

  const createMachine = async (i: number) => {
    const ex = w.exercises[i];
    const hint = draft.exercises[i]?.equipmentHint;
    const def = a.registry.get(ex.exerciseId);
    const ts = new Date().toISOString();
    const name = hint?.name || `${def?.name.en ?? 'Machine'}${w.locationId ? ` — ${data.locations.find((l) => l.id === w.locationId)?.name ?? ''}` : ''}`;
    const e: Equipment = {
      id: slugId(name, 'eq'), locationId: w.locationId, name, kind: (hint?.kind as Equipment['kind']) ?? def?.equipmentKind ?? 'machine',
      manufacturer: hint?.manufacturer ?? null, model: hint?.model ?? null, identified: !!hint?.manufacturer,
      incrementsKg: [], settings: { ...(ex.settings ?? {}) }, exerciseIds: def ? [def.id] : [], photoIds: [], createdAt: ts, updatedAt: ts,
    };
    await store.saveEquipment(e);
    patchEx(i, { equipmentId: e.id, equipmentConfidence: 'confirmed' });
    toast(e.identified ? 'Machine created' : 'Saved as unidentified machine');
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{formatDate(w.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>
          <p className="text-xs text-ink-500">{w.exercises.length} exercises · {w.exercises.reduce((s, e) => s + countedSetCount(e.sets), 0)} working sets{w.startTime ? ` · ${w.startTime}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {blockers.length ? <Badge tone="bad">{blockers.length} to resolve</Badge> : <Badge tone="good">Ready</Badge>}
          <Button size="sm" variant="ghost" onClick={onRemove}>Discard</Button>
        </div>
      </div>

      {draft.issues.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {draft.issues.map((is, k) => (
            <div key={k} className={cx('flex gap-2 rounded-lg px-3 py-1.5 text-xs', is.level === 'error' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : is.level === 'warning' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>
              <IconAlert size={14} className="mt-0.5 shrink-0" /><span><span className="font-mono opacity-60">{is.path}</span> — {is.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950 sm:grid-cols-3">
        <Field label="Date"><Input type="date" value={w.date} onChange={(e) => patchW({ date: e.target.value })} /></Field>
        <Field label={<span>Gym {w.locationId ? <Badge tone={w.locationConfidence === 'confirmed' ? 'good' : 'warn'}>{w.locationConfidence}</Badge> : <Badge tone="warn">unknown</Badge>}</span>}>
          <Select value={w.locationId ?? ''} onChange={(e) => patchW({ locationId: e.target.value || null, locationConfidence: e.target.value ? 'confirmed' : 'unknown' })}>
            <option value="">Unknown gym</option>
            {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}{draft.locationSuggestions.includes(l.id) ? ' (suggested)' : ''}</option>)}
          </Select>
        </Field>
        {!w.locationId && (
          <Field label="…or create gym"><div className="flex gap-2"><Input value={newGym} onChange={(e) => setNewGym(e.target.value)} placeholder="Gym name" /><Button onClick={createGym} disabled={!newGym.trim()}>Add</Button></div></Field>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {w.exercises.map((ex, i) => {
          const res = draft.exercises[i];
          const def = a.registry.get(ex.exerciseId);
          const unresolved = ex.exerciseId.startsWith('unresolved:');
          const eqChoices = data.equipment.filter((q) => !w.locationId || q.locationId === w.locationId || q.locationId == null);
          return (
            <div key={ex.id} className={cx('rounded-xl border p-3', unresolved ? 'border-rose-500/50' : 'border-ink-200 dark:border-ink-800')}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field label={<span>Exercise {draft.input.exercises[i]?.exercise_name_raw && <span className="font-normal text-ink-400">· “{res.rawName}”</span>}</span>}>
                  <Select value={unresolved ? '' : ex.exerciseId} onChange={(e) => patchEx(i, { exerciseId: e.target.value, exerciseConfidence: 'confirmed' })} className={cx(unresolved && 'border-rose-500')}>
                    <option value="">{unresolved ? 'Choose the matching exercise…' : '—'}</option>
                    {res?.exerciseSuggestions.length ? <optgroup label="Suggestions">{res.exerciseSuggestions.map((id) => <option key={id} value={id}>{names.ex(a.registry.get(id), id)}</option>)}</optgroup> : null}
                    <optgroup label="All exercises">{[...a.registry.values()].map((d) => <option key={d.id} value={d.id}>{names.ex(d)}</option>)}</optgroup>
                  </Select>
                </Field>
                <Field label={<span>Machine / equipment {ex.equipmentId ? <Badge tone={ex.equipmentConfidence === 'confirmed' ? 'good' : 'warn'}>{ex.equipmentConfidence}</Badge> : null}</span>}>
                  <div className="flex gap-2">
                    <Select value={ex.equipmentId ?? ''} onChange={(e) => patchEx(i, { equipmentId: e.target.value || null, equipmentConfidence: e.target.value ? 'confirmed' : 'unknown' })}>
                      <option value="">Not identified / free weights</option>
                      {eqChoices.map((q) => <option key={q.id} value={q.id}>{q.name}{res?.equipmentSuggestions.includes(q.id) ? ' (suggested)' : ''}</option>)}
                    </Select>
                    {!ex.equipmentId && def && ['machine', 'cable', 'plate_loaded', 'smith'].includes(def.equipmentKind) && <Button onClick={() => createMachine(i)} title="Create a new equipment record">New</Button>}
                  </div>
                </Field>
              </div>
              {res?.equipmentHint && (res.equipmentHint.name || res.equipmentHint.manufacturer) && (
                <p className="mt-1 text-[11px] text-ink-500">Claude's hint: {[res.equipmentHint.name, res.equipmentHint.manufacturer, res.equipmentHint.model].filter(Boolean).join(' · ')}</p>
              )}
              <div className="scroll-x mt-2">
                {(() => { const parts = variationParts(ex.variation, def); return parts.length ? <p className="mb-1 text-[11px] text-ink-500">Variation: {parts.map((p) => p.label).join(' · ')}</p> : null; })()}
                <table className="w-full min-w-[420px] text-xs tabular-nums">
                  <thead><tr className="text-left text-[10px] uppercase tracking-wider text-ink-400"><th className="py-1">Type</th><th>{loadUnitLabel(def, ex.sets[0]?.loadMode)}</th><th>Reps</th><th>RIR</th><th>Rest</th><th /></tr></thead>
                  <tbody>
                    {ex.sets.map((s, k) => (
                      <tr key={s.id} className="border-t border-ink-100 dark:border-ink-800">
                        <td className="py-1"><select className="bg-transparent" value={s.type} onChange={(e) => patchEx(i, { sets: ex.sets.map((x, j) => (j === k ? { ...x, type: e.target.value as typeof s.type } : x)) })}><option value="working">working</option><option value="warmup">warm-up</option><option value="drop">drop</option></select>{s.side ? <span className="ml-1 font-semibold text-ink-500">{s.side === 'left' ? 'L' : 'R'}</span> : null}</td>
                        <td><CellNum v={s.weightKg} on={(v) => patchEx(i, { sets: ex.sets.map((x, j) => (j === k ? { ...x, weightKg: v } : x)) })} /></td>
                        <td><CellNum v={s.reps} on={(v) => patchEx(i, { sets: ex.sets.map((x, j) => (j === k ? { ...x, reps: v == null ? null : Math.round(v) } : x)) })} /></td>
                        <td><CellNum v={s.rir} on={(v) => patchEx(i, { sets: ex.sets.map((x, j) => (j === k ? { ...x, rir: v, rirSource: v == null ? 'unknown' : 'reported' } : x)) })} /></td>
                        <td className="text-ink-500">{s.restSecBefore != null ? `${s.restSecBefore}s` : '—'}</td>
                        <td className="text-right"><button className="text-ink-400 hover:text-rose-500" onClick={() => patchEx(i, { sets: ex.sets.filter((_, j) => j !== k) })}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {(w.rawInput || w.uncertainties?.length) && (
        <div className="mt-4">
          <Why label="Original message & uncertainties">
            {w.uncertainties?.map((u, i) => <p key={i}>• {u}</p>)}
            {w.rawInput && <p className="whitespace-pre-wrap italic">{w.rawInput}</p>}
            <p className="text-ink-400">The original message is stored only in your encrypted vault.</p>
          </Why>
        </div>
      )}
      <PreviewVolume draft={draft} />
    </Card>
  );
}

function CellNum({ v, on }: { v: number | null; on: (v: number | null) => void }) {
  return <input inputMode="decimal" className="w-14 rounded bg-transparent px-1 py-0.5 outline-none focus:bg-ink-100 dark:focus:bg-ink-800" value={v ?? ''} placeholder="—"
    onChange={(e) => { const t = e.target.value.replace(',', '.'); on(t === '' ? null : Number.isFinite(Number(t)) ? Number(t) : v); }} />;
}

function PreviewVolume({ draft }: { draft: ImportDraft }) {
  const a = useAnalysis();
  const names = useNames();
  const data = useData();
  const contrib: Record<string, number> = {};
  for (const ex of draft.workout.exercises) {
    const def = a.registry.get(ex.exerciseId);
    if (!def) continue;
    for (const s of ex.sets) {
      if (s.type === 'warmup') continue;
      const rir = s.rir ?? null;
      const credit = rir == null ? data.settings.quality.unknownRirCredit : data.settings.quality.rirCredit[Math.min(Math.round(rir), data.settings.quality.rirCredit.length - 1)];
      for (const [m, c] of Object.entries(def.contributions)) contrib[m] = (contrib[m] ?? 0) + (c ?? 0) * credit;
    }
  }
  const rows = Object.entries(contrib).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
  if (!rows.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-3 dark:border-ink-800">
      <span className="text-xs text-ink-500">Adds approx.:</span>
      {rows.map(([m, v]) => <Badge key={m} tone="accent">{names.muscle(m as never)} +{fmt(v)}</Badge>)}
    </div>
  );
}

export { Callout };
