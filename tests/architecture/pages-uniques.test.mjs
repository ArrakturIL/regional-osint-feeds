// Unique visitors (owner 21.11): one salted fingerprint per person per Israel
// day; no IP stored; bots and /ops not counted; the real Pages entrypoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from './editor-d1-fixture.mjs';
import { countUnique, uniqueStats, israelWeek } from '../../backend/pages/src/api/uniques.js';
import pages from '../../backend/pages/src/index.js';

const req = (path, ip, ua) =>
  new Request('https://regional-watch.pages.dev' + path, {
    headers: { 'cf-connecting-ip': ip, 'user-agent': ua },
  });
const FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0';
const NOW = Date.parse('2026-11-21T20:00:00Z');

test('same person twice is one; another person or browser is another; bots are not counted', async () => {
  const db = d1();
  const env = { DB: db };
  assert.equal(await countUnique(req('/', '1.2.3.4', FIREFOX), env, NOW), true);
  await countUnique(req('/events', '1.2.3.4', FIREFOX), env, NOW + 60000);
  await countUnique(req('/', '5.6.7.8', FIREFOX), env, NOW);
  await countUnique(req('/', '1.2.3.4', FIREFOX + ' Other'), env, NOW);
  assert.equal(await countUnique(req('/', '9.9.9.9', 'Googlebot/2.1'), env, NOW), false);
  const stats = await uniqueStats(db, NOW);
  assert.deepEqual(stats.days, [{ day: '2026-11-21', uniques: 3 }]);
  assert.deepEqual(stats.weeks, [{ week: '2026-11-15', uniques: 3 }], 'Israeli week starts on Sunday 15.11');
  const stored = JSON.stringify(db.rows('SELECT * FROM site_uniques'));
  assert.doesNotMatch(stored, /1\.2\.3\.4|5\.6\.7\.8/, 'no IP is stored');
});

test('a new day counts the person again; within one Israeli week the person is one weekly unique', async () => {
  const db = d1();
  const env = { DB: db };
  const tue = Date.parse('2026-11-17T10:00:00Z');
  await countUnique(req('/', '1.2.3.4', FIREFOX), env, tue);
  await countUnique(req('/', '1.2.3.4', FIREFOX), env, tue + 86400e3);
  await countUnique(req('/', '5.6.7.8', FIREFOX), env, tue + 86400e3);
  const stats = await uniqueStats(db, tue + 86400e3);
  assert.deepEqual(stats.days, [
    { day: '2026-11-17', uniques: 1 },
    { day: '2026-11-18', uniques: 2 },
  ]);
  assert.deepEqual(
    stats.weeks,
    [{ week: '2026-11-15', uniques: 2 }],
    'not 3: the weekly fingerprint links one week',
  );
  const daily = db.rows("SELECT hash FROM site_uniques WHERE period LIKE 'D:%'").map(r => r.hash);
  assert.equal(new Set(daily).size, 3, 'daily fingerprints of one person differ between days');
  assert.equal(israelWeek(Date.parse('2026-11-21T20:00:00Z')), '2026-11-15');
  assert.equal(israelWeek(Date.parse('2026-11-22T08:00:00Z')), '2026-11-22', 'Sunday starts a new week');
});

test('the Pages entrypoint counts public pages and never /ops', async () => {
  const db = d1();
  const env = { DB: db, ASSETS: { fetch: async () => new Response('<html></html>', { status: 200 }) } };
  await pages.fetch(req('/', '1.2.3.4', FIREFOX), env);
  await pages.fetch(req('/ops', '7.7.7.7', FIREFOX), env);
  assert.equal(db.one("SELECT count(*) n FROM site_uniques WHERE period LIKE 'D:%'").n, 1);
});

test('21.11: an unknown address answers 404 with the 404 page, not the home page with 200', async () => {
  const asked = [];
  const env = {
    ASSETS: {
      fetch: async r => {
        asked.push(new URL(r.url).pathname);
        return new Response('<html>404 page</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      },
    },
  };
  const res = await pages.fetch(req('/no-such-page', '1.1.1.1', FIREFOX), env);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /404 page/);
  assert.deepEqual(asked, ['/404.html']);
  const api = await pages.fetch(req('/api/no-such', '1.1.1.1', FIREFOX), env);
  assert.equal(api.status, 404);
  assert.match(api.headers.get('content-type') || '', /json/);
});
