"""Checks for the rule-based reasoner and the request schema.

Run with: .venv/Scripts/python test_reasoner.py

Deliberately dependency-free — no pytest — so it runs anywhere the server runs.
The payloads mirror what the extension actually seals, including the placeholder
tokens, because a fixture that invents its own shape tests the fixture.
"""

from __future__ import annotations

import sys

from reasoner import CREDENTIAL_REFERENCE, decide_by_rules
from schemas import AnalyzeRequest

FRAME = "data:image/jpeg;base64,AAAA"


def _element(element_id, element_type, value, label=None, filled=None):
    # `filled` defaults to "there is a value", which is what the client reports.
    return {
        "elementId": element_id,
        "elementType": element_type,
        "value": value,
        "label": label,
        "filled": bool(value) if filled is None else filled,
        "position": {"x": 0, "y": 0, "width": 10, "height": 10},
    }


def _request(elements, task="log me in"):
    return AnalyzeRequest.model_validate(
        {
            "request_id": "test-1",
            "task_query": task,
            "redacted_frame": FRAME,
            "redacted_dom_summary": elements,
            "redaction_manifest": [],
        }
    )


failures = []


def check(name, condition, detail=""):
    if condition:
        print(f"ok   {name}")
    else:
        failures.append(name)
        print(f"FAIL {name} {detail}")


# The login screen with an EMPTY password field: the assistant should fill it.
# Both cases read "[PASSWORD]", so `filled` is the only thing separating them.
empty_password = _request(
    [
        _element("e0", "input", "[EMAIL]", "Username"),
        _element("e1", "input", "[PASSWORD]", "Password", filled=False),
        _element("e2", "button", None, "Sign in"),
    ]
)
decision = decide_by_rules(empty_password)
check(
    "empty password field is typed into",
    decision.action is not None
    and decision.action.type == "type"
    and decision.action.selector == "e1",
    f"got {decision.action}",
)
check(
    "no real credential is ever produced",
    decision.action is not None and decision.action.value == CREDENTIAL_REFERENCE,
    f"got {decision.action.value if decision.action else None}",
)

# The demo screen: both fields already filled, so the next step is to submit.
# This is the action DEMO_SCRIPT.md step 6 depends on.
filled_login = _request(
    [
        _element("e0", "input", "[EMAIL]", "Username", filled=True),
        _element("e1", "input", "[PASSWORD]", "Password", filled=True),
        _element("e2", "button", None, "Sign in"),
    ]
)
decision = decide_by_rules(filled_login)
check(
    "a filled login form is submitted rather than retyped",
    decision.action is not None
    and decision.action.type == "click"
    and decision.action.selector == "e2",
    f"got {decision.action}",
)

# A page with nothing recognisable must decline rather than guess.
empty = _request([_element("e0", "text", "Welcome to our site")])
decision = decide_by_rules(empty)
check("unrecognised page declines", decision.action is None)
check("declining still explains itself", bool(decision.summary))

# A page carrying a real-looking password would mean redaction failed upstream.
# The reasoner must not treat it as a login form to complete.
leaked = _request(
    [
        _element("e0", "input", "[EMAIL]", "Username"),
        _element("e1", "input", "hunter2", "Password", filled=True),
    ]
)
decision = decide_by_rules(leaked)
check(
    "an unredacted password is not treated as a password field",
    decision.action is None,
    f"got {decision.action}",
)

# The schema must reject a task query that is empty.
try:
    _request([], task="")
    check("empty task query is rejected", False, "validation passed")
except Exception:
    check("empty task query is rejected", True)

# The schema must reject an action type outside the allowlist if one appears.
from schemas import Action  # noqa: E402

try:
    Action.model_validate({"type": "navigate", "selector": "#x"})
    check("disallowed action type is rejected", False, "validation passed")
except Exception:
    check("disallowed action type is rejected", True)


# --- Phase 2: the multi-field sign-up ---------------------------------------
#
# These payloads mirror test-screens/02-signup.html as the client actually seals
# it — the same elementIds, the same placeholder tokens, the same `unchecked`
# checkbox values — because a fixture that invents its own shape tests the
# fixture. The measured detection result for that page is 11 flagged fields from
# 21 mapped elements, and every token below comes from that run.


def _signup_elements(consent="unchecked", password_filled=True, display_name_filled=False):
    return [
        _element("e0", "text", "Create your account"),
        _element("s1", "input", "[NAME]", "First name"),
        _element("s2", "input", "[NAME]", "Last name"),
        _element("s5", "input", "[REDACTED]", "Date of birth"),
        _element("s3", "input", "[EMAIL]", "Email address"),
        _element("s4", "input", "[PHONE]", "Mobile number"),
        _element("s6", "input", "[ADDRESS]", "Street address"),
        _element("s7", "input", "[ADDRESS]", None),
        _element("s10", "input", "[ID_NUMBER]", None),
        _element("s11", "input", "[NAME]", "Display name", filled=display_name_filled),
        _element("s8", "input", "[PASSWORD]", "Password", filled=password_filled),
        _element("s9", "input", "[PASSWORD]", "Confirm password", filled=password_filled),
        _element("s12", "input", "A friend", "How did you hear about us?"),
        _element(
            "s13", "input", consent, "I accept the terms of service and privacy policy"
        ),
        _element("s14", "input", "unchecked", "Send me occasional product updates"),
        _element("e-submit", "button", None, "Create account"),
    ]


# Step 1 of the second demo task, exactly as it will run in Chrome: everything
# is filled but the consent box is unticked, so that is the next action.
decision = decide_by_rules(_request(_signup_elements(), task="create this account"))
check(
    "an unticked consent box is ticked before anything else",
    decision.action is not None
    and decision.action.type == "click"
    and decision.action.selector == "s13",
    f"got {decision.action}",
)
check(
    "a sign-up form is not described to the user as a login form",
    "login" not in decision.summary.lower(),
    f"got {decision.summary!r}",
)

# Step 2: the box is now ticked, so the form is submitted. The button says
# "Create account", which is the exact word the old submit list did not have —
# it is the measured Phase 2 blocker, checked directly.
decision = decide_by_rules(
    _request(_signup_elements(consent="checked"), task="create this account")
)
check(
    "a consented sign-up form is submitted at its own button",
    decision.action is not None
    and decision.action.type == "click"
    and decision.action.selector == "e-submit",
    f"got {decision.action}",
)
check(
    "the empty display name is reported rather than filled",
    "empty" in decision.summary.lower(),
    f"got {decision.summary!r}",
)
check(
    "no action ever targets the marketing opt-in",
    decision.action is not None and decision.action.selector != "s14",
    f"got {decision.action}",
)

# The marketing box is the only unticked box left once consent is given, and it
# must stay unticked. Ticking it signs the user up for mail they never asked
# for, from a page they may never come back to.
decision = decide_by_rules(
    _request(
        [
            entry
            for entry in _signup_elements(consent="checked")
            if entry["elementId"] != "e-submit"
        ],
        task="create this account",
    )
)
check(
    "with consent given and no submit control, Shield never ticks the marketing box",
    decision.action is None or decision.action.selector != "s14",
    f"got {decision.action}",
)
check(
    "and it looks further down the page rather than clicking something else",
    decision.action is not None and decision.action.type == "scroll",
    f"got {decision.action}",
)
check(
    "the scroll explains itself as a sign-up form, not a login form",
    "sign-up" in decision.summary.lower() and "login" not in decision.summary.lower(),
    f"got {decision.summary!r}",
)

# A box worded as an opt-in is not consent, even though it contains the word
# "agree". The opt-in wording is checked first for exactly this case.
marketing_worded_as_consent = _signup_elements(consent="checked")
marketing_worded_as_consent[14] = _element(
    "s14", "input", "unchecked", "I agree to receive marketing email from partners"
)
decision = decide_by_rules(_request(marketing_worded_as_consent))
check(
    "an opt-in worded as an agreement is still not ticked",
    decision.action is not None and decision.action.selector == "e-submit",
    f"got {decision.action}",
)

# An empty sign-up password is a decline, not a saved-credential request. The
# account does not exist yet, so no store could hold that password.
decision = decide_by_rules(
    _request(_signup_elements(password_filled=False), task="create this account")
)
check(
    "an empty sign-up password produces no action at all",
    decision.action is None,
    f"got {decision.action}",
)
check(
    "the refusal says Shield will not invent the password",
    "will not invent" in decision.summary.lower(),
    f"got {decision.summary!r}",
)

# A sign-up page nearly always also carries a way to reach the login page, and
# it often comes first in the DOM. Clicking it navigates away from the form the
# user asked Shield to finish.
with_signin_link = _signup_elements(consent="checked")
with_signin_link.insert(0, _element("e-signin", "button", None, "Sign in instead"))
decision = decide_by_rules(_request(with_signin_link, task="create this account"))
check(
    "a sign-up form is submitted at Create account, not at a Sign in link that "
    "appears first",
    decision.action is not None and decision.action.selector == "e-submit",
    f"got {decision.action}",
)

# Two password fields are enough on their own: a confirmation pair only exists
# where a password is being set. Here the button carries neutral wording, so
# nothing but the field count identifies the form.
neutral_signup = [
    _element("n1", "input", "[EMAIL]", "Email"),
    _element("n2", "input", "[PASSWORD]", "Password"),
    _element("n3", "input", "[PASSWORD]", "Repeat password"),
    _element("n4", "button", None, "Continue"),
]
decision = decide_by_rules(_request(neutral_signup))
check(
    "a confirmation password pair identifies a sign-up on its own",
    decision.action is not None and decision.action.selector == "n4",
    f"got {decision.action}",
)
check(
    "and it is not called a login form either",
    "login" not in decision.summary.lower(),
    f"got {decision.summary!r}",
)

# Regressions against the three screens whose behaviour is already recorded in
# TASKS.md. Each one is a result somebody measured in Chrome; a rule change that
# quietly altered any of them would invalidate what is written there.

screen_1 = [
    _element("e0", "text", "Acme Internal Portal"),
    _element("e2", "input", "[EMAIL]", "Username", filled=True),
    _element("e3", "input", "[PASSWORD]", "Password", filled=True),
    _element("e4", "input", "checked", "Keep me signed in"),
    # Appears BEFORE the real submit button and contains the word "password".
    _element("e5", "button", None, "Forgot password?"),
    _element("e6", "button", None, "Sign in"),
]
decision = decide_by_rules(_request(screen_1))
check(
    "Screen 1 still submits at Sign in, not at the Forgot password link before it",
    decision.action is not None
    and decision.action.type == "click"
    and decision.action.selector == "e6",
    f"got {decision.action}",
)
check(
    "Screen 1's already-ticked remember box is left alone",
    decision.action is not None and decision.action.selector != "e4",
    f"got {decision.action}",
)

# Screen 5, the adversarial page: one password field, one identity field, no
# button anywhere. Recorded outcome is a decline for want of a submit control.
screen_5 = [
    _element("c1", "input", "[PASSWORD]", "Password", filled=True),
    _element("c2", "input", "[REDACTED]", None, filled=True),
    _element("t3", "text", "Account contact: [EMAIL]"),
    _element("c7", "input", "[EMAIL]", "Display name", filled=True),
]
decision = decide_by_rules(_request(screen_5))
check("Screen 5 still declines", decision.action is None, f"got {decision.action}")

# Screen 4, the clean control page: nothing was flagged, so nothing is a form.
screen_4 = [
    _element("e0", "text", "Release notes"),
    _element("e3", "input", None, None, filled=False),
    _element("e4", "button", None, "Search"),
    _element("e8", "input", "unchecked", "Send me release announcements"),
]
decision = decide_by_rules(_request(screen_4))
check("Screen 4 still declines outright", decision.action is None, f"got {decision.action}")
check(
    "and Screen 4's newsletter box is never ticked",
    decision.action is None,
    f"got {decision.action}",
)


# --- Varied wording ---------------------------------------------------------
#
# Screen 2 says "Create account" and "I accept the terms of service and privacy
# policy". Real sign-up pages say a dozen other things, and a rule tested
# against one phrasing is a rule tested against nothing. These tables are the
# measurement the "varied field labels/formats" task asks for: each row is a
# wording, and the check is that the decision does not depend on which row it is.


def _signup_with(submit_label, consent_label):
    return _request(
        [
            _element("v1", "input", "[NAME]", "Full name", filled=True),
            _element("v2", "input", "[EMAIL]", "Email", filled=True),
            _element("v3", "input", "[PASSWORD]", "Password", filled=True),
            _element("v4", "input", "[PASSWORD]", "Confirm", filled=True),
            _element("v5", "input", "unchecked", consent_label),
            _element("v6", "button", None, submit_label),
        ],
        task="create this account",
    )


# Sign-up wording that must all reach the same consent-then-submit sequence.
SUBMIT_WORDINGS = [
    "Create account",
    "Create Account",
    "Create my account",
    "Create your account",
    "Sign up",
    "Sign Up Free",
    "Signup",
    "Register",
    "Register now",
    "Get started",
    "Join now",
    # Neutral wording, reached by the fallback rather than the sign-up list.
    "Continue",
    "Submit",
    "Next",
]

for label in SUBMIT_WORDINGS:
    decision = decide_by_rules(_signup_with(label, "I accept the terms of service"))
    check(
        f"submit wording {label!r} is recognised",
        decision.action is not None and decision.action.selector == "v5",
        f"got {decision.action}",
    )

# The same, once consent is given: the submit control itself must be found.
for label in SUBMIT_WORDINGS:
    request = _request(
        [
            _element("v1", "input", "[NAME]", "Full name", filled=True),
            _element("v2", "input", "[EMAIL]", "Email", filled=True),
            _element("v3", "input", "[PASSWORD]", "Password", filled=True),
            _element("v4", "input", "[PASSWORD]", "Confirm", filled=True),
            _element("v5", "input", "checked", "I accept the terms of service"),
            _element("v6", "button", None, label),
        ],
        task="create this account",
    )
    decision = decide_by_rules(request)
    check(
        f"submit control {label!r} is clicked once consent is given",
        decision.action is not None and decision.action.selector == "v6",
        f"got {decision.action}",
    )

# Consent wording that must be ticked.
CONSENT_WORDINGS = [
    "I accept the terms of service and privacy policy",
    "I agree to the Terms and Conditions",
    "I have read and accept the privacy policy",
    "Accept the terms",
    "I agree to the terms of use",
]

for label in CONSENT_WORDINGS:
    decision = decide_by_rules(_signup_with("Create account", label))
    check(
        f"consent wording {label!r} is ticked",
        decision.action is not None and decision.action.selector == "v5",
        f"got {decision.action}",
    )

# Opt-in wording that must NOT be ticked, including the three that deliberately
# borrow the language of consent. On each of these the form is otherwise ready,
# so the correct action is to submit — and any run that ticks v5 instead has
# signed the user up for mail.
OPT_IN_WORDINGS = [
    "Send me occasional product updates",
    "Subscribe to our newsletter",
    "Email me about offers and promotions",
    "Keep me informed about new features",
    "I agree to receive marketing email",
    "I accept promotional offers from partners",
    "I agree to receive product announcements",
]

for label in OPT_IN_WORDINGS:
    request = _request(
        [
            _element("v1", "input", "[NAME]", "Full name", filled=True),
            _element("v2", "input", "[EMAIL]", "Email", filled=True),
            _element("v3", "input", "[PASSWORD]", "Password", filled=True),
            _element("v4", "input", "[PASSWORD]", "Confirm", filled=True),
            _element("v5", "input", "unchecked", label),
            _element("v6", "button", None, "Create account"),
        ],
        task="create this account",
    )
    decision = decide_by_rules(request)
    check(
        f"opt-in wording {label!r} is left alone",
        decision.action is not None and decision.action.selector == "v6",
        f"got {decision.action}",
    )


# --- The fold ---------------------------------------------------------------
#
# Found the expensive way, on the first real run against 02-signup.html: the
# client captures only what intersects the viewport, and the "Create account"
# button sits about fifteen pixels below a 945px fold. The payload therefore
# carried no button at all, and the server said so — correctly, and one action
# short of finishing. These checks are that page's geometry, not an invented
# one, so they fail if the fix stops matching the case that motivated it.


def _at(eid, etype, value, label, y, height=34, filled=None):
    entry = _element(eid, etype, value, label, filled)
    entry["position"] = {"x": 49, "y": y, "width": 337, "height": height}
    return entry


# The 21 elements Chrome actually produced, at their measured positions. There
# is no button: that is the whole point.
BELOW_THE_FOLD = [
    _at("e0", "input", "[NAME]", "First name", 151),
    _at("e1", "input", "[NAME]", "Last name", 151),
    _at("e2", "input", "[REDACTED]", "Date of birth", 216, 37),
    _at("e3", "input", "[EMAIL]", "Email address", 342),
    _at("e4", "input", "[PHONE]", "Mobile number", 342),
    _at("e5", "input", "[ADDRESS]", "Street address", 407),
    _at("e6", "input", "[ADDRESS]", None, 451),
    _at("e7", "input", "[ID_NUMBER]", None, 553),
    _at("e8", "input", "[NAME]", "Display name", 676, filled=False),
    _at("e9", "input", "[PASSWORD]", "Password", 741),
    _at("e10", "input", "[PASSWORD]", "Confirm password", 741),
    _at("e11", "input", "A friend", "How did you hear about us?", 846),
    _at("e12", "input", "checked", "I accept the terms of service and privacy policy", 890, 18),
    _at("e13", "input", "unchecked", "Send me occasional product updates", 912, 18),
    _at("e20", "text", "Preferences", None, 820, 14),
]

decision = decide_by_rules(_request(BELOW_THE_FOLD, task="create this account"))
check(
    "a filled sign-up whose button is below the fold scrolls rather than declining",
    decision.action is not None and decision.action.type == "scroll",
    f"got {decision.action}",
)
check(
    "it scrolls to the lowest element on screen, since that reveals the most",
    decision.action is not None and decision.action.selector == "e13",
    f"got {decision.action}",
)
check(
    "the scroll is not aimed at the marketing box as something to click",
    decision.action is not None and decision.action.type != "click",
    f"got {decision.action}",
)

# Consent still comes first. A scroll that skipped past an unticked consent box
# would arrive at the button with the form still unsubmittable.
unticked = [dict(entry) for entry in BELOW_THE_FOLD]
unticked[12] = _at(
    "e12", "input", "unchecked", "I accept the terms of service and privacy policy", 890, 18
)
decision = decide_by_rules(_request(unticked, task="create this account"))
check(
    "an unticked consent box is handled before scrolling for the button",
    decision.action is not None
    and decision.action.type == "click"
    and decision.action.selector == "e12",
    f"got {decision.action}",
)

# An empty password still stops everything, fold or no fold. Scrolling toward a
# button Shield is not going to press would be motion for its own sake.
empty_pw = [dict(entry) for entry in BELOW_THE_FOLD]
empty_pw[9] = _at("e9", "input", "[PASSWORD]", "Password", 741, filled=False)
empty_pw[10] = _at("e10", "input", "[PASSWORD]", "Confirm password", 741, filled=False)
decision = decide_by_rules(_request(empty_pw, task="create this account"))
check(
    "an empty password stops the run before any scrolling",
    decision.action is None,
    f"got {decision.action}",
)

# Once the button is on screen, Shield submits instead of scrolling further.
scrolled = list(BELOW_THE_FOLD) + [_at("e21", "button", None, "Create account", 520, 36)]
decision = decide_by_rules(_request(scrolled, task="create this account"))
check(
    "once the button is visible it is clicked, not scrolled past",
    decision.action is not None
    and decision.action.type == "click"
    and decision.action.selector == "e21",
    f"got {decision.action}",
)

# The login path must NOT learn to scroll. Screen 5's recorded outcome is that
# it declines for want of a submit control, and that is a measured result.
login_no_submit = [
    _at("e0", "input", "[EMAIL]", "Username", 100, filled=True),
    _at("e1", "input", "[PASSWORD]", "Password", 150, filled=True),
    _at("e2", "text", "Some footer text", None, 900, 20),
]
decision = decide_by_rules(_request(login_no_submit))
check(
    "a login form with no submit control still declines rather than scrolling",
    decision.action is None,
    f"got {decision.action}",
)

print()
print(f"{len(failures)} failing check(s)" if failures else "all checks pass")
sys.exit(1 if failures else 0)
