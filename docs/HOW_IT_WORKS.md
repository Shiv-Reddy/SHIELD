# How Shield works, in plain words

For the whole team. Read this once and you can answer almost any question a
judge asks, including the ones about parts you did not write yourself.

No jargon. Where a technical word is unavoidable, it is explained the first
time it appears.

---

## 1. The problem we are solving

AI agents that can use your computer are everywhere now. You ask one to fill a
form or book a ticket, and to do that it takes a picture of your screen and
sends it to a server somewhere.

**That picture has everything on it.** Your password, your bank balance, your
Aadhaar number, your face, your friend's phone number. All of it goes to a
company's server, and you have to trust them.

Shield's idea is simple: **the AI does not need to see your private things in
order to help you.** It needs to know there is a password box at that spot on
the screen. It does not need to know what the password is.

So we hide the private parts on your own computer, before anything is sent.

---

## 2. How one run works, step by step

When you click Shield and type *"sign in to my account"*, six things happen.
All of steps 1 to 4 happen **on your computer**. Nothing has left yet.

**Step 1 — Take the picture.**
Shield takes a screenshot of the tab you are on. This never leaves your
machine. (~27 milliseconds)

**Step 2 — Read the page structure.**
Every web page is built from HTML code. That code often says what a box is for
— `type="password"`, `autocomplete="email"`. Reading that is far more reliable
than looking at pixels and guessing. We call this the *DOM scan*. (~4ms)

> The DOM is just the browser's internal map of the page: what elements exist,
> where they are, what they contain.

**Step 3 — Look at the picture with a local AI model.**
Some private things are not in the code at all — a face in a photo, an Aadhaar
number printed inside an image. Code cannot find those. So a small AI model
runs **inside your browser** to find faces, and a text reader (OCR) reads words
out of pictures. (~52ms)

> OCR means "optical character recognition" — software that reads text out of
> an image, the way a scanner app reads a receipt.

**Step 4 — Paint over the private parts.**
Every sensitive spot found in steps 2 and 3 gets a **solid black box** painted
on the picture. Not a blur — blur can sometimes be reversed. And in the text
description, real values are swapped for labels like `[PASSWORD]`, `[EMAIL]`,
`[NAME]`. (~40ms)

**Step 5 — Send only the safe version.**
Now, and only now, something leaves your computer: the blacked-out picture, the
text with placeholders instead of values, and your typed task. That is all.

**Step 6 — Get back one action and do it.**
The cloud AI replies with **one** instruction, and it can only be one of three
things: *click*, *type*, or *scroll*. Nothing else is allowed. Shield checks
the target is still the right element, then does it.

The whole local part takes about **135 milliseconds** — roughly a seventh of a
second.

---

## 3. The one rule everything is built around

> **No raw private data leaves your computer. Ever. Under any code path.**

Not "we try hard". A rule that is enforced by the code.

We enforce it **three separate times**, on purpose, because one guard can have
a bug:

1. **A type guard.** The code is written so that a message cannot even be
   *built* unless it has passed the redaction check. Trying to send raw data is
   an error before the program ever runs.
2. **An order guard.** At run time, it checks that every step above actually
   happened in order. If a step was skipped or crashed, the run stops.
3. **A final search.** Before sending, it searches the **entire** outgoing
   message for every value it flagged as private. If any of them is still
   there, anywhere, it refuses to send.

**Guard 3 caught a real bug two days before this event.** A person's name was
correctly hidden in a form field, but the same name was still sitting in a
button's label somewhere else on the page. It refused to transmit. Nothing
leaked. That is the story to tell when someone asks whether this is real or a
demo trick.

---

## 4. Why there are two different modes

**Run mode** is what the demo uses. It looks at the screen you are on, works in
about 135ms, and sends the safe version so the AI can act.

**Scan mode** walks the whole page top to bottom and finds everything private
on it. It is much slower — about 2.9 seconds per screen, because reading all
the text out of a picture is expensive. But it **sends nothing at all**.

That is why they are separate. Run mode cannot afford the slow, thorough
reader. Scan mode can, because it is not waiting on anybody.

---

## 5. How we built it, in order

**First — the rules that find private things.**
Patterns for emails, phone numbers, Aadhaar, PAN, IFSC, UPI. Then reading the
page's own code for hints like `type="password"`. This part finds 160 of the
170 private things in our test set, and costs only 4 milliseconds.

**Second — the redaction.**
Black boxes on the picture, placeholder words in the text. The important
decision here: hide **both**. Covering the picture but leaving the real text in
the message is redaction that looks complete and is not.

**Third — the three guards** described in section 3.

**Fourth — the eyes.**
A face detector and an image text reader, both running inside the browser. This
is what finds things the page code cannot describe.

**Fifth — the server and the action list.**
A small server that talks to a cloud AI. The reply is restricted to click, type
or scroll — checked on the server *and* again on your computer.

**Sixth — measuring everything.**
We built a test set of 50 pages with the private things labelled by hand, and a
scorer that grades us against it. We also scored **four other approaches** we
could have taken instead, so our number means something.

**Seventh — trying to break it.**
A page built specifically to defeat our own detector, with our predictions
written down *before* we ran it.

---

## 6. The numbers, and what they mean in words

| Number | What it means |
|---|---|
| **91.8% recall** | Out of 100 private things, it finds about 92 |
| **83.4% precision** | When it flags something, it is right about 5 times out of 6 |
| **83.8% redaction precision** | Of the area it covers, most of it needed covering |
| **96.5% context kept** | It hides private parts and leaves the rest of the page readable |
| **~135ms** | The local part takes about a seventh of a second |
| **413 + 138 tests** | Automatic checks that run every time we change the code |

**Why we chose to find more rather than be more exact:** missing something
private is a leak. Covering something harmless is just annoying. So when
unsure, we hide it. That choice is why precision is 83% and not higher, and it
was written down before we measured.

---

## 7. The honest limits — say these before a judge finds them

- **Names come from a list, not a model.** We ship a few hundred common first
  names. A name not on the list is not found at all.
- **Only English is read from pictures.** A Hindi page gives nonsense guesses,
  and we do not count those as results.
- **It sees one screen at a time when acting.** It tells you how much of the
  page it actually looked at, every single time.
- **Small faces are missed.** Reliable above 110 pixels wide, unreliable
  around 80, missed below.
- **It cannot stop a website tricking the AI completely.** It limits the
  damage to one of three allowed actions on an element we checked ourselves.

Saying a limit out loud before being asked makes everything else you say more
believable. It has worked for this project all year.

---

## 8. What each person should be able to do

You do not need to have written a part to explain it. You do need to be able to
open the file and walk through it if asked.

| Area | Should be able to explain |
|---|---|
| **Detection** | Why page code beats pixels; what the rules look for |
| **Extension & UI** | The side panel, "What was sent?", the activity log |
| **Backend** | The three allowed actions and why only three |
| **Vision / model** | Why a model runs locally; faces and image text |
| **Testing & data** | The 50-page test set, and the four rival approaches |
| **Docs & demo** | The limits list and the demo order |

**If you are asked about something that is not your area:** say *"that is X's
area, let them answer."* That is a strong answer. Guessing is not.

**Never claim you wrote something you cannot walk through.** A judge who asks
one follow-up will find out, and everything else you said stops counting.

---

## 9. The one-sentence version

> Shield lets an AI agent use your screen without ever seeing your private
> things, because the hiding happens on your own computer first — and we can
> show you the exact thing that was sent.
