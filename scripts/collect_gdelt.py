#!/usr/bin/env python3
"""Small, citation-only GDELT Project Events 2.0 regional news-context mirror.

This does NOT identify verified conflicts, independently confirmed news, military
movements, or real-time incidents. It only summarizes automated news coding.
Uses standard-library zip and CSV readers. Public GDELT Project, not GDELT Cloud.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
SNAP = DATA / "gdelt-context.json"
STATUS = DATA / "gdelt-status.json"
BASE = "https://data.gdeltproject.org/gdeltv2/"
REGION = {"IS", "IR", "LE", "SY", "IZ"}  # GDELT's FIPS/legacy codes
EVENT_ROOTS = {"13", "15", "17", "18", "19", "20"}
MAX_BATCHES = 8  # 2 hours per hourly invocation, allowing modest scheduling drift
MAX_COMPRESSED = 6_000_000
MAX_EXPANDED = 40_000_000
MAX_SAMPLE = 32
UA = "RegionalWatch/1.0 (public noncommercial research; cite GDELT Project)"


def utcnow():
    return datetime.now(timezone.utc)


def iso(t):
    return t.isoformat(timespec="seconds").replace("+00:00", "Z")


def request(url: str, *, limit: int) -> bytes:
    u = urllib.parse.urlparse(url)
    if u.scheme != "https" or u.hostname != "data.gdeltproject.org" or not u.path.startswith("/gdeltv2/"):
        raise ValueError("GDELT download host/path not allowlisted")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/plain, application/zip"})
    with urllib.request.urlopen(req, timeout=22) as r:
        if r.status != 200:
            raise ValueError(f"HTTP {r.status}")
        declared = int(r.headers.get("Content-Length") or 0)
        if declared > limit:
            raise ValueError("GDELT response exceeds cap")
        body = r.read(limit + 1)
        if len(body) > limit:
            raise ValueError("GDELT response exceeds cap")
        return body


def parse_lastupdate(text: str) -> tuple[datetime, str, str, int]:
    for line in text.splitlines():
        m = re.fullmatch(r"(\d+)\s+([a-f0-9]{32})\s+https?://data\.gdeltproject\.org/gdeltv2/(\d{14})\.export\.CSV\.zip", line.strip(), re.I)
        if m:
            size, md5, stamp = int(m[1]), m[2].lower(), m[3]
            if not (0 < size <= MAX_COMPRESSED):
                raise ValueError("unexpected compressed event export size")
            return datetime.strptime(stamp, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc), stamp, md5, size
    raise ValueError("lastupdate.txt did not contain an Events 2.0 export")


def as_num(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_export(blob: bytes, stamp: str) -> tuple[int, list[dict]]:
    out = []
    total = 0
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        names = archive.namelist()
        if len(names) != 1 or not names[0].endswith(".export.CSV"):
            raise ValueError("unexpected GDELT archive structure")
        if archive.getinfo(names[0]).file_size > MAX_EXPANDED:
            raise ValueError("GDELT archive expands beyond cap")
        with archive.open(names[0]) as stream:
            reader = csv.reader(io.TextIOWrapper(stream, encoding="utf-8", errors="replace", newline=""), delimiter="\t")
            for row in reader:
                total += 1
                # Official GDELT Events 2.0 61-column schema.
                if len(row) < 61 or row[53] not in REGION or row[28] not in EVENT_ROOTS:
                    continue
                url = row[60].strip()
                try:
                    parsed = urllib.parse.urlparse(url)
                except ValueError:
                    continue
                if parsed.scheme not in ("https", "http") or not parsed.hostname or len(url) > 1400:
                    continue
                event_id = row[0]
                if not event_id.isdigit():
                    continue
                geo = row[52][:100]
                entry = {
                    "id": event_id,
                    "batch": stamp,
                    "url": url,
                    "domain": parsed.hostname.lower().removeprefix("www."),
                    "action_country": row[53],
                    "action_place": geo,
                    "root_code": row[28],
                    "event_code": row[26][:10],
                    "mentions": as_num(row[31]),
                    "reported_sources": as_num(row[32]),
                    "reported_articles": as_num(row[33]),
                }
                out.append(entry)
    return total, out


def load_previous():
    try:
        value = json.loads(SNAP.read_text(encoding="utf-8"))
        return value if value.get("source") == "gdelt_context" else {}
    except (OSError, ValueError, TypeError):
        return {}


def emit(checked_at: str, state: str, detail: str | None, batch_stamp: str | None, data: dict | None):
    DATA.mkdir(parents=True, exist_ok=True)
    status = {
        "source": "gdelt_context",
        "checked_at": checked_at,
        "state": state,
        "last_batch": batch_stamp,
        "detail": detail,
        "provider": "GDELT Project",
        "source_url": "https://www.gdeltproject.org/",
    }
    STATUS.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if data is not None:
        SNAP.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def collect() -> int:
    now = utcnow()
    checked = iso(now)
    previous = load_previous()
    try:
        latest_dt, latest_stamp, latest_md5, latest_size = parse_lastupdate(
            request(BASE + "lastupdate.txt", limit=4096).decode("utf-8", "replace")
        )
        if latest_dt > now + timedelta(minutes=30) or latest_dt < now - timedelta(hours=8):
            raise ValueError("GDELT latest batch timestamp implausible or stale")
        last_done = previous.get("latest_batch")
        cursor = latest_dt
        stamps = []
        while len(stamps) < MAX_BATCHES and (last_done is None or cursor.strftime("%Y%m%d%H%M%S") > last_done):
            stamps.append(cursor.strftime("%Y%m%d%H%M%S"))
            cursor -= timedelta(minutes=15)
        if not stamps:
            emit(checked, "ok", "No new 15-minute export since previous successful collection", latest_stamp, None)
            return 0
        all_events = []
        downloaded = []
        misses = []
        total = 0
        for stamp in reversed(stamps):
            path = BASE + stamp + ".export.CSV.zip"
            try:
                blob = request(path, limit=MAX_COMPRESSED)
                if stamp == latest_stamp and (len(blob) != latest_size or hashlib.md5(blob).hexdigest() != latest_md5):
                    raise ValueError("GDELT latest export checksum or length mismatch")
                n, events = parse_export(blob, stamp)
                total += n
                all_events.extend(events)
                downloaded.append(stamp)
            except (ValueError, OSError, urllib.error.URLError, zipfile.BadZipFile, TimeoutError) as e:
                misses.append(stamp + ": " + type(e).__name__)
        if not downloaded:
            raise ValueError("No valid GDELT export in sampled window")
        dedup = {}
        for event in all_events:
            # Stable event ID: one machine-coded row, not a verified occurrence.
            dedup[event["id"]] = event
        matched = list(dedup.values())
        countries = Counter(x["action_country"] for x in matched)
        roots = Counter(x["root_code"] for x in matched)
        domains = Counter(x["domain"] for x in matched)
        sample = sorted(matched, key=lambda x: (x["reported_sources"], x["reported_articles"]), reverse=True)[:MAX_SAMPLE]
        result = {
            "source": "gdelt_context",
            "created_at": checked,
            "latest_batch": downloaded[-1],
            "batches": downloaded,
            "batch_count": len(downloaded),
            "coded_rows_total": total,
            "coded_rows_matched": len(matched),
            "by_action_country": dict(sorted(countries.items())),
            "by_event_root": dict(sorted(roots.items())),
            "distinct_publisher_domains": len(domains),
            "sample": sample,
            "provider": "GDELT Project",
            "attribution_url": "https://www.gdeltproject.org/",
            "limitations": "Machine-coded article signals only. NOT verified incidents, air/sea movements or independent corroboration; multiple sources may quote the same origin. Sample capped at 32.",
        }
        complete = not misses and len(stamps) < MAX_BATCHES
        detail = None if complete else f"Partial export coverage: {len(misses)} unavailable batches; max {MAX_BATCHES} files per run"
        emit(checked, "ok" if complete else "partial", detail, latest_stamp, result)
        print(json.dumps({"state":"ok" if complete else "partial","batch_count":len(downloaded),"matched":len(matched),"domains":len(domains),"missing":len(misses),"latest":downloaded[-1]}))
        return 0
    except Exception as e:
        emit(checked, "error", type(e).__name__ + ": " + str(e)[:160], previous.get("latest_batch"), None)
        print("GDELT collection failed:", str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(collect())
