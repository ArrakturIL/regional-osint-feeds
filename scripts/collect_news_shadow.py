#!/usr/bin/env python3
"""Read-only, license-gated RSS/Atom shadow audit for REGIONAL WATCH.

Never publishes story text, feeds or translations to the site. Generates only
per-source health and aggregate QA measurements. Default fetch is once per URL;
an inaccessible candidate is marked error without affecting other sources.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html import unescape
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from urllib.request import Request, urlopen
import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from news_event_filter import report as event_filter_report

ROOT=Path(__file__).resolve().parents[1]
REGISTRY=ROOT/"config/news-source-registry.json"
OUTPUT=ROOT/"data/news-shadow-audit-status.json"
MAX_BYTES=450_000
TIMEOUT_SEC=7
REGIONAL=re.compile(
 r"\b(?:israel|iran|tehran|jerusalem|gaza|lebanon|hezbollah|hamas|idf|hormuz|houthi|syria|iranian|israeli|yemen)\b"
 r"|ישראל|איראן|צה[״\"']?ל|נתניהו|עזה|לבנון|חיזבאללה|חמאס|הורמוז|סוריה"
 r"|إسرائيل|إيران|غزة|لبنان|سوريا|طهران|حزب الله|الحوثي",
 re.I)
STRONG=re.compile(
 r"\b(?:war|wars|attack|strike|missile|drone|nuclear|sanction|ceasefire|military|intercept|hostage|diplomacy|deal|negotiations)\b"
 r"|מלחמה|תקיפה|טיל|כטב.?ם|חטופ|גרעין|משא ומתן"
 r"|حرب|هجوم|صاروخ|مسيرة|نووي|عقوبات|هدنة",
 re.I)
TRACKER=re.compile(r"^(?:utm_.+|fbclid|gclid|dclid|msclkid|_ga|_gl|mc_cid|mc_eid)$",re.I)

def canonical(url):
    try: u=urlsplit(url)
    except ValueError: return None
    if u.scheme!="https" or not u.hostname or u.username or u.password:return None
    path=(u.path.rstrip("/") or "/")
    qs=sorted((k,v) for k,v in parse_qsl(u.query,keep_blank_values=True)
              if not TRACKER.fullmatch(k))
    return urlunsplit(("https",u.netloc.lower(),path,urlencode(qs),""))

def text(node):
    if node is None:return ""
    return re.sub(r"\s+"," ",unescape("".join(node.itertext()))).strip()[:260]

def child(node,names):
    wanted=set(names)
    for n in node:
        if n.tag.rsplit("}",1)[-1].split(":")[-1].lower() in wanted:return n
    return None

def feed_items(xml):
    if isinstance(xml,str):xml=xml.encode("utf-8")
    if len(xml)>MAX_BYTES:raise ValueError("oversized feed")
    root=ET.fromstring(xml)
    root_type=root.tag.rsplit("}",1)[-1].lower()
    if root_type not in ("rss","rdf","feed"):raise ValueError("unsupported RSS/Atom root")
    nodes=[n for n in root.iter() if n.tag.rsplit("}",1)[-1].lower() in ("item","entry")]
    out=[]
    for node in nodes[:70]:
        title=text(child(node,("title",)))
        summary=text(child(node,("description","summary","content")))
        raw_link=child(node,("link",))
        link=raw_link.get("href") if raw_link is not None and raw_link.get("href") else text(raw_link)
        dt=text(child(node,("pubdate","published","updated","date","issued")))
        if not title or not link:continue
        out.append({"title":title,"summary":summary,"link":link,"published":dt})
    return out

def parsed_date(value):
    if not value:return None
    try:
        parsed=parsedate_to_datetime(value)
    except (ValueError,TypeError,IndexError):
        try:parsed=datetime.fromisoformat(value.replace("Z","+00:00"))
        except (ValueError,TypeError):return None
    if parsed.tzinfo is None:return None
    return parsed.astimezone(timezone.utc)

def relevant(row):
    combined=row["title"]+" "+row["summary"]
    return bool(REGIONAL.search(combined))

def category(title):
    s=title.lower()
    if re.search(r"\bopinion\b|\bcommentary\b|דעה|טור דעה|رأي",s):return "opinion"
    if re.search(r"as it happened|live updates|live blog|עדכונים שוטפים|مباشر",s):return "liveblog"
    if re.search(r"\bsponsored\b|תוכן ממומן|إعلان",s):return "sponsored"
    return "news"

def score(row):
    title=row["title"]; reasons=[]
    if REGIONAL.search(title):reasons.append("regional_title")
    elif REGIONAL.search(row["summary"]):reasons.append("regional_summary_only")
    if STRONG.search(title):reasons.append("impact_term")
    return 3*int("regional_title" in reasons)+3*int("impact_term" in reasons),reasons

def download(feed):
    url=feed["feed_url"]; p=urlsplit(url)
    if p.scheme!="https" or not p.hostname:raise ValueError("invalid feed URL")
    req=Request(url,headers={"User-Agent":"RegionalWatchFeedAudit/1.0 (noncommercial, read-only)",
                              "Accept":"application/rss+xml,application/atom+xml,application/xml,text/xml"})
    with urlopen(req,timeout=TIMEOUT_SEC) as response:
        final=urlsplit(response.url)
        host=p.hostname.removeprefix("www.")
        if final.scheme!="https" or not final.hostname or not (
            final.hostname==host or final.hostname.removeprefix("www.")==host):
            raise ValueError("unexpected cross-host redirect")
        if response.status!=200:raise ValueError(f"HTTP {response.status}")
        payload=response.read(MAX_BYTES+1)
    return feed_items(payload)

def audit_one(feed,now,fetcher=download):
    report={"source_id":feed["id"],"publisher_id":feed["publisher"],
            "language":feed["language"],"checked_at":now.isoformat(),
            "license_review":feed["license_status"],
            "state":"error","raw_items":0,"relevant":0,"eligible":0,
            "latest_item":None,"error":None}
    articles=[]
    try:
        data=fetcher(feed)
        report["raw_items"]=len(data)
        for row in data:
            moment=parsed_date(row.get("published"))
            if moment is None or moment<now-timedelta(hours=72) or moment>now+timedelta(minutes=10):continue
            link=canonical(row.get("link"))
            if link is None:continue
            if report["latest_item"] is None or moment.isoformat()>report["latest_item"]:
                report["latest_item"]=moment.isoformat()
            if not relevant(row):continue
            report["relevant"]+=1
            kind=category(row["title"])
            if kind in ("sponsored","liveblog"):continue
            rank,reasons=score(row)
            if rank<3:continue
            report["eligible"]+=1
            articles.append({"canonical":link,"publisher":feed["publisher"],
                             "source":feed["id"],"language":feed["language"],
                             "published":moment.isoformat(),"headline":row["title"],
                             "summary":row["summary"],"rank":rank,"reason_codes":reasons,"kind":kind})
        report["state"]="ok" if data else "empty"
    except Exception as exc:
        report["error"]=type(exc).__name__
    return report,articles

def build_report(registry,now=None,fetcher=download):
    now=now or datetime.now(timezone.utc)
    sources=[s for s in registry["sources"] if s.get("probe") and s.get("feed_url")]
    if len(sources)>20:raise ValueError("too many network probes")
    results=[];raw=[]
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(audit_one,s,now,fetcher) for s in sources]
        for future in as_completed(futures):
            r,a=future.result();results.append(r);raw.extend(a)
    unique={}
    for a in sorted(raw,key=lambda a:(-a["rank"],a["published"])):
        unique.setdefault(a["canonical"],a)
    # A conservative shadow-only grouping, not verification or proof of event identity.
    title_group={}
    for a in unique.values():
        key=re.sub(r"[^\w]+"," ",a["headline"].casefold()).strip()
        key=sha256((key+"|"+a["published"][:10]).encode("utf-8")).hexdigest()[:16]
        title_group.setdefault(key,set()).add(a["publisher"])
    event_filter=event_filter_report(list(unique.values()))
    owners={}
    for a in unique.values():owners[a["publisher"]]=owners.get(a["publisher"],0)+1
    return {
      "schema_version":1,"mode":"shadow_only_never_publish","checked_at":now.isoformat(),
      "source_count":len(sources),"ok_sources":sum(r["state"]=="ok" for r in results),
      "partial":any(r["state"]=="error" for r in results),
      "raw_candidates":len(raw),"canonical_articles":len(unique),
      "headline_groups":len(title_group),
      "event_filter":event_filter,
      "owner_counts":owners,
      "quality_notice":"Raw source count and matching headlines do not confirm an event; multilingual grouping is shadow-only and cannot verify claims.",
      "source_status":sorted(results,key=lambda r:r["source_id"])
    }

def main():
    registry=json.loads(REGISTRY.read_text(encoding="utf-8"))
    if registry.get("schema_version")!=1:raise ValueError("unsupported source registry")
    report=build_report(registry)
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    OUTPUT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"shadow_source_health":{r["source_id"]:r["state"] for r in report["source_status"]},
                      "candidates":report["canonical_articles"],
                      "ok_sources":report["ok_sources"]},ensure_ascii=False))
    return 0   # upstream errors are measured, not a failure of source-independent QA

if __name__=="__main__":raise SystemExit(main())
