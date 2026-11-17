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
 const {default:vm}=await import('node:vm');
 const source=archive.replace(/^import\\s+[^\\n]+\\n/gm,'').replace(/^export\\s+(?=(?:function|const)\\s)/gm,'');
 const q=vm.runInNewContext(source+'\\nrwArchiveRequest({language:"ru",page:1,sort:"latest"})',{URLSearchParams});
 const u=new URL(q,'https://rw.test');
 assert.equal(u.searchParams.get('sort'),'latest','Archive must request chronological order through the server');
 assert.equal(u.searchParams.get('offset'),'0');

 assert.ok(!app.includes('const pages=route==="/"||route==="/events"'),'Event page must not poll an unused home news feed');
});

test('C-01/C-03/C-05: event update time, original publication and assertions are distinct and locale-stable',async()=>{
 const old=when-2*86400000,latest=when+60000;
 const sourceClaims=[
  {article_id:'o1',source:'BBC Middle East',publisher:'bbc',published_ms:old,source_assertion:'death_not_confirmed_by_idf',claimed_by:'BBC Middle East'},
  {article_id:'o2',source:'Times of Israel',publisher:'toi',published_ms:latest,source_assertion:'reported_death',claimed_by:'Times of Israel'},
 ];
 const report={...events[0],event_id:'chronology-claim',id:'o1',source:'BBC Middle East',
  published_ms:old,last_seen_ms:latest,verification_status:'multi_outlet_reporting',
  source_count:2,origin_count:2,sources_json:JSON.stringify(sourceClaims)};
 const db={prepare(sql){return{bind(){return this},all:async()=>({results:sql.includes('FROM news_event_groups e JOIN news_items n')?[report]:[]}),first:async()=>null}}};
 const data=[];
 for(const lang of ['ru','he']){
  const response=await readNewsEvents(new Request('https://rw.example/api/news?lang='+lang+'&sort=latest'),{NEWS_DB:db});
  assert.equal(response.status,200);
  data.push((await response.json()).articles[0]);
 }
 for(const row of data){
  assert.equal(row.event_last_seen_ms,latest);
  assert.equal(row.event_first_seen_ms,old);
  assert.equal(row.representative_published_ms,old);
  assert.equal(row.published_ms,latest,'existing event-card timestamp remains stable');
  assert.equal(row.sort_basis,'event_last_seen_ms');
  assert.equal(row.independent_verification,'not_established');
  assert.deepEqual(row.source_assertions,sourceClaims.map(s=>({
   article_id:s.article_id,source:s.source,claimed_by:s.claimed_by,source_assertion:s.source_assertion
  })));
 }
 assert.deepEqual(data.map(x=>x.event_id),['chronology-claim','chronology-claim']);
});


test('B-03 preserves original headline/summary/hash and per-field translation state across RU and HE',async()=>{
 const {createHash}=await import('node:crypto');
 const headline='Israel and Iran discuss regional security';
 const summary='Officials discussed regional security after new diplomatic statements.';
 const english={...events[0],event_id:'provenance-original',id:'source-en',source:'BBC Middle East',
  headline,summary,headline_ru:'Израиль и Иран обсуждают региональную безопасность',
  summary_ru:'Официальные лица обсудили региональную безопасность после новых дипломатических заявлений.',
  sources_json:JSON.stringify([{article_id:'source-en',language:'en',source:'BBC Middle East',published_ms:when}])};
 const db={prepare(){return{bind(){return this},all:async()=>({results:[english]}),first:async()=>null}}};
 const originalHash=createHash('sha256').update(JSON.stringify([headline,summary])).digest('hex');
 const ru=await(await readNewsEvents(new Request('https://rw.example/api/news?lang=ru'),{NEWS_DB:db})).json();
 const he=await(await readNewsEvents(new Request('https://rw.example/api/news?lang=he'),{NEWS_DB:db})).json();
 for(const record of [ru.articles[0],he.articles[0]]){
  assert.equal(record.original_language,'en');
  assert.equal(record.original_headline,headline);
  assert.equal(record.original_summary,summary);
  assert.equal(record.source_hash,originalHash,'hash must describe the immutable original, never headline_ru');
  assert.equal(record.event_id,'provenance-original');
 }
 assert.equal(ru.articles[0].translation_state,'translated');
 assert.equal(ru.articles[0].field_translation_status.headline,'available');
 assert.equal(ru.articles[0].field_translation_status.summary,'available');
 assert.equal(he.articles[0].field_translation_status.headline,'pending');
 assert.equal(he.articles[0].field_translation_status.summary,'pending');
});


test('C-02 live-source platform restriction must not become a military strike from a background church attack',()=>{
 const docs=[
  article('jo-aj','Al Jazeera','Jordan bans Telegram over national security concerns',
   "The measure comes amid a security crackdown after last month's deadly attack on a Greek Orthodox church.",0),
  article('jo-toi','Times of Israel','Jordan blocks Telegram messaging app over ‘national security’ concerns',
   "Kingdom says move safeguards citizens against 'attempts to spread extremism and radicalization'; block comes just weeks after terror attack on Jordanian church killed 9",20)
 ];
 for(const doc of docs) {
  const parsed=analyze(doc);
  assert.equal(parsed.topic,'governance','a policy ban is not a new attack: '+doc.source);
  assert.equal(parsed.policy,'candidate');
  assert.equal(parsed.claim_about_death,'not_reported','prior church attack is historical context, not deaths from this ban');
 }
 const g=group(docs);
 assert.equal(g.groups.length,1,'two publishers cover one regulatory event');
 assert.equal(g.groups[0].members.length,2);
});

test('C-02 source-declared opinion and syndicated copies cannot inflate factual news grouping',()=>{
 const originals=[
  {...article('op-jns','JNS','Why the negotiating table won’t work with the Iranian regime',
   'An agreement is only as reliable as the willingness of the parties to honor it.',0),
   url:'https://www.jns.org/opinion/gerald-platt/why-the-negotiating-table-wont-work-with-the-iranian-regime'},
  article('op-arutz','Arutz Sheva','Why the negotiating table won’t work with the Iranian regime',
   'An agreement is only as reliable as the willingness of the parties to honor it. Opinion.',50)
 ];
 const g=group(originals);
 assert.equal(g.groups.length,0);
 assert.deepEqual(g.held.map(x=>x.type),['opinion','opinion']);
});

test('C-02 distinct political actors deciding on Netanyahu unity government are different events',()=>{
 const decisions=[
  article('golan','Jerusalem Post / Israel','Golan rules out unity government with Netanyahu, warns of new Iran war by caretaker government',
   'The Democrats chairman said the opposition must form a government quickly, warning that history will judge us if it fails to prevent another war.',0),
  article('liberman','Jerusalem Post / Israel',"Liberman's party rules out Netanyahu unity government as Eisenkot faces growing coalition pressure",
   'Yisrael Beytenu MK Yulia Malinovsky ruled out joining a Netanyahu-led unity government as Eisenkot struggles to secure a majority amid negotiations with Likud and haredi parties.',360)
 ];
 const g=group(decisions);
 assert.equal(g.held.length,0);
 assert.equal(g.groups.length,2);
});

test('C-02 protect two independent outlets reporting the same attributed statement',()=>{
 const pair=[
  article('eu-1','Arutz Sheva',"Netanyahu warns Europe: 'You are a target' as he Meets Czech PM in Jerusalem",
    'Netanyahu warned Europe about the Iranian threat during the Czech prime minister visit.',0),
  article('eu-2','Jerusalem Post / Israel',"'Europe is a target': Netanyahu warns of Iranian threat during Czech PM's Israel visit",
    'Prime Minister Netanyahu told his Czech counterpart Iran is a threat to Europe.',120)
 ];
 const g=group(pair);
 assert.equal(g.held.length,0);
 assert.equal(g.groups.length,1);
 assert.equal(g.groups[0].members.length,2);
 assert.equal(new Set(g.groups[0].members.map(x=>x.owner)).size,2);
});


test('C-02 regulatory grouping requires the same restricted service, not only the same country and policy words',()=>{
 const a=article('reg-a','BBC Middle East','Jordan bans Telegram over national security concerns',
  'Government cites national security concerns for the service restriction.',0);
 const b=article('reg-b','France 24','Jordan blocks Signal over national security concerns',
  'Government cites national security concerns for the service restriction.',10);
 const {groups,held}=group([a,b]);
 assert.equal(held.length,0);
 assert.equal(groups.length,2,'two distinct applications are not one regulatory event');
});


test('C-05 reconcile preserves measured discovery timestamp per attributed source',async()=>{
 const {reconcile}=await import('../../backend/editor/src/news/events.mjs');
 const discovered=when+4500000,published=when;
 const source={...article('clock-1','BBC Middle East','Israel and Iran hold regional security talks',
  'Diplomats in Israel and Iran held regional security talks.',0),discovered_ms:discovered};
 const writes=[],reads=[];
 const db={
  prepare(sql){
   const stmt={args:[],bind(...args){this.args=args;return this;},
    async all(){
     reads.push(sql);
     if(sql.includes('FROM news_items n LEFT JOIN regional_i18n'))return {results:[source]};
     if(sql.includes('SELECT article_id,event_id FROM news_event_members'))return {results:[]};
     throw Error('unexpected SELECT '+sql);
    },async run(){return {meta:{changes:1}}}};
   stmt.sql=sql;return stmt;
  },
  async batch(items){writes.push(...items);return[];}
 };
 const result=await reconcile(db,when+5000000);
 assert.equal(result.events,1);
 assert.ok(reads.some(x=>x.includes('n.discovered_ms')),'source-select must include actual D1 discovery time');
 const upsert=writes.find(x=>x.sql.startsWith('INSERT INTO news_event_groups('));
 assert.ok(upsert,'materialized group must be written through the existing batch');
 const sources=JSON.parse(upsert.args[10]);
 assert.equal(sources.length,1);
 assert.equal(sources[0].published_ms,published);
 assert.equal(sources[0].collected_ms,discovered,'original source discovery must never be inferred from publication');
});

test('C-01/C-05 distinguish publishing, collecting and unknown event occurrence in RU/HE',async()=>{
 const created=when-2*3600000,latest=when+30*60000;
 const firstCollected=created+2*3600000,secondCollected=latest+45*60000;
 const sources=[
  {article_id:'clock-old',source:'BBC Middle East',publisher:'bbc',url:'https://example.org/old',
   published_ms:created,collected_ms:firstCollected,source_assertion:'not_reported'},
  {article_id:'clock-new',source:'Times of Israel',publisher:'toi',url:'https://example.org/new',
   published_ms:latest,collected_ms:secondCollected,source_assertion:'not_reported'}
 ];
 const event={...events[0],event_id:'clock-event',id:'clock-old',published_ms:created,last_seen_ms:latest,
  sources_json:JSON.stringify(sources),source_count:2,origin_count:2};
 const db={prepare(sql){return {bind(){return this},all:async()=>({results:sql.includes('FROM news_event_groups e JOIN news_items n')?[event]:[]}),first:async()=>null}}};
 const seen=[];
 for(const lang of ['ru','he']){
  const res=await readNewsEvents(new Request('https://regional-watch.example/api/news?lang='+lang+'&sort=latest'),{NEWS_DB:db});
  assert.equal(res.status,200);
  const item=(await res.json()).articles[0];seen.push(item);
  assert.equal(item.event_earliest_published_ms,created);
  assert.equal(item.event_latest_published_ms,latest);
  assert.equal(item.event_first_collected_ms,firstCollected);
  assert.equal(item.event_last_collected_ms,secondCollected);
  assert.equal(item.event_at_ms,null,'RSS publication is not observed event occurrence');
  assert.equal(item.event_first_seen_ms,created,'backward-compatible field remains publication-based');
  assert.equal(item.event_first_seen_basis,'source_publication');
  assert.equal(item.published_ms,latest,'legacy timestamp remains compatible');
  assert.deepEqual(item.sources.map(s=>s.collected_ms),[firstCollected,secondCollected]);
 }
 assert.deepEqual(seen.map(x=>x.event_first_collected_ms),[firstCollected,firstCollected]);
 const missing={...event,sources_json:JSON.stringify([{article_id:'legacy',source:'BBC Middle East',published_ms:created}])};
 const legacyDB={prepare(){return {bind(){return this},all:async()=>({results:[missing]}),first:async()=>null}}};
 const old=await(await readNewsEvents(new Request('https://regional-watch.example/api/news?lang=ru'),{NEWS_DB:legacyDB})).json();
 assert.equal(old.articles[0].event_first_collected_ms,null,'old index has unknown discovery time, not fabricated 0');
 assert.equal(old.articles[0].event_last_collected_ms,null);
});

test('C-01 optional order-hash continuation detects changed feed before returning overlapping pages',async()=>{
 let rows=[...events];
 let dbReads=0;
 const db={prepare(sql){
  dbReads++;
  if(!sql.includes('FROM news_event_groups e JOIN news_items n'))throw Error('unexpected database query: '+sql);
  return {bind(){return this},all:async()=>({results:rows})};
 }};
 const ask=async(query)=>await readNewsEvents(new Request('https://regional-watch.example/api/news?lang=ru&sort=latest&'+query),{NEWS_DB:db});
 const first=await(await ask('limit=1&offset=0')).json();
 assert.match(first.feed_order_hash,/^[a-f0-9]{64}$/);
 const next=await ask('limit=1&offset=1&expected_order_hash='+first.feed_order_hash);
 assert.equal(next.status,200);
 assert.equal((await next.json()).articles[0].event_id,'yesterday7');
 rows=[{...events[0],event_id:'newest',id:'newest',published_ms:when+5*3600000,last_seen_ms:when+5*3600000},...rows];
 const stale=await ask('limit=1&offset=1&expected_order_hash='+first.feed_order_hash);
 assert.equal(stale.status,409,'old offset must not silently serve duplicate after newer insert');
 const mismatch=await stale.json();
 assert.equal(mismatch.error,'feed_changed');
 assert.match(mismatch.feed_order_hash,/^[a-f0-9]{64}$/);
 assert.notEqual(mismatch.feed_order_hash,first.feed_order_hash);
 assert.equal(mismatch.restart_offset,0);
 const before=dbReads;
 const invalid=await ask('limit=1&offset=1&expected_order_hash=not-a-sha');
 assert.equal(invalid.status,400);
 assert.equal((await invalid.json()).error,'invalid_order_hash');
 assert.equal(dbReads,before,'invalid token must be rejected before D1 reads');
});


test('C-02 live Jordan court verdict stays a judicial event, not a military strike or a reported new death',()=>{
 const headlines=[
  article('court-aj','Al Jazeera','Jordan sentences three men to death by hanging after deadly church attack',
   'This is a breaking news story.',0),
  article('court-f24','France 24','Three sentenced to death over Jordan church attack',
   'A Jordanian court sentenced gunmen responsible for an earlier attack that killed nine people.',20),
  article('court-bbc','BBC Middle East','Three men sentenced to death in Jordan over fatal church mass shooting',
   'The attack killed nine and injured others last month.',40),
 ];
 for(const row of headlines){
  const a=analyze(row);
  assert.equal(a.topic,'governance','judicial sentencing must not inherit attack topic from background');
  assert.equal(a.claim_about_death,'not_reported','a death sentence is not a claim that people died today');
  assert.equal(a.policy,'candidate');
 }
 const output=group(headlines);
 assert.equal(output.held.length,0);
 assert.equal(output.groups.length,1,'three reports of a same court decision should still group');
 assert.equal(output.groups[0].members.length,3);
});

test('C-03 judicial verdict and actual lethal strike remain distinct despite same country and fatalities vocabulary',()=>{
 const verdict=article('verdict','BBC Middle East','Jordan court sentences three suspects to death over church attack',
  'Nine people were killed in an attack last month.',0);
 const violence=article('attack','Al Jazeera','Jordan military strikes militant targets after church attack',
  'An airstrike hit armed targets in retaliation for the attack.',5);
 const g=group([verdict,violence]);
 assert.equal(analyze(verdict).claim_about_death,'not_reported');
 assert.equal(g.groups.length,2);
});


test('C-06 filters whole event pool before sort, pagination, i18n and includes all member sources',async()=>{
 const sourceEvents=[
  {...events[0],event_id:'older',id:'older',topic:'strike',event_priority:10,last_seen_ms:when-4*86400000,
   sources_json:JSON.stringify([{source:'BBC Middle East',publisher:'bbc',published_ms:when-4*86400000}])},
  {...events[1],event_id:'matching',id:'matching',topic:'military',event_priority:8,verification_status:'multi_outlet_reporting',
   last_seen_ms:when+120000,sources_json:JSON.stringify([{source:'BBC Middle East',publisher:'bbc',published_ms:when+120000},{source:'Times of Israel',publisher:'toi',published_ms:when+120000}])},
  {...events[2],event_id:'other',id:'other',topic:'military',event_priority:9,verification_status:'single_origin_reporting',last_seen_ms:when-86400000,
   sources_json:JSON.stringify([{source:'Jerusalem Post / Israel',publisher:'jpost',published_ms:when-86400000}])}
 ];
 const db={prepare(sql){if(sql.includes("FROM regional_i18n WHERE kind=?"))return{bind(){return this},first:async()=>null};if(!sql.includes('FROM news_event_groups e JOIN news_items n'))throw Error('Unexpected database query');return{bind(){return this},all:async()=>({results:sourceEvents})}}};
 const query='source=Times%20of%20Israel&category=military&verification=multi_outlet_reporting&min_priority=8&from_ms='+when+'&to_ms='+(when+3600000)+'&sort=latest&limit=1';
 const results=[];
 for(const lang of ['ru','he']){
  const res=await readNewsEvents(new Request('https://rw.example/api/news?lang='+lang+'&'+query),{NEWS_DB:db});
  assert.equal(res.status,200);
  const body=await res.json();results.push(body);
  assert.deepEqual(body.articles.map(x=>x.event_id),['matching']);
  assert.equal(body.total_events,1);
  assert.equal(body.next_offset,null);
  assert.deepEqual(body.applied_filters,{sources:['Times of Israel'],categories:['military'],verifications:['multi_outlet_reporting'],min_priority:8,from_ms:when,to_ms:when+3600000});
 }
 assert.equal(results[0].feed_order_hash,results[1].feed_order_hash);
});

test('C-06 multiselect filtering returns deterministic page ranks and 409 on changed filter continuation',async()=>{
 const rows=events.map((event,i)=>({...event,topic:i===2?'military':'strike',source_count:1,sources_json:JSON.stringify([{source:i===2?'Jerusalem Post / Israel':'BBC Middle East',publisher:'other',published_ms:event.last_seen_ms}])}));
 const db={prepare(){return{bind(){return this},all:async()=>({results:rows})}}};
 const base='https://rw.example/api/news?lang=ru&source=BBC%20Middle%20East&source=Jerusalem%20Post%20%2F%20Israel&category=strike&category=military&limit=1&sort=latest';
 const p1=await(await readNewsEvents(new Request(base+'&offset=0'),{NEWS_DB:db})).json();
 assert.equal(p1.total_events,3);assert.equal(p1.articles[0].feed_rank,0);
 const p2=await readNewsEvents(new Request(base+'&offset=1&expected_order_hash='+p1.feed_order_hash),{NEWS_DB:db});
 assert.equal(p2.status,200);assert.equal((await p2.json()).articles[0].feed_rank,1);
 const changed=await readNewsEvents(new Request(base+'&offset=1&to_ms='+(when-2*86400000)+'&expected_order_hash='+p1.feed_order_hash),{NEWS_DB:db});
 assert.equal(changed.status,409);assert.equal((await changed.json()).error,'feed_changed');
});

test('C-06 rejects invalid ranges and filter values before touching D1',async()=>{
 const db={prepare(){throw Error('Rejected filter must not query DB')}};
 const invalid=['from_ms=yesterday','from_ms=2000000000000&to_ms=1000000000000','min_priority=11','category=%20','verification=not%20a%20slug','source=','source='+('a'.repeat(150))];
 for(const query of invalid){const res=await readNewsEvents(new Request('https://rw.example/api/news?'+query),{NEWS_DB:db});
  assert.equal(res.status,400,'Should reject '+query);assert.equal((await res.json()).error,'invalid_filters');}
});


test('C-02 weekly and daily multi-incident briefings stay out of the factual incident index',()=>{
 const roundup=article('brief','BBC Middle East',
  'Middle East weekly briefing: Israel and Iran military developments',
  'A weekly briefing with separate news from Gaza, Israel and Iran.',0);
 const result=group([roundup]);
 assert.equal(result.groups.length,0,'a roundup is not a single incident');
 assert.equal(result.held.length,1,'original remains available for review; do not delete raw news');
 assert.equal(result.held[0].type,'roundup');
});

test('C-03 current fatalities are not erased by unrelated historical context in a later sentence',()=>{
 const current=article('casualty','BBC Middle East',
  'Israeli strike hits Gaza neighbourhood',
  'Two people were killed in the attack today. Last week, another unrelated attack was reported.',0);
 const background=article('policy','Times of Israel',
  'Jordan blocks messaging platform over national security concerns',
  'The restriction follows last month\'s attack on a church that killed nine people.',0);
 assert.equal(analyze(current).claim_about_death,'reported_death');
 assert.equal(analyze(background).claim_about_death,'not_reported','historical death is context, not current policy casualties');
});
