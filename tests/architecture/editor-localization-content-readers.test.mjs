import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {readLocalizedNews,localizeNewsRow} from '../../backend/editor/src/localization/news-reader.mjs';
import {readLocalizedEditorialNotes} from '../../backend/editor/src/localization/editorial-reader.mjs';
import {readLocalizedStories,storyProvenance} from '../../backend/editor/src/localization/stories-reader.mjs';
import {reconstructContentFacade} from './localization-content-parity.mjs';
import localization,{localizeNewsRow as publicNewsRow,storyProvenance as publicProvenance,fingerprint} from '../../backend/editor/src/localization/localization.mjs';
import {sourceText} from '../../backend/editor/src/localization/shared.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

function makeEnv({news=[],notes=[],stories=[]}={}){
 const queries=[];
 const database=name=>({
  prepare(sql){
   const bind=(args=[])=>({
    bind(...xs){return bind(xs);},
    async all(){
     queries.push({db:name,sql,args,method:'all'});
     if(sql.includes('FROM news_items'))return{results:news};
     if(sql.includes('FROM editorial_notes'))return{results:notes};
     if(sql.includes('FROM monitor_events'))return{results:stories};
     throw Error('unexpected query '+sql);
    },
    async first(){
     queries.push({db:name,sql,args,method:'first'});
     if(sql.includes('FROM regional_i18n'))return null;
     throw Error('unexpected query '+sql);
    }
   });return bind();
  }
 });
 return{env:{NEWS_DB:database('NEWS_DB'),CORE_DB:database('CORE_DB')},queries};
}
const request=(path)=>new Request('https://regional-watch.pages.dev'+path);
const row=(id,headline,more={})=>({
 id,source:'Example publisher',headline,headline_ru:null,summary:'',summary_ru:null,comment:null,
 url:'https://example.org/news/'+id,published_ms:Date.now(),priority:8,...more
});
const sha=data=>{
 const buf=Buffer.from(data,'utf8');
 return createHash('sha1').update(Buffer.from('blob '+buf.length,'utf8')).update(Buffer.from([0])).update(buf).digest('hex');
};
test('three public readers reconstruct previous exact facade Git object and retain public exports',()=>{
 assert.equal(sha(reconstructContentFacade()),'2c6b416583a1df60c4e6b982cb471da9e95ff075');
 assert.equal(publicNewsRow,localizeNewsRow);
 assert.equal(publicProvenance,storyProvenance);
 assert.equal(typeof fingerprint,'function');
 assert.equal(typeof localization.scheduled,'function');
});

test('RU news API retains priority SQL, page offset, translation fields and default language',async()=>{
 const records=[
   row('one','Russia says talks continue',{headline_ru:'Россия заявила о продолжении переговоров',priority:9}),
   row('two','Исходная русская новость',{priority:4})
 ];
 const f=makeEnv({news:records});
 const r=await localization.fetch(request('/api/news?limit=2&offset=40'),f.env,null);
 const x=await r.json();
 assert.equal(r.status,200);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal(x.requested_language,'ru');
 assert.equal(x.articles.length,2);
 assert.equal(x.articles[0].headline,records[0].headline_ru);
 assert.equal(x.articles[0].translation_status,'available');
 assert.equal(x.articles[1].translation_status,'source');
 assert.equal(x.localized_count,2);
 assert.equal(x.offset,40);
 assert.equal(x.next_offset,42);
 assert.match(f.queries[0].sql,/ORDER BY n\.priority DESC,n\.published_ms DESC LIMIT \? OFFSET \?/);
 assert.deepEqual(f.queries[0].args.slice(1),[2,40]);
});

test('HE ready_only filters pending translations and retains joined cached SQL/read offset',async()=>{
 const available=row('he-1','Updates on the border');
 const pending=row('he-2','A second report');
 const translated={title:'עדכונים בגבול',body:'',comment:''};
 available.he_hash=await fingerprint(sourceText('news',available));
 available.he_title=translated.title;available.he_body='';available.he_comment='';
 available.he_quality=95;
 const f=makeEnv({news:[available,pending]});
 const r=await readLocalizedNews(f.env,new URL('https://regional-watch.pages.dev/api/news?lang=he&ready_only=true&offset=0'),'he',2,'0');
 const x=await r.json();
 assert.equal(x.ready_only,true);
 assert.equal(x.articles.length,1);
 assert.equal(x.articles[0].id,'he-1');
 assert.equal(x.articles[0].translation_status,'available');
 assert.equal(x.localized_count,1);
 assert.equal(x.next_offset,2);
 assert.match(f.queries[0].sql,/t\.quality_score>=85/);
 assert.equal(f.queries[0].args[2],0);
});

test('editorial HE cache missing keeps field-level statuses, metadata and source URL',async()=>{
 const notes=[{id:'ed-1',headline:'Заголовок',text:'Текст статьи',verified_note:'Проверено',author:'Editor',
   published_ms:1730000000000,source_url:'https://example.org/source'}];
 const f=makeEnv({notes});
 const r=await readLocalizedEditorialNotes(f.env,'he',20);
 const x=await r.json();
 assert.equal(r.status,200);
 assert.equal(x.notes.length,1);
 assert.equal(x.notes[0].source_url,notes[0].source_url);
 assert.equal(x.notes[0].content_language,'ru');
 assert.equal(x.notes[0].translation_status,'pending');
 assert.equal(x.notes[0].localization_complete,false);
 assert.equal(x.notes[0].field_translation_status.verified_note,'pending');
 assert.equal(x.localized_count,0);
 assert.match(f.queries[0].sql,/LEFT JOIN regional_i18n/);
});

test('story API preserves provenance, deduped HTTPS sources, partial event date and skip corrupt JSON',async()=>{
 const data={title:'История события',summary:'Описание',incident_date:'2026-09',published_date:'2026-11-10',
  source:'https://example.org/report',sources:[{url:'https://example.org/report',type:'publisher'}],
  source_urls:['http://example.org/not-https','https://other.org/independent'],
  category:'security'};
 const f=makeEnv({stories:[{event_id:'event-good',payload:JSON.stringify(data),updated_at_ms:Date.now()},
                            {event_id:'bad',payload:'{broken',updated_at_ms:Date.now()}]});
 const r=await localization.fetch(request('/api/stories?lang=ru&limit=5'),f.env,null);
 const x=await r.json();
 assert.equal(x.stories.length,1);
 assert.equal(x.stories[0].event_date,'2026-09');
 assert.equal(x.stories[0].announced_at,null,'an incident date is not an independently announced date');
 assert.deepEqual(x.stories[0].source_urls,['https://example.org/report','https://other.org/independent']);
 assert.equal(x.stories[0].url,'https://example.org/report');
 assert.equal(x.stories[0].localization_complete,true);
 assert.equal(x.localized_count,1);
 assert.equal(storyProvenance(data).sources.length,2);
 assert.match(f.queries[0].sql,/FROM monitor_events n/);
});

test('common facade retains 400/405/204/404 validation before three public readers run',async()=>{
 const f=makeEnv();
 const cases=[
 ['/api/news?lang=en','GET',400,'unsupported_language'],
 ['/api/editorial-notes?limit=41','GET',400,'invalid_limit'],
 ['/api/stories?offset=-1','GET',400,'invalid_offset'],
 ['/api/news','POST',405,'read_only'],
 ['/api/unknown','GET',404,'not_found']
 ];
 for(const [path,method,expected,error] of cases){
   const r=await localization.fetch(new Request('https://regional-watch.pages.dev'+path,{method}),f.env,null);
   assert.equal(r.status,expected,path);
   assert.equal((await r.json()).error,error,path);
 }
 const options=await localization.fetch(new Request('https://regional-watch.pages.dev/api/news',{method:'OPTIONS'}),f.env,null);
 assert.equal(options.status,204);
 assert.equal(f.queries.length,0);
});


test('B-04 ready Hebrew editorial headline/body remain field-available when unlocalized verified note is pending',async()=>{
 const n={id:'field-note',headline:'Ситуация в регионе',text:'Наблюдаются изменения в работе системы.',
   verified_note:'Проверка источника завершена.',author:'Editor',
   published_ms:1730000000000,source_url:'https://example.org/editorial-note'};
 n.he_hash=await fingerprint(sourceText('editorial',n));
 n.he_title='המצב באזור';n.he_body='נצפו שינויים בפעולת המערכת.';
 n.he_comment='';n.he_quality=95;
 const f=makeEnv({notes:[n]});
 const response=await readLocalizedEditorialNotes(f.env,'he',20);
 const result=(await response.json()).notes[0];
 assert.equal(response.status,200);
 assert.equal(result.field_translation_status.headline,'available');
 assert.equal(result.field_translation_status.text,'available');
 assert.equal(result.field_translation_status.verified_note,'pending');
 assert.equal(result.localization_complete,false,'untranslated verified note still prevents full completeness');
 assert.equal(result.translation_status,'pending');
 assert.equal(result.core_translation_status,'available','primary editorial article should not be mislabeled as untranslated');
 assert.deepEqual(result.pending_fields,['verified_note']);
 assert.equal(result.verified_note,n.verified_note,'do not invent an Hebrew translation');
});
