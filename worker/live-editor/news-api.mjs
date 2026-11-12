// Event-card response compatible with the legacy /api/news articles DTO.
import {eventRows,hebrew,publisher,language} from './news-events.mjs';
import {localizeNewsRow} from './localization.mjs';
const HEADERS={'Access-Control-Allow-Origin':'*','Cache-Control':'public,max-age=60',
               'X-Content-Type-Options':'nosniff'};
const respond=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
const validInt=(value,max,defaultValue)=>value===null?defaultValue:
  /^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)<=max?Number(value):null;
export async function readNewsEvents(request,env){
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 if(request.method!=='GET')return respond({error:'read_only'},405);
 const url=new URL(request.url),lang=url.searchParams.get('lang')||'ru';
 if(!['he','ru'].includes(lang))return respond({error:'invalid_language'},400);
 const limit=validInt(url.searchParams.get('limit'),40,20);
 const offset=validInt(url.searchParams.get('offset'),2000,0);
 if(limit===null||limit<1||offset===null)return respond({error:'invalid_pagination'},400);
 const readyOnly=lang==='he'&&['1','true'].includes(url.searchParams.get('ready_only'));
 let rows=await eventRows(env.NEWS_DB,200);
 // A native Hebrew source is already translated; do not require Workers AI
 // translation for its appearance in the Hebrew edition.
 const substitutions=new Map();
 if(lang==='he'){
  const hebrewChoices=[];
  for(const r of rows){
   if(hebrew(r.headline))continue;
   if(r.he_hash&&r.he_title)continue;
   const choices=JSON.parse(r.sources_json||'[]').filter(x=>x.language==='he');
   if(choices.length)hebrewChoices.push({event_id:r.event_id,article_id:choices[0].article_id});
  }
  if(hebrewChoices.length){
   const ids=[...new Set(hebrewChoices.map(x=>x.article_id))].slice(0,150);
   const sql="SELECT id,source,headline,headline_ru,summary,summary_ru,comment,url,published_ms,priority FROM news_items WHERE id IN ("+ids.map(()=>'?').join(',')+")";
   const native=(await env.NEWS_DB.prepare(sql).bind(...ids).all()).results||[];
   const byId=new Map(native.map(x=>[x.id,x]));
   for(const x of hebrewChoices)if(byId.has(x.article_id))substitutions.set(x.event_id,byId.get(x.article_id));
  }
 }
 const translated=await Promise.all(rows.map(async r=>{
  const alternative=substitutions.get(r.event_id);
  const row=alternative?{...r,...alternative,he_hash:null,he_title:null,he_body:null,he_comment:null,he_quality:null}:r;
  const t=await localizeNewsRow(env.NEWS_DB,row,lang);
  return{event_id:r.event_id,id:row.id,source:row.source,
   headline:t.title,summary:t.body,comment:t.comment,url:row.url,
   published_ms:r.last_seen_ms,priority:r.event_priority,category:r.topic,
   content_language:t.content_language,translation_status:t.translation_status,
   verification_status:r.verification_status,source_count:r.source_count,
   reporting_origin_count:r.origin_count,article_count:r.member_count,
   sources:JSON.parse(r.sources_json||'[]'),reason_codes:JSON.parse(r.reason_codes||'[]'),
   _owner:publisher(row.source)};
 }));
 let visible=readyOnly?translated.filter(x=>x.content_language==='he'&&x.translation_status==='available'):translated;
 // Soft diversity: high-impact stories are never blocked to satisfy quotas.
 const cap=Math.max(3,Math.floor(limit*0.35)),counts=new Map(),regular=[],deferred=[];
 for(const e of visible){
  const n=counts.get(e._owner)||0;
  if(e.priority>=9||n<cap){regular.push(e);counts.set(e._owner,n+1);}
  else deferred.push(e);
 }
 visible=[...regular,...deferred];
 const output=visible.slice(offset,offset+limit).map(({_owner,...rest})=>rest);
 return respond({requested_language:lang,articles:output,events:output,localized_count:output.filter(x=>x.content_language===lang).length,
  limit,offset,next_offset:visible.length>offset+limit?offset+limit:null,ready_only:readyOnly,
  grouping:'event_v1',status:'published',source_policy:'attributed_reporting_not_fact_verification'});
}
