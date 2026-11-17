import {enrichNewMonitorStories} from './stories/enrichment.mjs';
import analystService from './analysts/editor.mjs';
import {meteredAI} from './ai/budget.mjs';
import localization from './localization/localization.mjs';
import {readNewsEvents} from './news/api.mjs';
import {translationQueue,importTranslationMirror} from './translations/news-mirror.mjs';
import {articlePriority} from './news/normalization.mjs';
import {scan} from './news/scan.mjs';
import {readOfficialPosts} from './api/official-posts.mjs';
import {readMonitorChanges} from './api/monitor-changes.mjs';

const REGION=/iran|israel|israeli|hezbollah|lebanon|gaza|hamas|syria|syrian|yemen|houthi|red sea|middle east|iraq|idf|centcom|hormuz|netanyahu|tehran|jerusalem|tel aviv|persian gulf|khamenei|trump.*(iran|israel)/i;
// High-impact headline terms are token-boundary checked in news-normalization.mjs.
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
    // B1: every AI pipeline draws from one shared daily neuron pool.
    const aiEnv={...env, AI: meteredAI(env.AI, env.NEWS_DB)};
    ctx.waitUntil(scan(aiEnv));
    ctx.waitUntil(archiveExpiredPolymarket(env.CORE_DB,Date.now()));
    ctx.waitUntil(localization.scheduled(aiEnv,event.scheduledTime));
    if(new Date(event.scheduledTime).getUTCMinutes()%15===0)ctx.waitUntil(importTranslationMirror(env));
    if(new Date(event.scheduledTime).getUTCMinutes()%15===5){ctx.waitUntil(enrichNewMonitorStories(aiEnv));}
    // The analyst mirror refreshes hourly at :17 UTC. Run its editor at :30 UTC.
    // An hourly D1 run ID provides additional duplicate-run protection.
    if (new Date(event.scheduledTime).getUTCMinutes() === 30) {
      // Keep the full env: the analysts cache reader needs CORE_DB and
      // REGIONAL_EDITOR_CACHE_SOURCES, not only the queue DB alias (E-01).
      ctx.waitUntil(analystService.scheduled(event, {...aiEnv, DB: env.CORE_DB}));
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
