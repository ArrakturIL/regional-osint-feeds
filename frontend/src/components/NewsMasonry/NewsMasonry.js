import { h, useEffect, useRef } from '../../app/runtime.js';
import { NewsCard } from '../NewsCard/NewsCard.js';
export function NewsMasonry({stories,expandedId,onToggle,read,markRead}){
 const gridRef=useRef(null);
 useEffect(()=>{
   const grid=gridRef.current;
   if(!grid)return;
   let raf=0;
   const layout=()=>{
     for(const slot of grid.querySelectorAll(".news-slot")){
       const card=slot.querySelector(".news-card");
       if(!card)continue;
       const height=card.getBoundingClientRect().height;
       const span=Math.max(1,Math.ceil((height+14)/22));
       const desired="span "+span;
       if(slot.style.gridRowEnd!==desired)slot.style.gridRowEnd=desired;
     }
   };
   const update=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(layout)};
   const resize=typeof ResizeObserver==="function"?new ResizeObserver(update):null;
   grid.querySelectorAll(".news-card").forEach(x=>resize?.observe(x));
   layout();
   window.addEventListener("resize",update);
   return ()=>{resize?.disconnect();cancelAnimationFrame(raf);window.removeEventListener("resize",update)};
 },[stories,expandedId]);
 return h("div",{className:"news-grid rw-masonry",ref:gridRef},
   ...stories.map((x,i)=>h("div",{className:"news-slot",key:x.id||x.url||i},
     h(NewsCard,{item:x,open:expandedId===(x.id||x.url||x.title),onToggle,read:!!read[x.id||x.url||x.title],markRead}))));
}
