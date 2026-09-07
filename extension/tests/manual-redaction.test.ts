/**
 * Manual redaction geometry — TASKS.md Module G.
 *
 * The conversion from document space into viewport space is the entire risk in
 * this feature, and coordinate bugs fail the way they always do: silently, as a
 * plausible rectangle covering the wrong pixels. The explainable overlay made
 * exactly this mistake earlier the same day, and nothing detected it except a
 * person looking at a screenshot.
 *
 * `clipToViewport` is pure precisely so this can be checked without a browser,
 * a DOM, or a stubbed `window`. The drawing surface around it still needs a real
 * browser and stays manual, like the rest of the content script.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipToViewport, previewRect } from '../src/content/manual-redaction';
import type { ManualRegion } from '../src/lib/types';

function marks(
  ...boxes: { x: number; y: number; width: number; height: number }[]
): ManualRegion[] {
  return boxes.map((box, index) => ({ id: `m${index}`, ...box }));
}

test('an unscrolled page leaves a mark exactly where it was drawn', () => {
  assert.deepEqual(clipToViewport(marks({ x: 100, y: 50, width: 200, height: 40 }), 0, 0, 1000, 800), [
    { x: 100, y: 50, width: 200, height: 40 },
  ]);
});

test('scrolling moves a mark up by exactly the scroll offset', () => {
  // The defect the whole design exists to avoid. A mark drawn at document
  // y=500 and seen after scrolling 300 belongs at viewport y=200. Storing
  // viewport coordinates would leave it at 500, covering different content —
  // which is what the explainable overlay did before it was fixed.
  assert.deepEqual(
    clipToViewport(marks({ x: 100, y: 500, width: 200, height: 40 }), 0, 300, 1000, 800),
    [{ x: 100, y: 200, width: 200, height: 40 }],
  );
});

test('horizontal scroll is treated exactly like vertical', () => {
  assert.deepEqual(
    clipToViewport(marks({ x: 400, y: 20, width: 100, height: 30 }), 250, 0, 1000, 800),
    [{ x: 150, y: 20, width: 100, height: 30 }],
  );
});

test('a mark scrolled off the top is dropped, not reported at a negative offset', () => {
  // It is not in the capture, so it has nothing to cover. A negative rectangle
  // passed downstream would paint outside the frame.
  assert.deepEqual(
    clipToViewport(marks({ x: 10, y: 100, width: 200, height: 40 }), 0, 900, 1000, 800),
    [],
  );
});

test('a mark below the fold is dropped', () => {
  assert.deepEqual(
    clipToViewport(marks({ x: 10, y: 2000, width: 200, height: 40 }), 0, 0, 1000, 800),
    [],
  );
});

test('a mark straddling the bottom edge is clipped to the visible part', () => {
  // Clipped rather than dropped, because the visible half IS in the frame and
  // must be covered. Clipped rather than passed whole, because an over-large
  // rectangle would black out pixels the user never marked.
  assert.deepEqual(
    clipToViewport(marks({ x: 10, y: 760, width: 100, height: 200 }), 0, 0, 1000, 800),
    [{ x: 10, y: 760, width: 100, height: 40 }],
  );
});

test('a mark straddling the top edge is clipped, keeping the visible remainder', () => {
  // Drawn at document y=100 with height 200; scrolled 150. The top 50px is off
  // screen, so 150px remain, starting at viewport 0.
  assert.deepEqual(
    clipToViewport(marks({ x: 10, y: 100, width: 100, height: 200 }), 0, 150, 1000, 800),
    [{ x: 10, y: 0, width: 100, height: 150 }],
  );
});

test('a mark wider than the viewport is clipped to it, not left overhanging', () => {
  assert.deepEqual(
    clipToViewport(marks({ x: 0, y: 10, width: 5000, height: 20 }), 0, 0, 1000, 800),
    [{ x: 0, y: 10, width: 1000, height: 20 }],
  );
});

test('a mark exactly on the fold contributes nothing rather than a zero-height box', () => {
  // A zero-area region redacts nothing and would still earn a manifest entry.
  // A manifest that overstates what was hidden is worse than a short one.
  assert.deepEqual(
    clipToViewport(marks({ x: 10, y: 800, width: 100, height: 50 }), 0, 0, 1000, 800),
    [],
  );
});

test('several marks are converted independently, and only the visible survive', () => {
  const result = clipToViewport(
    marks(
      { x: 10, y: 400, width: 50, height: 50 },
      { x: 10, y: 5000, width: 50, height: 50 },
      { x: 20, y: 450, width: 60, height: 20 },
    ),
    0,
    380,
    1000,
    800,
  );

  assert.deepEqual(result, [
    { x: 10, y: 20, width: 50, height: 50 },
    { x: 20, y: 70, width: 60, height: 20 },
  ]);
});

test('no marks means no regions, not an empty rectangle', () => {
  assert.deepEqual(clipToViewport([], 0, 0, 1000, 800), []);
});

// --- The rectangle being dragged -------------------------------------------
//
// Reported from a real page as "marking area is not working properly". The
// stored mark was correct; the PREVIEW was painted at its document coordinate
// on a viewport-anchored surface, so on any scrolled page the rectangle drew a
// full scroll-height away from the cursor. That is the same coordinate mistake
// as the one above, one layer down, and it went unnoticed because every test
// covered the mark and none covered the thing the user actually looks at.

test('an unscrolled drag draws exactly between the two corners', () => {
  assert.deepEqual(previewRect(100, 50, 300, 90, 0, 0), {
    x: 100,
    y: 50,
    width: 200,
    height: 40,
  });
});

test('a drag on a scrolled page draws under the cursor, not below it', () => {
  // Dragging from document y=900 to y=1000 with the page scrolled 800 is a
  // rectangle at viewport y=100. Painting y=900 — what the code did — puts it
  // 800px below the mouse, usually off screen entirely.
  assert.deepEqual(previewRect(100, 900, 300, 1000, 0, 800), {
    x: 100,
    y: 100,
    width: 200,
    height: 100,
  });
});

test('dragging up and left is the same rectangle as dragging down and right', () => {
  const upLeft = previewRect(300, 400, 100, 200, 0, 0);
  const downRight = previewRect(100, 200, 300, 400, 0, 0);
  assert.deepEqual(upLeft, downRight);
  assert.deepEqual(upLeft, { x: 100, y: 200, width: 200, height: 200 });
});

test('horizontal scroll shifts the drag the same way vertical does', () => {
  assert.deepEqual(previewRect(500, 20, 560, 60, 250, 0), {
    x: 250,
    y: 20,
    width: 60,
    height: 40,
  });
});

test('a click that never moved is a zero-area rectangle, not a negative one', () => {
  // Below MIN_SIZE, so `onMouseUp` discards it. What matters here is that the
  // preview drawn on the way is degenerate rather than inverted.
  assert.deepEqual(previewRect(10, 10, 10, 10, 0, 0), {
    x: 10,
    y: 10,
    width: 0,
    height: 0,
  });
});

test('the preview and the stored mark agree on where the rectangle is', () => {
  // The two conversions are written separately and must not drift apart: a
  // preview that disagrees with the mark is precisely the reported bug.
  const [startX, startY, endX, endY] = [120, 940, 320, 1010];
  const [scrollX, scrollY] = [0, 800];

  const preview = previewRect(startX, startY, endX, endY, scrollX, scrollY);
  const [stored] = clipToViewport(
    [
      {
        id: 'm0',
        x: Math.min(startX, endX),
        y: Math.min(startY, endY),
        width: Math.abs(endX - startX),
        height: Math.abs(endY - startY),
      },
    ],
    scrollX,
    scrollY,
    1000,
    800,
  );

  assert.deepEqual(preview, stored);
});
