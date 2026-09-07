# Roadmap — Shield

Full timeline from today through the hackathon and, if pursued further, into
a real production product.

## Phase 0: Pre-Hackathon Preparation (Weeks 1-4)

**Week 1**
- Finalize all context docs (this set).
- Assign team roles (see TASKS.md).
- Set up dev environment, repo structure, and CI basics (lint/test on push).
- Select and download the local vision model + face-detection model.
- Build the 5 test screens (see TESTING.md Section 1).

**Week 2**
- Build Screen Perception + Local Vision Model integration.
- Get WebGPU inference working end-to-end on at least one laptop.
- Begin PII Detector (DOM rules first — fastest to build and highest reliability).

**Week 3**
- Complete PII Detector (add visual face-detection layer).
- Build Redaction Engine (Canvas-based, semantic placeholder tokens).
- Stand up backend skeleton (FastAPI/Express), choose and test a free-tier
  reasoning model.

**Week 4**
- Wire full client-server round trip for the primary demo task (login/form
  autofill).
- Run first Zero-Leak Verification (see TESTING.md Section 6).
- Begin work on Phase 2 stretch goal (multi-field signup form) if Phase 1 is solid.

## Phase 1: Hackathon Event (36 Hours)

**Hours 0-12:** Finalize and stabilize the primary demo task end-to-end.
Fix any environment-specific issues discovered on the actual event hardware.

**Hours 12-24:** Build stretch goals in priority order (signup form, then
face detection) — only if Phase 1 is fully rehearsed and stable. Begin
building differentiation features (live network inspector, explainable
redaction overlay).

**Hours 24-32:** Add remaining differentiation features (semantic redaction
polish, frame diffing if time allows, red-team adversarial test case).
Complete Zero-Leak Verification on the actual demo laptop.

**Hours 32-36:** Rehearse the full demo script (see DEMO_SCRIPT.md)
repeatedly. Finalize README, architecture doc (2-page limit), demo video
(2-minute limit), and presentation (5-slide limit). Record backup demo video.

## Phase 2: Post-Hackathon Hardening (If Continuing, Weeks 1-4 After Event)

- Expand the PII taxonomy beyond the hackathon's core categories (see
  SECURITY_PRIVACY.md Section 2).
- Test against a rotating set of real, unmodified third-party websites
  (TESTING.md Screen 6) to validate generalization claims.
- Conduct an internal adversarial security review against the full threat
  model (SECURITY_PRIVACY.md Section 3).
- Add persistent, exportable audit logging.
- Begin evaluating a stable, cost-predictable reasoning-model backend for
  real (non-free-tier) usage.

## Phase 3: Closed Beta (Months 2-3 Post-Hackathon)

- Recruit a small group of real users (or one willing organization) for
  hands-on feedback.
- Instrument opt-in, privacy-respecting usage telemetry to understand real
  task-success rates outside the curated demo set.
- Iterate on detection accuracy and latency based on real-world usage patterns.
- Draft Chrome Web Store submission materials (privacy disclosures, store
  listing, screenshots).

## Phase 4: Public Launch — Chrome (Month 4)

- Submit to Chrome Web Store, complete review process.
- Public launch announcement.
- Monitor stability, error rates, and user trust reception closely in the
  first weeks (see ARCHITECTURE.md Section 7, Observability).

## Phase 5: Multi-Browser Expansion (Months 5-6)

- Port to Firefox (WebExtensions API differences) and submit to Firefox
  Add-ons.
- Port to Edge (largely Chromium-compatible, lower incremental effort).

## Phase 6: Enterprise Features (Months 6-9)

- Build the enterprise policy console (configurable redaction rules, action
  vocabulary restrictions per organization).
- Build organization-wide audit log export and compliance reporting.
- Pilot with one or two privacy-conscious organizations.

## Phase 7: Ongoing (Continuous)

- Ongoing model quality iteration as detection accuracy data accumulates.
- Ongoing security review cadence (e.g. before each major release).
- Ongoing evaluation of a sustainability model (open-source core + optional
  enterprise tier, or another approach, decided based on real adoption data
  by this point — not decided prematurely now).

## Decision Gates

Each phase transition (especially Phase 2 → Phase 3, and Phase 4 → Phase 5)
should be an explicit team decision, not an assumed default — continuing
past the hackathon is optional and should be evaluated based on real
interest and bandwidth at that time, documented in DECISIONS.md when decided.
