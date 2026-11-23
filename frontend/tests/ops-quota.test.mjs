// /ops «Квоты Cloudflare» (owner 23.11): today from the hourly usage report,
// yesterday from the nightly one, D1 split by database, alarm by forecast.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../documents/ops.html', import.meta.url), 'utf8');
const grab = re => {
  const m = html.match(re);
  assert.ok(m, 'ops.html piece ' + re);
  return m[0];
};
const code = [
  grab(/const esc=.*\n/),
  grab(/const fmt=.*\n/),
  grab(/function quota\(title[\s\S]*?\n}\n/),
  'const openState={};',
  grab(/const sec=\([\s\S]*?<\/details>`};\n/),
  grab(/function quotaSection\(rows\)\{[\s\S]*?\n\nfunction extSection/).replace(
    /\n\nfunction extSection$/,
    '',
  ),
].join('\n');
const run = (rows, now) => {
  const ctx = {
    Date: class extends Date {
      constructor(...a) {
        super(...(a.length ? a : [now]));
      }
      static now() {
        return now;
      }
    },
  };
  vm.runInNewContext(code + '\nthis.out = quotaSection(this.rows);', Object.assign(ctx, { rows }));
  return ctx.out;
};
const NOW = Date.parse('2026-11-23T12:00:00Z');
const row = (day, metric, value, budget, collected_ms, detail = '') => ({
  day,
  metric,
  value,
  budget,
  collected_ms,
  detail,
});

test('today, forecast, yesterday and the per-database split are shown', () => {
  const out = run(
    [
      row(
        '2026-11-23',
        'd1_rows_read',
        1_000_000,
        5_000_000,
        NOW,
        JSON.stringify({
          'd9ba2c51-d551-4615-bbe2-37e76e2d668a': 700000,
          'c052acf3-b821-444a-92e4-ffd472a131f0': 300000,
        }),
      ),
      row('2026-11-22', 'd1_rows_read', 2_300_000, 5_000_000, NOW - 86400000),
    ],
    NOW,
  );
  assert.match(out, /Квоты Cloudflare/);
  assert.match(out, /прогноз на сутки 2,00 млн \(40%\)/);
  assert.match(out, /вчера 2,30 млн \(46%\)/);
  assert.match(out, /NEWS 700\s000 · CORE 300\s000/);
  assert.doesNotMatch(out, /dot bad/);
});

test('a forecast over the daily limit turns the section red before the limit is hit', () => {
  const out = run([row('2026-11-23', 'd1_rows_read', 2_800_000, 5_000_000, NOW)], NOW);
  assert.match(out, /dot bad/);
});

test('no usage rows: the section says so instead of zeros', () => {
  const out = run([], NOW);
  assert.match(out, /нет данных/);
  assert.doesNotMatch(out, /0 \/ 0/);
});
