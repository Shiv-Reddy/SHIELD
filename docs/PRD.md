# Product Requirements Document — Shield

**Problem Statement ID:** SIH26171
**Product Name:** Shield (Screen-level Hiding of Identifiable Elements using Local Detection)
**Event:** Smart India Hackathon 2026 | **Sponsor:** ISRO (Department of Space)
**Deadline:** 20 September 2026
**PRD Version:** v3.0 (full-depth)
**Status:** Draft

This PRD covers two layers on purpose, clearly separated throughout:
- **Hackathon Scope** — what must exist and work for SIH judging
- **Full Product Scope** — what a genuinely complete, real-world version of Shield requires

Build the Hackathon Scope first, always. The Full Product Scope exists so the
team never has to guess what "later" looks like, and so the architecture
(see ARCHITECTURE.md) is never accidentally built in a way that blocks it.

---

## 1. Document Overview

- Product name: Shield
- Author/team: Shiv + team
- Status: Draft, actively being built
- Stakeholders: Team, SIH judges/ISRO evaluators, (post-event) early adopters
- Related docs: ARCHITECTURE.md, SECURITY_PRIVACY.md, API_SPEC.md, TECH_STACK.md,
  TESTING.md, ROADMAP.md, RISKS.md, TASKS.md, DECISIONS.md, DEMO_SCRIPT.md

## 2. Executive Summary

Shield is a browser extension that lets an AI assistant read and act on a
user's screen while guaranteeing that sensitive information never leaves the
device unprotected. A local, in-browser vision model detects on-screen
elements and sensitive regions; a redaction engine hides them; only sanitized
context reaches a cloud reasoning model, which returns an action for the
extension to execute. The hackathon build proves this end to end on a small
set of real tasks. The full product vision extends this into a general-purpose,
publishable, multi-scenario privacy layer for agentic browser AI.

## 3. Problem Statement

Agentic browser AI (tools that read your screen and act on it) is becoming
common, but nearly all current implementations transmit the full screen state
to a server, exposing passwords, faces, financial details, and other personal
data to a third party by default. There is no widely available, verifiable
system that lets a user benefit from AI screen assistance while guaranteeing
sensitive data never leaves their device unprotected. This is a real and
current barrier to trust and adoption of agentic AI tools, for individuals and
for privacy-conscious organizations alike.

## 4. Background

Browser-native technology (WebGPU, WebAssembly) plus libraries like ONNX
Runtime Web and Transformers.js now make it practical to run real, useful
machine learning models directly in a browser tab, without a server round
trip. This unlocks a genuinely new architecture: a privacy-preserving local
"perception layer" paired with a powerful but untrusted-by-default cloud
"reasoning layer," bridged by a strict, auditable redaction contract.

## 5. Goals

### Hackathon Goals
- Prove the local-perception-then-cloud-reasoning architecture works, live.
- Score well against all five official evaluation metrics.
- Demonstrate genuine PII detection and redaction, not a token gesture.

### Full Product Goals
- Become a general-purpose privacy layer usable across many websites and task
  types, not just the demoed ones.
- Be independently verifiable (open, auditable, no "just trust us" claims).
- Support real deployment: browser store publishing, multi-browser support,
  production-grade reliability and monitoring.
- Support enterprise use: policy configuration, audit logs, compliance
  reporting for organizations with strict data-handling rules.

## 6. Non-Goals (Hackathon Phase)

- Publishing to the Chrome Web Store during the hackathon.
- Multi-browser support beyond Chrome during the hackathon.
- Exhaustive PII-type coverage (only common categories initially).
- Enterprise policy configuration UI (architecture should allow it later; not
  built now).

## 7. Success Metrics

### Hackathon (Official SIH Evaluation Weighting)

| Metric | Weight |
|---|---|
| Accuracy of visual context extraction from screen | 25% |
| Recall & precision of sensitive/PII detection | 20% |
| Precision of redaction | 20% |
| Client-side resource utilization | 20% |
| End-to-end task latency | 15% |

### Full Product (Post-Hackathon)

| Goal | Metric | Target |
|---|---|---|
| Reliability | Task success rate across varied real websites | >90% |
| Trust | % of users who complete onboarding after seeing the network-inspector proof | Track and improve |
| Privacy guarantee | Confirmed unredacted-data leaks in audits | Zero, always |
| Performance | End-to-end latency across common tasks | <3 seconds median |
| Adoption (if published) | Weekly active installs, retention | Track post-launch |
| Extensibility | Time to onboard support for a new site/task pattern | Decreasing over releases |

## 8. Target Users / Personas

### Persona 1: Everyday Browser User
Wants AI help with repetitive browser tasks (forms, bookings, lookups).
Worried about AI tools seeing passwords, financial info, or personal photos.
Low-to-medium technical familiarity — needs the trust story to be visible and
simple, not just technically true.

### Persona 2: Privacy-Conscious Enterprise Employee
Wants to use agentic AI for internal workflows (ticketing, internal forms,
data entry) but is blocked by company data-handling policy from sending
screenshots of internal systems to third-party AI vendors. Needs audit logs
and configurable policy for IT/compliance approval.

### Persona 3: SIH Judge / ISRO Evaluator
Wants to see a genuinely working, well-tested system scored against the
official rubric; values technical depth and clear articulation of design
trade-offs (privacy vs. reasoning quality, latency vs. accuracy) over slide
polish alone.

### Persona 4 (Full Product): Independent Security Reviewer
Wants to verify Shield's privacy claims are actually true, not just marketed.
Needs open, inspectable code, a documented threat model, and clear behavior
under adversarial conditions.

## 9. User Stories

**Core (Hackathon):**
- As a user, I want the assistant to fill in a form for me, so I save time.
- As a user, I want my password field to always stay hidden from any AI
  service, so I feel safe using the assistant.
- As a judge, I want to see a full task completed live and verify via network
  inspection that no raw private data was transmitted.

**Extended (Full Product):**
- As an enterprise IT admin, I want to configure which data categories are
  always redacted for my organization, so we meet internal compliance policy.
- As a security reviewer, I want to read an open threat model and audit logs,
  so I can independently verify the privacy guarantee.
- As a user, I want Shield to work across many different websites, not just a
  few pre-tested ones, so it's actually useful day to day.
- As a user on a slower laptop, I want Shield to automatically use a lighter
  model, so it still runs smoothly.

## 10. User Journey

### Hackathon Journey (Happy Path)
1. User opens a webpage with a form and activates Shield.
2. Shield reads the screen locally.
3. Shield detects and hides sensitive fields.
4. Only sanitized context is sent to the cloud model.
5. Cloud model returns an action.
6. Shield executes the action on the real page.
7. Task completes; user sees confirmation.

### Full Product Journey (Extended, Including Failure Paths)
1–7 as above, plus:
8. If WebGPU is unavailable, Shield automatically falls back to WASM/CPU and
   informs the user performance may be slower.
9. If the cloud model is unreachable, Shield retries with backoff, then
   surfaces a clear "couldn't reach the assistant" error — never fails silently.
10. If the page structure changes mid-task (e.g. a button moved), Shield
    re-reads the screen before acting rather than blindly executing a stale
    instruction.
11. If an enterprise policy blocks a detected data category from ever being
    processed (even locally), Shield halts and informs the user why.
12. Periodically (configurable), Shield surfaces a summary of what it has
    detected and redacted recently, reinforcing the trust relationship over time.

## 11. Product Scope

### 11.1 Hackathon Scope (In Scope Now)
- Chrome extension (Manifest V3)
- Local vision model + WebGPU/WASM inference
- DOM-based + visual PII detection (passwords, common form PII, faces)
- Canvas-based redaction (blur/black-box/semantic placeholder)
- Cloud reasoning via a free-tier or self-hosted model
- Primary demo: login/form autofill
- Stretch demos: multi-field signup form, face detection on a photo/video-call page
- Basic status UI, explainable redaction overlay, live network inspector proof

### 11.2 Full Product Scope (Out of Scope Now, Architected For)
- Multi-browser support (Firefox, Edge)
- Chrome Web Store publishing (review process, privacy disclosures, store listing)
- Enterprise admin console: policy configuration, audit log export, SSO
- Broader PII taxonomy (national ID formats, financial account numbers,
  medical terms, biometric data beyond faces)
- Adaptive model sizing based on device capability
- Multi-site generalization proven across dozens of real, unmodified websites
- Formal, published threat model and third-party security review
- Usage analytics and product telemetry (opt-in, privacy-respecting)
- Monetization or sustainability model (open-source + enterprise tier, etc.)
- Automatic model update/versioning pipeline

## 12. Feature Overview

| Feature | Hackathon | Full Product |
|---|---|---|
| Screen reading | Yes, core pages | Yes, generalized across arbitrary sites |
| Privacy detection | Passwords, common PII, faces | Full taxonomy, configurable per org |
| Redaction | Canvas blur/placeholder | Same, plus policy-driven redaction rules |
| Cloud reasoning | Single chosen model | Pluggable model backend, versioned |
| Action execution | Click/type/scroll | Broader action vocabulary, safer sandboxing |
| Trust/transparency | Live network inspector, redaction overlay | Persistent audit log, exportable reports |
| Admin/policy control | None | Enterprise policy console |
| Platform support | Chrome only | Chrome, Firefox, Edge |

## 13. Detailed Functional Requirements

### Module: Screen Perception
- FR-01 (P0): Capture current tab's visible content on demand.
- FR-02 (P0): Run local vision model to identify UI elements (buttons, fields,
  text regions, images).
- FR-03 (P1): Re-capture and re-analyze if page structure changes mid-task.
- FR-04 (P2, Full Product): Support capturing scrollable/off-screen content
  for long pages.

### Module: Sensitive Data Detection
- FR-05 (P0): Detect password fields via DOM attributes (type, autocomplete).
- FR-06 (P0): Detect common PII form fields (name, email, phone, address) via
  DOM labels/attributes.
- FR-07 (P0): Detect faces in captured frames via a visual model.
- FR-08 (P1): Detect visible ID-like number patterns via OCR.
- FR-09 (P1): When DOM and visual signals disagree, default to treating the
  region as sensitive.
- FR-10 (P2, Full Product): Support configurable, org-defined sensitive data
  categories beyond the default set.

### Module: Redaction
- FR-11 (P0): Apply blur/black-box redaction to flagged visual regions before
  serialization.
- FR-12 (P0): Replace flagged DOM text values with placeholder tokens before
  serialization.
- FR-13 (P1): Support semantic placeholder redaction (structured tokens like
  `[NAME]`, `[EMAIL]`) instead of blind blackout, to preserve page structure
  for the cloud model.
- FR-14 (P2, Full Product): Support a configurable redaction aggressiveness
  level (strict/balanced/permissive).

### Module: Transport & Cloud Reasoning
- FR-15 (P0): Transmit only sanitized data to the backend; no code path may
  construct a request before redaction completes.
- FR-16 (P0): Backend forwards sanitized context to the chosen reasoning model
  with a redaction-aware prompt.
- FR-17 (P0): Backend returns a structured, executable action.
- FR-18 (P1): Retry with backoff on transient network/model failures.
- FR-19 (P2, Full Product): Support multiple pluggable reasoning-model
  backends, selectable per deployment.

### Module: Action Execution
- FR-20 (P0): Execute click/type/scroll actions returned by the server.
- FR-21 (P1): Re-verify the target element still exists before acting (avoid
  acting on a stale/moved element).
- FR-22 (P2, Full Product): Support a broader action vocabulary (drag, select
  from dropdown, file upload) safely sandboxed.

### Module: Trust & Transparency UI
- FR-23 (P0): Show a simple status indicator (reading, hiding, thinking, done).
- FR-24 (P0): Show an explainable redaction overlay (what was detected/hidden).
- FR-25 (P1): Provide a live network-inspector-style view of the outgoing
  sanitized payload, for trust verification.
- FR-26 (P2, Full Product): Persistent, exportable audit log of all
  detection/redaction decisions over time.

### Module: Reliability & Fallbacks
- FR-27 (P1): Fall back to WASM/CPU inference when WebGPU is unavailable.
- FR-28 (P1): Clear, non-silent error messaging for every failure mode listed
  in Section 20 (Error & Edge Cases).
- FR-29 (P2, Full Product): Adaptive model sizing based on detected device
  capability at startup.

## 14. UI / UX Requirements

- Extension icon/popup: on/off toggle, current status.
- Status states: idle, reading, detecting, redacting, sending, thinking,
  acting, done, error (each with a distinct, simple visual state).
- Redaction overlay: highlights over detected sensitive regions with a label
  (e.g. "Password — hidden").
- Network inspector view: simple panel showing the outgoing JSON payload,
  with sensitive fields visibly replaced by placeholders.
- Error states: specific, human-readable messages (see Section 20), never a
  silent failure or a generic "something went wrong."
- Full Product: settings page for redaction aggressiveness, model backend
  choice, and (enterprise) policy configuration.

## 15. Business Rules

- No screen data may be transmitted before passing through the redaction engine.
- When detection confidence is uncertain, the system must default to hiding,
  never to assuming safety.
- The cloud model may only return actions from a fixed, safe vocabulary
  (click, type, scroll, and any future additions must be explicitly reviewed).
- The user must always be able to see, at a glance, that Shield is active —
  no silent background operation.
- (Full Product) Enterprise policy configuration, if set, always takes
  precedence over default detection behavior — an org can mandate stricter
  redaction, never looser.

## 16. Data Requirements

| Data | Where It Lives | Retention |
|---|---|---|
| Captured screen frame | Client memory only | Discarded immediately after processing each step |
| Detected sensitive regions | Client memory only | Discarded after redaction is applied |
| Redacted/sanitized payload | Sent to server, processed, not stored server-side by default | Not retained beyond the request/response cycle |
| Action responses | Client memory only | Discarded after execution |
| (Full Product) Audit log entries | Local or org-controlled storage, opt-in | Configurable retention policy |

No personally identifiable, unredacted data is stored persistently anywhere
in the hackathon build. See SECURITY_PRIVACY.md for the full data
classification and threat model.

## 17. Non-Functional Requirements

**Performance:** End-to-end task loop should complete in a few seconds (see
ARCHITECTURE.md latency budget).
**Scalability (Full Product):** Backend must handle concurrent requests from
many users without degradation; see ARCHITECTURE.md production scaling section.
**Security:** No raw unredacted sensitive data may leave the client under any
code path (see SECURITY_PRIVACY.md).
**Availability (Full Product):** Target 99%+ uptime for the hosted backend once
in production use.
**Accessibility:** Extension UI should be usable with keyboard navigation and
readable contrast; screen-reader support is a Full Product goal.
**Compatibility:** Chrome only for hackathon; Chrome, Firefox, Edge for Full Product.

## 18. Roles & Permissions

| Role | Hackathon | Full Product |
|---|---|---|
| User | Toggle on/off, view status/overlay | + configure redaction level, view personal audit log |
| Developer | Full code/build access | + CI/CD, deployment access |
| (Full Product) Org Admin | N/A | Configure org policy, view org-wide audit logs |
| SIH Judge | View demo, code, docs | N/A |

## 19. Integrations & Dependencies

See TECH_STACK.md for the full list. Key external dependencies: ONNX Runtime
Web, Transformers.js, a face-detection model, a cloud/self-hosted reasoning
model API, browser WebExtension APIs.

## 20. Error & Edge Cases

| Case | Required Behavior |
|---|---|
| Page cannot be read/parsed | Show clear "couldn't read this page" message |
| WebGPU unavailable | Fall back to WASM/CPU automatically, inform user of possible slowdown |
| Cloud model unreachable | Retry with backoff, then show clear connectivity error |
| Detection confidence is uncertain | Default to hiding the region |
| Target element for an action no longer exists | Fail safely, report to user, do not act on the wrong element |
| Model produces a malformed/unexpected action | Reject and surface a clear error, never execute an unvalidated action |
| User has multiple tabs/windows open | Each tab's Shield instance operates independently, no cross-tab data leakage |
| Extremely large/complex page (e.g. long scroll) | Process visible viewport by default; full-page support is a Full Product goal |
| (Full Product) Org policy conflicts with detected content | Halt and clearly inform the user why, never silently override |

## 21. MVP Definition (MoSCoW)

**Must Have (Hackathon):** Screen reading, DOM+visual PII detection, redaction,
sanitized transmission, cloud reasoning with redaction-aware prompting, action
execution, one fully working demo task, status UI, explainable redaction overlay.

**Should Have (Hackathon):** WASM fallback, live network inspector, second
demo task (signup form).

**Could Have (Hackathon):** Third demo task (face detection), latency
breakdown display, red-team adversarial test case shown live.

**Future (Full Product):** Multi-browser support, store publishing, enterprise
policy console, broader PII taxonomy, adaptive model sizing, persistent audit
logs, formal security review.

## 22. Acceptance Criteria

**Feature: Privacy Filter**
- Given a screen with a password field, when Shield reads the screen, then
  the password field must be hidden before any network request is made.
- Given a screen with a visible face, when Shield reads the screen, then the
  face must be blurred/hidden.
- Given a screen with no sensitive content, when Shield reads the screen,
  then normal content must not be unnecessarily redacted.

**Feature: End-to-End Task**
- Given the login/form autofill task, when the user activates Shield, then
  the task completes correctly with zero unredacted sensitive data observed
  in the network payload.

**Feature: Fallback Behavior**
- Given WebGPU is unavailable, when Shield attempts local inference, then it
  falls back to WASM/CPU and completes the task, possibly more slowly.

## 23. Technical Considerations

See ARCHITECTURE.md, SECURITY_PRIVACY.md, and API_SPEC.md for full detail.
High-level: browser-native ML inference, a strict redact-before-transmit
boundary, a pluggable cloud reasoning backend, and an architecture that
does not block later multi-browser or enterprise extension.

## 24. Risks & Mitigation

See RISKS.md for the full risk register (technical, security, business,
operational). Top risks: local inference performance variance across
hardware, PII detection misses, over-redaction harming reasoning quality,
live demo failure due to connectivity.

## 25. Rollout Plan

### Hackathon Rollout
Development → internal team testing across multiple laptops → rehearsed live
demo → SIH submission (code, README, architecture doc, demo video, presentation).

### Full Product Rollout (Post-Hackathon, If Pursued)
1. Internal hardening: expand PII taxonomy, multi-site testing, security review.
2. Closed beta with a small group of real users, collecting feedback.
3. Chrome Web Store submission and review.
4. Public launch (Chrome), monitor stability and trust reception.
5. Firefox/Edge support.
6. Enterprise policy console and audit logging, for organizational adoption.
7. Ongoing model quality iteration based on real-world detection accuracy.

## 26. Timeline & Milestones

See ROADMAP.md for the complete timeline, from pre-hackathon prep through
post-hackathon production hardening.

## 27. Open Questions

- Final choice of cloud reasoning model/backend (see DECISIONS.md, currently open).
- How aggressive should default redaction be, and should this be user-configurable
  even in the hackathon build?
- If pursued post-hackathon, what is the sustainability/monetization model?
- What is the realistic timeline and appetite for a formal third-party
  security review, if this becomes a real product?

## 28. Appendix: Glossary

- **PII** — Personally Identifiable Information.
- **Redaction** — hiding/masking sensitive information before further use.
- **WebGPU** — browser API for fast, hardware-accelerated in-browser compute.
- **VLM** — Vision-Language Model.
- **DOM** — Document Object Model, a webpage's structural representation.
- **STRIDE** — a threat-modeling framework (see SECURITY_PRIVACY.md).
- **Redaction-aware prompting** — prompting a reasoning model to correctly
  interpret redacted/placeholder regions as intentional, not missing data.

## 29. Source

Based on the official Smart India Hackathon 2026 problem statement SIH26171,
sponsored by ISRO, Department of Space. Submission deadline: 20 September 2026.
