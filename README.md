# Shield

**Screen-level Hiding of Identifiable Elements using Local Detection**

A Chrome extension that lets an AI agent read and act on your screen without
ever sending your private information (passwords, faces, personal details)
to a server unprotected. Built for Smart India Hackathon 2026,
Problem Statement SIH26171 (ISRO).

## What It Does

Shield runs a small AI model directly in your browser to understand what's on
your screen. Before anything is sent anywhere, it automatically detects and
hides sensitive information. Only the safe, cleaned-up version is sent to a
cloud AI model, which decides what action to take next (like clicking a
button), and Shield performs that action for you.

## Status

Phase 1 (core) is complete and verified end to end. On the primary demo task —
a login form — one pass takes roughly 150ms of measured work: capture 34ms, DOM
scan 2ms, local inference 52ms, redaction 45ms, server round trip 6ms, each
inside its budget.

The privacy invariant has three independent guards: a phantom type that makes
transmitting unredacted data a compile error, a runtime stage-order check, and a
content search that refuses to transmit if any flagged value still appears
anywhere in the payload.

Known limits are documented rather than discovered:
[SECURITY_PRIVACY.md](./docs/SECURITY_PRIVACY.md) Section 4.1 lists what Shield
does not detect, and why.

## Documentation

This project includes a full documentation set — read these in this order
if you're new to the project:

1. [PRD.md](./docs/PRD.md) — full product requirements (hackathon + full product scope)
2. [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system design, data flow, components
3. [SECURITY_PRIVACY.md](./docs/SECURITY_PRIVACY.md) — threat model, redaction policy, compliance notes
4. [API_SPEC.md](./docs/API_SPEC.md) — client-server API contract
5. [TECH_STACK.md](./docs/TECH_STACK.md) — technology choices, hackathon + production
6. [TESTING.md](./docs/TESTING.md) — full test strategy and test screen definitions
7. [RISKS.md](./docs/RISKS.md) — full risk register
8. [ROADMAP.md](./docs/ROADMAP.md) — timeline from prep through production
9. [TASKS.md](./docs/TASKS.md) — current build status
10. [DECISIONS.md](./docs/DECISIONS.md) — log of settled choices and reasoning
11. [DEMO_SCRIPT.md](./docs/DEMO_SCRIPT.md) — live demo walkthrough and Q&A prep
12. [EVALUATION_CRITERIA.md](./docs/EVALUATION_CRITERIA.md) — the weighted judging rubric
13. [SESSION_LOG.md](./docs/SESSION_LOG.md) — what happened each work session

## Setup Instructions (Hackathon Build)

### Prerequisites
- Google Chrome (latest version)
- Node.js (version ___) for building the extension and running the backend
  (if using Node/Express)
- Python (version ___) if using FastAPI for the backend
- [ Fill in: any API keys needed for the chosen free-tier AI model ]

### Client (Browser Extension)

```bash
cd extension
npm install
npm run build
```

Then load the extension in Chrome:
1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/dist` folder

### Server (Backend)

```bash
cd server
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # Windows
# .venv/bin/python -m pip install -r requirements.txt     # macOS/Linux

.venv/Scripts/python -m uvicorn main:app --port 8787
```

The extension expects `http://127.0.0.1:8787/analyze`. Check it is up with
`curl http://127.0.0.1:8787/health`.

**No API key is needed.** The backend ships a rule-based reasoner that runs with
no model, no key and no network, and it handles the primary demo task. That is
deliberate: a live demo depending on somebody's free tier being up on judging
day has a single point of failure outside our control.

To connect a reasoning model, set three environment variables — see
[server/README.md](./server/README.md). Any OpenAI-compatible provider works,
and if the model is unreachable or answers with something unusable, the request
falls back to the rules and still completes.

## Project Structure

```
shield/
├── extension/           # Chrome extension client
│   ├── public/          # manifest.json and generated icons
│   ├── src/
│   │   ├── background/  # Service worker: orchestration, capture
│   │   ├── content/     # In-page code: DOM map, action execution
│   │   ├── popup/       # Status UI
│   │   └── lib/         # Shared types, messages, timing
│   ├── tools/           # Build-time asset generation and model pinning
│   ├── tests/           # Unit and integration tests (`npm test`)
│   └── dist/            # Build output — this is what Chrome loads
├── server/              # FastAPI backend: /analyze, /health, prompt builder
├── test-screens/        # Mock pages for testing (TESTING.md Section 1)
├── docs/                # Project documentation
├── CLAUDE.md            # Working agreement and session protocol
└── README.md
```

See [extension/README.md](./extension/README.md) for client build details and
the two invariants a contributor needs to understand before changing the
pipeline.

## How to Use

1. Load the extension as described above.
2. Start the backend server.
3. Navigate to a webpage with a form.
4. Click the Shield extension icon to activate it.
5. Watch it detect and hide sensitive fields, then complete the task.

## Testing

```bash
cd extension && npm test        # 50 checks, no test framework dependency
cd server && .venv/Scripts/python test_reasoner.py
cd server && .venv/Scripts/python test_prompt.py
```

The client suite runs the detection → redaction → transport-seal pipeline
against four of the five test screens on every run, so a regression in what
Shield hides fails immediately rather than at the next manual check.

See [TESTING.md](./docs/TESTING.md) for the full test screen set and pass/fail
criteria. The Zero-Leak Verification described in Section 6 is no longer a
manual pre-demo procedure — it runs inside every request and refuses to transmit
on a hit — but the demo laptop should still be run once before judging.

## Production Deployment (Full Product, Not Required for Hackathon)

If continuing this project beyond the hackathon, see:
- [TECH_STACK.md](./docs/TECH_STACK.md) Section 2 for the full production
  infrastructure stack
- [ROADMAP.md](./docs/ROADMAP.md) for the phased path to a public release
- [SECURITY_PRIVACY.md](./docs/SECURITY_PRIVACY.md) Section 7 for the incident
  response plan required before handling any real user data at scale

Production deployment is explicitly out of scope for the hackathon submission
and should not be attempted prematurely — see [DECISIONS.md](./docs/DECISIONS.md) for why the
hackathon build stays deliberately minimal in infrastructure terms.

## Team

[ Fill in team member names and roles ]

## License

[ Fill in if required for submission ]
