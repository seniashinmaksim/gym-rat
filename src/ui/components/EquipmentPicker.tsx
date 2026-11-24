/**
 * Machine-first picker: this gym's machines (favourites, recent for this exercise, the rest), then
 * equipment not assigned to any gym (one tap to assign it here), and other gyms' equipment only when
 * searched for or expanded — always labelled with its gym, never presented as belonging here.
 * Grouping/sorting lives in src/domain/equipmentMemory.ts.
 */
import { useMemo, useState } from 'react';
import { formatDate } from '../../domain/dates';
import { equipmentChoices, type EquipmentChoice } from '../../domain/equipmentMemory';
import type { Equipment, ExerciseDef } from '../../domain/types';
import { store, useData } from '../../lib/store';
import { useAnalysis, useNames } from '../hooks';
import { IconEdit, IconPlus, IconSearch, IconStar } from './icons';
import { Badge, Button, cx, Input, Modal, toast } from './ui';
import { L } from '../../i18n';

export function EquipmentPicker({ open, onClose, locationId, def, currentId, onPick, onNew, onEdit }: {
  open: boolean; onClose: () => void; locationId: string | null; def?: ExerciseDef; currentId: string | null;
  onPick: (eq: Equipment | null) => void; onNew: () => void; onEdit: (eq: Equipment) => void;
}) {
  const data = useData();
  const a = useAnalysis();
  const names = useNames();
  const [q, setQ] = useState('');
  const [showOther, setShowOther] = useState(false);
  const gym = data.locations.find((l) => l.id === locationId);
  const g = useMemo(
    () => equipmentChoices(data, { locationId, exerciseId: def?.id ?? null, query: q, exerciseName: (id) => names.ex(a.registry.get(id), id) }),
    [data, locationId, def?.id, q, a.registry, names],
  );
  const local = g.favorites.length + g.recent.length + g.thisGym.length + g.unassigned.length;
  const otherOpen = showOther || (!!q.trim() && local === 0);

  const star = async (eq: Equipment) => {
    await store.saveEquipment({ ...eq, favorite: !eq.favorite, updatedAt: new Date().toISOString() });
  };
  const assignHere = async (eq: Equipment) => {
    if (!locationId) return;
    await store.saveEquipment({ ...eq, locationId, updatedAt: new Date().toISOString() });
    toast(L(`Assigned to ${gym?.name ?? 'this gym'}`, gym ? `Привязано к залу «${gym.name}»` : 'Привязано к этому залу'));
  };

  const row = (c: EquipmentChoice, extra?: React.ReactNode) => (
    <li key={c.eq.id} className="flex items-center gap-1">
      <button type="button" onClick={() => onPick(c.eq)}
        className={cx('flex min-h-[52px] min-w-0 flex-1 flex-col justify-center rounded-lg px-2 py-2 text-left active:bg-ink-100 dark:active:bg-ink-800', currentId === c.eq.id && 'bg-accent-500/10')}>
        <span className="truncate text-sm font-medium text-ink-900 dark:text-white">{c.eq.name}</span>
        <span className="truncate text-xs text-ink-500">
          {[c.eq.manufacturer, c.eq.model].filter(Boolean).join(' ') || L('make unknown', 'производитель неизвестен')}
          {c.lastUsed ? L(` · used ${formatDate(c.lastUsed, { day: 'numeric', month: 'short' })}`, ` · последний раз ${formatDate(c.lastUsed, { day: 'numeric', month: 'short' })}`) : L(' · not used yet', ' · ещё не использовался')}
          {c.gymName && c.eq.locationId !== locationId ? ` · ${c.gymName}` : ''}
        </span>
      </button>
      {extra}
      <button type="button" onClick={() => star(c.eq)} aria-label={c.eq.favorite ? L('Remove from favourites', 'Убрать из избранного') : L('Add to favourites', 'Добавить в избранное')} aria-pressed={!!c.eq.favorite}
        className={cx('flex h-11 w-10 shrink-0 items-center justify-center rounded-lg', c.eq.favorite ? 'text-amber-500' : 'text-ink-400')}><IconStar size={18} filled={!!c.eq.favorite} /></button>
      <button type="button" onClick={() => onEdit(c.eq)} aria-label={L(`Edit ${c.eq.name}`, `Изменить: ${c.eq.name}`)} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-ink-400"><IconEdit size={16} /></button>
    </li>
  );
  const section = (title: string, xs: EquipmentChoice[], hint?: string, extra?: (c: EquipmentChoice) => React.ReactNode) =>
    xs.length > 0 && (
      <div className="mt-3">
        <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{title}</div>
        {hint && <p className="px-2 text-[11px] text-ink-500">{hint}</p>}
        <ul className="mt-1 divide-y divide-ink-100 dark:divide-ink-800">{xs.map((c) => row(c, extra?.(c)))}</ul>
      </div>
    );

  return (
    <Modal open={open} onClose={onClose} title={def ? L(`Machine for ${names.ex(def)}`, `Тренажёр: ${names.ex(def)}`) : L('Choose equipment', 'Выберите оборудование')}
      footer={<><Button variant="ghost" onClick={() => onPick(null)}>{L('None / free weights', 'Нет / свободный вес')}</Button><Button variant="primary" onClick={onNew}><IconPlus size={14} /> {L('New', 'Новый')}</Button></>}>
      <div className="relative">
        <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Search name, make, model…', 'Название, производитель, модель…')} className="pl-9" aria-label={L('Search equipment', 'Поиск оборудования')} />
      </div>
      {!gym && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{L('No gym chosen for this session — pick one under Session details so machines stay with the right gym.', 'Для этой тренировки зал не выбран — укажите его в данных тренировки, чтобы тренажёры оставались за своим залом.')}</p>}
      {section(L('Favourites', 'Избранное'), g.favorites)}
      {section(L(`Recent for this exercise${gym ? ` at ${gym.name}` : ''}`, `Недавние для этого упражнения${gym ? ` · ${gym.name}` : ''}`), g.recent)}
      {section(gym ? L(`At ${gym.name}` , `Зал: ${gym.name}`) : L('Equipment', 'Оборудование'), g.thisGym)}
      {section(L('Not assigned to a gym', 'Без зала'), g.unassigned, gym ? L('Added before gyms existed or without a gym. Assign it if it lives here.', 'Добавлено до появления залов или без зала. Привяжите, если оно стоит здесь.') : undefined,
        (c) => locationId && <Button size="sm" variant="ghost" onClick={() => assignHere(c.eq)}>{L('Assign here', 'Привязать')}</Button>)}
      {local === 0 && !q.trim() && <p className="mt-4 text-center text-sm text-ink-500">{L('No equipment recorded at this gym yet. Tap', 'В этом зале пока нет оборудования. Нажмите')} <b>{L('New', 'Новый')}</b>{L(' to add this machine once — it is remembered for next time.', ', чтобы добавить этот тренажёр один раз — он запомнится на будущее.')}</p>}
      {local === 0 && q.trim() && g.otherGyms.length === 0 && <p className="mt-4 text-center text-sm text-ink-500">{L(`Nothing matches “${q}”.`, `По запросу «${q}» ничего не найдено.`)}</p>}
      {g.otherGyms.length > 0 && (otherOpen
        ? section(L('Other gyms', 'Другие залы'), g.otherGyms, L('These belong to another gym — loads on different machines are never compared.', 'Это оборудование другого зала — веса на разных тренажёрах не сравниваются.'))
        : <button type="button" onClick={() => setShowOther(true)} className="mt-4 min-h-[44px] w-full rounded-lg text-sm text-ink-500 underline decoration-dotted underline-offset-2">{L(`Show other gyms' equipment (${g.otherGyms.length})`, `Показать оборудование других залов (${g.otherGyms.length})`)}</button>)}
      {currentId && <div className="mt-3 flex justify-end"><Badge tone="accent">{L('current choice highlighted', 'текущий выбор подсвечен')}</Badge></div>}
    </Modal>
  );
}
