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

  // The boundary is PIXELS, not elements, and leading with the element count
  // got this exactly backwards on the page it mattered most.
  //
  // A photographed ID card that starts inside the viewport and continues below
  // it counts as an on-screen element — so the count read "0 elements outside
  // it were not looked at" on a page whose Aadhaar number was, in fact, never
  // captured. The count says nothing was missed at the moment something was.
  // What was actually not examined is the part of the page that was never in a
  // frame, so that is what this leads with; the element count is a detail, and
  // only worth printing when there is one.
  const rest =
    offscreenElements > 0
      ? `the rest was not captured, including ${plural(offscreenElements, 'element')}`
      : 'the rest was not captured';

  return {
    partial: true,
    screens,
    offscreenElements,
    message:
      `This page is about ${screens.toFixed(1)} screens tall. Shield examined ` +
      `the one on screen — ${rest}.`,
  };
}

/**
 * How far each look moves down the page, as a fraction of the viewport.
 *
 * Stops overlap rather than abutting, and the size of the overlap is set by the
 * largest thing that must fit inside one look.
 *
 * The first version sized it for a LINE of text — ten percent, about eighty
 * pixels, on the reasoning that half an Aadhaar number matches nothing. That is
 * true and it is not the binding constraint. An image is read as a whole crop,
 * so a 250px ID card straddling a boundary is clipped in the look above it and
 * clipped again in the look below, and neither crop contains the card. Sizing
 * for a line of text leaves the most important single thing this product looks
 * for able to fall between two stops.
 *
 * A quarter of an ordinary viewport is around 240px, which holds an ID card at
 * the size one is usually rendered. Anything still clipped at every stop is
 * reported as unread rather than assumed clean — the overlap reduces how often
 * that happens, it is not what makes the result honest.
 */
export const SCAN_OVERLAP = 0.25;

/**
 * The most looks one scan will take.
 *
 * A ceiling is required, not prudent: an infinite-scroll page grows as it is
 * scrolled, so a scan that simply walked to the bottom would never reach one.
 *
 * Twelve stops covers roughly eight thousand pixels, far past any ordinary
 * page. The cost was first estimated at about ten seconds and then measured at
 * rather more: a look costs ~2.2s on a page carrying two document-sized images,
 * almost all of it OCR, so the cap is nearer 25 seconds in the worst case. That
 * is a defensible wait for something the user explicitly asked for, holds the
 * Cancel button open throughout, and is nothing like a budget a run could
 * carry — which is exactly why this is not one.
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
 * Findings in viewport coordinates, clipped to the frame.
 *
 * Pure and separately tested, and deliberately the same shape as
 * `clipToViewport` in `manual-redaction.ts` rather than a second convention for
 * the same arithmetic. Every coordinate defect in this project has been a
 * plausible rectangle over the wrong pixels, and each one came from doing this
 * conversion somewhere new.
 *
 * A finding scrolled out of sight is dropped — the capture only contains the
 * viewport, so there is nothing there to cover. One straddling an edge is
 * CLIPPED rather than dropped: its visible part is in the frame and must be
 * covered, while passing the whole rectangle downstream would paint outside the
 * image.
 */
export function clipFindings(
  found: readonly ScanFinding[],
  offsetX: number,
  offsetY: number,
  viewWidth: number,
  viewHeight: number,
): ScanFinding[] {
  const visible: ScanFinding[] = [];

  for (const finding of found) {
    const { x, y, width, height } = finding.position;

    const left = Math.max(x - offsetX, 0);
    const top = Math.max(y - offsetY, 0);
    const right = Math.min(x - offsetX + width, viewWidth);
    const bottom = Math.min(y - offsetY + height, viewHeight);

    if (right <= left || bottom <= top) continue;

    visible.push({
      ...finding,
      position: { x: left, y: top, width: right - left, height: bottom - top },
    });
  }

  return visible;
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

/**
 * One document-sized image, and whether any single look saw the whole of it.
 *
 * Tracked across the walk rather than judged per stop: an image clipped at the
 * bottom of one look is often whole in the next, and only an image clipped at
 * EVERY look was genuinely never read in full.
 */
export interface ScannedImage {
  elementId: string;
  /** DOCUMENT-space box. */
  position: Rect;
  /** True when this particular look contained the image entirely. */
  seenWhole: boolean;
}

/**
 * Images the scan never saw whole, and read nothing out of.
 *
 * The honest end of the clipping problem. An image cut by the viewport edge is
 * cropped to its visible part, and OCR truthfully reports no identifier in the
 * half it was handed — which the caller cannot distinguish from a clean image.
 * Over a whole-page scan that turns into a verdict about a card nobody ever
 * saw the number on.
 *
 * An image that produced a reading is left alone: we already told the user what
 * is in it, and adding "and it could not be fully read" alongside would be
 * noise on top of a finding that is already correct. It is silence about an
 * unread image that is dangerous, not detail about a read one.
 */
export function unexaminedImages(
  images: readonly ScannedImage[],
  findings: readonly ScanFinding[],
): ScanFinding[] {
  // The same image appears once per look. Collapsed on geometry rather than on
  // `elementId`, which is only unique within a single snapshot and is reassigned
  // at every stop.
  const merged: ScannedImage[] = [];
  for (const image of images) {
    const existing = merged.find(
      (candidate) => overlapFraction(candidate.position, image.position) >= SAME_FINDING_OVERLAP,
    );

    // Seen whole ONCE is enough, and is why this is tracked across the walk at
    // all rather than decided where it is first noticed.
    if (existing) existing.seenWhole ||= image.seenWhole;
    else merged.push({ ...image });
  }

  return merged
    .filter((image) => !image.seenWhole)
    .filter(
      (image) =>
        !findings.some(
          (finding) =>
            finding.source === 'ocr' &&
            overlapFraction(image.position, finding.position) >= SAME_FINDING_OVERLAP,
        ),
    )
    .map((image) => ({
      category: 'other' as const,
      source: 'visual' as const,
      // Says what happened, and does not name a category. Claiming to have
      // found an ID in an image nothing ever read whole would be the trust
      // surface telling the one kind of lie it must never tell.
      reason: 'image large enough to hold a document, never fully on screen to be read',
      position: image.position,
    }));
}

/**
 * Drop regions that say the same thing about the same place.
 *
 * A run detects the email field itself AND carries the same field forward from
 * a scan, so the manifest arrives with eight entries describing five facts.
 * Nothing is under-protected by that — everything still gets hidden — but three
 * surfaces that are supposed to be exact are inflated by it: the manifest the
 * model reads, the payload inspector, and the audit log's counts.
 *
 * ORDER IS THE RULE, NOT A DETAIL. The FIRST region wins, and the caller passes
 * this pass's own detections first. A live detection carries the confidence and
 * the rule that actually fired just now; a carried one is a claim as of
 * whenever the scan ran. When both describe the same thing, the fresher is the
 * one to keep.
 *
 * Manual marks are never merged away. A person pointing at a rectangle is not
 * making the same claim as a rule matching there, and `manual` exists in
 * `DetectionSource` precisely so the two stay distinguishable.
 */
export function dedupeRegions<
  T extends {
    category: SensitiveCategory;
    source: DetectionSource;
    elementId: string | null;
    position: Rect;
  },
>(regions: readonly T[]): T[] {
  const kept: T[] = [];

  for (const region of regions) {
    if (region.source === 'manual') {
      kept.push(region);
      continue;
    }

    const duplicate = kept.some((existing) => {
      if (existing.source === 'manual') return false;
      if (existing.category !== region.category) return false;

      // Same element and same category is the same fact, whatever the boxes
      // say — an element region's geometry comes from the element itself.
      if (existing.elementId !== null && existing.elementId === region.elementId) return true;

      return overlapFraction(existing.position, region.position) >= SAME_FINDING_OVERLAP;
    });

    if (!duplicate) kept.push(region);
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
