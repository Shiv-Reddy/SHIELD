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

**Committed empty, deliberately.** A plausible row in this table reads as a
measurement, and this project has already found what that costs: the first
benchmark's figures described four pages written to exercise the code, and
quoting them as an accuracy number would have been a lie told by accident
(DECISIONS.md 210). The protocol above is the part that can be written without
a browser. The rows need somebody with Chrome open.

| # | Site | Category | Read | Detect | Redact | Act | Agreement | Scan time | Failure mode |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

### Task types

| Task | Site | Outcome | Notes |
|---|---|---|---|
| Search | | | |
| Form fill (no submit) | | | |
| Navigation | | | |

### Every failure, and what happened to it

| Site | What failed | Fixed, or recorded as a known limit |
|---|---|---|
| | | |
