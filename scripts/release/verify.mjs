import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {verifyManifest} from './manifest.mjs';
import {expectedWorkerConfig,migrationMap} from './build.mjs';

export function verifyRelease(root,sha){
 const current=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(current!==sha)throw Error('Checkout not at specified release source SHA');
 const releaseDir=resolve(root,'release');
 const manifest=verifyManifest(releaseDir,sha);
 const source=JSON.parse(readFileSync(join(root,'deploy/release-contract.json'),'utf8'));
 const snap=JSON.parse(readFileSync(join(releaseDir,'metadata/contract.json'),'utf8'));
 if(JSON.stringify(source)!==JSON.stringify(snap))throw Error('Release contract differs from checked-out source');
 if(source.schema_version!==1||source.workers?.length!==2)throw Error('Release contract schema mismatch');
 for(const [sourceName,releaseName] of [
   ['config/collector-rollout.json','metadata/collector-rollout.json'],
   ['.github/workflows/regional-watch-app-check.yml','metadata/release-workflow.yml']
 ]){
   if(!readFileSync(join(root,sourceName)).equals(readFileSync(join(releaseDir,releaseName))))
     throw Error('Release workflow flags or CI contract differ from checked-out source: '+sourceName);
 }

 for(const w of source.workers){
   const config=JSON.parse(readFileSync(join(releaseDir,'config',w.key+'.json'),'utf8'));
   const expected=expectedWorkerConfig(root,w.key);
   if(JSON.stringify(config)!==JSON.stringify(expected)||config.name!==w.name||!config.keep_vars||!config.workers_dev)
     throw Error('Worker config mismatch: '+w.key);
 }
 const migrations=JSON.parse(readFileSync(join(releaseDir,'metadata/migrations.json'),'utf8'));
 if(JSON.stringify(migrations)!==JSON.stringify(migrationMap(root)))
   throw Error('Release D1 migration checksums mismatch');
 return manifest;
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
   const x=verifyRelease(process.cwd(),process.argv[2]);
   console.log('Verified immutable coordinated release: '+x.source_sha+'; files='+Object.keys(x.files).length);
 }catch(e){console.error('Release verification failed:',e?.message?.split('\n')[0]);process.exitCode=1;}
}
