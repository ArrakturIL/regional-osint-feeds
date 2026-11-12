#!/usr/bin/env python3
"""Free REGIONAL WATCH translations, Helsinki-NLP Marian on GitHub Actions CPU.
No paid APIs. Only RSS title/brief excerpts; no full articles, no AI fact claims.
"""
from __future__ import annotations
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import json
import os
import re
import sys
import time

QUEUE="https://regional-watch-editor.arrakturil.workers.dev/api/translation-queue?limit=80"
OUTPUT="data/news-localization-mirror.json"
MODELS={
 ("en","ru"):"Helsinki-NLP/opus-mt-en-ru",
 ("he","ru"):"Helsinki-NLP/opus-mt-he-ru",
 ("en","he"):"Helsinki-NLP/opus-mt-en-he",
}
HEBREW=re.compile("[\u0590-\u05ff]")
CYRILLIC=re.compile("[\u0400-\u04ff]")
NUMBER=re.compile(r"\d+(?:[,.]\d{3})*(?:\.\d+)?")

def numbers(s):
    return sorted(re.sub(r"(?<=\d)[,.](?=\d{3}(?:\D|$))","",n)
                  for n in NUMBER.findall(str(s or "")))

def valid(source,target,lang):
    if not isinstance(target,str) or len(target.strip())<4 or len(target)>900:
        return False
    if lang=="ru" and not CYRILLIC.search(target):return False
    if lang=="he" and not HEBREW.search(target):return False
    if numbers(source)!=numbers(target):return False
    if re.search(r"&(?:quot|amp|lt|gt);|(?:\.\s*){6,}",target,re.I):return False
    if re.search(r"\bballistic\b|баллистическ",source,re.I):
        if lang=="he" and "בליסט" not in target:return False
        if lang=="ru" and "баллист" not in target.lower():return False
    if re.search(r"\bshared[\s\w-]{0,50}posts?\b",source,re.I):
        if lang=="he" and not re.search(r"פוסטים|פרסומ|שיתפ",target):return False
        if lang=="ru" and not re.search(r"пост|публикац|делилс",target,re.I):return False
    if re.search(r"\bKatz\b|Кац",source,re.I):
        if lang=="he" and "כץ" not in target:return False
        if lang=="ru" and "Кац" not in target:return False
    if re.search(r"\bIRGC\b|КСИР",source,re.I):
        if lang=="he" and not re.search(r"משמרות?\s+המהפכה|IRGC",target):return False
        if lang=="ru" and not re.search(r"КСИР|Корпус\s+страж",target,re.I):return False
    if re.search(r"\bIDF\b|ЦАХАЛ",source,re.I):
        if lang=="he" and not re.search(r'צה[״"\']?ל|צבא ההגנה|IDF',target):return False
        if lang=="ru" and not re.search(r"ЦАХАЛ|армии\s+Израил",target,re.I):return False
    # Known production semantic failures: entity swap, military false friend,
    # and reversal of responsibility. Conservative rejection, not translation.
    if re.search(r"\bIran(?:ian)?\b|Иран\w*",source,re.I) and \
            not re.search(r"\bJordan(?:ian)?\b|Иордан\w*",source,re.I):
        if re.search(r"ירד(?:ן|נ\w*)",target) if lang=="he" else re.search(r"Иордан\w*",target,re.I):
            return False
    if re.search(r"(?:\b(?:Israeli|IDF|Gaza|Hamas|military|air)\b.{0,90}\bstrike\b|\bstrike\b.{0,90}\b(?:Gaza|Hamas|hospital|killed|IDF)\b|(?:удар|авиаудар|обстрел)\w*)",source,re.I):
        if re.search(r"שבית\w*",target) if lang=="he" else re.search(r"забастовк\w*",target,re.I):
            return False
    if re.search(r"\bfully\s+responsible\b|\bfull\s+responsibility\b",source,re.I):
        if lang=="he" and re.search(r"(?:לא|אינו|אינה|אינם)\s+[^.]{0,35}(?:אחראי|אחריות|נושא)",target):
            return False
        if lang=="ru" and re.search(r"не\s+(?:нес[её]т|отвеча\w*)\s+[^.]{0,35}ответствен",target,re.I):
            return False
    return True

def read_queue():
    for attempt in range(3):
        try:
            with urlopen(Request(QUEUE,headers={"Accept":"application/json","User-Agent":"RegionalWatch-OpenSource-Translator/1.0"}),timeout=25) as r:
                data=json.loads(r.read(250000))
            if data.get("schema_version")!=1 or not isinstance(data.get("items"),list):raise ValueError("queue schema mismatch")
            if len(data["items"])>100:raise ValueError("queue exceeds safety bound")
            return data
        except Exception:
            if attempt==2:raise
            time.sleep((attempt+1)*3)
    raise RuntimeError("unreachable")

def translate(texts,model_name):
    if not texts:return []
    import torch
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    torch.set_num_threads(2)
    tok=AutoTokenizer.from_pretrained(model_name)
    model=AutoModelForSeq2SeqLM.from_pretrained(model_name)
    model.eval()
    result=[]
    for i in range(0,len(texts),8):
        batch=texts[i:i+8]
        inputs=tok(batch,return_tensors="pt",padding=True,truncation=True,max_length=220)
        with torch.inference_mode():
            outputs=model.generate(**inputs,num_beams=3,do_sample=False,max_new_tokens=190)
        result.extend(tok.batch_decode(outputs,skip_special_tokens=True))
    del model,tok
    return result

def plan_jobs(items):
    tasks={}
    for item in items:
        if not isinstance(item,dict) or not isinstance(item.get("id"),str):continue
        src=item.get("source_language")
        if src not in ("en","he"):continue
        for lang in ("ru","he"):
            if not item.get("need_"+lang) or src==lang or (src,lang) not in MODELS:continue
            k=(src,lang)
            tasks.setdefault(k,[]).append(item)
    return tasks

def build_mirror(queue,translator=translate):
    items=queue["items"]
    mapped={item["id"]:{
        "id":item["id"],"original_title":item["original_title"],
        "source_language":item["source_language"],"source":item["source"]
    } for item in items if item.get("original_title") and item.get("id")}
    quality={"accepted":0,"rejected":0,"model_tasks":{}}
    for key,group in plan_jobs(items).items():
        src_lang,target=key
        model_name=MODELS[key]
        strings=[]
        for item in group:
            strings.append(item["original_title"])
            strings.append(item.get("original_summary") or "")
        indexes=[i for i,s in enumerate(strings) if s]
        nonempty=[strings[i] for i in indexes]
        translated=translator(nonempty,model_name)
        if len(translated)!=len(nonempty):raise RuntimeError("model outputs do not match inputs")
        outputs=[""]*len(strings)
        for i,value in zip(indexes,translated):outputs[i]=value.strip()
        for n,item in enumerate(group):
            title,summary=outputs[n*2:n*2+2]
            orig_title=item["original_title"]
            orig_summary=item.get("original_summary") or ""
            if valid(orig_title,title,target) and (not orig_summary or valid(orig_summary,summary,target)):
                mapped[item["id"]][target]={"title":title[:260],"summary":summary[:480],"model":model_name}
                quality["accepted"]+=1
            else:quality["rejected"]+=1
        quality["model_tasks"][model_name]=len(group)
    accepted=[m for m in mapped.values() if m.get("ru") or m.get("he")]
    return{
        "schema_version":1,"generated_at":datetime.now(timezone.utc).isoformat(),
        "source":"Helsinki-NLP/Opus-MT via GitHub Actions CPU (Apache-2.0)",
        "items":accepted[:120],"quality":quality
    }

def main():
    queue=read_queue()
    print("Queue loaded:",len(queue["items"]),"news event representatives")
    result=build_mirror(queue)
    if not result["items"]:
        print("No safe translations accepted: existing mirror remains unchanged")
        return 0
    os.makedirs("data",exist_ok=True)
    with open(OUTPUT,"w",encoding="utf-8") as f:
        json.dump(result,f,ensure_ascii=False,indent=2);f.write("\n")
    print("Mirror output:",json.dumps(result["quality"],ensure_ascii=False))
    return 0

if __name__=="__main__":
    try:raise SystemExit(main())
    except Exception as exc:
        print("Open-source translator failed:",type(exc).__name__,str(exc)[:450],file=sys.stderr)
        raise
