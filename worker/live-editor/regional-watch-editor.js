import {enrichNewMonitorStories} from './story-enrichment.mjs';
import analystService from './analysts-editor.mjs';
import localization from './localization.mjs';
import {canonicalNewsUrl,normalizedHeadline,articlePriority} from './news-normalization.mjs';

const FEEDS=[
 ["BBC Middle East","https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",4],
 ["Times of Israel","https://www.timesofisrael.com/feed/",4],
 ["Jerusalem Post / Israel","https://www.jpost.com/rss/rssfeedsisraelnews.aspx",4],
 ["Jerusalem Post / Iran","https://www.jpost.com/rss/rssfeedsiran",4],
 ["Al Jazeera","https://www.aljazeera.com/xml/rss/all.xml",3]
];
const REGION=/iran|israel|israeli|hezbollah|lebanon|gaza|hamas|syria|syrian|yemen|houthi|red sea|middle east|iraq|idf|centcom|hormuz|netanyahu|tehran|jerusalem|tel aviv|persian gulf|khamenei|trump.*(iran|israel)/i;
// High-impact headline terms are token-boundary checked in news-normalization.mjs.
function decode(s){return (s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+)|#x([0-9a-f]+));/gi,(m,d,h)=>{if(d||h){const n=d?Number(d):parseInt(h,16);return n>0&&n<1114112?String.fromCodePoint(n):""}return {amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "}[m.slice(1,-1).toLowerCase()]||m}).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function tag(s,key){const m=s.match(new RegExp("<(?:[\\w.-]+:)?"+key+"\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+key+">","i"));return m?decode(m[1]):""}
function safeLink(u){try{const x=new URL(u);return x.protocol==="https:"?x.href.slice(0,1000):null}catch{return null}}
async function digest(s){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(h)].slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join("")}
function entries(xml,feed,now){
 const items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[],out=[];
 for(const it of items.slice(0,55)){
  const title=tag(it,"title").slice(0,260),summary=tag(it,"description").slice(0,480);
  const link=safeLink(tag(it,"link")),pub=Date.parse(tag(it,"pubDate")||tag(it,"published")||tag(it,"date"));
  if(!title||!link||!Number.isFinite(pub)||pub>now+600000||pub<now-48*3600000||!REGION.test(title+" "+summary))continue;
  const score=articlePriority(feed[2],title,REGION.test(title));
  out.push({source:feed[0],title,summary,link,pub,score});
 }
 return out;
}
async function load(feed,now){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),8000);
 try{
  const r=await fetch(feed[1],{redirect:"follow",headers:{Accept:"application/rss+xml,application/xml,text/xml,*/*", "User-Agent":"RegionalWatch/1.0 RSS"},signal:c.signal});
  if(!r.ok)return {name:feed[0],state:"error",http:r.status,error:"HTTP "+r.status,items:[]};
  const xml=(await r.text()).slice(0,400000);
  if(!/<rss\b|<rdf:RDF\b/i.test(xml))return {name:feed[0],state:"error",http:r.status,error:"Not RSS",items:[]};
  const items=entries(xml,feed,now);
  return {name:feed[0],state:items.length?"ok":"empty",http:r.status,error:null,items};
 }catch(e){return {name:feed[0],state:"error",http:null,error:String(e).slice(0,100),items:[]}}
 finally{clearTimeout(timer)}
}

async function writeComment(env,row){
 const title=String(row.headline_ru||row.headline||"").trim();
 const summary=String(row.summary_ru||row.summary||"").trim();
 const combined=title+" "+summary;
 if(/погибш|убитых детей|жертв|выживши[ех]|обрушени[яе] .*сем|рак молочной железы|задержанн.*семьи|сексуальн.*насили/i.test(combined))return {comment:null,skip:true,neurons:0};
 const system="Ты ироничный редактор русскоязычного ближневосточного новостного издания. Дай одну короткую, острую и умную реплику к новости, максимум 200 символов и не более двух предложений. Цинизм, сарказм и сухой юмор допустимы в адрес политиков, чиновников, бюрократии, дипломатии и политического пиара. Укол должен быть точным и связанным с конкретным фактом из заголовка или RSS-аннотации. Никаких повторов заголовка другими словами, банальных выводов, общих размышлений, дежурного 'это не означает угрозы', морализаторства и самовосхваления. Не выдумывай мотиваций, причин, цифр, цитат или подтверждений. Не изображай судебные обвинения доказанной виной. Категорически не шути над погибшими, пострадавшими, заложниками, врачами, пациентами, мирными жителями, гуманитарными трагедиями. Если можно только повторить новость или юмор окажется натужным — верни пустой comment. Верни только JSON {\"comment\":\"...\"}.";
 const request={messages:[{role:"system",content:system},{role:"user",content:"Источник: "+row.source+"\nЗаголовок: "+title+"\nАннотация: "+summary}],temperature:.7,max_tokens:240};
 const answer=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",request);
 const content=String(answer?.choices?.[0]?.message?.content||(typeof answer?.response==="string"?answer.response:"")).trim();
 const match=content.match(/\{[\s\S]*\}/);
 if(!match)throw Error("No commentary JSON");
 const parsed=JSON.parse(match[0]);
 const comment=String(parsed?.comment||"").trim();
 if(comment.length<35||comment.length>300||/^(\s*(похоже|интересно|это ещё|по сообщениям|важно|стоит отметить))/i.test(comment))return {comment:null,skip:true,neurons:Number(answer?.usage?.neurons)||undefined};
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
  const system="Ты опытный русскоязычный редактор-переводчик. Переведи каждый английский заголовок и короткую RSS-аннотацию на естественный, грамотный русский. Сохраняй все факты, числа, даты, имена, источники утверждений и вопросительные формы. Не превращай подозрения или заявления в доказанные факты, не добавляй ничего своего. Формат ответа: строго валидный JSON-массив объектов вида [{\"id\":\"исходный id\",\"title_ru\":\"русский заголовок\",\"summary_ru\":\"русская аннотация\"}]. Для каждого переданного id ровно один объект. Никаких пояснений, markdown или текста вне JSON. Rezaei — Резаи, Bessent — Бессент, Netanyahu — Нетаньяху, IRGC — КСИР, IDF — ЦАХАЛ.";
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
   const title=valid(value.title_ru)?value.title_ru.trim().slice(0,260):null;
   const summary=valid(value.summary_ru)?value.summary_ru.trim().slice(0,480):null;
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
 for(const item of all.slice(0,85)){
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
 const summary={updated_at:new Date(now).toISOString(),feeds:runs.map(x=>({name:x.name,state:x.state,http:x.http,items:x.items.length,error:x.error})),found:all.length,inserted,commented,comment_errors:failures,translated:translation.translated,translated_summaries:translation.summaries||0,idf_translated:idfTranslation.translated||0};
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

export default {
  async scheduled(event, env, ctx) {
    // Keep existing news editor independent from the analysts pipeline.
    ctx.waitUntil(scan(env));
    ctx.waitUntil(localization.scheduled(env,event.scheduledTime));
    if(new Date(event.scheduledTime).getUTCMinutes()%15===5){ctx.waitUntil(enrichNewMonitorStories(env));}
    // The analyst mirror refreshes hourly at :17 UTC. Run its editor at :30 UTC.
    // An hourly D1 run ID provides additional duplicate-run protection.
    if (new Date(event.scheduledTime).getUTCMinutes() === 30) {
      ctx.waitUntil(analystService.scheduled(event, {DB: env.CORE_DB, AI: env.AI}));
    }
  },
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (['/api/news','/api/editorial-notes','/api/stories','/api/languages'].includes(path)) return safeLocalizedApi(request,env,analystService);
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
