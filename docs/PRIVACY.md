# Privacy Policy — Shield

**Last updated: 2026-09-21. Applies to Shield 0.1.1 for Chrome, Edge and Firefox.**

This is the plain-English statement of what Shield collects. It is written for
whoever installs it. The engineering version — threat model, attacker
capabilities, the limits we have not solved — is in
[SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md), and the two are kept consistent
deliberately: if one changes, the other is wrong.

---

## The short version

**Shield collects nothing.** No account, no sign-up, no analytics, no telemetry,
no crash reporting, no advertising identifier, no cookies. Nothing is sent
anywhere unless you ask Shield to act on a screen, and what is sent then is
described below in full.

This is not only a promise. The Firefox build declares
`data_collection_permissions: ["none"]` in its manifest, which is a statement
made to the browser vendor rather than to you, and the code enforces it three
separate ways — a type that a payload cannot carry raw pixels through, a guard
on the order of pipeline stages, and a sweep that inspects every outgoing
payload for leaked values before it is allowed out.

---

## What stays on your device, always

- **Screenshots.** The picture of your screen is captured, analysed and redacted
  on your machine. The original, unredacted frame never leaves it under any code
  path.
- **The contents of form fields.** Passwords, names, email addresses, phone
  numbers, addresses and identity numbers are replaced with placeholder labels
  before anything is transmitted.
- **Your browsing.** Shield does not record which sites you visit. URLs are not
  transmitted and not stored.
- **Credentials.** Shield stores no passwords of any kind. When an action needs a
  secret, the server is told only *which field* needs one; your own device
  supplies the value. There is no vault, so there is nothing to breach.

Shield reads a page only when you ask it to. It uses the `activeTab` permission,
which means it has access to the tab you invoked it on, at the moment you
invoked it — not to every site you visit.

---

## What is sent, when you ask Shield to act

One request, to one endpoint you control, containing exactly four things:

| What | What it actually contains |
|---|---|
| A request id | A random identifier for this one request. Not linked to you or to any other request |
| Your task, in your words | For example "sign in to my account" — typed by you |
| A **redacted** screenshot | The same picture, with solid black rectangles painted over every detected sensitive region. Not blurred; blur is reversible and we do not use it |
| A description of the page's elements | Labels and positions, with sensitive values replaced by placeholders such as `[PASSWORD]`, `[EMAIL]` or `[REDACTED]` |

**You can see this for yourself.** The popup has a "What was sent?" view showing
the exact payload, recorded before the request leaves — so it still has an
answer when the network fails. We would rather you checked than believed us.

**Where it goes is your choice.** By default the endpoint is
`http://127.0.0.1:8787/analyze` — a server on your own machine, so out of the box
nothing leaves your computer at all. If you point Shield at a different endpoint
in its settings, that operator receives the redacted request above. Shield does
not ship with a hosted service configured, and the extension will not send
anything to an address you did not enter.

**The reasoning model can be run locally too.** With a local model the entire
system works with no internet connection.

---

## What the server receives, and what it keeps

The reference server keeps nothing. It holds a request in memory long enough to
answer it and then discards it. Its logs record request identifiers, timings and
error types — never page content, never field values, never URLs.

The server can return only three instructions: click, type, or scroll. It cannot
return arbitrary commands, and your device independently re-checks the target
element before acting on any of them.

---

## What is stored on your device

In the browser's own extension storage, readable only by Shield:

- **Your settings** — the endpoint, whether to ask before sending, inference
  preferences.
- **An activity log** — for each pass: when it ran, how much of the page it
  examined, how many items of each category were found, and whether anything was
  transmitted. **Categories and counts only.** No page content, no field values
  and no URLs, which is deliberate so that the log can be handed to somebody else
  — a colleague, an auditor, a judge — without leaking what it was protecting.
- **Scan records** — redacted pictures of the screens a whole-page scan examined,
  so you can confirm afterwards that your information really was covered.

All of it stays on your device. Removing the extension removes all of it. None of
it is ever uploaded.

---

## Third parties

Shield contains no analytics, no advertising and no third-party tracking of any
kind. It makes exactly one outbound request, to the endpoint you configured, and
only when you ask it to act.

The face-detection and text-recognition models run entirely on your device and
are shipped inside the extension. They are not downloaded at runtime and they
send nothing anywhere. See [NOTICE](../NOTICE) for what they are and who wrote
them.

---

## Children

Shield is a developer and productivity tool. It is not directed at children and
collects no information from anyone, including children.

---

## Known limits, stated rather than buried

We would rather you heard these from us.

- **Names are detected from a list, so unfamiliar ones are missed.** Shield
  recognises a few hundred common given names and hides the name that follows
  one. A name whose first name is not on that list — many non-Indian names,
  unusual spellings, a surname on its own — is not detected at all. Details in
  SECURITY_PRIVACY.md Section 5.1.
- **Only English text is read from images.** We ship `eng` training data only. On
  a page in another script, the text recogniser produces Latin-shaped guesses —
  which fails towards hiding too much rather than too little, and is still not
  the same as working.
- **A page that changes after a scan can drift.** A scan's findings describe the
  page as it was when the scan ran. If the page reflows, the coverage moves —
  again towards over-hiding.
- **Shield reads one screen at a time when acting.** It tells you how much of the
  page it actually examined on every run, rather than leaving you to discover it.

---

## Changes

Material changes to this policy will be accompanied by a version bump and a note
in [DECISIONS.md](./DECISIONS.md). The Firefox manifest's
`data_collection_permissions` declaration is the first thing that would have to
change if Shield ever started collecting anything, and changing it leaves a
paper trail rather than being an omission nobody notices.

## Contact

Shield is an open-source project. Questions, and anything that looks like a
privacy defect, belong in the issue tracker:
https://github.com/Shiv-Reddy/SHIELD
