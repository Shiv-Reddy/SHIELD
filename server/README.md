# Shield backend

FastAPI service implementing `/analyze` and `/health` from
[API_SPEC.md](../docs/API_SPEC.md).

## Run it

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# .venv/bin/python -m pip install -r requirements.txt     # macOS/Linux

.venv/Scripts/python -m uvicorn main:app --port 8787
```

Then `curl http://127.0.0.1:8787/health`.

Run the checks with `.venv/Scripts/python test_reasoner.py` (82) and
`.venv/Scripts/python test_prompt.py` (56) — 138 in total. No pytest, no
network, no key: they run anywhere the server runs.

## Connecting a reasoning model

The choice of provider is configuration, not code. Every candidate free tier —
Groq, OpenRouter, Together, Google's OpenAI-compatible endpoint — speaks the
same chat-completions shape, so the adapter targets that shape and reads
everything else from the environment:

```bash
export SHIELD_MODEL_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
export SHIELD_MODEL_NAME=qwen/qwen2.5-vl-32b-instruct:free
export SHIELD_MODEL_KEY=<your key>
export SHIELD_MODEL_VISION=0     # only to force text-only; on by default
```

`GET /health` reports which path a request will take, so "is the model wired
up?" is answerable without sending one. It also reports `vision`, which is
`on`, `off`, or `refused` — the last meaning the configured model rejected an
image and is being sent text only.

### The model, and why this one

Open weights, because the problem statement requires it. **Qwen2.5-VL-32B-
Instruct**, Apache 2.0, hosted free on OpenRouter for the demo.

The licence is the first filter and it has already cost us one candidate:
DECISIONS.md 186 rejected OmniParser's icon detector over AGPL-3.0 inherited
from Ultralytics. Apache 2.0 is the same standard applied to the server side.
Llama 4 Scout is the obvious alternative and is genuinely strong at this, but
the Llama 4 Community Licence carries an acceptable-use policy and a naming
requirement, which is a different thing from open.

### Running it offline, on the same weights

The problem statement says "offline deployable", and that has to be more than a
sentence. Nothing about this server assumes a cloud: the adapter speaks
chat-completions to whatever `SHIELD_MODEL_ENDPOINT` points at.

With Ollama, which is the shortest path on a laptop:

```bash
ollama pull qwen2.5vl:7b        # 6.0 GB, Q4_K_M
export SHIELD_MODEL_ENDPOINT=http://127.0.0.1:11434/v1/chat/completions
export SHIELD_MODEL_NAME=qwen2.5vl:7b
export SHIELD_MODEL_KEY=ollama  # not checked locally, but the adapter sends one
```

With vLLM, for a machine that can hold the 32B:

```bash
vllm serve Qwen/Qwen2.5-VL-32B-Instruct --port 8000
export SHIELD_MODEL_ENDPOINT=http://127.0.0.1:8000/v1/chat/completions
export SHIELD_MODEL_NAME=Qwen/Qwen2.5-VL-32B-Instruct
```

The honest part: the cloud demo runs the 32B and the laptop path runs the 7B.
Same family, same licence, same wire format, same prompt — a smaller model, and
we should say so rather than implying one binary runs everywhere. Ollama serves
the 7B on CPU at roughly 3–8 tokens/second, which is usable for a single action
per screen and not for anything faster.

### The frame is sent by default

It did not use to be. Text-only free tiers are commoner and the DOM summary
alone handles the form tasks in scope, so the frame was opt-in — which meant the
capability the problem statement is named after was built, redacted, sealed,
verified, and then usually left behind.

Turning it on by default cannot be allowed to break a text-only configuration,
so if the provider rejects a request carrying an image the adapter retries that
same request without it, answers from the model anyway, and remembers for the
life of the process. `/health` then reads `"vision": "refused"`.

The template is told which case it is in. It used to describe a screenshot in
every request regardless, so a text-only call carried three sentences about
black rectangles the model had never been shown — not harmless, since it invites
reasoning about a picture that is not there. `build_prompt(request, with_frame)`
now decides both together.

With none of these set the server runs the rule-based path, which is the default
and the demo's contingency. With them set, any failure — an unreachable
provider, a rate limit, a reply that breaks a rule — falls back to the same
path, logs why, and answers anyway. That behaviour is verified rather than
assumed: pointed at a dead endpoint, the server logged
`fell back to rules: provider call failed (URLError)` and returned the correct
action.

## The model's reply is untrusted input

Not because a provider is assumed hostile, but because the reply is influenced
by page content nobody controls, and because a model that has simply
misunderstood produces exactly the same malformed output as one that has been
manipulated.

Four things are checked before a reply becomes an action:

- The verb is on the allowlist.
- The selector is an element we actually described. Without this the model could
  name any element on the page, including one deliberately left out of the
  summary, and the client would look it up.
- A `type` action is not aimed at a redacted field with a literal value. A model
  writing real text into a field we hid has either hallucinated a credential or
  been handed a leaked one, and the two are indistinguishable from here — so the
  rule is the shape of the value, not a comparison against something we would
  have to hold in order to compare.
- The summary shown to the user is capped.

Any failure discards the reply and falls back to the rules.

## The prompt treats the page as data

`prompt.py` builds a versioned, redaction-aware template. It teaches the model
that a placeholder marks something present-but-hidden rather than missing, that
the black rectangles in the screenshot are ours, and that a credential must be
asked for by reference and never written out.

It also assumes the page is hostile. Labels and text come from whatever site the
user is on, and a page can contain a sentence addressed to the model. Page
content is JSON-encoded inside a labelled boundary and never interpolated into
instruction text, so no page string can introduce a newline or close a section,
and values are truncated — volume is the cheapest injection there is.

That bounds the problem rather than solving it. What limits the damage is the
allowlist above and the client re-verifying the target element before acting.
Recorded as a threat in SECURITY_PRIVACY.md rather than claimed as handled.

## It works without a reasoning model

`reasoner.py` has a rule-based path that needs no model, no API key and no
network. It reads the redacted DOM summary, recognises a login form by its
placeholder tokens, and returns the corresponding action.

This is not a stub waiting to be deleted. It is the demo's contingency: a live
demo that depends on somebody's free tier being up at 10am on judging day has a
single point of failure outside our control, and DEMO_SCRIPT.md requires the
primary task to be reliable. It also let the entire client pipeline be built and
tested end to end while the model choice was still open.

It is deliberately narrow. It recognises login and sign-up shapes and declines
everything else rather than guessing, because a wrong action on a real page is
worse than an honest "I don't know".

## What it never does

- **Never logs a payload.** Only `request_id`, timings and outcomes. The payload
  arriving here is redacted, not harmless — it still describes somebody's
  screen, and a log is exactly the kind of store that outlives a request.
  Validation failures log the exception *type*, never its message, because that
  message is built from the payload.
- **Never returns an action outside the allowlist.** Enforced here as well as on
  the client. The check is unreachable while the reasoner is rule-based and is
  kept anyway: it becomes reachable the moment a model is wired in, which is
  exactly when nobody will remember to add it.
- **Never sees or returns a credential.** The action carries
  `[USE_SAVED_CREDENTIAL]`, a reference the client resolves against its own
  local data. The server has no real value and must never be sent one.

## Known gaps

- **CORS is open.** The extension calls from `chrome-extension://<id>`, and that
  id differs between machines and between packed and unpacked loads, so it
  cannot be pinned for a hackathon build. Tightening it to the published id is a
  Full Product task.
- **No rate limiting or auth.** Both are Full Product scope per API_SPEC.md
  Section 7.
