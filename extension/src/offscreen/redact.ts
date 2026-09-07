/**
 * Visual redaction — painting sensitive regions out of the captured frame.
 *
 * Runs in the offscreen document because that is the only context that decodes
 * a frame, which is what makes "nothing else can leak pixels" checkable rather
 * than merely intended.
 *
 * The frame is decoded again here rather than held over from the analysis pass.
 * Caching the bitmap between the two stages would save perhaps 15ms and would
 * mean an unredacted screenshot sitting in memory for the whole detection
 * stage. PRD.md Section 16 asks for raw frames to be dropped promptly, and a
 * second decode is a cheap price for not holding one.
 */

import type { Rect, SensitiveRegion } from '../lib/types';

/**
 * Sensitive regions are painted out, not blurred.
 *
 * Blur looks better in a demo and is the more common choice, which is exactly
 * why it deserves scrutiny: it is a reduction in information, not a removal of
 * it. Blurred text and blurred faces have both been recovered by published
 * attacks, and a redaction that can be undone is not a redaction — it is an
 * inconvenience for whoever holds the image.
 *
 * SECURITY_PRIVACY.md treats a leak as the severe failure and an
 * over-redaction as the tolerable one, so this paints an opaque rectangle. The
 * pixels underneath are gone before the frame is encoded, not hidden behind
 * something.
 */
const REDACTION_FILL = '#111827';

/**
 * Encoding for the frame that actually crosses the wire.
 *
 * A separate decision from the capture format: this image is already redacted,
 * so nothing sensitive can be recovered from it however it is compressed, and
 * the only remaining considerations are payload size and whether the server's
 * vision model can still read the page. Quality 80 keeps text legible while
 * being far smaller than lossless.
 */
const OUTPUT_FORMAT = 'image/jpeg';
const OUTPUT_QUALITY = 0.8;

/**
 * Margin added around every painted region, in device pixels.
 *
 * Element rectangles come from `getBoundingClientRect` and faces from a model,
 * and neither is pixel-exact against a rasterised screenshot: subpixel text
 * rendering, focus rings and antialiasing all bleed a little past the box. A
 * few pixels of margin is the difference between a covered value and a covered
 * value with its ascenders showing.
 */
const BLEED_PX = 3;

function decodeDataUrl(dataUrl: string): Blob {
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

/** Convert a CSS-pixel rect into device pixels, with bleed, clamped to the frame. */
function toDevicePixels(
  rect: Rect,
  scaleX: number,
  scaleY: number,
  frameWidth: number,
  frameHeight: number,
): Rect {
  const left = Math.max(0, rect.x * scaleX - BLEED_PX);
  const top = Math.max(0, rect.y * scaleY - BLEED_PX);
  const right = Math.min(frameWidth, (rect.x + rect.width) * scaleX + BLEED_PX);
  const bottom = Math.min(frameHeight, (rect.y + rect.height) * scaleY + BLEED_PX);

  return { x: left, y: top, width: right - left, height: bottom - top };
}

export interface RedactFrameResult {
  /** The redacted frame, as a data URL. Safe to transmit. */
  dataUrl: string;
  /** How many regions were actually painted. */
  painted: number;
  /** Regions that could not be painted because their geometry was unusable. */
  skipped: number;
  redactionMs: number;
}

/**
 * Paint every sensitive region out of the frame and re-encode it.
 *
 * Every region is painted, not only the visual ones. A DOM detection means the
 * value is also *visible on screen* — an email address in a text field is in
 * the screenshot as surely as it is in the DOM — so replacing the DOM value
 * with a token while shipping a picture of it would defeat the entire exercise.
 */
export async function redactFrame(
  dataUrl: string,
  regions: readonly SensitiveRegion[],
  scaleX: number,
  scaleY: number,
): Promise<RedactFrameResult> {
  const started = performance.now();
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(decodeDataUrl(dataUrl));

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a 2D context for redaction.');

    context.drawImage(bitmap, 0, 0);

    let painted = 0;
    let skipped = 0;
    context.fillStyle = REDACTION_FILL;

    for (const region of regions) {
      // Checked before the bleed margin is applied. A region with no area
      // covers nothing, and adding a few pixels of margin would turn it into a
      // sliver that paints successfully and counts as a redaction — a manifest
      // entry claiming a face was hidden when a 6px stripe was drawn near it.
      if (region.position.width <= 0 || region.position.height <= 0) {
        skipped += 1;
        continue;
      }

      const rect = toDevicePixels(
        region.position,
        scaleX,
        scaleY,
        bitmap.width,
        bitmap.height,
      );

      // A region with no area covers nothing. Counted rather than ignored: a
      // manifest claiming a region was hidden when nothing was painted is a
      // false assurance, which is worse than a visible gap.
      if (rect.width <= 0 || rect.height <= 0) {
        skipped += 1;
        continue;
      }

      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      painted += 1;
    }

    const blob = await canvas.convertToBlob({
      type: OUTPUT_FORMAT,
      quality: OUTPUT_QUALITY,
    });

    return {
      dataUrl: await blobToDataUrl(blob),
      painted,
      skipped,
      redactionMs: performance.now() - started,
    };
  } finally {
    // Released on every path. The unredacted bitmap must not outlive the
    // function that painted over it (PRD.md Section 16).
    bitmap?.close();
  }
}

/**
 * Encode a blob as a data URL.
 *
 * FileReader rather than `URL.createObjectURL`: an object URL is a handle to
 * data still sitting in the document, which would have to be revoked and would
 * be one more way for a frame to outlive its use. A data URL is a value.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not encode the redacted frame.'));
    reader.readAsDataURL(blob);
  });
}
