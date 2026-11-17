import {readFileSync} from 'node:fs';

// Preserve the original RU/IDF scheduled translator exactly. Only the RU
// candidate SELECT, its bound cutoff, and the two tested atomic budget claims may differ.
export function reconstructOriginalRuTranslator(){
 let source=readFileSync(new URL('../../backend/editor/src/translations/scheduled.mjs',import.meta.url),'utf8');
 function undo(next,previous,label){
   if(!source.includes(next))throw Error('Unexpected RU selection source boundary: '+label);
   source=source.replace(next,previous);
 }
 undo(
  '  const query="SELECT n.id,n.headline,n.summary,n.headline_ru FROM news_items n WHERE ((n.priority>=7 AND n.published_ms>?) OR n.id IN (SELECT g.representative_id FROM news_event_groups g WHERE g.priority>=4 AND g.last_seen_ms>?)) AND (n.headline_ru IS NULL OR (n.summary_ru IS NULL AND length(n.summary)>10)) ORDER BY n.published_ms DESC LIMIT 22";',
  '  const query="SELECT id,headline,summary,headline_ru FROM news_items WHERE priority>=7 AND published_ms>? AND (headline_ru IS NULL OR (summary_ru IS NULL AND length(summary)>10)) ORDER BY published_ms DESC LIMIT 22";',
  'candidate SQL'
 );
 undo(
  '  const rows=(await env.NEWS_DB.prepare(query).bind(now-36*3600000,now-36*3600000).all()).results||[];',
  '  const rows=(await env.NEWS_DB.prepare(query).bind(now-36*3600000).all()).results||[];',
  'query cutoff bindings'
 );
 undo(
  '  const claimed=await env.NEWS_DB.prepare("UPDATE news_translation_budget SET batches=batches+1,estimated_neurons=estimated_neurons+125,updated_ms=? WHERE day_utc=? AND batches<20 AND estimated_neurons<2500").bind(now,day).run();\n  if(claimed.meta?.changes!==1)return {translated:0,summaries:0,budget:"limit"};',
  '  await env.NEWS_DB.prepare("UPDATE news_translation_budget SET batches=batches+1,estimated_neurons=estimated_neurons+125,updated_ms=? WHERE day_utc=?").bind(now,day).run();',
  'atomic RU reservation'
 );
 undo(
  '  const claimed=await env.NEWS_DB.prepare("UPDATE official_translation_budget SET batches=batches+1,estimated_neurons=estimated_neurons+125,updated_ms=? WHERE day_utc=? AND batches<12 AND estimated_neurons<1500").bind(now,day).run();\n  if(claimed.meta?.changes!==1)return {translated:0,budget:"limit"};',
  '  await env.NEWS_DB.prepare("UPDATE official_translation_budget SET batches=batches+1,estimated_neurons=estimated_neurons+125,updated_ms=? WHERE day_utc=?").bind(now,day).run();',
  'atomic IDF reservation'
 );
 return source;
}
