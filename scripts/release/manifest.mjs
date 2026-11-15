import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join,resolve,relative,sep} from 'node:path';

const required=[
  'pages/_worker.js','pages/index.html','pages/he/index.html',
  'pages/assets/app.js','pages/assets/app.css',
  'workers/editor.mjs','workers/monitor.mjs',
  'config/editor.json','config/monitor.json','metadata/contract.json'
];

export function hashBytes(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}
function collect(dir,sub=''){
  const files=[];
  for(const entry of readdirSync(join(dir,sub),{withFileTypes:true})){
    const rel=sub?sub+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw Error('Unexpected symlink in release artifact: '+rel);
    if(entry.isDirectory())files.push(...collect(dir,rel));
    else if(entry.isFile()&&rel!=='manifest.json')files.push(rel);
    else if(!entry.isFile())throw Error('Unexpected release artifact entry: '+rel);
  }
  return files.sort();
}
function digest(dir,rel){
  const bytes=readFileSync(join(dir,...rel.split('/')));
  return {sha256:hashBytes(bytes),size:bytes.length};
}
export function buildManifest(dir,sourceSha){
  if(!/^[a-f0-9]{40}$/.test(sourceSha))throw Error('Invalid source SHA');
  const files=collect(dir);
  for(const name of required)if(!files.includes(name))throw Error('Missing release artifact '+name);
  return {schema_version:1,source_sha:sourceSha,files:Object.fromEntries(files.map(name=>[name,digest(dir,name)]))};
}
export function verifyManifest(dir,expectedSha){
  const manifest=JSON.parse(readFileSync(join(dir,'manifest.json'),'utf8'));
  if(manifest.schema_version!==1||!manifest.files||manifest.source_sha!==expectedSha||!/^[a-f0-9]{40}$/.test(manifest.source_sha))throw Error('Release source SHA or schema mismatch');
  const actual=buildManifest(dir,expectedSha);
  const recorded=Object.keys(manifest.files).sort();
  if(JSON.stringify(recorded)!==JSON.stringify(Object.keys(actual.files).sort()))throw Error('Unexpected or missing release file');
  for(const [name,check] of Object.entries(actual.files)){
    const original=manifest.files[name];
    if(!original||original.sha256!==check.sha256||original.size!==check.size)throw Error('Release digest mismatch: '+name);
  }
  return manifest;
}
