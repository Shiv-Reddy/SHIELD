/**
 * Memory sampling for metric 4 — client-side resource utilisation, 20%.
 *
 * WHAT THIS MEASURES, AND THE LARGER PART IT DOES NOT
 *
 * `performance.memory` reports the JavaScript heap of one context and nothing
 * else. Shield's two biggest costs are not on that heap:
 *
 *   - ONNX Runtime's WebAssembly linear memory, which is where the 26MB module
 *     and every tensor actually live. WASM memory is allocated outside the JS
 *     heap and does not appear in `usedJSHeapSize` at all.
 *   - GPU buffers on the WebGPU path. No browser API reports these to the page.
 *
 * So a small number here is not evidence of a small footprint, and this file
 * would be actively misleading if it were quoted alone. It is useful for what
 * it does cover — whether OUR code leaks across runs, which a growing heap over
 * repeated runs would show — and the process-level truth has to come from the
 * browser's own task manager. docs/RESOURCES.md carries that protocol.
 *
 * The numbers are also deliberately coarse. Chrome buckets these values and
 * updates them lazily to avoid handing pages a high-resolution timer by another
 * route, so treat a difference of a megabyte or two as noise.
 */

/** Chrome's non-standard heap counters, absent everywhere else. */
interface ChromeMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

export interface MemorySample {
  /** Heap in use, MB. */
  usedMb: number;
  /** Heap the engine has reserved, MB. */
  totalMb: number;
  /** Ceiling the engine will grow to, MB. */
  limitMb: number;
}

const MB = 1024 * 1024;

/**
 * Sample this context's JS heap, or null where the counter does not exist.
 *
 * Null rather than zero, and the distinction is the usual one: zero would read
 * as "this context uses no memory", which is never true. A caller that cannot
 * tell "not measured" from "measured as nothing" will report the wrong thing.
 */
export function sampleMemory(): MemorySample | null {
  const memory = (performance as Performance & { memory?: ChromeMemory }).memory;
  if (!memory) return null;

  return {
    usedMb: memory.usedJSHeapSize / MB,
    totalMb: memory.totalJSHeapSize / MB,
    limitMb: memory.jsHeapSizeLimit / MB,
  };
}

/**
 * One line describing a sample, for the console.
 *
 * Says which context it came from, because the service worker and the offscreen
 * document have completely different profiles and a heap figure with no owner
 * cannot be acted on.
 */
export function describeMemory(where: string, sample: MemorySample | null): string {
  if (!sample) return `[shield] ${where}: heap size not reported by this browser`;

  return (
    `[shield] ${where} heap ${sample.usedMb.toFixed(1)}MB used / ` +
    `${sample.totalMb.toFixed(1)}MB reserved (JS only - excludes WASM and GPU)`
  );
}

/**
 * The change between two samples, for "did that run cost us anything lasting?".
 *
 * Returns null when either end is missing, for the same reason `sampleMemory`
 * returns null: a delta computed against an absent reading is a fiction.
 */
export function memoryDelta(
  before: MemorySample | null,
  after: MemorySample | null,
): number | null {
  if (!before || !after) return null;
  return after.usedMb - before.usedMb;
}
