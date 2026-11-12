// REGIONAL WATCH production event engine. No AI can certify a factual claim.
export const FEEDS=[["BBC Middle East","https://feeds.bbci.co.uk/news/world/middle_east/rss.xml","bbc","en",4],["Times of Israel","https://www.timesofisrael.com/feed/","toi","en",4],["Jerusalem Post / Israel","https://www.jpost.com/rss/rssfeedsisraelnews.aspx","jpost","en",4],["Jerusalem Post / Iran","https://www.jpost.com/rss/rssfeedsiran","jpost","en",4],["Al Jazeera","https://www.aljazeera.com/xml/rss/all.xml","aljazeera","en",3],["Israel Hayom","https://www.israelhayom.co.il/rss.xml","israelhayom","he",4],["Maariv","https://www.maariv.co.il/Rss/RssChadashot","maariv","he",4],["Arutz Sheva","https://www.israelnationalnews.com/Rss.aspx?act=.1","arutzsheva","en",3],["JNS","https://www.jns.org/feed/","jns","en",3],["Al-Monitor","https://www.al-monitor.com/rss","almonitor","en",4],["France 24","https://www.france24.com/en/middle-east/rss","france24","en",4],["The Guardian","https://www.theguardian.com/world/israel/rss","guardian","en",3]];
const META=new Map(FEEDS.map(f=>[f[0],{owner:f[2],language:f[3]}]));
export const publisher=name=>META.get(name)?.owner||String(name||'unknown');
export const language=name=>META.get(name)?.language||'en';
export const hebrew=s=>/[\u0590-\u05ff]/u.test(String(s||''));
const R=[['israel',/\bisrael(?:i|is)?\b|ישראל|إسرائيل|израил/iu],['iran',/\biran(?:ian)?\b|איראן|إيران|иран/iu],
 ['gaza',/\bgaza\b|עזה|غزة|газ[аеуы]/iu],['lebanon',/\blebanon\b|לבנון|لبنان|ливан/iu],
 ['syria',/\bsyria\b|סוריה|سوريا|сири/iu],['yemen',/\byemen\b|תימן|اليمن|йемен/iu],
 ['idf',/\bIDF\b|צה[״"']?ל|цахал/iu],['hamas',/\bhamas\b|חמאס|حماس|хамас/iu],
 ['hezbollah',/\bhezbollah\b|חיזבאללה|حزب الله|хезбол/iu],['us',/\b(?:US|USA|American)\b|ארה[״"']?ב|الولايات المتحدة|сша/iu],
 ['netanyahu',/\bnetanyahu\b|נתניהו|نتنياهو|нетаньяху/iu]];
const D=[['nasser',/\bnasser(?: hospital)?\b|בית החולים נאסר|مستشفى ناصر|нассер/iu],
 ['shifa',/\b(?:al.?shifa|shifa)(?: hospital)?\b|בית החולים שיפא|مستشفى الشفاء|шифа/iu],
 ['fairford',/\bfairford\b|פיירפורד|فيرفورد|фэрфорд/iu],
 ['didamar',/\bdidamar\b|דידמר|ديدمار|дидамар/iu],
 ['khan_younis',/\bkhan (?:younis|yunis)\b|חאן יונס|خان يونس|хан.?юн/iu],
 ['katz',/\bkatz\b|כץ|кац/iu],['ghalibaf',/\bghalibaf\b|קאליבאף|قاليباف|галибаф/iu],
 ['vance',/\bvance\b|ואנס|فانس|вэнс/iu],['netanyahu',/\bnetanyahu\b|נתניהו|نتنياهو|нетаньяху/iu]];
const T=[['strike',/\b(?:strikes?|attacks?|airstrikes?|bombing|shelling|raid|explosion)\b|תקיפ|הפצצ|פגיע|قصف|هجوم|غارة|удар|атак|обстрел/iu],
 ['negotiation',/\b(?:talks?|negotiat(?:ions?|ing)|ceasefire|truce|deal|MOU)\b|משא ומתן|שיחות|הפסקת אש|مفاوضات|محادثات|هدنة|переговор|перемири/iu],
 ['military',/\b(?:missiles?|ballistic|rockets?|interception|drones?|fighter jets?|deployment|air defense)\b|טילים|יירוט|כטב.?ם|صواريخ|ракет|беспилотник|воен/iu],
 ['diplomacy',/\b(?:Security Council|UNSC|summit|ambassador|embassy|diplomatic|resolution|foreign minister)\b|מועצת הביטחון|שגריר|פסגה|مجلس الأمن|قمة|دبلوماسية|совет безопасности|дипломат|посол/iu],
 ['election',/\b(?:election|coalition|caretaker government|knesset)\b|בחירות|קואליצי|ממשלת מעבר|انتخابات|выбор|коалици/iu],
 ['governance',/\b(?:budget|funding|taxpayer|court|protest|indictment|corruption|government spending)\b|בג.?ץ|תקציב|מימון|מחאה|שחיתות|ميزانية|فساد|бюджет|финансирован|коррупци|суд/iu],
 ['sanctions',/\b(?:sanctions?|embargo|blacklist)\b|סנקציות|عقوبات|санкци/iu],
 ['statement',/\b(?:says?|warns?|claims?|statement|pledges?|announces?)\b|הזהיר|הודיע|אומר|صرح|حذر|заявил|предупредил|объявил/iu]];
const S=[['nuclear',/\bnuclear\b|גרעין|نووي|ядер/iu],['missile',/\b(?:missile|ballistic)\b|טיל|صاروخ|ракет/iu],
 ['ceasefire',/\b(?:ceasefire|truce)\b|הפסקת אש|هدنة|перемири/iu],['deal',/\b(?:deal|agreement|MOU)\b|הסכם|اتفاق|соглашени/iu]];
const W={strike:8,military:24,negotiation:36,diplomacy:36,election:48,governance:30,sanctions:48,statement:24,other:18};
const BASE={strike:6,military:5,negotiation:4,diplomacy:4,sanctions:4,election:3,governance:3,statement:2,other:0};
const VENUES=new Set(['nasser','shifa','fairford','didamar']);
const PEOPLE=new Set(['katz','ghalibaf','vance','netanyahu']);
const match=(s,arr)=>new Set(arr.filter(x=>x[1].test(s)).map(x=>x[0]));
const overlap=(a,b)=>[...a].filter(x=>b.has(x));
const tokens=s=>new Set((String(s||'').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(x=>x.length>2&&!['the','and','for','from','that','with','this','new','says','said','after','before'].includes(x)));
const hasClaim=s=>/\b(?:reported|reportedly|alleged|claims|according to|unverified)\b|לפי|לדברי|بحسب|زعم|сообща|предполож/iu.test(s);
export function analyze(a){
 const title=String(a.headline||a.title||''),summary=String(a.summary||'');
 const all=title+' '+summary,region=match(all,R),detail=match(all,D),sub=match(all,S);
 const topic=T.find(x=>x[1].test(title))?.[0]||T.find(x=>x[1].test(all))?.[0]||'other';
 const type=/\b(?:opinion|commentary|column)\b|טור דעה|דעה|رأي/iu.test(title)?'opinion':
   /\b(?:live blog|live updates|as it happened)\b|עדכונים שוטפים|مباشر/iu.test(title)?'liveblog':
   /\b(?:sponsored|advertorial)\b|תוכן ממומן|إعلان/iu.test(title)?'sponsored':'news';
 let score=BASE[topic]+(overlap(region,new Set(['israel','iran','idf','hamas','hezbollah','netanyahu'])).length?2:region.size?1:0);
 if(overlap(detail,VENUES).length)score++;
 if(type==='opinion')score-=3;
 if(type==='sponsored'||type==='liveblog')score=0;
 score=Math.max(0,Math.min(10,score));
 const policy=!region.size&&!detail.size?'hold_irrelevant':type!=='news'?'hold_nonnews':score<3?'hold_low_signal':score<4?'review':'candidate';
 return {...a,title,summary,topic,type,score,policy,region,detail,sub,words:tokens(title),time:Number(a.published_ms||0),
   owner:publisher(a.source),lang:language(a.source),claimed:hasClaim(all)};
}
export function sameEvent(a,b){
 if(a.id===b.id)return{ok:true,why:'same_article'};
 if(a.topic!==b.topic)return{ok:false,why:'different_action'};
 const hours=Math.abs(a.time-b.time)/3600000;
 if(!a.time||!b.time||hours>W[a.topic])return{ok:false,why:'different_time'};
 const va=overlap(a.detail,VENUES),vb=overlap(b.detail,VENUES);
 if(va.length&&vb.length&&!va.some(x=>vb.includes(x)))return{ok:false,why:'different_venue'};
 if(va.some(x=>vb.includes(x))&&overlap(a.region,b.region).length)return{ok:true,why:'same_venue_action_time'};
 const common=overlap(a.words,b.words).length,union=new Set([...a.words,...b.words]).size,ratio=union?common/union:0;
 if(overlap(a.detail,b.detail).some(x=>PEOPLE.has(x))&&overlap(a.region,b.region).length&&
    (ratio>=.26||(hours<=6&&overlap(a.sub,b.sub).length)))return{ok:true,why:'same_person_context'};
 if(overlap(a.region,b.region).length&&common>=4&&ratio>=.7)return{ok:true,why:'high_headline_overlap'};
 return{ok:false,why:'insufficient_identity'};
}
export function group(rows){
 const held=[],eligible=[];
 for(const row of rows){const a=analyze(row);(a.policy==='candidate'?eligible:held).push(a);}
 eligible.sort((a,b)=>a.time-b.time||String(a.id).localeCompare(String(b.id)));
 const groups=[];
 for(const a of eligible){
  const possible=groups.filter(g=>g.members.every(b=>sameEvent(a,b).ok));
  if(possible.length!==1)groups.push({members:[a],reasons:[possible.length>1?'ambiguous':'new_event']});
  else {possible[0].reasons.push(sameEvent(a,possible[0].members[0]).why);possible[0].members.push(a);}
 }
 return{groups,held};
}
async function hash(s){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));return Array.from(bytes).slice(0,10).map(x=>x.toString(16).padStart(2,'0')).join('');}
function origin(a){
 if(/\breuters\b|רויטרס|رويترز|рейтерс/iu.test(a.summary))return'reuters';
 if(/\b(?:associated press|AP reports)\b|أسوشيتد برس/iu.test(a.summary))return'ap';
 return a.owner;
}
export async function reconcile(db,now=Date.now()){
 const rows=(await db.prepare('SELECT id,source,headline,summary,url,published_ms,priority FROM news_items WHERE published_ms>=? ORDER BY published_ms DESC LIMIT 380').bind(now-7*86400000).all()).results||[];
 const {groups,held}=group(rows);
 const previous=(await db.prepare('SELECT article_id,event_id FROM news_event_members').all()).results||[];
 const prior=new Map(previous.map(r=>[r.article_id,r.event_id]));
 const batch=[];
 for(const g of groups){
  const members=g.members,old=members.map(m=>prior.get(m.id)).filter(Boolean).sort();
  const eventId=old[0]||'evt_'+await hash(members[0].id);
  const best=[...members].sort((a,b)=>b.score-a.score||b.time-a.time)[0];
  const ownerCount=new Set(members.map(x=>x.owner)).size;
  const originCount=new Set(members.map(origin)).size;
  const sources=members.map(x=>({article_id:x.id,source:x.source,publisher:x.owner,language:x.lang,url:x.url,published_ms:x.time}));
  const signature=members.map(x=>x.id).sort().join('|');
  batch.push(db.prepare("INSERT INTO news_event_groups(event_id,representative_id,topic,priority,last_seen_ms,member_count,source_count,origin_count,verification_status,reason_codes,sources_json,signature,updated_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET representative_id=excluded.representative_id,topic=excluded.topic,priority=excluded.priority,last_seen_ms=excluded.last_seen_ms,member_count=excluded.member_count,source_count=excluded.source_count,origin_count=excluded.origin_count,verification_status=excluded.verification_status,reason_codes=excluded.reason_codes,sources_json=excluded.sources_json,signature=excluded.signature,updated_ms=excluded.updated_ms WHERE news_event_groups.signature!=excluded.signature OR news_event_groups.priority!=excluded.priority OR news_event_groups.representative_id!=excluded.representative_id")
   .bind(eventId,best.id,best.topic,Math.max(...members.map(m=>m.score)),Math.max(...members.map(m=>m.time)),members.length,ownerCount,originCount,
   originCount>1?'multi_outlet_reporting':'single_origin_reporting',JSON.stringify([...new Set(g.reasons)]),JSON.stringify(sources),signature,now));
  for(const m of members)batch.push(db.prepare("INSERT INTO news_event_members(article_id,event_id,updated_ms) VALUES(?,?,?) ON CONFLICT(article_id) DO UPDATE SET event_id=excluded.event_id,updated_ms=excluded.updated_ms WHERE news_event_members.event_id!=excluded.event_id").bind(m.id,eventId,now));
 }
 for(let i=0;i<batch.length;i+=80)await db.batch(batch.slice(i,i+80));
 // Delete obsolete event heads after a former cluster has been re-assigned.
 // Never remove historical news_items; only stale materialized event summaries.
 await db.prepare("DELETE FROM news_event_groups WHERE NOT EXISTS (SELECT 1 FROM news_event_members m WHERE m.article_id=news_event_groups.representative_id AND m.event_id=news_event_groups.event_id)").run();
 const state={time:new Date(now).toISOString(),input:rows.length,events:groups.length,held:held.length,
  duplicated:groups.reduce((n,g)=>n+g.members.length-1,0),publishers:new Set(rows.map(r=>publisher(r.source))).size};
 await db.prepare("INSERT INTO editor_state(key,value,updated_ms) VALUES('last_event_filter',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms").bind(JSON.stringify(state),now).run();
 return state;
}
export async function eventRows(db,limit=180){
 const sql="SELECT e.event_id,e.topic,e.priority event_priority,e.member_count,e.source_count,e.origin_count,e.verification_status,e.reason_codes,e.sources_json,e.last_seen_ms,n.id,n.source,n.headline,n.headline_ru,n.summary,n.summary_ru,n.comment,n.url,n.published_ms,n.priority,t.source_hash he_hash,t.title he_title,t.body he_body,t.commentary he_comment,t.quality_score he_quality FROM news_event_groups e JOIN news_items n ON n.id=e.representative_id LEFT JOIN regional_i18n t ON t.kind='news' AND t.item_id=n.id AND t.language='he' WHERE e.last_seen_ms>=? ORDER BY e.priority DESC,e.last_seen_ms DESC LIMIT ?";
 return (await db.prepare(sql).bind(Date.now()-7*86400000,limit).all()).results||[];
}
