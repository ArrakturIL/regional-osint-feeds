-- D1 budget (22.11): the repost check from #270 looks up an earlier decision by
-- content_hash and scanned the whole table (~775 rows per call). Database: CORE.
-- Additive and idempotent; rollback: DROP INDEX analyst_decisions_content_hash.
CREATE INDEX IF NOT EXISTS analyst_decisions_content_hash ON analyst_editorial_decisions(content_hash);
