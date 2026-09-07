/**
 * Content script — Shield's only code that runs inside the page.
 *
 * Injected on demand by the service worker when the user starts a run, never
 * declared statically, so it is absent from every page the user hasn't pointed
 * Shield at.
 *
 * Scope discipline matters here more than anywhere else in the extension: this
 * script sees raw page content, including real passwords. It reads the DOM and
 * replies to the service worker, and it must never acquire the ability to talk
 * to the network directly. All outbound traffic goes through the Transport
 * Layer in the service worker, downstream of the Redaction Engine
 * (ARCHITECTURE.md Section 4).
 */

import {
  MSG,
  type ContentMessage,
  type ExecuteActionResult,
  type ManualStatusResult,
  type PingResult,
} from '../lib/messages';
import type { ViewportInfo } from '../lib/types';
import { extractDomMap } from './dom-map';
import { executeAction } from './executor';
import { clearOverlay, showOverlay } from './overlay';
import {
  clearManual,
  manualRegionCount,
  manualRegionsInViewport,
  setManualVisible,
  startManual,
} from './manual-redaction';

const VERSION = chrome.runtime.getManifest().version;

/**
 * Registration is unconditional, and that is deliberate.
 *
 * The obvious approach is a `window.__shieldLoaded` flag to prevent double
 * injection — but that flag lives on the *page*, which outlives the extension.
 * Reload the extension and every already-open tab still carries the flag, so
 * the fresh injection skips registering while the previous script sits there
 * orphaned, unable to receive anything from the new extension instance. The tab
 * is then permanently deaf until someone reloads it by hand. That breaks every
 * open tab after any reload, which during a live demo is the worst possible
 * moment to discover it.
 *
 * No flag is needed, because the service worker only injects after a PING found
 * no live listener (see `ensureContentScript`). If the ping failed there is
 * either no script here or only an orphaned one, and an orphan cannot receive
 * our messages — so a fresh registration is always the correct response, and
 * never a duplicate one.
 */
register();

function register(): void {
  chrome.runtime.onMessage.addListener(
    (message: ContentMessage, _sender, sendResponse) => {
      switch (message.type) {
        case MSG.PING: {
          const result: PingResult = { ok: true, version: VERSION };
          sendResponse(result);
          return false;
        }

        case MSG.GET_VIEWPORT: {
          // `innerWidth`/`innerHeight` include the scrollbar, which is also
          // present in what captureVisibleTab returns, so the two agree. The
          // capture module derives the real scale from these against the
          // decoded frame rather than trusting devicePixelRatio outright.
          const result: ViewportInfo = {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
          };
          sendResponse(result);
          return false;
        }

        case MSG.EXTRACT_DOM: {
          try {
            sendResponse(extractDomMap());
          } catch (error) {
            // A scan that half-succeeded is worse than one that failed: a short
            // element map looks exactly like a page with little on it, and the
            // PII Detector would find nothing to hide on it. Fail closed.
            console.error('[shield] DOM scan failed', error);
            sendResponse(null);
          }
          return false;
        }

        case MSG.SHOW_OVERLAY: {
          try {
            showOverlay(message.regions);
          } catch (error) {
            // The overlay is an explanation, not a protection. If drawing it
            // fails the redaction has already happened, so this must never be
            // allowed to break a run.
            console.warn('[shield] could not draw the redaction overlay', error);
          }
          sendResponse({ ok: true });
          return false;
        }

        case MSG.START_MANUAL: {
          startManual();
          sendResponse({ ok: true });
          return false;
        }

        case MSG.MANUAL_STATUS: {
          const result: ManualStatusResult = { count: manualRegionCount() };
          sendResponse(result);
          return false;
        }

        case MSG.SET_MANUAL_VISIBLE: {
          setManualVisible(message.visible);
          sendResponse({ ok: true });
          return false;
        }

        case MSG.CLEAR_MANUAL: {
          clearManual();
          sendResponse({ ok: true });
          return false;
        }

        case MSG.GET_MANUAL_REGIONS: {
          // Converted here rather than in the worker: this is the context that
          // knows the scroll position, and a mark is stored against the
          // document rather than the screen.
          sendResponse({ regions: manualRegionsInViewport() });
          return false;
        }

        case MSG.EXECUTE_ACTION: {
          try {
            // The overlay is removed before acting. It sits over the page with
            // pointer-events off so it cannot intercept the click, but leaving
            // it up would also leave a claim about a screen that is about to
            // change.
            clearOverlay();

            const result: ExecuteActionResult = executeAction({
              action: message.action,
              expectedSelector: message.expectedSelector,
              expectedType: message.expectedType,
              expectedLabel: message.expectedLabel,
              typeValue: message.typeValue,
            });
            sendResponse(result);
          } catch (error) {
            // An action that threw halfway may have changed the page. Say so
            // plainly rather than reporting a clean failure: PRD.md Section 20
            // forbids silent failures, and "nothing happened" would be a claim
            // this code cannot actually make.
            console.error('[shield] action failed', error);
            sendResponse({
              ok: false,
              message: 'Shield could not complete that action on this page.',
            } satisfies ExecuteActionResult);
          }
          return false;
        }

        default:
          return false;
      }
    },
  );

  console.info(`[shield] content script active — v${VERSION}, build ${__SHIELD_BUILD__}`);
}
