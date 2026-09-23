# Setting Shield up on a new machine

For anyone joining the build. Follow it top to bottom once; everything after
that is `git pull` and `npm run build`.

Budget 20 minutes, most of it `npm install` and `pip install` downloading.

---

## 0. Before anything: the one rule

**The API key is not shared, and never travels through chat, email or a file in
the repo.**

Shield runs its whole demo with **no key at all** — the backend falls back to a
rule-based reasoner that needs no model and no network. So the normal setup for
a new machine is *no key*, and everything in this guide works without one.

If a machine needs the model path, that machine generates **its own** free key
(Section 6). One key shared five ways is one key that gets revoked five ways.

---

## 1. Access

The repository is private. Ask the maintainer for a collaborator invite on
GitHub, then accept it by email before cloning.

## 2. Prerequisites

| Need | Version | Check with |
|---|---|---|
| Git | any recent | `git --version` |
| Node.js | **24 or later** | `node --version` |
| Python | **3.14** | `python --version` |
| Chrome | latest | — |

Node 24 is a floor, not a preference: the tests run TypeScript through Node's
own type stripping and its built-in runner, so there is no transpiler and no
test framework to install. Below 24 the suite will not start.

Python 3.14 matters for the same reason in reverse — `requirements.txt` is
pinned to releases with prebuilt 3.14 wheels, so installing needs no Rust
toolchain. An older Python will try to build `pydantic-core` from source and
fail on a machine without Rust.

Firefox and Edge are both supported and neither is required to get started.
Edge runs the same Chromium bundle as Chrome.

## 3. Clone, and set who you are

```bash
git clone https://github.com/Shiv-Reddy/SHIELD.git
cd SHIELD

git config user.name  "Your Name"
git config user.email "your@email"
```

Set the identity **per repository**, as above, rather than globally — it is the
difference between your commits being yours and being someone else's.

## 4. Install the commit guard

```bash
git config core.hooksPath tools/hooks
```

One command, and it is the only setup step with no substitute. Git does not
clone hooks, so this runs on every machine separately or it does not run at all.

It refuses any commit that stages a `.env`, a private key, a face photograph, or
a line of source with a credential pasted into it. `.gitignore` cannot do this —
it only protects paths nobody has staged, and it has never had an opinion about
a key pasted into a `.ts` file.

Confirm it is live:

```bash
git config --get core.hooksPath     # -> tools/hooks
```

## 5. Build and load the extension

```bash
cd extension
npm install
npm run build
```

The face-detection model is committed, so nothing is downloaded at runtime. The
build prints `manifest consistent` when the output is sound and refuses to
finish when it is not.

**Chrome or Edge**
1. `chrome://extensions` (Edge: `edge://extensions`)
2. Turn on **Developer mode**
3. **Load unpacked** → select `extension/dist`

**Firefox**
```bash
npm run build:firefox
```
1. `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on** → select `extension/dist-firefox/manifest.json`

Firefox blocks extensions on `file://` pages by default, so the local test
screens need `extensions.content_script_on_file_urls` set in `about:config`, or
serving them over HTTP.

## 6. Run the backend

```bash
cd server
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# .venv/bin/python -m pip install -r requirements.txt     # macOS/Linux

.venv/Scripts/python -m uvicorn main:app --port 8787
```

The extension expects `http://127.0.0.1:8787/analyze`. Confirm with:

```bash
curl http://127.0.0.1:8787/health
```

`reasoner` in the reply says which path a request will actually take — `rules`
with no key, `model` with one. That distinction is readable before a request is
sent rather than discovered during a demo.

### Only if this machine needs the model path

Copy the template and fill in a key this machine generated:

```bash
cp .env.example .env
```

`.env` is ignored by Git and refused by the commit guard, in that order. Do not
copy someone else's `.env` onto this machine.

Any OpenAI-compatible provider works — the adapter targets the chat-completions
shape, not a vendor. If the model is unreachable or answers with something
unusable, the request falls back to the rules and still completes.

## 7. Check it actually works

```bash
cd extension && npm test          # 405 checks
cd extension && npm run typecheck # no output means clean

cd server && .venv/Scripts/python test_reasoner.py   # 82 checks
cd server && .venv/Scripts/python test_prompt.py     # 56 checks
```

138 server checks in total. None of them need a network or a key.

Then the end-to-end check: open one of the pages in `test-screens/`, click the
Shield icon, and run the login task. The popup's **"What was sent?"** view shows
the exact payload that left the machine — that view is the point of the project,
so it is worth looking at once on day one.

## 8. What never gets committed

Already ignored, and the commit guard refuses them a second time:

- `.env` and anything matching `.env.*` — except `.env.example`, which is the
  tracked template and must stay empty of keys
- `*.key`, `*.pem`, `*.p12`, `*.pfx`
- `test-screens/face-a.jpg` and `face-b.png` — real photographs, kept local for
  licensing and likeness reasons. Supply your own to run Screen 3; see
  `test-screens/README.md`
- `node_modules/`, `dist/`, `dist-firefox/`, `.venv/`, `__pycache__/`

`extension/public/models/ultraface-rfb-320.onnx` is committed **on purpose** and
must stay that way — the build fails without it.

## 9. When something goes wrong

| Symptom | Cause |
|---|---|
| `/bin/sh^M: bad interpreter` on commit | Hook checked out with CRLF. `.gitattributes` pins it to LF; re-clone or `git checkout -- tools/hooks` |
| Tests exit immediately, no output | Node below 24 |
| `pip install` tries to compile `pydantic-core` | Python is not 3.14 |
| Build fails at `verify-models` | The `.onnx` was deleted locally; `git checkout -- extension/public/models` |
| Extension loads but does nothing | Backend is not running, or is on a port other than 8787 |
| `/health` says `reasoner: rules` and you expected `model` | `.env` was not read — it must be in `server/` or the repo root, and an exported shell variable overrides it |
| Content script dead on a `file://` page in Firefox | `extensions.content_script_on_file_urls` in `about:config` |

## Where to go next

- [README.md](../README.md) — what Shield is and how it is built
- [SECURITY_PRIVACY.md](./SECURITY_PRIVACY.md) — the threat model and the known limits
- [TASKS.md](./TASKS.md) — what is next; the driver for all work
- [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) — the conditions a demo has to run under
