/**
 * Turn face-detector output into sensitive regions.
 *
 * The visual detector is supplementary by design (CLAUDE.md): it exists for what
 * the DOM cannot express, and a face is the clearest example — no attribute
 * anywhere in the markup says "a person's face is rendered here".
 *
 * Pure, like the DOM rules, so the coordinate maths can be tested without a
 * browser. Coordinate errors are the failure mode that matters here: a box
 * offset by a systematic scale factor still looks like a plausible redaction
 * while leaving the actual face visible.
 */

import type { FaceBox, FrameGeometry, SensitiveRegion } from '../types';

/**
 * Convert normalised face boxes into CSS-pixel regions.
 *
 * Everything downstream — the redaction overlay, the trust UI, action
 * coordinates — works in CSS pixels of the viewport, the same space
 * `DomElement.position` uses. The detector works in fractions of the captured
 * frame, and the frame is in device pixels. Converting here, once, keeps a
 * single conversion in the codebase instead of one per consumer.
 */
export function faceRegions(
  faces: readonly FaceBox[],
  geometry: FrameGeometry,
): SensitiveRegion[] {
  // A frame that was never measured would silently divide by zero and produce
  // Infinity-sized regions. Refusing is better than redacting the universe.
  if (geometry.width <= 0 || geometry.height <= 0) return [];
  if (geometry.scaleX <= 0 || geometry.scaleY <= 0) return [];

  return faces.map((face, index) => {
    const left = (face.x1 * geometry.width) / geometry.scaleX;
    const top = (face.y1 * geometry.height) / geometry.scaleY;
    const right = (face.x2 * geometry.width) / geometry.scaleX;
    const bottom = (face.y2 * geometry.height) / geometry.scaleY;

    return {
      regionId: `face-${index}`,
      category: 'face',
      source: 'visual',
      confidence: face.score,
      // No DOM element corresponds to a face. This is exactly the gap the
      // visual layer exists to cover.
      elementId: null,
      reason: `face detected at ${(face.score * 100).toFixed(0)}% confidence`,
      position: {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      },
    };
  });
}
