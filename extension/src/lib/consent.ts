/**
 * Approval before anything leaves the device.
 *
 * WHAT THIS ADDS THAT THE PAYLOAD INSPECTOR DOES NOT
 *
 * The inspector already shows the exact payload that was transmitted, recorded
 * before the request so it survives a network failure. It is the strongest
 * evidence Shield has — and it is evidence about something that has already
 * happened. A user who disagrees with what was sent finds out afterwards.
 *
 * This is the same information, one moment earlier, with a decision attached.
 *
 * FAIL CLOSED, ALWAYS
 *
 * Every way this can go wrong resolves to NOT sending: a timeout, a popup
 * closed mid-decision, a malformed reply, a decision arriving for a run that
 * has already moved on. That asymmetry is the whole design. A consent gate that
 * sends when it is confused is worse than no gate, because it produces the
 * appearance of a control that is not there — and a control that exists only
 * when nothing unusual happens is exactly the kind of guarantee
 * SECURITY_PRIVACY.md Section 4 says not to claim.
 *
 * WHY IT IS OFF BY DEFAULT, STATED RATHER THAN IMPLIED
 *
 * Shield's invariant is that raw sensitive data never leaves, and that is
 * enforced by a phantom type, a stage-order guard and a zero-leak content
 * sweep — three mechanisms that do not ask anybody's permission. Consent is
 * not what makes Shield safe and it would be dishonest to present it that way.
 * It is for the user who wants to see each payload before it goes, and for the
 * demonstration that such a thing is possible when the data has already been
 * made safe. Defaulting it on would also put a modal in front of every step of
 * a multi-step task, which teaches people to click through it — the failure
 * mode every consent dialog on the web already has.
 */

/**
 * What the user is shown before deciding.
 *
 * Counts and categories only. The full payload is one click away in the
 * inspector, which already exists and is already safe to render; duplicating it
 * here would mean two renderers of transmitted data, and the second one is
 * where a mistake would live.
 */
export interface ConsentSummary {
  /** Elements in the redacted DOM summary. */
  elements: number;
  /** Values replaced with a placeholder token. */
  placeholders: number;
  /** Redacted frame size, KB, rounded. Zero when no frame is attached. */
  frameKB: number;
  /** What kinds of thing were hidden, most frequent first. Never the values. */
  hidden: { category: string; count: number }[];
  /** Where it is going, so the destination is part of the decision. */
  endpoint: string;
}

export interface ConsentRequest extends ConsentSummary {
  /**
   * Which run and step this belongs to.
   *
   * A decision is answered against this. A reply carrying a stale id is
   * discarded rather than applied — otherwise an approval for step 1, clicked
   * late, would authorise step 2's payload, which the user never saw.
   */
  id: string;
}

export type ConsentDecision = 'approved' | 'declined' | 'timed-out' | 'stale';

/** Only one of these means send. Everything else, including confusion, does not. */
export function mayTransmit(decision: ConsentDecision): boolean {
  return decision === 'approved';
}

/**
 * How long to wait before deciding for the user, and deciding against sending.
 *
 * Long enough to read the summary and open the inspector; short enough that a
 * popup closed and forgotten does not leave a run pinned open indefinitely. The
 * timeout is not a fallback to sending — see `mayTransmit`.
 */
export const CONSENT_TIMEOUT_MS = 60_000;

/** Why a run stopped, in the user's words rather than a status code. */
export function declineReason(decision: ConsentDecision): string {
  switch (decision) {
    case 'declined':
      return 'You chose not to send this. Nothing left the device.';
    case 'timed-out':
      return `No answer within ${Math.round(
        CONSENT_TIMEOUT_MS / 1000,
      )}s, so nothing was sent. Shield waits rather than assuming yes.`;
    case 'stale':
      return 'That approval was for an earlier step, so it was not used and nothing was sent.';
    case 'approved':
      // Present for exhaustiveness. A caller asking why an approval stopped a
      // run has a bug, and an empty string would hide it.
      return 'Approved.';
  }
}

/**
 * Build the summary from a sealed payload.
 *
 * Typed structurally rather than against `SealedPayload` so this module stays
 * free of the transport types — it is pure, it is tested under Node, and the
 * transport module imports a phantom brand that exists to be awkward to
 * construct. What it needs is four fields and it says so.
 */
export function summarise(
  payload: {
    redacted_dom_summary: readonly { redacted_value?: string | null }[];
    redaction_manifest: readonly { category: string }[];
    // `| undefined` is explicit because the project runs with
    // exactOptionalPropertyTypes: a caller holding a payload whose frame was
    // dropped passes undefined rather than omitting the key, and refusing that
    // would push every caller into building a second object shape.
    redacted_frame?: string | null | undefined;
  },
  endpoint: string,
  id: string,
): ConsentRequest {
  const counts = new Map<string, number>();
  for (const entry of payload.redaction_manifest) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  return {
    id,
    elements: payload.redacted_dom_summary.length,
    // Counted from the manifest rather than by looking for bracketed strings in
    // values: the manifest is the record of what was actually replaced, and a
    // page whose own text contains "[EMAIL]" must not be able to inflate it.
    placeholders: payload.redaction_manifest.length,
    frameKB: payload.redacted_frame ? Math.round(payload.redacted_frame.length / 1024) : 0,
    hidden: [...counts]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    endpoint,
  };
}
