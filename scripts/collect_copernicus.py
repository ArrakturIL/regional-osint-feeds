#!/usr/bin/env python3
"""Public Copernicus EMS *analysis product metadata* mirror for Cloudflare D1.
No imagery processing, credentials, private endpoints, or military incident inference.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import re
import urllib.request
import urllib.parse
import urllib.error

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/copernicus-analyses.json"
HEALTH=ROOT/"data/copernicus-analyses-status.json"
SOURCES={
 "unified":"https://mapping.emergency.copernicus.eu/activations/api/activations/",
 "rapid":"https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/",
 "recovery":"https://riskandrecovery.emergency.copernicus.eu/api/public-activations/",
}
# Exact official country names and explicitly enumerated variants; never substring-match.
# E.g. 'Oman' inside 'Romania' is a dangerous false positive.
COUNTRIES=frozenset({
 "israel","iran","islamic republic of iran","iran (islamic republic of)",
 "iraq","syria","syrian arab republic","lebanon","jordan","oman","yemen",
 "saudi arabia","kuwait","qatar","bahrain","united arab emirates",
 "palestine","state of palestine","palestinian territory","occupied palestinian territory",
 "occupied palestinian territories","palestinian territories",
 "egypt","turkey","türkiye","republic of türkiye","cyprus","sudan"
})
MAX_RESULT=30
MAX_FETCH_BYTES=1_000_000
# Bounded pages; unified service covers both Rapid and Risk/Recovery sources.
MAX_PAGES={'unified':7,'rapid':2,'recovery':5}
PAGE_SIZES={'unified':100,'rapid':100,'recovery':10}

def iso_now():
 return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def get_json(url):
 u=urllib.parse.urlsplit(url)
 if u.scheme!="https" or u.hostname not in {
  "mapping.emergency.copernicus.eu",
  "rapidmapping.emergency.copernicus.eu",
  "riskandrecovery.emergency.copernicus.eu"
 }: raise ValueError("CEMS URL outside allowlist")
 req=urllib.request.Request(url,headers={"User-Agent":"RegionalWatch/1.0 public noncommercial analysis metadata","Accept":"application/json"})
 with urllib.request.urlopen(req,timeout=22) as res:
  final=urllib.parse.urlsplit(res.url)
  if res.status!=200 or final.scheme!="https" or final.hostname!=u.hostname:
   raise ValueError("CEMS unexpected redirect or HTTP status")
  raw=res.read(MAX_FETCH_BYTES+1)
  if len(raw)>MAX_FETCH_BYTES:raise ValueError("CEMS response too large")
 return json.loads(raw)

def country_names(raw):
 out=[]
 for x in raw if isinstance(raw,list) else []:
  name=x if isinstance(x,str) else x.get("short_name",x.get("name","")) if isinstance(x,dict) else ""
  if isinstance(name,str) and name.strip():out.append(name.strip()[:80])
 return out

def relevant(names):
 return any(isinstance(name,str) and name.strip().casefold() in COUNTRIES for name in names)

def safe_url(url):
 if not isinstance(url,str):return None
 p=urllib.parse.urlsplit(url)
 return url[:500] if p.scheme=="https" and p.hostname and (p.hostname.endswith(".copernicus.eu") or p.hostname=="mapping.emergency.copernicus.eu") else None

def as_product(row,origin,now,cutoff):
 if not isinstance(row,dict):return None
 code=row.get("code")
 if not isinstance(code,str) or not re.fullmatch(r"EMS[RN]\d{3,5}",code):return None
 countries=country_names(row.get("countries"))
 if not relevant(countries):return None
 moment=row.get("activationTime") or row.get("eventTime") or row.get("lastUpdate") or ""
 try:
  stamp=datetime.fromisoformat(str(moment).replace("Z","+00:00"))
  if stamp.tzinfo is None:stamp=stamp.replace(tzinfo=timezone.utc)
  if stamp<cutoff:return None
 except (TypeError,ValueError):return None
 title=row.get("name")
 if not isinstance(title,str) or not title.strip():return None
 category=row.get("category") or ""
 if isinstance(category,dict):category=category.get("name","")
 phase=row.get("drmPhase") or ("response" if code.startswith("EMSR") else "recovery")
 return {"code":code,"title":title.strip()[:250],"countries":countries[:12],
         "category":str(category)[:90],"phase":str(phase)[:50],
         "activation_at":str(moment)[:40],"last_update":str(row.get("lastUpdate") or "")[:40],
         "product_count":row.get("n_products") if isinstance(row.get("n_products"),int) else None,
         "aoi_count":row.get("n_aois") if isinstance(row.get("n_aois"),int) else None,
         "closed":bool(row.get("closed",False)),
         "source_url":"https://mapping.emergency.copernicus.eu/activations/api/activations/"+code+"/",
         "report_url":safe_url(row.get("reportLink")),
         "source_api":origin,"evidence_type":"official_activation_metadata_not_damage_confirmation",
         "collected_at":now}

def collect(now=None,getter=get_json):
 now=now or iso_now()
 cutoff=datetime.fromisoformat(now.replace("Z","+00:00"))-timedelta(days=900)
 records={};errors=[];successful=0;pages={}
 for label,base in SOURCES.items():
  found=0
  try:
   last=None;scanned=0;fully_scanned=False;recent_scanned=0
   for page in range(MAX_PAGES[label]):
    payload=getter(base+"?limit="+str(PAGE_SIZES[label])+"&offset="+str(page*PAGE_SIZES[label]))
    if not isinstance(payload,dict) or not isinstance(payload.get("results"),list):
     raise ValueError("CEMS unexpected listing schema")
    rows=payload["results"]
    if page==0:
     last=payload
     # Field names are public schema metadata, useful for diagnosing upstream API drift.
     pages[label]={"returned":0,"total":payload.get("count"),"pages_fetched":0,
                   "sample_fields":sorted(rows[0].keys())[:30] if rows and isinstance(rows[0],dict) else []}
    pages[label]["returned"]+=len(rows)
    pages[label]["pages_fetched"]+=1
    scanned+=len(rows)
    for row in rows:
     item=as_product(row,label,now,cutoff)
     if not item:continue
     recent_scanned+=1
     old=records.get(item["code"])
     if old is None or (item["product_count"] or 0)>(old["product_count"] or 0):
      records[item["code"]]=item
     found+=1
    if not rows or not payload.get("next") or (isinstance(payload.get("count"),int) and scanned>=payload["count"]):
     fully_scanned=True;break
   pages[label]["matched_region"]=recent_scanned
   pages[label]["truncated"]=not fully_scanned
   successful+=1
  except (ValueError,KeyError,TimeoutError,urllib.error.URLError,OSError) as e:
   errors.append({"provider":label,"type":type(e).__name__,
                  "reason":str(e)[:120] if isinstance(e,ValueError) else "upstream_request_error"})
 products=sorted(records.values(),key=lambda x:x["activation_at"],reverse=True)[:MAX_RESULT]
 state="error" if successful==0 else "partial" if errors or any(v["truncated"] for v in pages.values()) else "ok"
 return {"schema_version":1,"source":"copernicus_ems","checked_at":now,"state":state,
         "products":products,"pages":pages,"quality":{
           "scope":"Bounded first pages: 7 unified, 2 Rapid, 5 smaller Recovery pages (past 900 days); partial if not exhaustive",
           "ready_made_analysis":"Product count identifies published products; metadata alone cannot establish damage",
           "sources_successful":successful,"sources_failed":len(errors)}}, {
           "source":"copernicus_ems","checked_at":now,"state":state,
           "error_types":errors,"total_matching":len(records),"published":len(products)}

def main():
 data,status=collect()
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 HEALTH.write_text(json.dumps(status,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps(status,ensure_ascii=False))
 return 1 if status["state"]=="error" else 0

if __name__=="__main__":
 raise SystemExit(main())
