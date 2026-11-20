// B12: observability and the archive of translations.
//
// (a) translationAlerts — RU or HE stands still: an urgent/important job has
//     waited in translation_jobs for more than an hour, or 3+ jobs went to the
//     manual queue in 24 h. Editor has no mail or push channel, so the alert is
//     editor_state 'translation_alert', shown as a banner on /ops; each type
//     (stalled:ru, manual:he, …) is (re)announced at most once an hour.
// (b) recheckArchive — accepted RU/HE translations of the last 7 days go
//     through today's deterministic gates (translationIssue: script, glossary,
//     meaning rules, Wikidata; no second model). One that fails is queued
//     again (redo) as a normal job, so it waits for the free-pool reserve of
//     urgent/important and never spends quota in a burst; a few rows per tick.
import { enqueueJobs, ensureJobs } from './jobs.mjs';
import { translationIssue } from './verify.mjs';
import { semanticMeaningIssue } from './semantic-meaning.mjs';
import { factualTranslationIssue } from './fact-guard.mjs';
import { sourceText, fingerprint, newsHebrewSource, val } from '../localization/shared.mjs';

const MIN = 60000,
  HOUR = 60 * MIN,
  DAY = 24 * HOUR;
export const ALERT = Object.freeze({ stallMs: HOUR, manualPerDay: 3, repeatMs: HOUR });
export const ARCHIVE = Object.freeze({ windowMs: 7 * DAY, chunk: 20, redoPerTick: 5, pauseMs: 6 * HOUR });
const LANGS = ['ru', 'he'];

async function readState(db, key) {
  const row = await db.prepare('SELECT value FROM editor_state WHERE key=?').bind(key).first();
  try {
    return row?.value ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}
async function writeState(db, key, value, now) {
  await db
    .prepare(
      'INSERT INTO editor_state(key,value,updated_ms) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_ms=excluded.updated_ms',
    )
    .bind(key, JSON.stringify(value), now)
    .run();
}

// → the alert state; written only when the active set changes or a type is due again.
export async function translationAlerts(db, now = Date.now()) {
  await ensureJobs(db);
  const [stalled, manual] = await db.batch([
    db
      .prepare(
        "SELECT language,tier,count(*) n,min(created_ms) oldest_ms FROM translation_jobs WHERE language IN ('ru','he') " +
          "AND state='pending' AND tier IN ('urgent','important') AND created_ms<? GROUP BY language,tier",
      )
      .bind(now - ALERT.stallMs),
    db
      .prepare(
        "SELECT language,count(*) n FROM translation_jobs WHERE language IN ('ru','he') AND state='manual' AND updated_ms>? GROUP BY language",
      )
      .bind(now - DAY),
  ]);
  const active = [];
  for (const lang of LANGS) {
    const rows = (stalled?.results || []).filter(r => r.language === lang);
    if (rows.length)
      active.push({
        type: 'stalled:' + lang,
        language: lang,
        count: rows.reduce((n, r) => n + r.n, 0),
        tiers: Object.fromEntries(rows.map(r => [r.tier, r.n])),
        oldest_ms: Math.min(...rows.map(r => r.oldest_ms)),
      });
    const m = (manual?.results || []).find(r => r.language === lang);
    if (m && m.n >= ALERT.manualPerDay) active.push({ type: 'manual:' + lang, language: lang, count: m.n });
  }
  const prev = (await readState(db, 'translation_alert')) || { active: [], notified: {} };
  const notified = { ...(prev.notified || {}) };
  const announce = [];
  for (const a of active) {
    const last = notified[a.type]?.at_ms || 0;
    if (now - last >= ALERT.repeatMs) {
      notified[a.type] = { at_ms: now, count: (notified[a.type]?.count || 0) + 1 };
      announce.push(a.type);
    }
  }
  const key = list => list.map(a => a.type + ':' + a.count).join(',');
  const state = { checked_ms: now, active, notified, announced: announce };
  if (announce.length || key(active) !== key(prev.active || []))
    await writeState(db, 'translation_alert', state, now);
  return state;
}

// ---- (b) the archive ----
const SOURCE_SQL = {
  news: 'SELECT id,headline,headline_ru,summary,summary_ru,comment,discovered_ms FROM news_items WHERE id IN',
  editorial: 'SELECT id,headline,text FROM editorial_notes WHERE id IN',
  analyst:
    "SELECT id,headline,summary,short_quote FROM analyst_publications WHERE status IN ('published','corrected') AND id IN",
  story: 'SELECT event_id AS id,payload FROM monitor_events WHERE event_id IN',
  profile: 'SELECT id,display_name,description FROM analysts WHERE id IN',
};
const inList = n => '(' + Array(n).fill('?').join(',') + ')';

// RU lives in news_items (headline_ru/summary_ru); the read path checks the
// title fully and the abridged summary by meaning rules only — so does this.
async function ruChunk(db, cursor, now) {
  const from = Math.max(cursor?.ms || 0, now - ARCHIVE.windowMs);
  const rows =
    (
      await db
        .prepare(
          'SELECT id,headline,summary,headline_ru,summary_ru,published_ms,discovered_ms FROM news_items ' +
            'WHERE published_ms>=? AND (published_ms>? OR id>?) AND headline_ru IS NOT NULL ORDER BY published_ms,id LIMIT ?',
        )
        .bind(from, from, cursor?.ms === from ? cursor.id || '' : '', ARCHIVE.chunk)
        .all()
    ).results || [];
  const jobs = [],
    examples = [];
  let last = null,
    checked = 0;
  for (const r of rows) {
    last = { ms: r.published_ms, id: r.id };
    checked++;
    const title = val(r.headline, 260);
    if (/[Ѐ-ӿ]/u.test(title)) continue; // a Russian original needs no RU translation
    const body = val(r.summary, 650),
      bodyRu = val(r.summary_ru, 650);
    const issue =
      translationIssue(title, val(r.headline_ru, 260), 'ru') ||
      (body && bodyRu ? semanticMeaningIssue(body, bodyRu, 'ru') : null);
    if (!issue) continue;
    jobs.push({
      kind: 'news',
      id: r.id,
      language: 'ru',
      sourceHash: await fingerprint({ title: r.headline, body: r.summary || '', comment: '' }),
      tier: 'normal',
      discoveredMs: r.discovered_ms,
      payload: { redo: true, reason: issue },
      redo: true,
    });
    examples.push({ kind: 'news', id: r.id, language: 'ru', reason: issue });
    if (jobs.length >= ARCHIVE.redoPerTick) break;
  }
  return { rows: rows.length, checked, last, jobs, examples };
}

// HE lives in regional_i18n of NEWS_DB (news, editorial) and CORE_DB (analyst,
// story, profile); walked in primary-key order so no table scan is needed.
async function heChunk(db, cursor, now) {
  const rows =
    (
      await db
        .prepare(
          "SELECT kind,item_id,source_hash,title,body,commentary,created_at_ms FROM regional_i18n WHERE language='he' " +
            'AND (kind>? OR (kind=? AND item_id>?)) ORDER BY kind,item_id LIMIT ?',
        )
        .bind(cursor?.kind || '', cursor?.kind || '', cursor?.id || '', ARCHIVE.chunk)
        .all()
    ).results || [];
  const recent = rows.filter(r => r.created_at_ms >= now - ARCHIVE.windowMs && SOURCE_SQL[r.kind]);
  const sources = new Map();
  for (const kind of new Set(recent.map(r => r.kind))) {
    const ids = recent.filter(r => r.kind === kind).map(r => String(r.item_id));
    const found =
      (
        await db
          .prepare(SOURCE_SQL[kind] + inList(ids.length))
          .bind(...ids)
          .all()
      ).results || [];
    for (const s of found) sources.set(kind + ':' + s.id, s);
  }
  const jobs = [],
    examples = [];
  let last = null,
    checked = 0;
  for (const r of rows) {
    last = { kind: r.kind, id: r.item_id };
    if (!recent.includes(r)) continue;
    const src = sources.get(r.kind + ':' + r.item_id);
    if (!src) continue;
    checked++;
    let text;
    try {
      if (r.kind === 'news') {
        const he = await newsHebrewSource(src, r.source_hash);
        if (he.legacy) continue; // pre-18.11 pivot translations: manual backlog
        text = he.text;
      } else text = sourceText(r.kind, src);
    } catch {
      continue;
    }
    if (!text.title) continue;
    const sha = await fingerprint(text);
    const issue =
      sha !== r.source_hash
        ? 'source_changed'
        : factualTranslationIssue(text, { title: r.title, body: r.body, comment: r.commentary || '' });
    if (!issue) continue;
    jobs.push({
      kind: r.kind,
      id: r.item_id,
      language: 'he',
      sourceHash: sha,
      tier: 'normal',
      discoveredMs: r.kind === 'news' ? src.discovered_ms : undefined,
      payload: text,
      redo: true,
    });
    examples.push({ kind: r.kind, id: r.item_id, language: 'he', reason: issue });
    if (jobs.length >= ARCHIVE.redoPerTick) break;
  }
  return { rows: rows.length, checked, last, jobs, examples };
}

// One lane per tick (ru → he_news → he_core), a pass per lane every 6 h.
const LANES = [
  ['ru', env => env.NEWS_DB, ruChunk],
  ['he_news', env => env.NEWS_DB, heChunk],
  ['he_core', env => env.CORE_DB, heChunk],
];
export async function recheckArchive(env, now = Date.now()) {
  const [name, dbOf, chunk] = LANES[Math.floor(now / 300000) % LANES.length];
  const db = dbOf(env);
  if (!db || !env.NEWS_DB) return { lane: name, state: 'no_db' };
  const all = (await readState(env.NEWS_DB, 'translation_archive')) || {};
  const lane = all[name] || { cursor: null, pass: { started_ms: now, checked: 0, redo: 0 } };
  if (lane.paused_until_ms > now) return { lane: name, state: 'paused' };
  const out = await chunk(db, lane.cursor, now);
  const queued = out.jobs.length ? await enqueueJobs(env.NEWS_DB, out.jobs, now) : 0;
  const pass = {
    started_ms: lane.pass?.started_ms || now,
    checked: (lane.pass?.checked || 0) + out.checked,
    redo: (lane.pass?.redo || 0) + queued,
  };
  const examples = [...out.examples, ...(lane.examples || [])].slice(0, 10);
  let next;
  // The chunk stops early once it queued redoPerTick jobs; the cursor is the last row looked at.
  const finished = out.rows < ARCHIVE.chunk && out.jobs.length < ARCHIVE.redoPerTick;
  if (finished)
    next = {
      cursor: null,
      paused_until_ms: now + ARCHIVE.pauseMs,
      last_pass: { ...pass, finished_ms: now },
      pass: { started_ms: now + ARCHIVE.pauseMs, checked: 0, redo: 0 },
      examples,
    };
  else next = { ...lane, cursor: out.last || lane.cursor, pass, examples, paused_until_ms: 0 };
  await writeState(env.NEWS_DB, 'translation_archive', { ...all, [name]: next }, now);
  return { lane: name, state: finished ? 'pass_done' : 'running', checked: out.checked, queued };
}

export async function translationWatch(env, now = Date.now()) {
  const out = {};
  try {
    out.alerts = await translationAlerts(env.NEWS_DB, now);
  } catch (e) {
    out.alerts_error = String(e?.message || e).slice(0, 160);
  }
  try {
    out.archive = await recheckArchive(env, now);
  } catch (e) {
    out.archive_error = String(e?.message || e).slice(0, 160);
  }
  return out;
}
