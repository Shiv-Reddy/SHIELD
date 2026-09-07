/**
 * Verifies the pinned local models against tools/models.json.
 *
 * Runs as part of every build. A model file is the one artefact in this project
 * that is downloaded rather than written, and a truncated or swapped model does
 * not announce itself — inference simply produces nonsense, which reads as "the
 * detection code is wrong" and costs hours. Hashing 1MB takes a millisecond, so
 * the check is free relative to what it prevents.
 *
 * ARCHITECTURE.md Section 8 requires model versions to be pinned and shipped
 * with the extension; this is what makes "pinned" mean something.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(here, '..', 'public', 'models');
const manifest = JSON.parse(readFileSync(join(here, 'models.json'), 'utf8'));

let failed = 0;

for (const model of manifest.models) {
  const path = join(modelsDir, model.file);

  if (!existsSync(path)) {
    console.error(`MISSING  ${model.file}`);
    console.error(`         fetch it from ${model.source}`);
    console.error(`         path: ${model.sourceFile}`);
    failed += 1;
    continue;
  }

  const bytes = readFileSync(path);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  if (bytes.length !== model.bytes || sha256 !== model.sha256) {
    console.error(`CORRUPT  ${model.file}`);
    console.error(`         expected ${model.bytes} bytes, sha256 ${model.sha256}`);
    console.error(`         got      ${bytes.length} bytes, sha256 ${sha256}`);
    failed += 1;
    continue;
  }

  const kb = (bytes.length / 1024).toFixed(0);
  console.log(`ok  ${model.file} (${kb}KB, ${model.license}) — ${model.name}`);
}

if (failed > 0) {
  console.error(`\n${failed} model check(s) failed. Refusing to build.`);
  process.exit(1);
}
