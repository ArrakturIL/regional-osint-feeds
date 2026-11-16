import {createSourceIngestion} from './source-ingestion.mjs';
import {createAnalystDecision} from './editorial-decision.mjs';
import {readApi} from './public-api.mjs';
import {translatedForEditorial} from './translation.mjs';
import {readEditorCachedPair} from '../mirrors/collector-cache.mjs';
/** Regional Watch independent analyst editor.
 * No shared OSINT cron changes, no user interface modifications.
 * Sources are obtained via verified public GitHub collector mirror. Unsafe/absent
 * source text is never used to invent transcripts or auto-publish articles.
 */
const EDITOR_VERSION = 'analyst-editor-v1.1.2-translation';
const MODEL = '@cf/zai-org/glm-4.7-flash';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MAX_AI_PER_RUN = 3;
const MAX_AI_PER_DAY = 14;
const REGION = /(?:израил|иран|цахал|сша|вашингтон|пентагон|трамп|байден|американск|ближн(?:ий|его) восток|хусит|хезболл|хамас|йемен|ливан|сири|ирак|ормуз|залив|саудов|катар|иордан|иерусалим|тегеран|хаменеи|нетаньяху|iran|israel|tehran|middle east|centcom|pentagon|hormuz|hezbollah|houthi|gaza|idf|us military)/i;
const PROMO = /(?:рекламная интеграция|на правах рекламы|промокод|скидк[аи]|покупайте|подписывайтесь на наш|для рекламы|заказать рекламу|впн.*скидк)/i;
// Reject unambiguous multilingual commercial ads before spending Workers AI neurons.
function isCommercialAd(text, language) {
  const s=String(text||'');
  if(language==='he')return [/(?:בלאק נובמבר|מבצעי|במבצעים|הנחות|מבצעי|קופון|חינם|ללא עלות)/u,/(?:קונים עכשיו|קונים|לכל מבצעי|להזמין|לרכישה|ספה|פינת אוכל|מיטה|להשאיר פרטים)/u].every(re=>re.test(s));
  if(language==='ru')return /(?:промокод|на правах рекламы|рекламная интеграция|скидк|распродаж)/i.test(s)&&/(?:покупайте|закаж|товар|магазин|купить|продаж)/i.test(s);
  if(language==='en')return /(?:discount|coupon|black friday|sale price)/i.test(s)&&/(?:buy now|shop now|order today|special offer)/i.test(s);
  return false;
}
function plain(text, cap) { return String(text ?? '').replace(/\s+/g,' ').trim().slice(0,cap); }
function bodyWords(text) { return String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []; }
function similarity(a,b) {
  const aa = new Set(bodyWords(a)), bb = new Set(bodyWords(b));
  if (!aa.size || !bb.size) return 0;
  let same = 0; for (const x of aa) if (bb.has(x)) same++;
  return same / Math.min(aa.size,bb.size);
}
function assertString(v, min, max) { return typeof v === 'string' && v.length >= min && v.length <= max; }
function isoNow(ms) { return new Date(ms).toISOString(); }
const {sha256,readMirror,validateInput,insertItem}=createSourceIngestion({HOUR,DAY,plain,assertString});
const {validateDecision,aiDecision,reserveAi,decide}=createAnalystDecision({EDITOR_VERSION,MODEL,DAY,MAX_AI_PER_DAY,REGION,PROMO,isCommercialAd,plain,bodyWords,similarity,assertString,isoNow,translatedForEditorial});
// Rotate authors so one busy source cannot starve others.
function prioritizePending(rows) {
  const groups=new Map(),free=[];
  for(const row of rows){
   if(row.text_status!=='full_text'){free.push(row);continue;}
   const key=String(row.source_id||'unknown');
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(row);
  }
  const balanced=[...free];
  let remaining=rows.length-free.length;
  while(remaining>0){
   for(const queue of groups.values())if(queue.length){balanced.push(queue.shift());remaining--;}
  }
  return balanced;
 }
async function runEditor(env, time) {
  const db=env.DB;
  const now=Number.isFinite(time)?time:Date.now();
  const id=EDITOR_VERSION+':'+Math.floor(now/HOUR);
  const created=await db.prepare(`INSERT OR IGNORE INTO analyst_runs(id,started_at_ms,status)
    VALUES(?,?,'running')`).bind(id,now).run();
  if (created?.meta?.changes!==1) return;
  const stats={discovered:0,published:0,skipped:0,needs_data:0,errors:0,processed:0,partial_sources:0,budget_exhausted:0,pending_count:0};
  try {
    // If GitHub's source mirror is late, keep processing the D1 pending queue.
    let health=null,mirror=null,mirrorIssue=null;
    try {
      const cached=await readEditorCachedPair(env,'analysts',{nowMs:now,maxAgeMs:4*HOUR});
      if(cached){health=cached.status;mirror=cached.data;}
      else [health,mirror]=await Promise.all([
        readMirror('analyst-source-status.json'),readMirror('analyst-source-items.json')]);
    } catch(e){ mirrorIssue='mirror_fetch_failed: '+plain(e?.message,115); }
    if(!mirrorIssue){
      const checked=Date.parse(health?.checked_at), listed=Date.parse(mirror?.checked_at);
      if(health?.state==='error'||!Array.isArray(health?.sources)||!Array.isArray(mirror?.items)||
         mirror?.schema_version!==1||mirror.items.length>40||
         !Number.isFinite(checked)||!Number.isFinite(listed)||
         Math.abs(checked-listed)>15*60_000||now-checked>4*HOUR||checked>now+HOUR)
        mirrorIssue='mirror_missing_incomplete_or_stale';
    }
    if(mirrorIssue){health={state:'partial',sources:[]};mirror={items:[]};stats.partial_sources=1;}
    else stats.partial_sources=health.sources.filter(s=>s.state!=='ok').length;
    const enabledSources=await db.prepare(`SELECT s.id,s.analyst_id,s.type,s.canonical_prefix,s.language,a.display_name,a.enabled
      FROM analyst_sources s JOIN analysts a ON a.id=s.analyst_id WHERE s.enabled=1 AND a.enabled=1`).all();
    const sources=new Map((enabledSources.results||[]).map(s=>[s.id,s]));
    const analysts=new Map((enabledSources.results||[]).map(s=>[s.analyst_id,{id:s.analyst_id,name:s.display_name}]));
    const verified=new Set(health.sources.filter(s=>s.state==='ok').map(s=>s.source_id));
    const recentRows=await db.prepare(`SELECT headline,summary FROM analyst_publications WHERE status='published'
      AND published_at_ms>=? ORDER BY published_at_ms DESC LIMIT 35`).bind(now-30*DAY).all();
    const recent=recentRows.results||[];
    for (const raw of mirror.items) {
      const source=sources.get(raw.source_id), analyst=source&&analysts.get(source.analyst_id);
      if (!source||!analyst||!verified.has(source.id)) continue;
      const it=validateInput(raw,source,analyst,now);
      if (!it) {stats.errors++;continue;}
      // Validate the source-side content checksum so the public repository cannot silently
      // inject a different body under an existing revision hash.
      if (await sha256(it.body)!==it.content_hash && it.text_status==='full_text') {stats.errors++;continue;}
      const inserted=await insertItem(db,it,now);
      if (inserted) stats.discovered++;
    }
    // Close records that are too old to process; never leave eternal pending rows.
    await db.prepare("UPDATE analyst_items SET state='skipped',processed_at_ms=?,last_error='Outside seven-day freshness window' WHERE state='pending' AND source_published_at_ms<?")
      .bind(now,now-7*DAY).run();
    const pending=await db.prepare(`SELECT i.*,a.display_name AS analyst_name,s.language AS original_language FROM analyst_items i JOIN analysts a ON a.id=i.analyst_id JOIN analyst_sources s ON s.id=i.source_id
       WHERE i.state='pending' AND s.enabled=1 AND i.source_published_at_ms>=?
       ORDER BY i.source_published_at_ms ASC LIMIT 80`).bind(now-7*DAY).all();
    stats.pending_count=(pending.results||[]).length;
    let usedAi=0;
    for (const it of prioritizePending(pending.results||[])) {
      const mightUseAi=it.text_status==='full_text' &&
        it.body.length>=(it.original_language==='ru'?220:160) &&
        (it.original_language!=='ru'||REGION.test(it.body));
      if (mightUseAi) {
        const day=Math.floor(now/DAY)*DAY;
        const already=await db.prepare("SELECT item_id FROM analyst_ai_attempts WHERE item_id=? AND day_start_ms=?")
          .bind(it.id,day).first();
        // Previously attempted items must not spend this invocation's AI allowance.
        if (!already && usedAi>=MAX_AI_PER_RUN) continue;
        if (!already) usedAi++; // Count a new attempt even if translation/model later fails.
      }
      const original=it;
      if (original.state!=='pending') continue;
      try {
        const result=await decide(db,env,original,now,recent);
        // Continue with rules-only items under the existing daily AI cap.
        if (result==='budget_exhausted') {stats.budget_exhausted=1;continue;}
        if (result==='already_attempted') continue;
        if (result==='published') {
          const p=await db.prepare('SELECT headline,summary FROM analyst_publications WHERE item_id=?').bind(it.id).first();
          if (p) recent.unshift(p);
        }
        const stat=result==='skip'?'skipped':result;
        stats[stat]=(stats[stat]||0)+1; stats.processed++;
      } catch (e) {
        stats.errors++;
        await db.prepare(`UPDATE analyst_items SET last_error=?,last_attempt_at_ms=?,attempts=attempts+1,
           state=CASE WHEN attempts>=2 THEN 'needs_data' ELSE 'pending' END WHERE id=?`)
           .bind(plain(e?.message,150),now,it.id).run();
      }
    }
    await db.prepare(`UPDATE analyst_runs SET completed_at_ms=?,status=?,stats_json=? WHERE id=?`)
      .bind(Date.now(),stats.errors||stats.partial_sources||stats.budget_exhausted?'partial':'ok',JSON.stringify(stats),id).run();
    if(mirrorIssue)await db.prepare('UPDATE analyst_runs SET error_message=? WHERE id=?').bind(mirrorIssue,id).run();
  } catch(e) {
    await db.prepare(`UPDATE analyst_runs SET completed_at_ms=?,status='error',error_message=?,stats_json=? WHERE id=?`)
      .bind(Date.now(),plain(e?.message,200),JSON.stringify(stats),id).run();
  }
}
export default {
  async scheduled(controller,env) { await runEditor(env,controller.scheduledTime); },
  async fetch(request,env) { return readApi(request,env,EDITOR_VERSION); },
};
export const testHooks = {plain,similarity,validateInput,validateDecision,reserveAi,aiDecision};