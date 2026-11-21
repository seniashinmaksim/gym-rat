import Dexie, { type Table } from 'dexie';
import { openBytes, openJson, sealBytes, sealJson, type Sealed, type VaultHeader } from './crypto';

/**
 * IndexedDB layout. Only the vault header is plaintext (salt, KDF params, wrapped key).
 * Every entity and every photo is AES-256-GCM encrypted before it reaches IndexedDB.
 * Record kinds are visible (needed to load by type); contents, dates, names are not.
 */

export type RecordKind =
  | 'settings'
  | 'workout'
  | 'location'
  | 'equipment'
  | 'exerciseOverride'
  | 'customExercise'
  | 'photo'
  | 'body'
  | 'daily'
  | 'block'
  | 'import'
  | 'snapshot';

export const RECORD_KINDS: RecordKind[] = [
  'settings', 'workout', 'location', 'equipment', 'exerciseOverride', 'customExercise',
  'photo', 'body', 'daily', 'block', 'import', 'snapshot',
];

interface MetaRow { key: string; value: VaultHeader }
interface EncRow extends Sealed { kind: RecordKind; id: string }
interface BlobRow { id: string; iv: Uint8Array; ct: ArrayBuffer }

class GymRatDB extends Dexie {
  meta!: Table<MetaRow, string>;
  records!: Table<EncRow, [RecordKind, string]>;
  blobs!: Table<BlobRow, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      meta: '&key',
      records: '&[kind+id], kind',
      blobs: '&id',
    });
  }
}

let db: GymRatDB | null = null;
let dbName = 'gymrat';

/** Tests use a separate database name. */
export function useDatabase(name: string) {
  if (db) db.close();
  db = null;
  dbName = name;
}

function getDb(): GymRatDB {
  if (!db) db = new GymRatDB(dbName);
  return db;
}

const aad = (kind: string, id: string) => `gymrat:${kind}:${id}`;

export async function readHeader(): Promise<VaultHeader | null> {
  const row = await getDb().meta.get('vault');
  return row?.value ?? null;
}

export async function writeHeader(header: VaultHeader): Promise<void> {
  await getDb().meta.put({ key: 'vault', value: header });
}

export async function putRecord(key: CryptoKey, kind: RecordKind, id: string, value: unknown): Promise<void> {
  const sealed = await sealJson(key, value, aad(kind, id));
  await getDb().records.put({ kind, id, ...sealed });
}

export async function putRecords(key: CryptoKey, items: { kind: RecordKind; id: string; value: unknown }[]): Promise<void> {
  const rows: EncRow[] = [];
  for (const it of items) rows.push({ kind: it.kind, id: it.id, ...(await sealJson(key, it.value, aad(it.kind, it.id))) });
  await getDb().records.bulkPut(rows);
}

export async function deleteRecord(kind: RecordKind, id: string): Promise<void> {
  await getDb().records.delete([kind, id]);
}

export async function loadKind<T>(key: CryptoKey, kind: RecordKind): Promise<T[]> {
  const rows = await getDb().records.where('kind').equals(kind).toArray();
  const out: T[] = [];
  for (const r of rows) out.push(await openJson<T>(key, r, aad(kind, r.id)));
  return out;
}

export async function putPhotoBytes(key: CryptoKey, id: string, bytes: Uint8Array): Promise<void> {
  const { iv, ct } = await sealBytes(key, bytes, aad('blob', id));
  await getDb().blobs.put({ id, iv, ct });
}

export async function getPhotoBytes(key: CryptoKey, id: string): Promise<ArrayBuffer | null> {
  const row = await getDb().blobs.get(id);
  if (!row) return null;
  return openBytes(key, new Uint8Array(row.iv), row.ct, aad('blob', id));
}

export async function deletePhotoBytes(id: string): Promise<void> {
  await getDb().blobs.delete(id);
}

export async function allPhotoIds(): Promise<string[]> {
  return (await getDb().blobs.toCollection().primaryKeys()) as string[];
}

/** Irreversibly removes all local data (used by "Erase all data" and backup restore). */
export async function wipeAll(): Promise<void> {
  const d = getDb();
  await d.transaction('rw', d.meta, d.records, d.blobs, async () => {
    await d.meta.clear();
    await d.records.clear();
    await d.blobs.clear();
  });
}

export async function clearDataKeepHeader(): Promise<void> {
  const d = getDb();
  await d.transaction('rw', d.records, d.blobs, async () => {
    await d.records.clear();
    await d.blobs.clear();
  });
}

/** Raw (still encrypted) rows — used by tests to verify nothing is stored in plaintext. */
export async function rawRecordRows(): Promise<unknown[]> {
  return getDb().records.toArray();
}
