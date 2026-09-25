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

// Black and white only, and both are needed.
//
// A one-colour icon disappears on some browser theme or other: black vanishes
// on a dark toolbar, white on a light one. So the mark is white on a black
// rounded square — still only two colours, readable on every toolbar, and the
// mark's own cut-outs (the eye, the pupil) show the black beneath them rather
// than whatever colour the toolbar happens to be. It used to be blue, matching
// an accent from a popup design that no longer exists.
const MARK = [0xff, 0xff, 0xff];
const BADGE = [0x00, 0x00, 0x00];

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

/** True when a point in icon pixels falls inside the rounded badge. */
function inBadge(x, y, size) {
  const r = 0.22 * size; // corner radius — rounded, not a circle, like other toolbar icons
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/**
 * Render one icon, supersampling 4x4 per pixel to keep the edges smooth.
 *
 * The geometry itself lives in logo.mjs and is shared with the SVG files, so
 * the toolbar icon and every other appearance of the mark cannot drift apart.
 *
 * Each sample is white (inside the mark), black (inside the badge but not the
 * mark), or transparent (outside both). The pixel is the average, blended in
 * premultiplied form so the white-to-black edge does not pick up a grey fringe
 * from the transparent corners.
 */
function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 4;
  const inset = 0.17 * size; // the mark sits inside the badge with room around it
  const scale = LOGO_SIZE / (size - 2 * inset);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let alpha = 0;
      const colour = [0, 0, 0];

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;

          let ink = null;
          if (covers((px - inset) * scale, (py - inset) * scale)) ink = MARK;
          else if (inBadge(px, py, size)) ink = BADGE;
          if (!ink) continue;

          alpha += 1;
          colour[0] += ink[0];
          colour[1] += ink[1];
          colour[2] += ink[2];
        }
      }

      if (alpha === 0) continue; // stays fully transparent

      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(colour[0] / alpha);
      rgba[offset + 1] = Math.round(colour[1] / alpha);
      rgba[offset + 2] = Math.round(colour[2] / alpha);
      rgba[offset + 3] = Math.round((alpha / (samples * samples)) * 255);
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
