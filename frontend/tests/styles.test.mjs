import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assembleStyles} from '../scripts/build-styles.mjs';
const frontend=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=(p)=>readFileSync(resolve(frontend,p),'utf8');
const parts=JSON.parse(source('styles-order.json')).order;
const refined=source('src/styles/refinements.css');
test('CSS has component and page owners; original 550-line monolith is not authored',()=>{
 assert.equal(existsSync(resolve(frontend,'src/styles/app.css')),false);
 assert.ok(parts.length>=25);
 assert.ok(parts.some(p=>p.startsWith('components/Header/')));
 assert.ok(parts.some(p=>p.startsWith('components/NewsCard/')));
 assert.ok(parts.some(p=>p.startsWith('pages/Home/')));
 assert.ok(parts.some(p=>p.startsWith('pages/DataRoom/')));
 assert.ok(parts.every(p=>existsSync(resolve(frontend,'src',p))));
});
test('modularized baseline preserves every original CSS byte and cascade ordering',()=>{
 const baseline=source('../baselines/cloudflare/2026-11-14/pages-0f39f36e/app.css');
 assert.equal(assembleStyles({includeRefinements:false}),baseline);
 assert.equal(assembleStyles(),baseline+refined+source('src/styles/document-shell.css'));
});
test('both locales share one explicit rhythm for main sections',()=>{
 assert.match(refined,/#overview \.rw-digest \+ \.section\s*\{/);
 assert.match(refined,/#overview \.rw-home-news-editorial > \.rw-home-feed\s*\{/);
 assert.match(refined,/--rw-section-space:\s*clamp\(/);
 assert.doesNotMatch(refined,/html\[lang=['"]he['"]\]\s+#overview\s+\.section\s*\{/);
});
const channel=v=>{const n=v/255;return n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4};
const lum=hex=>{const [r,g,b]=[1,3,5].map(i=>channel(parseInt(hex.slice(i,i+2),16)));return r*.2126+g*.7152+b*.0722};
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};
test('accent and muted palette meet AA text contrast on page and surface',()=>{
 const muted=refined.match(/--rw-body-muted:\s*(#[0-9a-fA-F]{6})/)[1];
 for(const background of ['#0b1412','#13221c']){
  assert.ok(contrast(muted,background)>=4.5,muted+' on '+background);
  assert.ok(contrast('#83e7ad',background)>=4.5,'brand green on '+background);
 }
});
test('legibility rules favor longer text and smaller metadata without compacting UI',()=>{
 assert.match(refined,/--rw-reading-measure:\s*72ch/);
 assert.match(refined,/\.section-head p\s*\{[\s\S]*?font-size:\s*0\.875rem/);
 assert.match(refined,/\.rw-fineprint\s*\{\s*font-size:\s*0\.8125rem\s*!important/);
 assert.match(refined,/html\[lang="he"\]/);
});

test('critical content metadata has minimum 12px-equivalent type without enlarging navigation',()=>{
 for(const selector of ['.rw-digest-item small','.rw-story-footer','.rw-technical-row small','.rw-s43-provider small','.stamp small','.rw-status-tag','.news-card .rw-importance-badge','.rw-news-translation-state']){
  assert.ok(refined.includes(selector),'readability rule missing '+selector);
 }
 assert.ok(refined.includes('font-size: 0.75rem;'),'content metadata should be at least 12px at default zoom');
});

test('eight RU/HE documents contain no duplicated inline CSS',()=>{
 const shared=source('src/styles/document-shell.css');
 assert.ok(shared.length>3000);
 assert.ok(shared.includes('.rw-home-news-editorial'));
 for(const lang of ['ru','he'])for(const page of ['home','events','data','analysts']){
  const html=source('documents/'+lang+'/'+page+'.html');
  assert.doesNotMatch(html,/<style(?:\s|>)/i,lang+'/'+page);
  assert.ok(html.includes('/assets/app.css'));
 }
 const baseline=source('../baselines/cloudflare/2026-11-14/pages-0f39f36e/app.css');
 assert.equal(assembleStyles(),baseline+refined+shared);
});
