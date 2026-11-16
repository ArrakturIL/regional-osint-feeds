# DEV-05 / ARCH-03 — Editor RSS ingestion and D1 persistence boundary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development and verification-before-completion. One independent block with full release verification.

**Goal:** Isolate the existing scheduled RSS news ingest/store/prune stage from the Editor `scan()` entrypoint, preserving live publication and source-status behavior exactly.

**Architecture:** Introduce `backend/editor/src/news/ingestion.mjs` exporting `ingestNewsFeeds(env,now)`. This owns source FEEDS projection, RSS `load`, per-feed D1 status writes, score ordering, technical URL deduplication, 6-hour same-publisher headline protection, 240-item cap, 8-day lookup/prune and `digest`; returns `{runs,all,inserted}`. `scan()` calls it once with its original `Date.now()` timestamp immediately before unchanged `reconcile`/translation/commentary. Keep original statement bodies, constants, SQL and order, using frozen Editor v64 parity reconstitution.

**Spec:** `docs/REGIONAL_WATCH_MASTER_TODO.md` DEV-05/ARCH-03; `docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md`.

## Global constraints
- No source/cron/budget/model changes, D1 migration, paid service, production data mutation in tests or new network calls.
- Preserve `NEWS_DB` source status per provider (including HTTP errors and empty), existing duplicate article IDs and 6-hour publisher guard; do not conflate similar titles of independent publishers.
- Preserve canonical HTTPS and tracking identity policy, original preserved `item.link` in D1, 240-item cap and 8-day retention.
- No global UI QA, no backup/versioned retention, no OSS integration in this block.

## Task 1 — lossless scheduled ingestion boundary
- [ ] RED: create `tests/architecture/editor-news-ingestion.test.mjs` importing non-existent `ingestNewsFeeds`; exercise HTTP failures/empty feeds, technical URL dedup, existing canonical URL dedup, same-publisher headline guard, differing publishers, insertion count, and 8-day prune with synthetic fetch and local D1.
- [ ] Wire the new test into mandatory editor-source workflow; see expected module-not-found on branch PR.
- [ ] GREEN: move source projection, digest and original `scan` ingest/persist block into `news/ingestion.mjs`; pass `now` from `scan` and retain rest of pipeline.
- [ ] Reconstruct exact `index.js` and `news/ingestion.mjs` from existing frozen-v64 parity fixture after earlier five moves. Ensure module parsing and import resolution.
- [ ] Confirm all PR CI jobs, immutable three-component dry-run and integrated offline architecture tests; review exact diff.
- [ ] Merge only with green checks, coordinated release and independent read-only Cloudflare Pages/Editor/Monitor version/bindings/cron postcheck.
- [ ] Update MASTER TODO and DEV-05 audit with specific RED, GREEN, production receipts; leave ARCH-03 open for other owners.

## Review focus
- Malformed/failed RSS feeds must continue to write status and not break unrelated feeds.
- Same normalized title from two independent publishers must not be silently deduplicated.
- URLs with tracking params must not create duplicate technical identities.
- Last 240 items and 8-day prune must be unchanged, including counting.
- Scan summary and subsequent event reconciliation, RU/IDF translation and commentary must retain sequencing.
