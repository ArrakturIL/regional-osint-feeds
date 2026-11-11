#!/usr/bin/env python3
"""Public-source collector. No login, private APIs, bypasses, or transcript fabrication."""
import hashlib
import html
from html.parser import HTMLParser
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
MAX_BODY=6500
NOW=lambda:datetime.now(timezone.utc)
def iso(t):return t.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
def parse_time(s):
    try:
        t=datetime.fromisoformat((s or "").replace("Z","+00:00"))
        return t.astimezone(timezone.utc) if t.tzinfo else None
    except (ValueError,TypeError):return None
def clean(s):return re.sub(r"\s+"," ",html.unescape(s)).strip()
def load_url(url):
    u=urllib.parse.urlsplit(url)
    allowed=(u.hostname=="t.me" and u.path.startswith("/s/") and not u.query) or (
        u.hostname=="www.youtube.com" and u.path=="/feeds/videos.xml"
        and set(urllib.parse.parse_qs(u.query))=={"channel_id"})
    if u.scheme!="https" or not allowed or u.username or u.password:raise ValueError("disallowed origin")
    q=urllib.request.Request(url,headers={"User-Agent":"RegionalWatch/1.0 public noncommercial research",
        "Accept":"text/html,application/atom+xml,application/xml"})
    with urllib.request.urlopen(q,timeout=15) as r:
        f=urllib.parse.urlsplit(r.url)
        if f.hostname!=u.hostname or f.scheme!="https":raise ValueError("redirected to unknown origin")
        c=r.headers.get("Content-Type","").lower()
        if not any(x in c for x in ("xml","html","text/plain")):raise ValueError("invalid content type")
        data=r.read(750001)
    if len(data)>750000:raise ValueError("response too large")
    return data.decode("utf-8","replace")

class Telegram(HTMLParser):
    """Capture text only from posts bearing this exact channel's data-post identifier."""
    def __init__(self,channel):
        super().__init__(convert_charrefs=True)
        self.channel=channel;self.depth=0;self.active=None;self.text_depth=None;self.posts=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);classes=set(a.get("class","").split())
        if tag=="div":
            self.depth+=1
            ref=a.get("data-post","")
            if self.active is None and "tgme_widget_message" in classes and re.fullmatch(
                re.escape(self.channel)+r"/\d+",ref):
                self.active={"num":int(ref.rsplit("/",1)[1]),"published":None,"text":[],"forwarded":False}
                self.active_depth=self.depth
            elif self.active:
                if "tgme_widget_message_text" in classes:self.text_depth=self.depth
                if "tgme_widget_message_forwarded_from_name" in classes:self.active["forwarded"]=True
        if self.active:
            if tag=="time" and a.get("datetime"):self.active["published"]=a["datetime"]
            if tag=="br" and self.text_depth is not None:self.active["text"].append(" ")
    def handle_endtag(self,tag):
        if tag!="div":return
        if self.text_depth==self.depth:self.text_depth=None
        if self.active and self.active_depth==self.depth:
            self.posts.append(self.active);self.active=None;self.text_depth=None
        self.depth=max(0,self.depth-1)
    def handle_data(self,data):
        if self.active and self.text_depth is not None and data.strip():self.active["text"].append(data)

def telegram_posts(markup,source,author,now):
    channel=source["canonical_prefix"].rstrip("/").rsplit("/",1)[-1]
    p=Telegram(channel);p.feed(markup)
    if "tgme_widget_message" not in markup:raise ValueError("Telegram public preview changed or unavailable")
    out=[]
    for row in p.posts:
        t=parse_time(row["published"])
        if not t or t<now-timedelta(days=6) or t>now+timedelta(hours=3) or row["forwarded"]:continue
        full=clean(" ".join(row["text"]))
        if not full:continue
        body=full[:MAX_BODY]
        out.append({"id":source["id"]+":"+str(row["num"]),"analyst_id":author,
            "source_id":source["id"],"type":"telegram_post",
            "canonical_url":source["canonical_prefix"]+str(row["num"]),"published_at":iso(t),
            "title":"","body":body,"text_status":"truncated" if len(full)>MAX_BODY else "full_text",
            "language":"ru","video_timecodes":[],
            "content_hash":hashlib.sha256(body.encode()).hexdigest()})
    return sorted(out,key=lambda x:x["published_at"],reverse=True)[:22]

def youtube_posts(xml,source,author,now):
    root=ET.fromstring(xml);ns="{http://www.w3.org/2005/Atom}";yt="{http://www.youtube.com/xml/schemas/2015}"
    if source["channel_id"] not in root.findtext(ns+"id",""):raise ValueError("YouTube channel mismatch")
    out=[]
    for e in root.findall(ns+"entry"):
        video_id=e.findtext(yt+"videoId","")
        t=parse_time(e.findtext(ns+"published",""))
        if not re.fullmatch(r"[\w-]{11}",video_id) or not t or not now-timedelta(days=6)<=t<=now+timedelta(hours=3):continue
        title=clean(e.findtext(ns+"title",""))[:240]
        if not title:continue
        out.append({"id":source["id"]+":"+video_id,"analyst_id":author,
            "source_id":source["id"],"type":"youtube_video",
            "canonical_url":source["canonical_prefix"]+video_id,"published_at":iso(t),
            "title":title,"body":"","text_status":"metadata_only","language":"ru",
            "video_timecodes":[],"content_hash":hashlib.sha256((video_id+title).encode()).hexdigest()})
    return sorted(out,key=lambda x:x["published_at"],reverse=True)[:22]

def collect():
    cfg=json.loads((ROOT/"config/analysts.json").read_text(encoding="utf-8"))
    if cfg.get("schema_version")!=1:raise ValueError("registry invalid")
    now=NOW();items=[];states=[]
    for analyst in cfg["analysts"]:
        for source in analyst["sources"]:
            if not source.get("enabled"):continue
            record={"source_id":source["id"],"state":"error","count":0,"detail":None}
            try:
                text=load_url(source["feed"])
                if source["type"]=="telegram_public":found=telegram_posts(text,source,analyst["id"],now)
                elif source["type"]=="youtube_rss":found=youtube_posts(text,source,analyst["id"],now)
                else:raise ValueError("unrecognized channel type")
                if not found:raise ValueError("no parsable recent entries")
                items.extend(found);record.update(state="ok",count=len(found))
            except (urllib.error.URLError,TimeoutError,ValueError,ET.ParseError) as e:
                record["detail"]=(type(e).__name__+": "+str(e))[:180]
            states.append(record)
    byid={}
    for item in items:byid[item["id"]]=item
    items=sorted(byid.values(),key=lambda x:x["published_at"],reverse=True)[:40]
    state="ok" if states and all(x["state"]=="ok" for x in states) else (
        "partial" if any(x["state"]=="ok" for x in states) else "error")
    out=ROOT/"data";out.mkdir(exist_ok=True)
    payload={"schema_version":1,"checked_at":iso(now),"items":items}
    encoded=json.dumps(payload,ensure_ascii=False,separators=(",",":")).encode()
    if len(encoded)>120000:raise ValueError("bounded source mirror exceeded limit")
    (out/"analyst-source-items.json").write_bytes(encoded+b"\n")
    (out/"analyst-source-status.json").write_text(json.dumps(
        {"checked_at":iso(now),"state":state,"sources":states},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"state":state,"sources":states,"count":len(items)},ensure_ascii=False))
    if state=="error":raise SystemExit(1)

if __name__=="__main__":collect()
