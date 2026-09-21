# Operator runbook — the measurements that need a human

**Every remaining task that cannot be done without a browser, a key or a second
machine, with the exact steps and the exact lines to bring back.**

docs/TASKS.md says *what* is next and why it matters. docs/GENERALISATION.md
and docs/RESOURCES.md each hold one protocol in full. This file is the missing
third thing: the whole list, in the order worth doing it, with the commands.

Nothing here replaces those two protocols — where this file and one of them
disagree, the protocol wins and this file is wrong.

---

## Before any session

```bash
cd extension
npm run build                # ordinary build, NOT SHIELD_DEV=1
```

Then in Chrome: `chrome://extensions` → **Reload** on Shield → click **service
worker** to open its console. **Open the console before the first page**, not
after. The per-screen and agreement lines are the measurement and they are not
recoverable once they have scrolled.

Two rules that apply to every session below, from docs/GENERALISATION.md:

- **Observe-only on every site we do not own.** Never submit a form on a live
  government or banking portal.
- **Write down what is sensitive BEFORE reading Shield's output.** A page
  scored against the detector's own answer measures nothing.

---

## Session A — the sweep (~90 min, the big one)

> **Status 2026-09-20: the nine rendering pages are done** (DECISIONS.md 236),
> and metric 1 is now 22.2% DOM coverage pooled over ten pages rather than the
> 31.6% one page claimed. **The Detect column is still blank on all nine**,
> because step 2 below — write the sensitive list down first — was skipped.
> What remains of Session A is detection: eleven more sites with step 2 done,
> or those nine re-run properly. Scoring detection against findings already
> read is the one thing §2 of GENERALISATION.md forbids.
>
> **Two things changed after that pass and both affect the next one.** The scan
> now prints a per-finding `console.table` (DECISIONS.md 239), which is what
> makes the Detect column fillable at all. And the whole frame is now read as
> sparse text rather than as a page layout (238) — so **the ten pages also need
> re-scanning for metric 1**, stated against 22.2% pooled.


**Closes:** T1.2 "nine more pages", T2.3's 20 sites, and the scan-speed
confirmation. Three open items, one sitting.

The 20 sites give metric 1 for free — docs/GENERALISATION.md §3's results table
already carries an Agreement column, so there is no separate "nine pages"
exercise.

### Which sites

Twelve of the corpus pages are already captured (`benchmark/captured/`) and are
all the same rendering kind: flat HTML forms, 14–16px sans-serif, black on
white. **Metric 1 is about whether the pixel reader can read what the markup
reports, so what has to vary is how a page RENDERS, not what PII it holds.**
Nine more login forms would be nine correlated readings.

These nine vary the rendering. None is in the captured set.

| # | Page | Axis | Prediction to write down first |
|---|---|---|---|
| 1 | `google.com/maps` | Canvas / tile text | Almost all pixel-only. The strongest case for the layer existing |
| 2 | `india.gov.in/hi` | Devanagari | Near-zero agreed AND near-zero pixel-only — only `eng.traineddata` ships |
| 3 | `nseindia.com/market-data/live-equity-market` | Dense tiny numbers | Small text, the resolution question retested |
| 4 | `irctc.co.in/nget/train-search` | Angular SPA, late render | Tests whether the 450ms settle is enough |
| 5 | `mygov.in` | Text baked into banner images | Pixel-only wins; markup describes none of it |
| 6 | `apple.com/in` | Display typography | Large glyphs should read near-perfectly |
| 7 | `github.com/explore` | Dark, low contrast, monospace | Contrast sensitivity |
| 8 | `w3schools.com/html/html_iframe.asp` | Iframe + code blocks | Markup cannot cross the iframe; pixels can |
| 9 | `sci.gov.in` | Serif, legal tables | Serif is harder for this engine than sans |

Then the rest of the twenty from the categories in docs/GENERALISATION.md §2 —
the already-captured portals are fine for these, because for T2.3 the question
is detection rather than rendering.

### Per site, exactly

1. Navigate. Log out if you are logged in. Let the page settle.
2. **Write the sensitive list down.** What would a careful person not want
   transmitted from this screen?
3. Popup → **Scan the whole page**.
4. Copy these lines verbatim:

```
[shield] screen read at Nx (…)                     ← one per stop
[shield] page agreement N% — A agreed, P pixels only (H hidden), D markup only
[shield] scan timing — …                            ← gives scan time for free
[shield] scan complete — N finding(s) across Xpx of Ypx
```

5. Compare the findings against step 2. Count found / missed / over-flagged.
6. Fill one row of docs/GENERALISATION.md §3.

**DOM coverage is `agreed ÷ (agreed + markup only)`.** That is the number being
driven, not the agreement percentage (DECISIONS.md 223).

### The one extra thing to watch for

On **#5 MyGov**, or any page with pictures on it, look for:

```
[shield] OCR: n/m image(s) read (k skipped — already read whole or clipped)
```

That line confirms DECISIONS.md 228's skipping actually fires. The income-tax
login had no image candidates at all, so it has never been observed working.
One line closes an open item.

### A site that fails is a result

Record the failure mode and move on. **Do not fix a detector against the page
it just failed on** — that stops the sweep being a measurement.

---

## Session B — Firefox, end to end (~60 min)

**Closes:** T2.2's Firefox figures, the disposal-window decision waiting on
them (DECISIONS.md 222), and the fixture set on Firefox.

**Read this first.** Firefox has already been proven once, on 2026-09-17: event
page, content-script injection, the DOM map, a Worker running ORT on **WebGPU**,
the CPU fallback, and a full task end to end at **364ms warm** (DECISIONS.md
220, 222). None of that is in question.

**What has never run on Firefox is everything built since.** The entire popup
was rebuilt in React and Tailwind, and the consent gate, audit panel, scan card,
settings page, corpus panel, scan timing, PSM 11 segmentation and redaction
levels all arrived after that date. So this session is not "does Firefox work" —
it is "does the client we have now work there", which is a different question
with a much larger surface.

```bash
cd extension
npm run build:firefox        # produces dist-firefox/, and checks it
```

```bash
npm run lint:firefox         # optional, needs network — Mozilla's own linter
```

That build now refuses to finish if the Firefox manifest is wrong — a background
key still naming a service worker, the `offscreen` permission left in, a missing
gecko id, or any page referenced by name that is not in the output. **If it
prints two `manifest consistent` lines, the packaging is not what is broken.**

Firefox: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** →
pick `dist-firefox/manifest.json`.

### B1. The new surfaces, before any measurement (~15 min)

Open the popup. Work down it and note anything that looks wrong — this is the
part no test can reach, and the part most likely to be broken.

| Check | What right looks like |
|---|---|
| The popup renders at all | Dark blue-black, white shield mark, one gradient button. A blank or unstyled popup means the Tailwind stylesheet did not load — say so, it is a CSP problem and worth knowing immediately |
| Tabs on cards | The small labels protrude from the **top edge** of a card, half outside it. If they are clipped, Firefox is applying an overflow rule Chrome is not |
| The gear, top right | Opens the **settings page in a tab**. This is brand new and has never run anywhere — it did not exist until today |
| On the settings page | Four redaction levels with pixel floors and measured percentages; the endpoint; two inference dropdowns. Change the redaction level and reopen — it should have stuck |
| "Scan the whole page" | Progress counts up, then a sentence naming what was found and across how many screens |
| "See what it looked at" | Opens the scan record in a tab, with redacted screenshots |
| "What was sent" | Opens the payload inspector |
| The build line, bottom left of the masthead | Click it. It should read `forced: wasm`, and the next run should use CPU |

### B2. The consent gate, which has never run on either browser

In the popup, tick **"Ask before sending"**. Then run any task.

1. A card should appear **before** anything is transmitted, naming counts, the
   frame size and the endpoint.
2. Press **Don't send**. The run must stop and the console must say
   `[shield] not transmitted — declined`.
3. Run again, approve, and confirm it proceeds.
4. **Run again and just close the popup.** Wait a minute. It must time out and
   send nothing — `[shield] not transmitted — timed-out`. This is the path that
   matters most and the one nobody would think to try.

Untick it afterwards. It is off by default for a reason (DECISIONS.md 240).

### B3. The measurements (~25 min)

1. Run **docs/RESOURCES.md's protocol**, unchanged, on Firefox. Six readings,
   both processes recorded separately, reading 3 repeated five times. Firefox's
   task manager is `about:performance`, or Shift+Esc.
2. **The reading that matters most is #2 — the resident cost of a built
   session.** The disposal window cannot be chosen until that number exists: a
   10s rebuild is only worth avoiding if the resident session turns out cheap.
3. Run the **six test screens** from `test-screens/` on Firefox, pass/fail each.
   Screen 6 is new and needs `face-a.jpg` beside it.

**Expect the first run to take ~10s** for model init and shader compilation.
That is one-time per session and not a per-frame cost (DECISIONS.md 222) — do
not record it as latency.

### What to bring back

- The six resource readings, both processes.
- Six pass/fail lines for the fixtures.
- **Anything in B1 that looked wrong**, in your own words. A screenshot beats a
  description. This is the half of the session that has no other source.
- Whether B2's four consent steps behaved, especially step 4.

---

## Session C — the Chrome measurements (~30 min, five small items)

### C1. Face pixel truth

The images are already on disk at `test-screens/face-a.jpg` and `face-b.png`,
and are gitignored. **They must never be committed.**

1. Open `test-screens/03-faces.html`.
2. Run a scan.
3. Record each detected face box and its score.
4. Bring back the boxes. They go into `benchmark/pixels.ts`; the images do not
   go anywhere.

### C2. The settled-after memory figure

Chrome task manager (Shift+Esc), **Memory footprint column enabled** — the JS
heap reports about 8% of the real number, so a JS-heap figure is not an answer
here (DECISIONS.md 209).

Run one task, wait two minutes, record the figure after it settles. One number,
and it is the last gap in metric 4 on Chrome.

### C3. Chrome CPU fallback under the worker host

The cached verdict would mask the bug DECISIONS.md 221 fixed, so clear it
first. In any extension console:

```js
chrome.storage.local.remove('cpuFallbackSelfTest')
chrome.storage.local.set({ forceInferenceHost: 'worker' })
```

Reload the extension, run one task, and read the console for either
`CPU fallback verified` or `CPU fallback BROKEN`. Then:

```js
chrome.storage.local.remove('forceInferenceHost')
```

### C4. The five test screens on Chrome

`test-screens/01-login.html` through `05-adversarial.html`. Pass/fail each.
Together with Session B this closes "run the full fixture set on both
browsers".

### C5. Edge

Edge is Chromium and runs the same `extension/dist` bundle. `edge://extensions`
→ Developer mode → Load unpacked. Run the login demo. Expected to pass as-is;
the point is having tried it rather than assuming.

---

## Session D — the model path — **DONE 2026-09-21, nothing to bring back**

Both halves closed without an operator, a key or an account, because the job was
misread. **Ollama speaks the same OpenAI-compatible shape the adapter already
targets and ignores the bearer token**, so the local model exercised the whole
path with no code change — see DECISIONS.md 260.

### D1. One live call that proves the picture is used — done

Wiring had 18 checks; none of them could tell "sent" from "read", because a
model that ignores a correctly formatted image passes all 18. Settled by
experiment instead: `server/verify_vision_live.py` sends two requests with a
byte-identical PAGE CONTEXT and a different screenshot — a login form, and the
same form with a cookie banner covering the sign-in button.

    plain frame   -> click e3 (Sign in)
    banner frame  -> click e4 (Accept cookies)
    frame withheld -> click e3 both times   <- the control

The action moved with the pixels and nothing else changed. The control is what
makes it a result rather than a coincidence, and the harness reports
INCONCLUSIVE rather than a pass if the provider is not deterministic.

### D2. The offline path, run once — done

`qwen2.5vl:7b` on ollama 0.34.2, **CPU only**, answering through the real
`/analyze` in **22.2s** with `reasoner: model`, `vision: on`. Warm: vision
13.0–18.3s, text-only 11.3–11.7s, so the image costs about 2–6s on top.

**A fallback, not a demo path.** Twenty seconds a step is three orders of
magnitude past the budget. What it buys is an answer to "what if the venue has
no internet" that has been run rather than described.

**If anyone does get a hosted key**, the only thing left worth doing is
repeating D1 against the 32B to confirm the larger model behaves the same way.
That is a nice-to-have, not an open requirement.

---

## Session E — a second machine (~30 min, whenever one is available)

docs/RESOURCES.md's protocol on any other laptop. A discrete GPU or an older
machine both add something; Machine A already covers integrated graphics, which
is the case most judges' laptops will be.

Record CPU model, RAM, GPU and browser version alongside the figures, or the
numbers cannot be compared to Machine A's.

---

## What comes back, in one place

| Session | Bring back |
|---|---|
| A | Four console lines per site, plus found/missed/over-flagged against the pre-written list. The `image OCR … skipped` line from any page with pictures |
| B | docs/RESOURCES.md's six readings on Firefox, five repeats of reading 3, and the resident-session figure. Pass/fail for five screens |
| C | Face boxes and scores. One settled-memory number. `CPU fallback verified` or `BROKEN`. Pass/fail for five screens. Edge works or does not |
| D | **Nothing — done 2026-09-21 without a key.** DECISIONS.md 260 |
| E | The same table as B, plus the machine's specification |

---

## What is not on this list

These are being done without a browser and are not waiting on anybody:

- Whole-frame OCR — 82% of a scan's time and the binding constraint on metric 1
  (DECISIONS.md 231). The only target in that profile worth attacking.
- Consent preview — show what leaves, pause, require approval.
- Profile-edit fixture — face plus name and email plus Save, in one acting loop.
- Deciding Firefox's idle disposal window, which waits on Session B's numbers
  rather than on a browser.
