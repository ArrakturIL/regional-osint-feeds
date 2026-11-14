import { h, t, useEffect, useState } from '../../app/runtime.js';
import { External } from '../External/External.js';
import { Head } from '../SectionHead/Head.js';
export function AviationExplainedV2(){
 const [data,setData]=useState(null);
 useEffect(()=>{let alive=true;const controller=new AbortController();
 async function reload(){try{const r=await fetch("/api/rw/aviation",{cache:"no-store",signal:controller.signal});if(r.ok){const v=await r.json();if(alive)setData(v)}}catch(e){console.debug("Aviation advisory unavailable",e)}}
 reload();const timer=setInterval(()=>{if(!document.hidden)reload()},300000);
 return()=>{alive=false;clearInterval(timer);controller.abort()};
 },[]);
 if(!data||data.display_policy!=="show"||data.has_publishable_content===false)return null;
 const signals=(data.signals||[]).filter(x=>x.category==="official_aviation_advisory");
 if(!signals.length)return null;
 return h("section",{className:"section",id:"aviation"},h(Head,{title:"Официальные авиационные уведомления",sub:"Только действительные публикации EASA; разовые ADS-B снимки скрыты"}),
 h("div",{className:"rw-relevance-cards"},...signals.slice(0,8).map(x=>h("article",{className:"rw-relevance",key:x.id},
  t("span","kicker",x.source?.name||"EASA"),t("h3",null,x.title),
  t("p",null,x.description),x.caveat?t("small",null,x.caveat):null,
  x.source?.url?h(External,{url:x.source.url},"Официальный источник ↗"):null))));
}
