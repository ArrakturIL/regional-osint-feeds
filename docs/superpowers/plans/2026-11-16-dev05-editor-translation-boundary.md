# DEV-05 / ARCH-03 — Editor scheduled translation boundary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and test-driven-development. Each checkbox is a verifiable step.

**Goal:** Isolate scheduled RU news and official IDF translation orchestration from the active Editor entrypoint, without changing free-tier AI budgets or publication semantics.

**Architecture:** Extract the two unchanged functions `translateTitles(env,now)` and `translateIDF(env,now)` from `backend/editor/src/index.js` into a focused `backend/editor/src/translations/scheduled.mjs`, importing existing `validateCandidate` from `./news-mirror.mjs`. The original `scan` calls the imported exports; the existing v64 baseline parity test proves a byte-identical split of the original functions and unchanged remaining entrypoint.

**Tech Stack:** Cloudflare Worker ESM, Node 22 built-in test runner, GitHub Actions coordinated release, D1 mock contract tests.

**Spec:** `docs/REGIONAL_WATCH_MASTER_TODO.md` ARCH-03; `docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md`.

## Constraints

- No new dependencies, services, schema changes, schedules or paid AI.
- No increased token/neurons/daily budget, changes to source guard, candidate validation or Hebrew/Russian DTO.
- Retain conservative per-day news translation caps (20 batches/2500 estimated neurons) and IDF caps (12/1500) with existing pre-charge and error log behavior.
- Preserve absolute source URLs and exact Cloudflare AI model/prompt strings.
- Source baseline test must **not** be weakened to 'some code exists'.

## Steps

- [ ] TDD RED: add `tests/architecture/editor-scheduled-translations.test.mjs` for both exported functions and their D1/AI budget behavior, including no-AI on caps and malformed/error cases. Wire to mandatory editor-source suite, observe module-not-found failure.
- [ ] TDD GREEN: copy original functions byte-identically into `translations/scheduled.mjs`, export them, add `validateCandidate` import. Remove source copies from index and import new exports.
- [ ] Enforce lossless transformation in `tests/architecture/editor-modules.test.mjs` by removing exact spans from v64 expected source and checking new module against exact extracted spans, plus validating new relative imports/parsing.
- [ ] Run mandatory app CI, integrated offline checks and immutable 3-component dry-run; review only intended files.
- [ ] Merge only after green (previous user instruction: proceed through todo); coordinated main release and independent Cloudflare Pages/Editor/Monitor bindings/cron check.
- [ ] Write production receipt + remaining ARCH-03 boundaries to TODO and audit; do **not** close whole ARCH-03.
