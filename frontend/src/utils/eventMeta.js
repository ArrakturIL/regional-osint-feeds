import { UI_HE, fmtTime, t } from '../app/runtime.js';
export function rwEventMeta(story){
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
