#!/usr/bin/env python3
"""Low-frequency, official-public-preview collector for Regional Watch analysts.

Only public Telegram channel previews and official YouTube channel Atom feeds.
No private access, session cookies, bypassing rate limits, video/audio download,
or fabricated video transcript. All collected text is source-attributed and bounded.
"""
from __future__ import annotations

import hashlib
import html
from html.parser import HTMLParser
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "config" / "analysts.json"
OUT = ROOT / "data" / "analyst-source-items.json"
STATUS = ROOT / "data" / "analyst-source-status.json"
UA = "RegionalWatch/1.0 (+https://regional-watch.pages.dev; public noncommercial OSINT)"
MAX_RESPONSE = 750_000
MAX_ITEMS = 22
MAX_BODY = 6500
MAX_OUTPUT = 120_000
MAX_DAYS = 6


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def ts(d: datetime) -> str:
    return d.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def utc_parse(value: str) -> datetime | None:
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return d.astimezone(timezone.utc) if d.tzinfo else None
    except (TypeError, ValueError):
        return None


def fetch_public(url: str) -> tuple[str, int]:
    u = urllib.parse.urlsplit(url)
    allowed = ((u.hostname == "t.me" and u.path.startswith("/s/") and not u.query)
               or (u.hostname == "www.youtube.com" and u.path == "/feeds/videos.xml"
                   and set(urllib.parse.parse_qs(u.query)) == {"channel_id"}))
    if u.scheme != "https" or not allowed or u.username or u.password:
        raise ValueError("URL outside official public allowlist")
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html, application/atom+xml, application/xml"})
    # Default urlopen redirects are not followed blindly to another host.
    with urllib.request.urlopen(req, timeout=16) as response:
        final = urllib.parse.urlsplit(response.url)
        if final.scheme != "https" or final.hostname != u.hostname:
            raise ValueError("unexpected off-domain redirect")
        content_type = response.headers.get("Content-Type", "").lower()
        if not ("xml" in content_type or "html" in content_type or "text/plain" in content_type):
            raise ValueError("unexpected content type")
        body = response.read(MAX_RESPONSE + 1)
        if len(body) > MAX_RESPONSE:
            raise ValueError("source response exceeds maximum")
        return body.decode("utf-8", "replace"), response.status


class PublicTelegramParser(HTMLParser):
    """Conservative HTML parser: only text within a signed channel post and its date.

    Counts enclosing div depth, ignores forwards and does not parse videos.
    Telegram public /s/ preview is not a full export; absence never means no posts.
    """
    def __init__(self, channel: str):
        super().__init__(convert_charrefs=True)
        self.channel = channel
        self.depth = 0
        self.active = None
        self.text_level = None
        self.posts = []
        self.skip_level = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        classes = set(a.get("class", "").split())
        if tag == "div":
            self.depth += 1
            ref = a.get("data-post", "")
            if self.active is None and "tgme_widget_message" in classes and re.fullmatch(re.escape(self.channel) + r"/\d+", ref):
                self.active = {"num": int(ref.rsplit("/", 1)[-1]), "text": [], "published_at": None, "forwarded": False}
                self.active_depth = self.depth
            elif self.active:
                if "tgme_widget_message_text" in classes and self.text_level is None:
                    self.text_level = self.depth
                if "tgme_widget_message_forwarded_from_name" in classes:
                    self.active["forwarded"] = True
        if self.active:
            if tag == "time" and a.get("datetime"):
                self.active["published_at"] = a["datetime"]
            if tag == "br" and self.text_level is not None:
                self.active["text"].append("\n")

    def handle_endtag(self, tag):
        if tag == "div":
            if self.text_level is not None and self.text_level == self.depth:
                self.text_level = None
            if self.active is not None and self.active_depth == self.depth:
                self.posts.append(self.active)
                self.active = None
                self.text_level = None
            self.depth = max(0, self.depth - 1)

    def handle_data(self, value):
        if self.active is not None and self.text_level is not None and value.strip():
            self.active["text"].append(value)


def clean_text(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def telegram_posts(markup: str, source: dict, analyst_id: str, now: datetime) -> list[dict]:
    channel = source["canonical_prefix"].rstrip("/").rsplit("/", 1)[-1]
    parser = PublicTelegramParser(channel)
    parser.feed(markup)
    if "tgme_widget_message" not in markup:
        raise ValueError("Telegram public preview markup changed or unavailable")
    result = []
    for row in parser.posts:
        published = utc_parse(row["published_at"] or "")
        if not published or published > now + timedelta(hours=3) or published < now - timedelta(days=MAX_DAYS):
            continue
        body = clean_text(" ".join(row["text"]))
        if not body or row["forwarded"]:
            continue
        truncated = len(body) > MAX_BODY
        body = body[:MAX_BODY]
        canonical = f"{source['canonical_prefix']}{row['num']}"
        result.append({
            "id": f"{source['id']}:{row['num']}", "analyst_id": analyst_id,
            "source_id": source["id"], "type": "telegram_post", "canonical_url": canonical,
            "title": "", "published_at": ts(published), "text_status": "truncated" if truncated else "full_text",
            "body": body, "language": "ru", "video_timecodes": [],
            "content_hash": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        })
    return sorted(result, key=lambda x: x["published_at"], reverse=True)[:MAX_ITEMS]


def youtube_posts(xml: str, source: dict, analyst_id: str, now: datetime) -> list[dict]:
    if len(xml) > MAX_RESPONSE:
        raise ValueError("oversized YouTube Atom")
    root = ET.fromstring(xml)
    atom = "{http://www.w3.org/2005/Atom}"
    yt = "{http://www.youtube.com/xml/schemas/2015}"
    result = []
    feed_id = root.findtext(atom + "id", "")
    channel_id = source.get("channel_id", "")
    if root.tag != atom + "feed":
        raise ValueError("YouTube did not return an Atom feed: " + root.tag[:75])
    links = " ".join(el.get("href", "") for el in root.findall(atom + "link") if el.get("rel") == "self")
    entry_channels = {el.findtext(yt + "channelId", "") for el in root.findall(atom + "entry")}
    if channel_id and channel_id not in feed_id + links and channel_id not in entry_channels:
        raise ValueError("YouTube channel mismatch: feed_id=" + feed_id[:85] + ", root=" + root.tag[:55])
    for e in root.findall(atom + "entry"):
        video_id = e.findtext(yt + "videoId", "")
        if not re.fullmatch(r"[\w-]{11}", video_id):
            continue
        published = utc_parse(e.findtext(atom + "published", ""))
        if not published or published > now + timedelta(hours=3) or published < now - timedelta(days=MAX_DAYS):
            continue
        title = clean_text(e.findtext(atom + "title", ""))[:240]
        if not title:
            continue
        # Metadata only: cannot establish what was spoken or timestamps.
        result.append({
            "id": f"{source['id']}:{video_id}", "analyst_id": analyst_id,
            "source_id": source["id"], "type": "youtube_video",
            "canonical_url": source["canonical_prefix"] + video_id,
            "title": title, "published_at": ts(published), "text_status": "metadata_only",
            "body": "", "language": "ru", "video_timecodes": [],
            "content_hash": hashlib.sha256((video_id + title).encode("utf-8")).hexdigest(),
        })
    return sorted(result, key=lambda x: x["published_at"], reverse=True)[:MAX_ITEMS]


def main() -> int:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    if cfg.get("schema_version") != 1 or not isinstance(cfg.get("analysts"), list):
        raise ValueError("invalid analyst registry")
    now = now_utc()
    items = []
    sources = []
    for analyst in cfg["analysts"]:
        aid = analyst["id"]
        for source in analyst.get("sources", []):
            if not source.get("enabled"):
                continue
            status = {"source_id": source["id"], "state": "error", "count": 0, "detail": None}
            try:
                body, _ = fetch_public(source["feed"])
                if source["type"] == "telegram_public":
                    got = telegram_posts(body, source, aid, now)
                elif source["type"] == "youtube_rss":
                    got = youtube_posts(body, source, aid, now)
                else:
                    raise ValueError("unknown source type")
                if not got:
                    raise ValueError("no parsable recent public entries")
                status.update(state="ok", count=len(got))
                items.extend(got)
            except (urllib.error.URLError, TimeoutError, ValueError, ET.ParseError) as exc:
                status["detail"] = (type(exc).__name__ + ": " + str(exc))[:250]
            sources.append(status)
    ids = set()
    unique = []
    for it in sorted(items, key=lambda r: r["published_at"], reverse=True):
        if it["id"] not in ids:
            ids.add(it["id"])
            unique.append(it)
    unique = unique[:40]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {"schema_version": 1, "checked_at": ts(now), "items": unique}
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if len(encoded.encode("utf-8")) > MAX_OUTPUT:
        raise ValueError("collector JSON exceeds bounded output")
    OUT.write_text(encoded + "\n", encoding="utf-8")
    state = "ok" if sources and all(x["state"] == "ok" for x in sources) else "partial" if any(x["state"] == "ok" for x in sources) else "error"
    STATUS.write_text(json.dumps({"checked_at": ts(now), "state": state, "sources": sources}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"state": state, "sources": sources, "items": len(unique)}, ensure_ascii=False))
    return 0 if state != "error" else 1


if __name__ == "__main__":
    sys.exit(main())