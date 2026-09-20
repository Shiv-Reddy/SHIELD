/**
 * The wait, and every way out of it.
 *
 * lib/consent.ts decides what an outcome MEANS and is tested separately. This
 * covers the part that holds a run open: one request at a time, an id that has
 * to match, a timer, and a single approval path. The interesting assertions are
 * all negative — the things that must NOT resolve to 'approved' — because the
 * failure this design exists to prevent is a gate that sends when it is
 * confused (DECISIONS.md 240).
 *
 * `chrome.runtime.sendMessage` is stubbed to a rejected promise on purpose in
 * one test: that is the real shape of a closed popup, and the gate must treat
 * it as "nobody heard" rather than as an error to throw out of a run.
 */

import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_TIMEOUT_MS, mayTransmit, type ConsentRequest } from '../src/lib/consent';

/** Enough of the extension API for this module. Nothing else is touched. */
let sent: unknown[] = [];
let sendResult: () => Promise<unknown> = () => Promise.resolve(undefined);

(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    sendMessage: (message: unknown) => {
      sent.push(message);
      return sendResult();
    },
  },
};

const gate = await import('../src/background/consent-gate');

function requestFor(id: string): ConsentRequest {
  return {
    id,
    elements: 12,
    placeholders: 3,
    frameKB: 48,
    hidden: [{ category: 'password', count: 1 }],
    endpoint: 'http://127.0.0.1:8787/analyze',
  };
}

beforeEach(() => {
  sent = [];
  sendResult = () => Promise.resolve(undefined);
});

afterEach(() => {
  // Never leave a timer running into the next test.
  gate.cancelConsent();
});

test('an approval carrying the right id transmits', async () => {
  const decision = gate.askForConsent(requestFor('a'));
  assert.equal(gate.applyConsentDecision('a', true), true);
  assert.equal(await decision, 'approved');
  assert.equal(mayTransmit(await decision), true);
});

test('a decline does not', async () => {
  const decision = gate.askForConsent(requestFor('a'));
  gate.applyConsentDecision('a', false);
  assert.equal(await decision, 'declined');
  assert.equal(mayTransmit(await decision), false);
});

test('an approval for a different payload is refused, not applied', async () => {
  const decision = gate.askForConsent(requestFor('step-2'));

  // The exact scenario the id exists for: the user clicks approve on a card
  // still showing step 1 while step 2 is the one actually waiting.
  assert.equal(gate.applyConsentDecision('step-1', true), false);

  gate.cancelConsent();
  assert.equal(mayTransmit(await decision), false);
});

test('a second ask abandons the first, and the first can never be approved', async () => {
  const first = gate.askForConsent(requestFor('one'));
  const second = gate.askForConsent(requestFor('two'));

  assert.equal(await first, 'stale');
  // The abandoned request's id is gone, so a late click on its card does
  // nothing rather than approving whatever is waiting now.
  assert.equal(gate.applyConsentDecision('one', true), false);

  gate.cancelConsent();
  assert.equal(mayTransmit(await second), false);
});

test('answering twice changes nothing the second time', async () => {
  const decision = gate.askForConsent(requestFor('a'));

  assert.equal(gate.applyConsentDecision('a', false), true);
  // The slot is cleared by the first answer, so a double click cannot turn a
  // refusal into an approval.
  assert.equal(gate.applyConsentDecision('a', true), false);
  assert.equal(await decision, 'declined');
});

test('a cancelled run releases the wait as a refusal', async () => {
  const decision = gate.askForConsent(requestFor('a'));
  gate.cancelConsent();

  assert.equal(await decision, 'stale');
  assert.equal(mayTransmit(await decision), false);
});

test('a closed popup is not an error — the broadcast rejecting is survivable', async () => {
  // What Chrome actually does when there is no receiver.
  sendResult = () => Promise.reject(new Error('Could not establish connection'));

  const decision = gate.askForConsent(requestFor('a'));
  // The ask itself must not throw, and the request must still be answerable
  // if the popup opens a moment later.
  assert.equal(gate.applyConsentDecision('a', true), true);
  assert.equal(await decision, 'approved');
});

test('the request is broadcast, and carries no values', () => {
  gate.askForConsent(requestFor('a'));

  assert.equal(sent.length, 1);
  const message = sent[0] as { type: string; request: ConsentRequest };
  assert.equal(message.type, 'shield/consent-requested');
  assert.equal(message.request.id, 'a');

  // Counts and categories only. If a value ever reaches this message it
  // reaches a second renderer of transmitted data, which is the thing
  // lib/consent.ts is written to avoid.
  const serialised = JSON.stringify(message.request);
  assert.equal(serialised.includes('redacted_value'), false);
  assert.equal(serialised.includes('redacted_frame'), false);
});

/**
 * The path nobody clicks.
 *
 * Tested with fake timers rather than skipped, because a minute is too long to
 * wait and "it probably times out" is exactly the sort of assumption this
 * project keeps finding to be wrong. The timeout is not a fallback to sending:
 * it is the outcome for a popup opened, ignored and closed, which is the most
 * likely way this feature is ever exercised in the wild.
 */
test('no answer at all means not sent', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const decision = gate.askForConsent(requestFor('a'));
    mock.timers.tick(CONSENT_TIMEOUT_MS);

    assert.equal(await decision, 'timed-out');
    assert.equal(mayTransmit(await decision), false);
    // And the slot is clear, so a click arriving after the timeout cannot
    // revive a run that has already been refused.
    assert.equal(gate.applyConsentDecision('a', true), false);
  } finally {
    mock.timers.reset();
  }
});

test('an answer one tick before the deadline still counts', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const decision = gate.askForConsent(requestFor('a'));
    mock.timers.tick(CONSENT_TIMEOUT_MS - 1);

    assert.equal(gate.applyConsentDecision('a', true), true);
    assert.equal(await decision, 'approved');
  } finally {
    mock.timers.reset();
  }
});

test('nothing is pending once an answer has been given', async () => {
  const decision = gate.askForConsent(requestFor('a'));
  assert.equal(gate.pendingConsentId(), 'a');

  gate.applyConsentDecision('a', true);
  await decision;

  assert.equal(gate.pendingConsentId(), null);
});
