# PRD — Shield

Screen-level Hiding of Identifiable Elements using Local Detection.
SIH 2026, SIH26171 (ISRO, Smart Automation). Deadline 2026-09-09.

## 1. Problem

AI screen agents must see the screen to act on it. Sending a screenshot to a
cloud model sends everything on it — passwords, bank details, faces, private
messages. Users must currently choose between capability and privacy.

## 2. Solution

Detect and redact sensitive content **on-device**, before transmission. The
cloud model receives sanitized context plus semantic placeholders, reasons over
it, and returns one allowlisted action the extension executes locally.

## 3. Goals

**Hackathon** — prove the loop works, measurably, on real pages:
capture → local detect → redact → send sanitized → act.

**Full product** — generalize across arbitrary sites, org-configurable policy,
persistent audit, multi-browser.

## 4. Non-Goals (now)

Mobile. Multi-browser. Cloud training on user data. Any paid API. Storing
credentials. Arbitrary server-supplied instructions.

## 5. Success Metrics — official SIH weighting

| Criterion | Weight |
|---|---|
| PII detection + redaction | 40% |
| Task accuracy | 25% |
| Latency | ~20% |
| Resource usage | ~15% |

Optimize latency **after** correctness, never instead of it.

## 6. Personas

| Persona | Needs |
|---|---|
| Everyday browser user | An agent that helps without seeing their password |
| Privacy-conscious employee | Provable non-transmission, not a promise |
| SIH judge / ISRO evaluator | Verifiable claims — the bytes, not assurances |
| Security reviewer (full product) | A threat model and an audit trail |

## 7. Scope

**In scope now:** Chrome MV3, login autofill, multi-field signup, face
redaction, manual marking, trust UI, local inference with CPU fallback.

**Architected for, not built:** multi-browser, Web Store publishing, enterprise
policy console, full PII taxonomy, adaptive model sizing, third-party security
review, audit export, analytics, model update pipeline.

## 8. Functional Requirements

Status: ✅ built · ⬜ planned (see docs/TASKS.md) · ✂ deliberately cut

### Screen perception
| ID | Requirement | Status |
|---|---|---|
| FR-01 | Capture the tab's visible content on demand | ✅ |
| FR-02 | Run a local vision model to identify UI elements | ✅ |
| FR-03 | Re-capture and re-analyze if the page changes mid-task | ✅ |
| FR-04 | Capture scrollable / off-screen content | ⬜ Day 2 |

### Sensitive data detection
| ID | Requirement | Status |
|---|---|---|
| FR-05 | Detect password fields via DOM attributes | ✅ |
| FR-06 | Detect common PII fields (name, email, phone, address) | ✅ |
| FR-07 | Detect faces in captured frames | ✅ |
| FR-08 | Detect visible ID-like number patterns via OCR | ⬜ Day 1 |
| FR-09 | When DOM and visual signals disagree, treat as sensitive | ✅ |
| FR-10 | Configurable, org-defined sensitive data types | ⬜ Day 1 (taxonomy only; org policy is full product) |

### Redaction
| ID | Requirement | Status |
|---|---|---|
| FR-11 | Redact flagged visual regions before transmission | ✅ |
| FR-12 | Replace flagged DOM values with placeholder tokens | ✅ |
| FR-13 | Semantic placeholders, not blind blackout | ✅ |
| FR-14 | Configurable redaction aggressiveness | ⬜ Day 1 |

### Transport and cloud reasoning
| ID | Requirement | Status |
|---|---|---|
| FR-15 | Transmit only sanitized data — no code path may bypass | ✅ |
| FR-16 | Backend forwards sanitized context to the reasoning model | ✅ |
| FR-17 | Backend returns a structured, executable action | ✅ |
| FR-18 | Retry with backoff on transient failures | ✅ |
| FR-19 | Pluggable reasoning-model backends | ✅ Configuration, not code |

### Action execution
| ID | Requirement | Status |
|---|---|---|
| FR-20 | Execute click / type / scroll returned by the server | ✅ |
| FR-21 | Re-verify the target exists before acting | ✅ |
| FR-22 | Broader action vocabulary (drag, select) | ✂ Widens the security boundary; no time for review |

### Trust and transparency
| ID | Requirement | Status |
|---|---|---|
| FR-23 | Status indicator (reading, hiding, thinking, done) | ✅ |
| FR-24 | Explainable redaction overlay | ✅ |
| FR-25 | Live view of the outgoing payload | ✅ |
| FR-26 | Persistent, exportable audit log | ⬜ Day 1 |

### Reliability
| ID | Requirement | Status |
|---|---|---|
| FR-27 | Fall back to WASM/CPU when WebGPU is unavailable | ✅ Self-proved |
| FR-28 | Clear, non-silent error messaging for every failure | ✅ |
| FR-29 | Adaptive model sizing by device capability | ⬜ Day 2 |

## 9. Business Rules

1. No raw sensitive data leaves the client. Non-negotiable.
2. Uncertain ⇒ hide.
3. Shield never stores or transmits a credential. It names a field; the client
   supplies the value.
4. The action allowlist is fixed: click, type, scroll.
5. A failed redaction stops the run. It never degrades to sending the raw frame.

## 10. Non-Functional Requirements

| Area | Target |
|---|---|
| Performance | One pass in a few seconds; currently ≈150ms |
| Security | No raw sensitive data leaves the client, any code path |
| Accessibility | Keyboard-navigable, readable contrast |
| Compatibility | Chrome (and Edge, as Chromium). Firefox is a port |
| Availability (full product) | 99%+ backend uptime |

## 11. UI Requirements

Popup: status, task input, Run, manual marking, observe-only, latency panel,
payload inspector, build line. On-page: redaction overlay, marking surface with
its own Run control.

## 12. Data

| Data | Where it lives | Leaves the device? |
|---|---|---|
| Raw frame | Extension memory, released after use | Never |
| Redacted frame | Extension memory | Yes — after redaction |
| DOM values | Content script | Never raw; placeholders only |
| Page URL | Client only | Never |
| Credentials | Nowhere. Not stored | Never |
| Audit log (planned) | Local storage, opt-in export | Only if exported by the user |

## 13. Glossary

**Redaction** — replacing sensitive content with an opaque region or a semantic
token, before transmission.
**Semantic placeholder** — a token like `[PASSWORD]` that preserves meaning
while removing content.
**Zero-leak verification** — an automated sweep of the outgoing payload for any
raw value; a hit refuses the request.
**Sanitized seal** — a compile-time type that only redaction can produce, so
unsanitized data cannot reach the transport layer.
