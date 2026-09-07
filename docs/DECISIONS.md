# Decisions Log — Shield

Record of settled choices and why, so we don't re-litigate them mid-project.

---

**Decision:** Project name is "Shield"
**Full form:** Screen-level Hiding of Identifiable Elements using Local Detection
**Why:** Directly describes the core mechanism — detecting and hiding
identifiable elements, locally, at the screen level.

---

**Decision:** Target browser is Chrome only (for hackathon)
**Why:** Simplifies the build significantly for a hackathon timeline.
WebGPU support in Chrome is solid and well-documented. Multi-browser support
is architected for (see ROADMAP.md Phase 5) but not built now.

---

**Decision:** Explore free-tier options first for the server-side AI model,
no paid API committed to yet
**Why:** Keeps project cost near zero during development.
**Status:** Open — revisit in 1-2 weeks once real usage patterns are clear.

---

**Decision:** Primary demo task is login/form autofill
**Why:** Simplest, most relatable task to show live; naturally showcases
every mandatory requirement in one clear flow.

---

**Decision:** Secondary demo tasks (if time allows): multi-field signup form,
then video call/profile photo face detection, in that order
**Why:** Proves generalization beyond one hardcoded page. Signup form first
(lower risk, reuses DOM logic); face detection second (higher risk, different
code path).

---

**Decision:** DOM-based detection is the primary signal for form-based PII;
the visual model is a secondary/supplementary signal
**Why:** DOM attributes are cheap and highly reliable. The visual model's
real value is catching what DOM signals structurally cannot (faces, on-screen text).

---

**Decision:** When uncertain whether something is sensitive, default to hiding it
**Why:** A missed PII item is a more serious failure than an over-redacted
safe item, both for real-world safety and for the evaluation rubric's PII
recall weighting.

---

**Decision:** No AI-tool traces in the codebase (comments, commit messages, file headers)
**Why:** Codebase should read as the team's own engineering work.

---

**Decision:** Expand all project documentation to full production-grade depth,
not just hackathon-MVP level
**Why:** The team wants a genuinely complete plan — covering security/threat
model, API contracts, full risk register, and a post-hackathon roadmap — not
just what's minimally needed to pass judging. This does not change what gets
BUILT for the hackathon (still Phase 1 core first, per TASKS.md) — it changes
how thoroughly the plan itself is documented, so the team always knows what
"complete" looks like and never accidentally architects itself into a corner.

---

**Decision:** Server action vocabulary is a fixed allowlist (click, type,
scroll), validated on both server and client
**Why:** Bounds the security blast radius of any reasoning-model error or
manipulation — the server can never cause arbitrary code execution or
undefined behavior on the client, only a pre-approved, safe set of actions.

---

**Decision:** Redaction uses semantic placeholder tokens (e.g. `[PASSWORD]`,
`[NAME]`) instead of blind blackout/deletion
**Why:** Preserves page structure so the cloud reasoning model can still
interpret the page correctly, directly protecting the accuracy score (25%
weight) while keeping the privacy guarantee fully intact.

---

**Decision:** Extension client is written in TypeScript, built with Vite
**Why:** TECH_STACK.md left this open ("JavaScript or TypeScript"). TypeScript
wins because the central risk in this project is a wiring mistake that hands
unredacted data to the transport layer, and a type system can make that a build
failure instead of a live incident. See the redaction seal decision below,
which is only possible with types.

---

**Decision:** The redact-before-transmit invariant is enforced by a phantom
type — `Sanitized<T>` in `extension/src/lib/types.ts`, branded with a
non-exported `unique symbol`
**Why:** Only the Redaction Engine can mint a `Sanitized<T>`, and the Transport
Layer accepts nothing else, so passing unredacted data to the network is a
compile error rather than something we hope code review catches. Turns
ARCHITECTURE.md Section 2.3's "hard invariant" from a documented rule into a
mechanically enforced one at zero runtime cost.

---

**Decision:** A second, independent runtime guard tracks which pipeline stages
actually completed, and refuses to advance past `sending` unless `redacting` ran
**Why:** The type seal catches bad wiring at build time but cannot catch a
stage that was entered and then threw, returned early, or was skipped by a
conditional. Two mechanisms guarding the same boundary is deliberate, not
redundant — this is the one boundary in the system where a single point of
failure is unacceptable.

---

**Decision:** Visual capture uses `chrome.tabs.captureVisibleTab`
**Why:** ARCHITECTURE.md Section 2.1 said "`chrome.tabCapture` or an in-page
canvas snapshot" without choosing. `captureVisibleTab` is a better fit than
either: it returns exactly one still image of the visible viewport, which is
what PRD.md Section 20 specifies we process, whereas `tabCapture` yields a
MediaStream built for continuous capture and needs an offscreen document in
MV3 just to extract one frame. An in-page canvas snapshot needs no permission
but renders the DOM lossily (iframes, cross-origin images), which would
directly cost us on the 25%-weighted visual-accuracy metric.

---

**Decision:** No static `content_scripts` in the manifest — the content script
is injected on demand via `chrome.scripting.executeScript` under `activeTab`
**Why:** A static content script matching `<all_urls>` would run on every page
the user ever visits and require broad host permissions. On-demand injection
means Shield has no presence at all on pages the user hasn't explicitly pointed
it at. That is a genuine privacy property worth stating in the demo, not just a
smaller permission warning. Works because every run starts from a click on the
extension action, which is exactly what `activeTab` grants against.

---

**Decision:** Build output is unminified
**Why:** Shield's core claim is that anyone can verify nothing unredacted is
transmitted. Shipping minified code would undercut that at the moment it
matters most — when a judge or reviewer opens the source.

---

**Decision:** Vite build runs in two passes (`vite.config.ts` plus
`vite.content.config.ts`)
**Why:** Content scripts execute in a classic, non-module script context and
cannot use runtime `import`, so they must be a single self-contained bundle.
The popup and service worker can be ES modules and benefit from shared chunks.
One pass cannot satisfy both, so the content script gets its own IIFE pass.

---

**Decision:** Vite 8, not Vite 5
**Why:** Vite 5 pulls a transitive esbuild with a published advisory. The
advisory only affects the dev server, which we never run, but the project has a
dependency-scanning commitment in TECH_STACK.md and shipping a known-vulnerable
toolchain would be a bad look in a security-focused submission. Upgrading cost
nothing since the build config is plain. `npm audit` is clean.

---

**Decision:** Extension icons are generated from source
(`extension/tools/make-icons.mjs`, Node built-ins only) rather than committed
as binaries
**Why:** Keeps the repository fully reviewable — there is no opaque image blob
anyone has to take on trust — and adds no dependency. `public/icons/` is
gitignored and regenerated by the build.

---

**Decision:** `CapturedFrame` holds an `ImageBitmap`, never the `data:` URL that
`captureVisibleTab` returns
**Why:** A base64 string of an unredacted screenshot is the most dangerous
value in the extension — it can be console-logged, passed to `sendMessage`, or
JSON-stringified by accident, and each of those is a leak. An `ImageBitmap` is
not serialisable, so it physically cannot cross a message boundary. The data
URL is decoded inside `capture.ts` and dropped immediately. This makes a whole
class of accidental leak structurally impossible rather than merely discouraged.

---

**Decision:** Frames are released explicitly via `disposeFrame()` in a `finally`,
on every exit path from a run
**Why:** `ImageBitmap` pixels live outside the JS heap and are not collected
promptly. PRD.md Section 16 promises captured frames are discarded immediately
after processing, and an aborted run must not leave a screenshot resident.
Also bounds client-side memory, which is 20% of the evaluation score.

---

**Decision:** CSS-to-frame pixel scale is derived by measurement
(`frame.width / viewport.width`), not taken from `devicePixelRatio`
**Why:** Scrollbar width, page zoom, and Chrome's own rounding all move the
real ratio away from the reported DPR. Redaction rectangles come from DOM
coordinates in CSS pixels, so a systematic scale error would offset every blur
box on the frame — a redaction that misses its target is a leak, not a cosmetic
bug. Measuring the frame we actually received is strictly safer than trusting a
number the page reported.

---

**Decision:** Capture format is PNG (lossless)
**Why:** The local vision model and any OCR pass read these pixels directly, and
JPEG ringing around text is exactly the artefact that costs detection recall —
weighted more heavily than latency in PRD.md Section 7. The frame that goes over
the wire is re-encoded by the Redaction Engine anyway, so lossless capture does
not commit us to a large payload.
**Status:** SETTLED — keep PNG. Measured on test-screens/01-login.html: a 22KB
frame captured in 59.3ms against a 100ms budget. Earlier readings of 180-206ms
and one 669ms outlier were Chrome throttling `captureVisibleTab` to roughly
2/sec on back-to-back runs, not encode cost — a fixed-size page cannot encode in
46ms five times and 669ms once, and 22KB is nowhere near large enough to explain
it. No fidelity needs trading away. Revisit only if a visually heavy page (photos,
video) pushes a single cold capture over budget.
**SUPERSEDED** — that revisit condition fired. See the JPEG entry below.

---

**Decision:** The screenshot data URL is decoded by hand rather than with
`fetch(dataUrl)`
**Why:** `fetch` on a data URL is harmless in itself, but it means an unredacted
screenshot briefly exists as a request. "No code path sends a frame anywhere
before redaction" is a far easier claim to audit when the frame never touches a
networking API at all. Verified byte-exact against known PNGs.

---

**Decision:** One automatic retry when `captureVisibleTab` hits Chrome's
~2-calls-per-second quota
**Why:** The multi-step task loop can legitimately capture faster than the
quota allows. A transient throttle is not a failure the user should have to
understand, so it is absorbed rather than surfaced. Genuine capture failures
(chrome:// pages, PDFs, no activeTab grant) still surface with a specific
message per PRD.md Section 20.

---

**Decision:** Every pipeline stage is timed against the ARCHITECTURE.md
Section 6 budget from the start (`src/lib/timing.ts`), logging a warning when
over budget
**Why:** Latency is 15% of the score, and it is lost not to one catastrophic
stall but to a stage quietly drifting over budget across many commits. Timing
with the budget written next to the measurement makes that drift visible the
day it appears. Module F's latency display reads these rather than re-measuring.

---

**Decision:** The content script never reads the value of a password field —
not read-then-redacted, never read at all
**Why:** Nothing downstream wants it. The Redaction Engine would replace it
with `[PASSWORD]`, and API_SPEC.md Section 5 forbids the server from sending a
sensitive value back, so the Action Executor never needs one either. Since no
stage has a use for the real password, the safest place for it is inside the
page where it already is. A value that never enters the extension's memory
cannot leak from it, however badly a later stage is written. `[has value]` is
recorded instead so the model can still tell a filled field from an empty one.
**Scope note:** The read-time check covers only `type=password` and
`autocomplete=current-password|new-password` — signals that admit no
interpretation. It must not grow into a second PII detector; that decision
stays in Module B where it can be tested in one place.

---

**Decision:** Selectors are built from tag names plus `:nth-of-type`, preferring
a unique `id`; class names are never used
**Why:** CSS-in-JS and utility frameworks regenerate class names between builds
and sometimes between renders, so they look specific while being the least
durable thing available. The Action Executor has to re-resolve the target after
the page has had time to change (PRD.md FR-21), so durability beats brevity.

---

**Decision:** Every generated selector is verified to round-trip at capture
time, and failures are counted
**Why:** A selector that cannot find its own element while that element is
still in hand certainly will not find it later. Far better to know during the
scan than to discover it while acting — acting on the wrong element is one of
the failure modes PRD.md Section 20 explicitly calls out.

---

**Decision:** Interactive elements (inputs, buttons) are collected before text
and images, and are never dropped by the 300-element cap
**Why:** The cap exists to bound payload and latency on large pages. If
something must be dropped it should be background prose, never the field or
button the task depends on — dropping those would cost task accuracy, the
heaviest single metric at 25%.

---

**Decision:** Anchors with `href` are classified as `button`
**Why:** The API_SPEC.md Section 3 vocabulary has no "link", and from the
reasoning model's point of view what matters is that it is a click target.
Calling a "Forgot password?" link `other` would hide a legitimate next step
during the exact task we care most about.

---

**Decision:** An empty element map fails the run
**Why:** Zero elements is indistinguishable from a page with nothing sensitive
on it, and the PII Detector would find nothing to hide and pass it straight
through. Failing closed on an empty reading is required by ARCHITECTURE.md
Section 9.

---

**Decision:** The element map is logged to the service worker console without
field values — labels, types and selectors only
**Why:** A console is somewhere content travels to: it survives in the devtools
buffer and gets pasted into bug reports. Page structure is safe to show; what
the user typed is not.

---

**Decision:** `domScan` gets its own 100ms latency budget alongside `capture`
**Why:** ARCHITECTURE.md Section 6 has a single "Screen capture < 100ms" line,
but Screen Perception is two independent pieces of work with different
performance characteristics and different fixes when they get slow. Tracking
them separately is the only way to know which one to attack. Worth folding back
into the Section 6 table when someone next revises it.

---

**Decision:** The content script registers its message listener unconditionally,
with no `window.__shieldLoaded`-style double-injection guard
**Why:** Such a flag lives on the page, which outlives the extension. After an
extension reload every already-open tab still carries the flag, so the fresh
injection skips registering while the previous script sits orphaned and unable
to receive anything — leaving the tab permanently deaf until reloaded by hand.
No guard is needed, because the service worker only injects after a PING found
no live listener: if the ping failed there is either no script present or only
an orphan, and an orphan cannot receive our messages, so a fresh registration is
always correct and never a duplicate.
**Found by:** A stale console during Task 3 verification, which prompted a look
at what actually happens to open tabs across an extension reload.

---

**Decision:** Every build stamps itself, and both the service worker and the
content script log that stamp plus the manifest version on startup
**Why:** Chrome will happily keep running a previous build — a cached service
worker, a second copy loaded from another folder, a reload that silently did not
take. All of those look identical to "the code is broken" from the console, and
three sessions were lost to exactly that ambiguity, including one spent
diagnosing behaviour from a build that no longer existed on disk. The running
code now says which build it is, so the question is answered in one glance
instead of by comparing log line numbers.
**Cost:** One `define` per Vite config and one line of log output.

---

**Decision:** The popup displays the running version and build stamp in its
footer
**Why:** The service worker DevTools console silently detaches when an extension
reloads and then replays its old buffer indefinitely, which is indistinguishable
from "the new code does not work". Several sessions were lost to that ambiguity.
The popup is rebuilt from the current bundle every time it opens, so it cannot
report a build other than the one installed — it is the one verification channel
that cannot go stale, and it needs no DevTools.

---

**Decision:** A `<label>` element is not reported as a standalone text region
when its text is already carried as a control's `label`
**Why:** Without this every labelled field appears twice — once as the input
carrying "Password", again as a text region saying "Password". On the login test
screen that was 3 of 11 elements duplicated; on a signup form it is worse.
Redundant context costs payload and latency and gives the reasoning model
repeated material to misread, working against the 25%-weighted accuracy metric.
The text is compared rather than assumed, so a visible label that differs from
an `aria-label` is still reported — that difference carries information.
**Found by:** Reading the element map from the first successful Task 3 run
rather than just checking the element count.

---

**Decision:** The unresolved-selector count is logged even when it is zero
**Why:** It is a correctness check, and a check you only see when it fails is one
you stop trusting. Seeing "0 unresolved selectors" is what makes its absence
meaningful.

---

**Decision:** The local vision layer targets what DOM cannot see — faces and
text baked into pixels — rather than generic UI-element detection
**Why:** ARCHITECTURE.md Section 2.1 describes a model that "detects and
classifies visual regions", but DECISIONS.md separately locks DOM as the primary
signal, and the DOM walk now maps a login form completely in 3.9ms. A vision
model classifying "this is a button" would be slower, less accurate, and
duplicating solved work. ARCHITECTURE.md Section 5 already states the real role:
catching what DOM signals structurally cannot. This decision makes Section 2.1
match Section 5 rather than adding a model that earns nothing.
**Consequence:** ARCHITECTURE.md Section 2.1's wording should be tightened when
that doc is next revised.

---

**Decision:** Face detection uses UltraFace version-RFB-320, not BlazeFace
**Why:** Three reasons, in order of weight. (1) Fit: UltraFace is trained on
WIDERFACE and built for "medium/long-distance small faces", which is our actual
case — a profile photo or video-call thumbnail somewhere on a page. BlazeFace's
front-camera variant is tuned for a face that largely fills the frame, which is
not how faces appear in a browser. (2) Licensing: UltraFace is MIT at source.
BlazeFace's clean lineage is Apache-2.0, but the ONNX re-exports are third-party
and vary — the most prominent Hugging Face repo states no license at all, which
is not acceptable in a submission. (3) It ships as ONNX already, so Task 4's
"convert to ONNX" step disappears.
**Supersedes:** The BlazeFace references in TECH_STACK.md and TASKS.md, both
updated.

---

**Decision:** Local models are committed to the repo, pinned by sha256 in
`extension/tools/models.json`, and verified on every build
**Why:** ARCHITECTURE.md Section 8 requires pinned models shipped with the
extension. Fetching at build or run time would mean the demo can break because
someone else's host changed a file or went down. A model is also the one
artefact here that is downloaded rather than written, and a truncated or swapped
model does not announce itself — inference just produces nonsense, which reads
as a bug in the detection code and costs hours. Hashing 1MB is free next to that.

---

**Decision:** OCR runs only on crops of image elements, never the full frame
**Why:** Tesseract.js on a full 1920x945 frame would take hundreds of
milliseconds to seconds and destroy the latency budget. But the DOM element map
already tells us exactly where the `img`, `canvas` and `video` elements are — the
only places text can hide from the DOM in the first place. Using the cheap DOM
signal to aim the expensive vision work is far better than scanning blindly, and
it is only possible because Screen Perception produces both signals together.
**Known gap:** CSS background images and SVG text are not covered by this
targeting. Acceptable for the hackathon; note it rather than pretend otherwise.

---

**Decision:** Local inference runs in an offscreen document, not the service worker
**Why:** Not a preference — a hard constraint. Manifest V3 service workers
disallow dynamic `import()` per the HTML spec, and ONNX Runtime Web's WASM and
WebGPU backends are both unavailable there (microsoft/onnxruntime#20876). An
offscreen document is Chrome's supported escape hatch, requiring the `offscreen`
permission.
**Consequence, and it is a good one:** the offscreen document became the single
place in the extension that decodes a frame. The service worker — the context
that also talks to the network — never turns a capture into pixels. "Which code
can see raw pixels?" now has a one-file answer, which is far easier to audit
than a rule everyone has to remember.
**Note for ARCHITECTURE.md:** Section 2.1 describes Screen Perception as running
the vision model itself. In the built system that work is delegated to the
offscreen host; worth reflecting when the doc is next revised.

---

**Decision:** `CapturedFrame` (holding a decoded ImageBitmap) is replaced by
`RawFrame` (holding the still-encoded data URL)
**Why:** The offscreen split above made the original design wrong. The service
worker would have had to decode a frame only to re-encode it to cross the
message boundary — slower, and it would have put raw pixels in the networking
context for no benefit. The ImageBitmap rationale still holds, but it belongs in
the offscreen document, where the pixel work actually happens.
**Supersedes:** the earlier "CapturedFrame holds an ImageBitmap" decision, which
was correct for the architecture as it stood and stopped being so.

---

**Decision:** ONNX Runtime's WASM assets are copied into the extension and
loaded via `ort.env.wasm.wasmPaths`, never from a CDN
**Why:** Two reasons, the second decisive. A CDN fetch breaks offline, which
during a live demo is plausible and unacceptable. More importantly, Shield's
whole claim is that screen understanding happens on-device — pulling the
inference runtime from a third-party origin at run time puts that origin in a
privacy-critical path, where it sees the request and a substituted runtime could
do anything with the pixels it processes. "Local model" has to mean the runtime
is local too, not just the weights.

---

**Decision:** Build with ORT's `onnxruntime-web-use-extern-wasm` export condition
**Why:** Without it, importing onnxruntime-web resolves to a bundled build whose
`new URL(...)` reference makes Vite emit a second 25MB copy of the binary into
dist/assets, on top of the copy we deliberately ship — 52MB total, with ORT
loading whichever it resolved first (microsoft/onnxruntime#24009). Client-side
resource utilisation is 20% of the evaluation score. Now 27MB with one copy.

---

**Decision:** `tools/copy-ort-assets.mjs` derives which WASM files to copy by
reading ORT's own entry point, rather than hardcoding filenames
**Why:** The hardcoded version broke silently within an hour of being written:
ORT renamed its WebGPU binary from `jsep` to `asyncify`, so the script copied a
file nothing loads while the file ORT wanted was absent — and the build still
passed, because nothing checks that a 25MB asset is the right 25MB asset.
Deriving the names means a version bump either keeps working or fails loudly.

---

**Decision:** `ort.env.wasm.numThreads = 1`
**Why:** Multi-threaded WASM needs SharedArrayBuffer, which needs the document
to be cross-origin isolated, which needs COOP/COEP response headers that an
offscreen document cannot set. Requesting threads yields a confusing
initialisation failure rather than a graceful fallback, so single-threaded is
the honest configuration rather than a compromise.

---

**Decision:** The offscreen document is torn down when a run ends
**Why:** It holds a compiled 25MB WASM module and, on the WebGPU path, GPU
buffers. An idle extension pinning that is exactly what the 20%-weighted
resource-utilisation metric penalises. The cost is paying session startup again
next run, which is why `modelInit` is budgeted separately from `inference` —
conflating a once-per-run cost with a per-frame one would make every first run
look like a regression.

---

**Decision:** The model is warmed up with one throwaway inference at load time
**Why:** WebGPU compiles its shaders lazily, on first inference rather than at
session creation. Measured on the login screen: the first real inference took
2122ms and every subsequent one took 84ms — a 25x penalty paid by whichever
frame happened to be first, which in a demo is the frame someone is watching.
Warming up moves that cost into model initialisation, where it is expected and
already budgeted, so the first frame the user cares about is as fast as the rest.

---

**Decision:** The offscreen document outlives a single run and closes itself
after 120s idle, rather than being torn down when each run ends
**Why:** This reverses an earlier decision, on measurement. Tearing down after
every run was justified on resource grounds, but the numbers showed a run whose
actual inference took 84ms spending roughly 1000ms recreating the document and
rebuilding the session — over a second of pure overhead, every time, on a
pipeline budgeted for a few seconds end to end. Keeping one warm session across
a task also makes the multi-step loop viable. The idle timeout still prevents an
idle extension pinning a 25MB WASM module and GPU buffers.
**Note:** The document closes *itself* rather than being closed by the service
worker, because the worker is evicted when idle and cannot be relied on to run a
timer.
**Supersedes:** "The offscreen document is torn down when a run ends."

---

**Decision:** Opening the popup starts loading the model, before the user has
typed anything
**Why:** Measured first-run overhead was ~940ms — offscreen document creation,
session build and shader warm-up — all of it landing between pressing Run and
seeing a result. But opening the popup is a strong signal that a run is seconds
away, and the time spent typing a task is time the inference host could be
loading. Doing them concurrently hides essentially the whole cost behind
think-time. Costs nothing when the extension is not being used, unlike warming
at browser startup, which would pin 25MB from boot.
**Failure behaviour:** Fire-and-forget. If warming fails the model loads lazily
on the first frame exactly as before — an optimisation must never be able to
break a run.

---

**Decision:** A `forceBackend` setting in `chrome.storage.local` can pin the
inference backend, bypassing WebGPU detection
**Why:** The CPU fallback is otherwise untestable on hardware where WebGPU
works, and it worked on every run here — so the fallback path required by
PRD.md FR-27 was written but had never executed once. "It will probably work" is
not evidence, and waiting to find a machine without WebGPU is a poor way to
discover the path is broken. Set with
`chrome.storage.local.set({ forceBackend: 'wasm' })` from any extension console.
**Detail:** A forced fallback sets `fellBack: false`, so a deliberate test does
not tell the user their machine lacks WebGPU.

---

**Decision:** A CPU fallback is shown to the user in the popup, not just logged
**Why:** PRD.md Section 20 requires the fallback to be automatic AND the user
informed that things may be slower. A silent order-of-magnitude slowdown reads
as a bug, and Shield's whole pitch rests on never being quietly worse than it
claims. The wording is informative rather than alarming — the task still
completes, it is simply slower.

---

**Decision:** The backend override is toggled by clicking the build line in the
popup, not by typing into a console
**Why:** Two reasons. Practically, Chrome's self-XSS guard blocks pasting into
DevTools until the user types "allow pasting", which turned a one-line test into
a support conversation — a test nobody can run easily is a test that does not get
run. Substantively, being able to force the CPU path in two clicks means the
fallback can be demonstrated live, which is a direct answer to the obvious judge
question about machines without a GPU.
**Why unlabelled:** It is a developer and demo affordance, not a user setting.
PRD.md Section 14 does not put backend selection in the popup, and adding a
visible control would imply a choice users are expected to make.
**Detail:** Toggling restarts the offscreen document, because the loaded session
is cached there and the override would otherwise appear to do nothing until the
host idled out.

---

**Decision:** Changing the backend override rebuilds the inference session in
place, rather than closing and recreating the offscreen document
**Why:** The first implementation did the latter and silently did not work.
`closeDocument()` and `createDocument()` race: `getContexts()` can still report
the closing document as alive, so the recreate is skipped and the old session —
holding the old backend — survives. The toggle appeared to do nothing, which is
the worst kind of bug in a diagnostic tool, since it discredits the tool rather
than itself. Rebuilding the session inside the living document has no such race.
**Detail:** `session.release()` is awaited before the replacement is built.
Overlapping two sessions is how a modest GPU runs out of memory.
**Found by:** Two consecutive test runs reporting `webgpu` after the override was
set to `wasm`.

---

**Decision:** Shield proves its own CPU fallback once per installation, rather
than relying on someone testing it by hand
**Why:** PRD.md FR-27 requires the fallback to work where WebGPU is unavailable,
and TESTING.md Section 5 requires testing across several laptops. Both are easy
to assert and hard to verify: on a machine where WebGPU works, the fallback path
never executes, so it can rot indefinitely while every run looks perfectly
healthy. Three separate attempts to test it manually here all silently ran on
WebGPU anyway — twice through a bug in the override, once because the test asked
someone to paste into a console Chrome blocks by default. A check that is easy to
skip is a check that does not happen.
**How:** After a successful analysis — never before, so it costs the user
nothing — an independent CPU session is built from scratch, one inference is run,
and the result is stored and reported. Independent on purpose: it must prove the
fallback can be built cold, which is what a machine without WebGPU would do.
**Result:** "The fallback should work" becomes "the fallback ran on this machine
in N milliseconds", which is the evidence the multi-laptop requirement is
actually asking for.

---

**Decision:** The self-test verdict is pulled from storage on every run, and only
a passing result is cached
**Why:** The first version reported its verdict solely by pushing a message at
the single moment the test finished, and cached whatever it got. That produced
the one outcome a self-test must never produce: silence. Anything that dropped
that message, or a verdict recorded before anyone had the console open, left the
fallback looking untested forever while printing nothing either way — and a
cached failure would have permanently suppressed the retry that could have shown
the problem. A releasing session was also allowed to throw away an already
established result, so a passing test could report nothing at all.
**How:** The verdict lives in `chrome.storage.local` and the service worker
reads it on every run, printing either the measured result or "not verified yet".
Failures are never cached, so a broken fallback is re-tested and re-reported
until it passes. Session cleanup can no longer discard a verdict.
**Result:** Every run states where the CPU fallback stands. There is no longer a
path where the answer is nothing.

---

**Decision:** The service worker owns all storage and all policy; the offscreen
document is a pure executor
**Why:** The self-test passed and its result was never persisted, so it re-ran on
every capture — and the same storage the offscreen document was failing to write
is where `forceBackend` is read from, which is very likely why forcing the CPU
backend appeared to do nothing across three attempts that were blamed on a
session race instead. Whichever side of that read/write actually failed, an
inference host that depends on storage it may not have is a bad design: the
worker has unambiguous access, and the document needs no state of its own.
**How:** `forceBackend` is resolved by the worker and passed down inside the
warm-up, reload and analyse messages. The worker decides whether the self-test
should run, sends `RUN_SELF_TEST`, and stores the verdict. The offscreen document
makes no `chrome.storage` calls at all.
**Result:** One context owns persistence. The backend override now takes effect
through a path that is known to work, and a proved fallback is proved once.

---

**Decision:** Storage failures are logged, never swallowed
**Why:** `readSelfTestRecord` returning null meant both "no record" and "storage
threw", and `readSettings` returning defaults meant both "no override" and
"storage threw". Both collapses hid real failures behind normal-looking output —
the second time in this module that an error-swallowing catch turned a bug into
silence.
**How:** Every catch around a storage call warns with the error. The fallback
behaviour is unchanged, so nothing can break; only the silence is gone.

---

**Decision:** "Re-capture on multi-step task continuation" moves from Module A to
Module E
**Why:** It is a property of the task loop, not of perception. The capture code
it depends on is finished and verified, but nothing can trigger a second capture
until the executor's loop exists, so the item could never be satisfied where it
sat — leaving Module A permanently open on work belonging to another module and
making the phase gate report something untrue.
**How:** Moved under Module E with a note recording where it came from. Module A
is now complete.
**Result:** The phase gate reflects reality: perception is done, and the
re-capture test will be verified alongside the behaviour it describes.

---

**Decision:** Confidence scores are recorded but never gate redaction
**Why:** SECURITY_PRIVACY.md Section 4 states that a missed detection is a more
severe failure than an unnecessary one, so there is no confidence below which
Shield decides to let something through. Storing a number invites a future
`if (confidence > threshold)` around a redaction, which would quietly convert the
policy into its opposite.
**How:** Rule confidences (1.0 for `type=password` down to 0.6 for text patterns)
are attached to every region for the audit trail and the trust overlay, and the
constant carries a comment stating that thresholding them is a policy violation,
not an optimisation.
**Result:** Everything flagged is redacted. The numbers explain how sure we were,
never whether to act.

---

**Decision:** Field rules apply only to value-holding controls; visible text is
matched by content instead
**Why:** Field-name patterns describe what a control *holds*. Run over links and
buttons they misread UI chrome as data — "Forgot password?" on the login test
screen matches the password pattern perfectly and is not a password. The reverse
gap is worse: text elements carry their content in `value` and that content goes
into `redacted_dom_summary`, so a page rendering an email address as ordinary
text was caught by no rule at all and would have been transmitted intact.
**How:** `classifyElement` returns null for anything that is not an input.
Text elements go through `classifyTextContent`, matching high-precision formats
(email, PAN/long digit runs, grouped phone numbers) against the text itself.
**Result:** Both a false-positive class and a real leak path closed. Content
patterns are deliberately strict where field patterns are permissive: a wrong
field guess costs one redacted box, a wrong content guess blacks out prose.

---

**Decision:** Phone detection in visible text requires ten digits, or eight with
an international prefix
**Why:** A flat eight-digit threshold cannot tell a phone number from a date
range — "Copyright 2024-2025" is eight digits in two groups and matches the
shape exactly. Checked against ordinary prose (date ranges, order numbers,
section ranges, prices) before adopting, which is how the flat threshold was
caught.
**How:** Two tiers. A leading `+` is strong evidence on its own and is trusted at
eight digits; without one, a full national number of ten is required.
**Result:** Real numbers in four common formats match; the prose cases do not.

---

**Decision:** Fields are flagged whether or not they currently hold a value
**Why:** An empty password box is still a password box. The page can fill it
between capture and transmission, which is the time-of-check-to-time-of-use gap
the threat model's tampering row warns about.
**How:** The detector reports the region regardless of value; deciding that an
empty field needs no placeholder is the Redaction Engine's job.
**Result:** Detection describes what a region *is*, not what it happened to
contain at one instant.

---

**Decision:** Face detection runs at a 0.5 score threshold, below UltraFace's
usual 0.7, and every kept box is padded by 15%
**Why:** SECURITY_PRIVACY.md Section 4 asks for a bias toward over-redaction on
faces specifically, and the asymmetry is stark: a false positive blurs a
rectangle of background, a false negative puts someone's face on a server. The
threshold is therefore not set where an accuracy benchmark would put it. Padding
exists because a detector's box is the facial region — it clips hair, chin, ears
and neck, all of which identify a person.
**How:** Candidates below 0.5 are dropped, survivors go through non-maximum
suppression at 0.3 IoU, and the kept boxes are then grown 15% on each side and
clamped to the frame. Suppression runs before padding on purpose: padding first
would inflate every box before comparison and merge two people standing close
together into one region.
**Result:** One region per face, covering more than the face, biased the way the
policy asks.

---

**Decision:** Face boxes are carried as fractions of the frame, converted to CSS
pixels in exactly one place
**Why:** Coordinate errors are the failure mode that matters for visual
redaction, because a box offset by a systematic scale factor still looks like a
plausible redaction while leaving the actual face visible. The frame is resized
into the model and may be resized again onto a canvas; a ratio survives both,
a pixel count silently means the wrong thing after either.
**How:** The detector emits normalised boxes. `faceRegions()` performs the single
conversion into CSS pixels of the viewport — the same space `DomElement.position`
uses — and refuses to convert against an unmeasured frame rather than producing
Infinity-sized regions. Verified numerically at scale 1.0 and at 2x HiDPI, the
latter being a case this development machine never exercises.
**Result:** One conversion in the codebase instead of one per consumer, checked
against the scale factor most likely to be wrong in the field.

---

**Decision:** Capture format changed from PNG to JPEG at quality 90
**Why:** The PNG decision above set its own revisit condition — a visually heavy
page pushing a single cold capture over budget — and it fired exactly as
written. A photo-heavy real page produced a 1511KB PNG in 349.7ms against a
100ms budget, 26 seconds after the previous capture, so Chrome's ~2/sec
throttling cannot account for it. The login test screen never exposed this: at
22KB it captures in ~45ms, and a fixture that only ever shows the cheap case is
a fixture that hides the expensive one.
**How:** `captureVisibleTab` now requests `jpeg` at quality 90. Quality is set
high on purpose: the original concern — JPEG ringing around text costing
detection recall, which is weighted above latency — was a real one, so this
trades the least fidelity that recovers the latency rather than defaulting to
something small and fast.
**Status:** PENDING VERIFICATION — to be confirmed by re-running the same
photo-heavy page and checking that the same 5 faces are still detected at
comparable confidence. If recall drops materially, this reverts to PNG.

---

**Decision:** Full element-map detail is logged only for local test fixtures
**Why:** The element map was printed in full on every run, on the reasoning that
labels are page structure rather than user input and are therefore safe to show.
That reasoning was wrong. A run against a real social feed printed dozens of
other people's names and handles into the console — a buffer that survives, gets
pasted into bug reports, and in that instance was pasted into a chat. Values were
never printed and still are not, but labels turned out to carry more identifying
information than values on exactly the kind of page Shield is meant to protect.
**How:** Local fixtures (`file://`, `http://localhost`) print the full table,
since they contain synthetic data we wrote. Every other page prints a summary
with counts by element type and no label text at all. `pageUrl` is client-side
only and never transmitted, so consulting it costs nothing.
**Result:** A tool whose central claim is that private data does not escape no
longer leaks it while explaining itself.

---

**Decision:** Face box coordinates are clamped on both edges and re-ordered
after padding
**Why:** Padding clamped the far edge down to 1 while leaving a near edge above
1 untouched, which turned an out-of-range box inside out rather than rejecting
it. The result was regions with negative width reaching the redaction stage —
`-1814x401` among them. Every number involved still looked like a plausible
number, which is why nothing upstream caught it.
**How:** Both edges are clamped into the frame, then the pair is re-ordered so
the box cannot be inverted. The observed coordinate range is also reported once
per session, so the space the model actually emits is a measured fact rather
than an assumption carried from documentation.
**Result:** A box can no longer be inverted by clamping, and the range that
caused it will be visible rather than inferred.

---

**Decision:** Added an `other` category, and unmatched fields holding content are
redacted by default
**Why:** CLAUDE.md and SECURITY_PRIVACY.md Section 4 both require ambiguity to
resolve toward hiding, and the code did the opposite: a field whose markup
matched no rule was passed through untouched. Flagging it needs a category, and
none of the existing seven honestly describes "we could not tell". Reusing a
named one would have put a false claim in the manifest.
**How:** `other` added to `SensitiveCategory` and to the enum in API_SPEC.md
Section 3, with a note telling the server to treat it like any other category.
It ranks lowest in severity, so any identified category wins a disagreement,
and it carries the file's lowest confidence — which reflects uncertainty about
what the field is, never about whether to hide it.
**Result:** The default-to-hide rule is now in the code, not only in the
documents. Side effect, accepted knowingly: search boxes and dropdowns have
their values replaced with placeholders. A search query is often personal, so
this is defensible on its own terms.

---

**Decision:** Arbitrary personal names in page text are out of scope, and the
limit is documented rather than half-solved
**Why:** A real social feed produced zero DOM detections while displaying many
people's names, because they sat in link and button labels. Names cannot be
recognised by pattern the way an email or a phone number can — telling a name
from any other capitalised words needs a named-entity model. A heuristic that
catches one site's conventions would look like coverage without being coverage,
which is worse than a declared boundary.
**How:** Recorded in SECURITY_PRIVACY.md Section 4.1 alongside the other two
known limits (small faces lost to the 320x240 downscale, and text inside images
pending the deferred OCR pass).
**Result:** A boundary the documents declare rather than one a reviewer
discovers.

---

**Decision:** The OCR pass is deferred, explicitly
**Why:** It is the only Module B task the locked login demo never touches, and
it adds a model download and an inference stage to a pipeline that Modules C, D
and E have not yet been built against. Marked deferred rather than left
unchecked so the distinction between "not done" and "decided against for now"
stays visible.
**Result:** Module B is otherwise complete; the gap is recorded in
SECURITY_PRIVACY.md Section 4.1.

---

**Decision:** Sensitive regions are painted out with an opaque fill, not blurred
**Why:** Blur looks better in a demo and is the more common choice, which is
exactly why it deserved scrutiny: it reduces information rather than removing
it, and both blurred text and blurred faces have been recovered by published
attacks. A redaction that can be undone is not a redaction. SECURITY_PRIVACY.md
treats a leak as the severe failure and over-redaction as the tolerable one, so
the pixels are replaced before the frame is ever encoded.
**Result:** Nothing recoverable remains under a redacted region.

---

**Decision:** DOM detections are painted onto the frame too, not only faces
**Why:** A DOM detection means the value is also visible on screen. An email
address in a text field is in the screenshot as surely as it is in the DOM, so
replacing the DOM value with a token while shipping a picture of the same
characters would defeat the whole exercise. The two are views of one thing and
have to be sanitised together.
**Result:** Every flagged region is hidden in both representations.

---

**Decision:** The redacted frame is encoded as JPEG at quality 80
**Why:** A separate decision from the capture format, and a simpler one: this
image is already redacted, so nothing sensitive can be recovered from it however
it is compressed. Only payload size and the server model's ability to read the
page remain, and quality 80 keeps text legible at a fraction of lossless size.

---

**Decision:** `sealAsRedacted` is the single mint point for `Sanitized<T>`, and
sealing verifies rather than assumes
**Why:** The seal symbol is declared but never exported, so only one function can
construct the type — which makes the invariant greppable: searching the codebase
for `sealAsRedacted` finds every point where something was declared safe to
send, and there is exactly one, inside the Redaction Engine. But a type seal
only proves redaction was *called*. It cannot prove it *worked*, and those are
different claims — only the second is what the project promises.
**How:** Before sealing, every element the detector flagged is checked to carry
a placeholder token from the known list rather than content. A failure throws
and stops the run; there is no way to continue past it, and the error message
deliberately omits the offending value so the safety check cannot itself become
the leak.
**Result:** Three independent mechanisms on one boundary — the compile-time
seal, the runtime stage-order guard, and this content check. The first two catch
wiring mistakes; the third is the one that would actually catch a leak.

---

**Decision:** Face boxes are decoded against a reconstructed prior grid
**Why:** The model does not emit rectangles. Its `boxes` output is SSD-style
regression offsets relative to a fixed grid of prior boxes, and reading them as
coordinates is meaningless — measured raw range on a real page was
-4.268..3.368. This was taken on faith from the reference implementation's
documentation, which describes normalised 0..1 corners; that is true of some
exports of this model and false of the file we ship. The cost was face regions
with negative width reaching the redaction stage, and a `models.json` note
asserting the wrong thing on every build.
**How:** `src/offscreen/priors.ts` rebuilds the grid from the architecture —
strides [8,16,32,64], min box sizes [[10,16,24],[32,48],[64,96],[128,192,256]] —
and decodes each offset against its anchor. The 4420 count is asserted both at
grid construction and per inference against the model's own output shape.
**Result:** Decoded range measured at 0.049..0.549 on the same page that
previously produced ±4. Three faces detected, three painted, no unusable
geometry.

---

**Decision:** The prior count is asserted rather than assumed
**Why:** The first prior grid produced 4400 instead of 4420, because the last
detection head has three box sizes and I gave it two. Without the assertion
every box would have decoded against the wrong anchor — producing confident
detections in the wrong places, which is far harder to notice than a negative
width, because nothing about the output looks malformed.
**How:** The grid throws if it does not build exactly 4420 priors, and
`detectFaces` throws if the model returns a different number of predictions than
the grid holds.
**Result:** A silent, plausible-looking failure became a loud one. This is the
second time in this module that an assumption about the model was wrong; both
were caught by checking a number against the model itself rather than against
documentation.

---

**Decision:** The backend ships a rule-based reasoner that needs no model
**Why:** The free-tier model choice has been the oldest open blocker, and it was
blocking work that did not actually depend on it. A rule-based path reads the
redacted DOM summary, recognises a login form by its placeholder tokens, and
returns the corresponding action — with no key, no network and no account. That
unblocked the whole pipeline immediately. It is also the demo's contingency:
DEMO_SCRIPT.md requires the primary task to be reliable, and a live demo that
depends on somebody's free tier being up at 10am on judging day has a single
point of failure outside our control.
**How:** `server/reasoner.py`, behind an interface a model-backed reasoner can
implement later. Deliberately narrow — it recognises login and sign-up shapes
and declines everything else rather than guessing, because a wrong action on a
real page is worse than an honest refusal.
**Result:** Not a stub awaiting deletion. The model becomes an upgrade rather
than a prerequisite.

---

**Decision:** The action carries a credential *reference*, never a credential
**Why:** The server has no access to the user's password and must never be sent
one — that is the whole premise. But the action it returns has to be able to say
"fill the password here".
**How:** The action value is the fixed token `[USE_SAVED_CREDENTIAL]`, which the
client resolves against its own local data. The credential exists only on the
device, and the server's response is an instruction rather than a payload.
**Result:** The round trip completes without a secret ever existing server-side,
which is checked by a test asserting the reasoner never emits anything else.

---

**Decision:** Backend dependencies pinned to releases with prebuilt wheels for
the Python in use
**Why:** The first pins were current-looking versions whose pydantic-core had no
Python 3.14 wheel, so pip fell back to building from source and needed a Rust
toolchain. A backend that only installs on machines with Rust is a backend that
fails on somebody else's laptop on demo morning.
**How:** fastapi 0.141.1, uvicorn 0.52.4, pydantic 2.13.5, verified by actually
creating the venv, installing, running the server and calling both endpoints —
rather than by the file parsing.

---

**Decision:** Selectors are absolute paths to the root, not truncated at eight
levels
**Why:** The walk stopped after eight ancestors to keep selectors short. On a
shallow page that is harmless; on a deeply nested application it produced not a
shorter selector but a *different* one — a relative chain like
`div > div > span > a` that `querySelector` resolves against the first such
element anywhere in the document. Measured at 38 of 158 elements failing to
resolve back to themselves on a real page, against 0 of 8 on the login fixture,
which is exactly why the fixture never revealed it.
**How:** The walk continues to the root unless an id anchors it sooner, and the
path is prefixed with `html`, making it unique by construction rather than by
luck.
**Result:** Module E acts on these selectors, so this was a correctness
prerequisite rather than a tidy-up.

---

**Decision:** Shield stores no credentials, and refuses credential-fill requests
**Why:** The reasoner can ask for a saved credential by reference. Honouring it
would mean keeping passwords in `chrome.storage.local`, in plaintext, readable
by any code in this extension — on a project whose entire claim is that secrets
stay protected. A vault worth having needs a real one, and shipping a bad one
would undercut the thing being demonstrated.
**How:** A `[USE_SAVED_CREDENTIAL]` request is refused with a clear explanation
telling the user to fill the field themselves and run Shield again. The primary
demo does not need it: the form is already filled and the action is to submit.
**Result:** A capability declined openly rather than a security compromise made
quietly.

---

**Decision:** `filled` added to the redacted DOM summary
**Why:** A redacted field reads `[PASSWORD]` whether it is full or empty,
because the token says what belongs there rather than what is there. That hid
the distinction the assistant needs most: "this field needs filling" and "this
form is ready to submit" are different situations requiring different actions,
and the primary demo turns on exactly that choice. The redaction design created
the gap and the redaction design has to close it.
**How:** A boolean on each entry, added to API_SPEC.md Section 3 with a note.
Emptiness discloses nothing about content — only that there is none.

---

**Decision:** Host permissions are limited to the local backend
**Why:** MV3 blocks cross-origin fetch from a service worker without an explicit
host permission, so the transport needed one. Granting broad host access would
have been easier and would have meant Shield could reach any origin — a poor
trade for a project whose claim is that you know where your data goes.
**How:** `http://127.0.0.1:8787/*` and `http://localhost:8787/*` only. A hosted
backend would require adding its origin deliberately, which is the point.

---

**Decision:** An action is refused if it repeats the previous one, before it is
performed
**Why:** Found by running the full loop for the first time: the assistant
proposed "click submit", the fixture's submit handler intercepts the event so
nothing visibly changed, and the next step saw the same filled form and proposed
the same action — five times, until MAX_STEPS stopped it with an error.
The step cap is not sufficient protection. These are real actions on a real
page, and five identical clicks on a submit button can mean five orders or five
payments. The cap bounds the damage; it does not prevent it.
**How:** Each action is reduced to a signature of type and target. If the
assistant proposes the same signature twice in a row, the run stops before the
duplicate is executed.
**Result:** The first duplicate is where it stops, which is the only point where
stopping prevents anything. If the previous action changed nothing the assistant
can see, either the task is finished or it cannot progress — indistinguishable
from here, and stopping is correct under both readings while repeating is wrong
under both.

---

**Decision:** The redaction overlay is inert, and cleared rather than left
standing
**Why:** It draws over the page at the maximum z-index, and the executor is
about to click something underneath it. An overlay that could swallow that click
would break the action it exists to explain.
**How:** `pointer-events: none` on the container and every box. It is cleared
immediately before an action and at the start of each run: it describes one
specific capture, and leaving a stale one up makes a claim about the current
screen that nothing has verified. The overlay from the final capture is left in
place, which is what a demo needs.

---

**Decision:** The transmitted payload is recorded before the request, not after
**Why:** DEMO_SCRIPT.md step 5 calls this the standout differentiator, and the
reason it matters is that every other guarantee in the project is an assurance
about code the reader has not read — this is the bytes. Recording it after a
successful response would mean the question "what did Shield send?" has no
answer precisely when the server is unreachable, which is when someone is most
likely to ask it.
**How:** Written to `chrome.storage.local` before the fetch, with the base64
frame replaced by a size note for readability. Storing it is safe by
construction: it is the payload that passed the seal's content verification, so
it holds placeholders rather than values.

---

**Decision:** The Zero-Leak Verification is automated, and stronger than the
manual procedure it replaces
**Why:** TESTING.md Section 6 describes it as opening DevTools and reading the
payload by eye before every demo rehearsal. That is exactly the kind of check
that gets skipped under time pressure, and it is also weaker than it sounds: the
existing per-element check only looks where it expects a value to be, so a
password echoed into a label, an email repeated in a neighbouring element's
text, or a value copied into the manifest would pass both the automated check
and a tired human scan.
**How:** Every flagged element's raw value is searched for across the whole
serialised payload before the seal is minted. A hit refuses transmission. The
raw values are passed in for this purpose only — never written, stored or
logged — and the refusal message never names the value it found, since that
message reaches a console and naming the leak would complete it. The frame is
excluded: a plaintext value cannot appear in base64-encoded image data.
**Result:** A procedure that depended on someone's diligence before a demo now
runs on every single request, and covers a class of leak the manual version
would rarely catch.

---

**Decision:** Unit tests run on Node's built-in runner with no new dependencies
**Why:** Node 24 executes TypeScript directly and ships `node:test`, so vitest
or jest would have added a large dependency tree to a project whose supply chain
is part of its security story.
**How:** `npm test`. Extensionless bundler-style imports are resolved by a small
loader hook in tools/, so the adaptation lives in test infrastructure rather
than in the 50 import statements of the code under test — the production build
is the thing that must be right, and it already was.
**Result:** 35 tests, weighted toward defects that actually occurred rather than
toward coverage.

---

**Decision:** The choice of reasoning model is configuration, not code
**Why:** The free-tier model choice has been open since Session 0, and it was
never really a code question — every candidate (Groq, OpenRouter, Together,
Google's OpenAI-compatible endpoint) speaks the same chat-completions shape. So
`server/model_reasoner.py` targets that shape and reads the endpoint, model name
and key from the environment. Switching provider needs no Python edit, and no
account decision is baked into the repository.
**How:** `SHIELD_MODEL_ENDPOINT`, `SHIELD_MODEL_NAME`, `SHIELD_MODEL_KEY`, and
`SHIELD_MODEL_VISION` when the configured model can see images. Unset, the
server runs the rule-based path exactly as before.
**Result:** The blocker is now a five-minute account signup rather than a build
task, and it can be done on any machine without touching the code.

---

**Decision:** The model's reply is parsed as untrusted input
**Why:** Not because a provider is assumed hostile, but because the reply is
influenced by page content nobody controls, and because a model that has simply
misunderstood produces the same malformed output as one that has been
manipulated. Trusting it would put the least predictable component in the
project directly in charge of what happens to somebody's screen.
**How:** Four checks before a reply becomes an action: the verb must be on the
allowlist, the selector must be an element we actually described (otherwise the
model could name one deliberately left out of the summary), a `type` action must
not carry a literal value aimed at a field Shield redacted, and the summary is
capped. Any failure discards the reply and falls back to the rules.
**Result:** Verified against a deliberately unreachable provider: the request
fell back, logged its reason, and returned the correct action in 2.2s.

---

**Decision:** The redaction-aware prompt treats page content as data, never as
instructions
**Why:** Labels and text come from whatever site the user is on, and a page can
contain a sentence addressed to the model. That is a prompt-injection path into
the component that decides what to do to the user's screen, and it was not in
SECURITY_PRIVACY.md's threat model — the elevation-of-privilege row anticipated
a *server* returning a bad action, not the page talking the model into one.
**How:** Page content is JSON-encoded inside a labelled boundary and never
interpolated into instruction text, so no page string can introduce a newline or
close a section; the template says this before the data appears; values are
truncated at 200 characters, since volume is the cheapest injection of all.
**Limits:** This does not prevent injection, it bounds it. What actually bounds
the damage is the allowlist and the client's re-verification. Added as a threat
row rather than claimed as solved.

---

**Decision:** A `<select>` value is exempt from default-to-hide, but not from
detection
**Why:** Its content is one of the page author's own options, so nothing a user
entered can be in it. Hiding "How did you hear about us? → A friend" protects
nobody and costs the reasoning model a piece of the page it may need. The
content patterns still run, so a dropdown holding an email address is caught by
what the value looks like rather than excused by the control holding it.
**Found by:** Screen 2, on its first run. Predicted `other`, and that was
correct behaviour under the old rule — the rule was the thing worth changing.
**Also required:** `dom-map.ts` now reads `type` from every control rather than
from `<input>` alone. A `<select>` and a `<textarea>` were previously
indistinguishable downstream — both arrived as an `input` with no type — so
exempting one would have exempted the other, and a textarea holds exactly what
the user typed. The DOM already names them ("select-one", "textarea"), so no
vocabulary had to be invented.

---

**Decision:** The client refuses to type a literal value into a field it
redacted, independently of the server
**Why:** The server applies the same rule when it reads the model's reply, but
SECURITY_PRIVACY.md's elevation-of-privilege row treats the server as a
component that can be compromised or simply wrong. This is the case where being
wrong is worst: the only way the assistant could know what belongs in a redacted
field is if it was never redacted in the first place.
**How:** `resolveTypeValue()` in the service worker checks the action's target
against the snapshot's own sensitive regions before anything reaches the page.

---

**Decision:** The client pipeline is tested against every screen on every
`npm test`, from checked-in element maps
**Why:** The integration run was a manual procedure — load the extension, open
each screen, read the console — which runs when somebody remembers, and under
deadline pressure that means less often exactly as the code changes fastest.
**How:** `extension/tests/fixtures/screens.ts` holds the `DomElement[]` for each
test screen, hand-derived from its markup; `integration.test.ts` runs detection,
redaction, the manifest and the seal over all four.
**Limits, stated rather than glossed:** this does not test `dom-map.ts`.
Extraction needs a real browser, and a Node fixture that re-implemented it would
be testing the re-implementation. Capture, the canvas and the executor stay
manual and are marked as such in TASKS.md.
**Drift guard:** the suite reads the HTML and compares the set of named form
controls against the fixture, so a field added to a screen fails the test rather
than silently passing against a page that no longer exists.

---

**Decision:** The latency breakdown reads the pipeline's existing measurements
rather than taking its own
**Why:** Every stage was already timed against the ARCHITECTURE.md Section 6
budget and the numbers were going to a console. One measurement with two readers
cannot disagree with itself; a second measurement would eventually drift from
the first and nobody would know which to believe.
**How:** `timed()` results are collected into run state and pushed to the popup
as each stage completes. Budgets are shown next to each number — "49ms of 500ms"
says both how fast it was and that somebody decided in advance how fast it
needed to be — and over-budget stages are marked rather than hidden.
**Detail:** the total is labelled "measured across N stages", not "total time".
The gaps between stages — spinning up the offscreen document, waiting for the
page to settle — are real time the sum excludes, and calling it a total would
overstate how fast Shield is.

---

**Decision:** The second demo task is "finish the sign-up", not "fill the
sign-up"
**Why:** Shield stores no credentials, so it cannot fill a password on an empty
form. That ruled out the obvious reading of the task, and the two remaining
readings were not equally good. Submitting an already-filled sign-up is the same
single click as the login demo and shows nothing new but a larger redaction
count. Filling the non-secret fields would need a local profile store — name,
email, phone, address at rest in `chrome.storage.local` — which is new PII on a
project whose claim is that PII stays put, and it needs its own threat-model row
and a settings UI before it is honest.
**What it is instead:** Shield reads the form, hides the eleven sensitive
fields, and does the parts of "create this account" that need no invented data:
it ticks the unticked required-consent checkbox, re-captures, then clicks
"Create account". It refuses the parts it cannot do and says why.
**Why this is the stronger demo:** it is the first genuinely multi-step run.
Phase 1's login was one action followed by a clean stop, so the step loop, the
re-capture and the 600ms settle have never actually been exercised against a
page that changed. Detection also scales from 2 fields to 11 in the same run.
**Cost, stated:** Shield never fills a sign-up field, so a completely empty
sign-up form is a decline, not a demo.

---

**Decision:** On a sign-up form an empty password is a decline, not a
`[USE_SAVED_CREDENTIAL]` request
**Why:** Not merely because Shield has no vault. A sign-up password is a *new*
password for an account that does not exist yet, so no credential store could
hold it — asking for a saved one is wrong in principle and not just
unfulfillable. Emitting the reference anyway would produce a client-side error
on a path that was never going to succeed, and an error reads as a bug.
**How:** `decide_by_rules` returns no action with a summary naming what is
missing and what to do about it. The login path is unchanged: there a saved
credential is exactly the right thing to ask for, and that path is verified.
**Relationship to the existing rule:** this narrows "Shield stores no
credentials, and refuses credential-fill requests" rather than reversing it.

---

**Decision:** Shield ticks a required-consent checkbox, and never an optional
one
**Why:** Ticking "I accept the terms of service" on somebody's behalf is a
deliberate act, and it is what "create this account" means — the form cannot be
submitted without it. Ticking "Send me occasional product updates" is not part
of any task the user asked for; it signs them up for mail they did not request,
and it is outward-facing and awkward to undo. The two are the same control type
and are distinguishable only by their wording, so the wording is what decides.
**How:** a checkbox qualifies only if it is unticked, its label matches a
consent phrase (`terms`, `privacy policy`, `conditions`, `i agree`, `i accept`,
`agree to`, `accept the`), and it matches no opt-in phrase (`newsletter`,
`marketing`, `promotion`, `offers`, `updates`, `announcements`, `send me`,
`email me`, `subscribe`, `keep me`). Anything else is left exactly as the user
left it. The default is to do nothing, which is the action-side reading of
"when uncertain, hide".
**Detail:** the server has no `inputType` — `RedactedDomEntry` does not carry
one — so a checkbox is recognised by the `checked`/`unchecked` value the client
already emits (`dom-map.ts`). No schema change was needed, and inventing one to
carry a control type would have widened the payload for a single rule.
**Named in the summary:** the reasoning summary says a consent box was ticked,
because a user watching should be able to see that Shield agreed to something.

---

**Decision:** Shield does not treat an empty non-secret field as a reason to
refuse to submit, but it does say the field is empty
**Why:** Shield will not invent a value — it has no idea what display name
somebody wants — so the only two options are "submit what the user has already
typed" and "refuse". The page gives the server no way to know a field is
required: `required` is not in `RedactedDomEntry`, and inferring it from a
label is guesswork. Refusing on every empty optional field would mean Shield
never finishes a real sign-up.
**How:** empty non-secret fields are counted and named in the summary; they do
not block the submit. Empty *password* fields do block it, because that one
case is unambiguous.
**Limit, stated rather than glossed:** if a field really is required and empty,
Shield submits and the page rejects it. That is visible and recoverable, unlike
a silently invented value.

---

**Decision:** A sign-up form is recognised by evidence, and its submit control
is matched against sign-up wording rather than a shared word list
**Why:** `_looks_like_submit` matched only login wording, so a page whose button
says "Create account" had no submit control at all — the measured Phase 2
blocker. Widening one shared list would have fixed that and created a worse
problem: a sign-up page usually also carries a "Sign in" link for people who
already have an account, and the first match wins.
**How:** two word lists plus a neutral one. A login form prefers a login-worded
control, a sign-up form prefers a sign-up-worded control, and both fall back to
the neutral words (`submit`, `continue`) but never to each other's. Form kind is
decided first, from three independent signals: two or more password fields (a
confirmation pair only exists when a password is being set), a sign-up-worded
submit control, or three or more distinct categories of personal field.
**Checked against the recorded screens:** Screen 1 still reads as login and is
still submitted at `e6` rather than at the "Forgot password?" button that
precedes it; Screen 5 still reads as login and still declines for want of a
submit control; Screen 4 still declines outright.

---

**Decision:** `IDENTITY_TOKENS` includes `[ADDRESS]` and `[ID_NUMBER]`, and
still excludes `[REDACTED]`
**Why:** an address field and an identity-number field are personal fields by
any reading, and the sign-up shape test counts categories. `[REDACTED]` stays
out because it means "hidden, kind unknown" — counting it would let any single
unidentified field plus a password look like a form Shield understands.
**No regression:** none of the four recorded screens has an input carrying
`[ADDRESS]` or `[ID_NUMBER]` outside Screen 2, so login behaviour on Screens 1
and 5 is unchanged.

---

**Decision:** On a sign-up form whose submit control is below the fold, Shield
scrolls rather than declining — and the login path does not
**Why:** Found the expensive way, on the first real browser run of the second
demo task. The client captures only what intersects the viewport
(`dom-map.ts`), and `02-signup.html`'s "Create account" button sits about
fifteen pixels below a 945px fold, so the payload carried no button at all: 14
inputs and 7 text elements, and nothing else. The server answered "no submit
control was found", which was *true*, and the run stopped one action short. The
in-process test had passed because its payload included a button the browser
never sent — a fixture testing the fixture, which is the failure mode this
project has already written down once.
**Why it matters beyond the fixture:** every sign-up form worth the name is
taller than the fold. Declining here would mean Shield can never finish a real
one, and shortening the fixture until it fits would hide that rather than fix
it.
**How:** `_look_further_down` returns a `scroll` aimed at the lowest element in
the payload, since scrolling to it reveals the most of what lies beneath. Text
elements count — a legend or a footnote is often the last thing above a button.
`scroll` has been in the API_SPEC.md allowlist since it was written and had
never once been used; this is what it is for, and no new verb was needed.
**Scoped to sign-up deliberately:** the login path still declines. A login form
is short enough that its button is effectively always visible, and Screen 5's
recorded outcome — "declines for want of a submit control" — is a measured
result that a wider change would have quietly invalidated.
**What bounds the scrolling, without counting anything:** element ids are
assigned per capture in document order. If the page cannot scroll further, the
next capture sees the same elements in the same order, produces the same id for
the same target, and the client's existing repeat detection refuses the
duplicate before performing it. If the page can scroll, the visible set changes
and real progress is made. `MAX_STEPS` is the backstop behind both. Nothing new
had to be built to bound this.
**Ordering:** consent is still handled before the scroll, and an empty password
still stops the run before either. Scrolling toward a button Shield is not going
to press would be motion for its own sake.
**Known fragility, stated rather than discovered later:** after scrolling, the
top of the form leaves the viewport, so the payload the server sees next is a
different slice of the same page. On this fixture the two password fields and
three personal fields survive the scroll, so the form is still recognisable as a
sign-up. On a much longer form they might not, and Shield would then decline
having already ticked consent — safe, since it never submits the wrong thing,
but incomplete. The general fix is for the client to carry the whole form rather
than the visible slice, which is a Module A change and out of Phase 2's scope.

---

**Decision:** The explainable redaction overlay clears itself on any real scroll
**Why:** The boxes are `position: fixed` at viewport coordinates, which is right
at the instant they are drawn and wrong from the next scroll onward — a fixed
box stays welded to the viewport while the content slides out from under it, so
after N pixels of scrolling every label sits N pixels from the field it names.
Invisible for the whole of Phase 1, because nothing ever scrolled: the login
screen fits on one screen and Shield had no scroll action. It appeared the first
time the sign-up run scrolled a long form — "Email" drawn over the first-name
field, "ID number" over the street address, and the real email address visible
with no box on it at all. Measured offset 164px, exactly the scroll delta.
**Why it is not a privacy failure, stated so nobody has to wonder:** the frame
redaction paints viewport-space rectangles onto a viewport-sized screenshot
captured at the same instant, so those align by construction, and the seal
independently verifies every flagged element carries its placeholder. What broke
is Module F's trust display — which is the one feature whose entire job is to be
believable, so it is not a small thing either.
**How:** a capture-phase scroll listener removes the overlay, registered with
the overlay and removed with it. A scroll event that moved nothing is ignored:
pages fire those, and this panel is exactly what somebody is looking at when it
happens. A scroll inside an element gets no such benefit of the doubt, since its
offset is not readable from here.
**Why not pin the boxes to the content, which was the obvious alternative:** the
overlay describes ONE capture, and a capture only ever held what was inside the
viewport — `dom-map.ts` discards the rest. Boxes that followed the content would
keep looking authoritative while the user scrolled into fields Shield never
examined, and those fields would carry no box, which reads as "checked and safe"
rather than "not looked at". Clearing keeps the claim exactly as wide as the
evidence behind it.
