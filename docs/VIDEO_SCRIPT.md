# The backup video — what to record

This video exists for one reason: **the live demo fails and you still need to
show the project works.** Wifi dies, the laptop freezes, Chrome updates
overnight. When that happens you play this and keep talking.

So record it like a demo, not like an advert. No music, no logo animation, no
transitions. Just the screen, working.

**Length: 3 to 4 minutes.** Shorter than that and you have not proved anything.
Longer and nobody watches to the end.

---

## Before you hit record

- [ ] Close every other tab, window and notification. A Slack popup on screen
      is the kind of thing a judge remembers instead of your project
- [ ] Extension built and loaded, backend running, `/health` returns `ok`
- [ ] Zoom the browser to about 125% so text is readable when projected
- [ ] Do one full practice run without recording. Get the timing in your hands
- [ ] Record in 1080p. Use OBS, or Windows `Win+Alt+R`

**Record your voice with it.** A silent screen recording makes a judge guess
what they are looking at. If your English is not confident on the day, record
the voice separately and play the video muted while you narrate live — but
still record a voice track as the fallback for the fallback.

---

## The six shots

### Shot 1 — the problem (20 seconds)

Show a normal login page with real-looking details filled in. Say:

> "This is a page with a password, an email and a phone number on it. Today, if
> you ask any AI agent to help you here, it takes a screenshot and sends the
> whole thing to a server. Everything you see, they see."

**Do not skip this shot.** Without it the rest is a technical demo of something
nobody asked for. This is the 20 seconds that makes the other three minutes
matter.

### Shot 2 — Shield runs (40 seconds)

Click the Shield icon. Type the task in plain words: *sign in to my account*.
Let it run. Say what is happening as it happens:

> "Shield takes the screenshot on my machine. A small AI model running inside
> my browser finds the sensitive parts. It paints black boxes over them before
> anything is sent."

Let the action actually complete. **Show the form being filled and the click
happening.** A demo that stops before the result looks like it does not have
one.

### Shot 3 — the proof (60 seconds) — THE MOST IMPORTANT SHOT

Open **"What was sent?"** in the popup. Slow down here. Zoom in if you can.

> "This is the exact thing that left my computer. Not a summary of it — the
> real payload, recorded before it was sent. The picture has black boxes over
> the password and the face. The text says `[PASSWORD]` and `[EMAIL]` instead
> of the real values. The AI on the server never saw the real ones."

Scroll through it. Let the judge read it.

**If you only have 60 seconds of video, use them on this shot.** Everything
else is a screen agent, which many teams have. This is the part that is yours.

### Shot 4 — it does not just work on your own page (40 seconds)

Open a **real website you did not build**. Run Shield on it.

> "This is a real site. We did not write it and we did not prepare it."

This kills the biggest doubt a judge has, which is that the whole thing is
hardcoded to one page. Record two sites if you have time.

### Shot 5 — trying to break it (40 seconds)

Open `test-screens/05-adversarial.html` and run it.

> "We built a page specifically to defeat our own detector. Eight tricky cases.
> We wrote down what we expected to happen before we ran it the first time.
> Seven of the eight are caught."

Then point at one and be honest:

> "This one we still miss. It is written down as a known limit."

**Showing the failure on purpose is the strongest 10 seconds in the video.**
Judges have watched demos all day where everything works. Almost nobody shows
them the one that does not.

### Shot 6 — no internet (30 seconds)

Turn wifi off. Run it again. It still completes.

> "No internet. The whole thing still runs, because the fallback works without
> any cloud model at all."

End there. No outro, no thank-you slide.

---

## What to say over the numbers, if you include them

Do not put a wall of statistics on screen. If you show numbers, show these four
and say them in plain words:

| On screen | Say out loud |
|---|---|
| Recall 91.8% | "It finds about 92 out of every 100 sensitive things" |
| Redaction precision 83.8% | "When it covers something, it is usually right to" |
| 96.5% context kept | "It hides the private parts and leaves the rest readable" |
| ~135ms | "The whole local loop takes about a seventh of a second" |

---

## Things that ruin a backup video

- **Music.** You will be talking over this in a noisy hall
- **Speeding up the footage.** It reads as hiding a slow demo
- **Cuts in the middle of a run.** A judge assumes the missing part failed
- **Starting with architecture diagrams.** Show it working first, always
- **Recording it at 3am the night before.** You will sound like it

---

## After you record

- [ ] Watch it once all the way through, with sound
- [ ] Put it **on the laptop**, not in Google Drive. You may have no internet
- [ ] Put a copy on a phone and a pen drive
- [ ] Check it plays on the laptop you are actually taking
- [ ] Know where the file is without searching for it
