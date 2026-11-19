// Q8 (19.11): the GPT monitor writes each dossier in its own shape. Live:
// 13 of the last 25 dossiers showed "no primary sources" although the links
// were there (primary_url, designation_url, secondary_url, primary_report,
// independent_reporting…), and dates/summary sat in keys the reader ignored.
// Payloads below are verbatim from CORE D1 monitor_events.
import test from 'node:test';
import assert from 'node:assert/strict';
import {storyProvenance} from '../../backend/editor/src/localization/stories-reader.mjs';
import {sourceText} from '../../backend/editor/src/localization/shared.mjs';

const OUTCAST = {title:'US Treasury Operation Economic Outcast: Hezbollah charity and IRGC-QF gold/cash network sanctions',published_at:'2026-11-18',primary_source:'US Treasury OFAC',primary_url:'https://home.treasury.gov/news/press-releases/sb0692/',designation_url:'https://ofac.treasury.gov/recent-actions/20261118',details:'OFAC designated Wa Taawanu charity, founder Afif Chouman, brothers Hassan and Ibrahim Khechen and gold trading entities linked by Treasury to Hezbollah and IRGC-QF cash/gold transfers. Official designations confirmed; underlying intelligence allegations attributed to Treasury.',assessment:'New financial pressure on Iran-linked Hezbollah networks, no independently new immediate kinetic threat or defensive action.',confidence:'high for designation; allegations attributed to US Treasury'};
const KUWAIT = {title:'Kuwait armed forces report active interception of hostile drones',published_at:'2026-11-18T00:00:00+02:00 approximate; exact original X timestamp not established',first_detected_at:'2026-11-18T00:57:40.152Z',source:'Kuwaiti Armed Forces General Staff via KUNA',primary_report:'https://www.wam.ae/en/article/17j582w-kuwait-air-defences-respond-hostile-drone-attacks',independent_reporting:['https://www.reuters.com/world/middle-east/bahrain-warns-potential-threat-urges-residents-seek-safety-2026-11-17/','https://www.aljazeera.com/news/2026/11/17/kuwait-reports-drone-attacks-as-iran-us-trade-attacks-on-qeshm-and-bahrain'],details:'Kuwait air defences engaged hostile drones late Nov 17/early Nov 18.',followup_20261118:{source:'Reuters',url:'https://www.reuters.com/world/middle-east/bahrain-warns-potential-threat-urges-residents-seek-safety-2026-11-17/',finding:'Iranian state media reports…'}};
const NYT = {title:'NYT reporting cited in Israeli press: Iran hardens negotiating stance',publication_date:'2026-11-18',source:'New York Times, via Jerusalem Post and Israel National News',secondary_url:'https://www.jpost.com/middle-east/iran-news/article-915254',additional_url:'https://www.israelnationalnews.com/news/436504',change:'strategic bargaining posture report, not an observed new military operation'};

test('every https link the monitor wrote is a source; primary first, deduplicated', () => {
  assert.deepEqual(storyProvenance(OUTCAST).source_urls, ['https://home.treasury.gov/news/press-releases/sb0692/','https://ofac.treasury.gov/recent-actions/20261118']);
  assert.equal(storyProvenance(OUTCAST).sources[0].type, 'primary_url');
  assert.deepEqual(storyProvenance(KUWAIT).source_urls, [
    'https://www.wam.ae/en/article/17j582w-kuwait-air-defences-respond-hostile-drone-attacks',
    'https://www.reuters.com/world/middle-east/bahrain-warns-potential-threat-urges-residents-seek-safety-2026-11-17/',
    'https://www.aljazeera.com/news/2026/11/17/kuwait-reports-drone-attacks-as-iran-us-trade-attacks-on-qeshm-and-bahrain',
  ]);
  assert.deepEqual(storyProvenance(NYT).source_urls, ['https://www.jpost.com/middle-east/iran-news/article-915254','https://www.israelnationalnews.com/news/436504']);
  // A non-URL "source" (a publisher name) is not a link.
  assert.ok(!storyProvenance(KUWAIT).source_urls.some(u => !u.startsWith('https://')));
});

test('publication date from any of the monitor date keys; free text is not a date', () => {
  assert.equal(storyProvenance(OUTCAST).published_at, '2026-11-18');
  assert.equal(storyProvenance(NYT).published_at, '2026-11-18');
  assert.equal(storyProvenance(KUWAIT).published_at, '2026-11-18T00:00:00+02:00');
});

test('summary falls back to details/assessment/change when summary_ru is absent', () => {
  assert.match(sourceText('story', OUTCAST).body, /^OFAC designated Wa Taawanu/);
  assert.match(sourceText('story', NYT).body, /^strategic bargaining posture/);
  // An authored summary_ru still wins and keeps existing translation hashes.
  assert.equal(sourceText('story', {...OUTCAST, title_ru: 'Т', summary_ru: 'Русский пересказ'}).body, 'Русский пересказ');
});

test('RU dossier enrichment hands the model the monitor text, not only the title', async () => {
  const {enrichNewMonitorStories} = await import('../../backend/editor/src/stories/enrichment.mjs');
  const row = {event_id: 'us-treasury-hezbollah-gold-charity-sanctions-20261118', payload: JSON.stringify(OUTCAST), updated_at_ms: 1};
  const stmt = sql => ({
    bind: () => stmt(sql),
    all: async () => ({results: /FROM monitor_events/.test(sql) ? [row] : []}),
    run: async () => ({meta: {changes: 1}}),
    first: async () => null,
  });
  let seen = '';
  const env = {
    CORE_DB: {prepare: stmt},
    AI: {run: async (_m, input) => { seen = input.messages[1].content; return {response: '{"title_ru":"","summary_ru":"","confidence":0,"issues":["x"]}'}; }},
  };
  await enrichNewMonitorStories(env);
  assert.match(seen, /OFAC designated Wa Taawanu/);
  assert.match(seen, /New financial pressure/);
});
