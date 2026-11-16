import {enrichNewMonitorStories} from './stories/enrichment.mjs';
import analystService from './analysts/editor.mjs';
import localization from './localization/localization.mjs';
import {FEEDS as EVENT_FEEDS,reconcile} from './news/events.mjs';
import {readNewsEvents} from './news/api.mjs';
import {translationQueue,importTranslationMirror} from './translations/news-mirror.mjs';
import {translateTitles,translateIDF} from './translations/scheduled.mjs';
import {shouldSuppressComment} from './editorial/comment-policy.mjs';
import {canonicalNewsUrl,normalizedHeadline,articlePriority} from './news/normalization.mjs';
import {load} from './news/rss.mjs';
import {readOfficialPosts} from './api/official-posts.mjs';
import {readMonitorChanges} from './api/monitor-changes.mjs';

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

async function archiveExpiredPolymarket(db, timestamp=Date.now()) {
  const nowIso=new Date(timestamp).toISOString();
  await db.prepare("CREATE TABLE IF NOT EXISTS expired_polymarket_observations (source TEXT NOT NULL,id TEXT NOT NULL,revision TEXT NOT NULL,observed_at INTEGER NOT NULL,payload TEXT NOT NULL,archived_at_ms INTEGER NOT NULL,archive_reason TEXT NOT NULL,PRIMARY KEY(source,id,revision))").run();
  const dateExpr="julianday(CASE WHEN json_valid(payload) THEN json_extract(payload,'$.ends_at') END)";
  const eligible="("+dateExpr+" IS NULL OR "+dateExpr+" <= julianday(?))";
  const copy="INSERT OR IGNORE INTO expired_polymarket_observations(source,id,revision,observed_at,payload,archived_at_ms,archive_reason) SELECT source,id,revision,observed_at,payload,?,CASE WHEN "+dateExpr+" IS NULL THEN 'invalid_or_missing_end' ELSE 'expired' END FROM observations WHERE source='polymarket' AND "+eligible;
  const remove="DELETE FROM observations WHERE source='polymarket' AND "+eligible+" AND EXISTS (SELECT 1 FROM expired_polymarket_observations a WHERE a.source=observations.source AND a.id=observations.id AND a.revision=observations.revision AND a.observed_at=observations.observed_at AND a.payload=observations.payload)";
  return db.batch([db.prepare(copy).bind(timestamp,nowIso),db.prepare(remove).bind(nowIso)]);
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
