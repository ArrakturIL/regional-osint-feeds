import { UI_HE, fmtTime, h, t } from '../../app/runtime.js';
import { Loading } from '../Loading/Loading.js';
import { Head } from '../SectionHead/Head.js';
export function Digest({cases}){
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

