"""H-04: skip a GitHub collector run when its Monitor source is rolled back.

Prints enabled=true|false to $GITHUB_OUTPUT. Only scheduled and dispatched runs
on main consult D1; push/PR runs keep testing the collector. Fails open: any
lookup problem means enabled=true, so a D1 hiccup never stops collection.
"""
from __future__ import annotations

import argparse
import os
import time

from scripts.neon_to_d1 import D1Client
from scripts.source_control import load_config

GATED_EVENTS = {"schedule", "workflow_dispatch"}
SQL = ("SELECT reason FROM source_controls WHERE source=? AND disabled=1 "
       "AND (until_ms IS NULL OR until_ms>CAST(? AS INTEGER))")


def source_for(workflow: str, components: dict) -> str:
    mapping = components["monitor"].get("workflows", {})
    if workflow not in mapping:
        raise ValueError("workflow is not a gated collector: " + workflow)
    return mapping[workflow]


def decide(event: str, ref: str, lookup) -> tuple[bool, str]:
    """lookup() -> reason or None; may raise. Returns (enabled, message)."""
    if event not in GATED_EVENTS or ref != "refs/heads/main":
        return True, "not a scheduled/dispatched main run; gate not consulted"
    try:
        reason = lookup()
    except Exception as exc:  # fail open, but say so
        return True, "source control lookup failed (" + type(exc).__name__ + "); collecting"
    if reason is None:
        return True, "source enabled"
    return False, "source disabled by operator: " + str(reason)[:300]


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--workflow", required=True)
    a = p.parse_args(argv)
    source = source_for(a.workflow, load_config())

    def lookup():
        client = D1Client(os.environ["CLOUDFLARE_ACCOUNT_ID"], "pending", os.environ["CLOUDFLARE_D1_API_TOKEN"])
        client.database_id = client.discover_database_id("regional-osint")
        rows = client.query(SQL, (source, str(int(time.time() * 1000))))
        return rows[0].get("reason") or "disabled" if rows else None

    enabled, message = decide(os.environ.get("GITHUB_EVENT_NAME", ""), os.environ.get("GITHUB_REF", ""), lookup)
    print(f"{source}: {message}")
    if not enabled:
        print(f"::notice::{a.workflow} skipped: {message}")
    out = os.environ.get("GITHUB_OUTPUT")
    if out:
        with open(out, "a", encoding="utf8") as f:
            f.write(f"enabled={'true' if enabled else 'false'}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
