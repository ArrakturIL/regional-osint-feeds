-- H-04 per-source rollback (applied to regional-osint and regional-watch-news).
-- A row with disabled=1 stops one collector/publisher until deleted or until_ms passes.
CREATE TABLE IF NOT EXISTS source_controls (
  source TEXT PRIMARY KEY,
  disabled INTEGER NOT NULL DEFAULT 1,
  reason TEXT,
  until_ms INTEGER,
  updated_ms INTEGER NOT NULL
);
