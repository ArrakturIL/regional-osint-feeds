import {reconstructPreRetryScheduler} from './localization-retry-source-parity.mjs';

// Reconstruct exact prior ARCH-03 scheduled translator source across the explicitly
// reviewed ARCH-04 quota/telemetry changes. Unrelated edits must fail the Git blob pin.
export function reconstructPreBudgetScheduler(){
 let source=reconstructPreRetryScheduler();
 function undo(newText,oldText,label){
  if(!source.includes(newText))throw Error('ARCH-04 source boundary changed: '+label);
  source=source.replace(newText,oldText);
 }
 undo("const HE_MODEL='@cf/zai-org/glm-4.7-flash';\nconst HE_DAILY_ATTEMPT_CAP=112;\n",
      "const HE_MODEL='@cf/zai-org/glm-4.7-flash';\n",'limit constant');
 undo('attempts<? AND estimated_neurons<4000\").bind(now,day,HE_DAILY_ATTEMPT_CAP).run()',
      'attempts<96 AND estimated_neurons<4000\").bind(now,day).run()','atomic limit');
 undo("    neurons=Number(answer?.usage?.neurons)||0;\n    if(answer?.choices?.[0]?.finish_reason",
      "    if(answer?.choices?.[0]?.finish_reason",'response usage');
 undo("    state='ok';\n  }catch(e)", "    neurons=Number(answer?.usage?.neurons)||0;\n    state='ok';\n  }catch(e)",'old success-only accounting');
 const newGate=`    if((budget?.attempts||0)>=HE_DAILY_ATTEMPT_CAP||(budget?.estimated_neurons||0)>=4000){
      const blocked={state:'budget',attempts:budget?.attempts||0,estimated_neurons:budget?.estimated_neurons||0,limit:HE_DAILY_ATTEMPT_CAP};
      await env.NEWS_DB.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_he_localization',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(JSON.stringify(blocked),Date.now()).run();
      return{state:'budget'};
    }`;
 undo(newGate,"    if((budget?.attempts||0)>=96||(budget?.estimated_neurons||0)>=4000)return{state:'budget'};",'entry budget persisted state');
 undo('    let attempted=0,translated=0,rejected=0,budgetHit=false;',
      '    let attempted=0,translated=0,rejected=0;','midcycle gate flag');
 undo("      if(result==='budget'){budgetHit=true;break;}","      if(result==='budget')break;",'midcycle budget break');
 undo("    const state={state:budgetHit?'budget':rejected?'partial':'ok',kind,attempted,translated,rejected,at:new Date().toISOString()};",
      "    const state={state:'ok',kind,attempted,translated,rejected,at:new Date().toISOString()};",'partial status');
 return source;
}
