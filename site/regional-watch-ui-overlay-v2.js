// REGIONAL WATCH UI hotfix, 2026-11-11.
// Read-only edge overlay: preserves the working Pages API via its immutable deployment.
// Roll back the Pages deployment to remove all changes.
// Version 2: source-backed enhancement of the 2026-11-11 production overlay.
const BASE = "https://f5a75117.regional-watch.pages.dev";
const IMPORTANCE_JS="\n;(()=>{\"use strict\";\nconst levels={critical:[\"Критично\",\"critical\"],high:[\"Высокий приоритет\",\"high\"],medium:[\"Средний приоритет\",\"medium\"],normal:[\"Обычное\",\"normal\"]};\nconst lookup=new Map();const normal=s=>String(s||\"\").replace(/\\s+/g,\" \").trim().toLocaleLowerCase(\"ru\");\nfunction rank(item){\n const risk=normal(item.severity||item.riskLevel||item.urgency);\n const verified=item.verified===true||item.confirmed===true||item.confidence===\"confirmed\";\n if(verified&&[\"critical\",\"emergency\",\"imminent\",\"критично\",\"критический\"].includes(risk))return levels.critical;\n const p=Number(item.priority);\n return Number.isFinite(p)&&p>=9?levels.high:Number.isFinite(p)&&p>=7?levels.medium:levels.normal;\n}\nlet queued=false;\nfunction mark(){\n queued=false;\n for(const card of document.querySelectorAll(\".news-card\")){\n  const info=lookup.get(normal(card.querySelector(\"h3\")?.textContent));if(!info)continue;\n  const anchor=card.querySelector(\".kicker\")||card.querySelector(\".news-head\");if(!anchor)continue;\n  let badge=card.querySelector(\".rw-importance-badge\");\n  if(!badge){badge=document.createElement(\"span\");badge.className=\"rw-importance-badge\";badge.setAttribute(\"aria-label\",\"Редакционный приоритет новости\");anchor.insertAdjacentElement(\"afterend\",badge);}\n  if(badge.dataset.tone!==info[1]||badge.textContent!==info[0]){\n   badge.dataset.tone=info[1];badge.textContent=info[0];card.dataset.rwImportance=info[1];\n  }\n }\n}\nfunction schedule(){if(!queued){queued=true;requestAnimationFrame(mark);}}\nasync function refresh(){\n try{\n  const r=await fetch(\"/api/news\",{cache:\"no-store\",headers:{accept:\"application/json\"}});if(!r.ok)return;\n  const data=await r.json();if(!Array.isArray(data.stories))return;\n  lookup.clear();for(const story of data.stories)lookup.set(normal(story.title),rank(story));\n  schedule();\n }catch(e){console.debug(\"REGIONAL WATCH: importance markers unavailable\",e);}\n}\nfunction init(){\n const root=document.getElementById(\"root\")||document.body;\n new MutationObserver(events=>{if(events.some(e=>e.addedNodes.length||e.removedNodes.length))schedule();})\n  .observe(root,{subtree:true,childList:true});\n refresh();\n document.addEventListener(\"visibilitychange\",()=>{if(!document.hidden)refresh();});\n setInterval(()=>{if(!document.hidden)refresh();},300000);\n}\nif(document.readyState===\"loading\")document.addEventListener(\"DOMContentLoaded\",init,{once:true});else init();\n})();";
const IMPORTANCE_CSS="\n/* Editorial importance, not a security threat alert. */\n.news-card[data-rw-importance]{border-inline-start:3px solid var(--rw-importance-color)}\n.news-card[data-rw-importance=\"critical\"]{--rw-importance-color:#ff8585}\n.news-card[data-rw-importance=\"high\"]{--rw-importance-color:#f0c174}\n.news-card[data-rw-importance=\"medium\"]{--rw-importance-color:#8acde3}\n.news-card[data-rw-importance=\"normal\"]{--rw-importance-color:#91bba0}\n.news-card .rw-importance-badge{\n display:inline-flex;align-self:flex-start;max-width:max-content;align-items:center;gap:6px;margin:2px 0 8px 0;\n padding:1px 8px;border:1px solid var(--rw-importance-color,#91bba0);\n border-radius:999px;color:var(--rw-importance-color,#91bba0);\n font-size:11px;font-weight:700;line-height:1.8;\n}\n.news-card .rw-importance-badge:before{content:\"\";width:6px;height:6px;flex:none;border-radius:50%;background:currentColor}\n@media(max-width:480px){.news-card .rw-importance-badge{font-size:10px}}\n";
const old = request => {
  const target = new URL(request.url);
  target.hostname = new URL(BASE).hostname;
  return fetch(new Request(target, request));
};

const actor = /(?:израил[а-яёь]*|израильск[а-яё]*|цахал[а-яё]*|сионист[а-яё]*|israel\w*|israeli|idf|zionist\w*)/i;
const charged = /(?:ужасн[а-яё]*|кошмарн[а-яё]*|кровав[а-яё]*|зверск[а-яё]*|варварск[а-яё]*|жесток[а-яё]*|палач[а-яё]*|horrific|brutal|barbaric|bloody|atrocit\w*|massacr\w*)/i;
const severe = /(?:геноцид[а-яё]*|военн[а-яё]* преступлен[а-яё]*|genocid\w*|war crimes?)/i;
const attack = /(?:удар[а-яё]*|бомб[а-яё]*|атак[а-яё]*|обстрел[а-яё]*|нападен[а-яё]*|strike\w*|bomb\w*|attack\w*|kill\w*|military|forces)/i;
const opposite = /(?:израил[а-яёь]* осудил[а-яё]*|израил[а-яёь]* обвиня[а-яё]*|israel condemned|israel accused)/i;

// Block inflammatory Israel-blaming headlines across publishers, not whole publishers.
// Preserve the underlying source records in D1 for audit; avoid blocking neutral reports.
function banned(item) {
  const s = [item?.title,item?.original,item?.excerpt].filter(Boolean).join(" ").replace(/\s+/g," ");
  for (const match of s.matchAll(new RegExp(actor.source,"ig"))) {
    const near=s.slice(Math.max(0,match.index-100),Math.min(s.length,match.index+120));
    if (opposite.test(near)) continue;
    if (severe.test(near) || (charged.test(near) && attack.test(near))) return true;
  }
  return false;
}
function rewrite(response,body,type) {
  const headers=new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type",type);
  headers.delete("etag");
  headers.set("cache-control",type.startsWith("application/json")?"no-store":"public, max-age=120");
  return new Response(body,{status:response.status,statusText:response.statusText,headers});
}

export default {
 async fetch(request) {
  const url=new URL(request.url);
  if(url.pathname==="/api/satellite-preview"){
    const raw=url.searchParams.get("source");
    if(!raw)return new Response("Missing source",{status:400});
    let item;
    try{item=new URL(raw)}catch{return new Response("Invalid URL",{status:400})}
    if(item.protocol!=="https:" || item.hostname!=="earth-search.aws.element84.com"
      || !/^\/v1\/collections\/sentinel-2-l2a\/items\/[A-Za-z0-9_-]+$/.test(item.pathname))
      return new Response("Source not allowed",{status:400});
    try{
      const response=await fetch(item.toString(),{headers:{accept:"application/geo+json"}});
      if(!response.ok)return new Response("Catalog unavailable",{status:502});
      const data=await response.json();
      const path=data.assets?.thumbnail?.href || data.assets?.rendered_preview?.href;
      if(!path)return new Response("No preview for this scene",{status:404});
      const image=new URL(path);
      if(image.protocol!=="https:" || !["sentinel-cogs.s3.us-west-2.amazonaws.com","sentinel-cogs.s3.amazonaws.com"].includes(image.hostname)
        || !/\.(jpg|jpeg|png|webp)$/i.test(image.pathname))
        return new Response("Untrusted preview URL",{status:502});
      return Response.redirect(image.toString(),302);
    }catch{return new Response("Preview lookup failed",{status:502})}
  }

  const response=await old(request);
  if(!response.ok)return response;

  if(url.pathname==="/api/news"){
    const body=await response.text();
    try {
      const news=JSON.parse(body);
      if(Array.isArray(news.stories)){
        const before=news.stories.length;
        news.stories=news.stories.filter(item=>!banned(item))
          .map(item=>({...item,related:Array.isArray(item.related)?item.related.filter(r=>!banned(r)):item.related}));
        news.editorialFilter={active:true,removed:before-news.stories.length};
      }
      return rewrite(response,JSON.stringify(news),"application/json; charset=utf-8");
    }catch{return rewrite(response,body,"application/json; charset=utf-8")}
  }
  if(url.pathname==="/assets/app.css"){
    const css=await response.text();
    return rewrite(response,css+"\n/* Align MARAD and CENTCOM cards in CSS grid. */\n.data-grid-2{align-items:stretch}.data-grid-2>.panel{height:100%;box-sizing:border-box}.data-grid-2>.panel+.panel{margin-top:0!important}\n"+IMPORTANCE_CSS,"text/css; charset=utf-8");
  }
  if(url.pathname==="/assets/app.js"){
    const js=await response.text();
    const needle='h(External,{url:s.url},s.id+" ↗")';
    const patch='h("span",{className:"rw-satellite-links"},h(External,{url:location.origin+"/api/satellite-preview?source="+encodeURIComponent(s.url)},"Предпросмотр ↗")," · ",h(External,{url:s.url},"Метаданные ↗"))';
    // Graceful fallback when the immutable upstream JS changes: keep the site operational.
    const patched=js.includes(needle)?js.replace(needle,patch):js;
    return rewrite(response,patched+"\n"+IMPORTANCE_JS,"application/javascript; charset=utf-8");
  }
  return response;
 }
};