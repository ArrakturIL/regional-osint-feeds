#!/usr/bin/env python3
"""REGIONAL WATCH conservative event filter (shadow-mode engine).

No LLM may establish a fact or verify a claim. This engine groups *articles*,
not facts. It only merges events with matching action, precise anchors and time,
or unusually high same-language lexical evidence. Unclear cases stay separate.
Production publication needs separately approved contracts and QA.
"""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from urllib.parse import urlsplit, urlunsplit, urlencode, parse_qsl
import re
import unicodedata

ENGINE_VERSION="event-filter-shadow-v1"
WORD=re.compile(r"[^\W_]+",re.UNICODE)
STOP={
 "the","a","an","and","or","in","on","to","of","for","at","from","by","with","after","before",
 "report","reports","reported","says","said","as","is","are","was","were","be","its","his","her",
 "new","over","about","could","would","will","has","have","more","than","they","their",
 "של","על","את","עם","כי","לפי","היה","עוד","לא","בין","אחרי","לפני","גם",
 "من","في","على","عن","إلى","بعد","قبل","و","أن","هذه","هذا","مع","قال",
 "в","на","к","по","из","за","для","и","но","что","как","это","после","о","об"}
REGIONAL={
 "israel":r"\bisrael(?:i|is)?\b|ישראל|ישראלי|إسرائيل|اسرائيل|израил",
 "iran":r"\biran(?:ian|ians)?\b|איראן|ایران|إيران|ايران|иран",
 "gaza":r"\bgaza\b|עזה|غزة|газ[аеуы]",
 "lebanon":r"\blebanon\b|לבנון|لبنان|ливан",
 "syria":r"\bsyria(?:n)?\b|סוריה|سوريا|сири",
 "yemen":r"\byemen\b|תימן|اليمن|йемен",
 "jerusalem":r"\bjerusalem\b|ירושלים|القدس|иерусалим",
 "hormuz":r"\bhormuz\b|הורמוז|هرمز|ормуз",
 "hamas":r"\bhamas\b|חמאס|حماس|хамас",
 "hezbollah":r"\bhezbollah\b|חיזבאללה|حزب\s*الله|хезбол",
 "idf":r"\bIDF\b|צה[״\"']?ל|צבא ההגנה לישראל|цахал",
 "irgc":r"\bIRGC\b|\brevolutionary guards?\b|משמרות המהפכה|الحرس الثوري|ксир",
 "us":r"\b(?:US|USA|United States|American)\b|ארה[״\"']?ב|الولايات المتحدة|сша",
}
DETAIL={
 "nasser_hospital":r"\bnasser\s+hospital\b|\bnasser\b.{0,15}\bhospital\b|בית\s*החולים\s*נאסר|مستشفى\s*ناصر|больниц[аы]\s+нассер|нассер",
 "fairford":r"\bfairford\b|פיירפורד|فيرفورد|фэрфорд",
 "didamar":r"\bdidamar\b|דידמר|ديدمار|дидамар",
 "shifa_hospital":r"\b(?:al.?shifa|shifa)\s+hospital\b|בית\s*החולים\s*שיפא|مستشفى\s*الشفاء|аш.?шифа",
 "katz":r"\bkatz\b|כץ|кац",
 "vance":r"\bvance\b|ואנס|فانس|вэнс",
 "ghalibaf":r"\bghalibaf\b|קאליבאף|قاليباف|галибаф",
 "qassem":r"\bnaim qassem\b|נעים קאסם|نعيم قاسم|наим кас",
 "netanyahu":r"\bnetanyahu\b|נתניהו|نتنياهو|нетаньяху",
 "eisenkot":r"\beisenkot\b|איזנקוט|آيزنكوت|айзенкот",
 "khan_younis":r"\bkhan younis\b|\bkhan yunis\b|חאן\s*יונס|خان يونس|хан.?юн",
 "tehran":r"\btehran\b|טהראן|طهران|тегеран",
 "kuwait":r"\bkuwait\b|כווית|الكويت|кувейт",
}
ACTION={
 "strike":r"\b(?:strikes?|attack(?:ed|s)?|bomb(?:ed|ing)?|shell(?:ed|ing)?|airstrike|explosion|raid(?:ed)?)\b|תקיפ|הפצצ|פגיע|قصف|هجوم|غارة|ضربة|удар[а-я]*|атак[а-я]*|обстрел",
 "negotiation":r"\b(?:talks?|negotiat(?:e|ions|ing)|peace deal|ceasefire|mou|truce)\b|משא\s*ומתן|שיחות|הפסקת\s*אש|مفاوضات|محادثات|هدنة|переговор|перемири|прекращени[ея]\s+огня",
 "election":r"\b(?:election|votes?|coalition|caretaker government|cabinet)\b|בחירות|קואליצי|ממשלת מעבר|انتخابات|ائتلاف|выбор|коалици|правительств",
 "military":r"\b(?:ballistic|missiles?|rockets?|intercept(?:ed|ion)?|fighter jets?|deploy(?:ed|ment)?|air defense|naval|drone)\b|טילים|רקטות|יירוט|כטב.?ם|صواريخ|طائرات مسيرة|ракет|беспилотник|перехват|воен",
 "sanctions":r"\b(?:sanctions?|embargo|blacklist|tariffs?)\b|סנקציות|عقوبات|санкци",
 "statement":r"\b(?:says?|warns?|claims?|accuses?|statement|pledges?|announces?)\b|אמר|הזהיר|הודיע|אומר|صرح|قال|حذر|زعم|заявил|предупредил|объявил",
}
TOPIC_RANK={"strike":6,"military":5,"negotiation":4,"sanctions":4,"election":3,"statement":2,"other":0}
STRONG_VENUES={"nasser_hospital","fairford","didamar","shifa_hospital"}
PEOPLE={"katz","vance","ghalibaf","qassem","netanyahu","eisenkot"}
TRACKER=re.compile(r"^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl)$",re.I)
CLAIM_WORDS=re.compile(r"\b(?:report(?:ed|edly|s)?|alleg(?:ed|edly|ation)?|claims?|says?|sources?|according to|purported|unverified)\b|לטענת|לדברי|לפי|דווח|زعم|بحسب|وفق|сообща|предполож|по\s+данным",re.I)
PRIMARY_WORDS=re.compile(r"\b(?:ministry of defense|official government|court filing|IDF spokesperson|published by the IDF)\b",re.I)
AGENCIES={
 "reuters":re.compile(r"\breuters\b|רויטרס|رويترز|рейтерс",re.I),
 "ap":re.compile(r"\bassociated press\b|\bAP\s+(?:reports?|said|says)\b|أسوشيتد برس|асcошиэйтед пресс",re.I),
 "afp":re.compile(r"\bagence france.presse\b|\bAFP\b|فرانس برس",re.I)
}
HIGH_STAKES=("strike","military")
MAX_WINDOW_HOURS={"strike":18,"military":24,"negotiation":36,"sanctions":48,"election":48,
                  "statement":24,"other":18}

def normalize(text):
    text=unicodedata.normalize("NFKC",str(text or "")).casefold()
    # Strip Arabic niqqud/vocalization, not meaningful letters.
    text="".join(c for c in text if not unicodedata.combining(c))
    return " ".join(WORD.findall(text))

def tokens(text):
    return {s for s in normalize(text).split() if len(s)>2 and s not in STOP and not s.isdecimal()}

def matched(content,patterns):
    return {key for key,expr in patterns.items() if re.search(expr,content,re.I)}

def canon(url):
    if not isinstance(url,str) or len(url)>2048:return None
    try:u=urlsplit(url)
    except ValueError:return None
    if u.scheme!="https" or not u.hostname or u.username or u.password:return None
    qs=sorted((k,v) for k,v in parse_qsl(u.query,keep_blank_values=True)
              if not TRACKER.fullmatch(k))
    return urlunsplit(("https",u.netloc.lower(),u.path.rstrip("/") or "/",urlencode(qs),""))

def timestamp(v):
    if isinstance(v,datetime):dt=v
    else:
        if not isinstance(v,str):return None
        try:dt=datetime.fromisoformat(v.replace("Z","+00:00"))
        except ValueError:return None
    return dt.astimezone(timezone.utc) if dt.tzinfo else None

def agency_origin(row):
    owner=row.get("publisher") or row.get("source") or "unknown"
    if row.get("parent_agency"):return str(row["parent_agency"]).lower()
    # A cited agency is not independent new reporting from the republisher.
    evidence=str(row.get("summary") or "")
    for name,rx in AGENCIES.items():
        if rx.search(evidence):return name
    return owner

def analyze(row):
    title=str(row.get("headline") or row.get("title") or "")
    summary=str(row.get("summary") or "")
    whole=title+" "+summary
    ts=timestamp(row.get("published"))
    url=canon(row.get("canonical") or row.get("link") or row.get("url"))
    region=matched(whole,REGIONAL)
    details=matched(whole,DETAIL)
    actions=matched(title,ACTION) or matched(whole,ACTION)
    topic=next((t for t in ["strike","negotiation","election","military","sanctions","statement"] if t in actions),"other")
    kind=str(row.get("kind") or "news")
    reasons=[]
    if region or details:reasons.append("regional_evidence")
    if topic!="other":reasons.append("action_"+topic)
    if kind!="news":reasons.append("content_type_"+kind)
    if CLAIM_WORDS.search(whole):reasons.append("attributed_or_unverified_claim")
    if PRIMARY_WORDS.search(whole):reasons.append("source_mentions_primary_statement")
    pub=row.get("publisher") or row.get("source") or "unknown"
    rank=TOPIC_RANK[topic]
    if region.intersection(("israel","iran","idf","irgc","hamas","hezbollah")):rank+=2
    elif region:rank+=1
    if details.intersection(STRONG_VENUES):rank+=1
    if kind=="opinion":rank-=3
    if kind in ("sponsored","liveblog"):rank=0
    rank=max(0,min(10,rank))
    # "High" means editorial importance, not confirmed severity.
    policy="hold_irrelevant" if not region and not details else "hold_nonnews" if kind!="news" else "review" if rank<4 else "candidate"
    reasons.append("public_review_required")
    return {**row,"headline":title,"summary":summary,"canonical":url,"timestamp":ts,
            "publisher":pub,"origin":agency_origin(row),"region":region,"detail":details,
            "topic":topic,"tokens":tokens(title),"kind":kind,"score":rank,
            "selection_policy":policy,"reason_codes":reasons}

def similarity(a,b):
    common=a["tokens"]&b["tokens"];denom=len(a["tokens"]|b["tokens"])
    return len(common)/denom if denom else 0.0

def same_event(a,b):
    if a["canonical"] and a["canonical"]==b["canonical"]:return (True,"same_canonical_url")
    if not a["timestamp"] or not b["timestamp"]:return (False,"missing_publication_time")
    delta=abs((a["timestamp"]-b["timestamp"]).total_seconds())/3600
    if a["topic"]!=b["topic"]:return (False,"different_event_action")
    if delta>MAX_WINDOW_HOURS[a["topic"]]:return (False,"outside_event_time_window")
    if a["detail"]&STRONG_VENUES and b["detail"]&STRONG_VENUES and not (
        a["detail"]&b["detail"]&STRONG_VENUES):
        return (False,"conflicting_precise_venue")
    # Matching generic countries like Iran/Israel never proves same event.
    shared_venue=a["detail"]&b["detail"]&STRONG_VENUES
    if shared_venue and a["topic"] in ("strike","military"):
        return (True,"same_action_precise_venue_time")
    shared_person=a["detail"]&b["detail"]&PEOPLE
    if shared_person and a["region"]&b["region"] and similarity(a,b)>=0.26:
        return (True,"same_actor_context_time")
    if a["region"]&b["region"] and len(a["tokens"]&b["tokens"])>=4 and similarity(a,b)>=0.70:
        return (True,"very_high_headline_overlap")
    return (False,"insufficient_event_identity")

def can_add(item,cluster):
    verdicts=[same_event(item,other) for other in cluster]
    if verdicts and all(flag for flag,_ in verdicts):
        return (True,verdicts[0][1])
    return (False,next((reason for ok,reason in verdicts if not ok),"new_event"))

def cluster_articles(articles):
    analyzed=[analyze(row) for row in articles]
    eligible=[row for row in analyzed if row["selection_policy"]=="candidate"]
    held=[row for row in analyzed if row["selection_policy"]!="candidate"]
    # Fixed order makes the evaluation independent of threaded feed fetch order.
    ordered=sorted(eligible,key=lambda a:(a["timestamp"] or datetime.min.replace(tzinfo=timezone.utc),
                                            a["canonical"] or "",a["publisher"]))
    groups=[]
    for item in ordered:
        eligible_groups=[]
        for group in groups:
            yes,why=can_add(item,group["members"])
            if yes:eligible_groups.append((group,why))
        if eligible_groups:
            # Multiple ambiguous candidate groups are not merged transitively.
            if len(eligible_groups)>1:
                groups.append({"members":[item],"reasons":["ambiguous_multiple_clusters_held_separate"]})
            else:
                group,why=eligible_groups[0];group["members"].append(item)
                group["reasons"].append(why)
        else:
            groups.append({"members":[item],"reasons":["new_event"]})
    events=[]
    for group in groups:
        members=group["members"];publisher_ids={i["publisher"] for i in members}
        distinct_origins={i["origin"] for i in members}
        score=max(m["score"] for m in members)
        key="|".join(sorted(i["canonical"] or "" for i in members))
        event_id=sha256(key.encode("utf-8")).hexdigest()[:18]  # shadow ID, NOT a permanent public event_id
        reported=any("attributed_or_unverified_claim" in i["reason_codes"] for i in members)
        verification="multi_outlet_reporting" if len(distinct_origins)>1 else "single_origin_reporting"
        events.append({"shadow_id":event_id,"topic":members[0]["topic"],"score":score,
                       "priority":"high" if score>=8 else "medium" if score>=5 else "low",
                       "verification":verification,"contains_attribution":reported,
                       "publisher_count":len(publisher_ids),"reporting_origin_count":len(distinct_origins),
                       "publisher_ids":sorted(publisher_ids),"member_count":len(members),
                       "reason_codes":sorted(set(group["reasons"])),
                       "articles":members,"published":max(i["timestamp"] for i in members),
                       "public_release_allowed":False})
    events.sort(key=lambda e:(-e["score"],-e["published"].timestamp(),e["shadow_id"]))
    return events,held

def diversified(events,limit=12,per_owner=0.35):
    # Soft publisher diversity at ranking time; no hard fact/source quotas.
    if limit<1:return []
    out=[];deferred=[];counts=Counter()
    max_per_owner=max(2,int(limit*per_owner))
    for event in events:
        owners=event["publisher_ids"]
        if event["score"]>=9 or all(counts[p]<max_per_owner for p in owners):
            out.append(event)
            counts.update(owners)
        else:
            deferred.append(event)
        if len(out)>=limit:return out
    return (out+deferred)[:limit]

def report(articles):
    events,held=cluster_articles(articles)
    reason_count=Counter(code for e in events for code in e["reason_codes"])
    hold_count=Counter(r["selection_policy"] for r in held)
    type_count=Counter(e["topic"] for e in events)
    publication_count=sum(e["member_count"] for e in events)
    return {"engine_version":ENGINE_VERSION,"mode":"shadow_only_never_publish",
            "input_articles":len(articles),"candidate_articles":publication_count,
            "held_articles":len(held),"event_groups":len(events),
            "suppressed_duplicate_cards":max(0,publication_count-len(events)),
            "events_multi_publisher":sum(e["publisher_count"]>1 for e in events),
            "event_action_counts":dict(sorted(type_count.items())),
            "hold_reason_counts":dict(sorted(hold_count.items())),
            "merge_reason_counts":dict(sorted(reason_count.items())),
            "top_12_total_sources":sum(e["member_count"] for e in diversified(events)),
            "verification_notice":"Multiple outlets do not establish an independently confirmed claim.",
            "public_release_allowed":False}
