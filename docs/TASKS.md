# Tasks — Shield

**SIH26171 (ISRO): On-device Visual Perception for Light-weight Browser Agents.**
**No deadline. Goal: full compliance with the problem statement, no compromise.**

Read this file first, every session. It is the only source of truth for what is
next.

---

## The five metrics, and where we actually stand

| # | Metric | Weight | State |
|---|---|---|---|
| 1 | Accuracy of visual context from screen | 25% | Pixel text regions built; **agreement rate not yet measured on a real page** |
| 2 | Recall & precision of PII detection | 20% | **Measured.** 81.3% / 83.0% over 38 pages |
| 3 | Precision of redaction | 20% | **Measured.** 83.4% precision, 56.5% coverage |
| 4 | Client-side resource utilization | 20% | **Unmeasured.** Latency only |
| 5 | End-to-end task latency | 15% | Measured, ~150ms/pass, inside budget |

Two facts follow from this table and drive everything below.

**Metrics 2 and 3 now have numbers; metric 1 still does not.** The corpus that
produced them was written entirely by this project, which the report says on
every run — a measurement against our own description of a page is worth less
than one against somebody else's page, and that gap is the remaining work in
T1.1.

**The PS is named after our weakest component.** "On-device Visual Perception."
Our screen understanding is the DOM scanner; the vision model is a 1.1MB face
detector plus OCR on image crops. That is defensible engineering and an
indefensible answer to metric 1.

---

## What is done, and verified in Chrome

| Component | State |
|---|---|
| Screen capture | `captureVisibleTab`, JPEG q90, 24–41ms |
| DOM element map | 300-element cap, viewport-filtered, 0 unresolved selectors, 1.5–6.5ms |
| Face detection | UltraFace RFB-320, ONNX Runtime Web, WebGPU + WASM fallback, 28–44ms |
| OCR | Tesseract.js on image crops, all assets served from the extension |
| Indian identifiers | Aadhaar (Verhoeff), PAN, passport, DL, voter ID, GSTIN, UPI, IFSC, bank, card (Luhn) |
| Redaction | Semantic placeholders + opaque fill. Type seal + stage guard + zero-leak sweep |
| Transport | FastAPI, provider-agnostic, sealed payloads only |
| Action execution | click / type / scroll, re-verified against the capture |
| Trust UI | Overlay, payload inspector, latency panel, manual marking, audit log |
| Whole-page scan | Walks the document, transmits nothing, findings carried into runs |
| Scan record | Redacted picture of every screen examined, kept local |
| Tests | 265 client, 82 reasoner, 35 prompt |

Phases 1–3 (login autofill, multi-field signup, faces) are closed.

---

## Tier 1 — score-critical

### T1.1 PII + redaction benchmark, with numbers
**Metrics 2 and 3 — 40%. Do this FIRST.**

Not more tests. A measuring instrument.

- [x] **Scorer** — `lib/benchmark/score.ts`, 16 tests. Recall, precision, F1
      per category; coverage, redaction precision and area ratio for metric 3.
      Misses named individually, over-flags counted — the two failures are not
      equivalent and are not reported as if they were.
- [x] **Report generated, never hand-written** — `npm run benchmark` rewrites
      `docs/BENCHMARK.md`. A hand-copied figure is one refactor from being a lie.
- [x] **Baseline captured**, before any detector change:
      **recall 89.5%, precision 94.4%, F1 91.9%, category accuracy 94.1%,
      redaction precision 94.5%, coverage 87.6%.** 19 labelled elements, 4 pages.
      Misses: `t4` (name in prose), `t6` (ID inside an image). Both known
      structural limits, labelled anyway because they are sensitive.
- [x] **A way to capture real pages** — dev-only element-map export, gated on
      `SHIELD_DEV=1` and on the operator reading every value before a file
      exists. This, not the labelling, was the blocker on corpus growth.
- [x] **Grow the corpus to ≥30 pages.** Now **38 pages, 150 labelled
      elements** — Indian government, banking, telecom, health, insurance,
      employment and commerce, plus seven pages where the correct answer is
      nothing.
- [x] **Pixel ground truth** for OCR — boxes on the two committed sample ID
      cards, in the document's own pixels, scored through a new `scorePixels`
      path that takes regions with no element.
- [ ] **A real-page share.** Still **zero**. Every page was written here, and
      the runner prints that on every run for as long as it is true. The
      capture path exists; nobody has driven a browser through it yet.
- [ ] **Face pixel truth.** Not committed and not invented: the boxes would
      describe `face-a.jpg` and `face-b.png`, which are deliberately absent
      from this repository. Needs a recorded Chrome run.

**Baseline moved, and the movement is the point:**

| Measure | 4 pages / 19 labels | 38 pages / 150 labels |
|---|---|---|
| Recall | 89.5% | **81.3%** |
| Precision | 94.4% | **83.0%** |
| F1 | 91.9% | **82.2%** |
| Category accuracy | 94.1% | **88.5%** |
| Redaction coverage | 87.6% | **56.5%** |
| Redaction precision | 94.5% | **83.4%** |
| Misses / over-flags | 2 / 1 | **28 / 25** |

Nothing was tuned. The old figures described four pages, three of which were
written to exercise this code; the new ones describe a corpus that was not.

**Pixel layer, first numbers:** 2 documents, 11 labelled regions, recall 27.3%,
precision 100%, coverage 40.9%, redaction precision 64.3%. The identifiers on a
scanned card are found; the name, address and date of birth beside them are not.
This measures everything *after* the recognition engine, not the engine.

**Two systematic gaps the bigger corpus found:**

1. **Amounts, in both directions.** A balance, premium or income rendered as
   text passes untouched; the same quantity in a form field is hidden by the
   default-to-hide rule. Too loose and too tight about the same data,
   depending only on how the page renders it.
2. **Prose.** A name, address or date of birth in a sentence is missed
   everywhere — and that is most of what a bill, a statement or a search
   result is made of.

Neither is fixed here. T1.1 is the instrument, and fixing detectors against a
corpus in the same session is how a benchmark becomes a target.

**Done when:** a real-page share exists and faces are measured in pixels.

**Why first:** it is 40% of the score, and it is the only way to prove T1.2
helped rather than assert it.

### T1.2 Local screen-understanding model
**Metric 1 — 25%. The PS's namesake capability.**

Scope amended — DECISIONS.md 185. Text regions from the whole frame, **not**
generic icon detection. The DOM maps a form in under 4ms and stays primary;
what it cannot do at all is read a canvas, an iframe or a pasted screenshot.

- [x] **Candidates evaluated, choice recorded** — DECISIONS.md 185–188.
      OmniParser `icon_detect` rejected on **licence**: it is a YOLOv8
      fine-tune carrying AGPL-3.0 from Ultralytics, and it is the one part of
      that pipeline you cannot skip. Its MIT replacement is a YOLOv9-**E**,
      published in an unmerged PR with no ONNX export and far past a 1.1MB
      budget. Small VLMs (SmolVLM-256M, Florence-2) rejected on **output
      shape** before size: they emit text, and an element map needs boxes.
- [x] **Runs in the offscreen document** — `READ_SCREEN` reads the whole frame
      through the Tesseract path already there. No new model, no new licence,
      no new weight. Not WebGPU: this path is WASM and always was.
- [x] **Pixel-derived element map** — `lib/vision/screen-text.ts`. Words to
      lines to text regions, in viewport CSS pixels, in reading order.
- [x] **The comparison, which is the metric-1 evidence** —
      `lib/vision/agreement.ts`. Agreed / pixel-only / dom-only, matched on
      position **and** text because either alone is wrong. 24 tests.
- [x] **DOM stays primary.** Only pixel-only text becomes a new finding;
      anything both readers saw was already `detectDomPii`'s.
- [ ] **Run it on ≥10 real pages and record the agreement rate.** The
      machinery is built and has never seen a real screen. Needs a browser.
- [ ] **Decide whether the frame needs upscaling.** Read at native resolution
      today; 16px body text is marginal for the engine at that size. The
      dom-only column is about to say how much that costs, so the threshold is
      set from a measurement rather than a guess.

**Done when:** the agreement rate against the DOM map is recorded on ≥10 real
pages, and canvas/iframe text is shown being hidden on a page where the DOM
sees nothing.

### T1.3 Open-weights server model, vision path on
**Explicit PS requirement.**

- [ ] Pin an open-weights VLM (Llama Vision / Qwen-VL class), cloud-hosted for
      SIH, and record the choice
- [ ] `SHIELD_MODEL_VISION` on by default — the PS is about *visual* context
      reaching the server; today the frame is often not sent at all
- [ ] Document the offline deployment path (vLLM or Ollama, same weights).
      The PS says "offline deployable"; that has to be more than a claim
- [ ] Verify the redacted frame is actually used in the model's reasoning

**Done when:** the demo runs on an open-weights VLM that receives the redacted
frame, and the offline path is documented and tried once.

---

## Tier 2 — explicitly required

### T2.1 Firefox
**The PS names it: "popular browsers (chrome, Firefox)".**

- [ ] Verify whether Firefox MV3 event pages have DOM access — if so the
      offscreen document is unnecessary there and this is *simpler*, not harder
- [ ] Verify WebGPU availability and the WASM fallback path in Firefox
- [ ] Port, then run the full fixture set on both browsers
- [ ] Record what differs in DECISIONS.md

**Done when:** the login and signup demos pass on Firefox and Chrome.

### T2.2 Resource measurement
**Metric 4 — 20%, currently unmeasured.**

- [ ] Peak and steady CPU, GPU and memory during a run and during a scan
- [ ] Model load cost, session memory, offscreen document footprint
- [ ] Measured on ≥2 machines, one without a discrete GPU
- [ ] Recorded as a table, not an impression

**Done when:** we can answer "what does this cost the laptop?" with figures.

### T2.3 Generalisation sweep
**"Use cases for evaluation will be provided during finale" — the pages are unknown.**

- [ ] ≥20 real, unmodified sites. Pass/fail and failure mode recorded per site
- [ ] Confirm no fixture-specific code path exists anywhere
- [ ] At least 3 task types beyond login (search, form fill, navigation)
- [ ] Every failure either fixed or written down as a known limit

**Done when:** the sweep is repeatable and its results are in the repo.

---

## Tier 3 — makes the case

- [ ] **Latency/accuracy trade-off study.** The PS asks for the balance
      explicitly. Threshold vs recall vs milliseconds, as a curve
- [ ] **Naive-baseline comparison.** Blind blur vs semantic redaction, measured
      — turns "we redact" into a number
- [ ] **Scan speed.** OCR re-reads the same image at every stop; skip already-read
      candidates and clipped ones. Should roughly halve scan time
- [ ] **Scan latency instrumentation.** "Where did the time go?" is blank for
      scans — the scan path records no stage timings
- [ ] **Consent preview.** Show what leaves, pause, require approval
- [ ] **Profile-edit fixture.** Face + name/email + Save, in one acting loop
- [ ] **Configurable redaction aggressiveness.** FR-14. Strict default
- [ ] Edge verification (Chromium, expected to pass as-is)

---

## Known limits — say these before someone else finds them

- Names in prose are not detected. Only in fields. The same is true of
  addresses and dates of birth, which is most of what a bill or a statement is.
- Amounts are missed as text and hidden as fields. A balance in a sentence
  passes; the same figure in a box is covered by the default-to-hide rule.
- Face floor is soft: reliable at 110px+, marginal at 80px (0.312 against a 0.3
  threshold), missed below.
- Prompt injection is bounded, not prevented. Page content is data and the
  allowlist is fixed at three verbs, but the model still reads attacker text.
- A scan's findings are a claim as of when it ran. A page that reflows will
  drift; drift over-redacts, which is the safe direction, not a guarantee.
- A run examines one screen and says so. The scan is how the rest is covered.

---

## Out of scope

| Item | Why |
|---|---|
| Chrome Web Store publishing | External review queue; not needed to demonstrate |
| Third-party security review | Requires a third party |
| Enterprise console (policy, SSO, log export UI) | Not in the PS |
| Mobile | Explicit non-goal |
| Model training | PS requires inference only |
| Broader action vocabulary (drag, select) | Widens the security boundary; only with review |

---

## Session protocol

Start: read this file, then the last SESSION_LOG.md entry, then DECISIONS.md.
State in one line what you are about to work on.

During: one unblocked item at a time. Tick it the moment it is done, never in
batches. Any decision not already in the docs goes to DECISIONS.md with its
reason before moving on.

End: append to SESSION_LOG.md — what was done, blockers, exactly what the next
session starts with.
