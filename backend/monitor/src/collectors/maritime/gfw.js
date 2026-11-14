import { json } from '../../api/json.js';
import { vessels } from './ais.js';
import { AIS } from '../../config/constants.js';
import { item } from '../../observations/item.js';
export async function gfwJson(env,path,body){
  let response;
  const headers={Authorization:'Bearer '+env.GFW_API_TOKEN,Accept:'application/json'};
  const opts={method:body?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(18000),headers};
  if(body){headers['Content-Type']='application/json';opts.body=JSON.stringify(body)}
  try{response=await fetch('https://gateway.api.globalfishingwatch.org'+path,opts)}catch{throw Error('GFW_network_unavailable')}
  if(!response.ok)throw Error('GFW_HTTP_'+response.status);
  if(!/application\/json/i.test(response.headers.get('content-type')||''))throw Error('GFW_invalid_content_type');
  const raw=await response.text();
  if(raw.length>900000)throw Error('GFW_large_response');
  let data;try{data=JSON.parse(raw)}catch{throw Error('GFW_invalid_json')}
  if(!data||typeof data!=='object')throw Error('GFW_unexpected_json');
  return data;
}
export async function gfwAuth(env,slot){
  if(!env.GFW_API_TOKEN)throw Error('GFW_token_missing');
  const data=await gfwJson(env,'/v3/vessels/search?query=7831410&datasets%5B0%5D=public-global-vessel-identity%3Alatest');
  if(!Array.isArray(data.entries))throw Error('GFW_auth_unknown_schema');
  return [item('verified-'+new Date(slot).toISOString().slice(0,10),{
    provider:'Global Fishing Watch',authentication:'ok',dataset:'public-global-vessel-identity:latest',
    tested_at:new Date(slot).toISOString(),note:'Public vessel search accepted token; separate SAR permission check required',
    documentation:'https://globalfishingwatch.org/our-apis/documentation/docs/quick-start'})];
}
export async function gfwSar(env,slot){
  if(!env.GFW_API_TOKEN)throw Error('GFW_token_missing');
  const day=86400000,start=new Date(slot-13*day).toISOString().slice(0,10);
  const end=new Date(slot-6*day).toISOString().slice(0,10);
  const bbox=[55.2,24.8,59.4,28.2], [w,s,e,n]=bbox;
  const path='/v3/4wings/report?format=JSON&datasets%5B0%5D=public-global-sar-presence%3Alatest'
   +'&filters%5B0%5D='+encodeURIComponent("matched='false'")
   +'&temporal-resolution=ENTIRE&spatial-resolution=LOW&date-range='+start+'%2C'+end;
  const poly={type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]};
  const data=await gfwJson(env,path,{geojson:poly});
  if(!Array.isArray(data.entries)||data.entries.length>2)throw Error('GFW_sar_schema');
  const doc=data.entries[0]||{},key=Object.keys(doc).find(k=>k.startsWith('public-global-sar-presence:'));
  const rows=key?doc[key]:[];
  if(!Array.isArray(rows)||rows.length>1500)throw Error('GFW_sar_rows_limit');
  let detections=0,cells=0;const top=[];
  for(const r of rows){
    if(!Number.isFinite(r?.detections)||r.detections<0)continue;
    detections+=r.detections;cells++;
    if(Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&r.detections>0&&r.lon>=w-1&&r.lon<=e+1&&r.lat>=s-1&&r.lat<=n+1)
      top.push({lat:r.lat,lon:r.lon,detections:r.detections,date:String(r.date||'').slice(0,22)});
  }
  top.sort((a,b)=>b.detections-a.detections);
  return [item('hormuz-unmatched-'+start+'-'+end,{
    analysis_type:'satellite_sar_unmatched_ais',provider:'Global Fishing Watch',
    dataset:'public-global-sar-presence:latest',satellite:'Sentinel-1',
    region:'Strait of Hormuz adjacent maritime zone',bbox_wsen:bbox,
    observation_start:start,observation_end:end,checked_at:new Date(slot).toISOString(),
    unmatched_ais_detections:detections,grid_cells:cells,top_grid_cells:top.slice(0,20),
    coverage:'Satellite acquisitions are spatially and temporally incomplete; updates ~5 days delayed',
    uncertainty:'Unmatched with AIS is NOT proof of AIS-off or military identity; detections are NOT unique vessels',
    source_url:'https://globalfishingwatch.org/our-apis/',
    attribution:'Global Fishing Watch',assessment:'algorithmic satellite detections, not verified incident'})];
}


// Copernicus EMS: public analysis-product metadata mirrored through GitHub (no source inference).
