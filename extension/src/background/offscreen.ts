/**
 * Offscreen document lifecycle, managed from the service worker.
 *
 * Chrome allows exactly one offscreen document per extension, and creating a
 * second throws. Since the service worker is evicted and restarted freely under
 * MV3, it cannot assume it knows whether a document it created earlier is still
 * alive — so the state is queried rather than remembered.
 */

const OFFSCREEN_PATH = 'offscreen/offscreen.html';

/**
 * Whether this browser has an offscreen API at all.
 *
 * Chrome-only. Firefox MV3 runs an event page, which is a real DOM document and
 * therefore needs no offscreen document - but it does still need somewhere to
 * run inference that is not the thread handling messages. Holding the host in
 * an iframe was tried and reverted: DECISIONS.md 207.
 */
export const HAS_OFFSCREEN = typeof chrome !== 'undefined' && chrome.offscreen !== undefined;

/**
 * Concurrency latch.
 *
 * Two runs starting close together would both see "no document" and both call
 * `createDocument`, and the loser gets an exception. Sharing the in-flight
 * promise makes the second caller wait for the first rather than race it.
 */
let creating: Promise<void> | null = null;

async function documentExists(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  return contexts.length > 0;
}

/**
 * Ensure the inference host is running.
 *
 * `WORKERS` is the closest justification Chrome offers for what we actually
 * need, which is a DOM context capable of WebAssembly and WebGPU — ONNX Runtime
 * Web cannot run in a service worker at all (microsoft/onnxruntime#20876).
 */
export async function ensureOffscreenDocument(): Promise<void> {
  // A guard against a programming error, not a browser message any more.
  // `ensureVisionHost` is the entry point everything uses and it never reaches
  // here without an offscreen API; Firefox hosts the vision path on its own
  // event page instead (background/vision-host.ts).
  if (!HAS_OFFSCREEN) {
    throw new Error('ensureOffscreenDocument called on a browser with no offscreen API');
  }

  if (await documentExists()) return;
  if (creating) return creating;

  creating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification:
        'Runs the local vision model on captured frames. Manifest V3 service ' +
        'workers cannot host WebAssembly or WebGPU inference.',
    })
    .finally(() => {
      creating = null;
    });

  return creating;
}

/**
 * Tear the inference host down.
 *
 * Worth doing rather than leaving it resident: the document holds a compiled
 * 26MB WASM module and, on the WebGPU path, GPU buffers. Client-side resource
 * utilisation is 20% of the evaluation score, and an idle extension pinning
 * that much memory is exactly what that metric penalises.
 *
 * The cost is that the next run pays session startup again, so this is called
 * when a run ends rather than between steps of one task.
 */
/**
 * Tear the host down.
 *
 * Has no callers. Disposal is the host's own idle timer, chosen because an MV3
 * service worker is evicted when idle and cannot be relied on to run one. Kept
 * because it is the correct way to do it the moment anything knows when a run
 * is truly over.
 */
export async function closeOffscreenDocument(): Promise<void> {
  if (!HAS_OFFSCREEN) return;
  if (!(await documentExists())) return;
  await chrome.offscreen.closeDocument();
}
