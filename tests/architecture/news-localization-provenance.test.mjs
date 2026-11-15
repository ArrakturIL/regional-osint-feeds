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
