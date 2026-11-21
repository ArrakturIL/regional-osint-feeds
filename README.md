# REGIONAL WATCH

**Open-source intelligence and public-source monitoring for Israel, the Middle East and related international developments.**

[Live website](https://regional-watch.pages.dev) · [Project status](docs/STATUS.md) · [Instructions for AI agents](AGENTS.md)

A non-commercial, evolving OSINT project. It brings together public news, official statements, analysts' publications and open-source observations (aviation, maritime, satellite, conflict data). The goal is **timely, source-attributed, multilingual information** in Russian and Hebrew, not to present every report or model-generated summary as an independently verified fact.

## Architecture

| Area           | Path                             | Role                                                                                           |
| -------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Frontend       | `frontend/`                      | React RU/HE pages, built and served by Cloudflare Pages                                        |
| Pages API      | `backend/pages/`                 | Pages runtime, public API routing, owner panel `/ops`                                          |
| Editor Worker  | `backend/editor/`                | News and analyst ingestion, RU/HE translation pipeline with quality gates, public content APIs |
| Monitor Worker | `backend/monitor/`               | OSINT source adapters, source status, collector scheduling                                     |
| Collectors     | `scripts/`, `.github/workflows/` | Python collectors in GitHub Actions → Neon → private Cloudflare D1                             |
| Storage        | `storage/`, `data/`, `config/`   | D1/Neon schemas, fallback JSON snapshots, source registries and flags                          |
| Release        | `scripts/release/`, `deploy/`    | Coordinated Pages + Editor + Monitor release with preflight and rollback                       |

```text
Public RSS / APIs / analysts / OSINT providers
        │
GitHub Actions collectors ─→ Neon ─→ Cloudflare D1 (private read copy)
        │                                   │
Monitor Worker (adapters, status)    Editor Worker (news, translation, analysts)
                      └──────────┬──────────┘
                         Pages API ─→ RU / HE website
```

Details: [release](docs/architecture/release.md) · [collectors](docs/architecture/collectors.md) · [translations](docs/architecture/translations.md) · [GPT automations](docs/gpt-automations.md).

## Tests

```bash
node frontend/scripts/build-site.mjs          # build before tests
node --test tests/architecture/*.test.mjs frontend/tests/*.test.mjs backend/*/tests/*.test.mjs
python -m unittest discover -s scripts -p 'test_*.py'
```

The full CI and release pipeline is `.github/workflows/regional-watch-app-check.yml`. Automated checks do **not** replace review of real content, translation meaning and the live site.

## Safety

- Production D1 schema changes are never applied by a code deployment.
- Preview and production share D1 and Worker bindings: no write-based testing against preview.
- Secrets live only in GitHub Actions and Cloudflare, never in source, logs or client code.
- Free tiers only; measure real quotas before adopting a provider.

## Interpretation and limitations

Public feeds can be late, incomplete, contradictory or subject to terms of use. A missing ADS-B snapshot is **not** evidence of empty airspace; imagery differences are **not** on their own evidence of an attack; a reported claim is **not** an independently confirmed event. Preserve provenance, timestamps and uncertainty when quoting or reusing this project's output.
