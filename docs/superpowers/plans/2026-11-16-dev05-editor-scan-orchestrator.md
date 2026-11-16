# DEV-05 / ARCH-03 — Editor scheduled scan orchestration boundary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development and verification-before-completion. Single isolated block.

**Goal:** Finish lossless extraction of `async function scan(env)` from the live Editor HTTP/scheduled entrypoint. The entrypoint should route requests and schedule jobs, while the news pipeline orchestrator owns ingest→group→RU translation→AI commentary→IDF translation→last_scan D1 summary in its exact original order.

**Architecture:** `backend/editor/src/news/scan.mjs` exports `scan(env)` by moving the unchanged source body, adding imports of existing `ingestNewsFeeds`, `reconcile`, `translateTitles/translateIDF`, and `generateComments`. `backend/editor/src/index.js` imports `scan`, retains identical `ctx.waitUntil(scan(env))` scheduled call and all other behavior. No new dependencies, sources, budget, timing or D1 schema.

**Spec:** MASTER TODO latest ARCH-03 stage and audit; frozen Cloudflare Editor v64 parity tests.

## Task 1 — TDD source-preserving scan pipeline
- [x] RED: add `tests/architecture/editor-scan-orchestration.test.mjs` exercising successful empty-feed scan with D1 observation of sequencing, timestamps/summary, and recoverable grouping failure. Missing new `news/scan.mjs` must fail mandatory Editor CI.
- [x] Add test to mandatory `editor-source` and confirm expected RED in PR.
- [x] GREEN: move `scan(env)` unchanged into `news/scan.mjs`, adjust imports, preserve scheduled `ctx.waitUntil(scan(env))`; no other runtime changes.
- [x] Extend frozen v64 exact-source parity reconstitution and module parse/import verification for the extracted orchestration.
- [x] Review complete PR diff, verify all CI jobs, integrated tests and immutable three-component artifact.
- [x] Merge with green gates, complete coordinated release and independent Cloudflare Pages + Editor + Monitor binding/cron postcheck.
- [x] Update MASTER TODO and DEV-05 audit with observed RED/GREEN/releases, keep ARCH-03/DEV-05 open for localization and analysts.

## Review risks
- Both event-clustering success and failure must keep translations and editorial stage order; grouping failure must be persisted and must not poison scan summary.
- `last_scan` JSON contract including `comment_errors`, `translated_summaries`, `idf_translated` and ISO timestamp must remain byte-identical.
- `fetch('/health')` returns unchanged `last_scan` data or `{state:'pending'}`.
- Cron editor `*/5 * * * *` and independent scheduled Polymarket/i18n/analysts tasks must not change.

**Completion receipt:** [PR #62](https://github.com/ArrakturIL/regional-osint-feeds/pull/62) merged `c7ca95f4df930072addc13a8f934499b5ad1de66`. RED #43787495172; GREEN #43787584018 and integrated #43787584005; coordinated production #43787695419 success without rollback. Independent Cloudflare Pages, Editor, Monitor active-version/bindings/cron verification in MASTER TODO §12. ARCH-03 and DEV-05 remain open for localization, analysts and other architecture work.
