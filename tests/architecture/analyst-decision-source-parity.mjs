import {readFileSync} from 'node:fs';
import {reconstructAnalystQueueEditor} from './analyst-queue-source-parity.mjs';

export function reconstructAnalystDecisionEditor(){
 const root=new URL('../../backend/editor/src/analysts/',import.meta.url);
 const editor=reconstructAnalystQueueEditor();
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
 // E-06 is the sole intentionally behavior-changing deviation from the
 // pre-extraction frozen Editor. Normalize ONLY this guard when comparing the
 // rest of the modern runtime against the historical Git blob.
 const functions=decision.slice(signature.length,finish);
 const guardStart=functions.indexOf('  // JavaScript \\b is ASCII-centric');
 const guardEnd=functions.indexOf('  let q=plain(d.quote',guardStart);
 if(guardStart<0||guardEnd<guardStart)throw Error('E-06 Unicode guard boundary missing');
 const guard=functions.slice(guardStart,guardEnd);
 if(!guard.includes('const certainty=')||!guard.includes('for(const m of d.headline.matchAll(certainty))'))
  throw Error('E-06 Unicode guard contract changed');
 const historicLine='  if (/\\b(?:подтвержден[оы]|доказан[оы]|официально установлено)\\b/i.test(d.headline)) return null;\n';
 const historical=functions.slice(0,guardStart)+historicLine+functions.slice(guardEnd);
 return editor.replace(addedImport,'').replace(call,historical);
}
