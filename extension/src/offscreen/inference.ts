/**
 * Where inference runs, and who decides.
 *
 * Two hosts behind one interface:
 *
 *   document  ORT in the offscreen document itself. What Chrome has always
 *             done, unchanged, and still the default there.
 *   worker    ORT in a dedicated Worker. Required on Firefox, where the
 *             document path starves the event page (DECISIONS.md 207).
 *
 * WHY BOTH PATHS SHIP IN BOTH BUNDLES
 *
 * The same argument DECISIONS.md 205 made and 216 repeats: the branch is taken
 * at RUN time, not build time, so Chrome's behaviour is *provably* untouched
 * rather than argued to be. A Chrome build still contains the document path and
 * still takes it by default; flipping to the worker is one storage key, which
 * is what makes the measurement DECISIONS.md 216 gates on possible at all.
 *
 * WHY THE DEFAULT IS STILL `document` ON CHROME
 *
 * Because it is not yet known whether ORT selects WebGPU inside a worker.
 * Chrome picks WebGPU today on integrated Intel graphics at 31.7ms inference
 * (docs/RESOURCES.md). If the worker silently drops to WASM that is a latency
 * regression on the demo browser, and 216 says the shape is abandoned rather
 * than accepted if so. Until somebody runs the before-and-after, defaulting
 * Chrome to the worker would be exactly the "reasoned an architecture through
 * without running it" mistake 207 is the standing lesson about.
 */

import { defaultHostFor, type ExecutionBackend, type InferenceHost } from '../lib/settings';
import {
  closeSession,
  openSession,
  runSession,
  type RunResult,
  type SessionFacts,
  type SessionRequest,
} from './inference-session';
import type { InferenceWorkerReply, InferenceWorkerRequest } from './inference-worker';

export interface InferenceEngine {
  readonly host: InferenceHost;
  open(request: SessionRequest): Promise<SessionFacts>;
  run(input: Float32Array, dims: readonly number[]): Promise<RunResult>;
  close(): Promise<void>;
}

// --- The document host: what Chrome has always done --------------------------

class DocumentEngine implements InferenceEngine {
  readonly host = 'document' as const;

  open(request: SessionRequest): Promise<SessionFacts> {
    return openSession(request);
  }

  run(input: Float32Array, dims: readonly number[]): Promise<RunResult> {
    return runSession(input, dims);
  }

  close(): Promise<void> {
    return closeSession();
  }
}

// --- The worker host ---------------------------------------------------------

/**
 * One outstanding request, waiting on its reply.
 *
 * Replies are matched by id rather than assumed to arrive in order. They do
 * arrive in order today, because the worker handles one message at a time — but
 * "today, because of how the other side happens to be written" is not a thing
 * to build a hot path on.
 */
interface Pending {
  resolve: (reply: InferenceWorkerReply) => void;
  reject: (error: Error) => void;
}

class WorkerEngine implements InferenceEngine {
  readonly host = 'worker' as const;

  private worker: Worker | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(private readonly workerUrl: string) {}

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;

    const worker = new Worker(this.workerUrl, { type: 'module' });

    worker.onmessage = (event: MessageEvent<InferenceWorkerReply>) => {
      const reply = event.data;
      const waiting = this.pending.get(reply.id);
      if (!waiting) return;
      this.pending.delete(reply.id);
      waiting.resolve(reply);
    };

    // A worker that dies takes every outstanding request with it. Rejecting
    // them is the difference between a run that fails and a run that hangs
    // forever — and a hang is what this whole change exists to remove.
    worker.onerror = (event: ErrorEvent) => {
      const message = event.message || 'the inference worker failed';
      for (const [, waiting] of this.pending) waiting.reject(new Error(message));
      this.pending.clear();
      this.worker = null;
      worker.terminate();
    };

    this.worker = worker;
    return worker;
  }

  private send(
    message: InferenceWorkerRequest,
    transfer: Transferable[] = [],
  ): Promise<InferenceWorkerReply> {
    const worker = this.ensureWorker();
    return new Promise<InferenceWorkerReply>((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject });
      worker.postMessage(message, transfer);
    });
  }

  async open(request: SessionRequest): Promise<SessionFacts> {
    const reply = await this.send({ id: this.nextId++, type: 'open', request });
    if (!reply.ok) throw new Error(reply.message);
    if (reply.type !== 'open') throw new Error('worker answered the wrong request');
    return reply.facts;
  }

  async run(input: Float32Array, dims: readonly number[]): Promise<RunResult> {
    // The input buffer is transferred, so this context loses it. That is
    // correct and worth stating: it holds one frame's worth of normalised
    // pixels, and the caller builds a fresh one per frame.
    const reply = await this.send(
      { id: this.nextId++, type: 'run', input, dims },
      [input.buffer],
    );
    if (!reply.ok) throw new Error(reply.message);
    if (reply.type !== 'run') throw new Error('worker answered the wrong request');
    return {
      scores: { data: reply.scores, dims: reply.scoreDims },
      boxes: { data: reply.boxes, dims: reply.boxDims },
      inferenceMs: reply.inferenceMs,
    };
  }

  async close(): Promise<void> {
    if (!this.worker) return;
    try {
      await this.send({ id: this.nextId++, type: 'close' });
    } catch {
      // The worker is going away regardless. A failure to release cleanly is
      // not a reason to keep it alive.
    }
    for (const [, waiting] of this.pending) {
      waiting.reject(new Error('the inference worker was closed'));
    }
    this.pending.clear();
    this.worker.terminate();
    this.worker = null;
  }
}

export function createEngine(host: InferenceHost, workerUrl: string): InferenceEngine {
  return host === 'worker' ? new WorkerEngine(workerUrl) : new DocumentEngine();
}

export { defaultHostFor };
export type { RunResult, SessionFacts, SessionRequest };
export type { ExecutionBackend, InferenceHost };
