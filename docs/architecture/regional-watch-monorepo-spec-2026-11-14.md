# Regional Watch — modular source migration specification (2026-11-14)

## Goal
Make this **existing public repository** the single source of editable frontend and backend code while retaining Cloudflare Pages + Editor Worker + Monitor Worker + two existing D1 databases as production infrastructure. Do not change website content, layout or operating costs as part of the migration.

## Why
Production Pages currently serves an embedded 82,241-character app.js, and some paths proxy to an earlier Pages deployment. Production Monitor is a single ~104 KB Worker. Patching deployment artifacts has made changes fragile and difficult to reproduce.

## Deployment snapshot (frozen starting point, verify again before release)
- Pages: regional-watch / `0f39f36e-9299-46fd-9bdd-be112ece95f6`
- Editor: `ee79d24d-45d3-4170-85d7-1de7f7c74a7c`
- Monitor: `d68c6b6a-137d-4f8b-af41-a1849bdd52c6`
- Core D1: `c052acf3-b821-444a-92e4-ffd472a131f0`
- News D1: `d9ba2c51-d551-4615-bbe2-37e76e2d668a`
- Existing repository's GitHub Actions and collectors are kept intact until independently migrated.

## Proposed source boundaries
- `frontend/src/app/`: one app tree, routing and providers.
- `frontend/src/pages/{Home,Events,DataRoom,Analysts}/`: page composition, not duplicated by locale.
- `frontend/src/components/<Name>/`: individual React component, scoped CSS, tests.
- `frontend/src/api/`, `frontend/src/hooks/`, `frontend/src/i18n/{ru,he}.js`: data access, asynchronous state, interface messages / RTL. Article translation remains in backend/D1.
- `backend/editor/src/{news,analysts,translations,editorial,routes}/`: independently testable responsibilities, preserving Worker bindings.
- `backend/monitor/src/{collectors,observations,markets,routes}/`: separate source-specific collection and persistence.
- `shared/contracts/`: runtime DTO validation and contract fixtures for two locales.
- `database/migrations/`: checked-in D1 migrations, no destructive migration as part of source move.
- `tests/`: unit, integration, API compatibility and screenshot/e2e tests.

## Non-negotiable invariants
1. Do not touch production Pages/Workers/D1 in this branch until a reproducible build, API-contract regression and RU/HE visual equivalence are demonstrated.
2. Only one set of React components; `ru` and `he` may change strings, language tags and direction, not page topology. Header/logo remain in the same physical location.
3. Preserve /, /he, /events, /he/events, /data, /he/data, /analysts, /he/analysts, query parameters, deep links, story IDs, ordering, pagination, error and loading states.
4. Preserve original source URLs, timestamps, provenance, translation status, safety filters, cron schedules, all Worker bindings/secrets and Cloudflare D1 identifiers; **never** commit secret values.
5. Preserve 13 existing GitHub workflows and collector behavior during initial reorganization; no force pushes, no changes to main without separate review.
6. The final Pages build must be self-contained. No requests proxied to an older Pages deployment; no `APP`/`CSS` megastrings as authored source.
7. Browser QA can follow safe preview deployments, but focused tests and comparison checks must pass before any promotion.

## Release / rollback
Branch `refactor/regional-watch-modular-20261114` is non-production. Commit only reviewed, testable slices with evidence in the message. The old Pages deployment and both Workers remain rollback points. Promote only after comparison of endpoints and both locales against the frozen baseline.
