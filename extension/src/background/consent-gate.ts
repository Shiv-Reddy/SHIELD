/**
 * Holding one run open while the user decides.
 *
 * The decision logic — what counts as approval, what every other outcome
 * resolves to, what the user is shown — lives in lib/consent.ts, which is pure
 * and tested under Node. This is the part that cannot be: a promise that the
 * worker awaits, a broadcast to a popup that may not be open, and a timer.
 *
 * EVERY EXIT BUT ONE REFUSES
 *
 * There is exactly one call to `settle('approved')` in this file, and it is
 * behind a check that the id matches the request in flight. Decline, timeout,
 * a stale id, a second run starting underneath this one, and the worker being
 * evicted mid-wait all end in a decision that `mayTransmit` rejects. The
 * asymmetry is deliberate and it is the whole design: a gate that transmits
 * when it is confused manufactures the appearance of a control that is not
 * there.
 *
 * WORKER EVICTION IS A REFUSAL, NOT A HOLE
 *
 * MV3 can evict this worker during the wait. Nothing resumes: the promise, the
 * pending request and the run itself go with it, and no request is ever sent.
 * That is the safe direction, and it is why the pending state lives in memory
 * rather than in storage — persisting it would create the one case this file
 * does not otherwise have, an approval outliving the payload it was given for.
 */

import { CONSENT_TIMEOUT_MS, type ConsentDecision, type ConsentRequest } from '../lib/consent';
import { MSG } from '../lib/messages';

interface Pending {
  id: string;
  settle: (decision: ConsentDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * The one request in flight, if any.
 *
 * One, not a map: a run is a sequence of steps and only ever has one payload
 * waiting at a time. A map would allow two, which would mean deciding which
 * one a reply belonged to by something other than the id.
 */
let pending: Pending | null = null;

/** End the wait, exactly once, and clear the slot. */
function resolve(decision: ConsentDecision): void {
  if (!pending) return;
  clearTimeout(pending.timer);
  const { settle } = pending;
  pending = null;
  settle(decision);
}

/**
 * Ask, and wait.
 *
 * Returns a decision rather than a boolean, so the caller can tell the user
 * WHY nothing was sent. "No answer in 60 seconds" and "you said no" are
 * different events and a run that reported them identically would be hiding
 * the more interesting one.
 */
export function askForConsent(request: ConsentRequest): Promise<ConsentDecision> {
  // A second ask while one is outstanding abandons the first. It cannot be
  // approved afterwards — its id is gone from `pending`, so a late click on it
  // lands in the stale branch below.
  resolve('stale');

  return new Promise<ConsentDecision>((settle) => {
    const timer = setTimeout(() => resolve('timed-out'), CONSENT_TIMEOUT_MS);

    pending = { id: request.id, settle, timer };

    // No await and no catch on purpose: if the popup is shut there is no
    // receiver, chrome rejects, and the timeout is what that case resolves to.
    // Treating "nobody heard" as an error would turn a refusal into a thrown
    // exception halfway through a run.
    void chrome.runtime
      .sendMessage({ type: MSG.CONSENT_REQUESTED, request })
      .catch(() => undefined);
  });
}

/**
 * Apply the user's answer.
 *
 * Returns whether it was applied, so the caller can tell a real decision from
 * a click that arrived too late — the popup uses it to stop showing a card for
 * a request that no longer exists.
 */
export function applyConsentDecision(id: string, approved: boolean): boolean {
  // The id check is what makes a late approval harmless. Without it, an
  // approval for step 1 clicked during step 2 would authorise step 2's
  // payload, which the user never saw.
  if (!pending || pending.id !== id) return false;

  resolve(approved ? 'approved' : 'declined');
  return true;
}

/** Abandon any wait in flight — a cancelled run, a closed tab, a new task. */
export function cancelConsent(): void {
  resolve('stale');
}

/** The request currently awaiting an answer, for a popup opening mid-wait. */
export function pendingConsentId(): string | null {
  return pending?.id ?? null;
}
