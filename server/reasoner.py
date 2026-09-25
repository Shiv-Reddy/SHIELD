"""Deciding what to do next, with or without a reasoning model.

Two implementations behind one interface. The rule-based one needs no model, no
key and no network, and handles both locked demo tasks — the login form and the
multi-field sign-up — deterministically. The model-backed one is the general
case.

The rule-based path is not a placeholder to be deleted once a model is wired in.
It is the demo's contingency: DEMO_SCRIPT.md wants the primary task to be
reliable, and a live demo that depends on somebody's free tier being up at 10am
on judging day is a demo with a single point of failure outside our control. It
also means the whole client pipeline can be exercised end to end today, while
the model choice is still open.

WHAT THIS PATH WILL AND WILL NOT DO

It recognises two shapes — a login form and a sign-up form — and declines
everything else rather than guessing. Within those shapes it will click, and on
a login form it will ask the client to fill a saved credential. That is all. It
never invents a value for an empty field, and it never ticks a checkbox whose
only effect is to sign the user up for something extra.
"""

from __future__ import annotations

from dataclasses import dataclass

from schemas import Action, AnalyzeRequest, RedactedDomEntry

# Placeholder tokens the client substitutes for redacted values. The server
# never sees the real content, so these are how it recognises a sensitive field.
PASSWORD_TOKEN = "[PASSWORD]"

# Fields holding a person's own details. `[REDACTED]` is deliberately absent: it
# means "hidden, kind unknown", and counting it would let a single unidentified
# field beside a password look like a form this path understands.
IDENTITY_TOKENS = ("[EMAIL]", "[NAME]", "[PHONE]", "[ADDRESS]", "[ID_NUMBER]")

# What the client is told to type into a redacted field.
#
# Never a real value: the server does not have one and must never be sent one.
# The client resolves this reference against its own local data, which is the
# only place a credential is allowed to exist.
CREDENTIAL_REFERENCE = "[USE_SAVED_CREDENTIAL]"

# Submit wording, split three ways rather than pooled into one list.
#
# Pooling them is the defect this replaces. A sign-up page nearly always also
# carries a "Sign in" control for people who already have an account, and a
# login page often carries "Create one". With a single list the first match wins
# and Shield clicks the wrong one, which on a real page navigates away from the
# form the user asked it to complete. So each form kind prefers its own wording,
# both fall back to the neutral words, and neither ever falls back to the
# other's.
LOGIN_SUBMIT_WORDS = ("sign in", "signin", "log in", "login")
SIGNUP_SUBMIT_WORDS = (
    "create account",
    "create my account",
    "create your account",
    "sign up",
    "signup",
    "register",
    "get started",
    "join now",
)
NEUTRAL_SUBMIT_WORDS = ("submit", "continue", "next")

# How the client reports a checkbox. `dom-map.ts` emits exactly these two
# strings, and they are the only way the server can tell a checkbox from a text
# input: `RedactedDomEntry` carries no control type, and widening the payload to
# add one for a single rule was not worth it.
CHECKED = "checked"
UNCHECKED = "unchecked"

# Wording that marks a checkbox as a condition of using the form at all.
CONSENT_PHRASES = (
    "terms",
    "privacy policy",
    "conditions",
    "i agree",
    "i accept",
    "agree to",
    "accept the",
)

# Wording that marks a checkbox as an opt-in to something extra. Checked FIRST,
# and a match here disqualifies the box outright — "I agree to receive marketing
# email" contains a consent phrase and is emphatically not one.
#
# Ticking this kind of box is not part of any task a user asked for: it signs
# them up for mail they did not request, from a page they may never return to,
# and it is awkward to undo. Leaving it exactly as they left it is the
# action-side reading of "when uncertain, do nothing".
OPTIONAL_PHRASES = (
    "newsletter",
    "marketing",
    "promotion",
    "offers",
    "updates",
    "announcements",
    "send me",
    "email me",
    "subscribe",
    "keep me",
)


@dataclass
class Decision:
    action: Action | None
    confidence: float
    summary: str


def _label(entry: RedactedDomEntry) -> str:
    return (entry.label or "").strip().lower()


def _matches(label: str, words: tuple[str, ...]) -> bool:
    return any(word in label for word in words)


def _find_button(
    elements: list[RedactedDomEntry],
    words: tuple[str, ...],
    below: float | None = None,
) -> RedactedDomEntry | None:
    """The best word-matching button, nearest first from `below` downward.

    `below` is the bottom of the last field in the form. Ordering by distance
    from it rather than by document order is what keeps a header's "Sign in"
    from beating the form's own submit button: both match the wording, but only
    one of them sits directly under the fields the user just filled. Buttons
    above the fields are dropped outright — a control that precedes the form is
    not the control that submits it.

    With no geometry to work from the behaviour falls back to document order,
    which is what it always did.
    """
    candidates = [
        entry
        for entry in elements
        if entry.elementType == "button" and _matches(_label(entry), words)
    ]

    if below is None:
        return candidates[0] if candidates else None

    # A small tolerance, because a submit button sitting inline beside the last
    # field is common and its top edge can be a pixel or two above it.
    below_fields = [
        entry for entry in candidates if entry.position.y + entry.position.height >= below - 8
    ]
    if not below_fields:
        return None

    return min(below_fields, key=lambda entry: entry.position.y)


def _last_field_bottom(fields: list[RedactedDomEntry]) -> float | None:
    """The bottom edge of the lowest field, or None when there are none."""
    if not fields:
        return None
    return max(field.position.y + field.position.height for field in fields)


def _find_submit(
    elements: list[RedactedDomEntry],
    preferred: tuple[str, ...],
    below: float | None = None,
) -> RedactedDomEntry | None:
    """The control that submits this form, preferring the form's own wording.

    Two passes rather than one combined word list, so a sign-up page's "Sign in"
    link can never win over its "Create account" button by appearing first in
    the DOM — and, since the real-site runs, positioned below the fields so a
    navigation link cannot win over the form's own button either.
    """
    return _find_button(elements, preferred, below) or _find_button(
        elements, NEUTRAL_SUBMIT_WORDS, below
    )


def _is_checkbox(entry: RedactedDomEntry) -> bool:
    return entry.elementType == "input" and entry.value in (CHECKED, UNCHECKED)


def is_optional_opt_in(entry: RedactedDomEntry) -> bool:
    """True for an unticked box whose only effect is to sign the user up for more.

    Public because `model_reasoner.interpret` needs the same answer. Both
    reasoning paths decide the same task, so a box the rules refuse to tick must
    also be one the model is not allowed to tick — otherwise the behaviour
    depends on whether a free tier happened to answer, and the riskier of the
    two is the one nobody tested.
    """
    return (
        _is_checkbox(entry)
        and entry.value == UNCHECKED
        and _matches(_label(entry), OPTIONAL_PHRASES)
    )


def _is_required_consent(entry: RedactedDomEntry) -> bool:
    """True for an unticked box that gates the form, false for everything else.

    Deliberately hard to satisfy. The default answer is no, and a box qualifies
    only by saying, in its own words, that it is a condition rather than an
    offer. The opt-in test runs first because "I agree to receive marketing
    email" contains a consent phrase and is emphatically not consent.
    """
    if not _is_checkbox(entry) or entry.value != UNCHECKED:
        return False

    if is_optional_opt_in(entry):
        return False

    return _matches(_label(entry), CONSENT_PHRASES)


def _form_kind(
    password_fields: list[RedactedDomEntry],
    identity_fields: list[RedactedDomEntry],
    elements: list[RedactedDomEntry],
) -> str | None:
    """Which of the two shapes this is, or None for "not one Shield knows".

    Decided from the FIELDS, never from the buttons. Two signals, either enough:

      - two or more password fields, since a confirmation pair exists only where
        a password is being *set*;
      - three or more distinct categories of personal field, which a login form
        has no reason to ask for.

    A third signal used to sit between those two — "a control worded as a
    sign-up exists" — and it was wrong on real pages in a way no fixture could
    show. Nearly every real login page carries a "Sign up" or "Create account"
    link for people without an account, so that rule classified real login pages
    as sign-ups. Measured on a live login page: one password field and one email
    field, both detected correctly, and the reasoner then announced "Sign-up form
    filled and consented. Submitting it." and chose the sign-up LINK as the
    control to click. Outside observe-only mode that click navigates away from
    the form the user asked Shield to fill.

    The irony is worth recording. `LOGIN_SUBMIT_WORDS` and `SIGNUP_SUBMIT_WORDS`
    were split precisely so a sign-up page's "Sign in" link could not win — and
    the same mistake in the opposite direction was left wide open, because the
    login fixture has no sign-up link and real login pages all do.

    Buttons still choose WHICH control to click, once the kind is known. They no
    longer get a vote on what kind of form it is: the presence of a link to
    somewhere else says nothing about the form in front of you.
    """
    if not password_fields or not identity_fields:
        return None

    if len(password_fields) >= 2:
        return "signup"

    if len({field.value for field in identity_fields}) >= 3:
        return "signup"

    return "login"


def _decide_login(
    password_fields: list[RedactedDomEntry], elements: list[RedactedDomEntry]
) -> Decision:
    """The Phase 1 path, unchanged in behaviour.

    An empty password here is exactly the case a saved credential is for: the
    account already exists, so a stored value could be the right one.
    """
    unfilled = [field for field in password_fields if not field.filled]

    if unfilled:
        return Decision(
            action=Action(
                type="type",
                selector=unfilled[0].elementId,
                value=CREDENTIAL_REFERENCE,
            ),
            confidence=0.9,
            summary=(
                "Found a login form with an empty password field. Filling it "
                "from locally saved credentials."
            ),
        )

    submit = _find_submit(
        elements, LOGIN_SUBMIT_WORDS, _last_field_bottom(password_fields)
    )
    if submit:
        return Decision(
            action=Action(type="click", selector=submit.elementId, value=None),
            confidence=0.9,
            summary="Found a login form with both fields already filled. Submitting it.",
        )

    return Decision(
        action=None,
        confidence=0.0,
        summary="The login form is filled but no submit control was found.",
    )


def _empty_field_note(identity_fields: list[RedactedDomEntry]) -> str:
    """A sentence about fields the user has not filled, or nothing.

    Empty non-password fields do not block the submit. Shield cannot know which
    of them the page requires — `required` is not in the payload — and it will
    not invent a value for any of them, so the alternatives are to submit what
    the user has already typed or to refuse every sign-up carrying an optional
    field. It is named rather than hidden: if the page does require the field,
    the user should hear it from Shield before the page says it.
    """
    empty = len([field for field in identity_fields if not field.filled])

    if empty == 0:
        return ""
    if empty == 1:
        return " One personal field is still empty; Shield will not invent a value for it."
    return f" {empty} personal fields are still empty; Shield will not invent values for them."


def _look_further_down(elements: list[RedactedDomEntry]) -> Decision:
    """Scroll toward the bottom of a sign-up form whose submit control is off-screen.

    WHY THIS EXISTS, since it was found the expensive way. The client captures
    only what intersects the viewport (`dom-map.ts`), so on the first real run
    against `02-signup.html` the "Create account" button was simply absent from
    the payload — it sits about fifteen pixels below a 945px fold. The server
    said "no submit control was found", which was true, and the run stopped one
    action short of finishing. Every sign-up form worth the name is taller than
    the fold, so declining here would mean Shield can never finish a real one.

    `scroll` has been in the allowlist since API_SPEC.md was written and had
    never once been used. This is what it is for.

    SCOPED TO SIGN-UP ON PURPOSE. The login path keeps declining: a login form
    is short enough that its button is effectively always visible, and Screen
    5's recorded outcome — declining for want of a submit control — is a
    measured result that this must not quietly change.

    WHAT BOUNDS IT. Nothing here counts scrolls, because the client already
    does it better. Element ids are assigned per capture in document order, so
    if the page cannot scroll any further the next capture sees the same
    elements in the same order, produces the same id for the same target, and
    the client's repeat detection refuses the duplicate before performing it.
    If the page can scroll, the set of visible elements changes and real
    progress is made. `MAX_STEPS` is the backstop behind both.
    """
    # The lowest thing on screen, since scrolling to it reveals the most of what
    # lies beneath. Text counts: a legend or a footnote is often the last thing
    # above the button.
    target = max(
        elements,
        key=lambda entry: entry.position.y + entry.position.height,
        default=None,
    )

    if target is None:
        return Decision(
            action=None,
            confidence=0.0,
            summary=(
                "This is a sign-up form and its fields are filled, but no "
                "control to submit it was found on this screen."
            ),
        )

    return Decision(
        action=Action(type="scroll", selector=target.elementId, value=None),
        confidence=0.6,
        summary=(
            "This sign-up form is filled, but its submit control is not on "
            "screen. Scrolling down to look for it."
        ),
    )


def _decide_signup(
    password_fields: list[RedactedDomEntry],
    identity_fields: list[RedactedDomEntry],
    elements: list[RedactedDomEntry],
) -> Decision:
    """Finish a sign-up the user has already filled in.

    "Finish", not "fill". Shield holds no credentials and invents no values, so
    the only steps available here are the ones needing no knowledge it does not
    have: agreeing to the terms, and submitting.
    """
    unfilled_passwords = [field for field in password_fields if not field.filled]

    # A new password and its confirmation, both filled, mean the sign-up's own
    # password is set. An empty password box beside them then belongs to some
    # other form on the page — found on the first real bank site tried
    # (ParaBank, 2026-09-25), whose sidebar keeps a login box on every page,
    # including the registration page, where it made this decline a sign-up
    # that was ready to submit.
    if sum(1 for field in password_fields if field.filled) >= 2:
        unfilled_passwords = []

    # A sign-up password is a NEW password for an account that does not exist
    # yet, so no credential store could hold it. Asking for a saved one is wrong
    # in principle here, not merely unfulfillable as it would be on a login
    # form. Declining says something true; emitting the reference would produce
    # a client-side error on a path that was never going to succeed, and an
    # error reads as a bug rather than as a boundary.
    if unfilled_passwords:
        return Decision(
            action=None,
            confidence=0.0,
            summary=(
                "This sign-up form needs a new password. Shield holds no saved "
                "credentials and will not invent one, so set the password "
                "yourself and run Shield again to finish the form."
            ),
        )

    consent = next((entry for entry in elements if _is_required_consent(entry)), None)
    if consent is not None:
        return Decision(
            action=Action(type="click", selector=consent.elementId, value=None),
            confidence=0.85,
            summary=(
                "Sign-up form with its fields filled. Ticking the consent "
                "checkbox, which the form requires before it can be submitted."
            ),
        )

    submit = _find_submit(
        elements,
        SIGNUP_SUBMIT_WORDS,
        _last_field_bottom(password_fields + identity_fields),
    )
    if submit is None:
        return _look_further_down(elements)

    return Decision(
        action=Action(type="click", selector=submit.elementId, value=None),
        confidence=0.85,
        summary=(
            "Sign-up form filled and consented. Submitting it."
            + _empty_field_note(identity_fields)
        ),
    )


def recognised_form(request: AnalyzeRequest) -> str | None:
    """"login", "signup", or None — the same reading `decide_by_rules` acts on.

    Public so the model adapter can send the two shapes the rules were built and
    tested for to the rules, and only everything else to the model.
    """
    elements = request.redacted_dom_summary
    identity_fields = [
        entry
        for entry in elements
        if entry.elementType == "input" and entry.value in IDENTITY_TOKENS
    ]
    password_fields = [
        entry
        for entry in elements
        if entry.elementType == "input" and entry.value == PASSWORD_TOKEN
    ]
    return _form_kind(password_fields, identity_fields, elements)


def decide_by_rules(request: AnalyzeRequest) -> Decision:
    """Choose the next action from the page's structure alone.

    Deliberately conservative. It recognises the shapes it knows — a login form
    and a sign-up form — and declines otherwise, rather than guessing: a wrong
    action on somebody's real page is a far worse outcome than an honest "I do
    not know", and this path exists precisely for the moments when nothing
    cleverer is available.
    """
    elements = request.redacted_dom_summary

    identity_fields = [
        entry
        for entry in elements
        if entry.elementType == "input" and entry.value in IDENTITY_TOKENS
    ]
    password_fields = [
        entry
        for entry in elements
        if entry.elementType == "input" and entry.value == PASSWORD_TOKEN
    ]

    kind = _form_kind(password_fields, identity_fields, elements)

    if kind == "signup":
        return _decide_signup(password_fields, identity_fields, elements)

    if kind == "login":
        return _decide_login(password_fields, elements)

    return Decision(
        action=None,
        confidence=0.0,
        summary=(
            "No recognised form on this screen. The rule-based reasoner handles "
            "login and sign-up forms only."
        ),
    )
