import {assemble} from '../scripts/build.mjs';
import {assembleStyles} from '../scripts/build-styles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
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
 // F-06: only the asset version markers differ; each is the asset's own content hash.
 const out=load(route);
 assert.equal(out.replace(/\?v=[0-9a-f]{12}"/g,'?v=rw-editor-bottom-v16"'),source,route+' changed');
 for(const name of ['react.js','react-dom.js','app.js','app.css'])
  assert.ok(out.includes('/assets/'+name+'?v='+createHash('sha256').update(load('assets/'+name)).digest('hex').slice(0,12)+'"'),route+' '+name+' hash');
 }
});
test('frontend CSS and JS exactly match their current modular assemblers',()=>{
 const baseline=resolve(root,'../baselines/cloudflare/2026-11-14/pages-0f39f36e');
 assert.equal(load('assets/app.js'),assemble());
 assert.equal(load('assets/app.css'),assembleStyles());
 assert.ok(load('assets/app.css').startsWith(readFileSync(resolve(baseline,'app.css'),'utf8')));
});
