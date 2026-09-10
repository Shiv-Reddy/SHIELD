/**
 * A pixel-derived element map — what the screen says, read from the screen.
 *
 * WHY THIS EXISTS WHEN THE DOM WALK ALREADY WORKS
 *
 * DECISIONS.md 41 ruled out generic UI-element detection because the DOM maps a
 * login form in under four milliseconds, and that reasoning still holds: DOM
 * stays primary for action targeting. What it does not cover is text the DOM
 * cannot see at all. A `<canvas>` is one element with no children; an iframe's
 * contents are another document; a pasted screenshot is an image. Text rendered
 * into any of those reaches a capture without ever having been examined, which
 * is not merely a gap in metric 1 — it is content that could be transmitted
 * having never been looked at.
 *
 * So this reads the whole frame and reports where the words are. It is a second
 * opinion about the screen, and it is the only opinion available where markup
 * says nothing.
 *
 * WHAT A REGION IS, AND WHY LINES RATHER THAN PARAGRAPHS
 *
 * A line. Not a word, because a word is not a unit anybody reasons about and an
 * Aadhaar number is printed as three of them. Not a paragraph, because merging
 * across a form would join a label to the field below it and produce a box
 * describing neither. `groupIntoLines` in `pii/ocr-regions.ts` already draws
 * this boundary and is already tested, so it is reused rather than rewritten —
 * two line-groupers would drift, and the drift would be silent.
 *
 * COORDINATES
 *
 * Everything leaves here in viewport CSS pixels, the same space the DOM map and
 * the redaction canvas use. The conversion happens once, here, because every
 * coordinate defect in this project has been a plausible rectangle over the
 * wrong pixels, and each one came from doing the conversion somewhere new.
 */

import type { Rect } from '../types';
import { groupIntoLines, type OcrWord } from '../pii/ocr-regions';

/** One line of text the screen was found to contain. */
export interface ScreenTextRegion {
  /** What it says, words joined by single spaces. */
  text: string;
  /** Where, in viewport CSS pixels. */
  position: Rect;
  /** How many words the engine reported. A one-word region is often noise. */
  words: number;
}

/**
 * Words shorter than this, alone on a line, are dropped.
 *
 * OCR over a whole viewport reports stray marks as one- and two-character
 * words: an icon glyph read as `1`, a border read as `|`. Left in, they become
 * regions that agree with nothing and make the pixel layer look worse than it
 * is. A real one-word line — a button label, a heading — is longer than this.
 */
const MIN_LONE_WORD = 3;

/** Words the engine reported with no glyphs in them at all. */
function isEmpty(word: OcrWord): boolean {
  return word.text.trim().length === 0;
}

function boundsOf(words: readonly OcrWord[]): Rect | null {
  if (words.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const word of words) {
    left = Math.min(left, word.x);
    top = Math.min(top, word.y);
    right = Math.max(right, word.x + word.width);
    bottom = Math.max(bottom, word.y + word.height);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Turn one full-frame reading into text regions in viewport coordinates.
 *
 * `frameWidth` and `frameHeight` are the pixels the engine actually worked on;
 * `viewportWidth` and `viewportHeight` are CSS pixels. The ratio between them
 * is the conversion — no `devicePixelRatio` is consulted here, deliberately.
 * The one time this pipeline trusted that value over a measured ratio it
 * produced face boxes that were confidently wrong.
 */
export function screenTextRegions(
  words: readonly OcrWord[],
  frame: { width: number; height: number },
  viewport: { width: number; height: number },
): ScreenTextRegion[] {
  if (frame.width <= 0 || frame.height <= 0) return [];

  const scaleX = viewport.width / frame.width;
  const scaleY = viewport.height / frame.height;

  const regions: ScreenTextRegion[] = [];

  for (const line of groupIntoLines(words.filter((word) => !isEmpty(word)))) {
    const kept = line.filter((word) => word.text.trim().length > 0);
    if (kept.length === 0) continue;

    const text = kept.map((word) => word.text.trim()).join(' ');
    if (kept.length === 1 && text.length < MIN_LONE_WORD) continue;

    const box = boundsOf(kept);
    if (!box) continue;

    regions.push({
      text,
      position: {
        x: box.x * scaleX,
        y: box.y * scaleY,
        width: box.width * scaleX,
        height: box.height * scaleY,
      },
      words: kept.length,
    });
  }

  // Top to bottom, then left to right. Reading order is part of what a screen
  // map is for, and an engine reports blocks in whatever order it found them.
  return regions.sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
}
