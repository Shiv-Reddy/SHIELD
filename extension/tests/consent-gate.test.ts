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
import { readFileSync } from 'node:fs';
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

/*
 * The defect a browser found on 2026-09-22, and the invariant that prevents it.
 *
 * With "ask before sending" on, a second run started while the first was still
 * waiting produced a card that could never be answered. The gate itself was
 * right — the first run was abandoned as 'stale' and nothing was transmitted —
 * but the abandoned run then reported `done`, and the popup clears the consent
 * card on any status that is not `awaiting-consent`. The card it cleared
 * belonged to the SECOND run, which was still waiting, so that run could only
 * time out. Consent worked exactly once per popup session.
 *
 * Nothing in the suite covered it because every existing test drives the gate
 * directly, where the popup does not exist. These pin the one fact the fix
 * rests on: 'stale' is produced by supersession and by nothing else, so it is
 * safe for the service worker to read it as "another run owns the status now".
 */

test('a second ask abandons the first as stale, and the second stays open', async () => {
  const first = gate.askForConsent(requestFor('step-1'));
  const second = gate.askForConsent(requestFor('step-2'));

  assert.equal(await first, 'stale', 'the abandoned run must not resolve to anything usable');

  // The replacement is still waiting — it is the run that owns the card now.
  assert.equal(gate.pendingConsentId(), 'step-2');

  assert.equal(gate.applyConsentDecision('step-2', true), true);
  assert.equal(await second, 'approved');
});

test('the abandoned run cannot be approved afterwards, by its own id or the new one', async () => {
  const first = gate.askForConsent(requestFor('step-1'));
  const second = gate.askForConsent(requestFor('step-2'));

  // A late click on the card the user actually saw for step 1.
  assert.equal(
    gate.applyConsentDecision('step-1', true),
    false,
    'an approval for a superseded payload must not be applied to anything',
  );

  assert.equal(await first, 'stale');
  gate.applyConsentDecision('step-2', false);
  assert.equal(await second, 'declined');
});

test('stale is never transmittable, which is what lets the worker act on it', () => {
  // The fix has the service worker treat 'stale' as "a newer run owns the
  // status" and return silently. That is only sound because 'stale' can never
  // authorise anything, on any path.
  assert.equal(mayTransmit('stale'), false);
});

test('a superseded run returns without writing the status', () => {
  /*
   * Read as text because the service worker cannot be imported under Node —
   * it binds chrome.* listeners at module scope. The same approach the dev-gate
   * test uses, and for the same reason.
   *
   * What is pinned is narrow and is the actual fix: the superseded branch must
   * come BEFORE the branches that call setStatus('done'), and must not call it
   * itself. Reordering it below them would restore the defect exactly.
   */
  const worker = readFileSync(
    new URL('../src/background/service-worker.ts', import.meta.url),
    'utf8',
  );

  const guard = worker.indexOf('if (outcome.superseded)');
  assert.ok(guard > 0, 'the superseded guard is gone — a second consented run can no longer be answered');

  const repeated = worker.indexOf('if (outcome.repeated)');
  const acted = worker.indexOf('if (!outcome.acted)');
  assert.ok(
    guard < repeated && guard < acted,
    'the superseded check must run before any branch that sets a terminal status',
  );

  // The branch body, up to the next `if`, must not set a status. Comments are
  // stripped first: this branch explains the defect in prose, and the words
  // naming it are not the same thing as a call to it.
  const body = worker
    .slice(guard, repeated)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  assert.equal(
    /setStatus\s*\(/.test(body),
    false,
    'a superseded run set the status again — that is the bug this branch exists to prevent',
  );
});
