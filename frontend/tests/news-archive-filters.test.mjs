import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../src/components/NewsArchive/NewsArchive.js',import.meta.url),'utf8')
 .replace(/^import\s+[^\n]+\n/gm,'')
 .replace(/^export\s+(?=(?:function|const)\s)/gm,'');
function helpers(){
 const ctx={URLSearchParams,Date,RangeError,Error,Number,String,Array,Object,Set};
 return vm.runInNewContext(src+
 '\n({rwArchiveRequest,rwArchiveRange,rwArchiveValidatePayload})',ctx,{filename:'NewsArchive.js'});
}

test('C-06 actual archive request includes all applied filters and exact stable continuation hash',()=>{
 const {rwArchiveRequest}=helpers();
 const q=rwArchiveRequest({language:'he',page:2,pageSize:12,sort:'priority',source:'Times of Israel',
  category:'military',verification:'multi_outlet_reporting',minPriority:'7',
  fromMs:1794873600000,toMs:1794959999999,
  expectedHash:'a'.repeat(64)});
 const url=new URL(q,'https://rw.test');
 assert.equal(url.pathname,'/api/news');
 assert.deepEqual([...url.searchParams.entries()],[
  ['lang','he'],['limit','12'],['offset','12'],['sort','priority'],
  ['source','Times of Israel'],['category','military'],
  ['verification','multi_outlet_reporting'],['min_priority','7'],
  ['from_ms','1794873600000'],['to_ms','1794959999999'],
  ['expected_order_hash','a'.repeat(64)]
 ]);
});

test('C-06 first page omits stale hash; reset leaves no phantom filters',()=>{
 const {rwArchiveRequest}=helpers();
 const q=rwArchiveRequest({language:'ru',page:1,pageSize:12,sort:'latest',expectedHash:'b'.repeat(64)});
 const url=new URL(q,'https://rw.test');
 assert.equal(url.searchParams.get('expected_order_hash'),null);
 assert.equal(url.searchParams.get('offset'),'0');
 assert.equal(url.searchParams.get('category'),null);
 assert.equal(url.searchParams.get('min_priority'),null);
 assert.equal(url.searchParams.get('sort'),'latest');
});

test('C-06 stable relative ranges and inclusive UTC calendar dates',()=>{
 const {rwArchiveRange}=helpers();
 const t=Date.parse('2026-11-17T12:00:00Z');
 assert.deepEqual(JSON.parse(JSON.stringify(rwArchiveRange({period:'24h'},t))),
  {fromMs:t-86400000,toMs:null});
 assert.deepEqual(JSON.parse(JSON.stringify(rwArchiveRange({period:'custom',fromDate:'2026-11-16',toDate:'2026-11-17'},t))),
  {fromMs:Date.parse('2026-11-16T00:00:00Z'),toMs:Date.parse('2026-11-18T00:00:00Z')-1});
 assert.deepEqual(JSON.parse(JSON.stringify(rwArchiveRange({period:'all'},t))),{fromMs:null,toMs:null});
 assert.throws(()=>rwArchiveRange({period:'custom',fromDate:'2026-11-17',toDate:'2026-11-15'},t),RangeError);
});

test('F-07 rejects malformed body or wrong locale instead of showing stale/mixed pages',()=>{
 const {rwArchiveValidatePayload}=helpers();
 const hash='f'.repeat(64);
 const valid={requested_language:'ru',total_events:3,articles:[{event_id:'evt_1',feed_rank:0}],
  feed_order_hash:hash,offset:0,next_offset:1};
 assert.equal(rwArchiveValidatePayload(valid,'ru',0,1).feed_order_hash,hash);
 assert.throws(()=>rwArchiveValidatePayload({...valid,requested_language:'he'},'ru',0,1),/Invalid/);
 assert.throws(()=>rwArchiveValidatePayload({...valid,articles:[{event_id:'evt_1',feed_rank:5}]},'ru',0,1),/Invalid/);
 assert.throws(()=>rwArchiveValidatePayload({...valid,feed_order_hash:''},'ru',0,1),/Invalid/);
 assert.throws(()=>rwArchiveValidatePayload({...valid,offset:12},'ru',0,1),/Invalid/);
});
