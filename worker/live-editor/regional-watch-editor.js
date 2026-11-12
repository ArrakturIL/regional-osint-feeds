import {enrichNewMonitorStories} from './story-enrichment.mjs';
import analystService from './analysts-editor.mjs';
import localization from './localization.mjs';

const FEEDS=[
 ["BBC Middle East","https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",4],
 ["Times of Israel","https://www.timesofisrael.com/feed/",4],
 ["Jerusalem Post / Israel","https://www.jpost.com/rss/rssfeedsisraelnews.aspx",4],
 ["Jerusalem Post / Iran","https://www.jpost.com/rss/rssfeedsiran",4],
 ["Al Jazeera","https://www.aljazeera.com/xml/rss/all.xml",3]
];
const REGION=/iran|israel|israeli|hezbollah|lebanon|gaza|hamas|syria|syrian|yemen|houthi|red sea|middle east|iraq|idf|centcom|hormuz|netanyahu|tehran|jerusalem|tel aviv|persian gulf|khamenei|trump.*(iran|israel)/i;
const STRONG=/strike|attack|war|missile|drone|aircraft|fighter|jet|carrier|military|evacuat|nuclear|deal|talk|negotiat|ceasefire|border|rocket|explos|killed|injur|dead|warning|alert|intercept|threat|sanction|deploy|security/i;
function decode(s){return (s||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&(?:amp|lt|gt|quot|apos|nbsp|#(\d+)|#x([0-9a-f]+));/gi,(m,d,h)=>{if(d||h){const n=d?Number(d):parseInt(h,16);return n>0&&n<1114112?String.fromCodePoint(n):""}return {amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "}[m.slice(1,-1).toLowerCase()]||m}).replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}
function tag(s,key){const m=s.match(new RegExp("<(?:[\\w.-]+:)?"+key+"\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?"+key+">","i"));return m?decode(m[1]):""}
function safeLink(u){try{const x=new URL(u);return x.protocol==="https:"?x.href.slice(0,1000):null}catch{return null}}
async function digest(s){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return [...new Uint8Array(h)].slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join("")}
function entries(xml,feed,now){
 const items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[],out=[];
 for(const it of items.slice(0,55)){
  const title=tag(it,"title").slice(0,260),summary=tag(it,"description").slice(0,480);
  const link=safeLink(tag(it,"link")),pub=Date.parse(tag(it,"pubDate")||tag(it,"published")||tag(it,"date"));
  if(!title||!link||!Number.isFinite(pub)||pub>now+600000||pub<now-48*3600000||!REGION.test(title+" "+summary))continue;
  const score=feed[2]+(REGION.test(title)?3:0)+(STRONG.test(title)?3:0)-(/opinion|as it happened/i.test(title)?3:0);
  out.push({source:feed[0],title,summary,link,pub,score});
 }
 return out;
}
async function load(feed,now){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),8000);
 try{
  const r=await fetch(feed[1],{redirect:"follow",headers:{Accept:"application/rss+xml,application/xml,text/xml,*/*", "User-Agent":"RegionalWatch/1.0 RSS"},signal:c.signal});
  if(!r.ok)return {name:feed[0],state:"error",http:r.status,error:"HTTP "+r.status,items:[]};
  const xml=(await r.text()).slice(0,400000);
  if(!/<rss\b|<rdf:RDF\b/i.test(xml))return {name:feed[0],state:"error",http:r.status,error:"Not RSS",items:[]};
  const items=entries(xml,feed,now);
  return {name:feed[0],state:items.length?"ok":"empty",http:r.status,error:null,items};
 }catch(e){return {name:feed[0],state:"error",http:null,error:String(e).slice(0,100),items:[]}}
 finally{clearTimeout(timer)}
}

async function writeComment(env,row){
 const title=String(row.headline_ru||row.headline||"").trim();
 const summary=String(row.summary_ru||row.summary||"").trim();
 const combined=title+" "+summary;
 if(/погибш|убитых детей|жертв|выживши[ех]|обрушени[яе] .*сем|рак молочной железы|задержанн.*семьи|сексуальн.*насили/i.test(combined))return {comment:null,skip:true,neurons:0};
 const system="Ты ироничный редактор русскоязычного ближневосточного новостного издания. Дай одну короткую, острую и умную реплику к новости, максимум 200 символов и не более двух предложений. Цинизм, сарказм и сухой юмор допустимы в адрес политиков, чиновников, бюрократии, дипломатии и политического пиара. Укол должен быть точным и связанным с конкретным фактом из заголовка или RSS-аннотации. Никаких повторов заголовка другими словами, банальных выводов, общих размышлений, дежурного 'это не означает угрозы', морализаторства и самовосхваления. Не выдумывай мотиваций, причин, цифр, цитат или подтверждений. Не изображай судебные обвинения доказанной виной. Категорически не шути над погибшими, пострадавшими, заложниками, врачами, пациентами, мирными жителями, гуманитарными трагедиями. Если можно только повторить новость или юмор окажется натужным — верни пустой comment. Верни только JSON {\"comment\":\"...\"}.";
 const request={messages:[{role:"system",content:system},{role:"user",content:"Источник: "+row.source+"\nЗаголовок: "+title+"\nАннотация: "+summary}],temperature:.7,max_tokens:240};
 const answer=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",request);
 const content=String(answer?.choices?.[0]?.message?.content||(typeof answer?.response==="string"?answer.response:"")).trim();
 const match=content.match(/\{[\s\S]*\}/);
 if(!match)throw Error("No commentary JSON");
 const parsed=JSON.parse(match[0]);
 const comment=String(parsed?.comment||"").trim();
 if(comment.length<35||comment.length>300||/^(\s*(похоже|интересно|это ещё|по сообщениям|важно|стоит отметить))/i.test(comment))return {comment:null,skip:true,neurons:Number(answer?.usage?.neurons)||undefined};
 return {comment:comment.slice(0,220),skip:false,neurons:Number(answer?.usage?.neurons)||undefined};
}

async function translateTitles(env,now){
 const day=new Date(now).toISOString().slice(0,10);
 try{
  await env.NEWS_DB.prepare("INSERT OR IGNORE INTO news_translation_budget(day_utc,batches,estimated_neurons,updated_ms) VALUES(?,0,0,?)").bind(day,now).run();
  const budget=await env.NEWS_DB.prepare("SELECT batches,estimated_neurons FROM news_translation_budget WHERE day_utc=?").bind(day).first();
  if((budget?.batches||0)>=20||(budget?.estimated_neurons||0)>=2500)return {translated:0,summaries:0, --- TRUNCATED --- 20,004 chars