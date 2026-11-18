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
test('each module import resolves to a real file',()=>{for(const p of [...Object.values(map),'news/rss.mjs','translations/scheduled.mjs','api/official-posts.mjs','api/monitor-changes.mjs','editorial/ai-comments.mjs','news/ingestion.mjs','news/scan.mjs']){const source=readFileSync(liveFile(p),'utf8');for(const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g))assert.ok(existsSync(resolve(dirname(liveFile(p)),match[1])),p+' -> '+match[1]);}});
test('Node parses every module',()=>{for(const p of [...Object.values(map),'news/rss.mjs','translations/scheduled.mjs','api/official-posts.mjs','api/monitor-changes.mjs','editorial/ai-comments.mjs','news/ingestion.mjs','news/scan.mjs']){const r=spawnSync(process.execPath,['--check',liveFile(p)],{encoding:'utf8'});assert.equal(r.status,0,p+': '+r.stderr);}});
test('Editor bindings and 5-minute cron are pinned',()=>{const x=JSON.parse(readFileSync(resolve(root,'backend/editor/wrangler.jsonc'),'utf8'));assert.equal(x.main,'src/index.js');assert.equal(x.compatibility_date,'2026-11-10');assert.deepEqual(x.triggers.crons,['*/5 * * * *']);assert.deepEqual(x.d1_databases.map(d=>d.binding).sort(),['CORE_DB','NEWS_DB']);assert.equal(x.ai.binding,'AI');});
