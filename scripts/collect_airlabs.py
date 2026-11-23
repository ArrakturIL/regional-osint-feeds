#!/usr/bin/env python3
"""AirLabs departure schedules for regional airports: cancellations and delays.

Mass cancellations by foreign airlines and an airport's departure board going
empty are early, public signs that an escalation is expected or an airspace
closed. This collector keeps per-airport counts and a short history for the
tension index norm. It does NOT track aircraft (ADS-B does that).

Free key (checked 23.11.2026): 1 000 requests per month, personal use, expires
11.12.2026. The workflow fires hourly but GitHub runs it irregularly, so each run
fetches only the airports that are DUE by their own interval, within a daily and
a monthly request budget kept in the status file. The api_key travels in the
query string: URLs are never printed or stored.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
SNAP = DATA / "airlabs-context.json"
STATUS = DATA / "airlabs-status.json"
URL = "https://airlabs.co/api/v9/schedules"
UA = "RegionalWatch/1.0 (public noncommercial research)"
DAILY_BUDGET = 30
MONTHLY_BUDGET = 950  # of 1 000: margin for probes and manual checks
HISTORY_DAYS = 14
DELAY_MIN = 15  # minutes: below that is ordinary noise

# code -> (hours between checks, home carriers). Foreign = any other operator.
AIRPORTS = {
    "TLV": (3, {"LY", "IZ", "6H"}),
    "IKA": (6, {"IR", "W5", "EP", "QB", "I3", "B9", "IV", "JI", "Y9"}),
    "BEY": (6, {"ME"}),
    "AMM": (6, {"RJ"}),
    "THR": (24, {"IR", "W5", "EP", "QB", "I3", "B9", "IV", "JI", "Y9"}),
    "BGW": (24, {"IA"}),
    "EBL": (24, {"IA"}),
    "DAM": (24, {"RB", "6Q"}),
    "DOH": (24, {"QR"}),
    "DXB": (24, {"EK", "FZ"}),
    "KWI": (24, {"KU", "J9"}),
    "BAH": (24, {"GF"}),
}
STOP_ERRORS = {"month_limit_exceeded", "hour_limit_exceeded", "minute_limit_exceeded", "unknown_api_key", "expired_api_key", "wrong_api_key"}


class StopRun(Exception):
    pass


def utcnow():
    return datetime.now(timezone.utc)


def iso(t):
    return t.isoformat(timespec="seconds").replace("+00:00", "Z")


def parse(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def key_info(body) -> dict:
    """The free key's expiry and monthly limit, as the API reports them (no secrets)."""
    k = ((body.get("request") or {}).get("key") or {}) if isinstance(body, dict) else {}
    out = {}
    if isinstance(k.get("expired"), str):
        out["key_expires"] = k["expired"][:10]
    if isinstance(k.get("limits_by_month"), int):
        out["limit_month"] = k["limits_by_month"]
    if isinstance(k.get("type"), str):
        out["key_type"] = k["type"][:20]
    return out


def fetch(key: str, code: str, opener=None, meta: dict | None = None) -> list[dict]:
    q = urllib.parse.urlencode({"dep_iata": code, "api_key": key})
    req = urllib.request.Request(f"{URL}?{q}", headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with (opener or urllib.request.urlopen)(req, timeout=40) as r:
            body = json.loads(r.read(10_000_000).decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 429):
            raise StopRun(f"HTTP {e.code}")
        raise RuntimeError(f"HTTP {e.code}")
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        raise RuntimeError(type(e).__name__)
    if meta is not None:
        meta.update(key_info(body))
    err = body.get("error") if isinstance(body, dict) else None
    if err:
        code_ = str(err.get("code") or err.get("message") or "error")[:60]
        if code_ in STOP_ERRORS or "key" in code_ or "limit" in code_:
            raise StopRun(code_)
        raise RuntimeError(code_)
    rows = body.get("response") if isinstance(body, dict) else None
    if not isinstance(rows, list):
        raise RuntimeError("unexpected response shape")
    return rows


def summarize(rows: list[dict], home: set[str]) -> dict:
    """Operated flights only: codeshare duplicates carry cs_flight_iata."""
    out = {"flights": 0, "cancelled": 0, "foreign": 0, "foreign_cancelled": 0, "delayed": 0, "delay_sum": 0,
           "rows": len(rows), "capped": len(rows) >= 100}
    cancelled_by = {}
    for r in rows:
        if not isinstance(r, dict) or r.get("cs_flight_iata"):
            continue
        airline = str(r.get("airline_iata") or "")
        foreign = airline not in home
        out["flights"] += 1
        out["foreign"] += foreign
        if r.get("status") == "cancelled":
            out["cancelled"] += 1
            out["foreign_cancelled"] += foreign
            if airline:
                cancelled_by[airline] = cancelled_by.get(airline, 0) + 1
            continue
        try:
            d = int(r.get("dep_delayed") or 0)
        except (TypeError, ValueError):
            d = 0
        if d >= DELAY_MIN:
            out["delayed"] += 1
            out["delay_sum"] += d
    out["avg_delay"] = round(out["delay_sum"] / out["delayed"]) if out["delayed"] else 0
    del out["delay_sum"]
    out["cancelled_by"] = dict(sorted(cancelled_by.items(), key=lambda kv: -kv[1])[:8])
    return out


def load(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def due(airports: dict, now: datetime) -> list[str]:
    """Airports whose interval has passed, most overdue (relative to interval) first."""
    ranked = []
    for code, (hours, _) in AIRPORTS.items():
        last = parse((airports.get(code) or {}).get("checked_at"))
        lag = (now - last) / timedelta(hours=hours) if last else 99.0
        if lag >= 0.9:  # a few minutes of cron jitter must not skip a slot
            ranked.append((-lag, code))
    return [c for _, c in sorted(ranked)]


def collect(key: str, opener=None, now=None) -> int:
    now = now or utcnow()
    snap = load(SNAP)
    prev = load(STATUS)
    airports = snap.get("airports") if isinstance(snap.get("airports"), dict) else {}
    day, month = now.strftime("%Y-%m-%d"), now.strftime("%Y-%m")
    used_day = prev.get("used_day", 0) if prev.get("day") == day else 0
    used_month = prev.get("used_month", 0) if prev.get("month") == month else 0
    status = {"source": "airlabs_schedules", "checked_at": iso(now), "day": day, "month": month}
    if not key:
        status.update(state="error", detail="AIRLABS_API_KEY not configured", used_day=used_day, used_month=used_month)
        emit(status, None)
        print("::error::AIRLABS_API_KEY not configured")
        return 1
    fetched, failed, stop = [], [], None
    meta = {k: prev[k] for k in ("key_expires", "limit_month", "key_type") if k in prev}
    for code in due(airports, now):
        if used_day >= DAILY_BUDGET or used_month >= MONTHLY_BUDGET:
            stop = "budget"
            break
        used_day += 1
        used_month += 1
        try:
            s = summarize(fetch(key, code, opener, meta), AIRPORTS[code][1])
        except StopRun as e:
            stop = str(e)
            break
        except RuntimeError as e:
            failed.append(f"{code}: {e}")
            continue
        entry = airports.get(code) or {}
        hist = [h for h in entry.get("history", []) if (parse(h[0]) or now) > now - timedelta(days=HISTORY_DAYS)]
        hist.append([iso(now), s["flights"], s["cancelled"], s["foreign_cancelled"], s["delayed"]])
        airports[code] = {"checked_at": iso(now), **s, "history": hist}
        fetched.append(code)
    state = "error" if stop and stop != "budget" and not fetched else ("partial" if stop or failed else "ok")
    status.update(state=state, used_day=used_day, used_month=used_month, fetched=fetched, failed=failed[:12], **meta)
    if stop:
        status["detail"] = stop
    data = None
    if fetched:
        data = {"source": "airlabs_schedules", "generated_at": iso(now), "delay_min": DELAY_MIN,
                "airports": {c: airports[c] for c in AIRPORTS if c in airports}}
    emit(status, data)
    level = "error" if state == "error" else "notice"
    print(f"::{level}::AirLabs {state}: fetched {','.join(fetched) or '-'}; day {used_day}/{DAILY_BUDGET}, "
          f"month {used_month}/{MONTHLY_BUDGET}" + (f"; stop {stop}" if stop else "") + (f"; failed {failed}" if failed else ""))
    return 1 if state == "error" else 0


def emit(status: dict, data: dict | None) -> None:
    DATA.mkdir(exist_ok=True)
    STATUS.write_text(json.dumps(status, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if data is not None:
        SNAP.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    if os.environ.get("AIRLABS_PROBE") == "1":  # pull requests: one request, key check only
        AIRPORTS = {"TLV": AIRPORTS["TLV"]}
    sys.exit(collect(os.environ.get("AIRLABS_API_KEY", "").strip()))
