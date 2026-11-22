/**
 * "Add body weight" — weight, measurement date + time (pre-filled with now, editable), optional
 * condition and note. The entry time is stored separately; analysis uses the measurement time.
 * Typed values are kept as an encrypted draft until saved or cancelled (leaving, reload, lock).
 * With `entry`, the same sheet corrects an existing entry (weight, date, time, condition, note and,
 * via `extraFields`, its circumferences) — nothing else on the record changes.
 */
import { useState } from 'react';
import { isDuplicateWeighIn } from '../../domain/bodyweight';
import { localNowParts } from '../../domain/dates';
import type { BodyMeasurement } from '../../domain/types';
import { uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { useDraftSync } from '../hooks';
import { Button, cx, Field, Input, Modal, NumInput, toast } from './ui';

const CONDITIONS: [NonNullable<BodyMeasurement['condition']>, string][] = [
  ['morning_fasted', 'Morning, fasted'], ['after_breakfast', 'After breakfast'], ['before_workout', 'Before workout'], ['after_workout', 'After workout'], ['evening', 'Evening'],
];
const DRAFT = 'bodyweight:new';

type ExtraKey = 'waistCm' | 'chestCm' | 'shouldersCm' | 'armsCm' | 'forearmsCm' | 'thighsCm' | 'calvesCm';
interface Form { kg: number | null; date: string; time: string; condition: BodyMeasurement['condition']; note: string; extra: Partial<Record<ExtraKey, number | null>> }

type Props = {
  open: boolean; onClose: () => void; entry?: BodyMeasurement | null;
  extraFields?: { key: ExtraKey; label: string; unit: string; step: number }[];
};

/** Mounted only while open, so the form starts with its values in place (no reset after the first paint). */
export function AddBodyWeight(p: Props) {
  return p.open ? <AddBodyWeightSheet key={p.entry?.id ?? 'new'} {...p} /> : null;
}

function AddBodyWeightSheet({ open, onClose, entry, extraFields = [] }: Props) {
  const data = useData();
  const editing = !!entry;
  const fresh = (): Form => {
    const now = localNowParts(data.settings.timezone);
    const last = [...data.body].reverse().find((b) => b.weightKg != null);
    return { kg: last?.weightKg ?? null, date: now.date, time: now.time, condition: null, note: '', extra: {} };
  };
  const [initial] = useState(() => {
    if (entry) return { form: { kg: entry.weightKg ?? null, date: entry.date, time: entry.time ?? '', condition: entry.condition ?? null, note: entry.notes ?? '',
      extra: Object.fromEntries(extraFields.map((x) => [x.key, entry[x.key] ?? null])) } as Form, restored: false };
    const d = store.getDraft<Form>(DRAFT);
    return { form: d ?? fresh(), restored: !!d };
  });
  const [f, setF] = useState<Form>(initial.form);
  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(initial.restored);
  const [busy, setBusy] = useState(false);
  const clearDraft = useDraftSync(editing ? null : DRAFT, f, dirty);
  const edit = (p: Partial<Form>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };

  const save = async () => {
    if (busy) return;
    const { kg, date, time } = f;
    const anyExtra = Object.values(f.extra).some((v) => v != null);
    if ((kg == null && !(editing && anyExtra)) || (kg != null && (kg < 25 || kg > 400))) return toast('Enter your weight in kg', 'bad');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return toast('Pick the date you weighed yourself', 'bad');
    if (date > localNowParts(data.settings.timezone).date) return toast('That date is in the future', 'bad');
    const t = /^\d{2}:\d{2}$/.test(time) ? time : null;
    const kgR = kg == null ? null : Math.round(kg * 10) / 10; // stored rounded → compare rounded
    if (!editing && kgR != null && isDuplicateWeighIn(data.body, kgR, date, t)) return toast('Already saved for this time', 'bad');
    setBusy(true);
    try {
      if (entry) {
        const next: BodyMeasurement = { ...entry, date, time: t, condition: f.condition ?? null, weightKg: kgR, notes: f.note.trim() || undefined };
        for (const x of extraFields) next[x.key] = f.extra[x.key] ?? null;
        await store.saveBody(next);
        toast(`Entry updated${kgR != null ? ` · ${kgR} kg` : ''} · ${date} ${t ?? ''}`);
      } else {
        await store.saveBody({ id: uid('bm'), date, time: t, enteredAt: new Date().toISOString(), condition: f.condition ?? null, weightKg: kgR, photoIds: [], notes: f.note.trim() || undefined });
        clearDraft();
        toast(`Saved ${kgR} kg · ${date} ${t ?? ''}`);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };
  /** Cancel = discard what was typed (closing with ✕ or Back keeps it as a draft). */
  const cancel = () => { if (!editing) clearDraft(); setRestored(false); onClose(); };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit entry' : 'Add body weight'} footer={<><Button variant="ghost" onClick={cancel}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy || (f.kg == null && !editing)}>Save</Button></>}>
      <div className="grid grid-cols-1 gap-3">
        {restored && (
          <p className="flex items-center justify-between gap-2 rounded-lg bg-accent-500/10 px-3 py-1.5 text-xs text-accent-700 dark:text-accent-300" data-testid="draft-restored">
            <span>Unsaved entry restored.</span>
            <button type="button" className="min-h-[36px] px-2 font-semibold" onClick={() => { clearDraft(); setRestored(false); setF(fresh()); setDirty(false); }}>Discard</button>
          </p>
        )}
        <Field label="Weight (kg)"><NumInput value={f.kg} onChange={(v) => edit({ kg: v })} step={0.1} placeholder="e.g. 82.4" aria-label="Body weight in kg" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Measured on"><Input type="date" value={f.date} onChange={(e) => edit({ date: e.target.value })} /></Field>
          <Field label="at"><Input type="time" value={f.time} onChange={(e) => edit({ time: e.target.value })} /></Field>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">Condition <span className="font-normal text-ink-400">(optional)</span></div>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={f.condition === v} onClick={() => edit({ condition: f.condition === v ? null : v })}
                className={cx('h-11 rounded-full px-3.5 text-[13px] font-medium', f.condition === v ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{l}</button>
            ))}
          </div>
        </div>
        {editing && extraFields.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {extraFields.map((x) => (
              <Field key={x.key} label={`${x.label} (${x.unit})`}><NumInput value={f.extra[x.key] ?? null} onChange={(v) => edit({ extra: { ...f.extra, [x.key]: v } })} step={x.step} /></Field>
            ))}
          </div>
        )}
        <Field label="Note (optional)"><Input value={f.note} onChange={(e) => edit({ note: e.target.value })} placeholder="Optional" /></Field>
        <p className="text-[11px] text-ink-500">Set the time you actually weighed yourself — workouts use the latest weigh-in taken before they started.</p>
      </div>
    </Modal>
  );
}
