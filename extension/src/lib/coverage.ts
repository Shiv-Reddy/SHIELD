/**
 * What was examined, and what was not.
 *
 * ONE VIEWPORT IS THE HONEST BOUNDARY, AND ALSO A TRAP
 *
 * A run reads one viewport. `dom-map.ts` discards every element outside it and
 * `captureVisibleTab` returns only what is on screen, so content below the fold
 * is never detected because it was never captured — and therefore never
 * transmitted either. That is a real property, not a shortcoming.
 *
 * The trap is on the other side of the same fact. Someone who scrolls down
 * after a run sees no box over the ID number sitting there, and a missing box
 * reads as "checked and safe" rather than "never looked at". `overlay.ts`
 * already refuses to let its boxes follow the page for exactly this reason.
 * Refusing is not enough on its own: an absence still has to be explained, or
 * the user is left to infer the boundary from nothing.
 *
 * So the boundary is stated out loud, every run, whether or not anything was
 * found.
 *
 * SCANNING IS A DIFFERENT OPERATION, NOT A LARGER RUN
 *
 * A run happens while the user waits to act on the page, which is why it is
 * measured against a budget and takes exactly one look. A scan is the thing the
 * user asked for and is waiting on, so it can afford to scroll the page and
 * look repeatedly.
 *
 * What makes that trade cheap rather than expensive is that a scan TRANSMITS
 * NOTHING. Not less, not redacted — nothing. There is no payload built on that
 * path at all, so the seconds it spends buy coverage without widening the
 * surface that the rest of this project exists to keep narrow.
 */

import type { Rect, SensitiveCategory, DetectionSource } from './types';

/** What one look at the page covered, as the content script measured it. */
export interface PageCoverage {
  /** Full scrollable height of the document, CSS pixels. */
  documentHeight: number;
  /** Height of the viewport that was actually read, CSS pixels. */
  viewportHeight: number;
  /** Where the viewport sat when the scan ran. */
  scrollY: number;
  /**
   * Elements that classified as something we describe, but sat outside the
   * viewport and so were skipped.
   *
   * A count, never the elements themselves — they were deliberately not read.
   */
  offscreenElements: number;
}

export interface CoverageReport {
  /** True when the document extends past the screen that was examined. */
  partial: boolean;
  /** Document height in viewports, never below 1. */
  screens: number;
  offscreenElements: number;
  /** One sentence for the console and the popup. Never page content. */
  message: string;
}

/**
 * How much taller than the viewport a document may be before we call it partial.
 *
 * Chrome's default body margin alone makes `scrollHeight` exceed the viewport by
 * 16px on a page with nothing below the fold, and a warning that fires on every
 * single-screen page is a warning nobody reads. Twenty-four pixels is that
 * default doubled and still under one line of body text at an ordinary size, so
 * the band it forgives cannot hold anything readable.
 *
 * Erring toward warning is the safe direction here, which is why this is small
 * rather than comfortable.
 */
const FOLD_TOLERANCE = 24;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** State the boundary of one look at the page. */
export function describeCoverage(coverage: PageCoverage): CoverageReport {
  const viewportHeight = Math.max(1, coverage.viewportHeight);
  const screens = Math.max(1, coverage.documentHeight / viewportHeight);
  const partial = coverage.documentHeight > viewportHeight + FOLD_TOLERANCE;
  const offscreenElements = Math.max(0, coverage.offscreenElements);

  if (!partial) {
    return {
      partial: false,
      screens: 1,
      offscreenElements,
      message: 'The whole page fits on screen, and all of it was examined.',
    };
  }

  return {
    partial: true,
    screens,
    offscreenElements,
    message:
      `This page is about ${screens.toFixed(1)} screens tall. Shield examined the ` +
      `one on screen; ${plural(offscreenElements, 'element')} outside it ` +
      `${offscreenElements === 1 ? 'was' : 'were'} not looked at.`,
  };
}

/**
 * How far each look moves down the page, as a fraction of the viewport.
 *
 * Stops overlap rather than abutting. A line of text that straddles a boundary
 * is cut in half by both looks either side of it, and half an Aadhaar number
 * matches nothing — the same failure that made line grouping necessary in
 * `ocr-regions.ts`, arrived at from the opposite direction. Ten percent of an
 * ordinary viewport is roughly eighty pixels, which is taller than a line of
 * text and taller than the row an ID number is printed on.
 */
export const SCAN_OVERLAP = 0.1;

/**
 * The most looks one scan will take.
 *
 * A ceiling is required, not prudent: an infinite-scroll page grows as it is
 * scrolled, so a scan that simply walked to the bottom would never reach one.
 * Twelve stops covers roughly eight thousand pixels — far past any ordinary
 * page — and takes about ten seconds, which is a defensible wait for something
 * the user explicitly asked for and nothing like a budget a run could carry.
 *
 * Hitting it is reported rather than hidden. A scan that stopped early and said
 * so is honest; one that stopped early and showed a tidy summary is the exact
 * "checked and safe" misreading this whole module exists to prevent.
 */
export const MAX_SCAN_STOPS = 12;

export interface ScanPlan {
  /** Document Y offsets to scroll to, in order, starting at the top. */
  stops: number[];
  /** True when the cap was reached before the bottom of the document. */
  truncated: boolean;
}

/** Where to stop on the way down the page. */
export function planScanStops(documentHeight: number, viewportHeight: number): ScanPlan {
  const height = Math.max(1, viewportHeight);
  const stride = Math.max(1, Math.round(height * (1 - SCAN_OVERLAP)));
  // The furthest the page can actually scroll. Asking for more than this lands
  // at the same place, which would spend a whole look re-reading the last one.
  const bottom = Math.max(0, Math.round(documentHeight - height));

  const stops: number[] = [];
  for (let y = 0; y <= bottom && stops.length < MAX_SCAN_STOPS; y += stride) {
    stops.push(y);
  }
  if (stops.length === 0) stops.push(0);

  const reached = stops[stops.length - 1] ?? 0;
  // Truncated means the CAP stopped us short, not that the last stride landed
  // short of the bottom — the latter is the ordinary case and is finished off
  // below.
  const truncated = stops.length >= MAX_SCAN_STOPS && reached < bottom;

  // Finish at the true bottom, so the last strip of the page is covered by a
  // whole look rather than by whatever the final stride happened to reach. Not
  // done when truncated: appending the bottom there would draw a summary
  // spanning a gap that was never examined.
  if (!truncated && reached !== bottom) stops.push(bottom);

  return { stops, truncated };
}

/**
 * One thing a scan found, in DOCUMENT coordinates.
 *
 * Document rather than viewport, unlike everything a run produces, because a
 * scan's findings outlive the scroll position they were seen at — that is the
 * whole point of taking several looks.
 */
export interface ScanFinding {
  category: SensitiveCategory;
  source: DetectionSource;
  /** The rule that fired, in words. Never quotes what it matched. */
  reason: string;
  position: Rect;
}

/**
 * How much two boxes must overlap to be the same finding seen twice.
 *
 * Measured against the SMALLER box, not the union: a tight box on an ID number
 * and a slightly looser one on the same number from the neighbouring stop are
 * the same fact about the page, and reporting it twice would inflate every
 * count the summary makes.
 */
const SAME_FINDING_OVERLAP = 0.6;

function overlapFraction(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;

  const smaller = Math.min(a.width * a.height, b.width * b.height);
  if (smaller <= 0) return 0;

  return (width * height) / smaller;
}

/**
 * Collapse the same finding seen from two overlapping stops.
 *
 * Category must match as well as geometry. A number read out of a photograph
 * sits inside the box covering that photograph, and those are two different
 * statements about the page — "this holds an ID" and "this could not be read" —
 * so neither may absorb the other.
 */
export function dedupeFindings(findings: readonly ScanFinding[]): ScanFinding[] {
  const kept: ScanFinding[] = [];

  for (const finding of findings) {
    const seen = kept.some(
      (existing) =>
        existing.category === finding.category &&
        overlapFraction(existing.position, finding.position) >= SAME_FINDING_OVERLAP,
    );
    if (!seen) kept.push(finding);
  }

  return kept;
}

/** What a completed scan reports, as counts and never as content. */
export interface ScanSummary {
  at: number;
  /** How many looks were taken. */
  stops: number;
  documentHeight: number;
  viewportHeight: number;
  /** True when the stop cap was reached before the bottom. */
  truncated: boolean;
  counts: { category: SensitiveCategory; count: number }[];
  total: number;
}

/** Tally findings by category, commonest first. */
export function countByCategory(
  findings: readonly ScanFinding[],
): { category: SensitiveCategory; count: number }[] {
  const tally = new Map<SensitiveCategory, number>();
  for (const finding of findings) {
    tally.set(finding.category, (tally.get(finding.category) ?? 0) + 1);
  }

  return [...tally.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
