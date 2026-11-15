import {assembleStyles} from './build-styles.mjs';
import { readFileSync,writeFileSync,copyFileSync,mkdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { assemble } from './build.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dest=resolve(root,'dist');
const write=(file,bytes)=>{const p=resolve(dest,file);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes)};
const vendor=readFileSync(resolve(root,'vendor/react.production.min.js'),'utf8');
const dom=gunzipSync(readFileSync(resolve(root,'vendor/react-dom.production.min.js.gz'))).toString('utf8');
if(vendor.length!==10751 || !vendor.includes('c.version="18.3.1"'))throw Error('React production snapshot changed');
if(dom.length!==131835 || !dom.includes('18.3.1-next-f1338f8080-20240426'))throw Error('ReactDOM production snapshot changed');
write('assets/react.js',vendor);
write('assets/react-dom.js',dom);
write('assets/app.js',assemble());
write('assets/app.css',assembleStyles());
for(const lang of ['ru','he'])for(const page of ['home','events','data','analysts']){
 const html=readFileSync(resolve(root,'documents',lang,page+'.html'),'utf8');
 const path=(lang==='he'?'he/':'')+(page==='home'?'':page+'/')+'index.html';
 write(path,html);
}
console.log('Built standalone static Pages payload: 8 locale routes + 4 byte-preserved frontend assets.');
