/**
 * Face geometry and the prior grid — TASKS.md Module G.
 *
 * Both of the bugs pinned here were silent. The prior count mismatch would have
 * decoded every box against the wrong anchor, producing confident detections in
 * wrong places; the coordinate conversion produced boxes that looked like
 * plausible rectangles while covering the wrong pixels. Neither throws, neither
 * logs, and both look correct from every angle except the one that matters.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EXPECTED_PRIOR_COUNT, decodeBox, getPriors } from '../src/offscreen/priors';
import { faceRegions } from '../src/lib/pii/face-regions';

test('the prior grid matches the model output shape exactly', () => {
  // 4400 was the first attempt, because the last detection head has three box
  // sizes and was given two. The count is the only thing that catches it.
  assert.equal(getPriors().length, EXPECTED_PRIOR_COUNT);
});

test('prior centres stay inside the frame', () => {
  for (const prior of getPriors()) {
    assert.ok(prior.cx >= 0 && prior.cx <= 1, `cx ${prior.cx}`);
    assert.ok(prior.cy >= 0 && prior.cy <= 1, `cy ${prior.cy}`);
    assert.ok(prior.width > 0 && prior.height > 0);
  }
});

test('decoding a zero offset returns the prior itself', () => {
  // With no displacement and no scaling, the decoded box must be the anchor.
  // If the variances or the centre/size maths were transposed, this would drift.
  const prior = { cx: 0.5, cy: 0.5, width: 0.1, height: 0.2 };
  const box = decodeBox(prior, 0, 0, 0, 0);

  assert.ok(Math.abs(box.x1 - 0.45) < 1e-9);
  assert.ok(Math.abs(box.x2 - 0.55) < 1e-9);
  assert.ok(Math.abs(box.y1 - 0.4) < 1e-9);
  assert.ok(Math.abs(box.y2 - 0.6) < 1e-9);
});

test('decoded boxes are ordered, so a width can never be negative', () => {
  const prior = { cx: 0.5, cy: 0.5, width: 0.1, height: 0.2 };

  // The raw range measured on a real page was -4.268..3.368; these are ordinary
  // regression outputs, not corrupt ones.
  for (const offset of [-4.3, -1, 0, 1, 3.4]) {
    const box = decodeBox(prior, offset, offset, offset, offset);
    assert.ok(box.x2 > box.x1, `x inverted at ${offset}`);
    assert.ok(box.y2 > box.y1, `y inverted at ${offset}`);
  }
});

test('face regions convert to CSS pixels at scale 1', () => {
  const [region] = faceRegions(
    [{ x1: 0.25, y1: 0.25, x2: 0.5, y2: 0.5, score: 0.9 }],
    { width: 1920, height: 945, scaleX: 1, scaleY: 1 },
  );

  assert.equal(region?.position.x, 480);
  assert.equal(region?.position.width, 480);
});

test('face regions convert correctly at 2x HiDPI', () => {
  // The case the development machine never exercises, and the one where a
  // systematic scale error hides: the box still looks plausible, it just covers
  // the wrong half of the screen.
  const [region] = faceRegions(
    [{ x1: 0.25, y1: 0.25, x2: 0.5, y2: 0.5, score: 0.9 }],
    { width: 3840, height: 2160, scaleX: 2, scaleY: 2 },
  );

  assert.equal(region?.position.x, 480);
  assert.equal(region?.position.y, 270);
  assert.equal(region?.position.width, 480);
  assert.equal(region?.position.height, 270);
});

test('an unmeasured frame yields no regions rather than infinite ones', () => {
  // Dividing by a zero scale would produce Infinity-sized regions, which redact
  // the entire screen while reporting success.
  assert.equal(
    faceRegions([{ x1: 0, y1: 0, x2: 1, y2: 1, score: 0.9 }], {
      width: 0,
      height: 0,
      scaleX: 1,
      scaleY: 1,
    }).length,
    0,
  );
});

test('a face region carries no element id and states its confidence', () => {
  const [region] = faceRegions(
    [{ x1: 0.1, y1: 0.1, x2: 0.2, y2: 0.3, score: 0.87 }],
    { width: 1000, height: 500, scaleX: 1, scaleY: 1 },
  );

  // No DOM element corresponds to a face — that is the gap the visual layer
  // exists to cover.
  assert.equal(region?.elementId, null);
  assert.equal(region?.source, 'visual');
  assert.match(region?.reason ?? '', /87%/);
});
