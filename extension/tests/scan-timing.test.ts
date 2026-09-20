/**
 * Scan timing — TASKS.md Tier 3, "where did the time go".
 *
 * The thing under test is an accounting instrument, and lesson 12 in
 * SESSION_LOG.md is about exactly this: a measuring instrument flatters itself
 * unless somebody tests the instrument rather than the thing it measures. The
 * first benchmark scorer averaged per-page ratios and dropped zeroes, so total
 * failure raised the score.
 *
 * The two ways this one could flatter a scan are pinned below: shares must be
 * taken against wall-clock so unwrapped time cannot vanish, and a stage that
 * throws must still report what it spent, since a scan that stopped early is
 * precisely when the profile is wanted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScanTimer, formatScanTiming } from '../src/lib/scan-timing';

/** A clock the test drives by hand — no sleeping, no browser. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('a stage total is the sum across stops, and says how many', async () => {
  const clock = fakeClock();
  const timer = createScanTimer(clock.now);

  for (let stop = 0; stop < 3; stop += 1) {
    await timer.measure('capture', async () => clock.advance(100));
    timer.countStop();
  }

  const summary = timer.summarise();
  const capture = summary.stages.find((stage) => stage.stage === 'capture');
  assert.equal(capture?.totalMs, 300);
  assert.equal(capture?.calls, 3);
  assert.equal(summary.stops, 3);
});

test('stages are reported heaviest first', async () => {
  const clock = fakeClock();
  const timer = createScanTimer(clock.now);

  await timer.measure('capture', async () => clock.advance(50));
  await timer.measure('imageOcr', async () => clock.advance(900));
  await timer.measure('domScan', async () => clock.advance(5));

  assert.deepEqual(
    timer.summarise().stages.map((stage) => stage.stage),
    ['imageOcr', 'capture', 'domScan'],
  );
});

test('time the timer did not wrap is named, not absorbed', async () => {
  const clock = fakeClock();
  const timer = createScanTimer(clock.now);

  await timer.measure('capture', async () => clock.advance(200));
  clock.advance(800); // something nobody wrapped

  const summary = timer.summarise();
  assert.equal(summary.wallMs, 1000);
  assert.equal(summary.measuredMs, 200);
  assert.equal(summary.unaccountedMs, 800);
});

test('shares are of wall-clock, so they do not renormalise to 100%', async () => {
  // The failure this guards: dividing by the stage sum instead of wall-clock
  // makes a profile that accounts for a fifth of the scan look complete.
  const clock = fakeClock();
  const timer = createScanTimer(clock.now);

  await timer.measure('capture', async () => clock.advance(200));
  clock.advance(800);

  const total = timer.summarise().stages.reduce((sum, stage) => sum + stage.sharePct, 0);
  assert.equal(Math.round(total), 20);
});

test('a stage that throws still reports what it spent', async () => {
  const clock = fakeClock();
  const timer = createScanTimer(clock.now);

  await assert.rejects(
    timer.measure('inference', async () => {
      clock.advance(400);
      throw new Error('the page stopped answering');
    }),
  );

  const inference = timer.summarise().stages.find((stage) => stage.stage === 'inference');
  assert.equal(inference?.totalMs, 400);
  assert.equal(inference?.calls, 1);
});

test('a scan that measured nothing says so rather than printing an empty table', () => {
  const clock = fakeClock();
  const summary = createScanTimer(clock.now).summarise();
  assert.match(formatScanTiming(summary), /nothing was measured/);
});

test('the line carries totals, share, call count and per-call cost', async () => {
  const clock = fakeClock();
  const timer = createScanTimer(clock.now);

  await timer.measure('imageOcr', async () => clock.advance(1200));
  await timer.measure('imageOcr', async () => clock.advance(800));
  timer.countStop();
  timer.countStop();

  const line = formatScanTiming(timer.summarise());
  assert.match(line, /image OCR 2\.0s/);
  assert.match(line, /2x/);
  assert.match(line, /1\.0s each/);
  assert.match(line, /2 stop\(s\)/);
  assert.match(line, /unaccounted/);
});

test('a clock that does not move produces no negative remainder', () => {
  // Clamped rather than reported: a negative unaccounted figure would read as
  // a finding about the scan when it is a finding about the clock.
  const timer = createScanTimer(() => 0);
  assert.equal(timer.summarise().unaccountedMs, 0);
});
