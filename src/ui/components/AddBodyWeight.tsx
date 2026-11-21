/**
 * "Add body weight" — weight, measurement date + time (pre-filled with now, editable), optional
 * condition and note. The entry time is stored separately; analysis uses the measurement time.
 */
import { useEffect, useState } from 'react';
import { isDuplicateWeighIn } from '../../domain/bodyweight';
import { localNowParts } from '../../domain/dates';
import type { BodyMeasurement } from '../../domain/types';
import { uid } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { Button, cx, Field, Input, Modal, NumInput, toast } from './ui';

const CONDITIONS: [NonNullable<BodyMeasurement['condition']>, string][] = [
  ['morning_fasted', 'Morning, fasted'], ['after_breakfast', 'After breakfast'], ['before_workout', 'Before workout'], ['after_workout', 'After workout'], ['evening', 'Evening'],
];

export function AddBodyWeight({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const [kg, setKg] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [condition, setCondition] = useState<BodyMeasurement['condition']>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const now = localNowParts(data.settings.timezone);
    setDate(now.date); setTime(now.time); setCondition(null); setNote('');
    const last = [...data.body].reverse().find((b) => b.weightKg != null);
    setKg(last?.weightKg ?? null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (busy) return;
    if (kg == null || kg < 25 || kg > 400) return toast('Enter your weight in kg', 'bad');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return toast('Pick the date you weighed yourself', 'bad');
    if (date > localNowParts(data.settings.timezone).date) return toast('That date is in the future', 'bad');
    const t = /^\d{2}:\d{2}$/.test(time) ? time : null;
    const kgR = Math.round(kg * 10) / 10; // stored rounded → compare rounded
    if (isDuplicateWeighIn(data.body, kgR, date, t)) return toast('Already saved for this time', 'bad');
    setBusy(true);
    try {
      await store.saveBody({ id: uid('bm'), date, time: t, enteredAt: new Date().toISOString(), condition: condition ?? null, weightKg: kgR, photoIds: [], notes: note.trim() || undefined });
      toast(`Saved ${kgR} kg · ${date} ${t ?? ''}`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add body weight" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy || kg == null}>Save</Button></>}>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Weight (kg)"><NumInput value={kg} onChange={setKg} step={0.1} placeholder="e.g. 82.4" aria-label="Body weight in kg" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Measured on"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="at"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">Condition <span className="font-normal text-ink-400">(optional)</span></div>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={condition === v} onClick={() => setCondition(condition === v ? null : v)}
                className={cx('h-10 rounded-full px-3 text-[13px] font-medium', condition === v ? 'bg-accent-500 text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300')}>{l}</button>
            ))}
          </div>
        </div>
        <Field label="Note (optional)"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
        <p className="text-[11px] text-ink-500">Set the time you actually weighed yourself — workouts use the latest weigh-in taken before they started.</p>
      </div>
    </Modal>
  );
}
