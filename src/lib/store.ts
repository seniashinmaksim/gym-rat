import { useSyncExternalStore } from 'react';
import type { AppData } from '../domain/appdata';
import { migrateSettings } from '../domain/defaults';
import type {
  BodyMeasurement, DailyLog, Equipment, ExerciseDef, ExerciseOverride, ImportLogEntry, Location, Photo, Settings,
  TrainingBlock, WeeklySnapshot, Workout,
} from '../domain/types';
import { createVault, rewrapVault, unlockVault, type VaultHeader } from './crypto';
import * as db from './db';
import type { RecordKind } from './db';
import { uid } from './id';

export type VaultStatus = 'loading' | 'new' | 'locked' | 'unlocked' | 'unsupported';

export interface StoreState {
  status: VaultStatus;
  data: AppData | null;
  error: string | null;
}

type ArrayField = Exclude<keyof AppData, 'settings'>;
const FIELD: Record<Exclude<RecordKind, 'settings'>, ArrayField> = {
  workout: 'workouts',
  location: 'locations',
  equipment: 'equipment',
  exerciseOverride: 'exerciseOverrides',
  customExercise: 'customExercises',
  photo: 'photos',
  body: 'body',
  daily: 'daily',
  block: 'blocks',
  import: 'imports',
  snapshot: 'snapshots',
};

class Store {
  private state: StoreState = { status: 'loading', data: null, error: null };
  private key: CryptoKey | null = null;
  private header: VaultHeader | null = null;
  private listeners = new Set<() => void>();
  private photoUrls = new Map<string, string>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<StoreState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  async init() {
    if (!globalThis.crypto?.subtle || typeof indexedDB === 'undefined') {
      this.set({ status: 'unsupported', error: 'This browser lacks Web Crypto or IndexedDB (private mode may block it).' });
      return;
    }
    try {
      this.header = await db.readHeader();
      this.set({ status: this.header ? 'locked' : 'new' });
    } catch (e) {
      this.set({ status: 'unsupported', error: (e as Error).message });
    }
  }

  /** Ask the browser not to evict the encrypted data (important on iOS Safari). */
  private requestPersistence() {
    try {
      void navigator.storage?.persist?.();
    } catch {
      /* not supported */
    }
  }

  async setup(password: string) {
    this.requestPersistence();
    const { header, dek } = await createVault(password);
    await db.writeHeader(header);
    this.header = header;
    this.key = dek;
    const settings = migrateSettings(undefined);
    await db.putRecord(dek, 'settings', 'settings', settings);
    this.set({ status: 'unlocked', data: emptyData(settings), error: null });
  }

  async unlock(password: string) {
    if (!this.header) throw new Error('No vault');
    const key = await unlockVault(this.header, password);
    this.requestPersistence();
    this.key = key;
    const data = await this.loadAll(key);
    this.set({ status: 'unlocked', data, error: null });
  }

  private async loadAll(key: CryptoKey): Promise<AppData> {
    const [settings] = await db.loadKind<Settings>(key, 'settings');
    const data = emptyData(migrateSettings(settings));
    for (const [kind, field] of Object.entries(FIELD) as [Exclude<RecordKind, 'settings'>, ArrayField][]) {
      (data[field] as unknown[]) = await db.loadKind(key, kind);
    }
    data.workouts.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    return data;
  }

  lock() {
    this.key = null;
    for (const u of this.photoUrls.values()) URL.revokeObjectURL(u);
    this.photoUrls.clear();
    this.set({ status: this.header ? 'locked' : 'new', data: null });
  }

  async changePassword(oldPw: string, newPw: string) {
    if (!this.header) throw new Error('No vault');
    const next = await rewrapVault(this.header, oldPw, newPw);
    await db.writeHeader(next);
    this.header = next;
  }

  getHeader() {
    return this.header;
  }

  private requireKey(): CryptoKey {
    if (!this.key || !this.state.data) throw new Error('Vault is locked');
    return this.key;
  }

  private async putEntity<T extends { id: string }>(kind: Exclude<RecordKind, 'settings'>, item: T) {
    const key = this.requireKey();
    await db.putRecord(key, kind, item.id, item);
    const field = FIELD[kind];
    const data = this.state.data!;
    const arr = data[field] as unknown as T[];
    const idx = arr.findIndex((x) => x.id === item.id);
    const next = idx >= 0 ? arr.map((x, i) => (i === idx ? item : x)) : [...arr, item];
    if (kind === 'workout') (next as unknown as Workout[]).sort((a, b) => a.date.localeCompare(b.date) || (a.startTime ?? '').localeCompare(b.startTime ?? ''));
    this.set({ data: { ...data, [field]: next } });
  }

  private async removeEntity(kind: Exclude<RecordKind, 'settings'>, id: string) {
    this.requireKey();
    await db.deleteRecord(kind, id);
    const field = FIELD[kind];
    const data = this.state.data!;
    this.set({ data: { ...data, [field]: (data[field] as { id: string }[]).filter((x) => x.id !== id) } });
  }

  saveWorkout = (w: Workout) => this.putEntity('workout', { ...w, updatedAt: new Date().toISOString() });
  deleteWorkout = (id: string) => this.removeEntity('workout', id);
  saveLocation = (l: Location) => this.putEntity('location', l);
  deleteLocation = (id: string) => this.removeEntity('location', id);
  saveEquipment = (e: Equipment) => this.putEntity('equipment', { ...e, updatedAt: new Date().toISOString() });
  deleteEquipment = (id: string) => this.removeEntity('equipment', id);
  saveOverride = (o: ExerciseOverride) => this.putEntity('exerciseOverride', o);
  deleteOverride = (id: string) => this.removeEntity('exerciseOverride', id);
  saveCustomExercise = (e: ExerciseDef) => this.putEntity('customExercise', { ...e, custom: true });
  deleteCustomExercise = (id: string) => this.removeEntity('customExercise', id);
  saveBody = (b: BodyMeasurement) => this.putEntity('body', b);
  deleteBody = (id: string) => this.removeEntity('body', id);
  saveDaily = (d: DailyLog) => this.putEntity('daily', d);
  saveBlock = (b: TrainingBlock) => this.putEntity('block', b);
  deleteBlock = (id: string) => this.removeEntity('block', id);
  addImportLog = (e: ImportLogEntry) => this.putEntity('import', e);
  saveSnapshot = (s: WeeklySnapshot) => this.putEntity('snapshot', s);

  async saveSettings(patch: Partial<Settings>) {
    const key = this.requireKey();
    const settings = { ...this.state.data!.settings, ...patch, id: 'settings' as const };
    await db.putRecord(key, 'settings', 'settings', settings);
    this.set({ data: { ...this.state.data!, settings } });
  }

  /** Encrypts and stores a photo. Images are downscaled before encryption to keep storage small. */
  async addPhoto(file: Blob, meta: Omit<Photo, 'id' | 'mime' | 'takenAt'> & { takenAt?: string }): Promise<Photo> {
    const key = this.requireKey();
    const { bytes, mime, width, height } = await compressImage(file);
    const photo: Photo = { id: uid('ph'), mime, width, height, takenAt: meta.takenAt ?? new Date().toISOString(), ...meta };
    await db.putPhotoBytes(key, photo.id, bytes);
    await this.putEntity('photo', photo);
    return photo;
  }

  async photoUrl(id: string): Promise<string | null> {
    const cached = this.photoUrls.get(id);
    if (cached) return cached;
    const key = this.requireKey();
    const bytes = await db.getPhotoBytes(key, id);
    if (!bytes) return null;
    const mime = this.state.data!.photos.find((p) => p.id === id)?.mime ?? 'image/jpeg';
    const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
    this.photoUrls.set(id, url);
    return url;
  }

  async photoBytes(id: string): Promise<ArrayBuffer | null> {
    return db.getPhotoBytes(this.requireKey(), id);
  }

  async deletePhoto(id: string) {
    await db.deletePhotoBytes(id);
    const u = this.photoUrls.get(id);
    if (u) URL.revokeObjectURL(u);
    this.photoUrls.delete(id);
    await this.removeEntity('photo', id);
  }

  /** Replace ALL data (backup restore). Re-encrypts everything with the current vault key. */
  async replaceAll(data: AppData, photos: { id: string; bytes: Uint8Array }[]) {
    const key = this.requireKey();
    await db.clearDataKeepHeader();
    const items: { kind: RecordKind; id: string; value: unknown }[] = [{ kind: 'settings', id: 'settings', value: migrateSettings(data.settings) }];
    for (const [kind, field] of Object.entries(FIELD) as [Exclude<RecordKind, 'settings'>, ArrayField][]) {
      for (const it of (data[field] as { id: string }[]) ?? []) items.push({ kind, id: it.id, value: it });
    }
    await db.putRecords(key, items);
    for (const p of photos) await db.putPhotoBytes(key, p.id, p.bytes);
    this.set({ data: await this.loadAll(key) });
  }

  async eraseEverything() {
    await db.wipeAll();
    this.header = null;
    this.key = null;
    this.set({ status: 'new', data: null });
  }
}

export function emptyData(settings: Settings): AppData {
  return {
    settings, workouts: [], locations: [], equipment: [], exerciseOverrides: [], customExercises: [], photos: [], body: [],
    daily: [], blocks: [], imports: [], snapshots: [],
  };
}

async function compressImage(file: Blob): Promise<{ bytes: Uint8Array; mime: string; width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', 0.85));
    // Re-encoding through canvas also strips EXIF metadata (e.g. GPS) before storage.
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', width: w, height: h };
  } catch {
    return { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type || 'application/octet-stream' };
  }
}

export const store = new Store();

export function useStore(): StoreState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useData(): AppData {
  const s = useStore();
  if (!s.data) throw new Error('Vault locked');
  return s.data;
}
