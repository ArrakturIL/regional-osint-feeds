import test from 'node:test';
import assert from 'node:assert/strict';
import {
 splitSource,numbersPreserved,negativeMeaningNotDropped,validateTranslation
} from '../../backend/editor/src/analysts/translation.mjs';
import {
 canonicalNewsUrl,normalizedHeadline,isStrongTitle,articlePriority
} from '../../backend/editor/src/news/normalization.mjs';
import {factualTranslationIssue} from '../../backend/editor/src/translations/fact-guard.mjs';

// ARCH-06 parity: uniquely valuable cases from still-retained historical Worker suites
// executed against actual modular Editor source, not worker/live-editor snapshots.
const original=(title,body='',comment='')=>({title,body,comment});
const localized=(title,body='',comment='')=>({title,body,comment});

test('analyst translation: long texts split into bounded, lossless six-or-fewer pieces',()=>{
 assert.deepEqual(splitSource('שלום'),['שלום']);
 const source='A sentence. '.repeat(460),chunks=splitSource(source);
 assert.ok(chunks.length>1&&chunks.length<=6);
 assert.equal(chunks.join(' '),source.trim());
 assert.ok(chunks.every(x=>x.length<=1350));
});
test('analyst translation: multilingual thousands separators, decimals and repeated numbers stay intact',()=>{
 assert.ok(numbersPreserved('150 vessels, 4,000 ships and 1.7 billion barrels',
  '150 судов, 4000 кораблей и 1,7 миллиарда баррелей'));
 assert.ok(numbersPreserved('4,000 ships and 1.7 barrels','4 000 кораблей и 1,7 барреля'));
 assert.equal(numbersPreserved('4,000 ships and 1.7 barrels','4 000 кораблей и 1,8 барреля'),false);
 assert.equal(numbersPreserved('150 ships and 150 aircraft','150 судов и 140 самолётов'),false);
 assert.equal(numbersPreserved('5 aircraft and 12 flights','5 самолётов и 21 рейс'),false);
});
test('analyst translation: Hebrew and English negations are mandatory in Russian',()=>{
 assert.equal(negativeMeaningNotDropped('לא אושרה תקיפה באיראן','Удар по Ирану не подтверждён','he'),true);
 assert.equal(negativeMeaningNotDropped('לא אושרה תקיפה באיראן','Удар по Ирану подтверждён','he'),false);
 assert.equal(negativeMeaningNotDropped('No airstrikes reported','О налётах не сообщается','en'),true);
});
test('analyst translation: only high-confidence, fact-preserving text may be verified',()=>{
 const source='לא אושרה תקיפה באיראן 2026';
 const good={translation:'Удар по Ирану в 2026 году официально не подтверждён.',confidence:91,issues:[]};
 assert.ok(validateTranslation(source,good,'he'));
 assert.equal(validateTranslation(source,{...good,confidence:0.91},'he')?.confidence,91);
 assert.equal(validateTranslation(source,{...good,confidence:0.5},'he'),null);
 assert.equal(validateTranslation(source,{...good,confidence:65},'he'),null);
 assert.equal(validateTranslation(source,{...good,issues:['ambiguous name']},'he'),null);
 assert.equal(validateTranslation(source,{...good,translation:'Удар по Ирану в 2027 году подтверждён.'},'he'),null);
});
test('news: canonical article URLs strip trackers, sort query values, retain real article IDs',()=>{
 const x='https://news.example.org/article/?utm_source=x&id=1';
 const y='https://news.example.org/article?id=1&utm_source=y';
 assert.equal(canonicalNewsUrl(x),canonicalNewsUrl(y));
 assert.equal(canonicalNewsUrl('https://news.example.org/a?id=3&foo=b&utm_campaign=z'),
  canonicalNewsUrl('https://news.example.org/a?foo=b&id=3#section'));
 assert.equal(canonicalNewsUrl('https://news.example.org/a?fbclid=abc&id=9'),
  canonicalNewsUrl('https://news.example.org/a?id=9'));
 assert.notEqual(canonicalNewsUrl('https://news.example.org/a?id=1'),
  canonicalNewsUrl('https://news.example.org/a?id=2'));
 assert.equal(canonicalNewsUrl('http://news.example.org/a'),null);
});
test('news: original Unicode normalization and Warsaw != war boundary',()=>{
 assert.equal(normalizedHeadline('Israel and Iran! '),normalizedHeadline('ISRAEL AND IRAN'));
 assert.equal(normalizedHeadline('שלום!'),normalizedHeadline('שלום  '));
 assert.equal(normalizedHeadline('إيران؟'),normalizedHeadline('إيران'));
 assert.equal(isStrongTitle('Warsaw opens library'),false);
 assert.equal(isStrongTitle('The war continues'),true);
 assert.equal(isStrongTitle('Warnings of missile attacks'),true);
 assert.equal(articlePriority(4,'Warsaw opens library',false),4);
 assert.equal(articlePriority(4,'War starts',false),7);
 assert.equal(articlePriority(4,'War in Israel',true),10);
});
test('BE-01: IRGC attributed actor cannot be replaced with Iranian navy',()=>{
 const source=original('Удар по навигационным системам на оманском острове Дидамар',
  'Иранские государственные СМИ заявили об атаке КСИР 10 ноября. Reuters сообщило об атаке.');
 assert.match(factualTranslationIssue(source,localized('תקיפה באי דידמר בעומאן',
  'כלי תקשורת איראניים דיווחו על תקיפה של חיל הים האיראני ב-10 בנובמבר. רויטרס אישרה את התקיפה.')),
  /irgc_actor_missing|unsupported_iranian_navy_actor/);
 assert.equal(factualTranslationIssue(source,localized('תקיפה באי דידמר בעומאן',
  'כלי תקשורת איראניים דיווחו על תקיפה של משמרות המהפכה ב-10 בנובמבר. רויטרס דיווחה על תקיפה.')),null);
});
test('BE-03: corrupted Israeli minister surname is quarantined without blocking correct spelling',()=>{
 const source=original("Katz: Caretaker gov't fully responsible for Israel's security",
  'Katz said the caretaker cabinet is responsible.');
 assert.equal(factualTranslationIssue(source,localized('קטז: ממשלת מעבר אחראית לביטחון ישראל',
  'קטז מסר שממשלת המעבר נושאת באחריות.')),'title:katz_name_corrupted');
 assert.equal(factualTranslationIssue(source,localized('כץ: ממשלת המעבר אחראית לביטחון ישראל',
  'כץ אמר שממשלת המעבר אחראית.')),null);
});
test('BE-12: allied states must not be mistranslated as cousins',()=>{
 const source=original('Союзники спорят о сроках','Союзники не согласовали дату выполнения.');
 assert.equal(factualTranslationIssue(source,localized('בני הדודים חלוקים לגבי המועד',
  'בני הדודים לא הסכימו על תאריך היישום.')),'title:allies_relation_changed');
 assert.equal(factualTranslationIssue(source,localized('בעלות הברית חלוקות לגבי המועד',
  'בעלות הברית לא הסכימו על תאריך היישום.')),null);
});
test('BE-02: RAF Fairford never becomes Hebrew prime-minister abbreviation',()=>{
 const source=original('Минюст США: атака на RAF Fairford',
  'В сентябре планировалась атака на RAF Fairford.');
 assert.equal(factualTranslationIssue(source,localized('משרד המשפטים: תקיפה בבסיס רה״ם פיירפורד',
  'בספטמבר תוכננה תקיפה בבסיס רה״ם פיירפורד.')),'title:raf_misidentified');
 assert.equal(factualTranslationIssue(source,localized('משרד המשפטים: תקיפה בבסיס RAF פיירפורד',
  'בספטמבר תוכננה תקיפה בבסיס RAF פיירפורד.')),null);
});
