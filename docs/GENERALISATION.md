# Generalisation — T2.3

**"Use cases for evaluation will be provided during finale." The pages are
unknown, so the question is not whether Shield works on our pages. It is
whether it works on a page nobody pointed it at.**

This file is the protocol, the static audit, and the results. The protocol
comes first because a sweep two people run differently measures nothing, and
the audit comes before the sweep because a fixture-specific code path would
make every result on this page meaningless.

---

## 1. The static audit — is anything keyed to our own fixtures?

Done by reading the shipped source rather than by running it, because this is a
question about what code exists, not about what one run happened to do.
Re-runnable: the searches are named so the next person gets the same answer or
a different one for a stated reason.

**Result: no fixture-specific behaviour exists in the client or the server.
One fixture-aware code path does exist and is diagnostics-only.**

| Searched for | In | Found |
|---|---|---|
| Fixture filenames (`01-login`, `05-adversarial`, `test-screens`) | `extension/src` | Comments only, plus `isLocalFixture` below |
| Site hostnames (`incometax`, `uidai`, `sbi`, `hdfcbank`, `.gov.in`, …) | `extension/src` | None. The only URL constant is `DEFAULT_ENDPOINT`, the local backend, and it is user-configurable |
| Hardcoded element ids or selectors | `extension/src`, `server` | None. Targets are resolved from the live element map every run |
| A bank or PSP list behind the UPI rule | `lib/pii/indian-ids.ts` | None. The rule is shape-based; `@okhdfcbank` appears only as a comment example |

### The one fixture-aware path, stated rather than buried

`isLocalFixture(pageUrl)` in `background/service-worker.ts` is true for
`file://` and `http://localhost`. It gates exactly two `console.info` calls:
how much of the element map is printed, and whether the redacted frame is
printed as a data URL.

It is worth keeping and it is not a generalisation risk, for a reason that is
checkable rather than asserted: **it gates only logging, and it gates it in the
safe direction.** A real page gets *less* printed, never different behaviour.
Nothing in detection, redaction, transport or action execution reads it. It
exists because a run against a real social feed put other people's names into a
console buffer, and a tool whose whole claim is that private data does not
escape cannot leak it while explaining itself.

If that ever changes — if `isLocalFixture` is consulted anywhere that decides
what is detected, hidden or clicked — this audit is void and the sweep below
measures nothing.

### What the audit found that is NOT fixture-specific, but is a real limit

Both are recorded here because a limit a judge discovers is worse than one we
declare, and neither would have been found by running the sweep.

1. **Submit and consent wording is English-only.** `LOGIN_SUBMIT_WORDS`,
   `SIGNUP_SUBMIT_WORDS`, `NEUTRAL_SUBMIT_WORDS` and `CONSENT_PHRASES` in
   `server/reasoner.py` are English strings matched by substring. A control
   labelled in Hindi or any regional language matches none of them. **The
   failure is safe** — `_find_submit` returns `None` and the reasoner declines
   with "no submit control was found" rather than clicking something else — but
   on a Devanagari portal the rule path will not act at all. The model path is
   unaffected; this is a limit of the no-key fallback.
2. **Checkbox state travels as two exact strings.** `dom-map.ts` emits
   `checked` / `unchecked` and `reasoner.py` compares against those literals,
   because `RedactedDomEntry` carries no control type. The coupling is across
   the trust boundary, so a change on one side breaks consent handling on the
   other with nothing failing loudly.

A third thing the audit confirmed rather than found: `_form_kind` classifies a
form from its **fields**, never from its buttons. The button-wording version was
a fixture-shaped assumption — our login fixture has no sign-up link and every
real login page has one — and a real page caught it. That is the defect class
this whole sweep exists to find, already found once.

---

## 2. Protocol for the sweep

### Rules that are not negotiable

- **Observe-only on every site you do not own.** Shield is not to submit a form
  on a live government or banking portal. The popup's observe-only mode and
  "Scan the whole page" both transmit nothing and act on nothing; that is the
  default for this sweep. Acting is attempted **only** on a site where the
  operator holds the account and has said so in the record.
- **Log out first.** A logged-in session puts a real person's data on screen.
  Every site is visited logged out unless the record says otherwise and the
  account is the operator's own.
- **Decide what is sensitive BEFORE reading Shield's output.** Write the
  expected list down first. This is the same rule the corpus labelling follows,
  and for the same reason: a page scored against the detector's own answer
  measures nothing. **Label the page, never the detector output.**
- **Record the failure, do not fix it mid-sweep.** A detector tuned against the
  page it just failed on stops being a measurement. Failures go in the table;
  fixes happen after the sweep closes.

### Setup

1. Ordinary build — `npm run build`, loaded unpacked from `extension/dist`. Not
   `SHIELD_DEV=1`.
2. Backend running, or not: record which. The rule path needs no key and the
   model path needs one, and they can fail differently.
3. Open the service worker console (`chrome://extensions` → Shield → service
   worker) before the first site. The per-screen and page-agreement lines are
   the measurement and they are not recoverable afterwards.

### Per site

1. Navigate. Wait for the page to settle.
2. **Write down what a careful person would call sensitive on this screen**,
   before running anything.
3. Run **Scan the whole page**. Record from the console:
   - `[shield] screen read at Nx (…)` — the magnification, per stop
   - `[shield] page agreement N% — A agreed, P pixels only (H hidden), D markup only`
   - `[shield] scan complete — N finding(s) across Xpx of Ypx`
   - wall-clock time for the scan
4. Compare the findings against step 2's list. Count found, missed, over-flagged.
5. If — and only if — the site is the operator's own, run one task and record
   the action taken and whether it was correct.
6. Record the row. A site that fails is a result, not a retry.

### What pass and fail mean

Four independent outcomes, recorded separately, because a page can read
perfectly and detect nothing, and reporting one number would hide that.

| Outcome | Passes when |
|---|---|
| **Read** | The element map returned elements, with zero unresolved selectors, and the scan reached the bottom of the document or stated where it stopped |
| **Detect** | Every item on the step-2 list was flagged. A miss is a fail for this site and is named in the table |
| **Redact** | The payload inspector shows no raw value, and the zero-leak sweep did not refuse. On an observe-only pass there is no payload, so this reads *n/a* rather than *pass* |
| **Act** | Only where consented. Elsewhere **not attempted**, which is not a failure and must not be scored as one |

### The site list — at least 20, unmodified

Chosen to cover the categories the benchmark corpus already covers, so a
failure here can be compared against a labelled page of the same kind, plus
deliberate awkward cases.

**Indian government** — income tax, UIDAI, EPFO, GST, Parivahan, Passport Seva,
NSP, CPGRAMS
**Banking and finance** — SBI, HDFC, Axis, ICICI, an insurance quote form, a UPI
or payments page
**Telecom and utilities** — Jio, Airtel, an electricity board
**Commerce and services** — a checkout, a job application, a health appointment
**Controls, where the correct answer is to find nothing** — Wikipedia, Hacker
News, a documentation site
**Deliberately awkward** — a page whose form is inside an iframe; a page with a
`<canvas>`; a single-page app that renders after load; a regional-language
portal, which is where limit 1 above should show itself

### Three task types beyond login

Run on the operator's own accounts, or on a control site where the action is
harmless:

- **Search** — type into a search field and submit
- **Form fill without submitting** — fill a multi-field form, stop before submit
- **Navigation** — click through to a named section

---

## 3. Results

**First nine rows recorded 2026-09-20.** Observe-only, logged out, scan path
only — so nothing was transmitted and nothing was acted on.

**The Detect column is deliberately blank.** The protocol requires the
sensitive list to be written down *before* Shield's output is read, and that
was not done on this pass. Scoring detection against the findings now would be
scoring the detector against its own answer, which is the one thing §2 forbids.
Read, Agreement and Scan time are recorded because they do not depend on it.

These nine were chosen to vary how a page RENDERS rather than what PII it
holds — canvas, Devanagari, dense small text, a late-rendering SPA, text inside
images, dark low-contrast, an iframe, serif — because metric 1 asks whether the
pixel reader can read what the markup reports (DECISIONS.md 235).

| # | Site | Category | Read | Detect | Redact | Act | Agreement | DOM coverage | Scan time | Failure mode |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | google.com/maps | Canvas | pass | *not recorded* | n/a | not attempted | 5.6% | **13.3%** | 42.9s, 1 stop | Image OCR 21.1s for 2 crops — 10.5s each, the worst per-crop cost seen. 761KB frame |
| 2 | india.gov.in/hi | Regional language | pass | *not recorded* | n/a | not attempted | 4.0% | **8.5%** | 47.1s, 8 stops | **143 pixel-only on a Devanagari page with only `eng.traineddata`.** Almost certainly spurious — see the limit below |
| 3 | nseindia.com live equity | Dense tables | pass | *not recorded* | n/a | not attempted | 9.1% | **9.4%** | 26.5s, 4 stops | 785 markup-only, the worst read on the list. Small dense numerals |
| 4 | irctc.co.in/nget/train-search | SPA | pass | *not recorded* | n/a | not attempted | 21.5% | **29.2%** | 33.3s, 5 stops | Face inference 1.4s/stop against 53–65ms elsewhere. **Unexplained** |
| 5 | mygov.in | Text in images | partial | *not recorded* | n/a | not attempted | 15.0% | **20.3%** | 61.3s, 12 stops | **Hit MAX_SCAN_STOPS.** 8744px of 15950px — 55% of the document. Stated, not hidden |
| 6 | apple.com/in | Display type | pass | *not recorded* | n/a | not attempted | 15.0% | **18.6%** | 43.6s, 8 stops | 7 images never fully on screen |
| 7 | github.com/explore | Dark, monospace | pass | *not recorded* | n/a | not attempted | 33.9% | **37.4%** | 50.4s, 10 stops | None. Best page on the list |
| 8 | w3schools.com iframe demo | Iframe, code | pass | *not recorded* | n/a | not attempted | 30.5% | **32.9%** | 39.9s, 8 stops | None |
| 9 | sci.gov.in | Serif, tables | pass | *not recorded* | n/a | not attempted | 17.7% | **23.0%** | 32.5s, 7 stops | 1 image never fully on screen |

**Pooled across these nine plus the income-tax login: agreement 18.4%, DOM
coverage 22.2%** — 762 agreed, 709 pixel-only, 2678 markup-only. Per page the
coverage runs 8.5% to 37.4%, a 4.4x spread, with a median of 21.6% that agrees
closely with the pooled figure — so the pooled number is not an artefact of one
enormous page. See DECISIONS.md 236.

### Task types

| Task | Site | Outcome | Notes |
|---|---|---|---|
| Search | | | |
| Form fill (no submit) | | | |
| Navigation | | | |

### Every failure, and what happened to it

| Site | What failed | Fixed, or recorded as a known limit |
|---|---|---|
| india.gov.in/hi | **143 pixel-only regions on a Devanagari page, with only `eng.traineddata` shipped.** The prediction was near-zero pixel-only; the agreed count was indeed near-zero (11) but the pixel column was the second highest on the list | **Known limit, and the direction it fails in matters.** The engine has no Devanagari model, so those regions are Latin-shaped guesses at Devanagari glyphs. Pixel-only text becomes a scan finding and is redacted, so the failure is towards over-redaction, which is safe — but it inflates the column that metric 1 uses to argue the pixel layer earns its place. **Any pixel-only figure on a non-Latin page is not evidence.** Fixing it means shipping a second language model, which is a size decision nobody has taken |
| mygov.in | Hit `MAX_SCAN_STOPS` at 12 looks, examining 8744px of a 15950px document — **55% of the page** | **Known limit, already declared by the code.** The scan reports `capped, the page continues past the last one` and `stopped early`, and the finding count is stated against the examined height rather than the document height. This is the first real page where the cap has actually bitten, which is worth knowing: a long page gets a partial answer and says so |
| irctc.co.in | Face inference 1.4s per stop, against 53–65ms on every other page in the sweep | **Unexplained, recorded rather than guessed at.** Face detection runs on a fixed 320x240 tensor, so per-frame cost should be constant. It was not the first scan of the session and the session was not disposed. Needs one repeat run before anything is concluded |
| google.com/maps | Image OCR 21.1s for two crops — 10.5s each, against 137ms–1.1s per crop elsewhere | **Recorded.** Map tiles are large photographic images, which is the worst case for the engine. The scan path has the budget for it (DECISIONS.md 188); it is noted because a page of tiles is a plausible finale page |
