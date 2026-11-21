// Concept E «Главное сейчас» (owner 21.11): lead + four by urgency, page-language
// titles first; source network counts by state.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/components/TopNow/TopNow.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
const ctx = { UI_HE: false, h: () => null, t: () => null, GoLink: () => null };
vm.runInNewContext(src + '\nthis.topStories = topStories; this.networkCounts = networkCounts;', ctx);
const ids = list => JSON.stringify(list.map(s => s.id));

test('lead is the first urgent item; then important, then normal, keeping feed order', () => {
  const s = (id, tier, extra = {}) => ({ id, tier, title: id, translation_state: 'translated', ...extra });
  const got = ctx.topStories(
    [
      s('n1', 'normal'),
      s('i1', 'important'),
      s('u1', 'urgent'),
      s('i2', 'important'),
      s('n2', 'normal'),
      s('u2', 'urgent'),
      s('n3', 'normal'),
    ],
    'ru',
  );
  assert.equal(ids(got), '["u1","u2","i1","i2","n1"]');
});

test('an untranslated item never becomes the lead while translated ones exist', () => {
  const got = ctx.topStories(
    [
      { id: 'he-orig', tier: 'urgent', title: 'כותרת', translation_state: 'pending', content_language: 'he' },
      {
        id: 'ru',
        tier: 'important',
        title: 'Заголовок',
        translation_state: 'translated',
        content_language: 'en',
      },
    ],
    'ru',
  );
  assert.equal(ids(got), '["ru","he-orig"]');
  assert.equal(ctx.topStories(null, 'ru').length, 0);
});

test('network counts by state, unknown states ignored', () => {
  const c = ctx.networkCounts([
    { state: 'ok' },
    { state: 'ok' },
    { state: 'partial' },
    { state: 'error' },
    { state: 'weird' },
    null,
  ]);
  assert.equal(JSON.stringify(c), '{"ok":2,"partial":1,"empty":0,"error":1}');
});
