#!/usr/bin/env python3
"""Public NASA satellite context collector. No auth; no imagery saved to git.

GIBS quicklooks provide *visual context*, not ground-truth event detection.
EONET covers natural events only. No military incident assertions are generated.
"""
import hashlib
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
EONET = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson"
LAYER = "VIIRS_SNPP_CorrectedReflectance_TrueColor"
DATA_PATH = Path("data/satellite-observations.json")
STATUS_PATH = Path("data/satellite-status.json")
SENSOR_MAX_BYTES = 1_200_000
REGIONS = {
    "persian_gulf": (47.0, 22.0, 57.5, 31.0),
    "strait_of_hormuz": (54.0, 24.5, 59.5, 28.2),
    "red_sea_south": (39.0, 11.0, 47.0, 19.0),
}
SIZE = (320, 256)


def now_utc():
    return datetime.now(timezone.utc)


def utc_iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def save_if_changed(path, value, volatile_fields=()):
    old = load_json(path)
    if old is not None and all(
        (key in volatile_fields or old.get(key) == val)
        for key, val in value.items()
    ) and set(old) == set(value):
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return True


def download(url, expected, max_bytes):
    req = urllib.request.Request(
        url, headers={
            "User-Agent": "RegionalWatchSatelliteContext/1.0 (open scientific data, low frequency)",
            "Accept": expected,
        },
    )
    with urllib.request.urlopen(req, timeout=22) as response:
        status = response.status
        content_type = response.headers.get("Content-Type", "").split(";")[0].lower()
        body = response.read(max_bytes + 1)
        if status != 200:
            raise ValueError("HTTP status " + str(status))
        if len(body) > max_bytes:
            raise ValueError("response exceeds size limit")
        return content_type, body


def gibs_url(bbox, date):
    # WMS v1.1.1 BBOX order is lon,lat; no credentials or private endpoints.
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.1.1",
        "REQUEST": "GetMap",
        "LAYERS": LAYER,
        "STYLES": "",
        "FORMAT": "image/jpeg",
        "TRANSPARENT": "FALSE",
        "SRS": "EPSG:4326",
        "BBOX": ",".join(str(x) for x in bbox),
        "WIDTH": str(SIZE[0]),
        "HEIGHT": str(SIZE[1]),
        "TIME": date,
    }
    return GIBS_WMS + "?" + urllib.parse.urlencode(params)


def fetch_quicklook(name, bbox, date):
    url = gibs_url(bbox, date)
    content_type, body = download(url, "image/jpeg", SENSOR_MAX_BYTES)
    if content_type != "image/jpeg" or not body.startswith(b"\xff\xd8"):
        raise ValueError("GIBS did not return a JPEG; no imagery can be inferred")
    with Image.open(io.BytesIO(body)) as im:
        im.load()
        if im.size != SIZE:
            raise ValueError("GIBS image dimension mismatch")
        image = im.convert("RGB").copy()
    variance = ImageStat.Stat(image).var
    # Uniform placeholder tiles are not useful observations.
    if max(variance) < 5:
        raise ValueError("GIBS tile appears blank or uniform")
    return {
        "region": name,
        "bbox_wsen": list(bbox),
        "image_date": date,
        "image_url": url,
        "sha256": hashlib.sha256(body).hexdigest(),
        "bytes": len(body),
        "pixel_variance": round(sum(variance) / 3, 2),
    }, image


def compare_imagery(new_img, old_img):
    # Diagnostic only. Large differences may be cloud, dust, illumination, or
    # imagery seams; this is NOT change detection of installations / activity.
    diff = ImageStat.Stat(ImageChops.difference(new_img, old_img))
    return round(sum(diff.mean) / 3, 2)


def natural_events():
    params = {
        "days": "14",
        "status": "all",
        "limit": "100",
        "bbox": "34,42,66,10",  # minLon,maxLat,maxLon,minLat
    }
    url = EONET + "?" + urllib.parse.urlencode(params)
    kind, raw = download(url, "application/json", 850_000)
    if kind not in ("application/json", "application/geo+json"):
        raise ValueError("EONET response not JSON")
    result = json.loads(raw)
    if not isinstance(result, dict) or result.get("type") != "FeatureCollection":
        raise ValueError("Unexpected EONET GeoJSON")
    features = result.get("features")
    if not isinstance(features, list):
        raise ValueError("Missing EONET events")
    out = []
    for feature in features[:100]:
        prop = feature.get("properties", {}) if isinstance(feature, dict) else {}
        if not isinstance(prop, dict):
            continue
        event_id, title = prop.get("id"), prop.get("title")
        if not isinstance(event_id, str) or not isinstance(title, str):
            continue
        link = prop.get("link")
        if not isinstance(link, str) or not link.startswith("https://eonet.gsfc.nasa.gov/"):
            link = "https://eonet.gsfc.nasa.gov/"
        cats = prop.get("categories") or []
        categories = [
            c.get("title") or c.get("id")
            for c in cats if isinstance(c, dict) and (c.get("title") or c.get("id"))
        ]
        out.append({
            "id": event_id[:100],
            "title": title[:300],
            "url": link,
            "categories": categories[:5],
            "event_date": prop.get("date"),
            "closed": prop.get("closed"),
            "source": "NASA EONET",
        })
    return out


def collect(at):
    current_date = (at - timedelta(days=2)).date().isoformat()
    prior_date = (at - timedelta(days=5)).date().isoformat()
    overviews, issues = [], []
    for name, bbox in REGIONS.items():
        imgs, previews = [], []
        for date in (prior_date, current_date):
            try:
                record, image = fetch_quicklook(name, bbox, date)
                imgs.append(image)
                previews.append(record)
            except (urllib.error.URLError, ValueError, OSError) as exc:
                issues.append({"region": name, "date": date,
                               "error": type(exc).__name__ + ": " + str(exc)[:100]})
        for img in imgs:
            img.close()
        if previews:
            entry = {
                "region": name,
                "bbox_wsen": list(bbox),
                "layer": LAYER,
                "quicklooks": previews,
                "imagery_coverage": "partial" if len(previews) != 2 else "both_dates",
                "interpretation": "Optical imagery context only; pixel differences reflect clouds, dust, atmospheric and processing changes as well as ground changes.",
            }
            if len(previews) == 2:
                try:
                    # Both PIL images are still accessible after close() for
                    # in-memory operations, but their pixels are fully loaded.
                    # Re-fetching is deliberately avoided.
                    entry["visual_change_score"] = compare_imagery(imgs[1], imgs[0])
                except (ValueError, OSError):
                    entry["visual_change_score"] = None
            overviews.append(entry)
    events = []
    try:
        events = natural_events()
    except (urllib.error.URLError, ValueError, OSError, KeyError) as exc:
        issues.append({"source": "EONET", "error": type(exc).__name__ + ": " + str(exc)[:120]})
    return {
        "source": "satellite_context",
        "providers": ["NASA GIBS", "NASA EONET"],
        "layer": LAYER,
        "latest_requested_date": current_date,
        "earlier_requested_date": prior_date,
        "visual_overviews": overviews,
        "natural_events": events,
        "quality": {
            "has_optical_quicklooks": bool(overviews),
            "has_eonet_response": not any(x.get("source") == "EONET" for x in issues),
            "issues": issues[:18],
            "image_change_is_not_evidence_of_conflict": True,
            "not_an_alert_source": True,
        },
    }


def main():
    timestamp = now_utc()
    observation = collect(timestamp)
    data = {"source": "satellite_context",
            "collected_at": utc_iso(timestamp),
            **observation}
    # Changing collection time alone does not create a commit.
    output_changed = save_if_changed(
        DATA_PATH, data, volatile_fields=("collected_at",)
    )
    state = "ok" if (observation["quality"]["has_optical_quicklooks"]
                     and observation["quality"]["has_eonet_response"]) else "partial"
    if not observation["quality"]["has_optical_quicklooks"] and not observation["quality"]["has_eonet_response"]:
        state = "error"
    status = {
        "source": "satellite_context",
        "state": state,
        "checked_at": utc_iso(timestamp),
        "snapshot_changed": output_changed,
        "regions_with_imagery": len(observation["visual_overviews"]),
        "natural_events": len(observation["natural_events"]),
        "errors": observation["quality"]["issues"][:8],
        "note": "Context imagery & natural events; not verification of attacks or military activity.",
    }
    save_if_changed(STATUS_PATH, status, volatile_fields=("checked_at", "snapshot_changed"))
    print(json.dumps(status, sort_keys=True, ensure_ascii=False))
    return 0 if state != "error" else 1


if __name__ == "__main__":
    sys.exit(main())
