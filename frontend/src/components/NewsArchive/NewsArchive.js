import { rwNormalizeNewsArticle } from '../../api/normalizeNewsArticle.js';
import { UI_HE, h, t, useEffect, useState } from '../../app/runtime.js';
import { Loading } from '../Loading/Loading.js';
import { NewsMasonry } from '../NewsMasonry/NewsMasonry.js';
import { Head } from '../SectionHead/Head.js';
export function NewsArchive(){
 const [page,setPage]=useState(1),[expanded,setExpanded]=useState(null),[read,setRead]=useState({}),[result,setResult]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[refresh,setRefresh]=useState(0);
 const pageSize=12;
 useEffect(()=>{
  let alive=true;const ctrl=new AbortController();
  setLoading(true);setError(null);setResult(null);
  (async()=>{const timer=setTimeout(()=>ctrl.abort(),14000);
   try{
    const url="/api/news?lang="+(UI_HE?"he":"ru")+"&limit="+pageSize+"&offset="+((page-1)*pageSize)+"&sort=latest";
    const resp=await fetch(url,{cache:"no-store",signal:ctrl.signal});
    if(!resp.ok)throw Error("HTTP "+resp.status);
    const body=await resp.json();
    if(!body||!Array.isArray(body.articles)||!Number.isInteger(body.total_events))throw Error("Invalid news page response");
    if(alive)setResult(body);
   }catch(e){if(alive)setError(e?.name==="AbortError"?"timeout":String(e.message||e))}
   finally{clearTimeout(timer);if(alive)setLoading(false)}
  })();
  return()=>{alive=false;ctrl.abort()}
 },[page,refresh]);
 const list=Array.isArray(result?.articles)?result.articles.map(rwNormalizeNewsArticle):[];
 const total=Number.isInteger(result?.total_events)?result.total_events:0;
 const pages=Math.max(1,Math.ceil(total/pageSize)),current=Math.min(page,pages),begin=(page-1)*pageSize;
 const label=UI_HE;
 const move=next=>{if(next<1||next>pages)return;setExpanded(null);setPage(next);requestAnimationFrame(()=>document.getElementById("all-news")?.scrollIntoView({block:"start",behavior:"auto"}))};
 const feedback=loading?h(Loading,{label:label?"טוענים עמוד חדשות…":"Загружаем страницу новостей…"}):
  error?h("div",{className:"rw-news-page-error",role:"alert"},t("p",null,label?"לא ניתן לטעון את עמוד החדשות: ":"Не удалось загрузить страницу: "+error),h("button",{type:"button",onClick:()=>setRefresh(x=>x+1)},label?"נסה שוב":"Повторить")):
  list.length?h(NewsMasonry,{stories:list,expandedId:expanded,onToggle:setExpanded,read,markRead:id=>setRead(x=>({...x,[id]:true}))}):
  t("p","hint",label?"אין כרגע פרסומים להצגה.":"Нет публикаций для отображения.");
 return h("section",{className:"section rw-news-archive",id:"all-news"},
  h(Head,{title:label?"כל העדכונים":"Последние публикации",icon:"newspaper",sub:label?"דפדוף בין כל האירועים, 12 בעמוד; דיווח אינו אישור עצמאי.":"Все события по 12 на страницу; сообщение источника не подтверждает событие.",right:t("span","hint",!loading&&!error&&total?(begin+1)+"–"+Math.min(begin+pageSize,total)+" / "+total:"—")}),
  feedback,
  !loading&&!error&&pages>1?h("nav",{className:"rw-pagination","aria-label":label?"דפדוף חדשות":"Страницы новостей"},
   h("button",{type:"button",disabled:current===1,onClick:()=>move(current-1)},label?"הקודם":"Назад"),
   h("span",{className:"rw-pagination-count","aria-live":"polite"},label?"עמוד "+current+" מתוך "+pages:"Страница "+current+" из "+pages),
   h("button",{type:"button",disabled:current===pages,onClick:()=>move(current+1)},label?"הבא":"Далее")
  ):null);
}

