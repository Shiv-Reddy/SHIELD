/**
 * Local settings, stored in `chrome.storage.local`.
 *
 * Nothing captured from a page is ever stored here — only preferences and
 * diagnostic overrides. See the `storage` permission note in README.md.
 */

export type ExecutionBackend = 'webgpu' | 'wasm';

/**
 * How hard Shield looks — PRD.md FR-14.
 *
 * THE RANGE ONLY GOES UP, AND THAT IS THE DESIGN
 *
 * "Configurable aggressiveness" reads as a slider with a lax end, and Shield
 * deliberately does not have one. Two rules make a lax end impossible rather
 * than merely unwise: CLAUDE.md's constraint that when it is uncertain whether
 * something is sensitive it is hidden, and `dom-rules.ts`'s rule that
 * confidence never gates redaction. A level that let an identified password
 * through, or that stopped hiding a field nobody could classify, would violate
 * both. So `standard` IS the floor of this setting, and every other level adds
 * to it.
 *
 * What is left to configure is the part that was always a judgement call: the
 * GEOMETRIC threshold for which pictures are worth reading. That is a real
 * knob with a measured curve behind it (`benchmark/tradeoff.ts`), not a
 * confidence cutoff, and moving it cannot expose something a rule identified.
 *
 * The honest way to answer "can a user reduce redaction?" is no — and to be
 * able to point at why.
 */
export type RedactionLevel = 'standard' | 'thorough' | 'maximum';

/**
 * The image candidate size floor per level, in CSS pixels.
 *
 * Every one of these is a row from the sweep in docs/BENCHMARK.md rather than a
 * round number somebody liked, and the cost of each is known before it ships:
 *
 *   standard  140x80 - the shipped floor, measured to sit on the knee. Recall
 *             90% at precision 69.2%. Below it recall does not improve on the
 *             corpus and precision falls away.
 *   thorough  100x57 - 1.23x the crops, precision 56.3%. Buys nothing on THIS
 *             corpus and is offered because the corpus is 50 pages, not the
 *             world: a smaller document than any we have labelled is exactly
 *             what a level above the default is for.
 *   maximum   40x23 - 2.54x the crops, precision 27.3%. Everything
 *             document-shaped is read. For a page known to carry scanned
 *             documents, where covering furniture is an acceptable price.
 *
 * `standard` is the default because the measurement says so, and the two
 * levels above it are offered with their cost stated rather than as a vague
 * promise of being safer.
 */
export const REDACTION_FLOORS: Readonly<
  Record<RedactionLevel, { width: number; height: number }>
> = {
  standard: { width: 140, height: 80 },
  thorough: { width: 100, height: 57 },
  maximum: { width: 40, height: 23 },
};

/** Anything unrecognised is `standard`. A typo must never loosen redaction. */
export function redactionLevelFrom(value: unknown): RedactionLevel {
  return value === 'thorough' || value === 'maximum' ? value : 'standard';
}

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
  /**
   * How hard to look — FR-14. See `RedactionLevel`.
   *
   * Set from any extension console:
   *   chrome.storage.local.set({ redactionLevel: 'thorough' })
   *   chrome.storage.local.remove('redactionLevel')   // back to standard
   */
  redactionLevel: RedactionLevel;
}

const DEFAULTS: ShieldSettings = {
  endpoint: DEFAULT_ENDPOINT,
  forceBackend: null,
  forceInferenceHost: null,
  observeOnly: false,
  redactionLevel: 'standard',
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

/** Set how hard Shield looks. `standard` is the floor; nothing goes below it. */
export async function setRedactionLevel(level: RedactionLevel): Promise<void> {
  await chrome.storage.local.set({ redactionLevel: level });
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
      'redactionLevel',
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
    // Unrecognised means `standard`, which is the floor of the range. A
    // corrupted value can therefore only ever fail towards hiding more.
    const redactionLevel = redactionLevelFrom(stored['redactionLevel']);

    return { endpoint, forceBackend, forceInferenceHost, observeOnly, redactionLevel };
  } catch (error) {
    // A settings read must never be able to break inference — but silently
    // returning defaults is how a backend override appears to do nothing.
    console.warn('[shield] could not read settings; using defaults', error);
    return { ...DEFAULTS };
  }
}
