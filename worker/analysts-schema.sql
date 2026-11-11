-- Regional Watch analyst publishing. Independent from legacy monitor tables.
CREATE TABLE IF NOT EXISTS analysts (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1, created_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS analyst_sources (
  id TEXT PRIMARY KEY, analyst_id TEXT NOT NULL REFERENCES analysts(id),
  type TEXT NOT NULL CHECK(type IN ('telegram_public','youtube_rss')),
  canonical_prefix TEXT NOT NULL UNIQUE, feed_url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, verified_by TEXT NOT NULL,
  verified_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS analyst_items (
  id TEXT PRIMARY KEY, analyst_id TEXT NOT NULL REFERENCES analysts(id),
  source_id TEXT NOT NULL REFERENCES analyst_sources(id),canonical_url TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,source_published_at_ms INTEGER NOT NULL,
  title TEXT NOT NULL,body TEXT NOT NULL,text_status TEXT NOT NULL,
  content_hash TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',
  created_at_ms INTEGER NOT NULL,processed_at_ms INTEGER,
  last_attempt_at_ms INTEGER, attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT
);
CREATE INDEX IF NOT EXISTS analyst_items_pending ON analyst_items(state,source_published_at_ms DESC);
CREATE TABLE IF NOT EXISTS analyst_item_revisions (
  item_id TEXT NOT NULL REFERENCES analyst_items(id),content_hash TEXT NOT NULL,
  body TEXT NOT NULL,discovered_at_ms INTEGER NOT NULL,
  PRIMARY KEY(item_id,content_hash)
);
CREATE TABLE IF NOT EXISTS analyst_editorial_decisions (
  id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES analyst_items(id),
  content_hash TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN ('publish','skip','needs_data')),
  relevance INTEGER NOT NULL,novelty INTEGER NOT NULL,substance INTEGER NOT NULL,
  reason TEXT NOT NULL,model TEXT NOT NULL,details_json TEXT NOT NULL,decided_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS analyst_decisions_model_time ON analyst_editorial_decisions(model,decided_at_ms DESC);
CREATE TABLE IF NOT EXISTS analyst_publications (
  id TEXT PRIMARY KEY,item_id TEXT NOT NULL UNIQUE REFERENCES analyst_items(id),
  analyst_id TEXT NOT NULL REFERENCES analysts(id),headline TEXT NOT NULL,
  summary TEXT NOT NULL,short_quote TEXT NOT NULL,original_url TEXT NOT NULL,
  original_published_at_ms INTEGER NOT NULL,published_at_ms INTEGER NOT NULL,
  source_type TEXT NOT NULL,content_hash TEXT NOT NULL,fact_check_status TEXT NOT NULL,
  authorship_status TEXT NOT NULL,importance_score INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',version INTEGER NOT NULL DEFAULT 1,
  editor_version TEXT NOT NULL,correction_note TEXT
);
CREATE INDEX IF NOT EXISTS analyst_publications_time ON analyst_publications(published_at_ms DESC);
CREATE TABLE IF NOT EXISTS analyst_ai_attempts (
  item_id TEXT NOT NULL,day_start_ms INTEGER NOT NULL,model TEXT NOT NULL,attempted_at_ms INTEGER NOT NULL,
  PRIMARY KEY(item_id,day_start_ms)
);
CREATE INDEX IF NOT EXISTS analyst_ai_attempts_day ON analyst_ai_attempts(day_start_ms);
CREATE TABLE IF NOT EXISTS analyst_runs (
  id TEXT PRIMARY KEY,started_at_ms INTEGER NOT NULL,completed_at_ms INTEGER,
  status TEXT NOT NULL,stats_json TEXT,error_message TEXT
);
CREATE INDEX IF NOT EXISTS analyst_runs_time ON analyst_runs(started_at_ms DESC);
INSERT OR IGNORE INTO analysts(id,display_name,description,enabled,created_at_ms)
 VALUES('sergey-auslender','Сергей Ауслендер','Военный журналист; независимая авторская аналитика',1,1794430000000);
INSERT OR IGNORE INTO analyst_sources(id,analyst_id,type,canonical_prefix,feed_url,enabled,verified_by,verified_at_ms)
 VALUES('auslender-telegram','sergey-auslender','telegram_public','https://t.me/voinasordoy/','https://t.me/s/voinasordoy',1,'https://www.9tv.co.il/Author?id=2171',1794430000000);
INSERT OR IGNORE INTO analyst_sources(id,analyst_id,type,canonical_prefix,feed_url,enabled,verified_by,verified_at_ms)
 VALUES('auslender-youtube','sergey-auslender','youtube_rss','https://www.youtube.com/watch?v=','https://www.youtube.com/feeds/videos.xml?channel_id=UCygnHvXjsEa_gLMH-WmzeXQ',1,'https://www.9tv.co.il/Author?id=2171',1794430000000);