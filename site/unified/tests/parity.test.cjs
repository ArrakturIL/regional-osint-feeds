"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const path=require("node:path");
const file=path.resolve(__dirname,"../app.js");
const original=fs.readFileSync(file,"utf8");
new vm.Script(original,{filename:file});
assert.ok(!original.includes("function LocalizedApp()"),"Two separate app roots remain");
assert.ok(!original.includes("function HeHome("),"Two separate homepage implementations remain");
assert.ok(original.includes("D.createRoot(root).render(h(App));"),"Unified root missing");
const injected=original.replace("D.createRoot(root).render(h(App));","window.__QA={App,HomeV2,NewsCard}; D.createRoot(root).render(h(App));");
function boot(locale){
 const React={
  createElement:(type,props,...children)=>({type,props:{...(props||{}),children:children.length===1?children[0]:children}}),
  useState:(v)=>[typeof v==="function"?v():v,()=>{}],useEffect:()=>{},useRef:(v)=>({current:v})
 };
 const window={React,ReactDOM:{createRoot:()=>({render:()=>{}})},scrollY:0,addEventListener:()=>{}};
 const document={getElementById:()=>({}),title:""};
 const location={pathname:locale==="he"?"/he":"/",origin:"https://regional-watch.pages.dev",search:"",href:"https://regional-watch.pages.dev"+(locale==="he"?"/he":"/")};
 const context={window,document,location,localStorage:{getItem:()=>null,setItem:()=>{}},history:{pushState:()=>{}},requestAnimationFrame:()=>{},setTimeout:()=>{},clearTimeout:()=>{},Date,Intl,URL,URLSearchParams,Number,Math,Array,Object,JSON,String,Boolean,RegExp,console};
 vm.runInNewContext(injected,context,{filename:file,timeout:2000});
 return window.__QA;
}
function flatten(node){
 const tags=[],text=[];
 function walk(n){
  if(n==null||n===false)return;
  if(Array.isArray(n)){n.forEach(walk);return}
  if(typeof n==="string"||typeof n==="number"){text.push(String(n));return}
  if(typeof n.type==="function"){walk(n.type(n.props||{}));return}
  tags.push({name:n.type,className:n.props?.className||"",id:n.props?.id||""});
  walk(n.props?.children);
 }
 walk(node);return {tags,text:text.join(" ")};
}
function check(locale){
 const qa=boot(locale),stamp="2026-11-12T14:00:00Z";
 const articles=Array.from({length:15},(_,i)=>({id:"news"+i,title:locale==="he"?"כותרת "+i:"Новость "+i,excerpt:"EXCERPT-READY-"+i,time:stamp,source:"Source",url:"https://example.com/article/"+i}));
 const news={stories:articles,editorials:[{id:"editorial",headline:"Editorial",text:"EDITORIAL-CONTENT",time:stamp}]};
 const cases={stories:[{id:"story",category:"security",title:"Story",summary:"STORY-CONTENT",sources:[{url:"https://example.com"}],event_date:stamp}],changes:[],lastCheck:stamp};
 const {tags,text}=flatten(qa.HomeV2({visible:true,overview:{analysis:{time:stamp,state:"ok",title:"RU-ONLY-ANALYSIS"}},news,cases,errors:{},go:()=>{}}));
 const ids=["changes","on-air","editorial"];
 for(const id of ids)assert.ok(tags.some(t=>t.id===id),locale+": missing "+id);
 for(const className of ["rw-situation","rw-story-teaser","rw-service-line","editorial"])assert.ok(tags.some(t=>t.className.includes(className)),locale+": missing "+className);
 assert.equal(tags.filter(t=>t.className.includes("news-card")).length,6,locale+": homepage feed must be limited to 6");
 assert.ok(text.includes("EDITORIAL-CONTENT"),locale+": editorial body missing");
 assert.ok(text.includes("STORY-CONTENT"),locale+": feature story missing");
 assert.ok(text.includes(locale==="he"?"כיצד פועל המעקב":"Как работает мониторинг"),locale+": monitoring explanation missing");
 const expanded=flatten(qa.NewsCard({item:articles[0],open:true,onToggle:()=>{},read:false,markRead:()=>{}})).text;
 assert.ok(expanded.includes("EXCERPT-READY-0"),locale+": excerpt was replaced by fallback");
 assert.ok(!expanded.includes("התקציר עדיין אינו זמין"),locale+": false Hebrew fallback");
 return {locale,cards:6,sections:ids};
}
for(const locale of ["ru","he"])console.log("PASS",JSON.stringify(check(locale)));
