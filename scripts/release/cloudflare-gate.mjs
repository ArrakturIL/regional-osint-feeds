// Release preflight and emergency rollback. Prints no tokens, secrets or payloads.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const readJson=p=>JSON.parse(readFileSync(p,'utf8'));
const need=(ok,what)=>{if(!ok)throw Error('Release contract violation: '+what);};
const matchName=(items,name,type)=>items.find(b=>b.name===name&&b.type===type);
const d1id=b=>b.id??b.database_id;

export function validateWorker(worker,settings,schedules){
 const bindings=settings?.bindings||[];
 for(const {binding,database_id} of worker.d1){
   const entry=matchName(bindings,binding,'d1');
   need(entry&&d1id(entry)===database_id,'Worker '+worker.key+' D1 binding '+binding);
 }
 for(const secret of worker.secrets||[])
   need(matchName(bindings,secret,'secret_text'),'Worker '+worker.key+' secret '+secret);
 for(const variable of worker.vars||[])
   need(matchName(bindings,variable,'plain_text'),'Worker '+worker.key+' variable '+variable);
 if(worker.ai)need(matchName(bindings,worker.ai,'ai'),'Worker '+worker.key+' AI binding');
 const crons=(schedules||[]).map(s=>s.cron);
 need(crons.length===1&&crons[0]===worker.cron,'Worker '+worker.key+' cron schedule');
 need(settings.compatibility_date==='2026-11-10','Worker '+worker.key+' compatibility_date');
}
export function validateSubdomain(subdomain,worker){
 need(subdomain?.enabled===true,'Worker '+worker.name+' workers.dev availability');
 need(subdomain.previews_enabled===false,'Worker '+worker.name+' preview URLs must be disabled');
}
export function validatePages(pages,project){
 need(project?.production_branch===pages.production_branch,'Pages production branch');
 const settings=project?.deployment_configs?.production;
 need(settings,'Pages production binding config');
 for(const {binding,service} of pages.services){
   const s=settings.services?.[binding];
   need(s?.service===service&&(s.environment===undefined||s.environment==='production'),'Pages '+binding+' service binding');
 }
 for(const {binding,database_id} of pages.d1){
   const db=settings.d1_databases?.[binding];
   need(db&&d1id(db)===database_id,'Pages '+binding+' D1 binding');
 }
}
const token=name=>{const v=process.env[name];if(!v)throw Error('Required GitHub secret missing: '+name);return v;};
const account=()=>{const id=token('CLOUDFLARE_ACCOUNT_ID');need(/^[a-f0-9]{32}$/.test(id),'invalid Cloudflare account identifier');return id;};
async function api(key,path,method='GET',body){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account()+path,{
    method,headers:{'Authorization':'Bearer '+token(key),'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 if(!response.ok)throw Error('Cloudflare API '+method+' failed: HTTP '+response.status);
 const j=await response.json();
 if(!j?.success)throw Error('Cloudflare API rejected '+method+' on '+path.split('/').slice(0,3).join('/'));
 return j.result;
}
const paths=name=>({
 subdomain:'/workers/scripts/'+encodeURIComponent(name)+'/subdomain',
 settings:'/workers/scripts/'+encodeURIComponent(name)+'/settings',
 schedules:'/workers/scripts/'+encodeURIComponent(name)+'/schedules',
 deployments:'/workers/scripts/'+encodeURIComponent(name)+'/deployments'
});
function latestVersion(deployments){
 const first=(deployments?.deployments||[])[0];
 const version=first?.versions?.find(v=>v.percentage===100)?.version_id;
 need(/^[0-9a-f-]{36}$/.test(version||''),'Worker missing a single 100% deployed version');
 return version;
}
async function workerState(w,check=true){
 const path=paths(w.name);
 const [settings,schedules,deployments,subdomain]=await Promise.all([
   api('CLOUDFLARE_D1_API_TOKEN',path.settings),
   api('CLOUDFLARE_D1_API_TOKEN',path.schedules),
   api('CLOUDFLARE_D1_API_TOKEN',path.deployments),
   api('CLOUDFLARE_D1_API_TOKEN',path.subdomain)
 ]);
 if(check){
   validateWorker(w,settings,schedules.schedules);
   validateSubdomain(subdomain,w);
 }
 return {key:w.key,name:w.name,version_id:latestVersion(deployments),previews_enabled:subdomain?.previews_enabled};
}
async function pagesState(pages,check=true){
 const p='/pages/projects/'+encodeURIComponent(pages.project);
 const project=await api('CLOUDFLARE_API_TOKEN',p);
 if(check)validatePages(pages,project);
 // Cloudflare retains rolled-back deployments as the most recently CREATED
 // release. The active production target is canonical_deployment, not latest.
 const active=project?.canonical_deployment;
 need(active?.environment==='production' && active?.latest_stage?.status==='success' &&
      /^[0-9a-f-]{36}$/.test(active.id||''),'Pages has no active canonical production deployment');
 return {project:pages.project,deployment_id:active.id};
}
async function capture(contract,sourceSha,filename){
 need(/^[a-f0-9]{40}$/.test(sourceSha),'missing exact release source SHA');
 const [workers,pages]=await Promise.all([
   Promise.all(contract.workers.map(w=>workerState(w))),
   pagesState(contract.pages)
 ]);
 const state={schema_version:1,source_sha:sourceSha,workers,pages};
 writeFileSync(filename,JSON.stringify(state,null,2)+'\n',{mode:0o600});
 console.log('release preflight: live Pages and Worker bindings/schedules validated');
}
async function postcheck(contract,sourceSha,file){
 const baseline=readJson(file);
 need(baseline.source_sha===sourceSha,'baseline source SHA');
 await Promise.all([Promise.all(contract.workers.map(w=>workerState(w))),pagesState(contract.pages)]);
 console.log('release postcheck: production bindings, cron, identities and D1 links valid');
}
async function rollback(contract,sourceSha,file){
 const baseline=readJson(file);
 need(baseline.schema_version===1&&baseline.source_sha===sourceSha,'rollback baseline identity');
 let errors=0;
 // Revert changed Workers to exact captured version; never use "previous" guessing.
 for(const w of contract.workers){
   const before=baseline.workers.find(x=>x.key===w.key&&x.name===w.name);
   need(before&&/^[0-9a-f-]{36}$/.test(before.version_id),'missing Worker restore version');
   try{
     const now=await workerState(w,false);
     if(now.version_id!==before.version_id){
       await api('CLOUDFLARE_D1_API_TOKEN',paths(w.name).deployments,'POST',{
         strategy:'percentage',versions:[{percentage:100,version_id:before.version_id}],
         annotations:{'workers/message':'Regional Watch release '+sourceSha.slice(0,12)+' rollback'}
       });
       console.log('rollback restored previous Worker version:',w.key);
     }
     // Deploying an older version does not necessarily restore preview URL settings.
     if(now.previews_enabled!==false){
       await api('CLOUDFLARE_D1_API_TOKEN',paths(w.name).subdomain,'POST',{enabled:true,previews_enabled:false});
       const verified=await api('CLOUDFLARE_D1_API_TOKEN',paths(w.name).subdomain);
       validateSubdomain(verified,w);
       console.log('rollback disabled Worker preview URLs:',w.key);
     }
   }catch(err){errors++;console.error('rollback Worker failed:',w.key,err?.message?.replace(/Bearer \S+/g,'Bearer [redacted]'));}
 }
 try{
   const now=await pagesState(contract.pages,false),before=baseline.pages;
   need(before?.project===contract.pages.project&&/^[0-9a-f-]{36}$/.test(before.deployment_id),'missing Pages restore deployment');
   if(now.deployment_id!==before.deployment_id){
     const path='/pages/projects/'+encodeURIComponent(contract.pages.project)+'/deployments/'+before.deployment_id+'/rollback';
     await api('CLOUDFLARE_API_TOKEN',path,'POST',{});
     console.log('rollback restored previous Pages production deployment');
   }
 }catch(err){errors++;console.error('rollback Pages failed:',err?.message);}
 if(errors)throw Error('rollback incomplete, inspect the recorded baseline and Cloudflare deployments');
 console.log('rollback check complete');
}
async function receipt(contract,sourceSha,baselineFile,outputFile){
 const baseline=readJson(baselineFile);
 const bytes=readFileSync('release/manifest.json');
 const manifest=JSON.parse(bytes.toString('utf8'));
 need(baseline.source_sha===sourceSha&&manifest.source_sha===sourceSha,'release receipt source SHA');
 const [workers,pages]=await Promise.all([
   Promise.all(contract.workers.map(w=>workerState(w))),
   pagesState(contract.pages)
 ]);
 const record={
   schema_version:1,source_sha:sourceSha,
   workflow_run:process.env.GITHUB_RUN_ID||null,
   manifest_sha256:createHash('sha256').update(bytes).digest('hex'),
   migration_hashes:readJson('release/metadata/migrations.json'),
   before:baseline,after:{workers,pages}
 };
 writeFileSync(outputFile,JSON.stringify(record,null,2)+'\n',{mode:0o600});
 console.log('Release receipt saved: verified Pages + '+workers.length+' Workers on source '+sourceSha.slice(0,12));
}
export async function main(argv=process.argv.slice(2)){
 const [verb,sourceSha,file,output]=argv;
 const contract=readJson('deploy/release-contract.json');
 if(verb==='capture')await capture(contract,sourceSha,file);
 else if(verb==='postcheck')await postcheck(contract,sourceSha,file);
 else if(verb==='rollback')await rollback(contract,sourceSha,file);
 else if(verb==='receipt')await receipt(contract,sourceSha,file,output);
 else throw Error('usage: cloudflare-gate.mjs capture|postcheck|rollback|receipt <sha> <baseline-file> [receipt-file]');
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
 main().catch(e=>{console.error('Release gate:',e?.message?.split('\n')[0]);process.exitCode=1});
}
