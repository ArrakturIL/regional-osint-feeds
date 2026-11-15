import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fingerprint,localizeNewsRow} from '../../backend/editor/src/localization/localization.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const row=(headline,headline_ru=null)=>({
 id:'qa-translation',source:'Arutz Sheva',headline,headline_ru,
 summary:'',summary_ru:null,comment:null,url:'https://example.org/source',published_ms:Date.now(),priority:8,
});
test('an English-source Russian translation is never marked as the original',async()=>{
 const source=row('Two tankers strike a naval mine and catch fire','Два танкера столкнулись с морской миной и загорелись');
 const result=await localizeNewsRow(null,source,'ru');
 assert.equal(result.title,source.headline_ru);
 assert.equal(result.content_language,'ru');
 assert.equal(result.translation_status,'available');
 assert.equal(result.source_language,'en');
});
test('an inverted Russian source-translation is quarantined, not served as original',async()=>{
 const bad=row('Two tankers strike a naval mine and catch fire','Два танкера атаковали морскую шахту');
 const result=await localizeNewsRow(null,bad,'ru');
 assert.equal(result.translation_status,'needs_review');
 assert.equal(result.title,bad.headline);
 assert.equal(result.content_language,'en');
});
test('the Reuters barring condition cannot be served from a corrupted Russian cache',async()=>{
 const bad=row('Trump may postpone strikes on Iran barring new provocations','Трамп запретил новые провокации и отложил удары по Ирану');
 const result=await localizeNewsRow(null,bad,'ru');
 assert.equal(result.translation_status,'needs_review');
 assert.equal(result.title,bad.headline);
});
test('native Russian original remains original, English without translation remains pending',async()=>{
 const ru=await localizeNewsRow(null,row('Это оригинальная новость на русском'),'ru');
 assert.equal(ru.translation_status,'source');
 const en=await localizeNewsRow(null,row('Original English report without a translation'),'ru');
 assert.equal(en.translation_status,'pending');
});
test('a high-score cached Hebrew translation with inverted US actor is quarantined',async()=>{
 const source=row('Israel fears surprise US strike on Iran');
 const original={title:source.headline,body:'',comment:''};
 source.he_hash=await fingerprint(original);
 source.he_title='ישראל חוששת להפתיע את ארה״ב במכה באיראן';
 source.he_body='';source.he_comment='';source.he_quality=97;
 const result=await localizeNewsRow(null,source,'he');
 assert.equal(result.translation_status,'needs_review');
 assert.equal(result.title,source.headline);
});
test('an accurate cached Hebrew translation keeps available status',async()=>{
 const source=row('Israel fears surprise US strike on Iran');
 source.he_hash=await fingerprint({title:source.headline,body:'',comment:''});
 source.he_title='ישראל חוששת מתקיפה פתאומית של ארה״ב באיראן';
 source.he_body='';source.he_comment='';source.he_quality=95;
 const result=await localizeNewsRow(null,source,'he');
 assert.equal(result.translation_status,'available');
 assert.equal(result.content_language,'he');
});

test('actual QA Russian present-tense naval mine inversion is flagged for review, not available',async()=>{
 const bad=row('Two tankers strike a naval mine and catch fire, Iran says','Два танкера нападают на мины и горят');
 const result=await localizeNewsRow(null,bad,'ru');
 assert.equal(result.translation_status,'needs_review');
 assert.equal(result.source_language,'en');
 assert.equal(result.title,bad.headline);
});

test('source-verified P1 correction candidates preserve actor, condition and maritime mine semantics',async()=>{
 const {readFileSync}=await import('node:fs');
 const {semanticMeaningIssue}=await import('../../backend/editor/src/translations/semantic-meaning.mjs');
 const manifest=JSON.parse(readFileSync(new URL('../../data/qa/p1-translation-remediation-20261115.json',import.meta.url),'utf8'));
 assert.equal(manifest.schema_version,1);
 assert.equal(manifest.status,'review_only_not_deployed');
 assert.equal(manifest.items.length,3);
 assert.equal(new Set(manifest.items.map(x=>x.id)).size,3);
 for(const item of manifest.items){
   assert.ok(/^https:\/\//.test(item.source_url),item.id);
   assert.ok(item.original.title.length>20&&item.original.body.length>50,item.id);
   for(const lang of ['ru','he']){
     const c=item.candidate[lang];
     assert.ok(c.title&&c.body,item.id+'/'+lang);
     assert.equal(semanticMeaningIssue(item.original.title,c.title),null,item.id+'/'+lang+'/title');
     assert.equal(semanticMeaningIssue(item.original.body,c.body),null,item.id+'/'+lang+'/body');
   }
   for(const [locale,field] of [['ru','title'],['ru','body'],['he','title'],['he','body']]){
     const prior=item.bad_cache?.[locale]?.[field];
     if(prior){
       assert.ok(semanticMeaningIssue(item.original[field],prior),item.id+'/'+locale+'/'+field+' should reject known wrong cache');
     }
   }
 }
});

test('approved P1 D1 replacement rows preserve RU/HE provenance and matching Hebrew source hashes',async()=>{
 const {readFileSync}=await import('node:fs');
 const manifest=JSON.parse(readFileSync(new URL('../../data/qa/p1-translation-remediation-20261115.json',import.meta.url),'utf8'));
 for(const item of manifest.items){
   const original={title:item.original.title,body:item.original.body,comment:''};
   const pending={
     id:item.id,headline:original.title,headline_ru:item.candidate.ru.title,
     summary:original.body,summary_ru:item.candidate.ru.body,comment:null,source:'Publisher',
     url:item.source_url,published_ms:Date.now(),priority:8
   };
   const hash=await fingerprint({
     title:pending.headline_ru,body:pending.summary_ru,comment:''
   });
   const record={...pending,he_hash:hash,he_title:item.candidate.he.title,
     he_body:item.candidate.he.body,he_comment:'',he_quality:95};
   const ru=await localizeNewsRow(null,record,'ru');
   assert.equal(ru.title,item.candidate.ru.title,item.id+'/ru title');
   assert.equal(ru.body,item.candidate.ru.body,item.id+'/ru body');
   assert.equal(ru.content_language,'ru');
   assert.equal(ru.source_language,'en');
   assert.equal(ru.translation_status,'available');
   const he=await localizeNewsRow(null,record,'he');
   assert.equal(he.title,item.candidate.he.title,item.id+'/he title');
   assert.equal(he.body,item.candidate.he.body,item.id+'/he body');
   assert.equal(he.source_language,'en');
   assert.equal(he.content_language,'he');
   assert.equal(he.translation_status,'available');
   const invalid={...record,he_hash:'0'.repeat(64)};
   const stale=await localizeNewsRow(null,invalid,'he');
   assert.equal(stale.translation_status,'pending');
   assert.equal(stale.title,item.original.title);
 }
});
