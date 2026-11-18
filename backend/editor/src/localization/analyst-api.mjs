import {localized,respond} from './read-core.mjs';
import {sourceText} from './shared.mjs';
import {allowedOnPage,scriptLanguage} from './display-policy.mjs';

export async function readLocalizedAnalysts(request,env,analystService,lang,path){
    const r=await analystService.fetch(request,{DB:env.CORE_DB,AI:env.AI});
    if(!r.ok)return r;
    const old=await r.json(),profiles=path==='/api/analysts',detail=!profiles&&path!=='/api/analyst-posts';
    const items=profiles?(old.analysts||[]):detail?[old]:(old.posts||[]);
    const kind=profiles?'profile':'analyst';
    const ids=items.map(x=>x?.id).filter(x=>typeof x==='string'&&x.length<=180).slice(0,100);
    const cached=new Map();
    if(ids.length){
      const sql="SELECT item_id,source_hash,title,body,commentary,quality_score FROM regional_i18n WHERE kind=? AND language='he' AND item_id IN ("+ids.map(()=>'?').join(',')+")";
      const rows=await env.CORE_DB.prepare(sql).bind(kind,...ids).all();
      for(const t of rows.results||[])cached.set(t.item_id,t);
    }
    const names=lang==='he'&&!profiles?await hebrewAnalystNames(env.CORE_DB):null;
    const shown=await Promise.all(items.map(async item=>{
      const t=await localized(env.CORE_DB,kind,item.id,sourceText(kind,item),lang,cached.get(item.id)||{});
      // B4: RU/AR text is not shown on a page in another language until translated.
      if(!allowedOnPage(lang,scriptLanguage(t.title)||t.content_language))return null;
      const displayLanguage=t.content_language;
      const native=displayLanguage===lang&&t.translation_status==='source';
      const state=native?'original':t.translation_status==='available'?'translated':
        t.translation_status==='needs_review'?'needs_review':'pending';
      const available=state==='original'||state==='translated';
      const label=state==='original'?(lang==='he'?'שפת המקור':'Оригинал'):
        state==='translated'?(lang==='he'?'תורגם':'Переведено'):
        state==='needs_review'?(lang==='he'?'בבדיקת תרגום':'Перевод проверяется'):
        (lang==='he'?'ממתין לתרגום':'Перевод ожидается');
      const attrs={content_language:displayLanguage,translation_status:t.translation_status,
        translation_state:state,translation_label:label,translation_available:available,
        requested_language:lang,source_language:item.original_language||'ru',
        translation:{state,label,available,requested_language:lang,display_language:displayLanguage,source_language:item.original_language||'ru'}};
      return profiles?{...item,display_name:t.title,description:t.body,...attrs}:
        {...item,headline:t.title,summary:t.body,short_quote:t.comment,
          ...(names?{analyst:names.get(item.analyst)||''}:{}),...attrs};
    }));
    const translated=shown.filter(Boolean);
    if(profiles)return respond({requested_language:lang,analysts:translated});
    if(detail)return translated[0]?respond(translated[0]):respond({error:'translation_pending'},404);
    return respond({requested_language:lang,posts:translated,post_count:translated.length,withheld_count:shown.length-translated.length,
      localized_count:translated.filter(x=>x.content_language===lang).length,
      translation_summary:{available:translated.filter(x=>x.translation_available).length,
        pending:translated.filter(x=>x.translation_state==='pending').length,
        needs_review:translated.filter(x=>x.translation_state==='needs_review').length,
        original:translated.filter(x=>x.translation_state==='original').length,
        translated:translated.filter(x=>x.translation_state==='translated').length},
      disclaimer:lang==='he'?'פרשנויות הכותבים אינן בהכרח עובדות שאומתו באופן עצמאי.':
        'Авторские аналитические материалы, утверждения требуют независимой проверки.'});
}

// Author names on the HE page come from the translated analyst profiles
// (keyed by the original display name, which posts carry).
async function hebrewAnalystNames(db){
  try{
    const rows=await db.prepare("SELECT a.display_name name,t.title he FROM analysts a JOIN regional_i18n t ON t.kind='profile' AND t.item_id=a.id AND t.language='he' WHERE t.quality_score>=85").all();
    return new Map((rows.results||[]).filter(x=>scriptLanguage(x.he)==='he').map(x=>[x.name,x.he]));
  }catch{return new Map();}
}
