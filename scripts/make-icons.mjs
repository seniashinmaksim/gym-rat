// Generates the PWA / Home Screen icon PNGs into public/ (no dependencies).
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    let c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, fullBleed) {
  const px = Buffer.alloc(size * size * 4);
  const pad = fullBleed ? size * 0.12 : 0;
  const s = (size - 2 * pad) / 32;
  const radius = fullBleed ? 0 : (7 * size) / 32;
  const rects = [
    [5, 13, 4, 6, [20, 184, 166]], [23, 13, 4, 6, [20, 184, 166]],
    [9, 10, 3, 12, [94, 234, 212]], [20, 10, 3, 12, [94, 234, 212]], [12, 15, 8, 2, [94, 234, 212]],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let col = [15, 17, 22];
      let a = 255;
      if (!fullBleed) {
        const cx = Math.min(Math.max(x + 0.5, radius), size - radius);
        const cy = Math.min(Math.max(y + 0.5, radius), size - radius);
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > radius) a = 0;
      }
      const u = (x + 0.5 - pad) / s;
      const v = (y + 0.5 - pad) / s;
      for (const [rx, ry, rw, rh, c] of rects) if (u >= rx && u < rx + rw && v >= ry && v < ry + rh) col = c;
      px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = a;
    }
  }
  const row = size * 4 + 1;
  const raw = Buffer.alloc(row * size);
  for (let y = 0; y < size; y++) px.copy(raw, y * row + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icon-180.png', png(180, true)); // iOS applies its own rounding
writeFileSync('public/icon-192.png', png(192, false));
writeFileSync('public/icon-512.png', png(512, false));
writeFileSync('public/icon-maskable-512.png', png(512, true));
console.log('icons written');
