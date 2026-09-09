# Session Log — Shield

Where work stopped and what starts next. Read the **Current state** and
**Next session starts with** sections first; the timeline is history.

Reasoning behind choices lives in docs/DECISIONS.md, not here.

---

## Current state — 2026-09-09

**Core is complete.** Phases 1–3 closed. Every module A–G built and verified in
Chrome against the live backend. Metrics 2 and 3 now have numbers over a corpus
that was not written to flatter them.

| Measure | Value |
|---|---|
| Client tests | 237 |
| Reasoner checks | 82 |
| Prompt checks | 35 |
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

**Two systematic gaps the bigger corpus found**, recorded rather than fixed —
fixing detectors against a corpus in the same session is how a benchmark
becomes a target:

1. Amounts, in both directions. A balance or income in prose passes untouched;
   the same figure in a form field is hidden by default-to-hide.
2. Prose generally. Names, addresses and dates of birth in sentences are missed
   everywhere, and that is most of what a bill or a statement contains.

**The caveat that matters most:** the corpus contains **no real page**. Every
one was written here, and a measurement against our own description of a page
proves less than one against somebody else's. The runner prints that line on
every run for as long as it is true.

---

## Next session starts with

**Finishing T1.1: the real-page share.** The capture path exists and nothing has
been driven through it. Load the extension with `SHIELD_DEV=1`, open the capture
panel on logged-out or synthetic-data pages, save the maps into
`extension/benchmark/captured/`, add `about` and `sensitive` by hand, and re-run
`npm run benchmark`. An unlabelled file is skipped and named, never scored.
Expect the numbers to move again; that is the corpus working.

Face pixel truth is the other open half, and it needs a recorded Chrome run —
the boxes cannot be committed because `face-a.jpg` and `face-b.png` are not.

Then T1.2, the local screen-understanding model — 25% of the score and the
capability the problem statement is named after.

**Uncommitted:** everything from the previous session (the benchmark instrument,
`docs/BENCHMARK.md`, the TASKS.md rewrite, DECISIONS 164–168, the `benchmark`
npm script) plus this session's work — the identifier fix and its tests, the
element-map export and its tests, `benchmark/pages/`, `benchmark/pixels.ts`,
the rewritten `benchmark/corpus.ts`, `tests/corpus.test.ts`, the `scorePixels`
path, the `__SHIELD_DEV__` build define, the popup capture panel, and the
tsconfig/TASKS/DECISIONS/SESSION_LOG edits. Do not commit until explicitly told
to, and use the identity given at that time.

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
9. **A measuring instrument flatters itself unless tested.** The first scorer
   averaged per-page ratios and dropped pages that scored zero, so total failure
   on a page raised the corpus score. It was caught by a test written against
   the scorer, not against the detector. A benchmark nobody has checked is worse
   than none, because its output looks like evidence.
