# What the extension sends, and what it gets back

The agreement between the extension and the server. Section 5 is the important
one: it lists the only three things the server is allowed to reply with, and the
code refers to this document by that number.

## 1. Where it lives

- **Now:** `http://127.0.0.1:8787` — your own machine
- **A real product:** `https://api.<domain>/v1`

## 2. Logging in

- **Now:** nothing. The server is only reachable from the same machine, which
  is also why it must never be exposed to a network — it has no login and no
  rate limit by design
- **A real product:** a key per installed extension, with a rate limit

## 3. `POST /analyze` — the one request Shield makes

**Purpose:** Client sends sanitized screen context and task query; server
returns a structured action.

**Request Schema:**
```json
{
  "request_id": "uuid-string",
  "task_query": "string — what the user wants done, e.g. 'log me in'",
  "redacted_frame": "base64-encoded image, with sensitive regions already blurred/masked",
  "redacted_dom_summary": [
    {
      "element_id": "string",
      "element_type": "input | button | text | image | other",
      "label": "string or null",
      "value": "string or placeholder token (e.g. '[PASSWORD]') — never a raw sensitive value",
      "filled": "boolean — whether the field held content at capture time",
      "position": { "x": 0, "y": 0, "width": 0, "height": 0 }
    }
  ],
  "redaction_manifest": [
    { "region_id": "string", "category": "password | name | email | phone | address | face | id_number | other", "method": "dom | visual | ocr | manual" }

`method` records HOW a region was hidden, and `manual` is not a detector: it
means the user drew a rectangle over something and asked for it to be hidden.
It is distinct from the other three on purpose. A manual mark both paints its
rectangle out of the frame and tokenises every element underneath it, and it
carries no confidence value because it is not a guess. Conflating it with `dom`
or `visual` would misdescribe how the redaction happened in the one audit record
the server is given.
  ]
}
```

**Note on `filled`:** a redacted field reads `[PASSWORD]` whether it is full or
empty, because the token says what belongs there rather than what is there.
`filled` restores the distinction the assistant needs — "this field still needs
filling" and "this form is ready to submit" require different actions and are
otherwise indistinguishable. Emptiness discloses nothing about content.

**Note on `other`:** a region Shield judged sensitive without identifying what
kind of data it holds — a field carrying content that no detection rule
recognised. SECURITY_PRIVACY.md Section 4 requires ambiguous signals to be
treated as sensitive by default, so these are redacted like any other category.
The server should treat `other` exactly as it treats the named categories.

**Response Schema (success):**
```json
{
  "request_id": "uuid-string",
  "status": "action_ready",
  "action": {
    "type": "click | type | scroll",
    "selector": "string — DOM selector or element_id reference",
    "value": "string or null — only for type actions, never a sensitive value"
  },
  "confidence": 0.0,
  "reasoning_summary": "short, non-sensitive explanation of what the model understood"
}
```

**Response Schema (needs more info / multi-step continuation):**
```json
{
  "request_id": "uuid-string",
  "status": "needs_more_context",
  "message": "string explaining what additional screen state is needed"
}
```

**Response Schema (error):**
```json
{
  "request_id": "uuid-string",
  "status": "error",
  "error_code": "MALFORMED_REQUEST | MODEL_UNAVAILABLE | ACTION_REJECTED | INTERNAL_ERROR",
  "message": "human-readable, non-sensitive error description"
}
```

## 4. `GET /health` — is it up?

**Purpose:** Simple liveness check for the backend service.

**Response:**
```json
{ "status": "ok", "model_backend": "string identifying current reasoning model" }
```

## 5. The only actions allowed

| Action Type | Required Fields | Notes |
|---|---|---|
| `click` | `selector` | Executed via standard DOM click event |
| `type` | `selector`, `value` | `value` must never be a raw sensitive value passed back from the server — server should reference "use the value the user already provided locally" for sensitive fields, not send it back itself |
| `scroll` | `selector` or `direction` | Scrolls to element or scrolls page in a direction |

Any action type not in this table must be rejected by both the server's
Action Response Builder and the client's Action Executor as a defense-in-depth
measure (see SECURITY_PRIVACY.md Section 3, Elevation of Privilege).

## 6. Errors

| Code | Meaning | Client Behavior |
|---|---|---|
| `MALFORMED_REQUEST` | Request failed schema validation | Show generic "couldn't process this page" error, log locally for debugging |
| `MODEL_UNAVAILABLE` | Reasoning model backend is down/unreachable | Retry with backoff, then show connectivity error |
| `ACTION_REJECTED` | Model's proposed action failed validation against the allowlist | Show "couldn't determine a safe action" error, do not retry blindly |
| `INTERNAL_ERROR` | Unexpected server-side failure | Show generic error, log request_id for debugging (never log payload contents) |

## 7. Rate limiting — a real product only

Per-key request rate limits should be enforced to prevent abuse and control
cost on the reasoning-model backend. Specific limits to be defined based on
expected usage patterns once real user data is available.

## 8. Versions

API version is included in the URL path (`/v1`) for Full Product. Breaking
changes to the request/response schema require a new version path; the
redaction-aware prompt template (see ARCHITECTURE.md Section 8) must be
re-validated against the full regression suite whenever the schema changes.
