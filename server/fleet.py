"""The organisation view: every laptop's counts in one place, and one policy.

WHAT A LAPTOP SENDS

The same audit history the compliance report is built from, and nothing else:
when a pass happened, whether it was a task or a scan, whether anything left
the laptop, and how many items of each kind were hidden. No page text, no
field values, no web addresses. The schema below is the enforcement, not a
convention: a report carrying any other field is refused whole, and the
extension's own list of rules that fired is dropped here, because a count is
all an administrator needs and a rule name is one more string to reason about.

WHY IT LIVES ON THIS SERVER

A bank already has to run this server for /analyze, so the dashboard costs no
second deployment. Storage is one JSON file beside the code. That is enough to
show the shape of the product; a real deployment would put it in the bank's
own database behind its single sign-on, and nothing in the report format would
change.
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from schemas import SensitiveCategory

DATA_FILE = Path(os.environ.get("SHIELD_FLEET_FILE", Path(__file__).with_name("fleet_data.json")))
ORG_NAME = os.environ.get("SHIELD_ORG_NAME", "Your organisation").strip() or "Your organisation"
ADMIN_TOKEN = os.environ.get("SHIELD_ADMIN_TOKEN", "").strip()

# The most a laptop's history can hold, matching the extension's own cap. A
# report longer than this is not a laptop's history.
MAX_ENTRIES = 200

_lock = threading.Lock()


class _Strict(BaseModel):
    # Unknown fields are refused, not ignored. Ignoring them would make "counts
    # only" true of what is stored while something else was still being sent.
    model_config = ConfigDict(extra="forbid")


class CategoryCount(_Strict):
    category: SensitiveCategory
    count: int = Field(ge=0, le=100_000)


class FleetEntry(_Strict):
    at: int = Field(ge=0)
    kind: Literal["run", "scan"]
    examined: Literal["viewport", "document", "document-partial"]
    transmitted: bool
    counts: list[CategoryCount] = Field(max_length=16)
    total: int = Field(ge=0, le=100_000)
    durationMs: float | None = Field(default=None, ge=0)


class FleetReport(_Strict):
    device_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9-]+$")
    device_name: str = Field(min_length=1, max_length=40)
    team: str = Field(min_length=1, max_length=40)
    entries: list[FleetEntry] = Field(max_length=MAX_ENTRIES)


class Policy(_Strict):
    requireConsent: bool


def _read() -> dict[str, object]:
    try:
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            return data
    except (OSError, ValueError):
        pass
    return {"devices": {}, "policy": {"requireConsent": False, "updatedAt": None}}


def _write(data: dict[str, object]) -> None:
    temporary = DATA_FILE.with_suffix(".tmp")
    temporary.write_text(json.dumps(data), encoding="utf-8")
    temporary.replace(DATA_FILE)


def record_report(report: FleetReport) -> None:
    """Replace one laptop's history with the one it just sent.

    Replaced rather than appended: the laptop sends its whole (capped) history
    each time, so a lost or repeated report can never double-count.
    """
    with _lock:
        data = _read()
        devices = data.setdefault("devices", {})
        assert isinstance(devices, dict)
        devices[report.device_id] = {
            "name": report.device_name,
            "team": report.team,
            "seen": int(time.time() * 1000),
            "entries": [entry.model_dump() for entry in report.entries],
        }
        _write(data)


def get_policy() -> dict[str, object]:
    with _lock:
        policy = _read().get("policy")
    if not isinstance(policy, dict):
        return {"requireConsent": False, "updatedAt": None}
    return {
        "requireConsent": policy.get("requireConsent") is True,
        "updatedAt": policy.get("updatedAt"),
    }


def set_policy(policy: Policy) -> dict[str, object]:
    with _lock:
        data = _read()
        data["policy"] = {
            "requireConsent": policy.requireConsent,
            "updatedAt": int(time.time() * 1000),
        }
        _write(data)
    return get_policy()


def token_accepted(given: str | None) -> bool:
    """With no token configured, anyone who can reach the server may change policy.

    That is the right default for a laptop running its own server for a demo,
    and the wrong one for a bank: SHIELD_ADMIN_TOKEN closes it.
    """
    return not ADMIN_TOKEN or given == ADMIN_TOKEN


def summary(now_ms: int | None = None) -> dict[str, object]:
    """Everything the dashboard draws, computed from counts alone."""
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    with _lock:
        data = _read()

    raw_devices = data.get("devices")
    devices = raw_devices if isinstance(raw_devices, dict) else {}

    by_category: dict[str, int] = {}
    rows = []
    totals = {"hidden": 0, "tasks": 0, "scans": 0, "sent": 0}
    day_ms = 24 * 60 * 60 * 1000
    days = [0] * 7

    for device in devices.values():
        entries = device.get("entries", []) if isinstance(device, dict) else []
        hidden = sum(int(entry.get("total", 0)) for entry in entries)
        tasks = sum(1 for entry in entries if entry.get("kind") == "run")
        scans = sum(1 for entry in entries if entry.get("kind") == "scan")
        sent = sum(1 for entry in entries if entry.get("transmitted") is True)
        last = max((int(entry.get("at", 0)) for entry in entries), default=0)

        for entry in entries:
            for count in entry.get("counts", []):
                category = str(count.get("category"))
                by_category[category] = by_category.get(category, 0) + int(count.get("count", 0))
            age = (now_ms - int(entry.get("at", 0))) // day_ms
            if 0 <= age < 7:
                days[6 - age] += int(entry.get("total", 0))

        totals["hidden"] += hidden
        totals["tasks"] += tasks
        totals["scans"] += scans
        totals["sent"] += sent
        rows.append(
            {
                "name": device.get("name"),
                "team": device.get("team"),
                "seen": device.get("seen"),
                "lastActivity": last or None,
                "hidden": hidden,
                "tasks": tasks,
                "scans": scans,
                "sent": sent,
            }
        )

    rows.sort(key=lambda row: row["seen"] or 0, reverse=True)
    categories = sorted(by_category.items(), key=lambda item: item[1], reverse=True)

    return {
        "org": ORG_NAME,
        "generatedAt": now_ms,
        "devices": rows,
        "totals": {**totals, "devices": len(rows)},
        "categories": [{"category": name, "count": count} for name, count in categories],
        "lastSevenDays": days,
        "policy": get_policy(),
    }
