/**
 * How large a rectangle is made before the recognition engine sees it.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * It is arithmetic that decides how much memory a scan peaks at and how much
 * text the engine can read, and it lives inside `ocr.ts`, which needs a browser,
 * a canvas and a 2.7MB WASM engine to run at all and therefore cannot be tested
 * here. Every coordinate defect in this project has been a plausible number
 * computed somewhere untested, so the number is computed here instead.
 *
 * WHY UPSCALE AT ALL
 *
 * Tesseract wants a capital height of roughly thirty pixels. Body text at
 * sixteen CSS pixels arrives at about eleven, and the engine reads past it. On
 * a real page this was measured rather than assumed: of 59 text items the DOM
 * reported, the engine read 16 - it missed roughly 73% of the text it was
 * looking straight at, which is the ceiling on everything the pixel layer can
 * contribute to metric 1 (TASKS.md T1.2).
 *
 * WHY THERE IS A CEILING ON IT
 *
 * Area grows with the square of the scale, and the canvas, the PNG encode and
 * the engine's own work all grow with area. Resource utilisation is 20% of the
 * score and a whole-page scan is already the heaviest path Shield has, so an
 * unbounded multiplier would trade one scored metric for another. The ceiling
 * is on PIXELS rather than on either dimension because pixels are what costs:
 * a wide short frame and a tall narrow one with the same area cost the same.
 *
 * NOTHING IS EVER MADE SMALLER HERE. A frame that already exceeds the ceiling
 * is read at its own resolution. Downscaling to fit a budget would make the
 * engine read less than it does today, on the largest screens, silently.
 */

/**
 * The smallest a crop is lifted to before recognition.
 *
 * An identifier printed inside a photograph is small by the time the whole
 * viewport has been captured, and a failed read is reported as an empty one -
 * which the caller treats as "nothing sensitive here" and transmits.
 */
export const MIN_RECOGNITION_WIDTH = 1000;

/**
 * How much the whole frame is enlarged on the scan path.
 *
 * Doubling, because it is the cheapest remedy that changes the capital height
 * the engine sees from about eleven pixels to about twenty-two, and because a
 * larger factor should follow a measurement rather than precede one. The scan
 * path is where this cost belongs: a run is budgeted at ~150ms end to end and
 * a scan already transmits nothing and spends seconds (DECISIONS.md 188).
 */
export const SCREEN_RECOGNITION_SCALE = 2;

/**
 * The most pixels the engine is ever handed.
 *
 * Nine megapixels is a 36MB RGBA canvas held transiently, against a scan that
 * already peaks at 217MB. The figure is not round for its own sake: doubling a
 * 1920x1080 frame needs 8.29MP, and that is the commonest viewport there is, so
 * a ceiling below this one would be clipping the ordinary case while claiming
 * to bound the extreme one. Above it the factor tapers rather than being
 * refused - a 4K frame is still enlarged, just by less.
 */
export const MAX_RECOGNITION_PIXELS = 9_000_000;

export interface RecognitionRequest {
  /** Lift the source to at least this width. */
  minWidth?: number;
  /** Multiply the source by at least this. */
  scale?: number;
}

export interface RecognitionSizing {
  /** What the engine will actually work on, in pixels. */
  width: number;
  height: number;
  /** The factor applied. Never below 1. */
  scale: number;
  /** True when the pixel ceiling decided the factor, not the request. */
  capped: boolean;
}

/** Float slack, so a factor that is arithmetically the one asked for is not reported as capped. */
const EPSILON = 1e-9;

/**
 * Decide what size a source rectangle is recognised at.
 *
 * `minWidth` and `scale` are both floors and the larger wins, so a caller can
 * ask for "at least a thousand pixels wide" and "at least twice the original"
 * together and get whichever matters for the rectangle it actually has.
 */
export function recognitionSizing(
  sourceWidth: number,
  sourceHeight: number,
  request: RecognitionRequest = {},
): RecognitionSizing {
  const width = Math.max(0, Math.round(sourceWidth));
  const height = Math.max(0, Math.round(sourceHeight));

  // A caller with an empty rectangle has a bug, and inventing a scale for it
  // would hide the bug behind a plausible number.
  if (width <= 0 || height <= 0) {
    return { width: 0, height: 0, scale: 1, capped: false };
  }

  const fromMinWidth = request.minWidth !== undefined ? request.minWidth / width : 1;
  const wanted = Math.max(1, fromMinWidth, request.scale ?? 1);

  const ceiling = Math.sqrt(MAX_RECOGNITION_PIXELS / (width * height));
  const scale = Math.max(1, Math.min(wanted, ceiling));

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
    capped: scale < wanted - EPSILON,
  };
}
