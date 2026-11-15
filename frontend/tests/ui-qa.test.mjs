import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assembleStyles} from '../scripts/build-styles.mjs';
import {ruPlural} from '../src/utils/ruPlural.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=p=>readFileSync(resolve(root,p),'utf8');

test('expanded news cards no longer force giant row-height gaps or reorder DOM',()=>{
 const js=source('src/components/NewsMasonry/NewsMasonry.js');
 const layout=source('src/components/NewsMasonry/NewsMasonry.layout.css');
 assert.match(js,/stories\.map\(/,'article DOM order is the source order');
 assert.match(layout,/column-count:\s*2/);
 assert.match(layout,/break-inside:\s*avoid/);
 assert.match(layout,/@media\s*\(max-width:\s*640px\)/);
 assert.match(layout,/column-count:\s*1/);
 assert.doesNotMatch(layout,/grid-auto-rows:\s*auto/,'row-stretching layout reintroduced');
});

test('Digest shows result and checked period, sources and time in one summary area',()=>{
 const js=source('src/components/Digest/Digest.js');
 const css=assembleStyles();
 assert.match(js,/rw-digest-summary/);
 assert.match(js,/rw-digest-meta/);
 assert.match(js,/rw-digest-meta-label/);
 assert.match(js,/h\("bdi",\{dir:"ltr"\}/);
 assert.match(css,/\.rw-digest-grid\s*\{[^\}]*grid-template-columns:[^\}]*\}/);
 assert.match(css,/\.rw-digest-summary\s*\{/);
 assert.match(css,/\.rw-digest-meta\s*\{/);
 assert.match(css,/@media\s*\(max-width:\s*640px\)[\s\S]*?\.rw-digest-meta/);
});

test('Russian plural inflection handles 1, 2, 5, 11, 17, 21 and 112',()=>{
 const forms=['публикация','публикации','публикаций'];
 for(const [n,v] of [[1,'публикация'],[2,'публикации'],[5,'публикаций'],[11,'публикаций'],[17,'публикаций'],[21,'публикация'],[112,'публикаций']])
  assert.equal(ruPlural(n,forms),v,n);
 const card=source('src/components/NewsCard/NewsCard.js');
 assert.match(card,/ruPlural\(related\.length\+1/);
});

test('back-to-top button has localized Hebrew accessible name',()=>{
 const script=source('src/app/postlude.js');
 assert.match(script,/חזרה לראש העמוד/);
 assert.match(script,/למעלה/);
 assert.match(script,/aria-label/);
});
