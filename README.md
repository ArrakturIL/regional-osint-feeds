# REGIONAL WATCH

**Open-source intelligence and public-source monitoring for Israel, the Middle East and related international developments.**

[Live website](https://regional-watch.pages.dev) · [Current project status and priorities](docs/REGIONAL_WATCH_MASTER_TODO.md) · [Latest backend architecture audit](docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md)

REGIONAL WATCH is a non-commercial, evolving OSINT project. It brings together public news, official statements, analysts' publications, and other open-source observations. The aim is **timely, source-attributed, multilingual information**, not to present every report or model-generated summary as an independently verified fact.

## What the project covers

- **News and event dossiers:** articles and reports, grouped with source references and distinctions between reported claims and corroboration.
- **Analysts:** publication discovery, ingestion, processing and reader-facing listings.
- **Public OSINT data:** official-source feeds and selected aviation, maritime, satellite, environmental and other observational feeds, subject to each provider's coverage and API limits.
- **Russian and Hebrew:** public pages and translated content where available; missing, pending and unreliable translations must remain distinguishable from originals.
- **Source quality and timeliness:** timestamps, source attribution, availability, freshness, processing status and fallbacks matter as much as the content itself.

The project is actively developed. For what is **actually deployed**, what is under development, and what is deferred, refer to the [canonical master TODO](docs/REGIONAL_WATCH_MASTER_TODO.md). A present code path or passing CI check alone does not establish production readiness.

## Current architecture

The repository is a **modular monorepo**, not just a collection of three GitHub-hosted JSON feeds.

| Area | Main paths | Responsibility |
| --- | --- | --- |
| Frontend | `frontend/src/`, `frontend/scripts/` | React-based pages, RU/HE interface, components, build tools and frontend tests |
| Pages API | `backend/pages/src/` | Cloudflare Pages runtime, API routing/proxying and public response contracts |
| Editor Worker | `backend/editor/src/` | News/analyst ingestion, editorial processing, translation and public content APIs |
| Monitor Worker | `backend/monitor/src/` | OSINT collectors, source monitoring, schedules, provider adapters and status APIs |
| Shared code | `shared/` | Shared contracts and utilities |
| Source collectors | `scripts/`, `.github/workflows/` | Scheduled Python/JavaScript collectors, validation, shadow synchronization and tests |
| Storage | `storage/`, `data/` | D1/Neon schemas, collector snapshots and compatibility data |
| Release and QA | `scripts/release/`, `tests/architecture/`, `docs/` | Coordinated releases, verification, migration gates and technical documentation |

The production release process bundles **three separate entry points**:
`backend/pages/src/index.js`, `backend/editor/src/index.js`, and `backend/monitor/src/index.js`.

Older code under `worker/` and historical checkpoints is retained for compatibility, comparisons and recovery. **Do not assume those older files are the active production entry points.**

### Data flow (simplified)

```text
Public RSS / APIs / analyst posts / OSINT providers
             |
    GitHub Actions collectors + Worker collectors
             |
    Validation, normalization, source/status timestamps
             |
    Neon snapshot storage (where enabled) + Cloudflare D1
             |
    Monitor / Editor Workers (including existing Cloudflare AI)
             |
    Pages API --> Russian / Hebrew website
```

This diagram is conceptual: individual sources have different ingestion, caching, fallback and rollout paths. Neon/D1 migration and source cutovers are **source-gated**, not a single all-or-nothing switch. Check the [master TODO](docs/REGIONAL_WATCH_MASTER_TODO.md) and the relevant source code before changing a data path.

## Releases, tests and safety

- The main application CI is [`regional-watch-app-check.yml`](.github/workflows/regional-watch-app-check.yml). It tests the modular application and builds a coordinated release artifact.
- Approved code changes in `main` can trigger the coordinated Cloudflare **Pages + Editor + Monitor** deployment process, with preflight checks, receipts and rollback gates. Data-only collector commits do not automatically redeploy the app.
- Production D1 schema changes are **not** silently applied as part of a code deployment.
- Preview and production have historically shared sensitive resource bindings. **Never run write-based QA against preview or production without a verified isolated environment.**
- Keep credentials in the configured secret stores, not in committed source, README examples, logs or client-side JavaScript.
- Prefer free-tier/OSS solutions and measure actual runtime quotas rather than assuming an npm package or API is free to operate.

Examples of focused local checks (Node.js required):

```bash
npm test --prefix frontend
node --test tests/architecture/pages-runtime.test.mjs
node --test tests/architecture/editor-modules.test.mjs
```

For the full CI suite and deployment contract, inspect the workflow and [coordinated release runbook](docs/architecture/coordinated-release-runbook.md). The repository's automated checks do **not** replace independent QA of real content, translation meaning, RU/HE pages and the live site.

## Read this before contributing or reviewing

**For a new chat / agent:** first read [AGENTS.md](AGENTS.md) and the [preferred concise reporting style, with copyable templates](docs/REGIONAL_WATCH_RESPONSE_STYLE.md). The reporting preference survives chat context resets and is subordinate to the current [MASTER TODO](docs/REGIONAL_WATCH_MASTER_TODO.md).


1. **[Master TODO and current decisions](docs/REGIONAL_WATCH_MASTER_TODO.md)** — authoritative work queue, completed milestones, open risks, production status and user decisions.
2. **[DEV-05 backend architecture audit](docs/research/DEV_05_BACKEND_ARCHITECTURE_AUDIT_2026-11-16.md)** — current module boundaries, identified issues and recommended verification.
3. **[Coordinated release runbook](docs/architecture/coordinated-release-runbook.md)** — deployment, bindings, manifests, rollback and safety requirements.
4. **[DEV-04 localization audit](docs/research/DEV_04_NEWS_LOCALIZATION_AUDIT_2026-11-16.md)** — completed technical localization work and its measurement limits.
5. **[OSS library trial results](docs/research/DEV_OSS_02_TRIAL_RESULTS_2026-11-15.md)** — candidate parser/processing libraries, offline trial results and adoption gates.

**Current working order:** finish and verify the **backend** before taking on deferred **frontend** work. QA should identify problems and provide source-backed recommendations; historical QA reports and old branch checkpoints are evidence, not automatic proof a bug still exists.

## Interpretation and limitations

Public feeds can be late, incomplete, contradictory or subject to different terms of use. A missing ADS-B snapshot is **not** evidence of empty airspace; imagery differences are **not** on their own evidence of an attack; a reported claim is **not** an independently confirmed event. Preserve provenance, timestamps and uncertainty when quoting or reusing this project's output.

This README is the repository's orientation page, not a claim that every documented feature is already enabled.
