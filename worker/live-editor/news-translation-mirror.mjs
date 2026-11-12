// Free, self-hosted translation pipeline: Helsinki-NLP models on GitHub Actions.
// Public queue -> GitHub translation mirror -> validated D1 cache.
// No paid inference or credentials; no AI output is treated as a verified fact.
import {eventRows,hebrew,language} from './news-events.mjs';
import {fingerprint} from './localization.mjs';
import {factualTranslationIssue} from './translation-fact-guard.mjs';
const MIRROR='https://raw.githubusercontent.com/ArrakturIL/regional-osint-feeds/main/data/news-localization-mirror.json';
const HEADERS={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const respond=(obj,status=200)=>Response.json(obj,{status,headers:HEADERS});
const trunc=(s,len=400)=>String(s||'').trim().slice(0,len);
const hasRu=s=>/[\u0400-\u04ff]/u.test(String(s||''));
const hasHe=s=>/[\u0590-\u05ff]/u.test(String(s||''));
function numbers(s){
 const matches=String(s||'').match(/\d+(?:[,.]\d{3})*(?:\.\d+)?/g)||[];
 return matches.map(x=>x.replace(/(?<=\d)[,.](?=\d{3}(?:\D|$))/g,'')).sort();
}
export function validateCandidate(input,result,lang){
 const source=trunc(input,700),translated=trunc(result,900);
 if(!translated||translated.length<4||translated.length>Math.max(900,source.length*4))return false;
 if(lang==='he'&&!hasHe(translated))return false;
 if(lang==='ru'&&!hasRu(translated))return false;
 if(JSON.stringify(numbers(source))!==JSON.stringify(numbers(translated)))return false;
 if(/&(?:quot|amp|lt|gt);|(?:\.\s*){6,}/iu.test(translated))return false;
 if(/\bballistic\b|баллистическ/iu.test(source)){
  if(lang==='he'&&!/בליסט/iu.test(translated))return false;
  if(lang==='ru'&&!/баллист/iu.test(translated))return false;
 }
 if(/\bshared[\s\w-]{0,50}posts?\b/iu.test(source)){
  if(lang==='he'&&!/פוסטים|פרסומ|שיתפ/iu.test(translated))return false;
  if(lang==='ru'&&!/пост|публикац|делилс/iu.test(translated))return false;
 }
 if(/(?:\bKatz\b|Ка[цз])/iu.test(source)){
  if(lang==='he'&&!/כץ/.test(translated))return false;
  if(lang==='ru'&&!/Кац/.test(translated))return false;
 }
 if(/(?:\bIRGC\b|КСИР)/iu.test(source)){
  if(lang==='he'&&!/משמרות?\s+המהפכה|IRGC/iu.test(translated))return false;
  if(lang==='ru'&&!/КСИР|Корпус\s+страж/iu.test(translated))return false;
 }
 if(/(?:\bIDF\b|ЦАХАЛ)/iu.test(source)){
  if(lang==='he'&&!/צה[״"']?ל|צבא ההגנה|IDF/.test(translated))return false;
  if(lang==='ru'&&!/ЦАХАЛ|армии\s+Израил/iu.test(translated))return false;
 }
 if(/RAF\s+Fairford/iu.test(source)&&lang==='he'&&!/RAF|חיל האוויר המלכותי/.test(translated))return false;

 // Never replace Iran/Iranian with Jordan/Jordanian without source support.
 if(/\bIran(?:ian)?\b|Иран[\p{L}]*/iu.test(source)&&
    !/\bJordan(?:ian)?\b|Иордан[\p{L}]*/iu.test(source)&&
    (lang==='he'?/ירד(?:ן|נ[\p{L}]*)/iu:/Иордан[\p{L}]*/iu).test(translated))return false;
 // In a military report, "strike" never means a labour stoppage.
 if(/(?:\b(?:Israeli|IDF|Gaza|Hamas|military|air)\b.{0,90}\bstrike\b|\bstrike\b.{0,90}\b(?:Gaza|Hamas|hospital|killed|IDF)\b|(?:удар|авиаудар|обстрел)[\p{L}]*)/iu.test(source)&&
    (lang==='he'?/שבית[\p{L}]*/iu:/забастовк[\p{L}]*/iu).test(translated))return false;
 // Do not invert the responsibility/negation in highly consequential claims.
 if(/\bfully\s+responsible\b|\bfull\s+responsibility\b/iu.test(source)&&
    (lang==='he'?/(?:לא|אינו|אינה|אינם)\s+[^.]{0,35}(?:אחראי|אחריות|נושא)/iu:/(?:не\s+(?:нес[её]т|несёт|отвеча[\p{L}]*)\s+[^.]{0,35}ответствен|не\s+нес[её]т\s+полн[\p{L}]*\s+ответствен)/iu).test(translated))return false;

 return true;
}
export async function translationQueue(env,request){
 if(request.method!=='GET')return respond({error:'read_only'},405);
 const url=new URL(request.url),limitValue=url.searchParams.get('limit');
 if(limitValue!==null&&(!/^\d+$/.test(limitValue)||+limitValue<1||+limitValue>100))
  return respond({error:'invalid_limit'},400);
 const max=limitValue===null?80:Number(limitValue);
 const db=env.NEWS_DB,rows=await eventRows(db,200),items=[];
 for(const r of rows){
  if(items.length>=max)break;
  const sourceLanguage=language(r.source),origTitle=trunc(r.headline,260),origSummary=trunc(r.summary,450);
  const ruPending=!r.headline_ru;
  const nativeHebrew=sourceLanguage==='he'&&hasHe(origTitle);
  let hePending=!nativeHebrew;
  if(r.he_hash&&r.he_title){
   const content={title:trunc(r.headline_ru||r.headline,260),body:trunc(r.summary_ru||r.summary,650),comment:trunc(r.comment,300)};
   const sha=await fingerprint(content);
   if(sha===r.he_hash&&!factualTranslationIssue(content,{title:r.he_title,body:r.he_body,comment:r.he_comment}))hePending=false;
  }
  if(!ruPending&&!hePending)continue;
  items.push({id:r.id,event_id:r.event_id,source:r.source,source_language:sourceLanguage,
    original_title:origTitle,original_summary:origSummary,
    need_ru:ruPending,need_he:hePending,priority:r.event_priority});
 }
 return respond({schema_version:1,generated_at:new Date().toISOString(),items,count:items.length,source:'regional_watch_event_representatives'});
}
function okPair(original,part,lang){
 if(!part||typeof part!=='object')return false;
 if(!validateCandidate(original.original_title,part.title,lang))return false;
 if(original.original_summary){
  if(!validateCandidate(original.original_summary,part.summary,lang))return false;
 }
 return true;
}
export async function importTranslationMirror(env,now=Date.now()){
 let mirror;
 try{
  const q=MIRROR+'?bucket='+Math.floor(now/300000);
  const response=await fetch(q,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return{state:'source_unavailable',status:response.status};
  const body=await response.text();
  if(body.length>450000)return{state:'oversized'};
  mirror=JSON.parse(body);
 }catch(e){return{state:'fetch_error',error:String(e).slice(0,100)}}
 const timestamp=Date.parse(mirror?.generated_at);
 if(mirror?.schema_version!==1||!Array.isArray(mirror.items)||mirror.items.length>120||
    !Number.isFinite(timestamp)||timestamp>now+600000||timestamp<now-6*3600000)
  return{state:'invalid_or_stale'};
 const db=env.NEWS_DB;
 let ru=0,he=0,rejected=0,missing=0;
 for(const item of mirror.items){
  if(!item||typeof item.id!=='string'||!/^[a-f0-9]{24}$/.test(item.id))continue;
  const row=await db.prepare('SELECT id,headline,headline_ru,summary,summary_ru,comment FROM news_items WHERE id=?').bind(item.id).first();
  if(!row||row.headline!==item.original_title){missing++;continue}
  if(item.ru&&!row.headline_ru){
   if(okPair({original_title:row.headline,original_summary:row.summary},item.ru,'ru')){
    const q=await db.prepare('UPDATE news_items SET headline_ru=?,summary_ru=? WHERE id=? AND headline=? AND headline_ru IS NULL')
      .bind(trunc(item.ru.title,260),item.ru.summary?trunc(item.ru.summary,480):null,item.id,row.headline).run();
    if(q.meta?.changes){ru++;row.headline_ru=trunc(item.ru.title,260);row.summary_ru=item.ru.summary?trunc(item.ru.summary,480):null}
   }else rejected++;
  }
  if(item.he&&!hasHe(row.headline)){
   const base={title:trunc(row.headline_ru||row.headline,260),
    body:trunc(row.summary_ru||row.summary,650),comment:trunc(row.comment,300)};
   const translation={title:trunc(item.he.title,260),body:trunc(item.he.summary,650),comment:''};
   if(okPair({original_title:row.headline,original_summary:row.summary},item.he,'he')&&
     !factualTranslationIssue(base,translation)){
    const sha=await fingerprint(base);
    const q=await db.prepare('INSERT INTO regional_i18n(kind,item_id,language,source_hash,title,body,commentary,quality_score,model,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(kind,item_id,language) DO UPDATE SET source_hash=excluded.source_hash,title=excluded.title,body=excluded.body,commentary=excluded.commentary,quality_score=excluded.quality_score,model=excluded.model,created_at_ms=excluded.created_at_ms WHERE regional_i18n.source_hash!=excluded.source_hash')
     .bind('news',item.id,'he',sha,translation.title,translation.body,'',85,trunc(item.he.model||'Helsinki-NLP/Opus-MT',110),now).run();
    if(q.meta?.changes)he++;
   }else rejected++;
  }
 }
 const state={state:'ok',generated_at:mirror.generated_at,ru,he,rejected,missing,total:mirror.items.length};
 await db.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_open_source_translation',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms")
  .bind(JSON.stringify(state),now).run();
 return state;
}
