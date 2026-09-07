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
): Promise<SelfTestResult> {
  let session: ort.InferenceSession | null = null;

  try {
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
