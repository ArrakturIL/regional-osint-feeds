import { satellitePublicResponse } from './satellite.js';
import { AIS, EASA } from '../config/constants.js';
export async function localizedAnalyticsResponse(response,request,kind){
  const lang=new URL(request.url).searchParams.get('lang')||'ru';
  if(!['ru','he'].includes(lang))return satellitePublicResponse({error:'unsupported_language',supported:['ru','he']},400);
  if(request.method==='OPTIONS'||request.method==='HEAD'||response.status!==200)return response;
  let data;try{data=await response.json()}catch{return response}
  data.requested_language=lang;
  data.direction=lang==='he'?'rtl':'ltr';
  if(lang==='ru')return satellitePublicResponse(data,200);
  const notes={
    firms:'נתוני חום לווייניים אינם הוכחה לתקיפה. גם מקורות תעשייתיים ושרפות גורמים לזיהויים.',
    gfw_sar:'זיהויי מכ״ם שאינם משויכים ל-AIS אינם מעידים בהכרח על כיבוי משדר או על פעילות צבאית.',
    copernicus_ems:'הקטלוג חלקי. עצם פרסום מוצר מיפוי אינו מאשר שנגרם נזק.',
    unosat_analysis:'שכבות מיפוי עשויות להיות היסטוריות; קיומן אינו מאמת אירוע חדש.',
  };
  data.sources=(data.sources||[]).map(s=>({...s,
    note:notes[s.id]||s.note,content_language:'he',
    display_raw_samples:false}));
  if(kind==='satellite'){
    // Current provider outputs are context, not verified reports. Any future
    // event-level publication requires explicitly localized, verified material.
    data.signals=[];
    data.reference_products=[];
    data.has_publishable_content=false;
    data.display_policy='hide';
    data.data_status='insufficient_publishable_evidence';
    data.interpretation='מדידות לוויין וקטלוגים של ניתוחים אינם אישור עצמאי לפעולות צבאיות.';
    data.publication_policy='אין להציג ספירות מכ״ם גולמיות, דגימות מטוסים בודדות, היעדר נקודות חום או מפות היסטוריות כאירועים עדכניים.';
  }else{
    // EASA is an official bulletin source; communicate only the fact of a
    // recent published bulletin, never invent airspace closure from ADS-B.
    data.signals=(data.signals||[]).filter(s=>s.category==='official_aviation_advisory').map(s=>({
      ...s,title:'EASA: פורסם עלון בטיחות למרחב האווירי',
      description:'פורסם עלון רשמי של הסוכנות האירופית לבטיחות תעופה. יש לבדוק את ההגבלות והעדכונים במקור הרשמי.',
      region:null,
      caveat:'פרסום עלון אינו מעיד כשלעצמו על סגירת מרחב אווירי או על תחילת מבצע צבאי.',
      content_language:'he',translation_status:'localized_template'
    }));
    data.has_publishable_content=data.signals.length>0;
    data.display_policy=data.signals.length?'show':'hide';
    data.interpretation='דגימות ADS-B חלקיות, כולל ספירה של אפס מטוסים, אינן הוכחה למצב המרחב האווירי.';
  }
  return satellitePublicResponse(data,200);
}

