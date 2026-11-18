"""H-04: disable or re-enable one source without a release.

Writes one row of source_controls in the private D1 database that the
component reads every run (Monitor: regional-osint, Editor: regional-watch-news).
Only keys listed in config/source-controls.json are accepted.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from scripts.neon_to_d1 import D1Client

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/source-controls.json"
SCHEMA = (ROOT / "storage/cloudflare/004_source_controls.sql").read_text(encoding="utf8")
SCHEMA_SQL = "\n".join(l for l in SCHEMA.splitlines() if not l.lstrip().startswith("--")).strip().rstrip(";")
UPSERT_SQL = (
    "INSERT INTO source_controls(source,disabled,reason,until_ms,updated_ms) "
    "VALUES(?,1,?,CAST(NULLIF(?,'') AS INTEGER),CAST(? AS INTEGER)) "
    "ON CONFLICT(source) DO UPDATE SET disabled=1,reason=excluded.reason,"
    "until_ms=excluded.until_ms,updated_ms=excluded.updated_ms"
)
DELETE_SQL = "DELETE FROM source_controls WHERE source=?"
LIST_SQL = "SELECT source,disabled,reason,until_ms,updated_ms FROM source_controls ORDER BY source"
MAX_HOURS = 24 * 30


def load_config(path: Path = CONFIG) -> dict:
    obj = json.loads(Path(path).read_text(encoding="utf8"))
    if obj.get("schema_version") != 1 or not isinstance(obj.get("components"), dict):
        raise ValueError("invalid source-controls config")
    return obj["components"]


def plan(components: dict, component: str, action: str, source: str, reason: str,
         hours: str, now_ms: int) -> list[tuple[str, tuple]]:
    """Return the exact D1 statements; raises before any write on bad input."""
    if component not in components:
        raise ValueError("unknown component")
    if action == "list":
        return [(SCHEMA_SQL, ()), (LIST_SQL, ())]
    if source not in components[component]["sources"]:
        raise ValueError("unknown source for " + component)
    if action == "enable":
        return [(SCHEMA_SQL, ()), (DELETE_SQL, (source,)), (LIST_SQL, ())]
    if action != "disable":
        raise ValueError("unknown action")
    reason = " ".join(str(reason or "").split())[:300]
    if not reason:
        raise ValueError("reason is required to disable a source")
    until = ""
    if str(hours or "").strip():
        h = int(hours)
        if not 1 <= h <= MAX_HOURS:
            raise ValueError("hours must be 1..720")
        until = str(now_ms + h * 3600000)
    return [(SCHEMA_SQL, ()), (UPSERT_SQL, (source, reason, until, str(now_ms))), (LIST_SQL, ())]


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--component", required=True)
    p.add_argument("--action", required=True, choices=["disable", "enable", "list"])
    p.add_argument("--source", default="")
    p.add_argument("--reason", default="")
    p.add_argument("--hours", default="")
    a = p.parse_args(argv)
    components = load_config()
    statements = plan(components, a.component, a.action, a.source, a.reason, a.hours, int(time.time() * 1000))
    client = D1Client(os.environ.get("CLOUDFLARE_ACCOUNT_ID", ""), "pending",
                      os.environ.get("CLOUDFLARE_D1_API_TOKEN", ""))
    client.database_id = client.discover_database_id(components[a.component]["database"])
    rows = []
    for sql, params in statements:
        rows = client.query(sql, params)
    print(json.dumps({"component": a.component, "action": a.action, "source": a.source,
                      "controls": rows}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
