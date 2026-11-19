-- Q12 (19.11): allow ADS-B rows in the private collector cache.
-- SQLite cannot alter a CHECK constraint. ALTER TABLE ... RENAME is not usable
-- here: it re-parses every trigger, and monitor_runs_link_events_insert
-- ("UPDATE monitor_runs AS m ... m.payload") fails that check although it runs
-- fine. So: copy the rows aside, recreate the table, copy back (digests stay
-- valid). Applied to production 19.11 as one atomic D1 request.
CREATE TABLE regional_collector_cache_q12_copy AS SELECT * FROM regional_collector_cache;
DROP TABLE regional_collector_cache;
CREATE TABLE regional_collector_cache (
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
INSERT INTO regional_collector_cache
 SELECT source_key,checked_at_ms,data_json,status_json,data_sha256,status_sha256,synced_at_ms
 FROM regional_collector_cache_q12_copy;
DROP TABLE regional_collector_cache_q12_copy;
-- After the Monitor release without centcom_rss (otherwise its next run
-- overwrites the row): the CENTCOM RSS feed itself is empty (0 items, probe
-- 19.11); CENTCOM news comes via centcom_dvids.
UPDATE source_status SET state='retired',
 detail='Лента CENTCOM RSS пуста (0 записей, проверка 19.11); новости CENTCOM идут через centcom_dvids (DVIDS).'
 WHERE source='centcom_rss';
