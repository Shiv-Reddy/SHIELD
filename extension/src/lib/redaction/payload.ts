/**
 * The transport boundary.
 *
 * This module is the only place a `Sanitized<AnalyzePayload>` comes into
 * existence, and the transport layer will accept nothing else. Together with
 * the stage-order guard in the service worker, that gives two independent
 * mechanisms enforcing one rule — the type system catches a call wired in the
 * wrong order at build time, the guard catches a stage that threw or returned
 * early at run time.
 *
 * A third check lives here, and it is the one that would actually catch a leak:
 * before sealing, every element the detector flagged is verified to carry a
 * placeholder token rather than content. The type seal proves redaction was
 * *called*; this proves it *worked*. Those are not the same claim, and only the
 * second one is what the project promises.
 */

import {
  sealAsRedacted,
  type AnalyzePayload,
  type RedactedDomEntry,
  type RedactionManifestEntry,
  type SanitizedAnalyzePayload,
  type SensitiveRegion,
} from '../types';
import { placeholderFor } from './placeholders';

/** Every token the placeholder system can emit. */
const KNOWN_TOKENS: ReadonlySet<string> = new Set(
  (
    [
      'password',
      'name',
      'email',
      'phone',
      'address',
      'id_number',
      'face',
      'other',
    ] as const
  ).map(placeholderFor),
);

export interface PayloadInput {
  requestId: string;
  taskQuery: string;
  /** Must be the frame returned by the Redaction Engine, never the capture. */
  redactedFrame: string;
  redactedDom: readonly RedactedDomEntry[];
  manifest: readonly RedactionManifestEntry[];
  /** What was flagged, used to verify the redaction actually took effect. */
  regions: readonly SensitiveRegion[];
  /**
   * Raw values of the flagged elements, used ONLY to verify their absence.
   *
   * Never written into the payload, never stored, never logged. They are passed
   * in so the check below can search for them, which is the automated form of
   * the Zero-Leak Verification in TESTING.md Section 6 — a procedure that is
   * otherwise a manual eyeball of a JSON blob, and therefore the first thing
   * skipped when someone is in a hurry before a demo.
   */
  flaggedRawValues: readonly string[];
}

/**
 * Values too short to search for without tripping over ordinary text.
 *
 * A three-character value would match inside unrelated words constantly. The
 * consequence of the floor is that a very short secret is not covered by this
 * particular check — the per-element check above still covers it.
 */
const MIN_SEARCHABLE_LENGTH = 4;

/**
 * Sentinel written by the DOM reader in place of a password it never read.
 *
 * Searching for it would be searching for a string the payload legitimately
 * cannot contain, and finding it would prove nothing.
 */
const PASSWORD_SENTINEL = '[has value]';

/**
 * Verify that every flagged element carries a placeholder, not content.
 *
 * Throws rather than returning a result. There is no sensible way to continue
 * from here: if a sensitive value is still present, the only safe action is to
 * stop, and a caller that could choose to ignore the finding would eventually
 * be written to do so.
 */
function assertNoSensitiveValuesRemain(
  entries: readonly RedactedDomEntry[],
  regions: readonly SensitiveRegion[],
): void {
  const flagged = new Map<string, string>();
  for (const region of regions) {
    if (region.elementId === null) continue;
    if (!flagged.has(region.elementId)) {
      flagged.set(region.elementId, region.category);
    }
  }

  for (const entry of entries) {
    if (!flagged.has(entry.elementId)) continue;

    const value = entry.value;
    if (value !== null && !KNOWN_TOKENS.has(value)) {
      // The offending value is deliberately not included in the message. This
      // string reaches a console and possibly an error report, and quoting the
      // very content that failed to be redacted would turn the safety check
      // into the leak.
      throw new Error(
        `Redaction verification failed: element ${entry.elementId} was flagged as ` +
          `${flagged.get(entry.elementId)} but its value is not a placeholder. ` +
          'Refusing to transmit.',
      );
    }
  }
}

/**
 * Search the whole payload for any value that was supposed to be hidden.
 *
 * Stronger than the per-element check, and catches what it cannot: a password
 * that also appears in a label, an email repeated in some other element's text,
 * a value echoed into the manifest. Redaction is per-element, so anything that
 * copied a sensitive string somewhere else in the structure slips past a check
 * that only looks where it expects the value to be.
 *
 * The frame is excluded because it is binary encoded as base64 — a plaintext
 * value cannot appear in it, and searching hundreds of kilobytes for something
 * that cannot be there is cost without cover.
 */
function assertNothingSensitiveAnywhere(
  payload: AnalyzePayload,
  rawValues: readonly string[],
): void {
  const searchable = JSON.stringify({ ...payload, redacted_frame: '' });

  for (const value of rawValues) {
    if (value.length < MIN_SEARCHABLE_LENGTH) continue;
    if (value === PASSWORD_SENTINEL) continue;

    if (searchable.includes(value)) {
      // The value is deliberately absent from the message, for the same reason
      // as above: this string reaches a console, and naming the leaked value
      // while reporting the leak would complete it.
      throw new Error(
        'Zero-leak check failed: a value that was flagged as sensitive still ' +
          'appears somewhere in the payload. Refusing to transmit.',
      );
    }
  }
}

/**
 * Build the payload that may be transmitted.
 *
 * The `Sanitized` seal minted here is an assertion, so everything it asserts is
 * checked immediately above it rather than assumed by whoever calls this.
 */
export function buildSanitizedPayload(input: PayloadInput): SanitizedAnalyzePayload {
  assertNoSensitiveValuesRemain(input.redactedDom, input.regions);

  const payload: AnalyzePayload = {
    request_id: input.requestId,
    task_query: input.taskQuery,
    redacted_frame: input.redactedFrame,
    redacted_dom_summary: [...input.redactedDom],
    redaction_manifest: [...input.manifest],
  };

  assertNothingSensitiveAnywhere(payload, input.flaggedRawValues);

  return sealAsRedacted(payload);
}
