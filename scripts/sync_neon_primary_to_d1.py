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
from datetime import datetime, timezone, timedelta
from pathlib import Path

from scripts.neon_mirror import SOURCE_FILES, read_stored_snapshot
from scripts.neon_to_d1 import D1Client, mirror_source, READ_D1_SQL, _validate_d1_row
from scripts.publish_neon_mirror import _open_connection


# Conservative lateness thresholds derived from the already scheduled collectors:
# analysts 15min, centcom 15min, copernicus 6h, GDELT 1h, MARAD 6h,
# satellite daily, UNOSAT 12h, news translation 2h. GitHub may delay runs.
SOURCE_MAX_AGE_HOURS = {
    "analysts": 2, "centcom": 2, "copernicus": 16, "gdelt": 4,
    "marad": 13, "satellite": 36, "unosat": 28, "news_translation": 6,
}
MAX_FUTURE = timedelta(minutes=20)


class ReplicaSourceFailure(RuntimeError):
    """Only public source name and a fixed failure stage; no credentials or URLs."""

    def __init__(self, source_key: str, stage: str):
        super().__init__("replica source failure")
        self.source_key = source_key
        self.stage = stage


def assess_snapshot_health(snapshot, replica_result: dict, *, now=None) -> dict:
    """Metadata-only health; a successful write/readback is NOT source freshness."""
    key = snapshot.source_key
    if key not in SOURCE_FILES:
        raise ValueError("unknown collector source")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("health comparison needs timezone")
    checked = snapshot.checked_at
    if not isinstance(checked, datetime) or checked.tzinfo is None:
        raise ValueError("health snapshot timestamp missing timezone")
    raw_state = snapshot.status.get("state") if isinstance(snapshot.status, dict) else None
    if raw_state not in ("ok", "partial", "error", "stale"):
        raise ValueError("health snapshot status invalid")
    replica = replica_result.get("result")
    if replica not in ("written", "unchanged", "stale", "held_last_valid"):
        raise ValueError("health replica state invalid")
    if replica_result.get("source") != key:
        raise ValueError("health replica source mismatch")
    age = (now.astimezone(timezone.utc) - checked.astimezone(timezone.utc)).total_seconds() / 60
    if age < -MAX_FUTURE.total_seconds() / 60 or raw_state == "error":
        health = "source_unavailable"
    elif raw_state == "stale" or age > SOURCE_MAX_AGE_HOURS[key] * 60:
        health = "data_stale"
    elif replica == "stale":
        health = "replica_ahead"
    elif raw_state == "partial":
        health = "collector_partial"
    else:
        health = "data_fresh"
    report = {
        "source": key, "health": health, "collector_state": raw_state,
        "replica_state": replica, "age_minutes": round(age, 1),
        "max_age_minutes": SOURCE_MAX_AGE_HOURS[key] * 60,
    }
    retained_ms = replica_result.get("retained_checked_at_ms")
    if replica == "held_last_valid" and isinstance(retained_ms, (int, float)):
        report["retained_age_minutes"] = round((now.timestamp() * 1000 - retained_ms) / 60_000, 1)
    return report


def summarize_health(rows: list[dict]) -> dict:
    if not isinstance(rows, list):
        raise ValueError("invalid health rows")
    counts = {}
    for row in rows:
        health = row["health"]
        counts[health] = counts.get(health, 0) + 1
    return {
        "overall": "healthy" if rows and len(counts) == 1 and "data_fresh" in counts else "degraded",
        "source_count": len(rows), "counts": counts,
    }


def emit_health_report(rows: list[dict], summary: dict, *, summary_path: str | None = None) -> None:
    """Write bounded, metadata-only Actions diagnostics. Never serialize payloads or DSNs."""
    print("replica_health overall={} ".format(summary["overall"]) +
          " ".join("{}={}".format(k, v) for k, v in sorted(summary["counts"].items())))
    for row in rows:
        code = row["health"]
        print("replica_source source={} health={} collector={} replica={} age_minutes={} retained_age_minutes={}".format(
            row["source"], code, row["collector_state"], row["replica_state"], row["age_minutes"], row.get("retained_age_minutes", "n/a")))
        if code != "data_fresh":
            print("::warning title=Collector health::source={} state={} (source_state={})".format(
                row["source"], code, row["collector_state"]))
    if summary_path:
        table = ["### Regional Watch storage/source health",
                 "Overall: **{}**; {} sources. Verified sync does not imply a healthy collector.".format(
                     summary["overall"], summary["source_count"]),
                 "| Source | Health | Source state | Replica | Age (min) | Retained age (min) |",
                 "| --- | --- | --- | --- | ---: | ---: |"]
        for row in rows:
            table.append("| {} | {} | {} | {} | {} | {} |".format(
                row["source"], row["health"], row["collector_state"],
                row["replica_state"], row["age_minutes"], row.get("retained_age_minutes", "—")))
        with Path(summary_path).open("a", encoding="utf8") as stream:
            stream.write("\n".join(table) + "\n")


def verify_d1_last_good(client, source_key: str) -> bool:
    """Read-only checksum/status verification; never call a retained row 'good' blindly."""
    if source_key not in SOURCE_FILES:
        raise ValueError("unknown collector source")
    rows = client.query(READ_D1_SQL, (source_key,))
    if len(rows) != 1:
        return False
    try:
        retained = _validate_d1_row(rows[0], source_key)
        if retained["status"].get("state") not in ("ok", "partial"):
            return False
        return {"checked_at_ms": retained["checked_at_ms"], "state": retained["status"]["state"]}
    except (RuntimeError, ValueError, KeyError, TypeError):
        return False


def execute_replica_sync(
    neon_url: str,
    account_id: str,
    token: str,
    *,
    connector=_open_connection,
    stored_reader=read_stored_snapshot,
    mirror=mirror_source,
    client_factory=D1Client,
    last_good_checker=verify_d1_last_good,
) -> dict:
    if not all((neon_url, account_id, token)):
        raise ValueError("required private Neon/D1 credentials missing")

    sources = list(SOURCE_FILES)
    checked = {}
    observations = []
    with connector(neon_url) as db:
        # Validate ALL Neon JSONB payload/hash pairs BEFORE any D1 write.
        for source in sources:
            try:
                stored = stored_reader(db, source)
            except Exception:
                raise ReplicaSourceFailure(source, "neon_read") from None
            if stored is None or stored.source_key != source:
                raise ReplicaSourceFailure(source, "neon_missing")
            checked[source] = stored

        client = client_factory(account_id, "discover", token)
        client.database_id = client.discover_database_id("regional-osint")
        verified = 0
        now = datetime.now(timezone.utc)
        for source in sources:
            stored = checked[source]
            # A newly failed/stale collector must not replace a last valid
            # snapshot in D1. An older D1 row is retained for explicit fallback;
            # the source remains unhealthy in the report.
            if stored.status.get("state") in ("error", "stale"):
                try:
                    last_good_exists = last_good_checker(client, source)
                except Exception:
                    raise ReplicaSourceFailure(source, "last_good_read") from None
                if not last_good_exists:
                    raise ReplicaSourceFailure(source, "last_good_missing")
                result = {"source": source, "result": "held_last_valid"}
                if isinstance(last_good_exists, dict):
                    result["retained_checked_at_ms"] = last_good_exists["checked_at_ms"]
            else:
                try:
                    result = mirror(db, client, source)
                except Exception:
                    raise ReplicaSourceFailure(source, "d1_sync") from None
                if result.get("source") != source or result.get("result") not in (
                    "written", "unchanged", "stale"
                ):
                    raise ReplicaSourceFailure(source, "d1_readback")
                verified += 1
            observations.append(assess_snapshot_health(stored, result, now=now))

    return {
        "mode": "neon_primary", "sources": sources, "d1_verified": verified,
        "health": observations, "health_summary": summarize_health(observations),
    }


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
        emit_health_report(out["health"], out["health_summary"],
                           summary_path=os.environ.get("GITHUB_STEP_SUMMARY"))
        return 0
    except ReplicaSourceFailure as exc:
        # Only fixed whitelist source/stage: never output vendor error or DSN.
        print("replica_sync_failed source={} stage={}".format(
            exc.source_key, exc.stage), file=sys.stderr)
        return 1
    except Exception as exc:
        # Upstream errors may embed credentials, DSNs, SQL or payloads.
        print("replica_sync failed type=" + type(exc).__name__, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
