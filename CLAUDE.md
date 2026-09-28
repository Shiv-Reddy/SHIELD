# Shield — Project Context

## What This Is

Chrome MV3 extension. An AI agent reads and acts on the user's screen without
sensitive data ever reaching a server. A local vision model redacts on-device;
only sanitized context is sent; the cloud model returns one allowlisted action.

Team Anarchy. An independent project.

**Next milestone: Smart India Hackathon 2026, problem statement 26171 (ISRO,
"On-device Visual Perception for Light-weight Browser Agents").** The idea deck
is submitted; screening results come in October and the 36-hour grand finale
is in November–December (check the SIH portal for dates). The national college
hackathon of 25–26 September is done. Everything is judged by the problem
statement's five metrics (docs/EVALUATION_CRITERIA.md); its test cases are
given only at the finale, so generalisation beats polishing a prepared page.

## Hard Constraints — never violate

1. No raw sensitive screen data leaves the client under any code path. Not
   best-effort. An invariant.
2. DOM signals are primary. The visual model is supplementary, for what markup
   cannot describe (faces, text in images).
3. When uncertain whether something is sensitive — hide it.
4. The server may return only `click`, `type`, `scroll` (API_SPEC.md §5). Never
   arbitrary or dynamic instructions.
5. Shield stores no credentials. It names a field; the client supplies the value.

## Locked Decisions

- Chrome and Firefox are both supported targets (MV3), because the problem
  statement names both. **Chrome is the primary demo and the reference
  implementation** — where they disagree, Chrome's behaviour is preserved, and
  a change that breaks Chrome to serve Firefox is not taken. Edge runs the same
  Chromium bundle. See DECISIONS.md 214–216.
- Server model: free-tier, provider-agnostic, **open-weights** — the problem
  statement allows only open-source/open-weights models on the server
  (DECISIONS.md 306). Nothing paid committed.
- Primary demo: the bank KYC review console (test-screens/07-bank-kyc.html),
  since round one of the event (DECISIONS.md 279). Must be perfect. Login stays
  a test screen.
- Full scope is documented; the BUILD follows docs/TASKS.md, which is the only
  source of truth for what is next.

## Stack

Client — MV3, ONNX Runtime Web, WebGPU with WASM fallback, Canvas redaction.
Server — FastAPI, structured JSON action schema.
Tests — Node 24 native TypeScript + built-in runner. No extra deps.

## Working Priority

Check docs/EVALUATION_CRITERIA.md first. PII detection + redaction is 40%,
accuracy 25%, latency + resource 35%. Optimize latency **after** correctness,
never instead of it.

## Session Protocol

**Start:** read docs/TASKS.md, then the last docs/SESSION_LOG.md entry, then
docs/DECISIONS.md. State in one line what you are about to work on.

**During:**
- Work only on the current unblocked item in docs/TASKS.md.
- Tick each item the moment it is done. Never batch.
- Any decision not already in the docs → one line in docs/DECISIONS.md, with
  the reason, before moving on.
- A decision that contradicts docs/DECISIONS.md → stop and ask.

**End:** append to docs/SESSION_LOG.md — date, what was done, blockers, exactly
what the next session starts with.

## Git

**Do not commit or push unless explicitly told to.** Leave the tree dirty and
say what is uncommitted.

When told to commit:
- ONE LINE. Subject only. No body, no bullets, no trailers.
- Plain description of the change, as a human developer would write it.
- No reference to any AI assistant, tool, or company — in commits, comments,
  or file headers.
- Check what is actually staged. `test-screens/face-a.jpg` and `face-b.png`
  must never be committed. `extension/public/models/ultraface-rfb-320.onnx`
  must stay committed.
- Remote: https://github.com/Shiv-Reddy/SHIELD.git, `main`.

## Code Style

- Comments explain *why*, not *what*.
- Match the surrounding code's naming and idiom.
- Docs are written in the team's voice ("we", or neutral). Never first-person
  singular. Never attribute a task to a named individual unless verifiable.

## Documentation

Read the relevant one before starting related work.

| File | Holds |
|---|---|
| docs/TASKS.md | What is next. The driver. Read first, always |
| docs/OPERATOR_RUNBOOK.md | Every task needing a browser, key or second machine — steps, and what to bring back |
| docs/SESSION_LOG.md | Where the last session stopped |
| docs/DECISIONS.md | Why every settled choice was made |
| docs/PRD.md | Requirements, hackathon vs full scope |
| docs/ARCHITECTURE.md | System design, component specs |
| docs/SECURITY_PRIVACY.md | Threat model, redaction policy, known limits |
| docs/API_SPEC.md | Client-server contract, action allowlist |
| docs/TECH_STACK.md | What is built now vs architected for |
| docs/TESTING.md | Test strategy and the 5 required screens |
| docs/RISKS.md | Risk register |
| docs/ROADMAP.md | Timeline |
| docs/EVALUATION_CRITERIA.md | The weighted rubric |
| docs/DEMO_SCRIPT.md | Conditions a demo must run under; judge Q&A |

## Team

| Name | Role | Owns |
|---|---|---|
| Shivkumar Reddy | Lead, ML/Vision; Data | Local vision model and its training data, integration, demo |
| Shashank Kumar | PII Detection | DOM rules, UltraFace + OCR, placeholders |
| Ayush Verma | Backend | FastAPI, prompt builder, action builder |
| Satyanand Gupta | Extension & UI | MV3 shell, executor, consent UI, inspector |
| Isha Kumari | Docs & Demo | TASKS/SESSION_LOG upkeep, README, deck |
| Vanshika Chamoli | Testing | Benchmark runs, test screens, zero-leak runs, latency and resource measurements, generalisation sweep |

Ownership areas — who a question about that module goes to. Not a record of who
wrote which commit.
