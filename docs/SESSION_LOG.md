# Session Log — Shield

Where work stopped and what starts next. Read the **Current state** and
**Next session starts with** sections first; the timeline is history.

Reasoning behind choices lives in docs/DECISIONS.md, not here.

---

## Current state — 2026-09-16

**Core is complete, and for the first time every one of the five scored metrics
has a number against it.** Phases 1–3 closed. Every module A–G built and
verified in Chrome against the live backend.

| Metric | Weight | Measured |
|---|---|---|
| 1 — visual context from screen | 25% | **18.6% agreement**, one real page |
| 2 — PII recall / precision | 20% | **83.5% / 83.5%**, 50 pages, 12 real |
| 3 — redaction precision | 20% | **83.9%**, coverage 60.4% |
| 4 — client resource use | 20% | **Scan 217MB, CPU ≤2.1%**, one machine |
| 5 — end-to-end latency | 15% | **~135ms**, every stage inside budget |

| Measure | Value |
|---|---|
| Client tests | 294 |
| Reasoner checks | 82 |
| Prompt checks | 53 |
| One full pass | 27.4ms capture · 4.4ms DOM · 52.0ms inference · 40.2ms redaction · 10.5ms network |
| Backend on an integrated-graphics laptop | **WebGPU**, 31.7ms inference |
| CPU fallback, proved by self-test | 135ms init, 17ms inference |
| Face detection | 6 of 8; reliable 110px+, marginal at 80px (0.312 vs 0.3) |

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

**Everything left is a Chrome run.** Session 32 built the two things that could
be built without a browser and stopped at the point where the next step is
somebody watching a console. Nothing below is blocked on a design.

1. **The after-measurement for the frame upscale.** The frame is now doubled
   before recognition and every screen-read line prints the magnification it
   used, so a reading is attributable. **Scan the income-tax login again.** The
   figures to beat are **18.6%** page agreement and **16 of 59** items read.
   Record the new rate *and* the scan wall-clock — this change may cost more
   latency than it buys, and that is exactly what the number is for. Until
   somebody does this, the change is a reasoned expectation, not a result.
2. **Nine more pages for the agreement rate.** One page is a data point.
3. **Five scans in a row, watching the memory footprint.** Now doubly worth
   doing: the open question in RESOURCES.md was already whether 215MB is
   allocator retention or a leak, and the upscale adds a transient canvas of up
   to 36MB to every stop. If the footprint climbs, this session is a suspect.
4. **The generalisation sweep's 20 sites.** The protocol is written
   (docs/GENERALISATION.md) and the table is committed empty. Observe-only,
   logged out, sensitive list written down *before* reading Shield's output.
   Start with the regional-language portal — the audit predicts the rule path
   declines there, and a predicted failure that does not happen is as
   interesting as one that does.
5. **Face pixel truth**, the last open box in T1.1. Needs a recorded Chrome run
   — the boxes cannot be committed because `face-a.jpg` and `face-b.png` are
   not.

**Two limits found by reading the source, not running it** (T2.3, audit):
submit and consent wording is English-only, so the no-key rule path declines
rather than acting on a Devanagari portal; and checkbox state crosses the trust
boundary as the two literal strings `checked` / `unchecked`, so a change on one
side breaks consent handling on the other silently. Neither is fixed.

**Parked deliberately:** Firefox (DECISIONS.md 207–208). Everything up to
inference works there; what is left is a threading redesign on a browser that
is not the demo.

**Needs a key, not a design:** T1.3's last two boxes — one live call proving
the model uses the picture, and one `ollama pull` proving the offline claim.

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
12. **A measuring instrument flatters itself unless tested.** The first scorer
   averaged per-page ratios and dropped pages that scored zero, so total failure
   on a page raised the corpus score. It was caught by a test written against
   the scorer, not against the detector. A benchmark nobody has checked is worse
   than none, because its output looks like evidence.
