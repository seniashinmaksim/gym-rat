/** Random, collision-resistant ids (not derived from personal data). */
export function uid(prefix = 'id'): string {
  const b = new Uint8Array(9);
  globalThis.crypto.getRandomValues(b);
  const s = Array.from(b, (x) => x.toString(36).padStart(2, '0')).join('').slice(0, 12);
  return `${prefix}_${s}`;
}

export function slugId(name: string, prefix: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9а-я]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return `${prefix}_${base || 'item'}_${uid('x').slice(2, 6)}`;
}
