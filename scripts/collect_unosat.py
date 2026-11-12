#!/usr/bin/env python3
"""Official UNOSAT ArcGIS public geospatial ANALYSIS layer catalogue.
GIS availability is not a new incident, a satellite capture date, or a damage claim.
"""
from __future__ import annotations
import json
import re
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/unosat-analysis.json"
STATUS=ROOT/"data/unosat-analysis-status.json"
ROOT_URL="https://unosatgis.cern.ch/rapidmapping/rest/services"
REGION_CODES={"IRN","PSE","ISR","SYR","LBN","IRQ","OMN","YEM","SAU","KWT","QAT","BHR","JOR","EGY","TUR","SDN"}
MAX_FOLDERS=12
MAX_LAYERS=24
MAX_BYTES=600000

def checked_time():
 return datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def get(url):
 u=urllib.parse.urlsplit(url)
 if u.scheme!="https" or u.hostname!="unosatgis.cern.ch" or not u.path.startswith("/rapidmapping/rest/services"):
  raise ValueError("UNOSAT API URL outside allowlist")
 req=urllib.request.Request(url,headers={"User-Agent":"RegionalWatch/1.0 (noncommercial public catalogue)","Accept":"application/json"})
 with urllib.request.urlopen(req,timeout=19) as r:
  final=urllib.parse.urlsplit(r.url)
  if final.scheme!="https" or final.hostname!=u.hostname or r.status!=200:
   raise ValueError("unexpected UNOSAT redirect/status")
  buf=r.read(MAX_BYTES+1)
  if len(buf)>MAX_BYTES:raise ValueError("UNOSAT response too large")
 obj=json.loads(buf)
 if not isinstance(obj,dict) or "error" in obj:raise ValueError("UNOSAT API error")
 return obj

def is_recent_region(folder):
 if not isinstance(folder,str):return False
 match=re.fullmatch(r"[A-Z]{2}(20\d{6})([A-Z]{3})",folder)
 return bool(match and match.group(2) in REGION_CODES and int(match.group(1)[:4])>=2024)

def collect(now=None,getter=get):
 now=now or checked_time()
 base=getter(ROOT_URL+"?f=pjson")
 if not isinstance(base.get("folders"),list) or len(base["folders"])>500:
  raise ValueError("invalid UNOSAT root catalogue schema")
 selected=sorted((x for x in base["folders"] if is_recent_region(x)),reverse=True)[:MAX_FOLDERS]
 results=[];errors=[];successful=0
 for folder in selected:
  try:
   listing=getter(ROOT_URL+"/"+folder+"?f=pjson")
   services=listing.get("services")
   if not isinstance(services,list) or len(services)>80:
    raise ValueError("invalid UNOSAT service listing")
   for service in services:
    if not isinstance(service,dict):continue
    name=service.get("name")
    if (not isinstance(name,str) or not name.startswith(folder+"/")
        or not re.fullmatch(r"[A-Za-z0-9_/-]{8,110}",name)
        or service.get("type") not in {"MapServer","FeatureServer"}):continue
    if not re.search(r"analysis|damage|assessment|flood|impact|extent",name,re.I):continue
    url=ROOT_URL+"/"+name+"/"+service["type"]
    results.append({
     "service_id":name+":"+service["type"],"event_folder":folder,"region_code":folder[-3:],
     "event_date_from_folder":folder[2:10],"map_service_url":url,
     "type":service["type"],"analysis_label":name.split("/")[-1].replace("_"," "),
     "method":"Official UNOSAT ArcGIS geospatial analysis service metadata",
     "date_caveat":"Folder code encodes event date; it is NOT a satellite acquisition date, analysis date or publication date",
     "verification":"Publication/service existence only; inspect GIS layer methods and data before using damage figures",
     "collected_at":now
    })
   successful+=1
  except (ValueError,KeyError,TimeoutError,urllib.error.URLError,OSError) as e:
   errors.append({"folder":folder,"type":type(e).__name__})
 results.sort(key=lambda x:(x["event_date_from_folder"],x["service_id"]),reverse=True)
 results=results[:MAX_LAYERS]
 state="error" if successful==0 else "partial" if errors or len(selected)==MAX_FOLDERS else "ok"
 snapshot={
  "schema_version":1,"source":"unosat_analysis","checked_at":now,"state":state,
  "products":results,"quality":{
   "folders_scanned":len(selected),"folders_successful":successful,
   "folder_total_region_candidates":sum(is_recent_region(x) for x in base["folders"]),
   "coverage":"Sample up to 12 most recent regional folders; catalog is not exhaustive",
   "meaning":"Official geospatial analysis layer availability; NOT new detected damage or activity"
  }
 }
 heartbeat={"source":"unosat_analysis","checked_at":now,"state":state,
            "products":len(results),"errors":errors[:12]}
 return snapshot,heartbeat

def main():
 try:
  snapshot,heartbeat=collect()
 except Exception as e:
  now=checked_time()
  snapshot={"schema_version":1,"source":"unosat_analysis","checked_at":now,"state":"error","products":[],"quality":{"error":"root_catalog_unavailable"}}
  heartbeat={"source":"unosat_analysis","checked_at":now,"state":"error","products":0,"errors":[{"type":type(e).__name__}]}
 OUT.parent.mkdir(parents=True,exist_ok=True)
 OUT.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 STATUS.write_text(json.dumps(heartbeat,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
 print(json.dumps(heartbeat,ensure_ascii=False))
 return 0 if heartbeat["state"]!="error" else 1

if __name__=="__main__":
 raise SystemExit(main())
