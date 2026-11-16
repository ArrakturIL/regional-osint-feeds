import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {reconstructReaderFacade} from './localization-source-parity.mjs';
import {readLocalizedAnalysts} from '../../backend/editor/src/localization/analyst-api.mjs';
import {localized,respond,HEADERS} from '../../backend/editor/src/localization/read-core.mjs';
import {sourceText,fingerprint} from '../../backend/editor/src/localization/shared.mjs';
import localization from '../../backend/editor/src/localization/localization.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

test('new public reader and analyst modules reconstruct the exact pre-split Git blob',()=>{
 const source=Buffer.from(reconstructReaderFacade(),'utf8');
 const blob=createHash('sha1')
   .update(Buffer.from('blob '+source.length,'utf8'))
   .update(Buffer.from([0])).update(source).digest('hex');
 assert.equal(blob,'4e7346b0463edd2a71a8998b121afb604609ae6f',
  'all original response headers, SQL, cached attribution, errors, translation labels and counters remain lossless');
});

const url=(path,lang)=>new Request('https://regional-watch.pages.dev'+path+'?lang='+lang);
function fixture({data,language='ru',cache=[],upstreamStatus=200}={}){
 const calls=[];
 const db={prepare(sql){
   const statement=(args=[])=>({
     bind(...next){return statement(next);},
     async all(){
       calls.push({sql,args,method:'all'});
       if(!sql.includes('FROM regional_i18n'))throw Error('unexpected SQL '+sql);
       return {results:cache};
     },
     async first(){
       calls.push({sql,args,method:'first'});
       if(!sql.includes('FROM regional_i18n'))throw Error('unexpected SQL '+sql);
       return null;
     }
   });
   return statement();
 }};
 const upstream=[];
 const analystService={async fetch(request,bindings){
   upstream.push({method:request.method,path:new URL(request.url).pathname,bindings});
   return Response.json(data,{status:upstreamStatus,headers:{'X-Editor-Source':'analysts'}});
 }};
 return {env:{CORE_DB:db,NEWS_DB:db,AI:{id:'fakeAI'}},calls,upstream,analystService};
}
test('shared analyst response helper retains exact read-only CORS headers',()=>{
 const response=respond({message:'ok'});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
 assert.equal(response.headers.get('Cache-Control'),'public,max-age=60');
 assert.equal(HEADERS['X-Content-Type-Options'],'nosniff');
});

test('Russian analyst profiles preserve original text, source attribution and translation UI contract',async()=>{
 const item={id:'vera',display_name:'Вера Коваленко',description:'Аналитик и журналист',original_language:'ru',enabled:1};
 const f=fixture({data:{analysts:[item]}});
 const request=url('/api/analysts','ru');
 const result=await readLocalizedAnalysts(request,f.env,f.analystService,'ru','/api/analysts');
 assert.equal(result.status,200);
 const body=await result.json();
 assert.equal(body.requested_language,'ru');
 assert.equal(body.analysts.length,1);
 const v=body.analysts[0];
 assert.equal(v.display_name,item.display_name);
 assert.equal(v.description,item.description);
 assert.equal(v.translation_state,'original');
 assert.equal(v.translation_status,'source');
 assert.equal(v.translation_available,true);
 assert.equal(v.translation.source_language,'ru');
 assert.equal(v.translation.label,'Оригинал');
 assert.deepEqual(f.upstream.map(x=>x.path),['/api/analysts']);
 assert.deepEqual(f.calls.filter(x=>x.method==='all').map(x=>x.args),[['profile','vera']],
   'one bulk prefetch is preserved even for Russian');
});

test('Hebrew cached analyst posts preserve source hash, quote and exact translation counters',async()=>{
 const item={id:'post-1',headline:'Обсуждение безопасности',summary:'Анализ ситуации',short_quote:'Проверка источников',original_language:'ru'};
 const original=sourceText('analyst',item),hash=await fingerprint(original);
 const cache=[{item_id:item.id,source_hash:hash,title:'דיון בנושא ביטחון',
  body:'ניתוח המצב',commentary:'בדיקת מקורות',quality_score:96}];
 const f=fixture({data:{posts:[item]},cache});
 const res=await localization.fetch(url('/api/analyst-posts','he'),f.env,f.analystService);
 const x=await res.json();
 assert.equal(res.status,200);
 assert.equal(x.requested_language,'he');
 assert.equal(x.post_count,1);
 assert.equal(x.localized_count,1);
 assert.deepEqual(x.translation_summary,{available:1,pending:0,needs_review:0,original:0,translated:1});
 assert.equal(x.posts[0].headline,cache[0].title);
 assert.equal(x.posts[0].summary,cache[0].body);
 assert.equal(x.posts[0].short_quote,cache[0].commentary);
 assert.equal(x.posts[0].translation_state,'translated');
 assert.equal(x.posts[0].translation.source_language,'ru');
 assert.equal(f.calls.filter(x=>x.method==='all').length,1,'one D1 IN query, no per-post lookup');
});

test('stale Hebrew cache is pending; never sold as complete translated text',async()=>{
 const item={id:'post-2',headline:'Обсуждение безопасности',summary:'Анализ ситуации',short_quote:'',original_language:'ru'};
 const f=fixture({data:{posts:[item]},cache:[{item_id:'post-2',source_hash:'0'.repeat(64),
  title:'מידע ישן',body:'טקסט ישן',commentary:'',quality_score:100}]});
 const res=await readLocalizedAnalysts(url('/api/analyst-posts','he'),f.env,f.analystService,'he','/api/analyst-posts');
 const x=await res.json();
 assert.equal(x.posts[0].translation_state,'pending');
 assert.equal(x.posts[0].content_language,'ru');
 assert.equal(x.posts[0].translation_available,false);
 assert.equal(x.localized_count,0);
 assert.equal(x.translation_summary.pending,1);
 assert.equal(x.posts[0].headline,item.headline);
});

test('detail route returns a single post object without collection wrapper',async()=>{
 const item={id:'post-3',headline:'Обзор событий',summary:'Материал редакции',short_quote:'',original_language:'ru'};
 const f=fixture({data:item});
 const response=await localization.fetch(url('/api/analyst-posts/post-3','ru'),f.env,f.analystService);
 const body=await response.json();
 assert.equal(body.id,'post-3');
 assert.equal(body.headline,item.headline);
 assert.equal(body.translation_state,'original');
 assert.equal(body.posts,undefined);
 assert.equal(f.upstream[0].path,'/api/analyst-posts/post-3');
});

test('upstream analyst 503 response and body remain intact, with no D1 read',async()=>{
 const f=fixture({data:{error:'analyst_source_unavailable'},upstreamStatus:503});
 const response=await localization.fetch(url('/api/analyst-posts','ru'),f.env,f.analystService);
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'analyst_source_unavailable'});
 assert.equal(f.calls.length,0);
});

test('common facade validates OPTIONS, method, language, limits and unknown path first',async()=>{
 const f=fixture({data:{posts:[]}});
 const options=await localization.fetch(new Request('https://regional-watch.pages.dev/api/analyst-posts',{method:'OPTIONS'}),f.env,f.analystService);
 assert.equal(options.status,204);
 assert.equal(options.headers.get('Access-Control-Allow-Origin'),'*');
 for(const [path,method,error,status] of [
  ['/api/analyst-posts','POST','read_only',405],
  ['/api/analyst-posts?lang=fr','GET','unsupported_language',400],
  ['/api/analyst-posts?lang=ru&limit=41','GET','invalid_limit',400],
  ['/api/analyst-posts?lang=he&offset=2001','GET','invalid_offset',400],
  ['/api/future?lang=ru','GET','not_found',404]
 ]){
  const res=await localization.fetch(new Request('https://regional-watch.pages.dev'+path,{method}),f.env,f.analystService);
  assert.equal(res.status,status,path);
  assert.equal((await res.json()).error,error,path);
 }
 assert.equal(f.upstream.length,0,'invalid requests never invoke upstream analyst service');
});
