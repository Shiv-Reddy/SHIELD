# Team guide — who says what

One file per person. Read your own section a few times before the event.
Simple English, nothing fancy — say it the way it is written here, in your own
words.

There are five of you. Each person below has: a one-line intro, what you own,
three facts to know cold, what to say if a judge points at your part, and what
to say if they ask about someone else's part.

---

## How to use this file

1. Read your own section until you can say it without looking.
2. Read the "Say this if asked" lines for your part out loud, more than once.
3. Skim everyone else's **one-line intro** so you know who to point to.
4. The team round-up at the end is what you say together, in order, at the
   start.

**The one rule for everyone:** if a judge asks about a part that is not yours,
say *"that's [name]'s part, let them answer"* and step back. That is a strong
answer. Guessing about someone else's code is not.

---

## Say this together, at the start

Whoever speaks first says this line, then each person gives their one-line
intro from below, in order.

> "We are Team Anarchy. We built Shield — a browser extension that lets an AI
> agent use your screen without ever sending your private data to a server.
> The private stuff gets hidden on your own computer, before anything is sent
> anywhere. I'm going to show you exactly what gets sent, so you don't have to
> take our word for it."

Then whoever is driving the laptop starts the demo.

---

## Shivkumar Reddy — Lead, local AI model, and testing

### Your one-line intro

> "I'm Shivkumar, the lead. I built the local AI model that reads the screen,
> and I put together how everything connects — extension to server and back.
> I also run our tests and measure how well everything actually works."

### What you own

- **The local AI model** — the part that runs inside the browser and finds
  faces and reads text inside pictures
- **Wiring it all together** — how the screenshot, the page reading, the
  hiding, and the sending all happen in the right order
- **Testing and measurement** — the 50-page test set, the numbers, and the
  page built to try to break our own detector

### Three facts to know cold

1. **The whole local part takes about 135 milliseconds** — roughly a seventh
   of a second. Screenshot, reading the page, running the AI model, and hiding
   the private stuff, all together.
2. **91.8% recall** — out of 100 private things on a page, we find about 92.
   **83.4% precision** — when we flag something, we're right about 5 times out
   of 6.
3. **It also runs fully offline.** No internet, no cloud AI — a local model on
   the same laptop still gets the job done, just slower (about 22 seconds
   instead of under 2).

### Say this if asked "how does the AI actually understand the screen?"

> "Two ways. First, we read the page's own code — a password box says
> `type="password"` right there in the code, so that's the most reliable
> signal there is. Second, for things code can't describe — a face in a photo,
> a number printed inside an image — we run a small AI model right there in
> the browser. Nothing about the screen leaves the computer until after both of
> those have already hidden the private parts."

### Say this if asked "how do you know it actually works?"

> "We built a 50-page test set with every private thing marked by hand, and we
> score ourselves against it automatically, every time we change the code. We
> also built a page specifically designed to trick our own detector, and wrote
> down what we expected to happen before we ever ran it — seven out of eight
> tricky cases are caught."

---

## Shashank Kumar — Finding the private data

### Your one-line intro

> "I'm Shashank. I built the part that actually finds what's private on a
> page — passwords, names, phone numbers, ID numbers, faces — before anything
> gets covered up."

### What you own

- **The detection rules** — the part that looks at a page and decides "this is
  a password box", "this is a phone number", "this text has someone's name in
  it"
- **Face detection** — finding faces in the screenshot
- **Reading text out of pictures (OCR)** — finding an Aadhaar number or similar
  printed inside a photo
- **Deciding what gets covered up and how** — turning a "this is a password"
  decision into an actual black box or a label like `[PASSWORD]`

### Three facts to know cold

1. **Reading the page's own code finds 160 of our 170 test cases**, and it
   only takes 4 milliseconds. That's why we trust page code first and pictures
   second.
2. **Names are found from a list, not a smart model.** We check for a few
   hundred common first names followed by any capital-letter word. It's
   honest to call this "a list, not a model" — a name that isn't on the list
   is simply not found.
3. **When we're not sure if something is private, we hide it anyway.** That's
   a deliberate choice — missing something private is worse than covering
   something harmless by mistake.

### Say this if asked "how do you tell a password field from a normal one?"

> "Mostly the page tells us itself — `type="password"` in the code is about as
> certain as it gets. When the code doesn't say, we look at labels and
> placeholder text — words like 'password' or 'pwd'. And for things with no
> label at all, like a value that just looks like a phone number sitting in
> plain text, we check the shape of the text itself."

### Say this if asked "what does your detector definitely miss?"

> "A name that isn't on our list — most non-Indian names, unusual spellings.
> Addresses and birthdates written in a sentence. Faces smaller than about 80
> pixels wide. We wrote all of this down on purpose rather than waiting for
> someone to find it."

---

## Ayush Verma — The backend, where the AI decides what to do

### Your one-line intro

> "I'm Ayush. I built the backend server — it takes the cleaned-up, private-data-free
> version of the screen, sends it to the AI model, and makes sure whatever
> comes back is safe to actually do."

### What you own

- **The server** — a small Python program that receives the safe screen data
  and talks to the cloud AI model
- **Building the message sent to the AI model** — turning the screen data
  into something the model can reason about
- **Turning the AI's answer into a real action** — and checking that answer is
  actually one of the three allowed things

### Three facts to know cold

1. **The AI can only ever reply with one of three things: click, type, or
   scroll.** Nothing else. If it somehow tried to reply with anything else,
   the server throws it away before it even reaches your computer.
2. **The server keeps nothing.** It answers the request and forgets it. Its
   logs only ever have a request ID and a timestamp — never what was on the
   screen.
3. **No API key needed to run the whole demo.** Without one, the server just
   uses simple rules instead of a cloud AI, and the main demo still works
   completely. The AI model is what widens what it can understand — it's not
   a requirement.

### Say this if asked "what stops the AI model from doing something dangerous?"

> "Two things. First, it can only ever answer with click, type, or scroll —
> that's it, nothing else is a valid reply. Second, we check that answer twice
> — once on the server, and again on your own computer before anything
> actually happens, including checking the target is still really there on the
> page."

### Say this if asked "what if the cloud AI is down?"

> "Then the server falls back to simple rules automatically, and the demo
> still finishes. We built it that way on purpose — a live demo depending on
> someone's free-tier API being up is a single point of failure we didn't want."

---

## Satyanand Gupta — The extension itself, what you actually click

### Your one-line intro

> "I'm Satyanand. I built the extension you actually see and use — the popup,
> the button you click to run it, and the screen that shows you exactly what
> got sent."

### What you own

- **The popup** — what you see when you click the Shield icon: the task box,
  the Run button, the settings
- **Carrying out the action** — actually clicking, typing, or scrolling on the
  page once the AI decides what to do, and double-checking the target is real
  first
- **"What was sent?"** — the screen that shows the exact message that left the
  computer
- **The activity log** — a record of every run, with counts only, no real data

### Three facts to know cold

1. **"What was sent?" is saved before the request goes out**, not after. So
   even if the network fails or the AI never replies, you can still see
   exactly what was about to be sent.
2. **Before anything actually gets clicked or typed, we re-check the target is
   still the right element** — same type, same label — in case the page
   changed in between.
3. **The activity log never has real values in it.** Just counts, categories,
   and whether anything got sent. You could hand that file to anyone without
   leaking what it was protecting.

### Say this if asked "how do I know you're not lying about what gets sent?"

> "Open 'What was sent?' — that's the whole point of it. It's not a summary,
> it's the actual message, saved before it left the computer. You can read the
> exact JSON. If you don't trust us, don't take our word — read it yourself."

### Say this if asked "can I make it ask me before every single send?"

> "Yes, there's an 'Ask before sending' setting. It's off by default though,
> because that's not what actually keeps your data safe — the hiding happens
> either way, before anything is built into a message at all. The switch is
> there for people who want to see every single one, not because we need
> permission to keep the promise."

---

## Isha Kumari — Docs, demo, and telling the story

### Your one-line intro

> "I'm Isha. I keep track of what's done and what's next, and I make sure we
> can actually explain this project clearly — the docs, the numbers, and the
> demo script."

### What you own

- **Keeping the task list and session notes up to date** — what's been built,
  what's left, what changed and why
- **The README and the docs** — making sure anyone opening the project can
  understand it
- **The demo script and judge Q&A** — the order we show things in, and the
  answers to the hard questions

### Three facts to know cold

1. **We publish the numbers that make us look worse, on purpose.** Example:
   painting the whole screen black would score 100% on "coverage" — but it
   destroys 891 out of 891 harmless things on the page. We show that
   comparison so our real number means something.
2. **Every limit we have is written down before anyone finds it.** Names come
   from a list. Only English is read out of pictures. Small faces get missed.
   We say all of this before being asked.
3. **Backup plan for a broken demo:** a recorded video, kept on the laptop
   itself, not on the internet — in case wifi or the laptop itself gives
   trouble.

### Say this if asked "how do we know these numbers are real?"

> "Every number comes from a test set we built and labelled by hand — 50
> pages, every private item marked. The scoring runs automatically and writes
> the results into a file in our own project, so the same test gives the same
> number every time, and anyone can re-run it."

### Say this if asked "what would you do with more time?"

> "A real name-detection model instead of a list, so it catches names we've
> never seen before. Reading text out of pictures in languages other than
> English. And a proper outside security review before this ever went out to
> real users. We didn't half-build any of these — we picked what to finish
> properly instead."

---

## Quick reference — who to point to

| If a judge asks about... | Point to |
|---|---|
| How the local AI model works, faces, OCR internals | Shivkumar |
| The overall numbers, testing, how well it performs | Shivkumar |
| How something specific gets detected as private | Shashank |
| What gets missed and why | Shashank |
| What happens on the server, the AI model, the three allowed actions | Ayush |
| Whether the demo can survive the AI being down | Ayush |
| The popup, the buttons, "what was sent" | Satyanand |
| Whether an action is safe to actually run | Satyanand |
| The bigger picture, the story, "what's next" | Isha |
| Anything about docs, the README, our numbers on paper | Isha |

---

## Three things everyone should be able to say, no matter your part

**What is this, in one sentence?**
> "An AI agent that can use your screen, without your private things ever
> reaching a server — because the hiding happens on your own computer first."

**How do we know it's not lying?**
> "Open 'What was sent?' It's the exact message, saved before it left the
> computer. You can read it yourself."

**What's the biggest thing you're still honest about not solving?**
> "Names are found from a list, not a real model — so an unusual name gets
> missed. We say this before anyone asks, because it's true and it matters
> more than pretending otherwise."

---

**Before you go in:** everyone reads their own section, everyone reads the
quick reference table once, and everyone can say the three sentences above
without reading them. That is enough.
