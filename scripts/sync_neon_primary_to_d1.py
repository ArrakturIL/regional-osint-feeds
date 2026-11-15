"""Reconcile eight verified Neon-primary collector snapshots to private D1.

After the commit-free source cutover, GitHub JSON snapshots are frozen fallback
artifacts, NOT authoritative inputs. Scheduled repair uses one Neon connection,
validates every stored JSONB/hash before touching Cloudflare, and verifies every
D1 upsert using the existing digest-checked adapter. Per-source collectors do
their own direct D1 publication; this job repairs gaps without Git commits.
"""
from __future__ import annotations

import os
import sys

from scripts.neon_mirror import SOURCE_FILES, read_stored_snapshot
from scripts.neon_to_d1 import D1Client, mirror_source
from scripts.publish_neon_mirror import _open_connection


def execute_replica_sync(
    neon_url: str,
    account_id: str,
    token: str,
    *,
    connector=_open_connection,
    stored_reader=read_stored_snapshot,
    mirror=mirror_source,
    client_factory=D1Client,
) -> dict:
    if not all((neon_url, account_id, token)):
        raise ValueError("required private Neon/D1 credentials missing")

    sources = list(SOURCE_FILES)
    with connector(neon_url) as db:
        # Full Neon payload/digest validation for ALL sources before the
        # first D1 request. No outdated GitHub JSON is read.
        for source in sources:
            stored = stored_reader(db, source)
            if stored is None or stored.source_key != source:
                raise RuntimeError("Neon-primary collector source missing or mismatched")

        client = client_factory(account_id, "discover", token)
        client.database_id = client.discover_database_id("regional-osint")
        verified = 0
        for source in sources:
            result = mirror(db, client, source)
            if result.get("source") != source or result.get("result") not in (
                "written", "unchanged", "stale"
            ):
                raise RuntimeError("D1 replica readback invalid")
            verified += 1

    return {"mode": "neon_primary", "sources": sources, "d1_verified": verified}


def main(argv=None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Neon-primary private D1 replica reconciliation")
    parser.parse_args(argv)
    neon = os.environ.get("NEON_DATABASE_URL", "").strip()
    account = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    token = os.environ.get("CLOUDFLARE_D1_API_TOKEN", "").strip()
    if not all((neon, account, token)):
        print("replica_sync unavailable: required secrets missing", file=sys.stderr)
        return 2
    try:
        out = execute_replica_sync(neon, account, token)
        print("replica_sync mode={} sources={} d1_verified={}".format(
            out["mode"], len(out["sources"]), out["d1_verified"]
        ))
        return 0
    except Exception as exc:
        # Upstream errors may embed credentials, DSNs, SQL or payloads.
        print("replica_sync failed type=" + type(exc).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
