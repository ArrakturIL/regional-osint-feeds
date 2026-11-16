import {safePublishedComment} from '../editorial/comment-policy.mjs';

const DAY=86400000;

export function val(s,len=1800){return String(s||'').trim().slice(0,len);}
export function sourceText(kind,row){
  if(kind==='news')return{title:val(row.headline_ru||row.headline,260),body:val(row.summary_ru||row.summary,650),comment:val(safePublishedComment(row,row.comment),300)};
  if(kind==='editorial')return{title:val(row.headline,260),body:val(row.text,1900),comment:''};
  if(kind==='analyst')return{title:val(row.headline,260),body:val(row.summary,850),comment:val(row.short_quote,300)};
  if(kind==='profile')return{title:val(row.display_name,180),body:val(row.description,600),comment:''};
  if(kind==='story'){const p=typeof row.payload==='string'?JSON.parse(row.payload):row;
    return{title:val(p.title_ru||p.headline_ru||p.title||p.headline||String(p.finding||'').split(/[.;]/,1)[0].trim(),240),
      body:val(p.summary_ru||p.description_ru||p.finding||p.what_changed,1050),comment:''};}
  return{title:'',body:'',comment:''};
}
export async function fingerprint(t){
  const data=new TextEncoder().encode(JSON.stringify([t.title,t.body,t.comment]));
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
  return Array.from(hash,v=>v.toString(16).padStart(2,'0')).join('');
}
