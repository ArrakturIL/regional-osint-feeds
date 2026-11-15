import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const appSource=readFileSync(new URL('../src/app/App.js',import.meta.url),'utf8')
  .replace(/^import\s+[^\n]+\n/gm,'')
  .replace('export function App()','function App()');

function invokeApp(pathname){
 const calls=[];
 const locale=pathname==='/he/'||pathname.startsWith('/he/');
 const context={
   UI_HE:locale,
   location:{pathname,search:'',hash:'',origin:'https://regional-watch.pages.dev',href:'https://regional-watch.pages.dev'+pathname},
   useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],
   useRef:initial=>({current:initial}),
   useEffect:()=>{},
   useFeed:(url,interval,enabled)=>{
     calls.push({url,enabled});
     return {value:null,error:null};
   },
   h:(type,props,...children)=>({type,props,children}),
   HE_TEXT:{home:['Home'],events:['Events'],data:['Data'],analysts:['Analysts']},
   GlobalHeader(){},HomeV2(){},CasesPageV2(){},DataRoomV2(){},AnalystShared(){},
   rwNormalizeNewsArticle:article=>article,
   window:{scrollY:0,addEventListener(){}},
   history:{pushState(){}}
 };
 const view=vm.runInNewContext(appSource+'\nApp()',context,{filename:'frontend/src/app/App.js'});
 return {view,calls};
}

for(const pathname of ['/','/he/','/events/','/he/events/','/data/','/he/data/','/analysts/','/he/analysts/']){
 test('React App renders without ReferenceError for '+pathname,()=>{
   const {view,calls}=invokeApp(pathname);
   assert.equal(view.type,'div','root App must render a visible container');
   assert.equal(view.props.className,'app-container');
   assert.ok(view.children.some(x=>x.type==='main'));
   const storyFeed=calls.find(x=>x.url.startsWith('/api/stories?lang='));
   assert.ok(storyFeed,'stories feed is registered');
   const home=pathname==='/'||pathname==='/he/';
   const events=pathname.includes('/events/');
   assert.equal(storyFeed.enabled,home||events,'stories are fetched for home and events, not other routes');
 });
}
