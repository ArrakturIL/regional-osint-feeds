# DEV-05 / ARCH-03 — isolate Editor RSS ingestion (2026-11-16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and test-driven-development. Steps use checkbox syntax.

**Goal:** Separate the RSS/Atom fetch and parsing responsibility from the active Editor entrypoint without changing publication, filtering, time windows, URL limits, or AI/D1 behavior.

**Architecture:** Move unchanged `decode/tag/safeLink/entries/load` functions from `backend/editor/src/index.js` to `backend/editor/src/news/rss.mjs`. Keep `digest` and all persistence/translation/AI/scheduler functions in `index.js`. Existing `scan` calls imported `load`; module `rss.mjs` alone imports `analyze` and `checkFeedSummary`. Preserve the historical Editor v64 source parity by an *exact lossless source-split assertion* instead of disabling baseline checks.

**Tech Stack:** Cloudflare Workers ESM, Node 22 built-in node:test, GitHub Actions `editor-source`, Wrangler dry-run and 3-bundle release.

**Spec:** `docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md`, ARCH-03 in `docs/REGIONAL_WATCH_MASTER_TODO.md`.

## Global Constraints
- Preserve all source feed URLs and schedules, filters `analyze` and `checkFeedSummary`, original 75-item cap, 400k RSS read limit, 72-hour age and +10 minute clock skew, HTTPS-only URLs, source metadata and DTO.
- No extra fetches, D1 writes, AI use, migration, dependencies, new cron, or paid services.
- Do not alter Editor `scheduled` or `fetch` endpoints, or unrelated editors/Monitor/Pages.
- Historical v64 parity is pinned except deliberately extracted byte-identical blocks.
- RED→GREEN with CI, ensure immutable bundle and postrelease read-only Cloudflare checks; ARCH-03 remains [~] until other mixed modules are addressed.

## Task 1: RED
- [ ] New `tests/architecture/editor-rss-boundary.test.mjs`: ESM imports `entries/load` from `news/rss.mjs`, checks RSS/Atom HTTPS, publication age/skew, nonnews exclusion, malformed feeds/network failure, source labels and no external network.
- [ ] Add test to existing mandatory `editor-source` GitHub workflow. Verify RED is missing boundary module (not syntax/fixture error).

## Task 2: GREEN
- [ ] Copy **unchanged** RSS helpers into `backend/editor/src/news/rss.mjs`, with import/export declarations only.
- [ ] Replace RSS-local functions and module imports in active `backend/editor/src/index.js`; preserve `digest` in the entrypoint.
- [ ] Update `tests/architecture/editor-modules.test.mjs` to compare the new Editor source after the exact extracted blocks, and verify RSS module equals the exact original code with only export keywords/imports added. Leave all other frozen module parity checks unchanged.
- [ ] Verify RED→GREEN and 3-bundle dry-run, node tests, no runtime/data/schedule changes beyond import boundaries.

## Task 3: Audit and release
- [ ] Document code footprint, RED/GREEN, no changes in fetch volume or source gate, and bounded ARCH-03 status. Run code review of diff before merging.
- [ ] After coordinated release, check Pages/Editor/Monitor and bindings/cron independently; mark ARCH-03 [~] and append evidence to DEV-05 audit.
