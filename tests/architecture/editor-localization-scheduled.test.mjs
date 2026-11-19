// Hebrew source text identity. Scheduler behaviour (queue, ceilings, providers)
// is tested on a real SQLite queue in editor-translation-queue.test.mjs (B10).
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {sourceText,fingerprint,newsHebrewSource,legacyNewsPivotText} from '../../backend/editor/src/localization/shared.mjs';
import {fingerprint as publicFingerprint} from '../../backend/editor/src/localization/localization.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const row={headline:'Israel reports 5 drones',headline_ru:'Израиль сообщает о 5 беспилотниках',
 summary:'A statement from the border',summary_ru:'Заявление с границы',comment:null};

test('shared source text and fingerprint retain public identity and never fabricate missing comments',async()=>{
 const original=sourceText('news',row);
 // Owner 18.11: the Hebrew source is the original article, not headline_ru.
 assert.deepEqual(original,{title:'Israel reports 5 drones',body:'A statement from the border',comment:''});
 assert.equal(await fingerprint(original),await publicFingerprint(original));
 assert.match(await fingerprint(original),/^[a-f0-9]{64}$/);
});

test('a legacy pivot hash (HE made from Russian) is recognised; the original text otherwise',async()=>{
 const legacy=await fingerprint(legacyNewsPivotText(row)),fresh=await fingerprint(sourceText('news',row));
 assert.deepEqual(await newsHebrewSource(row,legacy),{text:legacyNewsPivotText(row),legacy:true});
 assert.deepEqual(await newsHebrewSource(row,fresh),{text:sourceText('news',row),legacy:false});
 assert.deepEqual(await newsHebrewSource(row,null),{text:sourceText('news',row),legacy:false});
 assert.equal((await newsHebrewSource({...row,headline_ru:null,summary_ru:null},legacy)).legacy,false,'no pivot, nothing legacy');
});
