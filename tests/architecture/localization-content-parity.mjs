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

// B3 part 2 is an intentionally narrow change: news-reader calls the shared
// verify (glossary + meaning rules, explicit target language) instead of the
// meaning-only check. Reverse exactly these reviewed lines before rebuilding.
const B3_VERIFY=[ // B3 verify + B4 display policy
 ["import {translationIssue} from '../translations/verify.mjs';\n",""],
 ["    // RU summaries are often abridged, so an entity from a later source\n    // sentence may be legitimately absent: the body gets meaning rules only.\n",""],
 ["translationIssue(sourceTitle,title,'ru')","semanticMeaningIssue(sourceTitle,title)"],
 ["semanticMeaningIssue(sourceBody,body,'ru')","semanticMeaningIssue(sourceBody,body)"],
 // B4: page language rules (display-policy.mjs) applied to each news row.
 ["import {displayForPage} from './display-policy.mjs';\n",""],
 ["      const t=displayForPage(n,await localizeNewsRow(env.NEWS_DB,n,lang),lang); // B4\n      if(!t)return null;\n","      const t=await localizeNewsRow(env.NEWS_DB,n,lang);\n"],
 [",language_shown:t.language_shown,translation_status:t.translation_status};",",translation_status:t.translation_status};"],
 ["    const shown=articles.filter(Boolean);\n",""],
 ["shown.filter(x=>x.content_language==='he'&&x.translation_status==='available'):shown;","articles.filter(x=>x.content_language==='he'&&x.translation_status==='available'):articles;"],
 ["withheld_count:articles.length-shown.length,limit:lim,","limit:lim,"],
 ["translationIssue(sourceTitle,result.title,'he')","semanticMeaningIssue(sourceTitle,result.title)"],
 ["translationIssue(sourceBody,result.body,'he')","semanticMeaningIssue(sourceBody,result.body)"],
];
const revertB3=text=>B3_VERIFY.reduce((t,[now,was])=>{
 if(!t.includes(now))throw Error('B3 verify boundary missing: '+now);
 return t.split(now).join(was);
},text);

export function reconstructContentFacade(){
 const main=load('localization.mjs'),news=revertB3(load('news-reader.mjs')),
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
