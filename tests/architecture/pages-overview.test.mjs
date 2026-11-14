import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleOverview,overviewFromD1} from '../../backend/pages/src/api/overview.js';
const timestamp=1794689958000;
const fixtureEvents=[{event_id:'first',updated_at_ms:timestamp,payload:JSON.stringify({title_ru:'Заявление',summary_ru:'Независимого подтверждения нет'})},{event_id:'second',updated_at_ms:timestamp-2000,payload:'not-json'}];
const fixtureSources=[{source:'adsb',attempted_at:timestamp,succeeded_at:timestamp,state:'partial',detail:'Coverage is limited'},{source:'ais',attempted_at:timestamp,succeeded_at:timestamp,state:'ok',detail:null},{source:'centcom',attempted_at:timestamp,succeeded_at:null,state:'retired',detail:'obsolete'},{source:'ioda',attempted_at:timestamp,succeeded_at:null,state:'empty',detail:null}];
test('normal response preserves all API fields and does not call empty data risk-free',()=>{
 const v=assembleOverview({latestRun:{outcome:'no_alert',recorded_at_ms:timestamp},eventRows:fixtureEvents,statusRows:fixtureSources,nowMs:timestamp});
 assert.deepEqual(Object.keys(v),['generatedAt','analysis','events','sources','available','total']);
 assert.equal(v.analysis.state,'normal');
 assert.equal(v.analysis.badge,'БЕЗ НОВЫХ ПРЕДУПРЕЖДЕНИЙ');
 assert.equal(v.events[0].description,'Независимого подтверждения нет');
 assert.equal(v.events[1].title,'Событие');
 assert.equal(v.events[1].description,'');
 assert.equal(v.total,3);assert.equal(v.available,2);
 assert.equal(v.sources.find(x=>x.id==='adsb').label,'ADS-B');
 assert.equal(v.sources.find(x=>x.id==='ioda').state,'empty');
 assert.equal(v.generatedAt,new Date(timestamp).toISOString());
});
test('alert state requires attention, not a false all-clear',()=>{
 const v=assembleOverview({latestRun:{outcome:'alert',recorded_at_ms:timestamp},eventRows:fixtureEvents});
 assert.equal(v.analysis.state,'attention');assert.equal(v.analysis.badge,'ТРЕБУЕТ ВНИМАНИЯ');
 assert.ok(v.analysis.description.includes('Не все сведения подтверждены'));
});
test('missing monitoring outcome never produces false reassurance',()=>{
 const v=assembleOverview({latestRun:null,statusRows:[{source:'test',state:'unknown',attempted_at:null}]});
 assert.equal(v.analysis.state,'unknown');assert.equal(v.analysis.time,null);assert.equal(v.available,0);
});
test('D1 read-only aggregator uses three existing production tables',async()=>{
 const seen=[],db={prepare(sql){seen.push(sql);return {sql}},async batch(queries){return [
  {results:[{outcome:'alert',recorded_at_ms:timestamp}]},
  {results:fixtureEvents},
  {results:fixtureSources}
 ]}};
 const v=await overviewFromD1({DB:db},timestamp);
 assert.equal(seen.length,3);
 assert.deepEqual(seen.map(x=>x.split(' FROM ')[1].split(' ')[0]),['monitor_runs','monitor_events','source_status']);
 assert.equal(v.analysis.state,'attention');assert.equal(v.total,3);
});
