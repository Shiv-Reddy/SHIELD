"""Request and response schemas, mirroring API_SPEC.md Section 3.

The field names are snake_case to match the contract exactly. They are not
Pythonic by accident — the wire format is the specification, and renaming for
style here would mean a translation layer whose only purpose is to undo a
cosmetic choice.
"""

from typing import Literal

from pydantic import BaseModel, Field

# The fixed action allowlist, API_SPEC.md Section 5. Adding a member is a
# security-relevant change, not a routine one, and it must be made in three
# places at once: here, the client's ALLOWED_ACTIONS, and the spec.
ALLOWED_ACTIONS = ("click", "type", "scroll")

SensitiveCategory = Literal[
    "password", "name", "email", "phone", "address", "face", "id_number", "other"
]


class Rect(BaseModel):
    x: float
    y: float
    width: float
    height: float


class RedactedDomEntry(BaseModel):
    """One element of the page, with sensitive values already replaced.

    `value` should hold either non-sensitive content or a placeholder token such
    as `[PASSWORD]`. The server has no way to verify that — by the time anything
    arrives here the redaction has already happened or already failed, on a
    machine this code cannot see. That asymmetry is the design: the guarantee is
    enforced on the client, and nothing here should imply otherwise.
    """

    elementId: str
    elementType: Literal["input", "button", "text", "image", "other"]
    label: str | None = None
    value: str | None = None
    # Whether the field held content at capture time. A redacted field reads
    # "[PASSWORD]" whether full or empty, so without this the reasoner cannot
    # tell "needs filling" from "ready to submit" — different situations calling
    # for different actions. Defaults False so an older client still validates.
    filled: bool = False
    position: Rect


class RedactionManifestEntry(BaseModel):
    regionId: str
    category: SensitiveCategory
    # "manual" means the user drew a box round something and said hide it. It is
    # kept distinct from the three detectors because it is the only one that
    # cannot be wrong about intent, and because an audit record that called a
    # person's decision a pattern match would misdescribe how the redaction
    # happened.
    method: Literal["dom", "visual", "ocr", "manual"]


class AnalyzeRequest(BaseModel):
    request_id: str
    task_query: str = Field(min_length=1, max_length=500)
    redacted_frame: str
    redacted_dom_summary: list[RedactedDomEntry]
    redaction_manifest: list[RedactionManifestEntry]


class Action(BaseModel):
    type: Literal["click", "type", "scroll"]
    selector: str
    value: str | None = None


class ActionReadyResponse(BaseModel):
    request_id: str
    status: Literal["action_ready"] = "action_ready"
    action: Action
    confidence: float
    reasoning_summary: str


class NeedsMoreContextResponse(BaseModel):
    request_id: str
    status: Literal["needs_more_context"] = "needs_more_context"
    reasoning_summary: str


class ErrorResponse(BaseModel):
    request_id: str
    status: Literal["error"] = "error"
    error_code: Literal[
        "MALFORMED_REQUEST", "MODEL_UNAVAILABLE", "ACTION_REJECTED", "INTERNAL_ERROR"
    ]
    message: str
