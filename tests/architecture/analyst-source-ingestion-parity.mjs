import {readFileSync} from 'node:fs';
import {reconstructAnalystDecisionEditor} from './analyst-decision-source-parity.mjs';

export function reconstructAnalystIngestionEditor(){
 const root=new URL('../../backend/editor/src/analysts/',import.meta.url);
 const editor=reconstructAnalystDecisionEditor();
 const ingest=readFileSync(new URL('source-ingestion.mjs',root),'utf8');
 const addedImport="import {createSourceIngestion} from './source-ingestion.mjs';\n";
 const call="const {sha256,readMirror,validateInput,insertItem}=createSourceIngestion({HOUR,DAY,plain,assertString});\n";
 const factory="export function createSourceIngestion({HOUR,DAY,plain,assertString}) {\n";
 if(!editor.startsWith(addedImport)||!editor.includes(call)||!ingest.startsWith(factory))
  throw Error('source ingestion boundary changed');
 const find=(term)=>{const i=ingest.indexOf(term);if(i<0)throw Error('missing '+term);return i};
 const iMirror=find('const MIRROR_BASE ='),
       iMax=find('const MAX_SOURCE_BYTES ='),
       iStates=find('const VALID_STATES ='),
       iMethods=find('async function sha256(s)'),
       iReturn=find('return {sha256,readMirror,validateInput,insertItem};');
 if(!(iMirror<iMax&&iMax<iStates&&iStates<iMethods&&iMethods<iReturn))throw Error('source ingestion order changed');
 const mirror=ingest.slice(iMirror,iMax),
       limits=ingest.slice(iMax,iStates),
       states=ingest.slice(iStates,iMethods),
       functions=ingest.slice(iMethods,iReturn);
 let original=editor.slice(addedImport.length).replace(call,'');
 for(const [anchor,payload] of [
  ['const HOUR =',mirror],
  ['const REGION =',limits],
  ['// Reject unambiguous multilingual',states],
  ['function validateDecision(d, original) {',functions]
 ]){
  if(!original.includes(anchor))throw Error('missing original editor anchor '+anchor);
  original=original.replace(anchor,payload+anchor);
 }
 return original;
}
