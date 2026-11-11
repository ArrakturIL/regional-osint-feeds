#!/usr/bin/env python3
"""Collect active, region-relevant US MARAD maritime advisories.

Only public pages on the official dot.gov domain. No authentication,
blocking bypass, or publication-date inference from collection time.
"""
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path

URL = "https://www.maritime.dot.gov/msci-advisories"
NEWS_PATH = Path("data/marad-advisories.json")
STATUS_PATH = Path("data/marad-status.json")
KEYWORDS = ("iran", "hormuz", "persian gulf", "gulf of oman",
            "red sea", "bab el", "bab al", "gulf of aden",
            "arabian sea", "israel", "lebanon", "yemen")


def iso(d):
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, OSError, ValueError):
        return None


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


class OfficialAdvisoryParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.active_section = False
        self.in_link = False
        self.current_href = ""
        self.current_text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.in_link = True
            self.current_text = []
            self.current_href = dict(attrs).get("href", "")

    def handle_endtag(self, tag):
        if tag == "a" and self.in_link:
            title = " ".join(" ".join(self.current_text).split())
            if self.active_section and re.match(r"^20\d{2}-\d{3}\b", title):
                self.links.append((self.current_href, title))
            self.in_link = False
            self.current_text = []

    def handle_data(self, data):
        heading = " ".join(data.split()).lower()
        if heading == "active advisories":
            self.active_section = True
        elif heading == "cancelled advisories":
            self.active_section = False
        if self.in_link:
            self.current_text.append(data)


def get_official_html():
    request = urllib.request.Request(
        URL, headers={
            "User-Agent": "regional-osint-feeds/1.0 (US public maritime advisory monitoring)",
            "Accept": "text/html",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        payload = response.read(1_000_001)
        if len(payload) > 1_000_000:
            raise ValueError("MARAD HTML unexpectedly exceeds 1 MB")
        return payload.decode("utf-8", errors="replace")


def parse(html):
    parser = OfficialAdvisoryParser()
    parser.feed(html)
    if "active advisories" not in html.lower():
        raise ValueError("No active advisory section on official MARAD page")
    if not parser.links:
        raise ValueError("No numbered advisory links in active section")
    by_url = {}
    for href, title in parser.links:
        if not any(term in title.lower() for term in KEYWORDS):
            continue
        canonical = urllib.parse.urljoin(URL, href)
        parts = urllib.parse.urlsplit(canonical)
        if parts.scheme != "https" or parts.hostname not in ("maritime.dot.gov", "www.maritime.dot.gov"):
            continue
        if not parts.path.startswith("/msci-advisories/"):
            continue
        clean = urllib.parse.urlunsplit(("https", parts.hostname, parts.path, "", ""))
        by_url[clean] = {
            "url": clean,
            "title": title[:350],
            "advisory_id": title.split("-")[0] + "-" + title.split("-")[1],
            "source": "U.S. Maritime Administration (MARAD)",
            "source_feed": URL,
            "status": "active",
            "published_at": None,
        }
    return sorted(by_url.values(), key=lambda x: x["advisory_id"], reverse=True), len(parser.links)


def main():
    now = datetime.now(timezone.utc)
    state = {"source": "marad_advisories", "source_feed": URL,
             "checked_at": iso(now), "state": "error", "count": 0,
             "detail": None}
    try:
        items, all_active_count = parse(get_official_html())
        state.update({"state": "ok", "count": len(items),
                      "official_active_count": all_active_count})
        prev = read_json(NEWS_PATH)
        if not prev or prev.get("items") != items:
            write_json(NEWS_PATH, {
                "source": "marad_advisories",
                "source_feed": URL,
                "fetched_at": iso(now),
                "count": len(items),
                "coverage": "Only active, region-matching MARAD advisories; no inferred publication times",
                "items": items,
            })
    except urllib.error.HTTPError as exc:
        state["detail"] = f"Upstream HTTP {exc.code}"
    except Exception as exc:
        state["detail"] = f"{type(exc).__name__}: {str(exc)[:220]}"
    prev = read_json(STATUS_PATH)
    if (not prev or any(prev.get(k) != v for k, v in state.items() if k != "checked_at")
            or now - datetime.fromisoformat(prev["checked_at"].replace("Z", "+00:00")) > timedelta(hours=12)):
        write_json(STATUS_PATH, state)
    print(json.dumps(state, ensure_ascii=False, sort_keys=True))
    return 0 if state["state"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
