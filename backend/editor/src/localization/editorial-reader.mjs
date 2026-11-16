import {sourceText} from './shared.mjs';
import {respond,localized,fieldLocale} from './read-core.mjs';

export async function readLocalizedEditorialNotes(env,lang,lim){
    const cols="SELECT n.id,n.headline,n.text,n.source_url,n.published_ms,n.author,n.verified_note";
    const joined=" FROM editorial_notes n LEFT JOIN regional_i18n t ON t.kind='editorial' AND t.item_id=n.id AND t.language='he'";
    const ext=",t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality";
    const sql=lang==='he'?cols+ext+joined+" ORDER BY n.published_ms DESC LIMIT ?":cols+" FROM editorial_notes n ORDER BY n.published_ms DESC LIMIT ?";
    const rows=await env.NEWS_DB.prepare(sql).bind(lim).all();
    const notes=await Promise.all((rows.results||[]).map(async n=>{
      const cache=lang==='he'?{source_hash:n.he_hash,title:n.he_title,body:n.he_body,commentary:n.he_comment,quality_score:n.he_quality}:null;
      const t=await localized(env.NEWS_DB,'editorial',n.id,sourceText('editorial',n),lang,cache);
      const note={id:n.id,headline:t.title,text:t.body,source_url:n.source_url,published_ms:n.published_ms,author:n.author,verified_note:n.verified_note,content_language:t.content_language};
      return{...note,...fieldLocale(note,['headline','text','verified_note'],lang,t.translation_status)};
    }));
    return respond({requested_language:lang,notes,localized_count:notes.filter(x=>x.localization_complete).length})
}
