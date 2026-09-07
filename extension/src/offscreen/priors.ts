/**
 * UltraFace prior boxes and location decoding.
 *
 * This model does not emit rectangles. Its `boxes` output is a set of
 * regression offsets relative to a fixed grid of prior boxes, in the SSD style,
 * and turning them into coordinates requires reconstructing that grid and
 * applying the decode. Measured evidence: the raw output spans -4.268..3.368,
 * which is not a coordinate in any space.
 *
 * This was originally taken on faith from the reference implementation's
 * documentation, which describes the boxes as normalised 0..1. That is true of
 * some exports of this model and false of the file we ship. The cost of the
 * assumption was face regions with negative width reaching the redaction stage.
 *
 * The prior grid is fully determined by the input size and the architecture, so
 * it is generated once and reused. Its length is a strong self-check: these
 * constants must produce exactly 4420 priors, which is the number the model's
 * own output shape reports.
 */

/** Model input size, width then height. */
const IMAGE_WIDTH = 320;
const IMAGE_HEIGHT = 240;

/** Feature-map strides, one per detection head. */
const STRIDES = [8, 16, 32, 64] as const;

/** Prior box sizes in input pixels, per head. */
const MIN_BOXES: readonly (readonly number[])[] = [
  [10, 16, 24],
  [32, 48],
  [64, 96],
  // Three sizes on the last head, not two. Getting this wrong produced 4400
  // priors instead of 4420 — caught only because the count is checked against
  // the model's own output shape.
  [128, 192, 256],
];

/**
 * Variances from the training configuration.
 *
 * These scale the regression outputs and are not tunable: they must match the
 * values the model was trained with or every box lands in the wrong place, at
 * plausible-looking coordinates.
 */
const CENTER_VARIANCE = 0.1;
const SIZE_VARIANCE = 0.2;

/** How many priors these constants must produce, from the model's output shape. */
export const EXPECTED_PRIOR_COUNT = 4420;

/** A prior box in centre form, normalised to the input. */
export interface Prior {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

let cachedPriors: Prior[] | null = null;

/**
 * Build the prior grid.
 *
 * Ordering is load-bearing and must match the model's output ordering exactly:
 * head by head, then row, then column, then prior size within the cell. A
 * transposed loop produces the right *number* of priors and silently pairs
 * every offset with the wrong anchor.
 */
function buildPriors(): Prior[] {
  const priors: Prior[] = [];

  for (let head = 0; head < STRIDES.length; head += 1) {
    const stride = STRIDES[head] as number;
    const sizes = MIN_BOXES[head] as readonly number[];

    // The reference divides by the fractional scale, not by the rounded-up
    // feature-map size: at stride 32 the height scale is 7.5 while the feature
    // map has 8 rows, so the last row's centre sits exactly at 1.0.
    const scaleWidth = IMAGE_WIDTH / stride;
    const scaleHeight = IMAGE_HEIGHT / stride;
    const columns = Math.ceil(scaleWidth);
    const rows = Math.ceil(scaleHeight);

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        for (const size of sizes) {
          priors.push({
            cx: (column + 0.5) / scaleWidth,
            cy: (row + 0.5) / scaleHeight,
            width: size / IMAGE_WIDTH,
            height: size / IMAGE_HEIGHT,
          });
        }
      }
    }
  }

  return priors;
}

/**
 * The prior grid, built once.
 *
 * Throws if the count does not match the model's output shape. That mismatch
 * would otherwise decode every box against the wrong anchor and produce
 * confident detections in wrong places — the hardest kind of bug to see,
 * because nothing about the output looks malformed.
 */
export function getPriors(): Prior[] {
  if (cachedPriors) return cachedPriors;

  const priors = buildPriors();
  if (priors.length !== EXPECTED_PRIOR_COUNT) {
    throw new Error(
      `Prior grid mismatch: generated ${priors.length}, model expects ${EXPECTED_PRIOR_COUNT}. ` +
        'The prior configuration does not match the loaded model.',
    );
  }

  cachedPriors = priors;
  return priors;
}

export interface DecodedBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Decode one regression output against its prior, into normalised corners.
 *
 * The centre moves by an offset scaled by the prior's own size, and the size
 * scales exponentially — which is why raw values of -4.27 are ordinary rather
 * than corrupt.
 */
export function decodeBox(
  prior: Prior,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): DecodedBox {
  const cx = dx * CENTER_VARIANCE * prior.width + prior.cx;
  const cy = dy * CENTER_VARIANCE * prior.height + prior.cy;
  const width = Math.exp(dw * SIZE_VARIANCE) * prior.width;
  const height = Math.exp(dh * SIZE_VARIANCE) * prior.height;

  return {
    x1: cx - width / 2,
    y1: cy - height / 2,
    x2: cx + width / 2,
    y2: cy + height / 2,
  };
}
