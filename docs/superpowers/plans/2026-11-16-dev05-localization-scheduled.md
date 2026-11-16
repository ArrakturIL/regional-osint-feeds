# DEV-05 / ARCH-03 — Isolate Editor Hebrew scheduled localization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans, test-driven-development and verification-before-completion. One releaseable block.

**Goal:** Split the large Editor localization module along reader vs scheduled AI translation responsibility without changing observable API, budgets, model, guards or execution cadence.

**Current:** `backend/editor/src/localization/localization.mjs` serves all RU/HE locale routes and also contains Hebrew scheduler, retries, D1 budget+attempt accounting, model requests and candidate selection. `index.js` calls `localization.scheduled` on existing 5-minute cron.

**Target:** `localization/localization.mjs` remains the public facade for `fetchLocalized`, `localizeNewsRow`, `storyProvenance`, existing `fingerprint` export and default `{fetch,scheduled}`. Move `val`, `sourceText`, `fingerprint` to `localization/shared.mjs` (re-export existing fingerprint from facade). Move original `const HE_MODEL` through `translateScheduled` verbatim into `localization/scheduled.mjs`, with imports from shared and factual guard. No cyclic imports. Keep behavior, SQL, prompts, thresholds, source ordering and quota unchanged.

## Task 1 — TDD and frozen source parity
- [ ] Add `tests/architecture/editor-localization-scheduled.test.mjs` importing `scheduled.mjs` and `shared.mjs`; test daily budget 96/4000, cycle source selection, AI response rejection/attempt budget accounting and no paid calls for exhausted budget.
- [ ] Add mandatory Editor CI invocation; observe RED missing module in draft PR.
- [ ] Extract shared and scheduled modules losslessly; preserve public exports/default facade and all existing reader route logic.
- [ ] Verify exact `localization.mjs` original Git blob SHA `5b907775613eec9c1a986eddcd06cb74fd7c9880` from deterministic reconstruction of extracted text in source-parity test; all extracted source lines preserved except required `export` prefixes and imports.
- [ ] Confirm mandatory Editor tests, translation/provenance tests, integrated architecture CI and immutable three-component bundle, review whole diff and avoid new costs/services.
- [ ] Merge on green; release all three components with coordinated safe rollback and independently verify live Cloudflare Pages + Editor + Monitor identities, bindings and cron.
- [ ] Update MASTER TODO and DEV-05 audit with RED/GREEN release receipts; retain ARCH-03 remaining analyst-editor work, ARCH-04 and other DEV-05 items.

**Risk matrix:** maintain Hebrew source hashes and sourceText/fingerprint bit-for-bit; verify factualTranslationIssue (incl. naval mines, actor, conditionality); keep per-day 96 attempts/4000 neurons, max 4 candidates per scheduled run, one retry per item/day, fixed GLM-4.7-Flash prompt, state/error journaling. No drift in API query/response behavior or Hebrew/Russian display status.
