// Read-only D1 schema compatibility check, not a migration executor.
// Migrations must be reviewed/applied separately; a release with a missing
// required table or column fails BEFORE any Worker/Pages deployment.
import {readFileSync} from 'node:fs';

const isIdentifier=x=>/^[a-z][a-z0-9_]*$/.test(x);
export function verifyColumns(required,rows,context){
 const names=new Set((rows||[]).map(r=>r?.name));
 for(const name of required){
   if(!names.has(name))throw Error('D1 incompatible schema: '+context+'.'+name);
 }
}
export async function checkD1(contract,query){
 if(!Array.isArray(contract.schemas)||contract.schemas.length!==2)throw Error('D1 release schemas missing');
 let tables=0;
 for(const schema of contract.schemas){
   if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(schema.database_id))throw Error('Invalid D1 ID in release schema');
   for(const [table,required] of Object.entries(schema.tables)){
     if(!isIdentifier(table)||!Array.isArray(required)||!required.every(isIdentifier))throw Error('Unsafe D1 schema contract');
     const result=await query(schema.database_id,'PRAGMA table_info('+table+')');
     verifyColumns(required,result,schema.key+'.'+table);
     tables++;
   }
 }
 return tables;
}
export async function main(){
 const account=process.env.CLOUDFLARE_ACCOUNT_ID;
 const token=process.env.CLOUDFLARE_D1_API_TOKEN;
 if(!account||!token||!/^[a-f0-9]{32}$/.test(account))throw Error('D1 release preflight credential missing');
 const contract=JSON.parse(readFileSync('deploy/release-contract.json','utf8'));
 const query=async(database_id,sql)=>{
   const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database_id+'/query';
   const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql})});
   if(!r.ok)throw Error('D1 schema check failed HTTP '+r.status);
   const j=await r.json();
   if(!j?.success||!Array.isArray(j.result?.[0]?.results))throw Error('D1 schema query unavailable');
   return j.result[0].results;
 };
 const tables=await checkD1(contract,query);
 console.log('Verified read-only production D1 table/column compatibility: '+tables+' tables');
}
if(import.meta.url===new URL('file://'+process.argv[1]).href)
 main().catch(err=>{console.error('D1 preflight:',err?.message?.split('\n')[0]);process.exitCode=1});
