export function buildDigest(rows,eventRows){
 if(!Array.isArray(rows)||rows.length<2)return {status:"pending",changes:[],lastCheck:rows?.[0]?.started_at_ms?new Date(rows[0].started_at_ms).toISOString():null,previousCheck:null,periodMinutes:null,sourceUpdates:0,sourceComparable:0};
 const [latest,prior]=rows,latestMs=Number(latest.started_at_ms),prevMs=Number(prior.started_at_ms);
 if(!Number.isFinite(latestMs)||!Number.isFinite(prevMs)||latestMs<=prevMs)return {status:"error",changes:[],error:"invalid_monitor_run_times"};
 const parse=s=>{try{return JSON.parse(s||"{}")}catch{return {}}};
 const a=parse(latest.payload),b=parse(prior.payload),oldS=b.source_maxima_ms||{},newS=a.source_maxima_ms||{};
 const common=Object.keys(newS).filter(k=>Number.isFinite(Number(newS[k]))&&Number.isFinite(Number(oldS[k])));
 const sourceUpdates=common.filter(k=>Number(newS[k])>Number(oldS[k])).length;
 const changedEvents=(Array.isArray(eventRows)?eventRows:[]).filter(x=>Number(x.updated_at_ms)>prevMs&&Number(x.updated_at_ms)<=latestMs);
 const changes=changedEvents.slice(0,6).map(x=>({id:"monitor-event-"+x.event_id,story_id:x.event_id,kind:"journal_updated",title:"Обновлено досье мониторинга",title_he:"עודכן תיק מעקב",description:"Поступило обновление записи; само по себе это не подтверждает утверждения источников.",description_he:"עודכנה רשומת המעקב; העדכון עצמו אינו מאמת טענות של מקורות.",time:new Date(Number(x.updated_at_ms)).toISOString()}));
 if(latest.outcome!==prior.outcome)changes.unshift({id:"monitor-state-"+latest.run_id,kind:"assessment_changed",title:"Изменилось решение мониторинга",title_he:"השתנתה הערכת המעקב",description:"Текущий статус: "+String(latest.outcome).slice(0,50),description_he:"מצב הבדיקה: "+String(latest.outcome).slice(0,50),time:new Date(latestMs).toISOString()});
 return{status:(common.length||changes.length)?"ready":"insufficient_comparison",changes,lastCheck:new Date(latestMs).toISOString(),previousCheck:new Date(prevMs).toISOString(),periodMinutes:Math.round((latestMs-prevMs)/60000),sourceUpdates,sourceComparable:common.length,outcome:latest.outcome,previousOutcome:prior.outcome};
}

export async function readMonitorChanges(request,env){
 const url=new URL(request.url);
 const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET,OPTIONS'}});
 if(request.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers});
 const lang=url.searchParams.get('lang')||'ru';
 if(lang!=='ru'&&lang!=='he')return Response.json({error:'unsupported_language'},{status:400,headers});
 try{
  const result=await env.CORE_DB.prepare('SELECT run_id,started_at_ms,outcome,payload FROM monitor_runs ORDER BY started_at_ms DESC LIMIT 2').all();
  const runs=result.results||[];
  const prev=Number(runs[1]?.started_at_ms||0),last=Number(runs[0]?.started_at_ms||0);
  let events=[];
  if(prev>0&&last>prev){const v=await env.CORE_DB.prepare('SELECT event_id,updated_at_ms FROM monitor_events WHERE updated_at_ms > ? AND updated_at_ms <= ? ORDER BY updated_at_ms DESC LIMIT 6').bind(prev,last).all();events=v.results||[];}
  const digest=buildDigest(runs,events);
  return Response.json({requested_language:lang,...digest},{status:200,headers});
 }catch(e){return Response.json({error:'digest_unavailable',message:'monitor_comparison_not_available'},{status:503,headers});}
}

