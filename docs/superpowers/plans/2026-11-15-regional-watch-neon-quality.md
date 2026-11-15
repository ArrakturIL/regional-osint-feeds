# Integrated Regional Watch architecture implementation plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:executing-plans. Implement sequentially with test-first steps; keep focused commits.

**Goal:** Replace frequent GitHub collector JSON commits with verified Neon storage, while improving QA-critical translation, news event and UI behavior in the same lasting modular architecture.

**Architecture:** Existing GitHub Actions collectors feed bounded, paired snapshots into Neon; existing Cloudflare D1 is still the hot operational event/translation store. Public readers use explicit provenance and quality gates. Change collectors one by one under rollback flags; do not introduce heavyweight paid or self-hosted model servers.

**Tech stack:** Python 3.12, psycopg 3 for scheduled Neon writes, Node ES modules, Cloudflare Pages/Workers/D1, PostgreSQL 18, the current Cloudflare AI. Optional lightweight parsing/validation packages must be benchmarked first.

**Spec:** docs/superpowers/specs/2026-11-15-regional-watch-integrated-architecture-design.md

## Global constraints
- Remain on free plans; preserve site operation and current database records.
- No secret values, credentials or connection URLs in commits.
- P1 content accuracy first, then P2 event grouping/freshness and UI.
- Same verified source records/IDs for RU and HE.
- Do not remove GitHub JSON writebacks before complete new write/read parity.
- No user-facing PostgreSQL access; future readers need authenticated server-side path plus caching.

## Review focus
1. Late collector run must not overwrite a newer snapshot, including retries with same timestamp.
2. Missing credentials, storage limits and DB outages must not erase last-good news.
3. Fluent but incorrect translation still fails on actor, target, condition and uncertainty.
4. One incident with several outlets must retain all source assertions without becoming five cards; distinct incidents may not merge.
5. Both RU/HE and mobile/desktop preserve navigation, accessible controls and predictable article order.

### Task 1: Storage schema and validator
Files: storage/neon/001_collector_snapshots.sql; scripts/neon_mirror.py; scripts/test_neon_mirror.py; docs/architecture/neon-collector-contract.md.
Interfaces: load_snapshot(source_key, data_dir) returns validated paired JSON payload and timestamp; publish_snapshot(connection, snapshot) returns written, unchanged or stale; verify_snapshot returns hashes/age.
- [ ] Add tests for allowed source names, cap, invalid JSON, stale timestamp, equal retry, atomic pair and content hash; run tests and observe a deliberate failure.
- [ ] Implement validator and PostgreSQL schema with deterministic upsert and checks, preserve last-good on failed transactions.
- [ ] Run new tests and current collector/offline suite.
- [ ] Create additive schema on new Neon project; verify SELECT and one bounded sample roundtrip with no secret logs.
- [ ] Commit.

### Task 2: Collector shadow publishing
Files: scripts/publish_neon_mirror.py and tests; .github/workflows/neon-shadow.yml; selected collector workflows.
- [ ] Test missing secret skips writes but reports missing configuration.
- [ ] Use pooled NEON_DATABASE_URL as Actions secret; compare stored SHA, record count and source checked_at with GitHub mirror.
- [ ] Mirror without removing old commits, measure Neon Free usage; do not make shadow failures look like a healthy source.
- [ ] Commit after CI green.

### Task 3: Private read path and source-by-source cutover
Files: backend/monitor/src/mirrors/snapshot-reader.js, existing collector adapters, tests/architecture/.
- [ ] RED tests for no credentials, timeout, stale payload, wrong pair and valid fallback.
- [ ] Implement a server-side authenticated read adapter or bounded Neon-to-D1 sync after measuring cost and security; never query Neon directly from browsers.
- [ ] Verify identical old/new JSON in shadow; cut over only one source at a time, with feature flag/rollback.
- [ ] Retire that source's GitHub data commit only after its reads work for several cycles.

### Task 4: P1 translation quality and provenance
Files: backend/editor/src/translations/fact-guard.mjs, backend/editor/src/localization/localization.mjs, scripts/translate_news_open_source.py and corresponding tests.
- [ ] RED tests for tanker/naval mine, Reuters may-postpone-if-no-provocations, JPost HE actor switch.
- [ ] Implement explicit subject/action/target/negation/conditional verification using compact terms and current source hash.
- [ ] Treat English-origin RU text as translation, never as native source; fail closed into needs_review.
- [ ] Correct existing invalid cached translations only after source-verified replacement, test API and commit.

### Task 5: P2 source grouping and news order
Files: backend/editor/src/news/events.mjs, backend/editor/src/localization/localization.mjs, frontend/src/components/NewsArchive/NewsArchive.js and tests.
- [ ] RED tests for five-source one-strike cluster, conflicting death confirmations, and unrelated events with shared target.
- [ ] Preserve multi-source provenance, avoid false independence, separate mixed roundups.
- [ ] Implement latest chronological archive and unambiguous priority/home mode with identical RU/HE IDs and order.
- [ ] Verify pagination/selection with the recorded QA fixtures and commit.

### Task 6: Reader, Digest and editorial UI quality
Files: frontend/src/components/Digest/Digest.js, NewsMasonry and owned CSS, localization/a11y components and tests.
- [ ] RED tests for tall-card empty whitespace, Last checked split layout, vague verification badge, Hebrew back-to-top aria, Russian plurals and duplicate archive polling.
- [ ] Fix with source-order DOM, readable RU/HE labels and responsive spacing.
- [ ] Browser-check 390/719/1363 widths, empty/partial/failed states, locale switch; commit.

### Task 7: OSS trial and adoption
- [ ] Capture fixture set from source formats (RSS, HTML, RU, HE, EN, mixed text) and baseline extraction/translation failures.
- [ ] Benchmark builtin Unicode/Intl/regex/hash and small libraries fast-xml-parser, Cheerio/Readability, franc-min where useful.
- [ ] Adopt only packages with confirmed compatibility, acceptable license, no new paid runtime and a demonstrated improvement; add regression tests.
- [ ] Keep unsupported heavier OSS from the research as a future candidate, not required for this release.

### Task 8: Release and QA
- [ ] Full Python/Node suite, bounded Neon query/egress usage, shadow reports and bilingual API parity.
- [ ] Deploy preview, read-only smoke, review protection of shared D1.
- [ ] Document rollback for each source; merge and publish only after the component-level verification gate; full production QA follows.
