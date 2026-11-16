# DEV-05 / ARCH-03 — editorial AI comment boundary

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development and verification-before-completion. Execute one isolated block; verify before release.

**Goal:** Extract the existing editorial AI comment generation and daily budget accounting from the active Editor `index.js` without changing output, safety restrictions, rate or cost.

**Architecture:** Move `writeComment(env,row)` and the entire commentary stage inside `scan(env)` into `backend/editor/src/editorial/ai-comments.mjs`. Export `writeComment` and `generateComments(env,now)`; return exactly `{commented,failures}`. Keep every original AI prompt/model, D1 SQL, threshold, `spent` reconciliation, error logging and `shouldSuppressComment` behavior. `scan` imports and calls the module after translation and before IDF translation. Extend the frozen v64 parity test to prove only the moving boundary changed.

**Spec:** `docs/REGIONAL_WATCH_MASTER_TODO.md` ARCH-03, `docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md`.

## Constraints
- No D1 schema changes, new provider/model, new schedule, paid AI, production data mutation by tests or new source calls.
- Preserve editorial daily caps 28 generations / 3500 estimated neurons, 2 pending rows, original 110 estimate, error-state writes and 5-minute Editor cron.
- Preserve the existing restrictive policy around human suffering and military action; do not loosen it.
- Do not claim translation quality or full end-user QA from code parity.
- Do not change archived/legacy Worker or postponed backups.

## Single isolated task
- [x] **RED** add `tests/architecture/editor-ai-comments.test.mjs`: no AI when budget exhausted; sensitive row marks `EDITORIAL_SKIP`; accepted JSON writes exact existing comment model and neuron cost; malformed response logs `last_ai_error` and charges without publishing; 2 pending-row bound and budget cutoff.
- [x] Add this test to mandatory `editor-source` in `.github/workflows/regional-watch-app-check.yml`; open draft PR and observe failure because module is absent.
- [x] **GREEN** copy original `writeComment` verbatim and commentary budget block into `editorial/ai-comments.mjs`, wrapping the block as `generateComments`; replace corresponding source spans in `index.js` with import and call.
- [x] Extend `tests/architecture/editor-modules.test.mjs` to assert extracted blocks are byte-equivalent to frozen v64, including SQL, budget and prompt; ensure remaining entrypoint equivalence and relative imports.
- [x] Run GitHub Actions mandatory app CI/immutable release checks on PR; compare only intended files; no merge if failed.
- [x] After green, merge to main and verify coordinated release + independent Pages/Editor/Monitor bindings/cron.
- [x] Update `docs/REGIONAL_WATCH_MASTER_TODO.md` and DEV-05 audit with evidence, retain ARCH-03 as partial.

## Review focus
- Sensitive military/casualty source text must not be sent to AI.
- The budget cap must prevent source queries and AI calls.
- Malformed AI JSON must not become a published comment.
- Error and skip attempts consume the same existing estimated budget.
- Editor scan order, IDF translation and final summary fields remain unchanged.

**Completion receipt:** PR #59 merged as `44d55ef862f7430d0fe3f4a64095b196333548af`; RED #43784760543, app GREEN #43784955476, integrated GREEN #43784955428, production coordinated release #43785057089 SUCCESS. Independent Cloudflare Pages/Editor/Monitor and cron/bindings postcheck recorded in master TODO section 10. This completes only the editorial AI boundary, not ARCH-03/DEV-05.
