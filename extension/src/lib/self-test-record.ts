/**
 * The stored record of the CPU fallback self-test.
 *
 * Split out from the test itself so the service worker can read the verdict
 * without importing `onnxruntime-web`, which would pull a 25MB runtime into a
 * bundle that has no business running inference.
 */

export const SELF_TEST_KEY = 'cpuFallbackSelfTest';

export interface SelfTestResult {
  ok: boolean;
  /** Inference time on CPU, milliseconds. Zero when the test failed. */
  inferenceMs: number;
  /** Session build time on CPU, milliseconds. */
  initMs: number;
  message: string;
  at: number;
}

function isSelfTestResult(value: unknown): value is SelfTestResult {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['ok'] === 'boolean' && typeof record['message'] === 'string';
}

/** Read the stored verdict, or null if the test has never completed here. */
export async function readSelfTestRecord(): Promise<SelfTestResult | null> {
  try {
    const stored = await chrome.storage.local.get([SELF_TEST_KEY]);
    const value = stored[SELF_TEST_KEY];
    return isSelfTestResult(value) ? value : null;
  } catch (error) {
    // Never swallowed. A storage failure here is indistinguishable from "the
    // test has not run yet", and quietly conflating the two is what let a
    // passing self-test look like a missing one for two whole builds.
    console.warn('[shield] could not read the self-test record', error);
    return null;
  }
}

/**
 * Store a verdict.
 *
 * Only passes are ever written. A cached failure would be indistinguishable
 * from a cached pass at the call site that decides whether to run again, and
 * "we tried once, it broke, we never looked again" is precisely the failure
 * mode this self-test exists to prevent.
 */
export async function writeSelfTestRecord(result: SelfTestResult): Promise<void> {
  if (!result.ok) return;
  try {
    await chrome.storage.local.set({ [SELF_TEST_KEY]: result });

    // Read back rather than trusting the write. A `set` that resolves without
    // storing is exactly the failure that made this record look permanently
    // absent once already, and it cost two builds to find because nothing ever
    // checked. One extra read on a once-per-installation path is cheap
    // certainty.
    const stored = await chrome.storage.local.get([SELF_TEST_KEY]);
    if (stored[SELF_TEST_KEY] === undefined) {
      console.warn(
        '[shield] the self-test record did not persist; the test will run again next time',
      );
    }
  } catch (error) {
    // A diagnostic that cannot be stored is still a diagnostic that ran, so this
    // is not fatal — but it must say so, or the test silently repeats forever.
    console.warn('[shield] could not store the self-test record', error);
  }
}
