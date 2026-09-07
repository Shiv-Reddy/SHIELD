# Test Screens

The mock pages from [TESTING.md](../docs/TESTING.md) Section 1. Version
controlled rather than recreated ad hoc, per TESTING.md Section 10, so results
stay comparable between runs and between machines.

Open one directly with `file://`, or serve the folder if you need a real origin:

```bash
npx serve test-screens     # then http://localhost:3000/01-login.html
```

## Ground rules

- **Synthetic data only.** No real credentials, names, or contact details, ever
  (TESTING.md Section 10). Values here look plausible so they exercise the same
  detection paths real data would, and nothing more.
- **No external resources.** No CDN fonts, no remote images, no analytics. A
  fixture that renders differently offline, or breaks when someone else's CDN
  changes, is not a fixture. Local files referenced by relative path are fine —
  they load offline and cannot change underneath a measurement.

### Screen 3 needs two images you supply

`03-faces.html` expects `face-a.jpg` and `face-b.png` beside it. They are **not
version controlled** (see `.gitignore`), for two reasons that pull the same way:

- A drawn or synthetic face does not reliably trigger a detector trained on
  photographs, so the synthetic-data rule above cannot be satisfied here without
  making the screen useless.
- Photographs of real people carry licensing and likeness questions that a
  committed, submitted fixture should not decide silently.

Any two portrait photographs work. Without them the page still loads and the
control text still tests the false-positive half of the pass criteria; only the
face detections are missing.

The page renders the same face at six descending widths as well as two full-size
portraits. That is deliberate: the frame is downscaled to the model's 320-pixel
input, so some size exists below which a face stops surviving the resize, and
the ladder measures where rather than leaving it a guess.
- **Change a screen only deliberately.** These are the baseline that latency and
  detection numbers are measured against. Editing one silently invalidates every
  earlier measurement, so note it in
  [SESSION_LOG.md](../docs/SESSION_LOG.md) when you do.

## Status

| # | Screen | File | Status |
|---|---|---|---|
| 1 | Basic login form | `01-login.html` | Built |
| 2 | Multi-field signup form | `02-signup.html` | Built |
| 3 | Video call / profile photo | `03-faces.html` | Built — needs local images |
| 4 | Clean control page | `04-clean.html` | Built |
| 5 | Adversarial / edge cases | `05-adversarial.html` | Built |

Screens 1, 2, 4 and 5 run automatically on every `npm test` in `extension/`,
from element maps in `extension/tests/fixtures/screens.ts`. That covers
detection, redaction, the manifest and the transport seal. It does not cover
extraction, capture, the canvas or the executor — those need a real browser and
are still run by hand.

Screen 6 in TESTING.md — real, unmodified third-party sites — is Full Product
scope and is deliberately not represented here.

## Screen 1: Basic login form

Textbook markup on purpose. This is the baseline: if detection cannot handle a
well-formed login form, nothing further is worth measuring. Deliberately
awkward markup belongs in Screen 5, where a failure is informative rather than
just broken.

It is also the page the primary demo task runs on (DECISIONS.md), so it earns
its keep twice.

**What it exercises**

| Element | What it tests |
|---|---|
| `<label for="username">` | Label resolution via the explicit `for` association |
| `autocomplete="username"` | The primary PII attribute signal (Module B, FR-06) |
| `type="password"` + `autocomplete="current-password"` | Password detection (FR-05), and that the value is never read |
| Pre-filled password | That Shield reports `[has value]`, not the string |
| `<input type="checkbox">` | Checkbox value reading (`checked` / `unchecked`) |
| `<a href="#reset">` | Anchor classified as `button`, since it is a click target |
| `<button type="submit">` | The action target for the primary demo task |
| Heading, intro, footnote | `text` regions, and that they are *not* over-redacted |

**Expected element map** (Module A, Task 3 — check against the
`console.table` in the service worker console):

- Around 10-14 elements, all inside the viewport
- `0` unresolved selectors
- The password input: `type: input`, `inputType: password`,
  `autocomplete: current-password`, `label: Password`, `hasValue: true`
- The username input: `label: Username`, `autocomplete: username`,
  `hasValue: true`
- "Forgot password?": `type: button`, `label: Forgot password?`
- Every input and button carries a non-empty `label`

Empty labels here would be a genuine problem, not a cosmetic one: DOM signals
are the primary detector (DECISIONS.md), so a label that fails to resolve on
markup this clean means detection will fail on anything harder.

**Pass criteria** (TESTING.md Section 1) — reached once Modules B, C and D land:
password redacted before transmission; username and submit correctly
identified; correct action sequence returned and executed.

## Screen 2: Multi-field signup

Screen 1 asks whether detection works on a clean form. Screen 2 asks whether it
works at scale and across signal types, which is a different question — one
field per category is a demonstration, ten is a measurement.

The signals are deliberately uneven, because real forms are: some fields declare
themselves with an `autocomplete` token, some only with an input type, one with
nothing but a placeholder, one with nothing but a `name` attribute. The expected
result for each is written into the page itself, before it was ever run.

Two of those expectations are the interesting ones.

**"Display name" is flagged as a name, and that is over-redaction.** The label
contains the word the pattern looks for. It is included so the cost of the
default-to-hide bias is visible somewhere concrete rather than only asserted;
special-casing it would be tuning the detector against the fixture.

**The referral dropdown changed the rules.** It was hidden as `other` on the
first run, which was correct under the rule as written — and the rule was the
thing worth changing. A `<select>` holds one of the page author's own options,
so nothing a user entered can be in it. See DECISIONS.md.

This page is a fixture, not Phase 2's signup feature. Phase 2 is Shield
completing a signup task end to end; this exists so that work has something to
be measured against when it starts.

## Screen 5 is meant to be partly failed

Each block on the adversarial screen is a case where the primary DOM signal is
absent or actively lying. Two of them are expected to be missed, and that is
recorded in the file itself and in
[SECURITY_PRIVACY.md](../docs/SECURITY_PRIVACY.md) Section 4.1: a person's name
in prose, which cannot be told from other words without a named-entity model,
and an ID number rendered inside an image, which needs the deferred OCR pass.

The honest use of this page is to record which cases pass and which do not.
Tuning the rules until the page goes green would stop it measuring anything —
a fixture you optimise against is no longer a test.
