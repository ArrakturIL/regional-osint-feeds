import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleData,dataFromD1} from '../../backend/pages/src/api/data.js';
const at=1794679980000,now=1794680000000,future='2026-12-01T04:59:00Z',past='2026-11-08T20:29:00Z';
const row=(market_id,observed_at,price,volume,ends_at=future)=>({observed_at,payload:JSON.stringify({market_id,question:'Market '+market_id,outcome_prices:[price,1-price],volume_24h:volume,liquidity:70,ends_at,url:'https://polymarket.com/event/'+market_id})});
test('market snapshots are deduplicated, ordered, and expired markets excluded',()=>{
 const m=assembleData({nowMs:now,marketRows:[row('A',at-21600000,.05,40),row('A',at,.03,100),row('B',at,.4,20),row('OLD',at,.2,200,past),row('BAD',at,.3,90,'garbage')]}).markets;
 assert.deepEqual(m.map(x=>x.id),['A','B']);
 assert.equal(m[0].changePoints,-2);
 assert.equal(m[0].comparisonFrom,new Date(at-21600000).toISOString());
 assert.equal(m[0].asOf,new Date(at).toISOString());
 assert.equal(m[1].changePoints,null);
 assert.equal(m[0].end,future);
});
test('official statements preserve original source and timestamps without false freshness',()=>{
 const rows=[
  {source:'idf_official',observed_at:at,payload:JSON.stringify({url:'https://t.me/idfofficial/1',title:'IDF statement',excerpt:'Source text',published_at:'2026-11-13T14:28:02+00:00'})},
  {source:'marad_official',observed_at:at,payload:JSON.stringify({url:'https://www.maritime.dot.gov/x',title:'Advisory',advisory_id:'2026-013',status:'active',published_at:null,caveat:'Publication time unknown'})},
  {source:'centcom_dvids',observed_at:at,payload:JSON.stringify({url:'https://www.dvidshub.net/news/1',title:'News item',published_at:'2026-11-11T10:00:00Z',caveat:'Official feed'})}
 ];
 const d=assembleData({nowMs:now,officialRows:rows,sceneRows:[{payload:JSON.stringify({scene_id:'S2',area:'red_sea',acquired_at:'2026-11-14T07:00:00Z',cloud_cover_percent:null,item_url:'https://earth-search.aws.element84.com/item/1'})}]});
 assert.deepEqual(Object.keys(d),['generatedAt','markets','home','airbridge','aviationSamples','providerLimits','satelliteScenes','marad','centcom','alt','sources']);
 assert.equal(d.home[0].active,false);assert.equal(d.home[0].description,'Source text');
 assert.equal(d.marad[0].published,null);assert.equal(d.marad[0].active,true);
 assert.equal(d.centcom[0].url,'https://www.dvidshub.net/news/1');
 assert.equal(d.satelliteScenes[0].cloudCover,null);
});
test('corrupt or unsafe market links cannot enter the active feed',()=>{
 const a=row('A',at,.5,100);
 const x=JSON.parse(a.payload);x.url='http://phishing.test/event/1';a.payload=JSON.stringify(x);
 assert.equal(assembleData({marketRows:[a],nowMs:now}).markets.length,0);
});
test('read-only D1 API uses canonical sources and never mutates database',async()=>{
 const sql=[],db={prepare(q){sql.push(q);return {sql:q}},async batch(){return [{results:[row('A',at,.3,15)]},{results:[]},{results:[]},{results:[{source:'ais',state:'ok',attempted_at:at,succeeded_at:at,detail:null}]}]}};
 const d=await dataFromD1({DB:db},now);
 assert.equal(sql.length,4);assert.equal(d.markets.length,1);
 assert.equal(d.sources[0].id,'ais');assert.equal(d.sources[0].label,'AIS');
 for(const s of sql)assert.ok(s.trim().startsWith('SELECT')||s.trim().startsWith('WITH'));
});
