import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createVault, openJson, rewrapVault, sealJson, unlockVault, WrongPasswordError, openWithPassword, sealWithPassword } from '../src/lib/crypto';
import * as db from '../src/lib/db';

const FAST = 1000; // low iteration count for test speed only

describe('vault crypto', () => {
  it('round-trips and rejects wrong passwords', async () => {
    const { header, dek } = await createVault('correct horse battery staple', FAST);
    const sealed = await sealJson(dek, { secret: 42 }, 'workout:1');
    const dek2 = await unlockVault(header, 'correct horse battery staple');
    expect(await openJson(dek2, sealed, 'workout:1')).toEqual({ secret: 42 });
    await expect(unlockVault(header, 'wrong')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('uses unique IVs and salts', async () => {
    const a = await createVault('pw', FAST);
    const b = await createVault('pw', FAST);
    expect(a.header.salt).not.toBe(b.header.salt);
    const s1 = await sealJson(a.dek, 'x');
    const s2 = await sealJson(a.dek, 'x');
    expect(s1.iv).not.toBe(s2.iv);
    expect(s1.ct).not.toBe(s2.ct);
  });

  it('binds ciphertext to its record slot (AAD)', async () => {
    const { dek } = await createVault('pw', FAST);
    const sealed = await sealJson(dek, { a: 1 }, 'workout:1');
    await expect(openJson(dek, sealed, 'workout:2')).rejects.toThrow();
  });

  it('detects tampering', async () => {
    const { dek } = await createVault('pw', FAST);
    const sealed = await sealJson(dek, { a: 1 });
    const bytes = atob(sealed.ct);
    const flipped = btoa(String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1));
    await expect(openJson(dek, { ...sealed, ct: flipped })).rejects.toThrow();
  });

  it('password change re-wraps the same data key', async () => {
    const { header, dek } = await createVault('old-password', FAST);
    const sealed = await sealJson(dek, 'payload');
    const next = await rewrapVault(header, 'old-password', 'new-password');
    expect(next.salt).not.toBe(header.salt);
    const k = await unlockVault(next, 'new-password');
    expect(await openJson(k, sealed)).toBe('payload');
    await expect(unlockVault(next, 'old-password')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('header contains no plaintext key material', async () => {
    const secret = 'Distinctive-Passphrase-XYZ';
    const { header } = await createVault(secret, FAST);
    const json = JSON.stringify(header);
    expect(json).not.toContain(secret);
    expect(Object.keys(header).sort()).toEqual(['createdAt', 'iterations', 'kdf', 'passwordChangedAt', 'salt', 'version', 'wrappedDek']);
  });

  it('backup encryption round-trips and rejects wrong passwords', async () => {
    const data = new TextEncoder().encode('{"hello":"world"}');
    const sealed = await sealWithPassword('backup-pw', data);
    expect(new TextDecoder().decode(await openWithPassword('backup-pw', sealed))).toBe('{"hello":"world"}');
    await expect(openWithPassword('nope', sealed)).rejects.toBeInstanceOf(WrongPasswordError);
  }, 20000);
});

describe('encrypted storage', () => {
  it('stores only ciphertext in IndexedDB', async () => {
    db.useDatabase('gymrat-test-' + Math.random());
    const { header, dek } = await createVault('pw', FAST);
    await db.writeHeader(header);
    await db.putRecord(dek, 'workout', 'w1', { date: '2026-11-21', note: 'VERY-PRIVATE-NOTE' });
    const raw = JSON.stringify(await db.rawRecordRows());
    expect(raw).not.toContain('VERY-PRIVATE-NOTE');
    expect(raw).not.toContain('2026-11-21');
    await db.putPhotoBytes(dek, 'p1', new Uint8Array([1, 2, 3]));
    expect(new Uint8Array((await db.getPhotoBytes(dek, 'p1'))!)).toEqual(new Uint8Array([1, 2, 3]));
  });
});
