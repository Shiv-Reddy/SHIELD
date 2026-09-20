/**
 * Prove the element-map export is where it is supposed to be.
 *
 * The export writes real field values from a real page to a file. It must be
 * ABSENT from a build somebody could install — not switched off, not hidden.
 * DECISIONS.md 183 is about the first version of that panel, which was gated by
 * setting `hidden` on markup that shipped anyway: everything was still there
 * for anyone who opened devtools, and it read as working right up until it was
 * looked at.
 *
 * The React rebuild does not remove that risk, it moves it. The gate is now a
 * ternary around `<CorpusCapture />`, so what has to disappear is the import at
 * the top of App.tsx — and that depends on the bundler proving the module is
 * side-effect free, not on anything a developer wrote. A refactor that gave
 * that module a top-level side effect would defeat the gate while every test
 * still passed and the source still read correctly.
 *
 * So this runs after every build and checks the bytes. It fails in BOTH
 * directions: a sentinel found in a normal build means the panel is shipping,
 * and a sentinel missing from SHIELD_DEV=1 means the corpus tool is silently
 * gone and the benchmark corpus quietly stopped being able to grow.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

/** Must match `GATE_SENTINEL` in src/popup/components/CorpusCapture.tsx. */
const SENTINEL = 'shield-dev-corpus-capture';

/**
 * Which output directory to check.
 *
 * Named on the command line rather than assumed, because there are two. The
 * Firefox build is a copy of `dist` made after this check has already run, so
 * `dist-firefox` was covered only by the accident of the copy happening later
 * and being faithful — a chain of two assumptions guarding the one capability
 * in this codebase that writes real field values to disk. `build:firefox` now
 * checks its own output after assembling it.
 */
const dist = fileURLToPath(new URL(`../${process.argv[2] ?? 'dist'}`, import.meta.url));
const wanted = process.env.SHIELD_DEV === '1';

/**
 * Every emitted script, including chunks.
 *
 * Checking only popup.js would miss the case this exists to catch: Rollup
 * hoisting the panel into a shared chunk that the popup imports, which is
 * still shipping it.
 */
async function scripts(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);
    // Source maps carry the original text of code that was dropped from the
    // bundle, so they would report a false positive on every clean build.
    if (entry.isDirectory()) found.push(...(await scripts(path)));
    else if (entry.name.endsWith('.js')) found.push(path);
  }

  return found;
}

const carrying = [];
for (const path of await scripts(dist)) {
  if ((await readFile(path, 'utf8')).includes(SENTINEL)) carrying.push(path);
}

if (!wanted && carrying.length > 0) {
  console.error(
    `\nThe element-map export is in a build that did not ask for it:\n` +
      carrying.map((path) => `  ${path}`).join('\n') +
      `\n\nThis build can write real field values from any page to a file.` +
      `\nDo not load or distribute it. See DECISIONS.md 183.\n`,
  );
  process.exit(1);
}

if (wanted && carrying.length === 0) {
  console.error(
    `\nSHIELD_DEV=1 was set but the element-map export is not in the build.` +
      `\nThe corpus capture panel is gone, so the benchmark corpus cannot grow.\n`,
  );
  process.exit(1);
}

const where = process.argv[2] ?? 'dist';
console.log(
  wanted
    ? `dev gate: element-map export present in ${where}, as asked (${carrying.length} file(s))`
    : `dev gate: element-map export absent from ${where}`,
);
