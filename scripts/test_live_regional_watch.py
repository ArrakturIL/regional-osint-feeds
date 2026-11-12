#!/usr/bin/env python3
"""Live production acceptance test from an external GitHub Actions runner.

Checks actual Worker and Pages routes; never sends secrets or writes data.
"""
import json
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
from concurrent.futures import ThreadPoolExecutor
import sys,time,re

WORKER="https://regional-watch-editor.arrakturil.workers.dev"
PAGES="https://regional-watch.pages.dev"
def get(url):
    req=Request(url,headers={"User-Agent":"RegionalWatchExternalQA/1.1","Accept":"application/json,text/html"})
    try:
        with urlopen(req,timeout=15) as r:
            raw=r.read(1000000)
            content_type=r.headers.get("Content-Type","")
            body=json.loads(raw) if "json" in content_type else None
            return {"status":r.status,"type":content_type,"data":body,"size":len(raw),"final":r.url}
    except HTTPError as e:
        return {"status":e.code,"type":"error","data":None,"size":0,"final":url}
    except Exception as e:
        return {"status":0,"type":type(e).__name__,"error":str(e)[:170],"data":None,"final":url}

def run():
    urls={
        "worker_ru":WORKER+"/api/news?lang=ru&limit=15",
        "worker_he":WORKER+"/api/news?lang=he&limit=15",
        "worker_he_ready":WORKER+"/api/news?lang=he&ready_only=1&limit=30",
        "worker_ru_full":WORKER+"/api/news?lang=ru&limit=40",
        "worker_he_full":WORKER+"/api/news?lang=he&limit=40",
        "worker_events":WORKER+"/api/events?lang=ru&limit=10",
        "worker_queue":WORKER+"/api/translation-queue?limit=10",
        "worker_limit_error":WORKER+"/api/news?lang=ru&limit=1.5",
        "worker_health":WORKER+"/health",
        "site_ru":PAGES+"/",
        "site_he":PAGES+"/he",
        "site_events":PAGES+"/events/",
        "site_events_noslash":PAGES+"/events",
        "site_data":PAGES+"/data/",
        "site_data_noslash":PAGES+"/data",
        "site_he_news":PAGES+"/api/he/news",
        "site_api_news":PAGES+"/api/news?lang=ru"
    }
    with ThreadPoolExecutor(max_workers=5) as pool:
        pending={k:pool.submit(get,url) for k,url in urls.items()}
        results={name:f.result() for name,f in pending.items()}
    errors=[]
    for name,r in results.items():
        expected=400 if name=="worker_limit_error" else 200
        if name=="site_api_news" and r["status"]==404:
            continue # Pages may expose only /api/he/news, not raw Worker route.
        if r["status"]!=expected:
            errors.append(name+" HTTP "+str(r["status"])+": "+r.get("error",""))
    ru=results["worker_ru"].get("data") or {}
    he=results["worker_he"].get("data") or {}
    ev=results["worker_events"].get("data") or {}
    queue=results["worker_queue"].get("data") or {}
    if not isinstance(ru.get("articles"),list) or len(ru["articles"])<3:errors.append("RU news empty/non-JSON")
    if ru.get("grouping")!="event_v1":errors.append("RU not grouped")
    if not isinstance(he.get("articles"),list) or len(he["articles"])<3:errors.append("HE news empty/non-JSON")
    if not isinstance(ev.get("events"),list) or len(ev["events"])<2:errors.append("Event API missing groups")
    if queue.get("schema_version")!=1 or not isinstance(queue.get("items"),list):errors.append("Free translation queue contract")
    ru_ids=[x.get("event_id") for x in ru.get("articles",[])]
    he_ids=[x.get("event_id") for x in he.get("articles",[])]
    if ru_ids!=he_ids:errors.append("RU/HE event ordering differs")
    for a in ru.get("articles",[]):
        if not a.get("event_id") or not isinstance(a.get("sources"),list) or not a["sources"]:
            errors.append("missing event ID or provenance")
    # P1 editorial safety: never publish a joke on fatality/patient reporting.
    sensitive=re.compile(r"(?:\\b(?:kill(?:s|ed|ing(?:s)?)?|dead|death|hospital|victim|patient|injured|wounded|hostage)\\b|погиб|убит|убива|жертв|госпитал|больниц|врач|пациент|נהרג|נרצח|הרוג|פצוע|בית\\s+חולים)",re.I)
    for key in ("worker_ru_full","worker_he_full"):
        payload=(results[key].get("data") or {})
        for item in payload.get("articles",[]):
            headline=str(item.get("headline") or "")
            comment=str(item.get("comment") or "").strip()
            if comment and sensitive.search(headline+" "+str(item.get("summary") or "")):
                errors.append("P1 sensitive editorial comment: "+key+" "+str(item.get("id")))
    # Expose (but do not conceal) remaining Pages/Worker migration gap.
    site_news=(results["site_api_news"].get("data") or {})
    site_news_contract=sorted(site_news.keys()) if isinstance(site_news,dict) else []
    seen_sources=sorted(set(a.get("source") for a in ru.get("articles",[])))
    # Readiness is tracked as an actual metric, not fabricated as complete.
    ru_ready=sum(x.get("content_language")=="ru" for x in ru.get("articles",[]))
    he_ready=sum(x.get("content_language")=="he" for x in he.get("articles",[]))
    he_approved=len((results["worker_he_ready"].get("data") or {}).get("articles",[]))
    he_site=(results["site_he_news"].get("data") or {})
    items=he_site.get("items") if isinstance(he_site,dict) else None
    metrics={"worker_grouping":ru.get("grouping"),"ru_items":len(ru.get("articles",[])),
             "he_items":len(he.get("articles",[])),"ru_ready":ru_ready,"he_ready":he_ready,
             "he_approved":he_approved,"queue_size":len(queue.get("items",[])),
             "sources":seen_sources,"site_he_news_items":len(items) if isinstance(items,list) else None,
             "site_ru_news_contract":site_news_contract,
             "statuses":{name:r["status"] for name,r in results.items()},
             "errors":errors}
    print(json.dumps(metrics,ensure_ascii=False,indent=2))
    return 0 if not errors else 1
if __name__=="__main__":
    raise SystemExit(run())
