// Pages /api/overview — read-only CORE D1 aggregator.
// Source-of-truth: monitor_runs, monitor_events, source_status.
// Keep public API keys stable; never infer confirmed incidents from monitor claims.
export const SOURCE_LABELS=Object.freeze({
 adsb:'ADS-B',adsb_alt:'ADS-B резерв',ais:'AIS',centcom_dvids:'CENTCOM / DVIDS',
 easa:'EASA',fcdo:'FCDO',firms:'NASA FIRMS',idf_official:'ЦАХАЛ',
 marad_official:'MARAD',mscio:'UKMTO',polymarket:'Polymarket',
 sentinel_catalog:'Sentinel',state_dept:'Госдеп США'
});
const ISO=ms=>Number.isFinite(Number(ms))&&Number(ms)>0?new Date(Number(ms)).toISOString():null;
const parse=s=>{try{return JSON.parse(s||'{}')}catch{return{}}};
const text=x=>typeof x==='string'?x.trim():'';
const validStatus=new Set(['ok','partial','empty','error','retired','key_missing']);
const analysisSchema=Object.freeze({
 no_alert:{state:'normal',badge:'БЕЗ НОВЫХ ПРЕДУПРЕЖДЕНИЙ',title:'Новых существенных сигналов не выявлено',description:'Последний анализ не нашёл оснований для нового оповещения. Это не означает отсутствия рисков.'},
 alert:{state:'attention',badge:'ТРЕБУЕТ ВНИМАНИЯ',title:'Изменения требуют дополнительной оценки',description:'Не все сведения подтверждены. Проверяй первоисточники.'}
});
export function assembleOverview({latestRun=null,eventRows=[],statusRows=[],nowMs=Date.now()}={}){
 const outcome=text(latestRun?.outcome);
 const base=analysisSchema[outcome]||{state:'unknown',badge:'СТАТУС НЕДОСТУПЕН',title:'Последний анализ недоступен',description:'Последние результаты мониторинга сейчас нельзя проверить.'};
 const analysis={time:ISO(latestRun?.recorded_at_ms),...base,reason:'',link:null};
 const events=eventRows.slice(0,6).map(row=>{
  const raw=parse(row.payload);
  const title=text(raw.title_ru)||'Событие';
  const description=text(raw.summary_ru)||text(raw.finding)||text(raw.assessment)||'';
  return{id:String(row.event_id||''),type:'analysis',title,description,date:ISO(row.updated_at_ms),link:null};
 });
 const sources=statusRows.filter(row=>text(row.source)&&row.state!=='retired').map(row=>({
  id:row.source,label:SOURCE_LABELS[row.source]||row.source,
  state:validStatus.has(row.state)?row.state:'unknown',
  checkedAt:ISO(row.attempted_at),attemptedAt:ISO(row.attempted_at),succeededAt:ISO(row.succeeded_at),
  description:text(row.detail)||null
 })).sort((a,b)=>a.id.localeCompare(b.id,'en'));
 return{generatedAt:ISO(nowMs),analysis,events,sources,available:sources.filter(x=>x.state==='ok'||x.state==='partial').length,total:sources.length};
}
export async function overviewFromD1(env,nowMs=Date.now()){
 const db=env.DB;
 if(!db?.batch)throw new Error('Missing CORE DB binding');
 const [latest,events,status]=await db.batch([
  db.prepare('SELECT outcome,payload,recorded_at_ms FROM monitor_runs ORDER BY recorded_at_ms DESC LIMIT 1'),
  db.prepare('SELECT event_id,category,first_seen,payload,updated_at_ms FROM monitor_events ORDER BY updated_at_ms DESC LIMIT 6'),
  db.prepare('SELECT source,attempted_at,succeeded_at,state,detail FROM source_status ORDER BY source')
 ]);
 return assembleOverview({latestRun:latest.results?.[0]||null,eventRows:events.results||[],statusRows:status.results||[],nowMs});
}
