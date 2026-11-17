# ARCH-01 — итоговая карта активной архитектуры REGIONAL WATCH

**Дата:** 17 ноября 2026. **Статус ARCH-01: техническая приёмка карты действующей архитектуры завершена.** Не путать со сквозным пользовательским или живым провайдерским QA.

**Проверенный source HEAD PR:** `c4edcd467ea92d04f0041cf8dc51279c8e9840dd`, [PR #84](https://github.com/ArrakturIL/regional-osint-feeds/pull/84), [full CI #44005271382](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/44005271382) completed **SUCCESS**. `modern-bundles` делает `node --test tests/architecture/active-architecture-audit.test.mjs` (5/5) и `node scripts/audit_active_architecture.mjs --summary`; весь immutable Pages+Editor+Monitor bundle прошёл сборку. Cloudflare production не выпускался: ветка осталась unmerged, `Publish` jobs skipped.

## 1. Полный статический граф действующих модулей

**84 исходных модуля, 218 локальных импортных связей, 0 пробелов** в исследованном графе:

| Production owner | Source entrypoint | Активных модулей |
| --- | --- | ---: |
| Pages | `backend/pages/src/index.js` | **6** |
| Editor | `backend/editor/src/index.js` | **34** |
| Monitor | `backend/monitor/src/index.js` | **44** |
| **Всего** | **3 immutable release parts** | **84** |

Проверено автоматически: все 84 `backend/*/src` модуля достижимы из своего release entrypoint; нулевой список `unreachableModules`, `unresolvedImports`, `crossWorkerSourceImports`, `dynamicImportReview` в статическом исходном коде. **Оговорка:** parser находит исходные относительные импорты и dynamic `import()`, но не доказывает поведение вычисляемых путей через `eval`, сборку на внешнем хосте или секретные runtime ветки. Таких источников в текущем static report не найдено.

## 2. Route + storage/AI/service ownership

```text
Browser RU/HE
    │
    ▼
Cloudflare Pages (backend/pages/src/index.js)
    ├─ Static /, /he, /events, /he/events, /data, /analysts ...
    ├─ /api/overview, /api/data → private regional-osint D1 (Pages DB)
    ├─ /api/news, /api/events, /api/stories, /api/editorial-notes,
    │  /api/changes, /api/analysts, /api/analyst-posts,
    │  /api/official-posts → EDITOR service
    │       ├─ NEWS_DB (news + localization data)
    │       ├─ CORE_DB (source and analyst records)
    │       └─ Workers AI (existing editor budget)
    └─ /api/rw/aviation, /api/rw/satellite and localized counterparts
           → MONITOR service → DB (regional-osint)
                   ├─ scheduled source readers
                   ├─ providers/snapshot health/quotas
                   └─ private /summary (Bearer; not routed to public Pages)
```

`backend/pages/src/routes.js` — канонический source route ownership, tested `ownership()` against declared Editor/Monitor/Pages paths. Private Editor `/api/translation-queue` and Monitor `/summary` not exposed by Pages routing. Подтверждено source/tests, не открытым live-penetration test.

`deploy/release-contract.json` ↔ `deploy/wrangler.{editor,monitor}.production.json`: именованные service, D1, AI привязки, identity БД, Worker source bundle/cron сверены, **0 расхождений**. Editor cron `*/5`, Monitor `*/1`, ничего не изменялось. Runtime binding mismatches in active sources — **0**.

## 3. Восьмиступенчатый ownership GitHub collectors → Neon → D1

**8 разных pipeline owners**, каждый через свой GitHub Actions workflow: `analysts`, `centcom`, `copernicus`, `gdelt`, `marad`, `news_translation`, `satellite`, `unosat`. Источники перечислены в `scripts/neon_mirror.py:SOURCE_FILES`, и каждый кодовый workflow содержит:

1. Source-scoped `collector_rollout_flags --source X` и gated режим Neon primary.
2. `publish_neon_mirror --source X --mode required` (стандартизованный snapshot, SHA/checked_at).
3. `neon_to_d1 --source X --init-table` (private D1 upsert/checksum readback).
4. Условие «Neon+D1 success» и отдельный failure guard; существующие GitHub fallback work-arounds не отключались.
5. Отдельный `scripts/sync_neon_primary_to_d1.py` reconciliation читает `read_stored_snapshot` и `_validate_d1_row` из проверенных Neon/D1 adapters; буквальных `data_sha256` в самом orchestrator нет, поскольку его проверка делегирована адаптеру.

**0 статических workflow gap и 0 integrity gap** в контрактных связях. Ридер Monitor `mirrors/collector-cache.js` разрешает восемь источников из D1 с проверкой digest/status; ридер Editor `mirrors/collector-cache.mjs` читает только `analysts/news_translation` через свой CORE_DB alias; GitHub fallback остаётся оговорённым read-only резервом.

Это подтверждает структуру, **не** означает, что все 8 источников сейчас свежие: реальную независимую приёмку GDELT/backlog/Neon→D1 оставляем ARCH-05 18 ноября, переводов/квот — ARCH-04 20 ноября. Статус live provider error/cooldown не подменяется зелёным CI.

## 4. Контракт и граница закрытия

**ARCH-01 можно пометить DONE как архитектурную инвентаризацию и статическую проверку границ**: все live source modules, import edges, deploy contract, route ownership и восемь source→storage pipelines документированы, недостающих зависимостей нет, обязательный CI gate добавлен. На ошибочном первом тесте reconciliation grep не находил прямых строк SHA в orchestrator; исправлено условие на проверку реально импортированных hash-verified adapters. **Production код при этом не менялся**.

**Не входит в статус DONE:** фактическая пропускная способность переводчиков, provider HTTP/модельные расходы, data freshness и GDELT catch-up (ARCH-04/05); UX/browser QA (после BACKEND); final integration/release acceptance (ARCH-03/07). Эти задачи остаются самостоятельными и не могут быть закрыты только по ARCH-01 graph.
