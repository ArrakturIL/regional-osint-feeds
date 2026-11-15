import { UI_HE, h } from '../app/runtime.js';
export function rwSourceLabel(item,i){
 const s=typeof item==="string"?{url:item}:item||{};
 const explicit=s.label||s.title||s.publisher||s.name;
 if(typeof explicit==="string"&&explicit.trim()&&!/^(?:первоисточник|источник\s*\d*|מקור\s*\d*)$/i.test(explicit.trim()))return explicit.trim().slice(0,90);
 const url=s.url||s.source_url||s.link;
 try{const u=new URL(url),h=u.hostname.toLowerCase().replace(/^www\./,"");
  if(h==="reuters.com"||h.endsWith(".reuters.com"))return UI_HE?"Reuters · דיווח":"Reuters · публикация";
  if(h==="ukmto.org"||h.endsWith(".ukmto.org"))return /\/(?:advisories|notices)\/?$/i.test(u.pathname)?(UI_HE?"UKMTO · רשימת הודעות":"UKMTO · список предупреждений"):(UI_HE?"UKMTO · הודעה":"UKMTO · уведомление");
  if(h==="justice.gov"||h.endsWith(".justice.gov"))return UI_HE?"משרד המשפטים האמריקאי · מסמך":"Минюст США · документ";
  if(h==="apnews.com"||h.endsWith(".apnews.com"))return UI_HE?"AP · דיווח":"AP · публикация";
  return h.slice(0,65);
 }catch{return (UI_HE?"מקור ":"Источник ")+(i+1)}
}
