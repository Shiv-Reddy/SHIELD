# Session Log — Shield

Where work stopped and what starts next. Read the **Current state** and
**Next session starts with** sections first; the timeline is history.

Reasoning behind choices lives in docs/DECISIONS.md, not here.

---

## Current state — 2026-09-09

**Core is complete.** Phases 1–3 closed. Every module A–G built and verified in
Chrome against the live backend.

| Measure | Value |
|---|---|
| Client tests | 163 |
| Reasoner checks | 82 |
| Prompt checks | 35 |
| One full pass | ≈150ms, every stage inside budget |
| Capture / DOM / inference / redaction | 39ms / 1.5–6.5ms / 40–49ms / 37–75ms |
| Face detection | 6 of 8; reliable 110px+, marginal at 80px (0.312 vs 0.3) |

**Working, end to end:** login autofill, multi-field signup, face redaction,
manual marking, payload inspector, latency panel, observe-only mode, CPU
fallback (self-proved), zero-leak sweep, type seal, stage-order guard, Indian
identifier taxonomy, OCR over image crops.

**Verified in Chrome:** the whole-page scan finds the Aadhaar and PAN on the
second look without anyone scrolling first, reaches the true bottom, and
transmits nothing.

**Built, not yet verified in Chrome:** the audit log panel and its export; the
clipped-image reporting; the reworded coverage line.

**Open gaps:** names in prose, consent preview, configurable aggressiveness,
adaptive model sizing, the 8-site sweep.

---

## Next session starts with

**Verifying the audit log in Chrome** — the panel lists passes, the export
downloads and contains no page content, Clear empties it. Then repeat the same
scan twice and confirm it now reports the same thing both times.

Then the remaining Day 2 items in docs/TASKS.md — consent preview and the
profile-edit fixture are the two that add most to the demo.

Nothing is uncommitted. Do not commit until explicitly told to.

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
