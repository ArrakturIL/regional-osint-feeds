import { fmtTime, h, relativeTime, t } from '../../app/runtime.js';
import { Card } from '../Card/Card.js';
import { SourceDot } from '../SourceStatus/SourceDot.js';
export function ActivityChips({overview}){const names=["adsb","adsb_alt","airbridge_context","mil_lol","ais","idf_official","centcom_dvids","marad_official","satellite_context","firms"];const s=overview?.sources||[];return h("section",{className:"section",id:"monitor"},h(Card,{className:"signal-panel"},
 h("div",{className:"panel-header"},t("span","panel-title","◉  Живой мониторинг"),t("span","hint","Данные D1 · автоматическое обновление")),
 h("div",{className:"status-chips"},...names.map(id=>s.find(x=>x.id===id)).filter(Boolean).map(x=>h("div",{className:"status-chip",key:x.id,title:(x.label||x.id)+" · "+x.state+" · "+fmtTime(x.attemptedAt)},h(SourceDot,{state:x.state}),h("span",null,t("strong",null,x.label||x.id),t("small",null,(x.state==="error"?"Ошибка":x.state==="partial"?"Частично":x.state==="empty"?"Без записей":"Опрос")+" · "+relativeTime(x.attemptedAt))))),s.length===0?t("span","hint","Статусы источников загружаются…"):null)));
}
