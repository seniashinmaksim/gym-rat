/** Machine picker: gym-scoped equipment memory. Synthetic data only. */
import { describe, expect, it } from 'vitest';
import { equipmentChoices } from '../src/domain/equipmentMemory';
import { loadStep } from '../src/domain/increments';
import type { Equipment } from '../src/domain/types';
import { data, ex, set, workout } from './fixtures';

const eq = (id: string, locationId: string | null, extra: Partial<Equipment> = {}): Equipment => ({
  id, locationId, name: id, kind: 'machine', identified: false, incrementsKg: [5], settings: {}, exerciseIds: [], photoIds: [], createdAt: '', updatedAt: '', ...extra,
});
const gyms = [{ id: 'gym_a', name: 'Gym A', photoIds: [], createdAt: '' }, { id: 'gym_b', name: 'Gym B', photoIds: [], createdAt: '' }];

describe('equipment memory by gym', () => {
  const equipment = [
    eq('pecdeck_a', 'gym_a', { exerciseIds: ['pec_deck'], settings: { seat: '4' } }),
    eq('legext_a', 'gym_a', { exerciseIds: ['leg_extension'] }),
    eq('pecdeck_b', 'gym_b', { exerciseIds: ['pec_deck'] }),
    eq('ezbar', null, { kind: 'barbell', exerciseIds: ['ez_bar_curl'] }),
    eq('fav_cable_a', 'gym_a', { favorite: true }),
  ];
  const ws = [
    workout('2026-11-02', [ex('pec_deck', [set(45, 10)], 'pecdeck_a')]),
    workout('2026-11-09', [ex('leg_extension', [set(50, 12)], 'legext_a')]),
  ];
  const d = data(ws, { equipment, locations: gyms });

  it("offers this gym's machines (recent for the exercise first) and never another gym's by default", () => {
    const g = equipmentChoices(d, { locationId: 'gym_a', exerciseId: 'pec_deck' });
    expect(g.favorites.map((c) => c.eq.id)).toEqual(['fav_cable_a']);
    expect(g.recent.map((c) => c.eq.id)).toEqual(['pecdeck_a']);
    expect(g.recent[0].lastUsed).toBe('2026-11-02');
    expect(g.recent[0].eq.settings.seat).toBe('4'); // settings travel with the record
    expect(g.thisGym.map((c) => c.eq.id)).toEqual(['legext_a']);
    expect(g.unassigned.map((c) => c.eq.id)).toEqual(['ezbar']);
    expect(g.otherGyms.map((c) => c.eq.id)).toEqual(['pecdeck_b']);
  });

  it('at Gym B, Gym A equipment is only under "other gyms"', () => {
    const g = equipmentChoices(d, { locationId: 'gym_b', exerciseId: 'pec_deck' });
    const local = [...g.favorites, ...g.recent, ...g.thisGym].map((c) => c.eq.id);
    expect(local).toEqual(['pecdeck_b']);
    expect(local).not.toContain('pecdeck_a');
    expect(g.otherGyms.map((c) => c.eq.id).sort()).toEqual(['fav_cable_a', 'legext_a', 'pecdeck_a']);
    expect(g.otherGyms.every((c) => c.gymName === 'Gym A')).toBe(true);
  });

  it('search matches name, maker, model, gym and linked exercise', () => {
    const d2 = data(ws, { equipment: [eq('x', 'gym_a', { name: 'Chest fly', manufacturer: 'Technogym' })], locations: gyms });
    expect(equipmentChoices(d2, { locationId: 'gym_a', query: 'techno' }).thisGym).toHaveLength(1);
    expect(equipmentChoices(d2, { locationId: 'gym_a', query: 'matrix' }).thisGym).toHaveLength(0);
  });

  it('every machine appears exactly once', () => {
    const g = equipmentChoices(d, { locationId: 'gym_a', exerciseId: 'pec_deck' });
    const ids = Object.values(g).flat().map((c) => c.eq.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(equipment.map((e) => e.id).sort());
  });
});

describe('real load steps', () => {
  it('equipment increments → gym dumbbell steps → default', () => {
    expect(loadStep({ incrementsKg: [2.5, 5] }, null, 'machine')).toEqual({ step: 2.5, source: 'equipment' });
    expect(loadStep(null, { freeWeightIncrementsKg: [2.5] }, 'dumbbell')).toEqual({ step: 2.5, source: 'gym_free_weights' });
    expect(loadStep(null, { freeWeightIncrementsKg: [2.5] }, 'machine').source).toBe('default');
    expect(loadStep(null, null, 'dumbbell')).toEqual({ step: 2, source: 'default' });
  });
});
