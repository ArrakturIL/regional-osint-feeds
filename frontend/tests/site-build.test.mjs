import {assembleStyles} from '../scripts/build-styles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dest=resolve(root,'dist');
const load=s=>readFileSync(resolve(dest,s),'utf8');
test('exact original vendor runtime scripts are retained',()=>{
 const react=load('assets/react.js'),dom=load('assets/react-dom.js');
 assert.equal(react.length,10751);
 assert.equal(dom.length,131835);
 assert.match(react,/c\.version="18\.3\.1"/);
 assert.match(dom,/18\.3\.1-next-f1338f8080-20240426/);
});
test('all eight locale routes retain exact document HTML',()=>{
 for(const lang of ['ru','he'])for(const page of ['home','events','data','analysts']){
 const source=readFileSync(resolve(root,'documents',lang,page+'.html'),'utf8');
 const route=(lang==='he'?'he/':'')+(page==='home'?'':page+'/')+'index.html';
 assert.ok(existsSync(resolve(dest,route)));
 assert.equal(load(route),source,route+' changed');
 }
});
test('frontend CSS and JS remain exactly equal to deployed snapshot',()=>{
 const baseline=resolve(root,'../baselines/cloudflare/2026-11-14/pages-0f39f36e');
 assert.equal(load('assets/app.js'),readFileSync(resolve(baseline,'app.js'),'utf8'));
 assert.equal(load('assets/app.css'),assembleStyles());
 assert.ok(load('assets/app.css').startsWith(readFileSync(resolve(baseline,'app.css'),'utf8')));
});
