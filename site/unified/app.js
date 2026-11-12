
(function(){
"use strict";
const R=window.React,D=window.ReactDOM;
if(!R||!D||typeof D.createRoot!=="function")throw new Error("React 18 runtime unavailable");
const {useState,useEffect,useRef}=R;
const UI_HE=location.pathname==="/he"||location.pathname.startsWith("/he/");
const h=(t,p,...c)=>R.createElement(t,p,...c);
const t=(tag,cls,content)=>h(tag,{className:cls||undefined},content);
const fmtTime=x=>{if(!x)return "—";const d=new Date(x);return Number.isNaN(+d)?"—":new Intl.DateTimeFormat(UI_HE?"he-IL":"ru-RU",{timeZone:"Asia/Jerusalem",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(d)};
const simpleTime=x=>{if(!x)return "—";const d=new Date(x);return Number.isNaN(+d)?"—":new Intl.DateTimeFormat(UI_HE?"he-IL":"ru-RU",{timeZone:"Asia/Jerusalem",hour:"2-digit",minute:"2-digit"}).format(d)};
const relativeTime=x=>{if(!x)return "—";const n=Date.now()-Date.parse(x);if(!Number.isFinite(n)||n<0)return fmtTime(x);if(n<60000)return "сейчас";if(n<3600000)return Math.floor(n/60000)+" мин";if(n<86400000)return Math.floor(n/3600000)+" ч";return fmtTime(x)};
const safeLink=x=>typeof x==="string"&&x.startsWith("https://")?x:null;
const ruMoney=x=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(Number(x)||0)+" $";
const ruPct=x=>Number.isFinite(Number(x))?(Number(x)*100).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%":"—";
function SourceDot({state}){return h("span",{className:"rw-dot"+(state==="error"?" bad":state==="partial"||state==="empty"||state==="unknown"?" partial":"")})}
function External({url,children,className,onClick}){const link=safeLink(url);return link?h("a",{href:link,target:"_blank",rel:"noopener noreferrer",className,onClick},children):null}
function useFeed(endpoint,interval,enabled){const [value,setValue]=useState(null),[error,setError]=useState(null),[update,setUpdate]=useState(0),cache=useRef({last:0,ctrl:null});useEffect(()=>{if(!enabled)return;let active=true,pending=false;async function pull(){if(!active||document.hidden||pending)return;pending=true;const ctrl=new AbortController(),clock=setTimeout(()=>ctrl.abort(),12000);cache.current.ctrl=ctrl;try{const r=await fetch(endpoint,{cache:"no-store",signal:ctrl.signal,headers:{Accept:"application/json"}});if(!r.ok)throw Error("HTTP "+r.status);const j=await r.json();if(!j||typeof j!=="object"||Array.isArray(j))throw Error("Invalid API response");if(active){setValue(j);setError(null);cache.current.last=Date.now();setUpdate(cache.current.last)}}catch(e){if(active&&e.name!=="AbortError")setError(e.message)}finally{clearTimeout(clock);pending=false}}const tick=()=>{if(!document.hidden&&Date.now()-cache.current.last>=interval)pull()};if(!cache.current.last||Date.now()-cache.current.last>Math.min(interval,10000))pull();const timer=setInterval(tick,Math.min(interval,30000));document.addEventListener("visibilitychange",tick);return()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",tick);cache.current.ctrl?.abort()}},[endpoint,interval,enabled]);return {value,error,update}}
function Loading({label}){return h("div",{className:"loading skeleton"},label||"Загружаем данные из D1…")}
function Card({children,className,id}){return h("div",{className:"panel"+(className?" "+className:""),id},children)}
function Head({title,sub,right}){return h("div",{className:"section-head"},h("div",null,t("h2",null,title),sub?t("p",null,sub):null),right||null)}
function Intro({kicker,title,accent,desc,meta,stamp}){return h("section",{className:"page-intro"},h("div",null,t("div","kicker",kicker),h("h1",{className:"page-title"},title,h("br"),h("em",null,accent)),t("p",null,desc)),stamp?h("div",{className:"stamp"},t("span",null,stamp.label),t("b",null,stamp.main),t("small",null,stamp.sub)):meta?t("div","hint",meta):null)}

function ActivityChips({overview}){const names=["adsb","adsb_alt","airbridge_context","mil_lol","ais","idf_official","centcom_dvids","marad_official","satellite_context","firms"];const s=overview?.sources||[];return h("section",{className:"section",id:"monitor"},h(Card,{className:"signal-panel"},
 h("div",{className:"panel-header"},t("span","panel-title","◉  Живой мониторинг"),t("span","hint","Данные D1 · автоматическое обновление")),
 h("div",{className:"status-chips"},...names.map(id=>s.find(x=>x.id===id)).filter(Boolean).map(x=>h("div",{className:"status-chip",key:x.id,title:(x.label||x.id)+" · "+x.state+" · "+fmtTime(x.attemptedAt)},h(SourceDot,{state:x.state}),h("span",null,t("strong",null,x.label||x.id),t("small",null,(x.state==="error"?"Ошибка":x.state==="partial"?"Частично":x.state==="empty"?"Без записей":"Опрос")+" · "+relativeTime(x.attemptedAt))))),s.length===0?t("span","hint","Статусы источников загружаются…"):null)));
}
function Summary({overview}){const a=overview?.analysis;if(!a)return null;return h("section",{className:"section"},h(Card,{className:"brief"},
 h("div",{className:"panel-header"},t("span","panel-title","◉  Главное из последнего анализа"),t("span","badge"+(a.state==="attention"?" alert":""),a.badge||"АНАЛИЗ")),
 t("h2",null,a.title||"Ожидаем аналитическую оценку"),t("p",null,a.description||""),
 h("div",{className:"brief-foot"},t("span",null,"Анализ: "+fmtTime(a.time)),h(External,{url:a.link},"Официальный источник ↗"))))}

function Editorial({notes}){
 const note=Array.isArray(notes)?notes[0]:null;
 return h("section",{className:"section",id:"editorial"},
  h(Card,{className:"editorial"},
   h("div",{className:"kicker"},t("span",null,UI_HE?"✦ דבר העורך · CHATGPT":"✦ РЕПЛИКА РЕДАКТОРА · CHATGPT"),
    note?.time?t("span","hint",fmtTime(note.time)):null),
   note?t("h2",null,note.headline||note.title):t("h2",null,UI_HE?"דבר העורך":"Реплика редактора"),
   t("p",null,note?(note.text||note.body||note.excerpt||""):(UI_HE?"אין כרגע טור מערכת מוכן בעברית.":"Пока нет опубликованной редакционной реплики.")),
   note?.sourceUrl||note?.url?h(External,{url:note.sourceUrl||note.url},UI_HE?"למקור ↗":"Читать источник ↗"):null
  )
 );
}

function NewsCard({item,open,onToggle,read,markRead}){
 const id=item.id||item.url||item.title;
 const related=Array.isArray(item.related)?item.related:(Array.isArray(item.sources)?item.sources.filter(x=>x && (x.url||x.source_url)).map(x=>({url:x.url||x.source_url,source:x.publisher||x.name||x.source||"",title:x.title||x.headline||"",time:x.published_at||x.time||x.published_ms})):[]);
 const priority=Number(item.priority);const verified=item.verified===true||item.confirmed===true||item.confidence==="confirmed";const risk=String(item.severity||item.riskLevel||"").toLowerCase();const tone=verified&&["critical","imminent","emergency"].includes(risk)?[UI_HE?"קריטי":"Критично","critical"]:priority>=9?[UI_HE?"חשיבות גבוהה":"Высокий приоритет","high"]:priority>=7?[UI_HE?"חשיבות בינונית":"Средний приоритет","medium"]:[UI_HE?"רגיל":"Обычное","normal"];
 const isNew=!read&&item.discoveredAt&&Date.now()-Date.parse(item.discoveredAt)<86400000;
 return h("article",{className:"news-card"+(isNew?" new":"")},
  h("div",{className:"news-head"},t("span",null,item.source||item.publisher||(UI_HE?"מקור":"Источник")),h("time",{dateTime:item.time},fmtTime(item.time))),
  isNew?t("span","kicker",UI_HE?"חדש":"НОВОЕ"):null,h("span",{className:"rw-importance-badge","data-tone":tone[1],"aria-label":UI_HE?"עדיפות מערכתית של הידיעה":"Редакционный приоритет новости"},tone[0]),
  t("h3",null,item.title||item.original||(UI_HE?"פרסום":"Публикация")),
  item.comment?h("div",{className:"news-comment"},t("b",null,UI_HE?"הערת מערכת · AI":"РЕПЛИКА · ИИ"),t("p",null,item.comment)):null,
  h("div",{className:"news-actions"},
   h("button",{type:"button","aria-expanded":!!open,onClick:()=>{onToggle(open?null:id);markRead(id)}},open?(UI_HE?"סגירת פרטים":"− Скрыть подробности"):"+ "+(related.length?(UI_HE?"סיפור · ":"История · ")+(related.length+1)+(UI_HE?" מקורות":" публикации"):(UI_HE?"מה ידוע מהמקור":"Что известно из источника"))),
   h(External,{url:item.url,onClick:()=>markRead(id)},UI_HE?"למקור ↗":"Читать первоисточник ↗")),
  open?h("div",{className:"news-detail"},t("b",null,(UI_HE?"מתקציר המקור · ":"ПО RSS-АННОТАЦИИ · ")+fmtTime(item.time)),t("p",null,item.excerpt||(UI_HE?"התקציר עדיין אינו זמין. ניתן לקרוא את המקור.":"Русская аннотация готовится. Полный материал доступен по ссылке на первоисточник.")),related.length?h("div",null,t("b",null,UI_HE?"פרסומים קשורים":"СВЯЗАННЫЕ ПУБЛИКАЦИИ"),h("ul",{className:"news-related"},...related.filter(x=>safeLink(x.url)).map(x=>h("li",{key:x.id||x.url},h(External,{url:x.url},x.title||x.source||"Источник"),t("div","hint",(x.source||"")+" · "+fmtTime(x.time)))))):null,t("small","hint",UI_HE?"תקציר מקור, ולא אימות מלא של כל טענה.":"Краткий перевод RSS-аннотации, а не полный проверенный текст статьи.")):null);
}
function Events({items}){if(!items?.length)return t("p","hint","Пока нет зарегистрированных событий.");return h("div",null,...items.map((x,i)=>h("article",{className:"event",key:x.id||i},h("time",{dateTime:x.date},fmtTime(x.date)),t("h4",null,x.title||"Событие"),t("p",null,x.description||"Описание отсутствует"),h(External,{url:x.link},"Первоисточник ↗"))))}
function SourceList({sources}){return h("div",null,...(sources||[]).map(x=>h("div",{className:"sources-row",key:x.id},h("span",{style:{display:"flex",alignItems:"center",gap:"8px"}},h(SourceDot,{state:x.state}),x.label||x.id),t("span","right",x.state==="error"?"Ошибка":x.state==="partial"?"Частично":x.state==="empty"?"Нет записей":"Работает"))))}

function NewsMasonry({stories,expandedId,onToggle,read,markRead}){
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
function Overview({visible,overview,news,live,errors,returning,previous}){
 const [expandedId,setExpandedId]=useState(null);
 const [read,setRead]=useState(()=>{try{return JSON.parse(localStorage.getItem("rw-react-read-v1")||"{}")}catch{return {}}});
 const readIt=id=>{const n={...read,[id]:Date.now()};setRead(n);try{localStorage.setItem("rw-react-read-v1",JSON.stringify(Object.fromEntries(Object.entries(n).sort((a,b)=>b[1]-a[1]).slice(0,100))))}catch{}};
 const stories=news?.stories||[];
 return h("div",{className:"rw-page",hidden:!visible,id:"overview"},
 h(Intro,{kicker:"РЕГИОНАЛЬНЫЙ ОБЗОР / OPEN SOURCE INTELLIGENCE",title:"Обстановка",accent:"в регионе.",desc:"Подтверждённые события, аналитические выводы и состояние источников. Без информационного шума.",stamp:{label:"ПОСЛЕДНИЙ АНАЛИЗ",main:simpleTime(overview?.analysis?.time),sub:fmtTime(overview?.analysis?.time)+" · Израиль"}}),
 returning&&previous&&news?h("section",{className:"return"},t("h3",null,"Пока тебя не было"),h("div",{className:"return-items"},h("span",null,t("b",null,stories.filter(x=>Date.parse(x.discoveredAt)>previous).length)," новых публикаций"),h("span",null,t("b",null,overview?.events?.filter(x=>Date.parse(x.date)>previous).length||0)," обновлений событий"))):null,
 h(ActivityChips,{overview}),h(Summary,{overview}),h(Editorial,{notes:news?.editorials}),
 h("section",{className:"section",id:"on-air"},h(Head,{title:"В эфире",sub:"Самые заметные публикации и короткие редакционные комментарии",right:t("span","hint",news?.checkedAt?"RSS 5 мин · "+(news.newLastSixHours||0)+" за 6 ч · опрос "+simpleTime(news.checkedAt):"Ожидаем ленту")}),
 errors?.news?t("p","error","Не удалось обновить новости: "+errors.news):null,
 news?h(NewsMasonry,{stories,expandedId,onToggle:setExpandedId,read,markRead:readIt}):h(Loading,{label:"Получаем новости…"}),
 t("p","footnote","Комментарии Cloudflare AI отделены от сообщений источников. «Реплика редактора» публикуется отдельно в авторской колонке.")),
 h("section",{className:"section"},h("div",{className:"events-layout"},
 h(Card,null,h(Head,{title:"Последние события",sub:"Из журнала мониторинга и последнего анализа"}),overview?h(Events,{items:overview.events}):h(Loading)),
 h(Card,{id:"sources"},h(Head,{title:"Состояние системы",sub:"Результаты последних опросов источников"}),t("h2",null,overview?(overview.available+"/"+overview.total):"—"),t("p","hint","Источников отвечают без ошибок"),h(SourceList,{sources:overview?.sources}),h("details",null,h("summary",null,"Технический журнал опросов"),h("div",{className:"tech-log"},...(live?.activity||[]).map((v,i)=>h("div",{className:"sources-row",key:i},t("span",null,v.label||"Источник"),t("span","right",v.message||"")))))))),
 h("div",{className:"footer"},t("span",null,"REGIONAL WATCH · Публичный информационный обзор"),t("span",null,"Обновление данных без перезагрузки")) );
}
function classifyMarket(q){return /ceasefire/i.test(q||"")?"peace":/meeting|diplomatic/i.test(q||"")?"talks":/Iran|Khamenei|Pahlavi/i.test(q||"")?"iran":"other"}
function marketTitle(q){
 const s=String(q||"");
 let x=s.match(/^US x Iran Effective Ceasefire by (.+)\?$/i);if(x)return "Прекращение огня США–Иран до "+x[1];
 x=s.match(/^Next US-Iran senior diplomatic meeting by (.+)\?$/i);if(x)return "Встреча США–Иран до "+x[1];
 x=s.match(/^Will (.+) be head of state in Iran end of 2026\?$/i);if(x)return "Глава Ирана в конце 2026: "+x[1];
 return s;
}
function MarketCard({m}){return h("article",{className:"market"},t("span","kicker",classifyMarket(m.question)==="peace"?"ПЕРЕМИРИЕ":classifyMarket(m.question)==="talks"?"ДИПЛОМАТИЯ":"ИРАН"),t("h3",null,marketTitle(m.question)),t("b",null,ruPct(m.yes)),h("div",{className:"bar"},h("i",{style:{width:Math.max(0,Math.min(100,Number(m.yes||0)*100))+"%"}})),h("div",{className:"market-meta"},t("span",null,"24 ч: "+ruMoney(m.volume)),t("span",null,"Ликвидность: "+ruMoney(m.liquidity))),t("span","hint","Снимок: "+fmtTime(m.asOf)),h(External,{url:m.url},"Открыть рынок ↗"))}
function DataItems({items,kind}){if(!items?.length)return t("p","hint","Свежих записей пока нет.");return h("div",null,...items.map((x,i)=>h("div",{className:"data-item",key:x.id||x.url||i},h(External,{url:x.url},kind==="idf"?"Сообщение ЦАХАЛ ↗":x.title||x.id||"Публикация"),t("p",null,kind==="idf"?x.description||x.title:kind==="marad"?"Действующее предупреждение "+x.id:x.description||""),t("small",null,kind==="marad"?"Дата выпуска не установлена":fmtTime(x.published||x.observed)))))}

function AviationContext({data}){
 const a=data?.airbridge;
 const samples=data?.aviationSamples||[];
 const limits=data?.providerLimits||[];
 const areas={north_america_east:"Восток Северной Америки",tehran:"Тегеран",gulf_of_oman:"Оманский залив",eastern_iran:"Восточный Иран",western_iran:"Западный Иран",persian_gulf:"Персидский залив",israel_jordan:"Израиль и Иордания",red_sea:"Красное море"};
 const area=x=>areas[x]||String(x||"Район не указан").replace(/_/g," ");
 const count=x=>Number.isFinite(Number(x))?Number(x).toLocaleString("ru-RU"):"—";
 return h("section",{className:"section",id:"aviation"},
  h(Head,{title:"Авиационный контекст",sub:"Новые данные бэкенда · AvioADSB, воздушная логистика и ограничения доступа"}),
  h("div",{className:"data-grid-2"},
   h(Card,{className:"aviation-panel"},
    t("div","kicker","ТРАНСПОРТНАЯ АВИАЦИЯ · РАЗОВЫЙ СРЕЗ"),
    t("h3",null,a?area(a.area):"Данные ожидаются"),
    a?h("div",null,
     h("div",{className:"aviation-metrics"},
      h("div",null,t("b",null,count(a.observed)),t("small",null,"Всего бортов в выборке")),
      h("div",null,t("b",null,count(a.airlift)),t("small",null,"Бортов логистических типов")),
      h("div",null,t("b",null,count(a.tankers)),t("small",null,"Самолётов заправочного типа"))),
     h("p",{className:"aviation-info"},"Отмеченные типы: "+(Object.entries(a.logisticsTypes||{}).map(([name,n])=>name+" — "+n).join(", ")||"нет данных")+"; флаги военной базы: "+count(a.militaryFlagged)+"."),
     t("p","footnote","Снимок "+fmtTime(a.time)+" · радиус "+count(a.radiusNm)+" морских миль. Это одна точка наблюдения: принадлежность самолётов, маршрут и назначение груза не установлены."),
     h(External,{url:a.link},"Данные AvioADSB ↗"))
    :t("p","footnote","Пока нет снимка воздушной логистики. Это не означает отсутствия полётов.")),
   h(Card,{className:"aviation-panel"},
    t("div","kicker","РЕГИОНАЛЬНЫЕ ВЫБОРКИ"),
    t("h3",null,"Последние авиационные снимки"),
    samples.length?h("div",{className:"aviation-samples"},...samples.map(x=>h("div",{className:"aviation-sample",key:x.area},
      h("div",null,t("strong",null,area(x.area)),t("small",null,fmtTime(x.time))),
      h("div",{className:"aviation-sample-right"},
       t("b",null,count(x.observed)),
       t("small",null,x.coverageLimited?"Ограниченный радиус":"Неполное покрытие")))))
     :t("p","footnote","Региональных выборок в базе пока нет."),
    t("p","footnote","Ноль означает отсутствие бортов в конкретной выборке приёмников, а не пустое воздушное пространство."))),
  limits.length?h(Card,{className:"aviation-quota"},
    h("div",{className:"panel-header"},t("span","panel-title","Доступность авиационных источников"),t("span","hint","Квоты и паузы · данные бэкенда")),
    h("div",{className:"provider-grid"},...limits.map(p=>h("div",{className:"provider-item",key:p.provider},
      h("div",{className:"provider-head"},t("strong",null,p.provider==="adsb.lol"?"ADS-B.lol":p.provider==="avioadsb.org"?"AvioADSB":p.provider),h(SourceDot,{state:p.paused?"error":"ok"})),
      t("p",null,p.paused?"Временная пауза из-за ограничения API":"Подключение активно"),
      p.remaining===null?null:t("small",null,"Осталось запросов: "+count(p.remaining)+" · сброс: "+fmtTime(p.resetAt)),
      p.paused?t("small",null,"Следующая попытка не раньше "+fmtTime(p.nextAllowedAt)):null,
      p.lastStatus?t("small",null,"Последний HTTP-статус: "+p.lastStatus):null))),
    t("p","footnote","Пауза после ошибки 429 — защита от исчерпания квоты. Она не означает отключения всего мониторинга.")):null);
}
function DataRoom({visible,data,error}){
 const [filter,setFilter]=useState("all"),[more,setMore]=useState(false);
 const markets=(data?.markets||[]).filter(x=>filter==="all"||classifyMarket(x.question)===filter).sort((a,b)=>(b.volume||0)-(a.volume||0));
 const selected=more?markets:markets.slice(0,9);
 return h("div",{className:"rw-page",hidden:!visible,id:"data-room"},
 h(Intro,{kicker:"REGIONAL WATCH · DATA ROOM",title:"Данные",accent:"и источники.",desc:"Официальные сообщения, гражданская безопасность и рыночные ожидания. Отдельно от аналитической ленты.",meta:data?"D1 · обновлено "+fmtTime(data.generatedAt)+" · автообновление 2 минуты":"Получаем данные…"}),
 h("section",{className:"section"},h(Head,{title:"Служба тыла · פיקוד העורף",sub:"Гражданская безопасность и официальные уведомления"}),h(Card,null,
 t("span","notice","Прямая лента тревог пока не подключена"),
 t("p",null,"У нас есть сообщения ЦАХАЛ, но нет независимого источника текущих тревог Командования тыла. Отсутствие сообщений здесь не означает отсутствия тревог."),
 h("div",{className:"links"},h(External,{url:"https://www.oref.org.il/"},"Официальный сайт ↗"),h(External,{url:"https://alerts-history.oref.org.il/"},"История тревог ↗"),h(External,{url:"https://t.me/PikudHaOref_all"},"Telegram ↗")),
 t("h3",null,"Последние сообщения ЦАХАЛ"),data?h(DataItems,{items:data.home,kind:"idf"}):h(Loading))),
 h("section",{className:"section",id:"markets"},h(Head,{title:"Polymarket · ожидания рынка",sub:"Котировка YES, а не подтверждённая вероятность или разведданные",right:t("span","hint",markets.length+" рынков")}),
 h("div",{className:"filters"},...[["all","Все"],["peace","Прекращение огня"],["talks","Переговоры"],["iran","Иран"]].map(([id,label])=>h("button",{type:"button",key:id,className:filter===id?"active":"",onClick:()=>{setFilter(id);setMore(false)}},label))),
 error?t("p","error",error):null,
 data?h("div",{className:"data-grid"},...selected.map(m=>h(MarketCard,{key:m.id,m}))):h(Loading),
 markets.length>9?h("button",{className:"more",type:"button",onClick:()=>setMore(!more)},more?"Свернуть":"Показать все ("+markets.length+")"):null,
 t("p","footnote","Цены и объёмы сохранены в последнем снимке. Реальные условия расчёта исходов — на странице каждого рынка.")),
 h(AviationContext,{data}),
 h("section",{className:"section"},h(Head,{title:"Официальные источники",sub:"Сообщения MARAD и CENTCOM / DVIDS из архива мониторинга"}),
 h("div",{className:"data-grid-2"},h(Card,null,t("h3",null,"MARAD · море"),data?h(DataItems,{items:data.marad,kind:"marad"}):h(Loading)),h(Card,null,t("h3",null,"CENTCOM / DVIDS"),data?h(DataItems,{items:data.centcom,kind:"centcom"}):h(Loading)))),
 h("section",{className:"section",id:"sources"},h(Head,{title:"Все источники",sub:"Последние результаты опросов — не оценки уровня угроз"}),h(Card,null,
 h(SourceList,{sources:data?.sources}),
 t("p","footnote","Микроскопические тайлы NASA не выводятся как полноценные спутниковые снимки."))),
 h("div",{className:"footer"},t("span",null,"REGIONAL WATCH · Данные из открытых источников"),t("span",null,"Официальные тревоги — только через Командование тыла")));
}

function GoLink({to,go,children,className}){return h("a",{href:to,className,onClick:e=>{if(e.button||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;e.preventDefault();go(to)}},children)}

function Digest({cases}){
 const changes=Array.isArray(cases?.changes)?cases.changes:[];
 return h("section",{className:"section rw-digest",id:"changes"},
  h(Head,{title:UI_HE?"מה השתנה":"Что изменилось",sub:UI_HE?"השינויים בין מחזורי הבדיקה, לא מספר בקשות חדשות":"Разница между последними циклами анализа и обновлениями журнала, а не счётчик новых запросов"}),
  !cases?h(Loading,{label:UI_HE?"בודקים את השינויים האחרונים…":"Сверяем последние изменения…"}):
  h("div",{className:"rw-digest-grid"},
   ...changes.map(x=>h("div",{className:"rw-digest-item",key:x.id},
    h("div",{className:"rw-digest-icon"},x.kind==="assessment_changed"||x.kind==="journal_updated"?"✦":"✓"),
    h("div",null,t("strong",null,UI_HE?(x.title_he||"עדכון"):x.title),t("p",null,UI_HE?(x.description_he||"עדכון במעקב המקורות"):x.description),t("small",null,(UI_HE?"נבדק: ":"Проверено: ")+fmtTime(x.time))))),
   !changes.length?t("p","hint",UI_HE?"אין כרגע שינויים מתורגמים להצגה.":"Новых изменений в журнале пока нет."):null,
   t("p","rw-digest-foot",(UI_HE?"בדיקה אחרונה: ":"Последний цикл: ")+fmtTime(cases.lastCheck)+(UI_HE?" · מצב המקורות מופיע במדור ״נתונים״.":" · "+(cases.sourceCoverage?.hasKnownGaps?"Есть пробелы в некоторых источниках":"Статус источников можно проверить в разделе «Данные»")+".")))
 );
}

function rwEditorialPending(s){return /не обработано редакц|без редакционн(ого|ой) оформлен|редакционно не оформ/i.test(String(s?.basis||""))}
function rwEvidence(s){
 const b=String(s?.basis||"").trim();
 if(s?.verified===true&&b&&!rwEditorialPending(s))return {label:"Основание: "+b,hint:"Наличие источника или документа не доказывает все содержащиеся в них утверждения."};
 if(s?.verified===true)return {label:"Основание не уточнено",hint:"Система не указывает характер подтверждения"};
 return {label:s?.verified===false?"Подтверждение не установлено":"Статус подтверждения неизвестен",hint:"В базе нет подтверждения сведений; это не означает их опровержение."};
}
function rwUncertainty(s){const v=String(s?.uncertainty||"").trim();return !v||/^Статус подтверждения требует уточнения\.?$/i.test(v)?"Данные мониторинга не позволяют установить степень подтверждения сообщения. Это не означает его опровержения.":v}

function StoryTeaser({story,go}){
 const type=UI_HE?(HE_CATEGORY[story.category]||"אירוע"):story.type;
 const summary=story.summary||story.excerpt||story.body||"";
 const sourceCount=Array.isArray(story.sources)?story.sources.length:0;
 const eventPath=(UI_HE?"/he":"")+"/events?story="+encodeURIComponent(story.id);
 return h("article",{className:"rw-story-teaser"},
  h("div",{className:"rw-story-meta"},t("span",null,type),t("span",null,(UI_HE?"עודכן ":"Обновлено ")+fmtTime(story.observedAt||story.event_date||story.time))),
  t("h3",null,story.title),t("p",null,summary),
  !UI_HE&&story.context?t("div","rw-story-relevance","ДЕТАЛЬ · "+story.context):null,
  h("div",{className:"rw-story-footer"},t("span",null,UI_HE?(sourceCount+" מקורות · "+(story.verification_status==="multi_outlet_reporting"?"דיווחים ממספר כלי תקשורת":"דיווחי מקורות, ללא אימות עצמאי")):sourceCount+" источн. · "+rwEvidence(story).label+(rwEditorialPending(story)?" · Без редакционного оформления":"")),
   h("a",{href:eventPath},UI_HE?"לפתיחת תיק האירוע ←":"Открыть досье →"))
 );
}


function HomeV2({visible,overview,news,cases,go,errors}){
 const [expandedId,setExpandedId]=useState(null);
 const [read,setRead]=useState(()=>{try{return JSON.parse(localStorage.getItem("rw-react-read-v1")||"{}")}catch{return {}}});
 const readIt=id=>{const next={...read,[id]:Date.now()};setRead(next);try{localStorage.setItem("rw-react-read-v1",JSON.stringify(Object.fromEntries(Object.entries(next).sort((a,b)=>b[1]-a[1]).slice(0,100))))}catch{}};
 const stories=(Array.isArray(news?.stories)?news.stories:[]).slice(0,6);
 const featured=Array.isArray(cases?.stories)?cases.stories.slice(0,3):[];
 const toEvents=(UI_HE?"/he":"")+"/events",toFeed=toEvents+"#all-news",toData=(UI_HE?"/he":"")+"/data";
 const labels=UI_HE?
 {kicker:"סקירה אזורית / מודיעין ממקורות גלויים",title:"תמונת מצב",accent:"באזור.",desc:"מה קרה, מה השתנה ולמה זה חשוב. חדשות, אימותים ופרשנות מוצגים בנפרד.",stamp:"ניתוח אחרון",top:"עיקרי הבדיקה האחרונה",pending:"ממתינים לניתוח",assessment:"תמונת מצב ממקורות פתוחים",assessmentDesc:"הערכת המצב המפורטת בעברית עדיין אינה זמינה. ניתן לבדוק את מקורות הנתונים.",analysis:"ניתוח: ",compared:"נבדקו המקורות הזמינים",featured:"הסיפורים המרכזיים",featuredSub:"אירועים מתפתחים: מה ידוע ומה עדיין לא ברור",allEvents:"לכל האירועים ←",awaitCases:"ממתינים לתיקי אירועים מתורגמים…",onAir:"בשידור",onAirSub:"עד שש ידיעות אחרונות בעברית. דיווח אינו אימות עצמאי לאירוע.",fullFeed:"לכל העדכונים ←",feedError:"שגיאה בעדכון הידיעות: ",awaitNews:"טוענים ידיעות בעברית…",noNews:"אין כרגע ידיעות מוכנות בעברית.",fine:"עדכון ה-RSS מתבצע מדי 5 דקות. זמן פרסום הידיעה שונה ממועד קליטתה במערכת.",how:"כיצד פועל המעקב",howText:"תמונת המצב מבוססת על מקורות גלויים. אפשר לבדוק את מגבלות הנתונים ואת שיטת העבודה.",method:"נתונים ומתודולוגיה ←"}:
 {kicker:"РЕГИОНАЛЬНЫЙ ОБЗОР / OPEN SOURCE INTELLIGENCE",title:"Обстановка",accent:"в регионе.",desc:"Что произошло, что изменилось и почему это важно. Новости, подтверждения и аналитика — отдельно друг от друга.",stamp:"ПОСЛЕДНИЙ АНАЛИЗ",top:"ГЛАВНОЕ ИЗ ПОСЛЕДНЕГО АНАЛИЗА",pending:"АНАЛИЗ ОЖИДАЕТСЯ",assessment:"Загружаем аналитическую оценку",assessmentDesc:"Получаем последнюю оценку мониторинга.",analysis:"Анализ: ",compared:"Последнее сравнение выполнено по доступным источникам",featured:"Главные истории",featuredSub:"Развивающиеся темы, в которых отдельно указано, что известно и что остаётся неясным",allEvents:"Все события →",awaitCases:"Формируем досье из наблюдений и источников…",onAir:"В эфире",onAirSub:"Свежие русскоязычные публикации. Комментарий добавляется лишь там, где помогает понять новость.",fullFeed:"Вся лента →",feedError:"Сбой обновления RSS: ",awaitNews:"Получаем свежие публикации…",noNews:"Пока нет публикаций.",fine:"Проверка RSS — каждые 5 минут. Дата публикации указана отдельно от времени, когда запись получила система.",how:"Как работает мониторинг",howText:"Текущая картина строится по открытым источникам. Полноту данных, методологию и технические ограничения можно проверить отдельно.",method:"Данные и методология →"};
 return h("div",{className:"rw-page",hidden:!visible,id:"overview"},
  h(Intro,{kicker:labels.kicker,title:labels.title,accent:labels.accent,desc:labels.desc,stamp:{label:labels.stamp,main:simpleTime(overview?.analysis?.time),sub:fmtTime(overview?.analysis?.time)+" · Israel"}}),
  h("section",{className:"rw-situation"},
   h("div",{className:"rw-situation-top"},t("span","kicker",labels.top),t("span","badge"+(overview?.analysis?.state==="attention"?" alert":""),UI_HE?(overview?.analysis?.state==="attention"?"דורש תשומת לב":"מעקב פעיל"):(overview?.analysis?.badge||labels.pending))),
   t("h2",null,UI_HE?labels.assessment:overview?.analysis?.title||labels.assessment),
   t("p",null,UI_HE?labels.assessmentDesc:overview?.analysis?.description||labels.assessmentDesc),
   h("div",{className:"rw-situation-bottom"},t("span",null,labels.analysis+fmtTime(overview?.analysis?.time)),t("span",null,labels.compared))),
  h(Digest,{cases}),
  h("section",{className:"section"},h(Head,{title:labels.featured,sub:labels.featuredSub,right:h(GoLink,{to:toEvents,go,className:"rw-more-link"},labels.allEvents)}),
   featured.length?h("div",{className:"rw-feature-grid"},...featured.map(story=>h(StoryTeaser,{key:story.id,story,go}))):t("p","hint",cases?labels.awaitCases:labels.awaitCases)),
  h("section",{className:"section",id:"on-air"},h(Head,{title:labels.onAir,sub:labels.onAirSub,right:h(GoLink,{to:toFeed,go,className:"rw-more-link"},labels.fullFeed)}),
   errors?.news?t("p","error",labels.feedError+errors.news):null,
   stories.length?h(NewsMasonry,{stories,expandedId,onToggle:setExpandedId,read,markRead:readIt}):t("p","hint",news?labels.noNews:labels.awaitNews),
   t("p","rw-fineprint",labels.fine)),
  h(Editorial,{notes:news?.editorials}),
  h("section",{className:"section rw-service-line"},h("div",null,t("strong",null,labels.how),t("p",null,labels.howText)),
   h(GoLink,{to:toData,go,className:"rw-more-link"},labels.method))
 );
}
function NewsArchive({items}){
 const [expanded,setExpanded]=useState(null),[read,setRead]=useState({});
 return h("section",{className:"section",id:"all-news"},
  h(Head,{title:UI_HE?"כל העדכונים":"Последние публикации",sub:UI_HE?"ידיעות המקור הן דיווחים, לא אימות עצמאי של כל טענה":"Отдельная лента источников, не подтверждение каждого события"}),
  items?.length?h(NewsMasonry,{stories:items,expandedId:expanded,onToggle:setExpanded,read,markRead:id=>setRead(x=>({...x,[id]:true}))}):t("p","hint",UI_HE?"אין פרסומים מוכנים בעברית.":"Пока нет публикаций.")
 );
}

function rwEventMeta(story){
  const pieces=[];
  const raw=String(story.eventDate||"").trim();
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if(m){
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
    const dt=new Date(Date.UTC(y,mo-1,d,12));
    if(dt.getUTCFullYear()===y&&dt.getUTCMonth()===mo-1&&dt.getUTCDate()===d){
      const opts={timeZone:"UTC",day:"numeric",month:"long"};
      if(y!==new Date().getFullYear())opts.year="numeric";
      pieces.push("Событие: "+new Intl.DateTimeFormat(UI_HE?"he-IL":"ru-RU",opts).format(dt));
    }
  }
  if(story.observedAt&&!Number.isNaN(Date.parse(story.observedAt))){
    pieces.push("В журнале: "+fmtTime(story.observedAt));
  }
  return pieces.length?t("p","rw-event-meta",pieces.join(" · ")):null;
}
function rwMeaningfulTimeline(story){
  const rows=Array.isArray(story.timeline)?story.timeline:[];
  const steps=rows.map(x=>{
    if(!x||typeof x!=="object")return null;
    const label=String(x.description||x.text||x.summary||"").trim();
    const at=String(x.date||x.at||x.time||"").trim();
    if(label.length<18||!at||/^(дата|информация) (публикации )?(указана|уточняется)/i.test(label))return null;
    const timestamp=Date.parse(at);
    return Number.isNaN(timestamp)?null:{label,at};
  }).filter(Boolean);
  if(steps.length<2)return null;
  return h("section",{className:"rw-meaningful-timeline"},
    t("strong",null,"Хронология"),
    h("ol",null,...steps.slice(0,12).map((s,i)=>h("li",{key:i},
      h("time",{dateTime:s.at},fmtTime(s.at)),
      t("p",null,s.label)
    )))
  );
}

function StoryDossier({story,open,onToggle}){
 const numSources=story.sources?.length||0;
 return h("article",{className:"rw-dossier",id:"case-"+story.id},
  h("div",{className:"rw-dossier-top"},
   h("div",{className:"rw-story-meta"},t("span",null,story.type),t("span",null,"Обновлено "+fmtTime(story.observedAt))),
   h("div",{className:"rw-verification-tags"},h("span",{className:"rw-status-tag"+(!story.verified?" uncertain":""),title:rwEvidence(story).hint},rwEvidence(story).label),rwEditorialPending(story)?h("span",{className:"rw-editorial-tag",title:"Редакционный формат публикации отсутствует; это не означает текущую проверку"},"Без редакционного оформления"):null)),
  t("h3",null,story.title),
  rwEventMeta(story),
  t("p",null,story.summary),
  story.context?h("div",{className:"rw-dossier-insight"},t("strong",null,"Дополнительные факты"),t("p",null,story.context)):null,
  h("div",{className:"rw-dossier-actions"},
   h("button",{type:"button",onClick:()=>onToggle(open?null:story.id)},open?"Свернуть подробности −":"Подробности и источники +"),
   t("span",null,numSources+" источн. · "+(story.related?.length||0)+" связанных публикаций")),
  open?h("div",{className:"rw-dossier-detail"},
   rwMeaningfulTimeline(story),
   t("strong",null,"Что остаётся неясным"),t("p",null,rwUncertainty(story)),
   t("strong",null,"Первоисточники"),
   story.sources?.length?h("div",{className:"rw-link-list"},...story.sources.map((s,i)=>h(External,{key:i,url:s.url},s.label+" ↗"))):t("p","hint","Проверяемой ссылки на исходную запись нет."),
   story.related?.length?h("div",null,t("strong",null,"Публикации по этой истории"),...story.related.map(r=>h("div",{className:"rw-related-line",key:r.id},h(External,{url:r.url},r.title),t("small",null,r.source+" · "+fmtTime(r.time))))):null,
   null):null);
}
function CasesPageV2({visible,cases,news}){
 const [group,setGroup]=useState("all");
 const [expanded,setExpanded]=useState(null);
 const [expandedNews,setExpandedNews]=useState(null);const deepLinkVisited=useRef(null);
 const [read,setRead]=useState({});
 useEffect(()=>{
  const id=new URLSearchParams(location.search).get("story");
  if(!id||deepLinkVisited.current===id||!cases?.stories?.some(x=>x.id===id))return;deepLinkVisited.current=id;
  setGroup("all");setExpanded(id);
  const timer=setTimeout(()=>{
   const node=document.getElementById("case-"+id);node?.setAttribute("tabindex","-1");node?.focus({preventScroll:true});node?.scrollIntoView({
    behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",
    block:"start"
   });
  },160);
  return()=>clearTimeout(timer);
 },[cases]);
 const groups=[["all","Все"],["security","Безопасность"],["aviation","Авиация"],["maritime","Море"],["other","Прочее"]];
 const list=(cases?.stories||[]).filter(x=>group==="all"||x.group===group);
 return h("div",{className:"rw-page",hidden:!visible,id:"events-page"},
  h(Intro,{kicker:"ДОСЬЕ · ОТ ПЕРВОИСТОЧНИКА ДО ВЫВОДА",title:"События",accent:"и контекст.",desc:"Не просто поток заголовков: история каждого эпизода, дата самого события, сообщения источников и то, что удалось подтвердить.",meta:cases?"Журнал: "+cases.storyCount+" историй · анализ "+fmtTime(cases.lastCheck):"Сверяем журнал…"}),
  h("section",{className:"section"},h(Head,{title:"Досье мониторинга",sub:"Каждая история объединяет наблюдения и публикации. Непроверенные выводы не выдаются за факты.",right:t("span","hint",list.length+" историй")}),
   h("div",{className:"filters"},...groups.map(([id,label])=>h("button",{type:"button",key:id,className:group===id?"active":"", "aria-pressed":group===id,onClick:()=>setGroup(id)},label))),
   cases?h("div",{className:"rw-dossier-list"},...list.map(story=>h(StoryDossier,{key:story.id,story,open:expanded===story.id,onToggle:setExpanded}))):h(Loading,{label:"Загружаем журнал мониторинга…"}),
   !list.length&&cases?t("p","hint","В этой категории пока нет записей."):null),
  h("section",{className:"section",id:"all-news"},h(Head,{title:"Последние публикации",sub:"Отдельная новостная лента. Публикация источника сама по себе не равна подтверждённому происшествию.",right:t("span","hint",news?.stories?.length?news.stories.length+" записей":"")}),
    news?h(NewsMasonry,{stories:news.stories||[],expandedId:expandedNews,onToggle:setExpandedNews,read,markRead:id=>setRead(s=>({...s,[id]:true}))}):h(Loading)),
  h("div",{className:"rw-fineprint"},"Редакционная классификация отражает объём доступных сведений, а не оценку вероятности новых атак. Официальное заявление подтверждает факт заявления, но не обязательно каждое содержащееся в нём утверждение.")
 );
}



function AviationExplainedV2(){
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
function MarketCardV2({m}){
 const change=m.changePoints;
 const movement=Number.isFinite(change) ? ((change>0?"+":"")+change.toLocaleString("ru-RU",{maximumFractionDigits:1})+" п.п. цены YES") : null;
 return h("article",{className:"market rw-market-card"},
   t("span","kicker",classifyMarket(m.question)==="peace"?"ПЕРЕМИРИЕ":classifyMarket(m.question)==="talks"?"ДИПЛОМАТИЯ":"ИРАН"),
   t("h3",null,marketTitle(m.question)),
   t("b",null,ruPct(m.yes)),
   h("div",{className:"bar"},h("i",{style:{width:Math.max(0,Math.min(100,Number(m.yes||0)*100))+"%"}})),
   movement?h("div",{className:"rw-market-change"},t("strong",null,movement),t("small",null,"В сравнении со снимком "+fmtTime(m.comparisonFrom))):t("div","rw-market-change",t("small",null,"Для динамики пока нет второго снимка")),
   h("div",{className:"market-meta"},t("span",null,"Оборот за 24 ч: "+ruMoney(m.volume)),t("span",null,"Ликвидность: "+ruMoney(m.liquidity))),
   t("span","hint","Котировка: "+fmtTime(m.asOf)),
   h(External,{url:m.url},"Условия исхода и исходные данные ↗")
 );
}




function SatelliteCatalog(){
 const [state,setState]=useState({loading:true,report:null});
 useEffect(()=>{let alive=true;let controller=new AbortController();
  async function reload(){try{const res=await fetch("/api/rw/satellite",{cache:"no-store",signal:controller.signal});if(!res.ok)throw Error("satellite "+res.status);const r=await res.json();if(alive)setState({loading:false,report:r});}catch(e){if(alive&&e.name!=="AbortError")setState({loading:false,report:null})}}
  reload();const timer=setInterval(()=>{if(!document.hidden)reload()},300000);return()=>{alive=false;clearInterval(timer);controller.abort()};
 },[]);
 const r=state.report;
 if(!r||r.display_policy!=="show"||r.has_publishable_content===false)return null;
 const entries=(r.signals||[]).filter(x=>x.is_live===true||x.confirmation_status==="verified"||x.confidence==="corroborated"||x.confidence==="official_verified");
 if(!entries.length)return null;
 return h("section",{className:"section",id:"satellite"},h(Head,{title:"Спутниковые данные",sub:"Только значимые проверенные материалы; сырые радарные отсчёты скрыты"}),
  h("div",{className:"rw-relevance-cards"},...entries.slice(0,8).map(x=>h("article",{className:"rw-relevance",key:x.id},
   t("span","kicker",x.source?.name||"Спутниковый источник"),t("h3",null,x.title),
   t("p",null,x.description),t("small",null,x.caveat||"Содержимое требует сверки с первоисточником."),
   x.source?.url?h(External,{url:x.source.url},"Первоисточник ↗"):null))));
}
function DataRoomV2({visible,data,error}){
 const [filter,setFilter]=useState("all"),[more,setMore]=useState(false);
 const markets=(data?.markets||[]).filter(x=>filter==="all"||classifyMarket(x.question)===filter).sort((a,b)=>(b.volume||0)-(a.volume||0));
 const selected=more?markets:markets.slice(0,6);
 const sources=data?.sources||[],issues=sources.filter(x=>x.state==="error"||x.state==="partial");
 return h("div",{className:"rw-page",hidden:!visible,id:"data-room"},
 h(Intro,{kicker:"ИССЛЕДОВАТЕЛЬСКИЙ УРОВЕНЬ / ОТКРЫТЫЕ ДАННЫЕ",title:"Данные",accent:"и источники.",desc:"Здесь можно проверить первоисточники и глубже изучить наблюдения. Технические детали раскрываются по желанию.",meta:data?"Последняя выгрузка: "+fmtTime(data.generatedAt)+" · автоматическое обновление":"Получаем данные…"}),
 h("nav",{className:"rw-data-nav","aria-label":"Разделы данных"},
  ...[["#civil","Гражданская безопасность"],["#markets","Ожидания рынка"],["#official","Официальные источники"],["#diagnostics","Методология"]].map(([link,name])=>h("a",{href:link,key:link},name))),
 h("section",{className:"section",id:"civil"},h(Head,{title:"Служба тыла и гражданская безопасность",sub:"Официальные источники прежде любых оценок"}),
  h(Card,null,t("span","notice","Прямое получение тревог не подключено"),
   t("p",null,"Для действующих предупреждений используй официальные каналы Командования тыла. Сообщения ЦАХАЛ ниже — история публикаций, а не система экстренного оповещения."),
   h("div",{className:"links"},h(External,{url:"https://www.oref.org.il/"},"Служба тыла ↗"),h(External,{url:"https://alerts-history.oref.org.il/"},"История предупреждений ↗"),h(External,{url:"https://t.me/PikudHaOref_all"},"Официальные сообщения ↗")),
   t("h3",null,"Последние переведённые сообщения ЦАХАЛ"),
   data?h(DataItems,{items:(data.home||[]).slice(0,4),kind:"idf"}):h(Loading))),
 h("section",{className:"section",id:"markets"},h(Head,{title:"Polymarket: ожидания участников рынка",sub:"Цена исхода YES — это рыночная котировка, а не подтверждение будущего события",right:t("span","hint",markets.length+" рынков")}),
  h("div",{className:"filters"},...[["all","Все"],["peace","Прекращение огня"],["talks","Переговоры"],["iran","Иран"]].map(([id,label])=>h("button",{type:"button",key:id,className:filter===id?"active":"",onClick:()=>{setFilter(id);setMore(false)}},label))),
  error?t("p","error",error):null,
  data?h("div",{className:"data-grid"},...selected.map(x=>h(MarketCardV2,{key:x.id,m:x}))):h(Loading),
  markets.length>6?h("button",{type:"button",className:"more",onClick:()=>setMore(!more)},more?"Свернуть":"Показать остальные ("+(markets.length-6)+")"):null,
  t("p","rw-fineprint","Данные из последнего сохранённого снимка. Для оценки динамики нужны сопоставимые предыдущие котировки и объёмы. Условия расчёта исхода указаны на странице рынка.")),
 h(AviationExplainedV2,{data}),
 h(SatelliteCatalog,{data}),
 h("section",{className:"section",id:"official"},h(Head,{title:"Море и официальные публикации",sub:"Документы ведомств, а не автоматически подтверждённые события"}),
  h("div",{className:"data-grid-2"},h(Card,null,t("h3",null,"MARAD · морские предупреждения"),data?h(DataItems,{items:data.marad,kind:"marad"}):h(Loading)),
   h(Card,null,t("h3",null,"CENTCOM / DVIDS"),data?h(DataItems,{items:data.centcom,kind:"centcom"}):h(Loading)))),
 h("section",{className:"section",id:"diagnostics"},h(Head,{title:"Методология и полнота наблюдений",sub:"Что может ограничить выводы мониторинга"}),
  h(Card,null,
   h("div",{className:"rw-quality-summary"},h("div",null,t("strong",null,sources.length?issues.length+" из "+sources.length+" источников работают с ограничениями":"Проверяем источники"),t("p",null,"Источник со статусом «нет записей» не равен источнику с ошибкой. Ошибки подключения могут создать пробелы в наблюдениях."))),
   h("details",{className:"rw-technical-details"},h("summary",null,"Показать список источников и технические статусы"),h(SourceList,{sources})),
   t("p","rw-fineprint","REGIONAL WATCH использует открытые сведения. Отсутствие сигнала, записи в базе или воздушного трека не означает отсутствия реального события.")))
 );
}



function RuAnalystPage({visible}){const parts=location.pathname.split("/").filter(Boolean),slug=parts[0]==="analysts"&&parts[1]?decodeURIComponent(parts[1]):null;const [q,setQ]=useState(""),[refresh,setRefresh]=useState(0);const posts=useFeed("/api/analyst-posts?lang=ru&refresh="+refresh,120000,visible&&!slug),people=useFeed("/api/analysts?lang=ru&refresh="+refresh,300000,visible&&!slug),detail=useFeed("/api/analyst-posts/"+encodeURIComponent(slug||"none")+"?lang=ru&refresh="+refresh,120000,visible&&!!slug);const list=Array.isArray(posts.value?.posts)?posts.value.posts:[],profiles=Array.isArray(people.value?.analysts)?people.value.analysts:[],names=new Map(profiles.map(x=>[x.id,x.display_name]));const filtered=list.filter(x=>(String(x.headline||"")+" "+String(x.summary||"")+" "+String(x.analyst?.display_name||names.get(x.analyst_id)||"")).toLocaleLowerCase("ru").includes(q.toLocaleLowerCase("ru")));const retry=h("button",{type:"button",className:"rw-analyst-retry",onClick:()=>setRefresh(v=>v+1)},"Обновить");function dateRow(p){return h("div",{className:"rw-analyst-dates"},p.original_published_at_ms?h("time",{dateTime:new Date(p.original_published_at_ms).toISOString()},"Источник: "+fmtTime(p.original_published_at_ms)):null,p.published_at_ms?h("time",{dateTime:new Date(p.published_at_ms).toISOString()},"На сайте: "+fmtTime(p.published_at_ms)):null)}function article(p){const source=p.analyst?.display_name||names.get(p.analyst_id)||"Аналитический источник";return h("article",{className:"rw-analyst-article",key:p.id},h("div",{className:"rw-analyst-meta"},t("span","kicker",source),t("span","hint",p.source_type||"")),h("h3",null,h("a",{href:"/analysts/"+encodeURIComponent(p.id)},p.headline||"Публикация")),t("p",null,p.summary||"Аннотация пока недоступна."),dateRow(p),h("div",{className:"rw-analyst-links"},p.original_url?h(External,{url:p.original_url},"Первоисточник ↗"):null,h("a",{href:"/analysts/"+encodeURIComponent(p.id)},"Открыть публикацию")))}const fail=t("p","rw-analyst-error","Часть данных временно недоступна. Последние успешно загруженные публикации сохранены.");return h("div",{className:"rw-page",hidden:!visible},h(Intro,{kicker:"РЕДАКЦИОННАЯ АНАЛИТИКА / ОТКРЫТЫЕ ИСТОЧНИКИ",title:"Аналитики",accent:"и публикации.",desc:"Атрибутированные материалы аналитиков. Мнение автора не является независимым подтверждением факта."}),slug?h("section",{className:"section"},h(Head,{title:"Публикация аналитика",sub:"Дата источника и время публикации на сайте указаны отдельно"}),detail.value?.id===slug?article(detail.value):t("p","rw-analyst-empty",detail.error?"Не удалось загрузить публикацию.":"Загружаем публикацию…"),detail.error?retry:null):h("section",{className:"section"},h(Head,{title:"Лента аналитиков",sub:"Публикации и профили загружаются независимо друг от друга"}),h("div",{className:"rw-analyst-controls"},h("input",{type:"search",placeholder:"Поиск по публикациям",value:q,onChange:e=>setQ(e.target.value),"aria-label":"Поиск по публикациям"}),retry),posts.error||people.error?fail:null,filtered.length?h("div",{className:"rw-analyst-grid"},...filtered.map(article)):t("p","rw-analyst-empty",posts.error?"Публикации временно недоступны.":q?"Ничего не найдено.":"Публикации пока загружаются или отсутствуют."),profiles.length?h("section",{className:"rw-analyst-profiles"},h("h2",null,"Источники и авторы"),h("div",{className:"rw-analyst-grid"},...profiles.map(p=>h("article",{className:"rw-analyst-article",key:p.id},h("h3",null,p.display_name||p.id),t("p",null,p.description||""))))):null))}


function GlobalHeader({active,overview}){
 const [menu,setMenu]=useState(false),[panel,setPanel]=useState(false);
 const modalRef=useRef(null),triggerRef=useRef(null);
 const he=UI_HE,section=active==="/events"?"events":active==="/data"?"data":active==="/analysts"?"analysts":"";
 const suffix=section==="analysts"&&location.pathname.split("/").filter(Boolean).length>1&&location.pathname.includes("/analysts/")?"/"+encodeURIComponent(location.pathname.split("/").filter(Boolean).pop()):"";
 const href=(locale,slug=section)=>(locale==="he"?"/he":"")+(slug?"/"+slug+(slug==="analysts"?suffix:""):"/")+location.search;
 const names=[["","Обстановка","תמונת מצב"],["events","События","אירועים"],["data","Данные","נתונים"],["analysts","Аналитики","פרשנים"]];
 const list=Array.isArray(overview?.sources)?overview.sources:[];
 const good=overview?.available,number=overview?.total;
 const status=Number.isFinite(good)&&Number.isFinite(number)?good+"/"+number:"—";
 useEffect(()=>{const node=modalRef.current;if(panel&&node&&!node.open)node.showModal();return()=>{if(node?.open)node.close()}},[panel]);
 const store=locale=>{try{localStorage.setItem("rw-language",locale)}catch{}};
 return h("header",{className:"rw-header rw-global-header","data-site-nav":"1"},
  h("a",{className:"rw-skip-link",href:"#main-content"},he?"דלג לתוכן":"К содержимому"),
  h("a",{className:"brand",href:href(he?"he":"ru","")},t("span","logo","◎"),h("span",null,t("strong",null,"REGIONAL WATCH"),t("small",null,"ISRAEL / OSINT MONITORING"))),
  h("div",{className:"rw-site-actions"},
   h("button",{type:"button",ref:triggerRef,className:"rw-site-source",onClick:()=>setPanel(true),"aria-haspopup":"dialog","aria-label":he?"מצב מקורות":"Состояние источников"},h("span",{className:"rw-source-label-full"},he?"מקורות":"Источники"),h("span",{className:"rw-source-label-short"},he?"מקורות":"Ист."),h("span",{className:"rw-site-source-count"},status)),
   h("div",{className:"rw-site-language",dir:"ltr","aria-label":he?"בחירת שפה":"Выбор языка"},
    ...[["ru","RU"],["he","עברית"]].map(([locale,title])=>h("a",{key:locale,href:href(locale),lang:locale,className:(locale==="he")===he?"active":undefined,"aria-current":(locale==="he")===he?"page":undefined,onClick:()=>store(locale)},title))),
   h("button",{type:"button",className:"rw-site-menu","aria-label":he?"פתיחת תפריט":"Открыть меню","aria-expanded":menu,"aria-controls":"rw-site-links",onClick:()=>setMenu(x=>!x)},menu?"×":"☰")),
  h("nav",{className:"rw-site-links",id:"rw-site-links","data-open":menu?"true":"false","aria-label":he?"ניווט ראשי":"Разделы сайта"},
   ...names.map(([slug,ru,iv])=>h("a",{key:slug,href:href(he?"he":"ru",slug),className:section===slug?"active":undefined,"aria-current":section===slug?"page":undefined},he?iv:ru))),
  panel?h("dialog",{ref:modalRef,className:"rw-dlg","aria-labelledby":"rw-dialog-title",onClose:()=>{setPanel(false);requestAnimationFrame(()=>triggerRef.current?.focus())}},
   h("div",{className:"rw-dlg-head"},h("h2",{id:"rw-dialog-title"},he?"מצב מקורות":"Состояние источников"),h("button",{type:"button",className:"rw-dlg-close",onClick:()=>setPanel(false)},he?"סגירה":"Закрыть")),
   h("p",{className:"rw-dlg-counter"},status),
   list.length?h("div",{className:"rw-dlg-items"},...list.map((x,i)=>h("div",{className:"rw-dlg-row",key:x.id||i},h("span",null,x.label||x.id||"—"),h("span",{className:"rw-dlg-state"},x.state==="ok"?(he?"תקין":"Работает"):x.state==="partial"?(he?"חלקי":"Частично"):x.state==="error"?(he?"שגיאה":"Ошибка"):x.state||"—")))):t("p","hint",he?"אין כרגע פרטי מקור זמינים.":"Список источников пока недоступен."),
   h("a",{className:"rw-dlg-more",href:href(he?"he":"ru","data")},he?"פרטים ומגבלות נתונים":"Подробнее о данных и ограничениях")
  ):null
 );
}


function App(){
 const normalizePath=()=>{const p=UI_HE?location.pathname.replace(/^\/he(?=\/|$)/,"")||"/":location.pathname;return p.startsWith("/analysts")?"/analysts":p.startsWith("/data")?"/data":p.startsWith("/events")?"/events":"/"};
 const [route,setRoute]=useState(normalizePath);
 const current=useRef(route);current.current=route;
 const scrollPositions=useRef({"/":0,"/events":0,"/data":0,"/analysts":0});
 function switchRoute(path,fromPop){
  const nextPath=new URL(path,location.origin),p=UI_HE?nextPath.pathname.replace(/^\/he(?=\/|$)/,"")||"/":nextPath.pathname;
  const target=p.startsWith("/analysts")?"/analysts":p.startsWith("/data")?"/data":p.startsWith("/events")?"/events":"/";
  if(target===current.current&&nextPath.href===location.href)return;
  scrollPositions.current[current.current]=window.scrollY;
  if(!fromPop)history.pushState({path:target},"",nextPath.pathname+nextPath.search+nextPath.hash);
  if(D.flushSync)D.flushSync(()=>setRoute(target));else setRoute(target);
  requestAnimationFrame(()=>{const anchor=nextPath.hash?document.getElementById(decodeURIComponent(nextPath.hash.slice(1))):null;if(anchor)anchor.scrollIntoView({block:"start"});else window.scrollTo({top:scrollPositions.current[target]||0,behavior:"instant"})});
 }
 function go(path){if(document.startViewTransition)document.startViewTransition(()=>switchRoute(path,false));else switchRoute(path,false)}
 useEffect(()=>{const pop=()=>switchRoute(location.pathname+location.search+location.hash,true);window.addEventListener("popstate",pop);return()=>window.removeEventListener("popstate",pop)},[]);
 useEffect(()=>{document.title=(UI_HE?HE_TEXT[route==="/events"?"events":route==="/data"?"data":route==="/analysts"?"analysts":"home"][0]:route==="/events"?"События и контекст":route==="/data"?"Данные и источники":route==="/analysts"?"Аналитики и публикации":"Обстановка в регионе")+" — REGIONAL WATCH"},[route]);
 const overview=useFeed("/api/overview",60000,true);
 const pages=route==="/"||route==="/events";
 const news=useFeed(UI_HE?"/api/rw-localized/news":"/api/news",60000,pages);
 const cases=useFeed(UI_HE?"/api/rw-localized/stories":"/api/stories",60000,pages);
 const editorial=useFeed("/api/rw-localized/editorial",120000,UI_HE&&route==="/");
 const data=useFeed("/api/data",120000,!UI_HE&&route==="/data");
 const heAviation=useFeed("/api/rw-localized/aviation",180000,UI_HE&&route==="/data");
 const heSatellite=useFeed("/api/rw-localized/satellite",180000,UI_HE&&route==="/data");
 const hePosts=useFeed("/api/rw-localized/analysts",90000,UI_HE&&route==="/analysts");
 const heProfiles=useFeed("/api/rw-localized/profiles",300000,UI_HE&&route==="/analysts");
 const readyNews=UI_HE?HE_ITEMS(news.value).map(x=>({...x,time:x.time||x.published_ms,source:x.source||x.publisher||x.source_name,discoveredAt:x.discoveredAt||x.discovered_at})):Array.isArray(news.value?.stories)?news.value.stories:[];
 const normalizedEditorial=UI_HE?HE_ITEMS(editorial.value).map(x=>({...x,headline:x.headline||x.title,text:x.text||x.body||x.excerpt,sourceUrl:x.sourceUrl||x.url,time:x.time||x.published_ms})):Array.isArray(news.value?.editorials)?news.value.editorials:[];
 const normalizedNews=news.value?{stories:readyNews,editorials:normalizedEditorial}:null;
 const readyCases=UI_HE?HE_ITEMS(cases.value):Array.isArray(cases.value?.stories)?cases.value.stories:[];
 const normalizedCases=UI_HE?(cases.value?{stories:readyCases,changes:[],lastCheck:overview.value?.analysis?.time,sourceCoverage:{hasKnownGaps:false}}:null):cases.value;
 return h("div",{className:"app-container"},
  h(GlobalHeader,{active:route,overview:overview.value}),
  h("main",{id:"main-content"},
   h(HomeV2,{visible:route==="/",overview:overview.value,news:normalizedNews,cases:normalizedCases,go,errors:{news:news.error,cases:cases.error}}),
   UI_HE?(route==="/events"?h("div",{className:"rw-page"},h(HeEvents,{feed:cases}),h(NewsArchive,{items:readyNews})):null):h(CasesPageV2,{visible:route==="/events",cases:cases.value,news:news.value}),
   UI_HE?(route==="/data"?h(HeData,{aviation:heAviation,satellite:heSatellite}):null):h(DataRoomV2,{visible:route==="/data",data:data.value,error:data.error}),
   UI_HE?(route==="/analysts"?h(HeAnalysts,{posts:hePosts,profiles:heProfiles}):null):h(RuAnalystPage,{visible:route==="/analysts"})
  )
 );
}

const HE_TEXT={home:["תמונת מצב","באזור.","חדשות ממקורות פתוחים, מאומתות ומתורגמות כשיש תרגום זמין."],events:["אירועים","והקשר.","תיקי אירועים עם מקורות ורמת אימות."],data:["נתונים","ומקורות.","ניתוחים בעלי ערך בלבד; טלמטריה גולמית מוסתרת."],analysts:["פרשנים","וניתוחים.","דברי הכותבים אינם מהווים אימות עצמאי לעובדות."]};
const HE_CATEGORY={israel_security_preparation:"היערכות ביטחונית בישראל",maritime_suspicious_activity:"פעילות ימית חריגה",security:"ביטחון",aviation:"תעופה",maritime:"ים",other:"אחר"};
const HE_VALID=x=>x&&x.content_language==="he"&&["available","ready"].includes(x.translation_status)&&/[\u0590-\u05ff]/u.test(x.title||"")&&/[\u0590-\u05ff]/u.test(x.excerpt||x.body||x.summary||"");
const HE_ITEMS=v=>Array.isArray(v?.items)?v.items.filter(HE_VALID):[];
function HeIntro({page}){const p=HE_TEXT[page];return h(Intro,{kicker:"REGIONAL WATCH / מעקב ממקורות פתוחים",title:p[0],accent:p[1],desc:p[2]})}
function HeNotice({error,text:label}){return h("p",{className:"rw-he-notice",role:error?"status":undefined},error?"טעינת הנתונים נכשלה. נסה לרענן.":label)}

function HeEventCard({story,selected}){const cat=HE_CATEGORY[story.category]||"אירוע",source=story.url||story.source_url||"",name="case-"+story.id;return h("details",{key:story.id,id:name,className:"rw-he-event",open:selected||undefined},h("summary",null,h("span",{className:"rw-he-meta"},cat+" · "+String(story.event_date||"")),t("h3",null,story.title),t("span","rw-he-expand","פרטים ומקורות")),h("div",{className:"rw-he-detail"},t("p",null,story.excerpt||story.body||story.summary||""),t("small","hint","תרגום האירוע אינו אימות עצמאי של כל טענה."),source?h(External,{url:source},"למקור ↗"):null))}
function HeEvents({feed}){const stories=HE_ITEMS(feed.value),target=new URLSearchParams(location.search).get("story"),visited=useRef(null);useEffect(()=>{if(!target||visited.current===target||!stories.some(x=>x.id===target))return;visited.current=target;const id="case-"+target;requestAnimationFrame(()=>{const el=document.getElementById(id);if(el){el.setAttribute("tabindex","-1");el.scrollIntoView({block:"start",behavior:"auto"});el.focus({preventScroll:true})}})},[feed.value,target]);return h("div",{className:"rw-page"},h(HeIntro,{page:"events"}),h("section",{className:"section"},h(Head,{title:"תיקי אירוע",sub:"מקורות ודיווחים, לא טלמטריה גולמית"}),stories.length?h("div",{className:"rw-he-grid"},...stories.map(s=>h(HeEventCard,{story:s,key:s.id,selected:target===s.id}))):h(HeNotice,{error:feed.error,text:target?"התרגום לתיק המבוקש אינו זמין.":"אין כרגע תיקים מתורגמים."})))}
function HeAnalystCard({post,name}){return h("article",{className:"rw-he-article",key:post.id},t("span","kicker",name||"פרשן"),h("h3",null,h("a",{href:"/he/analysts/"+encodeURIComponent(post.id)},post.title)),t("p",null,post.excerpt||post.body||post.summary||""),post.published_at_ms?h("time",{dateTime:new Date(post.published_at_ms).toISOString()},fmtTime(post.published_at_ms)):null,post.original_url?h(External,{url:post.original_url},"המקור ↗"):null)}
function HeAnalysts({posts,profiles}){const full=HE_ITEMS(posts.value),people=HE_ITEMS(profiles.value),name=new Map(people.map(x=>[x.id,x.title])),slug=location.pathname.startsWith("/he/analysts/")?decodeURIComponent(location.pathname.split("/").filter(Boolean).pop()):null,items=slug?full.filter(x=>x.id===slug):full;return h("div",{className:"rw-page"},h(HeIntro,{page:"analysts"}),h("section",{className:"section"},h(Head,{title:"פרסומי פרשנים",sub:"מקורות פתוחים — פרשנות אינה אימות עצמאי"}),items.length?h("div",{className:"rw-he-grid"},...items.map(x=>h(HeAnalystCard,{key:x.id,post:x,name:name.get(x.analyst_id)}))):h(HeNotice,{error:posts.error,text:slug?"התרגום לפרסום המבוקש עדיין אינו זמין.":"אין כרגע פרסומי פרשנים מתורגמים."})),!slug&&people.length?h("section",{className:"section"},h(Head,{title:"מקורות ופרשנים",sub:"פרופילים מתורגמים"}),h("div",{className:"rw-he-grid"},...people.map(x=>h("article",{key:x.id,className:"rw-he-article"},t("h3",null,x.title),t("p",null,x.body||x.excerpt))))):null)}
function HeData({aviation,satellite}){let visible=[];let failed=[];for(const [name,feed] of [["תעופה והודעות רשמיות",aviation],["מידע לווייני",satellite]]){if(feed.error)failed.push(name);const v=feed.value;if(!v||v.display_policy!=="show"||v.has_publishable_content===false)continue;const items=Array.isArray(v.items)?v.items:Array.isArray(v.signals)?v.signals:[];const ready=items.filter(x=>x.content_language==="he"&&["available","ready","localized_template"].includes(x.translation_status)&&/[\u0590-\u05ff]/u.test(x.title||"")&&/[\u0590-\u05ff]/u.test(x.description||""));if(ready.length)visible.push(h("section",{key:name,className:"section"},h(Head,{title:name,sub:"המידע אינו מעיד בהכרח על אירוע צבאי"}),h("div",{className:"rw-he-grid"},...ready.map(x=>h("article",{key:x.id,className:"rw-he-article"},t("h3",null,x.title),t("p",null,x.description),x.source?.url?h(External,{url:x.source.url},"למקור ↗"):null)))))}return h("div",{className:"rw-page"},h(HeIntro,{page:"data"}),...visible,failed.length?h(HeNotice,{error:true}):null,!visible.length&&!failed.length?h(HeNotice,{text:"אין כרגע נתונים בעלי משמעות מתאימים להצגה בעברית."}):null)}

const root=document.getElementById("root");
D.createRoot(root).render(h(App));
})();

;(()=>{"use strict";function init(){if(document.getElementById("rw-back-to-top"))return;const b=document.createElement("button");b.id="rw-back-to-top";b.type="button";b.textContent="↑";b.setAttribute("aria-label","Вернуться в начало страницы");b.title="Наверх";b.hidden=true;document.body.appendChild(b);const update=()=>{b.hidden=window.scrollY<360};b.addEventListener("click",()=>window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));window.addEventListener("scroll",update,{passive:true});update();}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();})();


