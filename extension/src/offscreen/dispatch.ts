/**
 * The vision path itself, independent of who is hosting it.
 *
 * WHY THIS IS NOT JUST `offscreen.ts`
 *
 * Chrome runs this inside an offscreen document, because an MV3 service worker
 * cannot host WebAssembly or WebGPU. Firefox has no offscreen documents and
 * needs none: its event page is a real DOM document and can do this work
 * itself. Two browsers, two hosts, and exactly one implementation of what the
 * host actually does — which is the point. DECISIONS.md 204 named this
 * extraction; 207 is the reason it was not attempted blind.
 *
 * So the message handling lives here as a plain async function, and each
 * browser's entry point supplies only the wiring:
 *
 *   Chrome   offscreen/offscreen.ts registers a `chrome.runtime` listener and
 *            passes `'document'` — it IS an offscreen document.
 *   Firefox  background/vision-host.ts calls this in-process and passes
 *            `'worker'` — there is nothing else for it to be, and running
 *            inference on the event page's own thread is what hung the browser
 *            in DECISIONS.md 207.
 *
 * WHY THE CALLER DECLARES THE HOST
 *
 * Because detecting it here is what DECISIONS.md 217 got wrong: the probe ran
 * in a context that could not answer it and silently changed Chrome's default.
 * A context knows what it is. It says so.
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
import type { InferenceHost } from './inference';
import {
  detectFaces,
  disposeFaceDetector,
  ensureFaceDetector,
  modelDescriptor,
} from './face-detector';
import { redactFrame } from './redact';
import {
  MIN_RECOGNITION_WIDTH,
  SCREEN_RECOGNITION_SCALE,
} from '../lib/vision/recognition-scale';
import { readCrop, type CropRequest, type OcrReadResult } from './ocr';
import { runSelfTest } from './self-test';

/** The messages this path answers. Anything else belongs to another listener. */
const HANDLED = new Set<string>([
  MSG.ANALYSE_FRAME,
  MSG.READ_IMAGES,
  MSG.READ_SCREEN,
  MSG.REDACT_FRAME,
  MSG.RUN_SELF_TEST,
  MSG.RELOAD_MODEL,
  MSG.WARM_UP,
]);

export function isVisionMessage(message: { type?: unknown }): message is OffscreenMessage {
  return typeof message.type === 'string' && HANDLED.has(message.type);
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
  forceInferenceHost: InferenceHost | null,
  contextHost: InferenceHost,
): Promise<AnalyseFrameResult> {
  const detector = await ensureFaceDetector(forceBackend, forceInferenceHost, contextHost);

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));

    const detection = await detectFaces(bitmap);

    return {
      ok: true,
      backend: detector.backend,
      fellBack: detector.fellBack,
      forced: detector.forced,
      host: detector.host,
      forcedHost: detector.forcedHost,
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
 * WHY IT IS UPSCALED, NOW THAT THERE IS A MEASUREMENT
 *
 * `readCrop` lifts a small crop to 1000px because an ID number inside a
 * photograph is tiny by the time the viewport has been captured. A frame is
 * already wider than that, so this path used to read at native resolution and
 * said so, deliberately: upscaling costs a canvas four times the area on a
 * metric that scores resource use at 20%, and the trade was left unmade until
 * somebody could say what it bought.
 *
 * `vision/agreement.ts` then said. On a real page the engine read 16 of the 59
 * text items the DOM reported — it missed roughly 73% of the text it was
 * looking straight at, which is the ceiling on everything this layer can
 * contribute to metric 1. So the frame is now doubled before recognition, and
 * the cost lands on the scan path, which transmits nothing and has seconds to
 * spend, rather than on a run budgeted at ~150ms (DECISIONS.md 188, 212).
 *
 * Measured after the fact: page agreement went 18.6% -> 22.8%, and the scan
 * footprint 217MB -> ~285MB. Both are in docs/RESOURCES.md, with the canvas
 * arithmetic that accounts for the second.
 *
 * The factor and its pixel ceiling live in `vision/recognition-scale.ts`, which
 * is tested.
 */
async function readScreen(
  dataUrl: string,
  viewportWidth: number,
  viewportHeight: number,
): Promise<ReadScreenReply> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(dataUrlToBlob(dataUrl));

    const reading = await readCrop(
      bitmap,
      {
        elementId: 'screen',
        x: 0,
        y: 0,
        width: bitmap.width,
        height: bitmap.height,
      },
      { minWidth: MIN_RECOGNITION_WIDTH, scale: SCREEN_RECOGNITION_SCALE },
    );

    if (!reading.ok) return { ok: false, message: reading.message };

    return {
      ok: true,
      // The word boxes are in the ENLARGED space, and `cropWidth`/`cropHeight`
      // describe that space. Passing the bitmap's own size here instead would
      // put every region at half its true coordinate — the exact shape of
      // defect this conversion is centralised to prevent.
      regions: screenTextRegions(
        reading.words,
        { width: reading.cropWidth, height: reading.cropHeight },
        { width: viewportWidth, height: viewportHeight },
      ),
      frameWidth: bitmap.width,
      frameHeight: bitmap.height,
      recognisedWidth: reading.cropWidth,
      recognisedHeight: reading.cropHeight,
      recognitionScale: reading.scale,
      words: reading.words.length,
    };
  } finally {
    // The frame is a full-viewport screenshot and the most sensitive object in
    // the extension. Released on every path, as everywhere else here.
    bitmap?.close();
  }
}

/**
 * Answer one vision message.
 *
 * Every branch resolves to the reply the caller expects, including on failure.
 * That is the rule the listener used to enforce and it moves here intact: a
 * caller that cannot tell "nothing found" from "never examined" will treat the
 * second as the first, and transmit a document nothing ever read.
 */
export async function dispatchVisionMessage(
  message: OffscreenMessage,
  contextHost: InferenceHost,
): Promise<unknown> {
  if (message.type === MSG.READ_IMAGES) {
    try {
      return await readImages(message.dataUrl, message.crops);
    } catch (error: unknown) {
      // Every crop is reported failed rather than absent. An empty reply
      // would read as "no text in any of these", and the caller treats that
      // as clean — transmitting documents nothing ever examined.
      console.error('[shield] image reading failed outright', error);
      return {
        results: message.crops.map((crop) => ({
          ok: false as const,
          elementId: crop.elementId,
          message: error instanceof Error ? error.message : String(error),
        })),
      } satisfies ReadImagesReply;
    }
  }

  if (message.type === MSG.READ_SCREEN) {
    try {
      return await readScreen(message.dataUrl, message.viewportWidth, message.viewportHeight);
    } catch (error: unknown) {
      // Reported as a failure, never as an empty read. A caller that cannot
      // tell "no text on this screen" from "this screen was never examined"
      // will treat the second as the first.
      console.error('[shield] screen reading failed', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      } satisfies ReadScreenReply;
    }
  }

  if (message.type === MSG.REDACT_FRAME) {
    try {
      const painted = await redactFrame(
        message.dataUrl,
        message.regions,
        message.scaleX,
        message.scaleY,
      );
      return { ok: true, ...painted };
    } catch (error: unknown) {
      console.error('[shield] redaction failed', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (message.type === MSG.RUN_SELF_TEST) {
    const { modelUrl, inputName, shape } = modelDescriptor();
    return runSelfTest(modelUrl, inputName, shape);
  }

  if (message.type === MSG.RELOAD_MODEL) {
    // Answered immediately and rebuilt behind the reply, exactly as the
    // listener did: the caller is asking for the session to be replaced, not
    // waiting on a model to finish compiling.
    void disposeFaceDetector()
      .then(() =>
        ensureFaceDetector(message.forceBackend, message.forceInferenceHost, contextHost),
      )
      .then((rebuilt) => {
        console.info(`[shield] session rebuilt on ${rebuilt.backend} in the ${rebuilt.host}`);
      })
      .catch((error: unknown) => {
        console.warn('[shield] session rebuild failed', error);
      });
    return { ok: true };
  }

  if (message.type === MSG.WARM_UP) {
    // Load and compile now so the first real frame doesn't pay for it. Failure
    // is not fatal: the model still loads lazily on the first analysis.
    void ensureFaceDetector(message.forceBackend, message.forceInferenceHost, contextHost).catch(
      (error: unknown) => {
        console.warn('[shield] warm-up failed; model will load on first use', error);
      },
    );
    return { ok: true };
  }

  if (message.type === MSG.ANALYSE_FRAME) {
    try {
      return await analyseFrame(
        message.dataUrl,
        message.viewportWidth,
        message.viewportHeight,
        message.forceBackend,
        message.forceInferenceHost,
        contextHost,
      );
    } catch (error: unknown) {
      console.error('[shield] frame analysis failed', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      } satisfies AnalyseFrameResult;
    }
  }

  throw new Error('Not a vision message');
}
