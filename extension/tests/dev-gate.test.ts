/**
 * The export must be absent from a shipping build, not merely hidden.
 *
 * WHY THIS TEST EXISTS
 *
 * The first version of the gate set `panel.hidden = !__SHIELD_DEV__`, and the
 * decision record claimed on that basis that a shipped extension had no path to
 * the export. It had one: the markup shipped in popup.html and every listener
 * was still attached, so anybody with devtools could unhide the panel and write
 * a file of real field values. Nothing about the source made that visible —
 * a gate whose failure mode is "still there, just not shown" reads exactly like
 * a working gate.
 *
 * So this checks the SOURCE for the shape that makes the build-time define able
 * to remove the code, rather than checking that a flag is set.
 *
 * WHY IT WAS REWRITTEN
 *
 * Because it happened a second time, to this file. The original guarded
 * `popup.ts`, and when the popup was rebuilt in React that file stopped being a
 * build entry — reachable only from popup-legacy.html, which nothing built.
 * Both files were deleted on 2026-09-22 and the test that guarded them went
 * with them; a gate on code that does not ship is not a gate. Every assertion here went on passing, describing a gate on code that
 * no longer ships, while the live popup's gate was checked by nothing at all.
 * A test that outlives the thing it guards does not fail; it reports success
 * about a file nobody loads, which is the same shape as the bug above.
 *
 * The four original checks are kept, retargeted at the popup that is actually
 * built. The legacy file keeps a check of its own for as long as it sits in the
 * tree, because a copy of the panel that is one vite.config entry away from
 * shipping is not harmless just because it is unreferenced today.
 *
 * WHAT THIS STILL CANNOT SEE
 *
 * Source shape is not the bundle. The React gate is a ternary, so what must
 * disappear is an import — and whether it does is the bundler's judgement about
 * side effects, not anything written here. `tools/check-dev-gate.mjs` greps the
 * built output after every build and is the real proof; the last tests below
 * exist to stop that checker from drifting away from what it checks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

/**
 * The file with its comment lines dropped.
 *
 * An early version of this test counted every mention of the flag and failed on
 * the prose explaining it, which is the wrong kind of strictness: a comment
 * cannot ship a capability. Only what the bundler sees is counted.
 */
function code(file: string): string {
  return read(file)
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

const APP = code('src/popup/App.tsx');
const POPUP_HTML = read('src/popup/popup.html');

/** Every live popup source file except the gated panel itself. */
const LIVE_POPUP = [
  'src/popup/App.tsx',
  'src/popup/main.tsx',
  'src/popup/components/Masthead.tsx',
  'src/popup/components/Sheet.tsx',
  'src/popup/components/Mark.tsx',
  'src/popup/components/Redactions.tsx',
  'src/popup/components/Protect.tsx',
];

test('the export is reached only through a build-time conditional', () => {
  // `__SHIELD_DEV__ ? <CorpusCapture /> : null` becomes `false ? … : null` once
  // the define is applied, and the branch — with the import that feeds it —
  // goes with it. A `hidden={!__SHIELD_DEV__}` would not.
  assert.match(APP, /\{__SHIELD_DEV__ \? <CorpusCapture \/> : null\}/);
});

test('nothing else in the popup consults the dev flag', () => {
  // One use, one place. A second use is how "hidden but present" comes back.
  const uses = APP.match(/__SHIELD_DEV__/g) ?? [];
  assert.equal(uses.length, 1, `__SHIELD_DEV__ used ${uses.length} times in App.tsx`);
});

test('the export path is referenced only from inside the gated module', () => {
  // If any of these appear in a file that is imported unconditionally, the
  // bundler cannot drop them and the export ships in every build regardless of
  // the conditional.
  for (const file of LIVE_POPUP) {
    const source = code(file);
    for (const symbol of ['mapExportJson', 'mapExportFilename', 'reviewableValues']) {
      assert.equal(
        source.includes(symbol),
        false,
        `${symbol} is referenced from ${file}, which is not behind the dev gate`,
      );
    }
  }
});

test('the capture panel has no markup in the popup entry document', () => {
  // Markup cannot be removed by a define. Anything written into the HTML ships
  // in every build, which is why the panel is a component rather than a page.
  assert.equal(POPUP_HTML.includes('devtools'), false);
  assert.equal(POPUP_HTML.includes('Capture this page'), false);
});

test('the build checker greps for the string the panel actually renders', () => {
  // The checker is a plain .mjs run by npm and cannot import a .tsx, so the
  // marker is written twice — and two copies of a string is how a check quietly
  // starts passing for the wrong reason. Reworded in one place only, the grep
  // would report the export absent from every build, dev ones included, while
  // the panel went on shipping in whichever build compiled it.
  const inPanel = /GATE_SENTINEL = '([^']+)'/.exec(read('src/popup/components/CorpusCapture.tsx'));
  const inChecker = /const SENTINEL = '([^']+)'/.exec(read('tools/check-dev-gate.mjs'));

  assert.ok(inPanel?.[1], 'CorpusCapture.tsx no longer declares GATE_SENTINEL');
  assert.ok(inChecker?.[1], 'check-dev-gate.mjs no longer declares SENTINEL');
  assert.equal(
    inChecker[1],
    inPanel[1],
    'The checker and the panel disagree about the marker, so the build check is ' +
      'looking for a string that is never emitted.',
  );
});

test('the sentinel is rendered into the DOM, not only declared', () => {
  // A constant nothing renders would never reach the bundle, and the checker
  // would report the export absent from a build that contains all of it.
  assert.match(
    read('src/popup/components/CorpusCapture.tsx'),
    /data-shield-panel=\{GATE_SENTINEL\}/,
    'GATE_SENTINEL is no longer rendered, so it cannot appear in the bundle.',
  );
});

test('both builds run the gate check on their own output', () => {
  const manifest = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  assert.match(
    manifest.scripts['build'] ?? '',
    /check-dev-gate/,
    'The build no longer runs the dev gate check, so only source shape is verified.',
  );

  // dist-firefox is a copy of dist taken after the first check has run, so
  // naming it explicitly is the difference between checking the Firefox bundle
  // and assuming the copy was faithful and correctly ordered.
  assert.match(
    manifest.scripts['build:firefox'] ?? '',
    /check-dev-gate\.mjs dist-firefox/,
    'The Firefox build no longer checks its own output.',
  );
});
