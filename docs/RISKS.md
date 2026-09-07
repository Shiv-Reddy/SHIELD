# Risk Register — Shield

Full register across technical, security, business, and operational
categories. Update status as risks are mitigated or new ones are identified.

## Technical Risks

| ID | Risk | Impact | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| T-01 | Local AI model runs too slowly on some laptops | High | Medium | Test on multiple laptops early; have a simpler/smaller fallback model ready | ML Engineer | Open |
| T-02 | WebGPU unavailable or buggy on some hardware/browser versions | Medium | Medium | WASM/CPU fallback tested and working before demo day | Extension Engineer | Open |
| T-03 | Redaction over-hides content, breaking cloud reasoning quality | Medium | Medium | Use semantic placeholders, not blind blackout; tune iteratively against test screens | ML Engineer | Open |
| T-04 | Redaction under-hides content, leaking PII | High | Medium | Default to hiding when uncertain; adversarial test screen (Screen 5) run regularly | ML Engineer | Open |
| T-05 | Target element for a returned action no longer exists on the page (moved/changed) | Medium | Low | Action Executor re-verifies element existence before acting | Backend Engineer | Open |
| T-06 | Free-tier reasoning model API has rate limits that block testing close to deadline | Medium | Medium | Identify limits early; have a self-hosted fallback model ready | Backend Engineer | Open |
| T-07 | Multi-step task loop gets stuck or loops indefinitely | Medium | Low | Add a maximum step count per task with a clear "couldn't complete" fallback | Backend Engineer | Open |

## Security & Privacy Risks

| ID | Risk | Impact | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| S-01 | A code path accidentally sends unredacted data (e.g. a debug bypass left in) | Critical | Low | Code review specifically checks for this; Zero-Leak Verification run before every demo rehearsal | Whole Team | Open |
| S-02 | Server-side logging accidentally captures raw sensitive payload contents | High | Low | Explicit logging policy: log request_id and metadata only, never payload contents | Backend Engineer | Open |
| S-03 | A malicious/adversarial webpage tricks the detector into misclassifying a sensitive field as safe | Medium | Low | Adversarial test screen (Screen 5); default-to-hiding policy on disagreement | ML Engineer | Open |
| S-04 | Server returns an action outside the safe allowlist due to a model error | Medium | Low | Action Response Builder validates against fixed allowlist; Action Executor double-checks client-side | Backend Engineer | Open |

## Business / Adoption Risks (Full Product, if pursued)

| ID | Risk | Impact | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| B-01 | Users don't trust the privacy claim without independent verification | High | Medium | Open-source the code; publish the threat model; live network-inspector proof | Product Lead | Open |
| B-02 | Chrome Web Store review rejects or delays publishing | Medium | Low | Follow store privacy-disclosure requirements closely; review similar approved extensions beforehand | Product Lead | Not yet relevant (post-hackathon) |
| B-03 | No sustainable cost model for running the backend at real scale | Medium | Medium | Evaluate sustainability model only once real adoption data exists (see ROADMAP.md Phase 7) | Product Lead | Not yet relevant |

## Operational Risks (Hackathon-Specific)

| ID | Risk | Impact | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| O-01 | Live demo fails due to venue internet connectivity issues | High | Medium | Backup recorded demo video prepared and easily accessible | Presentation Lead | Open |
| O-02 | Demo laptop differs from the laptops used during development/testing | Medium | Medium | Rehearse specifically on the actual presentation laptop, not just dev machines | Whole Team | Open |
| O-03 | Team runs out of time and ships an unfinished stretch goal instead of a polished core | High | Medium | Strict phase gating: Phase 1 (core) must be fully solid before touching Phase 2/3 (see TASKS.md) | Whole Team | Open |
| O-04 | Required deliverables (2-page architecture doc, 2-minute video, 5-slide deck) rushed at the last minute | Medium | Medium | Draft these early, in parallel with development, not after | Presentation Lead | Open |

## Team / People Risks

| ID | Risk | Impact | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| P-01 | No team member has hands-on experience with WebGPU/ONNX before starting | High | Medium | Dedicated pre-hackathon learning time in Phase 0 (Weeks 1-2); don't defer this to event week | Team Lead | Open |
| P-02 | Uneven workload across the 6 roles, one person becomes a bottleneck | Medium | Medium | Weekly check-ins during Phase 0; TASKS.md kept current so blockers are visible early | Team Lead | Open |

## Review Cadence

This register should be reviewed weekly during Phase 0 (pre-hackathon prep)
and once daily during the hackathon event itself, given how quickly status
can change under time pressure.
