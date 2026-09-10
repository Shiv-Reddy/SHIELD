/**
 * Offscreen document entry point — Shield's pixel processor.
 *
 * The service worker sends a captured frame here and gets back detections. As
 * Module C lands, redaction will happen here too, and the service worker will
 * receive an already-redacted frame rather than raw pixels.
 *
 * This is the ONLY context in the extension that decodes a frame. That is a
 * deliberate, checkable property: if nothing else turns a capture into pixels,
 * nothing else can leak them.
 */

import {
  MSG,
  type OffscreenMessage,
  type AnalyseFrameResult,
  type ReadImagesReply,
  type ReadScreenReply,
} from '../lib/messages';
import { screenTextRegions } from '../lib/vision/screen-text';
import type { ExecutionBackend } from '../lib/settings';
import {
  detectFaces,
  disposeFaceDetector,
  ensureFaceDetector,
  modelDescriptor,
} from './face-detector';
import { redactFrame } from './redact';
import { readCrop, type CropRequest, type OcrReadResult } from './ocr';
import { runSelfTest } from './self-test';

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

/**
 * Decode a captured frame.
 *
 * The base64 is decoded by hand rather than through `fetch(dataUrl)` so that an
 * unredacted screenshot never touches a networking API, keeping "no code path
 * sends a frame anywhere before redaction" trivially auditable.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma === -1) {
    throw new Error('Frame was not an image.');
  }

  const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  return new Blob([bytes], { type: mime });
}

async function analyseFrame(
  dataUrl: string,
  viewportWidth: number,
  viewportHeight: number,
  forceBackend: ExecutionBackend | null,
): Promise<AnalyseFrameResult> {
  const detector = await ensureFaceDetector(forceBackend);

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));

    const detection = await detectFaces(bitmap);

    return {
      ok: true,
      backend: detector.backend,
      fellBack: detector.fellBack,
      forced: detector.forced,
      frame: {
        width: bitmap.width,
        height: bitmap.height,
        // Measured against the frame actually received rather than taken from
        // devicePixelRatio: scrollbars, zoom and Chrome's rounding all move the
        // real ratio, and redaction boxes are computed from CSS-pixel DOM
        // coordinates. A systematic scale error would offset every box.
        scaleX: bitmap.width / viewportWidth,
        scaleY: bitmap.height / viewportHeight,
      },
      detection,
    };
  } finally {
    // ImageBitmap pixels live outside the JS heap and are not collected
    // promptly. Released on every path so an aborted analysis never leaves a
    // screenshot resident (PRD.md Section 16).
    bitmap?.close();
  }
}

/**
 * Read every requested crop, one at a time.
 *
 * Sequential rather than parallel: there is one Tesseract worker and one WASM
 * heap behind it, so concurrent calls queue anyway while multiplying peak
 * memory. A page with eight large images would otherwise hold eight upscaled
 * canvases at once for no gain.
 *
 * Each crop's outcome is independent. One unreadable image must not discard the
 * words read from the others, and its failure must stay attached to it so that
 * image alone is covered.
 */
async function readImages(
  dataUrl: string,
  crops: readonly CropRequest[],
): Promise<ReadImagesReply> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));

    const results: OcrReadResult[] = [];
    for (const crop of crops) results.push(await readCrop(bitmap, crop));
    return { results };
  } finally {
    // The frame is a full-viewport screenshot and the most sensitive object in
    // the extension. Released on every path, as everywhere else here.
    bitmap?.close();
  }
}

/**
 * Read every word on the whole frame.
 *
 * WHY THIS IS ONE CROP AND NOT A NEW ENGINE PATH
 *
 * `readCrop` already takes an arbitrary rectangle in frame pixels, upscales it,
 * draws it to an OffscreenCanvas and hands it to the engine. The whole frame is
 * that rectangle. Writing a second path would mean two places where a crop
 * becomes a blob and two places to get the CSP pinning wrong.
 *
 * WHY IT IS NOT UPSCALED
 *
 * `readCrop` lifts a small crop to 1000px because an ID number inside a
 * photograph is tiny by the time the viewport has been captured. A frame is
 * already wider than that, so the scale is 1 and the frame is read at native
 * resolution. Body text at sixteen CSS pixels is marginal for the engine at
 * that size, and upscaling would help — at the cost of a canvas four times the
 * area, on a metric that scores resource use at 20%.
 *
 * That trade is left unmade on purpose. `vision/agreement.ts` reports exactly
 * what the engine failed to read that the DOM did see, so the size of the
 * problem is about to be a measured number rather than a guess. Tuning first
 * and measuring afterwards is how a threshold becomes folklore.
 */
async function readScreen(
  dataUrl: string,
  viewportWidth: number,
  viewportHeight: number,
): Promise<ReadScreenReply> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));

    const reading = await readCrop(bitmap, {
      elementId: 'screen',
      x: 0,
      y: 0,
      width: bitmap.width,
      height: bitmap.height,
    });

    if (!reading.ok) return { ok: false, message: reading.message };

    return {
      ok: true,
      regions: screenTextRegions(
        reading.words,
        { width: reading.cropWidth, height: reading.cropHeight },
        { width: viewportWidth, height: viewportHeight },
      ),
      frameWidth: bitmap.width,
      frameHeight: bitmap.height,
      words: reading.words.length,
    };
  } finally {
    // The frame is a full-viewport screenshot and the most sensitive object in
    // the extension. Released on every path, as everywhere else here.
    bitmap?.close();
  }
}

chrome.runtime.onMessage.addListener((message: OffscreenMessage, _sender, sendResponse) => {
  if (message.type === MSG.READ_IMAGES) {
    resetIdleTimer();
    readImages(message.dataUrl, message.crops)
      .then(sendResponse)
      .catch((error: unknown) => {
        // Every crop is reported failed rather than absent. An empty reply
        // would read as "no text in any of these", and the caller treats that
        // as clean — transmitting documents nothing ever examined.
        console.error('[shield] image reading failed outright', error);
        sendResponse({
          results: message.crops.map((crop) => ({
            ok: false as const,
            elementId: crop.elementId,
            message: error instanceof Error ? error.message : String(error),
          })),
        });
      });
    return true;
  }

  if (message.type === MSG.READ_SCREEN) {
    resetIdleTimer();
    readScreen(message.dataUrl, message.viewportWidth, message.viewportHeight)
      .then(sendResponse)
      .catch((error: unknown) => {
        // Reported as a failure, never as an empty read. A caller that cannot
        // tell "no text on this screen" from "this screen was never examined"
        // will treat the second as the first.
        console.error('[shield] screen reading failed', error);
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        } satisfies ReadScreenReply);
      });
    return true;
  }

  if (message.type === MSG.REDACT_FRAME) {
    resetIdleTimer();
    redactFrame(message.dataUrl, message.regions, message.scaleX, message.scaleY)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error: unknown) => {
        console.error('[shield] redaction failed', error);
        sendResponse({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return true;
  }

  if (message.type === MSG.RUN_SELF_TEST) {
    resetIdleTimer();
    const { modelUrl, inputName, shape } = modelDescriptor();
    void runSelfTest(modelUrl, inputName, shape).then(sendResponse);
    return true;
  }

  if (message.type === MSG.RELOAD_MODEL) {
    resetIdleTimer();
    const forced = message.forceBackend;
    void disposeFaceDetector()
      .then(() => ensureFaceDetector(forced))
      .then((info) => {
        console.info(`[shield] session rebuilt on ${info.backend}`);
      })
      .catch((error: unknown) => {
        console.warn('[shield] session rebuild failed', error);
      });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === MSG.WARM_UP) {
    resetIdleTimer();
    // Load and compile now so the first real frame doesn't pay for it. Failure
    // is not fatal: the model still loads lazily on the first analysis.
    void ensureFaceDetector(message.forceBackend).catch((error: unknown) => {
      console.warn('[shield] warm-up failed; model will load on first use', error);
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type !== MSG.ANALYSE_FRAME) return false;

  resetIdleTimer();
  analyseFrame(
    message.dataUrl,
    message.viewportWidth,
    message.viewportHeight,
    message.forceBackend,
  )
    .then(sendResponse)
    .catch((error: unknown) => {
      console.error('[shield] frame analysis failed', error);
      sendResponse({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      } satisfies AnalyseFrameResult);
    });

  // Returning true keeps the message channel open for the async reply above.
  return true;
});

resetIdleTimer();
console.info('[shield] offscreen inference host ready — build', __SHIELD_BUILD__);
