/**
 * Chrome's vision host — the offscreen document.
 *
 * This file is wiring and lifecycle only. What the host actually *does* lives
 * in `dispatch.ts`, because Firefox needs the same work done in a context that
 * is not an offscreen document, and two copies of it would drift (DECISIONS.md
 * 204, 216). What stays here is the part that is genuinely Chrome's: a
 * `chrome.runtime` listener, and an idle timer that closes a window.
 *
 * This is still the ONLY context in Chrome that decodes a frame. That is a
 * deliberate, checkable property: if nothing else turns a capture into pixels,
 * nothing else can leak them. The inference Worker does not weaken it — that
 * thread is handed normalised floats and never a frame (DECISIONS.md 216).
 */

import type { OffscreenMessage } from '../lib/messages';
import { dispatchVisionMessage, isVisionMessage } from './dispatch';

/**
 * How long this document stays alive with nothing to do.
 *
 * Creating the document and building the session costs about a second, and the
 * original design paid that on every single run by tearing the document down as
 * soon as a run finished. Measurement showed the trade was wrong: a run whose
 * actual inference took 84ms was spending ~1000ms on setup.
 *
 * So the document now outlives a single run and closes itself once genuinely
 * idle. That keeps the multi-step task loop fast — every step reuses one warm
 * session — while still not pinning a 25MB WASM module and GPU buffers
 * indefinitely, which is what the 20%-weighted resource metric penalises.
 *
 * It closes itself rather than being closed by the service worker because the
 * worker is evicted when idle and cannot be relied on to run a timer.
 */
const IDLE_SHUTDOWN_MS = 120_000;

let idleTimer: ReturnType<typeof setTimeout> | undefined;

function resetIdleTimer(): void {
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    console.info('[shield] offscreen host idle, shutting down');
    window.close();
  }, IDLE_SHUTDOWN_MS);
}

chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  // Anything not ours belongs to another listener, and saying so synchronously
  // is what lets it get there.
  if (!isVisionMessage(message)) return false;

  resetIdleTimer();

  // `'document'` is declared rather than detected. This module IS the offscreen
  // document, so its own existence is the capability check that face-detector
  // used to get wrong by probing `chrome.offscreen` from in here — an API this
  // context is not granted (DECISIONS.md 217).
  dispatchVisionMessage(message, 'document')
    .then(sendResponse)
    .catch((error: unknown) => {
      // The dispatcher answers its own failures per message type, so reaching
      // here means something outside those branches broke. Still answered
      // rather than dropped: an unanswered message leaves the caller waiting,
      // and on the run path that is a stall with no diagnosis.
      console.error('[shield] vision dispatch failed', error);
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    });

  // Returning true keeps the message channel open for the async reply above.
  return true;
});

resetIdleTimer();
console.info('[shield] offscreen inference host ready — build', __SHIELD_BUILD__);
