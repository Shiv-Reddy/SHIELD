# Roadmap — Shield

Where the project has got to, and where it would go next. The early phases are
written as what happened, not as what was planned.

---

## Done — building it

**The detection rules first.** Patterns for email, phone, Aadhaar, PAN, IFSC,
UPI, plus reading the page's own code for hints like `type="password"`. This
part alone finds 160 of the 170 private items in our test set, in 4
milliseconds.

**Then redaction.** Black boxes on the picture and labels in the text. Both,
always — covering the picture while leaving the real text in the message is
redaction that looks finished and is not.

**Then the three guards** that make "nothing private leaves" a rule the code
enforces rather than a promise.

**Then the eyes.** Face detection and image text reading, both inside the
browser, for the things page code cannot describe.

**Then the server** and the three allowed actions, checked in two places.

**Then measurement.** 50 pages labelled by hand, a scorer, and four rival
approaches scored the same way so our number means something.

**Then trying to break it.** A page built to defeat our own detector, with
predictions written down before the first run.

## Done — making it a product

- Apache-2.0 licence and a NOTICE listing every third-party piece
- A privacy policy written for whoever installs it, not for engineers
- Store-ready archives for both browsers, checked by unpacking them again
- The server in a 202MB container, running as a non-root user
- Firefox passes Mozilla's own validator: 0 errors, 0 notices

## Done — proving it

- Both browsers measured on the same machine
- The six test screens run on Chrome and Firefox
- Edge verified on the Chrome bundle
- An experiment proving the model actually reads the picture, rather than
  assuming it because we send one
- A full offline run on a local model, no key and no internet

---

## Next — the two we scoped and chose not to build yet

Both were considered before the event and deliberately left alone, because
neither adds anything to how the project is scored and both risk a working
demo. Written down so the reasoning survives.

**Shield in front of other agents.** Our server already speaks the common
chat-completions shape, so any tool that lets you set its endpoint could route
through us. The work is porting ~1,150 lines of detection rules to Python, and
faces and image text cannot port at all — they run in the browser. Estimated
2–4 days, and it creates two copies of the same rules in two languages, which
is exactly the kind of drift that has already caused two real bugs here.

**Redacting the page itself.** Rather than intercepting an agent's traffic,
change what there is to read: paint over the private parts in the live page so
*anything* looking at that tab sees the redacted version. This is the more
interesting product. It also has a sharp edge — you must never rewrite a form
field's real value, or you break the user's actual login — and single-page apps
re-render and undo your changes. Estimated 3–5 days.

**Neither can be done by intercepting Chrome's built-in AI.** No extension can.
Manifest V3 has no way to rewrite another component's request body, and
browser-native AI never passes through extension networking at all. That is a
platform limit, not a gap in this build.

## Next — accuracy

- A proper name model, so a name is found because it *is* a name rather than
  because it is on our list
- More languages read from pictures — today we ship English only
- A wider set of private-data categories
- Addresses and dates of birth in ordinary prose, which we miss entirely

## Next — reach

- A second machine measured, so the resource numbers are not from one laptop
- 20 real sites swept rather than nine
- More task types than login and sign-up
- Chrome Web Store submission, once there is time for a review queue nobody
  controls

## Later — if it keeps going

- A small group of real users, and honest numbers about whether it helps them
- A security review by someone who did not build it
- An enterprise version: configurable rules, audit export
- A way to pay for it at scale, decided when there is real usage and not before

---

**Nothing past the event is committed.** Continuing is a choice to make with
real interest and real time, not a default. When it is decided, it goes in
DECISIONS.md with the reason.
