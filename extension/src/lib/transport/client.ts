/**
 * Transport — the only code that may send anything off this machine.
 *
 * The signature is the enforcement: `send` accepts a
 * `Sanitized<AnalyzePayload>` and nothing else. That type cannot be constructed
 * outside the Redaction Engine, so a caller holding raw page data has nothing
 * it can pass here, and the mistake is a compile error rather than a leak.
 *
 * Everything else in this file is about failing safely and legibly. Per
 * ARCHITECTURE.md Section 9 and PRD.md Section 20, no failure may be silent and
 * none may be generic: the user is told what went wrong in terms they can act
 * on, and the detail stays in the console.
 */

import {
  isAllowedAction,
  type SanitizedAnalyzePayload,
  type ShieldAction,
} from '../types';

/**
 * How long to wait for the server before giving up.
 *
 * ARCHITECTURE.md Section 6 budgets 1000ms for the network leg and 1500ms for
 * reasoning. This is deliberately well beyond their sum: exceeding a budget is
 * a performance problem, but abandoning a request that would have succeeded is
 * a correctness problem, and the two deserve different thresholds. The budget
 * is what gets reported; this is only when we stop waiting.
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Error codes from API_SPEC.md Section 6, mapped to what the user is told.
 *
 * The keys are the spec's exact codes. An earlier version of this file invented
 * its own lowercase names, which would have compiled, passed review by looking
 * plausible, and silently failed to match a single real response.
 */
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  MALFORMED_REQUEST:
    'Shield sent something the server could not read. This is a bug in Shield.',
  MODEL_UNAVAILABLE: 'The assistant is temporarily unavailable. Try again in a moment.',
  ACTION_REJECTED:
    'The assistant could not determine a safe action, so nothing was done.',
  INTERNAL_ERROR: 'The server had a problem. Nothing was done to the page.',
};

/** Shown for HTTP 429, which is a transport condition rather than a spec code. */
const RATE_LIMITED = 'Too many requests. Wait a moment and try again.';

const GENERIC_ERROR = 'The assistant could not complete this request. Nothing was done to the page.';

export class TransportError extends Error {
  /** Safe to show the user. Never contains page content or raw server output. */
  readonly userMessage: string;

  constructor(userMessage: string, detail: string) {
    super(detail);
    this.name = 'TransportError';
    this.userMessage = userMessage;
  }
}

export interface TransportResult {
  action: ShieldAction | null;
  /** Set when the server wants another step rather than an action. */
  needsMoreContext: boolean;
  reasoningSummary: string | null;
  requestId: string;
  networkMs: number;
}

/**
 * Validate a server response before any of it is believed.
 *
 * The server validates the action allowlist too, and this repeats the check on
 * the client. That duplication is the point: SECURITY_PRIVACY.md's elevation-of-
 * privilege row treats the server as a component that could be compromised or
 * simply wrong, and a client that trusts whatever comes back has no defence
 * left if it is. An action outside the allowlist is refused here even if the
 * server called it valid.
 */
function parseResponse(body: unknown): TransportResult {
  if (typeof body !== 'object' || body === null) {
    throw new TransportError(GENERIC_ERROR, 'Response was not an object.');
  }

  // Typed as unknown fields rather than as AnalyzeResponse. Asserting our own
  // response type onto bytes that arrived over the network would describe what
  // we hope came back, and every check below exists precisely because it might
  // not have. The shape is established by checking, not by declaring.
  const response = body as Record<string, unknown>;
  const requestId = typeof response['request_id'] === 'string' ? response['request_id'] : '';
  const status = response['status'];

  if (status === 'error') {
    const code = typeof response['error_code'] === 'string' ? response['error_code'] : '';
    throw new TransportError(
      ERROR_MESSAGES[code] ?? GENERIC_ERROR,
      `Server returned error_code=${code || 'none'}`,
    );
  }

  if (status === 'needs_more_context') {
    return {
      action: null,
      needsMoreContext: true,
      reasoningSummary: readSummary(response),
      requestId,
      networkMs: 0,
    };
  }

  if (status !== 'action_ready') {
    throw new TransportError(GENERIC_ERROR, `Unknown response status: ${String(status)}`);
  }

  const action = response['action'];
  if (typeof action !== 'object' || action === null) {
    throw new TransportError(GENERIC_ERROR, 'Response claimed an action but carried none.');
  }

  const candidate = action as Record<string, unknown>;
  const type = candidate['type'];
  const selector = candidate['selector'];

  // The allowlist check. API_SPEC.md Section 5 fixes these three verbs, and
  // CLAUDE.md forbids executing anything else under any circumstance.
  if (typeof type !== 'string' || !isAllowedAction(type)) {
    throw new TransportError(
      ERROR_MESSAGES['ACTION_REJECTED'] ?? GENERIC_ERROR,
      `Refused action type outside the allowlist: ${String(type)}`,
    );
  }

  if (typeof selector !== 'string' || selector.length === 0) {
    throw new TransportError(GENERIC_ERROR, 'Action carried no selector.');
  }

  const value = candidate['value'];

  return {
    action: {
      type,
      selector,
      value: typeof value === 'string' ? value : null,
    },
    needsMoreContext: false,
    reasoningSummary: readSummary(response),
    requestId,
    networkMs: 0,
  };
}

function readSummary(response: Record<string, unknown>): string | null {
  const summary = response['reasoning_summary'];
  return typeof summary === 'string' ? summary : null;
}

/**
 * Send a sanitized payload and return a validated action.
 *
 * There is deliberately no overload, no options bag and no escape hatch that
 * accepts an unsealed payload. If this function ever needs to send something
 * else, that is a change worth noticing in review.
 */
export async function send(
  endpoint: string,
  payload: SanitizedAnalyzePayload,
): Promise<TransportResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new TransportError(
      aborted
        ? 'The assistant took too long to respond. Nothing was done to the page.'
        : 'Could not reach the assistant. Check your connection and try again.',
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // The body is not read into the user-facing message. A server error page can
    // contain anything, including content echoed back from the request.
    throw new TransportError(
      response.status === 429 ? RATE_LIMITED : GENERIC_ERROR,
      `HTTP ${response.status} ${response.statusText}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new TransportError(
      GENERIC_ERROR,
      `Response was not JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = parseResponse(body);
  return { ...result, networkMs: performance.now() - started };
}
