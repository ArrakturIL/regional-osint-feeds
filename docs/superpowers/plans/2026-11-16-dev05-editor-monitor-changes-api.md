# DEV-05 / ARCH-03 — Editor monitor changes read-only API boundary (2026-11-16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and verification-before-completion. Follow RED→GREEN before release.

**Goal:** Separate read-only `/api/changes` monitor comparison logic from the Editor entrypoint, preserving RU/HE DTO and the important distinction between a changed source record and independently verified events.

**Architecture:** Extract unchanged `buildDigest(rows,eventRows)` and `readMonitorChanges(request,env)` from active `backend/editor/src/index.js` into `backend/editor/src/api/monitor-changes.mjs`. Export only `readMonitorChanges` (and `buildDigest` for isolated pure tests), import in the existing Editor fetch router, leave rest intact. Expand Editor v64 frozen source parity to prove fourth byte-identical extraction from the original legacy baseline, without relaxing any of the previous three source parity checks.

**Tech Stack:** Cloudflare Worker ESM, Node 22 built-in `node:test`, read-only D1 fixtures, GitHub Actions integrated + coordinated release.

**Source:** `docs/REGIONAL_WATCH_MASTER_TODO.md` ARCH-03 and `docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md`.

## Constraints
- No extra D1 queries, CPU assumptions, feed/AI code changes, database migrations, service fees, new cron, backup, or altered source-reporting claims.
- Keep status vocabulary `pending`/`error`/`ready`/`insufficient_comparison`; `requested_language=ru|he`; bilingual `title,title_he,description,description_he`, source comparable/updates, source event window, outcome-change ordering and `no-store` headers.
- Never claim `journal_updated` itself proves claims. Preserve existing precise text.

## Steps
- [ ] Write direct `readMonitorChanges` and pure `buildDigest` tests for pending, malformed times, invalid method/language, source maxima counts, event window, outcome change, insufficient comparison, D1 failures, no DB writes, live entrypoint route.
- [ ] Wire new test to mandatory Editor CI, create draft PR and verify RED missing module.
- [ ] Copy unchanged functions into `api/monitor-changes.mjs` with only `export` declarations, replace in `index.js` with import; verify exact history-preserving v64-parity reconstruction of all four extracted modules.
- [ ] Confirm GREEN tests, whole app/integrated 3-component immutable build, peer review diff, coordinated main deploy and independent read-only Cloudflare postcheck.
- [ ] Update master TODO and audit after release, leave ARCH-03/DEV-05 partially open and UI QA out of scope.
