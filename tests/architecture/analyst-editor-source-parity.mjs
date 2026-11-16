import {readFileSync} from 'node:fs';
import {reconstructAnalystIngestionEditor} from './analyst-source-ingestion-parity.mjs';

export function reconstructAnalystEditor(){
 const editor=reconstructAnalystIngestionEditor();
 const publicApi=readFileSync(new URL('../../backend/editor/src/analysts/public-api.mjs',import.meta.url),'utf8');
 const newImport="import {readApi} from './public-api.mjs';\n";
 const corsEnd=publicApi.indexOf('function json(value, status=200) {');
 const readBegin=publicApi.indexOf('export async function readApi(request,env,editorVersion) {');
 if(!editor.startsWith(newImport)||corsEnd<0||readBegin<corsEnd)throw Error('unexpected editor reader boundary');
 const cors=publicApi.slice(0,corsEnd);
 const respond=publicApi.slice(corsEnd,readBegin);
 const reader=publicApi.slice(readBegin)
  .replace('export async function readApi(request,env,editorVersion) {','async function readApi(request,env) {')
  .replace('editor_version:editorVersion','editor_version:EDITOR_VERSION');
 const plain='function plain(text, cap) {';
 const sha='async function sha256(s) {';
 const fetch='async fetch(request,env) { return readApi(request,env,EDITOR_VERSION); }';
 if(!editor.includes(plain)||!editor.includes(sha)||!editor.includes(fetch)||!editor.includes('export default {'))throw Error('missing analyst entrypoint source');
 return editor.slice(newImport.length)
  .replace(plain,cors+plain)
  .replace(sha,respond+sha)
  .replace('export default {',reader+'export default {')
  .replace(fetch,'async fetch(request,env) { return readApi(request,env); }');
}
