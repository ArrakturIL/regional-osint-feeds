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
function useFeed(endpoint,interval,enabled){const [value,setValue]=useState(null),[error,setError]=useState(null),[update,setUpdate]=useState(0),cache=useRef({last:0,ctrl:null});useEffect(()=>{if(!enabled)return;let active=true,pending=false;async function pull(){if(!active||document.hidden||pending)return;pending=true;const ctrl=new AbortController(),clock=setTimeout(()=>ctrl.abort(),12000);cache.current.ctrl=ctrl;try{const r=await fetch(endpoint,{cache:"no-store",signal:ctrl.signal,headers:{Accept:"application/json"}});if(!r.ok)throw Error("HTTP "+r.status);const j=await r.json();if(!j||typeof j!=="object"||Array.isArray(j))throw Error("Invalid API response");if(active){setValue(j);setError(null);cache.current.last=Date.now();setUpdate(cache.current.last)}}catch(e){if(active)setError(e.name==="AbortError"?(UI_HE?"זמן ההמתנה לשרת הסתיים":"Время ожидания ответа истекло"):e.message)}finally{clearTimeout(clock);pending=false}}const tick=()=>{if(!document.hidden&&Date.now()-cache.current.last>=interval)pull()};if(!cache.current.last||Date.now()-cache.current.last>Math.min(interval,10000))pull();const timer=setInterval(tick,Math.min(interval,30000));document.addEventListener("visibilitychange",tick);return()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",tick);cache.current.ctrl?.abort()}},[endpoint,interval,enabled]);return {value,error,update}}
function Loading({label}){return h("div",{className:"loading skeleton"},label||"Загружаем данные из D1…")}
function Card({children,className,id}){return h("div",{className:"panel"+(className?" "+className:""),id},children)}

const RW_ICON_PATHS={
 pulse:"M3 12h4l3-7 4 14 3-7h4",files:"M8 4h9l4 4v12H8zM3 8v12h13M17 4v4h4M11 12h7M11 16h7",pen:"M12 20h9M16.8 3.9a2 2 0 0 1 2.8 2.8L9 17.3l-4 1 1-4z",database:"M3 6c0-2 4-3 9-3s9 1 9 3-4 3-9 3-9-1-9-3zm0 0v12c0 2 4 3 9 3s9-1 9-3V6M3 12c0 2 4 3 9 3s9-1 9-3",activity:"M4 5h16M4 12h7l2-4 3 8 2-4h2M4 19h16",users:"M16 20v-2c0-2-2-4-5-4s-5 2-5 4v2M11 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM18 9a3 3 0 0 1 0 6M19 17a4 4 0 0 1 2 3",newspaper:"M4 4h12v14a4 4 0 0 0 4 4H8a4 4 0 0 1-4-4V4zm4 4h5M8 12h5M8 16h5M16 8h4v10a2 2 0 0 1-4 0"
};
function UiIcon({name,size=19}){return h("svg",{className:"rw-ui-icon",viewBox:"0 0 24 24",width:size,height:size,fill:"none",stroke:"currentColor",strokeWidth:"1.75",strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",focusable:"false"},h("path",{d:RW_ICON_PATHS[name]||RW_ICON_PATHS.files}))}
function Head({title,sub,right,icon}){return h("div",{className:"section-head"},h("div",null,h("div",{className:"rw-title-with-icon"},icon?h(UiIcon,{name:icon,size:21}):null,t("h2",null,title)),sub?t("p",null,sub):null),right||null)}

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
 return h("section",{className:"section rw-editorial-section",id:"editorial","aria-label":UI_HE?"דבר העורך":"Реплика редактора"},
  h(Card,{className:"editorial rw-editorial-panel"},
   h("div",{className:"kicker rw-editorial-kicker"},h(UiIcon,{name:"pen",size:18}),t("span",null,UI_HE?"דבר העורך · CHATGPT":"РЕПЛИКА РЕДАКТОРА · CHATGPT"),note?.time?t("span","hint",fmtTime(note.time)):null),
   note&&note.content_language&&note.content_language!==(UI_HE?"he":"ru")?h("small",{className:"rw-translation-state",role:"status"},UI_HE?"התרגום ממתין — הנוסח המקורי ברוסית":"Перевод ожидается — показан текст оригинала"):null,
   h("h2",{lang:note?.content_language||undefined,dir:"auto"},note?(note.headline||note.title):(UI_HE?"דבר העורך":"Реплика редактора")),
   h("p",{lang:note?.content_language||undefined,dir:"auto"},note?(note.text||note.body||note.excerpt||""):(UI_HE?"אין כרגע טור מערכת מאושר בעברית.":"Пока нет опубликованной редакционной реплики.")),
   note?.sourceUrl||note?.url?h(External,{url:note.sourceUrl||note.url},UI_HE?"למקור ↗":"Читать источник ↗"):null
  )
 );
}

function NewsCard({item,open,onToggle,read,markRead}){
 const id=item.id||item.url||item.title;
 const related=Array.isArray(item.related)?item.related:(Array.isArray(item.sources)?item.sources.filter(x=>x && (x.url||x.source_url)).map(x=>({url:x.url||x.source_url,source:x.publisher||x.name||x.source||"",title:x.title||x.headline||"",time:x.published_at||x.time||x.published_ms})):[]);
 const priority=Number(item.priority);const verified=item.verified===true||item.confirmed===true||item.confidence==="confirmed";const risk=String(item.severity||item.riskLevel||"").toLowerCase();const tone=verified&&["critical","imminent","emergency"].includes(risk)?[UI_HE?"קריטי":"Критично","critical"]:priority>=9?[UI_HE?"חשיבות גבוהה":"Высокий приоритет","high"]:priority>=7?[UI_HE?"חשיבות בינונית":"Средний приоритет","medium"]:[UI_HE?"רגיל":"Обычное","normal"];
 const isNew=!read&&item.discoveredAt&&Date.now()-Date.parse(item.discoveredAt)<86400000;
 return h("article",{className:"news-card"+(isNew?" new":""),"data-rw-importance":tone[1]},
  h("div",{className:"news-head"},t("span",null,item.source||item.publisher||(UI_HE?"מקור":"Источник")),h("time",{dateTime:item.time},fmtTime(item.time))),
  isNew?t("span","kicker",UI_HE?"חדש":"НОВОЕ"):null,h("span",{className:"rw-importance-badge","data-tone":tone[1],"aria-label":UI_HE?"עדיפות מערכתית של הידיעה":"Редакционный приоритет новости"},tone[0]),
  h("h3",{dir:"auto",lang:item.content_language||undefined},item.title||item.original||(UI_HE?"פרסום":"Публикация")),item.translation_state==="pending"||item.translation_state==="needs_review"?h("span",{className:"rw-news-translation-state"},UI_HE?"התרגום ממתין; מוצג נוסח המקור":"Перевод ожидается; показан оригинал"):null,
  (item.comment&&!/(?:\b(?:killed|dead|death|dies|murdered|fatalities|slain)\b|погиб|убит|смерт|жертв|נהרג|נרצח|הרוג|מתו)/i.test(String(item.title||item.original||"")+" "+String(item.excerpt||"")))?h("div",{className:"news-comment"},t("b",null,UI_HE?"הערת מערכת · AI":"РЕПЛИКА · ИИ"),t("p",null,item.comment)):null,
  (item.verification_status? h("p",{className:"rw-reporting-origin"},item.verification_status==="multi_outlet_reporting"?(UI_HE?"סוקר בכמה כלי תקשורת — לא אימות עצמאי של האירוע":"Освещалось несколькими редакциями — не независимое подтверждение фактов"):(UI_HE?"קו דיווח אחד — ללא אימות עצמאי":"Одна цепочка сообщений — без независимого подтверждения")):null),h("div",{className:"news-actions"},
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
 const state=cases?.digestState||"loading",he=UI_HE;
 const range=cases?.previousCheck&&cases?.lastCheck?(he?"תקופת ההשוואה: ":"Период сравнения: ")+fmtTime(cases.previousCheck)+" — "+fmtTime(cases.lastCheck):"";
  const insufficient=Number(cases?.sourceComparable)===0||state==="insufficient_comparison";
 const absent=insufficient?(he?"אין מספיק נתונים בני השוואה בין שני המחזורים כדי להסיק שלא חל שינוי.":"Недостаточно сопоставимых данных между циклами, чтобы утверждать отсутствие изменений."):(he?"בין שתי הבדיקות האחרונות לא נרשמו שינויים בתיקי המעקב או בהחלטת הניטור. אין בכך כדי לשלול אירועים שלא זוהו.":"Между двумя последними проверками не зарегистрированы изменения досье или решения мониторинга. Это не означает, что событий не было.");
return h("section",{className:"section rw-digest",id:"changes"},
  h(Head,{title:he?"מה השתנה":"Что изменилось",icon:"activity",sub:he?"השוואת שתי בדיקות בפועל, לא ספירת כותרות חדשות":"Сравнение двух реальных циклов мониторинга, а не счётчик новостей"}),
  !cases||state==="loading"?h(Loading,{label:he?"משווים את שני מחזורי המעקב האחרונים…":"Сравниваем два последних цикла мониторинга…"}):
  state==="error"?h("p",{className:"error",role:"alert"},he?"נתוני ההשוואה אינם זמינים כעת. נסו שוב בעוד זמן קצר.":"Не удалось загрузить сравнение циклов мониторинга. Попробуй обновить страницу."):
  state==="pending"?t("p","hint",he?"עדיין אין שתי בדיקות להשוואה.":"Пока недостаточно завершённых проверок для сравнения."):
  h("div",{className:"rw-digest-grid"},
   ...changes.map(x=>h("div",{className:"rw-digest-item",key:x.id},
    h("div",{className:"rw-digest-icon"},"✦"),
    h("div",null,t("strong",null,he?(x.title_he||"עדכון"):x.title),t("p",null,he?(x.description_he||"עדכון ברשומה"):x.description),x.story_id?h("a",{href:(he?"/he":"")+"/events?story="+encodeURIComponent(x.story_id)},he?"פתיחת התיק":"Открыть досье"):null,t("small",null,(he?"עודכן: ":"Обновлено: ")+fmtTime(x.time))))),
   !changes.length?t("p","hint",absent):null,
   range?t("p","rw-digest-range",range):null,
   Number(cases?.sourceComparable)>0?t("p","rw-digest-sources",he?"נרשמו עדכונים ב-"+cases.sourceUpdates+" מתוך "+cases.sourceComparable+" מקורות שניתן להשוות בשני המחזורים. עדכון מקור אינו אימות לאירוע.":"Записи обновились у "+cases.sourceUpdates+" из "+cases.sourceComparable+" источников, доступных для сравнения в обоих циклах. Обновление источника не подтверждает событие."):null,
   t("p","rw-digest-foot",(he?"בדיקה אחרונה: ":"Последняя проверка: ")+fmtTime(cases.lastCheck)+(he?" · פירוט הכיסוי במדור נתונים.":" · Подробности покрытия — в разделе «Данные».")))
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
  h("div",{className:"rw-story-meta"},t("span",null,type),t("span",null,(UI_HE?"עודכן ":"Обновлено ")+fmtTime(story.updated_at_ms||story.observedAt||story.event_date||story.time))),
  h("h3",{dir:"auto",lang:story.content_language||undefined},story.title),story.content_language&&story.content_language!==(UI_HE?"he":"ru")?h("small",{className:"rw-translation-state"},UI_HE?(story.content_language==="en"?"המקור באנגלית · התרגום ממתין":"המקור ברוסית · התרגום ממתין"):(story.content_language==="en"?"Оригинал на английском · перевод ожидается":"Оригинал на иврите · перевод ожидается")):null,t("p",null,summary),
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
   h("div",{className:"rw-situation-top"},t("span","kicker",labels.top),t("span","badge"+(overview?.analysis?.state==="attention"?" alert":""),UI_HE?(overview?.analysis?.state==="attention"?"דורש תשומת לב":overview?.analysis?.state==="normal"?"ללא התרעות חדשות":"ממתינים להערכה"):(overview?.analysis?.badge||labels.pending))),
   t("h2",null,UI_HE?(overview?.analysis?.state==="normal"?"לא זוהו התרעות חדשות":labels.assessment):overview?.analysis?.title||labels.assessment),
   t("p",null,UI_HE?(overview?.analysis?.state==="normal"?"בבדיקה האחרונה לא זוהו התרעות חדשות במקורות הזמינים. היעדר התראה אינו הוכחה להיעדר אירוע.":labels.assessmentDesc):overview?.analysis?.description||labels.assessmentDesc),
   h("div",{className:"rw-situation-bottom"},t("span",null,labels.analysis+fmtTime(overview?.analysis?.time)),t("span",null,labels.compared))),
  h("div",{className:"rw-editorial-lead"},h(Editorial,{notes:news?.editorials})),
  h(Digest,{cases}),
  h("section",{className:"section"},h(Head,{title:labels.featured,sub:labels.featuredSub,icon:"files",right:h(GoLink,{to:toEvents,go,className:"rw-more-link"},labels.allEvents)}),
   featured.length?h("div",{className:"rw-feature-grid"},...featured.map(story=>h(StoryTeaser,{key:story.id,story,go}))):errors?.cases?h("p",{className:"error",role:"alert"},(UI_HE?"שגיאה בטעינת התיקים: ":"Ошибка загрузки досье: ")+errors.cases):!cases?h(Loading,{label:labels.awaitCases}):t("p","hint",UI_HE?"אין כרגע תיקי מעקב.":"Пока нет досье мониторинга.")),
  h("div",{className:"rw-home-news-editorial"},h("section",{className:"section rw-home-feed",id:"on-air"},h(Head,{title:labels.onAir,sub:labels.onAirSub,icon:"pulse",right:h(GoLink,{to:toFeed,go,className:"rw-more-link"},labels.fullFeed)}),
   errors?.news?t("p","error",labels.feedError+errors.news):null,
   stories.length?h(NewsMasonry,{stories,expandedId,onToggle:setExpandedId,read,markRead:readIt}):errors?.news?null:(!news||news.feedPending)?h(Loading,{label:labels.awaitNews}):t("p","hint",labels.noNews),
   t("p","rw-fineprint",labels.fine)),
   null),
  h("section",{className:"section rw-service-line"},h("div",null,h("div",{className:"rw-title-with-icon"},h(UiIcon,{name:"database"}),t("strong",null,labels.how)),t("p",null,labels.howText)),
   h(GoLink,{to:toData,go,className:"rw-more-link"},labels.method))
 );
}

function rwNormalizeNewsArticle(x){
 return {id:x.event_id||x.id,event_id:x.event_id,source:x.source,title:x.headline||"",original:x.headline,excerpt:x.summary||"",comment:x.comment,url:x.url,time:Number.isFinite(x.published_ms)?new Date(x.published_ms).toISOString():null,priority:x.priority,verification_status:x.verification_status,source_count:x.source_count,reporting_origin_count:x.reporting_origin_count,article_count:x.article_count,translation_state:x.translation_state,content_language:x.content_language,related:Array.isArray(x.sources)?x.sources.filter(s=>s?.url&&s.article_id!==x.display_article_id).map(s=>({id:s.article_id,url:s.url,source:s.publisher||s.source,title:s.source||s.publisher||"",time:Number.isFinite(s.published_ms)?new Date(s.published_ms).toISOString():null})):[]};
}

function NewsArchive({items}){
 const [page,setPage]=useState(1),[expanded,setExpanded]=useState(null),[read,setRead]=useState({}),[result,setResult]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(null),[refresh,setRefresh]=useState(0);
 const pageSize=12;
 useEffect(()=>{
  let alive=true;const ctrl=new AbortController();
  setLoading(true);setError(null);setResult(null);
  (async()=>{const timer=setTimeout(()=>ctrl.abort(),14000);
   try{
    const url="/api/news?lang="+(UI_HE?"he":"ru")+"&limit="+pageSize+"&offset="+((page-1)*pageSize);
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


function rwSourceLabel(item,i){
 const s=typeof item==="string"?{url:item}:item||{};
 const explicit=s.label||s.title||s.publisher||s.name;
 if(typeof explicit==="string"&&explicit.trim()&&!/^(?:первоисточник|источник\s*\d*|מקור\s*\d*)$/i.test(explicit.trim()))return explicit.trim().slice(0,90);
 const url=s.url||s.source_url||s.link;
 try{const u=new URL(url),h=u.hostname.toLowerCase().replace(/^www\./,"");
  if(h==="reuters.com"||h.endsWith(".reuters.com"))return UI_HE?"Reuters · דיווח":"Reuters · публикация";
  if(h==="ukmto.org"||h.endsWith(".ukmto.org"))return /\/(?:advisories|notices)\/?$/i.test(u.pathname)?(UI_HE?"UKMTO · רשימת הודעות":"UKMTO · список предупреждений"):(UI_HE?"UKMTO · הודעה":"UKMTO · уведомление");
  if(h==="justice.gov"||h.endsWith(".justice.gov"))return UI_HE?"משרד המשפטים האמריקאי · מסמך":"Минюст США · документ";
  if(h==="apnews.com"||h.endsWith(".apnews.com"))return UI_HE?"AP · דיווח":"AP · публикация";
  return h.slice(0,65);
 }catch{return (UI_HE?"מקור ":"Источник ")+(i+1)}
}
function normalizeCase(story){
 const category=String(story.category||story.group||story.type||"").toLowerCase();
 const group=/aviation|air|carrier|militar/.test(category)?"aviation":/maritime|sea|ship|naval/.test(category)?"maritime":/security|preparation|strike|israel|iran/.test(category)?"security":"other";
 const sources=Array.isArray(story.sources)?story.sources.map((s,i)=>{const url=typeof s==="string"?s:s?.url||s?.source_url||s?.link;return{url,label:rwSourceLabel(s,i)}}).filter(s=>safeLink(s.url)):[];
 if(!sources.length&&safeLink(story.url))sources.push({url:story.url,label:UI_HE?"מקור ראשוני":"Первоисточник"});
 const date=story.updated_at_ms?new Date(story.updated_at_ms).toISOString():story.observedAt||story.collected_at||story.time||story.published_at||story.event_date;
 return {...story,group,type:UI_HE?(HE_CATEGORY[story.category]||({aviation:"תעופה",maritime:"ים",security:"ביטחון",other:"אחר"})[group]):(story.type||({aviation:"Авиация",maritime:"Море",security:"Безопасность",other:"Прочее"})[group]),eventDate:story.eventDate||story.event_date,observedAt:date,summary:story.summary||story.excerpt||story.body||"",sources};
}

function rwSpecificUnknown(story){
 const raw=UI_HE?(story.uncertainty_he||(story.content_language==="he"?story.uncertainty:"")):story.uncertainty;
 const v=String(raw||"").trim();
 if(!v||/^(?:Статус подтверждения требует уточнения|Данные мониторинга не позволяют установить степень подтверждения|המידע הזמין אינו מאפשר לאמת את כל הטענות)[.\s]*/iu.test(v))return null;
 return v;
}
function StoryDossier({story,open,onToggle}){
 const labels=UI_HE?{updated:"עודכן ",status:"דיווחי מקורות — אין אימות עצמאי לכל הטענות",notVerified:"סטטוס האימות אינו ידוע",additional:"פרטים נוספים",expand:"פרטים ומקורות +",close:"סגירת פרטים −",sources:"מקורות",related:"פרסומים קשורים",unclear:"מה עדיין לא ברור",uncertainty:"המידע הזמין אינו מאפשר לאמת את כל הטענות.",none:"אין קישור מאומת לרשומת המקור",event:"אירוע: ",recorded:"נרשם: "}:{updated:"Обновлено ",status:"Сообщения источников — не независимое подтверждение каждого утверждения",notVerified:"Статус подтверждения не установлен",additional:"Дополнительные факты",expand:"Подробности и источники +",close:"Свернуть подробности −",sources:"Первоисточники",related:"Связанные публикации",unclear:"Что остаётся неясным",uncertainty:"Данные мониторинга не позволяют установить степень подтверждения.",none:"Проверяемой ссылки на исходную запись нет.",event:"Событие: ",recorded:"В журнале: "};
 const sources=Array.isArray(story.sources)?story.sources:[],date=story.eventDate||story.event_date;
 return h("article",{className:"rw-dossier",id:"case-"+story.id,tabIndex:-1},
  h("div",{className:"rw-dossier-top"},
   h("div",{className:"rw-story-meta"},t("span",null,story.type),t("span",null,labels.updated+fmtTime(story.observedAt))),
   h("div",{className:"rw-verification-tags"},h("span",{className:"rw-status-tag uncertain"},labels.status)),
   h("h3",{dir:"auto",lang:story.content_language||undefined},story.title),story.content_language&&story.content_language!==(UI_HE?"he":"ru")?h("small",{className:"rw-translation-state"},UI_HE?(story.content_language==="en"?"המקור באנגלית · התרגום ממתין":"המקור ברוסית · התרגום ממתין"):(story.content_language==="en"?"Оригинал на английском · перевод ожидается":"Оригинал на иврите · перевод ожидается")):null,
   date?t("p","rw-event-meta",labels.event+String(date)+" · "+labels.recorded+fmtTime(story.observedAt)):null,
   t("p",null,story.summary||story.excerpt||""),
   story.context?t("div","rw-dossier-insight",t("strong",null,labels.additional),t("p",null,story.context)):null,
   h("div",{className:"rw-dossier-actions"},
    h("button",{type:"button","aria-expanded":!!open,"aria-controls":"case-details-"+story.id,onClick:()=>onToggle(open?null:story.id)},open?labels.close:labels.expand),
    t("span",null,sources.length+" "+labels.sources+" · "+(story.related?.length||0)+" "+labels.related))),
  open?h("div",{className:"rw-dossier-detail",id:"case-details-"+story.id},
   !UI_HE?rwMeaningfulTimeline(story):null,
   rwSpecificUnknown(story)?h("div",{className:"rw-dossier-unknown"},t("strong",null,labels.unclear),t("p",null,rwSpecificUnknown(story))):null,
   t("strong",null,labels.sources),
   sources.length?h("div",{className:"rw-link-list"},...sources.map((s,i)=>h(External,{key:s.url||i,url:s.url},s.label+" ↗"))):t("p","hint",labels.none),
   story.related?.length?h("div",null,t("strong",null,labels.related),...story.related.map((r,i)=>h("div",{className:"rw-related-line",key:r.id||i},h(External,{url:r.url},r.title||r.source||labels.sources),t("small",null,fmtTime(r.time))))):null):null);
}


function CasesPageV2({visible,cases,news,error}){
 const [group,setGroup]=useState("all"),[expanded,setExpanded]=useState(null),deepLinkVisited=useRef(null);
 const path="/"+(UI_HE?"he/":"")+"events";
 const strings=UI_HE?{kicker:"תיקי אירועים · ממקור למסקנה",title:"אירועים",accent:"והקשר.",desc:"לא רק כותרות: תיעוד האירועים, מועד התרחשותם, מקורות הדיווח ומה שאפשר לאמת.",meta:"תיקים במעקב: ",head:"תיקי אירוע",sub:"כל תיק מאחד מקורות ופרסומים. דיווח אינו אימות עצמאי.",all:"הכול",security:"ביטחון",aviation:"תעופה",maritime:"ים",other:"אחר",count:" תיקים",missing:"התרגום לתיק המבוקש אינו זמין כרגע.",switchOriginal:"הצג את הגרסה הרוסית",empty:"אין כרגע תיקים בקטגוריה זו.",load:"טוענים תיקי אירועים…",disclaimer:"סיווג מערכת הוא הערכת המידע הזמין, לא אימות של טענות המקורות."}:{kicker:"ДОСЬЕ · ОТ ПЕРВОИСТОЧНИКА ДО ВЫВОДА",title:"События",accent:"и контекст.",desc:"Не просто поток заголовков: история каждого эпизода, дата события, сообщения источников и то, что удалось подтвердить.",meta:"Журнал: ",head:"Досье мониторинга",sub:"Каждая история объединяет наблюдения и публикации. Непроверенные выводы не выдаются за факты.",all:"Все",security:"Безопасность",aviation:"Авиация",maritime:"Море",other:"Прочее",count:" историй",missing:"Запрашиваемое досье отсутствует в этой ленте.",switchOriginal:"Открыть оригинал",empty:"В этой категории пока нет записей.",load:"Загружаем журнал мониторинга…",disclaimer:"Редакционная классификация отражает объём доступных сведений, а не оценку вероятности событий."};
 const list=Array.isArray(cases?.stories)?cases.stories:[];
 const all=list.map(normalizeCase);
 const filtered=all.filter(x=>group==="all"||x.group===group);
 const id=new URLSearchParams(location.search).get("story");
 useEffect(()=>{if(!id||deepLinkVisited.current===id||!all.some(x=>x.id===id))return;deepLinkVisited.current=id;setGroup("all");setExpanded(id);const timer=setTimeout(()=>{const el=document.getElementById("case-"+id);el?.scrollIntoView({block:"center",behavior:"auto"});el?.focus({preventScroll:true})},120);return()=>clearTimeout(timer)},[cases,id]);
 const cats=[["all",strings.all],["security",strings.security],["aviation",strings.aviation],["maritime",strings.maritime],["other",strings.other]];
 return h("div",{className:"rw-page",hidden:!visible,id:"events-page"},
  h(Intro,{kicker:strings.kicker,title:strings.title,accent:strings.accent,desc:strings.desc,meta:cases?strings.meta+all.length+strings.count:""}),
  h("section",{className:"section"},h(Head,{title:strings.head,sub:strings.sub,icon:"files",right:t("span","hint",filtered.length+strings.count)}),
   h("div",{className:"filters"},...cats.map(([key,label])=>h("button",{type:"button",key,"aria-pressed":group===key,className:group===key?"active":"",onClick:()=>setGroup(key)},label))),
   error?t("p","error",UI_HE?"שגיאה בטעינת אירועים: ":"Ошибка загрузки событий: "+error):null,
   id&&cases&&!all.some(s=>s.id===id)?h("p",{className:"rw-he-notice",role:"status"},strings.missing,UI_HE?h("a",{href:"/events?story="+encodeURIComponent(id)},strings.switchOriginal):null):null,
   cases?h("div",{className:"rw-dossier-list"},...filtered.map(story=>h(StoryDossier,{key:story.id,story,open:expanded===story.id,onToggle:setExpanded}))):error?null:h(Loading,{label:strings.load}),
   cases&&!filtered.length?t("p","hint",strings.empty):null),
  h(NewsArchive,{items:Array.isArray(news?.stories)?news.stories:[]}),
  t("p","rw-fineprint",strings.disclaimer));
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

function DataRoomV2({visible,data,error,aviation,satellite,aviationError,satelliteError,aviationPending,satellitePending}){
 const [filter,setFilter]=useState("all"),[showAll,setShowAll]=useState(false),isHe=UI_HE;
 const L=isHe?{
 kicker:"מודיעין ממקורות גלויים / נתונים ומקורות",title:"נתונים",accent:"ומקורות.",intro:"מקורות ראשוניים, עדכונים רשמיים, מעקב אחר שווקים ומגבלות המידע. מידע גולמי מוסתר כאשר אינו ראוי לפרסום.",nav:"חלקי הנתונים",civil:"ביטחון אזרחי",markets:"ציפיות השוק",official:"פרסומים רשמיים",diagnostics:"שיטת העבודה",safety:"פיקוד העורף וביטחון אזרחי",safetySub:"הודעות רשמיות לפני כל הערכה",noAlerts:"אין במערכת חיבור ישיר להתרעות בזמן אמת.",oref:"פיקוד העורף",history:"היסטוריית התרעות",officialNotices:"הודעות רשמיות",idf:"הודעות צה״ל האחרונות",marketsTitle:"Polymarket: ציפיות המשתתפים",marketSub:"המחיר משקף מסחר בשוק ולא מוכיח שאירוע עתידי יתרחש.",marketOriginal:"כותרת המקור (אנגלית)",marketAll:"הכול",marketPeace:"הפסקת אש",marketTalks:"משא ומתן",marketIran:"איראן",more:"הצגת שאר השווקים",less:"הצגת פחות",noMarket:"אין שווקים זמינים כרגע.",yes:"מחיר YES",volume:"נפח מסחר",aviation:"תעופה והודעות רשמיות",satellite:"מידע לווייני",meaningful:"מוצגים רק ממצאים שעברו סינון ואישור לפרסום.",emptyTelemetry:"אין כעת נתונים מתורגמים בעלי משמעות לפרסום.",officialData:"ים ופרסומים רשמיים",marad:"MARAD — אזהרות ימיות",centcom:"CENTCOM / DVIDS",origin:"כותרות המקור מוצגות כפי שפורסמו.",sources:"מקורות",sourceState:"מצב מקורות הנתונים",sourceUnknown:"סטטוס לא ידוע",sourceOk:"תקין",sourcePartial:"חלקי",sourceError:"שגיאה",sourceEmpty:"אין רשומות",method:"מתודולוגיה ומגבלות הניטור",methodSub:"מה עשוי להגביל את המסקנות?",methodInfo:"היעדר אות, דיווח או מסלול טיסה אינו מוכיח שהאירוע לא התרחש. מידע חלקי אינו שווה למידע שגוי.",reload:"שגיאה בטעינת הנתונים",noData:"טרם התקבלו נתונים. נסה לרענן.",publish:"פורסם: "}:{
 kicker:"ИССЛЕДОВАТЕЛЬСКИЙ УРОВЕНЬ / ОТКРЫТЫЕ ДАННЫЕ",title:"Данные",accent:"и источники.",intro:"Проверка первоисточников, официальные публикации, ожидания рынка и ограничения мониторинга.",nav:"Разделы данных",civil:"Гражданская безопасность",markets:"Ожидания рынка",official:"Официальные источники",diagnostics:"Методология",safety:"Служба тыла и гражданская безопасность",safetySub:"Официальные источники прежде любых оценок",noAlerts:"Прямое получение действующих тревог не подключено.",oref:"Служба тыла",history:"История предупреждений",officialNotices:"Официальные сообщения",idf:"Последние публикации ЦАХАЛ",marketsTitle:"Polymarket: ожидания участников рынка",marketSub:"Цена YES — рыночная котировка, а не подтверждение будущего события.",marketOriginal:"Название рынка (оригинал)",marketAll:"Все",marketPeace:"Прекращение огня",marketTalks:"Переговоры",marketIran:"Иран",more:"Показать остальные",less:"Свернуть",noMarket:"Нет актуальных рынков.",yes:"Цена YES",volume:"Объём",aviation:"Авиация и официальные сообщения",satellite:"Спутниковые данные",meaningful:"Показываются только сведения, разрешённые к публикации.",emptyTelemetry:"Нет содержательных записей, подходящих для публикации.",officialData:"Море и официальные публикации",marad:"MARAD — морские предупреждения",centcom:"CENTCOM / DVIDS",origin:"Заголовки источников приведены в оригинале.",sources:"Источники",sourceState:"Состояние источников данных",sourceUnknown:"Статус неизвестен",sourceOk:"Работает",sourcePartial:"Частично",sourceError:"Ошибка",sourceEmpty:"Нет записей",method:"Методология и ограничения мониторинга",methodSub:"Что ограничивает выводы?",methodInfo:"Отсутствие сигнала, записи или воздушного трека не означает отсутствия реального события. Неполные сведения не доказывают обратное.",reload:"Ошибка загрузки данных",noData:"Данные пока недоступны, попробуй обновить страницу.",publish:"Опубликовано: "};
 const allMarkets=Array.isArray(data?.markets)?data.markets:[],markets=allMarkets.filter(x=>filter==="all"||classifyMarket(x.question)===filter).sort((a,b)=>(b.volume||0)-(a.volume||0)),selected=showAll?markets:markets.slice(0,6);
 const allSources=Array.isArray(data?.sources)?data.sources:[],issues=allSources.filter(x=>x.state==="error"||x.state==="partial");
  const official=(name,items)=>h(Card,null,
    h("h3",null,name),
    Array.isArray(items)&&items.length?h("div",{className:"rw-data-official-list"},
      ...items.slice(0,5).map((x,i)=>{
        const language=x.content_language||"en",idfofficial=/^https:\/\/t\.me\/idfofficial\//.test(String(x.url||"")),
              pending=idfofficial&&language!==(isHe?"he":"ru");
        return h("article",{className:"rw-official-row",key:x.id||i},
          h("strong",{lang:language,dir:"auto"},x.title||name),
          pending?h("small",{className:"rw-translation-state",role:"status"},isHe?(language==="en"?"המקור באנגלית · התרגום ממתין":"המקור ברוסית · התרגום ממתין"):(language==="en"?"Оригинал на английском · перевод ожидается":"Оригинал на иврите · перевод ожидается")):null,
          idfofficial&&x.translation_status==="available"?h("small",{className:"rw-translation-state"},isHe?"תרגום מכונה · יש לבדוק מול המקור":"Автоматический перевод · сверяй с оригиналом"):null,
          x.published?t("small","hint",L.publish+fmtTime(x.published)):null,
          x.description?h("p",{lang:language,dir:"auto"},x.description):null,
          x.url?h(External,{url:x.url},isHe?"למקור ↗":"Первоисточник ↗"):null);
      })
    ):t("p","hint",L.emptyTelemetry));
 const heReady=v=>{const rows=Array.isArray(v?.items)?v.items:Array.isArray(v?.signals)?v.signals:[];if(v?.display_policy!=="show"||v?.has_publishable_content===false)return[];return rows.filter(x=>x.content_language==="he"&&["available","ready","localized_template"].includes(x.translation_status)&&/[\u0590-\u05ff]/u.test(x.title||"")&&/[\u0590-\u05ff]/u.test(x.description||""))};
  const panelNotice=(key,label,record,err,waiting)=>{
  const he=UI_HE;
  if(err)return h("p",{className:"error rw-osint-panel-error",role:"alert","data-source":key},
   (he?"מקור המידע ":"Источник данных «")+label+(he?" אינו זמין כעת. החלקים האחרים ממשיכים לפעול.":"» временно недоступен. Остальные источники продолжают работать."));
  if(waiting&&!record)return h("p",{className:"rw-osint-panel-pending","data-source":key,role:"status"},he?"בודקים את זמינות הנתונים…":"Проверяем доступность источника…");
  if(record?.display_policy==="pending")return h("p",{className:"rw-osint-panel-pending","data-source":key,role:"status"},he?"המידע עדיין בבדיקה.":"Информация ещё проходит проверку.");
  if(record?.display_policy==="empty")return h("p",{className:"rw-osint-panel-pending","data-source":key,role:"status"},he?"המקור זמין, אך אין פריטים לפרסום.":"Источник доступен, но подходящих для публикации записей нет.");
  return null;
 };
 const localized=(name,v)=>{if(!v||v.display_policy==="hide"||v.has_publishable_content===false)return null;const rows=heReady(v);return h("section",{className:"section"},h(Head,{title:name,icon:"activity",sub:L.meaningful}),rows.length?h("div",{className:"rw-he-grid"},...rows.slice(0,8).map(x=>h("article",{className:"rw-he-article",key:x.id},t("h3",null,x.title),t("p",null,x.description),x.source?.url?h(External,{url:x.source.url},"למקור ↗"):null))):t("p","hint",L.emptyTelemetry))};
 return h("div",{className:"rw-page",hidden:!visible,id:"data-room"},
  h(Intro,{kicker:L.kicker,title:L.title,accent:L.accent,desc:L.intro,meta:data?L.publish+fmtTime(data.generatedAt):null}),
  h("nav",{className:"rw-data-nav","aria-label":L.nav},...[[ "#civil",L.civil],["#markets",L.markets],["#official",L.official],["#diagnostics",L.diagnostics]].map(([href,label])=>h("a",{href,key:href},label))),
  error?t("p",{className:"error",role:"alert"},L.reload+": "+error):null,
  h("section",{className:"section",id:"civil"},h(Head,{title:L.safety,icon:"activity",sub:L.safetySub}),
   h(Card,null,t("span","notice",L.noAlerts),h("div",{className:"links"},h(External,{url:"https://www.oref.org.il/"},L.oref+" ↗"),h(External,{url:"https://alerts-history.oref.org.il/"},L.history+" ↗"),h(External,{url:"https://t.me/PikudHaOref_all"},L.officialNotices+" ↗")),t("h3",null,L.idf),
    Array.isArray(data?.home)&&data.home.length?official(L.idf,data.home):t("p","hint",L.emptyTelemetry))),
  h("section",{className:"section",id:"markets"},h(Head,{title:L.marketsTitle,icon:"database",sub:L.marketSub,right:t("span","hint",allMarkets.length+" Polymarket")}),
   h("div",{className:"filters"},...[[ "all",L.marketAll],["peace",L.marketPeace],["talks",L.marketTalks],["iran",L.marketIran]].map(([id,label])=>h("button",{type:"button",key:id,"aria-pressed":filter===id,className:filter===id?"active":"",onClick:()=>{setFilter(id);setShowAll(false)}},label))),
   markets.length?h("div",{className:"data-grid"},...selected.map(m=>h("article",{className:"market",key:m.id},t("span","kicker",L.marketOriginal),h("h3",{lang:"en",dir:"auto"},m.question),h("div",{className:"rw-market-metrics"},t("strong",null,L.yes+": "+(Number.isFinite(Number(m.yes))?(Number(m.yes)*100).toFixed(1)+"%":"—")),h("div",{className:"bar rw-market-yes-bar",role:"progressbar","aria-label":L.yes,"aria-valuemin":0,"aria-valuemax":100,"aria-valuenow":Number.isFinite(Number(m.yes))?Math.max(0,Math.min(100,Math.round(Number(m.yes)*1000)/10)):undefined},h("i",{style:{width:Math.max(0,Math.min(100,Number(m.yes||0)*100))+"%"}})),t("span",null,L.volume+": "+new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Number(m.volume)||0)+" USD")),h(External,{url:m.url},isHe?"שוק ומידע נוסף ↗":"Рынок и условия ↗")))):t("p","hint",L.noMarket),
   markets.length>6?h("button",{type:"button",className:"more",onClick:()=>setShowAll(!showAll)},showAll?L.less:L.more+" ("+(markets.length-6)+")"):null,t("p","rw-fineprint",L.marketSub)),
  panelNotice("aviation",L.aviation,aviation,aviationError,aviationPending),
  isHe?localized(L.aviation,aviation):h(AviationExplainedV2,{data}),
  panelNotice("satellite",L.satellite,satellite,satelliteError,satellitePending),
  isHe?localized(L.satellite,satellite):h(SatelliteCatalog,{data}),
  h("section",{className:"section",id:"official"},h(Head,{title:L.officialData,icon:"files",sub:L.origin}),
   h("div",{className:"data-grid-2"},official(L.marad,data?.marad),official(L.centcom,data?.centcom))),
  h("section",{className:"section",id:"diagnostics"},h(Head,{title:L.method,icon:"database",sub:L.methodSub}),
   h(Card,null,t("h3",null,L.sourceState),t("p",null,issues.length+" / "+allSources.length+" "+L.sources),
    h("details",{className:"rw-technical-details"},h("summary",null,L.sourceState),...allSources.map(s=>h("div",{className:"sources-row",key:s.id},t("span",null,s.label||s.id),t("span",null,s.state==="ok"?L.sourceOk:s.state==="partial"?L.sourcePartial:s.state==="error"?L.sourceError:s.state==="empty"?L.sourceEmpty:L.sourceUnknown)))),
    t("p","rw-fineprint",L.methodInfo)))
 );
}


function AnalystShared({hePosts,heProfiles}){
 const [search,setSearch]=useState(""),[refresh,setRefresh]=useState(0);
 const parts=location.pathname.split("/").filter(Boolean),idx=parts.indexOf("analysts"),slug=idx<0?null:parts[idx+1]||null,he=UI_HE;
 const posts=useFeed("/api/analyst-posts?lang=ru&refresh="+refresh,120000,!he&&!slug);
 const people=useFeed("/api/analysts?lang=ru&refresh="+refresh,300000,!he&&!slug);
 const detail=useFeed("/api/analyst-posts/"+encodeURIComponent(slug||"none")+"?lang="+(he?"he":"ru")+"&refresh="+refresh,120000,!!slug);
 const raw=he?(Array.isArray(hePosts?.value?.posts)?hePosts.value.posts:Array.isArray(hePosts?.value?.items)?hePosts.value.items:[]):[];
 const list=slug?(detail.value?.id===slug?[detail.value]:[]):he?raw.map(x=>({...x,title:x.title||x.headline||"",excerpt:x.excerpt||x.summary||x.body||""})):Array.isArray(posts.value?.posts)?posts.value.posts:[];
 const profiles=he?(Array.isArray(heProfiles?.value?.analysts)?heProfiles.value.analysts.map(x=>({...x,title:x.title||x.display_name||"",body:x.body||x.description||"",excerpt:x.excerpt||x.description||""})):HE_ITEMS(heProfiles?.value)):Array.isArray(people.value?.analysts)?people.value.analysts:[];
 const names=new Map(profiles.map(x=>[x.id,he?x.title:x.display_name]));
 const L=he?{kicker:"מקורות פתוחים / דברי פרשנים",title:"פרשנים",accent:"וניתוחים.",desc:"דברי הכותבים אינם מהווים אימות עצמאי לעובדות.",posts:"פרסומי פרשנים",sub:"פרשנות אינה אימות עצמאי",profiles:"מקורות ופרשנים",search:"חיפוש בפרסומים",refresh:"רענון",back:"לכל הפרסומים",original:"למקור",open:"פתיחת פרסום",empty:"אין כרגע פרסומים מוכנים בעברית.",pending:" פרסומים ממתינים לתרגום או לבדיקה.",notFound:"הפרסום המבוקש לא נמצא.",ru:"לגרסה הרוסית",error:"חלק מהמידע אינו זמין.",loading:"הפרסומים נטענים…",published:"פורסם באתר",detail:"פרסום פרשן"}:{kicker:"РЕДАКЦИОННАЯ АНАЛИТИКА / ОТКРЫТЫЕ ИСТОЧНИКИ",title:"Аналитики",accent:"и публикации.",desc:"Атрибутированные материалы аналитиков. Мнение автора не подтверждает факт.",posts:"Лента аналитиков",sub:"Материалы публикуются с указанием авторства",profiles:"Источники и авторы",search:"Поиск по публикациям",refresh:"Обновить",back:"К списку аналитиков",original:"Первоисточник",open:"Открыть публикацию",empty:"Публикаций пока нет.",pending:" материалов ожидают обработки.",notFound:"Публикация не найдена.",ru:"Русская версия",error:"Часть данных временно недоступна.",loading:"Загружаем публикации…",published:"На сайте",detail:"Публикация аналитика"};
 const normalized=list.map(x=>({id:x.id,title:x.title||x.headline||"",summary:x.excerpt||x.summary||x.body||"",author:(typeof x.analyst==="string"?x.analyst:x.analyst?.display_name)||names.get(x.analyst_id)||x.author||x.source||(he?"פרשן":"Аналитический источник"),url:x.original_url||x.source_url||x.url,published:x.published_at_ms||x.time,originalPublished:x.original_published_at_ms||null,content_language:x.content_language,translation_status:x.translation_status})).filter(x=>(!slug||slug===x.id)&&(x.title+" "+x.summary+" "+x.author).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const base=he?"/he/analysts":"/analysts";
 const entry=x=>h("article",{className:"rw-analyst-article",key:x.id},h("div",{className:"rw-analyst-meta"},t("span","kicker",x.author)),h("h3",{lang:x.content_language||undefined,dir:"auto"},slug?x.title:h("a",{href:base+"/"+encodeURIComponent(x.id)},x.title)),he&&x.content_language!=="he"?h("small",{className:"rw-translation-state"},"תרגום ממתין — מוצג נוסח המקור"):null,t("p",null,x.summary),x.originalPublished?t("small","hint",(he?"פורסם במקור: ":"Опубликовано у источника: ")+fmtTime(x.originalPublished)):null,x.published?t("small","hint",L.published+": "+fmtTime(x.published)):null,h("div",{className:"rw-analyst-links"},x.url?h(External,{url:x.url},L.original+" ↗"):null,!slug?h("a",{href:base+"/"+encodeURIComponent(x.id)},L.open):null));
 return h("div",{className:"rw-page"},h(Intro,{kicker:L.kicker,title:L.title,accent:L.accent,desc:L.desc}),
  h("section",{className:"section"},h(Head,{title:slug?L.detail:L.posts,sub:L.sub,icon:"users"}),
   slug?h("a",{className:"rw-more-link",href:base},L.back):h("div",{className:"rw-analyst-controls"},h("input",{type:"search",value:search,placeholder:L.search,onChange:e=>setSearch(e.target.value),"aria-label":L.search}),h("button",{type:"button",onClick:()=>setRefresh(x=>x+1)},L.refresh)),
   (slug?detail.error&&!/HTTP 404/.test(detail.error):he?hePosts?.error||heProfiles?.error:posts.error||people.error)?h("div",{className:"rw-analyst-error",role:"alert"},L.error,slug?h("button",{type:"button",onClick:()=>setRefresh(x=>x+1)},he?"נסה שוב":"Повторить"):null):null,
   he&&!slug&&raw.some(x=>x.content_language!=="he")?t("p","rw-analyst-notice",raw.filter(x=>x.content_language!=="he").length+L.pending):null,
   normalized.length?h("div",{className:"rw-analyst-grid"},...normalized.map(entry)):h("div",{className:"rw-analyst-empty",role:"status"},slug?(detail.error?(/HTTP 404/.test(detail.error)?L.notFound:L.error):detail.value?L.notFound:L.loading):(hePosts?.value||posts.value)?L.empty:L.loading)),
  !slug?h("section",{className:"section rw-analyst-profiles"},h(Head,{title:L.profiles,icon:"users"}),h("div",{className:"rw-analyst-grid"},...profiles.map(x=>h("article",{className:"rw-analyst-article",key:x.id},t("h3",null,he?x.title:x.display_name),t("p",null,he?x.body||x.excerpt:x.description||""))))):null);
}

function GlobalHeader({active,overview}){
 const [menu,setMenu]=useState(false),[panel,setPanel]=useState(false);
 const modalRef=useRef(null),triggerRef=useRef(null);
 const he=UI_HE,section=active==="/events"?"events":active==="/data"?"data":active==="/analysts"?"analysts":"";
 const suffix=section==="analysts"&&location.pathname.split("/").filter(Boolean).length>1&&location.pathname.includes("/analysts/")?"/"+encodeURIComponent(location.pathname.split("/").filter(Boolean).pop()):"";
 const href=(locale,slug=section,preserve=true)=>{const path=(locale==="he"?"/he":"")+(slug?"/"+slug+(slug==="analysts"&&preserve?suffix:""):"/");return path+(preserve&&slug===section?location.search+location.hash:"");};
 const names=[["","Обстановка","תמונת מצב"],["events","События","אירועים"],["data","Данные","נתונים"],["analysts","Аналитики","פרשנים"]];
 const list=Array.isArray(overview?.sources)?overview.sources:[];
 const good=overview?.available,number=overview?.total;
 const status=Number.isFinite(good)&&Number.isFinite(number)?good+"/"+number:"—";
 useEffect(()=>{const node=modalRef.current;if(panel&&node&&!node.open)node.showModal();return()=>{if(node?.open)node.close()}},[panel]);
 const store=locale=>{try{localStorage.setItem("rw-language",locale)}catch{}};
 return h("header",{className:"rw-header rw-global-header","data-site-nav":"1"},
  h("a",{className:"rw-skip-link",href:"#main-content"},he?"דלג לתוכן":"К содержимому"),
  h("a",{className:"brand",href:href(he?"he":"ru","",false)},t("span","logo","◎"),h("span",null,t("strong",null,"REGIONAL WATCH"),t("small",null,"ISRAEL / OSINT MONITORING"))),
  h("div",{className:"rw-site-actions"},
   h("button",{type:"button",ref:triggerRef,className:"rw-site-source",onClick:()=>setPanel(true),"aria-haspopup":"dialog","aria-label":he?"מצב מקורות":"Состояние источников"},h("span",{className:"rw-source-label-full"},he?"מקורות":"Источники"),h("span",{className:"rw-source-label-short"},he?"מקורות":"Ист."),h("span",{className:"rw-site-source-count"},status)),
   h("div",{className:"rw-site-language",dir:"ltr","aria-label":he?"בחירת שפה":"Выбор языка"},
    ...[["ru","RU"],["he","עברית"]].map(([locale,title])=>h("a",{key:locale,href:href(locale),lang:locale,className:(locale==="he")===he?"active":undefined,"aria-current":(locale==="he")===he?"page":undefined,onClick:()=>store(locale)},title))),
   h("button",{type:"button",className:"rw-site-menu","aria-label":he?"פתיחת תפריט":"Открыть меню","aria-expanded":menu,"aria-controls":"rw-site-links",onClick:()=>setMenu(x=>!x)},menu?"×":"☰")),
  h("nav",{className:"rw-site-links",id:"rw-site-links","data-open":menu?"true":"false","aria-label":he?"ניווט ראשי":"Разделы сайта"},
   ...names.map(([slug,ru,iv])=>h("a",{key:slug,href:href(he?"he":"ru",slug,false),className:section===slug?"active":undefined,"aria-current":section===slug?"page":undefined},h(UiIcon,{name:slug==="events"?"files":slug==="data"?"database":slug==="analysts"?"users":"pulse",size:17}),he?iv:ru))),
  panel?h("dialog",{ref:modalRef,className:"rw-dlg","aria-labelledby":"rw-dialog-title",onClose:()=>{setPanel(false);requestAnimationFrame(()=>triggerRef.current?.focus())}},
   h("div",{className:"rw-dlg-head"},h("h2",{id:"rw-dialog-title"},he?"מצב מקורות":"Состояние источников"),h("button",{type:"button",className:"rw-dlg-close",onClick:()=>{setPanel(false);requestAnimationFrame(()=>triggerRef.current?.focus())}},he?"סגירה":"Закрыть")),
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
 const news=useFeed("/api/news?lang="+(UI_HE?"he":"ru")+"&limit=40",60000,pages);
 const cases=useFeed("/api/stories?lang="+(UI_HE?"he":"ru")+"&limit=40",60000,pages);
 const digest=useFeed("/api/changes?lang="+(UI_HE?"he":"ru"),60000,route==="/");
 const editorial=useFeed("/api/editorial-notes?lang="+(UI_HE?"he":"ru")+"&limit=20",120000,route==="/");
 const data=useFeed("/api/data",120000,route==="/data");
  const officialPosts=useFeed("/api/official-posts?lang="+(UI_HE?"he":"ru")+"&limit=5",120000,route==="/data");
 const heAviation=useFeed("/api/rw-localized/aviation",180000,UI_HE&&route==="/data");
 const heSatellite=useFeed("/api/rw-localized/satellite",180000,UI_HE&&route==="/data");
 const ruAviation=useFeed("/api/rw/aviation",180000,!UI_HE&&route==="/data");
 const ruSatellite=useFeed("/api/rw/satellite",180000,!UI_HE&&route==="/data");
 const hePosts=useFeed("/api/rw-localized/analysts",90000,UI_HE&&route==="/analysts");
 const heProfiles=useFeed("/api/rw-localized/profiles",300000,UI_HE&&route==="/analysts");
 const readyNews=Array.isArray(news.value?.articles)?news.value.articles.map(rwNormalizeNewsArticle):[];
 const normalizedEditorial=Array.isArray(editorial.value?.notes)?editorial.value.notes.map(x=>({id:x.id,headline:x.headline||x.title,text:x.text||x.body||"",sourceUrl:x.source_url||x.url,time:Number.isFinite(x.published_ms)?new Date(x.published_ms).toISOString():null,author:x.author,content_language:x.content_language,translation_status:x.translation_status})):[];
 const normalizedNews=(news.value||editorial.value)?{stories:readyNews,editorials:normalizedEditorial,feedPending:!news.value&&!news.error,feedLoaded:!!news.value}:null;
 const readyCases=Array.isArray(cases.value?.stories)?cases.value.stories:[];
 const normalizedCases=cases.value?{stories:readyCases,changes:Array.isArray(digest.value?.changes)?digest.value.changes:[],lastCheck:digest.value?.lastCheck||overview.value?.analysis?.time,previousCheck:digest.value?.previousCheck,digestState:digest.value?.status||(digest.error?"error":"loading"),digestError:digest.error,sourceUpdates:digest.value?.sourceUpdates||0,sourceComparable:digest.value?.sourceComparable||0,sourceCoverage:{hasKnownGaps:Array.isArray(overview.value?.sources)&&overview.value.sources.some(s=>s.state==="error"||s.state==="partial")}}:null;
 return h("div",{className:"app-container"},
  h(GlobalHeader,{active:route,overview:overview.value}),
  h("main",{id:"main-content"},
   route==="/"?h(HomeV2,{visible:true,overview:overview.value,news:normalizedNews,cases:normalizedCases,go,errors:{news:news.error,cases:cases.error}}):null,
   route==="/events"?h(CasesPageV2,{visible:true,cases:normalizedCases,news:normalizedNews,error:cases.error}):null,
   route==="/data"?h(DataRoomV2,{visible:true,data:(officialPosts.value?.items&&data.value?{...data.value,home:officialPosts.value.items}:data.value),error:data.error,aviation:UI_HE?heAviation.value:ruAviation.value,satellite:UI_HE?heSatellite.value:ruSatellite.value,aviationError:UI_HE?heAviation.error:ruAviation.error,satelliteError:UI_HE?heSatellite.error:ruSatellite.error,aviationPending:UI_HE?!heAviation.value&&!heAviation.error:!ruAviation.value&&!ruAviation.error,satellitePending:UI_HE?!heSatellite.value&&!heSatellite.error:!ruSatellite.value&&!ruSatellite.error}):null,
   route==="/analysts"?h(AnalystShared,{hePosts,heProfiles}):null
  )
 );
}

const HE_TEXT={home:["תמונת מצב","באזור.","חדשות ממקורות פתוחים, מאומתות ומתורגמות כשיש תרגום זמין."],events:["אירועים","והקשר.","תיקי אירועים עם מקורות ורמת אימות."],data:["נתונים","ומקורות.","ניתוחים בעלי ערך בלבד; טלמטריה גולמית מוסתרת."],analysts:["פרשנים","וניתוחים.","דברי הכותבים אינם מהווים אימות עצמאי לעובדות."]};
const HE_CATEGORY={israel_security_preparation:"היערכות ביטחונית בישראל",maritime_suspicious_activity:"פעילות ימית חריגה",security:"ביטחון",aviation:"תעופה",maritime:"ים",other:"אחר"};
const HE_VALID=x=>x&&x.content_language==="he"&&["available","ready"].includes(x.translation_status)&&/[\u0590-\u05ff]/u.test(x.title||"")&&/[\u0590-\u05ff]/u.test(x.excerpt||x.body||x.summary||"");
const HE_ITEMS=v=>Array.isArray(v?.items)?v.items.filter(HE_VALID):[];
const root=document.getElementById("root");
D.createRoot(root).render(h(App));
})();

;(()=>{"use strict";function init(){if(document.getElementById("rw-back-to-top"))return;const b=document.createElement("button");b.id="rw-back-to-top";b.type="button";b.textContent="↑";b.setAttribute("aria-label","Вернуться в начало страницы");b.title="Наверх";b.hidden=true;document.body.appendChild(b);const update=()=>{b.hidden=window.scrollY<360};b.addEventListener("click",()=>window.scrollTo({top:0,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));window.addEventListener("scroll",update,{passive:true});update();}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();})();




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
