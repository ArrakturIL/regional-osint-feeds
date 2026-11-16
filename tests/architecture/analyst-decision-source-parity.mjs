import {readFileSync} from 'node:fs';

export function reconstructAnalystDecisionEditor(){
 const root=new URL('../../backend/editor/src/analysts/',import.meta.url);
 const editor=readFileSync(new URL('editor.mjs',root),'utf8');
 const decision=readFileSync(new URL('editorial-decision.mjs',root),'utf8');
 const addedImport="import {createAnalystDecision} from './editorial-decision.mjs';\n";
 const deps='EDITOR_VERSION,MODEL,DAY,MAX_AI_PER_DAY,REGION,PROMO,isCommercialAd,plain,bodyWords,similarity,assertString,isoNow,translatedForEditorial';
 const signature='export function createAnalystDecision({'+deps+'}) {\n';
 const call='const {validateDecision,aiDecision,reserveAi,decide}=createAnalystDecision({'+deps+'});\n';
 const tail='return {validateDecision,aiDecision,reserveAi,decide};\n}\n';
 if(!editor.includes(addedImport)||!editor.includes(call)||!decision.startsWith(signature)||!decision.endsWith(tail))
  throw Error('analyst decision extraction boundary changed');
 const start=decision.indexOf('function validateDecision(d, original) {');
 const ai=decision.indexOf('async function aiDecision(',start);
 const reserve=decision.indexOf('async function reserveAi(',ai);
 const decide=decision.indexOf('async function decide(',reserve);
 const finish=decision.lastIndexOf(tail);
 if(!(start>=signature.length&&ai>start&&reserve>ai&&decide>reserve&&finish>decide))
  throw Error('original decision methods/ordering changed');
 const functions=decision.slice(signature.length,finish);
 return editor.replace(addedImport,'').replace(call,functions);
}
