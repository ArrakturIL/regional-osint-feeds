-- Add explicit source languages and retain private translations for editorial verification.
-- Apply once after worker/analysts-schema.sql; ALTER COLUMN is intentionally not rerunnable.
ALTER TABLE analyst_sources ADD COLUMN language TEXT NOT NULL DEFAULT 'ru' CHECK(language IN ('ru','he','en'));
CREATE TABLE IF NOT EXISTS analyst_translations (
  item_id TEXT NOT NULL REFERENCES analyst_items(id),
  content_hash TEXT NOT NULL,
  original_language TEXT NOT NULL CHECK(original_language IN ('he','en')),
  translation_ru TEXT NOT NULL,
  quality_score INTEGER NOT NULL CHECK(quality_score BETWEEN 85 AND 100),
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified','needs_data')),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY(item_id,content_hash,original_language)
);
CREATE INDEX IF NOT EXISTS analyst_translations_created ON analyst_translations(created_at_ms DESC);
UPDATE analyst_sources SET language='ru' WHERE language='ru';
-- The source IDs below were verified in config/analysts.json.
INSERT OR IGNORE INTO analysts(id,display_name,description,enabled,created_at_ms)
VALUES('yigal-levin','Игаль Левин','Военный обозреватель; оценки международной безопасности',1,1794430000000);
INSERT OR IGNORE INTO analysts(id,display_name,description,enabled,created_at_ms)
VALUES('dina-lisnyanskaya','«Война и мир на Ближнем Востоке»','Канал аналитики Дины Лиснянской и редактора Михаила Шафранова; атрибуция к каналу',1,1794430000000);
INSERT OR IGNORE INTO analysts(id,display_name,description,enabled,created_at_ms)
VALUES('abu-ali-express','Абу Али Экспресс','Ивритоязычный авторский канал региональных комментариев и новостей',1,1794430000000);
INSERT OR IGNORE INTO analysts(id,display_name,description,enabled,created_at_ms)
VALUES('amichai-stein','Амихай Штайн','Израильский дипломатический и международный журналист',1,1794430000000);
INSERT OR IGNORE INTO analyst_sources(id,analyst_id,type,canonical_prefix,feed_url,enabled,verified_by,verified_at_ms,language)
VALUES('yigal-telegram','yigal-levin','telegram_public','https://t.me/yigal_levin/','https://t.me/s/yigal_levin',1,'https://t.me/yigal_levin',1794430000000,'ru');
INSERT OR IGNORE INTO analyst_sources(id,analyst_id,type,canonical_prefix,feed_url,enabled,verified_by,verified_at_ms,language)
VALUES('dina-telegram','dina-lisnyanskaya','telegram_public','https://t.me/crescentscroissants/','https://t.me/s/crescentscroissants',1,'https://t.me/crescentscroissants',1794430000000,'ru');
INSERT OR IGNORE INTO analyst_sources(id,analyst_id,type,canonical_prefix,feed_url,enabled,verified_by,verified_at_ms,language)
VALUES('abuali-telegram','abu-ali-express','telegram_public','https://t.me/abualiexpress/','https://t.me/s/abualiexpress',1,'https://t.me/abualiexpress',1794430000000,'he');
INSERT OR IGNORE INTO analyst_sources(id,analyst_id,type,canonical_prefix,feed_url,enabled,verified_by,verified_at_ms,language)
VALUES('stein-telegram','amichai-stein','telegram_public','https://t.me/US2020US/','https://t.me/s/US2020US',1,'https://t.me/US2020US',1794430000000,'he');
