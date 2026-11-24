/**
 * Client-side encryption (Web Crypto API only — no third-party crypto code).
 *
 * Key hierarchy
 *   password ──PBKDF2-SHA-256 (600k iters, 16-byte random salt)──▶ KEK (AES-256-GCM, non-extractable)
 *   random 256-bit DEK ──AES-GCM(KEK)──▶ wrapped DEK (stored)
 *   every record / photo ──AES-256-GCM(DEK, fresh 96-bit IV, AAD = record slot)──▶ ciphertext
 *
 * - The password and the KEK are never stored.
 * - The unwrapped DEK is imported as NON-extractable and kept only in memory while unlocked.
 * - Changing the password re-wraps the DEK; records do not need re-encryption.
 * - AAD binds each ciphertext to its table+id so blobs cannot be swapped between records.
 */

import { L } from '../i18n/core';

export const KDF_ITERATIONS = 600_000; // OWASP 2023 guidance for PBKDF2-HMAC-SHA256
const enc = new TextEncoder();
const dec = new TextDecoder();

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error(L('Web Crypto is unavailable. Use a modern browser over HTTPS or localhost.', 'Web Crypto недоступен. Откройте приложение в современном браузере по HTTPS или на localhost.'));
  return c.subtle;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/** Copy into a fresh ArrayBuffer-backed view (keeps TS's BufferSource typing happy everywhere). */
function buf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(u.byteLength));
  out.set(u);
  return out;
}

export async function deriveKek(password: string, salt: Uint8Array, iterations = KDF_ITERATIONS): Promise<CryptoKey> {
  if (password.length < 1) throw new Error(L('Empty password', 'Пустой пароль'));
  const base = await subtle().importKey('raw', buf(enc.encode(password.normalize('NFKC'))), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface Sealed {
  iv: string; // base64, 12 bytes
  ct: string; // base64 ciphertext + 16-byte GCM tag
}

export async function sealBytes(key: CryptoKey, data: Uint8Array, aad?: string): Promise<{ iv: Uint8Array; ct: ArrayBuffer }> {
  const iv = randomBytes(12);
  const params: AesGcmParams = { name: 'AES-GCM', iv: buf(iv) };
  if (aad) params.additionalData = buf(enc.encode(aad));
  const ct = await subtle().encrypt(params, key, buf(data));
  return { iv, ct };
}

export async function openBytes(key: CryptoKey, iv: Uint8Array, ct: ArrayBuffer | Uint8Array, aad?: string): Promise<ArrayBuffer> {
  const params: AesGcmParams = { name: 'AES-GCM', iv: buf(iv) };
  if (aad) params.additionalData = buf(enc.encode(aad));
  const data = ct instanceof Uint8Array ? buf(ct) : ct;
  return subtle().decrypt(params, key, data);
}

export async function sealJson(key: CryptoKey, value: unknown, aad?: string): Promise<Sealed> {
  const { iv, ct } = await sealBytes(key, enc.encode(JSON.stringify(value)), aad);
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function openJson<T>(key: CryptoKey, sealed: Sealed, aad?: string): Promise<T> {
  const pt = await openBytes(key, fromB64(sealed.iv), fromB64(sealed.ct), aad);
  return JSON.parse(dec.decode(pt)) as T;
}

/** Vault header persisted in plaintext. Contains no secrets. */
export interface VaultHeader {
  version: 1;
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  salt: string; // base64
  wrappedDek: Sealed;
  createdAt: string;
  passwordChangedAt: string;
}

const DEK_AAD = 'gymrat:dek:v1';

async function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', buf(raw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function createVault(password: string, iterations = KDF_ITERATIONS): Promise<{ header: VaultHeader; dek: CryptoKey }> {
  const salt = randomBytes(16);
  const kek = await deriveKek(password, salt, iterations);
  const rawDek = randomBytes(32);
  const { iv, ct } = await sealBytes(kek, rawDek, DEK_AAD);
  const dek = await importDek(rawDek);
  rawDek.fill(0);
  const now = new Date().toISOString();
  return {
    header: {
      version: 1,
      kdf: 'PBKDF2-SHA-256',
      iterations,
      salt: toB64(salt),
      wrappedDek: { iv: toB64(iv), ct: toB64(ct) },
      createdAt: now,
      passwordChangedAt: now,
    },
    dek,
  };
}

export class WrongPasswordError extends Error {
  constructor() {
    super(L('Incorrect password', 'Неверный пароль'));
    this.name = 'WrongPasswordError';
  }
}

async function unwrapRaw(header: VaultHeader, password: string): Promise<Uint8Array> {
  const kek = await deriveKek(password, fromB64(header.salt), header.iterations);
  try {
    const raw = await openBytes(kek, fromB64(header.wrappedDek.iv), fromB64(header.wrappedDek.ct), DEK_AAD);
    return new Uint8Array(raw);
  } catch {
    throw new WrongPasswordError();
  }
}

export async function unlockVault(header: VaultHeader, password: string): Promise<CryptoKey> {
  const raw = await unwrapRaw(header, password);
  const dek = await importDek(raw);
  raw.fill(0);
  return dek;
}

export async function rewrapVault(header: VaultHeader, oldPassword: string, newPassword: string): Promise<VaultHeader> {
  const raw = await unwrapRaw(header, oldPassword);
  const salt = randomBytes(16);
  const kek = await deriveKek(newPassword, salt, KDF_ITERATIONS);
  const { iv, ct } = await sealBytes(kek, raw, DEK_AAD);
  raw.fill(0);
  return {
    ...header,
    iterations: KDF_ITERATIONS,
    salt: toB64(salt),
    wrappedDek: { iv: toB64(iv), ct: toB64(ct) },
    passwordChangedAt: new Date().toISOString(),
  };
}

/** Password-only encryption for portable backups (independent of the vault DEK). */
export async function sealWithPassword(password: string, data: Uint8Array): Promise<{ salt: string; iterations: number; iv: string; ct: string }> {
  const salt = randomBytes(16);
  const kek = await deriveKek(password, salt, KDF_ITERATIONS);
  const { iv, ct } = await sealBytes(kek, data, 'gymrat:backup:v1');
  return { salt: toB64(salt), iterations: KDF_ITERATIONS, iv: toB64(iv), ct: toB64(ct) };
}

export async function openWithPassword(password: string, sealed: { salt: string; iterations: number; iv: string; ct: string }): Promise<Uint8Array> {
  const kek = await deriveKek(password, fromB64(sealed.salt), sealed.iterations);
  try {
    return new Uint8Array(await openBytes(kek, fromB64(sealed.iv), fromB64(sealed.ct), 'gymrat:backup:v1'));
  } catch {
    throw new WrongPasswordError();
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const h = await subtle().digest('SHA-256', buf(enc.encode(text)));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; hint: string } {
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.split(/\s+/).length >= 4 && pw.length >= 20) score = 4;
  const hints = [L('Too short', 'Слишком короткий'), L('Weak', 'Слабый'), L('Fair', 'Средний'), L('Good', 'Хороший'), L('Strong', 'Надёжный')];
  return { score: Math.min(score, 4) as 0 | 1 | 2 | 3 | 4, hint: hints[Math.min(score, 4)] };
}
