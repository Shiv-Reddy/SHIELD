/**
 * The scan record's caption.
 *
 * A sentence looks like a small thing to test. This one sits above pictures of
 * somebody's own screen and tells them what those pictures prove, so it is the
 * most load-bearing string in the product — and the failure mode is not a crash
 * but a claim that is one word too strong.
 *
 * Every test here is really the same test: that the caption never describes a
 * partial record as a whole one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeProof, type ProofScreen, type ScanProof } from '../src/lib/scan-proof';

function screen(at: number, covered: number): ProofScreen {
  return { at, dataUrl: 'data:image/jpeg;base64,AAAA', covered };
}

function proof(overrides: Partial<ScanProof> = {}): ScanProof {
  return {
    at: Date.UTC(2026, 8, 9, 12, 0, 0),
    documentHeight: 2000,
    viewportHeight: 945,
    truncated: false,
    omitted: 0,
    screens: [screen(0, 1), screen(700, 2)],
    ...overrides,
  };
}

test('a complete record says what was examined and what was covered', () => {
  const caption = describeProof(proof());

  assert.match(caption, /2 screens of this page were examined/);
  assert.match(caption, /3 areas were covered/);
});

test('the caption always says nothing was sent', () => {
  // The whole reason this artefact can exist at all. A full-page picture is
  // affordable precisely because it never leaves the machine, and the sentence
  // that says so must not be droppable.
  assert.match(describeProof(proof()), /None of this was sent anywhere\./);
});

test('a clean page is described as clean, not as a failure', () => {
  const caption = describeProof(proof({ screens: [screen(0, 0), screen(700, 0)] }));

  assert.match(caption, /nothing sensitive was found/);
  assert.equal(caption.includes('covered'), false);
});

test('a single screen is described in the singular throughout', () => {
  const caption = describeProof(proof({ screens: [screen(0, 1)] }));

  assert.match(caption, /1 screen of this page was examined/);
  assert.match(caption, /1 area was covered/);
});

test('a truncated scan never reads as a whole-page claim', () => {
  // The failure this file exists to prevent. Somebody shown a filmstrip of six
  // screens takes it for the page unless the caption says otherwise.
  const caption = describeProof(proof({ truncated: true }));

  assert.match(caption, /stopped before the end of the page/);
});

test('screens that could not be redacted are declared, not quietly missing', () => {
  // A raw frame is never stored as a substitute, so a failed redaction leaves a
  // hole. A strip with an unannounced hole is read as the whole page.
  const caption = describeProof(proof({ omitted: 2 }));

  assert.match(caption, /2 screens could not be shown/);
});

test('both kinds of gap are reported together, not one instead of the other', () => {
  const caption = describeProof(proof({ truncated: true, omitted: 1 }));

  assert.match(caption, /stopped before the end/);
  assert.match(caption, /1 screen could not be shown/);
});

test('a complete record carries no caveat at all', () => {
  // The other direction: hedging a clean, complete scan would train people to
  // ignore the hedge on the day it means something.
  assert.equal(describeProof(proof()).includes('—'), false);
});
