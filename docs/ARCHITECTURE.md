# Architecture — Shield

## 1. System Overview

```
┌─ CLIENT (Chrome MV3) ──────────────────────────────┐
│  Content script ──▶ Service worker ──▶ Offscreen   │
│  (DOM map,          (orchestration,     (ONNX,      │
│   executor,          pipeline order,     WebGPU/    │
│   overlay,           transport)          WASM,      │
│   marking)                               canvas)    │
└────────────────────────┬───────────────────────────┘
                         │  TRUST BOUNDARY
                         │  only sanitized payloads cross
                         ▼
┌─ SERVER (FastAPI) ─────────────────────────────────┐
│  Gateway ──▶ Prompt builder ──▶ Model ──▶ Action   │
│                                            builder  │
└────────────────────────────────────────────────────┘
```

## 2. Components

| # | Component | Where | Responsibility |
|---|---|---|---|
| 2.1 | Screen Perception | Client | `captureVisibleTab` + DOM map. Selectors verified to round-trip |
| 2.2 | PII Detector | Client | DOM rules (primary) + faces (supplementary). Uncertain ⇒ sensitive |
| 2.3 | Redaction Engine | Client | Opaque fill on the frame, semantic tokens in the DOM summary |
| 2.4 | Transport | Client | Accepts only `Sanitized<T>`. Enforced by type signature |
| 2.5 | API Gateway | Server | Validates the request schema; rejects malformed input |
| 2.6 | Prompt Builder | Server | Page content is JSON data, never interpolated as instruction |
| 2.7 | Reasoning Model | Server | Provider-agnostic. Rule path runs when no model is configured |
| 2.8 | Action Builder | Server | Emits only click / type / scroll |
| 2.9 | Action Executor | Client | Re-verifies the target against the capture before acting |

## 3. Sequence — login autofill

1. User enters a task; worker injects the content script (`activeTab`).
2. Capture frame + extract DOM map.
3. Detect: DOM rules, then faces, then manual marks.
4. Redact both views together — frame pixels and DOM values.
5. Seal the payload. Zero-leak sweep. Send.
6. Server reasons; returns one allowlisted action.
7. Client re-verifies the target, acts, re-captures.
8. Repeat until no action is proposed, or the step cap is hit.

## 4. Trust Boundary

**Everything before transmission is local.** Three independent guarantees:

| Guarantee | Catches | When |
|---|---|---|
| `Sanitized<T>` type seal | Wiring mistakes — unsanitized data reaching transport | Compile time |
| Stage-order guard | A stage skipped, thrown past, or returned early | Run time |
| Zero-leak sweep | A raw value surviving redaction | Per request |

Fail closed. A failed redaction stops the run; it never degrades to sending raw.

## 5. Design Principles

1. Redact before transmit. No exceptions, no code path.
2. DOM first, vision second.
3. Uncertain ⇒ hide.
4. Fixed allowlist. Never execute what the server invents.
5. Every claim measurable — timings, payload inspector, overlay.
6. Fail loudly. No silent degradation.

## 6. Latency Budget

| Stage | Budget | Measured 2026-09-07 |
|---|---|---|
| Screen capture | < 100ms | 24–49ms |
| DOM scan | < 100ms | 1.6–7.2ms |
| Model init | < 3000ms | ~900ms WebGPU, ~96ms CPU |
| Local inference | < 500ms | 40–63ms |
| Detection + redaction | < 200ms | 36–75ms |
| Network round trip | < 1000ms | 6.4–87ms |
| Action execution | < 100ms | not separately instrumented |
| **Total** | **A few seconds** | **≈150–200ms per pass** |

Two stages are budgeted separately on purpose:

- **DOM scan apart from capture** — different performance characteristics,
  different fixes. Together they say something is slow without saying what.
- **Model init apart from inference** — paid once per offscreen document, not
  per capture. Conflating them makes every first run look like a regression.
  This is how the 2122ms first inference was found and fixed with a warm-up.

Measured is one machine on one day, not a guarantee. Every stage is timed on
every run, logged when over budget, and shown in the popup — so drift is
visible when it happens, not discovered before a demo.

## 7. Failure Modes

| Failure | Response |
|---|---|
| WebGPU unavailable | Fall back to WASM/CPU, tell the user |
| Redaction fails | Stop the run. Never send raw |
| Stage skipped | Guard throws before transport |
| Raw value in payload | Zero-leak sweep refuses the request |
| Target element gone | Refuse the action, report it |
| Same action repeated | Refuse before executing |
| Page unreadable (chrome://) | Plain message, not an internal error |
| Network/model transient | Retry with backoff |

## 8. Production Scaling (Full Product)

Stateless backend behind a load balancer; per-user rate limiting; model
inference pooled or hosted; audit log to org-controlled storage; signed model
manifests with staged rollout for client model updates.
