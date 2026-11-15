// Deterministic, immutable release packaging for Cloudflare Pages + Editor + Monitor.
// This file only builds artifacts; it never calls Cloudflare or changes production.
import {execFileSync} from 'node:child_process';
import {copyFileSync,cpSync,existsSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {hashBytes,buildManifest} from './manifest.mjs';

function run(program,args){
 execFileSync(program,args,{cwd:process.cwd(),stdio:'inherit',timeout:180000});
}
function write(path,obj){
 mkdirSync(dirname(path),{recursive:true});
 writeFileSync(path,JSON.stringify(obj,null,2)+'\n');
}
export function migrationMap(root){
 const files=[];
 for(const prefix of ['storage/cloudflare','storage/neon']){
   const dir=join(root,prefix);
   if(!existsSync(dir))continue;
   function descend(current){
     for(const e of readdirSync(current,{withFileTypes:true})){
       const full=join(current,e.name);
       if(e.isSymbolicLink())throw Error('Migration symlink rejected');
       if(e.isDirectory())descend(full);
       if(e.isFile()&&e.name.endsWith('.sql')){
         files.push({path:full.slice(root.length+1).replaceAll('\\','/'),sha256:hashBytes(readFileSync(full))});
       }
     }
   }
   descend(dir);
 }
 return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export function expectedWorkerConfig(root,key){
 const source=JSON.parse(readFileSync(join(root,'deploy/wrangler.'+key+'.production.json'),'utf8'));
 // Keep the release artifact self-contained: no reference to checkout paths.
 source.main='../workers/'+key+'.mjs';
 return source;
}
export function packageRelease(root,sha){
 if(!/^[a-f0-9]{40}$/.test(sha))throw Error('Expected checked-out Git source SHA');
 const out=join(root,'release');
 if(existsSync(out))rmSync(out,{recursive:true,force:true});
 mkdirSync(out,{recursive:true});
 cpSync(join(root,'frontend/dist'),join(out,'pages'),{recursive:true,errorOnExist:false});
 mkdirSync(join(out,'workers'),{recursive:true});
 copyFileSync(join(root,'backend/editor/dist/worker.modern.mjs'),join(out,'workers/editor.mjs'));
 copyFileSync(join(root,'backend/monitor/dist/worker.modern.mjs'),join(out,'workers/monitor.mjs'));
 write(join(out,'config/editor.json'),expectedWorkerConfig(root,'editor'));
 write(join(out,'config/monitor.json'),expectedWorkerConfig(root,'monitor'));
 mkdirSync(join(out,'metadata'),{recursive:true});
 copyFileSync(join(root,'deploy/release-contract.json'),join(out,'metadata/contract.json'));
 write(join(out,'metadata/migrations.json'),migrationMap(root));
 const manifest=buildManifest(out,sha);
 write(join(out,'manifest.json'),manifest);
 return manifest;
}
export function buildRelease(root,sourceSha){
 const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(actual!==sourceSha)throw Error('Checkout SHA does not match release source SHA');
 run(process.execPath,['frontend/scripts/build-site.mjs']);
 const esbuild=['exec','--yes','--package=esbuild@0.25.0','--','esbuild'];
 run('npm',[...esbuild,'backend/pages/src/index.js','--bundle','--format=esm','--target=es2022','--outfile=frontend/dist/_worker.js']);
 run('npm',[...esbuild,'backend/editor/src/index.js','--bundle','--format=esm','--target=es2022','--outfile=backend/editor/dist/worker.modern.mjs']);
 run('npm',[...esbuild,'backend/monitor/src/index.js','--bundle','--format=esm','--target=es2022','--outfile=backend/monitor/dist/worker.modern.mjs']);
 for(const file of ['frontend/dist/_worker.js','backend/editor/dist/worker.modern.mjs','backend/monitor/dist/worker.modern.mjs'])
   run(process.execPath,['--check',file]);
 return packageRelease(root,sourceSha);
}
if(import.meta.url===new URL('file://'+process.argv[1]).href){
 try{
   const sha=process.argv[2];
   const manifest=buildRelease(process.cwd(),sha);
   console.log('Release bundle: source_sha='+manifest.source_sha+', immutable_files='+Object.keys(manifest.files).length);
 }catch(err){console.error('Release build failed:',err?.message?.split('\n')[0]);process.exitCode=1;}
}
