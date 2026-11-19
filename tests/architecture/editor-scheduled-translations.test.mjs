import test from 'node:test';
import assert from 'node:assert/strict';
import {translateTitles,translateIDF} from '../../backend/editor/src/translations/scheduled.mjs';

const NOW=Date.parse('2026-11-16T00:00:00Z');
const makeDb=(handler)=>({
  prepare(sql){
    const statement=(args=[])=>({
      run:async()=>handler('run',sql,args),
      first:async()=>handler('first',sql,args),
      all:async()=>handler('all',sql,args),
      bind(...next){return statement(next)}
    });
    return statement();
  }
});

test('daily news budget cap prevents source reads and AI calls',async()=>{
  let ai=0,queries=0;
  const NEWS_DB=makeDb((method,sql)=>{
    queries++;
    if(method==='first'&&sql.includes('FROM news_translation_budget'))return{batches:288,estimated_neurons:0};
    if(method==='run'&&sql.includes('INSERT OR IGNORE INTO news_translation_budget'))return{meta:{changes:0}};
    throw Error('Unexpected query after news budget cap: '+sql);
  });
  const result=await translateTitles({NEWS_DB,AI:{run:async()=>{ai++;return null}}},NOW);
  assert.deepEqual(result,{translated:0,summaries:0,budget:'limit'});
  assert.equal(ai,0);
  assert.equal(queries,2);
});

test('sponsored-only pending list does not reserve AI budget',async()=>{
  const sqls=[];
  const NEWS_DB=makeDb((method,sql)=>{
    sqls.push(sql);
    if(method==='first')return{batches:0,estimated_neurons:0};
    if(method==='all')return{results:[{id:'s',headline:'Sponsored content for fashion week',summary:'Paid advertisement'}]};
    if(method==='run')return{meta:{changes:1}};
    throw Error('Unexpected method: '+method);
  });
  const result=await translateTitles({NEWS_DB,AI:{run:async()=>{throw Error('must not use AI')}}},NOW);
  assert.deepEqual(result,{translated:0,summaries:0});
  assert.ok(!sqls.some(x=>x.includes('batches=batches+1')),'no budget charged when no valid candidates');
});

test('malformed AI translation records existing editor_state error without publication',async()=>{
  const sqls=[];
  const NEWS_DB=makeDb((method,sql)=>{
    sqls.push(sql);
    if(method==='first')return{batches:0,estimated_neurons:0};
    if(method==='all')return{results:[{id:'a',headline:'Israel issues security update',summary:'Official sources described security measures',headline_ru:null}]};
    if(method==='run')return{meta:{changes:1}};
    throw Error('Unexpected query: '+sql);
  });
  const result=await translateTitles({NEWS_DB,AI:{run:async()=>({response:'malformed AI output'})}},NOW);
  assert.deepEqual(result,{translated:0,summaries:0,error:true});
  assert.ok(sqls.some(x=>x.includes('last_translation_error')));
  assert.ok(!sqls.some(x=>x.includes('UPDATE news_items SET headline_ru')));
});

test('valid news translation writes existing row and reconciles neuron estimate',async()=>{
  const sqls=[],prepared=[];
  const NEWS_DB=makeDb((method,sql,args)=>{
    sqls.push(sql);prepared.push(args);
    if(method==='first')return{batches:0,estimated_neurons:0};
    if(method==='all')return{results:[{id:'a',headline:'Israel and Iran release official statement',summary:'Official statement about regional security',headline_ru:null}]};
    if(method==='run')return{meta:{changes:1}};
    throw Error('Unexpected query: '+sql);
  });
  const out={response:JSON.stringify([{id:'a',title_ru:'Израиль и Иран выпустили официальное заявление',summary_ru:'Официальное заявление о региональной безопасности'}]),usage:{neurons:146}};
  const result=await translateTitles({NEWS_DB,AI:{run:async(model,request)=>{
    assert.equal(model,'@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    assert.equal(request.temperature,0.1);
    return out;
  }}},NOW);
  assert.deepEqual(result,{translated:1,summaries:1,neurons:146});
  const index=sqls.findIndex(x=>x.includes('UPDATE news_items SET headline_ru'));
  assert.ok(index>=0,'accepted translation persists via guarded COALESCE');
  assert.equal(prepared[index][2],'a');
  assert.ok(sqls.some(x=>x.includes('estimated_neurons=MAX(0,estimated_neurons+?)')));
});

test('IDF translation rejects missing core database and keeps its independent daily cap',async()=>{
  let reads=0,ai=0;
  const NEWS_DB=makeDb((method,sql)=>{
    reads++;
    if(method==='run'&&sql.includes('INSERT OR IGNORE INTO official_translation_budget'))return{meta:{changes:1}};
    if(method==='first'&&sql.includes('FROM official_translation_budget'))return{batches:24,estimated_neurons:0};
    throw Error('Unexpected IDF budget request: '+sql);
  });
  const env={NEWS_DB,AI:{run:async()=>{ai++;return null}}};
  assert.deepEqual(await translateIDF(env,NOW),{translated:0,error:'core database binding missing'});
  assert.equal(reads,0);
  const withCore={...env,CORE_DB:makeDb(()=>{throw Error('should not inspect source at budget cap')})};
  assert.deepEqual(await translateIDF(withCore,NOW),{translated:0,budget:'limit'});
  assert.equal(ai,0);
  assert.equal(reads,2);
});

test('IDF schedules only canonical Telegram source and writes accepted translation once',async()=>{
  const nowIso=new Date(NOW-3600_000).toISOString(),writes=[];
  const CORE_DB=makeDb((method,sql)=>{
    if(method==='all'&&sql.includes('FROM observations'))return{results:[
      {payload:JSON.stringify({url:'https://fake.example/idf',title:'Wrong source',excerpt:'Long message and other facts about army operations and regional security',published_at:nowIso})},
      {payload:JSON.stringify({url:'https://t.me/idfofficial/123',title:'IDF security update',excerpt:'Military officials announced a security update and provided details for public information today.',published_at:nowIso})}
    ]};
    throw Error('Unexpected CORE query: '+sql);
  });
  const NEWS_DB=makeDb((method,sql,args)=>{
    if(method==='first'&&sql.includes('FROM official_translation_budget'))return{batches:0,estimated_neurons:0};
    if(method==='first'&&sql.includes('FROM official_translations'))return null;
    if(method==='run'){writes.push({sql,args});return{meta:{changes:1}}}
    throw Error('Unexpected NEWS query: '+sql);
  });
  let aiCalls=0;
  const env={CORE_DB,NEWS_DB,AI:{run:async(_model,prompt)=>{
    aiCalls++;
    const payload=JSON.parse(prompt.messages[1].content);
    assert.equal(payload.length,1);
    assert.equal(payload[0].url,'https://t.me/idfofficial/123');
    return{response:JSON.stringify([{url:payload[0].url,title_ru:'ЦАХАЛ сообщил об обновлении ситуации',excerpt_ru:'Военные представители опубликовали сообщение с подробностями для общественности сегодня.'}]),usage:{neurons:150}};
  }}};
  assert.deepEqual(await translateIDF(env,NOW),{translated:1});
  assert.equal(aiCalls,1);
  assert.equal(writes.filter(w=>w.sql.includes('INSERT OR IGNORE INTO official_translations')).length,1);
  assert.ok(writes.some(w=>w.sql.includes('estimated_neurons=MAX(0,estimated_neurons+?)')));
});

test('Q3: an item every provider answered badly is recorded and not re-sent today',async()=>{
  const runs=[];let select=null;
  const NEWS_DB=makeDb((method,sql,args)=>{
    if(method==='first')return{batches:0,estimated_neurons:0};
    if(method==='all'){select={sql,args};return{results:[
      {id:'bad',headline:'Israel and Iran release official statement',summary:'',headline_ru:null},
      {id:'lost',headline:'IDF strikes in Lebanon',summary:'',headline_ru:null}]};}
    if(method==='run'){runs.push({sql,args});return{meta:{changes:1}};}
    throw Error('Unexpected query: '+sql);
  });
  // 'bad' comes back in Latin script (quality gate), 'lost' is missing from the answer.
  const out={response:JSON.stringify([{id:'bad',title_ru:'Israel and Iran release official statement'}]),usage:{neurons:90}};
  const result=await translateTitles({NEWS_DB,AI:{run:async()=>out}},NOW);
  assert.equal(result.translated,0);
  assert.match(select.sql,/NOT IN \(SELECT a\.item_id FROM news_ru_attempts a WHERE a\.day_utc=\? AND a\.model=\?\)/);
  assert.deepEqual(select.args.slice(2),['2026-11-16','ru_titles_chain']);
  const rec=runs.filter(r=>r.sql.includes('INTO news_ru_attempts')).map(r=>[r.args[0],r.args[3]]);
  assert.deepEqual(rec.sort(),[['bad','quality_gate'],['lost','missing_in_output']]);
});

test('Q3: a whole-call failure (malformed JSON) stays retryable, nothing recorded per item',async()=>{
  const runs=[];
  const NEWS_DB=makeDb((method,sql,args)=>{
    if(method==='first')return{batches:0,estimated_neurons:0};
    if(method==='all')return{results:[{id:'a',headline:'Israel issues security update',summary:'',headline_ru:null}]};
    if(method==='run'){runs.push(sql);return{meta:{changes:1}};}
    throw Error('Unexpected query: '+sql);
  });
  await translateTitles({NEWS_DB,AI:{run:async()=>({response:'not json'})}},NOW);
  assert.ok(!runs.some(s=>s.includes('INTO news_ru_attempts')));
});

test('19.11: RU goes Gemini first; items Gemini fails go to llama in the same tick, per item',async()=>{
  const writes=[];
  const NEWS_DB=makeDb((method,sql,args)=>{
    if(method==='first')return null;
    if(method==='all')return{results:[
      {id:'g',headline:'Israel and Iran release official statement',summary:'',headline_ru:null},
      {id:'l',headline:'Hamas officials meet in Cairo',summary:'',headline_ru:null}]};
    if(method==='run'){if(sql.includes('UPDATE news_items SET headline_ru'))writes.push(args);return{meta:{changes:1}};}
    throw Error('Unexpected query: '+sql);
  });
  // Budget row: batches 0 (first() for the budget select returns {batches:0}).
  NEWS_DB.prepare=(orig=>sql=>sql.startsWith('SELECT batches')?{bind:()=>({first:async()=>({batches:0,estimated_neurons:0})})}:orig(sql))(NEWS_DB.prepare);
  const realFetch=globalThis.fetch;
  globalThis.fetch=async url=>String(url).includes(':generateContent')
    ? Response.json({candidates:[{content:{parts:[{text:JSON.stringify([{id:'g',title_ru:'Израиль и Иран выпустили официальное заявление'},{id:'l',title_ru:'Hamas officials meet in Cairo'}])}]},finishReason:'STOP'}]})
    : Response.json({models:[{name:'models/gemini-3.5-flash-lite',supportedGenerationMethods:['generateContent']}]});
  const aiCalls=[];
  try{
    const result=await translateTitles({NEWS_DB,GEMINI_API_KEY:'K',AI:{run:async(model,req)=>{aiCalls.push(JSON.parse(req.messages[1].content).map(x=>x.id));
      return{response:JSON.stringify([{id:'l',title_ru:'Представители ХАМАС встретились в Каире'}]),usage:{neurons:40}};}}},NOW);
    assert.equal(result.translated,2);
    assert.equal(result.neurons,40,'only the llama fallback spends Workers AI neurons');
  }finally{globalThis.fetch=realFetch;}
  assert.deepEqual(aiCalls,[['l']],'llama gets only the item Gemini failed');
  assert.deepEqual(writes.map(a=>a[2]).sort(),['g','l']);
});
