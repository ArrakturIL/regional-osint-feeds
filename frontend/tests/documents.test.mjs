import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pages=['home','events','data','analysts'];
for(const lang of ['ru','he'])for(const page of pages)test(lang+'/'+page+' has preserved original HTML shell and stable React scripts',()=>{
 const s=readFileSync(resolve(root,'documents',lang,page+'.html'),'utf8');
 assert.ok(s.startsWith('<!DOCTYPE html>'));
 assert.match(s,new RegExp('<html lang="'+lang+'"'));
 assert.equal(s.includes('dir="rtl"'),lang==='he');
 assert.ok(s.includes('<div id="root"></div>'));
 for(const script of ['react.js','react-dom.js','app.js'])assert.ok(s.includes('/assets/'+script),lang+'/'+page+': '+script);
 assert.ok(s.includes('/assets/app.css'));
 assert.ok(s.includes('https://regional-watch.pages.dev/'));
 if(page!=='home')assert.ok(s.includes(page));
});
