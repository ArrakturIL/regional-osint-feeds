// B2: task router across Gemini Free and Cloudflare Workers AI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {geminiChat, pickModel} from '../../backend/editor/src/ai/providers/gemini.mjs';
import {chat, ROUTES} from '../../backend/editor/src/ai/router.mjs';

const MODELS = {models: [
  {name: 'models/gemini-3.1-flash-lite', supportedGenerationMethods: ['generateContent']},
  {name: 'models/gemini-3.5-flash-lite', supportedGenerationMethods: ['generateContent']},
  {name: 'models/gemini-3.6-flash-lite-preview', supportedGenerationMethods: ['generateContent']},
  {name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent']},
  {name: 'models/embedding-x', supportedGenerationMethods: ['embedContent']},
]};
const input = {messages: [{role: 'system', content: 'SYS'}, {role: 'user', content: '{"t":1}'}],
  response_format: {type: 'json_schema', json_schema: {name: 'x', schema: {}}}, temperature: 0, max_tokens: 500};

function fakeDb() {
  const state = new Map(), calls = new Map();
  return {state, calls, prepare(sql) { return {bind(...a) { return {
    async first() { if (/FROM editor_state/.test(sql)) { const v = state.get(a[0]); return v ? {value: v} : null; } return null; },
    async run() {
      if (/INSERT INTO editor_state/.test(sql)) { state.set(a[0], a[1]); return {meta: {changes: 1}}; }
      if (/ai_provider_calls/.test(sql) && /INSERT/.test(sql)) {
        const k = a[0] + '|' + a[1], n = calls.get(k) || 0; if (n + 1 > a[3]) return {meta: {changes: 0}};
        calls.set(k, n + 1); return {meta: {changes: 1}};
      }
      return {meta: {changes: 0}};
    },
  }; }}; }};
}

test('pickModel chooses the newest stable flash-lite that can generateContent', () => {
  assert.equal(pickModel(MODELS.models, 'flash-lite'), 'gemini-3.5-flash-lite');
});

test('geminiChat sends system+user, JSON mode, key header; returns CF-shaped answer', async () => {
  let req;
  const out = await geminiChat('KEY', 'gemini-3.5-flash-lite', input, async (url, init) => {
    req = {url, init};
    return Response.json({candidates: [{content: {parts: [{text: '{"ok":true}'}]}, finishReason: 'STOP'}]});
  });
  assert.match(req.url, /models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(req.init.headers['x-goog-api-key'], 'KEY');
  const body = JSON.parse(req.init.body);
  assert.equal(body.systemInstruction.parts[0].text, 'SYS');
  assert.equal(body.contents[0].parts[0].text, '{"t":1}');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.maxOutputTokens, 500);
  assert.equal(out.choices[0].message.content, '{"ok":true}');
  assert.equal(out.choices[0].finish_reason, 'stop');
});

function geminiFetch(status = 200) {
  const seen = [];
  return {seen, fn: async (url) => {
    seen.push(String(url));
    if (String(url).includes('/models?')) return Response.json(MODELS);
    if (status !== 200) return new Response('{}', {status});
    return Response.json({candidates: [{content: {parts: [{text: '{"title":"כותרת"}'}]}, finishReason: 'STOP'}]});
  }};
}
const cfAI = () => { const calls = []; return {calls, run: async (m) => { calls.push(m); return {choices: [{message: {content: '{"title":"cf"}'}, finish_reason: 'stop'}]}; }}; };

test('he_translate prefers Gemini when the key exists and reports the model used', async () => {
  const db = fakeDb(), ai = cfAI(), f = geminiFetch();
  const out = await chat({NEWS_DB: db, AI: ai, GEMINI_API_KEY: 'K'}, 'he_translate', input, {fetch: f.fn, now: () => 1e12});
  assert.equal(out.model, 'gemini-3.5-flash-lite');
  assert.equal(ai.calls.length, 0);
});

test('Gemini failure or 429 falls back to Cloudflare in the same call', async () => {
  for (const status of [429, 500]) {
    const db = fakeDb(), ai = cfAI(), f = geminiFetch(status);
    const out = await chat({NEWS_DB: db, AI: ai, GEMINI_API_KEY: 'K'}, 'he_translate', input, {fetch: f.fn, now: () => 1e12});
    assert.equal(out.model, ROUTES.he_translate.at(-1).model, 'status ' + status);
    assert.equal(ai.calls.length, 1);
  }
});

test('no key or spent daily Gemini cap goes straight to Cloudflare', async () => {
  const ai = cfAI();
  const out = await chat({NEWS_DB: fakeDb(), AI: ai}, 'he_translate', input, {fetch: async () => { throw Error('no network'); }});
  assert.equal(out.model, ROUTES.he_translate.at(-1).model);
  const db = fakeDb(); const step = ROUTES.he_translate[0];
  const day = new Date(1e12).toISOString().slice(0, 10);
  db.calls.set(day + '|gemini:' + step.family, step.dailyCap);
  const f = geminiFetch(); const ai2 = cfAI();
  await chat({NEWS_DB: db, AI: ai2, GEMINI_API_KEY: 'K'}, 'he_translate', input, {fetch: f.fn, now: () => 1e12});
  assert.equal(ai2.calls.length, 1);
  assert.ok(!f.seen.some(u => u.includes(':generateContent')), 'no Gemini call over the daily cap');
});
