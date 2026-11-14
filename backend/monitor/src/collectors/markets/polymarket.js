import { json } from '../../api/json.js';
import { get } from '../../network/http.js';
import { item } from '../../observations/item.js';
export const POLY_QUERIES=["Iran","Israel"];
export async function polymarketSnapshots(env,slot){
  const results=await Promise.allSettled(POLY_QUERIES.map(async q=>{
    const url="https://gamma-api.polymarket.com/public-search?q="+encodeURIComponent(q)+"&limit_per_type=12&events_status=active&search_profiles=false";
    const data=await get(url,"json");
    if(!data||!Array.isArray(data.events))throw new Error("unexpected Polymarket search response");
    return data.events;
  }));
  const missing=POLY_QUERIES.filter((_,i)=>results[i].status==="rejected");
  if(missing.length===POLY_QUERIES.length)throw new Error("upstream Polymarket search unavailable");
  const entries=[],seen=new Set();
  for(const r of results){
    if(r.status!=="fulfilled")continue;
    for(const event of r.value){
      const title=String(event.title||"");
      if(!/\b(iran|israel|hormuz|hezbollah|lebanon|middle east|gulf|houthi)\b/i.test(title))continue;
      if(event.closed||!event.active)continue;
      for(const m of Array.isArray(event.markets)?event.markets.slice(0,15):[]){
        if(entries.length>=45)break;
        if(m.closed||!m.active||!m.id||!event.id)continue;
        const endAt=Date.parse(String(m.endDate||event.endDate||""));
        if(Number.isFinite(endAt)&&endAt<=Date.now())continue;
        const k=String(event.id)+"/"+String(m.id);
        if(seen.has(k))continue;
        seen.add(k);
        let outcomes=m.outcomes,prices=m.outcomePrices;
        try{if(typeof outcomes==="string")outcomes=JSON.parse(outcomes)}catch{}
        try{if(typeof prices==="string")prices=JSON.parse(prices)}catch{}
        const numeric=Array.isArray(prices)?prices.slice(0,8).map(x=>Number.isFinite(Number(x))?Number(x):null):[];
        entries.push(item(k+"/"+slot,{
          url:"https://polymarket.com/event/"+encodeURIComponent(String(event.slug||"")),
          event_id:String(event.id),market_id:String(m.id),
          event:title.slice(0,200),question:String(m.question||"").slice(0,240),
          outcomes:Array.isArray(outcomes)?outcomes.slice(0,8):[],
          outcome_prices:numeric,volume_24h:Number(m.volume24hr||event.volume24hr||0),
          liquidity:Number(m.liquidity||0),ends_at:m.endDate||event.endDate||null,
          source:"Polymarket Gamma public-search",snapshot_at:slot,
          caveat:"Market prices reflect trader sentiment and settlement rules; not verified evidence of impending attacks."
        }));
      }
      if(entries.length>=45)break;
    }
  }
  return {entries,missing};
}

// The official news RSS is reachable, but may stop publishing for months.
// Never promote an archival item to a new event just because polling resumed.
