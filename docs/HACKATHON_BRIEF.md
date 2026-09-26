# What to know before walking in

One file, read the night before. It covers what Shield is in a sentence, the
numbers to know without looking them up, what to demo, what to admit before
anyone asks, and what to do when something breaks in front of a judge.

The detailed demo narration and the long-form answers live in
[DEMO_SCRIPT.md](./DEMO_SCRIPT.md). This is the compressed version plus
everything that file does not cover.

---

## 1. The answer to "what is it", in 30 seconds

> An AI agent that can see and act on your screen, without your private data
> ever reaching the server. A local model finds sensitive regions on-device and
> paints them out; only the redacted picture and placeholder labels are sent;
> the cloud model can only reply with one of three actions — click, type or
> scroll — and the extension re-checks the target before doing it.

If you say nothing else, say the second half. **Everyone at this event has an AI
agent. The redaction boundary is the thing that is ours.**

The one-line version if you are cut off: *"It's an AI browser agent that is
structurally incapable of sending your passwords to the cloud."*

---

## 2. The numbers, known cold

Memorise this block. Judges test whether you know your own project.

| | |
|---|---|
| **PII recall** | **92.4%** — 157 of 170 labelled items, across 50 pages |
| **PII precision** | **83.5%** |
| **Redaction precision** | **83.8%** — of everything covered, how much needed covering |
| **Context kept** | **96.5%** of non-sensitive elements still readable |
| **Area painted** | **0.79x** what was needed |
| **End-to-end run** | **~135ms** on Chrome, local loop |
| **Hosted model call** | **1.6s** (Gemini 3.5 Flash Lite) |
| **Fully offline** | **22.2s** on Ollama, no key, no internet |
| **Tests** | **413** extension, **138** server. No test framework, no network |
| **Adversarial screen** | **7 of 8**, predictions written before the first run |

Stage budget, if asked to break the 135ms down: capture 27.4ms, DOM scan 4.4ms,
local inference 52ms, redaction 40.2ms, server round trip 10.5ms.

Resources: idle costs **8MB** of JS heap and no GPU memory — the model is not
loaded until something asks for it. A resident model is **~8.8MB** of GPU
memory, peaking at **~19MB**. A whole-page scan peaks at **~285MB**, against the
tab's own 290MB — *Shield at its heaviest costs about what one ordinary web page
costs*, which is the sentence to use.

---

## 3. Three number traps — do not walk into them

**Trap 1: never quote redaction coverage on its own.** Ours is 65.9%, which
sounds mediocre. It is not the metric. A blanket blur scores **100% coverage**
and is useless. Always quote coverage *with* redaction precision, or better,
show the baseline table:

| Strategy | Recall | Redaction precision | Area painted | Context kept |
|---|---|---|---|---|
| Blanket blur | 100.0% | 32.9% | 3.04x | **0.0%** |
| Hide every value | 94.1% | 39.4% | 1.71x | 55.6% |
| Hide every field | 77.1% | 77.1% | 0.73x | 95.2% |
| **Shield** | **92.4%** | **83.9%** | **0.79x** | **96.5%** |

**This table is the strongest single artifact in the project.** It scores four
strategies somebody could plausibly have shipped instead, on the same corpus,
through the same scorer. Blanket blur wins on coverage by destroying 891 of 891
non-sensitive elements — every heading, button and label an agent needs to act.

> *"A redactor that hides everything hasn't solved the problem. It has moved it
> — from 'the model sees private data' to 'the model sees nothing.'"*

**Trap 2: metric 1 is 22.2% and that is the honest number.** DOM coverage — how
much of what the markup knows the pixel reader also saw, pooled over 10 pages.
Do not hide it and do not dress it up. Say what it measures and why it is not
maximised at 100%:

> *"Total agreement would make the vision layer redundant. The pixel-only
> findings — text inside images, canvas, scanned documents — are the layer
> earning its place. We measure total screen understanding and we show you the
> number rather than quoting the flattering one."*

Per-page it runs 8.5% to 37.4%, a 4.4x spread, which is exactly why the pooled
figure is the one quoted. **Never quote a single page's number.**

**Trap 3: CPU.** A whole-page scan costs **87–93% of a core** on Chrome and
75–97% on Firefox. Do not say "about 1%" — that was a sampling error we caught
and corrected, and repeating it now would be worse than the cost itself. A scan
is a burst, it transmits nothing, and the user starts it deliberately. A *run* —
what the demo does — is 135ms.

If a judge finds this correction in our docs, the right response is pleasure,
not defence: *"Yes — we found that ourselves, it is written up as a correction,
and it is the second sampling error we caught in that column."*

---

## 4. What to demo, in order

1. **The login autofill run.** The primary path. Must be perfect.
2. **"What was sent?"** — open it. This is the whole project in one screen: the
   exact payload, recorded before it left. *"We would rather you checked than
   believed us."*
3. **`05-adversarial.html`** — eight tricky cases, 7 caught, predictions written
   down beforehand. Includes case 6, an ID number **inside an image**, which no
   markup rule could ever find. That single case is the clearest proof the
   vision layer earns its place.
4. **The activity log** — categories and counts, no content, no URLs, no values.
   Exportable. It can be handed to an auditor without leaking what it protected.
5. **Pull the network cable** if you have 60 spare seconds. The rule path runs
   the whole demo with no model at all.

---

## 5. Say these limits before anyone finds them

This project's consistent edge has been volunteering the limit first. It is
disarming, it is true, and it makes everything else you say more credible.

- **Names are a list, not a model.** A gazetteer of a few hundred common given
  names. It misses every name not on it, a surname alone, ALL CAPS, non-Latin
  scripts. *Say "a list, not a model" before a judge asks.*
- **Only English is read from images.** We ship `eng.traineddata` only. A
  Devanagari page returns Latin-shaped guesses, and **we do not count those as
  evidence.**
- **One screen at a time when acting.** Every run reports how much of the page
  it examined. The whole-page scan covers the rest and transmits nothing.
- **Faces below ~80px are missed**; 80px scored 0.312 against a 0.3 threshold —
  twelve thousandths of margin. State the floor as *between 80 and 110px,
  unreliable at the bottom*.
- **Prompt injection is bounded, not prevented.** The model still reads attacker
  text. What bounds it is the three-verb allowlist and client-side re-checking.
- **Addresses and dates of birth in prose are missed entirely** — which is most
  of what a bill or a statement is.

---

## 6. Questions you will be asked

### The obvious ones

**"Doesn't the extension itself see the private data?"**
Yes — like a password manager or antivirus does, locally, in order to protect
you. The difference is what happens next: it never leaves the device
unredacted, and you just watched the exact payload.

**"What if redaction misses something?"**
We default to hiding. A field matching no rule at all is redacted as `other`
rather than passed through. And a failed redaction stops the run — the payload
literally cannot be sealed with a flagged value still in it.

**"Can it fill in my password?"**
No, deliberately. Storing credentials would mean plaintext in extension storage
on a project whose whole claim is that secrets stay protected. The server names
the field; your device would supply the value. We ship no vault, so there is
nothing to breach.

### The hard technical ones

**"Does the model actually look at the picture, or do you just send it?"**
Settled by experiment, not assertion. Two requests, byte-identical page
description, different screenshot: one shows a login form, the other the same
form with a cookie banner over the button. The first returns *click Sign in*;
the second returns *click Accept cookies* and explains why. Withhold the
screenshot and both say *Sign in*. **The only thing that differed was pixels.**
`server/verify_vision_live.py`.

**"What stops a website putting 'ignore your instructions' in its own text?"**
The best question available, and it is in our threat model. Three answers, in
order of how much they matter: page content reaches the model as JSON data
inside a labelled boundary, never interpolated into instruction text — that
reduces the odds. **It does not eliminate them and we do not claim it does.**
What bounds the damage is that the reply can only be click, type or scroll, and
the client re-verifies selector, element type and label before acting. And it
cannot reach a credential, because the server never holds one.

**"How do you know nothing leaks? Prove it."**
Three independent mechanisms, deliberately redundant: a **type seal** that a
payload cannot be minted without passing verification, a **stage-order guard**
that catches a skipped or early-returned stage at runtime, and a **sweep of the
entire outgoing payload** for every flagged value before it is allowed out.
The third one caught a real defect on a live page the day before this event — a
name was correctly hidden in a field and was still present in a button's
accessible label. It refused to transmit. **Nothing left the machine.**

### The hostile ones

**"This is just regex."**
Partly, and the DOM rules are the most reliable part — markup is structural
truth, not a visual guess, and it owns 160 of our 170 labels at 4.4ms. But regex
cannot find a face, or an Aadhaar number printed inside a JPEG. That is what the
local vision model is for, and case 6 on the adversarial screen is the proof.

**"83% precision means you are wrong 1 in 6 times."**
On over-flagging, yes — 31 items we covered that did not need it. That is the
deliberate direction: a miss is a leak, an over-flag is an annoyance. We tuned
*toward* recall and wrote that down before measuring.

**"Your accuracy number is low."** (metric 1, 22.2%)
See Trap 2. Answer with what it measures, not with a bigger number.

**"Could a big company not build this in a week?"**
Probably. The interesting part is not difficulty, it is that nobody has shipped
the boundary — every screen agent today sends raw pixels to a server. We built
the thing that makes that unnecessary.

### The "is this real" ones

**"Is this actually secure or a demo trick?"**
There is a documented STRIDE threat model covering tampering, information
disclosure and elevation of privilege for this specific architecture, including
what we have not solved. It was not an afterthought.

**"Show me it working on a site you did not build."**
Do it. Have two real sites bookmarked and ready. This is the question most
likely to separate you from projects that only work on their own fixture.

**"What did you actually build versus what is a library?"**
Ours: the detection rules, the redaction pipeline, the three enforcement
mechanisms, the payload contract, the benchmark and its four baselines, the
extension, the server. Third-party: ONNX Runtime Web, UltraFace, Tesseract,
FastAPI, React — all listed in NOTICE with licences. Apache-2.0 throughout.

### The ones about you

**"Who wrote what?"**
Ownership areas are in the README. Answer for your own area and hand off the
rest — *"that is X's area, let them answer"* is a stronger answer than a vague
one. **Never claim a component you cannot walk through line by line.**

**"What was the hardest bug?"**
Have one ready. The label/scrubber one is excellent: the name detector was given
to the classifier and not to the scrubber, so a name was hidden in a field's
value and sent intact inside a button's label. The zero-leak sweep refused the
run. Two defects, the second bigger — the matcher used non-overlapping pairs, so
*any* name preceded by a capitalised word was invisible. Fifty corpus pages
never exercised that; one real page did, in a minute.

**"What would you do with more time?"**
A named-entity model, so a name is detected because it is a name rather than
because it is on our list. A wider PII taxonomy. Non-Latin OCR. Then formal
security review and the Web Store. **We deliberately did not half-build any of
it**, and none of it is architecturally blocked.

---

## 7. When it breaks in front of a judge

It will, at some point. The recovery matters more than the failure.

| What happened | Do this |
|---|---|
| Server not responding | `curl http://127.0.0.1:8787/health`. Restart uvicorn. The rule path needs no key and no network |
| Hosted model 404s or times out | Say so out loud and keep going — it falls back to the rules automatically and still completes. **This is a designed path, not a save** |
| No internet in the room | Our best moment. The whole stack runs offline. Say it, then show it |
| Extension does nothing | Backend down, or wrong port. Check 8787 |
| Detection misses something live | Do not explain it away. *"That is a real miss — here is the category it falls in and why."* We have a known-limits list for exactly this |
| Everything is broken | Play the backup video. Have it on the laptop, not in the cloud |

**Rule: never say "it worked this morning."** Say what it does, why this failed,
and what the fallback is.

---

## 8. Things not to say

- "It is 100% secure" — say what is guaranteed and what is bounded.
- "We detect names" — say *a list, not a model*.
- "CPU is about 1%" — retracted number. 87–93% for a scan.
- "Our accuracy is 92.4%" — that is PII recall. Metric 1 is 22.2%. Do not blur them.
- Quoting redaction coverage on its own.
- Any per-page metric-1 number.
- Claiming a component you cannot walk through.

---

## 9. Final checklist, the night before

- [ ] Extension built and loaded in Chrome; run the login demo once, end to end
- [ ] Backend running; `/health` returns `ok` and the expected `reasoner`
- [ ] Hosted model name re-checked — **names rot**, `gemini-2.0-flash` already 404'd once
- [ ] Two real sites bookmarked and tested
- [ ] Backup video on the laptop, not in the cloud
- [ ] `05-adversarial.html` open in a tab, ready
- [ ] Laptop charged, charger packed, phone hotspot as wifi backup
- [ ] Everyone has read sections 2, 3 and 5 of this file
- [ ] Each person can name their area and say "that is X's area" for the rest

---

**The posture that has worked for this project all along:** the defensible
position is not a large percentage. It is a number, the corpus it came from, and
what moved it. Every time we chose the honest number over the flattering one, it
turned out to be the stronger answer.
