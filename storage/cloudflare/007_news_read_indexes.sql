-- D1 budget (22.11): the translation and SLA candidate scans ran every 5 min
-- over all of news_items (~1.1–1.8k rows read per call, ~1.4M rows/day; the
-- daily usage report hit 74% of 5M). With these indexes and the OR→UNION
-- rewrite each branch reads only its own range. Database: NEWS.
-- Additive and idempotent; rollback: DROP INDEX for each.
CREATE INDEX IF NOT EXISTS news_items_priority_published ON news_items(priority, published_ms);
CREATE INDEX IF NOT EXISTS news_items_priority_discovered ON news_items(priority, discovered_ms);
CREATE INDEX IF NOT EXISTS news_event_groups_last_seen ON news_event_groups(last_seen_ms);
