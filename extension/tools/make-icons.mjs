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

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];

// Matches --accent in popup.css, so the toolbar icon and the popup read as one
// piece of design.
const SHIELD = [0x25, 0x63, 0xeb];
// The bar across the shield is the redaction itself — the product in one glyph.
const BAR = [0xff, 0xff, 0xff];

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

// --- Shield geometry --------------------------------------------------------

/** Radius of the rounded top shoulders, in normalised units. */
const SHOULDER_X = 0.28;
const SHOULDER_Y = 0.16;

/** Where the straight sides give way to the taper. */
const TAPER_START = 0.44;

/**
 * Half-width of the shield at vertical position `t` (0 at the top edge, 1 at
 * the bottom point).
 *
 * Straight sides down to TAPER_START, then a taper that reaches zero with a
 * steep slope so the bottom closes to a point rather than a rounded bowl.
 */
function halfWidthAt(t) {
  if (t < 0 || t > 1) return 0;
  if (t <= TAPER_START) return 1;
  const k = (t - TAPER_START) / (1 - TAPER_START);
  return Math.max(0, 1 - Math.pow(k, 3));
}

/** Is (nx, ny) inside the shield outline, shoulders included? */
function insideShield(nx, ny) {
  const ax = Math.abs(nx);
  const halfWidth = halfWidthAt(ny);
  if (ax > halfWidth) return false;

  // Round off the two top corners so the silhouette reads as a shield rather
  // than a rectangle with a pointed bottom.
  if (ny < SHOULDER_Y && ax > 1 - SHOULDER_X) {
    const dx = (ax - (1 - SHOULDER_X)) / SHOULDER_X;
    const dy = (SHOULDER_Y - ny) / SHOULDER_Y;
    return dx * dx + dy * dy <= 1;
  }
  return true;
}

/** Which layer covers the point (nx, ny), in normalised -1..1 / 0..1 space. */
function sample(nx, ny) {
  if (!insideShield(nx, ny)) return null;

  // The redaction bar sits on the shield with a clear margin on both sides, so
  // it reads as something laid over the shield rather than a gap slicing it in
  // two. The margin is proportional to the shield's width at that height, which
  // keeps it centred as the sides taper.
  const inBarBand = ny > 0.42 && ny < 0.58;
  if (inBarBand && Math.abs(nx) < halfWidthAt(ny) - 0.28) return BAR;

  return SHIELD;
}

/** Render one icon, supersampling 4x4 per pixel to keep the edges smooth. */
function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4;
  const inset = 0.08 * size; // breathing room so the glyph isn't flush to the edge

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const nx = ((px - size / 2) / (size / 2 - inset));
          const ny = (py - inset) / (size - 2 * inset);

          const colour = sample(nx, ny);
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            hits += 1;
          }
        }
      }

      const offset = (y * size + x) * 4;
      if (hits > 0) {
        rgba[offset] = Math.round(r / hits);
        rgba[offset + 1] = Math.round(g / hits);
        rgba[offset + 2] = Math.round(b / hits);
        rgba[offset + 3] = Math.round((hits / (samples * samples)) * 255);
      }
      // Untouched pixels stay fully transparent (Buffer.alloc zeroes them).
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
