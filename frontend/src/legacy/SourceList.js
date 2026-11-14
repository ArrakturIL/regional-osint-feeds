import { h, t } from '../app/runtime.js';
import { SourceDot } from '../components/SourceStatus/SourceDot.js';
export function SourceList({sources}){return h("div",null,...(sources||[]).map(x=>h("div",{className:"sources-row",key:x.id},h("span",{style:{display:"flex",alignItems:"center",gap:"8px"}},h(SourceDot,{state:x.state}),x.label||x.id),t("span","right",x.state==="error"?"Ошибка":x.state==="partial"?"Частично":x.state==="empty"?"Нет записей":"Работает"))))}

