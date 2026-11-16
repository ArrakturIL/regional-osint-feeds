# DEV-05 / ARCH-03 — Official IDF posts read-only API extraction

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. Use checklist steps.

**Goal:** Isolate Editor’s official IDF Telegram posts API handler in a focused read-only module without changing any RU/HE response, source/translation safety, chronology, or database/cron behavior.

**Architecture:** Move `rwOfficialTextParts`, `rwOfficialDecode`, `rwOfficialNumbersPreserved`, and `readOfficialPosts` **byte-identically** from the active `backend/editor/src/index.js` into `backend/editor/src/api/official-posts.mjs`. Export only `readOfficialPosts`; import it from `index.js`. Leave all other API handlers, source ingestion, scheduled jobs, AI, budgets, and D1 contracts unchanged. Expand immutable Editor v64 baseline parity to prove the third exact transformation after earlier RSS and scheduled translation extractions.

**Tech Stack:** Cloudflare Workers (ESM), Node 22 `node:test`, GitHub Actions Editor-source mandatory suite, coordinated 3-bundle Wrangler immutable release.

**Source:** `docs/REGIONAL_WATCH_MASTER_TODO.md` ARCH-03 and `docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md`.

## Rules
- No new external services, API calls, crons, database migration, AI prompts, expense, backups, or speculative language translations.
- Preserve the semantics of `lang=he` **as actually implemented** (original English source, not invented Hebrew translations), `lang=ru` validated RU only with original fallback, `translation_verified=false`, `translation_status` and original text fields.
- Maintain only official `https://t.me/idfofficial/<digits>` URLs, source latest-row query, duplicate IDs, bounded 1..10 limit, D1 read-only queries, output cache/CORS headers, and numbers guard.
- Do not conflate source API integration proof with independent visual QA.

## TDD / release
- [ ] Add `tests/architecture/editor-official-posts-api.test.mjs` proving invalid lang/limit 400 without DB reads, official URL filtering/duplicates/latest chronological selection, RU accepted number-preserving translation, invalid translation rejected with explicit `needs_review`, HE requested original fallback, and main entrypoint URL routing.
- [ ] Add test to mandatory `editor-source` CI; create draft PR and verify RED from absent module.
- [ ] Create module with original helpers unchanged, only export the handler. Import in `index.js`; remove source helper block.
- [ ] Extend immutable `tests/architecture/editor-modules.test.mjs` exact source equivalence for new module and remaining main index; preserve previous RSS/scheduled parity checks, module import/syntax checks.
- [ ] Verify GREEN isolated and full GitHub Actions checks, integrated data checks and immutable 3-bundle dry run; inspect diff for scope.
- [ ] Merge only after verified GREEN. Confirm coordinated main release and independent read-only Cloudflare Pages + Workers + cron/bindings.
- [ ] Update sole master TODO and ARCH-03 audit: close API official posts subtask, **ARCH-03 and DEV-05 stay partial**, docs-only PR (no extra runtime deploy).
