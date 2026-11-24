import type { AppData } from '../domain/appdata';
import { fromB64, openWithPassword, sealWithPassword, toB64 } from './crypto';
import { L } from '../i18n/core';

/**
 * Encrypted backup file format (".gymrat-backup.json"):
 * {
 *   "format": "gymrat-backup", "version": 1, "createdAt": ISO,
 *   "kdf": "PBKDF2-SHA-256", "iterations": 600000, "salt": b64, "iv": b64, "ct": b64
 * }
 * The ciphertext contains { data: AppData, photos: [{ id, b64 }] }.
 * The backup password may differ from the vault password.
 */

export interface BackupFile {
  format: 'gymrat-backup';
  version: 1;
  createdAt: string;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
}

export interface BackupPayload {
  data: AppData;
  photos: { id: string; b64: string }[];
}

export async function createBackup(data: AppData, photoBytes: (id: string) => Promise<ArrayBuffer | null>, password: string): Promise<BackupFile> {
  const photos: BackupPayload['photos'] = [];
  for (const p of data.photos) {
    const b = await photoBytes(p.id);
    if (b) photos.push({ id: p.id, b64: toB64(b) });
  }
  const payload: BackupPayload = { data, photos };
  const sealed = await sealWithPassword(password, new TextEncoder().encode(JSON.stringify(payload)));
  return { format: 'gymrat-backup', version: 1, createdAt: new Date().toISOString(), kdf: 'PBKDF2-SHA-256', ...sealed };
}

export async function readBackup(text: string, password: string): Promise<{ data: AppData; photos: { id: string; bytes: Uint8Array }[] }> {
  let file: BackupFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error(L('Not a backup file (invalid JSON).', 'Это не файл резервной копии (некорректный JSON).'));
  }
  if (file.format !== 'gymrat-backup' || file.version !== 1) throw new Error(L('Unsupported backup format.', 'Формат резервной копии не поддерживается.'));
  const bytes = await openWithPassword(password, file);
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as BackupPayload;
  if (!payload?.data?.settings || !Array.isArray(payload.data.workouts)) throw new Error(L('Backup content is malformed.', 'Содержимое резервной копии повреждено.'));
  return { data: payload.data, photos: payload.photos.map((p) => ({ id: p.id, bytes: fromB64(p.b64) })) };
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
