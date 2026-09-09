/**
 * Copies the Tesseract worker and WASM core out of node_modules into
 * public/tesseract/, from where the build copies them into dist/.
 *
 * Everything the OCR pass needs is served from the extension itself, never a
 * CDN — the same rule the ONNX runtime follows, for the same two reasons, and
 * the second is the one that matters:
 *
 *   1. A CDN fetch fails the moment the machine is offline, which during a live
 *      demo is plausible and unacceptable.
 *   2. Shield's whole claim is that screen understanding happens on-device.
 *      Tesseract is handed crops of the user's screen — potentially a
 *      photographed ID card. Pulling the engine that processes those pixels
 *      from a third-party origin at run time would put that origin inside a
 *      privacy-critical path. "Local" has to mean the whole engine, not just
 *      the part that is convenient to bundle.
 *
 * Tesseract's default configuration fetches all three of these from unpkg and
 * jsdelivr. Our CSP forbids it, which is the correct outcome arrived at for the
 * right reason: the policy is what stops a careless default from quietly
 * shipping screen contents to a CDN.
 *
 * The language data is committed rather than downloaded here — see
 * public/tessdata. A build step that reaches the network is a build that fails
 * on the day the network does.
 */

import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'tesseract');

/**
 * The LSTM-only core, not the full one.
 *
 * Tesseract ships a legacy engine alongside the LSTM neural one. We only ever
 * use LSTM, and the combined build is 3.3MB against 2.7MB for LSTM alone —
 * 600KB of an extension package spent on a code path that never executes.
 *
 * The plain build rather than the SIMD one: SIMD is faster, but it is a
 * separate binary that fails outright where the instruction set is missing, and
 * this runs on whatever laptop is on the desk. Correct everywhere beats faster
 * on some, particularly for a path whose failure mode is a blacked-out image.
 */
const FILES = [
  ['tesseract.js', 'dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core', 'tesseract-core-lstm.wasm.js', 'tesseract-core.wasm.js'],
];

mkdirSync(outDir, { recursive: true });

for (const [pkg, from, to] of FILES) {
  const source = join(here, '..', 'node_modules', pkg, from);
  const target = join(outDir, to);
  copyFileSync(source, target);
  const kb = Math.round(statSync(target).size / 1024);
  console.log(`copied ${to} (${kb}KB)`);
}
