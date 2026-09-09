/**
 * OCR detection — TASKS.md Module B.
 *
 * Two properties matter more than any individual format here.
 *
 * First, that a candidate image is chosen by GEOMETRY ALONE, so the verdict is
 * identical whether the engine is present, broken or absent. That is what makes
 * the fallback trustworthy.
 *
 * Second, that words are judged as LINES. An Aadhaar number is printed as three
 * groups of four digits and reported as three separate words; judged
 * individually not one of them matches anything. Without line grouping the most
 * common document layout in the country produces no detection at all, which is
 * a silent failure of exactly the kind this project exists to prevent.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_HEIGHT,
  MIN_WIDTH,
  imageCandidates,
  unreadableImageRegions,
} from '../src/lib/pii/image-candidates';
import { boundingBox, digitVariant, groupIntoLines, ocrRegions } from '../src/lib/pii/ocr-regions';
import type { OcrWord } from '../src/lib/pii/ocr-regions';
import type { DomElement } from '../src/lib/types';

function image(id: string, width: number, height: number, x = 0, y = 0): DomElement {
  return {
    elementId: id,
    elementType: 'image',
    selector: `#${id}`,
    label: null,
    value: null,
    inputType: null,
    autocomplete: null,
    name: null,
    placeholder: null,
    position: { x, y, width, height },
  };
}

function word(text: string, x: number, y: number, width = 40, height = 14): OcrWord {
  return { text, x, y, width, height };
}

// --- Candidate selection -----------------------------------------------------

test('an image big enough to hold a document is a candidate', () => {
  assert.equal(imageCandidates([image('e1', 400, 250)]).length, 1);
});

test('an avatar is not a candidate, so the fallback never blacks it out', () => {
  // The size floor is what makes redacting unreadable images affordable. Without
  // it, every icon on the page would be covered whenever OCR was unavailable.
  assert.deepEqual(imageCandidates([image('e1', 48, 48)]), []);
});

test('an image exactly on the floor is a candidate; one pixel under is not', () => {
  assert.equal(imageCandidates([image('e1', MIN_WIDTH, MIN_HEIGHT)]).length, 1);
  assert.equal(imageCandidates([image('e2', MIN_WIDTH - 1, MIN_HEIGHT)]).length, 0);
  assert.equal(imageCandidates([image('e3', MIN_WIDTH, MIN_HEIGHT - 1)]).length, 0);
});

test('a banner strip is excluded by its aspect, not its size', () => {
  // 1200x90 is far past the size floor but no document is that shape.
  assert.deepEqual(imageCandidates([image('e1', 1200, 90)]), []);
});

test('portrait and landscape documents are both candidates', () => {
  // A scanned A4 (~0.71) and an ID card (~1.6) must both pass.
  const found = imageCandidates([image('a4', 400, 560), image('card', 400, 250)]);
  assert.deepEqual(found.map((c) => c.elementId), ['a4', 'card']);
});

test('non-image elements are never candidates', () => {
  const field = { ...image('e1', 400, 250), elementType: 'input' as const };
  assert.deepEqual(imageCandidates([field]), []);
});

// --- The fallback ------------------------------------------------------------

test('an unreadable candidate is covered whole, at full confidence', () => {
  // Not a guess about the contents. A statement that the contents are unknown,
  // and the rule for unknown is to hide.
  const [region] = unreadableImageRegions(imageCandidates([image('e1', 400, 250, 30, 40)]));

  assert.equal(region?.confidence, 1);
  assert.equal(region?.elementId, 'e1');
  assert.deepEqual(region?.position, { x: 30, y: 40, width: 400, height: 250 });
});

test('the fallback does not claim to have found an ID it never read', () => {
  // The trust overlay shows this reason. Naming a category here would be the
  // one surface in the product telling the user something untrue.
  const [region] = unreadableImageRegions(imageCandidates([image('e1', 400, 250)]));

  assert.equal(region?.category, 'other');
  assert.match(region?.reason ?? '', /could not be read/);
});

// --- Line grouping -----------------------------------------------------------

test('words on one line are grouped, and a second line stays separate', () => {
  const lines = groupIntoLines([
    word('2345', 10, 100),
    word('6789', 60, 101),
    word('0124', 110, 99),
    word('Government', 10, 140),
  ]);

  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0]?.map((w) => w.text), ['2345', '6789', '0124']);
  assert.deepEqual(lines[1]?.map((w) => w.text), ['Government']);
});

test('a line is grouped on centres, so a tilted photograph still reads', () => {
  // Real documents are photographed at an angle. Requiring identical tops would
  // split every such line and defeat the grouping entirely.
  const lines = groupIntoLines([word('2345', 10, 100), word('6789', 60, 105)]);
  assert.equal(lines.length, 1);
});

test('words are ordered left to right regardless of the order reported', () => {
  const [line] = groupIntoLines([word('0124', 110, 100), word('2345', 10, 100), word('6789', 60, 100)]);
  assert.deepEqual(line?.map((w) => w.text), ['2345', '6789', '0124']);
});

test('a bounding box contains every word given', () => {
  assert.deepEqual(boundingBox([word('a', 10, 20, 30, 10), word('b', 100, 25, 20, 10)]), {
    x: 10,
    y: 20,
    width: 110,
    height: 15,
  });
});

test('an empty line has no box rather than a zero one', () => {
  assert.equal(boundingBox([]), null);
});

// --- End to end --------------------------------------------------------------

test('an Aadhaar split across three words is detected as one region', () => {
  // THE test in this file. Judged word by word, "2345" matches nothing; the
  // number is only visible once the line is assembled.
  const candidate = { elementId: 'e1', x: 0, y: 0, width: 400, height: 250 };
  const regions = ocrRegions(
    { elementId: 'e1', words: [word('2345', 10, 100), word('6789', 60, 100), word('0124', 110, 100)] },
    candidate,
    400,
    250,
  );

  assert.equal(regions.length, 1);
  assert.equal(regions[0]?.category, 'id_number');
  assert.equal(regions[0]?.source, 'ocr');
});

test('the region is placed over the words, offset by the image position', () => {
  const candidate = { elementId: 'e1', x: 500, y: 300, width: 400, height: 250 };
  const [region] = ocrRegions(
    { elementId: 'e1', words: [word('2345', 10, 100), word('6789', 60, 100), word('0124', 110, 100)] },
    candidate,
    400,
    250,
  );

  // Crop and element are the same size here, so scale is 1 and the only shift is
  // the image's own position, plus the padding that stops digits being clipped.
  assert.ok(region);
  assert.ok(region.position.x > 500 && region.position.x < 510, 'starts near the words');
  assert.ok(region.position.y > 300 && region.position.y < 400, 'sits on the line');
  assert.ok(region.position.width > 140, 'spans all three groups');
});

test('a crop larger than the element is scaled down, not passed through', () => {
  // The frame is in device pixels and the element box is in CSS pixels. On a 2x
  // display the crop is twice the element, and a region built without scaling
  // would be twice the size and in the wrong place.
  const candidate = { elementId: 'e1', x: 0, y: 0, width: 400, height: 250 };
  const [region] = ocrRegions(
    { elementId: 'e1', words: [word('2345', 20, 200, 80, 28), word('6789', 120, 200, 80, 28), word('0124', 220, 200, 80, 28)] },
    candidate,
    800,
    500,
  );

  assert.ok(region);
  assert.ok(region.position.width < 200, 'halved by the 2x crop scale');
  assert.ok(region.position.y < 125, 'halved vertically too');
});

test('ordinary words in an image produce nothing', () => {
  const candidate = { elementId: 'e1', x: 0, y: 0, width: 400, height: 250 };
  const regions = ocrRegions(
    { elementId: 'e1', words: [word('Welcome', 10, 100), word('back', 80, 100)] },
    candidate,
    400,
    250,
  );

  assert.deepEqual(regions, []);
});

test('a zero-sized crop is refused rather than dividing by zero', () => {
  const candidate = { elementId: 'e1', x: 0, y: 0, width: 400, height: 250 };
  assert.deepEqual(
    ocrRegions({ elementId: 'e1', words: [word('2345', 0, 0)] }, candidate, 0, 0),
    [],
  );
});

test('the reason never quotes the text it matched', () => {
  const candidate = { elementId: 'e1', x: 0, y: 0, width: 400, height: 250 };
  const [region] = ocrRegions(
    { elementId: 'e1', words: [word('2345', 10, 100), word('6789', 60, 100), word('0124', 110, 100)] },
    candidate,
    400,
    250,
  );

  assert.equal(region?.reason.includes('2345'), false);
  assert.equal(region?.reason.includes('0124'), false);
});

// --- Misread digits ----------------------------------------------------------
//
// Found on the sample Aadhaar card: twelve printed zeros came back from the
// engine as capital O, and the number went undetected because to the rules that
// is exactly what it was — text. ID cards set identifiers in wide-tracked
// capitals, which is the condition under which O/0, I/1 and S/5 are hardest to
// tell apart, so this is the normal case rather than the unlucky one.

test('a number misread as letters is still detected', () => {
  const candidate = { elementId: 'e1', x: 0, y: 0, width: 400, height: 250 };
  const regions = ocrRegions(
    {
      elementId: 'e1',
      words: [word('OOOO', 10, 100), word('OOOO', 60, 100), word('OOOO', 110, 100)],
    },
    candidate,
    400,
    250,
  );

  assert.equal(regions.length, 1);
});

test('an Aadhaar whose zeros were misread is still detected', () => {
  const candidate = { elementId: 'e1', x: 0, y: 0, width: 400, height: 250 };
  const regions = ocrRegions(
    {
      elementId: 'e1',
      words: [word('2345', 10, 100), word('G789', 60, 100), word('Ol24', 110, 100)],
    },
    candidate,
    400,
    250,
  );

  assert.equal(regions.length, 1);
  assert.equal(regions[0]?.category, 'id_number');
});

test('ordinary words are NOT rewritten into numbers', () => {
  // The failure mode on the other side. Rewriting letters everywhere would
  // invent identifiers that were never on the page and black out headings.
  assert.equal(digitVariant('SAMPLE Government of India'), 'SAMPLE Government of India');
  assert.equal(digitVariant('Address Signature'), 'Address Signature');
});

test('only tokens made entirely of digits and lookalikes are rewritten', () => {
  assert.equal(digitVariant('OOOO'), '0000');
  assert.equal(digitVariant('IBZS'), '1825');
  // One letter outside the lookalike set is enough to leave a token alone, which
  // is why real words survive: 'SOIL' has an L, 'BOSS' has none but is caught by
  // nothing downstream, and anything with a vowel other than O or I is safe.
  assert.equal(digitVariant('SOIL'), 'SOIL');
  assert.equal(digitVariant('OOOX'), 'OOOX');
  // Too short to be a number group.
  assert.equal(digitVariant('OO'), 'OO');
});

test('a genuine word keeps its own reading before the digit variant is tried', () => {
  // The raw text is classified first, so a line that really is text is never
  // reinterpreted as a number.
  const candidate = { elementId: 'e1', x: 0, y: 0, width: 400, height: 250 };
  const regions = ocrRegions(
    { elementId: 'e1', words: [word('Signature', 10, 100), word('sample', 90, 100)] },
    candidate,
    400,
    250,
  );

  assert.deepEqual(regions, []);
});
