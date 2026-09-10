/**
 * The record of what was transmitted, and the picture beside it.
 *
 * The property that matters is the split: the JSON is the evidence and the
 * frame is the demonstration, and they must not fail together. If storage
 * refuses the picture, the record of what was sent still has to survive —
 * inverting that would lose the thing this surface exists for in order to keep
 * a screenshot.
 *
 * `chrome` does not exist in Node, so it is stubbed here rather than mocked
 * through a framework. The stub is three lines and does exactly what the two
 * tests need it to do, which is more than a mocking library would make legible.
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { recordTransmission, type Transmission } from '../src/lib/redaction/evidence';
import type { SanitizedAnalyzePayload } from '../src/lib/types';

const FRAME = 'data:image/jpeg;base64,AAAABBBBCCCC';

function payload(): SanitizedAnalyzePayload {
  return {
    task_query: 'log me in',
    redacted_frame: FRAME,
    dom_summary: [{ element_id: 'e1', element_type: 'input', label: 'Password', value: '[PASSWORD]' }],
    redaction_manifest: [{ category: 'password', source: 'dom' }],
    viewport: { width: 1920, height: 945 },
  } as unknown as SanitizedAnalyzePayload;
}

/** Every write the stub accepted, newest last. */
let written: Record<string, unknown>[] = [];
/** How many writes to reject before accepting one. */
let rejectFirst = 0;

function installChromeStub(): void {
  written = [];
  (globalThis as Record<string, unknown>)['chrome'] = {
    storage: {
      local: {
        set(items: Record<string, unknown>) {
          if (rejectFirst > 0) {
            rejectFirst -= 1;
            return Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
          }
          written.push(items);
          return Promise.resolve();
        },
      },
    },
  };
}

afterEach(() => {
  rejectFirst = 0;
  delete (globalThis as Record<string, unknown>)['chrome'];
});

function stored(): Transmission {
  const last = written[written.length - 1];
  assert.ok(last, 'nothing was stored');
  return last['lastTransmission'] as Transmission;
}

test('the frame that was sent is kept beside the payload', () => {
  installChromeStub();
  return recordTransmission(payload(), 'http://127.0.0.1:8787/analyze').then(() => {
    assert.equal(stored().frame, FRAME);
  });
});

test('the readable JSON still holds a placeholder, not the base64', () => {
  // The frame is hundreds of kilobytes. Left inline it would bury the part of
  // the record somebody actually reads.
  installChromeStub();
  return recordTransmission(payload(), 'endpoint').then(() => {
    const entry = stored();
    assert.equal(entry.json.includes('AAAABBBBCCCC'), false);
    assert.match(entry.json, /redacted image/);
    assert.equal(entry.frameBytes, FRAME.length);
  });
});

test('a frame storage refuses costs the picture, never the record', () => {
  // The one that matters. Losing what was sent in order to keep a screenshot
  // would invert the purpose of this surface entirely.
  installChromeStub();
  rejectFirst = 1;

  return recordTransmission(payload(), 'endpoint').then(() => {
    const entry = stored();
    assert.equal(entry.frame, undefined);
    assert.match(entry.json, /\[PASSWORD\]/);
    assert.equal(entry.endpoint, 'endpoint');
  });
});

test('recording never throws, whatever storage does', () => {
  // Evidence is not protection. Failing to store it must not interfere with the
  // run it describes.
  installChromeStub();
  rejectFirst = 2;

  return recordTransmission(payload(), 'endpoint');
});
