import { gfwJson } from './gfw.js';
import { AIS } from '../../config/constants.js';
import { item } from '../../observations/item.js';
export async function gfwSarBaseline(env,slot){
  if(!env.GFW_API_TOKEN)throw Error('GFW_token_missing');
  const day=86400000,start=new Date(slot-21*day).toISOString().slice(0,10);
  const end=new Date(slot-14*day).toISOString().slice(0,10);
  const bbox=[55.2,24.8,59.4,28.2],[w,s,e,n]=bbox;
  const path='/v3/4wings/report?format=JSON&datasets%5B0%5D=public-global-sar-presence%3Alatest'
    +'&filters%5B0%5D='+encodeURIComponent("matched='false'")
    +'&temporal-resolution=ENTIRE&spatial-resolution=LOW&date-range='+start+'%2C'+end;
  const poly={type:'Polygon',coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]};
  const reply=await gfwJson(env,path,{geojson:poly});
  if(!Array.isArray(reply.entries)||reply.entries.length>2)throw Error('GFW_baseline_invalid_entries');
  const record=reply.entries[0]||{};
  const key=Object.keys(record).find(k=>k.startsWith('public-global-sar-presence:'));
  if(!key)throw Error('GFW_baseline_dataset_missing');
  const rows=record[key];
  if(!Array.isArray(rows)||rows.length>1500)throw Error('GFW_baseline_rows_limit');
  let detections=0,cells=0;
  for(const r of rows){
    if(!Number.isFinite(r?.detections)||r.detections<0)continue;
    detections+=r.detections;cells++;
  }
  return [item('hormuz-unmatched-baseline-'+start+'-'+end,{
    analysis_type:'sar_previous_period_baseline',provider:'Global Fishing Watch',
    dataset:'public-global-sar-presence:latest',
    region:'Strait of Hormuz adjacent maritime zone',
    bbox_wsen:bbox,
    observation_start:start,observation_end:end,
    unmatched_ais_detections:detections,grid_cells:cells,
    checked_at:new Date(slot).toISOString(),
    source_url:'https://globalfishingwatch.org/our-apis/',
    confidence:'algorithmic_unverified',
    caveat:'Sampling coverage, SAR acquisitions and AIS matching vary; difference in raw counts is not a change in ship traffic.'
  })];
}

