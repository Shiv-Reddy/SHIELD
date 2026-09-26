"""Checks for the organisation view — fleet.py.

The claim this file protects is "counts only": a laptop's report is refused
whole if it carries anything but the fields the dashboard draws from.

Run: .venv/Scripts/python test_fleet.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

# Before fleet is imported, so no check touches the real store.
_store = Path(tempfile.mkdtemp()) / "fleet_data.json"
os.environ["SHIELD_FLEET_FILE"] = str(_store)
os.environ.pop("SHIELD_ADMIN_TOKEN", None)

from pydantic import ValidationError  # noqa: E402

import fleet  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    print(("ok   " if condition else "FAIL ") + name + (f" — {detail}" if detail and not condition else ""))
    if not condition:
        failures.append(name)


def _entry(**overrides):
    entry = {
        "at": 1_790_000_000_000,
        "kind": "run",
        "examined": "viewport",
        "transmitted": True,
        "counts": [{"category": "name", "count": 10}, {"category": "id_number", "count": 30}],
        "total": 40,
        "durationMs": 131.0,
    }
    entry.update(overrides)
    return entry


def _report(**overrides):
    report = {
        "device_id": "abcd1234-0000",
        "device_name": "KYC desk 1",
        "team": "KYC operations",
        "entries": [_entry(), _entry(kind="scan", transmitted=False, total=12, counts=[{"category": "phone", "count": 12}])],
    }
    report.update(overrides)
    return report


def _refused(report) -> bool:
    try:
        fleet.FleetReport.model_validate(report)
    except ValidationError:
        return True
    return False


check("a counts-only report is accepted", not _refused(_report()))
check(
    "a report carrying a web address is refused whole",
    _refused(_report(entries=[_entry(url="https://bank.example/kyc")])),
)
check(
    "the extension's rule names are not accepted either",
    _refused(_report(entries=[_entry(rules=["text in image — identity document"])])),
)
check(
    "a field outside the report shape is refused",
    _refused({**_report(), "page_text": "Rahul Sharma 2345 6789 0124"}),
)
check(
    "an unknown category is refused",
    _refused(_report(entries=[_entry(counts=[{"category": "salary", "count": 1}])])),
)
check(
    "a device id that is not a plain identifier is refused",
    _refused(_report(device_id="../../etc/passwd")),
)

fleet.record_report(fleet.FleetReport.model_validate(_report()))
summary = fleet.summary(now_ms=1_790_000_000_000)
totals = summary["totals"]
check(
    "totals add up across the laptop's history",
    totals == {"hidden": 52, "tasks": 1, "scans": 1, "sent": 1, "devices": 1},
    f"got {totals}",
)
check(
    "categories are summed and largest first",
    summary["categories"][0] == {"category": "id_number", "count": 30},
    f"got {summary['categories']}",
)

# The laptop sends its whole history each time; a repeat must not double it.
fleet.record_report(fleet.FleetReport.model_validate(_report()))
check(
    "a repeated report replaces rather than adds",
    fleet.summary(now_ms=1_790_000_000_000)["totals"]["hidden"] == 52,
)

check("the policy starts off", fleet.get_policy()["requireConsent"] is False)
fleet.set_policy(fleet.Policy(requireConsent=True))
check("an administrator can turn it on", fleet.get_policy()["requireConsent"] is True)
check("and the summary carries it", fleet.summary()["policy"]["requireConsent"] is True)

check("with no admin token set, a local demo can change policy", fleet.token_accepted(None))
fleet.ADMIN_TOKEN = "secret"
check("with one set, a request without it cannot", not fleet.token_accepted(None))
check("and one with it can", fleet.token_accepted("secret"))
fleet.ADMIN_TOKEN = ""

print()
print(f"{len(failures)} failing check(s)" if failures else "all checks pass")
sys.exit(1 if failures else 0)
