/**
 * Coverage reporting and scan planning.
 *
 * Two properties matter more than the arithmetic here.
 *
 * First, that a page which does not scroll is never described as partially
 * examined. A warning that appears on every single-screen page is a warning
 * nobody reads, and the one page it matters on would arrive already ignored.
 *
 * Second, that a truncated scan is never tidied into a complete-looking one.
 * The whole reason for reporting coverage is that a missing box reads as
 * "checked and safe"; a summary that quietly spans a gap it never examined
 * would recreate that misreading inside the feature built to fix it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MAX_SCAN_STOPS,
  clipFindings,
  countByCategory,
  dedupeFindings,
  dedupeRegions,
  describeCoverage,
  planScanStops,
  unexaminedImages,
  type ScanFinding,
  type ScannedImage,
} from '../src/lib/coverage';
import { fullyVisible } from '../src/lib/pii/image-candidates';
import type { Rect, SensitiveRegion } from '../src/lib/types';

function finding(
  category: ScanFinding['category'],
  position: Rect,
): ScanFinding {
  return { category, source: 'dom', reason: 'test', position };
}

// --- Describing what was examined --------------------------------------------

test('a page that fits on screen is reported as fully examined', () => {
  const report = describeCoverage({
    documentHeight: 800,
    viewportHeight: 800,
    scrollY: 0,
    offscreenElements: 0,
  });

  assert.equal(report.partial, false);
  assert.match(report.message, /whole page fits/);
});

test('a few pixels of overflow is not "more page below"', () => {
  // Chrome's default body margin alone puts scrollHeight 16px over the
  // viewport on a page with nothing under the fold.
  const report = describeCoverage({
    documentHeight: 816,
    viewportHeight: 800,
    scrollY: 0,
    offscreenElements: 0,
  });

  assert.equal(report.partial, false);
});

test('a page taller than the screen says so, and how much taller', () => {
  const report = describeCoverage({
    documentHeight: 2720,
    viewportHeight: 800,
    scrollY: 0,
    offscreenElements: 12,
  });

  assert.equal(report.partial, true);
  assert.equal(report.screens.toFixed(1), '3.4');
  assert.match(report.message, /3\.4 screens/);
  assert.match(report.message, /not captured/);
  assert.match(report.message, /12 elements/);
});

test('one skipped element is described in the singular', () => {
  const report = describeCoverage({
    documentHeight: 2000,
    viewportHeight: 800,
    scrollY: 0,
    offscreenElements: 1,
  });

  assert.match(report.message, /including 1 element\./);
});

test('a tall page with no skipped elements still says the rest was not captured', () => {
  // The case that exposed the original wording. Both ID cards STARTED inside
  // the viewport, so nothing counted as an off-screen element — while the
  // numbers printed on them were below the fold and never in a frame. Leading
  // with the element count reported "nothing missed" on the one page where
  // something was.
  const report = describeCoverage({
    documentHeight: 1174,
    viewportHeight: 945,
    scrollY: 0,
    offscreenElements: 0,
  });

  assert.equal(report.partial, true);
  assert.match(report.message, /the rest was not captured/);
  assert.equal(report.message.includes('0 element'), false);
});

test('the message never carries page content, only counts', () => {
  const report = describeCoverage({
    documentHeight: 4000,
    viewportHeight: 700,
    scrollY: 1200,
    offscreenElements: 40,
  });

  // Nothing in the input is text, and nothing in the output may become text.
  assert.equal(/["']/.test(report.message), false);
});

test('a zero-height viewport is survived rather than dividing by zero', () => {
  const report = describeCoverage({
    documentHeight: 1000,
    viewportHeight: 0,
    scrollY: 0,
    offscreenElements: 0,
  });

  assert.ok(Number.isFinite(report.screens));
});

// --- Planning the walk down the page -----------------------------------------

test('a page that fits on screen is one stop at the top', () => {
  const plan = planScanStops(800, 800);

  assert.deepEqual(plan.stops, [0]);
  assert.equal(plan.truncated, false);
});

test('stops overlap, so nothing straddles a boundary uncovered', () => {
  const plan = planScanStops(2000, 800);

  // Stride is 600, not 800. The overlap is sized for an ID CARD rather than a
  // line of text: an image is read as one crop, so a 250px card straddling a
  // boundary is clipped above and clipped below and read whole by neither.
  assert.deepEqual(plan.stops, [0, 600, 1200]);
  assert.equal(plan.truncated, false);
});

test('the overlap is wide enough to hold a rendered ID card', () => {
  // The binding constraint, stated as a test so shrinking the overlap for speed
  // fails here rather than quietly on a page with a card on it.
  const viewport = 945;
  const plan = planScanStops(4000, viewport);
  const stride = (plan.stops[1] as number) - (plan.stops[0] as number);

  assert.ok(viewport - stride >= 220, 'overlap must fit a document-sized image');
});

test('the last stop is the true bottom of the document', () => {
  const plan = planScanStops(3000, 800);
  const bottom = 3000 - 800;

  assert.equal(plan.stops[plan.stops.length - 1], bottom);
});

test('every consecutive pair of stops overlaps', () => {
  const plan = planScanStops(5000, 900);

  for (let index = 1; index < plan.stops.length; index += 1) {
    const previous = plan.stops[index - 1] as number;
    const current = plan.stops[index] as number;
    assert.ok(current - previous < 900, `stop ${index} left a gap`);
  }
});

test('an endless page stops at the cap and admits it', () => {
  // The condition this cap exists for: an infinite-scroll page grows as it is
  // scrolled, so walking to the bottom never terminates.
  const plan = planScanStops(1_000_000, 800);

  assert.equal(plan.stops.length, MAX_SCAN_STOPS);
  assert.equal(plan.truncated, true);
});

test('a truncated plan does not append the bottom it never reached', () => {
  const plan = planScanStops(1_000_000, 800);
  const bottom = 1_000_000 - 800;

  // Appending it would draw a summary spanning a gap nothing examined.
  assert.notEqual(plan.stops[plan.stops.length - 1], bottom);
});

test('a document shorter than the viewport still yields one stop', () => {
  assert.deepEqual(planScanStops(200, 800).stops, [0]);
});

// --- The same thing seen twice -----------------------------------------------

test('the same finding from two overlapping stops is reported once', () => {
  const kept = dedupeFindings([
    finding('id_number', { x: 100, y: 1400, width: 220, height: 30 }),
    finding('id_number', { x: 102, y: 1402, width: 218, height: 29 }),
  ]);

  assert.equal(kept.length, 1);
});

test('two different fields of the same kind are both kept', () => {
  const kept = dedupeFindings([
    finding('email', { x: 100, y: 200, width: 200, height: 30 }),
    finding('email', { x: 100, y: 900, width: 200, height: 30 }),
  ]);

  assert.equal(kept.length, 2);
});

test('a number inside an unreadable image does not absorb the image', () => {
  // Two different statements about the same pixels — "this holds an ID" and
  // "this could not be read". Neither may swallow the other.
  const kept = dedupeFindings([
    finding('other', { x: 100, y: 400, width: 400, height: 250 }),
    finding('id_number', { x: 140, y: 500, width: 220, height: 30 }),
  ]);

  assert.equal(kept.length, 2);
});

test('boxes that merely touch are not the same finding', () => {
  const kept = dedupeFindings([
    finding('name', { x: 0, y: 0, width: 100, height: 100 }),
    finding('name', { x: 100, y: 0, width: 100, height: 100 }),
  ]);

  assert.equal(kept.length, 2);
});

test('a zero-area box is never treated as a duplicate of anything', () => {
  const kept = dedupeFindings([
    finding('name', { x: 0, y: 0, width: 0, height: 0 }),
    finding('name', { x: 0, y: 0, width: 100, height: 100 }),
  ]);

  assert.equal(kept.length, 2);
});

// --- Summarising --------------------------------------------------------------

test('findings are tallied by category, commonest first', () => {
  const counts = countByCategory([
    finding('email', { x: 0, y: 0, width: 10, height: 10 }),
    finding('id_number', { x: 0, y: 100, width: 10, height: 10 }),
    finding('email', { x: 0, y: 200, width: 10, height: 10 }),
  ]);

  assert.deepEqual(counts, [
    { category: 'email', count: 2 },
    { category: 'id_number', count: 1 },
  ]);
});

test('nothing found is an empty tally, not a zero row', () => {
  assert.deepEqual(countByCategory([]), []);
});

// --- Images clipped by the viewport edge --------------------------------------
//
// The defect two consecutive scans of the same page exposed: one found two
// identifiers in the cards, the next found one. A crop comes from a frame and a
// frame holds one viewport, so a card cut by the edge is read as its visible
// half — and OCR then truthfully reports no identifier in the half it was
// given, which the caller cannot tell apart from a clean image.

function scanned(seenWhole: boolean, position: Rect): ScannedImage {
  return { elementId: 'e1', seenWhole, position };
}

function ocrFinding(position: Rect): ScanFinding {
  return { category: 'id_number', source: 'ocr', reason: 'test', position };
}

test('an image inside the viewport is fully visible', () => {
  assert.equal(fullyVisible({ elementId: 'e1', x: 20, y: 100, width: 400, height: 250 }, 1920, 945), true);
});

test('an image running past the bottom edge is not', () => {
  assert.equal(fullyVisible({ elementId: 'e1', x: 20, y: 800, width: 400, height: 250 }, 1920, 945), false);
});

test('an image starting above the top edge is not', () => {
  // The other half of the same card, one stop later.
  assert.equal(fullyVisible({ elementId: 'e1', x: 20, y: -60, width: 400, height: 250 }, 1920, 945), false);
});

test('an image clipped at every stop is reported as never read', () => {
  const box = { x: 100, y: 900, width: 400, height: 250 };
  const unread = unexaminedImages([scanned(false, box), scanned(false, box)], []);

  assert.equal(unread.length, 1);
  assert.equal(unread[0]?.category, 'other');
  assert.match(unread[0]?.reason ?? '', /never fully on screen/);
});

test('seeing an image whole at one stop is enough, whatever the others saw', () => {
  // Why this is tracked across the walk instead of judged where it is noticed.
  const box = { x: 100, y: 900, width: 400, height: 250 };
  assert.deepEqual(unexaminedImages([scanned(false, box), scanned(true, box)], []), []);
});

test('an image something was read out of is not also reported as unread', () => {
  // We already told the user what is in it. Silence about an unread image is
  // the danger; extra detail about a read one is only noise.
  const box = { x: 100, y: 900, width: 400, height: 250 };
  const unread = unexaminedImages(
    [scanned(false, box)],
    [ocrFinding({ x: 140, y: 1000, width: 220, height: 30 })],
  );

  assert.deepEqual(unread, []);
});

test('a reading somewhere else on the page does not excuse a clipped image', () => {
  const box = { x: 100, y: 900, width: 400, height: 250 };
  const unread = unexaminedImages(
    [scanned(false, box)],
    [ocrFinding({ x: 140, y: 200, width: 220, height: 30 })],
  );

  assert.equal(unread.length, 1);
});

test('a DOM detection over an image does not count as having read it', () => {
  // Only OCR reads pixels. A field rule firing near the same coordinates says
  // nothing about what is printed inside the picture.
  const box = { x: 100, y: 900, width: 400, height: 250 };
  const unread = unexaminedImages(
    [scanned(false, box)],
    [{ category: 'name', source: 'dom', reason: 'test', position: box }],
  );

  assert.equal(unread.length, 1);
});

test('the same image at several stops is reported once, not once per look', () => {
  // `elementId` is only unique within one snapshot and is reassigned at every
  // stop, so these are collapsed on geometry.
  const unread = unexaminedImages(
    [
      { elementId: 'e3', seenWhole: false, position: { x: 100, y: 900, width: 400, height: 250 } },
      { elementId: 'e7', seenWhole: false, position: { x: 102, y: 901, width: 398, height: 249 } },
    ],
    [],
  );

  assert.equal(unread.length, 1);
});

// --- The claim that makes a scan safe ----------------------------------------
//
// A scan sends nothing. Not a redacted payload, not a smaller one — nothing.
// That is the entire reason it may spend ten seconds and several captures on a
// page, and it is worth exactly as much as it is enforceable.
//
// It is enforced structurally: the scan path does not reach the transport at
// all, so there is no branch to get wrong. What this test cannot do is prove
// the invariant — it reads source text, not behaviour, and a determined
// refactor could route around it. What it CAN do is fail the moment someone
// adds a transmit call to a function whose docblock promises there is none,
// which is the realistic way this would be lost.

const WORKER_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'background', 'service-worker.ts'),
  'utf8',
);

/** The body of `scanPage`, between its declaration and the next section. */
function scanPageSource(): string {
  const start = WORKER_SOURCE.indexOf('async function scanPage(');
  const end = WORKER_SOURCE.indexOf('// --- Message routing', start);

  // Asserted rather than tolerated. A moved anchor would otherwise leave this
  // test checking an empty string and passing forever, which is worse than not
  // having written it.
  assert.notEqual(start, -1, 'scanPage is no longer declared where this test looks');
  assert.notEqual(end, -1, 'the message-routing section marker has moved');

  return WORKER_SOURCE.slice(start, end);
}

test('the scan path builds no payload and calls no transport', () => {
  const source = scanPageSource();

  for (const forbidden of ['buildSanitizedPayload', 'recordTransmission', 'assertStagesCompletedBefore']) {
    assert.equal(source.includes(forbidden), false, `scanPage must not reach ${forbidden}`);
  }

  // `send(` alone, not `sendToTab(` or `sendToOffscreen(` — those stay inside
  // the extension and are how the scan does its work at all.
  assert.equal(/\bsend\(/.test(source), false, 'scanPage must not call the transport');
  assert.equal(/\bfetch\(/.test(source), false, 'scanPage must not reach the network');
});

test('the scan puts the page back where it found it', () => {
  // Not cosmetic. A scan moves somebody else's page for several seconds, and
  // one that ends somewhere they never scrolled to has quietly decided the page
  // belongs to the tool.
  const source = scanPageSource();

  assert.match(source, /finally\s*\{/, 'the restore must be on every exit path');
  assert.ok(source.includes('restoreTo'), 'the original position must be restored');
});

// --- Carrying findings into a run --------------------------------------------
//
// The defect that made a scan worth nothing: it walked the whole page, found an
// Aadhaar number below the fold, drew a box on it, and then the next run read
// one screen, could not possibly rediscover it, and transmitted the page.
// Detection that is not carried into the redaction is not protection.
//
// Same arithmetic as `clipToViewport` in manual-redaction, deliberately. Every
// coordinate defect in this project has been a plausible rectangle over the
// wrong pixels, and each came from doing this conversion somewhere new.

function documentFinding(y: number, height = 30): ScanFinding {
  return {
    category: 'id_number',
    source: 'ocr',
    reason: 'text in image — matched Aadhaar number format',
    position: { x: 100, y, width: 220, height },
  };
}

test('a finding on screen is offset by the scroll position', () => {
  const [visible] = clipFindings([documentFinding(1000)], 0, 900, 1920, 945);

  assert.equal(visible?.position.y, 100);
  assert.equal(visible?.position.x, 100);
});

test('a finding scrolled out of sight is dropped, not offered as a region', () => {
  // The capture only contains the viewport, so there is nothing there to cover.
  assert.deepEqual(clipFindings([documentFinding(4000)], 0, 0, 1920, 945), []);
  assert.deepEqual(clipFindings([documentFinding(10)], 0, 3000, 1920, 945), []);
});

test('a finding straddling the bottom edge is clipped, never dropped', () => {
  // Its visible part IS in the frame and must be covered. Dropping it would
  // transmit the half that is on screen.
  const [visible] = clipFindings([documentFinding(930, 100)], 0, 0, 1920, 945);

  assert.equal(visible?.position.y, 930);
  assert.equal(visible?.position.height, 15);
});

test('a clipped finding never extends past the frame', () => {
  // Passing the whole rectangle downstream would paint outside the image.
  const [visible] = clipFindings([documentFinding(-40, 200)], 0, 0, 1920, 945);

  assert.equal(visible?.position.y, 0);
  assert.equal(visible?.position.height, 160);
});

test('the category and rule survive the conversion', () => {
  // The scan ran the same detectors a run does; it knows this was an Aadhaar
  // number, and flattening that to "hidden" would lose what the manifest and
  // the overlay are supposed to say.
  const [visible] = clipFindings([documentFinding(100)], 0, 0, 1920, 945);

  assert.equal(visible?.category, 'id_number');
  assert.match(visible?.reason ?? '', /Aadhaar/);
});

// --- Merging live detections with remembered ones -----------------------------
//
// A run detects the email field itself AND carries the same field forward from
// a scan. Nothing is under-protected by that — everything is still hidden — but
// the manifest the model reads, the payload inspector and the audit log all
// report eight things where five exist.

function merged(
  category: SensitiveRegion['category'],
  source: SensitiveRegion['source'],
  elementId: string | null,
  position: Rect,
  reason = 'test',
): SensitiveRegion {
  return { regionId: reason, category, source, confidence: 1, elementId, reason, position };
}

const BOX = { x: 100, y: 200, width: 314, height: 43 };

test('the same field detected live and carried forward is reported once', () => {
  const kept = dedupeRegions([
    merged('email', 'dom', 'e0', BOX, 'autocomplete="email"'),
    merged('email', 'dom', 'e0', BOX, 'found by a whole-page scan'),
  ]);

  assert.equal(kept.length, 1);
});

test('the live detection is the one kept, not the remembered one', () => {
  // Order is the rule. A live detection carries the rule that actually fired
  // just now; a carried one is a claim as of whenever the scan ran.
  const [kept] = dedupeRegions([
    merged('email', 'dom', 'e0', BOX, 'autocomplete="email"'),
    merged('email', 'dom', 'e0', BOX, 'found by a whole-page scan'),
  ]);

  assert.equal(kept?.reason, 'autocomplete="email"');
});

test('two different fields of the same kind both survive', () => {
  const kept = dedupeRegions([
    merged('email', 'dom', 'e0', BOX),
    merged('email', 'dom', 'e4', { ...BOX, y: 900 }),
  ]);

  assert.equal(kept.length, 2);
});

test('different categories on one element are both kept', () => {
  // A field can be more than one thing, and collapsing that would drop a
  // manifest entry describing a real reason it was hidden.
  const kept = dedupeRegions([
    merged('email', 'dom', 'e0', BOX),
    merged('id_number', 'ocr', 'e0', BOX),
  ]);

  assert.equal(kept.length, 2);
});

test('a manual mark is never merged away by anything', () => {
  // A person pointing at a rectangle is not making the same claim as a rule
  // matching there, which is why `manual` is its own source at all.
  const kept = dedupeRegions([
    merged('other', 'ocr', 'e0', BOX),
    merged('other', 'manual', 'e0', BOX),
  ]);

  assert.equal(kept.length, 2);
});

test('a manual mark never swallows a rule detection either', () => {
  const kept = dedupeRegions([
    merged('other', 'manual', 'e0', BOX),
    merged('other', 'ocr', 'e0', BOX),
  ]);

  assert.equal(kept.length, 2);
});

test('geometric regions with no element merge on overlap', () => {
  // Carried findings arrive with no elementId, so geometry is all there is.
  const kept = dedupeRegions([
    merged('id_number', 'ocr', null, { x: 100, y: 900, width: 220, height: 30 }),
    merged('id_number', 'ocr', null, { x: 102, y: 901, width: 218, height: 29 }),
  ]);

  assert.equal(kept.length, 1);
});

test('regions far apart are never merged, however alike', () => {
  const kept = dedupeRegions([
    merged('id_number', 'ocr', null, { x: 100, y: 200, width: 220, height: 30 }),
    merged('id_number', 'ocr', null, { x: 100, y: 900, width: 220, height: 30 }),
  ]);

  assert.equal(kept.length, 2);
});

// --- One finding, every screen it appears on ----------------------------------
//
// The regression this file exists to prevent from recurring. The scan first
// painted each screen with the regions found AT that stop — but a scan
// discovers as it goes. The Aadhaar number was read at the second stop, and the
// first stop's picture, where the same card is fully visible, had already been
// written without it. A screenshot of an unredacted ID number went into
// storage, from the feature whose whole purpose is proving the opposite.
//
// Nothing is painted now until every stop has been read, and then every screen
// is painted with all of them.

test('a finding is covered on every screen it is visible in', () => {
  // Document y=815, the position the Aadhaar number actually sat at. Visible in
  // the first look (0-945) and again in the second (229-1174).
  const found = [documentFinding(815, 16)];

  const first = clipFindings(found, 0, 0, 1920, 945);
  const second = clipFindings(found, 0, 229, 1920, 945);

  assert.equal(first.length, 1, 'missing from the first screen — the original bug');
  assert.equal(second.length, 1, 'missing from the second screen');
  assert.equal(first[0]?.position.y, 815);
  assert.equal(second[0]?.position.y, 586);
});

test('a finding below a screen is not painted onto it', () => {
  // The other direction. Painting everything onto every screen would black out
  // rectangles over unrelated content and make the record untrustworthy in the
  // opposite way.
  assert.deepEqual(clipFindings([documentFinding(2000)], 0, 0, 1920, 945), []);
});
