import {reconcile} from './events.mjs';
import {translateTitles,translateIDF} from '../translations/scheduled.mjs';
import {generateComments} from '../editorial/ai-comments.mjs';
import {ingestNewsFeeds} from './ingestion.mjs';

export async function scan(env){
 const now=Date.now();
 const {runs,all,inserted}=await ingestNewsFeeds(env,now);
 let grouped={state:'pending'};
 try{grouped=await reconcile(env.NEWS_DB,now);}
 catch(e){grouped={state:'error',error:String(e).slice(0,170)};
   await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_event_filter_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms")
   .bind(grouped.error,Date.now()).run().catch(()=>{});
 }
 const translation=await translateTitles(env,now);

 const {commented,failures}=await generateComments(env,now);
 const idfTranslation=await translateIDF(env,now);
 const summary={updated_at:new Date(now).toISOString(),feeds:runs.map(x=>({name:x.name,state:x.state,http:x.http,items:x.items.length,error:x.error})),found:all.length,inserted,grouped,commented,comment_errors:failures,translated:translation.translated,translated_summaries:translation.summaries||0,idf_translated:idfTranslation.translated||0};
 await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_scan',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(JSON.stringify(summary),Date.now()).run();
 return summary;
}

