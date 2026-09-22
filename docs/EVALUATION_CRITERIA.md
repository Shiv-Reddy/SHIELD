# Evaluation Criteria — Shield

The weighted scoring this project is measured against. Use it to prioritize
engineering effort — build order and polish time should follow these weights,
not gut feeling.

The weights are not ours to move. They were fixed before the numbers existed,
which is the only way a rubric can tell you anything you did not already want
to hear.

| Metric | Weight | What "good" looks like |
|---|---|---|
| Accuracy of visual context extraction from screen | 25% | Local model correctly identifies on-screen elements, text regions, and UI structure across varied real webpages, not just one hardcoded page |
| Recall & precision of sensitive/PII detection | 20% | Passwords, faces, personal fields reliably flagged — few missed items (false negatives) and few over-flagged items (false positives) |
| Precision of redaction | 20% | Redaction tightly covers sensitive regions only, not blanket-blurring the whole screen |
| Client-side resource utilization | 20% | Runs smoothly on a normal laptop, no freezing, no excessive CPU/GPU spikes |
| End-to-end task latency | 15% | Full loop (capture → redact → send → reason → act) completes in a few seconds |

## What This Means for Build Priority

1. **Screen understanding accuracy (25%) and PII detection + redaction
   combined (40%) are 65% of your score.** These should get the most testing
   time, not just the most initial build time.
2. **Resource usage and latency combined are 35%.** Don't treat performance
   optimization as a last-minute pass — budget real time for it (see
   ARCHITECTURE.md's latency budget table).
3. **A working demo across more than one task type strengthens the accuracy
   score**, since it proves the system generalizes rather than being
   hardcoded to one page.
4. **When in doubt, hide it.** A missed PII item (false negative) is a worse
   failure than an over-redacted safe item (false positive) — the rubric
   rewards recall on sensitive-data detection specifically.

## Where we stand, and what we stop at

Measured to 2026-09-20. Read with the rules below, never as bare
percentages. Reasoning: DECISIONS.md 223–226.

| # | Metric | Now | Target | Ceiling |
|---|---|---|---|---|
| 1 | Visual context | **agreement 18.4%, DOM coverage 22.2%, pooled over 10 pages.** Range 8.5–37.4% | coverage 60–70% — set against a baseline that has since fallen from 31.6% to 22.2% | — |
| 2 | PII recall / precision | 83.5% / 83.5%, 50 pages | recall 90–95% at precision 78–82% | recall ~97% |
| 3 | Redaction precision / coverage | 83.9% / 60.4% | 80%+ / 85%+ | coverage ~95% |
| 4 | Resource | Chrome only, scan peak ~285MB | the same figures on Firefox and a 2nd machine | near max |
| 5 | Latency | Chrome ~150ms, Firefox 364ms warm | hold | done |

**Rule 1 — metric 1 is not maximised at 100%.** Agreement counts text the DOM
reader and the pixel reader both saw. Total agreement would make the vision
layer redundant; pixel-only findings — image, canvas, scanned text — are the
layer earning its place. Only the markup-only row is failure: text the engine
looked straight at and could not read. So the number driven is **DOM coverage**
(agreed ÷ DOM items, 18 of 57).

**Rule 1b — quote the pooled figure over ten pages, never a single page's.**
Per-page DOM coverage runs 8.5% (a Devanagari portal) to 37.4% (a dark
monospace page) — a 4.4x spread, more than ten times the noise floor below.
Pooled is 22.2% and the median is 21.6%, which is why the pooled figure is the
one that gets quoted (DECISIONS.md 236). **And a pixel-only count taken on a
non-Latin page is not evidence at all** — only `eng.traineddata` ships, so
those regions are Latin-shaped guesses at Devanagari glyphs (237).

**Rule 1a — a one-page figure carries about three points of noise.** The same
page was read twice on 2026-09-20 with only the capture encoding changed, and
that change's effect at the first stop was measurably zero — identical counts,
item for item. Coverage still moved 31.6% → 28.1% (DECISIONS.md 230). Any claim
that metric 1 improved has to clear that spread, which is why ≥10 pages is part
of the target and not a nicety. It is also why the 2.0x upscale's four points
(DECISIONS.md 212) are quoted as a single reading, not as a rate.

**Rule 2 — redaction coverage is never quoted alone.** A blanket blur scores
100% coverage at near-zero precision. **That is now measured rather than
asserted** (DECISIONS.md 232, and the table in docs/BENCHMARK.md): on this
corpus, blanket blur takes 100% recall and 100% coverage at 32.9% redaction
precision, painting 3.04x the area needed and destroying 891 of 891
non-sensitive elements. Hide-every-value takes 94.1% recall — better than
Shield's 83.5% — at 28.8% precision and 55.6% of the page left readable.
Shield is the only strategy above 80% on recall, precision and redaction
precision at once, keeping 96.9% of the page usable. The pair is the claim,
and `Context kept` is the column that decides it.

**Where the points are.** Metrics 1, 2 and 3 are 65% combined and share one
root cause: unstructured text and photographed documents. The pixel layer
scores recall 27.3% at precision 100% there — it never invents findings, it
only misses them. Pure recall, no precision debt, so one fix lifts all three.

These are our instruments, not the judges'. The defensible position is not a
large percentage — it is a number, the corpus it came from, and what moved it.

## Self-Check Before Demo Day

- [ ] Have we tested screen understanding on at least 3 different real pages,
      not just our one demo page?
- [ ] Have we tested PII detection against a deliberately tricky sample (e.g.
      a password field with an unusual label, a partially visible face)?
- [ ] Have we measured actual latency end-to-end, not just "it feels fast"?
- [ ] Have we tested on more than one laptop to check resource usage isn't
      laptop-specific?
- [ ] Can we show, live, that redaction is precise (not over-covering) using
      the explainable redaction overlay?
