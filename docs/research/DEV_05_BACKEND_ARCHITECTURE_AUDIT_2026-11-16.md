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


---

## 4. ARCH-02 — первый законченный изолированный рефакторинг (16.11.2026)

**Статус:** [PR #47 merged](https://github.com/ArrakturIL/regional-osint-feeds/pull/47) в `main`, commit `faba8225818291fe0e90428d19b758eecbe4a22a`.

- **RED:** [run #43775136529](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43775136529). Новый `backend/monitor/tests/import-boundaries.test.mjs` прошёл проверку resolvable paths для всех **44 active Monitor modules**, но тест DAG обнаружил циклы между `api/json↔api/router`, `config/constants↔network/ioda`, `collectors/aviation/regions↔adsb`, `schedule/sources↔api/router` и связанные длинные пути. Это доказательство архитектурных циклов, но **не доказательство падения Worker**.
- **Исправление:** удалены ровно пять **неиспользуемых** статических импортов (`api/json.js`, `config/constants.js`, `collectors/aviation/regions.js`, `schedule/sources.js`, `collectors/media/gdelt.js`), без изменения исполняемого тела функций/DTO, cron, D1, состояния источников. Постоянная проверка циклов и существования import targets подключена к `monitor-source` в mandatory GitHub workflow.
- **GREEN:** [run #43775296276](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43775296276) **11 успешных jobs / 0 failures**; Monitor import graph tests 2/2, Monitor source parity tests 6/6, collector cache tests 13/13, modern bundle и immutable Wrangler dry-run успешны; preview/production из ветки не публиковались.
- **Реальный выпуск:** [Actions #43775413609](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43775413609) **completed success (12 successful jobs / 0 failures), rollback skipped**. Независимый read-only Cloudflare postcheck: Pages production `6191ada0-c6cd-4b71-a450-945c6f7348e9` success, Editor version `344d76e5-274e-49f5-a2e4-853b09f914f4` 100%, Monitor version `d37dde7b-9ba7-4a2f-9763-fe3392eb59cb` 100%; все ожидаемые AI/D1/secret/vars bindings и cron Editor `*/5`, Monitor `*/1` сохранены. Не выполнялся искусственный отказ production; RU/HE/API technical smoke не равен глобальному браузерному QA.

**ARCH-02 закрыт [x]; DEV-05 остаётся [~]**. Следующий безопасный шаг по ARCH-04 — отдельно измерить фактическое распределение расписаний относительно деклараций `every` и failure contract, не меняя source clocks вслепую.


---

## 5. ARCH-04 — суточный контракт расписания и live source health (16.11.2026)

**Scope:** проверялся действующий `backend/monitor/src/schedule/{sources,runner,collect,manual}.js` и private D1 read-only `source_status`. Не создавались новые источники, запросы, квоты или Cron. Расписания проверены как **eligible slots до manual/secret/provider cooldown**; фактические provider HTTP вызовы могут быть пропущены.

### Кодовый суточный аудит

- Зарегистрировано **26 источников**, из них каждый присутствует в 24 modulo rules (`primary` group и supplemental group содержат несколько общих имен в одной строке).
- Для **всех 26** при моделировании **1 440 минут UTC** фактическое число автоматических доступных слотов совпало с `1440/every`; период от запуска до запуска (в том числе на переходе через UTC полночь) равен `every`. Пропущенных/неизвестных registry names нет. Примеры: `adsb` 96/сут, `ais` 288/сут, `easa/mscio/ioda` по 96, `centcom_dvids` 48, `gdelt_context` 24, `marad_official` 4, `unosat_analysis` 2.
- Соседство scheduled slots само по себе не авария: `marad_official` (UTC minute 61+360n), `gfw_token` (51), `unosat_analysis` (86+720n) могут приходиться на минуту AIS. Scheduler использует `Promise.allSettled`, а фактические расходы/ошибки провайдера надо проверять отдельно.
- Live D1 `source_status` read-only показал разные состояния `ok`, `partial`, `empty` и ранее `retired`; приведённый статус **не приравнивается к общему успеху scheduled handler**. В `collect.js` upstream exception записывает `state='error'` в D1 и возвращает fulfilled результат; `runSchedule` выбрасывает ошибку только при rejected (например, D1 write failed). Такая политика *может* скрыть upstream error из Cloudflare Cron success, хотя D1 хранит состояние. Не менять её до отдельного теста внешней наблюдаемости и alerting, иначе могут появиться ложные аварии Cron из-за ожидаемых 429/partial.

### RED → GREEN регрессия и выпуск

- [TDD RED #43776291502](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43776291502): контракт чистой `scheduledSourceNames(minute)` ещё отсутствует, ASSERT `undefined !== function`. Не синтаксическая ошибка.
- [GREEN #43776399045](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43776399045): **11 successful / 0 failed**; test охватывает registered 26 sources без hardcoded count, 24h slot coverage, exact intervals/UTC boundary, high-priority slots и отсутствие дублирования; mandatory monitor-source tests/bundles и immutable Wrangler dry-run успешны; Preview/prod на feature branch не публиковались.
- [PR #49](https://github.com/ArrakturIL/regional-osint-feeds/pull/49) merged в `main`, commit `089e890e657f1543558601b7050216b7c245a1c7`. Только `backend/monitor/src/schedule/runner.js` (без изменения условий) и тест/workflow/план; все 26 расписаний остались прежними. `scheduledSourceNames` вызывается из real `runSchedule`, поэтому тестирует реальное планирование, а не скопированные условия.
- [Production release #43776494155](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43776494155) completed success, **12 successful jobs, 0 failed, no rollback**; независимый Cloudflare API: Pages canonical deployment `e5344d67-e317-4cbe-9e23-9276371459f4` success, Editor version `cdfb2691-96c0-41f6-a2e5-6f691c9fdbcb` 100%, Monitor version `3df81d16-f497-407f-9f9a-faeb0a9ccf11` 100%. Bindings, secret names, cron Editor `*/5`, Monitor `*/1` сохранены.

**Status ARCH-04 = [~]:** конкретная часть 'не изменять/не сломать cadence' закончена; ещё открыто проверить реальными/controlled тестами provider cooldown/lease, частичные ошибки, D1 `state='error'` и мануальный запрос, а также отсутствие ложного health из Cloudflare Cron. Этим не заниматься в одном массовом refactor PR. DEV-05 в целом остаётся открытым.
