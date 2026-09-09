/**
 * The scorer — the instrument, not the thing it measures.
 *
 * A benchmark nobody has checked is worse than no benchmark, because its output
 * looks like evidence. Every test here is a way the scorer could report a number
 * kinder than the truth, and the first attempt at this file actually contained
 * one: the corpus-wide coverage averaged per-page ratios and dropped any page
 * whose coverage was zero, so a page where every field was missed made the score
 * go UP. That is the class of defect these tests exist for.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PIXEL_IOU,
  iou,
  scoreByCategory,
  scorePage,
  scorePixels,
  summarise,
  summarisePixels,
  type LabelledPage,
  type PixelTruth,
  type ScoredDetection,
} from '../src/lib/benchmark/score';

const BOX = { x: 0, y: 0, width: 100, height: 10 };

function page(overrides: Partial<LabelledPage> = {}): LabelledPage {
  return {
    id: 'p1',
    source: 'fixture',
    elements: [
      { elementId: 'a', position: BOX },
      { elementId: 'b', position: BOX },
      { elementId: 'c', position: BOX },
    ],
    sensitive: [
      { elementId: 'a', category: 'password' },
      { elementId: 'b', category: 'email' },
    ],
    ...overrides,
  };
}

function detected(elementId: string | null, category: ScoredDetection['category']): ScoredDetection {
  return { elementId, category, position: BOX };
}

// --- Counting ------------------------------------------------------------------

test('a perfect run scores full recall and precision', () => {
  const score = scorePage(page(), [detected('a', 'password'), detected('b', 'email')]);

  assert.equal(score.truePositives, 2);
  assert.deepEqual(score.missed, []);
  assert.deepEqual(score.overFlagged, []);
  assert.equal(score.coverage, 1);
});

test('a missed field is named, not just counted', () => {
  // Every miss is a specific thing to go and look at.
  const score = scorePage(page(), [detected('a', 'password')]);

  assert.deepEqual(score.missed, [{ elementId: 'b', category: 'email' }]);
});

test('an over-flag is recorded against the element it hit', () => {
  const score = scorePage(page(), [
    detected('a', 'password'),
    detected('b', 'email'),
    detected('c', 'other'),
  ]);

  assert.deepEqual(score.overFlagged, ['c']);
});

test('finding a field but naming it wrongly still counts as found', () => {
  // It was hidden, which is what protects the user. The category is a separate
  // question and has its own number — conflating them would let a detector that
  // hides everything as "other" look like it had failed.
  const score = scorePage(page(), [detected('a', 'email'), detected('b', 'email')]);

  assert.equal(score.truePositives, 2);
  assert.equal(score.categoryCorrect, 1);
});

test('a region with no element is ignored rather than scored as a mistake', () => {
  // Faces and text inside photographs have nothing in this corpus to compare
  // against. Scoring them as false positives would penalise the visual layer
  // for doing the one job the DOM cannot.
  const score = scorePage(page(), [
    detected('a', 'password'),
    detected('b', 'email'),
    detected(null, 'face'),
  ]);

  assert.deepEqual(score.overFlagged, []);
});

test('the same element flagged twice is one detection', () => {
  const score = scorePage(page(), [detected('a', 'password'), detected('a', 'other')]);

  assert.equal(score.truePositives, 1);
  assert.equal(score.detected, 1);
});

// --- Area ----------------------------------------------------------------------

test('coverage falls when a sensitive area is left visible', () => {
  const score = scorePage(page(), [detected('a', 'password')]);

  assert.equal(score.coverage, 0.5);
});

test('redaction precision falls when harmless area is painted', () => {
  // Metric 3, directly: of everything covered, how much needed covering.
  const score = scorePage(page(), [
    detected('a', 'password'),
    detected('b', 'email'),
    detected('c', 'other'),
  ]);

  assert.equal(score.redactionPrecision.toFixed(3), (2 / 3).toFixed(3));
});

test('a blanket redaction scores perfect coverage and poor precision', () => {
  // The failure metric 3 exists to catch, and the reason coverage is never
  // quoted alone.
  const wide = page({
    elements: [
      { elementId: 'a', position: BOX },
      { elementId: 'b', position: BOX },
      { elementId: 'whole-page', position: { x: 0, y: 0, width: 1920, height: 945 } },
    ],
  });

  const score = scorePage(wide, [
    detected('a', 'password'),
    detected('b', 'email'),
    detected('whole-page', 'other'),
  ]);

  assert.equal(score.coverage, 1);
  assert.ok(score.redactionPrecision < 0.01, 'a blanket blur must score near zero');
});

test('a clean page that stayed clean is not a precision failure', () => {
  const clean = page({ sensitive: [] });
  const score = scorePage(clean, []);

  assert.equal(score.redactionPrecision, 1);
  assert.equal(score.coverage, 1);
});

// --- Aggregation ---------------------------------------------------------------

test('a page where everything was missed still counts against the total', () => {
  // THE regression. The first version averaged per-page ratios and excluded any
  // page scoring zero, so total failure on one page raised the corpus score.
  const good = scorePage(page({ id: 'good' }), [
    detected('a', 'password'),
    detected('b', 'email'),
  ]);
  const bad = scorePage(page({ id: 'bad' }), []);

  const report = summarise([good, bad], []);

  assert.equal(report.overall.coverage, 0.5, 'the failed page must pull the average down');
  assert.equal(report.overall.recall, 0.5);
  assert.equal(report.overall.missed, 2);
});

test('a big page weighs more than a small one in the area figures', () => {
  // Averaging ratios would weight a page with one field the same as a page with
  // twenty. Areas are summed instead.
  const small = scorePage(
    page({
      id: 'small',
      elements: [{ elementId: 'a', position: { x: 0, y: 0, width: 10, height: 10 } }],
      sensitive: [{ elementId: 'a', category: 'password' }],
    }),
    [],
  );
  const large = scorePage(
    page({
      id: 'large',
      elements: [{ elementId: 'a', position: { x: 0, y: 0, width: 1000, height: 1000 } }],
      sensitive: [{ elementId: 'a', category: 'password' }],
    }),
    [detected('a', 'password')],
  );

  const report = summarise([small, large], []);

  assert.ok(report.overall.coverage > 0.99, 'the large page should dominate the area');
});

// --- Per category ---------------------------------------------------------------

test('recall is reported per category, because the aggregate hides the gap', () => {
  // A detector that finds every password and no ID number scores respectably
  // overall on a corpus of login pages. That is exactly the failure this
  // project cannot afford, so the table is broken out.
  const rows = scoreByCategory([
    {
      page: page({
        sensitive: [
          { elementId: 'a', category: 'password' },
          { elementId: 'b', category: 'id_number' },
        ],
      }),
      detections: [detected('a', 'password')],
    },
  ]);

  const password = rows.find((row) => row.category === 'password');
  const idNumber = rows.find((row) => row.category === 'id_number');

  assert.equal(password?.recall, 1);
  assert.equal(idNumber?.recall, 0);
});

test('a false positive is charged to the category it was claimed to be', () => {
  // That is the claim the detector actually made, and the one to go and fix.
  const rows = scoreByCategory([
    { page: page({ sensitive: [] }), detections: [detected('c', 'address')] },
  ]);

  const address = rows.find((row) => row.category === 'address');
  assert.equal(address?.falsePositives, 1);
  assert.equal(address?.precision, 0);
});

// --- The pixel layer ----------------------------------------------------------
//
// Same standard as the rest of this file: every test is a way the pixel scorer
// could report a number kinder than the truth. The one that matters most is the
// blanket rectangle — a single box over a whole ID card covers every labelled
// line on it, and a scorer that accepted that would applaud exactly the
// behaviour metric 3 exists to catch.

const NUMBER = { x: 20, y: 250, width: 240, height: 26 };
const NAME = { x: 160, y: 90, width: 180, height: 18 };
const WHOLE_CARD = { x: 0, y: 0, width: 640, height: 380 };

function card(pixels?: readonly PixelTruth[]): LabelledPage {
  const base: LabelledPage = { id: 'card', source: 'fixture', elements: [], sensitive: [] };
  // Spread rather than assigned: `exactOptionalPropertyTypes` treats an
  // explicit `undefined` as a different thing from an absent key, and the
  // scorer's "this page has no pixel truth" case is the absent one.
  return pixels ? { ...base, pixels } : base;
}

function found(position: { x: number; y: number; width: number; height: number },
               category: ScoredDetection['category'] = 'id_number'): ScoredDetection {
  return { elementId: null, category, position };
}

test('a box on the number finds the number', () => {
  const score = scorePixels(
    card([{ category: 'id_number', position: NUMBER, what: 'the Aadhaar number' }]),
    [found(NUMBER)],
  );

  assert.equal(score.truePositives, 1);
  assert.equal(score.recall, 1);
  assert.equal(score.coverage, 1);
  assert.equal(score.redactionPrecision, 1);
});

test('painting the whole card does not count as having found what is on it', () => {
  // The defect this threshold exists for. Without it, a blanket rectangle
  // scores a perfect recall on every document in the corpus.
  const score = scorePixels(
    card([
      { category: 'id_number', position: NUMBER, what: 'the number' },
      { category: 'name', position: NAME, what: 'the name' },
    ]),
    [found(WHOLE_CARD)],
  );

  assert.equal(score.truePositives, 0);
  assert.equal(score.missed.length, 2);
  // And it is punished on area, which is what metric 3 actually asks.
  assert.ok(score.redactionPrecision < 0.05);
});

test('one wide box cannot claim two labelled lines at once', () => {
  // Even below the blanket case: matching is one detection to one truth, so a
  // rectangle that happens to overlap two boxes is credited with one.
  const tall = { x: 20, y: 250, width: 240, height: 30 };
  const alsoNumber = { x: 20, y: 252, width: 240, height: 26 };
  const score = scorePixels(
    card([
      { category: 'id_number', position: NUMBER, what: 'first' },
      { category: 'id_number', position: alsoNumber, what: 'second' },
    ]),
    [found(tall)],
  );

  assert.equal(score.truePositives, 1);
  assert.equal(score.missed.length, 1);
});

test('a box somewhere else is an over-flag, not a find', () => {
  const score = scorePixels(
    card([{ category: 'id_number', position: NUMBER, what: 'the number' }]),
    [found(NAME)],
  );

  assert.equal(score.truePositives, 0);
  assert.equal(score.overFlagged, 1);
  assert.equal(score.precision, 0);
});

test('element-attached detections are left to the element path', () => {
  // The two paths partition the detections. If this one also counted regions
  // with an element, every OCR finding would be scored twice.
  const score = scorePixels(
    card([{ category: 'id_number', position: NUMBER, what: 'the number' }]),
    [{ elementId: 'card', category: 'id_number', position: NUMBER }],
  );

  assert.equal(score.detected, 0);
  assert.equal(score.truePositives, 0);
});

test('the right box with the wrong category is found but not categorised', () => {
  const score = scorePixels(
    card([{ category: 'id_number', position: NUMBER, what: 'the number' }]),
    [found(NUMBER, 'phone')],
  );

  assert.equal(score.truePositives, 1);
  assert.equal(score.categoryCorrect, 0);
});

test('coverage counts the overlap, never the whole detection', () => {
  // A box covering the number and half the card has correctly painted the
  // number and nothing else. Crediting its full area would let over-painting
  // raise the coverage score.
  const half = { x: 20, y: 250, width: 480, height: 26 };
  const score = scorePixels(
    card([{ category: 'id_number', position: NUMBER, what: 'the number' }]),
    [found(half)],
  );

  assert.equal(score.correctArea, NUMBER.width * NUMBER.height);
  assert.equal(score.coverage, 1);
  assert.ok(score.redactionPrecision < 0.55);
});

test('a page with no pixel truth scores nothing rather than a perfect zero', () => {
  const score = scorePixels(card(undefined), []);

  assert.equal(score.expected, 0);
  // rate() answers 1 for "this question does not apply", the same as elsewhere.
  assert.equal(score.recall, 1);
});

test('the corpus pixel total is summed as areas, not averaged per document', () => {
  // The defect that was caught in the element scorer, checked for here before
  // it can be written again: a document where everything was missed must pull
  // the total DOWN, not drop out of it.
  const good = scorePixels(
    card([{ category: 'id_number', position: NUMBER, what: 'n' }]),
    [found(NUMBER)],
  );
  const bad = scorePixels(
    card([{ category: 'id_number', position: WHOLE_CARD, what: 'everything' }]),
    [],
  );

  const summary = summarisePixels([good, bad]);
  assert.equal(summary.expected, 2);
  assert.equal(summary.truePositives, 1);
  assert.ok(summary.coverage < good.coverage);
});

test('iou is zero for boxes that do not touch, and one for identical boxes', () => {
  assert.equal(iou(NUMBER, NUMBER), 1);
  assert.equal(iou(NUMBER, { x: 900, y: 900, width: 10, height: 10 }), 0);
  assert.ok(PIXEL_IOU > 0 && PIXEL_IOU <= 1);
});
