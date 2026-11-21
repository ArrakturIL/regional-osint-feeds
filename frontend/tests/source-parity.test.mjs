import { assembleStyles } from '../scripts/build-styles.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemble } from '../scripts/build.mjs';
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  root = resolve(here, '..');
const manifest = JSON.parse(readFileSync(resolve(here, 'build-order.json'), 'utf8'));
// Formatting-insensitive view of JS source (#8a Prettier): no whitespace, one quote style, no trailing commas.
const code = s =>
  String(s)
    .replace(/\s+/g, '')
    .replace(/'/g, '"')
    .replace(/,([)\]}])/g, '$1');
test('all ordered source modules exist', () => {
  assert.equal(manifest.order.length, 56);
  for (const p of manifest.order) assert.ok(existsSync(resolve(here, 'src', p)), p + ' is missing');
});
test('bundle contains the intentional news/grid fixes', () => {
  const compiled = assemble(),
    C = code(compiled);
  assert.ok(compiled.startsWith(manifest.prefix));
  assert.ok(C.includes(code('function NewsMasonry(')));
  assert.ok(C.includes(code('className:"rw-site-source-count",dir:"ltr"')));
  assert.ok(!compiled.includes('gridRowEnd'));
});
test('each frontend source parses as an ES module', () => {
  for (const p of manifest.order) {
    const r = spawnSync(process.execPath, ['--check', resolve(here, 'src', p)], { encoding: 'utf8' });
    assert.equal(r.status, 0, p + ': ' + r.stderr);
  }
});
test('each local module import points to an existing file', () => {
  for (const p of manifest.order) {
    const abs = resolve(here, 'src', p),
      src = readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/^import \{ ([^}]+) \} from '([^']+)';$/gm)) {
      const target = resolve(dirname(abs), m[2]);
      assert.ok(existsSync(target), p + ' -> ' + m[2]);
      const contents = readFileSync(target, 'utf8');
      for (const symbol of m[1].split(',').map(s => s.trim()))
        assert.ok(contents.includes(symbol), p + ' imports ' + symbol + ' from ' + m[2]);
    }
  }
});
test('single App tree serves both Russian and Hebrew', () => {
  const app = code(readFileSync(resolve(here, 'src/app/App.js'), 'utf8'));
  assert.ok(app.includes(code('function App()')));
  for (const path of ['/events', '/data', '/analysts'])
    assert.ok(app.includes(code('route==="' + path + '"')), path + ' route missing');
  const runtime = code(readFileSync(resolve(here, 'src/app/runtime.js'), 'utf8'));
  assert.ok(runtime.includes(code('const UI_HE=')));
  assert.ok(existsSync(resolve(here, 'src/i18n/meta.js')));
});

test('component-owned CSS sources replace the single authored stylesheet', () => {
  assert.ok(!existsSync(resolve(here, 'src/styles/app.css')), 'legacy monolith is still authored');
  const source = readFileSync(resolve(here, 'styles-order.json'), 'utf8');
  const parts = JSON.parse(source).order;
  assert.ok(parts.length >= 20, 'styles must be split across page/component concerns');
  assert.ok(
    parts.some(x => x.startsWith('components/')),
    'component styles must be colocated',
  );
  assert.ok(
    parts.some(x => x.startsWith('pages/')),
    'page styles must be colocated',
  );
  for (const file of parts) assert.ok(existsSync(resolve(here, 'src', file)), file + ' missing');
});
