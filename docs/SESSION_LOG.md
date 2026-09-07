# Session Log — Shield

Append one entry per work session, oldest at top. This is how project context
survives between separate Claude Code sessions, since it has no memory of
past conversations — only what's written here.

Each entry must have: date, what was completed, current blockers, and exactly
what the next session should start with. Never skip writing this at the end
of a session, even a short one.

---

## Template (copy this for each new entry)

```
### [DATE] — Session N

**Completed this session:**
-

**Blockers / open questions:**
-

**Next session should start with:**
-

**Decisions made this session (also added to DECISIONS.md):**
-
```

---

## Entries

### [Not yet started] — Session 0

**Completed this session:**
- Full documentation set finalized (PRD, ARCHITECTURE, SECURITY_PRIVACY,
  API_SPEC, TECH_STACK, EVALUATION_CRITERIA, TESTING, RISKS, ROADMAP, TASKS,
  DECISIONS, DEMO_SCRIPT, README, CLAUDE.md, this file).

**Blockers / open questions:**
- Final choice of free-tier reasoning model not yet locked (see DECISIONS.md).
- Local vision model not yet selected/downloaded.

**Next session should start with:**
- Module A, Task 1 in TASKS.md: scaffold the Chrome extension shell (Manifest V3).

---

### [2026-09-06] — Session 1

**Completed this session:**
- Module A, Task 1: Chrome extension shell scaffolded (Manifest V3). Checked
  off in TASKS.md. Everything lives in `extension/`, leaving room for the
  backend at `server/` when Module D starts.
- Toolchain: TypeScript + Vite, two-pass build (ES modules for popup and
  service worker, a separate IIFE pass for the content script). `npm run build`
  and `npm run typecheck` both clean, `npm audit` reports zero vulnerabilities.
- `src/lib/types.ts` — the pipeline type contract for Modules A through E,
  written against API_SPEC.md Section 3 and the action allowlist in Section 5.
  Includes `Sanitized<T>`, a phantom type that makes transmitting unredacted
  data a compile error.
- `src/lib/status.ts` — the nine-state status vocabulary from PRD.md Section 14
  plus the ordered pipeline stage list.
- `src/lib/messages.ts` — typed message envelopes for popup / service worker /
  content script, replacing Chrome's untyped messaging API.
- `src/background/service-worker.ts` — orchestrator shell: run state machine,
  message routing, on-demand content script injection, per-tab run scoping, and
  the runtime stage-order guard that refuses to reach `sending` unless
  `redacting` completed.
- `src/content/content-script.ts` — injected on demand only, double-injection
  guarded, answers PING. `EXTRACT_DOM` deliberately returns null until Module A
  Task 3 lands, so the orchestrator fails closed rather than mistaking an empty
  element map for a page with nothing sensitive on it.
- `src/popup/` — status indicator (dot + label, pulsing while working), task
  input, run/cancel, error surface. Reads state from the worker; holds none of
  its own, since a popup is destroyed on blur.
- `tools/make-icons.mjs` — dependency-free PNG generator for the icon set
  (shield with a redaction bar across it). Verified at 16px and 128px.
- `extension/README.md` — build/load instructions, permission rationale, and
  the two things a contributor must understand before touching the pipeline.

**Notes on what is deliberately NOT built:**
- Every pipeline stage after the shell throws "not implemented" rather than
  returning a placeholder success value. A stage that pretends to have redacted
  something is more dangerous than one that refuses to run.
- The popup is the status shell only. The explainable redaction overlay and the
  live network inspector are Module F and were not started.

**Blockers / open questions:**
- Unchanged from Session 0: free-tier reasoning model not locked (Module D),
  local vision model not selected (Module A, Task 4).
- Not yet verified by loading `extension/dist` into a real Chrome profile —
  the build output and every manifest file reference were validated
  programmatically, but nobody has clicked the icon yet. Worth two minutes at
  the start of next session.

**Next session should start with:**
- Load `extension/dist` unpacked in Chrome, confirm the popup opens and the
  content script injects on a real page.
- Then Module A, Task 2 in TASKS.md: tab/screen capture via
  `chrome.tabs.captureVisibleTab`, wired into the `reading` stage.

**Decisions made this session (also added to DECISIONS.md):**
- TypeScript + Vite for the extension client.
- `Sanitized<T>` phantom type enforces redact-before-transmit at compile time.
- A second, independent runtime stage-order guard backs it up.
- `chrome.tabs.captureVisibleTab` chosen over `tabCapture` / in-page canvas.
- No static content scripts; on-demand injection under `activeTab` only.
- Build output unminified, so the privacy claim stays verifiable by reading it.
- Two-pass Vite build; Vite 8 rather than 5 (clean `npm audit`).
- Icons generated from source rather than committed as binaries.

---

### [2026-09-06] — Session 2

**Completed this session:**
- Module A, Task 2: tab/screen capture implemented. Deliberately left
  UNCHECKED in TASKS.md — the code builds and typechecks clean, but nobody has
  watched it capture a real page yet, and "working" is the stated bar.
- `src/background/capture.ts` — `captureVisibleTab` (PNG), manual base64
  decode, `createImageBitmap`, derived CSS-to-frame scale, one automatic retry
  on Chrome's ~2/sec capture quota, and specific error text for pages Chrome
  won't let extensions read (chrome://, Web Store, PDFs).
- `src/lib/timing.ts` — per-stage timing against the ARCHITECTURE.md Section 6
  budget table, warning when a stage runs over. Module F's latency display will
  read these rather than re-measuring.
- Reshaped `CapturedFrame`: it now holds an `ImageBitmap` and never the data
  URL. Frames are released through `disposeFrame()` in a `finally` on every
  exit path from a run.
- Added a `GET_VIEWPORT` message so the content script reports viewport size
  and DPR; capture uses it to derive the real pixel scale.
- Wired the `reading` stage in the service worker. It stops after capture with
  an explicit message, and does NOT mark `reading` complete, because Screen
  Perception is capture *and* the DOM element map — half a snapshot must not
  look like a whole one to the PII Detector.

**Verification done / not done:**
- Done: `npm run typecheck` and `npm run build` clean. The base64 decode path
  checked byte-exact against four real PNGs, and confirmed to reject malformed
  input rather than return garbage.
- Not done: nothing has run in a browser. `createImageBitmap`, the capture
  quota retry, and the scale derivation are all unexercised.

**Blockers / open questions:**
- Still carrying Session 1's blocker: the extension has never been loaded into
  Chrome. This now covers two tasks' worth of code and should not be deferred
  a third time.
- Capture format is PNG for detection fidelity. If capture overruns the 100ms
  budget on the demo laptop, JPEG is the first knob to turn — but that needs a
  real measurement, which needs a browser.
- Unchanged: free-tier reasoning model not locked (Module D), local vision
  model not selected (Module A, Task 4).

**Next session should start with:**
- Load `extension/dist` unpacked in Chrome, run a task on an ordinary page, and
  read the service worker console. Confirm the capture line appears with
  sensible dimensions and a scale matching the display's DPR, and note the
  measured capture time against the 100ms budget. Then tick Module A, Task 2.
- Then Module A, Task 3: DOM element map extraction in the content script
  (positions, types, attributes), which completes the `reading` stage.

**Decisions made this session (also added to DECISIONS.md):**
- `CapturedFrame` holds an `ImageBitmap`, never a data URL — a non-serialisable
  handle cannot leak through a message boundary, which kills a whole class of
  accidental leak structurally.
- Explicit frame disposal in a `finally` on every exit path.
- CSS-to-frame scale is measured from the frame, not taken from
  `devicePixelRatio` — a systematic scale error would offset every blur box.
- PNG capture format, for detection fidelity over payload size.
- Data URL decoded by hand rather than via `fetch`, so an unredacted frame
  never touches a networking API.
- One automatic retry on the capture quota.
- Every stage timed against the ARCHITECTURE.md Section 6 budget from day one.

---

### [2026-09-06] — Session 3

**Completed this session:**
- Module A, Task 2 VERIFIED in Chrome and ticked in TASKS.md: 1920x945 device
  px, scale 1.000x1.000 (matches dpr 1), 67.6ms on a first capture against a
  100ms budget. The chrome:// refusal path was exercised too.
- Fixed a real bug that verification surfaced: `chrome.scripting.executeScript`
  throws before the friendly handler was reached, so Chrome's internal wording
  ("Cannot access a chrome:// URL") was being shown to the user. Now caught and
  replaced with a message that says what to do instead; the real error still
  goes to the console. PRD.md Section 20 compliance.
- Module A, Task 3 written: `src/content/dom-map.ts`. Viewport-visible element
  walk, classification into the API_SPEC.md Section 3 vocabulary, seven-step
  label resolution, durable selectors verified to round-trip at capture time,
  positions in CSS pixels. Wired into the `reading` stage, which now completes
  only when both the frame and the element map are in hand.
- Moved all project docs into `docs/`. CLAUDE.md and README.md stay at the repo
  root — CLAUDE.md because the session protocol depends on it being found
  there, README.md by convention as the repo landing page. Every cross-reference
  in CLAUDE.md, README.md and extension/README.md re-pointed and verified to
  resolve; the docs reference each other by bare filename and are now siblings,
  so those needed no change.

**Open finding — capture latency:**
- Capture measured 67.6ms on a first run, then 206.7ms and 202.0ms on
  back-to-back runs at identical dimensions. Two candidate causes with opposite
  fixes: Chrome throttling `captureVisibleTab` to roughly 2/sec, or PNG encode
  cost on a visually busier page. Switching to JPEG without knowing which would
  confound the two, so instrumentation was added instead — encoded frame size
  in KB, and the gap since the previous capture. A slow capture close behind
  another is throttling; a slow capture after a long idle is encoding. Decide
  from the next log, not from a guess.

**Verification done / not done:**
- Done: capture, in a real browser, including the blocked-page path.
- Not done: Task 3 has never run. The log reviewed this session came from the
  previous build — the extension had not been reloaded — so DOM extraction,
  label resolution and selector round-tripping are all still unexercised.

**Blockers / open questions:**
- ARCHITECTURE.md Section 6 budgets "Screen capture < 100ms" as a single line,
  but Screen Perception is two independent jobs with different fixes when slow.
  A separate `domScan` budget was added in code. Worth folding into the
  Section 6 table when someone next revises it — flagged rather than edited
  unilaterally.
- Unchanged: free-tier reasoning model not locked (Module D), local vision
  model not selected (Module A, Task 4).

**Next session should start with:**
- Reload the extension, then run on a real login page. Read the service worker
  console for: the new `frame <format> <KB>, <gap>ms since last capture` line
  (resolves the latency finding above), and the `console.table` element map —
  checking that the password field shows `inputType: password` with `hasValue`
  true when filled, that labels resolve to something meaningful rather than
  blank, and that `unresolved selectors` is 0.
- If labels come back empty on a real form, fix that before Module B — DOM
  signals are the primary detector per DECISIONS.md, and detection quality
  rests almost entirely on label resolution.
- Then tick Module A, Task 3 and move to Task 4 (local vision model selection).

**Decisions made this session (also added to DECISIONS.md):**
- The content script never reads password values — not read-then-redacted,
  never read. Nothing downstream needs one, so the safest place for it is
  inside the page. Records `[has value]` instead.
- Selectors use tag + `:nth-of-type` with unique-id shortcuts; class names are
  never used, since CSS-in-JS regenerates them.
- Selectors are verified to round-trip at capture time and failures counted.
- Interactive elements are collected first and never dropped by the
  300-element cap.
- Anchors with `href` classify as `button` — the vocabulary has no "link" and
  they are click targets.
- An empty element map fails the run rather than passing as "nothing sensitive".
- The element map is logged without field values.
- `domScan` gets its own 100ms budget alongside `capture`.

---

### [2026-09-06] — Session 4

**Completed this session:**
- Moved all 13 project docs into `docs/`. CLAUDE.md and README.md stay at the
  repo root — CLAUDE.md because the session protocol depends on finding it
  there, README.md by convention. All cross-references updated and verified to
  resolve. The docs reference each other by bare filename and are now siblings,
  so those needed no change.
- Fixed a real bug found while chasing a stale console: the content script used
  a `window.__shieldContentScriptLoaded` flag to prevent double injection, but
  that flag lives on the page, which outlives the extension. After any extension
  reload, every already-open tab still carried the flag, so the fresh injection
  skipped registering while the old listener sat orphaned — leaving the tab deaf
  until manually reloaded. Registration is now unconditional, which is safe
  because the worker only injects after a PING found no live listener. This
  would have surfaced mid-demo as "it randomly stopped working on this tab".
- Added capture diagnostics: encoded frame size in KB and the gap since the
  previous capture, which together separate Chrome's ~2/sec throttling from PNG
  encode cost. Deliberately did NOT switch to JPEG yet — the two causes have
  opposite fixes and changing format before measuring would confound them.
- Built Test Screen 1 (`test-screens/01-login.html`) plus
  `test-screens/README.md`. Scoped as unblocking Module A verification rather
  than opening Module G: there was previously no safe page to verify Task 3
  against, and the alternative was a real login page with a real password.
  Synthetic data only, no external resources, submit intercepted so the page
  survives repeated runs.

**Verification done / not done:**
- Not done, for the third session running: Task 3 has still never executed. The
  logs reviewed this session were again from the old build — same line numbers,
  missing the new `frame … KB` line. The likely cause is a stale service worker
  DevTools window, which stays attached to the killed worker after an extension
  reload and never shows new output. Detailed reload steps were given.
- The build itself is confirmed current: `dist/service-worker.js` contains the
  new diagnostics and `dist/content-script.js` no longer contains the old guard.

**Blockers / open questions:**
- Capture latency finding still open: 67.6ms first run, then 206.7 / 202.0 /
  181.2 / 190.3ms on repeats at identical dimensions. Instrumented, awaiting one
  good log to settle throttling vs encode cost.
- ARCHITECTURE.md Section 6 still budgets Screen Perception as one line; code
  now tracks `capture` and `domScan` separately. Worth folding into the table.
- Unchanged: free-tier reasoning model not locked (Module D), local vision
  model not selected (Module A, Task 4).

**Next session should start with:**
- Reload the extension, CLOSE the old service worker inspector, reopen it fresh,
  then open `test-screens/01-login.html` and run a task. Confirm against the
  expected element map in `test-screens/README.md`: roughly 10-14 elements, 0
  unresolved selectors, password field showing `inputType: password` /
  `autocomplete: current-password` / `hasValue: true`, and every input and
  button carrying a non-empty label.
- Read the `frame … KB, … ms since last capture` line across two or three runs
  spaced ~5s apart, and settle the capture format question with it.
- Then tick Module A, Task 3 and move to Task 4 (local vision model selection).

**Decisions made this session (also added to DECISIONS.md):**
- Content script registers unconditionally; no page-level double-injection flag.

---

### [2026-09-06] — Session 5

**Completed this session:**
- Added a build stamp. Both Vite configs inject `__SHIELD_BUILD__` (local time,
  ISO-like), and the service worker and content script log it alongside the
  manifest version on startup. Manifest bumped to 0.1.1 so the version is also
  visible on the chrome://extensions card without opening a console at all.

**Why this was needed:**
- A third round of logs arrived still showing "DOM element map extraction is not
  implemented yet (Module A, Task 3)" — a string that had already been removed
  from the source. Verified directly that `dist/service-worker.js` on disk does
  NOT contain it and DOES contain the newer strings, so the build was correct
  and Chrome was running something else: a cached worker, a second copy loaded
  from another folder, or a reload that did not take. Log line numbers had also
  shifted between rounds, which made the running build look new when it was not.
- Diagnosing this by comparing line numbers across pasted logs has now cost
  more time than the whole of Task 3 did. The stamp ends that class of problem
  permanently.

**Verification done / not done:**
- Confirmed on disk: `dist` contains `since last capture`, `Screen perception
  works`, and `extractDomMap`; it does not contain `Module A, Task 3`.
- Task 3 still has never executed. Four sessions running.

**Blockers / open questions:**
- Capture latency: latest logs showed a much better profile — 50.0 / 56.5 / 50.5
  / 54.6 / 46.3ms, then one 669.5ms outlier. All comfortably under budget except
  the outlier, which is consistent with Chrome's capture throttling rather than
  encode cost. The KB-and-gap diagnostics will confirm once a current build
  actually runs. Do not change capture format until then.
- Unchanged: free-tier reasoning model not locked (Module D), local vision model
  not selected (Module A, Task 4).

**Next session should start with:**
- Remove the Shield extension entirely from chrome://extensions, then Load
  unpacked fresh from `extension/dist`. Confirm the card reads v0.1.1 and the
  console opens with `service worker ready — v0.1.1, build <timestamp>`. Any
  other version or a missing build line means the wrong folder is loaded.
- Then run against `test-screens/01-login.html` and check the element map
  against the expectations in `test-screens/README.md`.

**Decisions made this session (also added to DECISIONS.md):**
- Builds are stamped and the stamp is logged on startup.

---

### [2026-09-06] — Session 6

**Completed this session:**
- Traced the repeated stale-build problem to its source instead of asking for
  another retry. Read Chrome's own extension registry (Secure Preferences across
  all 12 profiles) and established: the extension is registered in profile
  "XLR8" (Profile 32), NOT the default "Shivkumar" profile; its load path is
  correct (`...\SHIELD\extension\dist`); and Chrome holds no cached manifest or
  state for it, consistent with a load that never fully committed.
- Root cause of the wasted rounds: every verification channel we were using ran
  through the service worker DevTools console, which silently detaches when the
  extension reloads and then replays its old buffer forever. Two consecutive
  pasted logs were byte-for-byte identical, which is the signature of reading a
  detached inspector rather than a re-run.
- Removed the dependency on that console. The popup now displays the running
  version and build stamp in its footer. The popup is rebuilt from the current
  bundle every time it opens, so it cannot report a build other than the one
  installed — verification no longer requires DevTools at all.

**Verification done / not done:**
- Confirmed on disk: `dist/popup.js`, `dist/service-worker.js` and
  `dist/content-script.js` all carry the current build stamp, and
  `dist/manifest.json` reads 0.1.1.
- Task 3 has still never executed. Five sessions.

**Blockers / open questions:**
- Capture latency looks fine and the PNG decision stands: 50.0 / 56.5 / 50.5 /
  54.6 / 46.3ms against a 100ms budget, with a single 669.5ms outlier whose
  shape says throttling, not encode cost — a fixed-size page cannot encode in
  46ms five times and 669ms once. Confirm with the KB-and-gap line when a
  current build finally runs, then close this out.
- Unchanged: free-tier reasoning model not locked (Module D), local vision model
  not selected (Module A, Task 4).

**Next session should start with:**
- In the XLR8 Chrome profile: remove Shield, then Load unpacked from
  `extension/dist`. Open the popup and read its footer — it must show v0.1.1 and
  a build stamp. That check needs no console and cannot go stale.
- Only then run against `test-screens/01-login.html`. The popup's own error text
  will report the element count, so even Task 3 verification no longer strictly
  needs DevTools; the console.table is a bonus.

**Decisions made this session (also added to DECISIONS.md):**
- The popup displays the running build stamp, so "which build is this?" is
  answerable without DevTools.

---

### [2026-09-06] — Session 7

**Completed this session:**
- Module A, Task 3 VERIFIED and ticked. First successful end-to-end run of
  Screen Perception against `test-screens/01-login.html`: 11 elements mapped
  from 19 scanned, 0 unresolved selectors, DOM scan 3.9ms against a 100ms
  budget. The build stamp in the popup footer worked exactly as intended and
  ended the stale-build confusion immediately.
- Confirmed on real output: `#username` resolved with `autocomplete=username`
  and label "Username"; `#password` with `inputType=password`,
  `autocomplete=current-password`, `hasValue=true` and its value never read;
  the "Forgot password?" anchor correctly classified as `button`; every
  interactive element carrying a non-empty label; all selectors resolving to
  clean IDs.
- Fixed a real quality defect the element map exposed: `<label>` elements were
  being reported twice, once as a control's `label` and again as a standalone
  text region. Three of eleven elements on the login screen were duplicates.
  Labels whose text is already carried by a control are now dropped, with a
  text comparison so a visible label that differs from an `aria-label` survives.
- The unresolved-selector count is now logged even when zero — a check you only
  see when it fails is one you stop trusting.

**Capture latency — CLOSED:**
- PNG stays. The frame was 22KB, captured in 59.3ms. The earlier 180-206ms
  readings and the single 669ms outlier were Chrome throttling
  `captureVisibleTab` to roughly 2/sec on back-to-back runs, not encode cost: a
  fixed-size page cannot encode in 46ms five times and 669ms once, and 22KB is
  nowhere near large enough to explain it. No detection fidelity traded away.
  DECISIONS.md updated from "revisit" to "settled".

**Blockers / open questions:**
- Module A is now complete through Task 3. Tasks 4-7 (vision model selection,
  ONNX Runtime Web, WebGPU, WASM fallback) are the remaining Module A work and
  are blocked on choosing a local vision model — still open.
- ARCHITECTURE.md Section 6 still budgets Screen Perception as a single line
  while the code tracks `capture` and `domScan` separately. Worth folding in.
- Unchanged: free-tier reasoning model not locked (Module D).

**Next session should start with:**
- Re-run the login screen to confirm the label de-duplication landed: the map
  should now show 8 elements rather than 11, with "Username", "Password" and
  "Keep me signed in" appearing only as control labels, not as separate text
  regions. Everything else should be unchanged.
- Then Module A, Task 4: select the local vision model and convert to ONNX.
  This is the first task in the project needing a real external dependency, so
  expect it to take longer than anything so far.

**Decisions made this session (also added to DECISIONS.md):**
- PNG capture format settled, with measurements.
- Labels already carried by a control are not re-reported as text regions.
- The unresolved-selector count is always logged.

---

### [2026-09-06] — Session 8

**Completed this session:**
- Confirmed the label de-duplication landed: the login screen now maps 8
  elements instead of 11, with "Username", "Password" and "Keep me signed in"
  appearing only as control labels.
- Module A, Task 4 done and ticked: local vision model selected and acquired.
- Settled what the local vision layer is actually FOR. ARCHITECTURE.md Section
  2.1 describes generic UI-element detection, but DOM already does that better
  and in 3.9ms. The layer now targets only what DOM structurally cannot see —
  faces, and text baked into pixels — which is what Section 5 of the same
  document already said the visual model was for. Section 2.1's wording should
  be tightened on its next revision.
- Face model: UltraFace version-RFB-320 rather than BlazeFace. Better fit (
  WIDERFACE-trained for small/distant faces, which is how faces actually appear
  on a page, whereas BlazeFace's front model expects a frame-filling face),
  cleaner licence (MIT at source; the most prominent BlazeFace ONNX re-export on
  Hugging Face states no licence at all), and native ONNX so no conversion step.
  TECH_STACK.md and TASKS.md both amended with sign-off.
- Model is committed at `extension/public/models/`, pinned by sha256 in
  `extension/tools/models.json`, and verified by `tools/verify-models.mjs` on
  every build — the build refuses to run if a model drifts.
- Verified the model's graph I/O by parsing the ONNX protobuf directly rather
  than trusting its README: input `input` float32 [1,3,240,320]; outputs
  `scores` [1,4420,2] and `boxes` [1,4420,4].

**Gotchas recorded for Task 5:**
- The model is a PyTorch 1.2 export that lists every initializer in
  `graph.input`, so `session.inputNames` returns ~100 names. Only `input` is a
  real feed; building the feed dictionary by iterating `inputNames` will break.
- `boxes` are normalised 0..1 x1,y1,x2,y2 and need scaling to frame pixels.
  `scores[...,1]` is the face probability. 4420 priors need NMS.

**Decided but not yet built (Module B):**
- OCR will be Tesseract.js run only on crops of `img`/`canvas`/`video` elements,
  never the full frame — the DOM map already says exactly where pixel-baked text
  can hide, so the cheap signal aims the expensive work. Full-frame OCR would
  cost hundreds of ms to seconds. Known gap: CSS background images and SVG text
  are not covered by this targeting.

**Blockers / open questions:**
- Unchanged: free-tier reasoning model not locked (Module D).
- ARCHITECTURE.md Section 6 latency table still folds DOM scan into "screen
  capture"; Section 2.1 wording still describes generic element detection. Both
  are doc-tidying tasks, not build blockers.

**Next session should start with:**
- Module A, Task 5: ONNX Runtime Web integration. Add `onnxruntime-web`, load
  the pinned model in the service worker, and run one inference end to end.
  Watch for two things: MV3's CSP already allows `wasm-unsafe-eval`, but ORT
  also wants to fetch its own .wasm/.mjs assets, which must be bundled locally
  rather than pulled from a CDN — a CDN fetch would both break offline and put
  a third-party origin in the middle of a privacy-critical path.
- Then Tasks 6 and 7 (WebGPU, WASM fallback) fall out of the same integration.

**Decisions made this session (also added to DECISIONS.md):**
- Local vision layer targets what DOM cannot see, not generic element detection.
- UltraFace RFB-320 replaces BlazeFace, superseding TECH_STACK.md and TASKS.md.
- Models are committed, sha256-pinned, and verified on every build.
- OCR runs only on image-element crops, never the full frame.

---

### [2026-09-06] — Session 9

**Completed this session:**
- Module A, Task 5 (ONNX Runtime Web) and Task 6 (WebGPU) both VERIFIED in
  Chrome and ticked. Backend selected `webgpu`; the model ran on a real captured
  frame; 4420 priors with a peak face score of 0.067 on a page containing no
  faces, which is the correct answer.
- Inference runs in an offscreen document, because MV3 service workers cannot
  host ONNX Runtime Web at all (microsoft/onnxruntime#20876). Side benefit worth
  keeping: the offscreen document is now the only context that decodes a frame,
  so "which code can see raw pixels?" has a one-file answer.
- Two performance defects found by reading the measurements rather than
  accepting "it works":
  1. First inference took 2122ms against 84ms for later ones — WebGPU compiling
     shaders lazily, with the cost landing on whichever frame came first. Added a
     throwaway warm-up inference at load time. Result: first-run inference fell
     to 35.6ms, a 60x improvement, verified in Chrome.
  2. A run whose inference took 84ms was spending ~1000ms recreating the
     offscreen document, because the earlier design tore it down after every run.
     Reversed that decision on the evidence: the document now survives a run and
     closes itself after 120s idle. It closes itself because the service worker
     is evicted when idle and cannot be relied on to run a timer.
- Added popup-open pre-warming: opening the popup starts the inference host so
  it loads while the user types. Targets the ~940ms of first-run setup still
  visible in the last measurement.
- Build/packaging fixes: ORT was shipping twice (52MB) because Vite bundled its
  default WASM alongside our copy — fixed with the
  `onnxruntime-web-use-extern-wasm` export condition, now 27MB with one copy.
  The asset-copy script also hardcoded `jsep.wasm`, which ORT had renamed to
  `asyncify`, so it silently copied a file nothing loads while the needed one was
  absent and the build still passed. It now derives the filenames from ORT's own
  entry point.

**Verification done / not done:**
- Done: WebGPU inference, warm-up fix, element map unchanged at 8 elements.
- Not done: the idle-lifetime fix. Every log so far has been a first run, so the
  second-run number that would prove the document survives has never been seen.
- Not done: the WASM fallback path (Task 7). WebGPU has succeeded every time, so
  the fallback code has never executed.

**Blockers / open questions:**
- Unchanged: free-tier reasoning model not locked (Module D).
- ARCHITECTURE.md Section 2.1 now differs from the build in two ways: the vision
  model is scoped to what DOM cannot see, and inference is delegated to an
  offscreen host. Both worth folding in on the next revision.

**Next session should start with:**
- Confirm two numbers on build 14:14:57 or later: a SECOND run's `local
  inference` should be ~100-150ms (proving the document survives), and a run
  started a few seconds after opening the popup should show little setup cost
  (proving pre-warming works).
- Then Module A, Task 7: force the WASM fallback and verify it completes. PRD
  FR-27 requires it to work on machines without WebGPU and we currently have no
  evidence it does. Simplest honest test is temporarily forcing the `wasm`
  execution provider rather than relying on finding a machine without WebGPU.

**Decisions made this session (also added to DECISIONS.md):**
- Inference runs in an offscreen document; it is the only context that decodes
  frames.
- `CapturedFrame`/ImageBitmap superseded by `RawFrame`/data URL in the worker.
- ORT assets bundled locally, never a CDN; extern-wasm condition; asset names
  derived from ORT's entry point; single-threaded WASM.
- Shader warm-up at load time.
- Offscreen document self-closes after 120s idle rather than after every run.
- Popup open pre-warms the inference host.

---

## 2026-09-06 (continued) — CPU fallback proved; storage ownership corrected

**Completed:**
- Module A Task 7 ticked on evidence. The CPU fallback ran on this machine:
  **16ms inference, 87ms init**, against budgets of 500ms and 3000ms. Notably
  the CPU path *starts* faster than WebGPU, which spends ~900ms compiling
  shaders — a machine without WebGPU is slower per frame but not slower to
  first result.
- Replaced manual fallback testing with an automatic self-test. Three earlier
  attempts to force the WASM backend by hand all silently ran on WebGPU anyway,
  so Shield now builds an independent CPU session from scratch and measures it.
  Independent on purpose: it must prove the fallback can be built cold, which is
  what a machine without WebGPU would actually do.
- Fixed three defects in how that self-test *reported*, all of which produced
  the one result a self-test must never produce — silence:
  1. The verdict was announced once, at a single instant, by a fire-and-forget
     message. Missing that instant was indistinguishable from the test never
     existing. The worker now reads the verdict from storage on every run and
     prints it either way.
  2. Failures were cached alongside passes, so a broken fallback would never be
     re-tested. Only passes are cached now.
  3. `await session.release()` sat unguarded in a `finally` and could discard an
     already-established result, reporting a passing test as nothing.
- Moved all storage and all policy into the service worker. The self-test passed
  but its result never persisted, so it re-ran on every capture. The same
  storage the offscreen document was failing to write is where `forceBackend` is
  read from — very likely the real reason forcing the CPU backend appeared to do
  nothing across three attempts previously blamed on a session race. The
  offscreen document now makes zero `chrome.storage` calls; the worker resolves
  the backend and passes it down in the warm-up, reload and analyse messages.
- Stopped swallowing storage errors. `readSelfTestRecord` returning null meant
  both "no record" and "storage threw"; `readSettings` returning defaults meant
  both "no override" and "storage threw". Both now warn.

**Verification done / not done:**
- Done: CPU fallback measured end to end, twice, on real runs.
- Done: offscreen bundle confirmed free of `chrome.storage` calls; worker bundle
  confirmed free of ONNX Runtime.
- Not done: *which* side of the storage read/write actually failed is still
  unknown, because both catches were silent at the time. The warnings added this
  session will say so on the next run if it recurs.
- Not done: the backend override has still never been observed forcing a run
  onto CPU. The path it depends on has changed, so it needs one confirmation.

**Blockers / open questions:**
- Unchanged: free-tier reasoning model not locked (Module D).
- Unchanged: ARCHITECTURE.md Section 2.1 still predates the offscreen host and
  the narrowed role of the vision model.
- Module A Task 8 ("re-capture on multi-step task continuation") is the last
  item in Module A, but it has no meaning until Module E's task loop exists.
  Worth moving to Module E rather than leaving Module A open on it.

**Next session should start with:**
- One run on build 18:37:08 or later. Expect `CPU fallback verified` printed
  from the stored record on the *first* run and no re-test on the second. Any
  `could not read/store` warning identifies the storage failure precisely.
- Then decide Task 8's home, and begin Module B (PII detection), which carries
  the heaviest evaluation weight — 40% combined with redaction.

**Decisions made this session (also added to DECISIONS.md):**
- Shield proves its own CPU fallback rather than relying on manual testing.
- The verdict is pulled from storage every run; only passes are cached.
- The service worker owns all storage and policy; the offscreen document is a
  pure executor.
- Storage failures are logged, never swallowed.

---

## 2026-09-06 (continued) — Module A closed

**Completed:**
- Confirmed on build 18:37:08 that the worker's storage read succeeds and found
  no stored record, with no read warning. That places the earlier failure on the
  *write* side, in the offscreen document — the context storage was removed from.
  The offscreen host now makes no `chrome.storage` calls at all.
- Reordered the self-test to persist its verdict before announcing it. Announcing
  success and then storing it was the wrong way round in a build whose entire
  subject was a verdict that failed to survive.
- Module A Task 8 moved to Module E by decision. Re-capture is a property of the
  task loop; the capture code it needs is done, but nothing can trigger a second
  capture until the executor exists, so it could never be satisfied where it sat.
- **Module A is complete.**
- Corrected the DOM-extraction entry in TASKS.md: it still recorded 11 elements
  from before the label de-duplication fix. The verified figure is 8.

**Verification done / not done:**
- Done: CPU fallback measured on three separate runs (15-16ms inference,
  87-94ms init).
- Done: persistence of the stored verdict, confirmed on build 18:43:48 — the
  record was read back with its original timestamp and the test did not re-run.
  That settles which side had failed: the offscreen document could not write to
  `chrome.storage`, and moving storage ownership to the worker fixed it.
- Not done: the backend override forcing a run onto CPU has still never been
  observed. The path it depends on changed this session; worth one confirmation
  before the demo, since it is the two-click way to show a judge the CPU path.

**Blockers / open questions:**
- Unchanged: free-tier reasoning model not locked (Module D).
- Unchanged: ARCHITECTURE.md Section 2.1 predates the offscreen host and the
  narrowed role of the vision model. Worth folding in before submission.

**Next session should start with:**
- Module B, PII Detection, beginning with the DOM rule engine: password field
  detection, then label/autocomplete-driven PII field detection. This is the
  heaviest-weighted work in the rubric (detection + redaction 40% combined,
  accuracy another 25%) and the login demo depends on it entirely.
- CLAUDE.md's hard constraint applies directly here: DOM signals are the primary
  detector, the visual model is supplementary, and anything uncertain defaults to
  hidden.

**Decisions made this session (also added to DECISIONS.md):**
- Re-capture moves from Module A to Module E.

---

## 2026-09-06 (continued) — Module B built; two defects found on a real page

**Completed:**
- DOM rule engine built and verified: password fields, autocomplete tokens,
  implied input types, then label/name/placeholder patterns, strongest-first.
  2 regions on the login screen with 0 false positives — the checkbox, the
  submit button and the "Forgot password?" link correctly ignored.
- Face detection integrated: thresholding at 0.5, non-maximum suppression at
  0.3 IoU, 15% box padding. Verified on a real page: peak 0.984, 17 priors above
  0.7 collapsed to distinct faces; 0 on the login screen. Coordinate mapping
  checked numerically at scale 1.0 and 2x HiDPI.
- Capture switched from PNG to JPEG q90 after the PNG decision's own revisit
  condition fired: a photo-heavy page produced a 1511KB PNG in 349.7ms against a
  100ms budget. JPEG: 397KB in 39.8ms, a nine-fold improvement, with peak face
  score unchanged at 0.983 vs 0.984.
- Disagreement handling: where a field's declaration and its content disagree,
  the more sensitive reading wins and both signals are named; confidence takes
  the higher of the two. Where nothing matches, a field holding content is
  redacted as the new `other` category rather than passed through.
- `other` added to `SensitiveCategory` and to API_SPEC.md Section 3's enum, with
  a note for the server.
- Known detection limits written into SECURITY_PRIVACY.md Section 4.1: names in
  prose, small faces, text inside images.
- OCR marked deferred by decision rather than left silently unchecked.

**Two defects found by running against a real page, neither visible on the
login fixture:**
1. **Our own console leaked third parties' personal data.** The element map was
   printed in full on every run, justified in a comment by "labels are page
   structure and are safe to show". On a social feed the labels are people's
   names, and dozens went into a console buffer that was then pasted into chat.
   Full detail is now printed only for local fixtures; real pages get counts.
2. **Face boxes could be inverted.** Padding clamped the far edge down to 1
   while leaving a near edge above 1 untouched, producing regions with negative
   width (`-1814x401`) that reached the redaction stage. Both edges are now
   clamped and the pair re-ordered. The root cause — boxes falling outside the
   assumed 0..1 range — is not yet confirmed.

**Verification done / not done:**
- Done: DOM detection on the login screen; face detection in both directions;
  capture latency before and after; pattern false-positive checks against
  ordinary prose; coordinate maths at two scales.
- Not done: the box coordinate range. Build 21:00:31 onward reports it once per
  session. Until that line is read, the inversion fix is a guard, not a
  diagnosis, and visual redaction in Module C depends on the answer.
- Not done: JPEG recall, still PENDING VERIFICATION in DECISIONS.md. The A/B was
  invalidated by the page changing between runs (137 vs 140 elements). A static
  fixture with a known face count would settle it; Screen 3 does not exist yet.
- Not done: the `other` category and reconciliation logic have not been observed
  firing on a real page.

**Blockers / open questions:**
- Unchanged: free-tier reasoning model not locked (Module D).
- 27 of 137 selectors on a real page failed to resolve back to their own
  element — 20%, against 0 of 8 on the login screen. Module E re-verifies
  elements by selector before acting, so this is a Module E blocker in waiting.
- TESTING.md Screen 3 needs a page with a known, fixed number of visible faces.
  Fixtures forbid external resources, so the image must be embedded, and none is
  available. This blocks a clean face-recall measurement and the JPEG A/B.

**Next session should start with:**
- Read the `box output dims ... observed range` line from one run on a page with
  faces. If the range is roughly 0..1 the geometry is correct and Module C can
  proceed on visual redaction; if it is 0..320/0..240 the conversion in
  face-regions.ts is wrong by a factor of the model input size.
- Then Module C, the Redaction Engine — the module that mints `Sanitized<T>` and
  carries the project's central invariant.

**Decisions made this session (also added to DECISIONS.md):**
- Confidence is recorded but never gates redaction.
- Field rules apply only to inputs; visible text is matched by content.
- Phone detection needs ten digits, or eight with an international prefix.
- Fields are flagged whether or not they hold a value.
- Face threshold 0.5 with 15% padding; suppression before padding.
- Face boxes normalised, converted to CSS pixels in one place.
- Capture format PNG -> JPEG q90 (pending recall verification).
- Element-map detail logged only for local fixtures.
- Box coordinates clamped on both edges and re-ordered.
- `other` category added; unmatched fields holding content are hidden.
- Names in prose out of scope, documented as a limit.
- OCR deferred.

---

## 2026-09-06 (continued) — Module C complete; face geometry diagnosed and fixed

**Completed:**
- Module C built and verified end to end. Opaque fill rather than blur (blur
  reduces information rather than removing it and has been reversed by published
  attacks). Every flagged region is painted, DOM detections included, because a
  value visible in a text field is in the screenshot as surely as it is in the
  DOM. Redacted frame encoded JPEG q80 — a separate decision from capture, since
  this image is already redacted.
- Semantic placeholder tokens verified: `e0=[EMAIL], e1=[PASSWORD]`. The
  `[EMAIL]` is the disagreement logic working on a real case — the field
  declares `autocomplete="username"`, classifying as a name, but holds
  `demo.user@example.com`, and the more sensitive reading won.
- The invariant is enforced three ways: the compile-time `Sanitized<T>` seal
  (mintable only via `sealAsRedacted`, which appears in exactly two files — its
  definition and its one call site), the runtime stage-order guard, and a
  content check verifying every flagged element carries a placeholder before
  sealing. The first two prove redaction was called; the third proves it worked.
- **Visual verification passed.** On the login screen the two black rectangles
  cover exactly the username and password fields, with heading, button and link
  untouched. This was the one check no number could substitute for.
- Face geometry diagnosed and fixed. The model does not emit rectangles: its
  `boxes` output is SSD regression offsets against a fixed prior grid, measured
  raw range -4.268..3.368. Rebuilt the grid from the architecture and decoded
  against it. Decoded range now 0.049..0.549 on the same page; 3 faces detected,
  3 painted, no unusable geometry.

**Mistakes made and corrected this session, worth remembering:**
- The box-range diagnostic was first logged inside the offscreen document, which
  has its own devtools target nobody opens — the exact mistake already diagnosed
  and fixed for the CPU self-test earlier the same day. Diagnostics belong where
  the reader is.
- The prior grid first built 4400 instead of 4420, because the last detection
  head has three box sizes and was given two. Caught only by asserting the count
  against the model's own output shape. Unasserted, it would have decoded every
  box against the wrong anchor and produced confident detections in wrong
  places.
- A 3px bleed margin was resurrecting zero-area regions into 6px slivers that
  painted successfully and counted as redactions, so the manifest claimed three
  faces hidden when one was. Zero-area regions are now rejected before the
  margin is applied.
- `models.json` carried a note asserting the boxes were normalised 0..1, copied
  from the reference documentation while the same file claimed shapes were read
  from the graph rather than a README. Corrected, since that file is checked on
  every build and a wrong note there is worse than none.

**Verification done / not done:**
- Done: full local pipeline on the login fixture and on a real page; visual
  confirmation of the redacted frame; face decode range; prior count assertion.
- Not done: JPEG recall remains PENDING VERIFICATION in DECISIONS.md. Peak face
  score was unchanged (0.983 vs 0.984) but a clean A/B still needs a static
  fixture, which is Screen 3 and does not exist.
- Not done: no measurement of whether small faces are missed. The page used has
  faces of unknown size, so recall is unquantified.

**Blockers / open questions:**
- Module D's free-tier reasoning model is still unchosen. This is now the
  critical path: it is the only remaining item that needs an external account or
  key rather than code.
- 38-39 of 158 selectors on a real page fail to resolve — roughly 25%, against
  0 of 8 on the login fixture. Module E acts on these selectors.
- TESTING.md Screen 3 still needs an embeddable face image.

**Next session should start with:**
- Module D: choose the reasoning model, then build the transport layer against
  API_SPEC.md. The client side of transport can be written before the model is
  chosen, since the payload shape is already fixed and sealed.

**Decisions made this session (also added to DECISIONS.md):**
- Opaque fill, not blur; DOM detections painted onto the frame too; redacted
  frame JPEG q80.
- `sealAsRedacted` as the single mint point, with content verification before
  sealing.
- Face boxes decoded against a reconstructed prior grid; prior count asserted.

---

## 2026-09-06 (continued) — Modules D and E complete; the whole pipeline runs

**Completed:**
- Module D. Client transport enforces the invariant by signature — `send()`
  accepts a `Sanitized<AnalyzePayload>` and nothing else. Responses are parsed as
  untrusted input rather than cast to our own response type.
- FastAPI backend in server/, verified running: `/health`, `/analyze`, and a
  malformed body returning `MALFORMED_REQUEST`. 8 checks pass in
  server/test_reasoner.py.
- A rule-based reasoner that needs no model, no key and no network. This
  unblocked the oldest blocker in the project — the free-tier model choice — and
  is also the demo's contingency, since a live demo depending on somebody's free
  tier being up on judging day has a single point of failure outside our control.
- Module E. Executor with three-way target re-verification (selector, type,
  accessible label) plus a visibility check. Typing goes through the native value
  setter and dispatches input/change, because a plain assignment is invisible to
  frameworks tracking their own state.
- **The full pipeline runs end to end**: capture 39.4ms, DOM 1.5ms, inference
  48.9ms, redaction 36.6ms, round trip 12.5-87.5ms, one click on the page, clean
  stop. Every stage inside budget.
- Screen 3 (faces) built, with a size ladder that measures the small-face
  detection floor rather than merely showing a face.
- Face threshold lowered 0.5 -> 0.3 on measurement: 5 of 8 faces became 6, with
  no false positives on the control text. The measured floor — a face needs
  roughly 6% of viewport width — is recorded in SECURITY_PRIVACY.md 4.1.

**Defects found and fixed this session:**
1. **The loop clicked submit five times.** The first full run exposed it: the
   fixture intercepts submit, nothing visibly changed, and the reasoner proposed
   the same action until MAX_STEPS stopped it with an error. On a real page five
   identical clicks can mean five orders. The step cap bounds the damage but
   does not prevent it; the run now refuses a repeated action *before* executing
   it. Verified: one action, clean stop.
2. **Selectors truncated at eight ancestors.** On deep pages that produced not a
   shorter selector but a different one, matching the first such element
   anywhere in the document — 38 of 158 failing to resolve on a real page
   against 0 of 8 on the fixture. Now absolute and anchored at `html`.
3. **`filled` was missing from the redacted summary.** The placeholder token
   reads `[PASSWORD]` whether a field is full or empty, so the server could not
   tell "needs filling" from "ready to submit" — the exact choice the primary
   demo turns on. The redaction design created the gap and had to close it.
4. **Invented error codes.** The transport used lowercase names of my own
   rather than API_SPEC.md's `MALFORMED_REQUEST` etc. They would have compiled,
   looked plausible, and matched nothing real.
5. **Dependency pins needed a Rust toolchain.** Caught by actually creating the
   venv and running the server rather than by the files parsing.

**Verification done / not done:**
- Done: full pipeline against the live backend; repeat detection; the login demo
  path end to end.
- Not done: the face-to-element correlation run on 03-faces.html. Build
  22:11:24 onward prints an `over` column naming which element each face box
  covers; the reading that 80px and 36px rungs stay uncovered has not been
  confirmed against it, and if 55px is covered while 80px is not, that is
  non-monotonic and worth understanding rather than assuming.
- Not done: JPEG recall A/B, still PENDING VERIFICATION in DECISIONS.md. Now
  possible, since Screen 3 is a static fixture with a known face count.

**Blockers / open questions:**
- The free-tier model is no longer blocking, but remains unchosen. The
  rule-based reasoner handles the locked demo; a model would generalise it.
- Shield stores no credentials by decision, so a "fill the password" request is
  refused rather than honoured. The demo does not need it.

**Next session should start with:**
- Module F, the trust and transparency UI: status indicator, explainable
  redaction overlay, live network inspector. This is the last of Phase 1, and
  DEMO_SCRIPT.md steps 4 and 5 — the standout differentiator — are entirely
  Module F. The privacy engineering is done; what is missing is the part that
  lets a judge see it.

**Decisions made this session (also added to DECISIONS.md):**
- Rule-based reasoner in the backend; credential references never credentials.
- Backend deps pinned to versions with wheels for the Python in use.
- Selectors absolute rather than truncated.
- Shield stores no credentials.
- `filled` added to the DOM summary contract.
- Host permissions limited to the local backend.
- Repeated actions refused before execution.

---

## 2026-09-06 (continued) — Module F; Module G opened

**Completed:**
- Module F, the trust and transparency UI. The status indicator now runs through
  every state driven by the real pipeline, carries the error detail line and the
  FR-27 CPU-fallback notice.
- The explainable redaction overlay: labelled boxes drawn over each redacted
  region with the rule that fired as a tooltip. Inert by construction —
  `pointer-events: none` throughout — so it can never intercept a click meant
  for the page or for the action about to be taken. Cleared before acting and at
  the start of a run, since an explanation of the wrong screen is worse than
  none.
- The live network inspector: "What was sent?" shows the exact JSON transmitted,
  with the base64 frame replaced by a size note. Recorded *before* the request
  rather than after, so the question still has an answer when the server is
  unreachable — which is when someone is most likely to ask it.
- Module G opened: unit tests for the DOM rules (16), the redaction engine and
  transport boundary (11), and face geometry (8), on Node's built-in runner with
  no new dependencies.
- The Zero-Leak Verification automated. TESTING.md Section 6 describes it as a
  manual DevTools payload inspection before every rehearsal, which is the first
  thing skipped under time pressure and weaker than it sounds: the per-element
  check only looks where it expects a value to be, so a password echoed into a
  label or copied into the manifest would pass it. Every flagged value is now
  searched for across the entire serialised payload before the seal is minted.
- Screens 3, 4 and 5 built and run. Screen 4 produced zero detections from 23
  elements — the restraint check. Screen 5's eight predictions all held.

**Verification done / not done:**
- Done: full pipeline end to end; all four screens run manually.
- Not done at the time: the integration runs were manual only, and the latency
  breakdown display was left unbuilt per its stretch marking.

---

## 2026-09-07 — Phase 1 closed out

Build `2026-09-07 00:21:25`. 50 client tests, 37 server checks, typecheck and
build clean.

**Completed:**
- **The reasoning-model integration** (Module D), and with it the oldest open
  blocker in the project. It was never really a code question: every candidate
  free tier speaks the same chat-completions shape, so `model_reasoner.py`
  targets that shape and reads endpoint, model name and key from the
  environment. Switching provider needs no code edit and no account decision is
  baked into the repo. What remains is a signup, not a build task.
- **The redaction-aware prompt template** (`server/prompt.py`, versioned 1.0.0),
  the last unbuilt component in ARCHITECTURE.md. It teaches the model that a
  token marks something present-but-hidden rather than missing, that the black
  rectangles are ours, and that a credential is asked for by reference and never
  written out.
- **A threat that was not in the threat model.** Labels and page text are
  attacker-controlled and they flow into the component that decides what to do
  to the user's screen — a page can contain a sentence addressed to the model.
  SECURITY_PRIVACY.md's elevation-of-privilege row anticipated a *server*
  returning a bad action, not the page talking the model into one. Page content
  is now JSON-encoded inside a labelled boundary, never interpolated into
  instruction text, and truncated, since volume is the cheapest injection there
  is. Added as a threat row and as a stated limit rather than claimed as solved:
  what actually bounds the damage is the allowlist and the client's
  re-verification.
- **The model's reply is parsed as untrusted input.** Four checks before it
  becomes an action — allowlisted verb, a selector we actually described, no
  literal value aimed at a redacted field, capped summary. Any failure falls
  back to the rules.
- **The client mirrors the redacted-field rule independently.**
  `resolveTypeValue()` refuses to type a literal value into a field Shield hid,
  because the server is a component that can be wrong and this is the case where
  being wrong is worst.
- **Screen 2 built**, completing the five test screens. Fourteen controls with
  deliberately uneven signals. Expectations written before the first run; all
  held, including the predicted over-redaction of "Display name".
- **The integration test is automated**, running detection, redaction, the
  manifest and the seal over all four DOM screens on every `npm test`, with a
  drift guard that reads the HTML and fails if a screen grows a field the
  fixture does not have.
- **The latency breakdown display** (Module F's last item), reading the
  measurements the pipeline already takes rather than making its own.

**A real defect the new screen found:**
- The referral `<select>` was hidden as `other`. Correct under the rule as
  written, and the rule was the thing worth changing: a `<select>` holds one of
  the page author's own options, so nothing a user entered can be in it, and
  hiding "How did you hear about us? -> A friend" costs the model context for no
  privacy gain. Content patterns still run over it, so a dropdown of email
  addresses is still caught.
- Fixing it exposed a gap underneath: `dom-map.ts` read `type` only from
  `<input>`, so a `<select>` and a `<textarea>` were indistinguishable
  downstream — both arrived as an `input` with no type. Exempting one would have
  exempted the other, and a textarea holds exactly what the user typed. It now
  reads `type` from every control, using the DOM's own names.

**Verification done / not done:**
- Done: the fallback path, against a deliberately unreachable provider — logged
  its reason and returned the correct action in 2.2s. `/health` and `/analyze`
  live. Every prompt and reply-parsing check. All four screens through the full
  chain.
- Not done: the latency panel has never been looked at in a browser. The
  numbers behind it are the ones already being logged, so the risk is layout,
  not correctness.
- Not done, and not doable from here: rehearsal on the presentation laptop, and
  testing on 2-3 machines. Both are marked in TASKS.md as needing hardware
  rather than work.

**Blockers / open questions:**
- The free-tier provider is still unchosen. It is now three environment
  variables (see server/README.md), and Shield runs correctly with none of them
  set, so this gates generality rather than the demo.
- OCR remains deferred by decision, recorded in SECURITY_PRIVACY.md 4.1.
- ARCHITECTURE.md Section 2.1 still predates the offscreen host and the narrowed
  role of the vision model; Section 6 still folds the DOM scan into "screen
  capture". Both are doc-tidying, not build blockers.

**Next session should start with:**
- Load `extension/dist` and run the login screen once. Expect no behaviour
  change; check that "Where did the time go?" appears after the run and reads
  sensibly. Then run `02-signup.html` and confirm the eleven predicted
  detections and the untouched dropdown against the fixture's own comment block.
- Then Phase 2 is unblocked: multi-field signup detection working end to end as
  a second demo task. The fixture and the measurements it needs already exist.

**Decisions made this session (also added to DECISIONS.md):**
- Reasoning-model choice is configuration, not code.
- The model's reply is parsed as untrusted input.
- The prompt treats page content as data, never as instructions.
- `<select>` values are exempt from default-to-hide but not from detection;
  `dom-map.ts` reads `type` from every control.
- The client independently refuses to type into a field it redacted.
- The client pipeline is tested against every screen on every `npm test`.
- The latency breakdown reads the pipeline's existing measurements.

**Verification addendum, same day — screens re-run in Chrome:**
- Screen 2, first run in a browser: 11 detections from 21 mapped elements, 61
  scanned, 0 unresolved selectors, and every category exactly as the fixture
  predicted before it was ever run — including the over-redaction of "Display
  name" and the untouched referral dropdown. The `<select>` rule therefore holds
  on a real page, not only in its own unit test.
- Screen 4: 0 detections from 23 elements, 0 manifest entries, and the server
  then declined — "No recognised form on this screen." Both halves of the
  restraint check in one run. A quiet detector is only worth having if the
  reasoner is quiet too, and until this run only the first half had been shown.
- Screen 5: the same 5 detections as before the rule change, so nothing
  regressed. Interesting detail worth keeping: the reasoner read the adversarial
  page as a login form — a `[PASSWORD]` field and an `[EMAIL]` field, both
  filled — and then declined because it found no submit control. It reached the
  right outcome by the narrow route, not by recognising the page for what it is.
  Harmless here; worth remembering that "declined" and "understood" are not the
  same result.
- Latency panel verified in the popup. Every stage inside budget across all
  runs: capture 24-49ms/100, DOM scan 2-7ms/100, inference 54-63ms/500,
  redaction 36-54ms/200, round trip 8-10ms/1000. It showed four stages on the
  run whose network call failed and five on the runs that completed, which is
  the correct behaviour and not something that had been checked.

**Own goal worth recording:** cleaning up two test servers with
`taskkill /F /IM python.exe` killed every Python process on the machine,
including the Shield backend, which produced a "Failed to fetch" that looked
like a client bug. Kill the PIDs you started.

**Primary demo path re-verified end to end, after the executor path changed:**
- Screen 1, full run against the live backend: 2 detections, `e0=[EMAIL]`,
  `e1=[PASSWORD]`, payload sealed, server returned "Found a login form with both
  fields already filled. Submitting it.", executor reported `click — Clicked.`
  The re-capture then found the same state, the server proposed the same action,
  and repeat detection refused it before executing — one action, clean stop.
  That is the safeguard added after the run that clicked submit five times,
  working on the path it was written for.
- Timings: capture 34.0/100, DOM 1.6/100, inference 52.0/500, redaction
  45-54/200, round trip 6.4-7.9/1000.

**Fixture change (deliberate, per test-screens/README.md):** `01-login.html` now
writes a visible confirmation into its existing intro paragraph when the
intercepted submit fires. The interception is still there — the page must
survive repeated runs — but swallowing it silently meant a successful run looked
identical to a failed one at the single moment in the demo where Shield acts.
The observed report was literally "nothing happened after clicking sign in",
which is exactly what a judge would conclude.

Written into an element that already holds text rather than added as a new node,
on purpose: a new element would change the count between the first capture and
the re-capture that follows an action, and 8-elements-from-19-scanned is a
recorded baseline. The confirmation string was checked against the content
patterns first — a rendered clock time is close enough to a phone number to be
worth checking rather than assuming, and it does not match in any of the
separator forms `toLocaleTimeString` produces.

---

## 2026-09-07 — PHASE 1 CLOSED

**State at close:** 50 client tests, 37 server checks, typecheck and build
clean. Every buildable Phase 1 item done and verified in Chrome against the live
backend.

**The primary demo task, end to end:** 2 detections, payload sealed with no raw
value anywhere in it, server returned an action, button clicked, re-capture
found the same state, duplicate action refused before executing. One action,
clean stop. Capture 34.0ms, DOM 1.6ms, inference 52.0ms, redaction 45.4ms, round
trip 7.9ms — every stage inside budget, ~150ms of measured work per pass.

**All four DOM screens verified in the browser:**
- Screen 1: 2 detections, click performed.
- Screen 2: 11 detections from 21 elements, every category as predicted before
  the first run, dropdown correctly untouched.
- Screen 4: 0 detections from 23 elements, and the server then declined. Both
  halves of the restraint check.
- Screen 5: 5 detections, all 8 pre-written predictions holding.

**Documentation brought in line with the build this session:**
- ARCHITECTURE.md 2.1 — corrected. It described the vision model classifying UI
  elements generally and inference running in the service worker. Neither is
  true: the visual layer was narrowed to what the DOM cannot see, and MV3
  service workers cannot host ONNX Runtime Web at all. Flagged as stale since
  Session 8; fixed now rather than left for a reader to trip over.
- ARCHITECTURE.md 6 — the latency table now separates DOM scan from capture and
  model init from inference, with measured figures beside each budget. Both
  splits exist because the single line they replaced could not be acted on when
  it went over.
- TESTING.md 6 — the Zero-Leak Verification is described as what it now is: code
  that runs on every request, not a procedure someone performs before a
  rehearsal. What still needs a human is stated separately and honestly.
- TESTING.md 1 and 3 — Screen 2 documented; integration testing split into what
  is automated and what still needs a browser, rather than counting the second
  as the first.
- README.md — the placeholder port and "backend not started" are gone. Adds a
  Status section with real measured numbers and a pointer to the known limits.
- DEMO_SCRIPT.md — step 5 now uses the popup's own network inspector rather than
  DevTools, since it survives a failed request. Step 6 adds the repeat refusal,
  which is the moment that separates a demo from something runnable. Two new
  judge answers: the adversarial screen including the two misses, and prompt
  injection.

**Blockers carried into Phase 2:**
- Presentation-laptop rehearsal and multi-machine testing. Access, not work.
- Free-tier provider unchosen. Three environment variables; costs generality,
  not the demo.

**Next session should start with Phase 2:** multi-field signup detection working
end to end as a second demo task. Detection on that screen is already correct
and measured — the gap is that the rule-based reasoner declines a signup form,
so nothing acts on it. See the phase-gate note in TASKS.md: Phase 1 is closed,
so Phase 2 is unblocked.

---

## 2026-09-07 — PHASE 2 OPENED: the second demo task

**The design question was answered first, before any code**, because the
obvious reading of the task was not available. Shield stores no credentials by
decision, so "complete a sign-up" cannot mean "fill it from a vault". Three
readings were weighed and the chosen one is **"finish the sign-up", not "fill
the sign-up"**: Shield reads the form, hides the eleven sensitive fields, and
does the parts of "create this account" that need no invented data — it ticks
the unticked required-consent checkbox, re-captures, then clicks "Create
account" — and refuses the rest, saying why.

Chosen over the two candidates recorded in TASKS.md because it is the first
genuinely multi-step run. Phase 1's login was one action followed by a clean
stop, so the step loop, the re-capture and the 600ms settle have never actually
been exercised against a page that changed. The rejected option — a local
profile store to fill name/email/phone — would have put new PII at rest on a
project whose claim is that PII stays put, and needs its own threat-model row
and settings UI before it is honest to demo.

**Two facts checked rather than assumed, because they decided which answers
were even available:**
- The terms checkbox is not flagged, so it crosses the wire intact, and
  `dom-map.ts` already emits `checked`/`unchecked` as a real convention. So the
  server can recognise a checkbox deterministically and a tick is just a
  `click` — no new action verb, no new storage, no schema change.
- `RedactedDomEntry` carries no `inputType`, so that value string is the *only*
  way the server can tell a checkbox from a text input. Worth knowing before
  designing a rule that depends on it.

**The three measured defects in `reasoner.py` are fixed:**
- `_looks_like_submit` is gone. Three word lists replace it — login, sign-up,
  neutral — with each form kind preferring its own and neither ever falling
  back to the other's. Widening one shared list would have fixed "Create
  account" and created a worse bug: a sign-up page nearly always also carries a
  "Sign in" link for existing users, and the first match used to win, which on a
  real page navigates away from the form the user asked Shield to finish.
- Form kind is now decided *before* the submit control is chosen, from three
  independent signals: two or more password fields (a confirmation pair exists
  only where a password is being set), a sign-up-worded control, or three or
  more distinct categories of personal field.
- The summary and the docstring now describe what the code does. It really does
  handle sign-up forms.

**A decision that changed the shape of the fix, and is worth repeating:** an
empty password on a sign-up form is a *decline*, not a `[USE_SAVED_CREDENTIAL]`
request. Not merely because Shield has no vault — a sign-up password is a NEW
password for an account that does not exist yet, so no credential store could
hold it. Asking for a saved one is wrong in principle here, not just
unfulfillable as it would be on a login form. Emitting the reference anyway
would have produced a client-side error on a path that was never going to
succeed, and an error reads as a bug rather than as a boundary. The login path
is untouched: there a saved credential is exactly the right thing to ask for.

**The rule that took the most care: which checkbox may Shield tick.** Ticking
"I accept the terms of service" is what "create this account" means — the form
cannot be submitted without it. Ticking "Send me occasional product updates" is
not part of any task the user asked for; it signs them up for mail they did not
request, from a page they may never return to, and it is awkward to undo. The
two are the same control type and differ only in wording, so the wording
decides: a box qualifies only if it is unticked, matches a consent phrase, and
matches no opt-in phrase — and the opt-in test runs FIRST, because "I agree to
receive marketing email" contains a consent phrase and is emphatically not one.
Everything else is left exactly as the user left it, which is the action-side
reading of "when uncertain, hide".

**Scope taken deliberately, and stated rather than smuggled in:** the
model-backed path was held to the same restraint. Both paths decide this same
task, so a box the rules refuse to tick must be one the model is not allowed to
tick either — otherwise the behaviour depends on whether somebody's free tier
happened to answer, and the riskier of the two is the one nobody tested.
`interpret()` now refuses a click on an unticked opt-in; the prompt states the
rule and the no-invented-values rule before either refusal can apply, since a
refusal the instructions never warned about is a trap rather than a boundary;
and both paths share one predicate rather than two that can drift. Prompt
version bumped to 1.1.0.

**Testing — the numbers, since "tested against varied labels" is meaningless
without them:**
- `server/test_reasoner.py`: 8 checks → **66**. Forty of those are a wording
  table, which is the "varied field labels/formats" task made into a
  measurement: 14 submit labels ("Create account", "Sign Up Free", "Register
  now", "Join now", "Continue", "Next" …) each checked twice — once that the
  consent step is reached, once that the control itself is clicked — 5 consent
  phrasings that must be ticked, and 7 opt-in phrasings that must not, three of
  which deliberately borrow the language of consent.
- Regression-locked against the three screens whose behaviour is recorded in
  TASKS.md: Screen 1 still submits at "Sign in" rather than at the "Forgot
  password?" button that precedes it in the DOM; Screen 5 still reads as a login
  form and still declines for want of a submit control; Screen 4 still declines
  outright and its newsletter box is never ticked. A rule change that quietly
  altered any of these would have invalidated what is written in TASKS.md.
- `server/test_prompt.py`: 29 → **35**.
- `extension`: **50** client tests unchanged and passing; typecheck and build
  clean.
- The three-step sequence was driven through `main.py`'s `/analyze` itself, in
  process, not only through the rules: step 1 `click s13`, step 2
  `click e-submit`, step 3 proposes the same action as step 2 so the client's
  repeat detection is what stops it. That confirms the wiring rather than the
  decision alone.

**Fixture change (deliberate, per test-screens/README.md):** `02-signup.html`
now announces both of Shield's actions in its existing intro paragraph — the
consent tick and the submit — for the reason Screen 1 already established: a
silently intercepted submit makes a successful run look identical to a failed
one, and the observed report last time was literally "nothing happened". This
page has two moments to show rather than one. Both write into an element that
already holds text rather than adding a node, so the 11-detections-from-21
baseline survives the re-capture, and the submit line copies Screen 1's wording
and clock format exactly so it inherits that page's check that a rendered time
does not match the phone-number pattern.

Its comment block now also carries the Phase 2 expectations — the two-step
sequence, and the three things that must NOT happen (s14 must stay unticked,
s11 must stay empty, and clearing the passwords must produce a decline) —
written before the first run, as with every other screen.

**Blockers:**
- The end-to-end browser run is the one Phase 2 item still open, and it needs
  Chrome. Instructions and pass/fail criteria were given; the backend must be
  restarted first, since the running one reports `prompt_version 1.0.0`.
- Carried forward unchanged: presentation-laptop rehearsal and multi-machine
  testing (access, not work); free-tier provider unchosen (three environment
  variables; costs generality, not the demo); OCR deferred by decision.

**Next session should start with:** the browser run above if it has not
happened. Once it has, Phase 2 has one item left — updating DEMO_SCRIPT.md to
include the second task, which is currently a one-task script. Phase 3 (face
detection on video-call screens) stays gated until Phase 2 is checked complete.

**Decisions made this session (all added to DECISIONS.md):**
- The second demo task is "finish the sign-up", not "fill the sign-up".
- An empty sign-up password is a decline, not a saved-credential request.
- Shield ticks a required-consent checkbox and never an optional one.
- An empty non-secret field is reported, not filled, and does not block submit.
- Form kind is recognised by evidence; submit wording is matched per form kind.
- `IDENTITY_TOKENS` includes `[ADDRESS]` and `[ID_NUMBER]`, still not
  `[REDACTED]`.

**Browser verification, same day — the refusal path passed and exposed a
different defect.**

The second of the two predicted runs was done first, with both password fields
cleared by hand, and it held exactly: 11 detections from 21 mapped elements,
every category as predicted, both checkboxes and the dropdown untouched, payload
sealed with a 76KB frame, round trip 7.9ms — and then no action at all, with the
exact refusal wording. Capture 21 elements, inference 56.0ms/500, redaction
38.0ms/200, all inside budget. That is the "an empty sign-up password is a
decline, not a credential request" decision working on a real page.

**What the run found that no unit test could have.** The element map contained
14 inputs and 7 text elements and NO BUTTON. `dom-map.ts` keeps only what
intersects the viewport, and `02-signup.html`'s "Create account" button sits
about fifteen pixels below a 945px fold — the `.note` paragraph beneath it was
missing too, which confirms it. The server's "no submit control was found" was
*correct*, and the acting run would have stopped one action short of finishing.

The in-process three-step check had passed an hour earlier because its payload
included a button the browser never sent. That is precisely the failure this
project has already written down once — a fixture that invents its own shape
tests the fixture — and it happened again in a different costume. Worth
remembering: an in-process check of a client/server contract proves the server,
never the client's half of it.

**Fixed by scrolling, not by shrinking the page.** Every sign-up form worth the
name is taller than the fold, so a fixture tightened until the button fits would
have hidden the limitation rather than removed it, and Shield would still fail
on the first real page a judge suggests. `scroll` has been in the API_SPEC.md
allowlist since it was written and had never once been used; this is what it is
for, and no new verb, storage or schema field was needed.

Three details worth keeping:
- Scoped to the sign-up path. The login path still declines, because Screen 5's
  recorded outcome depends on that and a login form's button is effectively
  always visible.
- Bounded by machinery that already existed. Element ids are assigned per
  capture in document order, so a page that cannot scroll further yields the
  same id for the same target and the client's repeat detection refuses the
  duplicate. Nothing counts scrolls; nothing new had to be built.
- Ordering preserved: consent before the scroll, and an empty password before
  either. Scrolling toward a button Shield is not going to press would be motion
  for its own sake.

Nine new checks use that page's measured geometry — the real y positions from
the console output — rather than an invented layout, so they fail if the fix
stops matching the case that motivated it. One existing check was rewritten
rather than deleted: it had asserted "declines rather than ticking the marketing
box", and the invariant it was really protecting (never tick s14) still holds
while the outcome around it deliberately changed.

Totals now: reasoner 74 checks, prompt 35, client 50. Prompt 1.2.0 — it also
now tells the model that PAGE CONTEXT is only what is on screen and that a
missing submit control usually means it has not been scrolled to.

**Still open:** one browser run, the acting half. It is now three actions rather
than two — tick consent, scroll, submit — and the fixture's comment block was
updated to predict that before the run, along with the note that a taller
viewport skips the scroll step legitimately.

**Second demo task verified end to end in Chrome, 2026-09-07.** Three actions
and a clean stop: tick consent, scroll, submit, then the re-capture proposed the
same submit and repeat detection refused it before executing. "stopped after 3
action(s)". Every stage inside budget except the round trip, noted below.

**Two results the log proves rather than suggests**, which is worth separating
from the things it merely does not contradict:
- The marketing checkbox was left alone. Not "we did not see it get ticked" —
  if `s14` had qualified as consent the reasoner would have proposed clicking it
  instead of ever reaching "Submitting it", and it reached "Submitting it"
  twice. The rule discriminated between two identical control types on wording
  alone, which is the entirety of what it exists to do.
- The display name was still empty at the end. "One personal field is still
  empty" appears in the FINAL summary and that clause is computed from the live
  payload, not from a constant, so it is reporting the real state after all
  three actions rather than repeating an earlier claim.

No summary produced at any point contained the word "login". All three defects
recorded at the top of the Phase 2 section are closed.

**The scroll is visible in the element count**: 21 elements before and 21 after,
the h1 having left the viewport as the button entered it. The inputs keep their
ids across the scroll because `dom-map.ts` enumerates interactive elements
before text and every input stayed on screen, which is also why the eleven
detections are identical either side of it.

**The one budget breach, stated rather than explained away.** Round trip
1085.0ms against a 1000ms budget, then 344.8ms on the very next request. The
recorded warm figure from earlier sessions is 6.4-10ms. The downward trend
points at cold start after the server restart, but that is an inference, not a
measurement, and nothing in this session's changes should cost hundreds of
milliseconds — the added work is a `max()` over at most 300 elements. Left open
in TASKS.md as "re-measure on a warm server" rather than closed on a guess. If
it persists warm, it is a real regression and the place to look first is
whatever changed in the server process between the 7.9ms run earlier today and
this one, since the reasoner itself did not get meaningfully more expensive.

**Still wanted, and cheap:** visual confirmation that the marketing checkbox is
unticked on screen at the end and that the intro paragraph shows the green
"Account created at ..." line. The log settles the first logically and says
nothing about the second, since the fixture's confirmation text is only visible
to a person.

**Phase 2 is complete apart from the latency re-measure.** Next session should
start there, then update DEMO_SCRIPT.md, which is still a one-task script and
now understates what Shield does — the second task is the one that shows the
step loop, the re-capture, the scroll and the repeat refusal, none of which the
login demo exercises. Phase 3 stays gated until that is done.

**Visual confirmation, and the defect it found.** Both requested checks passed:
the marketing checkbox is unticked on screen while the terms box is ticked, the
display name is still empty, and the intro paragraph shows the green "Account
created at 1:33:00 AM. The form was submitted by Shield." So the consent rule
discriminating between two identical control types on wording alone is now seen
rather than inferred.

**The latency question is closed, and it was cold start.** Three successive
requests after the restart: 1085.0ms (over the 1000ms budget), 344.8ms, then
84.0ms. Monotonic and inside budget once warm. Worth carrying into
DEMO_SCRIPT.md: start the backend and hit it once before anyone is watching,
because the first request can exceed its budget.

**The screenshot found something no log line would have.** Every overlay box was
about 164px above the field it named — "Email" over First name, "ID number" over
Street address, and the real email address sitting visible with no box on it at
all. The boxes are `position: fixed` at viewport coordinates: correct at the
instant they are drawn, and wrong from the next scroll onward, because a fixed
box stays welded to the viewport while the content slides out from under it. The
offset was exactly the scroll delta.

This was invisible for the whole of Phase 1 and would have stayed invisible.
Nothing ever scrolled — the login screen fits on one screen and Shield had no
scroll action — so the Module F item's standing "NEEDS VISUAL VERIFICATION" note
could have been discharged by looking at the login screen and would have
confirmed a bug rather than caught it. It took a long form plus a scroll action
to make the assumption fail. Worth remembering: "verified visually" is only
worth what the screen it was verified on could have disproved.

Not a privacy failure, and worth stating precisely rather than reassuringly: the
frame redaction paints viewport-space rectangles onto a viewport-sized
screenshot captured at the same instant, so those align by construction, and the
seal independently verified every flagged element carried its placeholder. What
broke is Module F's trust display — which is the one feature whose entire job is
to be believable, so this is not a small bug either.

Fixed by clearing the overlay on any real scroll rather than pinning the boxes
to the content. Pinning was the obvious alternative and is worse: the overlay
describes ONE capture, and a capture only ever held what was inside the
viewport, so boxes that followed the content would keep looking authoritative
while the user scrolled into fields Shield never examined — and those fields
would carry no box, which reads as "checked and safe" rather than "not looked
at". Clearing keeps the claim exactly as wide as the evidence. A scroll event
that moved nothing is ignored, since pages fire those and this panel is exactly
what somebody is looking at when it happens.

**State at the end of this session:** 50 client tests, 109 server checks
(reasoner 74, prompt 35), typecheck clean, extension rebuilt. Phase 2 is
complete: every item in the section is ticked.

**Next session should start with DEMO_SCRIPT.md**, which is still a one-task
script and now understates what Shield does. The second task is the one that
exercises the step loop, the re-capture, the scroll and the repeat refusal —
none of which the login demo touches — and the overlay fix wants a line in the
script too, since scrolling during the demo now clears the boxes deliberately
and that will look like a bug to anyone not told. Phase 3 (face detection on
video-call screens) is unblocked once that is done.

**The extension must be reloaded in Chrome before the next run** — `dist` was
rebuilt with the overlay change, and unlike every other change this session, it
is client-side.

**DEMO_SCRIPT.md retargeted rather than updated or deleted.** It was three
documents under one name: a minute-by-minute narration script, a technical
pre-demo checklist, and prepared answers to judge questions. The narration is
owned by whoever presents and changes every rehearsal, so keeping it in the repo
was maintenance with no reader; it is gone, along with the rehearsal and
contingency sections.

What stayed is the part that comes out of the code and therefore goes stale
silently: the conditions a demo must be run under to show true numbers, and the
Q&A. Both now update as a by-product of normal work rather than as a separate
chore. The file is honest about earning nothing on the rubric
(EVALUATION_CRITERIA.md is 100% technical) and about existing only to protect
the scores that do count.

Four fixture gotchas were added, each one hit for real this session and each one
capable of making a correct run look broken on camera:
- `02-signup.html` keeps its terms box ticked after a run, so a second take is
  two actions rather than three. Reload between takes.
- `02-signup.html` with empty passwords makes Shield decline — correct, and a
  fine demo of its own, but not the acting demo.
- `01-login.html` keeps its "Signed in at ..." confirmation.
- The overlay clears on scroll deliberately, so scrolling mid-shot removes the
  boxes. Anyone recording without knowing that will film what looks like a bug.

Also recorded: warm the backend before recording. Measured 1085ms, then 344ms,
then 84ms across three successive requests after a restart, so an unwarmed
backend films the one number that breaks its budget.

Doc-list descriptions in CLAUDE.md and README.md updated to say what the file
now is, so nobody opens it expecting a script.

## 2026-09-07 — PHASE 3: face detection measured

**The design question was answered before any work again.** A photo gallery has
no form, so the third demo task is PROTECTION rather than action: Shield hides
what the DOM cannot describe, and then declines to act because there is nothing
to do. The pairing is the point — a detector that finds faces is only worth
having if the reasoner stays quiet — and this is the screen where the detector
is loudest. Considered and deferred: a profile-edit fixture putting a face
beside name/email fields with a Save button, which would be the better demo but
needs a new fixture with written-first expectations on the path CLAUDE.md
already marks higher-risk.

**Predictions were written into the fixture before the run**, as on every other
screen, including the reasoning behind them: the frame is ~1920px downscaled to
a 320px model input, a factor of about 6, and a face occupies roughly 60% of
each image's width, so a 200px rung shows the model ~20px of face and a 36px
rung ~3px. Predicted 5-6 of 8 with the floor at 110px.

**Result: 6 of 8.** Count correct, floor one rung pessimistic — it is at 80px.
Peak score 0.990, inference 40.0ms on WebGPU, redaction 75.1ms/200 for six
regions, round trip 61.3ms. Every stage inside budget. All eight images were in
the viewport, so the two misses are genuine misses rather than off-screen
elements.

Boxes were matched to rungs by size, box width running consistently ~0.4x the
rendered image width: portraits 0.990 and 0.980, then 200px 0.937, 150px 0.962,
110px 0.538, 80px 0.312. The 55px and 36px rungs produced nothing.

**Two findings worth more than the count.**

The floor is SOFT. The 80px rung cleared a 0.3 threshold at 0.312 — twelve
thousandths of margin. That is not "80px works", it is "80px barely worked on
this photograph", and a different face, crop or lighting could fail there. The
claim to make is a floor between 80 and 110px that is unreliable at the bottom.
Recorded so nobody later reads "6 of 8" as a stable capability.

The two misses are a RESOLUTION limit, not a threshold one. `candidates 20/14/9
at 0.3/0.5/0.7`, and the rungs are spatially separate so NMS cannot be
suppressing them against each other — a rung producing any candidate above 0.3
would have survived as its own face. Those two produced nothing at any cutoff.
Lowering the threshold further buys no faces and costs false positives; the fix
would be tiling or upscaling before inference, which is different work. This is
exactly the distinction the `candidatesByCutoff` diagnostic was built to make,
and it is the first time it has actually earned its place.

**It also settles the earlier threshold change arithmetically.** Dropping 0.5 to
0.3 was decided on a partial measurement. The full ladder shows the survivors at
0.5 would be exactly the five above 0.5 — which is what was recorded then — so
the change bought the 80px rung and nothing else. Small, real, and worth having
given the asymmetry: a false positive paints over background, a false negative
puts a face on a server.

**The over-redaction half passed too**, which a page of nothing but faces could
not have tested. Zero DOM detections, so headings, captions and the control
paragraph were untouched, and all six face boxes are accounted for by six known
faces — leaving no spare box to have landed on the control paragraph.

**Still outstanding:** the redacted frame has not been looked at. Every check so
far is one number agreeing with another, and none of them would notice a
rectangle painted in the wrong place — which is precisely the bug found on the
overlay earlier today. The frame data URL is printed on fixture runs; pasting it
into a tab is the last check.

**Next session:** confirm that frame visually, then either the deferred
profile-edit fixture or the Documentation & Submission items, which are now the
largest block of unticked work left.
