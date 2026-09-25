# Session Log — Shield

Where work stopped and what starts next. Read the **Current state** and
**Next session starts with** sections first; the timeline is history.

Reasoning behind choices lives in docs/DECISIONS.md, not here.

---

## Current state — 2026-09-23

**Core is complete, and for the first time every one of the five scored metrics
has a number against it.** Phases 1–3 closed. Every module A–G built and
verified in Chrome against the live backend.

| Metric | Weight | Measured |
|---|---|---|
| 1 — visual context from screen | 25% | **18.4% agreement / 22.2% DOM coverage**, pooled over **10 real pages**, range 8.5–37.4% |
| 2 — PII recall / precision | 20% | **91.8% / 83.4%**, 50 pages, 12 real |
| 3 — redaction precision | 20% | **83.8%**, coverage 65.9%, context kept 96.5% |
| 4 — client resource use | 20% | **Scan peak ~285MB, run ~144MB, scan CPU 87-93%**, Chrome, one machine. The ~1.1% was a sampling error, corrected — RESOURCES.md |
| 5 — end-to-end latency | 15% | **Chrome ~150ms, Firefox 364ms warm**, every stage inside budget |

| Measure | Value |
|---|---|
| Client tests | 413 |
| Reasoner checks | 82 |
| Prompt checks | 56 |
| One full pass | 27.4ms capture · 4.4ms DOM · 52.0ms inference · 40.2ms redaction · 10.5ms network |
| Backend on an integrated-graphics laptop | **WebGPU**, 31.7ms inference |
| CPU fallback, proved by self-test | 135ms init, 17ms inference; re-verified 2026-09-23 under the Worker host at 126ms / 55ms |
| Face detection | 6 of 8; reliable 110px+, marginal at 80px (0.312 vs 0.3) |
| Adversarial screen | 7 of 8, predictions recorded before each run |

**Done 2026-09-20 — three scan-path changes built, then all three measured in
one Chrome run. Two produced results; one of those was a null, and the null is
the most useful thing in this entry.**

| | Built | Measured |
|---|---|---|
| PNG scan capture | yes | **zero effect — reverted** (DECISIONS.md 230) |
| One read per image | yes | did not fire: no image candidates on this page |
| Scan profile | yes | **82% of a scan is whole-frame OCR** (DECISIONS.md 231) |

- **PNG on the scan path — tried and reverted on its own measurement**
  (DECISIONS.md 227, 230). 29 argued JPEG ringing costs recognition; 70 only
  ever reverted that on latency. Tried properly for the first time, and the
  first stop came back **identical to the JPEG run, item for item — 12 agreed,
  9 pixel-only, 35 markup-only, both times.** Not close: the same three
  integers. PNG was not even expensive here (112–140KB, smaller than the JPEG
  it replaced, 54ms capture), so 70's 1511KB figure was a photograph-heavy
  page rather than PNG as such. Reverted because a scan holds every frame until
  the walk ends, which on a photo-heavy page is a metric-4 cost for a benefit
  now measured at zero. The seam stays, both branches equal on purpose.
- **The page figures moved down, and the reason matters more than the figures.**
  Agreement 22.8% → 20.3%, DOM coverage 31.6% → **28.1%**. Every bit of that is
  the second stop; the first did not shift by one item. An effect that is
  exactly zero at one stop is not an effect. **So what this run actually
  measured is the noise floor of a single-page agreement figure — about three
  points** — which is the bar every future "metric 1 improved" claim has to
  clear, and is most of the distance between the only two readings we have.
- **Metric 1's input has now been exhausted as a lever.** Resolution was tried
  (212: four points). Encoding has been tried (zero). Markup-only is still 41
  of 57. The remaining candidate is the recognition engine itself, not the
  pixels handed to it, and nothing further should be spent on the input.
- **A scan reads each image once, whole** (DECISIONS.md 228). Stops overlap by
  25%, so the same picture was going to OCR two or three times for an identical
  answer, and OCR is the most expensive thing a stop does. Only *successful*
  whole reads are remembered — a failed read is retried, and there is a test
  for that specific case, because "attempted" looking like "read" is the one
  bug in this change that would be a privacy failure rather than a lost
  optimisation. Clipped images are left to a stop that sees them entire or to
  `unexaminedImages`, which covers them whole at full confidence; that is a
  stronger outcome than a half-read returning clean.
- **A scan is profiled, with no budgets** (DECISIONS.md 229). `scan-timing.ts`
  reports per-stage totals, call counts and per-call cost, shares taken against
  wall-clock with the unwrapped remainder printed rather than renormalised
  away. 9 tests, written against the instrument rather than against the scan —
  lesson 12, applied before the fact.
- **The first profile, and it redirected the work** (DECISIONS.md 231). 7.0s
  over two stops, 3.5s/stop: **`screen text` 5.7s — 82%, 2.9s per stop.**
  Settle 914ms (13%, our own 450ms constant), face inference 108ms, capture
  108ms, record 68ms, DOM walk 10ms, scroll 1ms. Unaccounted 10ms, so the
  profile is 99.9% complete and can be read as one.
  **`image OCR 0ms`.** The scan-speed change was aimed at image OCR on the
  reasoning that overlapping stops re-read the same pictures — and a logged-out
  login form has no image candidates at all, so it did not fire and is neither
  confirmed nor refuted. It will matter on a page with documents on it. It was
  going to be optimised on faith for as long as nobody measured.
  **The same stage is the cost and the ceiling.** Whole-frame OCR is 82% of the
  scan's time *and* the 41 markup-only items — the largest latency item and the
  binding constraint on a metric worth 25%, in one component. Everything else
  totals 18% of a path that transmits nothing. Work aimed there counts twice;
  work aimed anywhere else in this profile cannot pay.

**The naive-baseline comparison is built and measured** (DECISIONS.md 232) —
the strongest judge-facing artefact the project did not have, and the thing
that makes 60.4% coverage readable instead of alarming.

| Strategy | Recall | Precision | Coverage | Redaction precision | Area | Context kept |
|---|---|---|---|---|---|---|
| No redaction | 0.0% | 100.0% | 0.0% | 100.0% | 0.00x | 100.0% |
| Blanket blur | 100.0% | 16.0% | **100.0%** | 32.9% | 3.04x | **0.0%** |
| Hide every field | 77.1% | 75.3% | 56.2% | 77.1% | 0.73x | 95.2% |
| Hide every value | **94.1%** | 28.8% | 67.5% | 39.4% | 1.71x | 55.6% |
| **Shield** | 83.5% | 83.5% | 60.4% | **83.9%** | 0.72x | **96.9%** |

**Two of the four beat Shield on a headline number, and the table says so in
its own first paragraph.** Blanket blur takes a perfect coverage score by
painting 3.04x the area needed and destroying 891 of 891 non-sensitive
elements. Hide-every-value takes 94.1% recall and pays 55 points of precision
and nearly half the page. Hide-every-field is the only one Shield beats
outright. **Shield is the only row above 80% on recall, precision and redaction
precision simultaneously while keeping the page usable.**

The column doing the work is **Context kept** — non-sensitive elements still
readable. It is the only measure under which hiding everything scores zero, and
it answers the question no detection metric asks: can the agent still act on
what is left. `tests/baselines.test.ts` asserts that blanket blur still beats
Shield on coverage, deliberately — if Shield ever wins every column the
baselines have been weakened, not the detector improved. That is lesson 12
applied to a persuasion artefact, which is where it matters most.

It also prices the recall gap honestly: hide-every-value reaching 94.1% says
the ~11 points Shield is missing are reachable by aggression, at a cost of 55
points of precision. DECISIONS.md 224's target is a real frontier, and the way
to it is better detection rather than a looser rule.

**The latency/accuracy trade-off study is built and measured** (DECISIONS.md
233) — and the study the PS's phrasing implies turned out not to be available.
A confidence-threshold sweep is the obvious shape, and **Shield has no
confidence threshold; adding one to draw a curve would be a policy violation**
(`dom-rules.ts` header, SECURITY_PRIVACY.md §4). The two real knobs are
reported instead.

**Which layers run — the span is three orders of magnitude:**

| Layer | Cost | Labels owned | Found |
|---|---|---|---|
| DOM rules | 4.4ms | 160 | 142 |
| Face detection | 34ms | 3 | needs a browser |
| Image OCR | *unmeasured* | 10 | needs a browser |
| Whole-frame text | 2900ms/stop | 0 | needs a browser |

The DOM walk owns 160 of 170 labels for 4.4ms; whole-frame recognition costs
2.9s a stop and owns none, because its output is agreement (metric 1) not
recall, and crediting it here would count metric 1 twice under two names.
**That is the quantitative case for DECISIONS.md 188's run/scan split.** Every
cost is quoted from a recorded run with its source printed; an unmeasured one
stays null and prints as *unmeasured*, and the cumulative column stops at it
rather than producing a total with a term silently missing.

**The image size floor sits exactly on the knee, and nothing said so before.**
Below the shipped 140x80, recall holds flat at 90% all the way down to 40px
while precision collapses 69.2% → 27.3% and the crop count rises to 2.54x —
pure cost, no gain. Above it recall falls immediately, 90% → 80% → 70%. That
floor was *derived* from the width a twelve-digit Aadhaar number needs to stay
legible; it is now *measured*, which is a different claim and the reason the
sweep was worth running. The sweep passes the floor into the shipped
`imageCandidates` rather than reimplementing its geometry, with a test that
fails if it ever stops doing so.

**FR-14 is built, and the interesting part is what it refuses to do**
(DECISIONS.md 234). "Configurable redaction aggressiveness" reads as a slider
with a lax end, and building one would violate CLAUDE.md's uncertainty rule and
`dom-rules.ts`'s refusal to gate redaction on confidence. **So the range only
goes up: `standard` is the floor of the setting, not its middle**, and the
honest answer to "can a user reduce redaction?" is no, with a reason that can
be pointed at.

What is configurable is the part that was always a judgement call — the
geometric image floor. `standard` 140x80, `thorough` 100x57, `maximum` 40x23,
each a measured row from the sweep above: 1.00x / 1.23x / 2.54x the OCR crops
at 69.2% / 56.3% / 27.3% precision. A test pins the three pairs to the sweep,
so a floor edited without re-running the measurement fails rather than quietly
shipping a guess. `thorough` buys nothing on the current 50 pages and is
offered anyway with that stated — 50 pages is not the world.

Every failure direction lands on `standard` or above: unrecognised value,
corrupted value, missing key, non-string, and a caller that forgets the
argument. One test each, because a setting whose broken state loosens redaction
would be worse than no setting. One incidental fix came out of it: `runStep`
read settings twice across several awaits, so a setting changed in between
would have produced a step that detected at one level and reported another.

342 client tests pass, `tsc --noEmit` clean, both builds pass, `npm run
benchmark` regenerates docs/BENCHMARK.md with both studies in it, and Chrome's
bundle graph is re-verified unchanged: `dist/service-worker.js` still statically
imports six chunks and reaches `dispatch` and `inference-session` only through
the dynamic preload table.

---

**Benchmark — the corpus grew from 4 pages to 38 and every number moved:**

| Measure | 4 pages / 19 labels | 38 pages / 150 labels |
|---|---|---|
| Recall | 89.5% | 81.3% |
| Precision | 94.4% | 83.0% |
| F1 | 91.9% | 82.2% |
| Category accuracy | 94.1% | 88.5% |
| Redaction coverage | 87.6% | 56.5% |
| Redaction precision | 94.5% | 83.4% |
| Misses / over-flags | 2 / 1 | 28 / 25 |

Nothing was tuned. The old figures described four pages, three of which were
written to exercise this code.

**Pixel layer, measured for the first time:** 2 sample ID cards, 11 labelled
regions, recall 27.3%, precision 100%, coverage 40.9%, redaction precision
64.3%. Identifiers on a scanned card are found; the name, address and date of
birth printed beside them are not. This scores everything *after* the
recognition engine — Tesseract cannot run in Node, so the word boxes are
perfect readings of the committed sample SVGs, and the report says so.

**Done this session:**

- The screen-5 explanation defect is fixed. `Account 402711558903` was hidden
  correctly and explained as "matched Aadhaar number format"; a match now
  carries the other kinds whose shape fits the same span and that no checksum
  ruled out, so it reads "Aadhaar number or bank account number". Redaction and
  the Aadhaar rule are untouched.
- A second, older defect found next to it: GSTIN verification read the holder
  type at index 7 when the embedded PAN starts at index 2, so every well-formed
  GSTIN came back unverified. Confidence and wording only; redaction was never
  affected.
- Dev-only element-map export, the actual blocker on corpus growth. Gated on
  `SHIELD_DEV=1` (verified against the built bundle, not the source), on the
  operator reading every value before a file exists, and it drops `pageUrl`.
- 34 new corpus pages: Indian government, banking, telecom, health, insurance,
  employment, commerce, plus seven where the correct answer is nothing.
- `scorePixels`, IoU-matched, one detection to one region, with boxes on the
  two committed sample ID cards.
- `npm run check` now typechecks `tests/` and `benchmark/` as well as `src/`.

**Two defects in the export, found by testing it in Chrome and fixed:**

- The gate only *hid* the panel. `__SHIELD_DEV__` set `panel.hidden`, so a
  default build still carried `readPageForCorpus` in `popup.js` and the panel's
  markup in `popup.html` — anybody with devtools could unhide it and write a
  file of real field values. The panel now builds its own DOM inside
  `if (__SHIELD_DEV__)`, and a default build contains no trace of it. Verified
  by grepping `dist/`, not by reading the source.
- The panel could not read a freshly opened tab. Shield injects its content
  script only when a run, scan or mark starts, and the panel is none of those;
  it failed and advised reloading the page, which cannot help because there is
  no declared script to bring back. It now pings, injects and confirms.

**Two systematic gaps the bigger corpus found**, recorded rather than fixed —
fixing detectors against a corpus in the same session is how a benchmark
becomes a target:

1. Amounts, in both directions. A balance or income in prose passes untouched;
   the same figure in a form field is hidden by default-to-hide.
2. Prose generally. Names, addresses and dates of birth in sentences are missed
   everywhere, and that is most of what a bill or a statement contains.

**Metric 1 — the vision layer now reads the whole screen, not just image crops.**
DECISIONS 41 ruled out generic UI-element detection and stays in force for icons;
185 amends it for text. OmniParser's `icon_detect` was evaluated and rejected on
**licence** — AGPL-3.0 inherited from Ultralytics, on a repository with no
LICENSE file — and small VLMs on **output shape**, since they emit text where an
element map needs boxes. Neither was rejected on merit, and both are recorded so
nobody re-derives it.

What was built instead costs no new model and no new licence: `READ_SCREEN` runs
the Tesseract path that was already there over the whole frame,
`vision/screen-text.ts` turns words into text regions in viewport pixels, and
`vision/agreement.ts` compares that reading against the DOM walk. Text only the
pixels saw becomes a scan finding, so a number drawn into a canvas is redacted on
every later run — content that reached a capture unexamined until today. Reading
the frame belongs to the scan and never to a run: a run is budgeted at 150ms and
this is not a 150ms operation.

**None of it has seen a real screen.** 24 tests cover the logic; the agreement
rate is unmeasured and the wiring is unverified in Chrome.

**The payload inspector now shows the picture, not only the placeholders.**
`evidence.ts` dropped the frame from the stored transmission, with a comment
saying it was omitted for length alone since it is redacted and safe. That was
true and it left the strongest demonstrable claim unavailable on a real page:
the tags were readable, the image they travelled with was not. The scan record
proves a scan; nothing proved a run. One frame is now kept beside the
transmission and opened at full size in `sent/sent.html`, and if storage refuses
it the payload is stored again without it — losing the record to keep a
screenshot would invert what the surface is for.

**The caveat that matters most:** the corpus contains **no real page**. Every
one was written here, and a measurement against our own description of a page
proves less than one against somebody else's. The runner prints that line on
every run for as long as it is true.

---

## Next session starts with

### 2026-09-23 — a live page found a leak path the corpus could not

**A real run refused to transmit, and the refusal was correct.** The zero-leak
sweep — which searches the *whole* payload rather than only where a value is
expected — found a flagged name still present after redaction and stopped the
run. Nothing left the machine. Two defects sat behind it, and the second was
the larger.

*The scrubber did not know about names.* The gazetteer had been added to
`classifyTextContent` alone, so a name was tokenised in a field's value and
transmitted intact inside a control's accessible label. The comment above
`scrubTextContent` had predicted exactly this, having been written after the
same bug with an email address.

*The matcher was positional.* `matchAll` returns non-overlapping matches, so a
capitalised word in front of a name consumed it — "Message Priya Sharma"
scanned as "Message Priya", not a listed name, with "Priya" already spent.
**Any name preceded by a capitalised word was invisible to both paths.** Names
at the start of a string matched, which is why every fixture passed. Now
tokenises capitalised words and tests each adjacent pair.

**The benchmark did not move — recall 91.8%, precision 83.4%, over-flags 31,
byte-identical.** Not one of the 50 corpus pages places a name after a
capitalised word. A fix with zero corpus effect and a real effect on real pages
is a statement about the corpus, so the case went in as a unit test and
deliberately **not** into the corpus. DECISIONS.md 274.

**The general property is now asserted**: whatever `classifyTextContent` calls
sensitive, `scrubTextContent` must remove. A category taught to one path and
not the other fails in a second rather than on a live page. Both fixes verified
by removal — six tests fail without them. 413 client checks, 138 server.

**Three stale or contradicted numbers corrected**, all of which a judge could
have found: `RESOURCES.md` still repeated "CPU never exceeded 1.1%" in its
summary while the same file's correction says to quote 87-93%; the README and
server README carried stale test counts; and this file's Current state block
held the pre-gazetteer metrics. The CPU-fallback verdict was re-taken under the
Worker host (126ms init, 55ms inference) and recorded as **not** like-for-like
with the earlier offscreen reading rather than presented as a comparison.

**Onboarding and the commit guard.** `docs/SETUP.md` takes a new machine from
clone to a verified run; `tools/hooks/pre-commit` refuses a commit staging a
`.env`, a key pasted into source, or a face photograph, and is installed per
machine with `git config core.hooksPath tools/hooks`. Tested in both
directions. `.gitattributes` pins the hook to LF, without which it fails on
Windows as `/bin/sh^M: bad interpreter`. An audit of all 62 commits found no
credential has ever entered history. DECISIONS.md 273.

**`docs/HACKATHON_BRIEF.md`** collects the numbers, the three ways to misquote
them, the limits to volunteer first, judge questions by category, and a
recovery table for when the demo breaks. Team roster is now five.

**Blockers:** none technical. **Not done and owed:** the settled-after-two-
minutes memory figure on Chrome, the backup video, one full rehearsal, and the
Firefox `strict_min_version` decision (recommendation on record: keep 121, add
a sentence to PRIVACY.md).

**Next session starts with** re-running the page that failed, in a browser,
against a fresh build — the fix passes 413 tests and has not yet run where it
broke. Then two more real sites, since that activity found this defect in a
minute where the corpus never could.


### 2026-09-21 (later) — packaged as a product; hosting declined

**"Deploy" was two jobs and only one was worth doing before the 25th.**

**Hosting the server: declined, deliberately.** The manifest's
`host_permissions` is localhost-only, `DEFAULT_ENDPOINT` carries a written
reason against pointing at a hosted endpoint, and the server has no auth and no
rate limit because it was written to be reached from the same machine. Public,
it is an open relay. More to the point, the demo currently survives the venue
wifi dying — 260 proved the whole stack runs offline — and hosting trades that
away. DECISIONS.md 262.

**Chrome cannot be deployed before the event at all** — the Web Store is the
only path and its review queue is not controllable. Firefox can: `lint:firefox`
already runs `--self-hosted` and passes, so an AMO-signed `.xpi` is hours. So
distribution helps the secondary browser and not the primary demo, which is
worth knowing before spending a day on it.

**Four absences closed.** There was **no LICENSE at all** (so the default was
all rights reserved while the deck said "open") — now Apache-2.0 for the patent
grant, matching Qwen's own licence, with a NOTICE recording every third-party
component. **docs/PRIVACY.md** is new, written for whoever installs it rather
than for engineers, and states the four known limits rather than burying them.
**server/Dockerfile** was built and run, not merely written: 202MB, non-root,
real `/analyze` in **42ms** on the rule path. **`npm run package`** writes both
store archives with checksums, using a zip writer against `node:zlib` rather
than a dependency, and **refuses a `SHIELD_DEV=1` build** — a refusal provoked
before it was trusted.

**Verified rather than asserted, twice.** The archives were extracted again:
59/59 files, model and bundles byte-identical, the model's hash matching the pin
in `tools/models.json`. And PRIVACY.md's "exactly one outbound request" is
checkable — there is one `fetch` in the extension outside tests, and no
analytics or telemetry package anywhere.

**One real finding from the AMO validator.** 0 errors, 0 notices, 13 warnings,
and every warning is now attributed: none are in code we wrote. But
`strict_min_version` is 121 while `data_collection_permissions` only exists from
Firefox **140**, so **on 121-139 that declaration is silently ignored**. The code
guarantees are unaffected, but PRIVACY.md leans on it. Left open rather than
changed, because raising the floor abandons a documented decision.

**Uncommitted:** LICENSE, NOTICE, docs/PRIVACY.md, server/Dockerfile,
server/.dockerignore, extension/tools/package.mjs, README.md, TASKS.md,
DECISIONS.md (261-262), extension/package.json, extension/.gitignore. 394 tests
and typecheck pass.

**Open items back to 11** — two were added, not hidden: the Firefox minimum
version decision, and the optional AMO signing.

### 2026-09-21 — T1.3 closed. The model reads the picture, and no key was needed.

**T1.3 is done.** Both remaining boxes closed locally, on an open-weights model,
with no account and nothing paid.

**The blocker had been misread for weeks.** "One live call that proves the
picture is used" was filed as needing a hosted key, and the offline run as a
separate, harder job. It is the reverse: **ollama serves the same
OpenAI-compatible shape the adapter already targets and ignores the bearer
token**, so one local model closed both. The adapter took it **with no code
change**, which is the first real evidence that "the provider is configuration,
not code" (DECISIONS.md 195) was true rather than intended.

**Wiring is not use, and 18 checks could not tell them apart.** test_prompt.py
already proved the frame is sent correctly; a model that receives a correct
image and ignores it passes every one of those checks. Settled by experiment
instead — `server/verify_vision_live.py` sends two requests with a byte-identical
PAGE CONTEXT and a different screenshot, and the chosen action moves with the
pixels: *click Sign in* on the plain frame, *click Accept cookies* when a banner
covers the button. **With the frame withheld, both return Sign in** — that
control is what makes it a result. Both failure paths were provoked against
stubs first, so a pass means something (the discipline from 246).

**Measured, CPU only, no GPU offload:** vision 13.0–18.3s warm, text-only
11.3–11.7s, **22.2s end to end through the real `/analyze`**. The image costs
about 2–6s on top. **This is a fallback, not a demo path** — three orders of
magnitude past the budget — and DEMO_SCRIPT.md now says so with the number.

**Found by accident:** a stale server from an earlier session was still holding
8787 and answering `/health` with `model_configured: false` while the newly
configured one failed to bind. Exactly what the demo checklist warns about,
found here rather than on stage.

**Uncommitted:** `server/verify_vision_live.py` (new), TASKS.md, DECISIONS.md
(260), DEMO_SCRIPT.md, OPERATOR_RUNBOOK.md. 394 extension tests and both server
suites pass.

**Next:** Session B and C of the runbook — the Firefox resource figures (which
unblock the idle-disposal window), screens 1–5 on Chrome, Edge, and the Chrome
CPU-fallback re-prove. All need a browser, none need a key. Session D is closed
and needs nothing brought back.

Priorities and targets live in TASKS.md ("Top three by impact", "Targets").
Firefox is closed as a port (DECISIONS.md 220–222); what is left there is
measurement.

**Session A of the runbook is done — nine pages scanned, and metric 1 fell.**
Pooled over ten pages: **agreement 18.4%, DOM coverage 22.2%** (762 agreed, 709
pixel-only, 2678 markup-only), against the 31.6% the single income-tax page had
been carrying 25% of the score on. **It was flattering by nine points**, which
is lesson 7 repeating on a different metric. Per page the coverage runs 8.5% to
37.4% — a 4.4x spread — with a median of 21.6% a single point from the pooled
figure, so the number is not an artefact of one enormous page. Rows and failure
modes in docs/GENERALISATION.md §3; reasoning in DECISIONS.md 236–237.

**Predictions scored 2 right, 2 wrong, 1 half**, which is the reason for
writing them down first. Right: Maps is overwhelmingly pixel-only (4 agreed
against 42) and NSE's dense numerals are the worst read (785 markup-only).
Wrong: GitHub's dark low-contrast theme was predicted to hurt and is the best
page on the list at 37.4%; Apple's large display type was predicted to read
near-perfectly and lands mid-table at 18.6%, its text being mostly baked into
images.

**Two limits found that no test could have.** A Devanagari page returned 143
pixel-only regions with only `eng.traineddata` shipped — Latin-shaped guesses
at Devanagari glyphs, failing towards over-redaction, which is safe and is not
the same as correct. It inflates exactly the column metric 1 uses to argue the
pixel layer earns its place, so **a pixel-only count on a non-Latin page is not
evidence**. And `MAX_SCAN_STOPS` bit a real page for the first time: mygov.in
is 15950px and the scan examined 8744 of them, 55%, and said so in three
separate places rather than reporting a whole-page verdict with a hole in it.

**Two things confirmed.** DECISIONS.md 231's profile holds across nine more
pages — whole-frame OCR is 49–90% of a scan's wall-clock, ~72% on average. And
228's image-OCR skipping is firing on real pages, which the income-tax login
could never have shown because it has no image candidates at all.

**Two changes built on the back of that, neither yet measured.**

- **The whole frame is now read as sparse text** (DECISIONS.md 238). Tesseract
  defaults to PSM 3 — full page layout analysis, built for scanned documents,
  which hunts for columns and a reading order and **discards regions as
  non-text before recognition runs**. A browser viewport has no such structure,
  and that mechanism produces exactly the markup-only symptom that is metric
  1's only failing row. PSM 11 is sparse text, no layout analysis. **A crop
  keeps PSM 3** — a photographed card genuinely is a document, and metric 3's
  pixel figures must not be disturbed while chasing metric 1. What is claimed
  is a plausible mechanism, not a result: 230's encoding hypothesis was at
  least as reasonable and bought exactly zero.
- **A scan now prints what it found, not only how many** (DECISIONS.md 239).
  The run path has had a per-detection table since Module B; the path whose
  purpose is answering "what is on ALL of this page" could report `29
  finding(s)` and nothing about any of them. That is precisely why the sweep's
  Detect column was unfillable from a console. Positions print in document
  coordinates, because a scan's findings outlive the scroll they were found at.

**Steps for every item below, and the exact lines to bring back, are in
docs/OPERATOR_RUNBOOK.md** (DECISIONS.md 235) — grouped into five sittings.
Session A merges the sweep with metric 1's missing pages, which were being
planned as two sittings and are one.

**Needs a human at a browser:**

1. **The remaining eleven sweep sites**, for T2.3's detection rows — the nine
   above answered metric 1 and left the Detect column blank, because the
   sensitive list was not written down first. **Those nine need re-running for
   detection, or eleven fresh sites need it done properly.** Scoring detection
   against findings already read is the one thing the protocol forbids.
2. **The generalisation sweep's 20 sites.** Protocol written
   (docs/GENERALISATION.md), table committed empty. Observe-only, logged out,
   sensitive list written down *before* reading Shield's output. Start with the
   regional-language portal — the audit predicts the rule path declines there,
   and a predicted failure that does not happen is as interesting as one that does.
3. **Firefox resource figures.** The task-manager protocol in docs/RESOURCES.md,
   run on Firefox. Metric 4 is 20% and Firefox is unmeasured; it also gates the
   idle-disposal window, which cannot be chosen until a resident Firefox
   session has a cost (DECISIONS.md 222).
4. **Face pixel truth** (T1.1) and **the settled-after memory figure** (T2.2).
   Both need a recorded Chrome run; the face boxes cannot be committed because
   `face-a.jpg` and `face-b.png` are not.
5. **Re-prove the Chrome CPU fallback under `forceInferenceHost: 'worker'`**,
   and **run the full fixture set on both browsers**. The cached verdict would
   have masked 221 under the worker host.
6. **A scan of any page with an image on it**, to confirm the image-OCR
   skipping fires at all. The login form had no image candidates, so
   `image OCR 0ms` is not evidence either way. Look for
   `image OCR … (n skipped — already read whole or clipped)`.

**Startable without a browser:**

- **The naive-baseline comparison** (Tier 3) — blind blur vs semantic
  placeholders, measured. What makes coverage 60.4% readable (DECISIONS.md 225)
  and the strongest judge-facing differentiator not yet built. This is the next
  one to start.
- **The latency/accuracy trade-off study** (Tier 3) — threshold vs recall vs
  milliseconds, as a curve. The PS asks for the balance explicitly.
- The PNG scan capture, scan speed and scan latency instrumentation are now
  **built** (DECISIONS.md 227–229). What each owes is a figure, and the figures
  need a browser — see item 6 below.

**Needs a key and a disk, not a design:** T1.3's last two boxes — one live call
proving the model uses the picture, and one `ollama pull` proving the offline
claim.

---

## Timeline

| Session | Closed |
|---|---|
| 0 | Documentation set written |
| 1 | MV3 shell scaffolded; TypeScript + Vite two-pass build |
| 2 | Tab capture built (`captureVisibleTab`, PNG, manual base64 decode) |
| 3 | Capture verified in Chrome; `executeScript` injection bug fixed |
| 4 | Docs moved to `docs/`; stale content-script bug fixed |
| 5 | Build stamp added (`__SHIELD_BUILD__`) after repeated stale-build confusion |
| 6 | Root-caused the stale-build problem: every verification channel was reading a cached bundle |
| 7 | DOM element map verified — first end-to-end read of a real page |
| 8 | Label de-duplication; UltraFace RFB-320 selected and acquired |
| 9 | ONNX Runtime Web + WebGPU verified. Inference moved to an offscreen document — MV3 workers have no DOM |
| 10 | CPU fallback proved by automatic self-test, not by assertion |
| 11 | **Module A closed.** Self-test persists its verdict before announcing it |
| 12 | **Module B.** DOM rules + face detection. Two defects found on a real page |
| 13 | **Module C.** Opaque fill over blur; semantic placeholders verified |
| 14 | **Modules D + E.** FastAPI backend; transport enforces the invariant by type signature |
| 15 | **Module F.** Status indicator, explainable overlay, payload inspector |
| 16 | Reasoning-model integration; prompt template versioned |
| 17 | **PHASE 1 CLOSED.** All 4 DOM screens pass; 11 detections from 21 elements on signup, every category as predicted |
| 18 | **PHASE 2 CLOSED.** Signup reasoner: three defects fixed, below-fold submit solved with `scroll` |
| 19 | **PHASE 3 CLOSED.** Faces measured: 6 of 8, floor soft at 80px |
| 20 | Real sites: two defects no fixture could have found — labels transmitted verbatim, and a login page classified as a signup |
| 21 | Manual redaction built — marks hide pixels *and* tokenise overlapping elements |
| 22 | Manual marking fixed: reachable before a run, drag preview corrected, popup reworked |
| 23 | Indian identifier taxonomy; OCR over image crops, engine load fixed under MV3 CSP |
| 24 | Whole-page coverage: the run boundary is stated, and a scan that sends nothing |
| 25 | Scan verified in Chrome. Clipped-image defect found by two scans disagreeing. Audit log built |
| 26 | Task list rebuilt around the five scored metrics. Benchmark instrument, corpus and first baseline for metrics 2 and 3 |
| 27 | Corpus grown 4 pages to 38; pixel ground truth and a pixel scoring path; dev-only element-map export; identifier explanation fixed |
| 28 | Vision layer evaluated and amended: whole-frame text regions and a DOM-versus-pixels comparison, no new model or licence |
| 29 | Agreement counted per page instead of per stop; open-weights VLM pinned and the redacted frame sent by default |
| 30 | First real pages in the corpus — 12 of 50, captured from live sites; the operator's own email and PAN caught before they reached a commit |
| 31 | Firefox port built, tried and parked; resource use measured for the first time; metric 1 measured at 18.6% on a real page |
| 32 | Frame doubled before recognition, on the scan path, with a tested pixel ceiling; generalisation protocol written and the fixture-path audit done — none exists, and it found two limits the sweep would not have |
| 33 | DECISIONS.md given a supersession convention and an index of what is no longer in force; Chrome-only reversed and Firefox un-parked (214–216); inference moved behind a two-host seam with the Worker built |
| 34 | Upscale measured after the fact (18.6% -> 22.8%); five scans prove there is no leak; Chrome host comparison, document host kept |
| 35 | Firefox runs the whole vision path end to end — WebGPU, 364ms warm, CPU fallback proved on both browsers; double-build race fixed |
| 36 | Targets and reading rules set for all five metrics (DECISIONS.md 223–226); work re-ordered by impact |
| 37 | Scan path given one read per image and a profile of its own; PNG capture tried and reverted on a clean null. 82% of a scan is whole-frame OCR, which is also metric 1's ceiling (DECISIONS.md 227–231) |
| 38 | Shield measured against the four redactors it could have been — two beat it on a headline number and the table says so (DECISIONS.md 232) |
| 39 | Latency/accuracy measured over the two knobs that exist rather than the threshold that does not; the image size floor is shown to sit on the knee (DECISIONS.md 233) |
| 40 | FR-14 built as a range that only increases — `standard` is the floor, and the levels above it are priced from the sweep (DECISIONS.md 234) |
| 41 | Operator runbook written: eleven browser-dependent items in five sittings, with steps and what to bring back (DECISIONS.md 235) |
| 42 | Metric 1 measured on ten pages: 22.2% DOM coverage, not the 31.6% one page claimed. Devanagari and the 12-stop cap found as limits (DECISIONS.md 236–237) |
| 43 | Segmentation mode split: the viewport read as sparse text, a crop still as a document. A scan prints its findings (DECISIONS.md 238–239) |

---

## Recurring lessons

1. **Coordinate bugs fail silently** — a plausible rectangle over the wrong
   pixels. Hit three times: overlay staleness, marking surface, drag preview.
   Every conversion between document and viewport space now has a pure,
   separately tested function.
2. **Fixtures cannot find what real pages find.** Labels leaking verbatim and a
   login page misread as a signup were both invisible to every test we had.
3. **Verify against the running build, not the source.** Six sessions were spent
   on a problem that was a cached bundle.
4. **Separate a coverage gap from a leak before costing the fix.** Off-screen
   content was never captured and so never transmitted; treating that as a leak
   would have justified a far riskier change than the facts supported.
5. **An absence is read as a verdict.** A field with no box on it looks checked.
   Every boundary Shield has is now said out loud rather than left to inference.
6. **Two runs disagreeing is a finding, not noise.** One scan reported two
   identifiers and the next reported one; the cause was a card clipped by the
   viewport edge, read as its visible half and reported clean. Nothing in the
   test suite could have found it — it needed the same page looked at twice.
7. **A corpus written by the people being measured measures them generously.**
   Four pages scored 89.5% recall. The same detector, unchanged, scores 81.3%
   over 38 — and the 38 are still ours, which is why the report says so on
   every run. The drop is not a regression; it is the first honest look.
8. **Redaction being right does not make the explanation right.** Screen 5 hid
   a bank account number correctly and told the user it was an Aadhaar number,
   because pattern order decided which rule claimed the span and that ordering
   reached the trust overlay as though it were evidence. On the one surface
   whose value is being read literally, a true action with a false caption is
   its own kind of failure.
9. **A capability can be built, verified, and then not used.** The redacted
   frame was captured, painted, sealed, checked by three independent barriers
   and attached to the payload — and then left off the wire by an environment
   variable that defaulted to off, on reasoning that was locally correct and
   answered the wrong question. Nothing failed and nothing was logged. The
   prompt meanwhile described the screenshot in every request regardless, so
   the two halves had disagreed for as long as both existed.
10. **The review step in a privacy tool is not ceremony.** The first real
   capture carried the operator's own email address and PAN into files bound
   for a public repository, in among a dozen obviously-fake values. Nothing
   failed and nothing warned; it was caught only because reading every value
   before committing is a written step. The password sentinel meanwhile held
   on five real bank login pages, including an ATM PIN field — the automated
   guarantee worked and the human one was the one that nearly slipped.
11. **A measurement can contradict the one before it, and the honest move is to
   publish both.** The process footprint fell to 122MB after one run and stayed
   at 215MB after another, with the vision host disposed of in both. Different
   processes, so not strictly comparable — and the temptation is to quote the
   flattering figure. RESOURCES.md states both and names the single test that
   would settle it, because a resource table is read as measured fact and a
   number chosen for how it sounds is worse than an admitted gap.
13. **A single-page metric has a noise floor, and not knowing it makes every
   claim about that metric unfalsifiable.** The same page, read twice, with a
   change between the runs whose effect at the first stop was exactly zero,
   still moved DOM coverage 31.6% → 28.1%. Three points of drift from nothing
   at all. The 2.0x upscale was credited with four points on a single reading
   of the same page (212) — a figure now barely outside the noise, and it was
   never presented that way because nobody had measured the noise. The null
   result was worth more than the change we were testing for.

12. **A measuring instrument flatters itself unless tested.** The first scorer
   averaged per-page ratios and dropped pages that scored zero, so total failure
   on a page raised the corpus score. It was caught by a test written against
   the scorer, not against the detector. A benchmark nobody has checked is worse
   than none, because its output looks like evidence.

## 2026-09-25 — Event day, between rounds 1 and 2

**Round 1 feedback:** "Why would anyone use AI to log in?" Fair. The demo moved from login to real workplaces.

**Done:**
- Bank KYC console (Screen 7), now ten applications; college admissions (8), company payroll (9), customer support desk (10); hub page `test-screens/index.html`. All four run through the real detector and Gemini: 15 of 15 correct.
- Server: login and sign-up go to the rules even with a model configured; everything else to the model. One retry on a model timeout, timeout 8s. Prompt 1.4.0 tells the model to stop when the task is done. A ParaBank sign-up is no longer blocked by its sidebar's empty login box.
- Client: final clicks (approve, release, send, submit…) end the run, after the KYC console approved four customers in a row. Addresses written as text are now detected. Compliance report page. Voice input built (on-device, English and Hindi) and switched off for the round.
- Tests: 439 client, 144 server, all passing. Decisions 279–290.

**Blockers:** voice does not start on the demo laptop (290). BENCHMARK.md predates the address rule and was not regenerated.

**Next session starts with:** regenerate BENCHMARK.md and check the figures quoted in the docs still hold; then find the voice failure from the error the listening window reports.
