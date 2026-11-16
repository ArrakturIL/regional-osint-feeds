# DEV-05 / ARCH-03 — Isolate localized analyst API routes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development and verification-before-completion.

**Goal:** Isolate live localized analysts, analyst-posts and analyst detail response adapter and shared read-side translation/HTTP primitives without changing observable behavior.

**Baseline:** `backend/editor/src/localization/localization.mjs` main Git blob SHA `4e7346b0463edd2a71a8998b121afb604609ae6f` after scheduled-localization PR #63. The existing frozen-source parity against former pre-split SHA `5b907775613eec9c1a986eddcd06cb74fd7c9880` must continue passing.

**Boundary:** new `backend/editor/src/localization/read-core.mjs` moves exactly `HEADERS`, `respond`, `fieldLocale`, and `localized` (and imports source fingerprint and factual guard); new `backend/editor/src/localization/analyst-api.mjs` handles exactly the existing `/api/analysts`, `/api/analyst-posts`, `/api/analyst-posts/:slug` branch, using `read-core` and shared `sourceText`. Existing `localization.mjs` remains the gateway for common GET/OPTIONS/locale/limit validation, localizeNewsRow, storyProvenance, public news/editorial/story branches and `{fetch,scheduled}` facade.

**Behavior contracts:** no changes to language detection, source hashes, Hebrew quality-score >=85, mismatch fail-closed, DB batching, source attribution, analyst/translation response keys, pagination/400/405/404 contract, OPTIONS/CORS, cron, model and budgets. Do not change `analysts/editor.mjs` itself in this block.

## Checklist
- [ ] Add mandatory `tests/architecture/editor-localization-analysts.test.mjs` (direct module and facade tests: RU/HE profiles/posts/detail, bulk cached HE, upstream error response, invalid inputs, source provenance) then watch expected RED from absent module.
- [ ] Implement lossless `read-core.mjs` extraction with ESM imports, no cycle; lift analyst branch to `analyst-api.mjs`; preserve facade exports and route checks.
- [ ] Add deterministic Git blob parity reconstruction for current `4e7346...` reader baseline and modify prior original `5b907...` restoration test to use reader-reconstructed source. Confirm both source hashes.
- [ ] Verify full mandatory Editor CI, translation semantics, integrated architecture and immutable 3-bundle GREEN; review complete diff.
- [ ] Merge green PR, await coordinated production release, independent Cloudflare Pages/Editor/Monitor versions, bindings and crons.
- [ ] Update `docs/REGIONAL_WATCH_MASTER_TODO.md`, DEV-05 audit, this plan with RED/GREEN/release receipts, keep DEV-05 ARCH-03 unfinished for remaining public readers and analysts core.

**Risk:** Extraction should not silently remove a prefilled cache or replace the GET detail response; high-score but factually-invalid Hebrew cached results must remain needs_review. No new AI calls, endpoints, schemas, or features.
