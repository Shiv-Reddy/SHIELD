# What Shield has to do — Shield

Screen-level Hiding of Identifiable Elements using Local Detection.
Team Anarchy.

Requirement IDs (`FR-01` and so on) are referenced from the code and from other
documents, so they never change meaning.

---

## 1. The problem

An AI agent has to see your screen to act on it. Sending a screenshot to a
cloud model sends **everything** on it — passwords, bank details, faces,
private messages. Right now you have to pick: a useful agent, or your privacy.

## 2. The solution

Find and cover the private parts **on your own computer**, before anything is
sent. The cloud model gets a blacked-out picture and labels like `[PASSWORD]`,
works out what to do, and sends back one allowed action that the extension
carries out locally.

## 3. What we set out to prove

**For the event:** that the full loop works, measurably, on real pages, on both
browsers the problem statement names — capture, find, cover, send safely, act.

**For a real product:** working on any site, rules an organisation can
configure, and a lasting audit trail.

## 4. What we are deliberately not doing

Mobile. Training on user data. Any paid API. Storing passwords. Letting the
server send arbitrary instructions.

One change: supporting more than one browser used to be out of scope. The
problem statement names Chrome and Firefox, so it is in (DECISIONS.md 214).

## 5. How we are scored

| What | Weight |
|---|---|
| Reading the screen accurately | 25% |
| Finding private data — recall and precision | 20% |
| Covering it precisely | 20% |
| Not hogging the laptop | 20% |
| Speed, end to end | 15% |

Full rubric and where we stand: [EVALUATION_CRITERIA.md](./EVALUATION_CRITERIA.md).

**Make it correct first, fast second.** Never the other way round.

## 6. Who it is for

| Who | What they need |
|---|---|
| An ordinary browser user | An agent that helps without seeing their password |
| A privacy-conscious employee | Proof it was not sent, not a promise |
| A technical evaluator | Claims they can check — the actual bytes |
| A security reviewer | A threat model and an audit trail |

## 7. Scope

**Built:** Chrome (main), Firefox, Edge. Login autofill, multi-field sign-up,
face covering, marking things yourself, the trust screens, local AI with a CPU
fallback.

**Designed for but not built:** Web Store publishing, an organisation policy
console, the full set of private-data categories, picking a model size by
device, outside security review.

## 8. The requirements

✅ built · ⬜ not built · ✂ deliberately cut

### Reading the screen
| ID | Requirement | Status |
|---|---|---|
| FR-01 | Take a picture of the tab when asked | ✅ |
| FR-02 | Run a local AI model to identify what is on it | ✅ |
| FR-03 | Take it again if the page changes mid-task | ✅ |
| FR-04 | Reach content below the fold | ✅ The whole-page scan walks the document screen by screen |

### Finding private data
| ID | Requirement | Status |
|---|---|---|
| FR-05 | Find password boxes from the page's own code | ✅ |
| FR-06 | Find name, email, phone and address fields | ✅ |
| FR-07 | Find faces in the picture | ✅ |
| FR-08 | Read ID numbers printed inside images | ✅ Proved by the adversarial page: an Aadhaar number in a JPEG, with no element to find |
| FR-09 | When the code and the picture disagree, treat it as private | ✅ |
| FR-10 | Categories an organisation can configure | ⬜ The categories exist; letting an organisation set them is full-product work |

### Covering it
| ID | Requirement | Status |
|---|---|---|
| FR-11 | Cover flagged areas of the picture before sending | ✅ |
| FR-12 | Replace flagged values with placeholder labels | ✅ |
| FR-13 | Meaningful labels, not blanket blackout | ✅ |
| FR-14 | Let the user change how much is hidden | ✅ It can only ever hide **more**. `standard` is the floor and there is no setting below it (DECISIONS.md 234) |

### Sending and reasoning
| ID | Requirement | Status |
|---|---|---|
| FR-15 | Send only cleaned data — no code path may skip this | ✅ |
| FR-16 | The server passes the cleaned context to the model | ✅ |
| FR-17 | The server returns one structured action | ✅ |
| FR-18 | Retry sensibly when the network hiccups | ✅ |
| FR-19 | Swap the reasoning model without changing code | ✅ Proved — a local model worked with no code change at all |

### Doing the action
| ID | Requirement | Status |
|---|---|---|
| FR-20 | Carry out click, type or scroll | ✅ |
| FR-21 | Check the target is still there first | ✅ |
| FR-22 | More kinds of action, like drag and select | ✂ Widens the security boundary, and there was no time to review it properly |

### Showing the user what happened
| ID | Requirement | Status |
|---|---|---|
| FR-23 | Say what it is doing — reading, hiding, thinking, done | ✅ |
| FR-24 | Show *why* each thing was hidden | ✅ |
| FR-25 | Show the exact message that was sent | ✅ Saved before sending, so it still has an answer when the network fails |
| FR-26 | A lasting log the user can export | ✅ Counts and categories only — no page content, no values, no web addresses |

### When things go wrong
| ID | Requirement | Status |
|---|---|---|
| FR-27 | Fall back to the CPU when WebGPU is missing | ✅ Proved by a start-up self-test |
| FR-28 | Clear errors, never a silent failure | ✅ |
| FR-29 | Pick a model size to suit the device | ⬜ |

## 9. The rules that do not bend

1. **No raw private data leaves the computer.** Not negotiable.
2. **If unsure, hide it.**
3. **Shield never stores or sends a password.** It names the field; the device
   supplies the value.
4. **The action list is fixed:** click, type, scroll.
5. **A failed redaction stops the run.** It never falls back to sending the
   real picture.

## 10. Other targets

| Area | Target |
|---|---|
| Speed | A few seconds at most. Currently ~135ms for the local part |
| Security | No raw private data leaves the computer, on any code path |
| Accessibility | Works by keyboard, readable contrast |
| Browsers | Chrome (main) and Edge on the same bundle, plus Firefox |
| Uptime (full product) | 99%+ backend availability |

## 11. What the user sees

**The popup:** what it is doing, a box to type the task, Run, marking things
yourself, observe-only mode, timings, the sent-message inspector, and which
build is running.

**On the page:** the overlay showing what was hidden, and a marking surface
with its own Run button.

## 12. Where data lives

| Data | Where | Does it leave? |
|---|---|---|
| The original picture | Extension memory, dropped after use | **Never** |
| The blacked-out picture | Extension memory | Yes, after covering |
| Values from the page | In the page only | Never raw — labels only |
| The web address | On your device | **Never** |
| Passwords | Nowhere. Not stored | **Never** |
| The activity log | Your browser's storage | Only if you export it |

## 13. Words we use

**Redaction** — covering private content with a solid box, or swapping it for a
label, before anything is sent.

**Semantic placeholder** — a label like `[PASSWORD]` that keeps the meaning
while removing the content.

**Zero-leak check** — an automatic search of the outgoing message for any real
value. One hit and the message is not sent.

**Sanitized seal** — a type in the code that only the redaction step can
produce, so uncleaned data cannot reach the sending code even by mistake.
