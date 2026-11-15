
;(()=>{"use strict";function init(){if(document.getElementById("rw-back-to-top"))return;const b=document.createElement("button");b.id="rw-back-to-top";b.type="button";b.textContent="↑";const he=location.pathname==="/he"||location.pathname.startsWith("/he/");b.setAttribute("aria-label",he?"חזרה לראש העמוד":"Вернуться в начало страницы");b.title=he?"למעלה":"Наверх";b.hidden=true;document.body.appendChild(b);const update=()=>{b.hidden=window.scrollY<360};b.addEventListener("click",()=>window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));window.addEventListener("scroll",update,{passive:true});update();}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();})();




;(()=>{"use strict";
 let settled=null, frame=0;
 const key=()=>location.pathname+location.search+location.hash;
 function findTarget(){
  if(!/\/events$/.test(location.pathname))return null;
  const story=new URLSearchParams(location.search).get("story");
  if(story){
   const article=document.getElementById("case-"+story);
   return article&&article.querySelector(".rw-dossier-detail")?article:null;
  }
  if(location.hash==="#all-news"){
   const archive=document.getElementById("all-news");
   return archive&&(archive.querySelector(".news-card")||archive.querySelector(".rw-news-page-error")||archive.querySelector(".rw-pagination"))?archive:null;
  }
  return null;
 }
 function settle(){
  const route=key();if(settled===route)return;
  const target=findTarget();if(!target)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
   if(key()!==route||!target.isConnected)return;
   target.tabIndex=-1;
   target.scrollIntoView({block:"start",behavior:"instant"});
   target.focus({preventScroll:true});
   if(document.activeElement===target)settled=route;
  }));
 }
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(settle)}
 const root=document.getElementById("root")||document.body;
 new MutationObserver(schedule).observe(root,{subtree:true,childList:true});
 window.addEventListener("popstate",schedule);
 window.addEventListener("hashchange",schedule);
 window.addEventListener("pageshow",schedule);
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",schedule,{once:true});
 else schedule();
})();
