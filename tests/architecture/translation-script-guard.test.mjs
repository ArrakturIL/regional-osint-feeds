// Q1 (QA 19.11): a translation must be written in its target script.
// Live 19.11: 21 Hebrew translations carried Arabic letters inside Hebrew
// words (all from gemini-3.5-flash-lite) and passed every check with
// quality 95; a glm Hebrew acronym with an ASCII quote (מכ"ם) cut the JSON
// string mid-word. Cases below are verbatim production outputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {translationIssue} from '../../backend/editor/src/translations/verify.mjs';
import {factualTranslationIssue} from '../../backend/editor/src/translations/fact-guard.mjs';
import {scriptIssue} from '../../backend/editor/src/translations/script-guard.mjs';

// [source, translation, lang, expected]
const CASES = [
  // Arabic letters inside Hebrew words (gemini, live).
  ['The Israeli military said its forces were targeting Hamas infrastructure outside areas that Israel controls in the enclave',
   'הצבא הישראלי מסר כי כוחותיו תקפו תשתיות של חמאס מחוץ לאזורים שבהם ישראל שולטת ברצועة כדי "להסיר איומים."', 'he', 'mixed_script_word'],
  ['Его появление на публике', 'לקראת להופعתו בציבור', 'he', 'mixed_script_word'],
  ['Командиры Хизбаллы', 'מפקدي חיזבאללה', 'he', 'mixed_script_word'],
  // A whole Arabic word that the source does not contain.
  ['Iran warned the US', 'אيران הזהירה את ארה״ב', 'he', 'mixed_script_word'],
  ['Strikes like in Syria.', 'תקיפות כמו كسوريا.', 'he', 'foreign_script'],
  // Cyrillic leaking into Hebrew (known: «РБК:» on a Hebrew dossier).
  ['RBC: talks stalled', 'РБК: השיחות נתקעו', 'he', 'foreign_script'],
  // Hebrew or Arabic leaking into Russian.
  ['Israel and Hamas', 'Израиль и חמאס', 'ru', 'foreign_script'],
  // Allowed: a token copied verbatim from the source (channel name, quote).
  ['أبو علي اكسبرس: Iran lied', 'أبو علي اكسبرس: איראן שיקרה', 'he', null],
  ['Канал «כאן 11» сообщил', 'הערוץ «כאן 11» דיווח', 'he', null],
  // Latin next to Hebrew is normal (ה-IDF, F-35, JNS).
  ['The IDF used F-35 jets', 'ה-IDF השתמש במטוסי F-35', 'he', null],
  ['Clean Hebrew', 'צה״ל תקף בלבנון', 'he', null],
  ['Clean Russian', 'ЦАХАЛ нанёс удар в Ливане', 'ru', null],
  // Truncated Hebrew acronym: מכ"ם cut at the ASCII quote (glm, live).
  ['Мнение Абу Али Экспресса: Иран лгал об успешной атаке на американский радар в Бахрейне',
   'דעתו של אבו עלי אקספרס: איראן שיקרה על פגיעה מוצלחת במכ', 'he', 'truncated_hebrew'],
  ['иранские заявления об уничтожении радара являются ложью.',
   'טענות איראן כי השמידו מכ', 'he', 'truncated_hebrew'],
  // Final letters and acronyms with gershayim/geresh are complete words.
  ['The radar was destroyed', 'המכ״ם הושמד', 'he', null],
  ['Talks in Washington', 'שיחות בוושינגטון', 'he', null],
  ['US and Israel', 'ארה״ב וישראל', 'he', null],
  ['He said in the past', 'הוא אמר בעבר צ׳', 'he', null],
  // Live false positives of a naive rule: acronym and Arabic transliteration.
  ['Indictment against Gottlieb for exposing a Shin Bet officer', 'כתב האישום נגד גוטליב בגין חשיפת קצין שב״כ', 'he', null],
  ['Palestinian footballer Mahmoud Kamal Abdel-Malek', 'הכדורגלן הפלסטיני מחמוד כמאל עבד אל־מאלכ', 'he', null],
];

test('script guard: production cases', () => {
  for (const [src, tr, lang, want] of CASES) {
    assert.equal(scriptIssue(src, tr, lang), want, tr);
  }
});

test('script guard is part of the single verify, every language and path', () => {
  assert.equal(translationIssue('Iran warned the US', 'אيران הזהירה את ארה״ב', 'he'), 'mixed_script_word');
  // Language inferred from the translation's script, as the read path does.
  assert.equal(translationIssue('Hamas', 'חמאס ברצועة'), 'mixed_script_word');
  assert.equal(
    factualTranslationIssue(
      {title: 'IDF tanks enter Gaza', body: 'Forces targeted Hamas in the enclave', comment: ''},
      {title: 'טנקים של צה״ל נכנסים לעזה', body: 'הכוחות תקפו את חמאס ברצועة', comment: ''},
    ),
    'body:mixed_script_word',
  );
});
