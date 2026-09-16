/**
 * One-time CPU fallback self-test.
 *
 * PRD.md FR-27 requires Shield to keep working where WebGPU is unavailable, and
 * TESTING.md Section 5 requires testing across several laptops. Both are easy to
 * assert and hard to actually verify: on a machine where WebGPU works, the
 * fallback path never executes, so it can rot indefinitely while every run looks
 * healthy.
 *
 * Rather than rely on someone remembering to force the backend by hand, Shield
 * proves the fallback on whatever machine it is installed on and records the
 * result. That turns "the fallback should work" into "the fallback ran here, in
 * this many milliseconds" — which is the evidence the multi-laptop requirement
 * is actually asking for.
 *
 * It runs after a successful analysis, never before, so it costs the user
 * nothing: by then the frame has been processed and the host is otherwise idle.
 */

import * as ort from 'onnxruntime-web/webgpu';

import type { SelfTestResult } from '../lib/self-test-record';

export type { SelfTestResult };

/**
 * Build a CPU session, run one inference, release it.
 *
 * Whether this should run at all, and what becomes of the verdict, is decided by
 * the service worker. This function only produces evidence.
 *
 * Deliberately independent of the live session: it must prove the fallback can
 * be built from scratch, which is what would happen on a machine without
 * WebGPU. Reusing anything from the working path would prove less than nothing.
 */
export async function runSelfTest(
  modelUrl: string,
  inputName: string,
  shape: readonly number[],
  wasmPaths: string,
): Promise<SelfTestResult> {
  let session: ort.InferenceSession | null = null;

  try {
    // Pinned HERE rather than inherited, which is the defect this parameter
    // exists to close. `configureRuntime` sets the same globals, and while the
    // live session ran in this very context that was enough - the two shared
    // one `ort` module instance and therefore one `ort.env`. The moment
    // inference moved to a Worker (DECISIONS.md 216) they stopped sharing a
    // realm: the Worker configured its own copy and this one kept ORT's
    // default, which resolves the loader relative to the importing script and
    // finds nothing. Observed on Firefox 2026-09-17 as "CPU fallback BROKEN -
    // no available backend found", pointing at chunks/ instead of ort/.
    //
    // Left unset, ORT also reaches for a CDN, which must never happen here.
    // The docblock above already says this test must prove the fallback can be
    // built FROM SCRATCH; depending on another module's side effect was the
    // one way it was not doing that.
    ort.env.wasm.wasmPaths = wasmPaths;
    // Matches the live session: no SharedArrayBuffer, so no COOP/COEP headers
    // an extension page cannot set anyway.
    ort.env.wasm.numThreads = 1;

    const initStarted = performance.now();
    session = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    const initMs = performance.now() - initStarted;

    const elements = shape.reduce((total, value) => total * value, 1);
    const blank = new ort.Tensor('float32', new Float32Array(elements), [...shape]);

    const started = performance.now();
    const outputs = await session.run({ [inputName]: blank });
    const inferenceMs = performance.now() - started;

    // A session that runs but returns nothing useful has not proved anything.
    if (!outputs['scores'] || !outputs['boxes']) {
      return {
        ok: false,
        inferenceMs: 0,
        initMs,
        message: `CPU session ran but returned ${Object.keys(outputs).join(', ')}`,
        at: Date.now(),
      };
    }

    return {
      ok: true,
      inferenceMs,
      initMs,
      message: `CPU fallback works: ${inferenceMs.toFixed(0)}ms inference, ${initMs.toFixed(0)}ms init`,
      at: Date.now(),
    };
  } catch (error) {
    return {
      ok: false,
      inferenceMs: 0,
      initMs: 0,
      message: error instanceof Error ? error.message : String(error),
      at: Date.now(),
    };
  } finally {
    // Releasing is cleanup, not part of the verdict. Letting it throw here would
    // discard a result that had already been established, which is how a passing
    // test reports nothing at all.
    try {
      await session?.release();
    } catch (error) {
      console.warn('[shield] self-test session release failed', error);
    }
  }
}
