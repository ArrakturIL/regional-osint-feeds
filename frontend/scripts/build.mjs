import {assembleStyles} from './build-styles.mjs';
import {readFileSync,mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function assemble(){
 const m=JSON.parse(readFileSync(resolve(root,'build-order.json'),'utf8'));
 // Imports may span several lines (Prettier wraps long ones); strip whole statements.
 const strip=s=>s.replace(/^import\s[^;]*?from\s*['"][^'"]+['"];?[^\S\n]*\n/gm,'').replace(/^import\s*['"][^'"]+['"];?[^\S\n]*\n/gm,'').replace(/^export (?=(?:function|const|class) )/gm,'');
 let result=m.prefix;
 for(const p of m.order){
  if(p==='app/postlude.js')result+=m.closing;
  result+=strip(readFileSync(resolve(root,'src',p),'utf8'));
 }
 return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dest=resolve(root,'dist/assets');mkdirSync(dest,{recursive:true});
 writeFileSync(resolve(dest,'app.js'),assemble());
 writeFileSync(resolve(dest,'app.css'),assembleStyles());
 console.log('Built modular compatibility frontend from '+JSON.parse(readFileSync(resolve(root,'build-order.json'))).order.length+' source modules');
}
