import assert from 'node:assert/strict';
import {testHooks} from './analysts-editor.mjs';
const {plain,similarity,validateInput,validateDecision}=testHooks;
assert.equal(plain('  A\n\n B  ',50),'A B');
assert.ok(similarity('Израиль и Иран обсудили новый кризис', 'В Израиле и Иране обсудили новый кризис')>0.50);
const source={id:'auslender-telegram',type:'telegram_public',canonical_prefix:'https://t.me/voinasordoy/'};
const author={id:'sergey-auslender'};
const now=Date.parse('2026-11-11T22:30:00Z');
const raw={id:'auslender-telegram:123',analyst_id:author.id,source_id:source.id,
 canonical_url:'https://t.me/voinasordoy/123',type:'telegram_post',published_at:'2026-11-11T20:00:00Z',
 title:'',body:'В Израиле обсуждается Иран',text_status:'full_text',content_hash:'a'.repeat(64)};
assert.ok(validateInput(raw,source,author,now));
assert.equal(validateInput({...raw,canonical_url:'https://t.me/other/123'},source,author,now),null);
assert.equal(validateInput({...raw,published_at:'2023-01-01T00:00:00Z'},source,author,now),null);
const b='Позиция военного журналиста: Иран и Израиль обсуждают безопасность на Ближнем Востоке. Дальнейшие действия остаются неопределенными.';
const good={decision:'publish',relevance:95,novelty:80,substance:80,reason:'Оригинальная региональная оценка',
 headline:'Аналитик оценивает изменения безопасности на Ближнем Востоке',
 summary:'По мнению автора, происходящие события вокруг Ирана и Израиля имеют важное значение для региональной безопасности, однако его прогноз не подтвержден независимыми источниками. Автор выделяет неопределенность следующей фазы.',quote:''};
assert.ok(validateDecision(good,b));
assert.equal(validateDecision({...good,quote:'Цитата которой не было'},b),null);
assert.equal(validateDecision({...good,relevance:5},b),null);
assert.equal(validateDecision({...good,summary:'Повтор одного предложения.'},b),null);
const hebrewSource={id:'abuali-telegram',type:'telegram_public',canonical_prefix:'https://t.me/abualiexpress/',language:'he'};
const hebrewAuthor={id:'abu-ali-express'};
const hebrewItem={...raw,id:'abuali-telegram:712',analyst_id:hebrewAuthor.id,source_id:hebrewSource.id,
 canonical_url:'https://t.me/abualiexpress/712',body:'לפי הדיווח אין החלטה סופית על תקיפה באיראן.',language:'he'};
assert.ok(validateInput(hebrewItem,hebrewSource,hebrewAuthor,now));
assert.equal(validateInput({...hebrewItem,language:'ru'},hebrewSource,hebrewAuthor,now),null);
// A failed item already booked today must not stall unrelated pending items.
const reserveAi = testHooks.reserveAi;
function fakeBudget(changes, previous) {
  return {prepare(sql) {
    return {bind() { return this; },
      async run() { return {meta: {changes}}; },
      async first() { return previous ? {item_id: 'item-one'} : null; }};
  }};
}
assert.equal(await reserveAi(fakeBudget(1,false),{id:'item-one'},now),null);
assert.equal(await reserveAi(fakeBudget(0,true),{id:'item-one'},now),'already_attempted');
assert.equal(await reserveAi(fakeBudget(0,false),{id:'item-one'},now),'budget_exhausted');
console.log('analysts editor offline checks: OK');