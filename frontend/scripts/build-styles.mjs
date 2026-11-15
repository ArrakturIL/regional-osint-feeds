import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const frontendRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function assembleStyles({includeRefinements=true}={}){
 const manifest=JSON.parse(readFileSync(resolve(frontendRoot,'styles-order.json'),'utf8'));
 if(!Array.isArray(manifest.order)||manifest.order.length<20)throw Error('Invalid ordered CSS sources');
 const seen=new Set();
 let css='';
 for(const path of manifest.order){
  if(!/^(components|pages|styles)\/[a-zA-Z0-9./-]+\.css$/.test(path)||path.includes('..'))throw Error('Invalid CSS path: '+path);
  if(seen.has(path))throw Error('Duplicate CSS source: '+path);
  seen.add(path);
  css+=readFileSync(resolve(frontendRoot,'src',path),'utf8');
 }
 if(includeRefinements){
  css+=readFileSync(resolve(frontendRoot,'src/styles/refinements.css'),'utf8');
  // Formerly duplicated in each RU/HE document; loaded after the original CSS.
  css+=readFileSync(resolve(frontendRoot,'src/styles/document-shell.css'),'utf8');
 }
 return css;
}
