/**
 * Building and running the ONNX session — the one copy of it.
 *
 * WHY THIS IS SEPARATE FROM BOTH HOSTS
 *
 * Inference has to happen in two places now. On Chrome it runs in the offscreen
 * document, because an MV3 service worker can host neither WebAssembly nor
 * WebGPU (DECISIONS.md 45). On Firefox it has to run on a thread that is not
 * the message loop, because a same-origin iframe shares an event loop with its
 * parent and the WASM grind starves the page that has to receive the reply
 * (DECISIONS.md 207).
 *
 * The obvious way to get there is to write the session code twice, once per
 * host. That is the mistake DECISIONS.md 203 refused for manifests and it would
 * be worse here: two copies of backend selection drift silently, and the
 * symptom is Chrome picking WebGPU while Firefox quietly picks WASM for a
 * reason nobody wrote down. So the ort work lives here, once, and both hosts
 * call it.
 *
 * NOTHING IN THIS FILE TOUCHES `chrome.*` OR LOGS ANYTHING
 *
 * Both are deliberate. A dedicated Worker spawned from an extension page does
 * not reliably get the `chrome` namespace, so every URL this needs is passed
 * in by the host that does have it. And a console line printed inside a worker
 * is a line nobody can read — this project has already made that mistake twice
 * (the CPU self-test, and the box-range diagnostic in `face-detector.ts`). So
 * this returns facts and the host does the talking.
 */

import * as ort from 'onnxruntime-web/webgpu';

import type { ExecutionBackend } from '../lib/settings';

/** Everything the session needs that only a host can look up. */
export interface SessionRequest {
  /** Absolute extension URL of the .onnx file. */
  modelUrl: string;
  /** Absolute extension URL prefix ORT loads its .wasm from. */
  wasmPaths: string;
  /** Pin a backend instead of preferring WebGPU. Null means automatic. */
  forceBackend: ExecutionBackend | null;
  /** The model's single real input. See `face-detector.ts` on why it is named. */
  inputName: string;
  /** NCHW input geometry. */
  inputShape: readonly number[];
}

export interface SessionFacts {
  backend: ExecutionBackend;
  /** Session construction only. */
  initMs: number;
  /** Shader warm-up, which WebGPU pays lazily on the first run if we do not. */
  warmUpMs: number;
  /** True when WebGPU was tried and refused, so the UI can say why it is slow. */
  fellBack: boolean;
  /** Set when an override pinned the backend, for diagnostics. */
  forced: ExecutionBackend | null;
  /**
   * Why WebGPU was declined, when it was.
   *
   * Carried rather than logged because on the worker path the only console that
   * would see it belongs to the worker. This is the field that answers the
   * open question in DECISIONS.md 208 — every observed Firefox run fell back to
   * WASM and *the reason was never captured*.
   */
  webgpuError: string | null;
}

/** One inference's outputs, reduced to what survives a `postMessage`. */
export interface TensorView {
  data: Float32Array;
  dims: readonly number[];
}

export interface RunResult {
  scores: TensorView;
  boxes: TensorView;
  inferenceMs: number;
}

/**
 * ORT runtime configuration.
 *
 * `numThreads = 1` avoids needing SharedArrayBuffer, which would require the
 * context to be cross-origin isolated. Neither an offscreen document nor a
 * worker spawned from one can set COOP and COEP response headers, so
 * multi-threading is not available to us in either place; asking for it yields
 * a confusing init failure rather than a graceful fallback.
 *
 * Note what this does NOT solve, so nobody reads a Worker as a fix for it: the
 * worker still runs single-threaded ORT. What it buys is that the one thread
 * ORT grinds on is no longer the thread that has to answer messages.
 */
function configureRuntime(wasmPaths: string): void {
  ort.env.wasm.wasmPaths = wasmPaths;
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = 'warning';
}

/**
 * Build the session, preferring WebGPU and falling back to CPU WASM.
 *
 * PRD.md FR-27 requires the fallback to be automatic and the user merely told
 * that things may be slower — never a hard failure.
 */
async function createSession(
  request: SessionRequest,
): Promise<{ session: ort.InferenceSession; facts: Omit<SessionFacts, 'warmUpMs'> }> {
  let webgpuError: string | null = null;

  // WebGPU is skipped entirely when CPU is forced, so the fallback path can be
  // exercised on hardware where WebGPU works perfectly well.
  if (request.forceBackend !== 'wasm') {
    const started = performance.now();
    try {
      const session = await ort.InferenceSession.create(request.modelUrl, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      });
      return {
        session,
        facts: {
          backend: 'webgpu',
          initMs: performance.now() - started,
          fellBack: false,
          forced: request.forceBackend,
          webgpuError: null,
        },
      };
    } catch (error) {
      // Not an error condition, but the reason is kept. An unexplained
      // fallback is the thing DECISIONS.md 208 could not answer.
      webgpuError = error instanceof Error ? error.message : String(error);
    }
  }

  const wasmStarted = performance.now();
  const session = await ort.InferenceSession.create(request.modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return {
    session,
    facts: {
      backend: 'wasm',
      initMs: performance.now() - wasmStarted,
      // A forced fallback is a deliberate test, not a capability problem, so it
      // must not tell the user their machine lacks WebGPU.
      fellBack: request.forceBackend !== 'wasm',
      forced: request.forceBackend,
      webgpuError,
    },
  };
}

/**
 * Run one throwaway inference over a blank tensor.
 *
 * WebGPU compiles its shaders lazily, on the first inference rather than at
 * session creation. Measured cost: the first real inference took 2122ms while
 * every later one took 84ms — a 25x gap paid by whichever frame happened to be
 * first, which in a demo is the frame someone is watching.
 */
async function warmUp(
  session: ort.InferenceSession,
  request: SessionRequest,
): Promise<number> {
  const elements = request.inputShape.reduce((total, dim) => total * dim, 1);
  const blank = new ort.Tensor('float32', new Float32Array(elements), [
    ...request.inputShape,
  ]);

  const started = performance.now();
  await session.run({ [request.inputName]: blank });
  return performance.now() - started;
}

/**
 * A session plus the facts about how it was built.
 *
 * Holds the session in module scope rather than returning it, because both
 * hosts want the same "build once, reuse" behaviour and the worker cannot hand
 * a session across `postMessage` anyway.
 */
let session: ort.InferenceSession | null = null;
let current: SessionRequest | null = null;
/**
 * The facts from when this session was actually built.
 *
 * Kept, not re-derived. An earlier draft of this function answered the
 * already-open case with `backend: 'webgpu'` and zero timings — which is a
 * plausible-looking lie on every machine that fell back, and would have
 * reported WebGPU to the popup on exactly the laptops where the fallback
 * mattered. The same class of defect as the box coordinates in
 * `face-detector.ts`: every number still looks like a number.
 */
let facts: SessionFacts | null = null;

export async function openSession(request: SessionRequest): Promise<SessionFacts> {
  // Already open. Reported at its real cost rather than rebuilt, which is what
  // makes the multi-step task loop affordable — but reported as it was built,
  // with the timings zeroed because this call did not pay them.
  if (session && facts) return { ...facts, initMs: 0, warmUpMs: 0 };

  configureRuntime(request.wasmPaths);
  const built = await createSession(request);
  session = built.session;
  current = request;

  const warmUpMs = await warmUp(built.session, request);
  facts = { ...built.facts, warmUpMs };
  return facts;
}

/** Run one inference. The input is planar RGB floats, already normalised. */
export async function runSession(
  input: Float32Array,
  dims: readonly number[],
): Promise<RunResult> {
  if (!session || !current) {
    throw new Error('Inference session used before it was opened.');
  }

  const tensor = new ort.Tensor('float32', input, [...dims]);

  // The feed is built explicitly rather than from `session.inputNames`. This
  // model was exported by PyTorch 1.2, which lists every initializer in
  // graph.input — inputNames returns around a hundred entries, all but one of
  // which already resolve from initializers. Iterating them would build a feed
  // the session rejects.
  const started = performance.now();
  const outputs = await session.run({ [current.inputName]: tensor });
  const inferenceMs = performance.now() - started;

  const scores = outputs['scores'];
  const boxes = outputs['boxes'];
  if (!scores || !boxes) {
    throw new Error(`Model returned unexpected outputs: ${Object.keys(outputs).join(', ')}`);
  }

  return {
    scores: { data: scores.data as Float32Array, dims: scores.dims as number[] },
    boxes: { data: boxes.data as Float32Array, dims: boxes.dims as number[] },
    inferenceMs,
  };
}

/** Release the session so the next `openSession` builds a fresh one. */
export async function closeSession(): Promise<void> {
  const held = session;
  session = null;
  current = null;
  facts = null;
  // Awaited so GPU resources are actually released before a new session is
  // built; overlapping two sessions is how you get an out-of-memory failure on
  // a modest GPU.
  await held?.release();
}
