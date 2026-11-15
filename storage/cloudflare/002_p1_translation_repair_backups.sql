-- Private D1 rollback data for manually approved P1 translation corrections.
-- This table MUST NOT be exposed by Pages/Monitor APIs or collector mirrors.
-- One original immutable pair per batch and article; no secrets stored.
CREATE TABLE IF NOT EXISTS regional_translation_repair_backups (
  batch_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  captured_at_ms INTEGER NOT NULL CHECK(captured_at_ms > 0),
  news_json TEXT NOT NULL CHECK(json_valid(news_json) AND json_type(news_json) = 'object'),
  hebrew_json TEXT NOT NULL CHECK(json_valid(hebrew_json) AND json_type(hebrew_json) = 'object'),
  PRIMARY KEY(batch_id, item_id)
);
CREATE TRIGGER IF NOT EXISTS regional_translation_repair_backups_no_update
BEFORE UPDATE ON regional_translation_repair_backups
BEGIN SELECT RAISE(ABORT, 'immutable translation rollback backup'); END;
CREATE TRIGGER IF NOT EXISTS regional_translation_repair_backups_no_delete
BEFORE DELETE ON regional_translation_repair_backups
BEGIN SELECT RAISE(ABORT, 'immutable translation rollback backup'); END;
