/**
 * Where the background asks for vision work, and how it gets there.
 *
 * Two browsers answer this differently, and the difference is one branch:
 *
 *   Chrome   An MV3 service worker cannot host WebAssembly or WebGPU, so the
 *            work happens in an offscreen document and these helpers are
 *            `chrome.runtime.sendMessage` calls across a context boundary.
 *   Firefox  There are no offscreen documents, and none are needed: the event
 *            page is a real DOM document. The same dispatcher is called
 *            IN-PROCESS, with inference on a dedicated Worker so the thread
 *            handling messages is never the thread doing the grinding
 *            (DECISIONS.md 207, 216).
 *
 * WHY THE DISPATCHER IS IMPORTED DYNAMICALLY
 *
 * `../offscreen/dispatch` pulls in ONNX Runtime. On Chrome that must never
 * reach the service worker bundle — the service worker is precisely the
 * context that cannot run it, and a static import would put ~96KB of engine
 * plus its WASM glue into the one bundle with no use for it. The import sits
 * behind `HAS_OFFSCREEN`, so Chrome never evaluates it and Firefox pays for it
 * exactly once.
 *
 * WHY THE HELPERS LIVE HERE AND NOT IN `lib/messages.ts`
 *
 * They used to. `lib/messages.ts` is imported by the popup and the content
 * script as well, and a routing branch there would drag this file — and
 * through it the engine — into both. Every one of these helpers had exactly
 * one caller, the service worker, so they move to the background where the
 * branch belongs. The message *types* stay in `lib/messages.ts`, which is what
 * the other bundles actually need.
 */

import {
  MSG,
  type AnalyseFrameMessage,
  type AnalyseFrameResult,
  type OffscreenMessage,
  type ReadImagesMessage,
  type ReadImagesReply,
  type ReadScreenMessage,
  type ReadScreenReply,
  type RedactFrameMessage,
  type RedactFrameReply,
  type SelfTestRunResult,
} from '../lib/messages';
import { HAS_OFFSCREEN, ensureOffscreenDocument } from './offscreen';

/**
 * How long the Firefox host keeps a session it is not using.
 *
 * Chrome's document closes *itself*, taking the WASM module and GPU buffers
 * with it. Firefox's event page cannot close itself — it is the extension — so
 * it drops the session instead, which releases the same 25MB module and the
 * same GPU buffers and leaves the page running.
 *
 * Without disposal at all, Firefox pinned all of it for the life of the browser
 * session: the defect DECISIONS.md 206 recorded and 216 required fixing in the
 * same change as the host, because a host's lifecycle moves with the host.
 *
 * TEN MINUTES HERE, TWO ON CHROME, AND THE ASYMMETRY IS MEASURED
 *
 * This matched Chrome's 120s until 2026-09-22, when the numbers 222 asked for
 * finally existed. Both of its inputs turned out to be wrong.
 *
 * The rebuild is not ~10s, it is **~16.5-17s** across three separate sessions,
 * almost all of it WebGPU shader warm-up. And the session is not expensive to
 * keep: on Firefox the extension process returns to its pre-run baseline within
 * about a minute of the work finishing, with or without this timer (RESOURCES.md,
 * readings 4 and 6 at 61MB and 60MB against 65MB idle).
 *
 * 222 set the test itself — "a 10s rebuild is only worth avoiding if the
 * resident session turns out cheap" — so this follows that criterion rather
 * than overriding it. Disposing early on Firefox buys back no measurable memory
 * and charges 17 seconds for it, which on a demo is the difference between a
 * pause and a failure.
 *
 * Still finite, and deliberately so. A browser left open overnight should not
 * hold a model it stopped needing hours ago, and ten minutes is long enough to
 * cover a rehearsal or a working session without reaching that.
 */
const IDLE_DISPOSE_MS = 600_000;

interface LocalHost {
  dispatch: (message: OffscreenMessage) => Promise<unknown>;
  dispose: () => Promise<void>;
}

let loading: Promise<LocalHost> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

async function localHost(): Promise<LocalHost> {
  // Shared rather than re-imported: two runs starting together would otherwise
  // both load the engine, and the second would build a second session.
  loading ??= import('../offscreen/dispatch').then(({ dispatchVisionMessage }) => ({
    // 'worker' is declared, not detected. On Firefox this code runs in the
    // event page, and inference on the event page's own thread is exactly what
    // hung the browser in DECISIONS.md 207 — so there is nothing else it could
    // legitimately be. DECISIONS.md 217 is why it is stated rather than probed.
    dispatch: (message: OffscreenMessage) => dispatchVisionMessage(message, 'worker'),
    dispose: async () => {
      const { disposeFaceDetector } = await import('../offscreen/face-detector');
      await disposeFaceDetector();
    },
  }));
  return loading;
}

function resetIdleTimer(): void {
  if (idleTimer !== undefined) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void (async () => {
      if (!loading) return;
      const host = await loading;
      // The module stays imported; the session does not. Re-importing costs
      // nothing after the first time, and rebuilding the session is the ~1s
      // this timer exists to avoid paying between steps of one task.
      loading = null;
      await host.dispose();
      console.info('[shield] vision host idle, session released');
    })().catch((error: unknown) => {
      console.warn('[shield] releasing the idle vision host failed', error);
    });
  }, IDLE_DISPOSE_MS);
}

/**
 * Ask the vision host to answer one message.
 *
 * Failures are NOT swallowed here, on either branch. The vision host decides
 * whether a frame contains anything sensitive, and treating a dead one as "no
 * result" would let the pipeline continue as though the answer were "nothing".
 * Fail loudly, per ARCHITECTURE.md Section 9.
 */
async function callVisionHost<TResult>(message: OffscreenMessage): Promise<TResult> {
  if (HAS_OFFSCREEN) {
    return (await chrome.runtime.sendMessage(message)) as TResult;
  }
  const host = await localHost();
  resetIdleTimer();
  return (await host.dispatch(message)) as TResult;
}

/**
 * Ensure the vision host is running.
 *
 * On Chrome that means creating the offscreen document. On Firefox the host is
 * this very page, so there is nothing to create — and saying so here rather
 * than at four call sites is what keeps the service worker free of browser
 * branches.
 */
export async function ensureVisionHost(): Promise<void> {
  if (!HAS_OFFSCREEN) return;
  await ensureOffscreenDocument();
}

/** Send a frame to the vision host and await its detections. */
export async function sendToOffscreen(
  message: AnalyseFrameMessage,
): Promise<AnalyseFrameResult> {
  return callVisionHost<AnalyseFrameResult>(message);
}

/**
 * Ask the host to load the model, without waiting for it.
 *
 * Deliberately fire-and-forget: this is an optimisation, and a failure here must
 * never break a run. If warming fails the model simply loads lazily on the first
 * real frame, exactly as it did before.
 */
export function warmOffscreen(
  forceBackend: 'webgpu' | 'wasm' | null,
  forceInferenceHost: 'document' | 'worker' | null = null,
): void {
  void callVisionHost({ type: MSG.WARM_UP, forceBackend, forceInferenceHost }).catch(
    () => undefined,
  );
}

/** Ask the host to rebuild its session on the given backend. */
export async function reloadOffscreenModel(
  forceBackend: 'webgpu' | 'wasm' | null,
  forceInferenceHost: 'document' | 'worker' | null = null,
): Promise<void> {
  await callVisionHost({ type: MSG.RELOAD_MODEL, forceBackend, forceInferenceHost });
}

/**
 * Ask the host to paint the sensitive regions out of a frame.
 *
 * Failures are not swallowed. Treating a failed redaction as "no regions to
 * hide" would ship the raw frame, so this must throw and stop the run
 * (ARCHITECTURE.md Section 9, fail closed).
 */
export async function redactOffscreenFrame(
  message: Omit<RedactFrameMessage, 'type'>,
): Promise<RedactFrameReply> {
  return callVisionHost<RedactFrameReply>({ type: MSG.REDACT_FRAME, ...message });
}

/**
 * Ask the host to read the given image crops.
 *
 * Failures are NOT swallowed. A thrown message would otherwise surface as "no
 * text found", and the caller treats that as a clean image — transmitting a
 * document nothing ever read.
 */
export async function readOffscreenImages(
  message: Omit<ReadImagesMessage, 'type'>,
): Promise<ReadImagesReply> {
  return callVisionHost<ReadImagesReply>({ type: MSG.READ_IMAGES, ...message });
}

/**
 * Ask the host to read the whole screen.
 *
 * Failures are not swallowed, for the same reason `readOffscreenImages` does
 * not swallow them: an empty reading and a failed one look identical to a
 * caller, and only one of them means the screen is clean.
 */
export async function readOffscreenScreen(
  message: Omit<ReadScreenMessage, 'type'>,
): Promise<ReadScreenReply> {
  return callVisionHost<ReadScreenReply>({ type: MSG.READ_SCREEN, ...message });
}

/** Ask the host to prove the CPU fallback and report back. */
export async function runOffscreenSelfTest(): Promise<SelfTestRunResult> {
  return callVisionHost<SelfTestRunResult>({ type: MSG.RUN_SELF_TEST });
}
