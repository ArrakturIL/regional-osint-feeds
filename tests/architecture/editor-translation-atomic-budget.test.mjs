import test from 'node:test';
import assert from 'node:assert/strict';
import {translateTitles,translateIDF} from '../../backend/editor/src/translations/scheduled.mjs';

const NOW=Date.parse('2026-11-17T03:00:00Z');
function db(handler){
 return{prepare(sql){
  const query=(args=[])=>({
   bind(...values){return query(values);},
   run(){return handler('run',sql,args);},
   first(){return handler('first',sql,args);},
   all(){return handler('all',sql,args);}
  });
  return query();
 }};
}

test('overlapping RU batches share a single atomic 20th budget slot',async()=>{
 let batches=19,aiCalls=0;
 const NEWS_DB=db((method,sql)=>{
  if(method==='first'&&sql.includes('FROM news_translation_budget'))
   return{batches:19,estimated_neurons:0}; // Both schedulers saw the same pre-reservation snapshot.
  if(method==='all'&&sql.includes('FROM news_items'))
   return{results:[{id:'race-news',headline:'Israel and Iran release official statement',
      summary:'Officials shared a regional security statement.',headline_ru:null}]};
  if(method==='run'&&sql.includes('UPDATE news_translation_budget SET batches=')){
   // Emulate SQLite's affected-row semantics for an atomic guarded UPDATE.
   const guarded=/AND\\s+batches\\s*<\\s*20\\b/i.test(sql)&&/AND\\s+estimated_neurons\\s*<\\s*2500\\b/i.test(sql);
   if(guarded&&batches>=20)return{meta:{changes:0}};
   batches++;return{meta:{changes:1}};
  }
  if(method==='run')return{meta:{changes:1}};
  throw Error('Unexpected NEWS SQL: '+sql);
 });
 const env={NEWS_DB,AI:{async run(){
  aiCalls++;
  return{response:JSON.stringify([{id:'race-news',
   title_ru:'Израиль и Иран выпустили официальное заявление',
   summary_ru:'Официальные представители поделились заявлением о безопасности региона.'}]),usage:{neurons:120}};
 }}};
 const results=await Promise.all([translateTitles(env,NOW),translateTitles(env,NOW)]);
 assert.equal(aiCalls,1,'never send the 21st RU batch to Workers AI');
 assert.equal(batches,20,'cannot exceed the daily RU batch cap');
 assert.equal(results.filter(x=>x.budget==='limit').length,1);
 assert.equal(results.filter(x=>x.translated===1).length,1);
});

test('overlapping IDF batches share a single atomic 12th budget slot',async()=>{
 let batches=11,aiCalls=0;
 const published_at=new Date(NOW-3600000).toISOString();
 const CORE_DB=db((method,sql)=>{
  if(method==='all'&&sql.includes('FROM observations'))return{results:[{payload:JSON.stringify({
   url:'https://t.me/idfofficial/12345',title:'IDF safety update',
   excerpt:'The IDF published a safety update regarding current regional circumstances and public alerts.',
   published_at})}]};
  throw Error('Unexpected CORE SQL: '+sql);
 });
 const NEWS_DB=db((method,sql)=>{
  if(method==='first'&&sql.includes('FROM official_translation_budget'))
   return{batches:11,estimated_neurons:0};
  if(method==='first'&&sql.includes('FROM official_translations'))return null;
  if(method==='run'&&sql.includes('UPDATE official_translation_budget SET batches=')){
   const guarded=/AND\\s+batches\\s*<\\s*12\\b/i.test(sql)&&/AND\\s+estimated_neurons\\s*<\\s*1500\\b/i.test(sql);
   if(guarded&&batches>=12)return{meta:{changes:0}};
   batches++;return{meta:{changes:1}};
  }
  if(method==='run')return{meta:{changes:1}};
  throw Error('Unexpected NEWS SQL: '+sql);
 });
 const env={NEWS_DB,CORE_DB,AI:{async run(){
  aiCalls++;
  return{response:JSON.stringify([{url:'https://t.me/idfofficial/12345',
   title_ru:'ЦАХАЛ опубликовал обновление по безопасности',
   excerpt_ru:'ЦАХАЛ опубликовал сообщение о ситуации и предупреждениях для населения.'}]),usage:{neurons:130}};
 }}};
 const results=await Promise.all([translateIDF(env,NOW),translateIDF(env,NOW)]);
 assert.equal(aiCalls,1,'never send the 13th IDF batch to Workers AI');
 assert.equal(batches,12,'cannot exceed the daily IDF batch cap');
 assert.equal(results.filter(x=>x.budget==='limit').length,1);
 assert.equal(results.filter(x=>x.translated===1).length,1);
});
