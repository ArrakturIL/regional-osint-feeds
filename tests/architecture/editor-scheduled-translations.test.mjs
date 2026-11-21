import test from 'node:test';
import assert from 'node:assert/strict';
import { translateTitles, translateIDF } from '../../backend/editor/src/translations/scheduled.mjs';

const NOW = Date.parse('2026-11-16T00:00:00Z');
const makeDb = handler => ({
  prepare(sql) {
    const statement = (args = []) => ({
      run: async () => handler('run', sql, args),
      first: async () => handler('first', sql, args),
      all: async () => handler('all', sql, args),
      bind(...next) {
        return statement(next);
      },
    });
    return statement();
  },
});

test('IDF translation rejects missing core database and keeps its independent daily cap', async () => {
  let reads = 0,
    ai = 0;
  const NEWS_DB = makeDb((method, sql) => {
    reads++;
    if (method === 'run' && sql.includes('INSERT OR IGNORE INTO official_translation_budget'))
      return { meta: { changes: 1 } };
    if (method === 'first' && sql.includes('FROM official_translation_budget'))
      return { batches: 24, estimated_neurons: 0 };
    throw Error('Unexpected IDF budget request: ' + sql);
  });
  const env = {
    NEWS_DB,
    AI: {
      run: async () => {
        ai++;
        return null;
      },
    },
  };
  assert.deepEqual(await translateIDF(env, NOW), { translated: 0, error: 'core database binding missing' });
  assert.equal(reads, 0);
  const withCore = {
    ...env,
    CORE_DB: makeDb(() => {
      throw Error('should not inspect source at budget cap');
    }),
  };
  assert.deepEqual(await translateIDF(withCore, NOW), { translated: 0, budget: 'limit' });
  assert.equal(ai, 0);
  assert.equal(reads, 2);
});

test('IDF schedules only canonical Telegram source and writes accepted translation once', async () => {
  const nowIso = new Date(NOW - 3600_000).toISOString(),
    writes = [];
  const CORE_DB = makeDb((method, sql) => {
    if (method === 'all' && sql.includes('FROM observations'))
      return {
        results: [
          {
            payload: JSON.stringify({
              url: 'https://fake.example/idf',
              title: 'Wrong source',
              excerpt: 'Long message and other facts about army operations and regional security',
              published_at: nowIso,
            }),
          },
          {
            payload: JSON.stringify({
              url: 'https://t.me/idfofficial/123',
              title: 'IDF security update',
              excerpt:
                'Military officials announced a security update and provided details for public information today.',
              published_at: nowIso,
            }),
          },
        ],
      };
    throw Error('Unexpected CORE query: ' + sql);
  });
  const NEWS_DB = makeDb((method, sql, args) => {
    if (method === 'first' && sql.includes('FROM official_translation_budget'))
      return { batches: 0, estimated_neurons: 0 };
    if (method === 'first' && sql.includes('FROM official_translations')) return null;
    if (method === 'run') {
      writes.push({ sql, args });
      return { meta: { changes: 1 } };
    }
    throw Error('Unexpected NEWS query: ' + sql);
  });
  let aiCalls = 0;
  const env = {
    CORE_DB,
    NEWS_DB,
    AI: {
      run: async (_model, prompt) => {
        aiCalls++;
        const payload = JSON.parse(prompt.messages[1].content);
        assert.equal(payload.length, 1);
        assert.equal(payload[0].url, 'https://t.me/idfofficial/123');
        return {
          response: JSON.stringify([
            {
              url: payload[0].url,
              title_ru: 'ЦАХАЛ сообщил об обновлении ситуации',
              excerpt_ru:
                'Военные представители опубликовали сообщение с подробностями для общественности сегодня.',
            },
          ]),
          usage: { neurons: 150 },
        };
      },
    },
  };
  assert.deepEqual(await translateIDF(env, NOW), { translated: 1 });
  assert.equal(aiCalls, 1);
  assert.equal(writes.filter(w => w.sql.includes('INSERT OR IGNORE INTO official_translations')).length, 1);
  assert.ok(writes.some(w => w.sql.includes('estimated_neurons=MAX(0,estimated_neurons+?)')));
});
