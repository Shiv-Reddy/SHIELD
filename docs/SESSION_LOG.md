# Session Log — Shield

Where work stopped and what starts next. Read the **Current state** and
**Next session starts with** sections first; the timeline is history.

Reasoning behind choices lives in docs/DECISIONS.md, not here.

---

## Current state — 2026-09-13

**Core is complete.** Phases 1–3 closed. Every module A–G built and verified in
Chrome against the live backend. Metrics 2 and 3 now have numbers over a corpus
that was not written to flatter them.

| Measure | Value |
|---|---|
| Client tests | 277 |
| Reasoner checks | 82 |
| Prompt checks | 53 |
| One full pass | ≈150ms, every stage inside budget |
| Capture / DOM / inference / redaction | 39ms / 1.5–6.5ms / 40–49ms / 37–75ms |
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

**A browser.** Everything that can be built without one, in T1.1 and T1.2, is
built. Both remaining boxes in each are a measurement nobody has taken.

1. **The agreement rate on ≥10 real pages** — the metric-1 evidence, and the
   last thing standing between T1.2 and done. The counters are now
   trustworthy: readings are placed in the document, merged per reader, and
   compared once, so a page walked in more stops no longer scores differently
   (DECISIONS.md 193). The dom-only column decides whether the frame needs
   upscaling. Scan a page with text in a canvas or an iframe and read the
   `[shield] screen read:` console line.
2. **Face pixel truth**, which needs a recorded Chrome run — the boxes cannot be
   committed because `face-a.jpg` and `face-b.png` are not. This is the only
   T1.1 box still open.
3. **Harder real pages.** The 12 captured so far are logged-out login forms,
   which is the easy case — every label on them was found and every one of the
   28 misses is still on a synthetic page. What the corpus has never seen from
   outside is a statement, a bill, a search result or a photographed document,
   which is where prose names, addresses and amounts live. Capturing those is
   what would actually move the number (DECISIONS.md 200).

**T1.3 needs a key and a disk, not a design.** The open-weights VLM is pinned
(Qwen2.5-VL-32B-Instruct, Apache 2.0, free on OpenRouter), the redacted frame is
attached by default, and the offline path is written down. What is left is
setting `SHIELD_MODEL_KEY` and watching a live call actually use the picture,
and running `ollama pull qwen2.5vl:7b` once to prove the offline claim.

**Closed this session:** `sent/sent.html` verified in Chrome twice, and the
real-page share went from zero to 12 of 50 — the blocker T1.1 had carried since
it was written.

**Uncommitted:** twelve captured pages in `extension/benchmark/captured/` and
the regenerated `docs/BENCHMARK.md`. Also the agreement merge — `mergeSightings` in
`src/lib/vision/agreement.ts`, the scan-path rework in `service-worker.ts`, the
corrected `ScanSummary.screen` comment, eight tests in `tests/vision.test.ts`.
And T1.3 — `server/prompt.py` (frame-aware template, version 1.3.0),
`server/model_reasoner.py` (vision by default, `ProviderRejectedRequest`, the
text-only retry and its latch, `vision_state`), `server/main.py` (`vision` on
`/health`), 18 checks in `server/test_prompt.py`, `server/README.md`, and
DECISIONS 193–201 with the TASKS/SESSION_LOG edits.

`ppt.md` at the repository root is a scratch file for the idea deck and is not
meant to be committed. Do not commit until explicitly told to, and use the
identity given at that time.

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
11. **A measuring instrument flatters itself unless tested.** The first scorer
   averaged per-page ratios and dropped pages that scored zero, so total failure
   on a page raised the corpus score. It was caught by a test written against
   the scorer, not against the detector. A benchmark nobody has checked is worse
   than none, because its output looks like evidence.
