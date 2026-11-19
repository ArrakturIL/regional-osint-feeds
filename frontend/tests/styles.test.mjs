import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assembleStyles,themeWithFonts} from '../scripts/build-styles.mjs';
const frontend=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=(p)=>readFileSync(resolve(frontend,p),'utf8');
// Formatting-insensitive view of JS source (#8a Prettier): no whitespace, one quote style, no trailing commas.
const code=s=>String(s).replace(/\s+/g,'').replace(/'/g,'"').replace(/,([)\]}])/g,'$1');
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
 assert.equal(assembleStyles(),baseline+refined+source('src/styles/document-shell.css')+source('src/components/Header/Header.mobile.css')+source('src/components/NewsMasonry/NewsMasonry.layout.css')+source('src/components/NewsArchive/NewsArchive.filters.css')+source('src/components/Header/Header.status.css')+source('src/components/Digest/Digest.qa.css')+source('src/components/FeedState/FeedState.css')+themeWithFonts());
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
 assert.equal(assembleStyles(),baseline+refined+shared+source('src/components/Header/Header.mobile.css')+source('src/components/NewsMasonry/NewsMasonry.layout.css')+source('src/components/NewsArchive/NewsArchive.filters.css')+source('src/components/Header/Header.status.css')+source('src/components/Digest/Digest.qa.css')+source('src/components/FeedState/FeedState.css')+themeWithFonts());
});

test('small screen navigation has two readable columns in both locales',()=>{
 const mobile=source('src/components/Header/Header.mobile.css');
 assert.match(mobile,/@media\s*\(max-width:\s*430px\)/);
 assert.match(mobile,/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*!important/);
 assert.match(mobile,/min-height:\s*44px\s*!important/);
 assert.match(mobile,/font-size:\s*0\.875rem\s*!important/);
 const css=assembleStyles();
 assert.ok(css.indexOf(mobile)>css.indexOf(source('src/styles/document-shell.css')),'mobile navigation must load after older inline shell cascade');
});

test('news order and sources count regression: stable grid and isolated LTR numbers',()=>{
 const masonry=source('src/components/NewsMasonry/NewsMasonry.js');
 assert.doesNotMatch(masonry,/gridRowEnd|ResizeObserver|requestAnimationFrame|useEffect/, 'no JS masonry measurement or dynamic reordering');
 const layout=source('src/components/NewsMasonry/NewsMasonry.layout.css');
 assert.match(layout,/column-count:\s*2/);
 assert.match(layout,/break-inside:\s*avoid/);
 assert.match(layout,/display:\s*inline-block/);
 assert.match(layout,/@media\s*\(max-width:\s*640px\)/);
 assert.match(layout,/column-count:\s*1/);
 assert.doesNotMatch(layout,/grid-auto-rows:\s*auto/);
 const count=code(source('src/components/Header/Header.js'));
 assert.match(count,/h\("bdi",\{className:"rw-site-source-count",dir:"ltr"\},status\)/);
 assert.match(count,/h\("bdi",\{className:"rw-dlg-counter",dir:"ltr"\},status\)/);
 const countStyle=source('src/components/NewsArchive/NewsArchive.filters.css')+source('src/components/Header/Header.status.css')+source('src/components/Digest/Digest.qa.css');
 assert.match(countStyle,/\.rw-global-header\s+\.rw-site-source\s*\{[\s\S]*?display:\s*inline-flex/);
 assert.match(countStyle,/\.rw-global-header\s+\.rw-site-source-count\s*\{[\s\S]*?unicode-bidi:\s*isolate/);
 const bundle=assembleStyles();
 assert.ok(bundle.endsWith(countStyle+source('src/components/FeedState/FeedState.css')+themeWithFonts()),'bidi fix must take precedence after legacy header rules (only F-04 FeedState.css and the 2077 theme layer follow)');
 assert.ok(bundle.includes(layout),'news grid must be present in emitted CSS');
});

test('Q7: the 16px field floor on touch screens outranks component field rules',()=>{
 // QA 19.11: .rw-archive-field input (0,1,1) beat main :is(input,select,textarea)
 // (0,0,2): 14.56px on /events, 14px on /analysts, and iOS zoomed on focus.
 const theme=source('src/styles/theme-2077.css');
 const rule=theme.match(/main :is\(input,select,textarea\)([^{]*)\{font-size:16px\}/);
 assert.ok(rule,'16px floor rule present');
 const attrs=(rule[1].match(/\[[^\]]+\]/g)||[]).length;
 assert.ok(attrs>=1,'floor rule must carry at least class-level specificity to beat .component input');
 for(const file of ['src/components/NewsArchive/NewsArchive.filters.css','src/pages/Analysts/Analysts.css']){
  assert.ok(!/#[\w-]+[^{]*\b(input|select)\b[^{]*\{[^}]*font-size/.test(source(file)),file+': an id selector would outrank the floor');
 }
});
