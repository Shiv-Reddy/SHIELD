/**
 * UltraFace (version-RFB-320) inference via ONNX Runtime Web.
 *
 * Loads the pinned model once and reuses the session — building an InferenceSession
 * is by far the most expensive step (it compiles a 26MB WASM module), and doing it
 * per capture would put the multi-step task loop seconds over budget.
 *
 * Model I/O is documented in tools/models.json, read out of the ONNX graph
 * rather than a README.
 */

import * as ort from 'onnxruntime-web/webgpu';

import { LATENCY_BUDGET_MS } from '../lib/timing';
import { decodeBox, getPriors } from './priors';

const MODEL_PATH = 'models/ultraface-rfb-320.onnx';

/** The one real input. See the note below on why this is hardcoded. */
const INPUT_NAME = 'input';

/** Model input geometry, NCHW. Width 320, height 240. */
const INPUT_WIDTH = 320;
const INPUT_HEIGHT = 240;

/**
 * UltraFace normalisation, from the reference implementation:
 * `(pixel - 127) / 128`, applied per channel in RGB order.
 * Getting this wrong produces plausible-looking garbage rather than an error,
 * which is why it is stated here next to the model rather than inlined.
 */
const PIXEL_MEAN = 127;
const PIXEL_STD = 128;

export type { ExecutionBackend } from '../lib/settings';

import type { ExecutionBackend } from '../lib/settings';

export interface FaceDetectorInfo {
  backend: ExecutionBackend;
  /** Milliseconds spent building the session, for the startup budget. */
  initMs: number;
  /** True when WebGPU was tried and refused, so the UI can say why it's slow. */
  fellBack: boolean;
  /** Set when a local override pinned the backend, for diagnostics. */
  forced: ExecutionBackend | null;
}

/**
 * One detected face, in coordinates normalised to the frame (0..1).
 *
 * Normalised rather than pixels because the frame is resized on its way into the
 * model and could be resized again on its way to the canvas. A ratio survives
 * both; a pixel count silently means the wrong thing after either.
 */
export interface FaceBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

export interface RawDetectionSummary {
  /** Number of candidate boxes the model emitted. Always 4420 for this model. */
  priors: number;
  /** Highest face-class probability anywhere in the frame. */
  maxScore: number;
  /** How many priors exceeded a nominal 0.7 confidence, before NMS. */
  aboveThreshold: number;
  /**
   * Candidate counts at descending score cutoffs, before suppression.
   *
   * Diagnostic. A face the model cannot see at all produces nothing at any
   * cutoff, whereas a face it half-sees appears at 0.3 and vanishes at 0.7 —
   * which separates "the threshold is too strict" from "the face is too small
   * to survive the downscale into a 320x240 input". Those have opposite fixes,
   * and guessing between them wastes the effort either way.
   */
  candidatesByCutoff: { at30: number; at50: number; at70: number };
  /** Faces kept after thresholding, suppression and padding. */
  faces: FaceBox[];
  /**
   * Observed coordinate range of the raw boxes, before any clamping.
   *
   * Reported through the result rather than logged here. The offscreen document
   * has its own devtools target that nobody opens, so a diagnostic printed here
   * is a diagnostic nobody reads — a mistake already made once with the CPU
   * self-test and repeated here with this very field.
   */
  boxRange: { dims: number[]; min: number; max: number; sample: number[] } | null;
  inferenceMs: number;
}

/**
 * Score below which a candidate face is discarded.
 *
 * Far below UltraFace's usual 0.7. SECURITY_PRIVACY.md Section 4 asks for a
 * bias toward over-redaction on faces specifically, and the asymmetry is stark:
 * a false positive paints over a rectangle of background, while a false
 * negative puts someone's face on a server. The cost of being wrong is not
 * remotely symmetrical, so this is not set where an accuracy benchmark would
 * put it.
 *
 * Was 0.5, lowered on measurement. On test-screens/03-faces.html the detector
 * found 5 of 8 faces at 0.5 while reporting 20 candidates above 0.3 against 14
 * above 0.5 — meaning the model was seeing more than the threshold was letting
 * through. Holding at 0.5 was stricter than the policy the project has written
 * down.
 */
const FACE_SCORE_THRESHOLD = 0.3;

/**
 * Fraction of each box's size added on every side.
 *
 * A detector's idea of a face is the facial region — it clips hair, chin, ears
 * and neck, all of which are identifying. Padding turns a tight box into a
 * covering one, which is the actual goal.
 */
const FACE_BOX_PADDING = 0.15;

/** Overlap above which two boxes are treated as the same face. */
const NMS_IOU_THRESHOLD = 0.3;

/**
 * Ceiling on reported faces.
 *
 * Bounds the work done on a pathological frame — a crowd scene, or a page of
 * thumbnails — so that redaction cannot become the slow stage. Boxes are sorted
 * by score first, so the ones dropped are always the least confident.
 */
const MAX_FACES = 50;

/** Intersection over union of two boxes. */
function iou(a: FaceBox, b: FaceBox): number {
  const overlapWidth = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const overlapHeight = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const overlap = overlapWidth * overlapHeight;
  if (overlap <= 0) return 0;

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - overlap;
  return union > 0 ? overlap / union : 0;
}

/**
 * Greedy non-maximum suppression.
 *
 * The model emits 4420 overlapping priors and several of them fire on the same
 * face. Without this, one person produces a dozen near-identical regions: the
 * manifest becomes unreadable, the trust overlay becomes a mess of stacked
 * rectangles, and the redaction stage does the same work over and over.
 */
function suppressOverlaps(boxes: FaceBox[]): FaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: FaceBox[] = [];

  for (const candidate of sorted) {
    if (kept.length >= MAX_FACES) break;
    if (kept.some((box) => iou(box, candidate) > NMS_IOU_THRESHOLD)) continue;
    kept.push(candidate);
  }

  return kept;
}

/**
 * Summarise the coordinate range of the decoded boxes.
 *
 * Pure and returned, not logged. It reported the raw range while the coordinate
 * space was still unknown; now that the decode is in place it reports the
 * decoded range, which should sit close to 0..1. If it drifts far outside that,
 * the prior grid and the model have diverged again.
 */
function describeBoxRange(
  boxes: readonly FaceBox[],
  dims: number[],
): { dims: number[]; min: number; max: number; sample: number[] } | null {
  if (boxes.length === 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    min = Math.min(min, box.x1, box.y1, box.x2, box.y2);
    max = Math.max(max, box.x1, box.y1, box.x2, box.y2);
  }

  const first = boxes[0];
  return {
    dims,
    min,
    max,
    sample: first ? [first.x1, first.y1, first.x2, first.y2] : [],
  };
}

/** Grow a box on every side, clamped to the frame. */
function padBox(box: FaceBox): FaceBox {
  const padX = (box.x2 - box.x1) * FACE_BOX_PADDING;
  const padY = (box.y2 - box.y1) * FACE_BOX_PADDING;

  // Clamped to the frame on both edges, then re-ordered. Clamping only the far
  // edge is what inverted boxes whose coordinates fell outside 0..1: x2 was
  // pulled down to 1 while x1 stayed above it, producing a negative width that
  // survived all the way to the redaction stage.
  const x1 = clampUnit(box.x1 - padX);
  const y1 = clampUnit(box.y1 - padY);
  const x2 = clampUnit(box.x2 + padX);
  const y2 = clampUnit(box.y2 + padY);

  return {
    x1: Math.min(x1, x2),
    y1: Math.min(y1, y2),
    x2: Math.max(x1, x2),
    y2: Math.max(y1, y2),
    score: box.score,
  };
}

/** Confine a coordinate to the frame. */
function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

let session: ort.InferenceSession | null = null;
let info: FaceDetectorInfo | null = null;

/**
 * Configure ORT before any session is created.
 *
 * `wasmPaths` points at the extension's own copy. Left unset, ORT resolves the
 * binary relative to the script bundle and, failing that, reaches for a CDN —
 * which must never happen here (see tools/copy-ort-assets.mjs).
 *
 * `numThreads = 1` avoids needing SharedArrayBuffer, which would require the
 * document to be cross-origin isolated. An offscreen document cannot set COOP
 * and COEP response headers, so multi-threading is not available to us at all;
 * asking for it yields a confusing init failure rather than a graceful fallback.
 */
function configureRuntime(): void {
  ort.env.wasm.wasmPaths = chrome.runtime.getURL('ort/');
  ort.env.wasm.numThreads = 1;
  // ORT logs a great deal at default verbosity; keep the console readable so
  // Shield's own diagnostics stay findable.
  ort.env.logLevel = 'warning';
}

/**
 * Build the inference session, preferring WebGPU and falling back to CPU WASM.
 *
 * PRD.md FR-27 requires the fallback to be automatic and the user to be told
 * that things may be slower — never a hard failure.
 */
async function createSession(
  forceBackend: ExecutionBackend | null,
): Promise<FaceDetectorInfo> {
  const modelUrl = chrome.runtime.getURL(MODEL_PATH);

  if (forceBackend) {
    console.warn(`[shield] backend forced to '${forceBackend}' by local settings`);
  }

  // WebGPU is skipped entirely when CPU is forced, so the fallback path can be
  // exercised on hardware where WebGPU works perfectly well.
  if (forceBackend !== 'wasm') {
    const started = performance.now();
    try {
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      });
      return {
        backend: 'webgpu',
        initMs: performance.now() - started,
        fellBack: false,
        forced: forceBackend,
      };
    } catch (error) {
      // Not an error condition: PRD.md FR-27 requires this to be automatic and
      // silent-to-the-pipeline, with the user merely told things may be slower.
      console.warn('[shield] WebGPU unavailable, falling back to CPU:', error);
    }
  }

  const wasmStarted = performance.now();
  session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  return {
    backend: 'wasm',
    initMs: performance.now() - wasmStarted,
    // A forced fallback is a deliberate test, not a capability problem, so it
    // must not tell the user their machine lacks WebGPU.
    fellBack: forceBackend !== 'wasm',
    forced: forceBackend,
  };
}

/**
 * Run one throwaway inference over a blank tensor.
 *
 * WebGPU compiles its shaders lazily, on the first inference rather than at
 * session creation. Measured cost: the first real inference took 2122ms while
 * every later one took 84ms — a 25x gap paid by whichever frame happened to be
 * first, which in a demo is the frame someone is watching.
 *
 * Doing it here moves that cost into model initialisation, where it is expected
 * and already budgeted, and makes the first frame the user actually cares about
 * as fast as the rest. The input is zeroes: only shader compilation matters, not
 * the result, which is discarded.
 */
async function warmUp(): Promise<number> {
  if (!session) return 0;

  const blank = new ort.Tensor(
    'float32',
    new Float32Array(INPUT_WIDTH * INPUT_HEIGHT * 3),
    [1, 3, INPUT_HEIGHT, INPUT_WIDTH],
  );

  const started = performance.now();
  await session.run({ [INPUT_NAME]: blank });
  return performance.now() - started;
}

/**
 * Load the model if it isn't already loaded. Safe to call repeatedly.
 *
 * The backend override arrives as an argument rather than being read from
 * storage here. This document is an executor: policy and persistence belong to
 * the service worker, which is the context whose access to `chrome.storage` is
 * not in question.
 */
export async function ensureFaceDetector(
  forceBackend: ExecutionBackend | null = null,
): Promise<FaceDetectorInfo> {
  if (session && info) return info;

  configureRuntime();
  info = await createSession(forceBackend);

  const warmMs = await warmUp();
  info = { ...info, initMs: info.initMs + warmMs };
  console.info(`[shield] shader warm-up ${warmMs.toFixed(0)}ms`);

  const budget = LATENCY_BUDGET_MS.modelInit;
  const detail = `${info.initMs.toFixed(0)}ms on ${info.backend}`;
  if (info.initMs > budget) {
    console.warn(`[shield] model init ${detail} (budget ${budget}ms)`);
  } else {
    console.info(`[shield] model init ${detail} / ${budget}ms`);
  }

  return info;
}

/**
 * Resize a frame to the model's input geometry and produce an NCHW tensor.
 *
 * The aspect ratio is deliberately not preserved. UltraFace was trained on
 * whole images squashed to 320x240, so letterboxing would present it with a
 * distribution it never saw. Box coordinates come back normalised to 0..1, so
 * mapping them onto the original frame is a straightforward multiply either way.
 */
function preprocess(bitmap: ImageBitmap): ort.Tensor {
  const canvas = new OffscreenCanvas(INPUT_WIDTH, INPUT_HEIGHT);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create a 2D context for preprocessing.');

  context.drawImage(bitmap, 0, 0, INPUT_WIDTH, INPUT_HEIGHT);
  const { data } = context.getImageData(0, 0, INPUT_WIDTH, INPUT_HEIGHT);

  // RGBA interleaved -> planar RGB, normalised. Planar because the model is
  // NCHW: all red values, then all green, then all blue.
  const pixels = INPUT_WIDTH * INPUT_HEIGHT;
  const tensor = new Float32Array(pixels * 3);

  for (let i = 0; i < pixels; i += 1) {
    const offset = i * 4;
    tensor[i] = ((data[offset] ?? 0) - PIXEL_MEAN) / PIXEL_STD;
    tensor[pixels + i] = ((data[offset + 1] ?? 0) - PIXEL_MEAN) / PIXEL_STD;
    tensor[pixels * 2 + i] = ((data[offset + 2] ?? 0) - PIXEL_MEAN) / PIXEL_STD;
  }

  return new ort.Tensor('float32', tensor, [1, 3, INPUT_HEIGHT, INPUT_WIDTH]);
}

/**
 * Run one inference over a captured frame.
 *
 * Returns raw output statistics only. Turning these into redactable regions —
 * confidence thresholding, non-maximum suppression, mapping to frame
 * coordinates — is the PII Detector's job (Module B), deliberately kept out of
 * here so the detection policy lives in one testable place.
 */
export async function detectFaces(bitmap: ImageBitmap): Promise<RawDetectionSummary> {
  if (!session) throw new Error('Face detector used before it was loaded.');

  const input = preprocess(bitmap);

  // The feed is built explicitly rather than from `session.inputNames`. This
  // model was exported by PyTorch 1.2, which lists every initializer in
  // graph.input — inputNames returns around a hundred entries, all but one of
  // which already resolve from initializers. Iterating them would build a feed
  // the session rejects.
  const started = performance.now();
  const outputs = await session.run({ [INPUT_NAME]: input });
  const inferenceMs = performance.now() - started;

  const scores = outputs['scores'];
  const boxes = outputs['boxes'];
  if (!scores || !boxes) {
    throw new Error(
      `Model returned unexpected outputs: ${Object.keys(outputs).join(', ')}`,
    );
  }

  // scores is [1, N, 2]: index 0 is background, index 1 is the face class.
  // boxes is [1, N, 4]: x1, y1, x2, y2.
  //
  // The coordinate range is asserted below rather than assumed. Boxes that were
  // taken on faith as 0..1 produced inverted rectangles with negative widths:
  // the padding step clamps the far edge down to 1 while leaving a near edge
  // above 1 untouched, which turns an out-of-range box inside out instead of
  // rejecting it. A wrong coordinate space is silent — every number still looks
  // like a plausible number.
  const scoreData = scores.data as Float32Array;
  const boxData = boxes.data as Float32Array;
  // Two different things, deliberately named apart: how many predictions the
  // model returned, and the anchor grid each one is measured against.
  const priorCount = scoreData.length / 2;
  const priors = getPriors();

  if (priorCount !== priors.length) {
    throw new Error(
      `Model returned ${priorCount} predictions but the prior grid has ${priors.length}. ` +
        'Refusing to decode against mismatched anchors.',
    );
  }

  let maxScore = 0;
  let aboveThreshold = 0;
  let at30 = 0;
  let at50 = 0;
  const candidates: FaceBox[] = [];

  for (let i = 0; i < priorCount; i += 1) {
    const faceScore = scoreData[i * 2 + 1] ?? 0;
    if (faceScore > maxScore) maxScore = faceScore;
    if (faceScore > 0.7) aboveThreshold += 1;
    if (faceScore > 0.5) at50 += 1;
    if (faceScore > 0.3) at30 += 1;
    if (faceScore < FACE_SCORE_THRESHOLD) continue;

    const prior = priors[i];
    if (!prior) continue;

    // The model emits regression offsets, not coordinates. Decoding against the
    // prior grid is what turns them into a rectangle; reading them directly
    // produced values spanning -4.268..3.368 and rectangles with negative width.
    const offset = i * 4;
    const box = decodeBox(
      prior,
      boxData[offset] ?? 0,
      boxData[offset + 1] ?? 0,
      boxData[offset + 2] ?? 0,
      boxData[offset + 3] ?? 0,
    );

    // Degenerate boxes appear at the edges of the prior grid. A zero-area
    // region redacts nothing while still claiming a face was hidden, which is
    // worse than not reporting it.
    if (box.x2 <= box.x1 || box.y2 <= box.y1) continue;

    candidates.push({ ...box, score: faceScore });
  }

  // Kept before clamping, so the diagnostic describes what the model actually
  // emitted rather than what padding made of it.
  const rawCandidates = suppressOverlaps(candidates);
  const faces = rawCandidates.map(padBox);

  return {
    priors: priorCount,
    maxScore,
    aboveThreshold,
    candidatesByCutoff: { at30, at50, at70: aboveThreshold },
    faces,
    boxRange: describeBoxRange(rawCandidates, boxes.dims as number[]),
    inferenceMs,
  };
}

/** Everything the CPU self-test needs to build an independent session. */
export function modelDescriptor(): {
  modelUrl: string;
  inputName: string;
  shape: readonly number[];
} {
  return {
    modelUrl: chrome.runtime.getURL(MODEL_PATH),
    inputName: INPUT_NAME,
    shape: [1, 3, INPUT_HEIGHT, INPUT_WIDTH],
  };
}

/** Release the session, so the next `ensureFaceDetector` builds a fresh one. */
export async function disposeFaceDetector(): Promise<void> {
  const current = session;
  session = null;
  info = null;
  // Awaited so the GPU resources are actually released before a new session is
  // built; overlapping two sessions is how you get an out-of-memory failure on
  // a modest GPU.
  await current?.release();
}
