#!/usr/bin/env python3
"""Q12: collect ADS-B snapshots from GitHub Actions for the Monitor D1 cache.

Cloudflare Worker egress is refused by the providers (adsb.lol 429 since
18.11, its /mil and adsb.fi 403), while GitHub runners get 200 (probe run
44534686137, 19.11). This collector fetches the same public endpoints the
Monitor used, keeps only the fields the Monitor aggregates, and writes one
data/status pair for scripts.publish_neon_mirror -> Neon -> scripts.neon_to_d1.

--kind point: every configured region from adsb.lol /v2/point (focus + context).
--kind mil:   global military-tagged snapshot, adsb.lol first, adsb.fi fallback.

The JSON files stay in the runner workspace; they are never committed.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config/adsb-collector.json"
FILES = {
    "point": ("adsb-point.json", "adsb-point-status.json"),
    "mil": ("adsb-mil.json", "adsb-mil-status.json"),
}
USER_AGENT = "regional-osint-feeds/1.0 (+https://regional-watch.pages.dev)"
MAX_RESPONSE = 4_000_000
MAX_SNAPSHOT_AGE_MS = 5 * 60_000
MAX_OUTPUT_BYTES = 900_000  # below the 1 MiB Neon/D1 document cap
REQUEST_GAP_S = 1.1  # adsb.lol / adsb.fi: about one request per second
HEX = frozenset("0123456789abcdef")


class UpstreamError(Exception):
    """Sanitized provider failure: no body, headers or URLs with secrets."""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def load_config(path: Path = CONFIG) -> dict:
    cfg = json.loads(Path(path).read_text(encoding="utf8"))
    if cfg.get("schema_version") != 1:
        raise ValueError("invalid ADS-B collector config schema")
    regions = cfg["point"]["regions"]
    if not regions or len(regions) > 8:
        raise ValueError("invalid ADS-B region count")
    names = set()
    for region in regions:
        name, lat, lon, radius = region
        if not isinstance(name, str) or name in names:
            raise ValueError("invalid or duplicate ADS-B region name")
        names.add(name)
        if not (abs(lat) <= 90 and abs(lon) <= 180 and radius > 0):
            raise ValueError("invalid ADS-B region geometry")
    if not cfg["mil"]["providers"]:
        raise ValueError("no military ADS-B provider")
    return cfg


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            body = response.read(MAX_RESPONSE + 1)
    except urllib.error.HTTPError as exc:
        raise UpstreamError("HTTP " + str(exc.code)) from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise UpstreamError("network " + type(exc).__name__) from None
    if len(body) > MAX_RESPONSE:
        raise UpstreamError("response exceeds cap")
    try:
        return json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise UpstreamError("invalid JSON") from None


def snapshot_ms(data: object, fetched_ms: int) -> int:
    """Validate an ADSBx v2 response the same way the Monitor did."""
    if not isinstance(data, dict) or not isinstance(data.get("ac"), list):
        raise UpstreamError("unexpected ADS-B response")
    now = data.get("now")
    if isinstance(now, bool) or not isinstance(now, (int, float)) or not math.isfinite(now):
        raise UpstreamError("unexpected ADS-B response")
    ms = int(now * 1000) if now < 1e12 else int(now)
    if abs(fetched_ms - ms) > MAX_SNAPSHOT_AGE_MS:
        raise UpstreamError("stale ADS-B response")
    return ms


def _number(value: object, digits: int | None = None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return round(value, digits) if digits is not None else value


def trim_aircraft(rows: list) -> list[dict]:
    """Only the fields the Monitor aggregates; dedupe by ICAO hex."""
    out, seen = [], set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        hex_id = str(row.get("hex") or "").strip().lower()
        if len(hex_id) != 6 or not set(hex_id) <= HEX or hex_id in seen:
            continue
        seen.add(hex_id)
        item = {"hex": hex_id}
        aircraft_type = row.get("t")
        if isinstance(aircraft_type, str) and 2 <= len(aircraft_type) <= 5 and aircraft_type.isalnum():
            item["t"] = aircraft_type.upper()
        flight = str(row.get("flight") or "").strip()
        if flight:
            item["flight"] = flight[:10]
        flags = row.get("dbFlags")
        if isinstance(flags, int) and not isinstance(flags, bool):
            item["dbFlags"] = flags
        for key, digits in (("lat", 4), ("lon", 4), ("seen", 1), ("seen_pos", 1)):
            value = _number(row.get(key), digits)
            if value is not None:
                item[key] = value
        out.append(item)
    return out


def collect_point(cfg: dict, *, fetch=fetch_json, now=utcnow, sleep=time.sleep) -> tuple[dict, dict]:
    point = cfg["point"]
    regions, failures = [], []
    for i, (area, lat, lon, requested) in enumerate(point["regions"]):
        if i:
            sleep(REQUEST_GAP_S)
        radius = min(point["max_radius_nm"], requested)
        url = point["url"].format(lat=lat, lon=lon, radius=radius)
        entry = {"area": area, "lat": lat, "lon": lon, "radius_nm": radius,
                 "requested_radius_nm": requested, "url": url}
        try:
            data = fetch(url)
            entry["now_ms"] = snapshot_ms(data, int(now().timestamp() * 1000))
            entry["ac"] = trim_aircraft(data["ac"])
        except UpstreamError as exc:
            entry["error"] = str(exc)
            failures.append(area + ": " + str(exc))
        regions.append(entry)
    ok = len(regions) - len(failures)
    state = "ok" if not failures else "partial" if ok else "error"
    data = {"schema_version": 1, "source": point["source_key"], "provider": point["provider"],
            "collected_via": "github_actions", "regions": regions}
    status = {"source": point["source_key"], "state": state, "checked_at": iso(now()),
              "regions_ok": ok, "regions_total": len(regions),
              "detail": ("; ".join(failures)[:500] or None)}
    return data, status


def collect_mil(cfg: dict, *, fetch=fetch_json, now=utcnow, sleep=time.sleep) -> tuple[dict, dict]:
    mil = cfg["mil"]
    attempts = []
    data = None
    for i, (provider, url) in enumerate(mil["providers"]):
        if i:
            sleep(REQUEST_GAP_S)
        try:
            raw = fetch(url)
            snapshot = snapshot_ms(raw, int(now().timestamp() * 1000))
            data = {"schema_version": 1, "source": mil["source_key"], "provider": provider, "url": url,
                    "collected_via": "github_actions", "now_ms": snapshot,
                    "global_tagged_aircraft": len(raw["ac"]), "ac": trim_aircraft(raw["ac"])}
            attempts.append({"provider": provider, "result": "ok"})
            break
        except UpstreamError as exc:
            attempts.append({"provider": provider, "result": str(exc)})
    failed = [a["provider"] + ": " + a["result"] for a in attempts if a["result"] != "ok"]
    if data is None:
        data = {"schema_version": 1, "source": mil["source_key"], "provider": None, "url": None,
                "collected_via": "github_actions", "now_ms": None, "global_tagged_aircraft": 0, "ac": []}
    data["attempts"] = attempts
    status = {"source": mil["source_key"], "state": "ok" if data["provider"] else "error",
              "checked_at": iso(now()), "provider": data["provider"],
              "detail": ("; ".join(failed)[:500] or None)}
    return data, status


def write_pair(kind: str, data: dict, status: dict, root: Path = ROOT) -> None:
    data_name, status_name = FILES[kind]
    encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    if len(encoded.encode("utf8")) > MAX_OUTPUT_BYTES:
        raise ValueError("ADS-B snapshot exceeds output cap")
    out = Path(root) / "data"
    out.mkdir(parents=True, exist_ok=True)
    (out / data_name).write_text(encoded + "\n", encoding="utf8")
    (out / status_name).write_text(json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--kind", required=True, choices=sorted(FILES))
    parser.add_argument("--root", default=str(ROOT))
    args = parser.parse_args(argv)
    cfg = load_config()
    data, status = (collect_point if args.kind == "point" else collect_mil)(cfg)
    write_pair(args.kind, data, status, Path(args.root))
    print("adsb_collect kind={} state={} detail={}".format(args.kind, status["state"], status["detail"]))
    if status["state"] == "error":
        # Published anyway, so the Monitor reports the real upstream failure.
        print("::warning::ADS-B {} collection failed: {}".format(args.kind, status["detail"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
