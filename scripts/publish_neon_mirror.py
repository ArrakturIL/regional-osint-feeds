#!/usr/bin/env python3
"""Optional secret-safe shadow publisher for Regional Watch collector snapshots.

To use on GitHub Actions, set encrypted Actions secret NEON_DATABASE_URL.
Exit status is deliberately nonfatal in --mode=shadow (old GitHub mirror is the
production reader until verified cutover). --mode=required fails closed.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import os
from pathlib import Path
import sys

from scripts.neon_mirror import load_snapshot, publish_snapshot, verify_snapshot, read_stored_snapshot


def _open_connection(url: str):
    # Lazy import: unit tests and workflows without credentials need no package.
    import psycopg
    return psycopg.connect(url, connect_timeout=10, autocommit=False)


# Monotonic cursors: a snapshot may be newer by checked_at yet carry older data
# (18.11: a fresh "no new export" status paired with the frozen repo copy of
# gdelt-context.json moved latest_batch from 18.11 back to 15.11).
CURSOR_FIELDS = {"gdelt": "latest_batch"}


def _cursor_regression(connection, snapshot) -> bool:
    field = CURSOR_FIELDS.get(snapshot.source_key)
    if not field:
        return False
    new = snapshot.data.get(field) if isinstance(snapshot.data, dict) else None
    if not isinstance(new, str):
        return False  # no cursor to compare (seed or legacy shape)
    stored = read_stored_snapshot(connection, snapshot.source_key)
    old = stored.data.get(field) if stored is not None and isinstance(stored.data, dict) else None
    # Fixed-width YYYYMMDDHHMMSS stamps compare correctly as strings.
    return isinstance(old, str) and new < old


def publish_one(
    source_key: str,
    root: Path | str,
    database_url: str,
    *,
    connector=None,
    now: datetime | None = None,
) -> dict:
    """Publish one validated source/status pair within one SQL transaction."""
    snapshot = load_snapshot(source_key, root, now=now)
    connector = connector or _open_connection
    with connector(database_url) as connection:
        if _cursor_regression(connection, snapshot):
            raise RuntimeError("cursor regression: snapshot is older than the stored mirror")
        result = publish_snapshot(connection, snapshot)
        if result in ("written", "unchanged"):
            parity = verify_snapshot(connection, snapshot)
            if not parity["match"]:
                raise RuntimeError("Neon mirror parity mismatch after write")
        elif result == "stale":
            # Ensure newer stored JSONB is authentic before preserving it.
            stored = read_stored_snapshot(connection, snapshot.source_key)
            if stored is None or stored.checked_at <= snapshot.checked_at:
                raise RuntimeError("stale mirror without verified newer snapshot")
        elif result == "conflict":
            # An equal timestamp with divergent data must never look healthy.
            raise RuntimeError("Neon mirror conflict at equal checked_at")
        else:
            raise RuntimeError("unexpected Neon mirror result")
    summary = {
        "source": snapshot.source_key,
        "result": result,
        "checked_at": snapshot.checked_at.isoformat(),
        "sha_prefix": snapshot.data_sha256[:12],
    }
    print(
        "neon_mirror source={source} result={result} checked_at={checked_at} sha={sha_prefix}".format(**summary)
    )
    return summary


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Shadow-write validated Regional Watch JSON to private Neon")
    parser.add_argument("--source", required=True)
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--mode", choices=("shadow", "required"), default="shadow")
    args = parser.parse_args(argv)
    url = os.environ.get("NEON_DATABASE_URL", "").strip()
    if not url:
        print(f"neon_mirror skipped: missing_secret mode={args.mode}")
        return 0 if args.mode == "shadow" else 2
    try:
        publish_one(args.source, Path(args.root), url)
    except Exception as exc:
        # Never print exception messages, raw SQL, URLs or database credentials:
        # common client errors may embed the user's full connection string.
        print(f"neon_mirror mirror_write_error={type(exc).__name__} source={args.source}", file=sys.stderr)
        return 0 if args.mode == "shadow" else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
