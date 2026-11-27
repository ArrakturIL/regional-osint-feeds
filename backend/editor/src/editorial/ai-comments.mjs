import { shouldSuppressComment, commentTargetsIsrael } from './comment-policy.mjs';

export async function writeComment(env, row) {
  const title = String(row.headline_ru || row.headline || '').trim();
  const summary = String(row.summary_ru || row.summary || '').trim();
  const combined = title + ' ' + summary;
  if (shouldSuppressComment(row)) return { comment: null, skip: true, neurons: 0 };
  const system =
    'Ты ироничный редактор русскоязычного ближневосточного новостного издания. Дай одну короткую, острую и умную реплику к новости, максимум 200 символов и не более двух предложений. Цинизм, сарказм и сухой юмор допустимы в адрес политиков, чиновников, бюрократии, дипломатии и политического пиара. Укол должен быть точным и связанным с конкретным фактом из заголовка или RSS-аннотации. Никаких повторов заголовка другими словами, банальных выводов, общих размышлений, дежурного \'это не означает угрозы\', морализаторства и самовосхваления. Не выдумывай мотиваций, причин, цифр, цитат или подтверждений. Не изображай судебные обвинения доказанной виной. Издание израильское: никогда не делай Израиль, ЦАХАЛ, израильских солдат или силы безопасности объектом иронии, не очерняй их; к материалам с обвинениями в их адрес реплики нет — верни пустой comment. Категорически не шути над погибшими, пострадавшими, заложниками, врачами, пациентами, мирными жителями, гуманитарными трагедиями. Если можно только повторить новость или юмор окажется натужным — верни пустой comment. Верни только JSON {"comment":"..."}.';
  const request = {
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: 'Источник: ' + row.source + '\nЗаголовок: ' + title + '\nАннотация: ' + summary,
      },
    ],
    temperature: 0.7,
    max_tokens: 240,
  };
  const answer = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', request);
  const content = String(
    answer?.choices?.[0]?.message?.content || (typeof answer?.response === 'string' ? answer.response : ''),
  ).trim();
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw Error('No commentary JSON');
  const parsed = JSON.parse(match[0]);
  const comment = String(parsed?.comment || '').trim();
  if (
    shouldSuppressComment(row) ||
    shouldSuppressComment({ headline: comment }) ||
    commentTargetsIsrael(comment) ||
    comment.length < 35 ||
    comment.length > 300 ||
    /^(\s*(похоже|интересно|это ещё|по сообщениям|важно|стоит отметить))/i.test(comment)
  )
    return { comment: null, skip: true, neurons: Number(answer?.usage?.neurons) || undefined };
  return {
    comment: comment.slice(0, 220),
    skip: false,
    neurons: Number(answer?.usage?.neurons) || undefined,
  };
}

export async function generateComments(env, now) {
  const day = new Date(now).toISOString().slice(0, 10);
  const usage = await env.NEWS_DB.prepare(
    'SELECT generation_count,estimated_neurons FROM editor_budget WHERE day_utc=?',
  )
    .bind(day)
    .first();
  let commented = 0,
    failures = 0,
    used = Number(usage?.generation_count || 0),
    neurons = Number(usage?.estimated_neurons || 0);
  if (used < 28 && neurons < 3500) {
    const pending = await env.NEWS_DB.prepare(
      "SELECT id,source,headline,summary,headline_ru,summary_ru FROM news_items WHERE comment_model IS NULL AND headline_ru IS NOT NULL AND published_ms>? AND priority>=7 AND lower(headline) NOT LIKE '%sponsored content%' AND lower(headline) NOT LIKE '%winner cup%' AND lower(headline) NOT LIKE '%euroleague%' AND lower(headline) NOT LIKE '%fashion week%' ORDER BY priority DESC,published_ms DESC LIMIT 2",
    )
      .bind(now - 18 * 3600000)
      .all();
    for (const row of pending.results || []) {
      if (used >= 28 || neurons >= 3500) break;
      let spent = 110;
      try {
        const out = await writeComment(env, row);
        spent = Number.isFinite(out.neurons) ? Math.max(5, out.neurons) : 110;
        await env.NEWS_DB.prepare(
          'UPDATE news_items SET comment=?,comment_model=?,comment_at_ms=? WHERE id=? AND comment_model IS NULL',
        )
          .bind(
            out.comment,
            out.skip ? 'EDITORIAL_SKIP' : 'Cloudflare Workers AI / Llama 3.3 70B · ironic',
            Date.now(),
            row.id,
          )
          .run();
        if (!out.skip) commented++;
      } catch (e) {
        failures++;
        await env.NEWS_DB.prepare(
          "INSERT INTO editor_state(key,value,updated_ms) VALUES('last_ai_error',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms",
        )
          .bind(String(e).slice(0, 340), Date.now())
          .run();
      }
      await env.NEWS_DB.prepare(
        'INSERT INTO editor_budget(day_utc,generation_count,estimated_neurons,updated_ms) VALUES(?,1,?,?) ON CONFLICT(day_utc) DO UPDATE SET generation_count=generation_count+1,estimated_neurons=estimated_neurons+excluded.estimated_neurons,updated_ms=excluded.updated_ms',
      )
        .bind(day, spent, Date.now())
        .run();
      used++;
      neurons += spent;
    }
  }
  return { commented, failures };
}
