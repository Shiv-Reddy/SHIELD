# Tasks — Shield

**Deadline: 2026-09-09. Today is 2026-09-08 — one day left.**
**Goal: push as far toward Full Product as 2 days allows.**

Status: core complete. Phases 1–3 closed. 73 client tests, 82 reasoner checks,
35 prompt checks — all green. One pass ≈150ms, every stage inside budget.

---

## Done and verified in Chrome, against the live backend

| Module | State |
|---|---|
| A — Screen perception | Capture 39ms, DOM scan 1.5–6.5ms, 0 unresolved selectors |
| B — PII detection | DOM rules + faces. OCR is the one gap |
| C — Redaction | Semantic placeholders, not blackout. Type seal + stage guard + zero-leak sweep |
| D — Transport / backend | FastAPI, provider-agnostic, sealed payloads only |
| E — Action execution | click / type / scroll, re-verified against the capture |
| F — Trust UI | Overlay, payload inspector, latency panel, manual marking |
| G — Testing | 5 fixture screens, 190 automated checks total |

| Phase | State |
|---|---|
| 1 — Login autofill | CLOSED. End to end, both fields hidden, one click, clean stop |
| 2 — Multi-field signup | CLOSED. Consent tick + submit, fold defect fixed |
| 3 — Faces | CLOSED. 6 of 8, floor soft at 80px (0.312 against a 0.3 threshold) |

---

## Day 1 (today, 2026-09-08) — Detection breadth

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
- [ ] **OCR pass** — Tesseract.js over image crops, feeding the same rules
      — Closes the largest known gap: text inside images is invisible today.
- [ ] **Configurable redaction aggressiveness** — strict / balanced, persisted
      — Strict is the default. FR-14.
- [ ] **Persistent audit log** — what was hidden, when, per run; exportable JSON
      — Never values. Categories, counts, timestamps, rule names only. FR-26.
- [ ] Tests for every rule above, written before the rule

## Day 2 (2026-09-09) — Coverage, proof, demo

- [ ] **Off-screen capture** — scroll, capture, stitch; redact the whole page
      — FR-04. Highest-risk item here. Cut it first if Day 1 slips.
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
- Text inside images: closing on Day 1, not closed yet.
