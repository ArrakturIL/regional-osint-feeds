import test from 'node:test';
import assert from 'node:assert/strict';
import { factualTranslationIssue } from '../../backend/editor/src/translations/fact-guard.mjs';
import { validateCandidate } from '../../backend/editor/src/translations/news-mirror.mjs';

const original = title => ({ title, body: '', comment: '' });
const translated = title => ({ title, body: '', comment: '' });

test('a naval mine collision cannot turn into an attack or a mining facility', () => {
  const source = original('Two tankers strike a naval mine and catch fire, Iran says');
  const bad = translated('שתי מכליות תקפו מכרות ונפגעו');
  assert.match(factualTranslationIssue(source, bad), /naval_mine_misread|mine_collision_reframed_as_attack/);
  assert.equal(
    factualTranslationIssue(source, translated('שתי מכליות פגעו במוקש ימי ועלו באש, כך מסרה איראן')),
    null,
  );
});

test('the United States remains the actor in a feared surprise strike on Iran', () => {
  const source = original('Israel fears surprise US strike on Iran');
  const bad = translated('ישראל חוששת להפתיע את ארה״ב במכה באיראן');
  assert.equal(factualTranslationIssue(source, bad), 'title:us_strike_actor_inverted');
  assert.equal(
    factualTranslationIssue(source, translated('ישראל חוששת מתקיפה פתאומית של ארה״ב באיראן')),
    null,
  );
});

test('a barring condition is not a prohibition and may is not a completed decision', () => {
  const source = original('Trump may postpone strikes on Iran barring new provocations');
  const bad = translated('טראמפ אסר פרובוקציות חדשות ודחה תקיפות באיראן');
  assert.match(
    factualTranslationIssue(source, bad),
    /barring_condition_inverted|conditional_modality_missing/,
  );
  assert.equal(
    factualTranslationIssue(source, translated('טראמפ עשוי לדחות תקיפות באיראן אם לא יהיו פרובוקציות חדשות')),
    null,
  );
});

test('ordinary mining, labor strikes and unqualified events are not overblocked', () => {
  assert.equal(
    factualTranslationIssue(
      original('Two miners strike near a gold mine'),
      translated('שני כורים שובתים ליד מכרה זהב'),
    ),
    null,
  );
  assert.equal(
    factualTranslationIssue(
      original('Trump postponed strikes yesterday'),
      translated('טראמפ דחה את התקיפות אתמול'),
    ),
    null,
  );
});

test('QA 15 Nov: Russian present-tense tanker attack is not a naval mine collision', () => {
  const source = original('Two tankers strike a naval mine and catch fire, Iran says');
  const bad = translated('Два танкера нападают на мины и горят');
  assert.equal(factualTranslationIssue(source, bad), 'title:mine_collision_reframed_as_attack');
  const good = translated('Два танкера столкнулись с морской миной и загорелись, заявляет Иран');
  assert.equal(factualTranslationIssue(source, good), null);
});

test('Hebrew present-tense tanker attack is also not a naval mine collision', () => {
  const source = original('Two tankers strike a naval mine and catch fire, Iran says');
  const bad = translated('שתי מכליות תוקפות מוקש ימי ועולות באש');
  assert.equal(factualTranslationIssue(source, bad), 'title:mine_collision_reframed_as_attack');
  const good = translated('שתי מכליות פגעו במוקש ימי ועלו באש, כך מסרה איראן');
  assert.equal(factualTranslationIssue(source, good), null);
});

test('exact live 15 Nov Hormuz headline: tankers hitting mines is not an attack or a mining operation', () => {
  const src = original('Two tankers strike mines in Strait of Hormuz');
  assert.equal(
    factualTranslationIssue(src, translated('Два танкера нападают на мины в Хормузском проливе')),
    'title:mine_collision_reframed_as_attack',
  );
  assert.equal(
    factualTranslationIssue(src, translated('שתי מכליות פוגעות במכרות במצר הורמוז')),
    'title:naval_mine_misread',
  );
  assert.equal(
    factualTranslationIssue(src, translated('Два танкера столкнулись с минами в Хормузском проливе')),
    null,
  );
  assert.equal(factualTranslationIssue(src, translated('שתי מכליות פגעו במוקשים במצר הורמוז')), null);
});

test('live naval mine summary: "after striking" cannot become a tanker shelling', () => {
  const src = original('Two oil tankers caught fire after striking a naval mine');
  assert.equal(
    factualTranslationIssue(src, translated('Нефтяные танкеры обстреляли морские мины')),
    'title:mine_collision_reframed_as_attack',
  );
  assert.equal(
    factualTranslationIssue(
      src,
      translated('Нефтяные танкеры загорелись после столкновения с морской миной'),
    ),
    null,
  );
});

test('exact Reuters "may hold off" remains tentative even when barring condition is correctly translated', () => {
  const src = original('Trump tells advisers he may hold off on Iran attacks barring new provocations');
  assert.equal(
    factualTranslationIssue(src, translated('Трамп отложил удары по Ирану, если не будет новых провокаций')),
    'title:conditional_modality_missing',
  );
  assert.equal(
    factualTranslationIssue(src, translated('טראמפ דחה תקיפות באיראן אם לא יהיו פרובוקציות חדשות')),
    'title:conditional_modality_missing',
  );
  assert.equal(
    factualTranslationIssue(
      src,
      translated('Трамп может отложить удары по Ирану, если не будет новых провокаций'),
    ),
    null,
  );
  assert.equal(
    factualTranslationIssue(src, translated('טראמפ עשוי לדחות תקיפות באיראן אם לא יהיו פרובוקציות חדשות')),
    null,
  );
});

test('military plural strikes never become labor stoppages (real Helsinki corpus C05-C07)', () => {
  const samples = [
    [
      "Will Israel's repeated strikes on Hamas's replacement commanders lead to lasting change? - analysis",
      'האם שביתות חוזרות ונשנות של בני ישראל על מפקדיו המחליפים של חמאס יובילו לשינוי מתמשך? (אנליזה)',
    ],
    [
      'Iran still has up to 2,500 missiles, capable of major assault even after rounds of strikes - report',
      'לאיראן עדיין יש עד 2,500 טילים, המסוגלים לתקוף אפילו אחרי סיבובי שביתות.',
    ],
    [
      'Iran can still produce 50 ballistic missiles a month, despite US-Israeli strikes - report',
      'איראן עדיין יכולה לייצר 50 טילים בליסטיים בחודש, למרות שביתות ארה״ב-ישראלית - דו״ח',
    ],
  ];
  for (const [src, he] of samples) {
    assert.match(
      factualTranslationIssue(original(src), translated(he)),
      /military_strikes_misread_as_labor_action/,
      src,
    );
    assert.equal(validateCandidate(src, he, 'he'), false, 'mirror rejects ' + src);
  }
});

test('military airstrikes rendered as a Russian labor strike are quarantined', () => {
  const src = 'Israeli strikes on Gaza, officials say';
  const bad = 'Израильские забастовки в Газе, заявили представители';
  assert.match(
    factualTranslationIssue(original(src), translated(bad)),
    /military_strikes_misread_as_labor_action/,
  );
  assert.equal(validateCandidate(src, bad, 'ru'), false);
});

test('genuine labor strikes and correct military translations survive the same guards', () => {
  const cases = [
    ["Teachers' strike shuts Israeli schools", 'שביתת המורים סוגרת את בתי הספר בישראל', 'he'],
    ['Port workers stage strikes', 'Работники порта проводят забастовки', 'ru'],
    ['Histadrut declares general strike in Israel', 'ההסתדרות מכריזה על שביתה כללית בישראל', 'he'],
    [
      'Anti-Houthi forces retreat in Yemen as Iran strikes Bahrain',
      'כוחות מתנגדי החות׳ים נסוגים בתימן בעוד איראן תוקפת בבחריין',
      'he',
    ],
  ];
  for (const [src, target, lang] of cases) {
    assert.equal(factualTranslationIssue(original(src), translated(target)), null, src);
    assert.equal(validateCandidate(src, target, lang), true, src);
  }
});
