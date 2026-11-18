import {validateCandidate} from './news-mirror.mjs';
import {RU_TITLES_MODEL,ruTitlesInput} from './prompts.mjs';
import {newsTier,TIER_RANK} from '../news/tier.mjs';
import {recordShown} from '../news/sla.mjs';

export async function translateTitles(env,now){
 const day=new Date(now).toISOString().slice(0,10);
 try{
  await env.NEWS_DB.prepare("INSERT OR IGNORE INTO news_translation_budget(day_utc,batches,estimated_neurons,updated_ms) VALUES(?,0,0,?)").bind(day,now).run();
  const budget=await env.NEWS_DB.prepare("SELECT batches,estimated_neurons FROM news_translation_budget WHERE day_utc=?").bind(day).first();
  if((budget?.batches||0)>=48||(budget?.estimated_neurons||0)>=6000)return {translated:0,summaries:0,budget:"limit"};
  const query="SELECT n.id,n.headline,n.summary,n.headline_ru,n.discovered_ms FROM news_items n WHERE ((n.priority>=7 AND n.published_ms>?) OR n.id IN (SELECT g.representative_id FROM news_event_groups g WHERE g.priority>=4 AND g.last_seen_ms>?)) AND (n.headline_ru IS NULL OR (n.summary_ru IS NULL AND length(n.summary)>10)) ORDER BY n.published_ms DESC LIMIT 60";
  const rows=(await env.NEWS_DB.prepare(query).bind(now-36*3600000,now-36*3600000).all()).results||[];
  const pending=rows.filter(x=>!/sponsored content|winner cup|euroleague|fashion week|maccabi wins|hapoel tel aviv set to secure/i.test(x.headline))
    // B5: urgent > important > normal, newest first within a tier (stable sort).
    .map(x=>({...x,tier:newsTier(x).tier})).sort((a,b)=>TIER_RANK[a.tier]-TIER_RANK[b.tier]).slice(0,5);
  if(!pending.length)return {translated:0,summaries:0};
  const claimed=await env.NEWS_DB.prepare("UPDATE news_translation_budget SET batches=batches+1,estimated_neurons=estimated_neurons+125,updated_ms=? WHERE day_utc=? AND batches<48 AND estimated_neurons<6000").bind(now,day).run();
  if(claimed.meta?.changes!==1)return {translated:0,summaries:0,budget:"limit"};
  const payload=pending.map(x=>({id:x.id,headline:x.headline,summary:x.summary||""}));
  const out=await env.AI.run(RU_TITLES_MODEL,ruTitlesInput(payload));
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
   if(write.meta?.changes&&title&&!row.headline_ru)
    await recordShown(env.NEWS_DB,{id:row.id,language:'ru',tier:row.tier,discoveredMs:row.discovered_ms}).catch(()=>{});
  }
  const actual=Number(out?.usage?.neurons);
  if(Number.isFinite(actual)&&actual>0)await env.NEWS_DB.prepare("UPDATE news_translation_budget SET estimated_neurons=MAX(0,estimated_neurons+?),updated_ms=? WHERE day_utc=?").bind(actual-125,Date.now(),day).run();
  return {translated,summaries,neurons:Number.isFinite(actual)?actual:null};
 }catch(e){
  await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_translation_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(String(e).slice(0,380),Date.now()).run();
  return {translated:0,summaries:0,error:true};
 }
}

export async function translateIDF(env,now){
 const day=new Date(now).toISOString().slice(0,10);
 try{
  if(!env.CORE_DB)return {translated:0,error:"core database binding missing"};
  await env.NEWS_DB.prepare("INSERT OR IGNORE INTO official_translation_budget(day_utc,batches,estimated_neurons,updated_ms) VALUES(?,0,0,?)").bind(day,now).run();
  const budget=await env.NEWS_DB.prepare("SELECT batches,estimated_neurons FROM official_translation_budget WHERE day_utc=?").bind(day).first();
  if((budget?.batches||0)>=24||(budget?.estimated_neurons||0)>=3000)return {translated:0,budget:"limit"};
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
  const claimed=await env.NEWS_DB.prepare("UPDATE official_translation_budget SET batches=batches+1,estimated_neurons=estimated_neurons+125,updated_ms=? WHERE day_utc=? AND batches<24 AND estimated_neurons<3000").bind(now,day).run();
  if(claimed.meta?.changes!==1)return {translated:0,budget:"limit"};
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

