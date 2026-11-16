# ARCH-04 / Backend — translate current displayed event representatives in RU

**Baseline main** `a989d7b4c58fc772c84cf741c96d60e3ed7ef36f`. Original `backend/editor/src/translations/scheduled.mjs` blob `2b3be8cff87ecb1c94e1ff1c1834e95ba9ef64c4`. User priority: BACK complete first, no FRONT/UI or historical B-01 edits.

## Diagnosis, live production NEWS D1 read-only — 16.11.2026

- 120 current event groups with `last_seen_ms > 2026-11-15 UTC` and 26 event representatives without RU headline (also 24 incomplete RU summaries): event priority 6:6, 5:4, 4:16. High-priority groups (7–9) entirely RU-complete.
- The **public news feed** uses `news_event_groups.representative_id` including 4–6; current `translateTitles` only selects `news_items.priority>=7`, excluding displayed representatives and generating user-visible pending. E.g. source reports on Iran, Houthis, coalition talks, Israeli cybersecurity, UN diplomats currently held as group representatives.
- Some other priority 4–6 news are not representatives. Broad translation of all priority 4–6 would waste AI on duplicate/non-displayed data. RU daily quota 20/20 batches, 1401.2 reported neurons of local 2500, high priority current coverage already complete.

## Minimal scoped change and safety contract

- Change **only** RU `translateTitles` candidate SQL and its date bindings in `backend/editor/src/translations/scheduled.mjs`. Preserve existing high priority (>=7, last 36h) OR include **a representative of an existing, recently seen event group** (priority>=4, last_seen within 36h), even if the representative article is slightly older than 36h. Continue selecting only `headline_ru IS NULL OR (summary_ru IS NULL AND length(summary)>10)`, newest articles first, max 22 rows and 5 calls per batch. No extra AI triggers, no cron or budget bump.
- Reuse **actual event engine representative IDs** and existing source-level filters. No source or political affiliation whitelist/blacklist, no new regex relevance proxy, no changes to `news_event_groups` schema, locale UI, model, prompts, attribution and factual validation.
- Add `tests/architecture/editor-ru-event-representative-selection.test.mjs` for: seen event at score 4/5/6 selected; low priority non-representatives excluded; stale group excluded; high priority independent of event rows remains; missing summary eligible; SQL cutoff bound twice; sponsor/irrelevant candidates still skipped; budget 20/day unchanged; exact prechange source SHA. **RED** through mandatory Editor CI.
- Maintain v64 pinned module extraction test by `tests/architecture/ru-translation-selection-parity.mjs` reconstructing original scheduled.mjs byte-for-byte; use reconstructor in `tests/architecture/editor-modules.test.mjs`. All other old tests continue unchanged.
- **GREEN** mandatory Editor suite, integrated-data checks and immutable three-component release. Review PR diff; merge squash to main, coordinated deploy, independent Cloudflare read-only check Pages/Editor/Monitor, cron, D1 budget and representative counts. No promise of immediate RU backlog drop while daily 20 batches already exhausted.

**Deferred/other backend:** HE source hash freshness, untranslated event API state, RU 20-batch cap needs follow-up only if actual measured throughput insufficient; provider cooldown/manual concurrency and ARCH-01/05/06/07 remain open. FRONT deferred, B-01 historical correction archive.
