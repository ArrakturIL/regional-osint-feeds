import {factualTranslationIssue} from '../translations/fact-guard.mjs';
import {semanticMeaningIssue} from '../translations/semantic-meaning.mjs';
import {shouldSuppressComment,safePublishedComment} from '../editorial/comment-policy.mjs';
import {DAY,val,sourceText,fingerprint} from './shared.mjs';
import {translateScheduled} from './scheduled.mjs';
export {fingerprint} from './shared.mjs';
// REGIONAL WATCH: locale-aware public readers, no client-side credentials.
const HEADERS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type','X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=60'};
function respond(body,code=200){return Response.json(body,{status:code,headers:HEADERS});}
function locale(request){const l=new URL(request.url).searchParams.get('lang')||'ru';return l==='ru'||l==='he'?l:null;}
// Field metadata describes displayed text, never changes source text or provenance.
function fieldLocale(record,fields,lang,state){
  const field_languages={},field_translation_status={};
  for(const key of fields){
    const text=String(record[key]||'').trim();
    const ru=/[\u0400-\u04ff]/u.test(text),he=/[\u0590-\u05ff]/u.test(text);
    const detected=!text?null:ru&&he?'mul':ru?'ru':he?'he':/[\u0600-\u06ff]/u.test(text)?'ar':/[A-Za-z]/u.test(text)?'en':'und';
    field_languages[key]=detected;
    field_translation_status[key]=!text?'not_applicable':detected!==lang?'pending':
      state==='needs_review'?'needs_review':state==='available'?'available':'source';
  }
  const complete=Object.values(field_languages).every(x=>x===null||x===lang);
  return{field_languages,field_translation_status,translation_status:state==='needs_review'?state:complete?state:'pending',localization_complete:complete&&state!=='needs_review'&&state!=='pending'};
}
async function localized(db,kind,id,original,lang,prefilled=null){
  if(lang==='ru'){
    const detected=/[\u0400-\u04ff]/u.test(original.title+original.body)?'ru':/[\u0590-\u05ff]/u.test(original.title+original.body)?'he':'en';
    return {...original,content_language:detected,translation_status:detected==='ru'?'source':'pending'};
  }
  const h=await fingerprint(original);
  const t=prefilled||await db.prepare("SELECT source_hash,title,body,commentary,quality_score FROM regional_i18n WHERE kind=? AND item_id=? AND language='he'").bind(kind,id).first();
  if(t&&t.source_hash===h&&t.quality_score>=85&&/[\u0590-\u05ff]/u.test(t.title||'')
     &&(!original.body||/[\u0590-\u05ff]/u.test(t.body||''))){
    const mismatch=factualTranslationIssue(original,{title:t.title,body:t.body,comment:t.commentary||''});
    if(!mismatch)return{title:t.title,body:t.body,comment:t.commentary||'',content_language:'he',translation_status:'available'};
    // Fail closed: a high confidence score is not proof of accurate attribution.
    return {...original,content_language:/[\u0400-\u04ff]/u.test(original.title+original.body)?'ru':'en',
      translation_status:'needs_review'};
  }
  return {...original,content_language:/[\u0400-\u04ff]/u.test(original.title+original.body)?'ru':'en',translation_status:'pending'};
}

/** One trusted localization contract for event and legacy news responses. */
export async function localizeNewsRow(db,row,lang){
  // The original article language is derived from its original fields, never
  // from headline_ru or a model's self-reported quality score.
  const sourceTitle=val(row.headline,260),sourceBody=val(row.summary,650);
  const originalLanguage=/[\u0590-\u05ff]/u.test(sourceTitle)?'he':
    /[\u0400-\u04ff]/u.test(sourceTitle)?'ru':'en';
  const original={title:sourceTitle,body:sourceBody,
    comment:val(safePublishedComment(row,row.comment),300)};
  if(lang==='ru'){
    if(originalLanguage==='ru')return{...original,content_language:'ru',
      source_language:'ru',translation_status:'source'};
    const title=val(row.headline_ru,260),body=val(row.summary_ru,650);
    // A partly translated record is not presented as a complete translation.
    if(!title||!/[\u0400-\u04ff]/u.test(title)||(sourceBody&&!body))
      return{...original,content_language:originalLanguage,
        source_language:originalLanguage,translation_status:'pending'};
    const issue=semanticMeaningIssue(sourceTitle,title)||
      (sourceBody&&body?semanticMeaningIssue(sourceBody,body):null);
    if(issue)return{...original,content_language:originalLanguage,
      source_language:originalLanguage,translation_status:'needs_review',review_reason:issue};
    return{...original,title,body:body||sourceBody,content_language:'ru',
      source_language:originalLanguage,translation_status:'available'};
  }
  if(lang==='he'&&originalLanguage==='he'&&
     (!sourceBody||/[\u0590-\u05ff]/u.test(sourceBody)))
    return{...original,content_language:'he',source_language:'he',translation_status:'source'};
  const cached=row.he_hash?{source_hash:row.he_hash,title:row.he_title,body:row.he_body,
    commentary:row.he_comment,quality_score:row.he_quality}:null;
  const result=await localized(db,'news',row.id,sourceText('news',row),lang,cached);
  const issue=lang==='he'&&result.translation_status==='available'?
    semanticMeaningIssue(sourceTitle,result.title)||
    (sourceBody&&result.body?semanticMeaningIssue(sourceBody,result.body):null):null;
  if(issue)return{...original,content_language:originalLanguage,
    source_language:originalLanguage,translation_status:'needs_review',review_reason:issue};
  return {...(shouldSuppressComment(row)?{...result,comment:''}:result),
    source_language:originalLanguage};
}

/** Locale-invariant provenance. Never regenerate dates or source links by AI. */
export function storyProvenance(data){
  const validUrl=value=>{
    if(typeof value!=='string'||value.length>2048)return null;
    try{
      const u=new URL(value);
      if(u.protocol!=='https:'||u.username||u.password||!u.hostname||
        /^(?:localhost|127[.]|10[.]|192[.]168[.]|169[.]254[.]|0[.])/.test(u.hostname))return null;
      return value;
    }catch{return null}
  };
  const sources=[];
  const seen=new Set();
  const add=(url,type)=>{
    const safe=validUrl(url);
    if(safe&&!seen.has(safe)){
      sources.push({url:safe,type:typeof type==='string'?type.slice(0,100):'source'});
      seen.add(safe);
    }
  };
  for(const item of Array.isArray(data.sources)?data.sources:[]){
    if(typeof item==='string')add(item,'source');
    else if(item&&typeof item==='object')add(item.url,item.type);
  }
  // Include source_urls emitted by the monitor and retain HTTPS validation/dedup.
  for(const item of Array.isArray(data.source_urls)?data.source_urls:[]){
    if(typeof item==='string')add(item,'listed_source');
    else if(item&&typeof item==='object')add(item.url,item.type);
  }
  add(data.source, 'primary');
  add(data.source_url,'primary');
  add(data.url,'primary');
  // Preserve partial dates like 2026-09; inventing a day would be worse.
  const occurredAt=data.occurred_at||data.incident_date||data.event_date||
    data.first_report_date||data.published_date||null;
  const announcedAt=data.announced_at||
    (data.incident_date?data.event_date:null)||data.first_report_date||null;
  return{
    event_date:occurredAt,occurred_at:occurredAt,
    announced_at:announcedAt,
    published_at:data.published_date||null,
    source_date:data.first_report_date||null,
    collected_at:data.first_observed_by_monitor||data.first_verified_monitor_cycle||null,
    source:data.source||null,
    sources,source_urls:sources.map(x=>x.url),
    url:sources[0]?.url||null
  };
}

export async function fetchLocalized(request,env,analystService){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  if(request.method!=='GET')return respond({error:'read_only'},405);
  const lang=locale(request);
  if(!lang)return respond({error:'unsupported_language',supported:['ru','he']},400);
  const url=new URL(request.url),path=url.pathname;
  const rawLimit=url.searchParams.get('limit'),rawOffset=url.searchParams.get('offset');
  const positiveInt=v=>v!==null&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v));
  if(rawLimit!==null&&(!positiveInt(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>40))
    return respond({error:'invalid_limit',message:'limit must be an integer from 1 to 40'},400);
  if(rawOffset!==null&&(!positiveInt(rawOffset)||Number(rawOffset)>2000))
    return respond({error:'invalid_offset',message:'offset must be an integer from 0 to 2000'},400);
  const lim=rawLimit===null?20:Number(rawLimit);
  if(path==='/api/languages')return respond({default:'ru',supported:['ru','he'],requested_language:lang,direction:{ru:'ltr',he:'rtl'}});
  if(path==='/api/news'){
    const offset=rawOffset===null?0:Number(rawOffset);
    const readyOnly=lang==='he'&&['1','true'].includes(url.searchParams.get('ready_only'));
    const base="SELECT n.id,n.source,n.headline,n.headline_ru,n.summary,n.summary_ru,n.comment,n.url,n.published_ms,n.priority";
    const extra=",t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality";
    const from=" FROM news_items n LEFT JOIN regional_i18n t ON t.kind='news' AND t.item_id=n.id AND t.language='he'";
    const sql=lang==='he'?base+extra+from+" WHERE n.published_ms>=?"+(readyOnly?" AND t.quality_score>=85":"")
      +(readyOnly?" ORDER BY n.priority DESC,n.published_ms DESC":" ORDER BY (t.item_id IS NOT NULL) DESC,n.priority DESC,n.published_ms DESC")+" LIMIT ? OFFSET ?"
      :base+" FROM news_items n WHERE n.published_ms>=? ORDER BY n.priority DESC,n.published_ms DESC LIMIT ? OFFSET ?";
    const rows=await env.NEWS_DB.prepare(sql).bind(Date.now()-7*DAY,lim,offset).all();
    const articles=await Promise.all((rows.results||[]).map(async n=>{
      const cache=lang==='he'?{source_hash:n.he_hash,title:n.he_title,body:n.he_body,commentary:n.he_comment,quality_score:n.he_quality}:null;
      const t=await localizeNewsRow(env.NEWS_DB,n,lang);
      return{id:n.id,source:n.source,headline:t.title,summary:t.body,comment:t.comment,url:n.url,published_ms:n.published_ms,priority:n.priority,content_language:t.content_language,translation_status:t.translation_status};
    }));
    const visible=readyOnly?articles.filter(x=>x.content_language==='he'&&x.translation_status==='available'):articles;
    return respond({requested_language:lang,articles:visible,localized_count:visible.filter(x=>x.content_language===lang).length,
      limit:lim,offset,next_offset:rows.results?.length===lim?offset+lim:null,ready_only:readyOnly});
  }
  if(path==='/api/editorial-notes'){
    const cols="SELECT n.id,n.headline,n.text,n.source_url,n.published_ms,n.author,n.verified_note";
    const joined=" FROM editorial_notes n LEFT JOIN regional_i18n t ON t.kind='editorial' AND t.item_id=n.id AND t.language='he'";
    const ext=",t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality";
    const sql=lang==='he'?cols+ext+joined+" ORDER BY n.published_ms DESC LIMIT ?":cols+" FROM editorial_notes n ORDER BY n.published_ms DESC LIMIT ?";
    const rows=await env.NEWS_DB.prepare(sql).bind(lim).all();
    const notes=await Promise.all((rows.results||[]).map(async n=>{
      const cache=lang==='he'?{source_hash:n.he_hash,title:n.he_title,body:n.he_body,commentary:n.he_comment,quality_score:n.he_quality}:null;
      const t=await localized(env.NEWS_DB,'editorial',n.id,sourceText('editorial',n),lang,cache);
      const note={id:n.id,headline:t.title,text:t.body,source_url:n.source_url,published_ms:n.published_ms,author:n.author,verified_note:n.verified_note,content_language:t.content_language};
      return{...note,...fieldLocale(note,['headline','text','verified_note'],lang,t.translation_status)};
    }));
    return respond({requested_language:lang,notes,localized_count:notes.filter(x=>x.localization_complete).length});
  }
  if(path==='/api/stories'){
    const cols="SELECT n.event_id,n.payload,n.updated_at_ms";
    const joined=" FROM monitor_events n LEFT JOIN regional_i18n t ON t.kind='story' AND t.item_id=n.event_id AND t.language='he'";
    const ext=",t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality";
    const sql=lang==='he'?cols+ext+joined+" WHERE n.updated_at_ms>=? ORDER BY n.updated_at_ms DESC LIMIT ?":
      cols+" FROM monitor_events n WHERE n.updated_at_ms>=? ORDER BY n.updated_at_ms DESC LIMIT ?";
    const rows=await env.CORE_DB.prepare(sql).bind(Date.now()-45*DAY,lim).all();
    const stories=await Promise.all((rows.results||[]).map(async n=>{
      let data;try{data=JSON.parse(n.payload)}catch{return null}
      const original=sourceText('story',data);
      if(!original.title)return null;
      const cache=lang==='he'?{source_hash:n.he_hash,title:n.he_title,body:n.he_body,commentary:n.he_comment,quality_score:n.he_quality}:null;
      const t=await localized(env.CORE_DB,'story',n.event_id,original,lang,cache);
      const story={id:n.event_id,title:t.title,summary:t.body,
        ...storyProvenance(data),category:data.category||null,updated_at_ms:n.updated_at_ms,
        content_language:t.content_language};
      return{...story,...fieldLocale(story,['title','summary'],lang,t.translation_status)};
    }));
    const valid=stories.filter(Boolean);
    return respond({requested_language:lang,stories:valid,localized_count:valid.filter(x=>x.localization_complete).length});
  }
  if(path==='/api/analysts'||path==='/api/analyst-posts'||/^\/api\/analyst-posts\/[a-z0-9-]+$/.test(path)){
    const r=await analystService.fetch(request,{DB:env.CORE_DB,AI:env.AI});
    if(!r.ok)return r;
    const old=await r.json(),profiles=path==='/api/analysts',detail=!profiles&&path!=='/api/analyst-posts';
    const items=profiles?(old.analysts||[]):detail?[old]:(old.posts||[]);
    const kind=profiles?'profile':'analyst';
    const ids=items.map(x=>x?.id).filter(x=>typeof x==='string'&&x.length<=180).slice(0,100);
    const cached=new Map();
    if(ids.length){
      const sql="SELECT item_id,source_hash,title,body,commentary,quality_score FROM regional_i18n WHERE kind=? AND language='he' AND item_id IN ("+ids.map(()=>'?').join(',')+")";
      const rows=await env.CORE_DB.prepare(sql).bind(kind,...ids).all();
      for(const t of rows.results||[])cached.set(t.item_id,t);
    }
    const translated=await Promise.all(items.map(async item=>{
      const t=await localized(env.CORE_DB,kind,item.id,sourceText(kind,item),lang,cached.get(item.id)||{});
      const displayLanguage=t.content_language;
      const native=displayLanguage===lang&&t.translation_status==='source';
      const state=native?'original':t.translation_status==='available'?'translated':
        t.translation_status==='needs_review'?'needs_review':'pending';
      const available=state==='original'||state==='translated';
      const label=state==='original'?(lang==='he'?'שפת המקור':'Оригинал'):
        state==='translated'?(lang==='he'?'תורגם':'Переведено'):
        state==='needs_review'?(lang==='he'?'בבדיקת תרגום':'Перевод проверяется'):
        (lang==='he'?'ממתין לתרגום':'Перевод ожидается');
      const attrs={content_language:displayLanguage,translation_status:t.translation_status,
        translation_state:state,translation_label:label,translation_available:available,
        requested_language:lang,source_language:item.original_language||'ru',
        translation:{state,label,available,requested_language:lang,display_language:displayLanguage,source_language:item.original_language||'ru'}};
      return profiles?{...item,display_name:t.title,description:t.body,...attrs}:
        {...item,headline:t.title,summary:t.body,short_quote:t.comment,...attrs};
    }));
    if(profiles)return respond({requested_language:lang,analysts:translated});
    if(detail)return respond(translated[0]);
    return respond({requested_language:lang,posts:translated,post_count:translated.length,
      localized_count:translated.filter(x=>x.content_language===lang).length,
      translation_summary:{available:translated.filter(x=>x.translation_available).length,
        pending:translated.filter(x=>x.translation_state==='pending').length,
        needs_review:translated.filter(x=>x.translation_state==='needs_review').length,
        original:translated.filter(x=>x.translation_state==='original').length,
        translated:translated.filter(x=>x.translation_state==='translated').length},
      disclaimer:lang==='he'?'פרשנויות הכותבים אינן בהכרח עובדות שאומתו באופן עצמאי.':
        'Авторские аналитические материалы, утверждения требуют независимой проверки.'});
  }
  return respond({error:'not_found'},404);
}

export default {fetch:fetchLocalized,scheduled:translateScheduled};
