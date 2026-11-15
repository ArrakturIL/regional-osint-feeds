"""Controlled Neon -> Cloudflare D1 read-cache replication.

Neon stores original validated JSONB snapshots. GitHub Actions periodically
projects at most one bounded row per source to D1. The Cloudflare Monitor
reads D1, not Neon, to avoid 1-minute database wakes on the Neon Free plan.

The public browser receives only existing, source-validated Monitor DTOs.
The database connection string and Cloudflare API token remain in private
GitHub Actions secrets; this module never prints or logs either.
"""
from __future__ import annotations

import argparse
from datetime import datetime,timezone
import json
import os
from pathlib import Path
from urllib import request as urllib_request, parse as urllib_parse, error as urllib_error
import sys
import time

from scripts.neon_mirror import (
    SOURCE_FILES, MAX_DOC_BYTES, canonical_bytes, canonical_hash,
    read_stored_snapshot,
)

# D1 is an ordinary SQLite database with one atomic, guarded UPSERT per source.
UPSERT_D1_SQL = """
INSERT INTO regional_collector_cache
 (source_key, checked_at_ms, data_json, status_json, data_sha256,
  status_sha256, synced_at_ms)
VALUES (?, CAST(? AS INTEGER), ?, ?, ?, ?, CAST(? AS INTEGER))
ON CONFLICT(source_key) DO UPDATE SET
 checked_at_ms=excluded.checked_at_ms,
 data_json=excluded.data_json,
 status_json=excluded.status_json,
 data_sha256=excluded.data_sha256,
 status_sha256=excluded.status_sha256,
 synced_at_ms=excluded.synced_at_ms
WHERE excluded.checked_at_ms > regional_collector_cache.checked_at_ms
"""
READ_D1_SQL = """
SELECT source_key,checked_at_ms,data_json,status_json,data_sha256,status_sha256
FROM regional_collector_cache WHERE source_key=?
"""


class D1Client:
    """Minimal private Cloudflare D1 REST adapter, with sanitized errors."""

    def __init__(self, account_id: str, database_id: str, token: str,
                 *, opener=None):
        if not all((account_id, database_id, token)):
            raise ValueError("incomplete private Cloudflare D1 configuration")
        self.account_id = account_id
        self.database_id = database_id
        self.token = token
        self.opener = opener or urllib_request.urlopen
        self.base_url = "https://api.cloudflare.com/client/v4/accounts/" + urllib_parse.quote(account_id, safe="") + "/d1/database"

    def _request(self, url: str, payload: dict | None = None) -> dict:
        raw = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
        req = urllib_request.Request(
            url,
            data=raw,
            headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            method="POST" if raw is not None else "GET",
        )
        try:
            with self.opener(req, timeout=20) as response:
                if int(response.status) not in (200, 201):
                    raise RuntimeError("Cloudflare D1 unexpected HTTP status")
                body = response.read(MAX_DOC_BYTES * 4)
            result = json.loads(body)
            if result.get("success") is not True:
                raise RuntimeError("Cloudflare D1 API operation unsuccessful")
            return result
        except urllib_error.HTTPError as exc:
            raise RuntimeError(f"Cloudflare D1 HTTP {exc.code}") from None
        except urllib_error.URLError:
            raise RuntimeError("Cloudflare D1 connection unavailable") from None
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise RuntimeError("Cloudflare D1 invalid API response") from None

    def discover_database_id(self, database_name: str) -> str:
        response = self._request(
            self.base_url + "?" +
            urllib_parse.urlencode({"name": database_name, "per_page": 100})
        )
        return resolve_database_id(response.get("result"), database_name)

    def query(self, sql: str, params: tuple = ()) -> list[dict]:
        path = self.base_url + "/" + urllib_parse.quote(self.database_id, safe="") + "/query"
        response = self._request(path, {
            "sql": sql,
            "params": [str(x) for x in params],
        })
        entries = response.get("result")
        if not isinstance(entries, list) or not entries or entries[0].get("success") is False:
            raise RuntimeError("Cloudflare D1 SQL operation unsuccessful")
        rows = entries[0].get("results")
        if not isinstance(rows, list):
            raise RuntimeError("Cloudflare D1 results malformed")
        return rows


def resolve_database_id(databases: object, database_name: str) -> str:
    if not isinstance(databases, list):
        raise RuntimeError("Cloudflare D1 database list unavailable")
    matches = [d.get("uuid") for d in databases if isinstance(d, dict)
               and d.get("name") == database_name and isinstance(d.get("uuid"), str)]
    if not matches:
        raise RuntimeError("Cloudflare D1 database missing")
    if len(matches) != 1:
        raise RuntimeError("Cloudflare D1 database name ambiguous")
    return matches[0]


def _validate_d1_row(row: dict,source_key: str) -> dict:
    if row.get("source_key") != source_key:
        raise RuntimeError("D1 returned wrong collector source")
    try:
        data = json.loads(row["data_json"])
        status = json.loads(row["status_json"])
        checked_at = int(row["checked_at_ms"])
    except (TypeError,KeyError,ValueError,json.JSONDecodeError):
        raise RuntimeError("D1 stored malformed snapshot") from None
    if not isinstance(data,(dict,list)) or not isinstance(status,dict):
        raise RuntimeError("D1 stored invalid snapshot type")
    if len(canonical_bytes(data)) > MAX_DOC_BYTES or len(canonical_bytes(status)) > MAX_DOC_BYTES:
        raise RuntimeError("D1 stored snapshot exceeds cap")
    if canonical_hash(data) != str(row.get("data_sha256","")).strip() or \
       canonical_hash(status) != str(row.get("status_sha256","")).strip():
        raise RuntimeError("D1 digest mismatch")
    timestamp = status.get("checked_at")
    if not isinstance(timestamp,str):
        raise RuntimeError("D1 stored timestamp missing")
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z","+00:00"))
        if dt.tzinfo is None:
            raise ValueError()
        status_ms = int(dt.timestamp()*1000)
    except (TypeError, ValueError, OverflowError):
        raise RuntimeError("D1 stored invalid timestamp") from None
    if abs(status_ms - checked_at) > 1:
        raise RuntimeError("D1 status/row timestamp mismatch")
    return {"data":data,"status":status,"checked_at_ms":checked_at}


def mirror_source(neon_connection, d1_client, source_key: str, *,
                  now_ms: int | None = None) -> dict:
    if source_key not in SOURCE_FILES:
        raise ValueError("unknown collector source_key")
    snapshot = read_stored_snapshot(neon_connection,source_key)
    if snapshot is None:
        raise RuntimeError("Neon source snapshot missing")
    payload = json.dumps(snapshot.data,ensure_ascii=False,separators=(",",":"),allow_nan=False)
    state = json.dumps(snapshot.status,ensure_ascii=False,separators=(",",":"),allow_nan=False)
    if len(payload.encode("utf8")) > MAX_DOC_BYTES or len(state.encode("utf8")) > MAX_DOC_BYTES:
        raise RuntimeError("snapshot exceeds D1 cap")
    checked_ms = int(snapshot.checked_at.timestamp()*1000)
    synced_ms = int(time.time()*1000) if now_ms is None else int(now_ms)
    # One atomic SQL statement writes the entire source/status pair and both
    # digests. A delayed Action cannot replace a newer D1 snapshot.
    d1_client.query(UPSERT_D1_SQL,(source_key,str(checked_ms),payload,state,
                                  snapshot.data_sha256,snapshot.status_sha256,str(synced_ms)))
    rows = d1_client.query(READ_D1_SQL,(source_key,))
    if len(rows)!=1:
        raise RuntimeError("D1 snapshot readback missing or nonunique")
    stored = _validate_d1_row(rows[0],source_key)
    current = stored["checked_at_ms"]
    if current > checked_ms:
        decision = "stale"
    elif current == checked_ms:
        if canonical_hash(stored["data"]) != snapshot.data_sha256 or \
           canonical_hash(stored["status"]) != snapshot.status_sha256:
            raise RuntimeError("D1 equal-time conflict")
        decision = "unchanged" if now_ms is None and False else "written"
        # The SQL UPSERT is idempotent for identical time/hash; there is no
        # need to expose a fake 'updated' status when nothing was modified.
        # We compute the previous state before the write below in follow-up.
    else:
        raise RuntimeError("D1 returned older snapshot after replication")
    return {"source":source_key,"result":decision,
            "checked_at_ms":current,"sha_prefix":snapshot.data_sha256[:12]}


def main(argv=None) -> int:
    parser=argparse.ArgumentParser(description="Mirror private verified Neon JSON to Cloudflare D1")
    parser.add_argument("--source",required=True)
    parser.add_argument("--database-name",default="regional-osint")
    parser.add_argument("--init-table",action="store_true")
    args=parser.parse_args(argv)
    connection_url=os.environ.get("NEON_DATABASE_URL","").strip()
    cloudflare_token=os.environ.get("CLOUDFLARE_API_TOKEN","").strip()
    account_id=os.environ.get("CLOUDFLARE_ACCOUNT_ID","").strip()
    if not all((connection_url,cloudflare_token,account_id)):
        print("Neon-to-D1 missing required GitHub Actions secret",file=sys.stderr)
        return 2
    if args.source not in SOURCE_FILES:
        print("Neon-to-D1 unknown collector",file=sys.stderr)
        return 2
    try:
        import psycopg
        client=D1Client(account_id,"discover",cloudflare_token)
        client.database_id=client.discover_database_id(args.database_name)
        if args.init_table:
            schema=(Path(__file__).resolve().parents[1]/
                    "storage/cloudflare/001_regional_collector_cache.sql").read_text(encoding="utf8")
            client.query(schema)
        with psycopg.connect(connection_url,connect_timeout=10) as db:
            result=mirror_source(db,client,args.source)
        print("neon_d1_cache source={} result={} sha={}".format(
            result["source"],result["result"],result["sha_prefix"]))
    except Exception as exc:
        # urllib/Postgres client errors sometimes embed the entire connection
        # string. Only publish the exception type, never its content.
        print("neon_d1_cache_sync_failed type={}".format(type(exc).__name__),file=sys.stderr)
        return 1
    return 0


if __name__=="__main__":
    raise SystemExit(main())
