/**
 * Local settings, stored in `chrome.storage.local`.
 *
 * Nothing captured from a page is ever stored here — only preferences and
 * diagnostic overrides. See the `storage` permission note in README.md.
 */

export type ExecutionBackend = 'webgpu' | 'wasm';

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
}

const DEFAULTS: ShieldSettings = {
  endpoint: DEFAULT_ENDPOINT,
  forceBackend: null,
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

export async function readSettings(): Promise<ShieldSettings> {
  try {
    // Keys are requested by name rather than by passing the defaults object:
    // chrome.storage's typings expect an index-signature shape, which a precise
    // settings interface deliberately is not.
    const stored = await chrome.storage.local.get(['forceBackend', 'endpoint']);
    const forceBackend =
      stored['forceBackend'] === 'webgpu' || stored['forceBackend'] === 'wasm'
        ? stored['forceBackend']
        : null;
    const endpoint =
      typeof stored['endpoint'] === 'string' && stored['endpoint'].length > 0
        ? stored['endpoint']
        : DEFAULT_ENDPOINT;
    return { endpoint, forceBackend };
  } catch (error) {
    // A settings read must never be able to break inference — but silently
    // returning defaults is how a backend override appears to do nothing.
    console.warn('[shield] could not read settings; using defaults', error);
    return { ...DEFAULTS };
  }
}
