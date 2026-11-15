# REGIONAL WATCH — DEV-05: аудит архитектуры бэкенда (16.11.2026)

**Основа:** реальный `main` `f065851dcf80187d49a4ad417322ea57b1574a9a`. Режим работы: **read-only** на момент первичного осмотра, без миграций, изменения расписания, внешних сервисов и удаления legacy. Этот файл — доказательства и очередь рефакторинга, **не** утверждение о неисправности production или завершённом функциональном QA.

## 1. Фактическая активная архитектура

- Один immutable coordinated release (`scripts/release/build.mjs`) собирает через esbuild **три** entrypoints: `backend/pages/src/index.js`, `backend/editor/src/index.js`, `backend/monitor/src/index.js`. Production **не** запускает напрямую `worker/regional-osint-monitor.js` (~74.6 KB), `worker/regional-watch-editor.js` и `worker/live-editor/**`; это исторический/тестовый/потенциально резервный код, не основание сразу его удалять.
- По дереву `main`: **65 модулей под `backend/{editor,monitor,pages}/src`** (Editor 15, Monitor 44, Pages 6). Это **не один монолит** — Monitor имеет отдельные API, providers/collectors, D1 adapter, scheduler, manual run, source registry; Pages отдельно routes/proxy/public DTO.
- Editor: `index.js` ~33 KB / 346 строк, `localization/localization.mjs` ~28 KB / 395 строк, `analysts/editor.mjs` ~28 KB / 347 строк; хотя modularization уже состоялась, здесь остались крупные смешанные обязанности. `news/events.mjs` ~20 KB отвечает за группировку, дедуп и SQL reconcile, требует отдельной поведенческой регрессии, а не деления только ради строк.
- Сборщики GitHub Actions/Python существуют раздельно для 8 первичных Neon sources, затем `scripts/neon_mirror.py`, `scripts/sync_neon_primary_to_d1.py`, `scripts/neon_to_d1.py` и приватный D1 reader. `collect_analysts.py` ~16 KB объединяет сетевой доступ/разбор/эмиссию; `news_event_filter.py` ~17 KB является отдельным консервативным алгоритмом grouping, не главным маршрутом Editor. Все данные и fallback при переделке сохранять.
- 16 GitHub Actions workflows; canonical release отдельно от сбора и наследованных emergency fallback. Не удалять legacy actions, пока их роль не доказана.

## 2. Конкретные находки, не просто размер файлов

| Приоритет | Факт (проверено в исходниках main) | Риск / дальнейший тест |
| --- | --- | --- |
| P1 (граница модулей) | `backend/monitor/src/api/json.js` импортирует `read` из `./router.js`, одновременно `router.js` импортирует `json` из `./json.js`. В `api/json.js` импортированный `read` не используется. | **Прямой циклический импорт**. Доказывает архитектурный цикл, **не доказывает падение runtime**. TDD static import-boundary test; удалить только избыточную зависимость. |
| P1 (граница модулей) | `backend/monitor/src/config/constants.js` импортирует `outages` из `../collectors/network/ioda.js`, а `ioda.js` импортирует `HOUR` и `IODA` из `constants.js`. В constants импорт `outages` не используется. | Константы зависят от коллектора, цикл. Разорвать через неизменяемую config-only границу. |
| P1 (граница модулей) | `backend/monitor/src/collectors/aviation/regions.js` импортирует `aviation` из `adsb.js`, тогда как `adsb.js` импортирует `airSamplingRegions` из `regions.js`. В regions импорт `aviation` не используется. | Прямой цикл; проверить перед удалением со всеми aviation fixtures. |
| P1 (граница модулей) | `backend/monitor/src/schedule/sources.js` импортирует `read` из `../api/router.js`, а router импортирует `sources` из sources.js. В реестре импортированный `read` не используется: `read:` ниже — ключи записей. | Collector registry не должен импортировать HTTP router; static graph test, затем минимальное исправление. |
| P2 | Scheduler задаёт modulo-расписание вручную в `schedule/runner.js`, source registry отдельно задаёт `every` для источников. | Две декларации периодичности могут расходиться; **конкретный дрейф ещё не доказан**. Создать тест фактических due slots / секретов / cooldown, сравнить с registry; не менять cron вслепую. |
| P2 | Editor `index.js` совмещает HTTP API router, RSS parser/scan, scheduled translations, official posts и digest; `localization.mjs` совмещает public DTO и scheduled AI translation/quality; `analysts/editor.mjs` включает validation, storage, AI budget и API. | Дороговизна изменения и неявная связность. Делить **после** сохранения тестов на RU/HE, ньюс/аналитиков/API и provenance, по одному модулю за PR. |
| P2 | Контракты `backend/monitor/src/schedule/collect.js`: source.read exception пишет `source_status.state='error'` и возвращает fulfilled result; итоговый scheduled job выбрасывает исключение при rejected DB write, а не при частичном сборе источника. | Само по себе может быть **намеренной degraded-политикой**; нужна проверка, что публичный health и алерты отличают неудачный upstream от удачного цикла. Не выдавать за обнаруженный продакшен-баг. |
| P2 | Python source collectors не образуют один скрипт, но часть извлечения/парсинга/записи находится внутри одного файла; несколько отдельных ролей Neon publish, D1 readback, GitHub emergency writeback. | Контрактные тесты `status/checked_at/source_hash` важнее эстетики; прежде рефакторинга составить карту обязанностей/владельцев пар данных. |
| P3 | Большие старые `worker/` файлы продолжают находиться в репозитории, но в текущую immutable production-сборку не входят. | Пометить legacy/test/restore, позже архивировать только при отсутствии ссылок из rollback/tests/workflows. **Не удалять сейчас**. |

## 3. Порядок устранения — без большой единовременной переделки

1. **ARCH-01:** карта и границы (этот аудит); проверить все `backend/*/src` импортные зависимости и обязательные сборочные entrypoints.
2. **ARCH-02:** автоматический тест, запрещающий циклический импорт на действующем пути Monitor, RED на текущих явных циклах; минимальное удаление только ненужных import и GREEN полной CI/immutable build. Не менять поведение источников или расписание.
3. **ARCH-03/04:** отдельно покрыть расписание и разделить Editor по фактическим ответственностям; сначала сравнение DTO, D1 query/AI quota, source provenance до/после.
4. **ARCH-05/06:** инвентаризовать Python/GitHub fallback и legacy owners до удаления/выноса.
5. **ARCH-07:** CI, source coverage и production postcheck каждого независимого release. Не выдавать GH GREEN за сквозной QA сайта; полный QA остаётся отдельной задачей.

**Стоп-условия:** никаких автоматических backups/versioned retention (владелец отложил); никаких новых платных dependencies, фоновых агентов/частот, schema migrations, манипуляций реальными observation rows. Точная production release версия остаётся DEV-04 до явно проверенного нового выпуска.
