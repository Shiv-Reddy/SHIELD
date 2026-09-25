/**
 * Derive the Firefox manifest from the Chrome one.
 *
 * WHY GENERATED RATHER THAN CHECKED IN
 *
 * Two hand-maintained manifests drift, and the drift is silent: a permission
 * added for a Chrome feature simply never reaches Firefox, and the symptom
 * turns up as a runtime failure on the browser nobody tests daily. Everything
 * that is the same stays written once; only the differences live here, where
 * they can be read as a list of what the two browsers disagree about.
 *
 * WHY NOT ONE MANIFEST WITH BOTH KEYS
 *
 * MDN's cross-browser advice is to put `scripts` and `service_worker` in the
 * same `background` key and let each browser pick. That works, and it was not
 * chosen: it edits the file Chrome loads, and Chrome is the primary demo. A
 * separate output directory cannot break a browser it is not loaded into.
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '..', 'public', 'manifest.json');
const built = resolve(here, '..', 'dist');
const out = resolve(here, '..', 'dist-firefox');
const target = resolve(out, 'manifest.json');

if (!existsSync(built)) {
  console.error('dist/ does not exist - run the Chrome build first');
  process.exit(1);
}

// Rebuilt from scratch each time. A stale file left behind from an earlier
// layout is the same class of problem as a stale bundle, and this project has
// already lost six sessions to one of those.
rmSync(out, { recursive: true, force: true });
cpSync(built, out, { recursive: true });

const manifest = JSON.parse(readFileSync(source, 'utf8'));

/**
 * Firefox MV3 has no service worker. It runs an event page, which is a real
 * DOM document — the reason this port is expected to be simpler than Chrome's
 * rather than harder, since the offscreen document exists only because an MV3
 * service worker cannot host WebAssembly or WebGPU.
 */
manifest.background = {
  scripts: ['service-worker.js'],
  type: 'module',
};

// No offscreen API on Firefox, and there is nothing for it to do there. Left in
// place it is an unrecognised permission and a warning at install time.
manifest.permissions = manifest.permissions.filter(
  (name) => name !== 'offscreen' && name !== 'sidePanel',
);

// Chrome opens Shield in its side panel, which means Chrome's manifest has no
// popup — the icon click is handled in code so that it grants activeTab and
// opens the panel on that tab. Firefox has no `sidePanel` API, so it keeps the
// popup. Same page, same interface; only where it opens differs.
manifest.action = { ...manifest.action, default_popup: 'popup/popup.html' };

// A Chrome-only key. Harmless but noisy, and the Firefox floor is a different
// number for a different reason - see below.
delete manifest.minimum_chrome_version;

manifest.browser_specific_settings = {
  gecko: {
    id: 'shield@teamanarchy',
    /**
     * What Shield collects, declared to the browser: nothing.
     *
     * Firefox requires this key on new extensions, and `none` is the one value
     * this project could not have claimed dishonestly — it is the same
     * statement the phantom type, the stage-order guard and the zero-leak sweep
     * enforce in code. The redacted context that reaches the backend carries
     * placeholders rather than values, and no URL, no identifier and no page
     * content is stored or transmitted anywhere else.
     *
     * If that ever stops being true, this key is the first thing that has to
     * change, and changing it is a decision with a paper trail rather than an
     * omission nobody notices.
     */
    data_collection_permissions: {
      required: ['none'],
    },
    // 121 is where Firefox stopped refusing to start a background page when a
    // `service_worker` key was present, and the first version where a manifest
    // written for both browsers behaves. WebGPU needs far newer - 141 on
    // Windows - but that degrades to the WASM path rather than failing, so it
    // is not a floor.
    strict_min_version: '121.0',
  },
};

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`firefox manifest -> dist-firefox/manifest.json (background: event page)`);
