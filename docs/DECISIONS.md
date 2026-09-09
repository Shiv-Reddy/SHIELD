# Decisions — Shield

Settled choices, so they are not re-litigated mid-project. What was
decided, and why. Newest last.

1. **Project name is "Shield"**
   — Directly describes the core mechanism — detecting and hiding identifiable elements, locally, at the screen level.
2. **Target browser is Chrome only (for hackathon)**
   — Simplifies the build significantly for a hackathon timeline. WebGPU support in Chrome is solid and well-documented. Multi-browser support is architected for (see ROADMAP.md Phase 5) but not built now.
3. **Explore free-tier options first for the server-side AI model, no paid API committed to yet**
   — Keeps project cost near zero during development.
4. **Primary demo task is login/form autofill**
   — Simplest, most relatable task to show live; naturally showcases every mandatory requirement in one clear flow.
5. **Secondary demo tasks (if time allows): multi-field signup form, then video call/profile photo face detection, in that order**
   — Proves generalization beyond one hardcoded page. Signup form first (lower risk, reuses DOM logic); face detection second (higher risk, different code path).
6. **DOM-based detection is the primary signal for form-based PII; the visual model is a secondary/supplementary signal**
   — DOM attributes are cheap and highly reliable. The visual model's real value is catching what DOM signals structurally cannot (faces, on-screen text).
7. **When uncertain whether something is sensitive, default to hiding it**
   — A missed PII item is a more serious failure than an over-redacted safe item, both for real-world safety and for the evaluation rubric's PII recall weighting.
8. **No AI-tool traces in the codebase (comments, commit messages, file headers)**
   — Codebase should read as the team's own engineering work.
9. **Expand all project documentation to full production-grade depth, not just hackathon-MVP level**
   — The team wants a genuinely complete plan — covering security/threat model, API contracts, full risk register, and a post-hackathon roadmap — not just what's minimally needed to pass judging. This does not change what gets BUILT for the hackathon (still Phase 1 core first, per TASKS.md) — it changes…
10. **Server action vocabulary is a fixed allowlist (click, type, scroll), validated on both server and client**
   — Bounds the security blast radius of any reasoning-model error or manipulation — the server can never cause arbitrary code execution or undefined behavior on the client, only a pre-approved, safe set of actions.
11. **Redaction uses semantic placeholder tokens (e.g. `[PASSWORD]`, `[NAME]`) instead of blind blackout/deletion**
   — Preserves page structure so the cloud reasoning model can still interpret the page correctly, directly protecting the accuracy score (25% weight) while keeping the privacy guarantee fully intact.
12. **Extension client is written in TypeScript, built with Vite**
   — TECH_STACK.md left this open ("JavaScript or TypeScript"). TypeScript wins because the central risk in this project is a wiring mistake that hands unredacted data to the transport layer, and a type system can make that a build failure instead of a live incident.
13. **The redact-before-transmit invariant is enforced by a phantom type — `Sanitized<T>` in `extension/src/lib/types.ts`, branded with a non-exported `unique symbol`**
   — Only the Redaction Engine can mint a `Sanitized<T>`, and the Transport Layer accepts nothing else, so passing unredacted data to the network is a compile error rather than something we hope code review catches.
14. **A second, independent runtime guard tracks which pipeline stages actually completed, and refuses to advance past `sending` unless `redacting` ran**
   — The type seal catches bad wiring at build time but cannot catch a stage that was entered and then threw, returned early, or was skipped by a conditional. Two mechanisms guarding the same boundary is deliberate, not redundant — this is the one boundary in the system where a single point of failure…
15. **Visual capture uses `chrome.tabs.captureVisibleTab`**
   — ARCHITECTURE.md Section 2.1 said "`chrome.tabCapture` or an in-page canvas snapshot" without choosing. `captureVisibleTab` is a better fit than either: it returns exactly one still image of the visible viewport, which is what PRD.md Section 20 specifies we process, whereas `tabCapture` yields a…
16. **No static `content_scripts` in the manifest — the content script is injected on demand via `chrome.scripting.executeScript` under `activeTab`**
   — A static content script matching `<all_urls>` would run on every page the user ever visits and require broad host permissions. On-demand injection means Shield has no presence at all on pages the user hasn't explicitly pointed it at.
17. **Build output is unminified**
   — Shield's core claim is that anyone can verify nothing unredacted is transmitted. Shipping minified code would undercut that at the moment it matters most — when a judge or reviewer opens the source.
18. **Vite build runs in two passes (`vite.config.ts` plus `vite.content.config.ts`)**
   — Content scripts execute in a classic, non-module script context and cannot use runtime `import`, so they must be a single self-contained bundle. The popup and service worker can be ES modules and benefit from shared chunks.
19. **Vite 8, not Vite 5**
   — Vite 5 pulls a transitive esbuild with a published advisory. The advisory only affects the dev server, which we never run, but the project has a dependency-scanning commitment in TECH_STACK.md and shipping a known-vulnerable toolchain would be a bad look in a security-focused submission.
20. **Extension icons are generated from source (`extension/tools/make-icons.mjs`, Node built-ins only) rather than committed as binaries**
   — Keeps the repository fully reviewable — there is no opaque image blob anyone has to take on trust — and adds no dependency. `public/icons/` is gitignored and regenerated by the build.
21. **`CapturedFrame` holds an `ImageBitmap`, never the `data:` URL that `captureVisibleTab` returns**
   — A base64 string of an unredacted screenshot is the most dangerous value in the extension — it can be console-logged, passed to `sendMessage`, or JSON-stringified by accident, and each of those is a leak.
22. **Frames are released explicitly via `disposeFrame()` in a `finally`, on every exit path from a run**
   — `ImageBitmap` pixels live outside the JS heap and are not collected promptly. PRD.md Section 16 promises captured frames are discarded immediately after processing, and an aborted run must not leave a screenshot resident.
23. **CSS-to-frame pixel scale is derived by measurement (`frame.width / viewport.width`), not taken from `devicePixelRatio`**
   — Scrollbar width, page zoom, and Chrome's own rounding all move the real ratio away from the reported DPR. Redaction rectangles come from DOM coordinates in CSS pixels, so a systematic scale error would offset every blur box on the frame — a redaction that misses its target is a leak, not a cosmetic…
24. **Capture format is PNG (lossless)**
   — The local vision model and any OCR pass read these pixels directly, and JPEG ringing around text is exactly the artefact that costs detection recall — weighted more heavily than latency in PRD.md Section 7.
25. **The screenshot data URL is decoded by hand rather than with `fetch(dataUrl)`**
   — `fetch` on a data URL is harmless in itself, but it means an unredacted screenshot briefly exists as a request. "No code path sends a frame anywhere before redaction" is a far easier claim to audit when the frame never touches a networking API at all.
26. **One automatic retry when `captureVisibleTab` hits Chrome's ~2-calls-per-second quota**
   — The multi-step task loop can legitimately capture faster than the quota allows. A transient throttle is not a failure the user should have to understand, so it is absorbed rather than surfaced. Genuine capture failures (chrome:// pages, PDFs, no activeTab grant) still surface with a specific…
27. **Every pipeline stage is timed against the ARCHITECTURE.md Section 6 budget from the start (`src/lib/timing.ts`), logging a warning when over budget**
   — Latency is 15% of the score, and it is lost not to one catastrophic stall but to a stage quietly drifting over budget across many commits. Timing with the budget written next to the measurement makes that drift visible the day it appears.
28. **The content script never reads the value of a password field — not read-then-redacted, never read at all**
   — Nothing downstream wants it. The Redaction Engine would replace it with `[PASSWORD]`, and API_SPEC.md Section 5 forbids the server from sending a sensitive value back, so the Action Executor never needs one either.
29. **Selectors are built from tag names plus `:nth-of-type`, preferring a unique `id`; class names are never used**
   — CSS-in-JS and utility frameworks regenerate class names between builds and sometimes between renders, so they look specific while being the least durable thing available. The Action Executor has to re-resolve the target after the page has had time to change (PRD.md FR-21), so durability beats…
30. **Every generated selector is verified to round-trip at capture time, and failures are counted**
   — A selector that cannot find its own element while that element is still in hand certainly will not find it later. Far better to know during the scan than to discover it while acting — acting on the wrong element is one of the failure modes PRD.md Section 20 explicitly calls out.
31. **Interactive elements (inputs, buttons) are collected before text and images, and are never dropped by the 300-element cap**
   — The cap exists to bound payload and latency on large pages. If something must be dropped it should be background prose, never the field or button the task depends on — dropping those would cost task accuracy, the heaviest single metric at 25%.
32. **Anchors with `href` are classified as `button`**
   — The API_SPEC.md Section 3 vocabulary has no "link", and from the reasoning model's point of view what matters is that it is a click target. Calling a "Forgot password?" link `other` would hide a legitimate next step during the exact task we care most about.
33. **An empty element map fails the run**
   — Zero elements is indistinguishable from a page with nothing sensitive on it, and the PII Detector would find nothing to hide and pass it straight through. Failing closed on an empty reading is required by ARCHITECTURE.md Section 9.
34. **The element map is logged to the service worker console without field values — labels, types and selectors only**
   — A console is somewhere content travels to: it survives in the devtools buffer and gets pasted into bug reports. Page structure is safe to show; what the user typed is not.
35. **`domScan` gets its own 100ms latency budget alongside `capture`**
   — ARCHITECTURE.md Section 6 has a single "Screen capture < 100ms" line, but Screen Perception is two independent pieces of work with different performance characteristics and different fixes when they get slow.
36. **The content script registers its message listener unconditionally, with no `window.__shieldLoaded`-style double-injection guard**
   — Such a flag lives on the page, which outlives the extension. After an extension reload every already-open tab still carries the flag, so the fresh injection skips registering while the previous script sits orphaned and unable to receive anything — leaving the tab permanently deaf until reloaded by…
37. **Every build stamps itself, and both the service worker and the content script log that stamp plus the manifest version on startup**
   — Chrome will happily keep running a previous build — a cached service worker, a second copy loaded from another folder, a reload that silently did not take. All of those look identical to "the code is broken" from the console, and three sessions were lost to exactly that ambiguity, including one…
38. **The popup displays the running version and build stamp in its footer**
   — The service worker DevTools console silently detaches when an extension reloads and then replays its old buffer indefinitely, which is indistinguishable from "the new code does not work". Several sessions were lost to that ambiguity.
39. **A `<label>` element is not reported as a standalone text region when its text is already carried as a control's `label`**
   — Without this every labelled field appears twice — once as the input carrying "Password", again as a text region saying "Password". On the login test screen that was 3 of 11 elements duplicated; on a signup form it is worse.
40. **The unresolved-selector count is logged even when it is zero**
   — It is a correctness check, and a check you only see when it fails is one you stop trusting. Seeing "0 unresolved selectors" is what makes its absence meaningful.
41. **The local vision layer targets what DOM cannot see — faces and text baked into pixels — rather than generic UI-element detection**
   — ARCHITECTURE.md Section 2.1 describes a model that "detects and classifies visual regions", but DECISIONS.md separately locks DOM as the primary signal, and the DOM walk now maps a login form completely in 3.9ms.
42. **Face detection uses UltraFace version-RFB-320, not BlazeFace**
   — Three reasons, in order of weight. (1) Fit: UltraFace is trained on WIDERFACE and built for "medium/long-distance small faces", which is our actual case — a profile photo or video-call thumbnail somewhere on a page.
43. **Local models are committed to the repo, pinned by sha256 in `extension/tools/models.json`, and verified on every build**
   — ARCHITECTURE.md Section 8 requires pinned models shipped with the extension. Fetching at build or run time would mean the demo can break because someone else's host changed a file or went down. A model is also the one artefact here that is downloaded rather than written, and a truncated or swapped…
44. **OCR runs only on crops of image elements, never the full frame**
   — Tesseract.js on a full 1920x945 frame would take hundreds of milliseconds to seconds and destroy the latency budget. But the DOM element map already tells us exactly where the `img`, `canvas` and `video` elements are — the only places text can hide from the DOM in the first place.
45. **Local inference runs in an offscreen document, not the service worker**
   — Not a preference — a hard constraint. Manifest V3 service workers disallow dynamic `import()` per the HTML spec, and ONNX Runtime Web's WASM and WebGPU backends are both unavailable there (microsoft/onnxruntime#20876).
46. **`CapturedFrame` (holding a decoded ImageBitmap) is replaced by `RawFrame` (holding the still-encoded data URL)**
   — The offscreen split above made the original design wrong. The service worker would have had to decode a frame only to re-encode it to cross the message boundary — slower, and it would have put raw pixels in the networking context for no benefit.
47. **ONNX Runtime's WASM assets are copied into the extension and loaded via `ort.env.wasm.wasmPaths`, never from a CDN**
   — Two reasons, the second decisive. A CDN fetch breaks offline, which during a live demo is plausible and unacceptable. More importantly, Shield's whole claim is that screen understanding happens on-device — pulling the inference runtime from a third-party origin at run time puts that origin in a…
48. **Build with ORT's `onnxruntime-web-use-extern-wasm` export condition**
   — Without it, importing onnxruntime-web resolves to a bundled build whose `new URL(...)` reference makes Vite emit a second 25MB copy of the binary into dist/assets, on top of the copy we deliberately ship — 52MB total, with ORT loading whichever it resolved first (microsoft/onnxruntime#24009).
49. **`tools/copy-ort-assets.mjs` derives which WASM files to copy by reading ORT's own entry point, rather than hardcoding filenames**
   — The hardcoded version broke silently within an hour of being written: ORT renamed its WebGPU binary from `jsep` to `asyncify`, so the script copied a file nothing loads while the file ORT wanted was absent — and the build still passed, because nothing checks that a 25MB asset is the right 25MB…
50. **`ort.env.wasm.numThreads = 1`**
   — Multi-threaded WASM needs SharedArrayBuffer, which needs the document to be cross-origin isolated, which needs COOP/COEP response headers that an offscreen document cannot set. Requesting threads yields a confusing initialisation failure rather than a graceful fallback, so single-threaded is the…
51. **The offscreen document is torn down when a run ends**
   — It holds a compiled 25MB WASM module and, on the WebGPU path, GPU buffers. An idle extension pinning that is exactly what the 20%-weighted resource-utilisation metric penalises. The cost is paying session startup again next run, which is why `modelInit` is budgeted separately from `inference` —…
52. **The model is warmed up with one throwaway inference at load time**
   — WebGPU compiles its shaders lazily, on first inference rather than at session creation. Measured on the login screen: the first real inference took 2122ms and every subsequent one took 84ms — a 25x penalty paid by whichever frame happened to be first, which in a demo is the frame someone is…
53. **The offscreen document outlives a single run and closes itself after 120s idle, rather than being torn down when each run ends**
   — This reverses an earlier decision, on measurement. Tearing down after every run was justified on resource grounds, but the numbers showed a run whose actual inference took 84ms spending roughly 1000ms recreating the document and rebuilding the session — over a second of pure overhead, every time,…
54. **Opening the popup starts loading the model, before the user has typed anything**
   — Measured first-run overhead was ~940ms — offscreen document creation, session build and shader warm-up — all of it landing between pressing Run and seeing a result. But opening the popup is a strong signal that a run is seconds away, and the time spent typing a task is time the inference host could…
55. **A `forceBackend` setting in `chrome.storage.local` can pin the inference backend, bypassing WebGPU detection**
   — The CPU fallback is otherwise untestable on hardware where WebGPU works, and it worked on every run here — so the fallback path required by PRD.md FR-27 was written but had never executed once. "It will probably work" is not evidence, and waiting to find a machine without WebGPU is a poor way to…
56. **A CPU fallback is shown to the user in the popup, not just logged**
   — PRD.md Section 20 requires the fallback to be automatic AND the user informed that things may be slower. A silent order-of-magnitude slowdown reads as a bug, and Shield's whole pitch rests on never being quietly worse than it claims.
57. **The backend override is toggled by clicking the build line in the popup, not by typing into a console**
   — Two reasons. Practically, Chrome's self-XSS guard blocks pasting into DevTools until the user types "allow pasting", which turned a one-line test into a support conversation — a test nobody can run easily is a test that does not get run.
58. **Changing the backend override rebuilds the inference session in place, rather than closing and recreating the offscreen document**
   — The first implementation did the latter and silently did not work. `closeDocument()` and `createDocument()` race: `getContexts()` can still report the closing document as alive, so the recreate is skipped and the old session — holding the old backend — survives.
59. **Shield proves its own CPU fallback once per installation, rather than relying on someone testing it by hand**
   — PRD.md FR-27 requires the fallback to work where WebGPU is unavailable, and TESTING.md Section 5 requires testing across several laptops. Both are easy to assert and hard to verify: on a machine where WebGPU works, the fallback path never executes, so it can rot indefinitely while every run looks…
60. **The self-test verdict is pulled from storage on every run, and only a passing result is cached**
   — The first version reported its verdict solely by pushing a message at the single moment the test finished, and cached whatever it got. That produced the one outcome a self-test must never produce: silence.
61. **The service worker owns all storage and all policy; the offscreen document is a pure executor**
   — The self-test passed and its result was never persisted, so it re-ran on every capture — and the same storage the offscreen document was failing to write is where `forceBackend` is read from, which is very likely why forcing the CPU backend appeared to do nothing across three attempts that were…
62. **Storage failures are logged, never swallowed**
   — `readSelfTestRecord` returning null meant both "no record" and "storage threw", and `readSettings` returning defaults meant both "no override" and "storage threw". Both collapses hid real failures behind normal-looking output — the second time in this module that an error-swallowing catch turned a…
63. **"Re-capture on multi-step task continuation" moves from Module A to Module E**
   — It is a property of the task loop, not of perception. The capture code it depends on is finished and verified, but nothing can trigger a second capture until the executor's loop exists, so the item could never be satisfied where it sat — leaving Module A permanently open on work belonging to…
64. **Confidence scores are recorded but never gate redaction**
   — SECURITY_PRIVACY.md Section 4 states that a missed detection is a more severe failure than an unnecessary one, so there is no confidence below which Shield decides to let something through. Storing a number invites a future `if (confidence > threshold)` around a redaction, which would quietly…
65. **Field rules apply only to value-holding controls; visible text is matched by content instead**
   — Field-name patterns describe what a control *holds*. Run over links and buttons they misread UI chrome as data — "Forgot password?" on the login test screen matches the password pattern perfectly and is not a password.
66. **Phone detection in visible text requires ten digits, or eight with an international prefix**
   — A flat eight-digit threshold cannot tell a phone number from a date range — "Copyright 2024-2025" is eight digits in two groups and matches the shape exactly. Checked against ordinary prose (date ranges, order numbers, section ranges, prices) before adopting, which is how the flat threshold was…
67. **Fields are flagged whether or not they currently hold a value**
   — An empty password box is still a password box. The page can fill it between capture and transmission, which is the time-of-check-to-time-of-use gap the threat model's tampering row warns about.
68. **Face detection runs at a 0.5 score threshold, below UltraFace's usual 0.7, and every kept box is padded by 15%**
   — SECURITY_PRIVACY.md Section 4 asks for a bias toward over-redaction on faces specifically, and the asymmetry is stark: a false positive blurs a rectangle of background, a false negative puts someone's face on a server.
69. **Face boxes are carried as fractions of the frame, converted to CSS pixels in exactly one place**
   — Coordinate errors are the failure mode that matters for visual redaction, because a box offset by a systematic scale factor still looks like a plausible redaction while leaving the actual face visible.
70. **Capture format changed from PNG to JPEG at quality 90**
   — The PNG decision above set its own revisit condition — a visually heavy page pushing a single cold capture over budget — and it fired exactly as written. A photo-heavy real page produced a 1511KB PNG in 349.7ms against a 100ms budget, 26 seconds after the previous capture, so Chrome's ~2/sec…
71. **Full element-map detail is logged only for local test fixtures**
   — The element map was printed in full on every run, on the reasoning that labels are page structure rather than user input and are therefore safe to show. That reasoning was wrong. A run against a real social feed printed dozens of other people's names and handles into the console — a buffer that…
72. **Face box coordinates are clamped on both edges and re-ordered after padding**
   — Padding clamped the far edge down to 1 while leaving a near edge above 1 untouched, which turned an out-of-range box inside out rather than rejecting it. The result was regions with negative width reaching the redaction stage — `-1814x401` among them.
73. **Added an `other` category, and unmatched fields holding content are redacted by default**
   — CLAUDE.md and SECURITY_PRIVACY.md Section 4 both require ambiguity to resolve toward hiding, and the code did the opposite: a field whose markup matched no rule was passed through untouched. Flagging it needs a category, and none of the existing seven honestly describes "we could not tell".
74. **Arbitrary personal names in page text are out of scope, and the limit is documented rather than half-solved**
   — A real social feed produced zero DOM detections while displaying many people's names, because they sat in link and button labels. Names cannot be recognised by pattern the way an email or a phone number can — telling a name from any other capitalised words needs a named-entity model.
75. **The OCR pass is deferred, explicitly**
   — It is the only Module B task the locked login demo never touches, and it adds a model download and an inference stage to a pipeline that Modules C, D and E have not yet been built against. Marked deferred rather than left unchecked so the distinction between "not done" and "decided against for now"…
76. **Sensitive regions are painted out with an opaque fill, not blurred**
   — Blur looks better in a demo and is the more common choice, which is exactly why it deserved scrutiny: it reduces information rather than removing it, and both blurred text and blurred faces have been recovered by published attacks.
77. **DOM detections are painted onto the frame too, not only faces**
   — A DOM detection means the value is also visible on screen. An email address in a text field is in the screenshot as surely as it is in the DOM, so replacing the DOM value with a token while shipping a picture of the same characters would defeat the whole exercise.
78. **The redacted frame is encoded as JPEG at quality 80**
   — A separate decision from the capture format, and a simpler one: this image is already redacted, so nothing sensitive can be recovered from it however it is compressed. Only payload size and the server model's ability to read the page remain, and quality 80 keeps text legible at a fraction of…
79. **`sealAsRedacted` is the single mint point for `Sanitized<T>`, and sealing verifies rather than assumes**
   — The seal symbol is declared but never exported, so only one function can construct the type — which makes the invariant greppable: searching the codebase for `sealAsRedacted` finds every point where something was declared safe to send, and there is exactly one, inside the Redaction Engine.
80. **Face boxes are decoded against a reconstructed prior grid**
   — The model does not emit rectangles. Its `boxes` output is SSD-style regression offsets relative to a fixed grid of prior boxes, and reading them as coordinates is meaningless — measured raw range on a real page was -4.268..3.368.
81. **The prior count is asserted rather than assumed**
   — The first prior grid produced 4400 instead of 4420, because the last detection head has three box sizes and I gave it two. Without the assertion every box would have decoded against the wrong anchor — producing confident detections in the wrong places, which is far harder to notice than a negative…
82. **The backend ships a rule-based reasoner that needs no model**
   — The free-tier model choice has been the oldest open blocker, and it was blocking work that did not actually depend on it. A rule-based path reads the redacted DOM summary, recognises a login form by its placeholder tokens, and returns the corresponding action — with no key, no network and no…
83. **The action carries a credential *reference*, never a credential**
   — The server has no access to the user's password and must never be sent one — that is the whole premise. But the action it returns has to be able to say "fill the password here".
84. **Backend dependencies pinned to releases with prebuilt wheels for the Python in use**
   — The first pins were current-looking versions whose pydantic-core had no Python 3.14 wheel, so pip fell back to building from source and needed a Rust toolchain. A backend that only installs on machines with Rust is a backend that fails on somebody else's laptop on demo morning.
85. **Selectors are absolute paths to the root, not truncated at eight levels**
   — The walk stopped after eight ancestors to keep selectors short. On a shallow page that is harmless; on a deeply nested application it produced not a shorter selector but a *different* one — a relative chain like `div > div > span > a` that `querySelector` resolves against the first such element…
86. **Shield stores no credentials, and refuses credential-fill requests**
   — The reasoner can ask for a saved credential by reference. Honouring it would mean keeping passwords in `chrome.storage.local`, in plaintext, readable by any code in this extension — on a project whose entire claim is that secrets stay protected.
87. **`filled` added to the redacted DOM summary**
   — A redacted field reads `[PASSWORD]` whether it is full or empty, because the token says what belongs there rather than what is there. That hid the distinction the assistant needs most: "this field needs filling" and "this form is ready to submit" are different situations requiring different…
88. **Host permissions are limited to the local backend**
   — MV3 blocks cross-origin fetch from a service worker without an explicit host permission, so the transport needed one. Granting broad host access would have been easier and would have meant Shield could reach any origin — a poor trade for a project whose claim is that you know where your data goes.
89. **An action is refused if it repeats the previous one, before it is performed**
   — Found by running the full loop for the first time: the assistant proposed "click submit", the fixture's submit handler intercepts the event so nothing visibly changed, and the next step saw the same filled form and proposed the same action — five times, until MAX_STEPS stopped it with an error.
90. **The redaction overlay is inert, and cleared rather than left standing**
   — It draws over the page at the maximum z-index, and the executor is about to click something underneath it. An overlay that could swallow that click would break the action it exists to explain.
91. **The transmitted payload is recorded before the request, not after**
   — DEMO_SCRIPT.md step 5 calls this the standout differentiator, and the reason it matters is that every other guarantee in the project is an assurance about code the reader has not read — this is the bytes.
92. **The Zero-Leak Verification is automated, and stronger than the manual procedure it replaces**
   — TESTING.md Section 6 describes it as opening DevTools and reading the payload by eye before every demo rehearsal. That is exactly the kind of check that gets skipped under time pressure, and it is also weaker than it sounds: the existing per-element check only looks where it expects a value to be,…
93. **Unit tests run on Node's built-in runner with no new dependencies**
   — Node 24 executes TypeScript directly and ships `node:test`, so vitest or jest would have added a large dependency tree to a project whose supply chain is part of its security story.
94. **The choice of reasoning model is configuration, not code**
   — The free-tier model choice has been open since Session 0, and it was never really a code question — every candidate (Groq, OpenRouter, Together, Google's OpenAI-compatible endpoint) speaks the same chat-completions shape.
95. **The model's reply is parsed as untrusted input**
   — Not because a provider is assumed hostile, but because the reply is influenced by page content nobody controls, and because a model that has simply misunderstood produces the same malformed output as one that has been manipulated.
96. **The redaction-aware prompt treats page content as data, never as instructions**
   — Labels and text come from whatever site the user is on, and a page can contain a sentence addressed to the model. That is a prompt-injection path into the component that decides what to do to the user's screen, and it was not in SECURITY_PRIVACY.md's threat model — the elevation-of-privilege row…
97. **A `<select>` value is exempt from default-to-hide, but not from detection**
   — Its content is one of the page author's own options, so nothing a user entered can be in it. Hiding "How did you hear about us? → A friend" protects nobody and costs the reasoning model a piece of the page it may need.
98. **The client refuses to type a literal value into a field it redacted, independently of the server**
   — The server applies the same rule when it reads the model's reply, but SECURITY_PRIVACY.md's elevation-of-privilege row treats the server as a component that can be compromised or simply wrong. This is the case where being wrong is worst: the only way the assistant could know what belongs in a…
99. **The client pipeline is tested against every screen on every `npm test`, from checked-in element maps**
   — The integration run was a manual procedure — load the extension, open each screen, read the console — which runs when somebody remembers, and under deadline pressure that means less often exactly as the code changes fastest.
100. **The latency breakdown reads the pipeline's existing measurements rather than taking its own**
   — Every stage was already timed against the ARCHITECTURE.md Section 6 budget and the numbers were going to a console. One measurement with two readers cannot disagree with itself; a second measurement would eventually drift from the first and nobody would know which to believe.
101. **The second demo task is "finish the sign-up", not "fill the sign-up"**
   — Shield stores no credentials, so it cannot fill a password on an empty form. That ruled out the obvious reading of the task, and the two remaining readings were not equally good. Submitting an already-filled sign-up is the same single click as the login demo and shows nothing new but a larger…
102. **On a sign-up form an empty password is a decline, not a `[USE_SAVED_CREDENTIAL]` request**
   — Not merely because Shield has no vault. A sign-up password is a *new* password for an account that does not exist yet, so no credential store could hold it — asking for a saved one is wrong in principle and not just unfulfillable.
103. **Shield ticks a required-consent checkbox, and never an optional one**
   — Ticking "I accept the terms of service" on somebody's behalf is a deliberate act, and it is what "create this account" means — the form cannot be submitted without it. Ticking "Send me occasional product updates" is not part of any task the user asked for; it signs them up for mail they did not…
104. **Shield does not treat an empty non-secret field as a reason to refuse to submit, but it does say the field is empty**
   — Shield will not invent a value — it has no idea what display name somebody wants — so the only two options are "submit what the user has already typed" and "refuse". The page gives the server no way to know a field is required: `required` is not in `RedactedDomEntry`, and inferring it from a label…
105. **A sign-up form is recognised by evidence, and its submit control is matched against sign-up wording rather than a shared word list**
   — `_looks_like_submit` matched only login wording, so a page whose button says "Create account" had no submit control at all — the measured Phase 2 blocker. Widening one shared list would have fixed that and created a worse problem: a sign-up page usually also carries a "Sign in" link for people who…
106. **`IDENTITY_TOKENS` includes `[ADDRESS]` and `[ID_NUMBER]`, and still excludes `[REDACTED]`**
   — an address field and an identity-number field are personal fields by any reading, and the sign-up shape test counts categories. `[REDACTED]` stays out because it means "hidden, kind unknown" — counting it would let any single unidentified field plus a password look like a form Shield understands.
107. **On a sign-up form whose submit control is below the fold, Shield scrolls rather than declining — and the login path does not**
   — Found the expensive way, on the first real browser run of the second demo task. The client captures only what intersects the viewport (`dom-map.ts`), and `02-signup.html`'s "Create account" button sits about fifteen pixels below a 945px fold, so the payload carried no button at all: 14 inputs and 7…
108. **The explainable redaction overlay clears itself on any real scroll**
   — The boxes are `position: fixed` at viewport coordinates, which is right at the instant they are drawn and wrong from the next scroll onward — a fixed box stays welded to the viewport while the content slides out from under it, so after N pixels of scrolling every label sits N pixels from the field…
109. **The third demo task is protection, not action**
   — A photo gallery has no form, so there is nothing for Shield to do on it, and inventing an action would be worse than having none. What the screen demonstrates instead is the thing no other screen can: the visual layer hiding something the DOM has no way to describe.
110. **The 0.3 face threshold stays, and the two missed faces are not chased by lowering it further**
   — Measurement rather than preference. On Screen 3 the detector reports `candidates 20/14/9 at 0.3/0.5/0.7` and keeps 6 faces from 8. The ladder rungs are spatially separate, so non-maximum suppression cannot be removing the missing two against each other — a rung producing any candidate above 0.3…
111. **An observe-only mode, added before Shield is pointed at any real website**
   — Shield is an autonomous clicker with a five-step budget. That is the point of it on a fixture, and it stops being an abstract property the moment the page belongs to somebody else. Tracing the paths: a live login form the browser has autofilled ends with Shield clicking "Sign in"; a sign-up the…
112. **Labels are scrubbed before transmission, like values**
   — `RedactedDomEntry` carries a label as well as a value, and until this the label was passed through verbatim on every path — never scanned, never redacted. Our five fixtures could not have shown it: a fixture's labels are things like "Email address", which describe a field rather than being its…
113. **Form kind is decided from fields only; buttons no longer vote**
   — Measured on a live login page. One password field and one email field, both detected correctly, and the reasoner then announced "Sign-up form filled and consented. Submitting it." and chose the sign-up LINK as the control to click.
114. **The submit control is chosen by position, not document order**
   — the same real-page run. Even with the kind decided correctly, the old rule took the first word-match in document order, so a header "Sign in" link would beat the form's own submit button. Both match the wording; only one sits under the fields the user just filled.
115. **Manual redaction — the user can draw a rectangle over anything and have it hidden**
   — Every miss so far has been answered by widening a rule, and that has a ceiling. The rules cannot know that a number in a paragraph is a case reference somebody considers private, because nothing in the markup says so and nothing ever will.
116. **The manual-marking surface is viewport-anchored, and carries its own Run button**
   — the first version was a document-sized `position: absolute` layer appended to `<body>`, which is wrong on a large class of real pages. An absolutely positioned element resolves against its nearest POSITIONED ancestor, and plenty of sites set `body { position: relative }`.
117. **Marking is reachable before a run, and the popup never injects to find that out**
   — the popup messaged the tab directly, which fails on any page the content script has not been injected into — and the guidance for that failure was to run Shield once first. That inverts the feature. The first run transmits the page, so the user had already sent the thing they opened marking mode to…
118. **The rectangle being dragged is painted in viewport space, from corners held in document space**
   — reported as "marking area is not working properly". The stored mark was correct; the live preview was painted at its document coordinate on a surface anchored to the viewport, so on any scrolled page the rectangle drew a full scroll-height below the cursor.
119. **Every colour in the popup is a token defined in both themes**
   — not tidiness. The latency panel hardcoded slate greys chosen for a dark surface (`#cbd5e1` for labels, `#94a3b8` for values) and rendered them on the light background, so the entire timing breakdown was near-white text on white and could not be read at all in light mode.
120. **A checksum may only ever sharpen a label, never license a leak**
   — The obvious reading of "validate the Aadhaar" is to reject the ones that fail, and that is backwards. A twelve-digit number that fails Verhoeff is still a twelve-digit number on someone's screen — a test value, a typo, a mis-scan, or a real number this code is wrong about — and is exactly as sensitive as a valid one. It is redacted either way by the generic digit-run rule; the checksum decides only whether we can name it, and therefore what the placeholder and the trust overlay say. SECURITY_PRIVACY.md §4: uncertain means hide.
121. **Indian identifiers are wired into the classifier AND the scrubber, not just the classifier**
   — They are two separate paths over the same text: the classifier flags a field so its value is tokenised, the scrubber handles free text including labels. A format one path knows and the other does not is hidden in the value and transmitted in the label — the exact defect found on a real site, where an account address rode out inside a label no field rule could see.
122. **Card is matched before Aadhaar, and Aadhaar carries a trailing lookahead**
   — Caught by a test: the Aadhaar pattern matched the first twelve digits of a sixteen-digit card and claimed the span, so cards were labelled Aadhaar and never Luhn-checked. A card is the longer and therefore more specific claim on a run of digits, and needs thirteen digits minimum, so it can never swallow a bare Aadhaar.
123. **The logo is geometry in one module, and every surface is generated from it**
   — The mark appears in the toolbar icon (four PNG sizes), the popup header, and anything outside the extension. Drawing it three times means three things that drift, and a mark subtly different in the toolbar than in the popup looks like a defect in a product whose whole pitch is care. `tools/logo.mjs` holds the shapes once; the PNGs are rasterised from them and the SVGs emitted from them. It also preserves what the icon generator was written for — no opaque image blob in the repository that a reviewer has to take on trust.
124. **The popup inlines the mark with `currentColor`; the black and white SVGs are for everything else**
   — Inline SVG inherits the accent token and recolours with the theme, so the popup needs no second file and cannot show the wrong colourway. The two fixed-colour files exist for surfaces that cannot inherit a colour: the deck, print, the README.
125. **The eye and pupil are knockouts, not white fills**
   — Filled with the even-odd rule so they are genuine holes. A white fill would carry a background with it, and the mark has to sit on a dark toolbar and a light popup unchanged.
126. **`public/icons/*.svg` is committed while the PNGs stay ignored**
   — The ignore exists for generated binaries. An SVG is plain text, fully reviewable, and is what anything outside the extension actually uses, so ignoring it would mean the one artefact the team needs to hand around is the one not in the repository.
127. **The popup is a single committed dark theme, not a light and a dark one**
   — It owns its own window and never sits against the page, so it has no obligation to follow the browser colour scheme. Maintaining two themes is how the previous version shipped a latency panel as near-white text on a white ground: nobody was looking at both. One surface tuned once is the more honest engineering, and a deliberate dark identity is also what makes a tool read as a product rather than a template.
128. **Exactly one saturated element per view — the primary action**
   — Everything else is a hairline, a tint or a muted grey. Restraint everywhere else is what lets the CTA be obvious without having to shout; a surface where several things compete for attention has no hierarchy at all.
129. **No web fonts. Segoe UI Variable with a system fallback**
   — The CSP forbids remote stylesheets, and bundling a face would put a binary blob into a repository whose premise is that everything in it can be read. Segoe UI Variable is a modern optical-sized family already present on the target machines, so the typography improves at zero cost and zero network.
130. **The run indicator is indeterminate, never a percentage**
   — The stages vary by page, so a percentage would be an invented number, and this is the surface whose entire value is that nothing on it is invented. It exists because a status word alone cannot separate "working" from "stalled" at a glance.
131. **Observe-only is a switch, not a checkbox**
   — It is a mode the next run either is or is not in, and a switch states that. A tick box reads as one item in a list of options, which understates what it changes.
132. **OCR is never the only thing between the user and a leak**
   — The obvious build is "run OCR on every image and redact what it finds", which makes the whole protection contingent on an engine loading, a language model being present and a photograph being legible — and when any of those fails it fails silently, transmitting a photographed ID card while the console reports a clean run. Detection is therefore two stages: candidates chosen by geometry alone, which cannot fail, then reading, which improves precision. A failed read covers the candidate whole.
133. **`ok: false` and `ok: true, words: []` must never be conflated**
   — The first means the image was never examined and must be hidden; the second means it was read and is clean. Treating a failure as an empty read is the one bug in this path that would be a privacy failure rather than a broken feature, so per-crop results carry the distinction all the way from the engine to the region builder, and a reply that loses a crop counts as unread.
134. **Recognised text is judged by the same predicate as a form field**
   — `classifyTextContent`, already consulting the Indian identifier rules and the generic patterns. A second rule set for text that arrived as pixels would mean an Aadhaar is caught when typed and missed when photographed, purely because two lists drifted apart.
135. **Words are grouped into lines before they are judged**
   — An Aadhaar number prints as three groups of four digits and the engine reports them as three words; judged individually none of them matches anything. Without grouping, the most common document layout in the country produces no detection at all.
136. **A size floor is what makes the aggressive fallback affordable**
   — Redacting every image would work and would be useless: it leaves the reasoning model a page it cannot describe, and the product becomes a thorough way of breaking websites. An avatar cannot hold a readable Aadhaar number, so it is never a candidate and never blacked out.
137. **The OCR engine, core and language data are served from the extension**
   — Tesseract's defaults fetch all three from unpkg and jsdelivr at run time. Left alone this module would hand crops of a user's screen to an engine downloaded from a third party — the precise thing Shield exists to prevent, arrived at through a library default. The CSP blocks the remote fetch if a path is ever wrong, which is the backstop working as intended rather than a formality.
138. **Below the fold is a coverage gap, not a leak — and the difference decides how much risk is worth taking**
   — `dom-map.ts` filters the scan to the viewport and capture is `captureVisibleTab`, so off-screen content is never detected because it was never captured, and therefore never transmitted. Full-page capture would buy no privacy at all, only reach. Weighing it as though it closed a leak would have justified a far riskier change than the facts support.
139. **The coverage boundary is stated on every run, not only on tall pages**
   — A field with no box over it reads as "checked and safe" rather than "never looked at", which is the one misreading this whole surface exists to prevent. A warning that appears only when it is inconvenient is one nobody learns to look for, so a single-screen page gets a quiet confirmation and a tall one gets the limit, in the same place.
140. **Full-page scroll-and-stitch capture was considered and rejected**
   — Four costs, one of them disqualifying. `captureVisibleTab` is throttled to ~2/sec against a 150ms run; a tall RGBA bitmap runs to tens of megabytes held twice; the payload grows from 71KB to near a megabyte; and sticky headers repeat at every seam, so the stitched image shows content that never coexisted on screen. That last one is fatal on its own — that image is what the "What was sent?" panel presents as a faithful record, and a composite is not one.
141. **Scanning the whole page is a separate path from running, never a flag on one**
   — A run transmits a sanitized payload in order to act; a scan does neither. Sharing an entry point would put one boolean between "nothing leaves this machine" and "something does". `scanPage` reaches no transport at all, so the safety argument is structural rather than conditional — there is no branch to get wrong.
142. **The scan overlay is pinned to the document; the run overlay still is not**
   — Not an inconsistency but the same rule at two widths. The run overlay clears on scroll because it describes one viewport, and boxes that followed the content would look authoritative over material nothing examined. A scan examined the whole document, so pinning its boxes keeps the claim exactly as wide as the evidence behind it.
143. **A scan that stopped short draws the boundary on the page, not just in a summary**
   — Where examination ended is a fact about a place, and somebody scrolling past it needs to see it there. A popup line they closed two minutes ago cannot tell them, and a tidy count over a page half of which was never read is the "checked and safe" misreading again, at greater scale.
144. **A scan puts the page back where it found it, on every exit path including a cancelled one**
   — It moves someone else's page for several seconds. Ending somewhere they never scrolled to is a small rudeness with a large tell: it says the tool has decided the page belongs to it.
