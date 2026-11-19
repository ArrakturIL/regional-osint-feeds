-- Private hot cache of verified Neon collector pairs for the existing Monitor D1 binding.
-- Source-of-truth is Neon; this table is a read replica populated by GitHub Actions.
-- The regular public Pages API never reads this table or exposes raw snapshot data.
CREATE TABLE IF NOT EXISTS regional_collector_cache (
 source_key TEXT NOT NULL PRIMARY KEY
  CHECK (source_key IN ('analysts','centcom','copernicus','gdelt',
                        'marad','satellite','unosat','news_translation',
                        'adsb','adsb_mil')),
 checked_at_ms INTEGER NOT NULL CHECK (checked_at_ms > 0),
 data_json TEXT NOT NULL CHECK (json_valid(data_json)),
 status_json TEXT NOT NULL CHECK (json_valid(status_json)),
 data_sha256 TEXT NOT NULL CHECK (length(data_sha256)=64),
 status_sha256 TEXT NOT NULL CHECK (length(status_sha256)=64),
 synced_at_ms INTEGER NOT NULL CHECK (synced_at_ms > 0)
);
