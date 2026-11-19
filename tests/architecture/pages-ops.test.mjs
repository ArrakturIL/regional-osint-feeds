// Owner service page (/ops, 19.11): read-only aggregate behind a server-side login.
import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePages} from '../../backend/pages/src/index.js';
import {ownership} from '../../backend/pages/src/routes.js';

const db = sqls => ({prepare: sql => { sqls.push(sql); return {bind: () => ({all: async () => ({results: []})})}; }});
const req = auth => new Request('https://regional-watch.pages.dev/api/ops', {headers: auth ? {Authorization: 'Basic ' + btoa(auth)} : {}});

test('/api/ops refuses without or with wrong credentials, never touching D1', async () => {
  for (const auth of [null, 'admin:wrong', 'root:admin']) {
    const sqls = [];
    const r = await handlePages(req(auth), {DB: db(sqls), NEWS_DB: db(sqls)});
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.equal(sqls.length, 0);
  }
});

test('/api/ops: admin/admin by default, Pages secrets override; read-only SQL only', async () => {
  const sqls = [];
  const r = await handlePages(req('admin:admin'), {DB: db(sqls), NEWS_DB: db(sqls)});
  assert.equal(r.status, 200);
  const body = await r.json();
  for (const k of ['quotas', 'translations', 'sources', 'collectors', 'gpt', 'limits']) assert.ok(k in body, k);
  assert.ok(sqls.length > 10 && sqls.every(s => /^\s*SELECT\b/i.test(s)), 'read-only');
  const set = await handlePages(req('admin:admin'), {DB: db([]), NEWS_DB: db([]), OPS_USER: 'boss', OPS_PASSWORD: 's3cret'});
  assert.equal(set.status, 401);
  assert.equal((await handlePages(req('boss:s3cret'), {DB: db([]), NEWS_DB: db([]), OPS_USER: 'boss', OPS_PASSWORD: 's3cret'})).status, 200);
});

test('/ops is a page, /api/ops is a Pages endpoint', () => {
  assert.equal(ownership('/ops').kind, 'html');
  assert.equal(ownership('/api/ops').kind, 'pages');
});
