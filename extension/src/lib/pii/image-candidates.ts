/**
 * Which images are worth reading, and what to do when we cannot read them.
 *
 * THE DESIGN POINT
 *
 * OCR must never be the only thing standing between a user and a leak.
 *
 * The obvious build is "run OCR on every image, redact what it finds". That
 * makes the whole protection contingent on an engine loading, a language model
 * being present, and a photograph being legible — and when any of those fails
 * it fails *silently*, transmitting a photographed ID card while the console
 * reports a clean run. A privacy guarantee that evaporates when a dependency is
 * missing is not a guarantee.
 *
 * So detection is two stages that fail in opposite directions:
 *
 *   1. CANDIDATES — geometry only, no engine, cannot fail. Which images are
 *      physically large enough to carry legible identifying text?
 *   2. READING — OCR over those crops. Improves PRECISION: it replaces "hide
 *      this whole image" with "hide these words, and name what they were".
 *
 * If stage 2 is unavailable or throws, stage 1's candidates are redacted whole.
 * The image was already judged capable of holding a document; without the
 * ability to read it we cannot claim it does not. That is
 * SECURITY_PRIVACY.md Section 4's uncertainty rule applied to a broken
 * dependency rather than to an ambiguous field.
 *
 * WHY NOT SIMPLY REDACT EVERY IMAGE
 *
 * Because it would work, and it would be useless. Blacking out every picture
 * leaves the reasoning model a page it cannot describe or act on, and the
 * product becomes a very thorough way of breaking websites. The size floor
 * below is what keeps the aggressive fallback affordable: an avatar cannot hold
 * a readable Aadhaar number, so it is never a candidate and never blacked out.
 */

import type { DomElement, SensitiveRegion } from '../types';

/**
 * Smallest image that could carry readable identifying text, in CSS pixels.
 *
 * Derived from the thing we are actually looking for rather than picked round:
 * a twelve-digit Aadhaar number printed on a card occupies roughly half the
 * card's width, and character strokes stop resolving below about 6px. That puts
 * the floor near 140px of card width. Height follows from the card's aspect —
 * an ID card is around 1.6:1, so 140px wide is about 88px tall.
 *
 * Set too low, every icon becomes a candidate and the fallback blacks out the
 * page furniture. Set too high, a small but legible document slips through.
 */
export const MIN_WIDTH = 140;
export const MIN_HEIGHT = 80;

/**
 * Aspect bounds, generous on purpose.
 *
 * Documents arrive as ID cards (~1.6), scanned A4 (~0.71), passport pages,
 * phone screenshots (~0.46) and photographs of any of those held at an angle.
 * The only thing being excluded here is furniture whose shape rules out a
 * document: banner strips and thin dividers, which are wide and flat.
 */
const MIN_ASPECT = 0.25;
const MAX_ASPECT = 4;

/**
 * An image that might be holding a document.
 *
 * Carries the element it came from so a region built later can point back at
 * it, and so the reason shown to the user can be specific.
 */
export interface ImageCandidate {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Images big enough to be worth reading.
 *
 * Pure and separately tested. This runs before any engine exists and its
 * verdict has to be identical whether OCR is available, broken or absent —
 * it is the part of the design that cannot be allowed to depend on anything.
 */
export function imageCandidates(elements: readonly DomElement[]): ImageCandidate[] {
  const candidates: ImageCandidate[] = [];

  for (const element of elements) {
    if (element.elementType !== 'image') continue;

    const { width, height } = element.position;
    if (width < MIN_WIDTH || height < MIN_HEIGHT) continue;

    const aspect = width / height;
    if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) continue;

    candidates.push({
      elementId: element.elementId,
      x: element.position.x,
      y: element.position.y,
      width,
      height,
    });
  }

  return candidates;
}

/**
 * Was the whole of this candidate inside the frame that was read?
 *
 * A crop is taken from a captured frame, and a frame holds one viewport. An
 * image that starts on screen and continues past the edge yields a crop of its
 * visible part only — and OCR then reports, accurately, that it found no
 * identifier in the half it was given. The caller reads that as "this image is
 * clean".
 *
 * That is how a scan can walk a whole page and still miss a card: clipped at
 * the bottom of one look, clipped at the top of the next, read twice and never
 * seen whole. The overlap between stops makes it rarer; this is what makes the
 * remaining cases reportable instead of invisible.
 */
export function fullyVisible(
  candidate: ImageCandidate,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    candidate.x >= 0 &&
    candidate.y >= 0 &&
    candidate.x + candidate.width <= viewportWidth &&
    candidate.y + candidate.height <= viewportHeight
  );
}

/**
 * Cover a candidate entirely, because it could not be read.
 *
 * The fallback, and the reason the whole feature is safe to ship before the
 * engine is proven. Deliberately reported at full confidence: this is not a
 * guess about the image's contents, it is a statement that its contents are
 * unknown and the rule for unknown is to hide.
 *
 * The reason string says "could not be read" rather than naming a category,
 * because claiming to have found an ID in an image nothing ever read would be
 * a lie told by the trust overlay — the one surface that must never tell one.
 */
export function unreadableImageRegions(
  candidates: readonly ImageCandidate[],
): SensitiveRegion[] {
  return candidates.map((candidate, index) => ({
    regionId: `image-unread-${index}`,
    // Not `id_number`: we do not know that. "Sensitive, kind unidentified" is
    // exactly what `other` exists to express.
    category: 'other',
    source: 'visual',
    confidence: 1,
    elementId: candidate.elementId,
    reason: 'image large enough to hold a document, and could not be read',
    position: {
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
    },
  }));
}
