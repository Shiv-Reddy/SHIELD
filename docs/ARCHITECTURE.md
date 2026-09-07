# Architecture — Shield

Covers both the Hackathon build and the Full Product target architecture.
Design choices in the Hackathon build should never structurally block the
Full Product path described here.

## 1. System Overview

```
                    ┌─────────────────────────────────────────┐
                    │              BROWSER (CLIENT)            │
                    │                                           │
  [Webpage] ──capture──> [Screen Perception]                    │
                    │           │                                │
                    │           ├──> [Local Vision Model]        │
                    │           │        (ONNX/WebGPU)           │
                    │           │                                │
                    │           └──> [PII Detector] <── DOM scan │
                    │                    │        └── Face model │
                    │                    v                        │
                    │            [Redaction Engine]               │
                    │              (Canvas-based)                 │
                    │                    │                        │
                    │                    v                        │
                    │            [Transport Layer]                │
                    └────────────────────┼────────────────────────┘
                                         │  (sanitized JSON only)
                                         v
                    ┌─────────────────────────────────────────┐
                    │              SERVER (CLOUD)               │
                    │                                           │
                    │   [API Gateway] → [Redaction-Aware        │
                    │                     Prompt Builder]        │
                    │                          │                 │
                    │                          v                 │
                    │              [Reasoning Model (VLM/LLM)]   │
                    │                          │                 │
                    │                          v                 │
                    │              [Action Response Builder]     │
                    └────────────────────┼────────────────────────┘
                                         │  (structured action JSON)
                                         v
                    ┌─────────────────────────────────────────┐
                    │              BROWSER (CLIENT)             │
                    │        [Action Executor] ──acts on──> [Webpage] │
                    └─────────────────────────────────────────┘
```

## 2. Component Specifications

### 2.1 Screen Perception (Client)
**Responsibility:** Capture the current tab state and produce a structured
representation of on-screen elements.
**Inputs:** Browser tab handle, trigger event (user activation or task-loop
continuation).
**Outputs:** Captured frame (canvas image data) + DOM element map (positions,
types, attributes).
**Internal design (as built):** `chrome.tabs.captureVisibleTab` for the frame,
chosen over `tabCapture` and an in-page canvas because it needs no media stream
and no page cooperation; a content script walks the DOM for structural data.

Two corrections to the original design, both made on evidence and recorded in
DECISIONS.md:

- **The local vision model does not classify UI elements.** This section
  originally described it detecting and classifying visual regions generally.
  The DOM already does that better and in under 4ms, so the visual layer was
  narrowed to what the DOM structurally cannot see — faces, and text baked into
  pixels — which is what Section 5 of this document always said it was for.
- **Inference does not run in the service worker.** MV3 service workers cannot
  host ONNX Runtime Web at all (microsoft/onnxruntime#20876), so it runs in an
  offscreen document. Worth keeping for a second reason: that document is now
  the only context that decodes a frame, so "which code can see raw pixels?"
  has a one-file answer.

Capture and the DOM walk are timed separately (see Section 6). Both must succeed
before Screen Perception reports complete — an empty element map is
indistinguishable from a page with nothing sensitive on it, so half a reading
must never look like a whole one to the PII Detector.

### 2.2 PII Detector (Client)
**Responsibility:** Identify sensitive regions from both DOM and visual signals.
**Inputs:** DOM element map, captured frame.
**Outputs:** List of sensitive regions: `{type, location, source: dom|visual,
confidence}`.
**Internal design:** Two parallel sub-detectors:
- DOM rule engine (input types, autocomplete attributes, ARIA labels, field
  name/label pattern matching)
- Visual model pipeline (face detection model; optional OCR pass for visible
  ID-like text patterns)
When both sub-detectors evaluate the same region and disagree, the system
defaults to treating it as sensitive (see PRD.md Section 13, FR-09).

### 2.3 Redaction Engine (Client)
**Responsibility:** Apply redaction to all flagged regions before any data
leaves the client.
**Inputs:** Captured frame, DOM element map, list of sensitive regions.
**Outputs:** Redacted frame (Canvas-processed image), redacted DOM summary
(sensitive text values replaced with semantic placeholders like `[PASSWORD]`,
`[NAME]`, `[EMAIL]`).
**Internal design:** Canvas API draws blur/black-box/pixelation directly onto
the captured frame at the specified coordinates. Text-based redaction uses a
placeholder-token scheme (not blind deletion) so page structure remains
interpretable by the reasoning model downstream.
**Hard invariant:** No code path in the extension may call the Transport
Layer before this component has run on the current frame.

### 2.4 Transport Layer (Client)
**Responsibility:** Package and send only sanitized data to the backend.
**Inputs:** Redacted frame, redacted DOM summary, current task/query context.
**Outputs:** Single JSON POST request (see API_SPEC.md for schema).
**Internal design:** No retries of unsanitized data; if redaction fails for
any reason, the transport layer must refuse to send rather than send an
unredacted fallback.

### 2.5 API Gateway (Server)
**Responsibility:** Receive requests, validate schema, route to the prompt
builder.
**Inputs:** Sanitized JSON payload from client.
**Outputs:** Validated request object, or a rejection with a clear error if
malformed.

### 2.6 Redaction-Aware Prompt Builder (Server)
**Responsibility:** Construct a prompt that explicitly tells the reasoning
model how to interpret placeholder tokens and blurred regions.
**Internal design:** Uses a documented, versioned prompt template (e.g. "The
following screen description contains placeholder tokens like [PASSWORD] and
[NAME] where sensitive information has been intentionally redacted. Treat
these as present-but-hidden, not as missing data, when reasoning about the
task.").

### 2.7 Reasoning Model / VLM (Server)
**Responsibility:** Interpret the sanitized context and decide the next action.
**Inputs:** Constructed prompt + sanitized visual/DOM context.
**Outputs:** Raw model response (to be parsed into a structured action).
**Internal design:** Pluggable — see TECH_STACK.md for current choice and
Full Product goal of supporting multiple interchangeable backends.

### 2.8 Action Response Builder (Server)
**Responsibility:** Parse and validate the model's raw response into a
structured, safe action.
**Outputs:** `{action, selector, value}` JSON (see API_SPEC.md).
**Internal design:** Validates the action against a fixed, allowed vocabulary
(click, type, scroll, and any future additions must be explicitly reviewed
and added here — never dynamically executed as arbitrary code).

### 2.9 Action Executor (Client)
**Responsibility:** Perform the validated action on the real webpage.
**Internal design:** Content script re-verifies the target element still
exists and matches expected type before acting, to avoid acting on a stale
or moved element (see PRD.md Section 20).

## 3. Sequence Diagram — Login/Form Autofill (Primary Demo Task)

```
User          Extension            Local Model       Redaction     Server         Page
 |  activate    |                       |                |            |             |
 |------------->|                       |                |            |             |
 |              | capture screen        |                |            |             |
 |              |----------------------->                |            |             |
 |              |                       | detect elements|            |             |
 |              |<-----------------------                |            |             |
 |              | run PII detector      |                |            |             |
 |              |------------------------------------------>           |             |
 |              |                       |                | redact     |             |
 |              |<------------------------------------------           |             |
 |              | send sanitized payload                 |            |             |
 |              |----------------------------------------------------->|             |
 |              |                       |                |            | reason      |
 |              |<-----------------------------------------------------|             |
 |              | receive action                          |            |             |
 |              | verify target element exists                        |             |
 |              |------------------------------------------------------------------->|
 |              |                       |                |            |    act      |
 | see result   |<-------------------------------------------------------------------|
 |<-------------|                       |                |            |             |
```

## 4. Data Flow & Trust Boundary

The single trust boundary in this system is the line between the Redaction
Engine's output and the Transport Layer's input. Everything before that line
is untrusted-for-transmission (may contain raw sensitive data); everything
after is transmission-safe by construction. See SECURITY_PRIVACY.md for the
full threat model built around this boundary.

## 5. Design Principles

- Redact before transmit, always — no exceptions, no debug bypasses left in
  production code paths.
- Default to hiding when detection confidence is uncertain.
- DOM signals are the primary, most reliable detector for form-based PII;
  the visual model's role is to catch what DOM signals cannot (faces,
  in-image text).
- Every redaction decision must be explainable and logged, both for the
  hackathon demo's trust-proof feature and for the Full Product's audit log.
- The action vocabulary the server can return is a fixed allowlist, never an
  arbitrary/dynamic instruction set — this bounds the blast radius of any
  reasoning-model error.

## 6. Latency Budget (Hackathon)

| Stage | Target | Measured (2026-09-07) |
|---|---|---|
| Screen capture | < 100ms | 24-49ms |
| DOM scan | < 100ms | 1.6-7.2ms |
| Model initialisation | < 3000ms | ~900ms (WebGPU), ~96ms (CPU) |
| Local vision inference | < 500ms | 52-63ms |
| PII detection + redaction | < 200ms | 36-54ms |
| Network round-trip | < 1000ms | 6.4-9.7ms |
| Server reasoning | < 1500ms | included in the round trip above |
| Action execution | < 100ms | not separately instrumented |
| **Total target** | **A few seconds** | **~150-200ms measured per pass** |

Two additions to the original table, both because the single line they replaced
could not be acted on when it went over:

- **DOM scan is budgeted separately from screen capture.** Screen Perception is
  two independent pieces of work with completely different performance
  characteristics and completely different fixes when slow. Tracking them
  together tells you something is wrong without telling you which.
- **Model initialisation is budgeted separately from inference.** It is paid
  once per offscreen document rather than once per capture, and conflating a
  one-time cost with a per-run one makes every first run look like a regression.
  This is not hypothetical: it is how the 2122ms first inference was found and
  fixed with a warm-up pass.

The measured column is one machine on one day, not a guarantee. Every stage is
timed against its budget on every run, logged when it exceeds one, and shown in
the popup under "Where did the time go?" — so drift is visible when it happens
rather than discovered before a demo.

## 7. Production Scaling Architecture (Full Product)

**Backend deployment:** Containerized (Docker) API service behind a load
balancer, horizontally scalable based on request volume.
**Model serving:** If self-hosting the reasoning model, use a dedicated model-
serving layer (e.g. a GPU-backed inference service) decoupled from the API
gateway, so model scaling and API scaling can be tuned independently.
**Caching:** Consider caching common redaction-aware prompt templates and any
non-sensitive, repeatable reasoning patterns to reduce latency and cost at scale.
**Observability:** Structured logging (request IDs, latency per stage, error
rates), metrics dashboard (requests/sec, model latency, error rate), and
alerting on anomalies (e.g. a spike in "action rejected" events, which could
indicate a model regression or an attempted abuse pattern).
**Multi-tenancy (Enterprise):** Backend must support per-organization
configuration (redaction policy, allowed action vocabulary overrides) without
cross-tenant data leakage.

## 8. Model Versioning & Update Strategy (Full Product)

- Local vision model and face-detection model versions are pinned and
  shipped with the extension; updates go through the standard extension
  update mechanism (or store review process, once published).
- Server-side reasoning model backend is versioned independently; changes to
  the redaction-aware prompt template must be tested against the full
  regression suite (see TESTING.md) before deployment, since prompt changes
  can silently affect how well the model respects redaction boundaries.

## 9. Failure Modes & Recovery (Summary)

See PRD.md Section 20 for the full error/edge case table. Architecturally,
every component above must fail closed (refuse to proceed / hide by default)
rather than fail open (proceed with unsafe defaults) whenever its confidence
or connectivity is compromised.
