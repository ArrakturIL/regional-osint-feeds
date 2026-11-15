# REGIONAL WATCH — DEV-02: аудит release-контрактов и Preview (15.11.2026)

**Статус:** кодовая защита реализована в **необъединённом** [draft PR #37](https://github.com/ArrakturIL/regional-osint-feeds/pull/37) с CI; **не выдана за production-защиту**. Main/production и Cloudflare конфигурация **не изменены** этим блоком. Следующий DEV-03 не начинался.

## Проверено на живом аккаунте Cloudflare (read-only)

Pages `regional-watch`:
- production branch = `main`.
- Production: `EDITOR→regional-watch-editor` (production), `MONITOR→regional-osint-monitor` (production), `DB` (core D1) и `NEWS_DB` (news D1).
- **Preview: те же Editor/Monitor production services и те же core/news D1**. Это подтверждённая проблема изоляции (возможность тестовой версии затронуть рабочие ресурсы); сама по себе не является доказательством изменения данных.
- Canonical production deployment `f37b01e3-6513-4762-9afa-555041ebb926` с результатом `success` при проверке.

Workers:
- `regional-watch-editor`: AI, CORE_DB, NEWS_DB, `REGIONAL_EDITOR_CACHE_SOURCES` на месте; cron `*/5 * * * *`.
- `regional-osint-monitor`: DB, AIS_KEY, FIRMS_KEY, GFW_API_TOKEN, SUMMARY_TOKEN, COLLECTOR_CACHE_SOURCES, REGION на месте; cron `*/1 * * * *`.
- Обе совместимости `2026-11-10`; Worker preview URL выключены; `workers.dev` активен.
- Все это — перечень имён привязок, **не значения секретов**.

## Что предложено в draft PR #37 (не deployed)

1. `scripts/release/cloudflare-gate.mjs`: новая **опциональная только для Preview** проверка `validatePages(...,{requirePreviewIsolation:true})`; при общей с production D1, общем Worker service, service environment = production, отсутствующих или повреждённых preview bindings **отказывает до записи**. Production `validatePages` продолжает подтверждать действующую конфигурацию без ложной блокировки.
2. `.github/workflows/regional-watch-app-check.yml`: read-only `cloudflare-gate.mjs preview-check` **перед** `pages deploy dist`. При нынешней совместной preview-конфигурации публикация Preview будет запрещена до создания реально изолированных bindings. Порядок проверяется регрессией.
3. `scripts/release/build.mjs`: перед сборкой Worker payload сверяет `deploy/wrangler.*.production.json` с `deploy/release-contract.json`: source identity/entrypoint, cron, D1, AI, secret names, keep_vars, previews, Pages service mapping и Pages D1 links. Одинаковая проверка применяется к `expectedWorkerConfig()` на build и verify.
4. `tests/architecture/release-pipeline.test.mjs`: негативные кейсы общей D1 даже под другим именем, production service under alias, отсутствующего preview, дрейфа Worker name/cron/D1/secrets/AI/Pages. Провал до исправления и зелёные тесты после.

### Доказательства TDD/CI

- **RED 1:** [Actions #43763080780](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763080780) — preview-проверка не выбрасывала исключение при совместных ресурсах (ожидаемый провал).
- **RED 2:** [Actions #43763279324](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763279324) — валидатор source contract игнорировал подмену имени Worker (ожидаемый провал).
- **GREEN:** [Actions #43763365895](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763365895) — исходные 11/11 jobs SUCCESS; затем добавлен тест правильного порядка Preview gate, в [#43763560098](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763560098) найден конфликт имени переменной исключительно в тестовом JS. Исправлен, и **последний [Actions #43763796634](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43763796634) завершился 11/11 jobs SUCCESS, 0 failures; Preview и production jobs SKIPPED**. Сборка immutable release и dry-run Wrangler включены.
- **Нет ни одной реальной попытки отправить preview:** новый вызов `preview-check` на Cloudflare с токеном через GitHub не запускался; поведение валидатора подтверждено offline fixtures, а наличие опасной реальной конфигурации — отдельным read-only Cloudflare API.

## Аудит legacy workflows

В main найдены 16 файлов в `.github/workflows/`. **Единственный workflow, который содержит команды Cloudflare Workers/Pages deployment — `regional-watch-app-check.yml`.** Он публикует production только на `push main` после полного набора jobs. Его `pages-preview` ограничен **историческими ветками** (`refactor/regional-watch-modular-20261114`, `feature/integrated-data-quality-neon-20261115`, `release/regional-watch-architecture-20261115`) и **не создаёт изолированные D1 автоматически**; именно поэтому добавляется stop-gate.

`worker-check.yml` проверяет старые `worker/**` snapshot-модули, но не деплоит сайт. Workflow collectors (`analysts`, `gdelt`, `marad`, `copernicus`, `satellite`, `unosat`, `news-open-source-translation`) ещё содержат conditional git push/fallback; прежний Neon-primary cutover их штатные writebacks отключил. **Не удалять до отдельной проверки rollback и полного списка branch protections**; удаление лишило бы работающего аварийного пути.

## Риски/следующая развилка

- Пока PR #37 не объединён, новая защита **не действует** в `main`. И даже после слияния она **блокирует небезопасный preview upload, но не изменяет настройки Cloudflare Preview**. Для возобновления полезных Preview нужно создать отдельные read-only или изолированные data/service bindings и проверить, что они не могут мутировать production D1. Прямые внешние/ручные Cloudflare deployments по-прежнему требуют дисциплины; этот gate охватывает управляемый workflow.
- Мержить PR #37 автоматически нельзя: обновление `backend/**`, `scripts/release/**` и `.github/workflows/regional-watch-app-check.yml` на `main` запускает **реальный coordinated production release**. Нужна отдельная команда на интеграцию после ревью.
- А-02 и А-04 **частично завершены на уровне инженерного кода и аудита**, до релиза/акцепта не помечать DEV-02 как deployed/closed.
- DEV-03, DEV-04 и OSS ветка не затронуты; QA интерфейса по отдельному плану.

**Стоп-правило:** один инженерный блок → тесты → TODO → отчёт → остановка. 
