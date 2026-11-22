// Real SQLite (node:sqlite) behind the D1 API surface the Editor uses
// (prepare/bind/first/all/run, batch). B10 translation tests run the real
// queue SQL instead of matching SQL strings. Production schemas copied from D1
// NEWS (regional-watch-news) and CORE (regional-osint) on 19.11.2026.
import { DatabaseSync } from 'node:sqlite';

export function d1() {
  const db = new DatabaseSync(':memory:');
  const plain = r => (r ? { ...r } : null);
  const exec = (sql, args, mode) => {
    const st = db.prepare(sql);
    if (mode === 'first') return plain(st.get(...args));
    if (mode === 'all') return { results: st.all(...args).map(plain), meta: {} };
    const r = st.run(...args);
    return { meta: { changes: Number(r.changes) }, results: [] };
  };
  const stmt = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => stmt(sql, a),
    first: async () => exec(sql, args, 'first'),
    all: async () => exec(sql, args, 'all'),
    run: async () => exec(sql, args, 'run'),
    _batch: () => exec(sql, args, /^\s*SELECT/i.test(sql) ? 'all' : 'run'),
  });
  return {
    raw: db,
    prepare: sql => stmt(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map(s => s._batch());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    rows: (sql, ...a) =>
      db
        .prepare(sql)
        .all(...a)
        .map(plain),
    one: (sql, ...a) => plain(db.prepare(sql).get(...a)),
  };
}

export function newsDb() {
  const db = d1();
  db.raw.exec(`
CREATE TABLE news_items (id TEXT PRIMARY KEY, source TEXT NOT NULL, headline TEXT NOT NULL, headline_ru TEXT, summary TEXT, url TEXT NOT NULL, published_ms INTEGER NOT NULL, discovered_ms INTEGER NOT NULL, priority INTEGER NOT NULL DEFAULT 0, comment TEXT, comment_model TEXT, comment_at_ms INTEGER, summary_ru TEXT);
CREATE TABLE editor_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_ms INTEGER NOT NULL);
CREATE TABLE news_translation_budget (day_utc TEXT PRIMARY KEY,batches INTEGER NOT NULL DEFAULT 0,estimated_neurons REAL NOT NULL DEFAULT 0,updated_ms INTEGER NOT NULL);
CREATE TABLE regional_i18n (kind TEXT NOT NULL,item_id TEXT NOT NULL,language TEXT NOT NULL CHECK(language IN ('ru','he')),source_hash TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',commentary TEXT NOT NULL DEFAULT '',quality_score INTEGER NOT NULL CHECK(quality_score BETWEEN 85 AND 100),model TEXT NOT NULL,created_at_ms INTEGER NOT NULL,PRIMARY KEY(kind,item_id,language));
CREATE TABLE regional_i18n_attempts(kind TEXT NOT NULL,item_id TEXT NOT NULL,language TEXT NOT NULL,source_hash TEXT NOT NULL,day_utc TEXT NOT NULL,attempted_at_ms INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'running',error TEXT, retry_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(kind,item_id,language,source_hash,day_utc));
CREATE TABLE regional_i18n_budget(day_utc TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,estimated_neurons REAL NOT NULL DEFAULT 0,updated_at_ms INTEGER NOT NULL);
CREATE TABLE news_event_groups(event_id TEXT PRIMARY KEY,representative_id TEXT NOT NULL,topic TEXT NOT NULL,priority INTEGER NOT NULL,last_seen_ms INTEGER NOT NULL,member_count INTEGER NOT NULL,source_count INTEGER NOT NULL,origin_count INTEGER NOT NULL,verification_status TEXT NOT NULL,reason_codes TEXT NOT NULL,sources_json TEXT NOT NULL,signature TEXT NOT NULL,updated_ms INTEGER NOT NULL);
CREATE INDEX news_items_priority_published ON news_items(priority, published_ms);
CREATE INDEX news_items_priority_discovered ON news_items(priority, discovered_ms);
CREATE INDEX news_event_groups_last_seen ON news_event_groups(last_seen_ms);
CREATE TABLE ai_daily_neurons(day_utc TEXT PRIMARY KEY,neurons REAL NOT NULL DEFAULT 0,calls INTEGER NOT NULL DEFAULT 0,updated_ms INTEGER NOT NULL);
CREATE TABLE ai_provider_calls(day_utc TEXT NOT NULL,provider_model TEXT NOT NULL,calls INTEGER NOT NULL DEFAULT 0,updated_ms INTEGER NOT NULL,PRIMARY KEY(day_utc,provider_model));
CREATE TABLE editorial_notes (id TEXT PRIMARY KEY, headline TEXT, text TEXT, published_ms INTEGER);
`);
  return db;
}

export function coreDb() {
  const db = d1();
  db.raw.exec(`
CREATE TABLE regional_i18n (kind TEXT NOT NULL,item_id TEXT NOT NULL,language TEXT NOT NULL CHECK(language IN ('ru','he')),source_hash TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',commentary TEXT NOT NULL DEFAULT '',quality_score INTEGER NOT NULL CHECK(quality_score BETWEEN 85 AND 100),model TEXT NOT NULL,created_at_ms INTEGER NOT NULL,PRIMARY KEY(kind,item_id,language));
CREATE TABLE regional_i18n_attempts(kind TEXT NOT NULL,item_id TEXT NOT NULL,language TEXT NOT NULL,source_hash TEXT NOT NULL,day_utc TEXT NOT NULL,attempted_at_ms INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'running',error TEXT, retry_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(kind,item_id,language,source_hash,day_utc));
CREATE TABLE analyst_publications (id TEXT PRIMARY KEY, headline TEXT, summary TEXT, short_quote TEXT, status TEXT, published_at_ms INTEGER);
CREATE TABLE monitor_events (event_id TEXT PRIMARY KEY, category TEXT NOT NULL DEFAULT 'x', first_seen TEXT, payload TEXT NOT NULL, updated_at_ms INTEGER NOT NULL);
CREATE TABLE analysts (id TEXT PRIMARY KEY, display_name TEXT, description TEXT, enabled INTEGER);
`);
  return db;
}

let seq = 0;
export function addNews(db, row) {
  const r = {
    id: row.id || 'n' + ++seq,
    source: 'toi',
    url: 'https://example.org/' + (row.id || seq),
    headline_ru: null,
    summary_ru: null,
    comment: null,
    priority: 7,
    summary: '',
    ...row,
  };
  r.discovered_ms ??= r.published_ms;
  db.raw
    .prepare(
      'INSERT INTO news_items(id,source,headline,headline_ru,summary,url,published_ms,discovered_ms,priority,comment,summary_ru) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      r.id,
      r.source,
      r.headline,
      r.headline_ru,
      r.summary,
      r.url,
      r.published_ms,
      r.discovered_ms,
      r.priority,
      r.comment,
      r.summary_ru,
    );
  return r.id;
}

export function addGroup(db, { id, rep, priority = 5, last_seen_ms }) {
  db.raw
    .prepare("INSERT INTO news_event_groups VALUES(?,?,'t',?,?,1,1,1,'single','[]','[]','s',?)")
    .run(id || 'g-' + rep, rep, priority, last_seen_ms, last_seen_ms);
}

// Workers AI stub: answer(model, input) -> response object; records calls.
// B11 meaning checks (second opinion) are answered by `verdict` (default: same
// meaning) and recorded in `checks`, so translation call counts stay exact.
export const isMeaningCheck = input =>
  /^You check a news translation/.test(input?.messages?.[0]?.content || '');
export function ai(answer, verdict = () => ({ same_meaning: true, error: 'none', evidence: '' })) {
  const calls = [],
    checks = [];
  return {
    calls,
    checks,
    run: async (model, input) => {
      if (isMeaningCheck(input)) {
        checks.push({ model, input });
        return {
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(verdict(model, input)) } }],
          usage: { neurons: 3 },
        };
      }
      calls.push({ model, input });
      return answer(model, input);
    },
  };
}
