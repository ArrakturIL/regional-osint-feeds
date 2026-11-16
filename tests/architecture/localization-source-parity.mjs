import {readFileSync} from 'node:fs';
import {reconstructContentFacade} from './localization-content-parity.mjs';

const requirePart=(text,needle,label)=>{
 const start=text.indexOf(needle);
 if(start<0)throw Error(label+' boundary missing: '+needle);
 return start;
};

export function reconstructReaderFacade(){
 const root=new URL('../../backend/editor/src/localization/',import.meta.url);
 const main=reconstructContentFacade();
 const core=readFileSync(new URL('read-core.mjs',root),'utf8');
 const analyst=readFileSync(new URL('analyst-api.mjs',root),'utf8');
 const readerImports="import {HEADERS,respond,fieldLocale,localized} from './read-core.mjs';\n"
   +"import {readLocalizedAnalysts} from './analyst-api.mjs';\n";
 const factImport="import {factualTranslationIssue} from '../translations/fact-guard.mjs';\n";
 requirePart(main,readerImports,'facade import');
 const headerStart=requirePart(core,'export const HEADERS=','CORS');
 const cacheStart=requirePart(core,'// Field metadata describes displayed text','translation metadata');
 const headers=core.slice(headerStart,cacheStart)
   .replace('export const HEADERS=','const HEADERS=')
   .replace('export function respond(','function respond(');
 const common=core.slice(cacheStart)
   .replace('export function fieldLocale(','function fieldLocale(')
   .replace('export async function localized(','async function localized(');
 const branchFunction='export async function readLocalizedAnalysts(request,env,analystService,lang,path){\n';
 const analystStart=requirePart(analyst,branchFunction,'analyst adapter')+branchFunction.length;
 if(!analyst.endsWith('}\n'))throw Error('analyst function closing boundary');
 const body=analyst.slice(analystStart,-2);
 const stub='    return readLocalizedAnalysts(request,env,analystService,lang,path);\n';
 requirePart(main,stub,'analyst delegation');
 let restored=main.replace(readerImports,'')
   .replace('function locale(request){',headers+'function locale(request){')
   .replace('/** One trusted localization contract for event and legacy news responses. */',
     common+'/** One trusted localization contract for event and legacy news responses. */')
   .replace(stub,body);
 return factImport+restored;
}
