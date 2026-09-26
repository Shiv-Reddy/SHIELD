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

## What everyone must know, whatever your part

### The three actions: click, type, scroll

The cloud AI never touches the page itself. It sends back **one small
instruction**, and that instruction can only be one of three kinds:

| Action | What it means | Example from our demo |
|---|---|---|
| **click** | Press something on the page: a button, a checkbox, a link | Click "Approve" on KYC-2043. Click "Release" on one salary |
| **type** | Put text into a box | Type the reply on the support desk. Type 250 on ParaBank |
| **scroll** | Move the page up or down to see more of it | The signup page's "Create account" button is below the screen, so it scrolls down first |

Things to say about them:

- **The AI can't pick any other action.** It cannot run code, open another
  website, download a file, read your files, or send your data somewhere.
  Those actions are not in the list, so any reply like that is thrown away.
- **Every reply is checked twice.** The server checks it first. Then your
  own computer checks it again and makes sure the target is still the same
  box or button, in case the page changed in between.
- **The AI never sees what gets typed into a private box.** For a password
  box it sees only `[PASSWORD]`. It can say *which* box to fill. It can't
  know or send the real value. Shield does not store passwords either.
- **One action at a time.** After each action Shield looks at the page
  again, hides the private parts again, and asks for the next step. If the
  AI asks for the same action twice in a row, Shield refuses. That stops
  something like a double payment.
- **Approve, pay, send and submit are final.** Shield does one and stops. A
  second one needs a person to ask again.

**Why only three?** *"A short list is easy to check completely. Every new
action is a new way to go wrong. These three are enough to fill and submit
almost any form."*

### Which pages to use in the demo (round 2)

**Start from the hub page: `test-screens/index.html`.** It lists every scenario with the exact task to type or say, and a button to open it. The four workplaces are:

| Workplace | Page | Task | Right answer |
|---|---|---|---|
| Bank KYC | `07-bank-kyc.html` | Approve the KYC application that has every document verified and low risk. | KYC-2043 |
| College admissions | `08-college-admissions.html` | Shortlist the highest-ranked applicant whose documents are complete and fee is paid. | ADM-3106 (rank 3) |
| Company payroll | `09-hr-payroll.html` | Release the salary for the engineering employee whose payroll is ready. | EMP-0415 |
| Customer support | `10-support-desk.html` | Tell the customer a free replacement will be delivered within 3 days, and send the reply. | Types the reply, then sends it |

Each one was tested with the real detector and Gemini before the round: 15 out of 15 correct.

### For judges who don't know this field

Most judges won't know that AI agents work by sending screenshots to a server.
Explain it before anything technical, using these.

**Two facts to open with:**
- In 2023 Samsung restricted staff from using ChatGPT after employees pasted
  confidential company code into it.
- India's Digital Personal Data Protection Act, 2023 allows penalties of up to
  ₹250 crore for failing to protect personal data.

**The comparison, in one table (put it on a slide):**

| Option | Can staff use AI? | Is customer data safe? |
|---|---|---|
| Ban AI (what banks do today) | No | Yes |
| A normal AI agent | Yes | No. It sends the whole screen |
| Run the AI fully on the laptop | Yes, but slow (about 22 s a step) | Yes |
| **Shield** | **Yes, about 2 s a step** | **Yes** |

**Who pays:** banks, colleges, insurers and companies, per employee, as the
thing that lets their staff use AI legally. The compliance report is what their
security team buys. Individuals could use it free.

**The one screen that explains everything:** after any run, open **What was
sent?** It now starts with one sentence, such as "63 private items were hidden
before anything left this laptop", then shows what the AI got and never got,
and one row exactly as the AI read it. Read that sentence out loud.

**Let the judge choose:** offer to run **Scan** on any website they name. It
sends nothing, so it's safe anywhere, and nothing builds trust faster.

### Round 2: the 5-minute run (innovation, impact, execution)

Judges score **innovation, impact and execution**. Each part of the run below
is there for one of them. Times are a guide. Practise with a timer.

**0:00–0:40. The problem (impact).** Open `test-screens/index.html`. Say:
> "Round one asked us why anyone would use an AI agent. Here's who: people at
> banks, colleges, companies and support desks, whose screens are full of other
> people's Aadhaar numbers, salaries and phone numbers. Today they're banned
> from AI agents, because every screenshot an agent takes sends that data to a
> server. Shield is what lets them use one."

**0:40–2:00. The hero: bank KYC (innovation).** Open the KYC console. Type:
*Approve the KYC application that has every document verified and low risk.*
**While the AI decides, the page turns into what the AI sees**: every name,
Aadhaar, PAN and account number is covered by a black label like `[NAME]`,
with a banner at the bottom. Point at it and say *"This is all the AI gets."*
Then the covers come off, it approves **KYC-2043**, and a green banner
appears. The Shield panel lists each step and ends with "Clicked Approve
application KYC-2043, then stopped". Then open **What was sent?** and say:
> "The AI picked the right customer out of ten, and it never learned who
> anyone was. Every name, Aadhaar, PAN, account number and balance is a
> placeholder, and the ID card photos are blacked out. The AI got the
> structure of the page. The identities stayed on this laptop."

**2:00–2:40. It's a category, not a demo page (impact).** Back to the hub.
Run **one** more workplace: payroll (*Release the salary for the engineering
employee whose payroll is ready*) or the support desk (*Tell the customer a
free replacement will be delivered within 3 days, and send the reply*, where it
**types** the reply). Say:
> "Same agent, no code written for any of these pages."

**2:40–3:20. A real website we didn't build (execution).** Either ParaBank →
log in `john` / `demo` → Transfer Funds → *Transfer 250 dollars* (it types 250,
clicks Transfer, "Transfer Complete!"), or OrangeHRM, real HR software → log in
`Admin` / `admin123` → PIM → *Search for the employee with ID 0397*. On
OrangeHRM point at the black labels: every employee's name, the signed-in
user's name, even the demo password printed on the login page.

**3:20–4:00. The buyer's view (impact).** Open the **organisation dashboard**
(`http://127.0.0.1:8787/admin`, or the link on the hub). The run you just did
is already counted. Say:
> "The employee gets an AI assistant. The bank's security team gets this:
> every laptop, everything hidden, every request that reached the AI — all
> redacted — and one switch." Flip **Employees approve every request**, run
> the KYC task again, and the panel stops to show exactly what it's about to
> send. "That's who pays for Shield." Flip it back afterwards.

**4:00–4:40. Safety (execution).** Say it, don't demo it:
> "Three guards stop raw data leaving, and the last one searches every
> message before it's sent. The AI can only click, type or scroll. Approve,
> pay and submit are final: Shield does one, then a person has to ask again.
> And the AI has to show its working: before it may click a row, it must
> quote the words in that row that meet the task, and our server checks them.
> When the right employee was scrolled out of view, the AI tried to release
> the wrong one's salary. The check refused it every time."

**4:40–5:00. Numbers, then stop.** *"About 135 milliseconds of our own work
on the device, before the AI replies.
636 automated checks. 92 of every 100 private items found on our 50-page
benchmark."*

**Backup if Gemini or the wifi fails:** run **Scan** on the KYC console
instead. It sends nothing, and still shows every private item boxed. Then
play the backup video for the action.

**Other scenarios, if there's time or a judge asks:**

| Page | Task | What to point at |
|---|---|---|
| `08-college-admissions.html` | Shortlist the highest-ranked applicant whose documents are complete and fee is paid. | It skips ranks 1 and 2 (marksheet missing, fee pending) and picks rank 3 |
| the-internet.herokuapp.com/tables | Delete the row for the person whose website is http://www.timconway.com | Names and emails hidden by their column headers; it picks the right row |
| ParaBank **Register**, fake details, **new username every time** | create this account | The SSN, address and phone are hidden, and it clicks Register |
| `test-screens/05-adversarial.html` | Scan | Seven of eight tricks caught. Point at the one we miss |

**If asked "what stops it approving everyone?":** approve, pay, submit and sign in are final. Shield does one, stops, and a person has to ask again. That's on the report too, under "One decision at a time".

**Voice is switched off for this round.** It's built (on-device, English and
Hindi), but the microphone wouldn't start on the demo laptop. If asked:
> "Voice input runs on the device in English and Hindi, so audio never leaves
> the laptop. It's in the code and switched off today until we've fixed
> microphone access on this machine."

**Don't use these live:**
- `mygov.in`, which is too long. The scan stops at its limit before the end.
- `india.gov.in/hi`. We read only English from pictures.
- `google.com/maps`, which is slow, about 43 seconds.
- Any website opening or navigation. Shield deliberately can't open sites on its own. That's the answer if asked.

**Never use a real account or a real password on stage.** The screen is
projected.

### Final round: what changed after round 2

- **Tables fit the screen the Shield panel leaves** (about 1000 pixels on a
  1366 projector): decision buttons and ID cards stay on screen. Browser zoom
  100%.
- **The side panels open on a customer who is *not* the answer** (KYC-2046,
  EMP-0412). If asked whether the page tells the AI what to pick: *"No. The
  document panel is open on a different application. The AI has to find the
  right one in the queue, and quote the row's own words to prove it."*
- **The panel shows the run as it happens** and ends with the result in a
  green box. **While the AI decides, the page shows what the AI sees**:
  black labels over every private value.
- **Two AI models, then the rules.** If the first is slow or wrong, the
  second is asked (`/health` shows `backup_model`). Tonight's slow spell
  (7–9 s a step) would now cost a few seconds, not the demo.
- **The four workplaces look different**: a bank console, an admissions
  portal of cards, a tabbed HR product, a support inbox.

**Answers judges may push on:**

- *"It depends on Google's AI."* "For choosing the next click, yes, and it
  has a backup model and then safe rules. Shield works with any model that
  speaks the standard API, including one the bank runs itself, and the private
  data never reaches whichever model it is."
- *"These are pages you built."* "Four are, so we could use realistic data
  without touching real customers. Three aren't: ParaBank, OrangeHRM — real HR
  software — and a public data table. Running on those taught our detector
  four new things tonight. Or name any site and we'll Scan it."
- *"Is there an admin console?"* "Yes" — open the dashboard. "Counts only:
  no page content, no field values, no web addresses. The server refuses any
  report carrying anything else."
- *"What if the AI just picks the wrong row?"* "It has to quote that row's
  words, and the server checks them against the page. A wrong row, a word
  that isn't there, or a status like 'pending' the task didn't ask for, and
  the click is refused."

### After each run, open "What was sent?"

This is the proof, so never skip it. Point at three things:
1. The black boxes on the picture.
2. `[PASSWORD]`, `[EMAIL]` and `[NAME]` where the real values were.
3. The action that came back: one click, type or scroll.

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
2. **92.4% recall** — out of 100 private things on a page, we find about 92.
   **83.5% precision** — when we flag something, we're right about 5 times out
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

### More questions you may get

**"Why run the model in the browser and not on a server?"**
> "Because the whole point is that the raw screen never leaves. If we sent it
> to our own server to find the private parts, we would already have leaked
> them. So the finding has to happen on the laptop."

**"Won't that be slow on a normal laptop?"**
> "The local part takes about 135 milliseconds. It uses the graphics chip if
> the browser has WebGPU, and falls back to the normal processor if not."

**"What does 92.4% recall actually mean for a user?"**
> "Out of 100 private things, we find about 92. We also have three guards
> behind that. The last one searches the whole message for anything we
> flagged, and refuses to send if it finds one."

**"What happens without internet?"**
> "It still works. A local model on the same laptop makes the decision, just
> slower: about 22 seconds instead of under 2."

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

### More questions you may get

**"What kinds of private data do you find?"**
> "Passwords, emails, phone numbers, names, addresses, Aadhaar, PAN, IFSC
> codes, UPI IDs, faces, and text inside pictures. If something looks
> private but we can't say what it is, we still hide it."

**"Why black boxes and not blur?"**
> "Blur can sometimes be undone. A solid black box can't. We also swap
> the real text for labels like `[EMAIL]`. Covering the picture but sending
> the real text would only look safe."

**"What about the ID card picture on the signup page?"**
> "The page code can't describe what's inside a picture. That's why we have
> the second layer, which reads text out of images and finds faces."

(Check this one in "What was sent?" before the round, so you know what the
card looks like after hiding.)

**"You hide too much sometimes — isn't that a problem?"**
> "Sometimes, yes. A box with the word 'name' in its label gets hidden even
> when it's only a display name, which isn't private. We chose that.
> Hiding something harmless is a small annoyance. Missing something private
> is a leak."

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

### More questions you may get

**"Explain click, type and scroll."**
Use the table in "What everyone must know" above. The short version:
> "Click presses something, type puts text in a box, scroll moves the page.
> That's the full list. Anything else the AI says is thrown away."

**"Can a website trick your AI? For example, hidden text saying 'ignore your
instructions'?"**
> "It can try, and we don't claim to stop that completely. What we do is
> limit the damage. The worst it can do is one click, type or scroll, on an
> element that really is on the page, and your computer checks that
> element again first. It can't make the AI send your data anywhere,
> because your data was never in the message."

**"Which AI model do you use?"**
> "A free-tier cloud model, and it can be swapped out. Our code doesn't
> depend on one company. With no key, simple rules take over, and there is
> also a local model for offline use."

**"Is the data stored on your server?"**
> "No. It answers and forgets. The logs have only a request ID and a
> time."

---

## Satyanand Gupta — The extension itself, what you actually click

### Your one-line intro

> "I'm Satyanand. I built the extension you actually see and use — the side panel,
> the button you click to run it, and the screen that shows you exactly what
> got sent."

### What you own

- **The side panel** — what opens beside the page when you click the Shield icon: the task box,
  the Run button, the settings
- **Carrying out the action** — actually clicking, typing, or scrolling on the
  page once the AI decides what to do, and double-checking the target is real
  first
- **"What was sent?"** — the screen that shows the exact message that left the
  computer
- **The activity log** — a record of every run, with counts only, no real data
- **The three numbers at the bottom of the panel** — items hidden, runs and
  scans, and times something was sent. If a judge asks where they come from:
  *"We add them up from the history log right above them. Nothing is
  estimated — you can open the history and check every number."

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

### More questions you may get

**"Why a side panel and not a popup?"**
> "A popup closes the moment you click the page. The side panel stays open
> next to the page, so you can watch every step as it happens."

**"How do I know the task actually worked?"**
> "The panel shows each step as it runs. Our test pages also show it
> clearly. Login shows a green 'Signed in' line, and signup shows a green
> 'Account created successfully' banner at the top."

**"Does it work on Firefox?"**
> "Yes, it's the same code built for Firefox. There it opens as a popup,
> because Firefox doesn't have Chrome's side panel. Chrome is our main
> demo."

**"Does it work with Gemini in Chrome, or other AI agents?"**
> "Not yet. A Chrome extension isn't allowed to read or change what
> another program sends. Right now Shield is its own agent. Protecting other
> agents is our next step."

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

### More questions you may get

**"Who is this for?"**
> "Anyone who wants an AI to help on a website but doesn't want to hand
> over their bank page, their ID, or their passwords. That includes people
> at companies where sending screens to an outside AI isn't allowed."

**"What makes this different from other screen agents?"**
> "Other agents send your whole screen. We hide the private parts first,
> on your own computer, and we show you exactly what was sent. That proof
> screen is what nobody else has."

**"How long did this take, and how did you split the work?"**
> Answer truthfully with the real timeline. For the split, point at the
> quick reference table below: each person owns one part.

**"What was the hardest bug?"**
> "A name was hidden in a form box but still showed in a button's label
> elsewhere on the page. Our last guard found it and refused to send, so
> nothing leaked. Then we fixed the cause."

---

## Hard questions anyone can get

If it's your part, answer it. If not, point to the right person.

**"What if your detector misses something?"**
> "It can. That's why there are three guards. The code can't build a message
> that skipped hiding. The steps are checked to have run in order. And
> just before sending, we search the whole message for every value we
> flagged. If one is still there, it isn't sent."

**"Isn't this just a demo trick on your own page?"**
> "Pick any website and we'll scan it now. Scan sends nothing, so it's safe
> anywhere." (Use `github.com/explore` if they don't pick one.)

**"What's the catch?"**
> "Names come from a list, not a model. We only read English from pictures.
> Faces smaller than about 80 pixels get missed. And when acting, it looks
> at one screen at a time."

**"Why should anyone trust you?"**
> "They don't have to. Open 'What was sent?' and read the actual message."

**"Is it open source?"**
> "The repo is private until the event ends, then we make it public so
> anyone can check it."

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
| The side panel, the buttons, "what was sent" | Satyanand |
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

**Before you go in:** everyone reads their own section and the "What
everyone must know" part at the top. Everyone reads the quick reference
table once. Everyone can say the three sentences above without reading them.
That's enough.
