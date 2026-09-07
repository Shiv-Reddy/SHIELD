/**
 * Screen capture — the first half of Screen Perception (ARCHITECTURE.md 2.1).
 *
 * Takes one still of the visible viewport and hands it straight to the
 * offscreen document, which owns everything to do with pixels. This module
 * deliberately does NOT decode the frame: keeping decoding in exactly one place
 * (src/offscreen/) means "which code can see raw pixels?" has a one-file answer,
 * and the service worker — the context that also talks to the network — is not
 * that file.
 *
 * The captured data URL is unredacted and unsafe to transmit.
 */

import type { RawFrame, ViewportInfo } from '../lib/types';

/**
 * JPEG rather than PNG, at high quality.
 *
 * This was PNG, on the reasoning that the vision model reads these pixels
 * directly and JPEG ringing around text costs detection recall — which is
 * weighted more heavily than latency. That decision recorded its own revisit
 * condition: a visually heavy page pushing a single cold capture over budget.
 * It fired. A photo-heavy real page produced a 1511KB PNG in 349.7ms against a
 * 100ms budget, with 26 seconds since the previous capture, so throttling
 * cannot explain it.
 *
 * Quality is set high deliberately. The concern behind the original choice was
 * real, so this trades the least fidelity that gets the latency back rather
 * than defaulting to something small and fast. See DECISIONS.md for the
 * recall measurement that settled it.
 */
const CAPTURE_FORMAT = 'jpeg' as const;
const CAPTURE_QUALITY = 90;

/**
 * Chrome throttles captureVisibleTab to roughly two calls per second and
 * rejects the excess. The multi-step task loop can legitimately capture faster
 * than that, so one quota rejection is retried rather than surfaced as a
 * failure the user has to understand. Confirmed as the cause of the 200-670ms
 * outliers seen during Task 2 verification.
 */
const QUOTA_RETRY_DELAY_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof Error && error.message.toUpperCase().includes('MAX_CAPTURE_VISIBLE_TAB')
  );
}

/**
 * When the previous capture finished, used only for diagnostics.
 *
 * Capture time has two causes with opposite fixes — Chrome throttling
 * back-to-back calls, and encode cost on a visually busy page — and the gap
 * since the last call is what separates them.
 */
let lastCaptureFinishedAt = 0;

/** Ask Chrome for one frame, retrying once if we hit the capture quota. */
async function captureRaw(windowId: number): Promise<string> {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, {
      format: CAPTURE_FORMAT,
      quality: CAPTURE_QUALITY,
    });
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    await sleep(QUOTA_RETRY_DELAY_MS);
    return await chrome.tabs.captureVisibleTab(windowId, {
      format: CAPTURE_FORMAT,
      quality: CAPTURE_QUALITY,
    });
  }
}

/**
 * Capture the visible viewport of `windowId`'s active tab.
 *
 * `viewport` is carried along rather than used here — the offscreen document
 * needs it to derive the CSS-pixel-to-frame-pixel scale once it has decoded the
 * frame and knows its true dimensions.
 */
export async function captureViewport(
  windowId: number,
  viewport: ViewportInfo,
): Promise<RawFrame> {
  let dataUrl: string;
  try {
    dataUrl = await captureRaw(windowId);
  } catch (error) {
    // captureVisibleTab refuses on pages extensions may not read at all —
    // chrome:// pages, the Web Store, the built-in PDF viewer, and any page
    // where activeTab was never granted. PRD.md Section 20 requires a specific
    // message here, not a generic failure.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Couldn't capture this page. Chrome blocks extensions from reading ` +
        `some pages, including chrome:// pages, the Web Store, and PDFs. (${detail})`,
    );
  }

  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new Error('The page reported an empty viewport, so there was nothing to read.');
  }

  // Base64 carries 3 bytes per 4 characters; near enough for a diagnostic.
  const encodedBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  const gapMs = lastCaptureFinishedAt === 0 ? null : Date.now() - lastCaptureFinishedAt;
  lastCaptureFinishedAt = Date.now();

  console.info(
    `[shield] frame ${CAPTURE_FORMAT} ${(encodedBytes / 1024).toFixed(0)}KB, ` +
      `${gapMs === null ? 'first capture this session' : `${gapMs}ms since last capture`}`,
  );

  return { dataUrl, viewport, capturedAt: Date.now() };
}
