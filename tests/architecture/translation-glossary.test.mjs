// B3: one entity glossary replaces hand-written per-name regex rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTITIES,
  entityIssue,
  wikidataEntityIssue,
} from '../../backend/editor/src/translations/glossary.mjs';
import { factualTranslationIssue } from '../../backend/editor/src/translations/fact-guard.mjs';

const o = title => ({ title, body: '', comment: '' });

test('every glossary entity has a stable code, a source form and a Hebrew target form', () => {
  const codes = new Set();
  for (const e of ENTITIES) {
    assert.match(e.code, /^[a-z0-9_]+$/, e.id);
    assert.ok(!codes.has(e.code), 'duplicate code ' + e.code);
    codes.add(e.code);
    assert.ok(typeof e.source?.test === 'function' && typeof e.he?.test === 'function', e.id);
  }
  // Legacy codes stay stable: D1 attempt history and tests refer to them.
  for (const c of [
    'irgc_actor_missing',
    'katz_name_corrupted',
    'allies_relation_changed',
    'idf_actor_missing',
    'netanyahu_name_missing',
    'reuters_attribution_missing',
    'raf_misidentified',
  ])
    assert.ok(codes.has(c), c);
});

const CASES = [
  // [source, good Hebrew, bad Hebrew, code]
  [
    'Hezbollah fires rockets at the north',
    'חיזבאללה ירה רקטות לצפון',
    'הארגון ירה רקטות לצפון',
    'hezbollah_name_missing',
  ],
  [
    'Удар по позициям «Хезболлы» на юге Ливана',
    'תקיפה בעמדות של חיזבאללה בדרום לבנון',
    'תקיפה בעמדות בדרום לבנון',
    'hezbollah_name_missing',
  ],
  ['Hamas rejects the proposal', 'חמאס דוחה את ההצעה', 'הארגון דוחה את ההצעה', 'hamas_name_missing'],
  ['ХАМАСа отверг предложение', 'חמאס דחה את ההצעה', 'הארגון דחה את ההצעה', 'hamas_name_missing'],
  [
    'Houthis claim a drone attack',
    'החות\'ים טוענים לתקיפת כטב"ם',
    'המורדים טוענים לתקיפת כטב"ם',
    'houthis_name_missing',
  ],
  [
    'Tankers rerouted from the Strait of Hormuz',
    'מכליות הוסטו ממצר הורמוז',
    'מכליות הוסטו מהמפרץ',
    'hormuz_name_missing',
  ],
  [
    'Explosions reported near Isfahan',
    'דווח על פיצוצים ליד אספהאן',
    'דווח על פיצוצים ליד טהרן',
    'isfahan_name_missing',
  ],
  [
    'Khamenei warns Washington',
    'חמינאי מזהיר את וושינגטון',
    'המנהיג מזהיר את וושינגטון',
    'khamenei_name_missing',
  ],
  [
    'IDF says the strike hit a depot',
    'לפי צה״ל, התקיפה פגעה במחסן',
    'לפי הצבא, התקיפה פגעה במחסן',
    'idf_actor_missing',
  ],
];

test('glossary accepts correct Hebrew (incl. prefixes) and rejects a dropped entity', () => {
  for (const [src, good, bad, code] of CASES) {
    assert.equal(entityIssue(src, good, 'he'), null, 'good: ' + src);
    assert.equal(entityIssue(src, bad, 'he'), code, 'bad: ' + src);
  }
  assert.equal(
    entityIssue('Hezbollah statement', 'הודעה של לחיזבאללה ולחמאס', 'he'),
    null,
    'Hebrew prefix letters',
  );
});

test('fact-guard uses the glossary per field and keeps legacy behaviour', () => {
  assert.equal(
    factualTranslationIssue(o('Katz: no delay'), o('קטז: אין עיכוב')),
    'title:katz_name_corrupted',
  );
  assert.equal(factualTranslationIssue(o('Katz: no delay'), o('כ״ץ: אין עיכוב')), null);
  assert.equal(
    factualTranslationIssue(o('Hamas rejects the proposal'), o('הארגון דוחה את ההצעה')),
    'title:hamas_name_missing',
  );
});

test('words that merely contain an entity string do not trigger it', () => {
  assert.equal(entityIssue('Hamasaki and Hamasvili met', 'הם נפגשו', 'he'), null);
  assert.equal(entityIssue('The hormuzian dialect', 'הניב', 'he'), null);
});

test('Russian translations are checked against Russian forms', () => {
  assert.equal(entityIssue('Hezbollah fires rockets', 'Хезболла выпустила ракеты'), null);
  assert.equal(
    entityIssue('Hezbollah fires rockets', 'Группировка выпустила ракеты'),
    'hezbollah_name_missing',
  );
  assert.equal(entityIssue('Tankers in the Strait of Hormuz', 'Танкеры в Ормузском проливе'), null);
});

test('West Bank is not "western bank" (live Helsinki error 17.11)', () => {
  const src = 'Border Police arrest suspects in overnight West Bank raid';
  assert.equal(entityIssue(src, 'משטרת הגבול עצרה חשודים בפשיטת בנק מערבי בלילה'), 'west_bank_name_missing');
  assert.equal(entityIssue(src, 'משטרת הגבול עצרה חשודים בפשיטה לילית בגדה המערבית'), null);
  assert.equal(entityIssue(src, 'Пограничная полиция задержала подозреваемых на Западном берегу'), null);
});

// B11 part 1: entities from Wikidata (glossary-wikidata.mjs).
test('Wikidata entities: a swapped country, a dropped participant and a lost name are caught', () => {
  assert.equal(
    wikidataEntityIssue('Iran fires missiles at Jordan', 'איראן שיגרה טילים לעבר ישראל', 'he'),
    'jordan_name_missing',
  );
  assert.equal(
    wikidataEntityIssue('x'.repeat(161) + ' Jordan', 'ישראל', 'he'),
    null,
    'long bodies are not checked against Wikidata names',
  );
  assert.equal(
    wikidataEntityIssue('Trump meets Erdoğan in Ankara', 'Трамп встретился в Анкаре', 'ru'),
    'erdogan_name_missing',
  );
  assert.equal(
    wikidataEntityIssue('IAEA inspectors return to Natanz', 'פקחי סבא"א חוזרים למתקן', 'he'),
    'natanz_name_missing',
  );
});
test('Wikidata entities: case endings, Hebrew prefixes, acronyms and Latin originals are accepted', () => {
  assert.equal(wikidataEntityIssue('Strikes near Damascus', 'Удары под Дамаском', 'ru'), null);
  assert.equal(wikidataEntityIssue('Rubio visits Damascus', 'רוביו ביקר בדמשק', 'he'), null);
  assert.equal(
    wikidataEntityIssue('Former Mossad official warns', 'בכיר לשעבר במוסד מזהיר', 'he'),
    null,
    'article yields to a prefix',
  );
  assert.equal(wikidataEntityIssue('Iran-backed militias', 'проиранские ополченцы', 'ru'), null);
  assert.equal(wikidataEntityIssue('UNRWA staff detained', 'עובדי UNRWA נעצרו', 'he'), null);
  assert.equal(wikidataEntityIssue('Let us talk', 'בואו נדבר', 'he'), null, 'lowercase "us" is not the US');
  assert.equal(
    wikidataEntityIssue('Iranian officials said', 'גורמים איראניים אמרו', 'he'),
    null,
    'an adjective does not demand the noun',
  );
  assert.equal(
    wikidataEntityIssue('Kuwait faces new Iran attacks', 'כוויית מתמודדת עם מתקפות איראניות', 'he'),
    null,
    'final nun turns regular',
  );
  assert.equal(
    wikidataEntityIssue(
      'Saudi Arabia reports attacks',
      'Саудовская Аравия сообщила; удары по Саудовской Аравии',
      'ru',
    ),
    null,
  );
  assert.equal(
    wikidataEntityIssue('Israel steps up strikes in Gaza Strip', 'Израиль усиливает удары в Газе', 'ru'),
    null,
    'proper-noun part of a multi-word name',
  );
});

// B11 acceptance 20.11: manual-queue reasons sanaa_name_missing for «Австралия
// вводит санкции…» and eu_name_missing for «…и европейские страны…» were false.
// A Russian source form is a name with its case endings, not any word that
// starts with its stem; indeclinable names (Фордо, НАТО, Рубио) keep their form.
test('Wikidata: a Russian stem does not match other words or adjectives (live false rejections 20.11)', () => {
  const cases = [
    [
      'Мнение: Австралия вводит санкции против израильских деятелей',
      'דעה: אוסטרליה מטילה סנקציות על גורמים ישראליים',
    ],
    [
      'США и европейские страны потребовали от Ирана возобновить инспекции',
      'ארה"ב ומדינות אירופה דרשו מאיראן לחדש את הפיקוח',
    ],
    ['Доходы Хезболлы от золота', 'הכנסות חיזבאללה מזהב'],
    ['Авианосец «Джеральд Форд» прибыл в регион', "נושאת המטוסים ג'רלד פורד הגיעה לאזור"],
    ['Персонал посольства эвакуирован', 'צוות השגרירות פונה'],
    ['Натиск на юге усилился', 'הלחץ בדרום התגבר'],
    ['Манёвры у берегов', 'תמרונים ליד החוף'],
    ['Сирийская армия вошла в город', 'הצבא הסורי נכנס לעיר'],
    ['Российский МИД заявил', 'משרד החוץ הרוסי הודיע'],
    ['Египетский посредник прибыл', 'המתווך המצרי הגיע'],
    ['Кипрский порт закрыт', 'נמל קפריסאי נסגר'],
  ];
  for (const [s, t] of cases) assert.equal(wikidataEntityIssue(s, t, 'he'), null, s);
});

test('Wikidata: Russian names with case endings still demand the name', () => {
  assert.equal(wikidataEntityIssue('Удар по Сане', 'תקיפה בעיר', 'he'), 'sanaa_name_missing');
  assert.equal(wikidataEntityIssue('Переговоры в Дохе', 'שיחות בבירה', 'he'), 'doha_name_missing');
  assert.equal(
    wikidataEntityIssue('Иран и Россия подписали соглашение', 'איראן חתמה על הסכם', 'he'),
    'russia_name_missing',
  );
  assert.equal(wikidataEntityIssue('Генсек НАТО прибыл', 'המזכיר הכללי הגיע', 'he'), 'nato_name_missing');
  assert.equal(
    wikidataEntityIssue('МАГАТЭ требует доступа к Фордо', 'סבא"א דורשת גישה למתקן', 'he'),
    'fordow_name_missing',
  );
  assert.equal(wikidataEntityIssue('Санкции США против Ирана', 'סנקציות של ארה"ב נגד איראן', 'he'), null);
  assert.equal(wikidataEntityIssue('Удары по Сирии и Ливану', 'תקיפות בסוריה ובלבנון', 'he'), null);
});

test('Wikidata: «Европа» (the continent) is not the European Union', () => {
  assert.equal(wikidataEntityIssue('Переговоры в Европе продолжаются', 'השיחות באירופה נמשכות', 'he'), null);
  assert.equal(wikidataEntityIssue('Евросоюз ввёл санкции', 'הוטלו סנקציות', 'he'), 'eu_name_missing');
});

// Live 21.11: «מדווחים» («report») matched Doha (דוחה, with the vav-doubling
// variant), so correct RU translations of two Maariv headlines were redone
// three times and ended in the manual queue. A Hebrew name in the source is a
// whole word, with at most a one-letter prefix (ב/ה/ו/ל/מ/ש/כ).
test('Wikidata names in Hebrew sources match whole words only', () => {
  const report = 'צה"ל תקף בכיר בחמאס - בעזה מדווחים על חיסול מפקד חטיבת רפיח';
  assert.equal(
    wikidataEntityIssue(
      report,
      'ЦАХАЛ атаковал высокопоставленного деятеля ХАМАС — в Газе сообщают о ликвидации командира бригады Рафах',
      'ru',
    ),
    null,
  );
  assert.equal(
    wikidataEntityIssue(
      'הכוחות כבר באזור: בארה"ב מדווחים על תקיפה אפשרית',
      'Силы уже в регионе: в США сообщают о возможном ударе',
      'ru',
    ),
    null,
  );
  assert.equal(
    wikidataEntityIssue('שיחות הפסקת האש בדוחה נתקעו', 'Переговоры о прекращении огня зашли в тупик', 'ru'),
    'doha_name_missing',
  );
  assert.equal(
    wikidataEntityIssue(
      'שיחות הפסקת האש בדוחה נתקעו',
      'Переговоры о прекращении огня в Дохе зашли в тупик',
      'ru',
    ),
    null,
  );
});

test('B11 audit 21.11: air-defence systems are not swapped (David’s Sling ≠ Iron Dome)', () => {
  const sling = 'Israel said to upgrade David’s Sling system to counter wider range of ballistic threats';
  assert.equal(entityIssue(sling, 'ישראל תשדרג את מערכת כיפת ברזל'), 'davids_sling_name_missing');
  assert.equal(entityIssue(sling, 'ישראל תשדרג את מערכת קלע דוד'), null);
  assert.equal(entityIssue(sling, 'Израиль модернизирует систему «Праща Давида»'), null);
  assert.equal(
    entityIssue('ישראל משדרגת את קלע דוד', 'Израиль модернизирует «Железный купол»'),
    'davids_sling_name_missing',
  );
  assert.equal(entityIssue('Iron Dome intercepts rockets', '«Железный купол» перехватил ракеты'), null);
  assert.equal(entityIssue('Iron Dome intercepts rockets', 'קלע דוד יירט רקטות'), 'iron_dome_name_missing');
});

test('displaced (22.11): «перемещённые» is a calque; переселенцы / лишившиеся крова pass', () => {
  const src = 'Displaced Palestinians protest amid continuing Israeli air strikes on Gaza';
  assert.equal(
    entityIssue(
      src,
      'Перемещенные палестинцы протестуют на фоне продолжающихся израильских авиаударов в Газе',
    ),
    'displaced_calque',
  );
  assert.equal(
    entityIssue(src, 'Вынужденные переселенцы в Газе протестуют на фоне израильских авиаударов'),
    null,
  );
  assert.equal(entityIssue(src, 'Палестинцы, лишившиеся крова, протестуют на фоне авиаударов'), null);
  // The UN legal term stays allowed.
  assert.equal(
    entityIssue('UN: 1.9 million displaced people in Gaza', 'ООН: в Газе 1,9 млн внутренне перемещённых лиц'),
    null,
  );
});

test('IDF (22.11): «הרמטכ״ל לשעבר» carries the IDF in Hebrew', () => {
  const src =
    'Gadi Eisenkot, Yashar party chairman and former IDF chief of staff, condemned the arson attacks';
  assert.equal(entityIssue(src, 'גדי איזנקוט, יו״ר מפלגת ישר והרמטכ״ל לשעבר, גינה את ההצתות'), null);
  assert.equal(entityIssue(src, 'גדי איזנקוט, יו״ר מפלגת ישר, גינה את ההצתות'), 'idf_actor_missing');
});

// Each new entry: correct RU/HE, dropped entity RU/HE, and a non-trigger.
test('regional glossary additions preserve names without homonym false positives', () => {
  const cases = [
    [
      'iron_beam',
      'Iron Beam intercepts a drone',
      'מגן אור מיירט כטב״ם',
      'כיפת ברזל מיירטת כטב״ם',
      '«Железный луч» перехватывает беспилотник',
      '«Железный купол» перехватывает беспилотник',
      'An iron beam supports the ceiling',
    ],
    [
      'centcom',
      'CENTCOM reported',
      'סנטקום דיווח',
      'הפיקוד דיווח',
      'ЦЕНТКОМ сообщил',
      'Командование сообщило',
      'centcomet',
    ],
    [
      'unifil',
      'UNIFIL patrols',
      'יוניפי״ל מסייר',
      'כוח מסייר',
      'ЮНИФИЛ патрулирует',
      'Силы патрулируют',
      'unifilarly',
    ],
    [
      'pmf',
      'Popular Mobilization Forces deploy',
      'הגיוס העממי נפרס',
      'הכוחות נפרסו',
      'Силы народной мобилизации развёрнуты',
      'Войска развёрнуты',
      'Popular mobilization for a charity',
    ],
    [
      'knesset',
      'Knesset votes',
      'הכנסת מצביעה',
      'הממשלה מצביעה',
      'Кнессет голосует',
      'Правительство голосует',
      'Knessetarian',
    ],
    [
      'thaad',
      'THAAD deployed',
      'THAAD הוצב',
      'פטריוט הוצב',
      'THAAD развёрнут',
      'Patriot развёрнут',
      'thadding',
    ],
    [
      'f35i',
      'F-35I took off',
      'מטוס אדיר המריא',
      'מטוס סופה המריא',
      'F-35I «Адир» взлетел',
      'F-16 взлетел',
      'F-35 took off',
    ],
    [
      'shahed_drone',
      'Shahed-136 launched',
      'שאהד 136 שוגר',
      'כטב״ם שוגר',
      'Шахед-136 запущен',
      'Беспилотник запущен',
      'Shahed is a person',
    ],
    [
      'arrow_missile',
      'Arrow 3 intercepted',
      'חץ 3 יירט',
      'כיפת ברזל יירטה',
      'Хец-3 перехватил',
      'Patriot перехватил',
      'Follow an arrow',
    ],
    [
      'khan_younis',
      'Khan Younis targeted',
      'חאן יונס הותקפה',
      'עזה הותקפה',
      'Хан-Юнис атакован',
      'Газа атакована',
      'Khanate',
    ],
    [
      'rafah',
      'Rafah under fire',
      'רפיח תחת אש',
      'עזה תחת אש',
      'Рафах под огнём',
      'Газа под огнём',
      'Rafael spoke',
    ],
    [
      'jabalia',
      'Jabalia attacked',
      'ג׳באליה הותקפה',
      'רפיח הותקפה',
      'Джабалия атакована',
      'Рафах атакован',
      'Jabalianish',
    ],
    ['jenin', 'Raid in Jenin', 'פשיטה בג׳נין', 'פשיטה ברמאללה', 'Рейд в Дженине', 'Рейд в Рамалле', 'Jenina'],
    [
      'nablus',
      'Nablus operation',
      'מבצע בשכם',
      'מבצע בג׳נין',
      'Операция в Шхеме',
      'Операция в Дженине',
      'Nablusian',
    ],
    [
      'ramallah',
      'Talks in Ramallah',
      'שיחות ברמאללה',
      'שיחות בשכם',
      'Переговоры в Рамалле',
      'Переговоры в Шхеме',
      'Ramallahville',
    ],
    [
      'hebron',
      'Hebron clashes',
      'עימותים בחברון',
      'עימותים בשכם',
      'Столкновения в Хевроне',
      'Столкновения в Шхеме',
      'Hebronic',
    ],
    [
      'litani',
      'Litani River crossed',
      'נהר הליטני נחצה',
      'הנהר נחצה',
      'Река Литани пересечена',
      'Река пересечена',
      'Litanic',
    ],
    [
      'hodeidah',
      'Hodeidah port struck',
      'חודיידה הותקפה',
      'הנמל הותקף',
      'Ходейда атакована',
      'Порт атакован',
      'Hodeidahan',
    ],
    [
      'bab_mandeb',
      'Bab el-Mandeb closed',
      'באב אל-מנדב נסגר',
      'המצר נסגר',
      'Баб-эль-Мандеб закрыт',
      'Пролив закрыт',
      'Mandebian',
    ],
    [
      'gofman',
      'Roman Gofman spoke',
      'רומן גופמן אמר',
      'הקצין אמר',
      'Роман Гофман заявил',
      'Чиновник заявил',
      'Roman history',
    ],
    [
      'zini',
      'David Zini spoke',
      'דוד זיני אמר',
      'הקצין אמר',
      'Давид Зини заявил',
      'Чиновник заявил',
      'Zininess',
    ],
    [
      'cooper_centcom',
      'Brad Cooper visited',
      'בראד קופר ביקר',
      'המפקד ביקר',
      'Брэд Купер приехал',
      'Командующий приехал',
      'Cooperation',
    ],
  ];
  for (const [id, original, goodHe, badHe, goodRu, badRu, other] of cases) {
    assert.equal(entityIssue(original, goodHe, 'he'), null, id + ': good HE');
    assert.equal(entityIssue(original, badHe, 'he'), id + '_name_missing', id + ': missing HE');
    assert.equal(entityIssue(original, goodRu, 'ru'), null, id + ': good RU');
    assert.equal(entityIssue(original, badRu, 'ru'), id + '_name_missing', id + ': missing RU');
    assert.equal(entityIssue(other, 'הודעה כללית', 'he'), null, id + ': homonym');
  }
});

test('regional names accept role-only paraphrases and do not confuse systems', () => {
  assert.equal(entityIssue('Roman Gofman spoke', 'ראש המוסד אמר', 'he'), null);
  assert.equal(entityIssue('Roman Gofman spoke', 'Глава Моссада заявил', 'ru'), null);
  assert.equal(entityIssue('David Zini spoke', 'ראש השב״כ אמר', 'he'), null);
  assert.equal(entityIssue('David Zini spoke', 'Глава ШАБАК заявил', 'ru'), null);
  assert.equal(entityIssue('Brad Cooper visited', 'מפקד סנטקום ביקר', 'he'), null);
  assert.equal(entityIssue('Brad Cooper visited', 'Командующий CENTCOM приехал', 'ru'), null);
  assert.equal(entityIssue('Knesset votes', 'הפרלמנט מצביע', 'he'), null);
  assert.equal(entityIssue('Knesset votes', 'Парламент голосует', 'ru'), null);
  assert.equal(entityIssue('Follow the arrow', 'עקבו אחר החץ', 'he'), null);
  assert.equal(entityIssue('F-35 took off', 'מטוס המריא', 'he'), null);
});

test('review 22.11: CENTCOM, UNIFIL and Arrow accept common descriptive forms', () => {
  assert.equal(
    entityIssue(
      'CENTCOM says it struck Houthi targets',
      'Центральное командование США нанесло удары по хуситам',
    ),
    null,
  );
  assert.equal(
    entityIssue('CENTCOM says it struck Houthi targets', 'פיקוד המרכז האמריקאי תקף מטרות של החות׳ים'),
    null,
  );
  assert.equal(
    entityIssue('UNIFIL patrol came under fire', 'Патруль миротворцев ООН попал под обстрел'),
    null,
  );
  assert.equal(entityIssue('Arrow 3 intercepted the missile', 'Ракету перехватила система «Стрела-3»'), null);
  assert.equal(
    entityIssue('CENTCOM says it struck Houthi targets', 'Американские военные нанесли удары по хуситам'),
    'centcom_name_missing',
  );
});

test('PIJ: the short RU form «Исламский джихад» is accepted, a lost name is still caught (22.11)', () => {
  const src = 'Army says vehicle was ferrying Islamic Jihad operatives';
  assert.equal(entityIssue(src, 'Армия: в машине ехали боевики «Исламского джихада»'), null);
  assert.equal(entityIssue(src, 'Армия: в машине ехали боевики «Палестинского исламского джихада»'), null);
  assert.equal(entityIssue(src, 'Армия: в машине ехали боевики'), 'pij_name_missing');
  assert.equal(
    entityIssue("חוליית הג'יהאד האסלאמי חוסלה", 'Ликвидирована ячейка «Исламского джихада»'),
    null,
  );
  assert.equal(entityIssue('בכיר בגא"פ חוסל', 'Ликвидирован командир'), 'pij_name_missing');
  assert.equal(entityIssue(src, "הצבא: ברכב נסעו פעילי הג'יהאד האסלאמי"), null);
});

test('Arrow without a number in the source does not demand "Arrow 2/3" (22.11)', () => {
  const src = 'Arrow interceptor downs missile over the Negev';
  assert.equal(entityIssue(src, 'Перехватчик «Стрела» сбил ракету над Негевом'), null);
  assert.equal(entityIssue(src, 'Ракету над Негевом сбил «Хец»'), null);
  assert.equal(entityIssue(src, 'מיירט חץ יירט טיל מעל הנגב'), null);
  assert.equal(entityIssue(src, 'Ракету над Негевом сбили'), 'arrow_missile_name_missing');
  assert.equal(entityIssue('Arrow 3 intercepts missile', 'Хец-3 перехватил ракету'), null);
});

test('Arrow in Hebrew: «חץ» near a missile or defence word is accepted, a bare «חץ» is not (live 23.11)', () => {
  const src =
    'Czech officials toured Israel Aerospace Industries, receiving briefings on the Arrow missile defense system';
  assert.equal(entityIssue(src, 'בכירים צ׳כים קיבלו תדריך על מערכת ההגנה מפני טילים חץ'), null);
  assert.equal(entityIssue(src, 'הם קיבלו תדריך על החץ, מערכת ההגנה מפני טילים'), null);
  assert.equal(entityIssue(src, 'הם ראו חץ על השלט'), 'arrow_missile_name_missing');
});
