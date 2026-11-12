#!/usr/bin/env python3
"""Validate public analyst mirrors as a coherent, recent, partial-safe pair.

A green collector job does NOT certify a fresh publication to GitHub or D1.
This validator checks the files before Git commit; the Workflow additionally
checks the remote branch after push. No private Telegram/YouTube APIs are used.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
ITEMS = ROOT / "data" / "analyst-source-items.json"
STATUS = ROOT / "data" / "analyst-source-status.json"


def parsed_time(value):
    if not isinstance(value, str):
        raise ValueError("missing timestamp")
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError("timestamp must include timezone")
    return dt.astimezone(timezone.utc)


def validate(items, status, now=None, max_age_minutes=15):
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    if not isinstance(items, dict) or items.get("schema_version") != 1 or not isinstance(items.get("items"), list):
        raise ValueError("invalid or missing analyst items mirror")
    if not isinstance(status, dict) or not isinstance(status.get("sources"), list):
        raise ValueError("invalid or missing analyst status mirror")
    checked = parsed_time(status.get("checked_at"))
    mirror_checked = parsed_time(items.get("checked_at"))
    if abs((checked - mirror_checked).total_seconds()) > 120:
        raise ValueError("items/status mirror timestamps diverge")
    age_minutes = (now - checked).total_seconds() / 60
    if not (-5 <= age_minutes <= max_age_minutes):
        raise ValueError(f"analyst mirror stale/future: {age_minutes:.1f} minutes")
    if status.get("state") not in ("ok", "partial"):
        raise ValueError("mirror source health not usable")
    sources = status["sources"]
    if not sources or not any(s.get("state") == "ok" for s in sources):
        raise ValueError("no healthy source to provide valid observations")
    if len(items["items"]) > 40:
        raise ValueError("mirror exceeds Worker ingestion cap")
    valid_sources = {s.get("source_id") for s in sources if s.get("state") == "ok"}
    seen = set()
    for item in items["items"]:
        if not isinstance(item, dict):
            raise ValueError("malformed source item")
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id or item_id in seen:
            raise ValueError("duplicate or invalid source item ID")
        seen.add(item_id)
        if item.get("source_id") not in valid_sources:
            raise ValueError("item from errored/unknown source included")
        if not isinstance(item.get("canonical_url"), str) or not item["canonical_url"].startswith("https://"):
            raise ValueError("item source URL malformed")
    return {
        "checked_at": checked.isoformat(),
        "age_minutes": round(age_minutes, 2),
        "source_count": len(sources),
        "healthy_sources": len(valid_sources),
        "source_errors": [s.get("source_id") for s in sources if s.get("state") != "ok"],
        "items": len(seen),
        "mirror_state": status["state"],
    }


def main():
    parser = argparse.ArgumentParser(description="Validate the bounded analyst GitHub mirror")
    parser.add_argument("--max-age-minutes", type=int, default=15)
    parser.add_argument("--items", type=Path, default=ITEMS)
    parser.add_argument("--status", type=Path, default=STATUS)
    args = parser.parse_args()
    try:
        result = validate(json.loads(args.items.read_text(encoding="utf-8")),
                          json.loads(args.status.read_text(encoding="utf-8")),
                          max_age_minutes=args.max_age_minutes)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(f"analyst mirror invalid: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
