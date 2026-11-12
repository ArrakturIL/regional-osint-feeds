import assert from 'node:assert/strict';
import {validateCandidate,translationQueue} from './live-editor/news-translation-mirror.mjs';

assert.equal(validateCandidate('Iran has 50 missiles','Иран имеет 50 ракет','ru'),true);
assert.equal(validateCandidate('Iran has 50 missiles','Иран имеет 500 ракет','ru'),false);
assert.equal(validateCandidate('Iran has 50 missiles','איראן מחזיקה ב-50 טילים','he'),true);
assert.equal(validateCandidate('Katz reports new Iran talks','קטז מדווח על שיחות איראן','he'),false);
assert.equal(validateCandidate('Katz reports new Iran talks','כץ מדווח על שיחות איראן','he'),true);
assert.equal(validateCandidate('IRGC attacked base','חיל הים האיראני תקף את הבסיס','he'),false);
assert.equal(validateCandidate('IRGC attacked base','משמרות המהפכה תקפו את הבסיס','he'),true);
assert.equal(validateCandidate('Iran has 10,000 drones','У Ирана 10000 беспилотников','ru'),true);

const english={event_id:'evt_a',id:'abcdefabcdefabcdefabcdef',source:'The Guardian',
 headline:'Iran has 50 missiles',summary:'Iran announced 50 missiles',headline_ru:null,summary_ru:null,
 he_hash:null,he_title:null,he_body:null,he_comment:null,comment:null,event_priority:8};
const native={...english,event_id:'evt_b',id:'abcdeffedcbaffeedcbaffed',source:'Israel Hayom',
 headline:'ישראל ואיראן בשיחות',summary:'ישראל דנה עם איראן',headline_ru:null};
const db={prepare(sql){return{bind(...values){this.values=values;return this;},
 async all(){return{results:[english,native]}}}}};
const res=await translationQueue({NEWS_DB:db},new Request('https://regional.test/api/translation-queue?limit=4'));
assert.equal(res.status,200);
const data=await res.json();
assert.equal(data.items.length,2);
assert.equal(data.items[0].need_ru,true);
assert.equal(data.items[0].need_he,true);
assert.equal(data.items[1].need_ru,true);
assert.equal(data.items[1].need_he,false);
const bad=await translationQueue({NEWS_DB:db},new Request('https://regional.test/api/translation-queue?limit=1.5'));
assert.equal(bad.status,400);
console.log('Open-source translation mirror: numeric/actor guards and bilingual queue OK');
