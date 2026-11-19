// Q6 (QA 19.11): RU switch on "/he/analysts/" led to "/analysts/analysts".
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const src = readFileSync(new URL('../src/components/Header/Header.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm, '')
  .replace(/^export function /gm, 'function ');
const {analystPostSuffix} = vm.runInNewContext(src + '\n({analystPostSuffix})', {});

test('locale switch keeps the analyst post id and nothing else', () => {
  assert.equal(analystPostSuffix('/he/analysts/'), '');
  assert.equal(analystPostSuffix('/he/analysts'), '');
  assert.equal(analystPostSuffix('/analysts/'), '');
  assert.equal(analystPostSuffix('/he/analysts/analyst-abuali-telegram-133630'), '/analyst-abuali-telegram-133630');
  assert.equal(analystPostSuffix('/analysts/analyst-yigal-telegram-103572/'), '/analyst-yigal-telegram-103572');
  assert.equal(analystPostSuffix('/he/events'), '');
});
