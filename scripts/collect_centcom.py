#!/usr/bin/env python3
"""Fetch official U.S. Central Command Public Affairs DVIDS news.

No scraping, credentials, workarounds for HTTP restrictions, or third-party
proxies. Only direct links to DVIDS /news/ items are accepted.
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

FEED_URL = "https://www.dvidshub.net/rss/unit/72"
DATA_FILE = Path("data/centcom-news.json")
STATUS_FILE = Path("data/centcom-status.json")
MAX_RESPONSE = 2_000_000
MAX_AGE = timedelta(days=30)
MAX_ITEMS = 50


def utcnow():
    return datetime.now(timezone.utc)


def iso(value):
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def date_from_rss(text):
    try:
        date = parsedate_to_datetime(text.strip())
        if date.tzinfo is None:
            return None
        return date.astimezone(timezone.utc)
    except (TypeError, ValueError, OverflowError, AttributeError):
        return None


def fetch():
    request = urllib.request.Request(
        FEED_URL,
        headers={
            "User-Agent": "regional-osint-feeds/1.0 (public CENTCOM news monitoring)",
            "Accept": "application/rss+xml,application/xml,text/xml",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        content = response.read(MAX_RESPONSE + 1)
        if len(content) > MAX_RESPONSE:
            raise ValueError("Response exceeds 2 MB")
        return content


def parse_rss(xml_bytes, timestamp):
    root = ET.fromstring(xml_bytes)
    if root.tag != "rss":
        raise ValueError("Expected RSS 2.0")
    channel = root.find("channel")
    if channel is None:
        raise ValueError("Missing channel")
    channel_name = (channel.findtext("title") or "").strip()
    if "central command" not in channel_name.lower():
        raise ValueError("Unexpected channel: " + channel_name[:100])

    seen = set()
    items = []
    newest = None
    total_news_items = 0
    for item in channel.findall("item"):
        title = " ".join((item.findtext("title") or "").split())
        link = (item.findtext("link") or "").strip()
        published = date_from_rss(item.findtext("pubDate") or "")
        if not title or not link or not published:
            continue
        parsed = urllib.parse.urlsplit(link)
        if (
            parsed.scheme != "https"
            or parsed.hostname not in ("www.dvidshub.net", "dvidshub.net")
            or not parsed.path.startswith("/news/")
        ):
            continue
        total_news_items += 1
        if newest is None or published > newest:
            newest = published
        if not timestamp - MAX_AGE <= published <= timestamp + timedelta(minutes=10):
            continue
        canonical = urllib.parse.urlunsplit(
            ("https", parsed.hostname, parsed.path, "", "")
        )
        if canonical in seen:
            continue
        seen.add(canonical)
        items.append({
            "url": canonical,
            "title": title,
            "published_at": iso(published),
            "source": "DVIDS U.S. Central Command Public Affairs",
            "source_feed": FEED_URL,
        })
    items.sort(key=lambda item: item["published_at"], reverse=True)
    return channel_name, items[:MAX_ITEMS], newest, total_news_items


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main():
    checked = utcnow()
    status = {
        "source": "centcom_dvids",
        "source_feed": FEED_URL,
        "checked_at": iso(checked),
        "state": "error",
        "items": 0,
        "detail": None,
    }
    try:
        name, items, latest, total = parse_rss(fetch(), checked)
        status.update({
            "channel": name,
            "items": len(items),
            "news_items_in_feed": total,
            "latest_news_publication": iso(latest) if latest else None,
            "state": "ok" if items else "partial",
        })
        if not items:
            status["detail"] = "No dated /news/ entries within the last 30 days"
        else:
            # Do not overwrite the last known good news snapshot on an error.
            write_json(DATA_FILE, {
                "source": "centcom_dvids",
                "source_feed": FEED_URL,
                "fetched_at": iso(checked),
                "count": len(items),
                "coverage": "DVIDS unit news only; not all CENTCOM public releases",
                "items": items,
            })
    except urllib.error.HTTPError as exc:
        status["detail"] = f"Upstream HTTP {exc.code}"
    except Exception as exc:
        status["detail"] = f"{type(exc).__name__}: {str(exc)[:220]}"
    write_json(STATUS_FILE, status)
    print(json.dumps(status, ensure_ascii=False))
    return 0 if status["state"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
