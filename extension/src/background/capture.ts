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
 * JPEG rather than PNG, at high quality — on the run path. The scan path
 * chooses separately, below.
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
 * Which path asked for the frame.
 *
 * BOTH PATHS ENCODE THE SAME WAY, AND THAT IS A MEASUREMENT RATHER THAN AN
 * ACCIDENT
 *
 * The scan path was given PNG on the hypothesis that JPEG ringing around glyph
 * edges was costing recognition — DECISIONS.md 29's original argument, which 70
 * reverted only for the run path's 100ms budget, a budget the scan path does
 * not have (188). It was measured on 2026-09-20 and the hypothesis is dead:
 * the first stop of the income-tax login returned a reading IDENTICAL to the
 * JPEG run, 12 agreed / 9 pixel-only / 35 markup-only, to the item. Lossless
 * pixels do not help this engine read this text. DECISIONS.md 230.
 *
 * So the scan is back on JPEG and this seam is kept rather than deleted. It is
 * what made the experiment one constant instead of a refactor, it is what will
 * make the re-test one constant if a future recognition engine changes the
 * answer, and — the reason it is kept above all — it stops the equality being
 * read as nobody having thought about it. 29 and 70 came to disagree because
 * one path's decision was silently applied to another's.
 */
export type CapturePurpose = 'run' | 'scan';

/**
 * Chrome ignores `quality` unless the format is `jpeg`, and passing it anyway
 * would read as though it meant something. Returned as an object rather than
 * branched at the call site so the choice has one name and one test.
 */
export function captureEncoding(
  _purpose: CapturePurpose,
): { format: 'jpeg'; quality: number } | { format: 'png' } {
  return { format: CAPTURE_FORMAT, quality: CAPTURE_QUALITY };
}

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
async function captureRaw(windowId: number, purpose: CapturePurpose): Promise<string> {
  const encoding = captureEncoding(purpose);
  try {
    return await chrome.tabs.captureVisibleTab(windowId, encoding);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    await sleep(QUOTA_RETRY_DELAY_MS);
    return await chrome.tabs.captureVisibleTab(windowId, encoding);
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
  purpose: CapturePurpose = 'run',
): Promise<RawFrame> {
  let dataUrl: string;
  try {
    dataUrl = await captureRaw(windowId, purpose);
  } catch (error) {
    // captureVisibleTab refuses on pages extensions may not read at all —
    // chrome:// pages, the Web Store, the built-in PDF viewer, and any page
    // where activeTab was never granted. PRD.md Section 20 requires a specific
    // message here, not a generic failure.
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      // Permission is granted per click and lapses when the page changes, so on
      // an ordinary site the fix is one click, and the message leads with it.
      `Couldn't capture this page. If you've just moved to it, click the Shield ` +
        `icon in the toolbar to let Shield read it. Chrome also blocks extensions ` +
        `from reading chrome:// pages, the Web Store, and PDFs. (${detail})`,
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
    `[shield] frame ${captureEncoding(purpose).format} ${(encodedBytes / 1024).toFixed(0)}KB, ` +
      `${gapMs === null ? 'first capture this session' : `${gapMs}ms since last capture`}`,
  );

  return { dataUrl, viewport, capturedAt: Date.now() };
}
