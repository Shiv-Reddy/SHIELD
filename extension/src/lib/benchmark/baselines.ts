/**
 * What Shield is actually being compared against.
 *
 * WHY THIS EXISTS
 *
 * Metric 3 is "precision of redaction", and the corpus figure for redaction
 * coverage is 60.4% — which, read alone, says roughly 40% of sensitive area
 * stays visible and sounds like a failure. It is unreadable without the thing
 * it is being measured against, because **coverage is trivially gameable**: a
 * blanket blur over the viewport scores 100% coverage, 100% recall and a
 * perfect score on every detection metric in the report. It also destroys the
 * page, which no detection metric notices. DECISIONS.md 225 is the rule that
 * coverage is never quoted alone; this module is what makes that rule
 * enforceable rather than a caveat somebody has to remember to say.
 *
 * WHAT THE NAIVE STRATEGIES ARE, AND WHY THESE ONES
 *
 * They are not straw men. Each is something a competent team would plausibly
 * ship under time pressure, and two of them beat Shield on the headline number:
 *
 *   none        - the honest floor. Transmit the screen. Every privacy metric
 *                 that measures over-redaction is perfect here, which is the
 *                 clearest demonstration that those metrics cannot be read
 *                 alone either.
 *   blanket     - blur everything. What "we redact the screenshot" means when
 *                 nobody has built detection. Scores 100% coverage.
 *   all-inputs  - hide every form control. The most common real heuristic:
 *                 personal data lives in forms, so hide the forms.
 *   all-values  - hide every element carrying a value, controls and rendered
 *                 text alike. all-inputs, after somebody notices that a
 *                 printed account number is not in a field.
 *
 * THE COLUMN THAT SEPARATES THEM
 *
 * `contextRetained` — of the elements that are NOT sensitive, how many are
 * still readable afterwards. It is the only measure here under which blanket
 * blur scores zero, and it is what an agent needs in order to act on the page
 * at all. A redactor that hides everything has not solved the problem; it has
 * moved it, from "the model sees private data" to "the model sees nothing".
 * Shield's claim is the pair: hide what is sensitive, leave what is not.
 *
 * Every strategy is scored through the SAME `scorePage` the real detector uses.
 * A comparison run through a second scorer measures the scorers.
 */

import type { DomElement } from '../types';
import { detectDomPii } from '../pii/dom-rules';
import { scorePage, summarise } from './score';
import type { LabelledPage, PageScore, ScoredDetection } from './score';

export type BaselineName = 'none' | 'blanket' | 'all-inputs' | 'all-values' | 'shield';

export interface Baseline {
  name: BaselineName;
  label: string;
  /** What a person would have been thinking when they built this. */
  about: string;
  detect(elements: readonly DomElement[]): ScoredDetection[];
}

/**
 * Everything a naive strategy paints is reported as `other`.
 *
 * Deliberate, and it is half of what the comparison shows. A blur knows it is
 * covering a rectangle and nothing more, so it cannot tell the model what was
 * removed — the page comes back with holes in it. Shield replaces a field with
 * `[EMAIL]`, which is a rectangle the model can still reason about. Claiming a
 * category for a blur would credit it with information it does not have, and
 * `categoryAccuracy` in the report would quietly launder that.
 */
function blind(element: DomElement): ScoredDetection {
  return { elementId: element.elementId, category: 'other', position: element.position };
}

export const BASELINES: readonly Baseline[] = [
  {
    name: 'none',
    label: 'No redaction',
    about: 'Send the screen as captured. The floor everything else is above.',
    detect: () => [],
  },
  {
    name: 'blanket',
    label: 'Blanket blur',
    about: 'Cover the whole screen. What "we redact screenshots" means with no detector.',
    detect: (elements) => elements.map(blind),
  },
  {
    name: 'all-inputs',
    label: 'Hide every field',
    about: 'Personal data lives in forms, so hide the forms. The common first heuristic.',
    detect: (elements) =>
      elements.filter((element) => element.elementType === 'input').map(blind),
  },
  {
    name: 'all-values',
    label: 'Hide every value',
    about: 'Fields and rendered text alike — all-inputs, once somebody notices printed data.',
    detect: (elements) =>
      elements
        .filter(
          (element) =>
            element.elementType === 'input' ||
            (element.elementType === 'text' && element.value !== null),
        )
        .map(blind),
  },
  {
    name: 'shield',
    label: 'Shield',
    about: 'Per-element detection, semantic placeholders. Measured on the same corpus.',
    detect: (elements) =>
      detectDomPii(elements).map((region) => ({
        elementId: region.elementId,
        category: region.category,
        position: region.position,
      })),
  },
];

export interface BaselineScore {
  name: BaselineName;
  label: string;
  about: string;
  recall: number;
  precision: number;
  coverage: number;
  redactionPrecision: number;
  /** Painted area ÷ area that needed painting. 1.0 is perfect; blanket blur is enormous. */
  areaRatio: number;
  /**
   * Of the elements that are NOT sensitive, the share still readable.
   *
   * The measure under which hiding everything scores zero. Counted over
   * elements rather than area because what an agent needs is the field, the
   * button and the heading — not a percentage of the screen.
   */
  contextRetained: number;
  /** Non-sensitive elements destroyed. The absolute number behind the ratio. */
  contextLost: number;
  /** Non-sensitive elements in the corpus, so the ratio can be checked. */
  contextTotal: number;
  missed: number;
  overFlagged: number;
}

/**
 * The corpus pages a baseline is scored over.
 *
 * `input` is the full element map — a strategy needs `elementType` and `value`,
 * which `LabelledPage.elements` deliberately drops. `LabelledPage` is what the
 * scorer sees, and the two must describe the same page.
 */
export interface BaselinePage extends LabelledPage {
  input: readonly DomElement[];
}

function rate(numerator: number, denominator: number, whenEmpty = 1): number {
  return denominator <= 0 ? whenEmpty : numerator / denominator;
}

export function scoreBaseline(
  baseline: Baseline,
  pages: readonly BaselinePage[],
): BaselineScore {
  const scores: PageScore[] = [];
  let contextTotal = 0;
  let contextLost = 0;

  for (const page of pages) {
    const detections = baseline.detect(page.input);
    scores.push(scorePage(page, detections));

    // Context is counted here rather than taken from `overFlagged`, because
    // the two answer different questions. An over-flag is a precision error
    // against ground truth; context lost is what the model can no longer read,
    // and for every strategy but `shield` those happen to coincide. Deriving
    // one from the other would make the column a restatement rather than a
    // measurement, and it would break the moment a strategy painted something
    // twice.
    const sensitive = new Set(page.sensitive.map((entry) => entry.elementId));
    const painted = new Set(
      detections.map((detection) => detection.elementId).filter((id): id is string => id !== null),
    );

    for (const element of page.input) {
      if (sensitive.has(element.elementId)) continue;
      contextTotal += 1;
      if (painted.has(element.elementId)) contextLost += 1;
    }
  }

  const { overall } = summarise(scores, []);

  return {
    name: baseline.name,
    label: baseline.label,
    about: baseline.about,
    recall: overall.recall,
    precision: overall.precision,
    coverage: overall.coverage,
    redactionPrecision: overall.redactionPrecision,
    areaRatio: overall.areaRatio,
    contextRetained: rate(contextTotal - contextLost, contextTotal),
    contextLost,
    contextTotal,
    missed: overall.missed,
    overFlagged: overall.overFlagged,
  };
}

export function scoreAllBaselines(pages: readonly BaselinePage[]): BaselineScore[] {
  return BASELINES.map((baseline) => scoreBaseline(baseline, pages));
}
