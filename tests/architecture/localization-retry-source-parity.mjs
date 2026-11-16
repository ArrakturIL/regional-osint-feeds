import {readFileSync} from 'node:fs';

// Restore the exact source of the deployed PR #70 scheduler from the narrow
// ARCH-04 retry and candidate-order patch; guard every touched boundary.
export function reconstructPreRetryScheduler(){
 let s=readFileSync(new URL('../../backend/editor/src/localization/scheduled.mjs',import.meta.url),'utf8');
 function undo(current,previous,label){
   if(!s.includes(current))throw Error('unexpected retry source boundary: '+label);
   s=s.replace(current,previous);
 }
 undo("import {eligibleHebrewRetry} from './retry-policy.mjs';\n",'','retry import');
 undo("ORDER BY (t.item_id IS NULL) DESC,n.published_ms DESC,n.priority DESC LIMIT 120",
      "ORDER BY (t.item_id IS NULL) DESC,n.priority DESC,n.published_ms DESC LIMIT 120",'fresh news order');
 undo("SELECT state,retry_count,error,attempted_at_ms FROM regional_i18n_attempts WHERE kind=?",
      "SELECT state,retry_count FROM regional_i18n_attempts WHERE kind=?",'prior attempt schema');
 undo("    if(!eligibleHebrewRetry(prev,now))return'attempted';",
      "    if(prev?.state!=='error'||(prev.retry_count||0)>=1)return'attempted';",'same-day retry gate');
 return s;
}
