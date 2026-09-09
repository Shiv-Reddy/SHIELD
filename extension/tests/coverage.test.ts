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
  countByCategory,
  dedupeFindings,
  describeCoverage,
  planScanStops,
  type ScanFinding,
} from '../src/lib/coverage';
import type { Rect } from '../src/lib/types';

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
  assert.match(report.message, /12 elements/);
});

test('one skipped element is described in the singular', () => {
  const report = describeCoverage({
    documentHeight: 2000,
    viewportHeight: 800,
    scrollY: 0,
    offscreenElements: 1,
  });

  assert.match(report.message, /1 element outside it was not looked at/);
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

  // Stride is 720, not 800: a line cut in half by a boundary matches nothing,
  // which is the same failure line grouping exists to prevent.
  assert.deepEqual(plan.stops, [0, 720, 1200]);
  assert.equal(plan.truncated, false);
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
