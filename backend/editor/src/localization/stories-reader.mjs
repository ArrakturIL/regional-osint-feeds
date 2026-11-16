import {DAY,sourceText} from './shared.mjs';
import {respond,localized,fieldLocale} from './read-core.mjs';

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

export async function readLocalizedStories(env,lang,lim){
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
    return respond({requested_language:lang,stories:valid,localized_count:valid.filter(x=>x.localization_complete).length})
}
