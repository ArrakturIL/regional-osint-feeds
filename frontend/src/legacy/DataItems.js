import { fmtTime, h, t } from '../app/runtime.js';
import { External } from '../components/External/External.js';
export function DataItems({items,kind}){if(!items?.length)return t("p","hint","Свежих записей пока нет.");return h("div",null,...items.map((x,i)=>h("div",{className:"data-item",key:x.id||x.url||i},h(External,{url:x.url},kind==="idf"?"Сообщение ЦАХАЛ ↗":x.title||x.id||"Публикация"),t("p",null,kind==="idf"?x.description||x.title:kind==="marad"?"Действующее предупреждение "+x.id:x.description||""),t("small",null,kind==="marad"?"Дата выпуска не установлена":fmtTime(x.published||x.observed)))))}

