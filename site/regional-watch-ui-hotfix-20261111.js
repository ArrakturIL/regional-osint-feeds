// REGIONAL WATCH UI hotfix, 2026-11-11.
// Read-only edge overlay: preserves the working Pages API via its immutable deployment.
// Roll back the Pages deployment to remove all changes.
const BASE = "https://f5a75117.regional-watch.pages.dev";
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
  headers.set("cache-control","no-store");
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
    return rewrite(response,css+"\n/* Align MARAD and CENTCOM cards in CSS grid. */\n.data-grid-2{align-items:stretch}.data-grid-2>.panel{height:100%;box-sizing:border-box}.data-grid-2>.panel+.panel{margin-top:0!important}\n","text/css; charset=utf-8");
  }
  if(url.pathname==="/assets/app.js"){
    const js=await response.text();
    const needle='h(External,{url:s.url},s.id+" ↗")';
    const patch='h("span",{className:"rw-satellite-links"},h(External,{url:location.origin+"/api/satellite-preview?source="+encodeURIComponent(s.url)},"Предпросмотр ↗")," · ",h(External,{url:s.url},"Метаданные ↗"))';
    if(!js.includes(needle))return new Response("UI patch incompatibility",{status:503});
    return rewrite(response,js.replace(needle,patch),"application/javascript; charset=utf-8");
  }
  return response;
 }
};