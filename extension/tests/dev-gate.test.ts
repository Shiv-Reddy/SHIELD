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
 * to remove the code, rather than checking that a flag is set. The bundle
 * itself is the real proof and is verified by grepping `dist/` after a build;
 * this is the cheap guard that runs on every `npm test` and fails the moment
 * somebody moves the export back out of the guarded function.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const POPUP_HTML = readFileSync(join(ROOT, 'src/popup/popup.html'), 'utf8');

/**
 * The file with its comment lines dropped.
 *
 * The first version of this test counted every mention of the flag and failed
 * on the prose explaining it, which is the wrong kind of strictness: a comment
 * cannot ship a capability. Only what the bundler sees is counted.
 */
function code(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .join('\n');
}

const POPUP_TS = code('src/popup/popup.ts');

test('the export is reached only through a build-time conditional', () => {
  // `if (__SHIELD_DEV__)` becomes `if (false)` once the define is applied, and
  // the whole function goes with it. An `x.hidden = !__SHIELD_DEV__` would not.
  assert.match(POPUP_TS, /if \(__SHIELD_DEV__\) wireCorpusCapture\(\);/);
});

test('nothing else in the popup consults the dev flag', () => {
  // One use, one place. A second use is how "hidden but present" comes back.
  const uses = POPUP_TS.match(/__SHIELD_DEV__/g) ?? [];
  assert.equal(uses.length, 1, `__SHIELD_DEV__ used ${uses.length} times`);
});

test('the export path is only referenced from inside the guarded function', () => {
  // If any of these appear at module scope the bundler cannot drop them, and
  // the export ships in every build regardless of the conditional.
  const guarded = POPUP_TS.slice(POPUP_TS.indexOf('function wireCorpusCapture'));

  for (const symbol of ['mapExportJson', 'mapExportFilename', 'reviewableValues']) {
    const total = (POPUP_TS.match(new RegExp(symbol, 'g')) ?? []).length;
    const inside = (guarded.match(new RegExp(symbol, 'g')) ?? []).length;
    // One reference outside the function is the import statement itself.
    assert.equal(total - inside, 1, `${symbol} is used outside wireCorpusCapture`);
  }
});

test('the capture panel has no markup in popup.html', () => {
  // Markup cannot be removed by a define. Anything written into the HTML ships
  // in every build, which is why the panel builds its own DOM.
  assert.equal(POPUP_HTML.includes('devtools'), false);
  assert.equal(POPUP_HTML.includes('Capture this page'), false);
});
