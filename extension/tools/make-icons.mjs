/**
 * Generates the extension icon set.
 *
 * The icons are built from source rather than committed as binaries so the
 * whole repository stays reviewable — there is no opaque image blob anyone has
 * to take on trust. Uses only Node built-ins (zlib for the PNG deflate stream),
 * so it adds no dependency to the project.
 *
 * Run with `npm run icons`; the build script does this automatically.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIZE as LOGO_SIZE, covers, toSvg } from './logo.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];

// Matches --accent in popup.css, so the toolbar icon and the popup read as one
// piece of design.
const INK = [0x25, 0x63, 0xeb];

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Encode raw RGBA pixels as an 8-bit truecolour-with-alpha PNG. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // bytes 10-12: deflate compression, adaptive filtering, no interlace (all 0)

  // Each scanline is prefixed with its filter byte; filter 0 (none) keeps this
  // simple and the images are far too small for the compression to matter.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Rendering --------------------------------------------------------------

/**
 * Render one icon, supersampling 4x4 per pixel to keep the edges smooth.
 *
 * The geometry itself lives in logo.mjs and is shared with the SVG files, so
 * the toolbar icon and every other appearance of the mark cannot drift apart.
 */
function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4;
  const inset = 0.06 * size; // breathing room so the glyph isn't flush to the edge
  const scale = LOGO_SIZE / (size - 2 * inset);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const lx = (x + (sx + 0.5) / samples - inset) * scale;
          const ly = (y + (sy + 0.5) / samples - inset) * scale;
          if (covers(lx, ly)) hits += 1;
        }
      }

      if (hits === 0) continue; // stays fully transparent

      const offset = (y * size + x) * 4;
      rgba[offset] = INK[0];
      rgba[offset + 1] = INK[1];
      rgba[offset + 2] = INK[2];
      rgba[offset + 3] = Math.round((hits / (samples * samples)) * 255);
    }
  }

  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

for (const size of SIZES) {
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, renderIcon(size));
  console.log(`wrote ${file}`);
}

// Both colourways, from the same geometry. Which one a surface uses is its own
// decision — the popup switches on the colour scheme, print picks by paper.
for (const [name, colour] of [['black', '#000000'], ['white', '#ffffff']]) {
  const file = join(OUT_DIR, `shield-${name}.svg`);
  writeFileSync(file, toSvg(colour));
  console.log(`wrote ${file}`);
}
