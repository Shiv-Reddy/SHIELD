/**
 * Memory sampling.
 *
 * Every test here is a way this could report a number that is not true, because
 * that is the specific danger with a resource figure: it will be quoted in a
 * table, and a table reads as measured fact. The absent-counter cases matter
 * most — a browser without `performance.memory` must produce "not measured",
 * never a zero that would read as "costs nothing".
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeMemory, memoryDelta, sampleMemory } from '../src/lib/resource';

const MB = 1024 * 1024;

/** Install a fake counter, returning a function that puts things back. */
function withMemory(values: { used: number; total: number; limit: number } | null): () => void {
  const target = performance as Performance & { memory?: unknown };
  const had = Object.prototype.hasOwnProperty.call(target, 'memory');
  const previous = target.memory;

  if (values === null) {
    delete target.memory;
  } else {
    target.memory = {
      usedJSHeapSize: values.used * MB,
      totalJSHeapSize: values.total * MB,
      jsHeapSizeLimit: values.limit * MB,
    };
  }

  return () => {
    if (had) target.memory = previous;
    else delete target.memory;
  };
}

test('a browser with no heap counter reports nothing, not zero', () => {
  const restore = withMemory(null);
  try {
    assert.equal(sampleMemory(), null);
  } finally {
    restore();
  }
});

test('bytes are reported as megabytes', () => {
  const restore = withMemory({ used: 12, total: 30, limit: 2048 });
  try {
    const sample = sampleMemory();
    assert.equal(sample?.usedMb, 12);
    assert.equal(sample?.totalMb, 30);
    assert.equal(sample?.limitMb, 2048);
  } finally {
    restore();
  }
});

test('an unmeasured context says so rather than printing a figure', () => {
  const line = describeMemory('offscreen', null);
  assert.match(line, /not reported/);
  assert.doesNotMatch(line, /\d+\.\d+MB/);
});

test('a described sample names the context it came from', () => {
  // A heap figure with no owner cannot be acted on: the worker and the
  // offscreen document have completely different profiles.
  const line = describeMemory('offscreen, model ready', {
    usedMb: 12.34,
    totalMb: 30,
    limitMb: 2048,
  });

  assert.match(line, /offscreen, model ready/);
  assert.match(line, /12\.3MB/);
});

test('a described sample says what it leaves out', () => {
  // The WASM module and GPU buffers are the larger costs and are invisible
  // here. A line that omitted that caveat would be quoted without it.
  const line = describeMemory('offscreen', { usedMb: 1, totalMb: 2, limitMb: 3 });
  assert.match(line, /excludes WASM and GPU/);
});

test('a delta against an absent reading is refused', () => {
  const sample = { usedMb: 10, totalMb: 20, limitMb: 100 };
  assert.equal(memoryDelta(null, sample), null);
  assert.equal(memoryDelta(sample, null), null);
  assert.equal(memoryDelta(null, null), null);
});

test('a delta is the change in used heap, signed', () => {
  const before = { usedMb: 10, totalMb: 20, limitMb: 100 };
  const after = { usedMb: 14.5, totalMb: 20, limitMb: 100 };

  assert.equal(memoryDelta(before, after), 4.5);
  // Negative after a collection, which is information rather than an error.
  assert.equal(memoryDelta(after, before), -4.5);
});
