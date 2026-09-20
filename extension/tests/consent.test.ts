/**
 * Approval before transmission — PRD.md FR-24's strongest form.
 *
 * The property under test is the asymmetry: **exactly one outcome sends, and
 * every other outcome — including every confused one — does not.** A consent
 * gate that transmits when it is unsure is worse than no gate at all, because
 * it produces the appearance of a control that is not there.
 *
 * The rest is about the summary not becoming a second place where transmitted
 * data is rendered, and about a stale approval never authorising a payload the
 * user did not see.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSENT_TIMEOUT_MS,
  declineReason,
  mayTransmit,
  summarise,
} from '../src/lib/consent';
import type { ConsentDecision } from '../src/lib/consent';

const ALL: ConsentDecision[] = ['approved', 'declined', 'timed-out', 'stale'];

// --- Fail closed -------------------------------------------------------------

test('only an explicit approval permits transmission', () => {
  assert.equal(mayTransmit('approved'), true);
});

test('every other outcome refuses, including the confused ones', () => {
  // A timeout is not a fallback to sending. A stale reply is not a near-enough
  // approval. Both are silence, and silence is no.
  for (const decision of ALL.filter((d) => d !== 'approved')) {
    assert.equal(mayTransmit(decision), false, decision);
  }
});

test('a decision Shield does not recognise refuses', () => {
  // A malformed reply from a popup, an old build, or a message that lost a
  // field must not be able to become consent.
  assert.equal(mayTransmit('yes' as ConsentDecision), false);
  assert.equal(mayTransmit('' as ConsentDecision), false);
  assert.equal(mayTransmit(undefined as unknown as ConsentDecision), false);
});

test('every refusal says why, in words', () => {
  for (const decision of ALL.filter((d) => d !== 'approved')) {
    const reason = declineReason(decision);
    assert.ok(reason.length > 0, decision);
    // A run that stopped must say nothing was sent. "Cancelled" alone leaves
    // the user guessing about the thing they actually care about.
    assert.match(reason, /nothing (was sent|left)|not used/i, decision);
  }
});

test('the timeout is long enough to read and decide', () => {
  assert.ok(CONSENT_TIMEOUT_MS >= 30_000);
});

// --- The summary -------------------------------------------------------------

const payload = {
  redacted_dom_summary: [{ redacted_value: '[EMAIL]' }, { redacted_value: null }, {}],
  redaction_manifest: [
    { category: 'password' },
    { category: 'email' },
    { category: 'password' },
  ],
  redacted_frame: 'x'.repeat(2048),
};

test('the summary counts elements, placeholders and frame size', () => {
  const request = summarise(payload, 'http://127.0.0.1:8787/analyze', 'run-1-step-1');
  assert.equal(request.elements, 3);
  assert.equal(request.placeholders, 3);
  assert.equal(request.frameKB, 2);
  assert.equal(request.endpoint, 'http://127.0.0.1:8787/analyze');
  assert.equal(request.id, 'run-1-step-1');
});

test('placeholders are counted from the manifest, not from the values', () => {
  // A page whose own visible text contains "[EMAIL]" must not be able to
  // inflate the number the user is shown. The manifest is the record of what
  // was actually replaced.
  const spoofed = {
    ...payload,
    redacted_dom_summary: [
      { redacted_value: '[EMAIL]' },
      { redacted_value: '[PASSWORD]' },
      { redacted_value: '[AADHAAR]' },
      { redacted_value: '[ID_NUMBER]' },
    ],
    redaction_manifest: [{ category: 'email' }],
  };
  assert.equal(summarise(spoofed, 'e', 'i').placeholders, 1);
});

test('categories come back most frequent first, and carry no values', () => {
  const request = summarise(payload, 'e', 'i');
  assert.deepEqual(request.hidden, [
    { category: 'password', count: 2 },
    { category: 'email', count: 1 },
  ]);
  // Nothing in the summary is page content. If this ever fails, the consent
  // surface has become a second renderer of transmitted data.
  assert.equal(JSON.stringify(request).includes('[EMAIL]'), false);
});

test('ties are ordered by name, so the same payload always reads the same', () => {
  const tied = { ...payload, redaction_manifest: [{ category: 'phone' }, { category: 'email' }] };
  assert.deepEqual(summarise(tied, 'e', 'i').hidden, [
    { category: 'email', count: 1 },
    { category: 'phone', count: 1 },
  ]);
});

test('no frame reports zero rather than guessing', () => {
  assert.equal(summarise({ ...payload, redacted_frame: null }, 'e', 'i').frameKB, 0);
  assert.equal(summarise({ ...payload, redacted_frame: undefined }, 'e', 'i').frameKB, 0);
});

test('a payload with nothing hidden still summarises', () => {
  // A clean page reaching the consent gate is the ordinary case, not an error.
  const clean = { redacted_dom_summary: [{}], redaction_manifest: [], redacted_frame: null };
  const request = summarise(clean, 'e', 'i');
  assert.equal(request.placeholders, 0);
  assert.deepEqual(request.hidden, []);
});
