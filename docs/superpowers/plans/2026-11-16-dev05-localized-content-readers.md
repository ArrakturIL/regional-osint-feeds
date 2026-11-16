# DEV-05 ARCH-03 — Public localized news, editorial and story readers

**Owner scope:** BACKEND only, frontend explicitly deferred. Historical B-01 corrections also deferred.

**Goal:** Losslessly separate three remaining public content readers and associated helpers from `backend/editor/src/localization/localization.mjs` into independent API modules; preserve output, SQL, pagination, origins, translation guards, public exported symbols and exact byte parity against prior version. No UX, no new filtering/sorting behavior; C-01 is an independent subsequent backend issue.

**Baseline:** `main` code SHA `a0e8f285b0beaf8a22cdac822bee8f392659fac5`, facade Git blob `2c6b416583a1df60c4e6b982cb471da9e95ff075`; prior parity SHA `4e7346b0463edd2a71a8998b121afb604609ae6f`, original v64 `5b907775613eec9c1a986eddcd06cb74fd7c9880`.

**Boundaries:** `localization/news-reader.mjs` owns original `localizeNewsRow` and `/api/news` branch; `localization/editorial-reader.mjs` owns `/api/editorial-notes`; `localization/stories-reader.mjs` owns `storyProvenance` and `/api/stories`. `localization/localization.mjs` retains common HTTP GET/OPTIONS, locale, limit/offset checks, `/api/languages`, analyst delegation and exports/re-exports `localizeNewsRow`, `storyProvenance`, `fingerprint`, `fetchLocalized`, default `{fetch,scheduled}`. `read-core.mjs`, `scheduled.mjs`, `analyst-api.mjs` untouched.

## Execution (TDD)
- [ ] Add direct + public facade tests for news RU/HE ready_only/cached/fallback, editorial field status, story provenance/invalid JSON, HTTP contract, and Git blob reconstruction check. Register mandatory Editor CI; verify expected RED on missing reader module.
- [ ] Extract unchanged original bodies into three independent modules and replace each branch with one-line delegation; no cycles, identical SQL/response and source parity. Keep timestamp/priority ordering unchanged in this architecture-only PR.
- [ ] Reconstruct exact `2c6b416...` pre-split localization facade from new modules in tests, wire earlier `reconstructReaderFacade` to that source to preserve prior two Git blob hash checks.
- [ ] Verify mandatory Editor suite, translation fidelity suites, integrated architecture, immutable Pages/Editor/Monitor build and isolated diff; GREEN before merge.
- [ ] Squash merged PR into main, coordinated production deploy, independently inspect read-only Pages/Editor/Monitor crons/bindings, receipt, version and source SHA.
- [ ] Update MASTER TODO and DEV-05 audit, this plan. Next backend scope: `analysts/editor.mjs` or ARCH-04 as per ordered queue; frontend deferred.

**Safety gate:** Strictly no D1 writes, schema, cron/AI budget, source URLs, published dates, priority sorting, new external services, UI/CSS or B-01 historical record corrections in this scope.
