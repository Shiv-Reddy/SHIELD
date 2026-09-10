/**
 * The pixel-derived screen map, and the DOM-versus-pixels comparison.
 *
 * The comparison is the evidence for metric 1, so it is tested the way the
 * benchmark scorer is: every test here is a way it could report agreement that
 * is not there. The one that matters most is the whole-page canvas — a single
 * enormous region must not be allowed to agree with every element it happens to
 * cover, because that is precisely the page where the DOM sees nothing and the
 * number would look best.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { screenTextRegions } from '../src/lib/vision/screen-text';
import {
  compareReadings,
  domTextItems,
  textMatches,
  type DomTextItem,
} from '../src/lib/vision/agreement';
import type { DomElement } from '../src/lib/types';
import type { OcrWord } from '../src/lib/pii/ocr-regions';

function word(text: string, x: number, y: number, width = 40, height = 14): OcrWord {
  return { text, x, y, width, height };
}

const FRAME = { width: 1920, height: 1080 };
const VIEWPORT = { width: 1920, height: 1080 };

// --- Words into regions --------------------------------------------------------

test('words on one line become one region, in reading order', () => {
  const regions = screenTextRegions(
    [word('Account', 100, 200), word('holder', 145, 201), word('Priya', 190, 200)],
    FRAME,
    VIEWPORT,
  );

  assert.equal(regions.length, 1);
  assert.equal(regions[0]?.text, 'Account holder Priya');
  assert.equal(regions[0]?.words, 3);
});

test('words on different lines stay apart', () => {
  // A label and the field under it are not one thing, and merging them would
  // produce a box describing neither.
  const regions = screenTextRegions(
    [word('Password', 100, 200), word('Username', 100, 260)],
    FRAME,
    VIEWPORT,
  );

  assert.equal(regions.length, 2);
});

test('a region box covers every word in its line', () => {
  const [region] = screenTextRegions([word('one', 100, 200), word('two', 300, 200)], FRAME, VIEWPORT);

  assert.equal(region?.position.x, 100);
  assert.equal(region?.position.width, 240);
});

test('frame pixels are converted to viewport pixels once, here', () => {
  // A 2x device pixel ratio frame. Nothing downstream should have to know.
  const regions = screenTextRegions(
    [word('Aadhaar', 200, 400, 80, 28)],
    { width: 3840, height: 2160 },
    VIEWPORT,
  );

  assert.equal(regions[0]?.position.x, 100);
  assert.equal(regions[0]?.position.y, 200);
  assert.equal(regions[0]?.position.width, 40);
});

test('a stray one-character mark is not a text region', () => {
  // OCR over a whole viewport reads borders and icon glyphs as short words.
  // Left in, they agree with nothing and make the pixel layer look worse.
  const regions = screenTextRegions([word('|', 10, 10, 3, 12)], FRAME, VIEWPORT);
  assert.deepEqual(regions, []);
});

test('a real short label survives', () => {
  const regions = screenTextRegions([word('Sign in', 10, 10)], FRAME, VIEWPORT);
  assert.equal(regions.length, 1);
});

test('regions come back top to bottom', () => {
  const regions = screenTextRegions(
    [word('bottom', 100, 800), word('top', 100, 100), word('middle', 100, 400)],
    FRAME,
    VIEWPORT,
  );

  assert.deepEqual(
    regions.map((region) => region.text),
    ['top', 'middle', 'bottom'],
  );
});

test('a frame with no size reports nothing rather than dividing by zero', () => {
  assert.deepEqual(screenTextRegions([word('x', 0, 0)], { width: 0, height: 0 }, VIEWPORT), []);
});

// --- Matching text -------------------------------------------------------------

test('a misread character does not break a match', () => {
  // Demanding equality would report a disagreement every time l came back as 1.
  assert.equal(textMatches('Account holder', 'ACCOUNT  HOLDER!'), true);
});

test('a line inside a paragraph matches the paragraph', () => {
  assert.equal(
    textMatches('Sign in to continue to your dashboard.', 'continue to your dashboard'),
    true,
  );
});

test('different words do not match', () => {
  assert.equal(textMatches('Username', 'Password'), false);
});

test('empty text matches nothing, including other empty text', () => {
  assert.equal(textMatches('', ''), false);
  assert.equal(textMatches('   ', 'Username'), false);
});

// --- The comparison ------------------------------------------------------------

function domItem(elementId: string, text: string, x: number, y: number): DomTextItem {
  return { elementId, text, position: { x, y, width: 200, height: 20 } };
}

test('the same words in the same place count as agreement', () => {
  const report = compareReadings(
    [domItem('e1', 'Sign in', 100, 200)],
    screenTextRegions([word('Sign', 100, 200), word('in', 145, 200)], FRAME, VIEWPORT),
  );

  assert.equal(report.agreed.length, 1);
  assert.equal(report.agreement, 1);
});

test('the same words somewhere else are not agreement', () => {
  // Text alone would match every "Submit" on a page to every other.
  const report = compareReadings(
    [domItem('e1', 'Submit', 100, 200)],
    screenTextRegions([word('Submit', 100, 900)], FRAME, VIEWPORT),
  );

  assert.equal(report.agreed.length, 0);
  assert.equal(report.domOnly.length, 1);
  assert.equal(report.pixelOnly.length, 1);
});

test('different words in the same place are not agreement', () => {
  // Position alone matches a label to the field beneath it.
  const report = compareReadings(
    [domItem('e1', 'Password', 100, 200)],
    screenTextRegions([word('Username', 100, 200)], FRAME, VIEWPORT),
  );

  assert.equal(report.agreed.length, 0);
});

test('text the DOM cannot describe is reported as pixel-only', () => {
  // The whole point. A canvas is one element with no children, and an Aadhaar
  // number drawn into it reaches a capture unexamined.
  const report = compareReadings(
    [domItem('canvas', '', 0, 0)],
    screenTextRegions([word('2345', 400, 500), word('6789', 450, 500)], FRAME, VIEWPORT),
  );

  assert.equal(report.pixelOnly.length, 1);
  assert.equal(report.pixelOnly[0]?.text, '2345 6789');
});

test('an empty element is not counted as a disagreement about text', () => {
  // An empty input is something the engine could not have read and was never
  // asked to. Counting it would make every form look like a pixel failure.
  const report = compareReadings([domItem('e1', '', 100, 200)], []);

  assert.deepEqual(report.domOnly, []);
  assert.equal(report.agreement, 1);
});

test('one enormous region cannot agree with everything it covers', () => {
  // The defect this whole file exists for. A page whose body is one canvas is
  // exactly where the DOM sees least and the agreement number would look best.
  const wholePage: DomTextItem[] = [
    domItem('e1', 'Sign in', 100, 200),
    domItem('e2', 'Sign in', 100, 400),
    domItem('e3', 'Sign in', 100, 600),
  ];
  const oneBigRegion = screenTextRegions([word('Sign in', 0, 0, 1900, 1000)], FRAME, VIEWPORT);

  const report = compareReadings(wholePage, oneBigRegion);

  assert.equal(report.agreed.length, 1);
  assert.equal(report.domOnly.length, 2);
});

test('agreement is measured against everything either reader found', () => {
  // Not against the DOM alone: that denominator lets the pixel reader score
  // well by finding nothing, since a region never reported cannot disagree.
  const report = compareReadings(
    [domItem('e1', 'Sign in', 100, 200)],
    screenTextRegions(
      [word('Sign', 100, 200), word('in', 145, 200), word('9820011223', 100, 800)],
      FRAME,
      VIEWPORT,
    ),
  );

  assert.equal(report.agreed.length, 1);
  assert.equal(report.pixelOnly.length, 1);
  assert.equal(report.agreement, 0.5);
});

test('two readers that found nothing agree, rather than scoring zero', () => {
  const report = compareReadings([], []);
  assert.equal(report.agreement, 1);
});

// --- What the DOM side contributes ---------------------------------------------

function element(overrides: Partial<DomElement> & { elementId: string }): DomElement {
  return {
    elementType: 'input',
    selector: `html > body #${overrides.elementId}`,
    label: null,
    value: null,
    inputType: 'text',
    autocomplete: null,
    name: null,
    placeholder: null,
    position: { x: 0, y: 0, width: 200, height: 20 },
    ...overrides,
  };
}

test('an element is compared on what it shows, not only on its value', () => {
  // A button shows its label; an empty field shows its placeholder. Comparing
  // against something the screen does not show manufactures disagreements.
  const items = domTextItems([
    element({ elementId: 'a', value: 'typed' }),
    element({ elementId: 'b', label: 'Sign in' }),
    element({ elementId: 'c', placeholder: 'Search the notes' }),
  ]);

  assert.deepEqual(
    items.map((item) => item.text),
    ['typed', 'Sign in', 'Search the notes'],
  );
});

test('a password field is never compared', () => {
  // The screen shows dots and the content script records a sentinel. Including
  // it would put a permanent, meaningless entry in the dom-only column.
  const items = domTextItems([
    element({ elementId: 'p', inputType: 'password', value: '[has value]', label: 'Password' }),
    element({ elementId: 'q', value: '[has value]' }),
  ]);

  assert.deepEqual(items, []);
});

test('an element showing nothing contributes nothing', () => {
  assert.deepEqual(domTextItems([element({ elementId: 'a' })]), []);
  assert.deepEqual(domTextItems([element({ elementId: 'b', value: '   ' })]), []);
});

test('an element keeps its own box, so position can be compared', () => {
  const [item] = domTextItems([
    element({ elementId: 'a', value: 'x', position: { x: 40, y: 80, width: 10, height: 12 } }),
  ]);

  assert.deepEqual(item?.position, { x: 40, y: 80, width: 10, height: 12 });
});
