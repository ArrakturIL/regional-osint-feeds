import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {factualTranslationIssue} from './live-editor/translation-fact-guard.mjs';
import {fetchLocalized,fingerprint,storyProvenance} from './live-editor/localization.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const original=(title,body,comment='')=>({title,body,comment});
const translated=(title,body,comment='')=>({title,body,comment});

const didamar=original(
  'Удар по навигационным системам на оманском острове Дидамар',
  'Иранские государственные СМИ заявили об атаке КСИР 10 ноября. Reuters сообщило об атаке.'
);
const wrongActor=translated('תקיפה באי דידמר בעומאן',
  'כלי תקשורת איראניים דיווחו על תקיפה של חיל הים האיראני ב-10 בנובמבר. רויטרס אישרה את התקיפה.');
assert.match(factualTranslationIssue(didamar,wrongActor),/irgc_actor_missing|unsupported_iranian_navy_actor/,
  'BE-01: IRGC must not become Iranian navy');
assert.equal(factualTranslationIssue(didamar,
  translated('תקיפה באי דידמר בעומאן',
   'כלי תקשורת איראניים דיווחו על תקיפה של משמרות המהפכה ב-10 בנובמבר. רויטרס דיווחה על תקיפה.')),null);

const katz=original(
  "Katz: Caretaker gov't fully responsible for Israel's security",
  'Katz said the caretaker cabinet is responsible.');
assert.equal(factualTranslationIssue(katz,
  translated('קטז: ממשלת מעבר אחראית לביטחון ישראל',
    'קטז מסר שממשלת המעבר נושאת באחריות.')),'title:katz_name_corrupted',
  'BE-03: corrupt proper name must be rejected');
assert.equal(factualTranslationIssue(katz,
  translated('כץ: ממשלת המעבר אחראית לביטחון ישראל',
    'כץ אמר שממשלת המעבר אחראית.')),null);

const allies=original('Союзники спорят о сроках',
  'Союзники не согласовали дату выполнения.');
assert.equal(factualTranslationIssue(allies,
  translated('בני הדודים חלוקים לגבי המועד',
    'בני הדודים לא הסכימו על תאריך היישום.')),'title:allies_relation_changed',
  'BE-12: allies must not become cousins');
assert.equal(factualTranslationIssue(allies,
  translated('בעלות הברית חלוקות לגבי המועד',
    'בעלות הברית לא הסכימו על תאריך היישום.')),null);

const raf=original('Минюст США: атака на RAF Fairford',
  'В сентябре планировалась атака на RAF Fairford.');
assert.equal(factualTranslationIssue(raf,
  translated('משרד המשפטים: תקיפה בבסיס רה״ם פיירפורד',
    'בספטמבר תוכננה תקיפה בבסיס רה״ם פיירפורד.')),'title:raf_misidentified',
  'BE-02: RAF must not be expanded to the Hebrew abbreviation for prime minister');
assert.equal(factualTranslationIssue(raf,
  translated('משרד המשפטים: תקיפה בבסיס RAF פיירפורד',
    'בספטמבר תוכננה תקיפה בבסיס RAF פיירפורד.')),null);

assert.equal(factualTranslationIssue(
  original('Нейтральная новость','Погода в регионе остаётся ясной.'),
  translated('עדכון ניטרלי','מזג האוויר באזור נותר בהיר.')),null);

function fakeDB(row){
  return{prepare(_sql){return{bind(..._args){return this;},
    async all(){return {results:[row]};},async first(){return null;}};}};
}
const denyNews={
  id:'311820829e5e58c84bef2781',source:'QA',headline:katz.title,
  headline_ru:null,summary:katz.body,summary_ru:null,comment:null,
  url:'https://example.com/news',published_ms:Date.now(),priority:9,
  he_hash:await fingerprint(katz),he_title:'קטז: ממשלת מעבר אחראית לביטחון ישראל',
  he_body:'קטז מסר שממשלת המעבר נושאת באחריות.',he_comment:'',he_quality:100
};
const envNews={NEWS_DB:fakeDB(denyNews),CORE_DB:fakeDB(null)};
const newsReq='https://regional.test/api/news?lang=he&ready_only=1&limit=10';
const blocked=await (await fetchLocalized(new Request(newsReq),envNews,null)).json();
assert.deepEqual(blocked.articles,[],'Invalid cached translation must not be public as available');
denyNews.he_title='כץ: ממשלת המעבר אחראית לביטחון ישראל';
denyNews.he_body='כץ אמר שממשלת המעבר אחראית.';
const accepted=await (await fetchLocalized(new Request(newsReq),envNews,null)).json();
assert.equal(accepted.articles.length,1);
assert.equal(accepted.articles[0].translation_status,'available');

const eventId='iran-didamar-oman-navigation-strike-20261110';
const storyRow={
  event_id:eventId,payload:JSON.stringify({
    event_id:eventId,title_ru:didamar.title,summary_ru:didamar.body,
    event_date:'2026-11-10',sources:[{url:'https://example.com/source'}]}),
  updated_at_ms:Date.now(),
  he_hash:await fingerprint(didamar),he_title:wrongActor.title,
  he_body:wrongActor.body,he_comment:'',he_quality:90
};
const stories=await (await fetchLocalized(
  new Request('https://regional.test/api/stories?lang=he'),
  {CORE_DB:fakeDB(storyRow),NEWS_DB:fakeDB(null)},null
)).json();
assert.equal(stories.stories.length,1);
assert.equal(stories.stories[0].translation_status,'needs_review');
assert.equal(stories.stories[0].content_language,'ru');
assert.equal(stories.stories[0].summary,didamar.body);

const fairford=storyProvenance({
  event_date:'2026-11-10',
  incident_date:'2026-09',
  sources:[
    {url:'https://www.justice.gov/opa/pr/fairford',type:'US_DOJ'},
    {url:'https://www.reuters.com/world/europe/fairford',type:'Reuters'},
    {url:'https://apnews.com/article/fairford',type:'AP'}
  ]
});
assert.equal(fairford.event_date,'2026-09','BE-02: date of incident takes precedence');
assert.equal(fairford.announced_at,'2026-11-10','BE-02: indictment announcement remains separate');
assert.equal(fairford.sources.length,3,'BE-11: all original source links retained');
assert.equal(fairford.source_urls.length,3);
assert.equal(fairford.url,'https://www.justice.gov/opa/pr/fairford');

const gcc=storyProvenance({
  first_report_date:'2026-11-10',
  source:'https://www.reuters.com/world/middle-east/gcc'
});
assert.equal(gcc.url,'https://www.reuters.com/world/middle-east/gcc');
assert.deepEqual(gcc.source_urls,[gcc.url],'BE-02: source must survive localized stories');
assert.equal(gcc.event_date,'2026-11-10');
assert.equal(storyProvenance({source:'http://127.0.0.1/private'}).url,null);

const fakeStoryDB=fakeDB(storyRow);
const ruStory=await (await fetchLocalized(
  new Request('https://regional.test/api/stories?lang=ru'),
  {CORE_DB:fakeStoryDB,NEWS_DB:fakeDB(null)},null
)).json();
assert.deepEqual(ruStory.stories[0].sources,stories.stories[0].sources,
  'RU and HE story links must be identical');
assert.deepEqual(ruStory.stories[0].source_urls,stories.stories[0].source_urls,
  'RU and HE source_urls must be identical');
assert.equal(ruStory.stories[0].event_date,stories.stories[0].event_date);

for(const query of ['limit=1.5','limit=0','limit=-1','limit=1000','limit=Infinity','offset=0.5','offset=-1','offset=2001']){
  const result=await fetchLocalized(
    new Request('https://regional.test/api/news?lang=he&'+query),envNews,null
  );
  assert.equal(result.status,400,'BE-05: '+query+' must be JSON 400, not HTTP 503');
  assert.ok((await result.json()).error.startsWith('invalid_'));
}
for(const query of ['limit=1','limit=40','offset=0','offset=500']){
  const result=await fetchLocalized(
    new Request('https://regional.test/api/news?lang=ru&'+query),envNews,null
  );
  assert.equal(result.status,200,'BE-05: valid '+query+' must remain accepted');
}
console.log('QA localization: actor checks, cached fallback, story provenance and pagination passed');

