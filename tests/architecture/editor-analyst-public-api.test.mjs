import test from 'node:test';
import assert from 'node:assert/strict';
import {readApi} from '../../backend/editor/src/analysts/public-api.mjs';
import analystService,{testHooks} from '../../backend/editor/src/analysts/editor.mjs';

const EDITOR_VERSION='analyst-editor-v1.1.2-translation';
const request=(path,method='GET')=>new Request('https://regional-watch.pages.dev'+path,{method});
function makeDb({health=null,analysts=[],posts=[]}={}){
 const calls=[];
 const db={
   prepare(sql){
     return{
       async first(){
         calls.push({sql,method:'first',args:[]});
         if(sql.includes('FROM analyst_runs'))return health;
         throw Error('Unexpected SQL '+sql);
       },
       bind(...args){
         return{
           async all(){
             calls.push({sql,args,method:'all'});
             if(sql.includes('FROM analyst_publications'))return{results:posts};
             throw Error('Unexpected SQL '+sql);
           }
         };
       },
       async all(){
         calls.push({sql,method:'all',args:[]});
         if(sql.includes('FROM analysts'))return{results:analysts};
         if(sql.includes('FROM analyst_publications'))return{results:posts};
         throw Error('Unexpected SQL '+sql);
       }
     };
   }
 };
 return{env:{DB:db},calls};
}


test('health returns last run with same version and CORS; delegation is equivalent',async()=>{
 const last={started_at_ms:123,completed_at_ms:345,status:'partial',stats_json:'{"pending_count":3}',error_message:'mirror_fetch_failed'};
 const x=makeDb({health:last});
 const a=await readApi(request('/health'),x.env,EDITOR_VERSION);
 const b=await analystService.fetch(request('/health'),x.env);
 assert.deepEqual(await a.json(),await b.json());
 assert.equal(b.status,200);
 assert.equal(b.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal(b.headers.get('Cache-Control'),'public, max-age=120');
 const c=makeDb();
 const empty=await readApi(request('/health'),c.env,EDITOR_VERSION);
 assert.equal((await empty.json()).last,null);
});

test('public analyst directory queries only enabled profiles in original display-name order',async()=>{
 const f=makeDb({analysts:[
   {id:'a',display_name:'Первый',description:'Аналитик'},
   {id:'b',display_name:'Второй',description:'Исследователь'}
 ]});
 const res=await analystService.fetch(request('/api/analysts'),f.env);
 const x=await res.json();
 assert.deepEqual(x.analysts.map(x=>x.id),['a','b']);
 assert.equal(x.analysts[1].description,'Исследователь');
 assert.match(f.calls[0].sql,/SELECT id,display_name,description FROM analysts WHERE enabled=1 ORDER BY display_name/);
 assert.equal(f.calls[0].method,'all');
});

test('public analyst posts preserve status, exact provenance and bounded pagination SQL',async()=>{
 const post={
 id:'analyst-report-77',headline:'Аналитик объясняет прогноз',summary:'Заявление автора',
 short_quote:'',original_url:'https://example.org/post/77',original_published_at_ms:1000,
 published_at_ms:2000,source_type:'telegram_post',fact_check_status:'author_claim_not_independently_verified',
 authorship_status:'verified_original_channel',importance_score:72,status:'published',
 version:1,editor_version:EDITOR_VERSION,analyst:'Автор',original_language:'ru'
 };
 const f=makeDb({posts:[post]});
 const res=await readApi(request('/api/analyst-posts?limit=999&offset=99999'),f.env,EDITOR_VERSION);
 const x=await res.json();
 assert.deepEqual(x.posts,[post]);
 assert.match(x.disclaimer,/Attributed analyst interpretations/);
 assert.deepEqual(f.calls[0].args,[40,2000]);
 assert.match(f.calls[0].sql,/p\.status IN \('published','corrected'\)/);
 assert.match(f.calls[0].sql,/ORDER BY p\.published_at_ms DESC,p\.id DESC LIMIT \? OFFSET \?/);
 const normal=makeDb({posts:[post]});
 const result=await analystService.fetch(request('/api/analyst-posts'),normal.env);
 assert.equal((await result.json()).posts[0].original_url,post.original_url);
 assert.deepEqual(normal.calls[0].args,[20,0]);
});

test('post detail returns single row, rejects missing ID and excludes unpublished',async()=>{
 const f=makeDb({posts:[{id:'analyst-report-77',headline:'Заголовок',original_url:'https://example.org/source'}]});
 const res=await readApi(request('/api/analyst-posts/analyst-report-77'),f.env,EDITOR_VERSION);
 const body=await res.json();
 assert.equal(body.id,'analyst-report-77');
 assert.equal(body.posts,undefined);
 assert.deepEqual(f.calls[0].args,['analyst-report-77']);
 assert.match(f.calls[0].sql,/p\.id=\? AND p\.status IN \('published','corrected'\)/);
 const missing=makeDb();
 const notFound=await analystService.fetch(request('/api/analyst-posts/not-here'),missing.env);
 assert.equal(notFound.status,404);
 assert.deepEqual(await notFound.json(),{error:'not_found'});
});

test('read-only method and unmatched route never hit D1',async()=>{
 const f=makeDb();
 const invalid=await analystService.fetch(request('/api/analyst-posts','POST'),f.env);
 assert.equal(invalid.status,405);
 assert.deepEqual(await invalid.json(),{error:'read_only'});
 const unknown=await readApi(request('/api/unknown'),f.env,EDITOR_VERSION);
 assert.equal(unknown.status,404);
 assert.deepEqual(await unknown.json(),{error:'not_found'});
 assert.equal(f.calls.length,0);
});
