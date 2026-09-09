# Security & Privacy — Shield

## 1. Trust Boundary

Everything before transmission runs on the user's device. The boundary is the
transport layer. Only sanitized payloads cross it.

## 2. Data Classification

| Class | Examples | Rule |
|---|---|---|
| Never transmitted | Passwords, credentials, page URL, raw frame | Blocked by construction |
| Tokenised | Email, name, phone, address, ID numbers | Replaced with `[CATEGORY]` |
| Redacted visually | Faces, marked regions | Opaque fill before transmit |
| Transmitted | Redacted frame, tokenised DOM summary, task query | Sealed payload only |

## 3. Threat Model (STRIDE)

| Threat | Vector | Mitigation |
|---|---|---|
| Spoofing | Malicious page impersonating a form | Target re-verified against the capture before acting |
| Tampering | Server returns an unexpected action | Fixed allowlist: click, type, scroll |
| Repudiation | No record of what was sent | Payload inspector; audit log planned |
| Information disclosure | Raw data reaching the server | Type seal + stage guard + zero-leak sweep |
| Denial of service | Oversized page, runaway loop | Element cap, step cap, timeouts |
| Elevation of privilege | Injected instruction in page text | Content is JSON data, never instruction. Allowlist bounds the blast radius |

## 4. Redaction Policy

1. DOM signals are primary. Vision is supplementary.
2. Uncertain ⇒ hide.
3. A mark hides **pixels and values**. Pixels alone is redaction that looks
   complete and is not.
4. Semantic placeholders preserve meaning without content: `[PASSWORD]`,
   `[EMAIL]`, `[NAME]`, `[PHONE]`, `[ADDRESS]`, `[ID_NUMBER]`, `[FACE]`.
5. Labels are scrubbed like values — a label can carry an account address.
6. A failed redaction stops the run.

## 5. Known Detection Limits

Stated plainly: a boundary a reviewer discovers is worse than one we declare.

**Names in page text are not detected.** Shield redacts declared PII fields,
formatted identifiers and faces. A person's name as ordinary text or a link
label is indistinguishable from any other words without a named-entity model,
which this build does not carry. Verified against a real social feed: names in
link and button labels produced no DOM detections.

**Faces below ~80px wide are missed, and 80px is marginal.** Measured at the
0.3 threshold on `03-faces.html`, which renders one face at eight sizes: found
6 of 8 — both portraits plus 200, 150, 110 and 80px; missed 55 and 36px. The
80px rung scored **0.312 against a 0.3 threshold** — twelve thousandths of
margin. State the floor as *between 80 and 110px, unreliable at the bottom*.

Cause is the downscale into the model's 320px input: a 6× reduction, so 80px
reaches the model as ~13px. The two misses produced no candidate at any cutoff,
making this a **resolution limit, not a threshold one** — lowering the threshold
gains nothing and costs false positives. A face needs roughly 4–6% of viewport
width to be detected reliably.

**Text inside images is read, but only as well as the engine reads it.** OCR
runs over image crops and feeds the same rules a form field goes through. Where
a read fails the image is covered whole rather than let through — a candidate
was already judged large enough to hold a document, and without reading it we
cannot claim it does not.

**A run examines one screen, and says so.** `dom-map.ts` filters the element
scan to the viewport and capture is `captureVisibleTab`, so content below the
fold is never detected — and, being never captured, never transmitted. This is a
COVERAGE boundary, not a leak, and the two must not be conflated when weighing
what a fix is worth.

The risk it does carry is one of reading: a field with no box over it looks
checked rather than unexamined. So every run reports how much of the document it
read, whether or not the page scrolls, and "Scan the whole page" walks the whole
document in overlapping viewports and reports everything it finds. That scan
transmits nothing at all — it builds no payload and reaches no transport — which
is what makes it affordable to spend several seconds and several captures on.
A scan that stops early, on an endless page or a scroll-locked one, draws the
line where it stopped on the page itself.

**Prompt injection is bounded, not prevented.** Page content is JSON-encoded as
data and the allowlist is fixed at three verbs, so the blast radius is small.
The model still reads attacker-controlled text.

**What answers all of these without pretending to solve them:** the user can
draw a rectangle over anything and have it hidden. Not a detection improvement
and not counted as one — it helps only a user who notices. But every limit above
is a case where the person looking at the screen knows something the rules
cannot, and the honest answer is to let them say so rather than widen patterns
until they over-redact.

## 6. Verifiability

Every privacy claim is checkable, not asserted:

| Claim | How to check it |
|---|---|
| Only redacted data is sent | Payload inspector shows the exact bytes |
| Detection found X | Overlay draws every region, with its reason |
| Redaction ran | Type seal makes the alternative uncompilable |
| Nothing leaked | Zero-leak sweep runs on every request |
| Cost of privacy | Latency panel, per stage, against budget |

## 7. Audit Logging (planned)

Categories, counts, rule names, timestamps. **Never values.** Local storage,
user-exportable, opt-in retention.

## 8. Compliance Notes

On-device processing means no sensitive data is transferred to a processor,
which is the strongest position under GDPR/DPDP. The audit log is designed to
hold no personal data, so the log itself does not become a liability.

## 9. Incident Response (Full Product)

Detect via zero-leak sweep failures → stop transmission → notify the user →
patch, publish the cause, and add a regression test before shipping again.
