/**
 * The popup must still offer what the popup offered.
 *
 * WHY THIS EXISTS
 *
 * The React rebuild shipped seven of the fifteen messages the old popup sent
 * (DECISIONS.md 244). Manual marking, observe-only, clearing a scan, the scan
 * record, the audit panel, the force-CPU toggle and the dev capture panel were
 * all simply absent — not removed after a decision, just not carried across.
 * **The build was green the whole time**, because nothing tested that a surface
 * still offers what it offered yesterday. Tests check that code is correct;
 * nothing checks that a feature is still there.
 *
 * It was eventually caught by diffing `MSG.*` between the two files, which is a
 * mechanical check that takes one command and should have been the first step
 * of the port rather than an afterthought. This is that diff, kept.
 *
 * WHY THE LIST IS WRITTEN DOWN RATHER THAN ONLY DERIVED
 *
 * Deriving it from popup.ts alone would have made this test evaporate the day
 * that file was deleted, which happened on 2026-09-22. The list below is
 * written down instead, so it outlived the thing it was once compared against.
 * (Original note: popup.ts is dead code awaiting removal, so that day is
 * coming. A test that disappears with the thing it was comparing against
 * protects nothing afterwards. The list below is the popup's surface contract;
 * the cross-check against the legacy file is a bonus that runs while it lasts.
 *
 * Adding a message here is normal. REMOVING one is the thing to think about,
 * and should be a line in DECISIONS.md saying the feature went on purpose.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** Every file the built popup is made of. */
const POPUP_SOURCES = [
  'src/popup/App.tsx',
  'src/popup/main.tsx',
  'src/popup/components/Masthead.tsx',
  'src/popup/components/Sheet.tsx',
  'src/popup/components/Mark.tsx',
  'src/popup/components/Redactions.tsx',
  'src/popup/components/Protect.tsx',
  'src/popup/components/ScanCard.tsx',
  'src/popup/components/Audit.tsx',
  'src/popup/components/Consent.tsx',
  // Gated out of shipping builds, but part of the popup's surface in the build
  // that has it. Left in so a port cannot lose it silently the way the last
  // one nearly did.
  'src/popup/components/CorpusCapture.tsx',
  'src/popup/components/Totals.tsx',
  'src/popup/surface.ts',
];

/**
 * What the popup must be able to ask for.
 *
 * Taken from the imperative popup at the moment of the port, with one entry per
 * capability rather than per line of code.
 */
const REQUIRED = [
  'MSG.BEGIN_MANUAL', // mark an area by hand
  'MSG.CANCEL_TASK', // stop a run in flight
  'MSG.CLEAR_MANUAL', // drop the hand-marked areas
  'MSG.CLEAR_SCAN', // drop a scan's findings and its filmstrip
  'MSG.CONSENT_DECISION', // answer the ask-before-sending gate
  'MSG.EXTRACT_DOM', // corpus capture, dev builds only
  'MSG.GET_STATE', // what is happening, on open
  'MSG.MANUAL_STATUS', // how many areas this page carries
  'MSG.PING', // is the content script alive
  'MSG.PREPARE', // warm the model while the user types
  'MSG.RESTART_BACKEND', // make a pinned backend take hold
  'MSG.RUN_TASK', // the primary action
  'MSG.SCAN_PAGE', // walk the whole page
  'MSG.SCAN_STATUS', // findings the page still carries after worker eviction
  'MSG.STATE_CHANGED', // the broadcast the interface renders
];

/** Messages named anywhere in the popup's own source. */
function messagesIn(files: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const file of files) {
    for (const match of read(file).matchAll(/MSG\.[A-Z][A-Z_]*/g)) found.add(match[0]);
  }
  return found;
}

test('the popup can still ask for everything it used to', () => {
  const present = messagesIn(POPUP_SOURCES);
  const missing = REQUIRED.filter((message) => !present.has(message));

  assert.deepEqual(
    missing,
    [],
    `The popup no longer sends: ${missing.join(', ')}. If a feature was dropped ` +
      `on purpose, remove it from REQUIRED and say why in DECISIONS.md.`,
  );
});

/**
 * No stored setting may become impossible to change.
 *
 * Each of these is a stored preference with a user-facing control somewhere.
 * A surface that stops writing one does not fail — it silently becomes the
 * build where that setting, once switched on, can never be switched off. That
 * is the failure this guards against, not "the panel must hold every switch":
 * "Watch without acting" and the inference pin moved out of the panel on
 * purpose (DECISIONS.md 277) and live on the Settings page, which already had
 * them. So the check is that each is writable from the panel OR the Settings
 * page — and it still fails the moment one is writable from neither.
 */
test('every stored setting can still be changed from somewhere', () => {
  const source = [...POPUP_SOURCES, 'src/options/options.ts'].map(read).join('\n');

  for (const setter of ['setObserveOnly', 'setForceBackend', 'setRequireConsent']) {
    assert.ok(source.includes(setter), `Nothing calls ${setter} any more.`);
  }
});

/**
 * The popup renders page-derived text, and React escaping it is the protection.
 *
 * Field values from the corpus panel, OCR'd strings, a page's own label text —
 * all of it is page-authored content rendered inside an extension page, which
 * is the one surface in this project where markup must never be allowed to
 * run. The imperative popup had to remember `textContent` at every call site.
 * React escapes by default, so the protection is now structural — and stays
 * structural only for as long as nobody reaches for the one prop that opts out.
 *
 * Mozilla's linter flags two `innerHTML` assignments in the built popup. Both
 * are React's own implementation of that prop, unreachable while nothing passes
 * it. This is what keeps that true.
 */
test('nothing in the popup opts out of React escaping', () => {
  for (const file of [...POPUP_SOURCES, 'src/popup/components/CorpusCapture.tsx']) {
    assert.equal(
      read(file).includes('dangerouslySetInnerHTML'),
      false,
      `${file} sets HTML directly. The popup renders page-authored text, so ` +
        'escaping is the protection rather than a default worth overriding.',
    );
  }
});

/**
 * State the popup is required to surface.
 *
 * `fellBack` is the one with a requirement behind it: PRD.md Section 20 says
 * the fallback must be automatic AND that the user must be told things may be
 * slower. It was dropped in the rebuild, which turned a stated requirement into
 * a silent 10x slowdown that reads as a bug.
 */
test('the popup still reports the fields it is required to report', () => {
  const source = POPUP_SOURCES.map(read).join('\n');

  for (const field of ['fellBack', 'truncated', 'scanProgress', 'coverage']) {
    assert.ok(source.includes(field), `The popup no longer reads state.${field}.`);
  }
});
