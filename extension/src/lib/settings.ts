/**
 * Local settings, stored in `chrome.storage.local`.
 *
 * Nothing captured from a page is ever stored here — only preferences and
 * diagnostic overrides. See the `storage` permission note in README.md.
 */

export type ExecutionBackend = 'webgpu' | 'wasm';

/**
 * Where inference runs.
 *
 * `document` is ORT in the offscreen document, which is what Chrome has always
 * done. `worker` is ORT in a dedicated Worker, which Firefox requires because
 * the document path starves its event page (DECISIONS.md 207).
 */
export type InferenceHost = 'document' | 'worker';

/**
 * Which host a browser needs, absent an override.
 *
 * Decided on whether the offscreen API exists, which is the same runtime test
 * DECISIONS.md 205 chose and for the same reason: it asks about the capability
 * that actually differs rather than sniffing a user-agent string. Chrome has
 * offscreen documents; Firefox does not, and runs an event page instead.
 *
 * Lives here rather than beside the engines so it can be tested. The engine
 * module imports ONNX Runtime, which does not load under Node — and a rule
 * this load-bearing should not be the one part of the change nobody can check.
 */
export function defaultHostFor(hasOffscreenApi: boolean): InferenceHost {
  return hasOffscreenApi ? 'document' : 'worker';
}

/**
 * Where the backend lives.
 *
 * Local by default. A hackathon build that silently points at somebody's hosted
 * endpoint is a build that can leak by accident, and the whole claim here is
 * about knowing exactly where data goes.
 */
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:8787/analyze';

export interface ShieldSettings {
  /** Backend URL for /analyze. */
  endpoint: string;
  /**
   * Force a specific inference backend instead of preferring WebGPU.
   *
   * Exists because the fallback path is otherwise untestable on hardware where
   * WebGPU works. PRD.md FR-27 requires Shield to keep working on machines
   * without WebGPU, and TESTING.md Section 5 requires testing across several
   * laptops — but "it will probably work" is not evidence, and waiting to find
   * a machine without WebGPU is a poor way to discover the path is broken.
   *
   * Set from any extension console:
   *   chrome.storage.local.set({ forceBackend: 'wasm' })   // force CPU
   *   chrome.storage.local.remove('forceBackend')          // back to automatic
   */
  forceBackend: ExecutionBackend | null;
  /**
   * Force an inference host instead of choosing one per browser.
   *
   * Exists for the same reason `forceBackend` does, and for a sharper one.
   * DECISIONS.md 216 makes the worker Chrome's default only once somebody has
   * measured whether ORT still selects WebGPU inside a worker — Chrome picks
   * WebGPU today at 31.7ms inference, and a silent drop to WASM would be a
   * latency regression on the demo browser. That measurement needs both hosts
   * reachable on ONE browser, which is this key.
   *
   * Set from any extension console:
   *   chrome.storage.local.set({ forceInferenceHost: 'worker' })
   *   chrome.storage.local.remove('forceInferenceHost')   // back to automatic
   */
  forceInferenceHost: InferenceHost | null;
  /**
   * Run the whole pipeline but never touch the page.
   *
   * Everything happens — capture, detection, redaction, the seal, the request,
   * the reply — and the action that comes back is reported instead of
   * performed.
   *
   * This exists because Shield is an autonomous clicker with a five-step
   * budget, and the moment it is pointed at a real website that stops being an
   * abstract property. On a live login form that the browser has autofilled it
   * would click "Sign in"; on a part-filled sign-up it would tick the consent
   * box and submit. Both are real actions on somebody else's service, and
   * neither is undoable.
   *
   * A protocol — only logged-out pages, check every field is empty first —
   * gives the same guarantee on paper. It puts the safety on remembering,
   * every run, across every site, which is not where safety belongs.
   *
   * Off by default: the demo tasks act, and a mode that silently stopped Shield
   * from doing its job would be the worse failure. It is turned on
   * deliberately, for the runs where observing IS the job.
   */
  observeOnly: boolean;
}

const DEFAULTS: ShieldSettings = {
  endpoint: DEFAULT_ENDPOINT,
  forceBackend: null,
  forceInferenceHost: null,
  observeOnly: false,
};

/**
 * Pin the inference backend, or clear the override with `null`.
 *
 * Changing this only takes effect on a fresh session — the loaded model is
 * cached — so callers must also have the inference host restarted.
 */
export async function setForceBackend(backend: ExecutionBackend | null): Promise<void> {
  if (backend === null) {
    await chrome.storage.local.remove('forceBackend');
  } else {
    await chrome.storage.local.set({ forceBackend: backend });
  }
}

/** Turn observe-only mode on or off. */
export async function setObserveOnly(observeOnly: boolean): Promise<void> {
  await chrome.storage.local.set({ observeOnly });
}

export async function readSettings(): Promise<ShieldSettings> {
  try {
    // Keys are requested by name rather than by passing the defaults object:
    // chrome.storage's typings expect an index-signature shape, which a precise
    // settings interface deliberately is not.
    const stored = await chrome.storage.local.get([
      'forceBackend',
      'forceInferenceHost',
      'endpoint',
      'observeOnly',
    ]);
    const forceBackend =
      stored['forceBackend'] === 'webgpu' || stored['forceBackend'] === 'wasm'
        ? stored['forceBackend']
        : null;
    // Anything unrecognised means automatic. A typo must not pin the host to
    // something that does not exist and then look like a broken pipeline.
    const forceInferenceHost =
      stored['forceInferenceHost'] === 'document' || stored['forceInferenceHost'] === 'worker'
        ? stored['forceInferenceHost']
        : null;
    const endpoint =
      typeof stored['endpoint'] === 'string' && stored['endpoint'].length > 0
        ? stored['endpoint']
        : DEFAULT_ENDPOINT;
    // Anything other than an explicit `true` means act. A corrupted or
    // half-written value must not be able to silently disable Shield, which
    // would look exactly like the pipeline being broken.
    const observeOnly = stored['observeOnly'] === true;

    return { endpoint, forceBackend, forceInferenceHost, observeOnly };
  } catch (error) {
    // A settings read must never be able to break inference — but silently
    // returning defaults is how a backend override appears to do nothing.
    console.warn('[shield] could not read settings; using defaults', error);
    return { ...DEFAULTS };
  }
}
