import { UI_HE } from '../app/runtime.js';
export function rwSpecificUnknown(story){
 const raw=UI_HE?(story.uncertainty_he||(story.content_language==="he"?story.uncertainty:"")):story.uncertainty;
 const v=String(raw||"").trim();
 if(!v||/^(?:Статус подтверждения требует уточнения|Данные мониторинга не позволяют установить степень подтверждения|המידע הזמין אינו מאפשר לאמת את כל הטענות)[.\s]*/iu.test(v))return null;
 return v;
}
