// Event-card response compatible with the legacy /api/news articles DTO.
import {eventRows,reconcile,hebrew,publisher,language} from './events.mjs';
import {localizeNewsRow} from '../localization/localization.mjs';
const HEADERS={'Access-Control-Allow-Origin':'*','Cache-Control':'public,max-age=60',
               'X-Content-Type-Options':'nosniff'};
const respond=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
// Fixed across page sizes, otherwise offset pagination reorders earlier rows.
const SOFT_PUBLISHER_CAP=7;
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
 const sort=url.searchParams.get('sort')||'latest';
 if(sort!=='latest'&&sort!=='priority')return respond({error:'invalid_sort'},400);
 const requestedReadyOnly=['1','true'].includes(url.searchParams.get('ready_only'));
 // Main feed is locale-invariant; never hide events because translation is pending.
 const readyOnly=false;
 // Paginate the complete eligible event pool, not a silently truncated first 200.
 let rows=await eventRows(env.NEWS_DB,null);
 // Initialize the event index once on first public request, avoiding an empty
 // homepage during the first five-minute cron window after deployment.
 if(!rows.length){
  const exists=await env.NEWS_DB.prepare("SELECT COUNT(*) n FROM news_event_groups").first();
  if(!(exists?.n||0)){
   await reconcile(env.NEWS_DB);
   rows=await eventRows(env.NEWS_DB,null);
  }
 }
 // Sort the complete raw event pool before doing any per-row i18n D1 reads.
 // Feed order and publisher diversity must remain independent of language/page size.
 // The Latest feed is newest-first, without silently promoting older priority items.
 let visible=rows.map(row=>({row,event_id:row.event_id,published_ms:row.last_seen_ms,priority:row.event_priority,_owner:publisher(row.source)})).sort((a,b)=>sort==='latest'?
   b.published_ms-a.published_ms||String(a.event_id).localeCompare(String(b.event_id)):
   b.priority-a.priority||b.published_ms-a.published_ms||String(a.event_id).localeCompare(String(b.event_id)));
 // Soft diversity: high-impact stories are never blocked to satisfy quotas.
 const cap=SOFT_PUBLISHER_CAP,counts=new Map(),regular=[],deferred=[];
 for(const e of visible){
  if(sort==='latest'){regular.push(e);continue;}
  const n=counts.get(e._owner)||0;
  if(e.priority>=9||n<cap){regular.push(e);counts.set(e._owner,n+1);}
  else deferred.push(e);
 }
 visible=[...regular,...deferred];
 const orderData=new TextEncoder().encode(visible.map(x=>x.event_id).join('|'));
 const digest=await crypto.subtle.digest('SHA-256',orderData);
 const feed_order_hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 const pageRows=visible.slice(offset,offset+limit).map(x=>x.row);
 // A native Hebrew source is already translated; do not require Workers AI
 // translation for its appearance in the Hebrew edition.
 const substitutions=new Map();
 if(lang==='he'){
  const hebrewChoices=[];
  for(const r of pageRows){
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
 const translated=await Promise.all(pageRows.map(async r=>{
  const alternative=substitutions.get(r.event_id);
  const row=alternative?{...r,...alternative,he_hash:null,he_title:null,he_body:null,he_comment:null,he_quality:null}:r;
  const t=await localizeNewsRow(env.NEWS_DB,row,lang);
  const native=lang==='he'&&hebrew(row.headline)&&t.content_language==='he';
  const available=t.content_language===lang&&(t.translation_status==='source'||t.translation_status==='available');
  const state=available?(native||t.translation_status==='source'?'original':'translated'):
    t.translation_status==='needs_review'?'needs_review':'pending';
  const label=state==='original'?(lang==='he'?'שפת המקור':'Оригинал'):
    state==='translated'?(lang==='he'?'תורגם':'Переведено'):
    state==='needs_review'?(lang==='he'?'בבדיקת תרגום':'Перевод проверяется'):
    lang==='he'?'ממתין לתרגום':'Перевод ожидается';
  return{event_id:r.event_id,id:r.id,canonical_article_id:r.id,display_article_id:row.id,source:row.source,
   headline:t.title,summary:t.body,comment:t.comment,url:row.url,
   published_ms:r.last_seen_ms,priority:r.event_priority,category:r.topic,
   content_language:t.content_language,source_language:t.source_language,translation_status:t.translation_status,
   translation_state:state,translation_label:label,translation_available:available,
   translation:{state,label,available,requested_language:lang,display_language:t.content_language},
   verification_status:r.verification_status,source_count:r.source_count,
   reporting_origin_count:r.origin_count,article_count:r.member_count,
   sources:JSON.parse(r.sources_json||'[]'),reason_codes:JSON.parse(r.reason_codes||'[]'),
   _owner:publisher(r.source)};
 }));
 const output=translated.map(({_owner,...rest},i)=>({...rest,feed_rank:offset+i}));
 return respond({requested_language:lang,articles:output,events:output,localized_count:output.filter(x=>x.content_language===lang).length,
  translation_summary:{available:output.filter(x=>x.translation_available).length,pending:output.filter(x=>x.translation_state==='pending').length,
    needs_review:output.filter(x=>x.translation_state==='needs_review').length},
  limit,offset,total_events:visible.length,feed_order_hash,next_offset:visible.length>offset+limit?offset+limit:null,ready_only:readyOnly,requested_ready_only:requestedReadyOnly,
  sort,grouping:'event_v1',status:'published',source_policy:'attributed_reporting_not_fact_verification'});
}
