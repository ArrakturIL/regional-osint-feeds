import {factualTranslationIssue} from '../translations/fact-guard.mjs';
import {fingerprint} from './shared.mjs';

export const HEADERS={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type','X-Content-Type-Options':'nosniff','Cache-Control':'public,max-age=60'};
export function respond(body,code=200){return Response.json(body,{status:code,headers:HEADERS});}
// Field metadata describes displayed text, never changes source text or provenance.
export function fieldLocale(record,fields,lang,state){
  const field_languages={},field_translation_status={};
  for(const key of fields){
    const text=String(record[key]||'').trim();
    const ru=/[\u0400-\u04ff]/u.test(text),he=/[\u0590-\u05ff]/u.test(text);
    const detected=!text?null:ru&&he?'mul':ru?'ru':he?'he':/[\u0600-\u06ff]/u.test(text)?'ar':/[A-Za-z]/u.test(text)?'en':'und';
    field_languages[key]=detected;
    field_translation_status[key]=!text?'not_applicable':detected!==lang?'pending':
      state==='needs_review'?'needs_review':state==='available'?'available':'source';
  }
  const complete=Object.values(field_languages).every(x=>x===null||x===lang);
  return{field_languages,field_translation_status,translation_status:state==='needs_review'?state:complete?state:'pending',localization_complete:complete&&state!=='needs_review'&&state!=='pending'};
}
export async function localized(db,kind,id,original,lang,prefilled=null){
  if(lang==='ru'){
    const detected=/[\u0400-\u04ff]/u.test(original.title+original.body)?'ru':/[\u0590-\u05ff]/u.test(original.title+original.body)?'he':'en';
    return {...original,content_language:detected,translation_status:detected==='ru'?'source':'pending'};
  }
  const h=await fingerprint(original);
  const t=prefilled||await db.prepare("SELECT source_hash,title,body,commentary,quality_score FROM regional_i18n WHERE kind=? AND item_id=? AND language='he'").bind(kind,id).first();
  if(t&&t.source_hash===h&&t.quality_score>=85&&/[\u0590-\u05ff]/u.test(t.title||'')
     &&(!original.body||/[\u0590-\u05ff]/u.test(t.body||''))){
    const mismatch=factualTranslationIssue(original,{title:t.title,body:t.body,comment:t.commentary||''});
    if(!mismatch)return{title:t.title,body:t.body,comment:t.commentary||'',content_language:'he',translation_status:'available'};
    // Fail closed: a high confidence score is not proof of accurate attribution.
    return {...original,content_language:/[\u0400-\u04ff]/u.test(original.title+original.body)?'ru':'en',
      translation_status:'needs_review'};
  }
  return {...original,content_language:/[\u0400-\u04ff]/u.test(original.title+original.body)?'ru':'en',translation_status:'pending'};
}

