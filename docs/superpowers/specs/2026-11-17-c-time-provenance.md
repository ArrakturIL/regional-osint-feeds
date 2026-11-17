# C-TIME-01: provenance and stable feed paging (17 Nov 2026)

**Decision:** Implement only already-agreed backend C-01/C-05, without changing delayed B translations or frontend.

**Observed D1:** `news_items` has both `published_ms` (upstream publication time) and `discovered_ms` (actual first ingestion time); current `news_event_groups.sources_json` retains only `published_ms`. Current `/api/news` exposes `event_first_seen_ms` derived from source publication, and `published_ms` derived from latest source publication, which are *not* measured event occurrence/observation timestamps. `feed_order_hash` exists, but page 2 cannot reject a changed ordered feed and may silently duplicate/skip cards.

## Source-backed solution

- During ordinary scheduled reconciliation, include validated `discovered_ms` as `collected_ms` on every source in `sources_json`, and record `reported_origin` only as *attribution heuristic*, not independent corroboration. Keep all source links and timestamps. Existing rows update on the normal cron; no manual D1 writes or migrations.
- Add explicit `event_earliest_published_ms`, `event_latest_published_ms`, `event_first_collected_ms`, `event_last_collected_ms`, `event_at_ms:null` (not known from RSS), `event_time_basis` with clear labels and `event_first_seen_basis:'source_publication'` for backward compatibility. Do **not** change existing `event_first_seen_ms`, `event_last_seen_ms`, `published_ms`, latest/priority order or RU/HE display logic before frontend migration.
- For older indexed event snapshots without `collected_ms` never manufacture observed times from publication. Return `null`; collect naturally on next reconciliation.
- Add optional `expected_order_hash` (64 hexadecimal SHA-256 string), compare to full ordered feed's `feed_order_hash` *before translation DB reads*. If changed, return 409 `feed_changed` + new hash and clear retry policy (restart from offset 0). Invalid hashes return 400. Old clients without token retain legacy behavior; never claim offset pagination is snapshot-atomic without a supplied token.
- Guard RU/HE equal page indices and sort semantics. No frontend changes; UI wiring only after backend C and in F-07.

**Limits:** Historical source publication is not event time; `discovered_ms` is first RSS ingestion, not evidence of the event. Existing `origin_count` means distinct *reporting* inferred origins, not independent factual confirmation. No B work, database schema/cron/AI/secret changes.