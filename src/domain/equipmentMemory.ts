/**
 * Equipment memory for the machine picker: which machines to offer, in what order, and never a
 * machine from another gym as if it belonged to the selected one.
 *
 * Groups (each machine appears once, in the first group that applies):
 *  1. favourites   — starred, at this gym or unassigned
 *  2. recent       — used for THIS exercise at this gym (or unassigned), most recent first (max 3)
 *  3. thisGym      — every other machine recorded at this gym (linked to the exercise first)
 *  4. unassigned   — equipment with no gym (e.g. added before gyms existed); offered with "assign"
 *  5. otherGyms    — other gyms' equipment, only when searching or explicitly expanded
 */
import type { AppData } from './appdata';
import type { Equipment } from './types';

export interface EquipmentChoice {
  eq: Equipment;
  /** Last workout date it was used (any exercise), null = never. */
  lastUsed: string | null;
  /** Workouts it was used in. */
  uses: number;
  /** Linked to the exercise being logged (Equipment.exerciseIds or used for it before). */
  linked: boolean;
  gymName: string | null;
}

export interface EquipmentGroups {
  favorites: EquipmentChoice[];
  recent: EquipmentChoice[];
  thisGym: EquipmentChoice[];
  unassigned: EquipmentChoice[];
  otherGyms: EquipmentChoice[];
}

export function equipmentUsage(data: Pick<AppData, 'workouts'>): Map<string, { lastUsed: string; uses: number; exercises: Set<string> }> {
  const m = new Map<string, { lastUsed: string; uses: number; exercises: Set<string> }>();
  for (const w of data.workouts) {
    const seen = new Set<string>();
    for (const e of w.exercises) {
      if (!e.equipmentId) continue;
      const u = m.get(e.equipmentId) ?? { lastUsed: w.date, uses: 0, exercises: new Set<string>() };
      if (w.date > u.lastUsed) u.lastUsed = w.date;
      if (!seen.has(e.equipmentId)) u.uses++;
      seen.add(e.equipmentId);
      u.exercises.add(e.exerciseId);
      m.set(e.equipmentId, u);
    }
  }
  return m;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

export function equipmentChoices(
  data: Pick<AppData, 'equipment' | 'workouts' | 'locations'>,
  opts: { locationId: string | null; exerciseId?: string | null; query?: string; exerciseName?: (id: string) => string },
): EquipmentGroups {
  const usage = equipmentUsage(data);
  const gymName = new Map(data.locations.map((l) => [l.id, l.name]));
  const q = norm(opts.query?.trim() ?? '');
  const matches = (e: Equipment) => {
    if (!q) return true;
    const hay = [e.name, e.manufacturer ?? '', e.model ?? '', gymName.get(e.locationId ?? '') ?? '', ...e.exerciseIds.map((x) => opts.exerciseName?.(x) ?? x)].join(' ');
    return norm(hay).includes(q);
  };
  const choice = (e: Equipment): EquipmentChoice => {
    const u = usage.get(e.id);
    return {
      eq: e,
      lastUsed: u?.lastUsed ?? null,
      uses: u?.uses ?? 0,
      linked: !!opts.exerciseId && (e.exerciseIds.includes(opts.exerciseId) || !!u?.exercises.has(opts.exerciseId)),
      gymName: e.locationId ? gymName.get(e.locationId) ?? null : null,
    };
  };
  const order = (a: EquipmentChoice, b: EquipmentChoice) =>
    Number(b.linked) - Number(a.linked) || (b.lastUsed ?? '').localeCompare(a.lastUsed ?? '') || a.eq.name.localeCompare(b.eq.name);

  const all = data.equipment.filter(matches).map(choice);
  const here = (c: EquipmentChoice) => opts.locationId != null && c.eq.locationId === opts.locationId;
  const local = (c: EquipmentChoice) => here(c) || c.eq.locationId == null;
  const taken = new Set<string>();
  const take = (xs: EquipmentChoice[]) => { xs.forEach((c) => taken.add(c.eq.id)); return xs; };

  const favorites = take(all.filter((c) => c.eq.favorite && local(c)).sort(order));
  const recent = take(
    all.filter((c) => !taken.has(c.eq.id) && local(c) && c.linked && c.lastUsed)
      .sort((a, b) => (b.lastUsed ?? '').localeCompare(a.lastUsed ?? ''))
      .slice(0, 3),
  );
  const thisGym = take(all.filter((c) => !taken.has(c.eq.id) && here(c)).sort(order));
  const unassigned = take(all.filter((c) => !taken.has(c.eq.id) && c.eq.locationId == null).sort(order));
  const otherGyms = all.filter((c) => !taken.has(c.eq.id)).sort((a, b) => (a.gymName ?? '').localeCompare(b.gymName ?? '') || order(a, b));
  return { favorites, recent, thisGym, unassigned, otherGyms };
}
