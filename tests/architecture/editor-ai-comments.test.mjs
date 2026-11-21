import test from 'node:test';
import assert from 'node:assert/strict';
import { writeComment, generateComments } from '../../backend/editor/src/editorial/ai-comments.mjs';

const NOW = Date.parse('2026-11-16T02:00:00Z');
const political = {
  id: 'politics-1',
  source: 'Example News',
  headline: 'Cabinet debates tax plans',
  summary: 'Officials disagreed on the timetable',
  headline_ru: 'Кабинет обсуждает налоговый план',
  summary_ru: 'Чиновники спорят о сроках исполнения',
};
function db(handler) {
  return {
    prepare(sql) {
      const stmt = (args = []) => ({
        bind(...values) {
          return stmt(values);
        },
        first: async () => handler('first', sql, args),
        all: async () => handler('all', sql, args),
        run: async () => handler('run', sql, args),
      });
      return stmt();
    },
  };
}

test('sensitive human suffering and military news are suppressed before any AI request', async () => {
  for (const headline of ['Airstrike kills patients at hospital', 'IDF missile strikes military base']) {
    let calls = 0;
    const out = await writeComment(
      {
        AI: {
          run: async () => {
            calls++;
            throw Error('AI must not run');
          },
        },
      },
      { ...political, headline, headline_ru: '' },
    );
    assert.deepEqual(out, { comment: null, skip: true, neurons: 0 });
    assert.equal(calls, 0);
  }
});

test('accepted editorial JSON uses frozen model and commentary contract', async () => {
  let calls = 0;
  const env = {
    AI: {
      run: async (model, request) => {
        calls++;
        assert.equal(model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
        assert.equal(request.temperature, 0.7);
        assert.equal(request.max_tokens, 240);
        assert.match(request.messages[1].content, /Cabinet debates tax plans/);
        return {
          response: JSON.stringify({
            comment: 'Чиновники нашли редкий способ ускорить реформу: сначала поспорить о расписании.',
          }),
          usage: { neurons: 132 },
        };
      },
    },
  };
  const out = await writeComment(env, { ...political, headline_ru: '', summary_ru: '' });
  assert.equal(calls, 1);
  assert.equal(out.skip, false);
  assert.equal(out.neurons, 132);
  assert.match(out.comment, /Чиновники/);
});

test('daily generation cap prevents pending scans and AI calls', async () => {
  let pending = 0,
    ai = 0;
  const NEWS_DB = db((method, sql) => {
    if (method === 'first' && sql.includes('FROM editor_budget'))
      return { generation_count: 28, estimated_neurons: 200 };
    if (sql.includes('SELECT id,source,headline')) pending++;
    throw Error('Unexpected query past cap: ' + sql);
  });
  assert.deepEqual(
    await generateComments(
      {
        NEWS_DB,
        AI: {
          run: async () => {
            ai++;
          },
        },
      },
      NOW,
    ),
    { commented: 0, failures: 0 },
  );
  assert.equal(pending, 0);
  assert.equal(ai, 0);
});

test('suppressed source marks EDITORIAL_SKIP and still counts original attempt budget', async () => {
  const writes = [];
  let ai = 0;
  const NEWS_DB = db((method, sql, args) => {
    if (method === 'first') return { generation_count: 0, estimated_neurons: 0 };
    if (method === 'all')
      return {
        results: [
          {
            ...political,
            headline: 'Israeli strike on hospital kills patients',
            headline_ru: '',
            summary_ru: '',
          },
        ],
      };
    if (method === 'run') {
      writes.push({ sql, args });
      return { meta: { changes: 1 } };
    }
    throw Error('Unexpected ' + method + ': ' + sql);
  });
  assert.deepEqual(
    await generateComments(
      {
        NEWS_DB,
        AI: {
          run: async () => {
            ai++;
          },
        },
      },
      NOW,
    ),
    { commented: 0, failures: 0 },
  );
  assert.equal(ai, 0);
  const written = writes.find(w => w.sql.includes('UPDATE news_items SET comment='));
  assert.ok(written);
  assert.equal(written.args[0], null);
  assert.equal(written.args[1], 'EDITORIAL_SKIP');
  const usage = writes.find(w => w.sql.includes('INSERT INTO editor_budget'));
  assert.ok(usage);
  assert.equal(usage.args[1], 5);
});

test('accepted model output publishes once with exact model and actual neuron cost', async () => {
  const writes = [];
  const NEWS_DB = db((method, sql, args) => {
    if (method === 'first') return { generation_count: 0, estimated_neurons: 0 };
    if (method === 'all') return { results: [political] };
    if (method === 'run') {
      writes.push({ sql, args });
      return { meta: { changes: 1 } };
    }
    throw Error('Unexpected ' + method + ': ' + sql);
  });
  const env = {
    NEWS_DB,
    AI: {
      run: async () => ({
        response: JSON.stringify({
          comment:
            'Сроки реформы снова обсудили. Календарь, как обычно, оказался самым несговорчивым участником.',
        }),
        usage: { neurons: 144 },
      }),
    },
  };
  assert.deepEqual(await generateComments(env, NOW), { commented: 1, failures: 0 });
  const publish = writes.find(w => w.sql.includes('UPDATE news_items SET comment='));
  assert.ok(publish);
  assert.equal(publish.args[1], 'Cloudflare Workers AI / Llama 3.3 70B · ironic');
  assert.equal(publish.args[3], 'politics-1');
  const budget = writes.find(w => w.sql.includes('INSERT INTO editor_budget'));
  assert.equal(budget.args[1], 144);
});

test('invalid AI JSON preserves unpublished row, logs last_ai_error and charges baseline', async () => {
  const writes = [];
  const NEWS_DB = db((method, sql, args) => {
    if (method === 'first') return { generation_count: 0, estimated_neurons: 0 };
    if (method === 'all') return { results: [political] };
    if (method === 'run') {
      writes.push({ sql, args });
      return { meta: { changes: 1 } };
    }
    throw Error('Unexpected ' + method + ': ' + sql);
  });
  const env = { NEWS_DB, AI: { run: async () => ({ response: 'broken json' }) } };
  assert.deepEqual(await generateComments(env, NOW), { commented: 0, failures: 1 });
  assert.ok(writes.some(w => w.sql.includes('last_ai_error')));
  assert.equal(writes.filter(w => w.sql.includes('UPDATE news_items SET comment=')).length, 0);
  assert.equal(writes.find(w => w.sql.includes('INSERT INTO editor_budget')).args[1], 110);
});

test('two pending rows do not bypass remaining daily generation slot', async () => {
  let ai = 0;
  const writes = [];
  const NEWS_DB = db((method, sql, args) => {
    if (method === 'first') return { generation_count: 27, estimated_neurons: 50 };
    if (method === 'all') {
      assert.match(sql, /LIMIT 2/);
      return { results: [political, { ...political, id: 'politics-2' }] };
    }
    if (method === 'run') {
      writes.push({ sql, args });
      return { meta: { changes: 1 } };
    }
    throw Error('Unexpected ' + method + ': ' + sql);
  });
  const env = {
    NEWS_DB,
    AI: {
      run: async () => {
        ai++;
        return {
          response: JSON.stringify({
            comment:
              'Реформа опять нашла своё место в календаре. Правда, никто пока не договорился, в каком именно.',
          }),
          usage: { neurons: 144 },
        };
      },
    },
  };
  assert.deepEqual(await generateComments(env, NOW), { commented: 1, failures: 0 });
  assert.equal(ai, 1);
  assert.equal(writes.filter(w => w.sql.includes('UPDATE news_items SET comment=')).length, 1);
});
