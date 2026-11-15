"""Read-only GitHub-vs-D1 collector cache drift audit.

Designed to run on demand with a least-privilege D1 token. It NEVER performs
INSERT/UPDATE/DELETE and never prints credentials or raw collected articles.
During shadow rollout 'cache_ahead' is a valid finding, not proof of parity.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys

from scripts.neon_mirror import SOURCE_FILES, VALID_STATES, canonical_hash, load_snapshot
from scripts.neon_to_d1 import D1Client, _validate_d1_row

READ_ONLY_SQL = (
    "SELECT source_key,checked_at_ms,data_json,status_json,data_sha256,status_sha256 "
    "FROM regional_collector_cache ORDER BY source_key"
)


def compare_source(source_key: str, root: Path | str | None, cache_row: dict | None, *,
                   now: datetime | None = None) -> dict:
    """Compare one validated GitHub pair to one integrity-checked private D1 pair."""
    if source_key not in SOURCE_FILES:
        raise ValueError("unknown collector source_key")
    git = load_snapshot(source_key, root, now=now)
    old_ms = int(git.checked_at.timestamp() * 1000)
    result = {
        "source": source_key,
        "github_checked_at": git.checked_at.isoformat(),
        "github_state": git.status["state"],
        "cache_checked_at": None,
        "cache_state": None,
        "lag_seconds": None,
        "comparison": "missing_cache",
    }
    if cache_row is None:
        return result
    try:
        checked = _validate_d1_row(cache_row, source_key)
        status = checked["status"]
        if status.get("state") not in VALID_STATES:
            raise RuntimeError("invalid cache state")
    except (RuntimeError, TypeError, ValueError, KeyError):
        result["comparison"] = "invalid_cache"
        return result
    cache_ms = checked["checked_at_ms"]
    result["cache_checked_at"] = datetime.fromtimestamp(
        cache_ms / 1000, tz=timezone.utc
    ).isoformat()
    result["cache_state"] = status["state"]
    result["lag_seconds"] = round((old_ms - cache_ms) / 1000, 3)
    if cache_ms < old_ms:
        result["comparison"] = "cache_behind"
    elif cache_ms > old_ms:
        result["comparison"] = "cache_ahead"
    elif canonical_hash(checked["data"]) == git.data_sha256 and \
         canonical_hash(status) == git.status_sha256:
        result["comparison"] = "matched"
    else:
        result["comparison"] = "equal_time_conflict"
    return result


def audit_rows(rows: list[dict], root: Path | str | None, *,
               now: datetime | None = None) -> dict:
    """Produce metadata only; flag duplicate/unknown D1 rows rather than trusting them."""
    if not isinstance(rows, list) or len(rows) > len(SOURCE_FILES):
        raise RuntimeError("unexpected D1 cache row count")
    by_source = {}
    for row in rows:
        if not isinstance(row, dict):
            raise RuntimeError("invalid D1 cache row")
        key = row.get("source_key")
        if key not in SOURCE_FILES or key in by_source:
            raise RuntimeError("invalid or duplicate D1 cache source")
        by_source[key] = row
    checks = [compare_source(source, root, by_source.get(source), now=now)
              for source in sorted(SOURCE_FILES)]
    return {
        "result": "parity" if all(c["comparison"] == "matched" for c in checks)
                  else "drift",
        "source_count": len(checks),
        "comparisons": checks,
        "read_only": True,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Read-only GitHub/D1 parity diagnostic")
    parser.add_argument("--root", default=None, help="Checkout root with data/ JSON")
    parser.add_argument("--database-name", default="regional-osint")
    args = parser.parse_args(argv)
    token = os.environ.get("CLOUDFLARE_D1_API_TOKEN", "").strip()
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if not token or not account_id:
        print("D1 audit skipped: scoped read-only credentials unavailable", file=sys.stderr)
        return 2
    try:
        client = D1Client(account_id, "discover", token)
        client.database_id = client.discover_database_id(args.database_name)
        report = audit_rows(client.query(READ_ONLY_SQL), args.root)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["result"] == "parity" else 1
    except Exception as exc:
        # Exception strings from HTTP clients may include token-bearing URLs.
        print("D1 read-only audit unavailable: " + type(exc).__name__, file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
