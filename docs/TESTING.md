# Testing Strategy — Shield

Covers hackathon-scope testing (must be done before the event) and Full
Product testing practices (for anyone continuing this beyond the hackathon).

## 1. Test Screen Set (Build Before Development Gets Serious)

### Screen 1: Basic Login Form
Username, password, submit button.
**Pass criteria:** Password redacted before transmission; username/submit
correctly identified; correct action sequence returned and executed.

### Screen 2: Multi-Field Signup Form
Name, email, phone, date of birth, address, postal code, national ID, password,
confirm password, plus a dropdown, two checkboxes and a display-name field that
must *not* be treated as personal data.
**Pass criteria:** All password-type fields redacted; PII fields correctly
flagged per redaction policy (see SECURITY_PRIVACY.md); system handles the
larger field count without errors.
**Status:** Built and passing. 11 detections from 21 mapped elements, 0
unresolved selectors, every category matching the expectations written into the
page before it was first run. The signals are deliberately uneven — some fields
declare themselves with `autocomplete`, some with an input type, one with only a
placeholder, one with only a `name` attribute — because one field per category
is a demonstration and ten is a measurement.

### Screen 3: Video Call / Profile Photo Screen
A mock page with a visible face.
**Pass criteria:** Face detected via visual model (no DOM signal exists for
this); face region blurred before transmission; non-face content not
over-redacted.

### Screen 4: Clean Control Page
No sensitive fields or faces at all.
**Pass criteria:** Nothing incorrectly flagged (false-positive check).

### Screen 5: Adversarial / Edge Case Page
Password field without standard `type="password"`, partially obscured face,
ambiguously labeled field.
**Pass criteria:** System defaults to hiding when uncertain, per policy.
Document any misses — these are real pre-demo risk areas.

### Screen 6 (Full Product): Real, Unmodified Third-Party Websites
A rotating set of real websites (not mocked pages) to test generalization
claims beyond the curated test set.

## 2. Unit Testing

- PII Detector: test each DOM rule and each visual-model integration point
  in isolation with known inputs/expected outputs.
- Redaction Engine: test that every flagged region produces correctly
  positioned and sized redaction on the output frame.
- Action Response Builder (server): test that only allowlisted actions are
  accepted, malformed/unknown actions are rejected (see API_SPEC.md Section 5).
- Prompt Builder: test that the redaction-aware prompt template correctly
  incorporates placeholder tokens for a range of input combinations.

## 3. Integration Testing

- Full client-side pipeline: capture → detect → redact → transport, verified
  against each test screen in Section 1.
  **Automated** for detection → redaction → manifest → transport seal, across
  Screens 1, 2, 4 and 5, in `extension/tests/integration.test.ts`. It runs on
  every `npm test` from element maps in `tests/fixtures/screens.ts`, with a
  drift guard that reads each screen's HTML and fails if a page grows a form
  control the fixture does not have.
  **Still manual**, and marked as such rather than quietly counted: extraction,
  capture, the redaction canvas and the executor all need a real browser.
- Full server-side pipeline: request validation → prompt building → model
  call (mocked model response for deterministic testing) → response building.
- Client-server round trip: full request/response cycle against a test/mock
  backend, verifying schema conformance on both sides (see API_SPEC.md).

## 4. End-to-End Testing

- Full user journey for each of the three demo tasks (login autofill, signup
  form, face detection), run against real browser + real backend (not mocks).
- Multi-step task continuation (if a task requires more than one action
  round trip).
- Fallback path: force WebGPU unavailability and verify WASM/CPU fallback
  completes the task successfully, just slower.

## 5. Performance / Load Testing

**Hackathon scope:** Measure latency per pipeline stage (see ARCHITECTURE.md
budget table) on each test screen, on at least 2-3 different laptops with
varying hardware specs.

**Full Product scope:** Load-test the backend under concurrent request
volume representative of expected real usage; identify the point at which
latency or error rate degrades, and plan scaling accordingly (see
ARCHITECTURE.md Section 7).

## 6. Security Testing

**Zero-Leak Verification — now automated, and run on every request.**

This was written as a manual procedure: open DevTools, trigger the flow on each
screen, read the payload, confirm nothing sensitive is in it. Two problems with
that. It is the first thing skipped when someone is in a hurry before a demo,
and it is weaker than it sounds — a human scanning JSON is unlikely to notice a
password that was correctly replaced in its own field but also appears inside a
neighbouring element's text.

It now runs in code, before the transport seal is minted. Every value the
detector flagged is searched for across the whole serialised payload, and a hit
refuses transmission rather than reporting a warning. That covers the case the
per-element check structurally cannot see: redaction is per-element, so anything
that *copied* a sensitive string somewhere else — into a label, into an
adjacent text node, into the manifest — passes a check that only looks where it
expects the value to be.

Two details worth stating, because both are easy to get wrong:

- The raw values are passed in for the search alone. They are never written into
  the payload, never stored, never logged.
- The refusal message never names the value it found. That string reaches a
  console and possibly an error report, and naming the leaked value while
  reporting the leak would complete it.

Covered by `extension/tests/redaction.test.ts`, including a test asserting the
refusal stays silent about the content, and re-run across all four DOM screens
in `integration.test.ts`.

**What still needs a human before a demo:** confirm the run did not *refuse*.
A refusal is loud and specific, so this is a glance at the popup rather than a
procedure. Do it on the presentation laptop specifically.

**Adversarial Testing (Full Product):**
- Attempt to trick the PII detector with disguised sensitive fields (see
  Screen 5).
- Attempt a replay attack against the API (resending a captured request) and
  verify server-side handling doesn't cause unintended repeated actions.
- Attempt to submit a malformed request directly to the API (bypassing the
  extension) and verify the API Gateway rejects it cleanly (see API_SPEC.md
  error codes).
- Verify server-side logs never contain raw sensitive values, only metadata
  (see SECURITY_PRIVACY.md Section 5).

## 7. Accessibility Testing (Full Product)

- Keyboard navigation through the extension's status UI and settings.
- Screen-reader compatibility check for status announcements (e.g. "task
  complete," "error occurred").
- Color contrast check on the redaction overlay and status indicators.

## 8. Browser Compatibility Matrix

| Browser | Hackathon | Full Product |
|---|---|---|
| Chrome (latest stable) | Required, primary target | Required |
| Chrome (previous major version) | Nice to test if time allows | Required |
| Firefox | Not tested | Required |
| Edge | Not tested | Required (Chromium-based, likely low incremental effort) |

## 9. Regression Suite Maintenance

Every bug found during testing or after a real-world report should get a
corresponding regression test added before the fix is considered complete —
this is especially important for any privacy-related fix (see
SECURITY_PRIVACY.md Section 7, Incident Response Plan), where a regression
could mean a real data leak recurring.

## 10. Test Data Management

- Mock test screens (Section 1, Screens 1-5) should be version-controlled
  alongside the codebase, not ad-hoc or recreated each time.
- No real user data should ever be used in testing — synthetic data only,
  designed to exercise the same detection patterns as real data would.
