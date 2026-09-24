# What Shield is built with

Two parts: what is actually built, and what a real product would add later.
Do not add the second part early — it costs time and buys nothing at this size.

---

## 1. What is built

### The browser extension

| Part | Choice |
|---|---|
| Browsers | Chrome (main demo) and Firefox. Edge runs the Chrome bundle unchanged. DECISIONS.md 214 |
| Extension format | WebExtensions, Manifest V3. `npm run build:firefox` generates the Firefox manifest from Chrome's, so the two cannot drift apart (DECISIONS.md 203) |
| Language | TypeScript |
| Local AI | ONNX Runtime Web |
| Speed-up | WebGPU, falling back to CPU when it is missing |
| Face detection | UltraFace RFB-320 — MIT licence, trained on WIDERFACE |
| Reading text in pictures | Tesseract.js, run only on image crops, not the whole screen |
| Popup interface | React 19 and Tailwind 4 — **popup only**. Nothing else in the extension uses either, and neither touches the pipeline (DECISIONS.md 241) |
| Reading the page | Plain JavaScript |

The vision model is aimed at what page code **cannot** describe — faces, text
baked into images — rather than at identifying buttons, which markup already
does better and faster.

### The server

| Part | Choice |
|---|---|
| Framework | FastAPI (Python) |
| Reasoning model | Any OpenAI-compatible provider. Currently Gemini 3.5 Flash Lite; a local model on Ollama works with no code change |
| API | REST and JSON — see [API_SPEC.md](./API_SPEC.md) |
| Where it runs | On your own machine, at `127.0.0.1:8787`. **Not hosted** — DECISIONS.md 262 explains why |

**The server is not hosted on purpose.** It has no login and no rate limit
because it was written to be reached from the same machine. Public, it would be
an open relay. It also means the demo survives the venue wifi dying.

### Testing

| Tool | Why |
|---|---|
| Node's own test runner | No test framework to install. 413 checks |
| Node's own TypeScript support | No compiler step for tests |
| Plain Python asserts | 138 server checks, no pytest |
| `performance.now()` | Every stage timed on every run |

**No test framework, no network, no API key.** The tests run anywhere the code
runs. That was deliberate — a test suite that needs an install step is one that
somebody eventually skips.

---

## 2. What a real product would add

Not built. Listed so the path is clear, not so it gets built early.

**Infrastructure:** cloud hosting in containers; automated build and deploy; a
GPU-backed model service separate from the API; PostgreSQL for audit logs and
organisation settings; Redis for rate limiting; a proper secrets manager.

**Monitoring:** structured logs, a dashboard for speed and error rates, and
alerts when either gets worse.

**Stores:** Chrome Web Store (developer account, privacy disclosure, listing
assets), Firefox Add-ons, Edge Add-ons.

**Security:** dependency scanning on every release, and an independent review
of the redaction pipeline by someone who did not build it.

---

## 3. Getting from here to there

1. **Keep redaction independent of any framework.** It already is, which is why
   the Firefox port did not touch it.
2. **Keep the model behind a clean interface.** Already proved — a local model
   worked with no code change at all, just three environment variables.
3. **Add a database only when something actually needs storing.** Today the
   server keeps nothing, which is a privacy feature, not a gap.
4. **Add monitoring and automated deploys before any public beta**, not now.

---

## 4. Deliberately not used

- **Any paid API.** Everything runs on free tiers or locally
- **Model training.** We only run pre-trained models
- **Kubernetes, managed databases, any production infrastructure.** Overhead
  with no benefit at this size

---

## 5. What it costs

**Nothing.** Pre-trained open models, free-tier hosting, local compute.

A real product would have real infrastructure costs, and those should start
only when there is a reason to run at that scale — see
[ROADMAP.md](./ROADMAP.md).
