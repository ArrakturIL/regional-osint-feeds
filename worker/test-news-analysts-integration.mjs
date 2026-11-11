import assert from 'node:assert/strict';
import worker from './regional-watch-editor.js';

const queryRows = {
  analysts: [{id: 'sergey-auslender', display_name: 'Сергей Ауслендер', description: 'Журналист'}],
  publications: [],
};
const env = {
  CORE_DB: {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          return {results: sql.includes('FROM analysts') ? queryRows.analysts : queryRows.publications};
        },
      };
    },
  },
  NEWS_DB: {
    prepare() {
      return {
        async first() { return {value: JSON.stringify({updated_at: '2026-11-12T00:00:00Z'})}; },
      };
    },
  },
  AI: {},
};
async function get(path) {
  const response = await worker.fetch(new Request('https://regional-watch-editor.test' + path), env);
  return {status: response.status, body: await response.text()};
}
const analysts = await get('/api/analysts');
assert.equal(analysts.status, 200);
assert.equal(JSON.parse(analysts.body).analysts[0].id, 'sergey-auslender');
const posts = await get('/api/analyst-posts');
assert.equal(posts.status, 200);
assert.deepEqual(JSON.parse(posts.body).posts, []);
const detail = await get('/api/analyst-posts/not-found');
assert.equal(detail.status, 404);
const news = await get('/health');
assert.equal(news.status, 200);
assert.equal(JSON.parse(news.body).updated_at, '2026-11-12T00:00:00Z');
assert.equal((await get('/unknown')).status, 404);
console.log('integrated news and analyst editor routing checks: OK');
