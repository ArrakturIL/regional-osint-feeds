import { fmtTime, h, ruMoney, ruPct, t } from '../../app/runtime.js';
import { External } from '../External/External.js';
import { classifyMarket } from '../../utils/classifyMarket.js';
import { marketTitle } from '../../utils/marketTitle.js';
export function MarketCardV2({m}){
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




