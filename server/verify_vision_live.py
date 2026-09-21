"""Does the redacted frame actually reach the model's reasoning?

WHY THIS EXISTS SEPARATELY FROM test_prompt.py

test_prompt.py already proves the frame is *sent*: that a vision request carries
an `image_url` part, that the part holds the redacted frame and nothing else,
that a text-only request carries no image at all, and that a provider refusing
an image falls back and latches. Eighteen checks, no network, no key.

None of that proves a model *reads* it. A correctly formatted image that the
model ignores passes every one of those checks. That gap is what TASKS.md has
been carrying as "no live call has been made", and it is the only remaining
claim in T1.3 that a unit test cannot close.

THE EXPERIMENT

Two requests with a byte-identical PAGE CONTEXT and a different screenshot:

  frame A - an ordinary login form.
  frame B - the same form with a cookie banner drawn across the bottom,
            covering the sign-in button, its "Accept cookies" button on top.

Both frames carry the same four elements, so nothing in the text can tell them
apart. If the chosen action differs between them, the difference came from the
pixels, because there was nowhere else for it to come from. The system prompt
asks for exactly this: use the image to "notice a dialog or banner that must be
dealt with first".

THE CONTROL

The same pair is then run with the frame withheld. Temperature is 0, so if the
two text-only answers are not identical the provider is not deterministic and
the vision result above means nothing. Without this, one lucky pair of differing
answers would look like a proof.

RUNNING IT

Needs a model that can see, reachable over an OpenAI-compatible endpoint. Local,
no key, nothing paid:

    pip install Pillow          # this file only - see the note below
    ollama pull qwen2.5vl:7b
    SHIELD_MODEL_ENDPOINT=http://localhost:11434/v1/chat/completions \
    SHIELD_MODEL_NAME=qwen2.5vl:7b \
    SHIELD_MODEL_KEY=ollama \
    SHIELD_MODEL_TIMEOUT=600 \
    server/.venv/Scripts/python server/verify_vision_live.py

The key is ignored by ollama and is set only because `is_configured()` requires
all three to be present — a deliberate guard against a half-configured provider,
not something to work around in the adapter.

The timeout is raised because a 7B vision model on a CPU is slow, and the 12s
default is a demo budget rather than a fact about the model. That substitution
is the whole reason the provider is configuration rather than code.

Pillow is deliberately NOT in requirements.txt. It draws the two fixtures and is
needed by this file alone; the server neither imports it nor ships it, and a
verification tool is a bad reason to add a native-wheel dependency to something
that has to install cleanly on somebody else's laptop on demo morning.

MEASURED 2026-09-21, qwen2.5vl:7b on ollama 0.34.2, CPU only (Intel Iris Xe, so
no GPU offload), 16GB RAM:

    vision, warm     13.0s and 18.3s
    text-only, warm  11.3s and 11.7s
    through /analyze 22.2s end to end

The image therefore costs roughly 2-6s on top of the text, and the whole offline
path is about twenty seconds a step. That is a working offline fallback and it
is not a demo path - the hosted model stays the one on stage.
"""

from __future__ import annotations

import asyncio
import base64
import io
import os
import sys

# Generated here rather than checked in: a fixture whose point is "these two
# differ only in pixels" is one nobody can verify by looking at two .jpg files
# in a diff.
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import model_reasoner  # noqa: E402
from model_reasoner import ModelUnavailable  # noqa: E402
from schemas import AnalyzeRequest  # noqa: E402

WIDTH, HEIGHT = 900, 640


def _font(size: int) -> ImageFont.ImageFont:
    """A real typeface if the machine has one, since the model has to read it."""
    for candidate in ("arial.ttf", "segoeui.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _login_form(draw: ImageDraw.ImageDraw) -> None:
    """The page both frames show, drawn identically in each."""
    draw.rectangle([0, 0, WIDTH, HEIGHT], fill="#f3f4f6")
    draw.rectangle([250, 90, 650, 520], fill="white", outline="#d1d5db", width=2)

    draw.text((290, 130), "Sign in to Meridian", font=_font(30), fill="#111827")

    draw.text((290, 210), "Email", font=_font(18), fill="#374151")
    draw.rectangle([290, 235, 610, 275], fill="white", outline="#9ca3af", width=2)
    # The redaction, as the client paints it: a solid black rectangle over the
    # value. The system prompt tells the model these are ours and not the page's.
    draw.rectangle([294, 239, 606, 271], fill="black")

    draw.text((290, 300), "Password", font=_font(18), fill="#374151")
    draw.rectangle([290, 325, 610, 365], fill="white", outline="#9ca3af", width=2)
    draw.rectangle([294, 329, 606, 361], fill="black")

    draw.rectangle([290, 400, 610, 450], fill="#2563eb")
    draw.text((410, 415), "Sign in", font=_font(22), fill="white")


def _frame_plain() -> str:
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    _login_form(ImageDraw.Draw(image))
    return _as_data_url(image)


def _frame_with_banner() -> str:
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    _login_form(draw)

    # A consent banner across the bottom, overlapping the sign-in button. The
    # only difference between the two frames, and it exists nowhere in the text.
    draw.rectangle([0, 380, WIDTH, HEIGHT], fill="#1f2937")
    draw.text(
        (60, 420),
        "We use cookies to run this site.",
        font=_font(26),
        fill="white",
    )
    draw.text(
        (60, 460),
        "You must accept before continuing.",
        font=_font(26),
        fill="white",
    )
    draw.rectangle([60, 520, 340, 580], fill="#16a34a")
    draw.text((110, 538), "Accept cookies", font=_font(24), fill="white")
    return _as_data_url(image)


def _as_data_url(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


# Identical for both frames. Every element the model is allowed to name, and
# nothing in it says whether a banner is on screen.
DOM_SUMMARY = [
    {
        "elementId": "e1",
        "elementType": "input",
        "label": "Email",
        "value": "[EMAIL]",
        "filled": True,
        "position": {"x": 290, "y": 235, "width": 320, "height": 40},
    },
    {
        "elementId": "e2",
        "elementType": "input",
        "label": "Password",
        "value": "[PASSWORD]",
        "filled": True,
        "position": {"x": 290, "y": 325, "width": 320, "height": 40},
    },
    {
        "elementId": "e3",
        "elementType": "button",
        "label": "Sign in",
        "value": None,
        "filled": False,
        "position": {"x": 290, "y": 400, "width": 320, "height": 50},
    },
    {
        "elementId": "e4",
        "elementType": "button",
        "label": "Accept cookies",
        "value": None,
        "filled": False,
        "position": {"x": 60, "y": 520, "width": 280, "height": 60},
    },
]

MANIFEST = [
    {"regionId": "r1", "category": "email", "method": "dom"},
    {"regionId": "r2", "category": "password", "method": "dom"},
]


def _request(request_id: str, frame: str) -> AnalyzeRequest:
    return AnalyzeRequest(
        request_id=request_id,
        task_query="sign in to my account",
        redacted_frame=frame,
        redacted_dom_summary=DOM_SUMMARY,
        redaction_manifest=MANIFEST,
    )


def _describe(decision) -> str:
    action = getattr(decision, "action", None)
    if action is None:
        return "no action (needs_more_context)"
    value = f" value={action.value!r}" if action.value is not None else ""
    return f"{action.type} {action.selector}{value}"


async def _ask(label: str, frame: str, with_frame: bool):
    """One call, straight at the adapter's own `_ask`, bypassing the fallback.

    `decide_with_model` swallows a failure into the rule path, which is right in
    production and wrong here: a rules answer that happens to match would read
    as a model answer. Any failure should be visible as a failure.
    """
    print(f"  asking [{label}] with_frame={with_frame} ...", flush=True)
    try:
        decision = await model_reasoner._ask(_request(label, frame), with_frame)
    except ModelUnavailable as reason:
        print(f"  [{label}] FAILED: {reason}")
        return None
    print(f"  [{label}] -> {_describe(decision)}")
    print(f"           summary: {decision.summary}")
    return decision


def _selector(decision) -> str | None:
    action = getattr(decision, "action", None)
    return action.selector if action is not None else None


async def main() -> int:
    if not model_reasoner.is_configured():
        print("Not configured. Set SHIELD_MODEL_ENDPOINT, _NAME and _KEY.")
        print("See the module docstring for the local, keyless ollama route.")
        return 2

    print(f"model:    {model_reasoner.MODEL_NAME}")
    print(f"endpoint: {model_reasoner.MODEL_ENDPOINT}")
    print(f"timeout:  {model_reasoner.REQUEST_TIMEOUT_S}s")

    plain, banner = _frame_plain(), _frame_with_banner()
    print(f"frames:   {len(plain)} and {len(banner)} chars, identical PAGE CONTEXT")
    print()

    print("VISION - same text, different pixels")
    vision_plain = await _ask("plain", plain, with_frame=True)
    vision_banner = await _ask("banner", banner, with_frame=True)
    print()

    print("CONTROL - same text, frame withheld")
    text_plain = await _ask("plain-textonly", plain, with_frame=False)
    text_banner = await _ask("banner-textonly", banner, with_frame=False)
    print()

    if any(d is None for d in (vision_plain, vision_banner, text_plain, text_banner)):
        print("INCONCLUSIVE - a call failed; nothing above can be read as a result.")
        return 1

    deterministic = _selector(text_plain) == _selector(text_banner)
    moved = _selector(vision_plain) != _selector(vision_banner)

    print(f"control is deterministic: {deterministic}")
    print(f"vision answers differ:    {moved}")
    print()

    if not deterministic:
        print("INCONCLUSIVE - the provider is not deterministic at temperature 0,")
        print("so a difference under vision cannot be attributed to the image.")
        return 1

    if moved:
        print("PROVEN - the only thing that changed was the screenshot, and the")
        print("action changed with it. The redacted frame reaches the reasoning.")
        return 0

    print("NOT SHOWN - the model returned the same action for both frames. The")
    print("frame is on the wire (test_prompt.py) but this experiment did not")
    print("demonstrate that it is read. Record it as such rather than as a pass.")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
