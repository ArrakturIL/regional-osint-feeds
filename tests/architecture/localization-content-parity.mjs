import {readFileSync} from 'node:fs';

const root=new URL('../../backend/editor/src/localization/',import.meta.url);
const oldHeader=[
 "import {semanticMeaningIssue} from '../translations/semantic-meaning.mjs';",
 "import {shouldSuppressComment,safePublishedComment} from '../editorial/comment-policy.mjs';",
 "import {DAY,val,sourceText,fingerprint} from './shared.mjs';",
 "import {HEADERS,respond,fieldLocale,localized} from './read-core.mjs';",
 "import {readLocalizedAnalysts} from './analyst-api.mjs';",
 "import {translateScheduled} from './scheduled.mjs';",
 "export {fingerprint} from './shared.mjs';",
 ''
].join('\n');
const newHeader=[
 "import {HEADERS,respond} from './read-core.mjs';",
 "import {readLocalizedNews} from './news-reader.mjs';",
 "import {readLocalizedEditorialNotes} from './editorial-reader.mjs';",
 "import {readLocalizedStories} from './stories-reader.mjs';",
 "import {readLocalizedAnalysts} from './analyst-api.mjs';",
 "import {translateScheduled} from './scheduled.mjs';",
 "export {fingerprint} from './shared.mjs';",
 "export {localizeNewsRow} from './news-reader.mjs';",
 "export {storyProvenance} from './stories-reader.mjs';",
 ''
].join('\n');

const load=name=>readFileSync(new URL(name,root),'utf8');
const before=(text,start,end,label)=>{
 const a=text.indexOf(start),b=text.indexOf(end,a);
 if(a<0||b<a)throw Error('missing '+label+' source boundary');
 return text.slice(a,b);
};
// B-04 is an intentionally additive API change. To prove all *other*
// pre-extraction text remains byte-for-byte frozen, remove this exact,
// reviewed addition before reconstructing the historical Git blob.
const extractBody=(source,signature,label)=>{
 const a=source.indexOf(signature);
 if(a<0||!source.endsWith('}\n'))throw Error('missing '+label+' signature/closure');
 let body=source.slice(a+signature.length,-2);
 if(label==='/api/editorial-notes'){
  const addition="      const locale=fieldLocale(note,['headline','text','verified_note'],lang,t.translation_status);\n      const status=locale.field_translation_status;\n      const good=new Set(['source','available','not_applicable']);\n      const coreReady=['headline','text'].every(k=>good.has(status[k]));\n      return{...note,...locale,core_translation_status:coreReady?'available':\n        ['headline','text'].some(k=>status[k]==='needs_review')?'needs_review':'pending',\n        pending_fields:Object.keys(status).filter(k=>status[k]==='pending'||status[k]==='needs_review')};";
  if(!body.includes(addition))throw Error('B-04 narrow completeness-contract boundary missing');
  body=body.replace(addition,"      return{...note,...fieldLocale(note,['headline','text','verified_note'],lang,t.translation_status)};");
 }
 return body;
};

export function reconstructContentFacade(){
 const main=load('localization.mjs'),news=load('news-reader.mjs'),
   editorial=load('editorial-reader.mjs'),stories=load('stories-reader.mjs');
 if(!main.startsWith(newHeader))throw Error('unexpected public content facade import contract');
 const newsHelper=before(news,'/** One trusted localization contract','export async function readLocalizedNews','news helper');
 const storyHelper=before(stories,'/** Locale-invariant provenance','export async function readLocalizedStories','story helper');
 let restored=oldHeader+main.slice(newHeader.length);
 const fetchAnchor='export async function fetchLocalized(request,env,analystService){';
 if(!restored.includes(fetchAnchor))throw Error('public fetch route missing');
 restored=restored.replace(fetchAnchor,newsHelper+storyHelper+fetchAnchor);
 const readers=[
  [news,'/api/news','readLocalizedNews(env,url,lang,lim,rawOffset)',
   'export async function readLocalizedNews(env,url,lang,lim,rawOffset){\n'],
  [editorial,'/api/editorial-notes','readLocalizedEditorialNotes(env,lang,lim)',
   'export async function readLocalizedEditorialNotes(env,lang,lim){\n'],
  [stories,'/api/stories','readLocalizedStories(env,lang,lim)',
   'export async function readLocalizedStories(env,lang,lim){\n']
 ];
 for(const [source,path,call,sig] of readers){
  const branch="  if(path==='"+path+"'){\n";
  const stub=branch+'    return '+call+';\n  }\n';
  if(!restored.includes(stub))throw Error('missing '+path+' router stub');
  restored=restored.replace(stub,branch+extractBody(source,sig,path)+'  }\n');
 }
 return restored;
}
