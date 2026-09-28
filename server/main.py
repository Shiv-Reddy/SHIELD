"""Shield backend — /analyze and /health, per API_SPEC.md.

Two rules govern everything here.

First, nothing about a request is ever logged beyond its id. SECURITY_PRIVACY.md
Section 3 names logs as a disclosure path, and the payload arriving here is
redacted rather than harmless: it still describes somebody's screen, and a
server log is exactly the kind of store that outlives the request and gets
copied around. Only `request_id`, timings and outcomes are recorded.

Second, the action allowlist is enforced here as well as on the client. That is
not redundancy for its own sake — it means a compromised or simply mistaken
model cannot produce anything but click, type or scroll, and the client refusing
it later is a second line rather than the only one.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from pathlib import Path


def _load_dotenv() -> None:
    """Read `.env` into the environment, if one exists.

    WHY THIS EXISTS AND WHY IT IS NOT A DEPENDENCY

    The provider is configured by three environment variables, and the obvious
    way to keep a key off the command line is a `.env` file. Without this, that
    file does nothing at all: the server reads `os.environ`, so a correctly
    written `.env` produces a server that silently answers from the rule path —
    configured, as far as its author knows, and not actually using the model.
    Silent degradation is the failure this project least wants.

    `python-dotenv` would do this in one line and is not worth an install step
    on somebody else's laptop on demo morning, which is the same reasoning that
    keeps `urllib` in model_reasoner.py.

    A REAL ENVIRONMENT VARIABLE ALWAYS WINS

    `setdefault`, never assignment. Exporting a variable to override the file is
    the thing an operator expects to work — switching provider for one run, or a
    container injecting a secret — and a file that quietly overrode it would be
    a trap that only shows up as "why is it still using the old key".
    """
    here = Path(__file__).resolve().parent
    for candidate in (here / ".env", here.parent / ".env"):
        if not candidate.is_file():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            # Values are never logged. This file holds the one secret the
            # server ever sees, and a startup line echoing it would put it in
            # exactly the place SECURITY_PRIVACY.md Section 3 warns about.
            os.environ.setdefault(name.strip(), value.strip().strip("\"'"))


# Before importing model_reasoner, which reads its configuration at import time.
# Module-level imports below this line are deliberate, not an oversight.
_load_dotenv()

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402

from model_reasoner import backup_state, decide_with_model, is_configured, vision_state  # noqa: E402
from prompt import PROMPT_VERSION  # noqa: E402
from schemas import (  # noqa: E402
    ALLOWED_ACTIONS,
    ActionReadyResponse,
    AnalyzeRequest,
    ErrorResponse,
    NeedsMoreContextResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("shield")

VERSION = "0.1.0"

app = FastAPI(title="Shield backend", version=VERSION)

# The extension calls this from a service worker, whose origin is
# chrome-extension://<id>. That id changes between machines and between packed
# and unpacked loads, so it cannot be pinned for a hackathon build. Tightening
# this to the published extension id is a Full Product task, noted in
# SECURITY_PRIVACY.md rather than left as a silent hole.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["content-type", "x-admin-token"],
)


@app.get("/health")
def health() -> dict[str, object]:
    """Liveness, and which reasoner is active.

    The reasoner is reported because "the server is up" and "the server can
    actually answer" are different claims, and a demo that discovers the
    difference live discovers it at the worst moment.
    """
    return {
        "status": "ok",
        "version": VERSION,
        # Which path a request will actually take, not merely whether a key is
        # present. "model" still falls back to the rules on any failure, so this
        # says what will be tried first rather than what will answer.
        "reasoner": "model" if is_configured() else "rules",
        "model_configured": is_configured(),
        # Whether the redacted frame is actually travelling. "refused" means the
        # configured model rejected an image and is being sent text only — the
        # server works, the model answers, and the capability the problem
        # statement is named after is not in use. That is worth being able to
        # read off /health rather than inferring from a log line.
        "vision": vision_state(),
        # The model tried when the first one fails, before the rules. "none"
        # means a slow free tier goes straight to the rules, which cannot read a
        # queue page.
        "backup_model": backup_state(),
        "prompt_version": PROMPT_VERSION,
    }


def _error(request_id: str, code: str, message: str, http_status: int) -> JSONResponse:
    body = ErrorResponse(request_id=request_id, error_code=code, message=message)
    return JSONResponse(status_code=http_status, content=body.model_dump())


@app.post("/analyze")
async def analyze(request: Request) -> JSONResponse:
    started = time.perf_counter()

    try:
        raw = await request.json()
    except Exception:
        # No request id is available yet, so there is nothing to correlate with.
        logger.warning("rejected a request whose body was not JSON")
        return _error("", "MALFORMED_REQUEST", "Body was not valid JSON.", 400)

    request_id = ""
    if isinstance(raw, dict) and isinstance(raw.get("request_id"), str):
        request_id = raw["request_id"]

    try:
        payload = AnalyzeRequest.model_validate(raw)
    except Exception as error:
        # The validation error names fields, not values, but it is still built
        # from the payload, so only the exception type is logged.
        logger.warning("request %s failed schema validation (%s)", request_id, type(error).__name__)
        return _error(request_id, "MALFORMED_REQUEST", "Request failed schema validation.", 400)

    try:
        decision, path = await decide_with_model(payload)
    except Exception:
        # No `logger.exception` here: a traceback carries the local variables of
        # every frame it walks, and the frames in this call chain hold the
        # payload. Only the exception type is recorded.
        logger.error(
            "request %s failed while reasoning (%s)",
            request_id,
            type(sys.exc_info()[1]).__name__,
        )
        return _error(request_id, "INTERNAL_ERROR", "Could not process this page.", 500)

    if decision.action is None:
        logger.info(
            "request %s -> needs_more_context via %s in %.0fms",
            request_id,
            path,
            (time.perf_counter() - started) * 1000,
        )
        return JSONResponse(
            content=NeedsMoreContextResponse(
                request_id=request_id, reasoning_summary=decision.summary
            ).model_dump(),
            headers={"x-shield-path": path},
        )

    # The allowlist, enforced server-side. The model path checks it too, before
    # the reply becomes a Decision at all — this is the second line, kept
    # because the first one lives in the module that talks to the model and is
    # therefore the module most likely to be rewritten in a hurry.
    if decision.action.type not in ALLOWED_ACTIONS:
        logger.warning("request %s produced a disallowed action", request_id)
        return _error(
            request_id, "ACTION_REJECTED", "No safe action could be determined.", 200
        )

    logger.info(
        "request %s -> %s via %s in %.0fms",
        request_id,
        decision.action.type,
        path,
        (time.perf_counter() - started) * 1000,
    )

    # Which reasoner answered — model, backup, or one of the rule paths — as a
    # header rather than a body field, so the response schema the extension
    # validates is unchanged. It names a path, never page content, and is what
    # lets tools/bench tell a model's own answer from a fallback's.
    return JSONResponse(
        content=ActionReadyResponse(
            request_id=request_id,
            action=decision.action,
            confidence=decision.confidence,
            reasoning_summary=decision.summary,
        ).model_dump(),
        headers={"x-shield-path": path},
    )


# --- Organisation view (fleet.py) -------------------------------------------
#
# Counts only, validated field by field; see fleet.py for what a laptop may
# send and why nothing else is accepted.

import fleet  # noqa: E402
from fastapi.responses import HTMLResponse  # noqa: E402
from pydantic import ValidationError  # noqa: E402

_ADMIN_PAGE = Path(__file__).with_name("admin.html")


@app.post("/fleet/report")
async def fleet_report(http_request: Request) -> JSONResponse:
    try:
        report = fleet.FleetReport.model_validate(await http_request.json())
    except (ValidationError, ValueError):
        # Refused whole, and without echoing what was sent: a report that does
        # not fit the counts-only shape is exactly the one not to repeat back.
        return JSONResponse(status_code=422, content={"ok": False, "error": "not a counts-only report"})
    fleet.record_report(report)
    return JSONResponse(content={"ok": True, "policy": fleet.get_policy()})


@app.get("/fleet/summary")
def fleet_summary() -> dict[str, object]:
    return fleet.summary()


@app.get("/fleet/policy")
def fleet_policy() -> dict[str, object]:
    return fleet.get_policy()


@app.post("/fleet/policy")
async def fleet_set_policy(http_request: Request) -> JSONResponse:
    if not fleet.token_accepted(http_request.headers.get("x-admin-token")):
        return JSONResponse(status_code=403, content={"ok": False, "error": "admin token required"})
    try:
        policy = fleet.Policy.model_validate(await http_request.json())
    except (ValidationError, ValueError):
        return JSONResponse(status_code=422, content={"ok": False, "error": "not a policy"})
    return JSONResponse(content=fleet.set_policy(policy))


@app.get("/admin", response_class=HTMLResponse)
def admin_page() -> HTMLResponse:
    return HTMLResponse(_ADMIN_PAGE.read_text(encoding="utf-8"))
