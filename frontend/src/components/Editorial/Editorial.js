import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
import { Card } from '../Card/Card.js';
import { External } from '../External/External.js';
import { UiIcon } from '../UiIcon/UiIcon.js';
export function Editorial({notes}){
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

