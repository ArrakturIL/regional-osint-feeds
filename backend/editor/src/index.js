import {enrichNewMonitorStories} from './stories/enrichment.mjs';
import analystService from './analysts/editor.mjs';
import localization from './localization/localization.mjs';
import {FEEDS as EVENT_FEEDS,reconcile} from './news/events.mjs';
import {readNewsEvents} from './news/api.mjs';
import {translationQueue,importTranslationMirror,validateCandidate} from './translations/news-mirror.mjs';
import {shouldSuppressComment} from './editorial/comment-policy.mjs';
import {canonicalNewsUrl,normalizedHeadline,articlePriority} from './news/normalization.mjs';
import {load} from './news/rss.mjs';

const FEEDS=EVENT_FEEDS.map(x=>[x[0],x[1],x[4],x[3]]);
const REGION=/iran|israel|israeli|hezbollah|lebanon|gaza|hamas|syria|syrian|yemen|houthi|red sea|middle east|iraq|idf|centcom|hormuz|netanyahu|tehran|jerusalem|tel aviv|persian gulf|khamenei|trump.*(iran|israel)/i;
// High-impact headline terms are token-boundary checked in news-normalization.mjs.
async function digest(s){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(h)].slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function writeComment(env,row){
 const title=String(row.headline_ru||row.headline||"").trim();
 const summary=String(row.summary_ru||row.summary||"").trim();
 const combined=title+" "+summary;
 if(shouldSuppressComment(row))return {comment:null,skip:true,neurons:0};
 const system="Ты ироничный редактор русскоязычного ближневосточного новостного издания. Дай одну короткую, острую и умную реплику к новости, максимум 200 символов и не более двух предложений. Цинизм, сарказм и сухой юмор допустимы в адрес политиков, чиновников, бюрократии, дипломатии и политического пиара. Укол должен быть точным и связанным с конкретным фактом из заголовка или RSS-аннотации. Никаких повторов заголовка другими словами, банальных выводов, общих размышлений, дежурного 'это не означает угрозы', морализаторства и самовосхваления. Не выдумывай мотиваций, причин, цифр, цитат или подтверждений. Не изображай судебные обвинения доказанной виной. Категорически не шути над погибшими, пострадавшими, заложниками, врачами, пациентами, мирными жителями, гуманитарными трагедиями. Если можно только повторить новость или юмор окажется натужным — верни пустой comment. Верни только JSON {\"comment\":\"...\"}.";
 const request={messages:[{role:"system",content:system},{role:"user",content:"Источник: "+row.source+"\nЗаголовок: "+title+"\nАннотация: "+summary}],temperature:.7,max_tokens:240};
 const answer=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",request);
 const content=String(answer?.choices?.[0]?.message?.content||(typeof answer?.response==="string"?answer.response:"")).trim();
 const match=content.match(/\{[\s\S]*\}/);
 if(!match)throw Error("No commentary JSON");
 const parsed=JSON.parse(match[0]);
 const comment=String(parsed?.comment||"").trim();
 if(shouldSuppressComment(row)||shouldSuppressComment({headline:comment})||comment.length<35||comment.length>300||/^(\s*(похоже|интересно|это ещё|по сообщениям|важно|стоит отметить))/i.test(comment))return {comment:null,skip:true,neurons:Number(answer?.usage?.neurons)||undefined};
 return {comment:comment.slice(0,220),skip:false,neurons:Number(answer?.usage?.neurons)||undefined};
}

async function translateTitles(env,now){
 const day=new Date(now).toISOString().slice(0,10);
 try{
  await env.NEWS_DB.prepare("INSERT OR IGNORE INTO news_translation_budget(day_utc,batches,estimated_neurons,updated_ms) VALUES(?,0,0,?)").bind(day,now).run();
  const budget=await env.NEWS_DB.prepare("SELECT batches,estimated_neurons FROM news_translation_budget WHERE day_utc=?").bind(day).first();
  if((budget?.batches||0)>=20||(budget?.estimated_neurons||0)>=2500)return {translated:0,summaries:0,budget:"limit"};
  const query="SELECT id,headline,summary,headline_ru FROM news_items WHERE priority>=7 AND published_ms>? AND (headline_ru IS NULL OR (summary_ru IS NULL AND length(summary)>10)) ORDER BY published_ms DESC LIMIT 22";
  const rows=(await env.NEWS_DB.prepare(query).bind(now-36*3600000).all()).results||[];
  const pending=rows.filter(x=>!/sponsored content|winner cup|euroleague|fashion week|maccabi wins|hapoel tel aviv set to secure/i.test(x.headline)).slice(0,5);
  if(!pending.length)return {translated:0,summaries:0};
  await env.NEWS_DB.prepare("UPDATE news_translation_budget SET batches=batches+1,estimated_neurons=estimated_neurons+125,updated_ms=? WHERE day_utc=?").bind(now,day).run();
  const system="Ты опытный русскоязычный редактор-переводчик. Переведи каждый английский или ивритский заголовок и короткую RSS-аннотацию на естественный, грамотный русский. Сохраняй все факты, числа, даты, имена, источники утверждений и вопросительные формы. Не превращай подозрения или заявления в доказанные факты, не добавляй ничего своего. Формат ответа: строго валидный JSON-массив объектов вида [{\"id\":\"исходный id\",\"title_ru\":\"русский заголовок\",\"summary_ru\":\"русская аннотация\"}]. Для каждого переданного id ровно один объект. Никаких пояснений, markdown или текста вне JSON. Rezaei — Резаи, Bessent — Бессент, Netanyahu — Нетаньяху, IRGC — КСИР, IDF — ЦАХАЛ.";
  const payload=pending.map(x=>({id:x.id,headline:x.headline,summary:x.summary||""}));
  const out=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(payload)}],temperature:0.1,max_tokens:1900});
  const content=String(out?.choices?.[0]?.message?.content||(typeof out?.response==="string"?out.response:"")).trim();
  let decoded;try{decoded=JSON.parse(content)}catch(e){const fragment=content.match(/\[[\s\S]*\]/)||content.match(/\{[\s\S]*\}/);if(!fragment)throw Error("Translation response not JSON");decoded=JSON.parse(fragment[0]);}
  const map=new Map();
  if(Array.isArray(decoded)){for(const item of decoded){if(item&&typeof item.id==="string")map.set(item.id,item);}}
  else if(decoded&&typeof decoded==="object"){for(const [id,item] of Object.entries(decoded))map.set(id,typeof item==="string"?{title_ru:item}:item);}
  let translated=0,summaries=0;
  const valid=x=>typeof x==="string"&&x.trim().length>=9&&x.length<=550&&/[А-Яа-яЁё]/.test(x)&&!/[<>]/.test(x);
  for(const row of pending){
   const value=map.get(row.id);if(!value||typeof value!=="object")continue;
   const title=valid(value.title_ru)&&validateCandidate(row.headline,value.title_ru,'ru')?value.title_ru.trim().slice(0,260):null;
   const summary=Boolean(row.summary)&&valid(value.summary_ru)&&validateCandidate(row.summary,value.summary_ru,'ru')?value.summary_ru.trim().slice(0,480):null;
   if(!title&&!row.headline_ru)continue;
   if(!title&&!summary)continue;
   const write=await env.NEWS_DB.prepare("UPDATE news_items SET headline_ru=COALESCE(headline_ru,?),summary_ru=COALESCE(summary_ru,?) WHERE id=?").bind(title,summary,row.id).run();
   if(write.meta?.changes){if(title&&!row.headline_ru)translated++;if(summary)summaries++;}
  }
  const actual=Number(out?.usage?.neurons);
  if(Number.isFinite(actual)&&actual>0)await env.NEWS_DB.prepare("UPDATE news_translation_budget SET estimated_neurons=MAX(0,estimated_neurons+?),updated_ms=? WHERE day_utc=?").bind(actual-125,Date.now(),day).run();
  return {translated,summaries,neurons:Number.isFinite(actual)?actual:null};
 }catch(e){
  await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_translation_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(String(e).slice(0,380),Date.now()).run();
  return {translated:0,summaries:0,error:true};
 }
}

async function translateIDF(env,now){
 const day=new Date(now).toISOString().slice(0,10);
 try{
  if(!env.CORE_DB)return {translated:0,error:"core database binding missing"};
  await env.NEWS_DB.prepare("INSERT OR IGNORE INTO official_translation_budget(day_utc,batches,estimated_neurons,updated_ms) VALUES(?,0,0,?)").bind(day,now).run();
  const budget=await env.NEWS_DB.prepare("SELECT batches,estimated_neurons FROM official_translation_budget WHERE day_utc=?").bind(day).first();
  if((budget?.batches||0)>=12||(budget?.estimated_neurons||0)>=1500)return {translated:0,budget:"limit"};
  const rows=(await env.CORE_DB.prepare("SELECT payload FROM observations WHERE source='idf_official' ORDER BY json_extract(payload,'$.published_at') DESC LIMIT 24").all()).results||[];
  const possible=[];
  for(const item of rows){
   let p;try{p=JSON.parse(item.payload)}catch{continue}
   const url=String(p.url||""),title=String(p.title||""),excerpt=String(p.excerpt||title);
   if(!/^https:\/\/t\.me\/idfofficial\/\d+$/.test(url))continue;
   if(excerpt.length<55||/^\s*(?:https?:\/\/|Attached are photos)/i.test(excerpt))continue;
   const published=Date.parse(p.published_at);
   if(!Number.isFinite(published)||published<now-14*86400000)continue;
   possible.push({url,title:title.slice(0,220).replace(/&#39;/g,"'").replace(/&quot;/g,'"'),excerpt:excerpt.slice(0,460).replace(/&#39;/g,"'").replace(/&quot;/g,'"'),published});
  }
  const candidates=[];
  for(const item of possible){
   const exists=await env.NEWS_DB.prepare("SELECT url FROM official_translations WHERE url=?").bind(item.url).first();
   if(!exists)candidates.push(item);
   if(candidates.length>=3)break;
  }
  if(!candidates.length)return {translated:0};
  await env.NEWS_DB.prepare("UPDATE official_translation_budget SET batches=batches+1,estimated_neurons=estimated_neurons+125,updated_ms=? WHERE day_utc=?").bind(now,day).run();
  const instruction="Ты редактор-переводчик официальных сообщений ЦАХАЛ. Переведи на грамотный русский ровно предоставленные заголовки и выдержки. Не добавляй фактов и не завершай оборванные фразы. Сохраняй числа, даты, географические имена, оговорки и атрибуцию («по сообщению ЦАХАЛ»). Для сообщений о тревогах обязательно сохраняй различие между предварительным сообщением и последующим признанием ложного срабатывания. Верни ТОЛЬКО валидный JSON-массив объектов [{\"url\":\"оригинальный URL\",\"title_ru\":\"русский заголовок\",\"excerpt_ru\":\"русский перевод выдержки\"}]. Не переводить ссылки; ЦАХАЛ вместо IDF, КСИР вместо IRGC, Служба тыла вместо Home Front Command.";
  const resp=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:instruction},{role:"user",content:JSON.stringify(candidates)}],temperature:.1,max_tokens:1900});
  const output=String(resp?.choices?.[0]?.message?.content||(typeof resp?.response==="string"?resp.response:"")).trim();
  let parsed;try{parsed=JSON.parse(output)}catch{const match=output.match(/\[[\s\S]*\]/);if(!match)throw Error("No JSON array");parsed=JSON.parse(match[0]);}
  if(!Array.isArray(parsed))throw Error("Response not array");
  const map=new Map(parsed.filter(x=>x&&typeof x.url==="string").map(x=>[x.url,x]));
  const valid=x=>typeof x==="string"&&x.trim().length>=12&&/[А-Яа-яЁё]/.test(x)&&!/[<>]/.test(x);
  let written=0;
  for(const item of candidates){
   const x=map.get(item.url);if(!x||!valid(x.title_ru)||!valid(x.excerpt_ru))continue;
   const q=await env.NEWS_DB.prepare("INSERT OR IGNORE INTO official_translations(url,source,title_ru,excerpt_ru,original_published_ms,translated_ms,model) VALUES(?,?,?,?,?,?,?)").bind(item.url,"idf_official",x.title_ru.trim().slice(0,350),x.excerpt_ru.trim().slice(0,800),item.published,Date.now(),"Llama 3.3 70B").run();
   written+=q.meta?.changes||0;
  }
  const actual=Number(resp?.usage?.neurons);
  if(Number.isFinite(actual)&&actual>0)await env.NEWS_DB.prepare("UPDATE official_translation_budget SET estimated_neurons=MAX(0,estimated_neurons+?),updated_ms=? WHERE day_utc=?").bind(actual-125,Date.now(),day).run();
  return {translated:written};
 }catch(e){
  await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_idf_translation_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(String(e).slice(0,400),Date.now()).run();
  return {translated:0,error:true};
 }
}

async function scan(env){
 const now=Date.now(),runs=await Promise.all(FEEDS.map(x=>load(x,now))),all=runs.flatMap(x=>x.items);
 for(const r of runs)await env.NEWS_DB.prepare("INSERT INTO feed_status(name,checked_ms,status,http_status,items_count,error) VALUES(?,?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET checked_ms=excluded.checked_ms,status=excluded.status,http_status=excluded.http_status,items_count=excluded.items_count,error=excluded.error").bind(r.name,now,r.state,r.http,r.items.length,r.error).run();
 all.sort((a,b)=>b.score-a.score||b.pub-a.pub);
 // A canonical URL is one technical article identity, regardless of UTM order.
 // Query existing IDs once to avoid introducing new duplicates during migration.
 const known=(await env.NEWS_DB.prepare("SELECT url FROM news_items WHERE published_ms>=?").bind(now-8*86400000).all()).results||[];
 const existingUrls=new Set(known.map(row=>canonicalNewsUrl(row.url)).filter(Boolean));
 const seenUrls=new Set(),samePublisherTitles=new Set();let inserted=0;
 for(const item of all.slice(0,240)){
  const canonical=canonicalNewsUrl(item.link);
  if(!canonical||seenUrls.has(canonical)||existingUrls.has(canonical))continue;
  const titleKey=item.source+'\u0000'+normalizedHeadline(item.title)+'\u0000'+Math.floor(item.pub/(6*3600000));
  // Avoid an identical same-publisher headline repeated in the same time window,
  // without suppressing independent publishers or unrelated events.
  if(samePublisherTitles.has(titleKey))continue;
  seenUrls.add(canonical);samePublisherTitles.add(titleKey);
  const id=await digest(canonical);
  const r=await env.NEWS_DB.prepare("INSERT OR IGNORE INTO news_items (id,source,headline,summary,url,published_ms,discovered_ms,priority) VALUES(?,?,?,?,?,?,?,?)").bind(id,item.source,item.title,item.summary,item.link,item.pub,now,item.score).run();
  existingUrls.add(canonical);
  if(r.meta?.changes)inserted++;
 }
 await env.NEWS_DB.prepare("DELETE FROM news_items WHERE published_ms < ?").bind(now-8*86400000).run();
 let grouped={state:'pending'};
 try{grouped=await reconcile(env.NEWS_DB,now);}
 catch(e){grouped={state:'error',error:String(e).slice(0,170)};
   await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_event_filter_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms")
   .bind(grouped.error,Date.now()).run().catch(()=>{});
 }
 const translation=await translateTitles(env,now);

 const day=new Date(now).toISOString().slice(0,10);
 const usage=await env.NEWS_DB.prepare("SELECT generation_count,estimated_neurons FROM editor_budget WHERE day_utc=?").bind(day).first();
 let commented=0,failures=0,used=Number(usage?.generation_count||0),neurons=Number(usage?.estimated_neurons||0);
 if(used<28&&neurons<3500){
  const pending=await env.NEWS_DB.prepare("SELECT id,source,headline,summary,headline_ru,summary_ru FROM news_items WHERE comment_model IS NULL AND headline_ru IS NOT NULL AND published_ms>? AND priority>=7 AND lower(headline) NOT LIKE '%sponsored content%' AND lower(headline) NOT LIKE '%winner cup%' AND lower(headline) NOT LIKE '%euroleague%' AND lower(headline) NOT LIKE '%fashion week%' ORDER BY priority DESC,published_ms DESC LIMIT 2").bind(now-18*3600000).all();
  for(const row of pending.results||[]){
   if(used>=28||neurons>=3500)break;
   let spent=110;
   try{
    const out=await writeComment(env,row);
    spent=Number.isFinite(out.neurons)?Math.max(5,out.neurons):110;
    await env.NEWS_DB.prepare("UPDATE news_items SET comment=?,comment_model=?,comment_at_ms=? WHERE id=? AND comment_model IS NULL").bind(out.comment,out.skip?"EDITORIAL_SKIP":"Cloudflare Workers AI / Llama 3.3 70B · ironic",Date.now(),row.id).run();
    if(!out.skip)commented++;
   }catch(e){
    failures++;
    await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_ai_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(String(e).slice(0,340),Date.now()).run();
   }
   await env.NEWS_DB.prepare("INSERT INTO editor_budget(day_utc,generation_count,estimated_neurons,updated_ms) VALUES(?,1,?,?) ON CONFLICT(day_utc) DO UPDATE SET generation_count=generation_count+1,estimated_neurons=estimated_neurons+excluded.estimated_neurons,updated_ms=excluded.updated_ms").bind(day,spent,Date.now()).run();
   used++;neurons+=spent;
  }
 }
 const idfTranslation=await translateIDF(env,now);
 const summary={updated_at:new Date(now).toISOString(),feeds:runs.map(x=>({name:x.name,state:x.state,http:x.http,items:x.items.length,error:x.error})),found:all.length,inserted,grouped,commented,comment_errors:failures,translated:translation.translated,translated_summaries:translation.summaries||0,idf_translated:idfTranslation.translated||0};
 await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_scan',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(JSON.stringify(summary),Date.now()).run();
 return summary;
}

async function safeLocalizedApi(request,env,analystService){
  try{return await localization.fetch(request,env,analystService);}
  catch(error){
    const message=String(error?.message||error).slice(0,240);
    try{await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_i18n_api_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms")
      .bind(JSON.stringify({path:new URL(request.url).pathname,error:message,time:new Date().toISOString()}),Date.now()).run();}
    catch{}
    return Response.json({error:'localized_api_unavailable'},
      {status:503,headers:{'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
  }
}

function buildDigest(rows,eventRows){
 if(!Array.isArray(rows)||rows.length<2)return {status:"pending",changes:[],lastCheck:rows?.[0]?.started_at_ms?new Date(rows[0].started_at_ms).toISOString():null,previousCheck:null,periodMinutes:null,sourceUpdates:0,sourceComparable:0};
 const [latest,prior]=rows,latestMs=Number(latest.started_at_ms),prevMs=Number(prior.started_at_ms);
 if(!Number.isFinite(latestMs)||!Number.isFinite(prevMs)||latestMs<=prevMs)return {status:"error",changes:[],error:"invalid_monitor_run_times"};
 const parse=s=>{try{return JSON.parse(s||"{}")}catch{return {}}};
 const a=parse(latest.payload),b=parse(prior.payload),oldS=b.source_maxima_ms||{},newS=a.source_maxima_ms||{};
 const common=Object.keys(newS).filter(k=>Number.isFinite(Number(newS[k]))&&Number.isFinite(Number(oldS[k])));
 const sourceUpdates=common.filter(k=>Number(newS[k])>Number(oldS[k])).length;
 const changedEvents=(Array.isArray(eventRows)?eventRows:[]).filter(x=>Number(x.updated_at_ms)>prevMs&&Number(x.updated_at_ms)<=latestMs);
 const changes=changedEvents.slice(0,6).map(x=>({id:"monitor-event-"+x.event_id,story_id:x.event_id,kind:"journal_updated",title:"Обновлено досье мониторинга",title_he:"עודכן תיק מעקב",description:"Поступило обновление записи; само по себе это не подтверждает утверждения источников.",description_he:"עודכנה רשומת המעקב; העדכון עצמו אינו מאמת טענות של מקורות.",time:new Date(Number(x.updated_at_ms)).toISOString()}));
 if(latest.outcome!==prior.outcome)changes.unshift({id:"monitor-state-"+latest.run_id,kind:"assessment_changed",title:"Изменилось решение мониторинга",title_he:"השתנתה הערכת המעקב",description:"Текущий статус: "+String(latest.outcome).slice(0,50),description_he:"מצב הבדיקה: "+String(latest.outcome).slice(0,50),time:new Date(latestMs).toISOString()});
 return{status:(common.length||changes.length)?"ready":"insufficient_comparison",changes,lastCheck:new Date(latestMs).toISOString(),previousCheck:new Date(prevMs).toISOString(),periodMinutes:Math.round((latestMs-prevMs)/60000),sourceUpdates,sourceComparable:common.length,outcome:latest.outcome,previousOutcome:prior.outcome};
}

async function readMonitorChanges(request,env){
 const url=new URL(request.url);
 const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET,OPTIONS'}});
 if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers});
 const lang=url.searchParams.get('lang')||'ru';
 if(lang!=='ru'&&lang!=='he')return Response.json({error:'unsupported_language'},{status:400,headers});
 try{
  const result=await env.CORE_DB.prepare('SELECT run_id,started_at_ms,outcome,payload FROM monitor_runs ORDER BY started_at_ms DESC LIMIT 2').all();
  const runs=result.results||[];
  const prev=Number(runs[1]?.started_at_ms||0),last=Number(runs[0]?.started_at_ms||0);
  let events=[];
  if(prev>0&&last>prev){const v=await env.CORE_DB.prepare('SELECT event_id,updated_at_ms FROM monitor_events WHERE updated_at_ms > ? AND updated_at_ms <= ? ORDER BY updated_at_ms DESC LIMIT 6').bind(prev,last).all();events=v.results||[];}
  const digest=buildDigest(runs,events);
  return Response.json({requested_language:lang,...digest},{status:200,headers});
 }catch(e){return Response.json({error:'digest_unavailable',message:'monitor_comparison_not_available'},{status:503,headers});}
}

async function archiveExpiredPolymarket(db, timestamp=Date.now()) {
  const nowIso=new Date(timestamp).toISOString();
  await db.prepare("CREATE TABLE IF NOT EXISTS expired_polymarket_observations (source TEXT NOT NULL,id TEXT NOT NULL,revision TEXT NOT NULL,observed_at INTEGER NOT NULL,payload TEXT NOT NULL,archived_at_ms INTEGER NOT NULL,archive_reason TEXT NOT NULL,PRIMARY KEY(source,id,revision))").run();
  const dateExpr="julianday(CASE WHEN json_valid(payload) THEN json_extract(payload,'$.ends_at') END)";
  const eligible="("+dateExpr+" IS NULL OR "+dateExpr+" <= julianday(?))";
  const copy="INSERT OR IGNORE INTO expired_polymarket_observations(source,id,revision,observed_at,payload,archived_at_ms,archive_reason) SELECT source,id,revision,observed_at,payload,?,CASE WHEN "+dateExpr+" IS NULL THEN 'invalid_or_missing_end' ELSE 'expired' END FROM observations WHERE source='polymarket' AND "+eligible;
  const remove="DELETE FROM observations WHERE source='polymarket' AND "+eligible+" AND EXISTS (SELECT 1 FROM expired_polymarket_observations a WHERE a.source=observations.source AND a.id=observations.id AND a.revision=observations.revision AND a.observed_at=observations.observed_at AND a.payload=observations.payload)";
  return db.batch([db.prepare(copy).bind(timestamp,nowIso),db.prepare(remove).bind(nowIso)]);
}

function rwOfficialTextParts(heading,body) {
 const h=String(heading||'').trim(),b=String(body||'').trim();
 if(!b)return{title:h,description:''};
 if(!h||!b.startsWith(h))return{title:h,description:b};
 const cut=b.length>h.length && /[\p{L}\p{N}]$/u.test(h) && /^[\p{L}\p{N}]/u.test(b.slice(h.length));
 if(cut){
   const clauses=[': ','. ','; '].map(sep=>({at:b.lastIndexOf(sep,h.length),length:sep.length})).filter(x=>x.at>=65);
   clauses.sort((a,b)=>b.at-a.at);
   if(clauses.length){const end=clauses[0].at+1;return{title:b.slice(0,end).trim(),description:b.slice(end).replace(/^[\s.:,;—–-]+/u,'').trim()};}
   const ix=h.lastIndexOf(' ');
   if(ix>45)return{title:h.slice(0,ix).trim()+'…',description:b.slice(ix+1).trim()};
 }
 return{title:h,description:b.slice(h.length).replace(/^[\s.:,;—–-]+/u,'').trim()};
}
function rwOfficialDecode(s){return String(s||'').replace(/&#39;|&#x27;/gi,"'").replace(/&quot;/gi,'"').replace(/&amp;/gi,'&');}
function rwOfficialNumbersPreserved(source,translated){
 const from=(rwOfficialDecode(source).match(/\d+/g)||[]),to=(String(translated).match(/\d+/g)||[]);
 for(const v of from){const i=to.indexOf(v);if(i<0)return false;to.splice(i,1);}
 return true;
}
async function readOfficialPosts(request,env){
 const query=new URL(request.url).searchParams,lang=query.get('lang')||'ru',n=query.get('limit')||'5',limit=Number(n);
 const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff'};
 if(!['ru','he'].includes(lang)||!Number.isInteger(limit)||limit<1||limit>10)return Response.json({error:'invalid_request'},{status:400,headers});
 const sql="SELECT o.id,o.observed_at,o.payload FROM observations o JOIN (SELECT id,MAX(observed_at) newest FROM observations WHERE source='idf_official' GROUP BY id) x ON x.id=o.id AND x.newest=o.observed_at WHERE o.source='idf_official' ORDER BY json_extract(o.payload,'$.published_at') DESC,o.id ASC LIMIT ?";
 const rows=(await env.CORE_DB.prepare(sql).bind(Math.max(20,limit*3)).all()).results||[],posts=[],seen=new Set();
 for(const row of rows){
  let src;try{src=JSON.parse(row.payload)}catch{continue}
  if(!/^https:\/\/t\.me\/idfofficial\/\d+$/.test(String(src.url||''))||seen.has(row.id))continue;
  seen.add(row.id);posts.push({id:row.id,observed_at:row.observed_at,source:src});
  if(posts.length>=limit)break;
 }
 const urls=posts.map(x=>x.source.url);
 const translations=urls.length?(await env.NEWS_DB.prepare("SELECT url,title_ru,excerpt_ru,model,translated_ms FROM official_translations WHERE url IN ("+urls.map(()=>'?').join(',')+")").bind(...urls).all()).results||[]:[];
 const byURL=new Map(translations.map(x=>[x.url,x]));
 const items=posts.map(post=>{
  const s=post.source,tr=byURL.get(s.url),rawTitle=rwOfficialDecode(s.title),rawExcerpt=rwOfficialDecode(s.excerpt||s.title);
  const ready=lang==='ru'&&tr&&/[А-Яа-яЁё]/u.test(tr.title_ru||'')&&/[А-Яа-яЁё]/u.test(tr.excerpt_ru||'')&&rwOfficialNumbersPreserved(rawExcerpt,tr.excerpt_ru);
  const language=ready?'ru':'en',summary=rwOfficialTextParts(ready?tr.title_ru:rawTitle,ready?tr.excerpt_ru:rawExcerpt);
  return{id:post.id,url:s.url,title:summary.title,description:summary.description,original_title:rawTitle,original_description:rawExcerpt,published:s.published_at||null,observed:new Date(post.observed_at).toISOString(),content_language:language,field_languages:{title:language,description:language},translation_status:ready?'available':tr&&lang==='ru'?'needs_review':'pending',source_language:'en',translation_model:ready?tr.model:null,translation_verified:false,source_type:'official_idf_telegram'};
 });
 return Response.json({requested_language:lang,items,total:items.length,source:'idf_official',translation_disclaimer:'Machine translation; refer to the original official statement.'},{headers});
}

export default {
  async scheduled(event, env, ctx) {
    // Keep existing news editor independent from the analysts pipeline.
    ctx.waitUntil(scan(env));
    ctx.waitUntil(archiveExpiredPolymarket(env.CORE_DB,Date.now()));
    ctx.waitUntil(localization.scheduled(env,event.scheduledTime));
    if(new Date(event.scheduledTime).getUTCMinutes()%15===0)ctx.waitUntil(importTranslationMirror(env));
    if(new Date(event.scheduledTime).getUTCMinutes()%15===5){ctx.waitUntil(enrichNewMonitorStories(env));}
    // The analyst mirror refreshes hourly at :17 UTC. Run its editor at :30 UTC.
    // An hourly D1 run ID provides additional duplicate-run protection.
    if (new Date(event.scheduledTime).getUTCMinutes() === 30) {
      ctx.waitUntil(analystService.scheduled(event, {DB: env.CORE_DB, AI: env.AI}));
    }
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if(path==='/api/official-posts')return readOfficialPosts(request,env);
    if(path==='/api/changes')return readMonitorChanges(request,env);
    if(path==='/api/translation-queue')return translationQueue(env,request);
    if(path==='/api/news'||path==='/api/events'){
      try{return await readNewsEvents(request,env);}
      catch(error){
        await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_event_api_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms")
          .bind(String(error).slice(0,250),Date.now()).run().catch(()=>{});
        return safeLocalizedApi(request,env,analystService);
      }
    }
    if (['/api/editorial-notes','/api/stories','/api/languages'].includes(path)) return safeLocalizedApi(request,env,analystService);
    if (path === '/api/analysts' || path === '/api/analyst-posts' ||
        /^\/api\/analyst-posts\/[a-z0-9-]+$/.test(path)) {
      return safeLocalizedApi(request,env,analystService);
    }
    if (path === '/health') {
      const r = await env.NEWS_DB.prepare("SELECT value FROM editor_state WHERE key='last_scan'").first();
      return Response.json(r?.value ? JSON.parse(r.value) : {state: 'pending'});
    }
    return new Response('Not found', {status: 404});
  },
};
