# Tasks — Shield

**On-device visual perception for light-weight browser agents. Team Anarchy.**
**Goal: a product that is fully built and deployable, not a demo shell.**

Read this file first, every session. It is the only source of truth for what is
next.

---

## The five metrics, and where we actually stand

| # | Metric | Weight | State |
|---|---|---|---|
| 1 | Accuracy of visual context from screen | 25% | **Measured on ten pages. Pooled DOM coverage 22.2%, agreement 18.4%** — 762 agreed, 709 pixel-only, 2678 markup-only (DECISIONS.md 236). The one page it used to rest on said 31.6%, so **that was flattering by nine points**. Per page 8.5%–37.4%, a **4.4x spread**, median 21.6%. The number driven is DOM coverage, never agreement alone (223) |
| 2 | Recall & precision of PII detection | 20% | **Measured.** 83.5% / 83.5% over 50 pages, 12 of them real |
| 3 | Precision of redaction | 20% | **Measured.** 83.9% precision, 60.4% coverage |
| 4 | Client-side resource utilization | 20% | **Measured on both browsers, one machine.** Chrome scan peak 250-287MB, run peak ~144MB. Firefox 65MB idle, 415MB scan peak, **back to 60MB on its own**. **CPU during a scan is 87-93% on Chrome and 75-97% on Firefox** — the ≤1.1% in the table until 2026-09-22 was a sampling error, not a measurement (DECISIONS.md 266). Five scans back to back do not climb — not a leak. Chrome's settled-after figure is the one gap left |
| 5 | End-to-end task latency | 15% | **Measured on both browsers.** Chrome ~150ms/pass; Firefox warm 253-259ms inference across three runs 2026-09-22, consistent with the 228ms recorded before. **Cold start is worse than recorded: 16.7s and 17.0s model init on two separate 2026-09-22 sessions, against ~10s on 2026-09-17**, shader warm-up alone accounting for 16.0s and 16.3s. The two new readings agree closely with each other and not with the old one, so **~17s is the figure and ~10s should not be quoted again.** Warm is inside budget on both |

**Metric 1 rests on one page.** 25% of the score, one data point. A page is a
data point, not a rate.

**Metrics 1, 2 and 3 are 65% combined and share one root cause** — unstructured
text and photographed documents. The pixel layer scores recall 27.3% at
precision 100% there: it never invents findings, it only misses them. Pure
recall, no precision debt, so better recognition lifts all three at once.

**The PS is named after our weakest component.** "On-device Visual Perception."
Our screen understanding is the DOM scanner; the vision model is a 1.1MB face
detector plus OCR on image crops. That is defensible engineering and an
indefensible answer to metric 1.

### Targets — what we drive to, and where we stop

Reasoning and the two reading rules: docs/EVALUATION_CRITERIA.md.

| # | Now | Target | Ceiling |
|---|---|---|---|
| 1 | **DOM coverage 22.2% pooled over 10 pages** (agreement 18.4%), range 8.5–37.4% | coverage 60–70%. **Set against a 31.6% baseline that has since fallen to 22.2%** — further away than it looked (236) | — |
| 2 | recall 83.5% / precision 83.5% | **recall 90–95% at precision 78–82%** | recall ~97% |
| 3 | coverage 60.4% / precision 83.9% | coverage 85%+ / precision 80%+ | coverage ~95% |
| 4 | Chrome, one machine | complete the table | near max already |
| 5 | Chrome ~150ms, Firefox 364ms | hold | done |

Metric 2 trades precision for recall deliberately (DECISIONS.md 224). Metric 3
coverage is never quoted alone (225). Metrics 4 and 5 are finished as
engineering — what is owed there is evidence, not performance (226).

### Top three by impact

1. **Whole-frame recognition** (T1.2). Now the only lever left. Resolution was
   tried (212, four points), encoding was tried (230, zero), and ten pages put
   the real baseline at 22.2% rather than 31.6% (236). It is also 49–90% of a
   scan's wall-clock (237), so one component is both the cost and the ceiling.
2. **The generalisation sweep, 0 of 4** (T2.3). The largest untouched block,
   and the one that answers "does it work on a page nobody pointed it at".
3. **Firefox resource figures** (T2.2). Metric 4 is 20% and Firefox is
   unmeasured. It also gates the disposal window — a 10s rebuild is only worth
   avoiding if the resident session turns out cheap.

**Steps for every one of these, and what to bring back, are in
docs/OPERATOR_RUNBOOK.md.** This file says what and why; that one says how.

All three need a human at a browser. The PNG scan capture, scan speed and scan
latency instrumentation are **built** (DECISIONS.md 227–229) and all three now
owe a measurement that needs one. **Startable without a browser:** the
naive-baseline comparison and the latency/accuracy trade-off study (Tier 3).

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
| Trust UI | Overlay, payload inspector (with the frame that was sent), latency panel, manual marking, audit log |
| Whole-page scan | Walks the document, transmits nothing, findings carried into runs |
| Scan record | Redacted picture of every screen examined, kept local |
| Tests | 357 client, 82 reasoner, 53 prompt |
| Benchmark corpus | 50 pages, 170 labels — 32 synthetic, **12 real**, 6 fixture |

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
- [x] **A real-page share.** **12 of 50 pages** are now captured from sites
      nobody here wrote - income tax, UIDAI, EPFO, GST, Parivahan, SBI, HDFC,
      Axis, HDFC Life, Jio, plus Wikipedia and Hacker News as controls. All 20
      labels on them were found and both controls stayed clean. Read
      DECISIONS.md 200 before quoting that: the pages are real, the labels are
      ours, and logged-out login forms are the easy case.
- [ ] **Face pixel truth.** Not committed and not invented: the boxes would
      describe `face-a.jpg` and `face-b.png`, which are deliberately absent
      from this repository. Needs a recorded Chrome run.

**Baseline moved, and the movement is the point:**

| Measure | 4 pages / 19 | 38 pages / 150 | 50 pages / 170, 12 real |
|---|---|---|---|
| Recall | 89.5% | 81.3% | **83.5%** |
| Precision | 94.4% | 83.0% | **83.5%** |
| F1 | 91.9% | 82.2% | **83.5%** |
| Category accuracy | 94.1% | 88.5% | **83.8%** |
| Redaction coverage | 87.6% | 56.5% | **60.4%** |
| Redaction precision | 94.5% | 83.4% | **83.9%** |
| Misses / over-flags | 2 / 1 | 28 / 25 | **28 / 28** |

The real pages raised recall and lowered category accuracy. Both are the same
fact: a logged-out login form is easy to *find* things on and easy to disagree
about the *kind* of thing found, and the disagreements are ours - a bank
username labelled `id_number` here and called something else by the detector.
No miss on this run comes from a real page; all 28 are still synthetic, which
is where the prose, the statements and the photographed documents are.

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
- [x] **First real-page agreement rate: 18.6%** — income-tax login, two stops,
      `16 agreed, 27 pixels only (0 hidden), 43 markup only`. The merge is
      demonstrably doing its job: per-stop those were 21 / 28 / 67, so it
      collapsed 5 duplicate agreements and 24 duplicate markup items that a
      summed figure would have counted twice.
- [x] **Nine more pages — done, and the number fell.** DECISIONS.md 236.
      Pooled over ten pages: **agreement 18.4%, DOM coverage 22.2%** — 762
      agreed, 709 pixel-only, 2678 markup-only. The single page said 31.6%, so
      **it was flattering by nine points**, which is SESSION_LOG lesson 7
      repeating. Per page the coverage runs **8.5% to 37.4%, a 4.4x spread**,
      median 21.6% — two aggregations landing a point apart, so the pooled
      figure is not an artefact of one huge page. Rows in
      docs/GENERALISATION.md §3.

      | Page | Agreement | DOM coverage |
      |---|---|---|
      | github.com/explore | 33.9% | **37.4%** |
      | w3schools iframe | 30.5% | 32.9% |
      | incometax login | 22.8% | 31.6% |
      | irctc train search | 21.5% | 29.2% |
      | sci.gov.in | 17.7% | 23.0% |
      | mygov.in (capped) | 15.0% | 20.3% |
      | apple.com/in | 15.0% | 18.6% |
      | google.com/maps | 5.6% | 13.3% |
      | nseindia live equity | 9.1% | 9.4% |
      | india.gov.in/hi | 4.0% | **8.5%** |

      Predictions scored 2 right, 2 wrong, 1 half. Dark low-contrast was
      predicted to hurt and is the **best** page; large display type was
      predicted to read near-perfectly and lands mid-table.
- [x] **PNG on the scan path: tried, measured, reverted.** DECISIONS.md 227,
      230. The hypothesis was 29's — JPEG ringing around glyph edges costs
      recognition — which 70 had only ever reverted on latency grounds.
      **The first stop came back identical to the JPEG run, item for item:
      12 agreed, 9 pixel-only, 35 markup-only, both times.** Lossless pixels
      change nothing this engine reads. PNG was not even expensive here
      (112–140KB, *smaller* than the JPEG it replaced, 54ms capture) — it is
      reverted because a scan holds every frame until the walk ends and 70's
      1511KB photo-heavy case is a metric-4 cost for a measured-zero benefit.
      `captureEncoding` stays, both branches equal on purpose.
- [x] **The after-measurement, stated against the before-figure.** Agreement
      22.8% → **20.3%**; DOM coverage 31.6% → **28.1%** (16 of 57). All of the
      movement is in the second stop; the first did not shift by one item.
      **So the real result is the noise floor of a one-page agreement figure:
      about three points** — the bar every future "metric 1 improved" claim has
      to clear. Resolution has been tried (212, four points) and encoding has
      been tried (zero). **Nothing further should be tried on the input; the
      remaining candidate is the recognition engine itself.**
- [x] **Upscale the frame before recognition — built.** DECISIONS.md 212.
      The measurement said so rather than intuition: of 59 text items the DOM
      reported, the engine read 16. **It missed roughly 73% of the text it was
      looking straight at**, which is the ceiling on everything this layer can
      contribute to metric 1. Native resolution was the suspected cause — 16px
      body text is marginal for Tesseract, reaching it at a capital height of
      about eleven pixels.
      The frame is now **doubled** before recognition, on the scan path only,
      which is the path that has budget for it (DECISIONS.md 188). The
      arithmetic and its 9-megapixel ceiling live in
      `lib/vision/recognition-scale.ts` — a pure module with 10 tests, rather
      than inside `ocr.ts`, which needs a browser and a 2.7MB engine to run at
      all. The ceiling bounds what is *added*: a frame already past it is read
      whole, never shrunk.
      **The 27 pixel-only regions are the other half of the story** and argue
      the layer earns its place: that is text on screen no markup describes.
- [x] **The after-measurement: 18.6% -> 22.8%.** Income-tax login, two stops,
      same page, build 2026-09-16 23:13:53, read at 2.0x (1920x945 ->
      3840x1890). Merged: `18 agreed, 22 pixels only (0 hidden), 39 markup
      only`; per-stop 12/9/35 and 10/15/27.
      **What moved, stated against the before-figure rather than alone.** DOM
      items matched went from **16 of 59** to **18 of 57** — 27.1% to 31.6% of
      what the markup reports. Markup-only, the text the engine was looking
      straight at and could not read, fell 43 -> 39. Pixel-only fell 27 -> 22.
      So the doubling bought about **four points of agreement**, which is real
      and smaller than hoped: the engine still misses roughly two thirds of the
      DOM's text, so resolution was *a* cause and not *the* cause, and a
      further factor should not be reached for without a new measurement
      (DECISIONS.md 212 already says the ceiling is on pixels, not on appetite).
      **The latency it cost is not free and is not yet properly recorded.** The
      two captures are 3857ms apart, so a stop costs roughly four seconds
      end to end at 2.0x. There is no before-figure for scan wall-clock to
      compare it against — that column was never recorded at 18.6% — so the
      trade is evidenced on quality and merely bounded on cost. This lands on
      the scan path, which transmits nothing and has seconds to spend
      (DECISIONS.md 188); it would not be acceptable on the run path.

**Done when:** DOM coverage is recorded on ≥10 real pages and reaches 60–70%,
and canvas/iframe text is shown being hidden on a page where the DOM sees
nothing. Agreement is reported beside it, never as the target (DECISIONS.md 223).

### T1.3 Open-weights server model, vision path on
**Explicit PS requirement.**

- [x] **Pinned: Qwen2.5-VL-32B-Instruct, Apache 2.0**, hosted free on
      OpenRouter. DECISIONS.md 195. The licence was the first filter, the same
      standard 186 applied to OmniParser — Llama 4 Scout is strong here and its
      Community Licence is not open.
- [x] **`SHIELD_MODEL_VISION` on by default.** The frame was captured,
      redacted, sealed, verified and then usually left behind. A model that
      cannot see now costs one rejected request rather than the feature: a 4xx
      on an image request is retried without it, answers anyway, and latches.
      `/health` reports `on` / `off` / `refused`.
- [x] **Offline path documented and specified** — `ollama pull qwen2.5vl:7b`
      (6.0GB, Q4_K_M) or `vllm serve Qwen/Qwen2.5-VL-32B-Instruct`, one
      environment variable either way. Stated plainly that the laptop runs the
      7B and the cloud demo the 32B: same family, same licence, same wire
      format, smaller model.
- [x] **Run it offline once.** Done 2026-09-21 — `qwen2.5vl:7b` on ollama
      0.34.2, CPU only, answering through the real `/analyze` in **22.2s** end
      to end with `reasoner: model`, `vision: on`. A working offline fallback,
      not a demo path.
- [x] **Verify the redacted frame is actually used in the model's reasoning.**
      Done 2026-09-21 by experiment rather than by inspection, and it needed no
      key: `server/verify_vision_live.py` sends two requests whose PAGE CONTEXT
      is identical and whose screenshot is not, and the chosen action moves with
      the pixels. Control run with the frame withheld is identical across both.

**Done when:** the demo runs on an open-weights VLM that receives the redacted
frame, and the offline path is documented and tried once. **Met 2026-09-21.**

**The blocker was never a key.** It was read as one for weeks because the hosted
provider is the demo path, and the offline route was filed as the harder of the
two. It is the easier: ollama speaks the same OpenAI-compatible shape the
adapter already targets and ignores the bearer token entirely, so the whole tier
closed locally, on an open-weights model, with nothing paid and no account. That
the adapter took a local model with no code change is the strongest evidence
that "the provider is configuration, not code" (DECISIONS.md 195) was true
rather than merely intended.

---

## Tier 2 — explicitly required

### T2.1 Firefox
**The PS names it: "popular browsers (chrome, Firefox)".**

- [x] **Event pages have DOM access — confirmed, and it makes this simpler.**
      Firefox MV3 runs an event page, not a service worker. The offscreen
      document exists only because a Chrome service worker cannot host
      WebAssembly or WebGPU, so Firefox needs less machinery, not more.
- [x] **The namespace risk does not exist.** Firefox returns promises from
      `chrome.*` under MV3, so every `await chrome.…` in the client ports
      unchanged. No compatibility shim. This was the one that would have made
      the port expensive.
- [x] **WebGPU is available.** Default from Firefox 141 on Windows, 145 on
      Apple Silicon; Linux and Android still in progress. The machine here runs
      155. Absence degrades to the WASM path, so it is a speed question.
- [x] **A Firefox build target exists** — `npm run build:firefox` generates
      `dist-firefox/` with a manifest derived from Chrome's, so the two cannot
      drift and a Firefox build cannot break Chrome. DECISIONS.md 203.
- [x] **Loaded in Firefox, and almost everything worked first try.** The event
      page ran with `type: module` — the predicted failure did not happen — the
      content script injected under `activeTab`, the DOM map read 418 elements
      and measured the page at 9.4 screens, and the popup rendered in full.
      Only the vision path failed, with the message written for it.
- [x] **Iframe vision host built, tried, and reverted.** It loads ONNX and
      captures a frame, then hangs the extension: a same-origin iframe shares
      an event loop with its parent, and single-threaded WASM inference starves
      the event page that has to receive the reply. Firefox reports
      `Content process isn't responsive` and DevTools will not attach.
      DECISIONS.md 207.
- [x] **Inference on a thread that is not the message loop — built.**
      DECISIONS.md 216. A dedicated Worker, on both browsers. The dispatcher
      extraction of 204 was the alternative and was not taken: it unblocks the
      reply but still runs inference on the event page's own thread, so the
      extension freezes for the duration.
      `offscreen/inference-session.ts` holds the ORT work **once**, and both
      hosts call it — two copies of backend selection would drift silently, and
      the symptom would be Chrome picking WebGPU while Firefox quietly picked
      WASM for a reason nobody wrote down. `offscreen/inference.ts` puts the
      two hosts behind one interface and `face-detector.ts` cannot tell them
      apart, so the detection policy does not fork per browser.
      **The worker is never given a frame.** The host decodes the capture,
      draws it to 320x240 and normalises it, and transfers only the resulting
      float array — so that context cannot leak a screenshot because it is
      never handed one, and "the offscreen document is the only context that
      decodes a frame" (DECISIONS.md 45) stays true as written.
      `SessionFacts.webgpuError` now carries *why* WebGPU was declined, which
      is the question DECISIONS.md 208 could not answer because the console
      that would have said belonged to the process that had hung.
- [x] **Firefox event page wired to the worker — built, not yet run there.**
      DECISIONS.md 219. `offscreen/dispatch.ts` holds the vision path; each
      browser's entry point supplies only wiring. `offscreen/offscreen.ts` is
      down to a listener and an idle timer (86kB -> 1.8kB);
      `background/vision-host.ts` is the branch — `sendMessage` on Chrome,
      in-process dispatch on Firefox, which passes `'worker'` the way the
      offscreen document passes `'document'` (DECISIONS.md 217).
      **Chrome's bundle graph is verified unchanged in shape:**
      `dist/service-worker.js` statically imports six chunks, none of them
      `dispatch` or `inference-session`, and reaches the dispatcher only
      through `import("./chunks/dispatch.js")` behind `HAS_OFFSCREEN`. A static
      import would have put ~94kB of engine into the one context that cannot
      run it. The seven offscreen helpers left `lib/messages.ts` for the same
      reason: the popup and content script import that file.
      296 tests pass, `tsc --noEmit` clean, both build passes, `dist-firefox/`
      carries every chunk with an event-page background and no `offscreen`
      permission. **It has still never been run on Firefox** — that is the next
      line, and 207 is the standing lesson about the gap between the two.
- [x] **Run in Firefox — the vision path works there.** DECISIONS.md 220.
      2026-09-17, income-tax login. The event page hosts it, the Worker spawns,
      ORT initialises, and **it selects WebGPU** — closing the 208 question that
      every Firefox run fell back to WASM for reasons never captured. The event
      page **stayed responsive throughout**: popup animating, DevTools
      attached, logs streaming. 207's hang did not recur, which is the first
      test rather than argument that the Worker fixed what it was built for.
- [x] **Double-build race fixed.** The same run exposed `ensureFaceDetector`
      checking `engine && info` and then awaiting with no latch, so the popup's
      PREPARE and the run both built — two Workers, two ORT sessions, two
      WebGPU device requests on one GPU. Chrome hid it behind a ~1s init;
      Firefox's 35s made the overlap certain. Same shared-promise latch
      `background/offscreen.ts` uses.
- [x] **Firefox keeps WebGPU. The seconds were one-time, not per-frame.**
      DECISIONS.md 222. 35s was two sessions contending; one clean session is
      ~10s of build and shader compilation, and steady-state inference is
      228ms. "Prefer WebGPU, fall back to WASM" stays browser-independent, and
      no `forceBackend` comparison was needed to settle it.
- [x] **A task completes end to end on Firefox.** 2026-09-17, income-tax
      login, after the latch fix. Every stage ran and the payload sealed:

      | Stage | Firefox | Budget |
      |---|---|---|
      | Screen capture | 42ms | 100ms |
      | DOM scan | 16ms | 100ms |
      | Local inference | **12023ms** | 500ms |
      | Redaction | 23ms | 200ms |
      | Server round trip | 308ms | 1000ms |

      1 sensitive region found (`id_number`, DOM, 0.6), redacted, replaced with
      `[ID_NUMBER]`, seal verified. Detection behaves identically to Chrome.
      **The 12s stage is one-time model init, not per-frame cost:** the same
      line reports `inference on webgpu in the worker in 184.0ms`. The latch
      fix also confirms 220's caveat — 35s was two sessions contending, and one
      clean session is ~11.8s.
      **Firefox inference is 184ms against Chrome's 34ms**, ~5x, and still
      inside the 500ms stage budget once init is excluded.
- [x] **Second run on Firefox: 364ms end to end. It is demoable.** 2026-09-17,
      same session, same page:

      | Stage | Run 1 | Run 2 | Budget |
      |---|---|---|---|
      | Screen capture | 42ms | 44ms | 100ms |
      | DOM scan | 16ms | 11ms | 100ms |
      | Local inference | 12023ms | **249ms** | 500ms |
      | Redaction | 23ms | 50ms | 200ms |
      | Server round trip | 308ms | 10ms | 1000ms |

      Model inference itself: **228ms**, against Chrome's 34ms — about 6.7x,
      and inside the 500ms budget with room. The 12s on run 1 was one-time
      session build and shader compilation, exactly as 220 predicted; it is not
      a per-frame cost and does not recur while the session lives.
- [x] **CPU fallback proven on Firefox — 19ms inference, 272ms init.** The
      221 fix works: `CPU fallback verified` where the same run previously read
      `CPU fallback BROKEN — no available backend found`. **FR-27 now has
      evidence on both browsers**, which is the standing judge question about
      machines with no GPU answered with a measurement rather than an
      assurance. Firefox's WASM init (272ms) is notably *faster* than Chrome's
      recorded 135ms-init/17ms-inference figure is slower — both are trivial
      next to the 10s WebGPU build, which is the asymmetry the item below is
      about.
- [x] **Firefox's idle disposal window: raised to 10 minutes. Decided 2026-09-22
      on measurements, not preference.** Both inputs 222 was waiting on turned
      out to be wrong. The rebuild is **~16.5-17s**, not ~10s, across three
      sessions. And the resident session is **cheap** — Firefox returns to its
      pre-run baseline within about a minute either way (readings 4 and 6 at
      61MB and 60MB against 65MB idle). 222's own criterion was "a 10s rebuild
      is only worth avoiding if the resident session turns out cheap", so this
      follows it. Chrome stays at 120s: its rebuild is ~1s and the trade there
      is the opposite one. DECISIONS.md 264.
- [ ] **Re-prove the CPU fallback on Chrome under `forceInferenceHost: 'worker'`.**
      Chrome's default document host shares a realm with the self-test, so it
      never hit 221 and its cached verdict is honest. Under the worker host it
      would have, and the cached "verified" record would have masked it. Clear
      the record and re-run once to confirm the fix holds there too.
      **Attempted 2026-09-22 and no verdict was produced** — every console from
      that session carried the *cached* line from 2026-09-17, so the record was
      never cleared and the worker host was never selected. **Still open, and
      deliberately not marked done:** the whole point of this item is that a
      cached "verified" can mask a real break, so accepting a cached line as
      the answer would be the exact mistake it exists to catch. One console
      command and one run.
- [x] **Chrome measured. WebGPU survives in the worker; the gate is met.**
      DECISIONS.md 218. One machine, integrated Intel, build 2026-09-16
      23:13:53, same page and task each run:

      | Host | Model inference | `local inference` stage |
      |---|---|---|
      | document | **34.0ms** | 51.2ms |
      | worker (forced) | **37.8ms** | 73.7ms |
      | worker (unforced, see below) | 31.8ms | 55.2ms |

      **All three selected WebGPU**, as did the 14th's 31.7ms document run.
      216's abandon condition was a *silent drop to WASM*; it did not happen.
      The worker cannot be called slower — the spread within the worker alone
      (31.8 to 37.8) is wider than the gap between hosts, at n=1 per cell — but
      the stage around it does cost something real, which is the extra thread
      hop and its two transfers. Everything sits inside a 500ms budget.
      **Chrome therefore keeps the document host** (218): a small measurable
      cost, no benefit on a browser that has offscreen documents.
      The unforced worker row is the bug of DECISIONS.md 217, not a setting:
      `chooseHost` probed `chrome.offscreen` from inside the offscreen
      document, where that API is not exposed, so Chrome silently defaulted to
      the worker. Fixed — a context now declares what it is — and `forcedHost`
      is reported alongside `host` so a default can never again be mistaken for
      a measurement.
- [x] **Disposal fixed in the same change** — DECISIONS.md 206, 219. Firefox's
      event page cannot close itself, so it drops the *session* on the same
      120s idle timer Chrome's document uses to close itself — releasing the
      same 25MB WASM module and the same GPU buffers while the page keeps
      running. `closeOffscreenDocument` still has no callers on either browser
      and that is still correct: Chrome's document disposes of itself, which is
      the only context that can, since an MV3 service worker is evicted when
      idle and cannot be relied on to run a timer.
- [x] **WebGPU is reachable from a Firefox extension page — confirmed.**
      DECISIONS.md 220, 222. `inference on webgpu in the worker in 228.0ms`.
      The earlier "always falls back to WASM" was never a WebGPU finding: the
      reason could not be captured because the console belonged to the process
      that had hung, which 207 then explained and the Worker fixed.
- [x] **Firefox packaging verified without a browser.** DECISIONS.md 252.
      `tools/check-build.mjs` runs on `dist` and on `dist-firefox` separately,
      resolving every manifest path, every `.html` opened by string from the
      source, and the four things the Firefox manifest rewrite could get wrong.
      Both failure modes provoked before it was trusted. It caught a real stale
      `dist-firefox` on its first honest run.
- [x] **The settings page — and the gear that opened nothing.** DECISIONS.md
      251. The rebuilt popup's gear called `openOptionsPage` with no options
      page declared in either manifest, on both browsers, silently. Fixed, and
      the page also makes **FR-14 reachable by a person** rather than only from
      an extension console — along with both inference overrides, which is what
      C3 below needed a console for.
- [x] **Mozilla's own linter passes with zero errors.** DECISIONS.md 253.
      `npm run lint:firefox` runs `web-ext lint` — the tool AMO review uses —
      against `dist-firefox`. The Firefox build would pass validation as
      submitted. The one warning that was a real requirement is fixed:
      `data_collection_permissions: ["none"]`, enforced by `check-build.mjs`.
      The remaining ten are triaged in 253 rather than silenced — four are
      Chrome-only APIs sitting unreachable in a shared bundle, four are
      third-party `eval` in Tesseract and ORT, two are React internals now
      pinned by a test.
- [x] **Fixture set on both browsers — DONE 2026-09-22.** All six screens on
      Firefox (2026-09-21) and all six on Chrome. Screens 1 and 5 reproduce
      finding-for-finding across browsers, so the pixel-layer gains are
      properties of the pipeline rather than of one graphics stack
      (DECISIONS.md 265). Screen 2 returns 11 findings, screen 4 returns 0,
      screen 6 matches its pre-registered prediction exactly, and screen 3 now
      returns 7 of 8 on **both** browsers — Chrome up from 6, and at 0.44
      rather than the 0.312 that made the old verdict marginal (266).
- [x] **A protocol that two people would follow identically** —
      docs/RESOURCES.md. Six readings at named moments, both extension
      processes recorded separately, the run repeated five times because a
      single run carries one-off costs.
- [x] **In-extension heap sampling** — `lib/resource.ts`, 7 tests. Reported at
      the moment the session is built, which is the resident cost of having a
      model rather than of using one. The line names what it excludes and the
      sampler returns null, never zero, where the counter is absent.
- [x] **The limits of self-measurement written down.** `performance.memory`
      covers one JS heap. ONNX's WASM linear memory and WebGPU buffers - the
      two largest costs - are invisible to it, so the process-level numbers
      come from Chrome's task manager. DECISIONS.md 209.
- [x] **Machine A measured** — Intel i5-13500H, 15.7GB, **Iris Xe integrated,
      no discrete GPU**, and it selects **WebGPU** anyway. Idle costs 8MB of JS
      heap and 0K of GPU memory; a run peaks at 19MB GPU and 0.1% CPU; a
      whole-page scan peaks at 1.1% CPU. End to end ~135ms.
- [x] **The offscreen document's self-disposal is proved, not assumed.** Two
      minutes idle and its process row is gone with GPU memory back to 0K —
      DECISIONS.md 141's claim, measured for the first time.
- [x] **Re-run with Chrome's Memory footprint column enabled.** Done, and it
      was the right call: the JS heap was reporting ~8% of what Shield actually
      occupies, the other ~198MB being ONNX's WASM linear memory, which no
      page-visible counter reports. docs/RESOURCES.md carries the table.
- [x] **The same figures on Firefox — measured 2026-09-22.** All six readings,
      both processes, in RESOURCES.md. Extensions process: 65MB idle, 256MB
      after model init, 290MB at run peak, 415MB during a scan, and **back to
      60-61MB on its own afterwards**. Metric 4 now has numbers on both
      browsers. Two caveats recorded rather than smoothed: reading 3 was taken
      once rather than five times, and Firefox's CPU percentages cannot be
      quoted beside Chrome's — different instruments, different normalisation.
- [ ] **A second machine for contrast** — a discrete GPU, or an older laptop.
      Machine A already covers the integrated-graphics case that matters most.

**Done when:** we can answer "what does this cost the laptop?" with figures.

### T2.3 Generalisation sweep
**"Use cases for evaluation will be provided during finale" — the pages are unknown.**

- [x] **A protocol two people would follow identically** — docs/GENERALISATION.md.
      Observe-only on every site we do not own, logged out, the sensitive list
      written down **before** Shield's output is read, and four outcomes
      recorded separately (read / detect / redact / act) because a page can
      read perfectly and detect nothing.
- [x] **Confirm no fixture-specific code path exists anywhere.** Done by
      reading the source, not by running it. **None exists.** No hardcoded
      hostnames, no element ids, no PSP or bank list behind the UPI rule, and
      `_form_kind` classifies from fields rather than from button wording —
      the button version was a fixture-shaped assumption and a real page
      already caught it.
      One fixture-aware path does exist and is named rather than buried:
      `isLocalFixture` gates two `console.info` calls and nothing else, in the
      safe direction — a real page gets *less* printed. If it is ever consulted
      where something is detected, hidden or clicked, the audit is void.
      **Two real limits the audit surfaced, neither of which the sweep would
      have found:** submit and consent wording is English-only, so a
      Devanagari portal makes the rule path decline rather than act (safe, but
      it will not act); and checkbox state travels as the two literal strings
      `checked` / `unchecked` across the trust boundary, so a change on one
      side breaks consent handling on the other with nothing failing loudly.
- [ ] ≥20 real, unmodified sites. **Nine rows recorded 2026-09-20** with Read,
      Agreement and Scan time — but **Detect is blank on all nine**, because
      the sensitive list was not written down before the output was read, and
      scoring detection against findings already seen is the one thing §2
      forbids. Eleven more sites with the list written first. The scan now
      prints a per-finding table (DECISIONS.md 239), which is what made the
      column unfillable last time.
- [ ] At least 3 task types beyond login (search, form fill, navigation)
- [ ] Every failure either fixed or written down as a known limit

**Done when:** the sweep is repeatable and its results are in the repo. The
protocol and the audit are done; the rows are not.

---

## The near deadline: a national college hackathon, 25-26 September

The event is 30 hours and the format is build-on-site, but a pre-built project
is allowed and that is what we are bringing: **fully built and deployable, not
a demo shell.** The on-site hours go to polish and presentation, not to
construction.

**Target: complete by 23 September.** Code freezes then.

| Day | What has to be true by the end of it |
|---|---|
| **21 Sep** | Popup rebuilt and judged in Chrome. T1.3 closed — the model reads the redacted frame, proven by experiment. Licensing, privacy policy, Dockerfile and release packaging done |
| **22 Sep** | Firefox and Chrome both measured. Fixture set closed on both browsers. Edge verified. Consent gate defect found and fixed. Disposal window decided |
| **23 Sep** | **Freeze.** README and deck current, judge Q&A said out loud, one full rehearsal, backup video recorded. No new measurement |

**Two short measurements are still owed**, both on Chrome and both about five
minutes: the settled-after-two-minutes memory figure, and a CPU-fallback
verdict under the worker host that is dated today rather than cached.

**Deferred past the event**, because they are evidence rather than capability
and none of them changes what the product does: the 20-site sweep beyond the
nine rows recorded, task types beyond login, a second machine for contrast, and
face pixel truth. The failure register closes with the sweep.

---

## Shipping as a product — 2026-09-21

Packaging, not hosting. **Hosting the /analyze server was considered and
declined** for now: the demo would gain a dependency on venue networking and
lose the offline property 260 just proved, and the server has no auth or rate
limit because it was written to be reached from the same machine. DECISIONS.md
262.

- [x] **LICENSE — Apache-2.0**, with a NOTICE file recording every third-party
      component and its source. There had been no licence at all, so the default
      was all rights reserved while the deck said "open" (DECISIONS.md 261).
- [x] **docs/PRIVACY.md** — the collection statement in plain words, for whoever
      installs it rather than for engineers. Kept consistent with
      SECURITY_PRIVACY.md on purpose, and it states the four known limits rather
      than burying them.
- [x] **server/Dockerfile** — built and run, not merely written. Answers a real
      `/analyze` in 42ms on the rule path, 202MB, non-root, published to host
      loopback only.
- [x] **`npm run package`** — both store archives plus SHA256SUMS, verified by
      extracting them again (59/59 files, model byte-identical, hash matches the
      pin in `tools/models.json`). Refuses to package a `SHIELD_DEV=1` build, and
      that refusal was provoked before it was trusted.
- [x] **The 13 `web-ext lint` warnings are attributed** rather than counted. 0
      errors, 0 notices. None are in code we wrote.

- [ ] **Decide the Firefox minimum version.** `strict_min_version` is `121.0`,
      but `data_collection_permissions` only exists from Firefox **140** (142 on
      Android), so **on 121-139 the "we collect nothing" declaration is silently
      ignored by the browser.** The code guarantees are unaffected — the
      declaration is a statement to the vendor, not the mechanism — but
      PRIVACY.md leans on it. Raising the floor to 140 abandons the documented
      reason 121 was chosen, so this needs a decision rather than an edit.
- [ ] **An AMO-signed unlisted build**, if a Firefox release artifact is wanted
      before the event. `lint:firefox` already runs `--self-hosted` and passes;
      signing needs a Mozilla account and is hours, not days. **Chrome has no
      equivalent** — the Web Store is the only path and its review queue is not
      controllable, so the Chrome demo stays "Load unpacked" either way.

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

---

## T4 — Recall to 90%, written down before the code exists

**Pre-registered 2026-09-22, before any pattern is written.** The rule this
project keeps: a change measured against a target chosen afterwards measures
nothing. Predictions below; the benchmark decides.

**Constraint: additive only.** Every change is a NEW pattern. No existing rule
is retuned, reordered or removed, so nothing that currently works can regress
through a change that was never made to it. A new pattern that hurts is deleted,
not tuned.

**Baseline: recall 83.5%, precision 83.5%, 142 of 170 found, 28 missed.**
**To reach 90% recall: 153 found. Eleven more.**

### Prediction 1 — a currency-amount pattern catches 7

`Rs.` / `₹` / `INR` followed by digits. Named individually so a partial result
is still readable:

| Page | Label | The text |
|---|---|---|
| bank-07 | `t1` | `02 Aug · Blue Tokai Coffee, Bandra · Rs. 640.00` |
| bank-07 | `t2` | `11 Aug · IRCTC Rail Connect · Rs. 2,145.00` |
| bank-07 | `t3` | `19 Aug · Apollo Pharmacy, Vile Parle · Rs. 1,890.00` |
| bank-07 | `due` | `Total due Rs. 12,430.00 by 05 Sep 2026` |
| bank-03 | `a2` | `Credit Card XXXX ... · Outstanding Rs. 12,430.00` |
| svc-02 | `prem` | `Next premium Rs. 18,240 due 01 Oct 2026` |
| tel-03 | `due` | `Amount payable Rs. 712.00 by 12 Sep 2026` |

This closes the gap DECISIONS.md already recorded: *"amounts are missed as text
and over-flagged as fields"* — the same quantity treated two ways depending on
how the page renders it.

### Prediction 2 — a name gazetteer catches 6

Common Indian given names and surnames, matched against capitalised tokens.
Cheaper than the NER model we do not ship, and it does not need one.

| Page | Label | The text |
|---|---|---|
| bank-03 | `who` | `Welcome back, Rohan Mehra` |
| tel-03 | `who` | `Billed to Rohan Mehra, Flat 3B, ...` |
| svc-02 | `life` | `Life assured: Meera Pillai, DOB 12 Mar 1990` |
| svc-02 | `nom` | `Nominee: Arjun Pillai (Son), DOB 04 Jul 2016` |
| gov-09 | `r1` | a name on the voter record |
| 05-adversarial | `t4` | **the case we have always said is unfixable** |

**`t4` is the one to watch, and it cuts both ways.** SECURITY_PRIVACY.md 4.1
and the demo Q&A both say a name in prose cannot be separated from other
capitalised words without a model we do not ship. **A gazetteer is not that
model** — it recognises names it has seen, and misses every name it has not,
which is a different and weaker claim. If `t4` starts passing, the honest
statement becomes "we catch common names from a list, and still miss unusual
ones", and **both documents have to change in the same commit.** An adversarial
fixture that goes green without its explanation being rewritten is how a test
stops measuring anything.

### Expected cost, stated in advance

7 + 6 = 13 against 11 needed, so **91.2% recall if both land whole**. Over-flags
should rise — amounts will fire on `ctl-03-invoice-footer`, which is a control
page that is supposed to stay clean. **Precision is predicted to fall to about
80%**, inside the 78-82% band DECISIONS.md 224 set for exactly this trade.

**Abort conditions, fixed now:** recall below baseline, or precision below 78%.
Either one and the pattern that caused it is deleted rather than adjusted.
