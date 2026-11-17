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

## Scope extension — C-02/C-03/C-04 source-backed controls

Read-only D1 inspection found that six media reports of one **Jordanian court sentencing** were materialized under `topic=strike` despite judicial, not military, action; several `source_assertion=reported_death` were inherited from past church attack background or the legal phrase “death sentence”. Representative original headlines: “Jordan sentences three men to death by hanging after deadly church attack” (Al Jazeera), “Three sentenced to death over Jordan church attack” (France 24), “Three men sentenced to death in Jordan over fatal church mass shooting” (BBC). These are not claims that defendants have already been killed.

Use a generic headline-first **judicial verdict** classifier before incident-keyword fallback, conservatively distinguish sentencing from fatal incidents, allow same court verdict grouping only with shared non-generic case context + matching counted defendants/penalty. Do not hardcode publisher, place, article ID, names or country.

In `/api/changes`, live `sourceComparable=0` and `sourceGaps=[]` can coexist with journal updates and `status=ready`, providing no reason for source comparison unavailability. Add `sourceCoverage:{state,reason,comparable,uncomparable}` with full/partial/unavailable, distinguish two absent source-maxima maps from present but noncomparable timestamps. Do not invent missing source identities, do not claim journal updates verify incidents. Keep old field names/status and no-write API.

Acceptance: explicit RED/GREEN source fixture tests, historical editor-v64 parity normalization of reviewed additive C-04 field, full CI. Wide content QA remains open.