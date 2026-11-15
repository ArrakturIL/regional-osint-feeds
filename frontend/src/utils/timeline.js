import { fmtTime, h, t } from '../app/runtime.js';
export function rwMeaningfulTimeline(story){
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


