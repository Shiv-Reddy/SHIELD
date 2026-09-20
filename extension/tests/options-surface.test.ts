/**
 * The settings page exists, is reachable, and cannot loosen anything.
 *
 * WHY THE FIRST TEST IS THE IMPORTANT ONE
 *
 * The popup's gear called `chrome.runtime.openOptionsPage` while no options
 * page was declared in either manifest. It opened nothing, on both browsers,
 * and nothing failed: pages are reached by string, so the bundler never
 * resolved it, `tsc` never saw it, and every test passed. The same shape as the
 * hidden-but-present panel of DECISIONS.md 183 and the test that outlived its
 * subject in 246 — a check that passes because it is not looking.
 *
 * `tools/check-build.mjs` is the real guard, because it reads the built output
 * where the question is actually answerable. These are the cheap assertions
 * that run on every `npm test` and fail the moment the wiring is undone.
 *
 * WHY FR-14 IS TESTED FROM THE UI SIDE
 *
 * `redactionLevel` was built, tested and ticked while being reachable only by
 * typing into an extension console. A requirement that can only be satisfied
 * from a devtools prompt is satisfied in the same sense a hidden panel is
 * gated, so what is asserted here is that a person can reach it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { REDACTION_FLOORS } from '../src/lib/settings';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

const MANIFEST = JSON.parse(read('public/manifest.json')) as {
  options_ui?: { page?: string; open_in_tab?: boolean };
};
const PAGE = read('src/options/options.html');
const SCRIPT = read('src/options/options.ts');

test('the manifest declares an options page, and the file is there', () => {
  const page = MANIFEST.options_ui?.page;

  assert.ok(page, 'No options_ui.page — the popup gear opens nothing.');
  // The manifest path is relative to the built output; the source lives under
  // src/. Checking the source file exists is what catches a rename.
  assert.doesNotThrow(
    () => read(join('src', page)),
    `options_ui.page points at ${page}, which does not exist in src/.`,
  );
});

test('the page opens as a page, not inside the add-ons manager', () => {
  // Firefox embeds options in a narrow frame beside the add-on list unless this
  // is set, where a layout designed as a page does not fit. Chrome ignores it.
  assert.equal(MANIFEST.options_ui?.open_in_tab, true);
});

test('the popup gear has somewhere to go', () => {
  const app = read('src/popup/App.tsx');

  // Either the control opens the options page, or there is no control. A gear
  // that calls nothing is the defect this file exists for.
  if (app.includes('onSettings')) {
    assert.match(
      app,
      /openOptionsPage/,
      'The masthead has a settings control that does not open the options page.',
    );
    assert.ok(MANIFEST.options_ui?.page, 'A settings control exists with no page declared.');
  }
});

test('FR-14 is reachable by a person, not only from a console', () => {
  assert.match(SCRIPT, /setRedactionLevel/, 'The settings page cannot change the redaction level.');

  // Every level must be offered, or the range is narrower than the feature.
  for (const level of Object.keys(REDACTION_FLOORS)) {
    assert.ok(SCRIPT.includes(`'${level}'`), `The settings page does not offer '${level}'.`);
  }
});

test('the two inference overrides are reachable too', () => {
  // These exist so the fallback paths can be exercised on hardware where they
  // would otherwise never run — which was impossible without a console, on the
  // exact machines where somebody would want to check.
  assert.match(SCRIPT, /forceInferenceHost/);
  assert.match(SCRIPT, /setForceBackend/);
});

test('the floors on screen come from the constant, not from a second copy', () => {
  // Two places holding the same number is how a settings page starts
  // describing a threshold that is no longer in force.
  assert.match(
    SCRIPT,
    /REDACTION_FLOORS\[level\]/,
    'The page prints image floors from somewhere other than REDACTION_FLOORS.',
  );
});

test('nothing on the page offers to hide less than the floor', () => {
  // The range only goes up. `standard` IS the floor, and a lax option would
  // contradict CLAUDE.md's uncertainty rule and dom-rules.ts's refusal to gate
  // on confidence — so the page says why rather than offering one.
  // `\b` matters: without it "off" matches the legitimate "Offscreen document"
  // option in the inference-host list, and the test fails on correct markup.
  for (const word of ['minimal', 'lenient', 'relaxed', 'off', 'disable']) {
    assert.equal(
      new RegExp(`>\\s*${word}\\b`, 'i').test(PAGE),
      false,
      `The settings page appears to offer a "${word}" redaction level.`,
    );
  }

  assert.match(
    PAGE,
    /no setting that makes Shield hide less/i,
    'The page no longer states that the range only goes up.',
  );
});

test('both builds check their own output', () => {
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;

  assert.match(scripts['build'] ?? '', /check-build\.mjs dist/);
  assert.match(
    scripts['build:firefox'] ?? '',
    /check-build\.mjs dist-firefox/,
    'The Firefox build does not verify its own manifest, which is the one that differs.',
  );
});
