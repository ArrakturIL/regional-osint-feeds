// B6: blind model A/B runner. The corpus, the scoring and the budget gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVAL_FIXTURES } from '../../backend/editor/src/ai/eval-fixtures.mjs';
import {
  evalPlan,
  scoreAnswer,
  runEvalTick,
  EVAL_CANDIDATES,
  EVAL_KEY,
} from '../../backend/editor/src/ai/eval.mjs';
import { heTranslateInput, HE_TRANSLATE_SYSTEM } from '../../backend/editor/src/translations/prompts.mjs';

const cfAnswer = obj => ({ response: JSON.stringify(obj), usage: { neurons: 20 } });

test('corpus: unique ids, HE-source items are RU-only, plan covers every model per language', () => {
  const ids = new Set(EVAL_FIXTURES.map(f => f.id));
  assert.equal(ids.size, EVAL_FIXTURES.length);
  for (const f of EVAL_FIXTURES) if (/\p{Script=Hebrew}/u.test(f.title)) assert.deepEqual(f.to, ['ru'], f.id);
  const plan = evalPlan();
  const expected = EVAL_FIXTURES.reduce(
    (n, f) => n + f.to.reduce((m, l) => m + EVAL_CANDIDATES[l].length, 0),
    0,
  );
  assert.equal(plan.length, expected);
  assert.equal(new Set(plan.map(p => p.key)).size, plan.length);
});

test('every model gets the production HE prompt and schema', () => {
  const input = heTranslateInput('news', { title: 'T', body: '', comment: '' });
  assert.equal(input.messages[0].content, HE_TRANSLATE_SYSTEM);
  assert.equal(input.response_format.json_schema.name, 'he_translation');
  assert.equal(input.temperature, 0);
});

test('scoring uses production checks: meaning, entities, numbers, confidence, JSON', () => {
  const f = EVAL_FIXTURES.find(x => x.id === 'c07-ballistic');
  const good = scoreAnswer(
    f,
    'he',
    cfAnswer({
      title: 'איראן עדיין יכולה לייצר 50 טילים בליסטיים בחודש, למרות התקיפות של ארה״ב וישראל - דו״ח',
      body: '',
      comment: '',
      confidence: 92,
    }),
  );
  assert.deepEqual([good.ok, good.issue], [true, null]);
  const lost = scoreAnswer(
    f,
    'he',
    cfAnswer({
      title: 'איראן עדיין יכולה לייצר 50 טילים בחודש - דו״ח',
      body: '',
      comment: '',
      confidence: 95,
    }),
  );
  assert.equal(lost.issue, 'ballistic_missile_type_changed');
  const number = scoreAnswer(
    f,
    'he',
    cfAnswer({
      title: 'איראן עדיין יכולה לייצר 40 טילים בליסטיים בחודש - דו״ח',
      body: '',
      comment: '',
      confidence: 95,
    }),
  );
  assert.equal(number.issue, 'format_or_numbers');
  const unsure = scoreAnswer(
    f,
    'he',
    cfAnswer({
      title: 'איראן עדיין יכולה לייצר 50 טילים בליסטיים בחודש - דו״ח',
      body: '',
      comment: '',
      confidence: 70,
    }),
  );
  assert.equal(unsure.issue, 'low_translation_confidence');
  assert.equal(scoreAnswer(f, 'he', { response: '{"title": "x",' }).issue, 'bad_json');
  const ru = scoreAnswer(
    f,
    'ru',
    cfAnswer([
      {
        id: f.id,
        title_ru:
          'Иран всё ещё может производить 50 баллистических ракет в месяц, несмотря на удары США и Израиля',
      },
    ]),
  );
  assert.deepEqual([ru.ok, ru.issue], [true, null]);
  const ruLabor = scoreAnswer(
    EVAL_FIXTURES.find(x => x.id === 'c05-strikes'),
    'ru',
    cfAnswer([
      {
        id: 'c05-strikes',
        title_ru:
          'Приведут ли повторные забастовки Израиля против сменщиков командиров ХАМАС к долгосрочным переменам? — анализ',
      },
    ]),
  );
  assert.equal(ruLabor.issue, 'military_strikes_misread_as_labor_action');
});

function mockDb({ request, pool = 0, spent = 0 }) {
  const rows = [],
    state = { value: request ? JSON.stringify(request) : null };
  return {
    rows,
    state,
    prepare(sql) {
      let args = [];
      const st = {
        bind(...a) {
          args = a;
          return st;
        },
        first: async () =>
          sql.startsWith('SELECT value FROM editor_state')
            ? state.value
              ? { value: state.value }
              : null
            : sql.includes('SUM(neurons)')
              ? { n: spent }
              : sql.includes('FROM ai_daily_neurons')
                ? { neurons: pool }
                : null,
        all: async () => ({
          results: sql.includes('FROM ai_eval_runs')
            ? rows.map(r => ({ fixture_id: r[1], language: r[2], candidate: r[3] }))
            : [],
        }),
        run: async () => {
          if (sql.startsWith('INSERT OR IGNORE INTO ai_eval_runs')) rows.push(args);
          if (sql.startsWith('UPDATE editor_state')) state.value = args[0];
          return { meta: { changes: 1 } };
        },
      };
      return st;
    },
  };
}

test('runner: idle without a request, bounded calls per tick, rows with model and issue', async () => {
  const idle = mockDb({});
  assert.equal(
    await runEvalTick({
      NEWS_DB: idle,
      AI: {
        run: async () => {
          throw Error('must not call');
        },
      },
    }),
    null,
  );
  const db = mockDb({ request: { run_id: 'r1', status: 'running', per_tick: 3 } });
  let calls = 0;
  const AI = {
    async run() {
      calls++;
      return cfAnswer({ title: 'x', body: '', comment: '', confidence: 90 });
    },
  };
  const r = await runEvalTick({ NEWS_DB: db, AI }, Date.parse('2026-11-18T05:00:00Z'));
  assert.equal(calls, 3);
  assert.equal(db.rows.length, 3);
  assert.equal(r.done, 3);
  assert.ok(db.rows.every(row => row[0] === 'r1' && typeof row[4] === 'string'));
});

test('runner: Cloudflare calls stop at the eval daily cap or when the shared pool is busy; Gemini without a key is skipped, not failed', async () => {
  for (const gate of [{ spent: 2000 }, { pool: 6500 }]) {
    const db = mockDb({ request: { run_id: 'r2', status: 'running', per_tick: 50 }, ...gate });
    const AI = {
      async run() {
        throw Error('Cloudflare must not be called past the gate');
      },
    };
    const r = await runEvalTick({ NEWS_DB: db, AI }, Date.now());
    assert.equal(r.cf_allowed, false);
    assert.equal(db.rows.length, 0, 'gemini step without GEMINI_API_KEY is unavailable, so no row');
  }
});

test('runner: provider error is recorded once, the run finishes and marks itself done', async () => {
  const db = mockDb({ request: { run_id: 'r3', status: 'running', per_tick: 10_000 } });
  const AI = {
    async run() {
      throw Error('5007: model not found');
    },
  };
  const env = { NEWS_DB: db, AI, GEMINI_API_KEY: 'k' };
  const deps = { fetch: async () => ({ ok: false, status: 400, json: async () => ({}) }) };
  await runEvalTick(env, Date.now(), deps);
  assert.equal(db.rows.length, evalPlan().length);
  assert.ok(db.rows.every(r => r[5] === 0 && /^provider_error:/.test(r[6])));
  assert.equal(JSON.parse(db.state.value).status, 'done');
  assert.equal(EVAL_KEY, 'ai_eval_request');
});

test('report: per-model summary and a blind pack whose letters do not reveal the model', async () => {
  const { summarize, blindPack } = await import('../../scripts/ai-eval-report.mjs');
  const rows = [
    {
      fixture_id: 'f1',
      language: 'he',
      candidate: 'a',
      ok: 1,
      issue: null,
      output: '{"title":"א"}',
      neurons: 10,
      latency_ms: 100,
    },
    {
      fixture_id: 'f1',
      language: 'he',
      candidate: 'b',
      ok: 0,
      issue: 'provider_error:5007 x',
      output: null,
      neurons: 0,
      latency_ms: 50,
    },
  ];
  const s = summarize(rows);
  assert.deepEqual(
    s.map(x => [x.candidate, x.ok_share]),
    [
      ['a', 1],
      ['b', 0],
    ],
  );
  assert.deepEqual(s[1].issues, { provider_error: 1 });
  const b = blindPack(rows);
  assert.ok(!/\b(?:a|b)\b/.test(b.text.replace(/^## .*$/m, '')), 'no model names in the reviewer text');
  assert.match(b.key, /f1\|he [AB] = a/);
});
