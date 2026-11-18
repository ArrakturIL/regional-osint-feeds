import {assembleStyles} from './build-styles.mjs';
import { readFileSync,writeFileSync,copyFileSync,mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assemble } from './build.mjs';
import { fontFiles, fontUrl, FONT_DIR } from './build-styles.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dest=resolve(root,'dist');
const write=(file,bytes)=>{const p=resolve(dest,file);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes)};
const vendor=readFileSync(resolve(root,'vendor/react.production.min.js'),'utf8');
const dom=gunzipSync(readFileSync(resolve(root,'vendor/react-dom.production.min.js.gz'))).toString('utf8');
if(vendor.length!==10751 || !vendor.includes('c.version="18.3.1"'))throw Error('React production snapshot changed');
if(dom.length!==131835 || !dom.includes('18.3.1-next-f1338f8080-20240426'))throw Error('ReactDOM production snapshot changed');
// F-06: each asset URL carries a hash of its own bytes (?v=<12 hex>), so Pages
// can serve it immutable; the documents keep must-revalidate and pick up new
// hashes on the next release. Source documents keep the legacy ?v= marker.
const assetsOut={'react.js':vendor,'react-dom.js':dom,'app.js':assemble(),'app.css':assembleStyles()};
const hashes={};
for(const [name,body] of Object.entries(assetsOut)){write('assets/'+name,body);hashes[name]=createHash('sha256').update(body).digest('hex').slice(0,12);}
for(const f of fontFiles())write('assets/fonts/'+f,readFileSync(resolve(FONT_DIR,f)));
export function versionDocument(html,map=hashes){
 return html.replace(/\/assets\/(react\.js|react-dom\.js|app\.js|app\.css)\?v=[A-Za-z0-9._-]+/g,(m,name)=>'/assets/'+name+'?v='+map[name]);
}
// F-06 (#15): the first-screen text faces start downloading with the CSS instead
// of after it is parsed and React has rendered (mobile LCP was the font swap).
export const PRELOAD_FONTS={ru:['manrope-cyrillic','unbounded-cyrillic'],he:['rubik-hebrew']};
export function preloadFonts(html,lang){
 const links=PRELOAD_FONTS[lang].map(n=>'<link rel="preload" href="'+fontUrl(n+'.woff2')+'" as="font" type="font/woff2" crossorigin>').join('');
 const out=html.replace('<link rel="stylesheet"',links+'<link rel="stylesheet"');
 if(out===html)throw Error('font preload not applied');
 return out;
}
for(const lang of ['ru','he'])for(const page of ['home','events','data','analysts']){
 const html=readFileSync(resolve(root,'documents',lang,page+'.html'),'utf8');
 const path=(lang==='he'?'he/':'')+(page==='home'?'':page+'/')+'index.html';
 const out=preloadFonts(versionDocument(html),lang);
 if(out===html||!/\?v=[0-9a-f]{12}"/.test(out))throw Error('asset version not applied: '+path);
 write(path,out);
}
console.log('Built standalone static Pages payload: 8 locale routes + modular frontend assets.');
