// B2: Gemini Developer API (free tier) with a Cloudflare-AI-shaped answer, so
// pipelines keep one response parser. Only public article text is sent: on the
// free tier Google may use prompts to improve its products.
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const version = name => (name.match(/(\d+(?:\.\d+)*)/)?.[1] || '0').split('.').map(Number);
const newer = (a, b) => {
  const x = version(a),
    y = version(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};

// Model IDs come from ListModels, never from memory: newest stable (non
// preview/experimental) model of the family that supports generateContent.
export function pickModel(models, family) {
  let best = null;
  for (const m of models || []) {
    const name = String(m?.name || '').replace(/^models\//, '');
    if (!name.endsWith(family) || /preview|exp/.test(name)) continue;
    if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
    if (!best || newer(name, best)) best = name;
  }
  return best;
}

export async function listModels(key, doFetch = fetch) {
  const res = await doFetch(BASE + '/models?pageSize=1000', {
    headers: { 'x-goog-api-key': key },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error('gemini_list_' + res.status);
  return (await res.json()).models || [];
}

export async function geminiChat(key, model, input, doFetch = fetch) {
  const msgs = input?.messages || [];
  let system = msgs
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');
  // Gemini gets JSON mode only; spell out the Cloudflare json_schema so field names match.
  const schema = input?.response_format?.json_schema?.schema;
  if (schema) system += '\n\nReturn only JSON matching this JSON Schema:\n' + JSON.stringify(schema);
  const contents = msgs
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] }));
  const generationConfig = { temperature: input?.temperature ?? 0 };
  if (input?.max_tokens) generationConfig.maxOutputTokens = input.max_tokens;
  if (input?.response_format) generationConfig.responseMimeType = 'application/json';
  const res = await doFetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const e = new Error('gemini_' + res.status);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
  const finish =
    cand?.finishReason === 'STOP'
      ? 'stop'
      : cand?.finishReason === 'MAX_TOKENS'
        ? 'length'
        : String(cand?.finishReason || 'unknown').toLowerCase();
  return { choices: [{ message: { content: text }, finish_reason: finish }], usage: { neurons: 0 } };
}
