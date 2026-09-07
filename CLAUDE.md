# Shield — Project Context

## What This Is

Shield (Screen-level Hiding of Identifiable Elements using Local Detection) is a
Chrome browser extension that lets an AI agent read and act on a user's screen
without ever exposing sensitive data to a server. A local vision model detects
and redacts private information (passwords, PII, faces) on-device before any
data is transmitted. Only sanitized context is sent to a cloud AI model, which
returns an action for the extension to execute.

Built for Smart India Hackathon 2026, Problem Statement SIH26171 (ISRO,
Smart Automation theme). Deadline: 20 September 2026.

## Locked Decisions

- Target browser: Chrome only (Manifest V3)
- Server-side AI model: exploring free-tier options first, no paid API committed yet
- Primary demo task: login/form autofill (must be fully reliable)
- Stretch demo tasks (only if time allows, in this order):
  1. Multi-field signup form (reuses DOM-detection logic)
  2. Video call / profile photo face detection (new code path, higher risk)
- Full production-grade documentation exists (see below), but the hackathon
  BUILD stays scoped to Phase 1 core first — see docs/TASKS.md and docs/DECISIONS.md

## Hard Constraints (never violate these)

- No raw, unredacted sensitive screen data may ever leave the client under any
  code path. This is a non-negotiable privacy invariant, not a best-effort goal.
- DOM-based detection (input type=password, autocomplete attributes) is the
  primary, most reliable signal for form-based PII. The visual model is a
  supplementary layer for what DOM signals can't catch (e.g. faces).
- When uncertain whether something is sensitive, always default to hiding it.
- Server may only return actions from the fixed allowlist in docs/API_SPEC.md
  Section 5 (click, type, scroll) — never execute arbitrary/dynamic instructions.

## Tech Stack (see docs/TECH_STACK.md for full detail)

- Client: Chrome Extension (Manifest V3), ONNX Runtime Web / Transformers.js,
  WebGPU with WASM fallback, Canvas API for redaction rendering
- Server: FastAPI backend, free-tier hosted VLM API (or self-hosted open-weight
  model), structured JSON action-response schema (see docs/API_SPEC.md)

## Full Documentation Set (read relevant docs before starting related work)

- **docs/PRD.md** — full requirements, hackathon scope AND full product scope,
  clearly separated throughout
- **docs/ARCHITECTURE.md** — system design, component specs, sequence diagrams,
  production scaling notes
- **docs/SECURITY_PRIVACY.md** — formal threat model (STRIDE), redaction policy
  specification, compliance considerations, incident response plan
- **docs/API_SPEC.md** — full client-server API contract, request/response
  schemas, error codes, action allowlist
- **docs/TECH_STACK.md** — hackathon stack (build now) vs. full product stack
  (architected for, not built yet)
- **docs/TESTING.md** — full test strategy: unit, integration, e2e, performance,
  security, accessibility, plus the 5 required test screens
- **docs/RISKS.md** — full risk register across technical, security, business,
  operational, and team categories
- **docs/ROADMAP.md** — complete timeline from pre-hackathon prep through
  post-hackathon production hardening and public launch
- **docs/TASKS.md** — current build status, module by module
- **docs/DECISIONS.md** — why every settled choice was made
- **docs/DEMO_SCRIPT.md** — live demo walkthrough, anticipated judge Q&A, contingency plans
- **docs/EVALUATION_CRITERIA.md** — standalone quick-reference version of the
  official weighted rubric (also embedded in docs/PRD.md Section 7)
- **docs/SESSION_LOG.md** — append-only log of what happened each session, read
  this first every time to know exactly where things left off

## Code Style

- Clear, natural comments explaining _why_, not just _what_
- No comments, headers, or commit messages referencing any AI coding assistant,
  tool, or company
- Commit messages written plainly, describing the change itself, as a human
  developer would write them

## Working Priority

When implementing anything, check docs/EVALUATION_CRITERIA.md first — accuracy
(25%) and PII detection + redaction (40% combined) should get the most
engineering attention, not just the most initial build time. Latency and
resource usage (35% combined) matter too but should be optimized after
correctness, not instead of it.

## Session Protocol (Follow This Every Session, No Exceptions)

**At the start of every session:**

1. Read docs/TASKS.md fully before doing anything else.
2. Read docs/SESSION_LOG.md's most recent entry to know exactly where the last
   session left off.
3. Read docs/DECISIONS.md to check nothing you're about to do contradicts an
   already-settled choice.
4. State back, in one or two lines, what phase/module you are about to work
   on and why — before writing any code.

**Phase gating (strict, no exceptions):**

- Work only on the current unblocked module/phase per docs/TASKS.md.
- Do NOT start Phase 2 (stretch goals) items until every Phase 1 (core) item
  in docs/TASKS.md is checked complete.
- Do NOT start Phase 3 items until Phase 2 is checked complete.
- If asked to jump ahead, point out the phase-gating rule and confirm before proceeding.

**During the session:**

- After completing each task, immediately check it off in docs/TASKS.md — don't
  batch updates to the end of the session.
- If you make any implementation decision not already specified in the docs
  (a library version, a naming convention, a fallback behavior), add it to
  docs/DECISIONS.md with a one-line reason before moving on.
- If a decision conflicts with something already in docs/DECISIONS.md, stop and
  ask rather than silently overriding it.

**At the end of every session:**
Append a new entry to docs/SESSION_LOG.md with: date, what was completed this
session, current blockers (if any), and exactly what the next session should
start with. This is the single most important habit for continuity — never
skip it, even for a short session.

**Code hygiene (non-negotiable):**

- No comments, commit messages, or file headers referencing Claude Code or
  any AI assistant.
- Commit messages written plainly, describing the change itself.
