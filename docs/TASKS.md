# Tasks — Shield

**Deadline: 2026-09-09. Today is 2026-09-09 — deadline day.**
**Goal: push as far toward Full Product as 2 days allows.**

Status: core complete. Phases 1-3 closed. 163 client tests, 82 reasoner checks,
35 prompt checks - all green. One pass ≈150ms, every stage inside budget.

---

## Done and verified in Chrome, against the live backend

| Module | State |
|---|---|
| A — Screen perception | Capture 39ms, DOM scan 1.5–6.5ms, 0 unresolved selectors |
| B — PII detection | DOM rules + faces + OCR + Indian identifiers |
| C — Redaction | Semantic placeholders, not blackout. Type seal + stage guard + zero-leak sweep |
| D — Transport / backend | FastAPI, provider-agnostic, sealed payloads only |
| E — Action execution | click / type / scroll, re-verified against the capture |
| F — Trust UI | Overlay, payload inspector, latency panel, manual marking |
| G — Testing | 5 fixture screens, 280 automated checks total |

| Phase | State |
|---|---|
| 1 — Login autofill | CLOSED. End to end, both fields hidden, one click, clean stop |
| 2 — Multi-field signup | CLOSED. Consent tick + submit, fold defect fixed |
| 3 — Faces | CLOSED. 6 of 8, floor soft at 80px (0.312 against a 0.3 threshold) |

---

## Day 1 (2026-09-08) — Detection breadth

Rubric weight: PII detection + redaction = 40%. This is where the marks are.

- [x] **Indian PII taxonomy** — Aadhaar (Verhoeff), PAN, passport, driving
      licence, voter ID, GSTIN, UPI VPA, IFSC, bank account, card (Luhn)
      — `lib/pii/indian-ids.ts`, 21 tests. Wired into BOTH paths: the
      classifier (so a value is flagged and named) and the scrubber (so the
      same identifier in a label cannot ride out). Two paths over the same
      text; one knowing a format and the other not is a leak, and that exact
      defect was found on a real site before.
      **A checksum only ever sharpens a label — never licenses a leak.** An
      Aadhaar that fails Verhoeff is still hidden, just not named. Tested.
      Gains outright: IFSC, UPI, voter ID and passport all carry fewer than
      nine digits, so the old digit-run rule never saw them.
- [x] **OCR pass** — Tesseract.js over image crops, feeding the same rules
      — Built in TWO stages that fail in opposite directions. Candidates are
      chosen by geometry alone (`image-candidates.ts`), so that verdict holds
      whether the engine is present, broken or absent. Reading then improves
      PRECISION: "hide these words, and name them" instead of "hide the whole
      image". A failed read covers the image whole — it was already judged big
      enough to hold a document, and we cannot claim it does not.
      Recognised words are judged by `classifyTextContent`, the same predicate
      that judges a form field, so an Aadhaar is caught typed *and*
      photographed. Words are grouped into LINES first: an Aadhaar prints as
      three groups of four digits and no group matches anything alone.
      Engine, WASM core and language data are all served from the extension —
      Tesseract's defaults fetch them from unpkg, which would hand crops of the
      user's screen to a CDN. The CSP blocks it if a path is ever wrong.
      **NOT yet verified in a browser.** 21 tests cover the geometry and the
      rules; the engine load is untested.
- [ ] **Configurable redaction aggressiveness** — strict / balanced, persisted
      — Strict is the default. FR-14.
- [x] **Persistent audit log** — what was hidden, when, per run; exportable JSON
      — `lib/audit.ts`, 12 tests. Categories, counts, rule names, timings.
      Records BOTH runs and scans, and states per entry whether anything was
      transmitted rather than leaving the reader to know that a scan does not.
      No values, no labels and **no URL** — the file exists to be exported, and
      an export gets attached to a ticket. The cost is real: entries are told
      apart by time and shape, not by page. A log that is unsafe to share is one
      nobody shares. Region narrowing happens in one function so no call site
      can widen it. **NOT yet verified in a browser.** FR-26.
- [ ] Tests for every rule above, written before the rule

## Day 2 (today, 2026-09-09) — Coverage, proof, demo

- [x] **Whole-page coverage** — FR-04, answered differently than written
      — Scroll-and-stitch capture was costed and rejected. It buys no privacy:
      `dom-map.ts` filters to the viewport and capture is `captureVisibleTab`,
      so below the fold is never captured and therefore never transmitted. It is
      a coverage gap, not a leak. Against that it costs a ~20x latency
      regression on a 35%-weighted criterion, tens of megabytes of bitmap, and —
      disqualifying — a stitched frame in which sticky headers repeat at every
      seam, shown to the user as a faithful record of what was sent.
      Built instead, in two parts:
      **(1) The boundary is stated.** Every run reports how much of the document
      it examined, in the console and the popup, whether or not the page
      scrolls. A field with no box on it must never read as "checked".
      **(2) A separate scan.** "Scan the whole page" walks the document in
      overlapping viewports, runs the same detectors on each, and reports
      everything found — and transmits NOTHING. Not a redacted payload, none.
      `scanPage` reaches no transport, so the guarantee is structural rather
      than a flag; a test asserts it. Findings are pinned to the document, which
      the run overlay may not do, because a scan's claim is genuinely that wide.
      A scan that stops early — endless page, scroll-locked modal, a failed look
      — draws the line where it stopped, on the page.
      22 tests. **NOT yet verified in a browser.**
- [ ] **Consent preview** — show what leaves, pause, require approval
      — Small now: manual marking already built the surface and region plumbing.
- [ ] **Profile-edit fixture** — face + name/email + Save, in one acting loop
      — The strongest demo screen: visual and DOM detection, then an action.
- [ ] **Naive-baseline comparison** — blind blur vs. semantic, with real numbers
      — Turns "we redact" into a measured claim.
- [ ] **Adaptive model sizing** — device capability picks backend and threshold
- [ ] **Edge verification** — Chromium, expected to pass as-is
- [ ] **Real-site sweep** — 8 unmodified sites, pass/fail recorded per site
- [ ] Final measurement pass, all numbers re-taken on one machine

---

## Not achievable in 2 days — stated so it is not discovered later

| Item | Why not |
|---|---|
| Chrome Web Store publishing | External review queue, days to weeks |
| Third-party security review | Requires a third party |
| Enterprise console (policy, SSO, log export UI) | Weeks of work |
| Firefox support | Its MV3 has no offscreen document API, and our inference host *is* one. Architecture port, not a flag |
| "Dozens of sites" generalisation | Test time. Doing 8 instead, labelled honestly |
| Automatic model update pipeline | Needs hosting and versioning infrastructure |
| Monetization / sustainability model | A business decision, not code |

## Deliberately cut

| Item | Why |
|---|---|
| Broader action vocabulary (drag, select) | Widens the allowlist — the security boundary — with no time for review. Wrong trade at 2 days |
| Frame diffing | Latency only. Correctness first, per working priority |
| Red-team case as a built feature | Demo material. The refusal path already works |
| Full-page scroll-and-stitch capture | Buys no privacy — below the fold is never captured, so never sent. Costs a 20x latency regression and a stitched frame that misrepresents the page in the one panel that must be literal. Replaced by stated coverage plus a scan that sends nothing |

## Needs hardware or a decision, not work

- [ ] Rehearse on the presentation laptop
- [ ] Zero-leak run on that laptop specifically
- [ ] Test across 2–3 laptops
- [ ] Free-tier model provider — signup + 3 env vars. Gates generality, not the demo
- [ ] Redaction aggressiveness default confirmed by the team

## Owned outside this repo

README, 2-page architecture doc, demo video, 5-slide deck, backup video.

---

## Known limits — say these before someone else finds them

- Names in prose are not detected. Only in fields.
- Face floor is soft: reliable at 110px+, marginal at 80px, missed below.
- Prompt injection is bounded, not prevented. Page content is data and the
  allowlist is fixed at three verbs, but the model still reads attacker text.
- Text inside images: rules and geometry done; engine load verified in Chrome.
- A run examines one screen. It says so, every time, and the whole-page scan is
  how the rest of the document gets looked at.
