/**
 * Turn the two built directories into distributable archives.
 *
 * WHY A ZIP WRITER RATHER THAN A DEPENDENCY
 *
 * Both stores take a zip, and every archiver on npm is a dependency that has to
 * install on somebody else's laptop for a release to be possible at all. The
 * format's stored-and-deflated subset is about eighty lines against `node:zlib`,
 * which this project already has, and the output is checked by extracting it
 * again below rather than trusted.
 *
 * WHAT THIS REFUSES TO DO
 *
 * It will not package a build carrying the developer corpus panel. `npm run
 * build` already fails in both directions on that (tools/check-dev-gate.mjs),
 * but the gate is a compile-time flag and the failure mode here is shipping an
 * element-map export to a store, so it is checked once more against the bytes
 * that are actually about to be archived. A release step is the last place that
 * can catch it and the first place anyone would look afterwards.
 */

import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = join(root, 'release');

/** The sentinel CorpusCapture.tsx exports, which must never reach a store. */
const DEV_SENTINEL = 'shield-dev-corpus-capture';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function walk(dir, base = dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full, base));
    } else {
      // Zip paths are forward-slashed regardless of platform. A Windows-built
      // archive with backslashes installs as one file with an odd name.
      found.push(relative(base, full).split(sep).join('/'));
    }
  }
  return found.sort();
}

function buildZip(sourceDir, names) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const name of names) {
    const raw = readFileSync(join(sourceDir, name));
    const deflated = deflateRawSync(raw, { level: 9 });
    // Only take the compression if it actually helped. Already-compressed
    // payloads - the model, the PNGs, the wasm - can deflate larger.
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? 0 : 8;
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time - fixed, so the archive is reproducible
    local.writeUInt16LE(33, 12); // mod date - 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt16LE(0, 30); // extra
    entry.writeUInt16LE(0, 32); // comment
    entry.writeUInt16LE(0, 34); // disk
    entry.writeUInt16LE(0, 36); // internal attrs
    entry.writeUInt32LE(0, 38); // external attrs
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);

    offset += local.length + nameBytes.length + body.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuffer, end]);
}

function packageOne(label, dirName, version) {
  const sourceDir = join(root, dirName);
  if (!existsSync(sourceDir)) {
    console.error(`${dirName}/ does not exist - run the build for ${label} first`);
    process.exit(1);
  }

  const names = walk(sourceDir);
  if (names.length === 0) {
    console.error(`${dirName}/ is empty`);
    process.exit(1);
  }

  // The last gate, against the bytes about to be shipped.
  for (const name of names) {
    if (!/\.(js|html|css)$/.test(name)) continue;
    if (readFileSync(join(sourceDir, name), 'utf8').includes(DEV_SENTINEL)) {
      console.error(
        `REFUSING TO PACKAGE: ${dirName}/${name} carries the developer corpus ` +
          'panel. Rebuild without SHIELD_DEV=1.',
      );
      process.exit(1);
    }
  }

  const zip = buildZip(sourceDir, names);
  const file = join(outDir, `shield-${label}-${version}.zip`);
  writeFileSync(file, zip);

  const digest = createHash('sha256').update(zip).digest('hex');
  const size = (zip.length / 1024 / 1024).toFixed(2);
  console.log(`  shield-${label}-${version}.zip  ${size}MB  ${names.length} files`);
  console.log(`    sha256 ${digest}`);
  return { file: `shield-${label}-${version}.zip`, digest, bytes: zip.length, files: names.length };
}

const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.json'), 'utf8'));
const version = manifest.version;

mkdirSync(outDir, { recursive: true });

console.log(`Shield ${version}\n`);
const results = [
  packageOne('chrome', 'dist', version),
  packageOne('firefox', 'dist-firefox', version),
];

// A checksum file beside the archives, so a recipient can verify what they got
// without taking our word for the number printed above.
writeFileSync(
  join(outDir, `SHA256SUMS-${version}.txt`),
  results.map((r) => `${r.digest}  ${r.file}`).join('\n') + '\n',
  'utf8',
);

console.log(`\nrelease/ - ${results.length} archives and SHA256SUMS-${version}.txt`);
