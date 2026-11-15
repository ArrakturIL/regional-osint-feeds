import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {group,analyze,sameEvent} from '../../backend/editor/src/news/events.mjs';
import {readNewsEvents} from '../../backend/editor/src/news/api.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const when=Date.parse('2026-11-15T01:00:00Z');
const article=(id,source,headline,summary,minutes=0)=>({
 id,source,headline,summary,url:'https://example.org/articles/'+id,published_ms:when+minutes*60000,priority:8
});
const rafah=[
 article('r1','Arutz Sheva','Hamas Rafah Brigade commander killed',
 'Samir Abu Yunis, newly appointed commander of the Rafah Brigade in Hamas military wing, was killed in strikes west of Khan Yunis.',0),
 article('r2','Maariv','צה״ל תקף בכיר בחמאס - בעזה מדווחים על חיסול מפקד חטיבת רפיח',
 'צה״ל ושב״כ הודיעו על תקיפת בכיר בחמאס. מפקד חטיבת רפיח סמיר אבו יונס חוסל בתקיפה ישראלית.',24),
 article('r3','Jerusalem Post / Israel','Senior Hamas terrorist targeted in IDF, Shin Bet strike',
 'Minister Katz indicated the target had been killed, but the IDF had not yet confirmed his death.',125),
 article('r4','Al Jazeera','Israeli air strike kills senior Hamas commander in Gaza',
 'Hamas says Rafah brigade commander Samir Abu Younis was killed in an attack on Khan Younis.',155),
 article('r5','Times of Israel','IDF says senior terrorist in Hamas military wing targeted in Gaza strike',
 'Hamas sources say Rafah brigade commander Samir Abu Younis was killed. * Other unrelated transit news.',183)
];

test('five attributed articles reporting one commander strike form one incident, keeping every source',()=>{
 const {groups,held}=group(rafah);
 assert.equal(held.length,0);
 assert.equal(groups.length,1);
 assert.equal(groups[0].members.length,5);
 assert.equal(new Set(groups[0].members.map(x=>x.owner)).size,5);
});

test('a different senior Hamas target in the same news cycle must not merge',()=>{
 const different=article('different','BBC Middle East',
 'Israeli strike targets senior Hamas commander Khaled Abu Faris in Gaza',
 'Officials say a different Hamas brigade commander Khaled Abu Faris was targeted in Gaza.',170);
 const x=group([...rafah,different]);
 assert.equal(x.groups.length,2);
 assert.equal(x.groups.reduce((n,g)=>n+g.members.length,0),6);
});

test('follow-up strikes six hours later must not be collapsed into the original',()=>{
 const later=article('followup','BBC Middle East','Another IDF strike targeted senior Hamas commander in Gaza',
  'A separate renewed strike hit a Hamas target in Khan Younis.',360);
 const r=group([...rafah,later]);
 assert.equal(r.groups.length,2);
});

test('reporting assertions remain attributed and contradictory claims visible',()=>{
 const claims=rafah.map(x=>analyze(x));
 assert.equal(claims[0].claim_about_death,'reported_death');
 assert.equal(claims[2].claim_about_death,'death_not_confirmed_by_idf');
 assert.equal(claims[3].claim_about_death,'reported_death');
 assert.equal(claims[2].claimed_by,'Jerusalem Post / Israel');
});

const events=[
 {event_id:'old9',topic:'strike',event_priority:9,last_seen_ms:when-4*86400000,
  member_count:1,source_count:1,origin_count:1,verification_status:'single_origin_reporting',sources_json:'[]',reason_codes:'[]'},
 {event_id:'today8',topic:'strike',event_priority:8,last_seen_ms:when+120*60000,
  member_count:1,source_count:1,origin_count:1,verification_status:'single_origin_reporting',sources_json:'[]',reason_codes:'[]'},
 {event_id:'yesterday7',topic:'military',event_priority:7,last_seen_ms:when-86400000,
  member_count:1,source_count:1,origin_count:1,verification_status:'single_origin_reporting',sources_json:'[]',reason_codes:'[]'}
].map(x=>({...x,id:x.event_id,source:'BBC Middle East',headline:'Regional report '+x.event_id,summary:'news',comment:null,url:'https://example.org/'+x.event_id,published_ms:x.last_seen_ms,priority:x.event_priority}));

class EventDB{
 prepare(sql){
  return {bind(...params){this.params=params;return this;},first:async()=>({n:3}),all:async()=>({results:events})};
 }
}
const collect=async(lang,sort,offset=0,limit=3)=>{
 const q='https://regional.example/api/news?lang='+lang+'&limit='+limit+'&offset='+offset+(sort?'&sort='+sort:'');
 const r=await readNewsEvents(new Request(q),{NEWS_DB:new EventDB()});
 return {status:r.status,payload:await r.json()};
};

test('Latest defaults to chronology even when older event has higher priority',async()=>{
 const {status,payload}=await collect('ru');
 assert.equal(status,200);
 assert.deepEqual(payload.articles.map(x=>x.event_id),['today8','yesterday7','old9']);
 assert.equal(payload.sort,'latest');
});

test('Priority ordering is explicit and does not silently leak into Latest',async()=>{
 const {payload}=await collect('ru','priority');
 assert.deepEqual(payload.articles.map(x=>x.event_id),['old9','today8','yesterday7']);
 assert.equal(payload.sort,'priority');
});

test('RU/HE stable event order and pagination for both sort modes',async()=>{
 for(const sort of ['latest','priority']){
  for(const limit of [1,3]){
   const ru=(await collect('ru',sort,0,limit)).payload;
   const he=(await collect('he',sort,0,limit)).payload;
   assert.deepEqual(ru.articles.map(x=>x.event_id),he.articles.map(x=>x.event_id));
   assert.equal(ru.feed_order_hash,he.feed_order_hash);
  }
 }
 const invalid=await collect('ru','ancient');
 assert.equal(invalid.status,400);
});

test('Hebrew news pages localize only returned rows, not the entire candidate pool',async()=>{
 const rows=Array.from({length:32},(_,i)=>({
  ...events[0],event_id:'page-'+i,id:'page-'+i,
  source:'Publisher '+(i%4),headline:'Update '+i,
  last_seen_ms:when+i*60_000,published_ms:when+i*60_000,
  event_priority:7,priority:7,he_hash:null,he_title:null,
 }));
 let translations=0;
 const db={prepare(sql){
  if(sql.includes('FROM news_event_groups e JOIN news_items n'))
   return{bind(){return this},all:async()=>({results:rows})};
  if(sql.includes("FROM regional_i18n WHERE kind=?"))
   return{bind(){return this},first:async()=>{translations++;return null}};
  throw Error('Unexpected SQL: '+sql.slice(0,90));
 }};
 const response=await readNewsEvents(
   new Request('https://rw.example/api/news?lang=he&sort=priority&limit=4&offset=8'),{NEWS_DB:db});
 const body=await response.json();
 assert.equal(response.status,200);
 assert.equal(body.articles.length,4);
 assert.equal(body.total_events,32);
 assert.equal(body.articles[0].feed_rank,8);
 assert.equal(translations,4,'i18n D1 reads should be bounded by page size, not 32 source rows');
 const ru=await readNewsEvents(new Request('https://rw.example/api/news?lang=ru&sort=priority&limit=4&offset=8'),
  {NEWS_DB:db});
 const ruBody=await ru.json();
 assert.deepEqual(body.articles.map(x=>x.event_id),ruBody.articles.map(x=>x.event_id));
 assert.equal(body.feed_order_hash,ruBody.feed_order_hash);
});

test('Hebrew native source alternatives are fetched only for selected news page',async()=>{
 const rows=Array.from({length:20},(_,i)=>({
  ...events[0],event_id:'he-page-'+i,id:'he-page-'+i,
  source:'Publisher '+i,headline:'English report '+i,
  last_seen_ms:when+i*60_000,published_ms:when+i*60_000,
  event_priority:7,priority:7,he_hash:null,he_title:null,
  sources_json:JSON.stringify([{language:'he',article_id:'native-'+i}]),
 }));
 const selectedIds=[];
 const db={prepare(sql){
  if(sql.includes('FROM news_event_groups e JOIN news_items n'))
   return{bind(){return this},all:async()=>({results:rows})};
  if(sql.startsWith('SELECT id,source,headline,headline_ru')){
   return {bind(...ids){
    selectedIds.push(...ids);
    const native=ids.map(id=>({
     id,source:'Native Hebrew',headline:'דיווח מקורי',summary:'מידע מקורי',comment:null,
     headline_ru:null,summary_ru:null,url:'https://example.org/'+id,published_ms:when,priority:7
    }));
    return {all:async()=>({results:native})};
   }};
  }
  if(sql.includes("FROM regional_i18n WHERE kind=?"))
   return{bind(){return this},first:async()=>null};
  throw Error('Unexpected SQL: '+sql.slice(0,90));
 }};
 const response=await readNewsEvents(new Request('https://rw.example/api/news?lang=he&limit=3&offset=6'),{NEWS_DB:db});
 const result=await response.json();
 assert.equal(response.status,200);
 assert.equal(selectedIds.length,3,'native candidate lookups must not load all 20 events');
 assert.equal(result.articles.length,3);
 assert.ok(result.articles.every(x=>x.display_article_id.startsWith('native-')));
 assert.ok(result.articles.every(x=>x.content_language==='he'));
});

test('archive explicitly requests latest ordering and avoids duplicate homepage poll',async()=>{
 const {readFileSync}=await import('node:fs');
 const {resolve}=await import('node:path');
 const root=resolve(import.meta.dirname,'../..');
 const archive=readFileSync(resolve(root,'frontend/src/components/NewsArchive/NewsArchive.js'),'utf8');
 const app=readFileSync(resolve(root,'frontend/src/app/App.js'),'utf8');
 assert.ok(archive.includes('&sort=latest'),'Archive must request chronological order');
 assert.ok(!app.includes('const pages=route==="/"||route==="/events"'),'Event page must not poll an unused home news feed');
});
