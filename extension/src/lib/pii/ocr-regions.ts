/**
 * Turn recognised text into sensitive regions.
 *
 * ONE SET OF RULES, THREE PLACES THEY APPLY
 *
 * The words this module receives are run through exactly the same predicates
 * that judge a form field and a page label — `classifyTextContent`, which
 * already consults the Indian identifier rules and the generic content
 * patterns. Writing a second set of rules for text that arrived as pixels would
 * mean an Aadhaar number is caught when typed and missed when photographed,
 * purely because two lists drifted apart. There is one list.
 *
 * WHAT A WORD BOX MEANS
 *
 * The engine reports each word with a box in the coordinates of the crop it was
 * given. Those become viewport CSS pixels here, once, in the same way
 * `faceRegions` converts the detector's normalised output — coordinate
 * conversion scattered across consumers is how a redaction ends up as a
 * plausible rectangle over the wrong pixels.
 *
 * ADJACENCY MATTERS
 *
 * An Aadhaar number is printed as three groups of four digits, and the engine
 * reports them as three separate words. Judged individually, "2345" is a
 * four-digit number and matches nothing. So words are joined into lines before
 * they are judged, and a line that matches has every word in it covered. This
 * is not a refinement — without it the most common real document layout in the
 * country produces no detection at all.
 */

import type { Rect, SensitiveRegion } from '../types';
import { classifyTextContent } from './dom-rules';
import type { ImageCandidate } from './image-candidates';

/** One word as the engine reported it, in crop-local pixels. */
export interface OcrWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the engine returned for one image crop. */
export interface OcrResult {
  elementId: string;
  words: OcrWord[];
}

/**
 * Vertical tolerance for treating two words as the same line, as a fraction of
 * word height. Photographs are never perfectly square to the camera, so a
 * strict test would split every line on a tilted card.
 */
const LINE_TOLERANCE = 0.6;

/** Group words into visual lines, preserving left-to-right order. */
export function groupIntoLines(words: readonly OcrWord[]): OcrWord[][] {
  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: OcrWord[][] = [];

  for (const word of sorted) {
    const line = lines.find((candidate) => {
      const first = candidate[0];
      if (!first) return false;
      const tolerance = Math.max(first.height, word.height) * LINE_TOLERANCE;
      // Compared on centres rather than tops: words of different sizes on one
      // line share a baseline, not an upper edge.
      const wordCentre = word.y + word.height / 2;
      const lineCentre = first.y + first.height / 2;
      return Math.abs(wordCentre - lineCentre) <= tolerance;
    });

    if (line) line.push(word);
    else lines.push([word]);
  }

  for (const line of lines) line.sort((a, b) => a.x - b.x);
  return lines;
}

/** The smallest box containing every word given. */
export function boundingBox(words: readonly OcrWord[]): Rect | null {
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
 * Letters an OCR engine routinely returns where a digit was printed.
 *
 * Not a theory. On the sample Aadhaar card, twelve printed zeros came back as
 * capital O and the number went undetected — the line was judged as text
 * because, to the rules, that is what it was.
 *
 * ID cards make this worse than ordinary prose does: they set identifiers in
 * wide-tracked capitals, which is exactly the condition under which O and 0, I
 * and 1, S and 5 are hardest to tell apart.
 */
const DIGIT_LOOKALIKES: Readonly<Record<string, string>> = {
  O: '0',
  o: '0',
  D: '0',
  I: '1',
  l: '1',
  i: '1',
  S: '5',
  s: '5',
  B: '8',
  Z: '2',
  z: '2',
  G: '6',
};

/** A token long enough, and confusable enough, to be a misread number group. */
const MIN_LOOKALIKE_TOKEN = 4;

/**
 * The same line, read as though every confusable letter were the digit it
 * resembles — but only in tokens that could plausibly be a number group.
 *
 * Scoped tightly on purpose. Rewriting letters everywhere would turn ordinary
 * words into digit strings and invent identifiers that were never on the page,
 * and an over-redaction that black-boxes a heading is a different kind of
 * failure, not an acceptable one. A token qualifies only if it is made ENTIRELY
 * of digits and lookalikes, and is at least as long as a number group — which
 * "SAMPLE" and "Government" are not, and "OOOO" is.
 */
export function digitVariant(text: string): string {
  return text
    .split(' ')
    .map((token) => {
      if (token.length < MIN_LOOKALIKE_TOKEN) return token;

      const convertible = [...token].every(
        (character) => /[0-9]/.test(character) || character in DIGIT_LOOKALIKES,
      );
      if (!convertible) return token;

      return [...token].map((character) => DIGIT_LOOKALIKES[character] ?? character).join('');
    })
    .join(' ');
}

/**
 * Padding around a matched line, as a fraction of its height.
 *
 * Engines report tight boxes that clip ascenders and descenders, and a
 * redaction that leaves the tops of digits visible is not a redaction. The same
 * reasoning already pads face boxes.
 */
const PAD = 0.25;

/**
 * Regions for everything identifying that was read out of one image.
 *
 * Scaling: the engine worked on a crop taken from the captured frame, which is
 * in device pixels, while everything downstream works in the CSS pixels of the
 * viewport. `candidate` carries the element's CSS-pixel box, so the ratio
 * between it and the crop is the conversion — no separate device-pixel-ratio
 * enters here, which is deliberate. The one time this pipeline trusted
 * `devicePixelRatio` over a measured ratio it produced face boxes that were
 * confidently wrong.
 */
export function ocrRegions(
  result: OcrResult,
  candidate: ImageCandidate,
  cropWidth: number,
  cropHeight: number,
): SensitiveRegion[] {
  if (cropWidth <= 0 || cropHeight <= 0) return [];

  const scaleX = candidate.width / cropWidth;
  const scaleY = candidate.height / cropHeight;
  const regions: SensitiveRegion[] = [];

  groupIntoLines(result.words).forEach((line, index) => {
    const text = line.map((word) => word.text).join(' ');

    // Judged as read, and then as though the confusable letters were digits.
    // The raw reading goes first so a line that genuinely is text keeps its own
    // classification rather than being reinterpreted as a number.
    const hit = classifyTextContent(text) ?? classifyTextContent(digitVariant(text));
    if (!hit) return;

    const box = boundingBox(line);
    if (!box) return;

    const padY = box.height * PAD;
    const padX = box.height * PAD;

    regions.push({
      regionId: `ocr-${candidate.elementId}-${index}`,
      category: hit.category,
      source: 'ocr',
      confidence: hit.confidence,
      elementId: candidate.elementId,
      // The rule name, never the text. This reason is written to the console
      // and shown in the trust overlay, and quoting what was just detected as
      // sensitive would leak it through the very surface built to prove we
      // don't.
      reason: `text in image — ${hit.reason}`,
      position: {
        x: candidate.x + (box.x - padX) * scaleX,
        y: candidate.y + (box.y - padY) * scaleY,
        width: (box.width + padX * 2) * scaleX,
        height: (box.height + padY * 2) * scaleY,
      },
    });
  });

  return regions;
}
