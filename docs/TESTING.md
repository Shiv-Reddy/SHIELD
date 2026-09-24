# How Shield is tested

What is tested now, and what a real product would add.

**413 checks in the extension and 138 on the server.** No test framework, no
network, no API key — they run anywhere the code runs. That was deliberate: a
suite that needs an install step is one somebody eventually skips.

## 1. The test screens

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

### Screen 6: Profile Edit — Face, PII and an Action At Once
A profile page with a portrait, declared PII fields, a benign field holding
content, an author-supplied dropdown, prose containing both a name and an email,
and a Save button. The agent is asked to change a field and save.
**Pass criteria:** the face is detected and redacted; declared fields are
categorised from their own declarations; the action target's value is hidden AND
the agent can still type into it; detection fires again on the re-capture after
acting; the repeat guard refuses a second identical save. Nothing flagged on the
dropdown, the button or the link.
**Why it is separate from Screens 2 and 3:** those test the halves. This is the
only screen where the visual model, the DOM rules and the reasoner must all work
in one pass, which is the combination a real page presents. The DOM half of its
expectations is verified without a browser by
`extension/tests/profile-edit-fixture.test.ts`, so a failed browser run can only
be the face, the action sequence, the re-capture or the repeat guard.
**Status:** Built, scanned on Firefox and run as a task on Chrome,
2026-09-21. The client half passes completely — face at 93%, the action target
redacted, the payload sealed. **The reasoner declines**, correctly, and the task
as written turned out to be one no stateless reasoner can express: see
DECISIONS.md 258. Claims 2 and 3 remain untested.

**Original status line:** Scanned on Firefox 2026-09-21. **Every prediction held** —
8 findings (7 fields plus the face at 97%), the select and the button clean, the
name in prose missed as documented, and the uncertain date-of-birth line correct.
**The acting loop is still untested**: that was a scan, not a task, so the three
claims this screen exists for — typing into a field whose value is redacted,
detection firing again on the re-capture, and the repeat guard refusing a second
save — remain unverified. Run it as a task to close them.

### Screen 7 (Full Product): Real, Unmodified Third-Party Websites
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

## 8. Which browsers are tested

| Browser | Status |
|---|---|
| Chrome (latest) | **Main target.** All six screens run, fully measured |
| Firefox | **Tested and measured.** All six screens run. 364ms per pass once warm |
| Edge | **Verified** on the Chrome bundle, unchanged |
| Chrome (previous version) | Not tested |

Chrome and Firefox were measured on the same laptop on the same day, so the
figures can be compared. **Only one machine has been measured** — a second
would either confirm the resource numbers or not, and we have not run it.

## 9. Every bug gets a test

A fix is not finished until there is a test that would have caught it. This
matters most for anything privacy-related, where the same bug coming back means
a real leak.

Two recent examples, both found on real pages rather than by the tests:

- A name hidden in a form field but still present in a button's label. The
  outgoing-message search caught it and refused to send
- A name matcher that missed any name preceded by a capitalised word

Both now have tests, and one of those tests checks the **general** property —
anything the detector flags, the text cleaner must remove — so the next
category taught to one path and not the other fails immediately.

## 10. Test Data Management

- The test screens live in the repository alongside the code, not rebuilt each
  time from memory.
- **No real user data, ever.** Synthetic only, written to trigger the same
  patterns real data would. The one exception is face photographs, which a
  detector trained on photographs needs — those are kept off the repository and
  each person supplies their own.
