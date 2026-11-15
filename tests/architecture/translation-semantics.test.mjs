import test from 'node:test';
import assert from 'node:assert/strict';
import { factualTranslationIssue } from '../../backend/editor/src/translations/fact-guard.mjs';

const original=(title)=>({title,body:'',comment:''});
const translated=(title)=>({title,body:'',comment:''});

test('a naval mine collision cannot turn into an attack or a mining facility',()=>{
 const source=original('Two tankers strike a naval mine and catch fire, Iran says');
 const bad=translated('שתי מכליות תקפו מכרות ונפגעו');
 assert.match(factualTranslationIssue(source,bad),/naval_mine_misread|mine_collision_reframed_as_attack/);
 assert.equal(factualTranslationIssue(source,translated('שתי מכליות פגעו במוקש ימי ועלו באש, כך מסרה איראן')),null);
});

test('the United States remains the actor in a feared surprise strike on Iran',()=>{
 const source=original('Israel fears surprise US strike on Iran');
 const bad=translated('ישראל חוששת להפתיע את ארה״ב במכה באיראן');
 assert.equal(factualTranslationIssue(source,bad),'title:us_strike_actor_inverted');
 assert.equal(factualTranslationIssue(source,translated('ישראל חוששת מתקיפה פתאומית של ארה״ב באיראן')),null);
});

test('a barring condition is not a prohibition and may is not a completed decision',()=>{
 const source=original('Trump may postpone strikes on Iran barring new provocations');
 const bad=translated('טראמפ אסר פרובוקציות חדשות ודחה תקיפות באיראן');
 assert.match(factualTranslationIssue(source,bad),/barring_condition_inverted|conditional_modality_missing/);
 assert.equal(factualTranslationIssue(source,translated('טראמפ עשוי לדחות תקיפות באיראן אם לא יהיו פרובוקציות חדשות')),null);
});

test('ordinary mining, labor strikes and unqualified events are not overblocked',()=>{
 assert.equal(factualTranslationIssue(original('Two miners strike near a gold mine'),translated('שני כורים שובתים ליד מכרה זהב')),null);
 assert.equal(factualTranslationIssue(original('Trump postponed strikes yesterday'),translated('טראמפ דחה את התקיפות אתמול')),null);
});

test('QA 15 Nov: Russian present-tense tanker attack is not a naval mine collision',()=>{
 const source=original('Two tankers strike a naval mine and catch fire, Iran says');
 const bad=translated('Два танкера нападают на мины и горят');
 assert.equal(factualTranslationIssue(source,bad),'title:mine_collision_reframed_as_attack');
 const good=translated('Два танкера столкнулись с морской миной и загорелись, заявляет Иран');
 assert.equal(factualTranslationIssue(source,good),null);
});

test('Hebrew present-tense tanker attack is also not a naval mine collision',()=>{
 const source=original('Two tankers strike a naval mine and catch fire, Iran says');
 const bad=translated('שתי מכליות תוקפות מוקש ימי ועולות באש');
 assert.equal(factualTranslationIssue(source,bad),'title:mine_collision_reframed_as_attack');
 const good=translated('שתי מכליות פגעו במוקש ימי ועלו באש, כך מסרה איראן');
 assert.equal(factualTranslationIssue(source,good),null);
});

test('exact live 15 Nov Hormuz headline: tankers hitting mines is not an attack or a mining operation',()=>{
 const src=original('Two tankers strike mines in Strait of Hormuz');
 assert.equal(factualTranslationIssue(src,translated('Два танкера нападают на мины в Хормузском проливе')),
    'title:mine_collision_reframed_as_attack');
 assert.equal(factualTranslationIssue(src,translated('שתי מכליות פוגעות במכרות במצר הורמוז')),
    'title:naval_mine_misread');
 assert.equal(factualTranslationIssue(src,translated('Два танкера столкнулись с минами в Хормузском проливе')),null);
 assert.equal(factualTranslationIssue(src,translated('שתי מכליות פגעו במוקשים במצר הורמוז')),null);
});
