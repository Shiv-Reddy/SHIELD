/**
 * Copies the ONNX Runtime Web runtime assets out of node_modules into
 * public/ort/, from where the build copies them into dist/.
 *
 * These must be served from the extension itself, never a CDN. Two reasons,
 * and the second is the important one:
 *
 *   1. A CDN fetch breaks the moment the machine is offline, which during a
 *      live demo is a plausible failure and an unacceptable one.
 *   2. Shield's entire claim is that screen understanding happens on-device.
 *      Pulling the inference runtime from a third-party origin at run time puts
 *      that origin in the middle of a privacy-critical path — it would see the
 *      request, and a compromised or substituted runtime could do anything with
 *      the pixels it processes. "Local model" has to mean the whole runtime is
 *      local, not just the weights.
 *
 * ORT is emphatic that the JS glue and the .wasm must come from the same build
 * — mismatched versions fail on minified symbol names — so both are copied from
 * the same installed package rather than pinned separately.
 */

import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ortDist = join(here, '..', 'node_modules', 'onnxruntime-web', 'dist');
const outDir = join(here, '..', 'public', 'ort');

const version = JSON.parse(
  readFileSync(join(here, '..', 'node_modules', 'onnxruntime-web', 'package.json'), 'utf8'),
).version;

/**
 * The runtime entry point we actually import in src/offscreen/face-detector.ts.
 * Must stay in step with that import.
 */
const ENTRY = 'ort.webgpu.min.mjs';

/**
 * Work out which WASM assets that entry point loads, by reading it.
 *
 * The obvious approach is to hardcode the filenames — and it silently broke
 * once already: ORT renamed its WebGPU binary from `jsep` to `asyncify`, so a
 * hardcoded list copied a file nothing loads while the one ORT wanted was
 * missing. The build still passed. Deriving the names from the bundle means a
 * version bump either keeps working or fails loudly, never quietly ships the
 * wrong 25MB.
 */
function requiredAssets() {
  const source = readFileSync(join(ortDist, ENTRY), 'utf8');
  const referenced = new Set(source.match(/ort-wasm-simd-threaded[a-zA-Z.]*\.mjs/g) ?? []);

  if (referenced.size === 0) {
    throw new Error(
      `Found no WASM loader reference in ${ENTRY}. ONNX Runtime's asset naming ` +
        'has changed; update tools/copy-ort-assets.mjs.',
    );
  }

  // Each loader .mjs has a matching .wasm of the same stem.
  const assets = [];
  for (const loader of referenced) {
    assets.push(loader, loader.replace(/\.mjs$/, '.wasm'));
  }
  return assets;
}

const ASSETS = requiredAssets();

mkdirSync(outDir, { recursive: true });

let total = 0;
for (const asset of ASSETS) {
  const from = join(ortDist, asset);
  const to = join(outDir, asset);
  copyFileSync(from, to);
  const bytes = statSync(to).size;
  total += bytes;
  console.log(`ort  ${asset} (${(bytes / 1024 / 1024).toFixed(1)}MB)`);
}

console.log(`ort  onnxruntime-web ${version}, ${(total / 1024 / 1024).toFixed(1)}MB total`);
