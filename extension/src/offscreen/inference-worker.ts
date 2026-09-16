/**
 * The inference worker — ONNX on a thread that is not the message loop.
 *
 * WHY THIS EXISTS
 *
 * DECISIONS.md 207. The Firefox vision host was a hidden iframe inside the
 * event page, and the argument for it was right about browsing contexts and
 * wrong about threads: a same-origin iframe shares an **event loop** with its
 * parent, so single-threaded WASM inference starves the event page that has to
 * receive the reply. Firefox reported `Content process isn't responsive` and
 * would not attach a debugger — which is also why the reason took a rebuild to
 * find. A dedicated Worker is a real thread, so the grind happens somewhere
 * that owes nobody an answer.
 *
 * WHAT IT DELIBERATELY NEVER RECEIVES
 *
 * A frame. The host decodes the capture, draws it to a 320x240 canvas and
 * normalises it, and sends **only** the resulting planar float array. So this
 * context cannot leak a screenshot because it is never given one — the same
 * argument `ocr.ts` makes about sending rectangles and receiving words, and it
 * keeps "the offscreen document is the only context that decodes a frame"
 * (DECISIONS.md 45) true as written.
 *
 * WHY EVERY URL ARRIVES BY MESSAGE
 *
 * A dedicated Worker spawned from an extension page does not reliably get the
 * `chrome` namespace, so `chrome.runtime.getURL` is not available here. The
 * host looks the URLs up and sends them. That is a constraint, not a
 * preference, and it is why `inference-session.ts` takes them as arguments.
 *
 * WHY NOTHING IS LOGGED HERE
 *
 * Nobody can read it. A worker's console is not the offscreen document's and
 * not the background's, and this project has twice printed a diagnostic into a
 * context nobody opens. Failures come back as messages and the host does the
 * talking.
 */

import {
  closeSession,
  openSession,
  runSession,
  type SessionFacts,
  type SessionRequest,
} from './inference-session';

/** Host to worker. */
export type InferenceWorkerRequest =
  | { id: number; type: 'open'; request: SessionRequest }
  | { id: number; type: 'run'; input: Float32Array; dims: readonly number[] }
  | { id: number; type: 'close' };

/** Worker to host. Every reply carries the id it answers. */
export type InferenceWorkerReply =
  | { id: number; ok: true; type: 'open'; facts: SessionFacts }
  | {
      id: number;
      ok: true;
      type: 'run';
      scores: Float32Array;
      scoreDims: readonly number[];
      boxes: Float32Array;
      boxDims: readonly number[];
      inferenceMs: number;
    }
  | { id: number; ok: true; type: 'close' }
  | { id: number; ok: false; message: string };

function fail(id: number, error: unknown): InferenceWorkerReply {
  return {
    id,
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * The slice of the worker global this file actually uses.
 *
 * Declared locally rather than by adding TypeScript's `WebWorker` lib to
 * tsconfig. That lib redeclares a long list of globals the `DOM` lib already
 * declares — `self`, `postMessage`, `location` among them — and having both in
 * one project produces conflicting-declaration errors across every file, not
 * just this one. Two lines here beat a project-wide compiler problem, and they
 * document exactly what this entry point depends on.
 */
interface InferenceWorkerScope {
  onmessage: ((event: MessageEvent<InferenceWorkerRequest>) => void) | null;
  postMessage(message: InferenceWorkerReply, transfer?: Transferable[]): void;
}

const scope = self as unknown as InferenceWorkerScope;

scope.onmessage = (event: MessageEvent<InferenceWorkerRequest>) => {
  void handle(event.data);
};

async function handle(message: InferenceWorkerRequest): Promise<void> {

  try {
    if (message.type === 'open') {
      const facts = await openSession(message.request);
      const reply: InferenceWorkerReply = { id: message.id, ok: true, type: 'open', facts };
      scope.postMessage(reply);
      return;
    }

    if (message.type === 'run') {
      const result = await runSession(message.input, message.dims);
      const reply: InferenceWorkerReply = {
        id: message.id,
        ok: true,
        type: 'run',
        scores: result.scores.data,
        scoreDims: result.scores.dims,
        boxes: result.boxes.data,
        boxDims: result.boxes.dims,
        inferenceMs: result.inferenceMs,
      };
      // The two output buffers are transferred rather than copied. They are
      // roughly 4420x2 and 4420x4 floats, so the copy is not large — but they
      // are ours and dead the moment they are sent, and transferring says so.
      scope.postMessage(reply, [result.scores.data.buffer, result.boxes.data.buffer]);
      return;
    }

    await closeSession();
    const reply: InferenceWorkerReply = { id: message.id, ok: true, type: 'close' };
    scope.postMessage(reply);
  } catch (error) {
    scope.postMessage(fail(message.id, error));
  }
}
