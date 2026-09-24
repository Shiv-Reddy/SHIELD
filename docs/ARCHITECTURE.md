# Architecture — Shield

## 1. How the pieces fit

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

## 2. The parts

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

## 3. What happens, in order

1. User enters a task; worker injects the content script (`activeTab`).
2. Capture frame + extract DOM map.
3. Detect: DOM rules, then faces, then manual marks.
4. Redact both views together — frame pixels and DOM values.
5. Seal the payload. Zero-leak sweep. Send.
6. Server reasons; returns one allowlisted action.
7. Client re-verifies the target, acts, re-captures.
8. Repeat until no action is proposed, or the step cap is hit.

## 4. The line nothing private crosses

**Everything before sending happens on your own computer.** Three separate
guards, because one guard can have a bug:

| Guarantee | Catches | When |
|---|---|---|
| A type the code must produce | Uncleaned data reaching the sending code | Before the program runs |
| An order check | A step skipped, crashed past, or returned early | While running |
| A search of the whole message | A real value that survived redaction | Every single request |

**Fail shut.** A failed redaction stops the run. It never falls back to
sending the real thing.

## 5. The rules we build by

1. **Cover it before sending it.** No exceptions, no code path.
2. **Trust the page's own code first**, the picture second.
3. **If unsure, hide it.**
4. **A fixed list of allowed actions.** Never do what the server invents.
5. **Every claim must be checkable** — timings, the sent-message view, the overlay.
6. **Fail loudly.** Never quietly do a worse job.

## 6. Speed budget

Every stage has a limit. If a stage goes over, it is logged and shown in the
popup, so slowdown is visible when it happens rather than discovered before a
demo.

| Stage | Limit | Measured on Chrome |
|---|---|---|
| Screen capture | 100ms | 27ms |
| DOM scan | 100ms | 4ms |
| Model start-up | 3000ms | ~900ms on WebGPU, ~126ms on CPU |
| Local AI | 500ms | 52ms |
| Covering it up | 200ms | 40ms |
| Network round trip | 1000ms | 11ms |
| **Whole pass** | **a few seconds** | **~135ms** |

Firefox runs the same pipeline at 364ms once warm.

Two stages are timed separately on purpose:

- **DOM scan apart from capture.** They behave differently and break
  differently. Timed together, they tell you something is slow without telling
  you what.
- **Model start-up apart from running it.** Start-up is paid once, not per
  capture. Mixing them makes every first run look like a fault. That is exactly
  how a 2122ms first run was found and fixed with a warm-up.

These are one machine on one day, not a promise.

## 7. When things go wrong

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

## 8. Scaling it, if it ever ships for real

Stateless backend behind a load balancer; per-user rate limiting; model
inference pooled or hosted; audit log to org-controlled storage; signed model
manifests with staged rollout for client model updates.
