/**
 * Measuring detection and redaction — metrics 2 and 3, forty percent of the
 * score.
 *
 * WHY A SCORER RATHER THAN MORE TESTS
 *
 * There are 186 tests in this repository and not one of them answers "what is
 * the recall?". A test asserts that a specific case behaves; a metric says how
 * often the whole thing is right, across cases nobody chose deliberately. The
 * rubric asks for the second — "recall and precision for detection of
 * sensitive/PII data" — and a suite of green ticks is not an answer to it.
 *
 * This also has to exist BEFORE the detector changes, not after. Without a
 * baseline, every later improvement is a claim; with one, it is a delta.
 *
 * THE TWO FAILURES ARE NOT EQUIVALENT AND ARE NOT REPORTED AS IF THEY WERE
 *
 * A false negative is a sensitive field that was transmitted. A false positive
 * is a harmless field that was hidden, costing the reasoning model some context.
 * The rubric counts both; SECURITY_PRIVACY.md Section 4 says the first is worse,
 * and this project's default-to-hide rule is a deliberate trade of the second
 * for the first.
 *
 * So misses are listed BY NAME — every one is a specific thing to go and look
 * at — while over-flags are counted and sampled. Reporting them as two columns
 * of the same table would flatten a distinction the whole design rests on.
 *
 * WHAT "PRECISION OF REDACTION" MEANS HERE (metric 3)
 *
 * Not the same thing as detection precision. The rubric describes it as
 * "redaction tightly covers sensitive regions only, not blanket-blurring the
 * whole screen" — an AREA question, not a count question. Flagging one extra
 * element is cheap if it is a checkbox and expensive if it is the whole page
 * body, and a count treats those identically.
 *
 * Three numbers, because one of them alone can always be gamed:
 *
 *   coverage            = area correctly painted / area that needed painting
 *   redaction precision = area correctly painted / area painted in total
 *   area ratio          = area painted in total  / area that needed painting
 *
 * Coverage of 1.0 means nothing sensitive was left visible — but a blanket blur
 * also scores 1.0, which is why it is never quoted alone. Redaction precision
 * is what metric 3 actually asks: of everything we covered, how much needed
 * covering? A blanket blur scores near zero there. The area ratio is the plain
 * reading of the two together, and it is signed: above 1.0 means we painted
 * more than was needed, below 1.0 means we left some of it visible.
 */

import type { Rect, SensitiveCategory } from '../types';

/** One region the detector produced. */
export interface ScoredDetection {
  elementId: string | null;
  category: SensitiveCategory;
  position: Rect;
}

/** One region that genuinely is sensitive, as labelled by hand. */
export interface GroundTruth {
  elementId: string;
  category: SensitiveCategory;
}

/**
 * Something sensitive that no element describes — printed inside an image, or a
 * face in a photograph.
 *
 * WHY ELEMENT LABELS CANNOT EXPRESS THIS
 *
 * `GroundTruth` names an element and inherits its box. That works for a field
 * and says nothing useful about a scanned ID card: the element is the whole
 * card, and "the card is sensitive" cannot distinguish covering the number from
 * covering the entire image. Metric 3 is an area question, so the difference
 * between those two is the whole measurement.
 *
 * These boxes are in the coordinate frame of the surface they were measured on
 * — a document image's own pixels — not in page coordinates. Keeping them there
 * means no page layout has to be invented to state where the card sat, and a
 * box is only ever compared with a detection produced in the same frame.
 */
export interface PixelTruth {
  category: SensitiveCategory;
  position: Rect;
  /** In words, so a miss can be named rather than counted. */
  what: string;
}

/** Everything needed to score one page. */
export interface LabelledPage {
  id: string;
  /** Where the page came from, so a corpus of only our own fixtures is visible as such. */
  source: 'fixture' | 'real' | 'synthetic';
  /** Every element on the page, with its box. Anything absent from `sensitive` is a negative. */
  elements: readonly { elementId: string; position: Rect }[];
  sensitive: readonly GroundTruth[];
  /**
   * What is sensitive in the pixels, where present.
   *
   * Scored by `scorePixels`, separately from everything above. The element path
   * skips detections with no element and the pixel path takes only those, so
   * the two partition the detections rather than counting any of them twice.
   */
  pixels?: readonly PixelTruth[];
}

export interface PageScore {
  id: string;
  source: LabelledPage['source'];
  expected: number;
  detected: number;
  truePositives: number;
  /** Named, not counted. Each one is a specific thing to go and look at. */
  missed: { elementId: string; category: SensitiveCategory }[];
  /** Over-flags. Counted, with the ids kept for inspection. */
  overFlagged: string[];
  /** Detected AND given the right category. */
  categoryCorrect: number;
  /**
   * Raw areas, carried alongside the ratios.
   *
   * The aggregate has to divide total-painted by total-needed across the whole
   * corpus. Averaging the per-page RATIOS instead would weight a page with one
   * sensitive field the same as a page with twenty — and the first attempt here
   * did worse than that: it excluded any page whose coverage was zero, so a
   * page where every field was missed dropped out of the denominator and made
   * the score go UP. A benchmark that flatters itself is worse than none.
   */
  neededArea: number;
  paintedArea: number;
  /** Correctly painted area. Kept so the corpus total is exact, not averaged. */
  correctArea: number;
  coverage: number;
  redactionPrecision: number;
  areaRatio: number;
}

export interface CategoryScore {
  category: SensitiveCategory;
  expected: number;
  truePositives: number;
  falsePositives: number;
  recall: number;
  precision: number;
  f1: number;
}

export interface PixelSummary {
  /** Pages carrying pixel ground truth at all. */
  surfaces: number;
  expected: number;
  truePositives: number;
  missed: number;
  overFlagged: number;
  recall: number;
  precision: number;
  categoryAccuracy: number;
  coverage: number;
  redactionPrecision: number;
}

export interface BenchmarkReport {
  pages: PageScore[];
  pixels: PixelScore[];
  pixelSummary: PixelSummary;
  categories: CategoryScore[];
  overall: {
    pages: number;
    expected: number;
    truePositives: number;
    missed: number;
    overFlagged: number;
    recall: number;
    precision: number;
    f1: number;
    /** Of the things correctly found, how often the category was also right. */
    categoryAccuracy: number;
    coverage: number;
    redactionPrecision: number;
    areaRatio: number;
  };
}

function area(rect: Rect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

/**
 * A rate, with an explicit answer for the empty case.
 *
 * Returning 0 when there was nothing to find would report a perfect detector as
 * having failed, and returning 1 would report a broken one as perfect. Neither
 * is true, so the caller decides: `whenNothingToScore` is what "this question
 * does not apply to this page" should read as in the table.
 */
function rate(numerator: number, denominator: number, whenNothingToScore = 1): number {
  if (denominator <= 0) return whenNothingToScore;
  return numerator / denominator;
}

function f1Of(precision: number, recall: number): number {
  if (precision + recall <= 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/** Score one page's detections against its labels. */
export function scorePage(
  page: LabelledPage,
  detections: readonly ScoredDetection[],
): PageScore {
  const boxes = new Map(page.elements.map((element) => [element.elementId, element.position]));
  const truth = new Map(page.sensitive.map((entry) => [entry.elementId, entry.category]));

  // Element-attached detections only. A detection with no element — a face, a
  // line of text inside a photograph — has nothing in this corpus to compare
  // against, and silently scoring it as a false positive would penalise the
  // visual layer for doing the job the DOM cannot. Those are measured
  // separately, against pixel ground truth.
  const flagged = new Map<string, SensitiveCategory>();
  for (const detection of detections) {
    if (detection.elementId === null) continue;
    if (!flagged.has(detection.elementId)) flagged.set(detection.elementId, detection.category);
  }

  const missed: PageScore['missed'] = [];
  const overFlagged: string[] = [];
  let truePositives = 0;
  let categoryCorrect = 0;
  let neededArea = 0;
  let paintedTrue = 0;
  let paintedFalse = 0;

  for (const [elementId, category] of truth) {
    const box = boxes.get(elementId);
    // A label naming an element the page does not contain is a corpus bug, not
    // a detector failure. Counted as expected but contributing no area, and
    // loud in the report because the count will not match the areas.
    neededArea += box ? area(box) : 0;

    const found = flagged.get(elementId);
    if (found === undefined) {
      missed.push({ elementId, category });
      continue;
    }

    truePositives += 1;
    if (found === category) categoryCorrect += 1;
    paintedTrue += box ? area(box) : 0;
  }

  for (const [elementId] of flagged) {
    if (truth.has(elementId)) continue;
    overFlagged.push(elementId);
    const box = boxes.get(elementId);
    paintedFalse += box ? area(box) : 0;
  }

  return {
    id: page.id,
    source: page.source,
    expected: truth.size,
    detected: flagged.size,
    truePositives,
    missed,
    overFlagged,
    categoryCorrect,
    neededArea,
    paintedArea: paintedTrue + paintedFalse,
    correctArea: paintedTrue,
    coverage: rate(paintedTrue, neededArea),
    // Nothing painted is not a precision failure — there was nothing to get
    // wrong. A clean page that stayed clean reads as 1.0, which is correct.
    redactionPrecision: rate(paintedTrue, paintedTrue + paintedFalse),
    // When a page has nothing sensitive on it there is no denominator. Reported
    // as 0 rather than invented; the over-flag count carries that case instead.
    areaRatio: rate(paintedTrue + paintedFalse, neededArea, 0),
  };
}

/**
 * How much two boxes have to agree before one counts as having found the other.
 *
 * Intersection over union, at the value object detection has used for years.
 * Chosen rather than "any overlap at all", which would let a box covering the
 * whole card count as having found the number on it — and that is precisely the
 * blanket-blur behaviour metric 3 exists to catch.
 */
export const PIXEL_IOU = 0.5;

function intersects(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

export function iou(a: Rect, b: Rect): number {
  const overlap = intersects(a, b);
  if (overlap <= 0) return 0;
  const union = area(a) + area(b) - overlap;
  return union > 0 ? overlap / union : 0;
}

export interface PixelScore {
  id: string;
  expected: number;
  detected: number;
  truePositives: number;
  /** Named, like element misses. Each is a specific thing on a specific card. */
  missed: { what: string; category: SensitiveCategory }[];
  categoryCorrect: number;
  overFlagged: number;
  neededArea: number;
  paintedArea: number;
  correctArea: number;
  recall: number;
  precision: number;
  coverage: number;
  redactionPrecision: number;
}

/**
 * Score the pixel layer of one page — OCR and faces.
 *
 * Takes only detections with no element. Anything the DOM could attach to an
 * element is the element path's business, and scoring it here as well would
 * count one finding twice and quietly inflate both.
 *
 * Greedy, best-overlap-first matching, one detection per truth box. Without the
 * "one" a single wide rectangle would claim every line on a card and score a
 * perfect recall for having covered the whole thing — the same failure the IoU
 * threshold guards against, one level up.
 */
export function scorePixels(
  page: LabelledPage,
  detections: readonly ScoredDetection[],
): PixelScore {
  const truth = page.pixels ?? [];
  const candidates = detections.filter((detection) => detection.elementId === null);

  const pairs: { truthIndex: number; detectionIndex: number; overlap: number }[] = [];
  truth.forEach((expected, truthIndex) => {
    candidates.forEach((detection, detectionIndex) => {
      const overlap = iou(expected.position, detection.position);
      if (overlap >= PIXEL_IOU) pairs.push({ truthIndex, detectionIndex, overlap });
    });
  });
  pairs.sort((a, b) => b.overlap - a.overlap);

  const matchedTruth = new Map<number, number>();
  const usedDetections = new Set<number>();
  for (const pair of pairs) {
    if (matchedTruth.has(pair.truthIndex)) continue;
    if (usedDetections.has(pair.detectionIndex)) continue;
    matchedTruth.set(pair.truthIndex, pair.detectionIndex);
    usedDetections.add(pair.detectionIndex);
  }

  const missed: PixelScore['missed'] = [];
  let categoryCorrect = 0;
  let neededArea = 0;
  let paintedTrue = 0;

  truth.forEach((expected, index) => {
    neededArea += area(expected.position);

    const detectionIndex = matchedTruth.get(index);
    if (detectionIndex === undefined) {
      missed.push({ what: expected.what, category: expected.category });
      return;
    }

    const detection = candidates[detectionIndex];
    if (detection?.category === expected.category) categoryCorrect += 1;
    // The intersection, not the whole box: a detection that covers the number
    // and half the card has only correctly painted the number.
    paintedTrue += detection ? intersects(expected.position, detection.position) : 0;
  });

  const paintedArea = candidates.reduce((total, detection) => total + area(detection.position), 0);
  const truePositives = matchedTruth.size;
  const overFlagged = candidates.length - usedDetections.size;

  return {
    id: page.id,
    expected: truth.length,
    detected: candidates.length,
    truePositives,
    missed,
    categoryCorrect,
    overFlagged,
    neededArea,
    paintedArea,
    correctArea: paintedTrue,
    recall: rate(truePositives, truth.length),
    precision: rate(truePositives, candidates.length),
    coverage: rate(paintedTrue, neededArea),
    redactionPrecision: rate(paintedTrue, paintedArea),
  };
}

/** Aggregate the pixel layer. Summed as areas, for the reason `neededArea` gives. */
export function summarisePixels(scores: readonly PixelScore[]): PixelSummary {
  let expected = 0;
  let truePositives = 0;
  let missed = 0;
  let overFlagged = 0;
  let categoryCorrect = 0;
  let detected = 0;
  let neededArea = 0;
  let paintedTrue = 0;
  let paintedTotal = 0;

  for (const score of scores) {
    expected += score.expected;
    truePositives += score.truePositives;
    missed += score.missed.length;
    overFlagged += score.overFlagged;
    categoryCorrect += score.categoryCorrect;
    detected += score.detected;
    neededArea += score.neededArea;
    paintedTrue += score.correctArea;
    paintedTotal += score.paintedArea;
  }

  return {
    surfaces: scores.length,
    expected,
    truePositives,
    missed,
    overFlagged,
    recall: rate(truePositives, expected),
    precision: rate(truePositives, detected),
    categoryAccuracy: rate(categoryCorrect, truePositives),
    coverage: rate(paintedTrue, neededArea),
    redactionPrecision: rate(paintedTrue, paintedTotal),
  };
}

/** Aggregate per-page scores into the report. */
export function summarise(
  pages: readonly PageScore[],
  perCategory: readonly CategoryScore[],
  pixels: readonly PixelScore[] = [],
): BenchmarkReport {
  let expected = 0;
  let truePositives = 0;
  let missed = 0;
  let overFlagged = 0;
  let categoryCorrect = 0;
  let neededArea = 0;
  let paintedTrue = 0;
  let paintedTotal = 0;

  for (const page of pages) {
    expected += page.expected;
    truePositives += page.truePositives;
    missed += page.missed.length;
    overFlagged += page.overFlagged.length;
    categoryCorrect += page.categoryCorrect;

    // Summed as areas, not as averaged ratios — see `neededArea` on PageScore.
    neededArea += page.neededArea;
    paintedTrue += page.correctArea;
    paintedTotal += page.paintedArea;
  }

  const recall = rate(truePositives, expected);
  const precision = rate(truePositives, truePositives + overFlagged);

  return {
    pages: [...pages],
    pixels: [...pixels],
    pixelSummary: summarisePixels(pixels),
    categories: [...perCategory],
    overall: {
      pages: pages.length,
      expected,
      truePositives,
      missed,
      overFlagged,
      recall,
      precision,
      f1: f1Of(precision, recall),
      categoryAccuracy: rate(categoryCorrect, truePositives),
      coverage: rate(paintedTrue, neededArea),
      redactionPrecision: rate(paintedTrue, paintedTotal),
      areaRatio: rate(paintedTotal, neededArea, 0),
    },
  };
}

/**
 * Recall and precision per category.
 *
 * Reported separately because the aggregate hides the thing worth knowing. A
 * detector that finds every password and no Aadhaar number scores respectably
 * overall on a corpus of login pages, and is exactly the failure this project
 * cannot afford.
 */
export function scoreByCategory(
  labelled: readonly { page: LabelledPage; detections: readonly ScoredDetection[] }[],
): CategoryScore[] {
  const expected = new Map<SensitiveCategory, number>();
  const hits = new Map<SensitiveCategory, number>();
  const wrong = new Map<SensitiveCategory, number>();

  for (const { page, detections } of labelled) {
    const flagged = new Map<string, SensitiveCategory>();
    for (const detection of detections) {
      if (detection.elementId === null) continue;
      if (!flagged.has(detection.elementId)) flagged.set(detection.elementId, detection.category);
    }

    const truth = new Map(page.sensitive.map((entry) => [entry.elementId, entry.category]));

    for (const [elementId, category] of truth) {
      expected.set(category, (expected.get(category) ?? 0) + 1);
      if (flagged.get(elementId) === category) hits.set(category, (hits.get(category) ?? 0) + 1);
    }

    // A false positive belongs to the category it was CLAIMED to be, not to the
    // one it should have had — that is the claim the detector actually made.
    for (const [elementId, category] of flagged) {
      if (truth.get(elementId) === category) continue;
      wrong.set(category, (wrong.get(category) ?? 0) + 1);
    }
  }

  const categories = new Set([...expected.keys(), ...wrong.keys()]);

  return [...categories]
    .map((category) => {
      const total = expected.get(category) ?? 0;
      const truePositives = hits.get(category) ?? 0;
      const falsePositives = wrong.get(category) ?? 0;
      const recall = rate(truePositives, total);
      const precision = rate(truePositives, truePositives + falsePositives);

      return {
        category,
        expected: total,
        truePositives,
        falsePositives,
        recall,
        precision,
        f1: f1Of(precision, recall),
      };
    })
    .sort((a, b) => b.expected - a.expected || a.category.localeCompare(b.category));
}
