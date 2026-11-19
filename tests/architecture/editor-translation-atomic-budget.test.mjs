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

test('overlapping IDF batches share a single atomic last (24th) budget slot',async()=>{
 let batches=23,aiCalls=0;
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
   return{batches:23,estimated_neurons:0};
  if(method==='first'&&sql.includes('FROM official_translations'))return null;
  if(method==='run'&&sql.includes('UPDATE official_translation_budget SET batches=')){
   const guarded=/AND\s+batches\s*<\s*24\b/i.test(sql)&&/AND\s+estimated_neurons\s*<\s*3000\b/i.test(sql);
   if(guarded&&batches>=24)return{meta:{changes:0}};
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
 assert.equal(aiCalls,1,'never send the 25th IDF batch to Workers AI');
 assert.equal(batches,24,'cannot exceed the daily IDF batch cap');
 assert.equal(results.filter(x=>x.budget==='limit').length,1);
 assert.equal(results.filter(x=>x.translated===1).length,1);
});
