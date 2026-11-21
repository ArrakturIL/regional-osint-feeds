import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleData, dataFromD1 } from '../../backend/pages/src/api/data.js';
const at = 1794679980000,
  now = 1794680000000,
  future = '2026-12-01T04:59:00Z',
  past = '2026-11-08T20:29:00Z';
const row = (market_id, observed_at, price, volume, ends_at = future) => ({
  observed_at,
  payload: JSON.stringify({
    market_id,
    question: 'Market ' + market_id,
    outcomes: ['Yes', 'No'],
    outcome_prices: [price, 1 - price],
    volume_24h: volume,
    liquidity: 70,
    ends_at,
    url: 'https://polymarket.com/event/' + market_id,
  }),
});
test('market snapshots are deduplicated, ordered, and expired markets excluded', () => {
  const m = assembleData({
    nowMs: now,
    marketRows: [
      row('A', at - 21600000, 0.05, 40),
      row('A', at, 0.03, 100),
      row('B', at, 0.4, 20),
      row('OLD', at, 0.2, 200, past),
      row('BAD', at, 0.3, 90, 'garbage'),
    ],
  }).markets;
  assert.deepEqual(
    m.map(x => x.id),
    ['A', 'B'],
  );
  assert.ok(Math.abs(m[0].changePoints + 2) < 1e-9);
  assert.equal(m[0].comparisonFrom, new Date(at - 21600000).toISOString());
  assert.equal(m[0].asOf, new Date(at).toISOString());
  assert.equal(m[1].changePoints, null);
  assert.equal(m[0].end, future);
});
test('official statements preserve original source and timestamps without false freshness', () => {
  const rows = [
    {
      source: 'idf_official',
      observed_at: at,
      payload: JSON.stringify({
        url: 'https://t.me/idfofficial/1',
        title: 'IDF statement',
        excerpt: 'Source text',
        published_at: '2026-11-13T14:28:02+00:00',
      }),
    },
    {
      source: 'marad_official',
      observed_at: at,
      payload: JSON.stringify({
        url: 'https://www.maritime.dot.gov/x',
        title: 'Advisory',
        advisory_id: '2026-013',
        status: 'active',
        published_at: null,
        caveat: 'Publication time unknown',
      }),
    },
    {
      source: 'centcom_dvids',
      observed_at: at,
      payload: JSON.stringify({
        url: 'https://www.dvidshub.net/news/1',
        title: 'News item',
        published_at: '2026-11-11T10:00:00Z',
        caveat: 'Official feed',
      }),
    },
  ];
  const d = assembleData({
    nowMs: now,
    officialRows: rows,
    sceneRows: [
      {
        payload: JSON.stringify({
          scene_id: 'S2',
          area: 'red_sea',
          acquired_at: '2026-11-14T07:00:00Z',
          cloud_cover_percent: null,
          item_url: 'https://earth-search.aws.element84.com/item/1',
        }),
      },
    ],
  });
  assert.deepEqual(Object.keys(d), [
    'generatedAt',
    'markets',
    'home',
    'airbridge',
    'aviationSamples',
    'providerLimits',
    'satelliteScenes',
    'marad',
    'centcom',
    'advisories',
    'alt',
    'sources',
  ]);
  assert.equal(d.home[0].active, false);
  assert.equal(d.home[0].description, 'Source text');
  assert.equal(d.marad[0].published, null);
  assert.equal(d.marad[0].active, true);
  assert.equal(d.centcom[0].url, 'https://www.dvidshub.net/news/1');
  assert.equal(d.satelliteScenes[0].cloudCover, null);
});
test('corrupt or unsafe market links cannot enter the active feed', () => {
  const a = row('A', at, 0.5, 100);
  const x = JSON.parse(a.payload);
  x.url = 'http://phishing.test/event/1';
  a.payload = JSON.stringify(x);
  assert.equal(assembleData({ marketRows: [a], nowMs: now }).markets.length, 0);
});
test('read-only D1 API uses canonical sources and never mutates database', async () => {
  const sql = [],
    db = {
      prepare(q) {
        sql.push(q);
        return { sql: q };
      },
      async batch() {
        return [
          { results: [row('A', at, 0.3, 15)] },
          { results: [] },
          { results: [] },
          { results: [{ source: 'ais', state: 'ok', attempted_at: at, succeeded_at: at, detail: null }] },
        ];
      },
    };
  const d = await dataFromD1({ DB: db }, now);
  assert.equal(sql.length, 5); // + advisories (21.11)
  assert.equal(d.markets.length, 1);
  assert.equal(d.sources[0].id, 'ais');
  assert.equal(d.sources[0].label, 'AIS');
  for (const s of sql) assert.ok(s.trim().startsWith('SELECT') || s.trim().startsWith('WITH'));
});

test('MARAD advisories and CENTCOM releases follow the live public ordering', () => {
  const at = 1794679980000;
  const mk = (source, id, published_at = null) => ({
    source,
    observed_at: at,
    payload: JSON.stringify({
      url: 'https://example.com/' + id,
      title: id,
      advisory_id: id,
      published_at,
      status: 'active',
    }),
  });
  const rows = [
    mk('marad_official', '010'),
    mk('marad_official', '013'),
    mk('marad_official', '011'),
    mk('centcom_dvids', 'old', '2026-10-25T16:42:55Z'),
    mk('centcom_dvids', 'latest', '2026-11-07T20:31:51Z'),
    mk('centcom_dvids', 'middle', '2026-11-07T13:31:30Z'),
  ];
  const d = assembleData({ officialRows: rows });
  assert.deepEqual(
    d.marad.map(x => x.id),
    ['013', '011', '010'],
  );
  assert.deepEqual(
    d.centcom.map(x => x.title),
    ['latest', 'middle', 'old'],
  );
});
test('Polymarket changePoints preserve the unrounded public API number', () => {
  const m = assembleData({
    nowMs: at + 1000,
    marketRows: [row('A', at - 21600000, 0.05, 40), row('A', at, 0.03, 100)],
  }).markets[0];
  assert.equal(m.changePoints, (0.03 - 0.05) * 100);
});
test('Sentinel catalog metadata does not claim verified cloud coverage', () => {
  const d = assembleData({
    sceneRows: [
      {
        observed_at: at,
        payload: JSON.stringify({
          scene_id: 'S2',
          area: 'red_sea_south',
          acquired_at: '2026-11-14T07:36:05Z',
          cloud_cover_percent: 47,
          item_url: 'https://earth-search.aws.element84.com/v1/item/S2',
        }),
      },
    ],
  });
  assert.equal(d.satelliteScenes[0].cloudCover, null);
});
test('Sentinel SQL breaks same-snapshot ties by acquisition time descending', async () => {
  const queries = [],
    db = {
      prepare(sql) {
        queries.push(sql);
        return { sql };
      },
      async batch() {
        return [{ results: [] }, { results: [] }, { results: [] }, { results: [] }];
      },
    };
  await dataFromD1({ DB: db }, at);
  assert.ok(
    queries[2].includes("ORDER BY observed_at DESC,json_extract(payload,'$.acquired_at') DESC LIMIT 10"),
  );
});

test('E-05: YES-token semantics respect outcomes order and are not a verified probability', () => {
  const mk = (id, outcomes, prices, more = {}) => ({
    observed_at: at,
    payload: JSON.stringify({
      market_id: id,
      question: 'Question ' + id,
      outcomes,
      outcome_prices: prices,
      volume_24h: 20,
      liquidity: 10,
      ends_at: future,
      url: 'https://polymarket.com/event/' + id,
      ...more,
    }),
  });
  const rows = [
    mk('reversed', ['No', 'Yes'], [0.8, 0.2]),
    mk('closed', ['Yes', 'No'], [0.9, 0.1], { closed: true }),
    mk('inactive', ['Yes', 'No'], [0.9, 0.1], { active: false }),
    mk('invalid', ['No', 'Undecided'], [0.8, 0.2]),
    mk('null', ['Yes', 'No'], [null, 0.8]),
  ];
  const result = assembleData({ marketRows: rows, nowMs: now }).markets;
  assert.deepEqual(
    result.map(x => x.id),
    ['reversed'],
  );
  assert.equal(result[0].yes, 0.2);
  assert.equal(result[0].price_kind, 'yes_token_price');
  assert.equal(result[0].independent_probability, false);
  assert.equal(result[0].market_status, 'active');
});
test('21.11: ?lang=he drops the Russian market caveat and Russian source labels', () => {
  const d = assembleData({ nowMs: now, marketRows: [row('A', at, 0.03, 100)], lang: 'he' });
  assert.equal(d.markets.length, 1);
  assert.equal('caveat' in d.markets[0], false);
  assert.ok(
    assembleData({ nowMs: now, marketRows: [row('A', at, 0.03, 100)] }).markets[0].caveat,
    'RU keeps it',
  );
});

test('21.11: advisories for «Лента» — UKMTO title and date from the file name, FCDO change note, newest first', () => {
  const at = Date.parse('2026-11-21T10:00:00Z');
  const r = (source, payload) => ({ source, observed_at: at, payload: JSON.stringify(payload) });
  const d = assembleData({
    advisoryRows: [
      r('mscio', {
        url: 'https://mscio.eu/media/documents/20250611-UKMTO_MSCIO_JMIC_ADVISORY_INCIDENT__021-251.pdf',
      }),
      r('mscio', { url: 'https://mscio.eu/media/documents/20260909-UKMTO_ADVISORY_129-26_fAkhO2Z.pdf' }),
      r('mscio', { url: 'https://mscio.eu/media/documents/20250704-UKMTO_ADVISORY_INCIDENT_025-25.pdf' }),
      r('fcdo', {
        url: 'https://www.gov.uk/foreign-travel-advice/iran',
        title: 'Iran travel advice',
        updated_at: '2026-11-18T16:30:59+00:00',
        change_description: 'Updated information about regional tensions',
      }),
      r('easa', { url: 'http://insecure.example/czib', title: 'Airspace of Iran' }),
    ],
  });
  assert.deepEqual(d.advisories.ukmto[0].title, 'UKMTO Advisory 129/26');
  assert.equal(
    d.advisories.ukmto[0].published,
    '2026-09-09T00:00:00.000Z',
    'newest file first, whatever the batch order',
  );
  assert.deepEqual(
    d.advisories.ukmto.map(x => x.title),
    ['UKMTO Advisory 129/26', 'UKMTO Advisory 025/25', 'UKMTO Advisory 021/25'],
  );
  assert.equal(d.advisories.fcdo[0].description, 'Updated information about regional tensions');
  assert.equal(d.advisories.easa.length, 0, 'only https links');
  const many = assembleData({
    advisoryRows: Array.from({ length: 7 }, (_, i) =>
      r('mscio', {
        url: 'https://mscio.eu/media/documents/2026090' + (i + 1) + '-UKMTO_ADVISORY_10' + i + '-26.pdf',
      }),
    ),
  });
  assert.equal(many.advisories.ukmto.length, 3, 'three per body');
  assert.equal(many.advisories.ukmto[0].title, 'UKMTO Advisory 106/26');
  const easa = assembleData({
    advisoryRows: [
      r('easa', {
        url: 'https://www.easa.europa.eu/czib-2026-03-r3',
        title: 'Airspace of Saudi Arabia',
        published: 'Mon, 01 Jun 2026 00:00:00 +0300',
      }),
      r('easa', {
        url: 'https://www.easa.europa.eu/czib-2026-03-r4',
        title: 'Airspace of Saudi Arabia',
        published: 'Tue, 14 Jul 2026 00:00:00 +0300',
      }),
    ],
  }).advisories.easa;
  assert.equal(easa.length, 1, 'one bulletin, its newest revision');
  assert.match(easa[0].url, /-r4$/);
});
