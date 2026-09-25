/**
 * Does this build actually hold together?
 *
 * WHAT THIS CATCHES THAT NOTHING ELSE DOES
 *
 * Extension pages are reached by STRING. `chrome.tabs.create({ url:
 * 'proof/proof.html' })` and `options_ui.page` are not imports, so the
 * bundler never resolves them, `tsc` never sees them and every test passes
 * while the button opens a blank tab. The settings gear was exactly this: it
 * called `openOptionsPage` for eighteen commits with no options page declared
 * anywhere, on either browser, and nothing said a word.
 *
 * WHY IT RUNS ON THE FIREFOX OUTPUT TOO, BY NAME
 *
 * `dist-firefox` is assembled by copying `dist` and rewriting the manifest.
 * The rewrite is where a Firefox-only mistake would live — a background key
 * that still names a service worker, a permission Firefox rejects at install,
 * a missing gecko id — and none of that is visible from the Chrome build. The
 * two outputs are checked separately because they are two products.
 *
 * This is a build-time check rather than a unit test because it is about files
 * on disk after a build, which is the only place the question is answerable.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const which = process.argv[2] ?? 'dist';
const dist = resolve(root, which);
const firefox = which.includes('firefox');

const problems = [];
const checked = [];

function mustExist(path, why) {
  checked.push(path);
  if (!existsSync(join(dist, path))) problems.push(`${why}: ${path} is not in ${which}/`);
}

// --- The manifest ------------------------------------------------------------

const manifestPath = join(dist, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error(`\n${which}/manifest.json is missing. Did the build run?\n`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) problems.push('manifest_version is not 3');

for (const [size, path] of Object.entries(manifest.icons ?? {})) {
  mustExist(path, `icons[${size}]`);
}
for (const [size, path] of Object.entries(manifest.action?.default_icon ?? {})) {
  mustExist(path, `action.default_icon[${size}]`);
}
if (manifest.action?.default_popup) {
  mustExist(manifest.action.default_popup, 'action.default_popup');
}
if (manifest.options_ui?.page) {
  mustExist(manifest.options_ui.page, 'options_ui.page');
} else {
  // Not a style preference. The popup's gear calls openOptionsPage, and with
  // no page declared it opens nothing on either browser.
  problems.push('options_ui.page is not declared, so the settings control opens nothing');
}
for (const path of manifest.web_accessible_resources?.flatMap((entry) => entry.resources) ?? []) {
  if (!path.includes('*')) mustExist(path, 'web_accessible_resources');
}

// --- Background: the one place the two browsers genuinely differ -------------

if (firefox) {
  if (manifest.background?.service_worker) {
    problems.push('Firefox build still names a service_worker; it needs background.scripts');
  }
  if (!Array.isArray(manifest.background?.scripts)) {
    problems.push('Firefox build has no background.scripts — the event page will not start');
  }
  for (const script of manifest.background?.scripts ?? []) {
    mustExist(script, 'background.scripts');
  }
  if (manifest.permissions?.includes('offscreen')) {
    problems.push('Firefox build still asks for the "offscreen" permission, which it rejects');
  }
  if (!manifest.browser_specific_settings?.gecko?.id) {
    problems.push('Firefox build has no gecko id, so settings will not persist across reloads');
  }
  // Required by Firefox on new extensions, and the one declaration this project
  // could not make dishonestly. `none` is what the phantom type, the stage-order
  // guard and the zero-leak sweep already enforce; if it ever stops being true
  // this key is the first thing that has to change.
  const collects = manifest.browser_specific_settings?.gecko?.data_collection_permissions;
  if (!collects?.required?.length) {
    problems.push('Firefox build does not declare data_collection_permissions');
  } else if (!collects.required.includes('none')) {
    problems.push(
      `Firefox build declares it collects ${collects.required.join(', ')} — ` +
        'if that is now true, SECURITY_PRIVACY.md and the README claim otherwise',
    );
  }
  if (manifest.minimum_chrome_version) {
    problems.push('Firefox build still carries minimum_chrome_version');
  }
  if (manifest.permissions?.includes('sidePanel')) {
    problems.push('Firefox build still asks for "sidePanel", which it does not have');
  }
  if (!manifest.action?.default_popup) {
    problems.push('Firefox build has no popup, so clicking the icon would open nothing');
  }
} else {
  if (!manifest.background?.service_worker) {
    problems.push('Chrome build has no background.service_worker');
  } else {
    mustExist(manifest.background.service_worker, 'background.service_worker');
  }
  // The side panel. A declared popup would win the icon click, so the panel
  // would never open and — worse — the click would stop granting activeTab
  // through onClicked, which is what the panel relies on.
  if (manifest.action?.default_popup) {
    problems.push('Chrome build declares a popup, so the icon will not open the side panel');
  }
  if (!manifest.permissions?.includes('sidePanel')) {
    problems.push('Chrome build does not ask for "sidePanel", so the panel cannot open');
  }
  // Set from code rather than the manifest (see service-worker.ts), so nothing
  // above checks that the page exists. This does.
  mustExist('popup/panel.html', 'side panel page');
}

// --- Pages opened by string from the source ---------------------------------

/**
 * Every `'…/….html'` literal in the client source.
 *
 * Read from SOURCE and checked against the BUILD, which is the direction that
 * catches the mistake: a page referenced by a name nothing emits. Matching on
 * the .html suffix rather than on the call shape keeps this from having to know
 * every way a page can be opened — `tabs.create`, `getURL`, a manifest key, or
 * something written next month.
 */
function pageLiteralsIn(directory) {
  const found = new Set();

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const page of pageLiteralsIn(path)) found.add(page);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;

    for (const match of readFileSync(path, 'utf8').matchAll(/['"`]([\w./-]+\.html)(?:#[\w-]*)?['"`]/g)) {
      const page = match[1];
      // Relative imports and the page a file sits next to are resolved by the
      // bundler, which already fails loudly. Only runtime lookups matter here,
      // and those are written from the extension root.
      if (page.startsWith('.') || page.startsWith('/')) continue;
      found.add(page);
    }
  }

  return found;
}

for (const page of pageLiteralsIn(join(root, 'src'))) {
  mustExist(page, 'opened by name from the source');
}

// --- Verdict -----------------------------------------------------------------

if (problems.length > 0) {
  console.error(`\n${which}/ will not work as built:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

const bytes = (function size(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    total += entry.isDirectory() ? size(path) : statSync(path).size;
  }
  return total;
})(dist);

console.log(
  `${which}: manifest consistent, ${checked.length} referenced path(s) present, ` +
    `${(bytes / 1024 / 1024).toFixed(1)}MB`,
);

