// Owner 21.11: «Срочно» becomes «Важно» six hours after publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/api/normalizeNewsArticle.js', import.meta.url), 'utf8').replace(
  /^export /gm,
  '',
);
const ctx = {};
vm.runInNewContext(src + '\nthis.effectiveTier = effectiveTier; this.TTL = URGENT_TTL_MS;', ctx);

test('urgent stays urgent for six hours, then reads as important', () => {
  const now = Date.parse('2026-11-21T18:00:00Z');
  assert.equal(ctx.TTL, 6 * 3600e3);
  assert.equal(ctx.effectiveTier('urgent', now - 5.9 * 3600e3, now), 'urgent');
  assert.equal(ctx.effectiveTier('urgent', now - 6.1 * 3600e3, now), 'important');
  assert.equal(ctx.effectiveTier('important', now - 30 * 3600e3, now), 'important');
  assert.equal(ctx.effectiveTier('normal', now - 30 * 3600e3, now), 'normal');
  assert.equal(ctx.effectiveTier('urgent', undefined, now), 'urgent', 'no time: keep the stored tier');
});
