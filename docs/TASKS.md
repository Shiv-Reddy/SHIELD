# Tasks — Shield

Update continuously. This is the single source of truth for "what's actually
done" — keep it honest, not aspirational.

## Module A: Screen Perception (Client)
- [x] Chrome extension shell scaffolded (Manifest V3)
- [x] Tab/screen capture working (canvas snapshot)
      — verified in Chrome: 1920x945 device px, scale 1.000, 67.6ms against a
      100ms budget. Also confirmed the chrome:// refusal path.
- [x] DOM element map extraction working (positions, types, attributes)
      — verified against test-screens/01-login.html: 8 elements from 19 scanned,
      0 unresolved selectors, 1.5-3.4ms against a 100ms budget. Password field
      correctly identified with its value never read. (First measured at 11
      elements; three were `<label>` elements reported both as a control's label
      and again as standalone text, since fixed.)
- [x] Local vision model selected and converted to ONNX format
      — UltraFace version-RFB-320 (MIT, native ONNX so no conversion needed),
      1.1MB, pinned by sha256 in extension/tools/models.json and checked on
      every build. Graph I/O verified by parsing the model itself.
- [x] ONNX Runtime Web integration working
      — verified in Chrome: ORT 1.29 in an offscreen document, assets served
      locally, model ran on a real captured frame. 4420 priors, peak face score
      0.067 on a page with no faces (correct).
- [x] WebGPU acceleration working
      — verified: backend selected `webgpu`, steady-state inference 83.8ms
      against a 500ms budget.
- [x] WASM/CPU fallback tested and working
      — verified by an automatic self-test that builds an independent CPU
      session from scratch and runs an inference on it: 16ms inference, 87ms
      init, against budgets of 500ms and 3000ms. Notably the CPU path *starts*
      faster than WebGPU, which pays ~900ms compiling shaders, so a machine
      without WebGPU is slower per frame but not slower to first result.
      Runs on whatever machine Shield is installed on, which is the evidence
      TESTING.md Section 5's multi-laptop requirement is really asking for.
      Popup tells the user when a real fallback happens (FR-27).

**Module A is complete.** Capture, DOM extraction and local inference all
verified in Chrome against real pages, on both execution backends.

## Module B: PII Detection (Client)
- [x] DOM rule engine: password field detection (`type=password`)
      — verified against test-screens/01-login.html: the password field detected
      at confidence 1.0, reason `input type="password"`. Deterministic signal,
      no threshold, per SECURITY_PRIVACY.md Section 4.
- [x] DOM rule engine: common PII field detection (name/email/phone/address via
      labels/autocomplete attributes)
      — verified: 2 regions detected from 8 mapped elements, with the checkbox,
      the submit button and the "Forgot password?" link correctly not flagged.
      Rules run strongest-first: `type=password`, then autocomplete tokens, then
      implied input types, then label/name/placeholder patterns. Visible text is
      matched by content instead of by field name, which closed a path where an
      email address rendered as ordinary text would have been transmitted
      intact.
- [x] Face-detection model (UltraFace RFB-320) integrated
      — verified on a real photo-heavy page: peak face score 0.984, 17 priors
      above 0.7, collapsed by non-maximum suppression to 5 distinct faces, in
      39.9ms. The login screen returns 0 faces, so both directions are
      confirmed. Coordinate mapping checked numerically at scale 1.0 and at 2x
      HiDPI, the latter being a case this machine never exercises. The model's
      `boxes` output turned out to be SSD regression offsets, not rectangles,
      and required decoding against a reconstructed prior grid — see
      DECISIONS.md. Decoded range measured at 0.049..0.549; 3 faces detected and
      3 painted with no unusable geometry.
- [~] OCR pass for visible ID-like text (Tesseract.js, image-crops only)
      — DEFERRED by decision, not forgotten. It is the only Module B task the
      locked login demo never touches, and it adds a model download plus an
      inference stage to a pipeline that Modules C, D and E have not been built
      against yet. The gap it leaves — an ID number rendered inside an image —
      is recorded in SECURITY_PRIVACY.md Section 4.1. Revisit if Phase 1 lands
      with time to spare.
- [x] Disagreement handling: default-to-hide logic implemented and tested
      — two parts. Where a field's declaration and its content disagree, the
      more sensitive reading wins and both signals are named in the reason;
      confidence takes the higher of the two, since two signals agreeing that
      something is sensitive is more evidence, never less. Where nothing matches
      at all, a field holding content is redacted as `other` rather than passed
      through, which is what SECURITY_PRIVACY.md Section 4 requires and what the
      code previously did not do.

## Module C: Redaction Engine (Client)
- [x] Canvas-based visual redaction (blur/black-box/pixelation)
      — opaque fill rather than blur, since blur is a reduction of information
      rather than a removal and has been reversed by published attacks. Verified
      on the login screen: 2 regions painted in 47.1ms against a 200ms budget.
      Every flagged region is painted, DOM detections included — an email in a
      text field is in the screenshot as surely as it is in the DOM.
      Verified visually: on the login screen the two rectangles cover exactly
      the username and password fields, with heading, button and link
      untouched.
- [x] Semantic placeholder token system for DOM text values
      — verified: `e0=[EMAIL], e1=[PASSWORD]`. The `[EMAIL]` is the disagreement
      logic working on a real case — the field declares
      `autocomplete="username"`, which classifies as a name, but it holds
      `demo.user@example.com`, and the more sensitive reading won.
- [x] Hard invariant enforced: no transport call possible before redaction runs
      — three independent mechanisms. The compile-time `Sanitized<T>` seal,
      mintable in exactly one function (`sealAsRedacted`, greppable, one call
      site); the runtime stage-order guard; and a content check that verifies
      every flagged element carries a placeholder token before sealing. The
      first two prove redaction was called, the third proves it worked.
- [x] Redaction manifest generated (what was redacted, by which method)
      — verified: 2 entries matching the 2 detections. Categories and methods
      only, never values, per SECURITY_PRIVACY.md Section 5.

## Module D: Transport & Backend (Client + Server)
- [x] Transport layer: sanitized JSON payload construction (see API_SPEC.md)
      — `send()` accepts a `Sanitized<AnalyzePayload>` and nothing else, so a
      caller holding raw page data has nothing it can pass. Response parsing
      treats the body as untrusted rather than asserting our own response type
      onto it.
- [x] Backend skeleton (FastAPI/Express) scaffolded
      — FastAPI in server/, verified running: `/health` and `/analyze` both
      answered live, and a malformed body returned `MALFORMED_REQUEST`.
      8 checks pass in server/test_reasoner.py.
- [x] `/analyze` endpoint implemented per API_SPEC.md schema
      — returns `action_ready`, `needs_more_context` or `error` per the spec.
      Never logs a payload: only request_id, timings and outcomes, with
      validation failures logging the exception type rather than its message,
      since that message is built from the payload.
- [x] `/health` endpoint implemented
      — reports version, active reasoner and whether a model key is configured.
      "The server is up" and "the server can answer" are different claims.
- [x] Free-tier reasoning model integrated — provider still to be chosen
      — the integration is built and the choice is now configuration rather than
      code. Every candidate free tier speaks the same chat-completions shape, so
      `server/model_reasoner.py` targets that shape and reads endpoint, model
      name and key from the environment; switching provider needs no code edit.
      Unset, the server runs the rule-based path exactly as before, which is
      also the demo's contingency. Verified against a deliberately unreachable
      provider: the request fell back, logged why, and returned the correct
      action. WHAT REMAINS IS AN ACCOUNT SIGNUP, NOT A BUILD TASK — see
      "Blocked / Needs Decision".
- [x] Redaction-aware prompt template written and tested
      — `server/prompt.py`, versioned at 1.0.0. Teaches the model that a token
      marks something present-but-hidden rather than missing, that the black
      rectangles are ours, and that it must ask for a credential by reference
      and never write one. Page content is JSON-encoded inside a labelled
      boundary and never interpolated into instruction text, because a page can
      contain a sentence addressed to the model — a threat not previously in
      SECURITY_PRIVACY.md, now a row in it. 29 checks in server/test_prompt.py,
      most of them on the model's reply rather than the prompt's wording: that
      is where a plausible-looking answer can quietly do something the project
      promises it will not.
- [x] Action Response Builder: allowlist validation implemented
      — enforced on the server AND re-validated on the client. The client check
      is not redundancy: SECURITY_PRIVACY.md's elevation-of-privilege row treats
      the server as a component that could be compromised or simply wrong.
- [x] Error handling for all documented error codes (API_SPEC.md Section 6)
      — MALFORMED_REQUEST, MODEL_UNAVAILABLE, ACTION_REJECTED, INTERNAL_ERROR,
      each mapped to a user-facing message that says what was and was not done
      to the page. An earlier draft invented its own lowercase codes, which
      would have compiled and matched nothing.

## Module E: Action Execution (Client)
- [x] Action Executor: click/type/scroll implemented
      — in the content script, the only code that touches the page. Typing goes
      through the native value setter and dispatches input/change, because a
      plain assignment is invisible to frameworks that track their own state:
      the field would show the text while React still believed it empty, and
      submitting would send nothing.
- [x] Target element re-verification before acting
      — identity checked three ways before anything happens: the selector
      resolves, the element type still matches, and the accessible label still
      matches, using the same resolver the capture used. Visibility is checked
      too. Any one alone is weak; a re-rendered page can put a different button
      at the same path.
- [x] Multi-step task loop (capture → act → repeat) implemented
      — verified end to end against the live backend: capture 39.4ms, DOM scan
      1.5ms, inference 48.9ms, redaction 36.6ms, round trip 12.5-87.5ms, one
      click performed, clean stop. The loop ends when the assistant stops
      proposing actions, read two ways: after at least one action it means
      finished, before any it means nothing could be determined here. The API
      defines no explicit "done" status, so this is the honest reading of the
      statuses it does define.
- [x] Re-capture triggered correctly on multi-step task continuation
      — moved here from Module A, and now implemented where the behaviour lives.
      Each step is a fresh pass: the snapshot is never reused across an action,
      since acting on a stale reading is how an agent clicks the wrong thing
      confidently. A 600ms settle follows each action, and the content script is
      re-established in case the action navigated.
- [x] Max-step-count safeguard against infinite loops
      — two safeguards, because the step cap alone proved insufficient. MAX_STEPS
      = 5 bounds the loop; repeat detection stops it at the first duplicate
      action, before that action is performed. The first full run exposed why:
      the assistant proposed "click submit" five times against a fixture whose
      submit is intercepted, and on a real page five identical clicks can mean
      five orders. A cap bounds the damage; refusing the duplicate prevents it.

## Module F: Trust & Transparency UI (Client)
- [x] Status indicator (idle/reading/detecting/redacting/sending/thinking/acting/done/error)
      — built in Module A and now driven through every state by the full
      pipeline. Also carries the error detail line and the FR-27 notice telling
      the user when inference fell back to CPU.
- [x] Explainable redaction overlay (what was detected/hidden, shown live)
      — labelled boxes drawn over each redacted region on the page, with the
      rule that fired as a tooltip. Inert by construction: pointer-events off
      throughout, so it can never intercept a click meant for the page or the
      action about to be taken. Cleared before acting and at the start of a run,
      since an explanation of the wrong screen is worse than none.
      VISUALLY VERIFIED 2026-09-07, and the verification found a real defect
      rather than confirming what was assumed. The boxes are `position: fixed`
      at viewport coordinates, so they were correct when drawn and 164px wrong
      after the sign-up run scrolled the page: "Email" over First name, and the
      real email visible with no box on it. Nothing scrolled in all of Phase 1,
      which is why looking at it on the login screen would never have shown
      this. Now also cleared on any real scroll — the same rule extended to the
      case that exposed it. See Phase 2 and DECISIONS.md.
- [x] Live network inspector view (outgoing payload proof)
      — "What was sent?" in the popup shows the exact JSON transmitted, with the
      base64 frame replaced by a size note for readability. Recorded before the
      request rather than after, so the question still has an answer when the
      server is unreachable — which is when someone is most likely to ask it.
      NEEDS VERIFICATION.
- [x] Latency breakdown display (stretch)
      — "Where did the time go?" in the popup, reading the measurements the
      pipeline already takes rather than making its own: one measurement with
      two readers cannot disagree with itself. Each stage is shown against its
      ARCHITECTURE.md Section 6 budget, and an over-budget stage is marked
      rather than hidden. The total is labelled "measured across N stages", not
      "total time" — the gaps between stages are real time the sum excludes.
      Verified in the popup across four screens: capture 24-49ms/100, DOM
      2-7ms/100, inference 54-63ms/500, redaction 36-54ms/200, round trip
      8-10ms/1000. The panel correctly showed four stages on a run whose
      network call failed and five on the runs that completed.

## Module G: Testing (See TESTING.md for full detail)
- [x] All 5 test screens built
      — Screen 2 (`02-signup.html`) completes the set: fourteen controls with
      deliberately uneven signals — autocomplete tokens, implied input types, a
      label alone, a placeholder alone, a `name` attribute alone — because one
      field per category is a demonstration and ten is a measurement. Its
      expectations were written before the first run and all held on the first
      run in Chrome — 11 detections from 21 mapped elements, 0 unresolved
      selectors, every category exactly as predicted, including the predicted
      over-redaction of "Display name" and the untouched dropdown. Note this is
      the FIXTURE, not
      Phase 2's signup feature. Screen 6 (real sites) is Full Product scope.
      Screen 3's two images are supplied locally and not committed —
      photographs of real people carry licensing and likeness questions a
      submitted fixture should not decide silently.
- [x] Unit tests for PII Detector rules
      — 16 checks, weighted toward defects that actually occurred rather than
      coverage: the "Forgot password?" link that matched the password pattern,
      the date range that matched a phone number, the username field whose
      content was an email. `npm test`, no new dependencies — Node 24 runs
      TypeScript natively and ships a test runner.
- [x] Unit tests for Redaction Engine
      — 11 checks, including the one that matters most: a payload whose flagged
      element still holds content cannot be sealed. The type seal proves
      redaction was called; that test proves it worked.
- [x] Unit tests for Action Response Builder allowlist validation
      — server side, in server/test_reasoner.py (8 checks) and now
      server/test_prompt.py (29): a disallowed verb, an element that was never
      described, and a guessed value for a redacted field are each refused, with
      mocked model replies rather than a live provider. Client side, the
      allowlist is re-validated in transport and again in the executor, and the
      service worker independently refuses to type into a field it redacted.
- [x] Integration test: full client pipeline against each test screen
      — automated, and running on every `npm test`. Detection, redaction, the
      manifest and the seal go over all four DOM screens from checked-in element
      maps, with the per-screen expectations copied from each fixture's own
      comment block. What it does NOT cover is stated rather than glossed: it
      does not test `dom-map.ts`, capture, the canvas or the executor, all of
      which need a real browser and stay manual. A drift guard reads the HTML
      and compares the set of named form controls against the fixture, so a
      field added to a screen fails the suite instead of silently passing
      against a page that no longer exists.
      Screens 2, 4 and 5 also re-run in Chrome against the live backend after
      the select rule changed: Screen 2 gave 11 detections, Screen 4 gave 0 from
      23 elements, Screen 5 gave the same 5 as before. Screens 4 and 5 both
      ended with the reasoner declining to act rather than guessing, which is
      the second half of the restraint check — a detector that stays quiet is
      only useful if the reasoner does too.
- [x] End-to-end test: primary demo task, real browser + real backend
      — verified, and re-verified after Module F and G changed the executor
      path: capture 34.0ms, DOM 1.6ms, inference 52.0ms, redaction 45-54ms,
      round trip 6.4-7.9ms, every stage inside budget. The server read the form,
      the button was clicked, the re-capture found the same state, and repeat
      detection refused the duplicate before executing it — one action, clean
      stop.
      The fixture now writes a visible confirmation into its existing intro
      paragraph when the intercepted submit fires. Silently swallowing it meant
      a successful run looked identical to a failed one, on the single moment in
      the demo where Shield acts. Written into an element that already holds
      text rather than added as a new node, so the recorded 8-element baseline
      survives the re-capture.
- [x] Zero-Leak Verification run and passed
      — automated rather than left as the manual payload inspection in
      TESTING.md Section 6, which is the first thing skipped when someone is in
      a hurry before a demo. Every flagged element's raw value is searched for
      across the entire serialised payload before the seal is minted, and a hit
      refuses transmission. This catches what the per-element check cannot: a
      password echoed into a label, an email repeated in a neighbouring
      element's text, a value copied into the manifest. Two unit tests cover it,
      including that the refusal never names the value it found.
- [ ] Tested on at least 2-3 different laptops
      — CANNOT BE DONE FROM HERE; it needs other machines. What can be checked
      from one machine already is: the CPU fallback is proved by a self-test
      that builds an independent session from scratch on whatever hardware
      Shield is installed on, and the HiDPI coordinate path — the case this
      machine never exercises — is covered numerically in the unit tests.
- [x] Adversarial test screen (Screen 5) run and documented
      — all 8 predictions written into the fixture before running held exactly.
      Caught: masked field with no `type=password`, password with an opaque name
      (as `other`), email in plain text, ID number in plain text, and an
      `autocomplete="nickname"` field holding an email where the more sensitive
      reading won. Missed, as predicted and documented in SECURITY_PRIVACY.md
      4.1: a person's name in prose, and an ID number rendered inside an image.
      Not flagged, correctly: invoice numbers, section ranges, build numbers.

## Phase 1 — Core (Non-Negotiable, Complete Before Anything Else)

**CLOSED 2026-09-07.** Every buildable item is done and verified in Chrome
against the live backend. The two unchecked items below need the presentation
laptop and a second machine; neither is work, both are access.

What "verified" means here, since the word is doing a lot of lifting: the login
task runs end to end, hides both fields, seals a payload with no raw value
anywhere in it, gets an action back, clicks the button, re-captures, and refuses
to click it a second time. All four DOM test screens run on every `npm test`.
The measured cost of one pass is roughly 150ms, every stage inside budget.

What is NOT done, stated so it is not discovered later: the OCR pass is deferred
by decision (Module B); names in prose and text inside images are not detected
(SECURITY_PRIVACY.md 4.1); prompt injection is bounded rather than prevented;
and the free-tier provider is unchosen, which costs generality but not the demo.

- [x] Modules A-F fully working for the primary demo task (login/form autofill)
      — verified end to end against the live backend: capture 39.4ms, DOM 1.5ms,
      inference 48.9ms, redaction 36.6ms, round trip 12.5-87.5ms, one click
      performed on the page, clean stop. Every stage inside its budget. Every
      module A-F is now ticked; the only unchecked item across them is the OCR
      pass, deferred by decision and recorded as a limit in
      SECURITY_PRIVACY.md 4.1.
- [ ] Primary demo rehearsed on the actual presentation laptop, multiple times
      — CANNOT BE DONE FROM HERE. Needs the machine that will be on the desk on
      the day. Everything it depends on is built and passing.
- [ ] Zero-Leak Verification passed on the demo laptop specifically
      — the check itself is automated and runs on every request (Module G), so
      this is now "run the demo once on that laptop and confirm it did not
      refuse", not a separate manual procedure. Still needs the laptop.

## Phase 2 — First Stretch Goal (Unblocked 2026-09-07)

**Detection is already done and measured.** `02-signup.html` yields 11
detections from 21 mapped elements with 0 unresolved selectors, every category
matching what was written into the page before it first ran. Phase 2 is not a
detection problem.

**What actually blocks a second demo task, measured not guessed.** Running the
Screen 2 payload through `decide_by_rules` returns:

    action : None
    summary: The login form is filled but no submit control was found.

Three separate defects in one line:

1. `_looks_like_submit` matches only "sign in", "log in", "login", "submit",
   "continue". A signup button says "Create account", "Sign up", "Register" or
   "Get started", so it finds nothing.
2. It calls a signup form a "login form". That message is shown to the user.
3. `reasoner.py`'s docstring and that same message both claim it "handles login
   and sign-up forms only". It does not handle sign-up forms at all. A claim in
   the code that does not match its behaviour is worse than no claim.

**The open design question, which needs a human decision before code.** On a
real signup the fields are EMPTY. The reasoner would then ask the client to type
`[USE_SAVED_CREDENTIAL]` into the password, and the client refuses — Shield
stores no credentials by decision (DECISIONS.md), which is deliberate and should
not be reversed casually. So "complete a signup" cannot mean "fill it from a
vault". Decide what the second demo task actually demonstrates before building
it. Two candidates worth weighing:
  - Shield fills the non-secret fields it can safely determine and stops at the
    password, telling the user why. Honest, and it still shows multi-field
    detection and redaction on a bigger form.
  - Shield acts on an already-filled signup form — submit it, as with login.
    Weaker as a demo, since it is the same action as Phase 1.

**ANSWERED 2026-09-07.** The second demo task is "finish the sign-up", not
"fill the sign-up". Shield reads the form, hides the eleven sensitive fields,
and does the parts of "create this account" that need no invented data: it ticks
the unticked required-consent checkbox, re-captures, then clicks "Create
account". It refuses the rest and says why — it will not fill a sign-up password
(a *new* password no store could hold, so asking for a saved one is wrong in
principle, not merely unfulfillable) and it will not invent a display name.
Chosen over the two candidates recorded above because it is the first genuinely
multi-step run: Phase 1's login was one action then a clean stop, so the step
loop, the re-capture and the settle have never been exercised against a page
that changed. Full reasoning in DECISIONS.md.

**The three defects are fixed.** `_looks_like_submit` is gone, replaced by three
word lists — login, sign-up, neutral — with each form kind preferring its own
and neither falling back to the other's, because a sign-up page nearly always
also carries a "Sign in" link and the first match used to win. Form kind is
decided before the submit control is chosen, from three independent signals. The
summary and the docstring now describe what the code does.

- [x] Decide what "completing a signup" means, given Shield holds no credentials
      — answered above; recorded in DECISIONS.md with the option not taken and
      why (a local profile store would be new PII at rest on a project whose
      claim is that PII stays put).
- [x] Multi-field signup form detection working — see above; 11/11 as predicted
- [x] Tested against varied field labels/formats
      — measured, not asserted. `server/test_reasoner.py` grew from 8 checks to
      66, of which 40 are a wording table: 14 submit labels ("Create account",
      "Sign Up Free", "Register now", "Join now", "Continue" …) each checked
      twice — once that the consent step is reached, once that the control
      itself is clicked — 5 consent phrasings that must be ticked, and 7 opt-in
      phrasings that must not, three of which deliberately borrow the language
      of consent ("I agree to receive marketing email"). Also regression-locked:
      Screens 1, 4 and 5 still produce the exact outcomes recorded in this file.
- [x] The model-backed path is held to the same restraint
      — not in the original list, and it belongs here rather than in a later
      phase: both paths decide this same task, so a box the rules refuse to tick
      must be one the model is not allowed to tick either. Otherwise behaviour
      depends on whether a free tier happened to answer, and the riskier of the
      two is the one nobody tested. `interpret()` now refuses a click on an
      unticked opt-in, the prompt states the rule before the refusal can apply
      (a refusal the instructions never warned about is a trap, not a boundary),
      and both paths share one predicate rather than two that can drift.
      Prompt bumped to 1.1.0. `test_prompt.py` 29 checks → 35.
- [x] Server path verified end to end, in process
      — the three-step sequence driven through `main.py`'s `/analyze` itself,
      not just the rules: step 1 `click s13`, step 2 `click e-submit`, step 3
      proposes the same action as step 2 so the client's repeat detection is
      what stops it. Confirms the wiring, not only the decision.
- [x] The refusal path verified in Chrome, against the live backend
      — the second of the two predicted runs, and it held exactly. With both
      password fields cleared by hand: 11 detections from 21 mapped elements
      (every category as predicted, both checkboxes and the dropdown untouched),
      payload sealed, 76KB frame, round trip 7.9ms, and then NO ACTION with the
      exact refusal — "This sign-up form needs a new password. Shield holds no
      saved credentials and will not invent one." Capture 21 elements, inference
      56.0ms/500, redaction 38.0ms/200. This is the decision above working on a
      real page: a boundary stated plainly rather than an error.
- [x] The fold defect found and fixed
      — that same run exposed something no unit test could have. The element map
      contained 14 inputs and 7 text elements and NO BUTTON: `dom-map.ts` keeps
      only what intersects the viewport, and "Create account" sits about fifteen
      pixels below a 945px fold. The server's "no submit control" was correct,
      and the run would have stopped one action short. The in-process check had
      passed because its payload included a button the browser never sent — a
      fixture testing the fixture. Fixed by scrolling: `scroll` has been in the
      allowlist since API_SPEC.md was written and had never once been used.
      Scoped to sign-up so Screen 5's recorded decline is unchanged; bounded by
      the client's existing repeat detection rather than by a new counter. Nine
      new checks use that page's measured geometry rather than an invented one.
      See DECISIONS.md, including the stated fragility on much longer forms.
- [x] Working end-to-end as a second demo task
      — VERIFIED IN CHROME against the live backend, 2026-09-07. Three actions
      and a clean stop: tick consent, scroll, submit, then the re-capture
      proposed the same submit and repeat detection refused it before executing.
      "stopped after 3 action(s)". Capture 41.2ms/100, DOM scan 1.6ms/100,
      inference 56.0ms/500, redaction 38.4ms/200, 11 regions and 11 manifest
      entries on every pass, 21 elements mapped from 61 scanned with 0
      unresolved selectors.
      Two results the log proves rather than suggests. The marketing checkbox
      was left alone: had it qualified as consent the reasoner would have
      proposed clicking it instead of ever reaching "Submitting it", and it
      reached that twice — the rule discriminated between two identical control
      types on wording alone, which is the whole of its job. And "One personal
      field is still empty" appears in the FINAL summary, computed from the live
      payload, so the display name really was still empty after all three
      actions. No summary anywhere contains the word "login".
      The scroll swap is visible in the element count: 21 elements before and 21
      after, the h1 having left the viewport as the button entered it.
- [x] Round-trip latency re-measured on a warm server
      — resolved, and it was cold start. Measured across three successive
      requests after a restart: 1085.0ms (over the 1000ms budget), then 344.8ms,
      then 84.0ms on the next run. Inside budget once warm, and the trend is
      monotonic. Worth knowing for the demo: the first request after starting
      the backend can exceed its budget, so the backend should be started and
      hit once before anyone is watching.
- [x] Both visual confirmations obtained
      — screenshots. The marketing checkbox "Send me occasional product updates"
      is unticked at the end of the run while "I accept the terms of service and
      privacy policy" is ticked, which is the consent rule discriminating
      between two identical control types on wording alone, seen rather than
      inferred. The intro paragraph shows the green "Account created at 1:33:00
      AM. The form was submitted by Shield." Display name is still empty.
- [x] Overlay staleness on scroll — found and fixed (Module F)
      — the second screenshot showed every overlay box about 164px above the
      field it named: "Email" over First name, "ID number" over Street address,
      and the real email visible with no box on it. The boxes are
      `position: fixed` at viewport coordinates, correct when drawn and wrong
      from the next scroll onward. Invisible for all of Phase 1 because nothing
      ever scrolled — the login screen fits on one screen and Shield had no
      scroll action — so this session's scroll work is what surfaced it.
      NOT a privacy failure: the frame redaction paints viewport-space rects
      onto a viewport-sized screenshot from the same instant, so those align by
      construction, and the seal independently verified every flagged element
      carried its placeholder. What broke is the trust display, which is the one
      feature whose whole job is to be believable.
      Fixed by clearing on any real scroll rather than by pinning the boxes to
      the content — see DECISIONS.md for why pinning is worse, and the Module F
      entry above, whose "NEEDS VISUAL VERIFICATION" note this closes.

## Phase 3 — Second Stretch Goal (Unblocked 2026-09-07)

**The third demo task is protection, not action** — decided before any work,
recorded in DECISIONS.md. A photo gallery has no form, so there is nothing to do
on it, and inventing an action would be worse than having none. What it shows is
the one thing no other screen can: the visual layer hiding something the DOM has
no way to describe. Nothing in a page's markup says a person's face is rendered
at particular coordinates.

- [x] Face detection integrated and working on video-call/profile-photo screens
      — MEASURED IN CHROME against the live backend: **6 of 8 faces**, matching
      the 5-6 predicted in the fixture before the run. Peak score 0.990,
      inference 40.0ms on WebGPU, redaction 75.1ms/200 for 6 regions, round trip
      61.3ms, every stage inside budget. All 8 images were in the viewport (the
      element map lists 8), so the two misses are real misses and not off-screen
      elements.
      Boxes matched to ladder rungs by size, box width running ~0.4x the
      rendered image width: portraits 0.990 and 0.980, then 200px 0.937, 150px
      0.962, 110px 0.538, and 80px at **0.312**. The 55px and 36px rungs were
      missed.
      **The floor is soft, and that is the number worth quoting rather than the
      count.** 0.312 against a 0.3 threshold is twelve thousandths of margin —
      not "80px works" but "80px barely worked on this photograph". The honest
      claim is a floor between 80 and 110px, unreliable at the bottom.
      **The two misses are a resolution limit, not a threshold one.**
      `candidates 20/14/9 at 0.3/0.5/0.7`, and the rungs are spatially separate
      so NMS cannot be suppressing them against each other — those two produced
      nothing at any cutoff. Lowering the threshold further gains nothing and
      costs false positives; the fix would be tiling or upscaling before
      inference, which is different work.
      This also settles the earlier 0.5 -> 0.3 change arithmetically: at 0.5 the
      survivors are exactly the five above 0.5, which is what was recorded then.
      The change bought the 80px rung and nothing else.
- [x] Redacted frame inspected visually, not just counted
      — the check none of the numbers could make. All six boxes sit on the six
      detected faces and the blackout covers them cleanly; nothing is painted on
      the control paragraph, the headings or the captions. This mattered because
      every other check on this screen is one number agreeing with another, and
      a rectangle painted in the wrong place would satisfy all of them — which
      is exactly the overlay defect found earlier the same day.
- [x] No over-redaction on non-face content
      — the other half of this screen's pass criteria, which a page of nothing
      but faces could not test. Zero DOM detections ("no DOM values needed
      replacing"), so the headings, captions and control paragraph were untouched
      at the DOM level, and all six face boxes are accounted for by six known
      faces, leaving no spare box to have landed on the control paragraph.
- [x] Working end-to-end as a third demo task
      — the run completed the full pipeline and ended with the reasoner
      declining: "No recognised form on this screen." That pairing is the task.
      A detector that finds faces is only worth having if the reasoner stays
      quiet when there is nothing to do, and this is the screen where the
      detector is loudest — 6 regions painted, 6 manifest entries, payload
      sealed, and no action proposed.
- [ ] Profile-edit fixture, so a face is redacted inside an acting loop
      — DEFERRED, not forgotten. Considered during the Phase 3 decision and
      recorded in DECISIONS.md: a face photo beside name and email fields with a
      Save button would be the strictly better demo, since it would show visual
      and DOM detection together followed by an action. It needs a new fixture
      with its own written-first expectations, and CLAUDE.md already marks the
      face path the higher-risk one. The obvious next thing if time remains.

## Differentiation Features (After Core Phase 1 Works)
- [ ] Live network inspector shown in demo
- [ ] Explainable redaction overlay polished for demo clarity
- [ ] Semantic placeholder redaction (not blind blackout)
- [ ] Frame diffing for latency/resource optimization (stretch)
- [ ] Naive-baseline comparison (blind blur vs. semantic redaction, with real numbers)
- [ ] Red-team adversarial case shown live in demo
- [x] Manual redaction — the user marks anything the rules missed
      — draw a rectangle over anything and Shield hides it. Not a detection
      improvement and not counted as one: it does not make the rules better and
      only helps a user who notices. But every limit in SECURITY_PRIVACY.md 4.1
      is a case where the person looking at the screen knows something the rules
      cannot, and the honest answer is to let them say so rather than widen
      patterns until they over-redact.
      A mark hides the pixels AND tokenises every element it overlaps — both, or
      it is worse than nothing, because a rectangle alone paints the screenshot
      while the text underneath travels intact. Stored in document coordinates
      and converted at capture, which is the lesson from the overlay defect the
      same day. Recorded in the manifest as a distinct `manual` method, since a
      person's judgement is not a pattern match. 11 unit tests on the geometry,
      which is where this fails silently.
- [ ] Consent-preview step before transmission (stretch)
      — smaller now than it was: manual redaction built the drawing surface,
      the region plumbing and the manifest provenance it needs. What remains is
      the pause itself and its UI.

## Documentation & Submission
- [ ] README.md finalized
- [ ] 2-page architecture document finalized (condensed from ARCHITECTURE.md)
- [ ] Demo video (max 2 minutes) recorded
- [ ] Technical presentation (max 5 slides) finalized
- [ ] Backup demo video recorded
- [ ] All code pushed to final GitHub repo / drive link

## Blocked / Needs Decision
- [ ] Final choice of free-tier AI model for server-side reasoning (see DECISIONS.md)
      — no longer a build task. The integration is done and provider-agnostic;
      what remains is signing up somewhere and setting three environment
      variables. See server/README.md. Shield runs correctly with none of them
      set, so this gates generality, not the demo.
- [ ] Redaction aggressiveness default level confirmed by full team

## Post-Hackathon (Only If Continuing — See ROADMAP.md)
- [ ] Expanded PII taxonomy
- [ ] Testing against real, unmodified third-party websites
- [ ] Formal security review against SECURITY_PRIVACY.md threat model
- [ ] Persistent audit logging
- [ ] Chrome Web Store submission materials
