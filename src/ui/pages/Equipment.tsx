import { useMemo, useState } from 'react';
import { formatDate } from '../../domain/dates';
import { searchExercises } from '../../domain/registry';
import type { Equipment, EquipmentKind, Location } from '../../domain/types';
import { slugId } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { IconAlert, IconEdit, IconMachine, IconMapPin, IconPlus, IconSearch, IconTrash, IconX } from '../components/icons';
import { PhotoGrid } from '../components/PhotoGrid';
import {
  Badge, Button, Callout, Card, CardTitle, Empty, Field, Input, Modal, NumInput, Page, Select, Table, Td, TextArea, cx, fmt, toast,
} from '../components/ui';
import { useAnalysis, useNames } from '../hooks';

const KINDS: EquipmentKind[] = ['machine', 'plate_loaded', 'cable', 'smith', 'barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band', 'other'];
const pretty = (s: string) => s.replace(/_/g, ' ');
const UNASSIGNED = '__none__';

export function EquipmentPage() {
  const data = useData();
  const names = useNames();
  const a = useAnalysis();
  const [locForm, setLocForm] = useState<Location | 'new' | null>(null);
  const [eqForm, setEqForm] = useState<{ eq: Equipment | null; locationId: string | null } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const byLoc = new Map<string, Equipment[]>();
    for (const e of data.equipment) {
      const k = e.locationId && data.locations.some((l) => l.id === e.locationId) ? e.locationId : UNASSIGNED;
      const arr = byLoc.get(k) ?? [];
      arr.push(e);
      byLoc.set(k, arr);
    }
    for (const arr of byLoc.values()) arr.sort((x, y) => x.name.localeCompare(y.name));
    return byLoc;
  }, [data.equipment, data.locations]);

  const sessionsAt = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of data.workouts) if (w.locationId) m.set(w.locationId, (m.get(w.locationId) ?? 0) + 1);
    return m;
  }, [data.workouts]);

  const sessionsOnEq = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of a.progression) if (p.equipmentId) m.set(p.equipmentId, (m.get(p.equipmentId) ?? 0) + p.sessions.length);
    return m;
  }, [a.progression]);

  const match = (e: Equipment) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [e.name, e.manufacturer, e.model, e.kind, ...e.exerciseIds.map((id) => a.registry.get(id)?.name.en ?? '')].some((x) => x?.toLowerCase().includes(s));
  };

  const unidentified = data.equipment.filter((e) => !e.identified).length;
  const sortedLocs = [...data.locations].sort((x, y) => (sessionsAt.get(y.id) ?? 0) - (sessionsAt.get(x.id) ?? 0) || x.name.localeCompare(y.name));
  const detailEq = detail ? data.equipment.find((e) => e.id === detail) : undefined;

  return (
    <Page
      title="Equipment & gyms"
      subtitle={`${data.locations.length} gym${data.locations.length === 1 ? '' : 's'} · ${data.equipment.length} equipment instance${data.equipment.length === 1 ? '' : 's'}${unidentified ? ` · ${unidentified} to identify` : ''}`}
      actions={<>
        <Button onClick={() => setLocForm('new')}><IconMapPin size={16} /> Add gym</Button>
        <Button variant="primary" onClick={() => setEqForm({ eq: null, locationId: data.locations[0]?.id ?? null })}><IconPlus size={16} /> Add equipment</Button>
      </>}
    >
      <Callout tone="info" icon={<IconMachine size={18} />} title="Every physical machine is tracked separately">
        50 kg on one cable stack is not 50 kg on another — pulley ratios, cams and friction differ. Each machine keeps its own progression history, increments and settings.
        If you don't know the make or model, save it anyway and identify it later.
      </Callout>

      {data.equipment.length > 0 && (
        <div className="relative max-w-md">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find equipment, brand or exercise…" className="pl-9" />
        </div>
      )}

      {data.locations.length === 0 && data.equipment.length === 0 ? (
        <Empty title="No gyms yet" action={<Button variant="primary" onClick={() => setLocForm('new')}><IconMapPin size={16} /> Add your first gym</Button>}>
          Add the gyms you train at, then the machines you use there. Claude can also create equipment records when you import a workout.
        </Empty>
      ) : (
        <div className="space-y-5">
          {sortedLocs.map((l) => (
            <LocationCard key={l.id} loc={l} sessions={sessionsAt.get(l.id) ?? 0} equipment={(groups.get(l.id) ?? []).filter(match)}
              totalEq={(groups.get(l.id) ?? []).length} sessionsOnEq={sessionsOnEq} exName={(id) => names.ex(a.registry.get(id), id)}
              onEdit={() => setLocForm(l)} onAddEq={() => setEqForm({ eq: null, locationId: l.id })} onOpen={setDetail} />
          ))}
          {(groups.get(UNASSIGNED)?.length ?? 0) > 0 && (
            <LocationCard loc={null} sessions={0} equipment={(groups.get(UNASSIGNED) ?? []).filter(match)} totalEq={(groups.get(UNASSIGNED) ?? []).length}
              sessionsOnEq={sessionsOnEq} exName={(id) => names.ex(a.registry.get(id), id)} onOpen={setDetail}
              onAddEq={() => setEqForm({ eq: null, locationId: null })} />
          )}
        </div>
      )}

      {locForm && <LocationForm loc={locForm === 'new' ? null : locForm} onClose={() => setLocForm(null)} />}
      {eqForm && <EquipmentForm eq={eqForm.eq} defaultLocation={eqForm.locationId} onClose={() => setEqForm(null)} onSaved={(id) => { setEqForm(null); setDetail(id); }} />}
      {detailEq && <EquipmentDetail eq={detailEq} onClose={() => setDetail(null)} onEdit={() => { setEqForm({ eq: detailEq, locationId: detailEq.locationId }); setDetail(null); }} />}
    </Page>
  );
}

function LocationCard({ loc, sessions, equipment, totalEq, sessionsOnEq, exName, onEdit, onAddEq, onOpen }: {
  loc: Location | null;
  sessions: number;
  equipment: Equipment[];
  totalEq: number;
  sessionsOnEq: Map<string, number>;
  exName: (id: string) => string;
  onEdit?: () => void;
  onAddEq: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 p-4 dark:border-ink-800 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', loc ? 'bg-accent-500/15 text-accent-600 dark:text-accent-400' : 'bg-ink-100 text-ink-500 dark:bg-ink-800')}>
            {loc ? <IconMapPin size={20} /> : <IconAlert size={20} />}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-ink-900 dark:text-white">{loc ? loc.name : 'Unassigned equipment'}</h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {loc ? <>{loc.address ? `${loc.address} · ` : ''}{sessions} session{sessions === 1 ? '' : 's'} · {totalEq} item{totalEq === 1 ? '' : 's'} · id <code className="text-[10px]">{loc.id}</code></> : 'Not linked to a gym — assign a location so Claude can match it.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {onEdit && <Button size="sm" variant="ghost" onClick={onEdit}><IconEdit size={14} /> Edit gym</Button>}
          <Button size="sm" onClick={onAddEq}><IconPlus size={14} /> Equipment</Button>
        </div>
      </div>
      {loc && loc.photoIds.length > 0 && <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800 sm:px-5"><PhotoGrid photoIds={loc.photoIds} size="sm" /></div>}
      {equipment.length === 0 ? (
        <p className="p-5 text-sm text-ink-500">{totalEq ? 'No matches for this search.' : 'No equipment recorded here yet.'}</p>
      ) : (
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {equipment.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onOpen(e.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-50 dark:hover:bg-ink-850 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-ink-900 dark:text-white">{e.name}</span>
                    <Badge>{pretty(e.kind)}</Badge>
                    {!e.identified && <Badge tone="warn">Unknown — identify later</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
                    {[e.manufacturer, e.model].filter(Boolean).join(' ') || 'Make/model not recorded'}
                    {e.incrementsKg.length ? ` · steps ${e.incrementsKg.join('/')} kg` : ''}
                    {e.exerciseIds.length ? ` · ${e.exerciseIds.slice(0, 3).map(exName).join(', ')}${e.exerciseIds.length > 3 ? '…' : ''}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-ink-500">
                  <div className="font-semibold tabular-nums text-ink-800 dark:text-ink-100">{sessionsOnEq.get(e.id) ?? 0}</div>
                  sessions
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LocationForm({ loc, onClose }: { loc: Location | null; onClose: () => void }) {
  const data = useData();
  const [name, setName] = useState(loc?.name ?? '');
  const [address, setAddress] = useState(loc?.address ?? '');
  const [notes, setNotes] = useState(loc?.notes ?? '');
  const [photoIds, setPhotoIds] = useState<string[]>(loc?.photoIds ?? []);

  const save = async (patch: Partial<Location> = {}) => {
    if (!name.trim()) {
      toast('Gym name is required', 'bad');
      return null;
    }
    const rec: Location = { id: loc?.id ?? slugId(name, 'gym'), name: name.trim(), address: address.trim() || undefined, notes: notes.trim() || undefined, photoIds, createdAt: loc?.createdAt ?? new Date().toISOString(), ...patch };
    await store.saveLocation(rec);
    return rec;
  };

  const remove = async () => {
    if (!loc) return;
    const eqs = data.equipment.filter((e) => e.locationId === loc.id);
    const ws = data.workouts.filter((w) => w.locationId === loc.id).length;
    if (!window.confirm(`Delete "${loc.name}"?${eqs.length ? ` ${eqs.length} equipment item(s) become unassigned (their history is kept).` : ''}${ws ? ` ${ws} workout(s) keep their records but lose the gym link.` : ''}`)) return;
    for (const e of eqs) await store.saveEquipment({ ...e, locationId: null });
    for (const p of loc.photoIds) await store.deletePhoto(p);
    await store.deleteLocation(loc.id);
    toast('Gym deleted');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={loc ? `Edit ${loc.name}` : 'Add gym'}
      footer={<>
        {loc && <Button variant="danger" className="mr-auto" onClick={remove}><IconTrash size={14} /> Delete</Button>}
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={async () => { if (await save()) { toast('Gym saved'); onClose(); } }}>Save</Button>
      </>}>
      <div className="space-y-3">
        <Field label="Name" hint="Use a name you'll say to Claude, e.g. “Gym A” or “Downtown gym”."><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Address or area (optional)" hint="Stored encrypted. Keep it vague if you prefer."><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="Notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="font-sans text-sm" placeholder="Opening hours, busy times, what's missing…" /></Field>
        <div>
          <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">Photos</div>
          {loc ? (
            <PhotoGrid photoIds={photoIds}
              onAdd={async (f) => {
                const p = await store.addPhoto(f, { kind: 'location', ownerId: loc.id });
                const next = [...photoIds, p.id];
                setPhotoIds(next);
                await store.saveLocation({ ...loc, name: name.trim() || loc.name, photoIds: next });
                return p;
              }}
              onDelete={async (pid) => {
                await store.deletePhoto(pid);
                const next = photoIds.filter((x) => x !== pid);
                setPhotoIds(next);
                await store.saveLocation({ ...loc, photoIds: next });
              }} />
          ) : <p className="text-xs text-ink-500">Save the gym first, then add photos.</p>}
        </div>
      </div>
    </Modal>
  );
}

function EquipmentForm({ eq, defaultLocation, onClose, onSaved }: { eq: Equipment | null; defaultLocation: string | null; onClose: () => void; onSaved: (id: string) => void }) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const [name, setName] = useState(eq?.name ?? '');
  const [kind, setKind] = useState<EquipmentKind>(eq?.kind ?? 'machine');
  const [manufacturer, setManufacturer] = useState(eq?.manufacturer ?? '');
  const [model, setModel] = useState(eq?.model ?? '');
  const [locationId, setLocationId] = useState<string>(eq ? eq.locationId ?? '' : defaultLocation ?? '');
  const [increments, setIncrements] = useState(eq?.incrementsKg.join(', ') ?? '');
  const [minKg, setMinKg] = useState<number | null>(eq?.minKg ?? null);
  const [maxKg, setMaxKg] = useState<number | null>(eq?.maxKg ?? null);
  const [stackNotes, setStackNotes] = useState(eq?.stackNotes ?? '');
  const [settings, setSettings] = useState<[string, string][]>(Object.entries(eq?.settings ?? {}));
  const [exerciseIds, setExerciseIds] = useState<string[]>(eq?.exerciseIds ?? []);
  const [notes, setNotes] = useState(eq?.notes ?? '');
  const [exQ, setExQ] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const suggestions = exQ.trim() ? searchExercises(a.registry, exQ, 6).filter((d) => !exerciseIds.includes(d.id)) : [];
  const parsedInc = increments.split(/[,;\s]+/).map((s) => Number(s.replace(',', '.'))).filter((n) => Number.isFinite(n) && n > 0);
  const identified = !!(manufacturer.trim() || model.trim());

  const save = async () => {
    if (!name.trim()) return toast('Give the equipment a name, e.g. “Lat pulldown (left)”', 'bad');
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const id = eq?.id ?? slugId(name, 'eq');
      let photoIds = eq?.photoIds ?? [];
      for (const f of files) {
        const p = await store.addPhoto(f, { kind: 'equipment', ownerId: id });
        photoIds = [...photoIds, p.id];
      }
      const rec: Equipment = {
        id,
        locationId: locationId || null,
        name: name.trim(),
        kind,
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        identified,
        incrementsKg: [...new Set(parsedInc)].sort((x, y) => x - y),
        minKg,
        maxKg,
        stackNotes: stackNotes.trim() || undefined,
        settings: Object.fromEntries(settings.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v.trim()])),
        exerciseIds,
        photoIds,
        notes: notes.trim() || undefined,
        createdAt: eq?.createdAt ?? now,
        updatedAt: now,
      };
      await store.saveEquipment(rec);
      toast(eq ? 'Equipment updated' : 'Equipment added');
      onSaved(id);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={eq ? `Edit ${eq.name}` : 'Add equipment'}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" hint="How you'd describe it: “Lat pulldown”, “Hack squat (Gym B)”."><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label="Gym">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">Unassigned</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type"><Select value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind)}>{KINDS.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}</Select></Field>
          <Field label="Manufacturer" hint="Leave blank if unknown"><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Technogym, Matrix, Hammer…" /></Field>
          <Field label="Model"><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Selection 900" /></Field>
        </div>
        {!identified && <Callout tone="warn">No make/model — this will be saved as <b>Unknown — identify later</b>. A photo helps you or Claude identify it later.</Callout>}

        <Card className="!p-3">
          <CardTitle hint="Determines suggested load jumps. A 5 kg stack with a 2.5 kg add-on plate → “2.5, 5”. Plate-loaded → smallest plate pair.">Weight stack</CardTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Available increments (kg)"><Input value={increments} onChange={(e) => setIncrements(e.target.value)} placeholder="5 or 2.5, 5" /></Field>
            <Field label="Min load (kg)"><NumInput value={minKg} onChange={setMinKg} /></Field>
            <Field label="Max load (kg)"><NumInput value={maxKg} onChange={setMaxKg} /></Field>
          </div>
          <Field label="Stack notes" className="mt-3"><Input value={stackNotes} onChange={(e) => setStackNotes(e.target.value)} placeholder="Numbers are pin positions, not kg; 2:1 pulley…" /></Field>
        </Card>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300">Personal settings</span>
            <Button size="sm" variant="ghost" onClick={() => setSettings([...settings, ['', '']])}><IconPlus size={13} /> Add setting</Button>
          </div>
          {settings.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {['Seat', 'Back pad', 'Handle position', 'Foot plate', 'Range limiter'].map((k) => (
                <button key={k} type="button" onClick={() => setSettings([...settings, [k, '']])} className="rounded-lg border border-dashed border-ink-300 px-2 py-1 text-xs text-ink-500 hover:border-accent-500 dark:border-ink-700">+ {k}</button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {settings.map(([k, v], i) => (
              <div key={i} className="flex gap-2">
                <Input value={k} onChange={(e) => setSettings(settings.map((s, j) => (j === i ? [e.target.value, s[1]] : s)))} placeholder="Setting" className="flex-1" />
                <Input value={v} onChange={(e) => setSettings(settings.map((s, j) => (j === i ? [s[0], e.target.value] : s)))} placeholder="Value" className="w-28" />
                <Button variant="ghost" size="sm" className="h-10" aria-label="Remove setting" onClick={() => setSettings(settings.filter((_, j) => j !== i))}><IconX size={14} /></Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">Exercises performed on it</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {exerciseIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-lg bg-accent-500/15 px-2 py-1 text-xs font-medium text-accent-600 dark:text-accent-400">
                {names.ex(a.registry.get(id), id)}
                <button type="button" aria-label="Remove" onClick={() => setExerciseIds(exerciseIds.filter((x) => x !== id))}><IconX size={12} /></button>
              </span>
            ))}
            {exerciseIds.length === 0 && <span className="text-xs text-ink-500">None linked yet — linking improves automatic matching on import.</span>}
          </div>
          <Input value={exQ} onChange={(e) => setExQ(e.target.value)} placeholder="Search exercise to link…" />
          {suggestions.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
              {suggestions.map((d) => (
                <button key={d.id} type="button" onClick={() => { setExerciseIds([...exerciseIds, d.id]); setExQ(''); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-850">
                  <span>{d.name.en} <span className="text-xs text-ink-500">· {d.name.ru}</span></span>
                  <IconPlus size={14} />
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label="Notes"><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="font-sans text-sm" placeholder="Feels heavier than the other one, cam is hardest at the top…" /></Field>

        {!eq && (
          <Field label="Photos (encrypted)" hint="Optional. Helps identify the machine later.">
            <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-1.5 dark:file:bg-ink-800 dark:file:text-ink-200" />
            {files.length > 0 && <span className="mt-1 block text-xs text-ink-500">{files.length} photo(s) will be encrypted on save.</span>}
          </Field>
        )}
      </div>
    </Modal>
  );
}

function EquipmentDetail({ eq, onClose, onEdit }: { eq: Equipment; onClose: () => void; onEdit: () => void }) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const loc = data.locations.find((l) => l.id === eq.locationId);
  const series = a.progression.filter((p) => p.equipmentId === eq.id);

  const remove = async () => {
    const used = series.reduce((s, p) => s + p.sessions.length, 0);
    if (!window.confirm(used ? `Delete "${eq.name}"? ${used} logged session(s) reference it; they keep their data but will show as unidentified equipment.` : `Delete "${eq.name}"?`)) return;
    for (const p of eq.photoIds) await store.deletePhoto(p);
    await store.deleteEquipment(eq.id);
    toast('Equipment deleted');
    onClose();
  };

  return (
    <Modal open onClose={onClose} wide title={eq.name}
      footer={<><Button variant="danger" className="mr-auto" onClick={remove}><IconTrash size={14} /> Delete</Button><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={onEdit}><IconEdit size={14} /> Edit</Button></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge>{pretty(eq.kind)}</Badge>
          {eq.identified ? <Badge tone="good">{[eq.manufacturer, eq.model].filter(Boolean).join(' ')}</Badge> : <Badge tone="warn">Unknown — identify later</Badge>}
          <Badge tone="accent"><IconMapPin size={11} /> {loc?.name ?? 'Unassigned'}</Badge>
          <Badge>id {eq.id}</Badge>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Photos</h4>
          <PhotoGrid photoIds={eq.photoIds}
            onAdd={async (f) => {
              const p = await store.addPhoto(f, { kind: 'equipment', ownerId: eq.id });
              await store.saveEquipment({ ...eq, photoIds: [...eq.photoIds, p.id] });
              return p;
            }}
            onDelete={async (pid) => {
              await store.deletePhoto(pid);
              await store.saveEquipment({ ...eq, photoIds: eq.photoIds.filter((x) => x !== pid) });
            }} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Weight stack</div>
            <dl className="space-y-1 text-sm">
              <Row k="Increments" v={eq.incrementsKg.length ? `${eq.incrementsKg.join(' / ')} kg` : 'Not set (default used)'} />
              <Row k="Range" v={eq.minKg != null || eq.maxKg != null ? `${fmt(eq.minKg)} – ${fmt(eq.maxKg)} kg` : '—'} />
              {eq.stackNotes && <Row k="Notes" v={eq.stackNotes} />}
            </dl>
          </div>
          <div className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">My settings</div>
            {Object.keys(eq.settings).length ? (
              <dl className="space-y-1 text-sm">{Object.entries(eq.settings).map(([k, v]) => <Row key={k} k={k} v={v || '—'} />)}</dl>
            ) : <p className="text-sm text-ink-500">No settings saved.</p>}
          </div>
        </div>

        {eq.notes && <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{eq.notes}</p>}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Training history on this machine</h4>
          <Callout tone="warn" icon={<IconAlert size={16} />}>Loads below apply to <b>this machine only</b>. They are not comparable with the same exercise on other equipment.</Callout>
          {series.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">No logged sets on this equipment yet.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {series.map((s) => (
                <div key={s.key}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink-900 dark:text-white">{names.ex(a.registry.get(s.exerciseId), s.exerciseId)}</span>
                    <span className="flex gap-1.5">
                      <Badge tone={s.trend.cls === 'progressing' ? 'good' : s.trend.cls === 'declining' ? 'bad' : s.trend.cls === 'plateau' ? 'warn' : 'neutral'}>{s.trend.cls.replace('_', ' ')}</Badge>
                      {s.best.weight != null && <Badge tone="accent">best {fmt(s.best.weight)} kg × {s.best.reps ?? '?'}</Badge>}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-ink-500">{s.trend.evidence}</p>
                  <Table dense head={['Date', 'Top set', 'RIR', 'Sets', 'Index']}>
                    {[...s.sessions].reverse().slice(0, 8).map((p) => (
                      <tr key={p.workoutId}>
                        <Td right={false}>{formatDate(p.date)}</Td>
                        <Td>{p.topWeight != null ? `${fmt(p.topWeight)} kg × ${p.topReps ?? '?'}` : `${p.topReps ?? '?'} reps`}</Td>
                        <Td>{p.topRir ?? '—'}</Td>
                        <Td>{p.sets.length}</Td>
                        <Td>{fmt(p.index)}</Td>
                      </tr>
                    ))}
                  </Table>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] text-ink-500">Added {formatDate(eq.createdAt.slice(0, 10))} · updated {formatDate(eq.updatedAt.slice(0, 10))} · use the id <code>{eq.id}</code> when telling Claude which machine you used.</p>
      </div>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-500">{k}</dt>
      <dd className="text-right font-medium text-ink-800 dark:text-ink-100">{v}</dd>
    </div>
  );
}
