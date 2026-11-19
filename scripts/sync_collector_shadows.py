"""Scheduled eight-source Neon -> private Cloudflare D1 SHADOW synchronization.

The repository's existing versioned JSON is the active data feed until
separate reader and legacy-writeback gates pass. This job does not edit GitHub,
deploy Workers, disable a source, or expose credentials to the frontend.

Architecture: validate all eight snapshots BEFORE external writes; one atomic
Neon write transaction and readback; after COMMIT, mirror eight verified Neon
rows to D1 with per-row monotonic timestamps and independent digest readback.
An interrupted or failed D1 mirror may leave a subset newer, but subsequent
runs are idempotent and no old row can overwrite newer data.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

from scripts.neon_mirror import (
    GITHUB_JSON_SOURCES, load_snapshot, publish_snapshot,
    verify_snapshot, read_stored_snapshot,
)
from scripts.neon_to_d1 import D1Client, mirror_source
from scripts.publish_neon_mirror import _open_connection


def execute_shadow_sync(
    root: Path | str,
    neon_url: str,
    account_id: str,
    token: str,
    *,
    loader=load_snapshot,
    connector=_open_connection,
    publisher=publish_snapshot,
    verifier=verify_snapshot,
    stored_reader=read_stored_snapshot,
    mirror=mirror_source,
    client_factory=D1Client,
) -> dict:
    if not all((neon_url, account_id, token)):
        raise ValueError("required private Neon/D1 credentials missing")
    root = Path(root)
    # The all-or-nothing input gate comes before any network request:
    # invalid, oversized or future-dated JSON must not trigger a partial run.
    sources = list(GITHUB_JSON_SOURCES)
    snapshots = [loader(source, root) for source in sources]
    if [x.source_key for x in snapshots] != sources:
        raise RuntimeError("collector source/order mismatch")

    written = stale = 0
    # Psycopg context manager: commit all eight together, rollback on error.
    with connector(neon_url) as conn:
        for snap in snapshots:
            result = publisher(conn, snap)
            if result in ("written", "unchanged"):
                if result == "written":
                    written += 1
                if not verifier(conn, snap).get("match"):
                    raise RuntimeError("Neon shadow readback mismatch")
            elif result == "stale":
                stored = stored_reader(conn, snap.source_key)
                if stored is None or stored.checked_at <= snap.checked_at:
                    raise RuntimeError("Neon stale row not independently validated")
                stale += 1
            else:
                raise RuntimeError("Neon shadow timestamp conflict")

    # Only after Neon commits do D1 writes begin. One D1 database discovery,
    # one read-only Neon connection for all sources; no browser-facing access.
    client = client_factory(account_id, "discover", token)
    client.database_id = client.discover_database_id("regional-osint")
    verified = 0
    with connector(neon_url) as conn:
        for key in sources:
            result = mirror(conn, client, key)
            if result.get("source") != key or result.get("result") not in (
                "written", "unchanged", "stale"
            ):
                raise RuntimeError("D1 shadow readback invalid")
            verified += 1

    return {
        "sources": sources,
        "neon_written": written,
        "neon_stale": stale,
        "d1_verified": verified,
        "mode": "shadow_only",
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Read-only legacy feeds to verified Neon/D1 shadow")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parents[1]))
    args = parser.parse_args(argv)
    neon = os.getenv("NEON_DATABASE_URL", "").strip()
    account = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    token = os.getenv("CLOUDFLARE_D1_API_TOKEN", "").strip()
    if not all((neon, account, token)):
        print("shadow_sync unavailable: required secrets are missing", file=sys.stderr)
        return 2
    try:
        result = execute_shadow_sync(args.root, neon, account, token)
        print(
            "shadow_sync sources={} neon_written={} neon_stale={} d1_verified={}"
            .format(len(result["sources"]), result["neon_written"],
                    result["neon_stale"], result["d1_verified"])
        )
        return 0
    except Exception as exc:
        # Never include arbitrary database, HTTP or vendor exception content:
        # it may contain a secret, authorization URL, SQL or source payload.
        print("shadow_sync failed type=" + type(exc).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
