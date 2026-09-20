/**
 * What accuracy costs in milliseconds — the balance the problem statement asks
 * for explicitly.
 *
 * THE STUDY THIS IS NOT
 *
 * The obvious shape for "latency versus accuracy" is a confidence threshold
 * swept against recall: let fewer things through, catch less, go faster.
 * **Shield has no such threshold and adding one would be a policy violation**,
 * not an optimisation — `dom-rules.ts` says so at the top of the file, and
 * SECURITY_PRIVACY.md Section 4 is why. Everything flagged is redacted whatever
 * its confidence. A curve swept over a knob the product does not have would be
 * a fiction, however good it looked on a slide.
 *
 * So this measures the two knobs that genuinely exist.
 *
 * 1. WHICH LAYERS RUN. Detection is four independent layers with wildly
 *    different costs — the DOM walk is milliseconds, whole-frame recognition is
 *    seconds — and each is responsible for a different part of what is
 *    sensitive. Turning one off is a real product configuration, it is what a
 *    slower machine would force, and the recall it costs is measurable here.
 *
 * 2. THE IMAGE CANDIDATE SIZE FLOOR. Lower it and more pictures are sent to
 *    OCR: more recall on small documents, less precision as page furniture gets
 *    covered, and more milliseconds in direct proportion to the number of crops.
 *    One number, all three axes, and every one of them computable.
 *
 * WHERE THE LATENCY NUMBERS COME FROM
 *
 * They are quoted from recorded runs, never computed here and never estimated.
 * Node cannot run ONNX or Tesseract, so a latency figure produced by this file
 * would be a guess wearing a measurement's clothes. Each one carries its source
 * and anything unmeasured is `null` and prints as such — the same rule
 * `lib/resource.ts` follows for a counter that is absent.
 */

import type { DomElement } from '../types';
import { imageCandidates } from '../pii/image-candidates';
import { detectDomPii } from '../pii/dom-rules';
import { scorePage, summarise } from './score';
import type { LabelledPage, ScoredDetection } from './score';

export interface TradeoffPage extends LabelledPage {
  input: readonly DomElement[];
}

/**
 * One detection layer, its measured cost, and where that measurement is
 * written down.
 *
 * `costMs` is per pass for the run path and per stop for the scan path, and
 * `perStop` says which — conflating them would make the DOM walk and
 * whole-frame recognition look like comparable line items when one is paid on
 * every run and the other only during a scan.
 */
export interface Layer {
  name: string;
  about: string;
  costMs: number | null;
  /** Where the figure was recorded. A number with no source does not belong here. */
  source: string;
  perStop: boolean;
  /** Labels this layer is the one responsible for finding. */
  owns: (page: TradeoffPage, elementId: string) => boolean;
}

function elementsById(page: TradeoffPage): Map<string, DomElement> {
  return new Map(page.input.map((element) => [element.elementId, element]));
}

function isImage(page: TradeoffPage, elementId: string): boolean {
  return elementsById(page).get(elementId)?.elementType === 'image';
}

export const LAYERS: readonly Layer[] = [
  {
    name: 'DOM rules',
    about: 'Attributes, labels and text content. Structurally cannot read pixels.',
    costMs: 4.4,
    source: 'SESSION_LOG.md, one full pass on Chrome',
    perStop: false,
    owns: (page, elementId) => !isImage(page, elementId),
  },
  {
    name: 'Face detection',
    about: 'UltraFace RFB-320 over the frame. The only layer that finds a face at all.',
    costMs: 34,
    source: 'DECISIONS.md 218, Chrome document host, WebGPU',
    perStop: false,
    owns: (page, elementId) =>
      page.sensitive.some(
        (entry) => entry.elementId === elementId && entry.category === 'face',
      ),
  },
  {
    name: 'Image OCR',
    about: 'Tesseract over image crops. Reads the identifier printed on a card.',
    costMs: null,
    source: 'Never isolated on a real page — the scan profile of DECISIONS.md 231 read 0ms because that page had no image candidates',
    perStop: true,
    owns: (page, elementId) => isImage(page, elementId),
  },
  {
    name: 'Whole-frame text',
    about: 'Tesseract over the entire screen at 2.0x. Canvas, iframes, pasted screenshots.',
    costMs: 2900,
    source: 'DECISIONS.md 231, 82% of a scan, income-tax login',
    perStop: true,
    // Nothing in this corpus is labelled as belonging to it: its output is
    // measured as agreement against the DOM (metric 1), not as recall against
    // labels. Claiming ownership of labels here would credit it with finds the
    // DOM path is actually making.
    owns: () => false,
  },
];

export interface LayerPoint {
  name: string;
  about: string;
  costMs: number | null;
  source: string;
  perStop: boolean;
  /** Labels this layer is responsible for, across the corpus. */
  owns: number;
  /** Of those, how many the DOM path actually finds today. Null where unmeasurable here. */
  found: number | null;
  /** Cumulative recall over the whole corpus with this layer and every one above it. */
  cumulativeRecall: number | null;
  /** Cumulative cost of this layer and every one above it. Null once anything is unmeasured. */
  cumulativeCostMs: number | null;
}

/**
 * The layer curve: what each successive layer is responsible for, what it
 * costs, and what recall the corpus can actually confirm.
 *
 * Only the DOM layer runs in Node. The other three are reported by what they
 * OWN rather than by what they find, with `found` null — a corpus cannot score
 * an engine it cannot execute, and printing a zero there would read as a
 * failing layer rather than an unmeasured one.
 */
export function layerCurve(pages: readonly TradeoffPage[]): LayerPoint[] {
  const scores = pages.map((page) => {
    const detections: ScoredDetection[] = detectDomPii(page.input).map((region) => ({
      elementId: region.elementId,
      category: region.category,
      position: region.position,
    }));
    return { page, score: scorePage(page, detections) };
  });

  const domRecall = summarise(
    scores.map((entry) => entry.score),
    [],
  ).overall.recall;

  let cumulativeCost = 0;
  let costKnown = true;

  return LAYERS.map((layer, index) => {
    let owns = 0;
    let found = 0;

    for (const { page, score } of scores) {
      const missed = new Set(score.missed.map((entry) => entry.elementId));
      for (const entry of page.sensitive) {
        if (!layer.owns(page, entry.elementId)) continue;
        owns += 1;
        if (!missed.has(entry.elementId)) found += 1;
      }
    }

    if (layer.costMs === null) costKnown = false;
    else cumulativeCost += layer.costMs;

    return {
      name: layer.name,
      about: layer.about,
      costMs: layer.costMs,
      source: layer.source,
      perStop: layer.perStop,
      owns,
      // Only the DOM layer is actually executed here. The rest report ownership.
      found: index === 0 ? found : null,
      cumulativeRecall: index === 0 ? domRecall : null,
      cumulativeCostMs: costKnown ? cumulativeCost : null,
    };
  });
}

export interface FloorPoint {
  /** The candidate width floor. Height follows the card aspect, as in image-candidates.ts. */
  minWidth: number;
  minHeight: number;
  /** Crops sent to OCR across the corpus. The latency axis: cost is per crop. */
  candidates: number;
  /** Relative to the shipped floor. 2.0x crops is 2.0x the image-OCR time. */
  relativeCost: number;
  /** Sensitive images caught. */
  sensitiveCaught: number;
  sensitiveTotal: number;
  recall: number;
  /** Non-sensitive images that become candidates, and are covered whole if unreadable. */
  overFlagged: number;
  precision: number;
}

/**
 * Sweep the image candidate size floor.
 *
 * The shipped floor is 140x80 (`image-candidates.ts`), derived from the width a
 * twelve-digit Aadhaar number needs to stay legible. This is what moving it
 * costs and buys, on a corpus of 83 image elements.
 *
 * Latency is reported as a MULTIPLE rather than in milliseconds, deliberately.
 * Image OCR has never been isolated on a real page — the one profile taken read
 * 0ms because that page had no image candidates — so a millisecond figure here
 * would be invented. The crop count is exact, and cost scales with it, so the
 * ratio is the honest form of the same statement.
 */
export function candidateFloorCurve(
  pages: readonly TradeoffPage[],
  widths: readonly number[] = [40, 60, 80, 100, 120, 140, 180, 240],
): FloorPoint[] {
  const shipped = 140;

  const at = (minWidth: number): Omit<FloorPoint, 'relativeCost'> => {
    // Height tracks width on the same ~1.75 card aspect the shipped pair uses
    // (140/80), so the sweep moves one variable rather than two.
    const minHeight = Math.round((minWidth * 80) / 140);

    let candidates = 0;
    let sensitiveCaught = 0;
    let sensitiveTotal = 0;
    let overFlagged = 0;

    for (const page of pages) {
      const sensitive = new Set(
        page.sensitive
          .filter((entry) => isImage(page, entry.elementId))
          .map((entry) => entry.elementId),
      );
      sensitiveTotal += sensitive.size;

      // The shipped function with the floor passed in, never a reimplementation
      // of its geometry — a sweep over a copy of the rule measures the copy.
      // The aspect bounds still apply and are not part of this sweep.
      for (const candidate of imageCandidates(page.input, {
        width: minWidth,
        height: minHeight,
      })) {
        candidates += 1;
        if (sensitive.has(candidate.elementId)) sensitiveCaught += 1;
        else overFlagged += 1;
      }
    }

    return {
      minWidth,
      minHeight,
      candidates,
      sensitiveCaught,
      sensitiveTotal,
      recall: sensitiveTotal > 0 ? sensitiveCaught / sensitiveTotal : 1,
      overFlagged,
      precision: candidates > 0 ? sensitiveCaught / candidates : 1,
    };
  };

  const baseline = at(shipped).candidates;

  return widths.map((minWidth) => {
    const point = at(minWidth);
    return {
      ...point,
      relativeCost: baseline > 0 ? point.candidates / baseline : 1,
    };
  });
}
