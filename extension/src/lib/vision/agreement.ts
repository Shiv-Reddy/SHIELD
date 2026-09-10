/**
 * What the DOM sees, what the pixels see, and where they disagree — metric 1.
 *
 * WHY A COMPARISON IS THE EVIDENCE, RATHER THAN A SCORE
 *
 * The rubric asks whether a local model "correctly identifies on-screen
 * elements, text regions, and UI structure across varied real webpages". There
 * is no ground truth for that short of labelling every page by hand, and a
 * corpus of hand-labelled screens is a bigger job than the capability itself.
 *
 * But there are two independent readers of the same screen, and they fail in
 * different directions. Where they agree, both are almost certainly right —
 * markup and pixels arriving at the same answer by different routes is strong
 * evidence in a way that either alone is not. Where they disagree, the
 * disagreement names the limit:
 *
 *   pixel-only  text on the screen that the DOM cannot describe. Canvas, an
 *               iframe, a pasted screenshot, text baked into an image. This is
 *               the number that justifies the vision layer existing, and it is
 *               also a list of content that would otherwise be transmitted
 *               having never been examined.
 *
 *   dom-only    text the DOM reports and the engine did not read. Small type,
 *               low contrast, a webfont icon, or text scrolled under a fixed
 *               header. This is the honest ceiling on the pixel path.
 *
 * Neither list is a failure of the other reader. Reporting one number where two
 * belong would hide the thing worth knowing, which is the same argument this
 * project already makes about misses and over-flags.
 *
 * MATCHING IS ON POSITION AND TEXT, AND NEEDS BOTH
 *
 * Position alone matches a label to the field beneath it. Text alone matches
 * every "Submit" on a page to every other. Requiring both makes a match mean
 * "the same words in the same place", which is the claim being made.
 */

import type { DomElement, Rect } from '../types';
import type { ScreenTextRegion } from './screen-text';

/** One thing the DOM walk reported, reduced to what can be compared. */
export interface DomTextItem {
  elementId: string;
  /** Whatever the element shows: its value, its label, or its text. */
  text: string;
  position: Rect;
}

export interface AgreementReport {
  /** Seen by both readers, in the same place, saying the same thing. */
  agreed: { elementId: string; text: string }[];
  /** On screen, invisible to markup. The reason this layer exists. */
  pixelOnly: ScreenTextRegion[];
  /** In markup, unread by the engine. The pixel path's ceiling. */
  domOnly: DomTextItem[];
  /**
   * Agreed / everything either reader found.
   *
   * Deliberately not "agreed / DOM items". That denominator would let the
   * pixel reader score well by finding nothing at all, since a region it never
   * reported cannot disagree with anything.
   */
  agreement: number;
}

/**
 * How much two boxes must overlap to be the same thing on screen.
 *
 * Lower than the 0.5 the pixel benchmark uses for redaction, and deliberately.
 * A redaction box has to cover what it claims to cover; a text region only has
 * to be recognisably the same piece of screen, and an engine's line box and a
 * DOM element's border box legitimately differ — padding, line-height, and a
 * button whose label occupies half its width.
 */
export const OVERLAP = 0.2;

function area(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function intersection(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Overlap relative to the SMALLER box, not to their union.
 *
 * A word inside a large container is entirely that container's content, and
 * union-based IoU would score that near zero purely because the boxes differ in
 * size. What is being asked here is "is this the same piece of screen", not "do
 * these rectangles agree".
 */
function overlapRatio(a: Rect, b: Rect): number {
  const smaller = Math.min(area(a), area(b));
  if (smaller <= 0) return 0;
  return intersection(a, b) / smaller;
}

/**
 * Compare text for a match, forgivingly.
 *
 * OCR misreads characters, and demanding equality would report a disagreement
 * every time an l came back as a 1. Case, punctuation and spacing are dropped,
 * and containment either way counts: a DOM element holding a whole paragraph
 * legitimately contains a line the engine read, and a line the engine read can
 * legitimately contain a short label plus its value.
 */
export function textMatches(a: string, b: string): boolean {
  const normal = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const left = normal(a);
  const right = normal(b);
  if (left.length === 0 || right.length === 0) return false;

  return left === right || left.includes(right) || right.includes(left);
}

/**
 * Compare one screen read two ways.
 *
 * Greedy, best-overlap-first, one pixel region to one DOM item. Without the
 * one-to-one rule a single wide region would agree with every element it
 * covers, and a page whose whole body is one canvas would report perfect
 * agreement with the markup it cannot see.
 */
export function compareReadings(
  dom: readonly DomTextItem[],
  pixels: readonly ScreenTextRegion[],
): AgreementReport {
  const pairs: { domIndex: number; pixelIndex: number; overlap: number }[] = [];

  dom.forEach((item, domIndex) => {
    if (item.text.trim().length === 0) return;
    pixels.forEach((region, pixelIndex) => {
      const overlap = overlapRatio(item.position, region.position);
      if (overlap < OVERLAP) return;
      if (!textMatches(item.text, region.text)) return;
      pairs.push({ domIndex, pixelIndex, overlap });
    });
  });

  pairs.sort((a, b) => b.overlap - a.overlap);

  const matchedDom = new Set<number>();
  const matchedPixel = new Set<number>();
  const agreed: AgreementReport['agreed'] = [];

  for (const pair of pairs) {
    if (matchedDom.has(pair.domIndex) || matchedPixel.has(pair.pixelIndex)) continue;
    matchedDom.add(pair.domIndex);
    matchedPixel.add(pair.pixelIndex);

    const item = dom[pair.domIndex];
    if (item) agreed.push({ elementId: item.elementId, text: item.text });
  }

  // Elements with no text at all are not a disagreement about text. An empty
  // input is something the engine could not have read and was never asked to.
  const domOnly = dom.filter(
    (item, index) => item.text.trim().length > 0 && !matchedDom.has(index),
  );
  const pixelOnly = pixels.filter((_region, index) => !matchedPixel.has(index));

  const total = agreed.length + domOnly.length + pixelOnly.length;

  return {
    agreed,
    pixelOnly,
    domOnly,
    agreement: total > 0 ? agreed.length / total : 1,
  };
}

/**
 * What each element actually shows, for comparison against what was read.
 *
 * "Shows" is the operative word, and it is why this is not simply `value`. A
 * button displays its label; an empty field displays its placeholder; a text
 * node displays its own text. Comparing against something the screen does not
 * show would manufacture disagreements that say nothing about either reader.
 *
 * A password field is excluded outright. The content script never reads one -
 * it records a sentinel - and what is on the screen is a row of dots, which no
 * engine will ever match to anything. Including it would put a permanent,
 * meaningless entry in the dom-only column of the one number this file exists
 * to produce.
 */
export function domTextItems(elements: readonly DomElement[]): DomTextItem[] {
  const items: DomTextItem[] = [];

  for (const element of elements) {
    if (element.inputType === 'password') continue;

    const shown = element.value ?? element.label ?? element.placeholder ?? '';
    if (shown.trim().length === 0) continue;
    // Defensive: the sentinel is what a password field reports, and a field
    // that carries it without declaring its type would otherwise slip through.
    if (shown === '[has value]') continue;

    items.push({ elementId: element.elementId, text: shown, position: element.position });
  }

  return items;
}
