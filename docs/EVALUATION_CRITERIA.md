# Evaluation Criteria — Shield (SIH26171)

Official weighted scoring, as published in the problem statement. Use this to
prioritize engineering effort — build order and polish time should follow
these weights, not gut feeling.

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
