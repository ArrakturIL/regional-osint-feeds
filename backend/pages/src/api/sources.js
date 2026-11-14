// Source states describe polling outcomes, not proof of events.
export const SOURCE_LABELS=Object.freeze({
 adsb:'ADS-B',adsb_alt:'ADS-B резерв',ais:'AIS',centcom_dvids:'CENTCOM / DVIDS',
 easa:'EASA',fcdo:'FCDO',firms:'NASA FIRMS',idf_official:'ЦАХАЛ',
 marad_official:'MARAD',mscio:'UKMTO',polymarket:'Polymarket',
 sentinel_catalog:'Sentinel',state_dept:'Госдеп США'
});

export const ISO=ms=>Number.isFinite(Number(ms))&&Number(ms)>0?new Date(Number(ms)).toISOString():null;
const text=x=>typeof x==='string'?x.trim():'';
const validStatus=new Set(['ok','partial','empty','error','retired','key_missing']);
export function assembleSources(statusRows=[]){
 return statusRows.filter(row=>text(row.source)&&row.state!=='retired').map(row=>({
  id:row.source,label:SOURCE_LABELS[row.source]||row.source,
  state:validStatus.has(row.state)?row.state:'unknown',
  checkedAt:ISO(row.attempted_at),attemptedAt:ISO(row.attempted_at),succeededAt:ISO(row.succeeded_at),
  description:text(row.detail)
 })).sort((a,b)=>a.id.localeCompare(b.id,'en'));
}
