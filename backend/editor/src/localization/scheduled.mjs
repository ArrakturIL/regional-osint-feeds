import { chat } from '../ai/router.mjs';
import { heTranslateInput } from '../translations/prompts.mjs'; // B2: Gemini Flash-Lite first, Cloudflare fallback
import { factualTranslationIssue } from '../translations/fact-guard.mjs';
import { DAY, sourceText, fingerprint, newsHebrewSource } from './shared.mjs';
import { isTransientFailure } from './retry-policy.mjs';
import { newsTier, TIER_RANK } from '../news/tier.mjs';
import { enqueueJobs, dueJobs, settleJob, normalAllowed } from '../translations/jobs.mjs';
import { meaningCheck } from '../translations/meaning-check.mjs';
import { recordShown, slaSummary } from '../news/sla.mjs';

const HE_MODEL = '@cf/zai-org/glm-4.7-flash';
const HE_DAILY_ATTEMPT_CAP = 300; // B1: ceiling only; shared AI pool decides
function translationNumerals(s) {
  return (String(s).match(/\d+(?:[.,]\d+)*/g) || []).map(t => t.replace(/,/g, '.'));
}
// Live 20.11: correct Hebrew spells small numbers as words («2 Palestinians» →
// «שני פלסטינים») and decades as «שנות ה־70» («1970s»); both were rejected.
const HE_NUMBER_WORDS = {
  1: 'אחד|אחת',
  2: 'שניים|שתיים|שני|שתי|זוג',
  3: 'שלושה|שלוש|שלושת',
  4: 'ארבעה|ארבע|ארבעת',
  5: 'חמישה|חמש|חמשת',
  6: 'שישה|שש|ששת',
  7: 'שבעה|שבע|שבעת',
  8: 'שמונה|שמונת',
  9: 'תשעה|תשע|תשעת',
  10: 'עשרה|עשר|עשרת',
};
const heWord = n =>
  HE_NUMBER_WORDS[n] &&
  new RegExp('(?:^|[^\\u05d0-\\u05ea])[והבלמשכ]?(?:' + HE_NUMBER_WORDS[n] + ')(?![\\u05d0-\\u05ea])', 'u');
function translationPreservesNumbers(before, after) {
  const values = translationNumerals(after);
  const take = n => {
    const i = values.indexOf(n);
    if (i < 0) return false;
    values.splice(i, 1);
    return true;
  };
  const decades = new Set((String(before).match(/\b\d{4}s\b/g) || []).map(d => d.slice(0, 4)));
  for (const n of translationNumerals(before)) {
    if (take(n)) continue;
    if (decades.has(n) && take(n.slice(2))) continue; // 1970s → שנות ה־70
    const word = heWord(Number(n));
    if (word && word.test(after)) continue;
    return false;
  }
  return true;
}
function checkHebrew(original, translation) {
  if (
    !translation ||
    !Number.isInteger(translation.confidence) ||
    translation.confidence < 85 ||
    translation.confidence > 100
  )
    return false;
  const keys = ['title', 'body', 'comment'];
  for (const field of keys) {
    const before = String(original[field] || ''),
      after = translation[field];
    if (typeof after !== 'string') return false;
    if (!before) {
      if (after.trim()) return false;
      continue;
    }
    if (
      !/[\u0590-\u05ff]/u.test(after) ||
      after.length < Math.min(7, Math.ceil(before.length * 0.17)) ||
      after.length > Math.max(80, before.length * 4 + 30) ||
      /[<>]/.test(after) ||
      !translationPreservesNumbers(before, after)
    )
      return false;
  }
  return !factualTranslationIssue(original, translation);
}
async function localeCandidates(env, kind, now) {
  let db = env.NEWS_DB,
    rows = [];
  if (kind === 'news')
    rows =
      (
        await db
          .prepare(
            "SELECT n.id,n.headline,n.headline_ru,n.summary,n.summary_ru,n.comment,n.discovered_ms,t.source_hash cached_he_hash,t.title he_title,t.body he_body,t.commentary he_comment FROM news_items n LEFT JOIN regional_i18n t ON t.kind='news' AND t.item_id=n.id AND t.language='he' WHERE ((n.priority>=7 AND n.published_ms>?) OR n.id IN (SELECT g.representative_id FROM news_event_groups g WHERE g.priority>=4 AND g.last_seen_ms>?)) ORDER BY (t.item_id IS NULL) DESC,n.published_ms DESC,n.priority DESC LIMIT 120",
          )
          .bind(now - 7 * DAY, now - 36 * 3600000)
          .all()
      ).results || [];
  else if (kind === 'editorial')
    rows =
      (
        await db
          .prepare(
            'SELECT id,headline,text FROM editorial_notes WHERE published_ms>? ORDER BY published_ms DESC LIMIT 12',
          )
          .bind(now - 28 * DAY)
          .all()
      ).results || [];
  else if (kind === 'analyst') {
    db = env.CORE_DB;
    rows =
      (
        await db
          .prepare(
            "SELECT id,headline,summary,short_quote FROM analyst_publications WHERE status IN ('published','corrected') AND published_at_ms>? ORDER BY published_at_ms DESC LIMIT 25",
          )
          .bind(now - 21 * DAY)
          .all()
      ).results || [];
  } else if (kind === 'story') {
    db = env.CORE_DB;
    rows =
      (
        await db
          .prepare(
            'SELECT event_id AS id,payload FROM monitor_events WHERE updated_at_ms>? ORDER BY updated_at_ms DESC LIMIT 25',
          )
          .bind(now - 21 * DAY)
          .all()
      ).results || [];
  } else if (kind === 'profile') {
    db = env.CORE_DB;
    rows =
      (
        await db
          .prepare(
            'SELECT id,display_name,description FROM analysts WHERE enabled=1 ORDER BY display_name LIMIT 20',
          )
          .all()
      ).results || [];
  }
  const result = [];
  for (const row of rows) {
    // Already-native HE news is served directly by localizeNewsRow. Never spend
    // a HE inference attempt translating it back from headline_ru. If the
    // original body is not Hebrew, the row still needs localization.
    if (
      kind === 'news' &&
      /[\u0590-\u05ff]/u.test(row.headline || '') &&
      (!row.summary || /[\u0590-\u05ff]/u.test(row.summary))
    )
      continue;
    let t;
    try {
      t = sourceText(kind, row);
    } catch {
      continue;
    }
    // A pre-18.11 pivot translation is in the manual backlog: never re-translated automatically.
    if (kind === 'news' && (await newsHebrewSource(row, row.cached_he_hash)).legacy) continue;
    if (t.title && t.title.length >= 4)
      result.push({
        db,
        kind,
        id: row.id,
        text: t,
        cachedSourceHash: kind === 'news' ? row.cached_he_hash : undefined,
        cached:
          kind === 'news' && row.cached_he_hash
            ? {
                source_hash: row.cached_he_hash,
                title: row.he_title,
                body: row.he_body,
                commentary: row.he_comment,
              }
            : undefined,
        ...(kind === 'news'
          ? { tier: newsTier(row).tier, discoveredMs: row.discovered_ms, missing: !row.cached_he_hash }
          : {}),
      });
  }
  // B5: untranslated first, then urgent > important > normal; SQL order stays the tiebreak.
  if (kind === 'news') result.sort((a, b) => b.missing - a.missing || TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  return result;
}

function hebrewQualityIssue(original, value) {
  if (!value || !Number.isInteger(value.confidence) || value.confidence < 85 || value.confidence > 100)
    return 'low_translation_confidence';
  for (const field of ['title', 'body', 'comment']) {
    const before = String(original[field] || ''),
      after = value[field];
    if (typeof after !== 'string') return 'invalid_' + field;
    if (!before) {
      if (after.trim()) return 'invented_' + field;
      continue;
    }
    if (!/[\u0590-\u05ff]/u.test(after)) return 'not_hebrew_' + field;
    if (after.length < Math.min(7, Math.ceil(before.length * 0.17))) return 'too_short_' + field;
    if (after.length > Math.max(80, before.length * 4 + 30)) return 'too_long_' + field;
    if (/[<>]/.test(after)) return 'forbidden_markup_' + field;
    if (!translationPreservesNumbers(before, after)) return 'numbers_changed_' + field;
  }
  return factualTranslationIssue(original, value) || 'translation_quality_gate';
}
const dbFor = (env, kind) => (['analyst', 'story', 'profile'].includes(kind) ? env.CORE_DB : env.NEWS_DB);
const trusted = (text, cached) =>
  cached?.title != null &&
  !factualTranslationIssue(text, {
    title: cached.title,
    body: cached.body,
    comment: cached.commentary || '',
  });

// B10: queue the items of one kind that need Hebrew. An accepted translation
// of the same source that still passes the checks needs nothing; one that no
// longer passes (e.g. Q1 script rule added later) is re-done.
async function enqueueKind(env, kind, now) {
  const items = await localeCandidates(env, kind, now);
  if (!items.length) return 0;
  let cachedById = new Map();
  if (kind !== 'news') {
    const db = items[0].db;
    const rows =
      (
        await db
          .prepare(
            "SELECT item_id,source_hash,title,body,commentary FROM regional_i18n WHERE kind=? AND language='he' AND item_id IN (" +
              items.map(() => '?').join(',') +
              ')',
          )
          .bind(kind, ...items.map(x => String(x.id)))
          .all()
      ).results || [];
    cachedById = new Map(rows.map(r => [String(r.item_id), r]));
  }
  const jobs = [];
  for (const item of items) {
    const sha = await fingerprint(item.text);
    const cached = kind === 'news' ? item.cached : cachedById.get(String(item.id));
    const redo = cached?.source_hash === sha;
    if (redo && trusted(item.text, cached)) continue;
    jobs.push({
      kind,
      id: item.id,
      language: 'he',
      sourceHash: sha,
      tier: item.tier || 'normal',
      discoveredMs: item.discoveredMs,
      payload: item.text,
      redo,
    });
  }
  return enqueueJobs(env.NEWS_DB, jobs, now);
}

// One paid Hebrew attempt for one queued job. Returns
// { state: 'cached' | 'ok' | 'error' | 'budget', error?, model? }.
async function translateLocaleItem(env, item, day, now) {
  const { db, kind, id, text } = item;
  const sha = await fingerprint(text);
  if (sha !== item.sourceHash) return { state: 'stale' };
  const cached = await db
    .prepare(
      "SELECT source_hash,title,body,commentary FROM regional_i18n WHERE kind=? AND item_id=? AND language='he'",
    )
    .bind(kind, id)
    .first();
  if (cached?.source_hash === sha && trusted(text, cached)) return { state: 'cached' };
  // Attempt log (ops, audits); the queue decides whether to attempt at all.
  await db
    .prepare(
      "INSERT INTO regional_i18n_attempts(kind,item_id,language,source_hash,day_utc,attempted_at_ms,state) VALUES(?,?,'he',?,?,?,'running') " +
        "ON CONFLICT(kind,item_id,language,source_hash,day_utc) DO UPDATE SET state='running',error=NULL,retry_count=retry_count+1,attempted_at_ms=excluded.attempted_at_ms",
    )
    .bind(kind, id, sha, day, now)
    .run();
  const budget = await env.NEWS_DB.prepare(
    'UPDATE regional_i18n_budget SET attempts=attempts+1,updated_at_ms=? WHERE day_utc=? AND attempts<? AND estimated_neurons<6000',
  )
    .bind(now, day, HE_DAILY_ATTEMPT_CAP)
    .run();
  if (budget.meta?.changes !== 1) {
    await db
      .prepare(
        "UPDATE regional_i18n_attempts SET state='budget_exhausted' WHERE kind=? AND item_id=? AND source_hash=? AND day_utc=?",
      )
      .bind(kind, id, sha, day)
      .run();
    return { state: 'budget' };
  }
  let state = 'error',
    err = null,
    neurons = 0,
    model = null,
    checkNeurons = 0;
  try {
    // The same checks as below decide whether the next provider is tried.
    const answer = await chat(env, 'he_translate', heTranslateInput(kind, text), {}, async out => {
      if (out?.choices?.[0]?.finish_reason && out.choices[0].finish_reason !== 'stop')
        return 'model_incomplete';
      const body = out?.choices?.[0]?.message?.content ?? out?.response;
      if (typeof body !== 'string' || body.length > 9500) return 'model_invalid_response';
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (e) {
        return String(e?.message || e);
      }
      if (!checkHebrew(text, parsed)) return hebrewQualityIssue(text, parsed);
      // B11 part 2: urgent/important — a second model checks who did what;
      // a named meaning error sends the item to the next provider.
      const second = await meaningCheck(
        env,
        {
          original: text,
          translation: { title: parsed.title, body: parsed.body, comment: parsed.comment },
          language: 'he',
          translatorModel: out.model,
          tier: item.tier,
        },
        now,
      );
      checkNeurons += second.neurons;
      return second.verdict === 'reject' ? second.code : null;
    });
    neurons = (Number(answer?.usage?.neurons) || 0) + (Number(answer?.rejected_neurons) || 0) + checkNeurons;
    if (answer?.choices?.[0]?.finish_reason && answer.choices[0].finish_reason !== 'stop')
      throw Error('model_incomplete');
    const raw = answer?.choices?.[0]?.message?.content ?? answer?.response;
    if (typeof raw !== 'string' || raw.length > 9500) throw Error('model_invalid_response');
    const value = JSON.parse(raw);
    if (!checkHebrew(text, value)) throw Error(hebrewQualityIssue(text, value));
    model = answer.model || HE_MODEL;
    await db
      .prepare(
        "INSERT INTO regional_i18n(kind,item_id,language,source_hash,title,body,commentary,quality_score,model,created_at_ms) VALUES(?,?,'he',?,?,?,?,?,?,?) ON CONFLICT(kind,item_id,language) DO UPDATE SET source_hash=excluded.source_hash,title=excluded.title,body=excluded.body,commentary=excluded.commentary,quality_score=excluded.quality_score,model=excluded.model,created_at_ms=excluded.created_at_ms",
      )
      .bind(
        kind,
        id,
        sha,
        value.title.trim(),
        value.body.trim(),
        value.comment.trim(),
        value.confidence,
        model,
        Date.now(),
      )
      .run();
    state = 'ok';
    if (kind === 'news')
      await recordShown(env.NEWS_DB, {
        id,
        language: 'he',
        tier: item.tier || 'normal',
        discoveredMs: item.discoveredMs,
      }).catch(() => {});
  } catch (e) {
    err = String(e?.message || e).slice(0, 180);
    neurons += (Number(e?.neurons) || 0) + checkNeurons;
    model = e?.model || null;
  }
  await db
    .prepare(
      'UPDATE regional_i18n_attempts SET state=?,error=? WHERE kind=? AND item_id=? AND source_hash=? AND day_utc=?',
    )
    .bind(state, err, kind, id, sha, day)
    .run();
  if (neurons > 0)
    await env.NEWS_DB.prepare(
      'UPDATE regional_i18n_budget SET estimated_neurons=estimated_neurons+?,updated_at_ms=? WHERE day_utc=?',
    )
      .bind(neurons, Date.now(), day)
      .run();
  return { state, error: err, model };
}

const PER_TICK = 4; // paid attempts per 5-minute tick
async function writeState(env, key, value) {
  await env.NEWS_DB.prepare(
    'INSERT INTO editor_state(key,value,updated_ms) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms',
  )
    .bind(key, typeof value === 'string' ? value : JSON.stringify(value), Date.now())
    .run();
}

export async function translateScheduled(env, scheduledTime) {
  const now = Number.isFinite(scheduledTime) ? scheduledTime : Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    await env.NEWS_DB.prepare(
      'INSERT OR IGNORE INTO regional_i18n_budget(day_utc,attempts,estimated_neurons,updated_at_ms) VALUES(?,0,0,?)',
    )
      .bind(day, now)
      .run();
    const budget = await env.NEWS_DB.prepare(
      'SELECT attempts,estimated_neurons FROM regional_i18n_budget WHERE day_utc=?',
    )
      .bind(day)
      .first();
    if ((budget?.attempts || 0) >= HE_DAILY_ATTEMPT_CAP || (budget?.estimated_neurons || 0) >= 6000) {
      await writeState(env, 'last_he_localization', {
        state: 'budget',
        attempts: budget?.attempts || 0,
        estimated_neurons: budget?.estimated_neurons || 0,
        limit: HE_DAILY_ATTEMPT_CAP,
      });
      return { state: 'budget' };
    }
    // News is queued every tick (urgent must not wait); the other kinds take
    // turns, as before, to bound D1 reads.
    const cycle = ['news', 'analyst', 'story', 'editorial', 'news', 'profile'];
    const kind = cycle[Math.floor(now / 300000) % cycle.length];
    await enqueueKind(env, 'news', now);
    if (kind !== 'news') await enqueueKind(env, kind, now);
    const due = await dueJobs(env.NEWS_DB, 'he', now, PER_TICK * 3, {
      allowNormal: await normalAllowed(env.NEWS_DB, now),
    });
    let attempted = 0,
      translated = 0,
      rejected = 0,
      deferred = 0,
      budgetHit = false;
    for (const job of due) {
      if (attempted >= PER_TICK) break;
      if (!job.payload) {
        await settleJob(env.NEWS_DB, job, 'done', { reason: 'no_payload' }, now);
        continue;
      }
      const item = {
        db: dbFor(env, job.kind),
        kind: job.kind,
        id: job.id,
        text: job.payload,
        sourceHash: job.sourceHash,
        tier: job.tier,
        discoveredMs: job.discoveredMs,
      };
      const result = await translateLocaleItem(env, item, day, now);
      if (result.state === 'stale') continue;
      if (result.state === 'cached') {
        await settleJob(env.NEWS_DB, job, 'done', { reason: 'cached' }, now);
        continue;
      }
      if (result.state === 'budget') {
        budgetHit = true;
        break;
      }
      attempted++;
      if (result.state === 'ok') {
        translated++;
        await settleJob(env.NEWS_DB, job, 'done', { model: result.model }, now);
      } else if (isTransientFailure(result.error)) {
        deferred++;
        await settleJob(env.NEWS_DB, job, 'deferred', { reason: result.error, model: result.model }, now);
      } else {
        rejected++;
        await settleJob(env.NEWS_DB, job, 'rejected', { reason: result.error, model: result.model }, now);
      }
    }
    const state = {
      state: budgetHit ? 'budget' : rejected || deferred ? 'partial' : 'ok',
      kind,
      due: due.length,
      attempted,
      translated,
      rejected,
      deferred,
      at: new Date().toISOString(),
    };
    // B5: refresh the per-tier SLA picture (read by /api/news) once per tick.
    try {
      await writeState(env, 'translation_sla', await slaSummary(env.NEWS_DB, now));
    } catch {}
    await writeState(env, 'last_he_localization', state);
    return state;
  } catch (e) {
    const error = String(e?.message || e).slice(0, 260);
    await writeState(env, 'last_he_localization_error', error).catch(() => {});
    return { state: 'error', error };
  }
}
