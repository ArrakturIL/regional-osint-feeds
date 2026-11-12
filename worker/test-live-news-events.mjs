import assert from 'node:assert/strict';
import {FEEDS,analyze,sameEvent,group,reconcile,hebrew,publisher} from './live-editor/news-events.mjs';
import {readNewsEvents} from './live-editor/news-api.mjs';
import {localizeNewsRow} from './live-editor/localization.mjs';
const now=Date.now();
const row=(id,source,headline,summary,offset=0)=>({id,source,headline,summary,url:'https://example.org/'+id,published_ms:now+offset*3600000,priority:8});
assert.equal(FEEDS.length,12);
assert.equal(publisher('Jerusalem Post / Iran'),publisher('Jerusalem Post / Israel'));
assert.equal(hebrew('ישראל'),'true'===String(true));
const hospital=[
 row('h1','Times of Israel','Israeli strike hits Nasser Hospital in Gaza','IDF says Nasser Hospital in Gaza was targeted.'),
 row('h2','Jerusalem Post / Israel','IDF strikes Hamas at Gaza hospital','Nasser Hospital in Gaza targeted by strike.',1),
 row('h3','Maariv','תקיפה בבית החולים נאסר בעזה','ישראל הודיעה על תקיפה בבית החולים נאסר בעזה',2),
 row('h4','Al Jazeera','قصف مستشفى ناصر في غزة','قصف مستشفى ناصر في غزة',2)
];
const moved=group([...hospital,
 row('s1','BBC Middle East','Israeli strike hits Al-Shifa Hospital in Gaza','Shifa Hospital, distinct attack',1),
 row('s2','BBC Middle East','A second Israeli strike hits Nasser Hospital in Gaza','Nasser Hospital targeted again',14),
 row('cult','Jerusalem Post / Israel','Israeli fashion week celebrates designers','Local fashion',2),
 row('warsaw','BBC Middle East','Warsaw opens museum about Israel','Historical museum',2)
]);
assert.equal(moved.groups.length,3,'Must keep distinct hospitals and strikes separate');
assert.equal(moved.held.length,2,'Non-events held out of public feed');
assert.equal(moved.groups[0].members.length,4,'EN/HE/AR single incident group');
assert.equal(analyze(hospital[2]).policy,'candidate','Hebrew source reaches classifier');
assert.equal(analyze(hospital[3]).policy,'candidate','Arabic source reaches classifier');
assert.equal(analyze(moved.held[0]).policy,'hold_low_signal');
// Regional false negatives and generic US/archive false positives from QA.
assert.equal(analyze(row('oman','BBC Middle East','Oman condemns missile attack on port','Official statement')).policy,'candidate');
assert.equal(analyze(row('iraq','BBC Middle East','Iraq reports drone strike in Baghdad','Local reporting')).policy,'candidate');
assert.equal(analyze(row('usdomestic','BBC Middle East','US court rules on domestic student funding','State education funds')).policy,'hold_irrelevant');
assert.equal(analyze(row('archive','BBC Middle East','The 2014 Israeli strike: archive video','Historical footage')).policy,'hold_nonnews');
const a=analyze(row('a','Al Jazeera','Iran can produce 50 ballistic missiles','Iran retains ballistic missiles'));
const b=analyze(row('b','Jerusalem Post / Iran','Iran can produce 50 ballistic missiles','Reuters cites 50 ballistic missiles',1));
assert.equal(sameEvent(a,b).ok,true);
const original={id:'native',source:'Maariv',headline:'ישראל ואיראן בשיחות',summary:'ישראל ואיראן דנות בשיחות',headline_ru:null,summary_ru:null,comment:null};
const localized=await localizeNewsRow(null,original,'he');
assert.equal(localized.content_language,'he','Hebrew needs no paid translation');
assert.equal(localized.translation_status,'available');
const russian=await localizeNewsRow(null,original,'ru');
assert.equal(russian.content_language,'he','Never mislabel Hebrew as English or Russian');
class MemoryDB{
 constructor(){
  this.events=[];this.members=[];this.state=[];this.rows=[...hospital];
 }
 prepare(sql){
  const db=this;return{sql,params:[],bind(...p){this.params=p;return this;},
   async all(){
    if(sql.includes('FROM news_items WHERE published_ms'))return{results:db.rows};
    if(sql.includes('FROM news_event_members'))return{results:db.members};
    if(sql.includes('FROM news_event_groups e'))return{results:db.events};
    return{results:[]};
   },async run(){db.state.push({sql,params:this.params});return{meta:{changes:1}};}};
 }
 async batch(items){
  for(const item of items){
   if(item.sql.includes('INSERT INTO news_event_groups')){
    dbLoop: {
     const [event_id,representative_id,topic,priority,last_seen_ms,member_count,source_count,origin_count,verification_status,reason_codes,sources_json]=item.params;
     const obj={event_id,representative_id,topic,priority,last_seen_ms,member_count,source_count,origin_count,verification_status,reason_codes,sources_json};
     this.events=this.events.filter(x=>x.event_id!==event_id);this.events.push(obj);
    }
   }
   if(item.sql.includes('INSERT INTO news_event_members')){
    const [article_id,event_id]=item.params;this.members=this.members.filter(x=>x.article_id!==article_id);this.members.push({article_id,event_id});
   }
  }
  return [];
 }
}
const db=new MemoryDB();
const first=await reconcile(db,now),eventIds=db.events.map(x=>x.event_id);
assert.equal(first.events,1);
assert.equal(first.duplicated,3);
const second=await reconcile(db,now);
assert.deepEqual(db.events.map(x=>x.event_id),eventIds,'Persisted event IDs stable across scans');
assert.equal(second.events,1);
const mock=new MemoryDB();
mock.events=[{...db.events[0],event_priority:9,id:'h1',source:'Times of Israel',headline:hospital[0].headline,
 summary:hospital[0].summary,comment:null,url:hospital[0].url,published_ms:now,priority:9,
 he_hash:null,he_title:null,he_body:null,he_comment:null,he_quality:null,
 source_count:4,origin_count:4,member_count:4,last_seen_ms:now,topic:'strike',
 verification_status:'multi_outlet_reporting'}];
const result=await readNewsEvents(new Request('https://regional.test/api/news?lang=ru&limit=5'),{NEWS_DB:mock});
assert.equal(result.status,200);
const data=await result.json();
assert.equal(data.grouping,'event_v1');
assert.equal(data.articles.length,1);
assert.equal(data.articles[0].sources.length,4);
assert.notEqual(data.articles[0].verification_status,'confirmed');
for(const q of ['limit=1.5','limit=-2','offset=0.2','limit=500']){
 const e=await readNewsEvents(new Request('https://regional.test/api/news?'+q),{NEWS_DB:mock});
 assert.equal(e.status,400,'Invalid '+q+' must be 400');
}
// One previous event splits in two. Only one successor inherits its ID.
db.rows=db.rows.map(x=>x.id==='h1'?{...x,
  headline:'Israeli strike hits Al-Shifa Hospital in Gaza',
  summary:'IDF says Al-Shifa Hospital in Gaza was targeted.'}:x);
const split=await reconcile(db,now);
assert.equal(split.events,2,'Two distinct venues must remain separate after reclassification');
assert.equal(db.events.length,2,'Split must leave two persisted D1 event heads, not overwrite');
const splitIds=db.events.map(x=>x.event_id).sort();
assert.equal(new Set(splitIds).size,2,'Each split group needs a unique stable ID');
assert.ok(splitIds.includes(eventIds[0]),'Majority branch retains the original ID');
await reconcile(db,now);
assert.deepEqual(db.events.map(x=>x.event_id).sort(),splitIds,'Split IDs must stay stable on repeated scan');

// Page-size changes must not change the global diversity ordering.
const pageDb=new MemoryDB();
pageDb.events=Array.from({length:26},(_,i)=>({
  event_id:'evt_page_'+i,id:'page_'+i,source:i<15?'Times of Israel':'Al Jazeera',
  headline:'Iran and Israel news event '+i,headline_ru:null,summary:'Regional update',summary_ru:null,
  comment:null,url:'https://example.org/page_'+i,published_ms:now-i*1000,
  event_priority:8,topic:'statement',last_seen_ms:now-i*1000,
  member_count:1,source_count:1,origin_count:1,
  verification_status:'single_origin_reporting',reason_codes:'[]',sources_json:'[]'
}));
async function page(limit,offset){
 const r=await readNewsEvents(new Request('https://regional.test/api/news?lang=ru&limit='+limit+'&offset='+offset),{NEWS_DB:pageDb});
 assert.equal(r.status,200);
 return (await r.json()).articles.map(x=>x.event_id);
}
const page5=await page(5,0),page20=await page(20,5),page25=await page(25,0);
assert.deepEqual([...page5,...page20],page25,'Different page sizes must give the same 25 unique events');
assert.equal(new Set(page25).size,25,'Pagination must not duplicate events');

console.log('Production event filter: 12 feeds, tri-lingual merge/split, native HE, stable D1 IDs, public contract OK');
