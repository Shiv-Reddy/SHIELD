/**
 * Reading text out of images, on this machine.
 *
 * Runs in the offscreen document because that is where the decoded frame lives
 * and where a canvas exists. Raw pixels never leave it — the worker sends
 * rectangles and receives words, never an image.
 *
 * EVERYTHING IS LOCAL, AND THE CSP IS WHAT PROVES IT
 *
 * Tesseract's defaults fetch the worker, the WASM core and the language data
 * from unpkg and jsdelivr at run time. Left alone, this module would hand crops
 * of a user's screen to an engine downloaded from a third party — which is the
 * precise thing Shield exists to prevent, arrived at by accident through a
 * library default. All three paths are pinned to extension URLs, and the
 * extension CSP blocks the remote fetch if any of them is ever wrong. The
 * policy is the backstop for a careless default, not a formality.
 *
 * FAILURE IS EXPECTED AND HANDLED, NEVER SWALLOWED
 *
 * Loading a 2.7MB WASM engine can fail for reasons this code cannot fix. When
 * it does, this module says so and returns nothing — it never reports "no text
 * found", because the caller treats that as "this image is clean" and would
 * transmit a document it never read. `ok: false` and `ok: true, words: []` mean
 * completely different things here, and conflating them is the one bug in this
 * file that would be a privacy failure rather than a broken feature.
 */

import { createWorker, type Worker } from 'tesseract.js';
import type { OcrWord } from '../lib/pii/ocr-regions';
import {
  MIN_RECOGNITION_WIDTH,
  recognitionSizing,
  type RecognitionRequest,
} from '../lib/vision/recognition-scale';

/** Rectangle in FRAME (device) pixels, as the worker computed it. */
export interface CropRequest {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type OcrReadResult =
  | {
      ok: true;
      elementId: string;
      words: OcrWord[];
      /**
       * The size the engine worked at, which is the source times `scale`.
       * Every word box below is in THIS space, so a caller converting back to
       * viewport coordinates must divide by these and not by the frame.
       */
      cropWidth: number;
      cropHeight: number;
      /** The factor applied before recognition. 1 means read at source size. */
      scale: number;
    }
  | { ok: false; elementId: string; message: string };

let worker: Worker | null = null;
let loadFailed = false;
let loadError = '';

/**
 * Build the engine, once.
 *
 * A failure is remembered. Retrying a 2.7MB load on every image of every run
 * would turn one broken dependency into a page that takes a minute to fail.
 */
async function ensureWorker(): Promise<Worker | null> {
  if (worker) return worker;
  if (loadFailed) return null;

  try {
    worker = await createWorker('eng', 1, {
      workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
      langPath: chrome.runtime.getURL('tessdata'),
      // Tesseract fetches its worker script and re-wraps it in a `blob:` URL by
      // default, to sidestep cross-origin restrictions on the open web. Under
      // the extension CSP — `script-src 'self'` — a blob worker is blocked
      // outright, so the default silently prevents the engine from ever
      // starting. Ours is already same-origin; the workaround is unnecessary
      // here and fatal.
      workerBlobURL: false,
      // The language data is a local extension file. Caching a local file in
      // IndexedDB buys nothing and adds a storage path that can fail.
      cacheMethod: 'none',
      gzip: true,
    });
    return worker;
  } catch (error) {
    loadFailed = true;
    loadError = error instanceof Error ? error.message : String(error);
    // Logged here AND returned to the worker. This console belongs to the
    // offscreen document, which nobody has open during a demo, so a failure
    // that only appears here is a failure nobody can diagnose.
    console.error('[shield] OCR engine could not be loaded', error);
    return null;
  }
}

/**
 * Read one crop of the frame.
 *
 * The crop is enlarged, drawn to an OffscreenCanvas, and handed to the engine.
 * The blob never goes anywhere but into Tesseract, which is running in a worker
 * inside this extension.
 *
 * `sizing` is what the caller wants the engine to work at. A crop wants a floor
 * on its width, because an identifier inside a photograph is tiny; the whole
 * frame wants a multiplier, because it is already wide and still too small to
 * read. `recognition-scale.ts` owns the arithmetic and the pixel ceiling.
 */
export async function readCrop(
  bitmap: ImageBitmap,
  crop: CropRequest,
  sizing: RecognitionRequest = { minWidth: MIN_RECOGNITION_WIDTH },
): Promise<OcrReadResult> {
  const engine = await ensureWorker();
  if (!engine) {
    return {
      ok: false,
      elementId: crop.elementId,
      message: `OCR engine unavailable: ${loadError || 'unknown reason'}`,
    };
  }

  try {
    // Clamped to the frame: a element box can extend past the viewport edge,
    // and asking a canvas to read outside its source produces transparent
    // pixels that recognise as nothing.
    const sx = Math.max(0, Math.round(crop.x));
    const sy = Math.max(0, Math.round(crop.y));
    const sw = Math.min(Math.round(crop.width), bitmap.width - sx);
    const sh = Math.min(Math.round(crop.height), bitmap.height - sy);

    if (sw <= 0 || sh <= 0) {
      return { ok: false, elementId: crop.elementId, message: 'crop outside the frame' };
    }

    const { width, height, scale, capped } = recognitionSizing(sw, sh, sizing);
    if (capped) {
      // Said out loud rather than absorbed. A frame large enough to hit the
      // ceiling is read at less magnification than every other frame, so a
      // reading that looks worse on one machine has a stated cause here
      // instead of looking like the engine being unreliable.
      console.info(
        `[shield] recognition capped at ${scale.toFixed(2)}x for ${sw}x${sh} — pixel ceiling`,
      );
    }

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      return { ok: false, elementId: crop.elementId, message: 'no 2d context' };
    }

    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);

    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const { data } = await engine.recognize(blob, {}, { blocks: true });

    const words: OcrWord[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const item of line.words ?? []) {
            const box = item.bbox;
            words.push({
              text: item.text,
              x: box.x0,
              y: box.y0,
              width: box.x1 - box.x0,
              height: box.y1 - box.y0,
            });
          }
        }
      }
    }

    return {
      ok: true,
      elementId: crop.elementId,
      words,
      cropWidth: width,
      cropHeight: height,
      scale,
    };
  } catch (error) {
    // Reported as a failure, never as an empty read. The caller must be able to
    // tell "nothing identifying is in this image" from "this image was never
    // examined", because it hides the image in the second case.
    console.error('[shield] OCR failed on one image', error);
    return {
      ok: false,
      elementId: crop.elementId,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Release the engine and its 2.7MB of WASM. */
export async function disposeOcr(): Promise<void> {
  if (!worker) return;
  try {
    await worker.terminate();
  } catch {
    // Already gone. Nothing to recover.
  }
  worker = null;
}
