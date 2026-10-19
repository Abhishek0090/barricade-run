#!/usr/bin/env node
// Draws the app icons (road, police barricade, siren lights) and writes them as PNG.
// Run: npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Colour at (u, v) in 0..1. `pad` shrinks the artwork towards the centre (maskable safe zone). */
function shade(u, v, pad) {
  const top = [26, 16, 51];
  const glow = [240, 138, 75];
  let c = mix(top, glow, Math.min(1, Math.max(0, v / 0.55)) ** 1.6);

  const x = 0.5 + (u - 0.5) / (1 - pad * 2);
  const y = 0.5 + (v - 0.5) / (1 - pad * 2);
  const horizon = 0.42;

  if (y > horizon) {
    c = [28, 24, 32];
    const half = (y - horizon) * 0.95 + 0.015;
    if (Math.abs(x - 0.5) < half) {
      c = [52, 50, 58];
      const lane = half / 3;
      for (const lx of [-lane, lane]) {
        const dash = Math.floor((y - horizon) * 30) % 2 === 0;
        if (dash && Math.abs(x - 0.5 - lx) < 0.006 + (y - horizon) * 0.02) c = [230, 230, 230];
      }
    } else if (Math.abs(x - 0.5) < half + 0.03) {
      c = Math.floor((y - horizon) * 40) % 2 === 0 ? [255, 204, 0] : [34, 34, 34];
    }
  }

  // Barricade board with red/white diagonal stripes and two legs.
  const bx0 = 0.2, bx1 = 0.8, by0 = 0.52, by1 = 0.64;
  if (y > by1 && y < 0.82 && (Math.abs(x - 0.27) < 0.022 || Math.abs(x - 0.73) < 0.022)) c = [40, 40, 44];
  if (x > bx0 && x < bx1 && y > by0 && y < by1) {
    c = Math.floor((x + y) * 14) % 2 === 0 ? [214, 40, 40] : [245, 245, 245];
  }
  if (x > 0.26 && x < 0.74 && y > 0.7 && y < 0.75) {
    c = Math.floor((x + y) * 14) % 2 === 0 ? [214, 40, 40] : [245, 245, 245];
  }

  // Siren lights.
  const dRed = Math.hypot(x - 0.36, y - 0.3);
  const dBlue = Math.hypot(x - 0.64, y - 0.3);
  if (dRed < 0.16) c = mix(c, [255, 45, 85], Math.max(0, 1 - dRed / 0.16) ** 1.5);
  if (dBlue < 0.16) c = mix(c, [45, 125, 255], Math.max(0, 1 - dBlue / 0.16) ** 1.5);
  if (dRed < 0.07) c = [255, 45, 85];
  if (dBlue < 0.07) c = [45, 125, 255];
  return c;
}

function draw(size, pad = 0) {
  const out = Buffer.alloc(size * size * 3);
  const ss = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, pad);
          acc = acc.map((v, i) => v + c[i]);
        }
      }
      const o = (py * size + px) * 3;
      for (let i = 0; i < 3; i++) out[o + i] = Math.round(acc[i] / (ss * ss));
    }
  }
  return png(size, out);
}

const targets = [
  ["public/icon-192.png", 192, 0],
  ["public/icon-512.png", 512, 0],
  ["public/icon-maskable-512.png", 512, 0.1],
  ["src/app/icon.png", 64, 0],
  ["src/app/apple-icon.png", 180, 0.06],
];
for (const [path, size, pad] of targets) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, draw(size, pad));
  console.log("wrote", path);
}
