import { useMemo, useState } from 'react';
import { formatDate } from '../../domain/dates';
import { searchExercises } from '../../domain/registry';
import type { Equipment, EquipmentKind, Location } from '../../domain/types';
import { slugId } from '../../lib/id';
import { store, useData } from '../../lib/store';
import { IconAlert, IconEdit, IconMachine, IconMapPin, IconPlus, IconSearch, IconTrash, IconX } from '../components/icons';
import { PhotoGrid } from '../components/PhotoGrid';
import { PhotoPicker } from '../components/PhotoPicker';
import {
  Badge, Button, Callout, Card, CardTitle, Empty, Field, Input, Modal, NumInput, Page, Select, Table, Td, TextArea, cx, fmt, toast,
} from '../components/ui';
import { useAnalysis, useDraftSync, useNames } from '../hooks';
import { KG, L, getLang, num, ruPlural } from '../../i18n';

const KINDS: EquipmentKind[] = ['machine', 'plate_loaded', 'cable', 'smith', 'barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'band', 'other'];
// Equipment kinds, trend classes and setting names are stored codes / keys: only the shown label is translated.
const KIND_RU: Record<string, string> = {
  machine: 'тренажёр', plate_loaded: 'на дисках', cable: 'блок', smith: 'Смит', barbell: 'штанга', dumbbell: 'гантели',
  kettlebell: 'гиря', bodyweight: 'свой вес', band: 'эспандер', other: 'другое',
};
const pretty = (s: string) => (getLang() === 'ru' ? KIND_RU[s] ?? s.replace(/_/g, ' ') : s.replace(/_/g, ' '));
const TREND_RU: Record<string, string> = { progressing: 'прогресс', stable: 'стабильно', plateau: 'плато', declining: 'снижение', insufficient_data: 'мало данных' };
const trendLabel = (cls: string) => (getLang() === 'ru' ? TREND_RU[cls] ?? cls.replace('_', ' ') : cls.replace('_', ' '));
const SETTING_RU: Record<string, string> = {
  seat: 'Сиденье', 'back pad': 'Спинка', backrest: 'Спинка', 'handle position': 'Положение рукояток', 'foot plate': 'Платформа для ног',
  'foot position': 'Положение стоп', 'range limiter': 'Ограничитель амплитуды', 'arm pad': 'Подушка для рук', 'shin pad': 'Валик для голеней',
  'ankle pad': 'Валик для лодыжек', 'thigh pad': 'Фиксатор бёдер', 'knee pad': 'Фиксатор коленей', 'chest pad': 'Упор для груди',
  'shoulder pad': 'Плечевой упор', 'cable height': 'Высота блока', 'pulley height': 'Высота блока', 'strap setup': 'Настройка петель',
  attachment: 'Рукоять', grip: 'Хват', depth: 'Глубина',
};
/** Shown name of a stored setting key (the key itself is never changed). */
const settingLabel = (k: string) => (getLang() === 'ru' ? SETTING_RU[k.trim().toLowerCase()] ?? k : k);
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
    return [e.name, e.manufacturer, e.model, e.kind, ...e.exerciseIds.flatMap((id) => [a.registry.get(id)?.name.en ?? '', a.registry.get(id)?.name.ru ?? ''])].some((x) => x?.toLowerCase().includes(s));
  };

  const unidentified = data.equipment.filter((e) => !e.identified).length;
  const sortedLocs = [...data.locations].sort((x, y) => (sessionsAt.get(y.id) ?? 0) - (sessionsAt.get(x.id) ?? 0) || x.name.localeCompare(y.name));
  const detailEq = detail ? data.equipment.find((e) => e.id === detail) : undefined;

  return (
    <Page
      title={L('Equipment & gyms', 'Оборудование и залы')}
      subtitle={L(`${data.locations.length} gym${data.locations.length === 1 ? '' : 's'} · ${data.equipment.length} equipment instance${data.equipment.length === 1 ? '' : 's'}${unidentified ? ` · ${unidentified} to identify` : ''}`,
        `${data.locations.length} ${ruPlural(data.locations.length, 'зал', 'зала', 'залов')} · ${data.equipment.length} ${ruPlural(data.equipment.length, 'единица', 'единицы', 'единиц')} оборудования${unidentified ? ` · уточнить: ${unidentified}` : ''}`)}
      actions={<>
        <Button onClick={() => setLocForm('new')}><IconMapPin size={16} /> {L('Add gym', 'Добавить зал')}</Button>
        <Button variant="primary" onClick={() => setEqForm({ eq: null, locationId: data.locations[0]?.id ?? null })}><IconPlus size={16} /> {L('Add equipment', 'Оборудование')}</Button>
      </>}
    >
      <Callout tone="info" icon={<IconMachine size={18} />} title={L('Each machine has its own history', 'У каждого тренажёра своя история')}>{L('Loads are never compared between machines. Unknown make? Save it and identify it later.', 'Веса между тренажёрами не сравниваются. Не знаете марку? Сохраните и уточните позже.')}</Callout>

      {data.equipment.length > 0 && (
        <div className="relative max-w-md">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Find equipment, brand or exercise…', 'Найти оборудование, марку или упражнение…')} className="pl-9" />
        </div>
      )}

      {data.locations.length === 0 && data.equipment.length === 0 ? (
        <Empty title={L('No gyms yet', 'Залов пока нет')} action={<Button variant="primary" onClick={() => setLocForm('new')}><IconMapPin size={16} /> {L('Add your first gym', 'Добавить первый зал')}</Button>}>
          {L('Add the gyms you train at, then the machines you use there. Claude can also create equipment records when you import a workout.', 'Добавьте залы, где тренируетесь, затем тренажёры в них. Claude тоже может создавать записи оборудования при импорте тренировки.')}
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
            <h2 className="min-w-0 text-base font-semibold text-ink-900 dark:text-white break-words">{loc ? loc.name : L('Unassigned equipment', 'Оборудование без зала')}</h2>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {loc ? <>{loc.address ? `${loc.address} · ` : ''}{L(`${sessions} session${sessions === 1 ? '' : 's'} · ${totalEq} item${totalEq === 1 ? '' : 's'}`, `${sessions} ${ruPlural(sessions, 'тренировка', 'тренировки', 'тренировок')} · ${totalEq} шт.`)} · id <code className="text-[10px]">{loc.id}</code></> : L('Not linked to a gym — assign a location so Claude can match it.', 'Не привязано к залу — укажите зал, чтобы Claude мог его сопоставить.')}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {onEdit && <Button size="sm" variant="ghost" onClick={onEdit}><IconEdit size={14} /> {L('Edit gym', 'Изменить зал')}</Button>}
          <Button size="sm" onClick={onAddEq}><IconPlus size={14} /> {L('Equipment', 'Оборудование')}</Button>
        </div>
      </div>
      {loc && loc.photoIds.length > 0 && <div className="border-b border-ink-100 px-4 py-3 dark:border-ink-800 sm:px-5"><PhotoGrid photoIds={loc.photoIds} size="sm" /></div>}
      {equipment.length === 0 ? (
        <p className="p-5 text-sm text-ink-500">{totalEq ? L('No matches for this search.', 'Ничего не найдено.') : L('No equipment recorded here yet.', 'Здесь пока нет оборудования.')}</p>
      ) : (
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {equipment.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => onOpen(e.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-ink-50 dark:hover:bg-ink-850 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-ink-900 dark:text-white">{e.name}</span>
                    <Badge>{pretty(e.kind)}</Badge>
                    {!e.identified && <Badge tone="warn">{L('Unknown — identify later', 'Неизвестно — уточнить позже')}</Badge>}
                  </div>
                  <div className="min-w-0 mt-0.5 text-xs text-ink-500 dark:text-ink-400 break-words">
                    {[e.manufacturer, e.model].filter(Boolean).join(' ') || L('Make/model not recorded', 'Марка и модель не указаны')}
                    {e.incrementsKg.length ? L(` · steps ${e.incrementsKg.join('/')} kg`, ` · шаг ${e.incrementsKg.map((x) => num(x)).join('/')} кг`) : ''}
                    {e.exerciseIds.length ? ` · ${e.exerciseIds.slice(0, 3).map(exName).join(', ')}${e.exerciseIds.length > 3 ? '…' : ''}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-ink-500">
                  <div className="font-semibold tabular-nums text-ink-800 dark:text-ink-100">{sessionsOnEq.get(e.id) ?? 0}</div>
                  {L('sessions', ruPlural(sessionsOnEq.get(e.id) ?? 0, 'тренировка', 'тренировки', 'тренировок'))}
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
  const [fwInc, setFwInc] = useState((loc?.freeWeightIncrementsKg ?? []).join(', '));

  const save = async (patch: Partial<Location> = {}) => {
    if (!name.trim()) {
      toast(L('Gym name is required', 'Укажите название зала'), 'bad');
      return null;
    }
    const inc = [...new Set(fwInc.split(/[,;\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => Number.isFinite(x) && x > 0))].sort((x, y) => x - y);
    const rec: Location = { ...(loc ?? {}), id: loc?.id ?? slugId(name, 'gym'), name: name.trim(), address: address.trim() || undefined, notes: notes.trim() || undefined, freeWeightIncrementsKg: inc.length ? inc : undefined, photoIds, createdAt: loc?.createdAt ?? new Date().toISOString(), ...patch };
    await store.saveLocation(rec);
    return rec;
  };

  const remove = async () => {
    if (!loc) return;
    const eqs = data.equipment.filter((e) => e.locationId === loc.id);
    const ws = data.workouts.filter((w) => w.locationId === loc.id).length;
    if (!window.confirm(L(`Delete "${loc.name}"?${eqs.length ? ` ${eqs.length} equipment item(s) become unassigned (their history is kept).` : ''}${ws ? ` ${ws} workout(s) keep their records but lose the gym link.` : ''}`,
      `Удалить «${loc.name}»?${eqs.length ? ` Оборудование (${eqs.length} шт.) останется без зала, его история сохранится.` : ''}${ws ? ` Тренировки (${ws}) сохранят записи, но потеряют привязку к залу.` : ''}`))) return;
    for (const e of eqs) await store.saveEquipment({ ...e, locationId: null });
    for (const p of loc.photoIds) await store.deletePhoto(p);
    await store.deleteLocation(loc.id);
    toast(L('Gym deleted', 'Зал удалён'));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={loc ? L(`Edit ${loc.name}`, `Изменить: ${loc.name}`) : L('Add gym', 'Добавить зал')}
      footer={<>
        {loc && <Button variant="danger" className="mr-auto" onClick={remove}><IconTrash size={14} /> {L('Delete', 'Удалить')}</Button>}
        <Button onClick={onClose}>{L('Cancel', 'Отмена')}</Button>
        <Button variant="primary" onClick={async () => { if (await save()) { toast(L('Gym saved', 'Зал сохранён')); onClose(); } }}>{L('Save', 'Сохранить')}</Button>
      </>}>
      <div className="space-y-3">
        <Field label={L('Name', 'Название')} hint={L("Use a name you'll say to Claude, e.g. “Gym A” or “Downtown gym”.", 'Название, которым вы будете называть зал в разговоре с Claude, напр. «Зал А» или «Зал в центре».')}><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label={L('Address or area (optional)', 'Адрес или район (необязательно)')} hint={L('Stored encrypted. Keep it vague if you prefer.', 'Хранится в зашифрованном виде. Можно указать приблизительно.')}><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label={L('Dumbbell steps here (kg)', 'Шаг гантелей в этом зале (кг)')} hint={L('The jumps between dumbbells at this gym, e.g. “2.5” or “1, 2”. Used for suggested weights. Empty = 2 kg default.', 'Разница между соседними гантелями в этом зале, напр. «2.5» или «1, 2» (дробную часть пишите через точку). Используется для предлагаемых весов. Пусто = 2 кг по умолчанию.')}><Input value={fwInc} onChange={(e) => setFwInc(e.target.value)} inputMode="decimal" placeholder="2.5" /></Field>
        <Field label={L('Notes', 'Заметки')}><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="font-sans text-sm" placeholder={L("Opening hours, busy times, what's missing…", 'Часы работы, часы пик, чего не хватает…')} /></Field>
        <div>
          <div className="mb-1 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Photos', 'Фото')}</div>
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
          ) : <p className="text-xs text-ink-500">{L('Save the gym first, then add photos.', 'Сначала сохраните зал, затем добавьте фото.')}</p>}
        </div>
      </div>
    </Modal>
  );
}

export function EquipmentForm({ eq, defaultLocation, onClose, onSaved, defaultExerciseId, defaultName, defaultKind }: { eq: Equipment | null; defaultLocation: string | null; onClose: () => void; onSaved: (id: string) => void; defaultExerciseId?: string; defaultName?: string; defaultKind?: EquipmentKind }) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  // A NEW machine being typed in is kept as an encrypted draft (per exercise / gym) until saved or cancelled.
  const draftId = eq ? null : `equipment:new:${defaultExerciseId ?? '-'}:${defaultLocation ?? '-'}`;
  const d0 = useMemo(() => (draftId ? store.getDraft<Record<string, unknown>>(draftId) : undefined), [draftId]);
  const dv = <T,>(k: string, fallback: T): T => (d0 && k in d0 ? (d0[k] as T) : fallback);
  const [name, setName] = useState(dv('name', eq?.name ?? defaultName ?? ''));
  const [kind, setKind] = useState<EquipmentKind>(dv('kind', eq?.kind ?? defaultKind ?? 'machine'));
  const [manufacturer, setManufacturer] = useState(dv('manufacturer', eq?.manufacturer ?? ''));
  const [model, setModel] = useState(dv('model', eq?.model ?? ''));
  const [locationId, setLocationId] = useState<string>(dv('locationId', eq ? eq.locationId ?? '' : defaultLocation ?? ''));
  const [increments, setIncrements] = useState(dv('increments', eq?.incrementsKg.join(', ') ?? ''));
  const [minKg, setMinKg] = useState<number | null>(dv('minKg', eq?.minKg ?? null));
  const [maxKg, setMaxKg] = useState<number | null>(dv('maxKg', eq?.maxKg ?? null));
  const [stackNotes, setStackNotes] = useState(dv('stackNotes', eq?.stackNotes ?? ''));
  const [barWeightKg, setBarWeightKg] = useState<number | null>(dv('barWeightKg', eq?.barWeightKg ?? null));
  const [settings, setSettings] = useState<[string, string][]>(dv('settings', Object.entries(eq?.settings ?? {})));
  const [exerciseIds, setExerciseIds] = useState<string[]>(dv('exerciseIds', eq?.exerciseIds ?? (defaultExerciseId ? [defaultExerciseId] : [])));
  const [notes, setNotes] = useState(dv('notes', eq?.notes ?? ''));
  const clearEqDraft = useDraftSync(draftId, { name, kind, manufacturer, model, locationId, increments, minKg, maxKg, stackNotes, barWeightKg, settings, exerciseIds, notes });
  const [exQ, setExQ] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const suggestions = exQ.trim() ? searchExercises(a.registry, exQ, 6).filter((d) => !exerciseIds.includes(d.id)) : [];
  const parsedInc = increments.split(/[,;\s]+/).map((s) => Number(s.replace(',', '.'))).filter((n) => Number.isFinite(n) && n > 0);
  const identified = !!(manufacturer.trim() || model.trim());

  const save = async () => {
    if (!name.trim()) return toast(L('Give the equipment a name, e.g. “Lat pulldown (left)”', 'Дайте оборудованию название, напр. «Тяга верхнего блока (левая)»'), 'bad');
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
        ...(eq ?? {}), // keep fields this form does not edit (e.g. favourite)
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
        barWeightKg: kind === 'barbell' || kind === 'smith' ? barWeightKg : eq?.barWeightKg ?? null,
        settings: Object.fromEntries(settings.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v.trim()])),
        exerciseIds,
        photoIds,
        notes: notes.trim() || undefined,
        createdAt: eq?.createdAt ?? now,
        updatedAt: now,
      };
      await store.saveEquipment(rec);
      clearEqDraft();
      toast(eq ? L('Equipment updated', 'Оборудование обновлено') : L('Equipment added', 'Оборудование добавлено'));
      onSaved(id);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} wide title={eq ? L(`Edit ${eq.name}`, `Изменить: ${eq.name}`) : L('Add equipment', 'Добавить оборудование')}
      footer={<><Button onClick={() => { clearEqDraft(); onClose(); }}>{L('Cancel', 'Отмена')}</Button><Button variant="primary" onClick={save} disabled={busy}>{busy ? L('Saving…', 'Сохранение…') : L('Save', 'Сохранить')}</Button></>}>
      {d0 && <p className="mb-3 rounded-lg bg-accent-500/10 px-3 py-1.5 text-xs text-accent-700 dark:text-accent-300" data-testid="draft-restored">{L('Unsaved machine restored — Cancel discards it.', 'Несохранённый тренажёр восстановлен — «Отмена» удалит его.')}</p>}
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={L('Name', 'Название')} hint={L("How you'd describe it: “Lat pulldown”, “Hack squat (Gym B)”.", 'Как вы бы его описали: «Тяга верхнего блока», «Гакк-машина (зал Б)».')}><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
          <Field label={L('Gym', 'Зал')}>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">{L('Unassigned', 'Без зала')}</option>
              {data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={L('Type', 'Тип')}><Select value={kind} onChange={(e) => setKind(e.target.value as EquipmentKind)}>{KINDS.map((k) => <option key={k} value={k}>{pretty(k)}</option>)}</Select></Field>
          <Field label={L('Manufacturer', 'Производитель')} hint={L('Leave blank if unknown', 'Оставьте пустым, если неизвестен')}><Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Technogym, Matrix, Hammer…" /></Field>
          <Field label={L('Model', 'Модель')}><Input value={model} onChange={(e) => setModel(e.target.value)} placeholder={L('e.g. Selection 900', 'напр. Selection 900')} /></Field>
        </div>
        {!identified && <Callout tone="warn">{L('No make/model — this will be saved as', 'Марка и модель не указаны — запись сохранится как')} <b>{L('Unknown — identify later', 'Неизвестно — уточнить позже')}</b>. {L('A photo helps you or Claude identify it later.', 'Фото поможет вам или Claude опознать его позже.')}</Callout>}

        <Card className="!p-3">
          <CardTitle hint={L('Determines suggested load jumps. A 5 kg stack with a 2.5 kg add-on plate → “2.5, 5”. Plate-loaded → smallest plate pair.', 'Определяет предлагаемый шаг веса. Стек с шагом 5 кг и доп. грузом 2,5 кг → «2.5, 5» (дробную часть пишите через точку). Тренажёр на дисках → наименьшая пара дисков.')}>{L('Weight stack', 'Весовой стек')}</CardTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={L('Available increments (kg)', 'Доступные шаги (кг)')}><Input value={increments} onChange={(e) => setIncrements(e.target.value)} placeholder={L('5 or 2.5, 5', '5 или 2.5, 5')} /></Field>
            <Field label={L('Min load (kg)', 'Мин. вес (кг)')}><NumInput value={minKg} onChange={setMinKg} /></Field>
            <Field label={L('Max load (kg)', 'Макс. вес (кг)')}><NumInput value={maxKg} onChange={setMaxKg} /></Field>
          </div>
          {(kind === 'barbell' || kind === 'smith') && (
            <Field label={L('Empty bar weight (kg)', 'Вес пустого грифа (кг)')} className="mt-3" hint={L('Only if you know it (e.g. weighed or labelled). Leave empty if unknown — it is never assumed.', 'Только если знаете точно (взвешен или есть маркировка). Если неизвестен — оставьте пустым: вес никогда не подставляется по умолчанию.')}><NumInput value={barWeightKg} onChange={setBarWeightKg} step={0.5} placeholder={L('unknown', 'неизвестно')} /></Field>
          )}
          <Field label={L('Stack notes', 'Заметки о стеке')} className="mt-3"><Input value={stackNotes} onChange={(e) => setStackNotes(e.target.value)} placeholder={L('Numbers are pin positions, not kg; 2:1 pulley…', 'Цифры — номера отверстий, а не кг; блок 2:1…')} /></Field>
        </Card>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{L('Personal settings', 'Личные настройки')}</span>
            <Button size="sm" variant="ghost" onClick={() => setSettings([...settings, ['', '']])}><IconPlus size={13} /> {L('Add setting', 'Добавить настройку')}</Button>
          </div>
          {settings.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {['Seat', 'Back pad', 'Handle position', 'Foot plate', 'Range limiter'].map((k) => (
                <button key={k} type="button" onClick={() => setSettings([...settings, [k, '']])} className="h-10 rounded-lg border border-dashed border-ink-300 px-3 text-xs text-ink-500 hover:border-accent-500 dark:border-ink-700">+ {settingLabel(k)}</button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {settings.map(([k, v], i) => (
              <div key={i} className="flex gap-2">
                <Input value={k} onChange={(e) => setSettings(settings.map((s, j) => (j === i ? [e.target.value, s[1]] : s)))} placeholder={L('Setting', 'Настройка')} className="flex-1" />
                <Input value={v} onChange={(e) => setSettings(settings.map((s, j) => (j === i ? [s[0], e.target.value] : s)))} placeholder={L('Value', 'Значение')} className="w-28" />
                <Button variant="ghost" size="sm" className="h-10" aria-label={L('Remove setting', 'Удалить настройку')} onClick={() => setSettings(settings.filter((_, j) => j !== i))}><IconX size={14} /></Button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-600 dark:text-ink-300">{L('Exercises performed on it', 'Упражнения на этом оборудовании')}</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {exerciseIds.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-lg bg-accent-500/15 px-2 py-1 text-xs font-medium text-accent-600 dark:text-accent-400">
                {names.ex(a.registry.get(id), id)}
                <button type="button" aria-label={L('Remove', 'Убрать')} className="-my-2 -mr-2 flex h-9 w-9 items-center justify-center" onClick={() => setExerciseIds(exerciseIds.filter((x) => x !== id))}><IconX size={12} /></button>
              </span>
            ))}
            {exerciseIds.length === 0 && <span className="text-xs text-ink-500">{L('None linked yet — linking improves automatic matching on import.', 'Пока ничего не привязано — привязка улучшает автоматическое сопоставление при импорте.')}</span>}
          </div>
          <Input value={exQ} onChange={(e) => setExQ(e.target.value)} placeholder={L('Search exercise to link…', 'Найти упражнение для привязки…')} />
          {suggestions.length > 0 && (
            <div className="mt-1 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
              {suggestions.map((d) => (
                <button key={d.id} type="button" onClick={() => { setExerciseIds([...exerciseIds, d.id]); setExQ(''); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-50 dark:hover:bg-ink-850">
                  <span>{L(d.name.en, d.name.ru)} <span className="text-xs text-ink-500">· {L(d.name.ru, d.name.en)}</span></span>
                  <IconPlus size={14} />
                </button>
              ))}
            </div>
          )}
        </div>

        <Field label={L('Notes', 'Заметки')}><TextArea value={notes} onChange={(e) => setNotes(e.target.value)} className="font-sans text-sm" placeholder={L('Feels heavier than the other one, cam is hardest at the top…', 'Ощущается тяжелее соседнего, тяжелее всего в верхней точке…')} /></Field>

        {!eq && (
          <Field label={L('Photos (encrypted)', 'Фото (шифруются)')} hint={L('Optional. Helps identify the machine later.', 'Необязательно. Поможет опознать тренажёр позже.')}>
            <PhotoPicker files={files} onChange={setFiles} />
            {files.length > 0 && <span className="mt-1 block text-xs text-ink-500">{L(`${files.length} photo(s) will be encrypted on save.`, `Фото (${files.length}) будут зашифрованы при сохранении.`)}</span>}
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
    if (!window.confirm(used ? L(`Delete "${eq.name}"? ${used} logged session(s) reference it; they keep their data but will show as unidentified equipment.`, `Удалить «${eq.name}»? На него ссылаются записанные тренировки (${used}); их данные сохранятся, но оборудование будет показано как неопознанное.`) : L(`Delete "${eq.name}"?`, `Удалить «${eq.name}»?`))) return;
    for (const p of eq.photoIds) await store.deletePhoto(p);
    await store.deleteEquipment(eq.id);
    toast(L('Equipment deleted', 'Оборудование удалено'));
    onClose();
  };

  return (
    <Modal open onClose={onClose} wide title={eq.name}
      footer={<><Button variant="danger" className="mr-auto" onClick={remove}><IconTrash size={14} /> {L('Delete', 'Удалить')}</Button><Button onClick={onClose}>{L('Close', 'Закрыть')}</Button><Button variant="primary" onClick={onEdit}><IconEdit size={14} /> {L('Edit', 'Изменить')}</Button></>}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge>{pretty(eq.kind)}</Badge>
          {eq.identified ? <Badge tone="good">{[eq.manufacturer, eq.model].filter(Boolean).join(' ')}</Badge> : <Badge tone="warn">{L('Unknown — identify later', 'Неизвестно — уточнить позже')}</Badge>}
          <Badge tone="accent"><IconMapPin size={11} /> {loc?.name ?? L('Unassigned', 'Без зала')}</Badge>
          <Badge>id {eq.id}</Badge>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{L('Photos', 'Фото')}</h4>
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{L('Weight stack', 'Весовой стек')}</div>
            <dl className="space-y-1 text-sm">
              <Row k={L('Increments', 'Шаги')} v={eq.incrementsKg.length ? L(`${eq.incrementsKg.join(' / ')} kg`, `${eq.incrementsKg.map((x) => num(x)).join(' / ')} кг`) : L('Not set (default used)', 'Не заданы (по умолчанию)')} />
              <Row k={L('Range', 'Диапазон')} v={eq.minKg != null || eq.maxKg != null ? `${fmt(eq.minKg)} – ${fmt(eq.maxKg)} ${KG()}` : '—'} />
              {(eq.kind === 'barbell' || eq.kind === 'smith') && <Row k={L('Bar weight', 'Вес грифа')} v={eq.barWeightKg != null ? `${fmt(eq.barWeightKg, 2)} ${KG()}` : L('Unknown (not assumed)', 'Неизвестен (не подставляется)')} />}
              {eq.stackNotes && <Row k={L('Notes', 'Заметки')} v={eq.stackNotes} />}
            </dl>
          </div>
          <div className="rounded-2xl bg-ink-50 p-3 dark:bg-ink-950">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{L('My settings', 'Мои настройки')}</div>
            {Object.keys(eq.settings).length ? (
              <dl className="space-y-1 text-sm">{Object.entries(eq.settings).map(([k, v]) => <Row key={k} k={settingLabel(k)} v={v || '—'} />)}</dl>
            ) : <p className="text-sm text-ink-500">{L('No settings saved.', 'Настройки не сохранены.')}</p>}
          </div>
        </div>

        {eq.notes && <p className="text-sm leading-relaxed text-ink-700 dark:text-ink-200">{eq.notes}</p>}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">{L('Training history on this machine', 'История тренировок на этом тренажёре')}</h4>
          <Callout tone="warn" icon={<IconAlert size={16} />}>{L('Loads below apply to', 'Веса ниже относятся')} <b>{L('this machine only', 'только к этому тренажёру')}</b>. {L('They are not comparable with the same exercise on other equipment.', 'Их нельзя сравнивать с тем же упражнением на другом оборудовании.')}</Callout>
          {series.length === 0 ? (
            <p className="mt-3 text-sm text-ink-500">{L('No logged sets on this equipment yet.', 'На этом оборудовании пока нет записанных подходов.')}</p>
          ) : (
            <div className="mt-3 space-y-4">
              {series.map((s) => (
                <div key={s.key}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink-900 dark:text-white">{names.ex(a.registry.get(s.exerciseId), s.exerciseId)}</span>
                    <span className="flex gap-1.5">
                      <Badge tone={s.trend.cls === 'progressing' ? 'good' : s.trend.cls === 'declining' ? 'bad' : s.trend.cls === 'plateau' ? 'warn' : 'neutral'}>{trendLabel(s.trend.cls)}</Badge>
                      {s.best.weight != null && <Badge tone="accent">{L('best', 'рекорд')} {fmt(s.best.weight)} {KG()} × {s.best.reps ?? '?'}</Badge>}
                    </span>
                  </div>
                  <p className="mb-2 text-xs text-ink-500">{s.trend.evidence}</p>
                  <Table dense head={[L('Date', 'Дата'), L('Top set', 'Лучший подх.'), 'RIR', L('Sets', 'Подх.'), L('Index', 'Индекс')]}>
                    {[...s.sessions].reverse().slice(0, 8).map((p) => (
                      <tr key={p.workoutId}>
                        <Td right={false}>{formatDate(p.date)}</Td>
                        <Td>{p.topWeight != null ? `${fmt(p.topWeight)} ${KG()} × ${p.topReps ?? '?'}` : `${p.topReps ?? '?'} ${L('reps', 'повт.')}`}</Td>
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
        <p className="text-[11px] text-ink-500">{L('Added', 'Добавлено')} {formatDate(eq.createdAt.slice(0, 10))} · {L('updated', 'обновлено')} {formatDate(eq.updatedAt.slice(0, 10))} · {L('use the id', 'указывайте id')} <code>{eq.id}</code>{L(' when telling Claude which machine you used.', ', когда сообщаете Claude, каким тренажёром пользовались.')}</p>
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
