#!/usr/bin/env python3
"""UCDP GED Candidate events for the Regional Watch regions (monthly background).

UCDP (Uppsala Conflict Data Program) codes organised violence from news with a
lag of weeks: this is historical background for the Data page, NOT a real-time
signal and NOT an input of the hourly tension index.

API: https://ucdp.uu.se/apidocs/ - token in the x-ucdp-access-token header,
5 000 requests per day counted per page INCLUDING errors, reset at 00:00 UTC.
So the collector keeps a hard per-run request budget, retries a failed page at
most once and stops on the first auth or rate-limit answer.
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
SNAP = DATA / "ucdp-context.json"
STATUS = DATA / "ucdp-status.json"
HOST = "ucdpapi.pcr.uu.se"
BASE = f"https://{HOST}/api/gedevents/"
DEFAULT_VERSION = "26.0.10"  # GED Candidate monthly release named on apidocs, 23.11.2026
MAX_REQUESTS = 40
PAGE_SIZE = 1000
MONTHS_BACK = 3  # current month plus the three before it
MAX_PAGES = 30
SAMPLE = 12
UA = "RegionalWatch/1.0 (public noncommercial research; cite UCDP, Uppsala University)"

# Gleditsch-Ward codes -> Regional Watch region (same six keys as the tension index).
# UCDP codes Gaza and the West Bank under Israel (666).
REGION_BY_GW = {
    666: "israel",
    660: "lebanon_syria",
    652: "lebanon_syria",
    630: "iran",
    645: "iraq",
    670: "gulf",
    690: "gulf",
    692: "gulf",
    694: "gulf",
    696: "gulf",
    698: "gulf",
    678: "red_sea",
}
REGIONS = ["israel", "lebanon_syria", "iran", "gulf", "red_sea", "iraq"]
VIOLENCE = {1: "state", 2: "nonstate", 3: "onesided"}
VERSION_RE = re.compile(r"^(\d{2})\.0\.(\d{1,2})$")


class StopRun(Exception):
    """Auth, rate limit or budget: stop without spending more requests."""


def utcnow():
    return datetime.now(timezone.utc)


def iso(t):
    return t.isoformat(timespec="seconds").replace("+00:00", "Z")


def next_versions(version: str) -> list[str]:
    """Candidate monthly releases that may follow `version`: next month, next year."""
    m = VERSION_RE.match(version)
    if not m:
        return []
    yy, n = int(m[1]), int(m[2])
    out = [f"{yy}.0.{n + 1}"] if n < 12 else []
    out.append(f"{yy + 1}.0.1")
    return out


def window_start(today: date) -> date:
    y, m = today.year, today.month - MONTHS_BACK
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


class Client:
    def __init__(self, token: str, opener=None, budget: int = MAX_REQUESTS):
        self.token = token
        self.opener = opener or urllib.request.urlopen
        self.budget = budget
        self.used = 0

    def get(self, url: str) -> dict:
        u = urllib.parse.urlparse(url)
        if u.scheme != "https" or u.hostname != HOST or not u.path.startswith("/api/gedevents/"):
            raise ValueError("UCDP URL not allowlisted")
        last = None
        for attempt in range(2):
            if self.used >= self.budget:
                raise StopRun("request budget exhausted")
            self.used += 1
            req = urllib.request.Request(
                url,
                headers={"x-ucdp-access-token": self.token, "User-Agent": UA, "Accept": "application/json"},
            )
            try:
                with self.opener(req, timeout=40) as r:
                    return json.loads(r.read(20_000_000).decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code in (401, 403):
                    raise StopRun(f"auth refused (HTTP {e.code})")
                if e.code == 429:
                    raise StopRun("daily limit reached (HTTP 429)")
                if e.code == 404:
                    raise LookupError("not found")
                last = f"HTTP {e.code}"
            except (urllib.error.URLError, TimeoutError, ValueError) as e:
                last = type(e).__name__
        raise RuntimeError(f"UCDP request failed twice: {last}")


def query_url(version: str, start: date, end: date, page_size: int = PAGE_SIZE) -> str:
    countries = ",".join(str(c) for c in sorted(REGION_BY_GW))
    q = urllib.parse.urlencode(
        {"pagesize": page_size, "page": 0, "Country": countries, "StartDate": start.isoformat(), "EndDate": end.isoformat()},
        safe=",",
    )
    return f"{BASE}{version}?{q}"


def discover_version(client: Client, known: str, today: date) -> str:
    """Probe newer Candidate releases with one-row requests; keep `known` if none."""
    version = known
    for _ in range(3):  # at most a few months of catch-up per run
        found = None
        for cand in next_versions(version):
            try:
                body = client.get(query_url(cand, window_start(today), today, page_size=1))
            except LookupError:
                continue
            if isinstance(body, dict) and int(body.get("TotalCount") or 0) > 0:
                found = cand
                break
        if not found:
            break
        version = found
    return version


def fetch_events(client: Client, version: str, start: date, end: date) -> list[dict]:
    url = query_url(version, start, end)
    events: list[dict] = []
    for _ in range(MAX_PAGES):
        body = client.get(url)
        if not isinstance(body, dict) or not isinstance(body.get("Result"), list):
            raise ValueError("unexpected UCDP response shape")
        events.extend(body["Result"])
        nxt = body.get("NextPageUrl") or ""
        if not nxt:
            return events
        url = nxt
    raise StopRun("page cap reached")


def _int(v) -> int:
    try:
        return max(0, int(v))
    except (TypeError, ValueError):
        return 0


def _text(v, n: int = 120) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def summarize(events: list[dict]) -> tuple[dict, list[dict]]:
    """Per region and month: events, best/civilian deaths, events by violence type."""
    regions = {r: {} for r in REGIONS}
    seen = set()
    sample = []
    for e in events:
        if not isinstance(e, dict):
            continue
        eid = e.get("id")
        if eid in seen:
            continue
        seen.add(eid)
        region = REGION_BY_GW.get(_int(e.get("country_id")))
        day = str(e.get("date_end") or "")[:10]
        if not region or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            continue
        month = regions[region].setdefault(
            day[:7], {"events": 0, "deaths_best": 0, "deaths_civilians": 0, "state": 0, "nonstate": 0, "onesided": 0}
        )
        month["events"] += 1
        month["deaths_best"] += _int(e.get("best"))
        month["deaths_civilians"] += _int(e.get("deaths_civilians"))
        kind = VIOLENCE.get(_int(e.get("type_of_violence")))
        if kind:
            month[kind] += 1
        sample.append(
            {
                "id": _int(eid),
                "date": day,
                "region": region,
                "country": _text(e.get("country"), 40),
                "where": _text(e.get("where_description")),
                "side_a": _text(e.get("side_a"), 80),
                "side_b": _text(e.get("side_b"), 80),
                "type": kind or "unknown",
                "deaths_best": _int(e.get("best")),
                "deaths_civilians": _int(e.get("deaths_civilians")),
            }
        )
    sample.sort(key=lambda s: (s["date"], s["deaths_best"]), reverse=True)
    return {r: dict(sorted(m.items())) for r, m in regions.items()}, sample[:SAMPLE]


def load_previous() -> dict:
    try:
        return json.loads(STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def emit(status: dict, data: dict | None) -> None:
    DATA.mkdir(exist_ok=True)
    STATUS.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if data is not None:
        SNAP.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def collect(token: str, opener=None, now=None) -> int:
    now = now or utcnow()
    today = now.date()
    previous = load_previous()
    known = previous.get("version") if VERSION_RE.match(str(previous.get("version") or "")) else DEFAULT_VERSION
    status = {"source": "ucdp_ged_candidate", "checked_at": iso(now), "version": known}
    if not token:
        status.update(state="error", detail="UCDP_ACCESS_TOKEN not configured", requests=0)
        emit(status, None)
        print("::error::UCDP_ACCESS_TOKEN not configured")
        return 1
    client = Client(token, opener)
    try:
        version = discover_version(client, known, today)
        start = window_start(today)
        events = fetch_events(client, version, start, today)
    except StopRun as e:
        # Keep the previous snapshot: a partial page set would undercount.
        status.update(state="error" if "auth" in str(e) else "partial", detail=str(e), requests=client.used)
        emit(status, None)
        print(f"::error::UCDP stopped: {e} after {client.used} requests")
        return 1
    except LookupError:
        status.update(state="error", detail=f"version {known} not found", requests=client.used)
        emit(status, None)
        print(f"::error::UCDP version {known} not found")
        return 1
    except (RuntimeError, ValueError) as e:
        status.update(state="error", detail=str(e)[:200], requests=client.used)
        emit(status, None)
        print(f"::error::UCDP failed: {e}")
        return 1
    regions, sample = summarize(events)
    data = {
        "source": "ucdp_ged_candidate",
        "version": version,
        "generated_at": iso(now),
        "window": {"start": start.isoformat(), "end": today.isoformat()},
        "events_total": sum(m["events"] for r in regions.values() for m in r.values()),
        "regions": regions,
        "latest": sample,
        "citation": "UCDP Georeferenced Event Dataset (GED) Candidate, Uppsala University",
    }
    status.update(state="ok", version=version, requests=client.used, events=data["events_total"])
    emit(status, data)
    print(f"UCDP {version}: {data['events_total']} events, {client.used} requests")
    return 0


if __name__ == "__main__":
    sys.exit(collect(os.environ.get("UCDP_ACCESS_TOKEN", "").strip()))
