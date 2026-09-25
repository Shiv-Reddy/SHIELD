import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { readinessFrom } from '../src/popup/voice';

// The one property worth pinning: voice is on-device or it is off. A browser
// that can transcribe only in the cloud must read as unsupported, because a
// privacy tool that ships the user's voice somewhere is not one.

test('no on-device API means voice is unavailable, whatever else the browser has', () => {
  assert.equal(readinessFrom(false, null), 'unsupported');
  assert.equal(readinessFrom(false, 'available'), 'unsupported');
});

test('an on-device pack that is installed is ready', () => {
  assert.equal(readinessFrom(true, 'available'), 'ready');
});

test('a pack that can be downloaded is offered as a download, not used from the cloud meanwhile', () => {
  assert.equal(readinessFrom(true, 'downloadable'), 'needs-download');
  assert.equal(readinessFrom(true, 'downloading'), 'downloading');
});

test('a language the device cannot do is unavailable', () => {
  assert.equal(readinessFrom(true, 'unavailable'), 'unsupported');
});

test('every recognition started asks for local processing and checks it held', () => {
  const source = readFileSync(new URL('../src/popup/voice.ts', import.meta.url), 'utf8');
  assert.match(source, /recognition\.processLocally = true;/);
  assert.match(source, /if \(recognition\.processLocally !== true\)/);
});
