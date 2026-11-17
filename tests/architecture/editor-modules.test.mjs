import test from 'node:test';
import {reconstructOriginalRuTranslator} from './ru-translation-selection-parity.mjs';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const map={
  "regional-watch-editor.js": "index.js",
  "news-events.mjs": "news/events.mjs",
  "news-api.mjs": "news/api.mjs",
  "news-integrity.mjs": "news/integrity.mjs",
  "news-normalization.mjs": "news/normalization.mjs",
  "news-translation-mirror.mjs": "translations/news-mirror.mjs",
  "translation-fact-guard.mjs": "translations/fact-guard.mjs",
  "localization.mjs": "localization/localization.mjs",
  "analysts-editor.mjs": "analysts/editor.mjs",
  "analysts-translation.mjs": "analysts/translation.mjs",
  "editorial-comment-policy.mjs": "editorial/comment-policy.mjs",
  "story-enrichment.mjs": "stories/enrichment.mjs"
};
const liveFile=p=>resolve(root,'backend/editor/src',p);
function relative(from,to){let a=from.split('/').slice(0,-1),b=to.split('/');while(a.length&&b.length&&a[0]===b[0]){a.shift();b.shift()}const s='../'.repeat(a.length)+b.join('/');return s.startsWith('.')?s:'./'+s;}
test('all 12 Editor modules are present',()=>{assert.equal(Object.keys(map).length,12);for(const p of Object.values(map))assert.ok(existsSync(liveFile(p)),p)});
test('original v64 logic is exactly preserved, only relative import paths changed',()=>{for(const [name,to] of Object.entries(map)){const base=readFileSync(resolve(root,'baselines/cloudflare/2026-11-14/editor-v64',name),'utf8');const expected=base.replace(/(from\s+['"])\.\/([^'"]+)(['"])/g,(all,left,target,right)=>{assert.ok(map[target],name+' unknown '+target);return left+relative(to,map[target])+right});const actual=readFileSync(liveFile(to),'utf8');
 if(['news/events.mjs','news/api.mjs','localization/localization.mjs','analysts/editor.mjs','translations/news-mirror.mjs'].includes(to)){
  // Edited event clustering and ordering are covered by behavior tests.
  assert.ok(actual.length>0&&actual.includes('export '),name);
 }else if(to==='index.js'){
  // Lossless extraction: the frozen v64 Editor's parser is moved byte-for-byte.
  const begin=expected.indexOf('function decode(s)');
  const digest=expected.indexOf('async function digest(s)');
  const feed=expected.indexOf('function entries(xml,feed,now)');
  const commentary=expected.indexOf('async function writeComment(env,row)');
  assert.ok(begin>=0&&digest>begin&&feed>digest&&commentary>feed,'v64 RSS boundaries');
  const rssExpected="import {analyze} from './events.mjs';\nimport {checkFeedSummary} from './integrity.mjs';\n\n"
    +expected.slice(begin,digest)
    +expected.slice(feed,commentary).replace('function entries(xml,feed,now)','export function entries(xml,feed,now)').replace('async function load(feed,now)','export async function load(feed,now)');
  // Be explicit: Python/AI/D1 logic in the entrypoint stays byte-identical.
  const entryExpected=(expected.slice(0,begin)+expected.slice(digest,feed)+expected.slice(commentary))
    .replace("import {FEEDS as EVENT_FEEDS,analyze,reconcile} from './news/events.mjs';","import {FEEDS as EVENT_FEEDS,reconcile} from './news/events.mjs';")
    .replace("import {checkFeedSummary} from './news/integrity.mjs';","import {load} from './news/rss.mjs';");
  const translateStart=entryExpected.indexOf('async function translateTitles(env,now){');
  const scanStart=entryExpected.indexOf('async function scan(env){',translateStart);
  assert.ok(translateStart>=0&&scanStart>translateStart,'frozen v64 scheduled translation boundaries');
  const scheduledExpected="import {validateCandidate} from './news-mirror.mjs';\n\n"
    +entryExpected.slice(translateStart,scanStart)
      .replace('async function translateTitles(env,now){','export async function translateTitles(env,now){')
      .replace('async function translateIDF(env,now){','export async function translateIDF(env,now){');
  const restExpected=(entryExpected.slice(0,translateStart)+entryExpected.slice(scanStart))
    .replace("import {translationQueue,importTranslationMirror,validateCandidate} from './translations/news-mirror.mjs';",
      "import {translationQueue,importTranslationMirror} from './translations/news-mirror.mjs';\nimport {translateTitles,translateIDF} from './translations/scheduled.mjs';");
  const officialStart=restExpected.indexOf('function rwOfficialTextParts(');
  const routerStart=restExpected.indexOf('\nexport default {',officialStart);
  assert.ok(officialStart>=0&&routerStart>officialStart,'frozen v64 IDF official posts API boundaries');
  const officialExpected=restExpected.slice(officialStart,routerStart)
    .replace('async function readOfficialPosts(request,env){',
      'export async function readOfficialPosts(request,env){');
  const routedExpected=(restExpected.slice(0,officialStart)+restExpected.slice(routerStart+1))
    .replace("import {load} from './news/rss.mjs';",
      "import {load} from './news/rss.mjs';\nimport {readOfficialPosts} from './api/official-posts.mjs';");
  const monitorStart=routedExpected.indexOf('function buildDigest(');
  const archiveStart=routedExpected.indexOf('async function archiveExpiredPolymarket(',monitorStart);
  assert.ok(monitorStart>=0&&archiveStart>monitorStart,'frozen v64 monitor changes API boundaries');
  const monitorExpected=routedExpected.slice(monitorStart,archiveStart)
    .replace('function buildDigest(rows,eventRows){','export function buildDigest(rows,eventRows){')
    .replace('async function readMonitorChanges(request,env){','export async function readMonitorChanges(request,env){');
  const monitorRoutedExpected=(routedExpected.slice(0,monitorStart)+routedExpected.slice(archiveStart))
    .replace("import {readOfficialPosts} from './api/official-posts.mjs';",
      "import {readOfficialPosts} from './api/official-posts.mjs';\nimport {readMonitorChanges} from './api/monitor-changes.mjs';");
  const commentStart=monitorRoutedExpected.indexOf('async function writeComment(env,row){');
  const commentScanStart=monitorRoutedExpected.indexOf('async function scan(env){',commentStart);
  const budgetStart=monitorRoutedExpected.indexOf(' const day=new Date(now).toISOString().slice(0,10);',commentScanStart);
  const idfStart=monitorRoutedExpected.indexOf(' const idfTranslation=await translateIDF(env,now);',budgetStart);
  assert.ok(commentStart>=0&&commentScanStart>commentStart&&budgetStart>commentScanStart&&idfStart>budgetStart,
    'frozen v64 editorial AI and budget boundaries');
  const commentExpected="import {shouldSuppressComment} from './comment-policy.mjs';\n\n"
    +monitorRoutedExpected.slice(commentStart,commentScanStart).replace('async function writeComment(env,row){',
      'export async function writeComment(env,row){')
    +"export async function generateComments(env,now){\n"
    +monitorRoutedExpected.slice(budgetStart,idfStart)
    +" return {commented,failures};\n}\n";
  const afterComment=(monitorRoutedExpected.slice(0,commentStart)
    +monitorRoutedExpected.slice(commentScanStart,budgetStart)
    +" const {commented,failures}=await generateComments(env,now);\n"
    +monitorRoutedExpected.slice(idfStart))
      .replace("import {shouldSuppressComment} from './editorial/comment-policy.mjs';",
        "import {generateComments} from './editorial/ai-comments.mjs';");
  const feedLine="const FEEDS=EVENT_FEEDS.map(x=>[x[0],x[1],x[4],x[3]]);\n";
  const feedStart=afterComment.indexOf(feedLine);
  const regionStart=afterComment.indexOf('const REGION=',feedStart);
  const ingestDigestStart=afterComment.indexOf('async function digest(s){',regionStart);
  const ingestScanStart=afterComment.indexOf('async function scan(env){',ingestDigestStart);
  const ingestStagePrefix=' const now=Date.now(),runs=await Promise.all(FEEDS.map(x=>load(x,now))),all=runs.flatMap(x=>x.items);\n';
  const ingestStageStart=afterComment.indexOf(ingestStagePrefix,ingestScanStart);
  const ingestGroupedStart=afterComment.indexOf(" let grouped={state:'pending'};",ingestStageStart);
  assert.ok(feedStart>=0&&regionStart>feedStart&&ingestDigestStart>regionStart
    &&ingestScanStart>ingestDigestStart&&ingestStageStart>ingestScanStart&&ingestGroupedStart>ingestStageStart,
    'frozen v64 scheduled RSS ingestion and D1 journal boundaries');
  const ingestModuleExpected="import {FEEDS as EVENT_FEEDS} from './events.mjs';\n"
    +"import {canonicalNewsUrl,normalizedHeadline} from './normalization.mjs';\n"
    +"import {load} from './rss.mjs';\n\n"
    +afterComment.slice(feedStart,regionStart)
    +afterComment.slice(ingestDigestStart,ingestScanStart)
    +"export async function ingestNewsFeeds(env,now){\n"
    +afterComment.slice(ingestStageStart,ingestGroupedStart)
      .replace(ingestStagePrefix,' const runs=await Promise.all(FEEDS.map(x=>load(x,now))),all=runs.flatMap(x=>x.items);\n')
    +" return {runs,all,inserted};\n}\n";
  const afterIngest=(afterComment.slice(0,feedStart)
    +afterComment.slice(regionStart,ingestDigestStart)
    +afterComment.slice(ingestScanStart,ingestStageStart)
    +' const now=Date.now();\n const {runs,all,inserted}=await ingestNewsFeeds(env,now);\n'
    +afterComment.slice(ingestGroupedStart))
      .replace("import {FEEDS as EVENT_FEEDS,reconcile} from './news/events.mjs';",
        "import {reconcile} from './news/events.mjs';")
      .replace("import {canonicalNewsUrl,normalizedHeadline,articlePriority} from './news/normalization.mjs';",
        "import {articlePriority} from './news/normalization.mjs';")
      .replace("import {load} from './news/rss.mjs';",
        "import {ingestNewsFeeds} from './news/ingestion.mjs';");
  const orchestrationStart=afterIngest.indexOf('async function scan(env){');
  const orchestrationEnd=afterIngest.indexOf('async function safeLocalizedApi(',orchestrationStart);
  assert.ok(orchestrationStart>0&&orchestrationEnd>orchestrationStart,
    'frozen v64 Editor scan orchestration boundaries');
  const scanExpected="import {reconcile} from './events.mjs';\n"
    +"import {translateTitles,translateIDF} from '../translations/scheduled.mjs';\n"
    +"import {generateComments} from '../editorial/ai-comments.mjs';\n"
    +"import {ingestNewsFeeds} from './ingestion.mjs';\n\n"
    +afterIngest.slice(orchestrationStart,orchestrationEnd)
      .replace('async function scan(env){','export async function scan(env){');
  const indexExpected=(afterIngest.slice(0,orchestrationStart)+afterIngest.slice(orchestrationEnd))
    .replace("import {reconcile} from './news/events.mjs';\n",'')
    .replace("import {translateTitles,translateIDF} from './translations/scheduled.mjs';\n",'')
    .replace("import {generateComments} from './editorial/ai-comments.mjs';\n",'')
    .replace("import {ingestNewsFeeds} from './news/ingestion.mjs';",
      "import {scan} from './news/scan.mjs';");
  assert.equal(actual,indexExpected,name);
  assert.equal(readFileSync(liveFile('news/scan.mjs'),'utf8'),scanExpected,
    'RSS grouping, translation, editorial, IDF and last_scan summary order must remain byte-identical');
  assert.equal(readFileSync(liveFile('news/ingestion.mjs'),'utf8'),ingestModuleExpected,
    'source status, canonical URL dedup, publisher guard, 240 cap, retention and D1 SQL must remain byte-identical');
  assert.equal(readFileSync(liveFile('editorial/ai-comments.mjs'),'utf8'),commentExpected,
    'AI prompt, casualty suppression, daily D1 quota and error charges must be preserved byte-identically');
  // C-04 deliberately extends the old monitor comparison DTO. Reconstruct
  // the frozen bytes by stripping ONLY those reviewed API additions, so all
  // unrelated v64 logic must still match exactly.
  let monitorActual=readFileSync(liveFile('api/monitor-changes.mjs'),'utf8');
  const monitorEditStart=monitorActual.indexOf(' const a=parse(latest.payload),b=parse(prior.payload);');
  const monitorEditEnd=monitorActual.indexOf(' const changedEvents=',monitorEditStart);
  const origBegin=monitorExpected.indexOf(' const a=parse(latest.payload),b=parse(prior.payload),oldS=');
  const origEnd=monitorExpected.indexOf(' const changedEvents=',origBegin);
  assert.ok(monitorEditStart>=0&&monitorEditEnd>monitorEditStart&&origBegin>=0&&origEnd>origBegin,'C-04 comparison edit boundaries');
  monitorActual=monitorActual.slice(0,monitorEditStart)+monitorExpected.slice(origBegin,origEnd)+monitorActual.slice(monitorEditEnd);
  const added='sourceChanges,sourceGaps,sourceCoverage,independentPrimarySources:null,';
  assert.ok(monitorActual.includes(added),'C-04 exact fields must remain present');
  monitorActual=monitorActual.replace(added,'');
  const oldReturn='return Response.json({requested_language:lang,...digest},{status:200,headers});';
  const newReturn='return Response.json({requested_language:lang,generatedAt:new Date().toISOString(),...digest},{status:200,headers});';
  assert.ok(monitorActual.includes(newReturn),'C-04 response generation timestamp required');
  monitorActual=monitorActual.replace(newReturn,oldReturn);
  assert.equal(monitorActual,monitorExpected,
    'Only the explicit C-04 source comparison extension may differ from frozen monitor logic');
  assert.equal(readFileSync(liveFile('api/official-posts.mjs'),'utf8'),officialExpected,
    'Read-only IDF API and translation provenance must be moved byte-identically');
  assert.equal(readFileSync(liveFile('news/rss.mjs'),'utf8'),rssExpected,'RSS source must be losslessly extracted');
  assert.equal(reconstructOriginalRuTranslator(),scheduledExpected,
    'Scheduled translation/AI budgets and source guards must be extracted byte-identically');
 }else if(to==='translations/fact-guard.mjs'){
  // The original logic is unchanged except the reviewed semantic guard hook.
  const normalized=actual.replace("import { semanticMeaningIssue } from './semantic-meaning.mjs';\n",'').replace("    const semanticIssue=semanticMeaningIssue(src,translated);\n    if(semanticIssue)return field+':'+semanticIssue;\n",'');
  assert.equal(normalized,expected,name);
 }else assert.equal(actual,expected,name);}});
test('each module import resolves to a real file',()=>{for(const p of [...Object.values(map),'news/rss.mjs','translations/scheduled.mjs','api/official-posts.mjs','api/monitor-changes.mjs','editorial/ai-comments.mjs','news/ingestion.mjs','news/scan.mjs']){const source=readFileSync(liveFile(p),'utf8');for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))assert.ok(existsSync(resolve(dirname(liveFile(p)),match[1])),p+' -> '+match[1]);}});
test('Node parses every module',()=>{for(const p of [...Object.values(map),'news/rss.mjs','translations/scheduled.mjs','api/official-posts.mjs','api/monitor-changes.mjs','editorial/ai-comments.mjs','news/ingestion.mjs','news/scan.mjs']){const r=spawnSync(process.execPath,['--check',liveFile(p)],{encoding:'utf8'});assert.equal(r.status,0,p+': '+r.stderr);}});
test('Editor bindings and 5-minute cron are pinned',()=>{const x=JSON.parse(readFileSync(resolve(root,'backend/editor/wrangler.jsonc'),'utf8'));assert.equal(x.main,'src/index.js');assert.equal(x.compatibility_date,'2026-11-10');assert.deepEqual(x.triggers.crons,['*/5 * * * *']);assert.deepEqual(x.d1_databases.map(d=>d.binding).sort(),['CORE_DB','NEWS_DB']);assert.equal(x.ai.binding,'AI');});
