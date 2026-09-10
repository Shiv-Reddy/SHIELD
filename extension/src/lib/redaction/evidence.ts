/**
 * The record of what was actually transmitted.
 *
 * DEMO_SCRIPT.md step 5 calls this the standout differentiator, and the reason
 * is that it is the only claim in the project a sceptic can check for
 * themselves. Every other guarantee — the type seal, the stage guard, the
 * content verification — is an assurance about code they have not read. This is
 * the bytes.
 *
 * Stored rather than held in memory because the service worker is evicted when
 * idle, and the popup is frequently opened after that has happened. Storing it
 * is safe by construction: it is the payload that passed the seal's
 * verification, so it contains placeholders rather than values.
 */

import type { SanitizedAnalyzePayload } from '../types';

const STORAGE_KEY = 'lastTransmission';

export interface Transmission {
  /** When it was sent. */
  at: number;
  /** The endpoint it went to, so "where did this go" is answerable. */
  endpoint: string;
  /** Size of the redacted frame in bytes, since the frame itself is omitted. */
  frameBytes: number;
  /**
   * The payload as sent, with the frame's base64 replaced by a placeholder.
   *
   * The frame is omitted HERE for length alone — it is redacted and safe, but
   * it is hundreds of kilobytes of base64 that would bury the part worth
   * reading. It is kept beside this, in `frame`.
   */
  json: string;
  /**
   * The redacted frame itself, as it was sent.
   *
   * The strongest claim this project can make, and until now the one nobody
   * could see on a real page: the placeholders were readable and the picture
   * they travelled with was not. The scan record proves a scan; this proves a
   * run.
   *
   * Safe by construction, for the same reason `json` is — it is the frame that
   * passed the seal's verification, so what is under those black rectangles
   * never left the machine either.
   *
   * Absent when storage refused it. That is a missing picture, never a missing
   * record: see `recordTransmission`.
   */
  frame?: string;
}

export async function recordTransmission(
  payload: SanitizedAnalyzePayload,
  endpoint: string,
): Promise<void> {
  try {
    const frameBytes = payload.redacted_frame.length;
    const readable = {
      ...payload,
      redacted_frame: `<redacted image, ${(frameBytes / 1024).toFixed(0)}KB, omitted here for length>`,
    };

    const transmission: Transmission = {
      at: Date.now(),
      endpoint,
      frameBytes,
      json: JSON.stringify(readable, null, 2),
      frame: payload.redacted_frame,
    };

    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: transmission });
    } catch (quota) {
      // The JSON is the evidence; the picture is the demonstration. They must
      // not fail together, and if only one can be kept it is not the picture.
      // A few hundred kilobytes is bounded — one entry, overwritten every run —
      // but a quota is somebody else's setting, not ours to assume.
      console.warn('[shield] the frame would not fit; keeping the payload alone', quota);
      const { frame: _dropped, ...withoutFrame } = transmission;
      await chrome.storage.local.set({ [STORAGE_KEY]: withoutFrame });
    }
  } catch (error) {
    // Recording is evidence, not protection. Failing to store it must never
    // interfere with the run it is describing.
    console.warn('[shield] could not record the transmission', error);
  }
}

export async function readLastTransmission(): Promise<Transmission | null> {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY]);
    const value = stored[STORAGE_KEY];
    if (typeof value !== 'object' || value === null) return null;
    return value as Transmission;
  } catch (error) {
    console.warn('[shield] could not read the last transmission', error);
    return null;
  }
}
