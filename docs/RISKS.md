# Risks — Shield

What could go wrong, and what we actually did about it. Status is real, not
aspirational: **Closed** means there is something you can point at.

IDs are kept from the original register so older notes still line up.

---

## Technical

| ID | Risk | What we did | Status |
|---|---|---|---|
| T-01 | The local model is too slow on some laptops | Measured it. One full pass is ~135ms on Chrome, 364ms on Firefox once warm. Every stage is inside its budget | **Closed** |
| T-02 | WebGPU missing or broken on some machines | A CPU fallback is built and proved by a start-up self-test — 126ms to start, 55ms to run, re-checked 2026-09-23 | **Closed** |
| T-03 | Hiding too much breaks the cloud model's reasoning | We use labels like `[PASSWORD]`, not blanket blackout. 96.5% of the page stays readable, measured | **Closed** |
| T-04 | Hiding too little leaks private data | When unsure, hide. Recall is 91.8% over 50 pages, and a page built to defeat us catches 7 of 8 | **Closed** |
| T-05 | The element an action targets has moved or gone | The client re-checks the element — selector, type and label — before acting | **Closed** |
| T-06 | The free model API hits a rate limit near the deadline | Three fallbacks: the rule path needs no model at all, a local model runs offline, and any OpenAI-compatible provider is a config change | **Closed** |
| T-07 | A multi-step task loops forever | A maximum step count stops it with a clear message. Found by a real loop and fixed (DECISIONS.md 227) | **Closed** |
| T-08 | Two code paths over the same text disagree | Found twice for real. Now one shared implementation, plus a test asserting anything the classifier flags, the scrubber removes | **Closed** |

## Security and privacy

| ID | Risk | What we did | Status |
|---|---|---|---|
| S-01 | Private data reaches the server anyway | Three independent guards: a build-time type check, a runtime order check, and a search of the whole outgoing message. Guard 3 caught a real leak path on 2026-09-23 | **Closed** |
| S-02 | A website tricks the model with text on the page | Bounded, not prevented, and we say so. Page text arrives as data, not instructions; the reply can only be click, type or scroll; the client re-checks the target | **Open, bounded** |
| S-03 | Credentials stored by the extension get read | We store none. The server names the field; the device would supply the value. There is no vault to breach | **Closed** |
| S-04 | The model returns an action outside the safe list | Checked on the server **and** again on the client. Two lines, not one | **Closed** |

## Running the demo

| ID | Risk | What we did | Status |
|---|---|---|---|
| O-01 | Venue internet fails during the demo | The whole stack runs offline. A backup video is also recorded — see VIDEO_SCRIPT.md | **Closed** |
| O-02 | The demo laptop behaves differently from the dev machine | Rehearse on the actual presentation laptop. **Only one machine has been measured so far** — a second machine is still owed | **Open** |
| O-03 | Time runs out and an unfinished extra ships instead of a solid core | Strict ordering: the core had to be complete before anything else. Two later ideas were deliberately not started | **Closed** |
| O-04 | Deliverables get rushed at the last minute | Written alongside the build, not after | **Closed** |

## If this continues after the event

| ID | Risk | What we did | Status |
|---|---|---|---|
| B-01 | People do not believe the privacy claim | Open source, published threat model, and a screen showing the exact message that was sent | **Closed** |
| B-02 | Chrome Web Store review rejects or delays it | Not attempted. The Firefox build passes Mozilla's own validator with 0 errors | **Not yet relevant** |
| B-03 | No sustainable way to pay for the backend at scale | Decide once there is real usage, not before | **Not yet relevant** |

---

## Still open, honestly

Three things, and none of them is a surprise:

1. **Prompt injection is bounded, not solved** (S-02). The model still reads
   text an attacker wrote. What we limit is the damage.
2. **Only one machine has been measured** (O-02). Every resource number comes
   from one laptop. A second machine would either confirm them or not, and we
   have not run it.
3. **The known detection limits** in SECURITY_PRIVACY.md — names off the list,
   non-English text in pictures, small faces, addresses in prose.

A risk you can name is better than one a judge finds.
