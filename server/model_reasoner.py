"""The model-backed reasoner — ARCHITECTURE.md Sections 2.7 and 2.8.

Same interface as the rule-based path in `reasoner.py`, so `main.py` picks one
at startup and the rest of the server does not know which is running.

Two things shape this module more than anything else.

The first is that the choice of provider is configuration, not code. Every
candidate free tier — Groq, OpenRouter, Together, Google's OpenAI-compatible
endpoint — speaks the same chat-completions shape, so this adapter targets that
shape and reads the endpoint, model name and key from the environment. Nobody
has to edit Python to switch provider, and no account decision is baked into the
repository.

The second is that the model's reply is untrusted input. Not because a provider
is assumed hostile, but because the reply is influenced by page content we do
not control (see prompt.py), and because a model that has simply misunderstood
produces exactly the same malformed output as one that has been manipulated. So
the reply is parsed defensively and checked against what we actually sent: the
verb must be on the allowlist, the selector must be an element we described, and
the value must not be an attempt to fill a redacted field with a guess. Anything
else is discarded and the request falls back to the rules.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import os
import urllib.error
import urllib.request

from prompt import CREDENTIAL_REFERENCE, TOKEN_MEANINGS, build_prompt
from reasoner import Decision, decide_by_rules, is_optional_opt_in, recognised_form
from schemas import ALLOWED_ACTIONS, Action, AnalyzeRequest

logger = logging.getLogger("shield.model")

# Read once at import so a missing key is a startup fact rather than a surprise
# discovered on the first request — which, in a demo, means discovered on stage.
MODEL_KEY = os.environ.get("SHIELD_MODEL_KEY", "").strip()
MODEL_NAME = os.environ.get("SHIELD_MODEL_NAME", "").strip()
MODEL_ENDPOINT = os.environ.get("SHIELD_MODEL_ENDPOINT", "").strip()

# A second model, tried when the first times out or answers with something
# unusable, before the rules. On 2026-09-26 the configured free-tier model took
# 7-9 seconds a step for an hour around midnight and every request fell back to
# the rules, which cannot read a queue page: the demo would have done nothing.
# A different model on the same key sits in a different capacity pool, and any
# other OpenAI-compatible provider works too. Endpoint and key default to the
# main model's, so naming a model is enough.
BACKUP_NAME = os.environ.get("SHIELD_MODEL_BACKUP_NAME", "").strip()
BACKUP_ENDPOINT = os.environ.get("SHIELD_MODEL_BACKUP_ENDPOINT", "").strip()
BACKUP_KEY = os.environ.get("SHIELD_MODEL_BACKUP_KEY", "").strip()

# Free tiers are rate-limited and occasionally slow. The budget is short on
# purpose: a request that takes 30 seconds has already failed as far as the user
# is concerned, and falling back to the rules is faster than waiting for it.
REQUEST_TIMEOUT_S = float(os.environ.get("SHIELD_MODEL_TIMEOUT", "12"))

# The model's own words are shown to the user, so they are capped. A summary is
# one sentence; anything longer is the model ignoring its instructions, and the
# UI is not the place to find that out.
MAX_SUMMARY_CHARS = 300

# Whether to attach the redacted screenshot.
#
# ON by default since T1.3, which reverses the original reasoning. That reasoning
# — text-only free tiers are commoner, and the DOM summary alone handles the form
# tasks in scope — was true and was answering the wrong question. The problem
# statement is about *visual* context reaching the reasoner, and a frame that is
# captured, redacted, sealed, verified and then left behind is the entire
# capability being built and not used. It is also the only thing on the wire that
# demonstrates the redaction to the party the redaction is for.
#
# Set SHIELD_MODEL_VISION=0 to force text-only.
SEND_FRAME = os.environ.get("SHIELD_MODEL_VISION", "1").strip().lower() not in (
    "0",
    "false",
    "no",
)

# Latched the first time a provider refuses an image, so pointing this at a
# text-only model costs one rejected request for the life of the process rather
# than one per request. Deliberately not persisted: it is a fact about the
# configured model, and the configuration can change between runs.
_vision_refused = False


def vision_state() -> str:
    """What will actually be attached to the next request, for /health.

    Three states, not two. "Configured but refused" is the one worth being able
    to see: the server is answering, the model is answering, and the capability
    the problem statement asks about is silently not in use.
    """
    if not SEND_FRAME:
        return "off"
    return "refused" if _vision_refused else "on"


class ModelUnavailable(Exception):
    """The model could not be reached, or answered with something unusable."""


class ProviderRejectedRequest(ModelUnavailable):
    """The provider refused the request itself — a 4xx, not an unusable answer.

    Kept separate because it is the only failure worth retrying differently. A
    model that cannot see rejects a request carrying an image, and that is a
    fixable mistake on our side; a model that returned an action outside the
    allowlist is not, and retrying it would just spend another second arriving
    at the same rules fallback.
    """


class ProviderTimeout(ModelUnavailable):
    """The provider did not answer within the budget.

    Separate because it is the one failure a second attempt usually fixes.
    Measured against the free tier on 2026-09-25: most calls answered in about
    two seconds, and about one in four hung past fifteen — and those were not
    slow answers on their way, since waiting longer did not rescue them. A
    fresh request did. An allowlist violation or a malformed answer is not
    like that, and is never retried.
    """


def is_configured() -> bool:
    return bool(MODEL_KEY and MODEL_NAME and MODEL_ENDPOINT)


class Provider:
    """Which model to ask, and where. Read at call time so tests can swap it."""

    def __init__(self, name: str, endpoint: str, key: str, label: str) -> None:
        self.name = name
        self.endpoint = endpoint
        self.key = key
        self.label = label


def _main_provider() -> Provider:
    return Provider(MODEL_NAME, MODEL_ENDPOINT, MODEL_KEY, "model")


def _backup_provider() -> Provider | None:
    if not BACKUP_NAME:
        return None
    endpoint = BACKUP_ENDPOINT or MODEL_ENDPOINT
    key = BACKUP_KEY or MODEL_KEY
    if not endpoint or not key:
        return None
    return Provider(BACKUP_NAME, endpoint, key, "backup")


def backup_state() -> str:
    """Which backup model is configured, for /health. Never the key."""
    backup = _backup_provider()
    return backup.name if backup else "none"


def _messages(request: AnalyzeRequest, with_frame: bool) -> list[dict[str, object]]:
    # The flag reaches the template as well as the message list. They used to
    # disagree: the template described a screenshot unconditionally while the
    # adapter attached one only on request, so every text-only call told the
    # model about an image it had not been given.
    built = build_prompt(request, with_frame=with_frame)

    if not with_frame:
        return [
            {"role": "system", "content": built.system},
            {"role": "user", "content": built.user},
        ]

    # The frame here is the redacted one. It is the only image that exists on
    # this side of the boundary — the client cannot produce a sealed payload
    # carrying anything else — but it is worth saying plainly at the one point
    # where an image is put on the wire.
    return [
        {"role": "system", "content": built.system},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": built.user},
                {
                    "type": "image_url",
                    "image_url": {"url": request.redacted_frame},
                },
            ],
        },
    ]


def _call_model(
    body: dict[str, object], endpoint: str | None = None, key: str | None = None
) -> dict[str, object]:
    """One blocking HTTP call, using the standard library.

    `urllib` rather than an HTTP client library because this is the only
    outbound request the server makes, and a dependency that must install
    cleanly on somebody else's laptop on demo morning is a dependency worth not
    having. It runs on a worker thread, so blocking here does not block the
    event loop.
    """
    payload = json.dumps(body).encode("utf-8")
    http_request = urllib.request.Request(
        endpoint or MODEL_ENDPOINT,
        data=payload,
        headers={
            "content-type": "application/json",
            "authorization": f"Bearer {key or MODEL_KEY}",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(http_request, timeout=REQUEST_TIMEOUT_S) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        # The provider's error body can quote the request back, and the request
        # contains the page description. Only the status code is surfaced.
        if 400 <= error.code < 500:
            raise ProviderRejectedRequest(
                f"provider returned HTTP {error.code}"
            ) from None
        raise ModelUnavailable(f"provider returned HTTP {error.code}") from None
    except TimeoutError:
        raise ProviderTimeout("provider call timed out") from None
    except urllib.error.URLError as error:
        # A timeout while connecting arrives wrapped rather than bare.
        if isinstance(error.reason, TimeoutError):
            raise ProviderTimeout("provider call timed out") from None
        raise ModelUnavailable(f"provider call failed ({type(error).__name__})") from None
    except Exception as error:
        raise ModelUnavailable(f"provider call failed ({type(error).__name__})") from None


def _extract_text(response: dict[str, object]) -> str:
    try:
        choices = response["choices"]
        message = choices[0]["message"]  # type: ignore[index]
        content = message["content"]  # type: ignore[index]
    except Exception:
        raise ModelUnavailable("provider response had an unexpected shape") from None

    if not isinstance(content, str) or not content.strip():
        raise ModelUnavailable("provider returned no text")
    return content


def _parse_json_object(text: str) -> dict[str, object]:
    """Pull one JSON object out of the model's reply.

    Models wrap JSON in code fences and prose despite being told not to, often
    enough that refusing those replies would mean falling back on a correct
    answer. The braces are located rather than the fences stripped, because
    there are several fence dialects and only one object.
    """
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end <= start:
        raise ModelUnavailable("model reply contained no JSON object")

    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        raise ModelUnavailable("model reply was not valid JSON") from None

    if not isinstance(parsed, dict):
        raise ModelUnavailable("model reply was not a JSON object")
    return parsed


def _clean_summary(value: object) -> str:
    if not isinstance(value, str) or not value.strip():
        return "The assistant did not explain its choice."
    summary = " ".join(value.split())
    return summary[:MAX_SUMMARY_CHARS]


def interpret(reply: dict[str, object], request: AnalyzeRequest) -> Decision:
    """Turn a parsed model reply into a Decision, or refuse it.

    Separated from the HTTP call so it can be tested without a network or a key,
    which is what TESTING.md Section 3 means by a mocked model response. Every
    check here is a case where a plausible-looking reply would do something the
    project promises it will not.
    """
    status = reply.get("status")

    if status == "needs_more_context":
        return Decision(
            action=None,
            confidence=0.0,
            summary=_clean_summary(reply.get("reasoning_summary")),
        )

    if status != "action_ready":
        raise ModelUnavailable("model reply had no recognised status")

    action = reply.get("action")
    if not isinstance(action, dict):
        raise ModelUnavailable("model reply carried no action object")

    action_type = action.get("type")
    if action_type not in ALLOWED_ACTIONS:
        # The allowlist, at the point the model's output first becomes an
        # instruction. main.py checks it again before responding; this one keeps
        # a rejected verb out of the log line and the Decision entirely.
        raise ModelUnavailable("model proposed an action outside the allowlist")

    selector = action.get("selector")
    known_ids = {entry.elementId for entry in request.redacted_dom_summary}
    if not isinstance(selector, str) or selector not in known_ids:
        # The model may only act on elements we described to it. Without this it
        # could name any element on the page — including one deliberately left
        # out of the summary — and the client would dutifully look it up.
        raise ModelUnavailable("model named an element that was not in the page context")

    value = action.get("value")
    if value is not None and not isinstance(value, str):
        raise ModelUnavailable("model produced a non-text value")

    if action_type != "type" and value:
        raise ModelUnavailable("model attached a value to an action that takes none")

    if action_type == "type":
        value = _check_typed_value(value, selector, request)

    if action_type == "click":
        _refuse_optional_opt_in(selector, request)
        _check_row_evidence(reply.get("evidence"), selector, request)

    confidence = reply.get("confidence")
    if not isinstance(confidence, (int, float)) or not 0.0 <= float(confidence) <= 1.0:
        # A missing or nonsensical confidence is reported as low rather than
        # rejected. The action still passed every safety check; overstating
        # certainty would be the worse error.
        confidence = 0.5

    return Decision(
        action=Action(type=action_type, selector=selector, value=value),
        confidence=float(confidence),
        summary=_clean_summary(reply.get("reasoning_summary")),
    )


def _check_row_evidence(evidence: object, selector: str, request: AnalyzeRequest) -> None:
    """Refuse a click in a row unless the model shows, from that row, why.

    Measured on the payroll console with the right employee scrolled out of
    view: told in plain words never to act on a near miss, the model released
    the salary of an engineer whose bank details were missing, three times out
    of three. Instructions do not hold a lite model; a check does. So a click
    on anything inside a table row, list item or card must come with the
    elements that satisfy the task, quoted, and every one of them must be in
    the same row as the button and actually say what the model claims.

    Words are compared, not meanings: the check cannot tell whether "Ready"
    satisfies "payroll is ready". It can tell that the model quoted a row it is
    not clicking, or a word that is not on the page — which is how a near miss
    reads when it is made to show its working.
    """
    entries = {entry.elementId: entry for entry in request.redacted_dom_summary}
    target = entries.get(selector)
    if target is None or target.row is None:
        return

    if not isinstance(evidence, list):
        raise ModelUnavailable("model clicked in a row without showing evidence from it")

    for item in evidence:
        if not isinstance(item, dict):
            raise ModelUnavailable("model evidence was not a list of elements")
        cited = entries.get(str(item.get("elementId")))
        quoted = item.get("text")
        if cited is None or not isinstance(quoted, str) or not quoted.strip():
            raise ModelUnavailable("model evidence named an element that is not on the page")
        if cited.row != target.row:
            raise ModelUnavailable("model evidence came from a different row than its click")
        said = " ".join(part for part in (cited.value, cited.label) if part).lower()
        if " ".join(quoted.lower().split()) not in " ".join(said.split()):
            raise ModelUnavailable("model evidence quoted words the element does not contain")

        # Evidence that reads as a failed condition the task never asked for.
        # Measured: asked for an applicant whose "fee is paid", the model cited
        # "Fee pending" as its evidence and shortlisted them. Its own working
        # showed the mistake; this reads it.
        task = request.task_query.lower()
        for word in _FAILURE_WORDS:
            if re.search(rf"\b{word}\b", said) and not re.search(rf"\b{word}\b", task):
                raise ModelUnavailable("model evidence shows a condition that is not met")


# Status words that say a condition is not met. A row showing one of these is
# not evidence for a task unless the task itself asks for it ("hold the salary
# of the employee whose attendance is a mismatch").
_FAILURE_WORDS = (
    "pending", "missing", "mismatch", "expired", "unclear", "rejected", "failed",
    "incomplete", "hold", "blocked", "overdue", "awaiting", "not", "unpaid",
    "unverified", "invalid", "high", "medium",
)


def _refuse_optional_opt_in(selector: str, request: AnalyzeRequest) -> None:
    """Refuse a click that would opt the user into something they did not ask for.

    The rule-based path will not tick a newsletter or marketing box, so the
    model-backed path must not either — otherwise the same task behaves
    differently depending on whether a free tier happened to answer, and the
    riskier of the two behaviours is the one nobody tested.

    Ticking a box is a `click`, so none of the value checks above see it. What
    makes it worth a rule of its own is that it is outward-facing and awkward to
    undo: it signs the user up for mail from a page they may never return to,
    and unlike a wrong click on a button, nothing on screen makes it obvious
    that it happened.
    """
    target = next(
        (entry for entry in request.redacted_dom_summary if entry.elementId == selector),
        None,
    )

    if target is not None and is_optional_opt_in(target):
        raise ModelUnavailable("model tried to tick an optional opt-in checkbox")


def _check_typed_value(
    value: str | None, selector: str, request: AnalyzeRequest
) -> str | None:
    """Refuse a typed value that would fill a redacted field with a guess.

    This is the check that matters most in this file. The whole system rests on
    the model never learning what was behind a token, so a model writing real
    text into a field we redacted means one of two things: it hallucinated a
    credential, or something upstream leaked the real one. Both must stop here,
    and neither is distinguishable from the other at this point — which is why
    the rule is the shape of the value rather than a comparison against
    something we would have to hold to compare against.
    """
    if value is None or value == "":
        raise ModelUnavailable("model asked to type nothing")

    if value == CREDENTIAL_REFERENCE:
        return value

    target = next(
        (entry for entry in request.redacted_dom_summary if entry.elementId == selector),
        None,
    )
    if target is not None and target.value in TOKEN_MEANINGS:
        raise ModelUnavailable(
            "model tried to type a literal value into a redacted field"
        )

    if value.startswith("[") and value.endswith("]"):
        # A token echoed back as something to type. Harmless to the user but
        # meaningless on the page, and it would appear in the field as literal
        # text — a confusing failure that looks like a working one.
        raise ModelUnavailable("model tried to type a placeholder token")

    return value


def _body(
    request: AnalyzeRequest, with_frame: bool, model: str | None = None
) -> dict[str, object]:
    return {
        "model": model or MODEL_NAME,
        "messages": _messages(request, with_frame),
        # Deterministic where the provider honours it. Two identical screens
        # should produce the same action; a rehearsed demo that varies run to
        # run cannot be rehearsed.
        "temperature": 0,
        "max_tokens": 400,
    }


async def _send(body: dict[str, object], provider: Provider) -> dict[str, object]:
    if provider.label == "model":
        # The main model keeps the one-argument call the tests replace.
        return await asyncio.to_thread(_call_model, body)
    return await asyncio.to_thread(_call_model, body, provider.endpoint, provider.key)


async def _ask(
    request: AnalyzeRequest,
    with_frame: bool,
    provider: Provider | None = None,
    retry_timeout: bool = True,
) -> Decision:
    provider = provider or _main_provider()
    body = _body(request, with_frame, provider.name)
    try:
        raw = await _send(body, provider)
    except ProviderTimeout:
        if not retry_timeout:
            raise
        # Once, and only for a timeout. See ProviderTimeout for why a second
        # attempt is worth its cost here and nowhere else.
        logger.warning("request %s timed out; retrying once", request.request_id)
        raw = await _send(body, provider)
    return interpret(_parse_json_object(_extract_text(raw)), request)


async def _decide_with(
    request: AnalyzeRequest, provider: Provider, retry_timeout: bool
) -> tuple[Decision, str]:
    """One provider's answer, or ModelUnavailable. Never the rules."""
    global _vision_refused

    with_frame = SEND_FRAME and not _vision_refused
    try:
        decision = await _ask(request, with_frame, provider, retry_timeout)
        return decision, f"{provider.label}-vision" if with_frame else provider.label
    except ProviderRejectedRequest:
        # Sending an image to a text-only model is a 4xx, and it is the one
        # mistake worth correcting rather than reporting. Without this, turning
        # vision on by default would break every text-only configuration that
        # worked before — silently, because the rules fallback still answers.
        if not with_frame:
            raise
        decision = await _ask(request, False, provider, retry_timeout)
        if provider.label == "model":
            _vision_refused = True
            logger.warning(
                "request %s: the configured model refused an image; "
                "sending text only from here on",
                request.request_id,
            )
        return decision, f"{provider.label}-text-only"


async def decide_with_model(request: AnalyzeRequest) -> tuple[Decision, str]:
    """Decide using the model, then the backup model, then the rules.

    Returns the decision and which path produced it, because "the model was
    configured" and "the model answered this request" are different facts and
    the second is the one worth logging.
    """
    if not is_configured():
        return decide_by_rules(request), "rules"

    # Login and sign-up go to the rules even with a model configured. The rules
    # were written for exactly these two shapes and are covered check by check;
    # the model, measured on the same sign-up page, once said it needed to scroll
    # and returned no action, and costs two seconds a step where the rules cost
    # none. The model is kept for what the rules cannot read at all.
    if recognised_form(request) is not None:
        return decide_by_rules(request), "rules-known-form"

    backup = _backup_provider()

    try:
        # With a backup waiting, a timeout goes straight to it: a fresh request
        # to a different model is at least as likely to answer as a second one
        # to the model that just hung, and it does not double the wait.
        return await _decide_with(request, _main_provider(), retry_timeout=backup is None)
    except ModelUnavailable as reason:
        # Every message raised in this module is written from our own side of
        # the exchange — a status code, a shape, a rule that was broken — and
        # never from the provider's body or the page description, so it is safe
        # to log next to the request id.
        if backup is None:
            logger.warning("request %s fell back to rules: %s", request.request_id, reason)
            return _rules_after(reason, request), "rules-fallback"
        logger.warning(
            "request %s: main model unavailable (%s); asking the backup model",
            request.request_id,
            reason,
        )

    try:
        return await _decide_with(request, backup, retry_timeout=False)
    except ModelUnavailable as reason:
        logger.warning("request %s fell back to rules: %s", request.request_id, reason)
        return _rules_after(reason, request), "rules-fallback"


def _rules_after(reason: ModelUnavailable, request: AnalyzeRequest) -> Decision:
    """The rules' answer, or, when they have none, why nothing was done.

    The user reads this summary. "No recognised form on this screen" is true
    of the rules and says nothing about what happened: the AI answered and was
    refused, or never answered. Written from our side of the exchange only —
    never the provider's words or the page's.
    """
    decision = decide_by_rules(request)
    if decision.action is not None:
        return decision
    text = str(reason)
    if isinstance(reason, ProviderTimeout):
        summary = "The AI service did not answer in time, so Shield did nothing. Try again in a moment."
    elif "evidence" in text:
        summary = (
            "The AI's choice did not match what this page says, so Shield refused it and did "
            "nothing. If the right item is further down, scroll to it and ask again."
        )
    elif "allowlist" in text or "element that was not" in text or "redacted field" in text:
        summary = "The AI proposed something Shield does not allow, so nothing was done."
    else:
        summary = "The AI service could not give a usable answer, so Shield did nothing."
    return Decision(action=None, confidence=0.0, summary=summary)
