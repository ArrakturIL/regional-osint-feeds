import {readFileSync} from 'node:fs';

export function reconstructAnalystQueueEditor(){
 const root=new URL('../../backend/editor/src/analysts/',import.meta.url);
 const editor=readFileSync(new URL('editor.mjs',root),'utf8');
 const queue=readFileSync(new URL('queue-runner.mjs',root),'utf8');
 const imported="import {createAnalystQueue} from './queue-runner.mjs';\n";
 const deps='EDITOR_VERSION,HOUR,DAY,MAX_AI_PER_RUN,REGION,plain,readEditorCachedPair,readMirror,sha256,validateInput,insertItem,decide';
 const signature='export function createAnalystQueue({'+deps+'}) {\n';
 const call='const {prioritizePending,runEditor}=createAnalystQueue({'+deps+'});\n';
 const end='return {prioritizePending,runEditor};\n}\n';
 if(!editor.includes(imported)||!editor.includes(call)||!queue.startsWith(signature)||!queue.endsWith(end))
  throw Error('analyst queue source split changed');
 const begin=queue.indexOf('// Rotate authors so one busy source cannot starve others.');
 const priority=queue.indexOf('function prioritizePending(rows)',begin);
 const run=queue.indexOf('async function runEditor(env, time)',priority);
 const finish=queue.lastIndexOf(end);
 if(!(begin>=signature.length&&priority>begin&&run>priority&&finish>run))
  throw Error('queue method bodies missing or moved');
 return editor.replace(imported,'').replace(call,queue.slice(signature.length,finish));
}
