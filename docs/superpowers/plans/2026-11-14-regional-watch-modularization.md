# Regional Watch modularization implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development task-by-task. Preserve verification evidence and commit each independently tested slice.

**Goal:** Convert the existing `regional-osint-feeds` repo into a reproducible Cloudflare monorepo with modular React and Worker source.

**Architecture:** Single source repository, independent frontend, editor and monitor workspaces. Existing GitHub collectors remain in place. Deploy from pinned, tested source builds, not copied deployment artifacts.

**Tech stack:** React, ES modules, modern frontend bundler, JavaScript, Cloudflare Pages/Workers, D1, Node tests and GitHub Actions.

**Spec:** `docs/architecture/regional-watch-monorepo-spec-2026-11-14.md`

## Global constraints
No production writes during migration; identical RU/HE component tree; preserve current APIs, service bindings, cron, D1, links, rendered UI and external collectors. No secret values in Git. Existing main branch and CI unaffected until validated.

## Review focus
1. Deep-link routes with parameters survive the rebuild.
2. Translation fallback is marked per field, never invented as localized.
3. API malformed-200, 503, retry and last-good display states are not lost.
4. Source counts and independent-source provenance are not conflated.
5. Monitor expired markets, editor event grouping and daily AI budgets retain current behavior.

### Task 1 — Freeze source and test reproducibility
**Files:** `frontend/src/legacy/`, `backend/editor/src/legacy/`, `backend/monitor/src/legacy/`, `docs/architecture/source-provenance.json`, `scripts/verify-production-baseline.mjs`
- [ ] Copy only verified Cloudflare production source/HTML/JS/CSS to a *clearly named immutable baseline*; tag unavailable _worker.js as unavailable, not reconstructed.
- [ ] Add Node baseline integrity checks for exact bytes/hash and file counts. Verify RED for missing inputs and GREEN after source import.
- [ ] Commit with deployed versions, checks, missing components and next step.

### Task 2 — Establish frontend build and isolated components
**Files:** `frontend/package.json`, `frontend/vite.config.js`, `frontend/src/app/`, `frontend/src/components/`, `frontend/src/pages/`, `frontend/src/hooks/`, `frontend/src/api/`, `frontend/src/i18n/`
- [ ] Add route/locale/source-count/async-state behavior tests that fail on unimplemented modules.
- [ ] Extract shared runtime helpers, headers, feed and cards; keep both locales in a single tree; split each component into its own file, scoped CSS and test.
- [ ] Extract Home, Events, DataRoom and Analysts pages, preserving exact routes and CSS.
- [ ] Build into standalone static files and API proxy/Pages Functions; verify output has no previous-deployment dependency.
- [ ] Run unit, contract, route, layout and keyboard tests; commit after a verified green suite.

### Task 3 — Modularize Editor Worker
**Files:** `backend/editor/src/{news,analysts,translations,editorial,routes}/`, `backend/editor/wrangler.jsonc`, `tests/backend/`
- [ ] Write failing tests for existing API schemas/edge cases and field-localization flags.
- [ ] Move exact v64 production sources by responsibility, update relative import paths, with an entry point and unchanged service bindings and cron.
- [ ] Validate Worker bundle and public API parity on an isolated preview; commit with results.

### Task 4 — Modularize Monitor Worker
**Files:** `backend/monitor/src/{collectors,observations,markets,routes}/`, `backend/monitor/wrangler.jsonc`
- [ ] Write source-specific collector/scheduling/market lifecycle tests against frozen production fixtures.
- [ ] Split the 104 KB single-file implementation into focused ES modules; retain existing bindings and 1-minute cron.
- [ ] Bundle and compare outputs, including invalid/expired markets and observation persistence; commit.

### Task 5 — Shared contracts and CI
**Files:** `shared/contracts/`, `tests/integration/`, `.github/workflows/regional-watch-app-check.yml`
- [ ] Freeze documented news/stories/editorial/monitor/data DTOs and test both locales against the same contracts.
- [ ] Add scoped GitHub checks for all three workspaces; don't overwrite collector workflows.
- [ ] Verify CI on the branch, record successful run and commit.

### Task 6 — Preview, release and rollback
**Files:** `.github/workflows/regional-watch-app-deploy.yml`, `docs/architecture/release-runbook.md`
- [ ] Set up deploy workflow gated behind green checks; no automatic production switch until preview acceptance.
- [ ] Verify entire rebuilt site and API in a production-like preview, RU/HE, desktop/mobile and failure scenarios.
- [ ] Promote only from the exact Git commit with rollback instructions; verify old-deployment dependency removed.
- [ ] Record deployment IDs, regression results and remaining bugs.

## Execution ledger
- Baseline branch created from `309acf46b1012378d759256bd017536500ffe20f`; no production writes authorized.
