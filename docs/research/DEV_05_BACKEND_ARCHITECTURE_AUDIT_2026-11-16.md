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


---

## 6. ARCH-03 — первый модульный этап Editor: RSS/Atom ingress (16.11.2026)

**Контрольное основание:** текущий `main` исходный код Editor и frozen v64 baseline; один небольшой lossless extraction, без изменения поведения. **ARCH-03 всё ещё открыт** для смешанных обязанностей Editor `index.js`, `localization.mjs`, `analysts/editor.mjs`.

**До:** `backend/editor/src/index.js` содержал `decode/tag/safeLink/entries/load` прямо между импортами, `digest` и редакционными/AI/D1 функциями; `scan` вызывал локальный `load`. Разбор и сетевое получение XML были связаны с основным entrypoint и не имели прямых изолированных тестов.

**После:** [PR #51](https://github.com/ArrakturIL/regional-osint-feeds/pull/51) merged, source SHA `59cb9f77b93de6f9f49d85f17acbca165e8da9f8`. Новый `backend/editor/src/news/rss.mjs` — **2498 UTF-8 символов**; `index.js` стал с 31095 до 28674 символов (-2421). `index.js` импортирует только `load` из RSS-модуля, `analyze` и `checkFeedSummary` теперь импортируются только самим `rss.mjs`; `digest` остался в Index без изменения. Ни один алгоритм парсинга, HTTP retry/timeout, фильтрации или D1/AI/cron не изменён.

**Guard against silent regressions:** `tests/architecture/editor-modules.test.mjs` проверяет **точное, побайтово эквивалентное извлечение** блоков из исторического исходника v64 в новый модуль (кроме `export` и `import`) и неизменность всего оставшегося `index.js`. Прямые node tests `tests/architecture/editor-rss-boundary.test.mjs` проверяют RSS+Atom, CDATA/entities, HTTPS-only, source/score, old/new publication window, sponsored suppression, HTTP error, broken XML and failed network. Сетевые ответы подставляются локально — никаких внешних живых fetch/Neon/D1.

**TDD evidence:** [RED #43779607795](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43779607795) — тесты первоначально падали из-за отсутствия `news/rss.mjs`. После переноса [run #43779736437](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43779736437) выявил ошибку **тестового** edge-case: время публикации RSS `pubDate` в секундах, и `+600001 ms` округлялось к допустимой границе +600 sec. Тест поправлен на +601 sec, добавлен явный +600 sec inclusive case. **Production-правило не менялось.** [GREEN #43779806868](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43779806868): **11 CI jobs success / 0 failed** включая Editor tests, bundles и immutable release dry-run; [integrated #43779806793](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43779806793) success.

**Production:** [coordinated release #43779912088](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43779912088): **12 jobs successful, 0 failures, rollback skipped**. Независимый read-only Cloudflare check: Pages canonical `e7d3217b-bac0-447c-bc6f-79c0ca755732` production success; Editor `16257411-0898-4b62-925a-cfbf6cdb8e48` 100%; Monitor `44c02efb-4d33-4f69-a1fa-8deb11a6601c` 100%; expected D1/AI/secret/vars bindings and Editor `*/5`, Monitor `*/1` unchanged. Этот технический smoke **не является независимым полным UI/контент QA**.

**Дальше:** отдельно разбирать путь scheduled translation/AI budgets и HTTP official posts, затем аналитиков. Новых сервисов, backup, cron или расширения provider calls не предлагать без отдельного измерения.


---

## 7. ARCH-03 — запланированные переводы Editor вынесены без изменения логики (16.11.2026)

**Текущий статус:** [code PR #53](https://github.com/ArrakturIL/regional-osint-feeds/pull/53) merged, main sha `b844a663ee82b8e8b88efdd51944832d31777d13`; ARCH-03 остаётся частичным, поскольку локализация, аналитики и HTTP-маршруты ещё требуют ревизии.

- Раньше `backend/editor/src/index.js` содержал обе функции `translateTitles(env,now)` и `translateIDF(env,now)` (**8753 исходных символа**) внутри большого scheduled/editor ingress. Теперь эти функции перенесены **без изменения их тела** в `backend/editor/src/translations/scheduled.mjs` с единственным новым импортом `validateCandidate` из `./news-mirror.mjs`. `scan()` продолжает вызывать их в прежнем порядке, возвращать тот же summary и использовать прежние NEWS_DB/CORE_DB.
- Основной `index.js` сократился с **28674 до 19978** символов, отдельный `scheduled.mjs` — 8821 символ. Никаких новых fetch / D1 / AI/cron/secret/schema источников, моделей, запросов, prompt-строк или лимитов добавлено не было.
- `tests/architecture/editor-modules.test.mjs` теперь восстанавливает `index.js` из immutable frozen Editor v64 baseline **двумя точными извлечениями** (RSS и scheduled translations), одновременно сравнивая содержимое обоих новых модулей с исходными блоками, за исключением импортов и `export` ключевых слов. Это проверка lossless boundary, а не «файл существует».
- Новые изолированные тесты `tests/architecture/editor-scheduled-translations.test.mjs` покрывают news budget **20 batches/2500 estimated neurons** и IDF budget **12/1500**, отсутствие AI вызова при лимите/отсутствии кандидатов, error-state без фиктивной публикации при неверном AI JSON, сохранение валидного русского заголовка и D1/neurons accounting, фильтрацию IDF Telegram URL и отсутствие вызова AI при отсутствии CORE_DB. Использованы только локальные D1/AI-имитации, **не** live production AI or production D1 mutation.
- **TDD:** [RED #43781261408](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43781261408): код теста не мог импортировать ещё не созданный `scheduled.mjs`; [GREEN #43781358176](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43781358176) completed success **11 successful/0 failed**, isolated Editor tests 15/15, frozen module parity green, immutable 3-component dry-run success, integrated data architecture checks green.
- **Production:** [release #43781455669](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43781455669) completed success **12 jobs passed, 0 failed**, rollback skipped. Независимый read-only Cloudflare API: Pages production deployment `84240e38-0dc1-45ef-9b98-19809c6881e5` success; Editor `380d69c7-4cf1-4dfc-924c-9ff1d2ad61eb` 100%, Monitor `feb4ba2d-1297-43bd-9284-9ed254c31f52` 100%; source binding names (AI, CORE_DB, NEWS_DB, DB, per-source secrets) и Cron Editor `*/5`, Monitor `*/1` сохранены.

**Не доказано и не заявляется:** фактическая экономия CPU/AI на production (это structural-only refactor), визуальная корректность сайта, успешность каждого отдельного upstream, отсутствие всех исторических багов перевода. Дальше отдельные маленькие задачи: HTTP handler extraction, editorial AI и analyst service boundaries. Версионный резервный архив по решению владельца не создаётся.


---

## 8. ARCH-03 — вынос read-only API официальных сообщений ЦАХАЛ (16.11.2026)

**Состояние:** [code PR #55](https://github.com/ArrakturIL/regional-osint-feeds/pull/55) merged code SHA `0d2be9e3814fd5b56678f6ae754d084dc3f59e5a`. Это третий независимый архитектурный boundary после RSS [#51](https://github.com/ArrakturIL/regional-osint-feeds/pull/51) и scheduled RU/IDF translation [#53](https://github.com/ArrakturIL/regional-osint-feeds/pull/53). **ARCH-03 остаётся открытым** — Monitor changes HTTP, scan/editorial AI, localization/analysts остаются в больших модулях.

**Lossless source split:** `rwOfficialTextParts`, `rwOfficialDecode`, `rwOfficialNumbersPreserved`, `readOfficialPosts` вынесены как один ответственный read-only `backend/editor/src/api/official-posts.mjs` (**3833 символа**). `readOfficialPosts` экспортирован; его вызов из `index.js` по `/api/official-posts` не изменён, кроме нового импорта. `index.js` уменьшился **19978→16211 символов**. Frozen Editor v64 parity test проверяет **с точностью до символа** третий extraction, включая сохранение exact исходных body, всех оставшихся байтов `index.js`, RSS и scheduled модулей, а не просто сборку.

**API контракт из исходного кода и TDD:**
- `lang=ru|he`, `limit` строго 1..10; некорректные параметры → 400 до D1. D1 только SELECT; опубликованы только `https://t.me/idfofficial/<числа>`, duplicate ID исключаются; URL, `published/observed`, `original_title/original_description`, `translation_verified:false`, `source_type`, поле `content_language` и cache/CORS headers сохранены.
- Русский `title_ru`/`excerpt_ru` используется только когда оба действительно кириллические и **все исходные числа** сохранены; неприемлемая запись получает `needs_review` и исходный EN-текст, без подстановки перевода. Повторяющийся заголовок из `description` убирается как и раньше — промежуточный [CI run #43783000298](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43783000298) выявил неверную тестовую гипотезу; исправлен **только тест**, не production-семантика.
- **Важное реальное ограничение:** для `lang=he` этот endpoint **возвращает исходный EN-текст и `translation_status:pending`**, даже если RU translation есть. Это обнаруженное поведение, а не новая функция; не обозначать его как готовую HE-переводную ленту и не исправлять без отдельно согласованной спецификации.
- Новые `tests/architecture/editor-official-posts-api.test.mjs` проверяют 6 независимых случаев, включая прямой `editor.fetch` route. Без подключений к живым провайдерам или записи в D1.

**CI evidence:** [RED #43782913505](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43782913505) — новый импорт отсутствует; [GREEN #43783063984](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43783063984) — 11 jobs success, 0 failed, immutable three-component dry-run success; [integrated #43783064014](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43783064014) success. [Production coordinated release #43783164956](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43783164956) — **12 jobs success, 0 failed, rollback skipped**.

**Independent Cloudflare postcheck:** Pages canonical `5635c9a0-6370-41ce-8768-f7813d1f8d2f` production success; Editor version `35bb1205-1f4e-4792-998a-2808d4345e27` 100%, Monitor `7c2ee158-6a0e-438d-a48e-2ff4bca48be9` 100%; Editor AI+CORE_DB+NEWS_DB bindings, Monitor DB + secrets and existing cron `*/5` and `*/1` preserved. This verifies technical deploy metadata, **not end-user visual QA, upstream freshness, or actual translation quality**.

**Next:** isolate `buildDigest/readMonitorChanges` as another read-only API boundary, then editorial AI/scan responsibilities. Handle HE official posts translation as a separate product requirement only with the user's approval. No backup or paid services introduced.


---

## 9. ARCH-03 — read-only API изменений мониторинга (16.11.2026)

**Release evidence:** [code PR #57](https://github.com/ArrakturIL/regional-osint-feeds/pull/57) merged main SHA `98901fc6b358533db43581bd8870ce21452bf5d5`. Это четвёртое узкое структурное разделение Editor после RSS, scheduled RU/IDF и official posts API; ARCH-03/DEV-05 **не закрыты**.

**Изменение:** `buildDigest(rows,eventRows)` и `readMonitorChanges(request,env)` перенесены без изменений алгоритмов из `backend/editor/src/index.js` в `backend/editor/src/api/monitor-changes.mjs` (3512 символов включая `export`). `index.js` сократился с **16211 до 12775** символов; единственное изменение вызова `/api/changes` — импорт из нового модуля. Node frozen Editor v64 parity реконструирует исходный entrypoint с **четырьмя** точными извлечениями и сравнивает все модули с историческими оригинальными блоками; guard не ослаблен.

**Функциональный контракт** `tests/architecture/editor-monitor-changes-api.test.mjs`:
- `pending` при 0/1 запусках, `error:invalid_monitor_run_times` при равных или убывающих timestamps, `insufficient_comparison` если нет общих числовых `source_maxima_ms` и зафиксированных изменений; `ready` если есть сравнимые обновления или изменения статуса.
- Честный count `sourceComparable`/`sourceUpdates` только на пересечении источников, интервал `periodMinutes`; только записи журнала в окне (previous, latest], не более 6; статус outcome изменения первым. `journal_updated` включает буквальную фразу **«само по себе это не подтверждает утверждения источников»**, на обоих языках. **Нельзя превращать готовность для сравнения в факт подтверждения атаки/события.**
- Bilingual response: `requested_language=ru|he` плюс существующие поля `title/description` и `title_he/description_he`. OPTIONS 204, неверный HTTP метод 405, язык 400; CORS + no-store; D1 failure 503 с безопасным DTO `digest_unavailable`, без утечек SQL.
- Функции вызывают только старые 2 read-only запроса `monitor_runs` и `monitor_events` (второй только если timestamps позволяют). Никаких D1 writes, AI, new HTTP providers.

**TDD / release:** [RED #43783660498](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43783660498) — отсутствующий ещё ESM import; [GREEN #43783761045](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43783761045) completed success **11 jobs passed, 0 failures**, tests + dry-run 3-bundle; [integrated #43783761075](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43783761075) success. [Production coordinated #43783855495](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43783855495) completed success **12 jobs passed / 0 failed**, rollback skipped.

**Cloudflare independent read-only check:** Pages canonical production `a2543b26-c77f-4b14-99a4-1185a8948eaa` success; Editor version `c40407a2-985b-4042-88e7-8f022d0d49c2` 100%, Monitor version `85338c78-0b66-4aef-93a6-9ddf376d248b` 100%; expected Editor AI, CORE_DB, NEWS_DB, Monitor DB/secrets/vars and existing crons `*/5`, `*/1` unchanged. **Не является самостоятельным браузерным QA** или подтверждением всех upstream обновлений.

**Следующая отдельная работа:** `index.js` содержит сканирование RSS/D1, `writeComment` (AI и budgets), cron, Polymarket archiving, localized fallback; дальнейшие decomposition только TDD и маленькими PR. `localization/localization.mjs` и `analysts/editor.mjs` также требуют functional-boundary audit. Backup и OSS остаются отложенными.

---

## ARCH-03 / редакторские AI-комментарии и бюджет — проверенный выпуск 16.11.2026

**Change:** [PR #59](https://github.com/ArrakturIL/regional-osint-feeds/pull/59), merged `44d55ef862f7430d0fe3f4a64095b196333548af`. Отдельный `backend/editor/src/editorial/ai-comments.mjs` экспортирует исходный `writeComment(env,row)` и прежнюю AI+budget часть `scan()` как `generateComments(env,now)`. `index.js` вызывает её без изменения порядка RSS → reconciliation → RU news translation → editorial comments → official IDF translation → scan summary. Новых D1 migrations, поставщиков, model/prompt, dependency, cron, fallback или AI-бюджета не появилось.

**Contract:** `EDITORIAL_SKIP` для чувствительных заголовков/аннотаций, отсутствие AI вызова на них, 28 попыток/3500 estimated neurons в сутки, максимум две строки за scan, `spent=110` до AI usage reconciliation и `last_ai_error` для некорректного JSON сохранены. Новые семь прямых тестов и frozen v64 exact-source comparison предотвращают незаметную подмену правил в данном boundary.

**Evidence:** RED [43784760543](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43784760543) — новый модуль отсутствовал; GREEN app [43784955476](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43784955476) и integrated [43784955428](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43784955428), обе completed success. Production coordinated [43785057089](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43785057089) completed success, rollback skipped; Cloudflare read-only check: Pages deployment `8f23c384-0c27-4d1b-a46e-5cb470b6ec68` success, Editor `3e27e546-2c00-4c0c-9b6e-7b5e6a75f146` 100% с AI/CORE_DB/NEWS_DB, Monitor `63537fb3-21a2-4529-8a60-306df603fd76` 100%, cron `*/5` и `*/1` неизменны. Не подтверждает качество пользовательских AI-реплик реальными публикациями или глобальный UI QA.

**Open:** ARCH-03 остаётся частичным. Далее отдельными блоками исследовать и при необходимости изолировать оставшийся scan/FEED/D1 management, `localization.mjs` и `analysts/editor.mjs`. ARCH-01/05/06, остаток ARCH-04 и ARCH-07 идут по master TODO. Не поднимать длительные backup и OSS в этом DEV-05.

---

## ARCH-03 — Editor RSS ingestion/D1 storage + release-gate hotfix, 16.11.2026

**Boundary and evidence.** [PR #60](https://github.com/ArrakturIL/regional-osint-feeds/pull/60), `a7a43f2795a92c547c99dd47e3beb7fb527edf83`. New `backend/editor/src/news/ingestion.mjs` owns `ingestNewsFeeds(env,now)`: 12 declared source loads, feed-status persistence, full candidate sort, 8-day existing canonical URL inventory, same-publisher 6-hour normalized title dedup, 240 intake limit, source-link preservation, SHA IDs, 8-day expiration. Source body preserved byte-identically from frozen v64 after earlier boundaries, with only wrapper/signature changes and unchanged `scan()` ordering. New synthetic fetch+D1 behavior coverage tests: publisher identity, HTTP error/empty status, known URL identity, 240 cap, D1 fail-fast. [RED #43785869304](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43785869304) → [GREEN #43785978638](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43785978638) plus [integrated #43785978613](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43785978613).

**Important deployment incident.** Initial [main release #43786083010](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43786083010) FAILED in receipt: a fresh successful Cloudflare Pages deployment returned a transiently unavailable `canonical_deployment` via project API; after automatic Worker rollback, the Pages canonical eventually advanced. The rollback step had evaluated the older Pages canonical and did not issue a Pages rollback, leaving an interim mix of deployment generations. This was **not a code/scan test failure** and must not be recorded as a successful coordinated release.

**Release-gate root cause fix.** [PR #61](https://github.com/ArrakturIL/regional-osint-feeds/pull/61), `470a8d79886ba39f9f69b665f6f9f89aef12d29f`. Project canonical lookup tolerates bounded Cloudflare API propagation: up to 8 attempts, 1 second apart, preserves fail-closed binding validation. Receipt requires successful canonical distinct from previous baseline before recording a new release; rollback knows if Pages-upload already succeeded and explicitly restores exact baseline even when API still displays the old canonical. Test simulated disappearing/stale canonical in postcheck, receipt and rollback: [RED #43786471321](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43786471321), [GREEN #43786660600](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43786660600), CI full suite and immutable dry-run successful. No extra Cloudflare resource, Worker schedule, permission, data/schema change.

**Verified recovery.** [Main production release #43786765089](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43786765089) completed success with receipt saved; automatic rollback skipped. Cloudflare API read-only: Pages canonical `5e5dd93d-bc0a-460e-b7f6-f2939ca1ae4a`, success; Editor `fb6f2e3f-3bdc-407f-b779-2d951354b665` 100%, AI/CORE_DB/NEWS_DB; Monitor `17b99a5e-1145-4415-be24-3ef4be04b32d` 100%, DB + existing secret names; cron Editor `*/5`, Monitor `*/1`. This checks release integrity, not full browser/UI/translation quality.

**Remaining:** isolate/review remaining scan orchestration and `localization/localization.mjs`, `analysts/editor.mjs` separately; ARCH-04 provider health and ARCH-01/05/06/07 outstanding. Long-term backups and OSS postponed.

---

## ARCH-03 — release: complete Editor scheduled scan orchestration boundary (16.11.2026)

**Scope:** [PR #62](https://github.com/ArrakturIL/regional-osint-feeds/pull/62), main `c7ca95f4df930072addc13a8f934499b5ad1de66`. `scan(env)` moved byte-for-byte to `backend/editor/src/news/scan.mjs`; original `index.js` scheduled call, other independent schedules, router and health unchanged. The module owns existing ordered stages ingest→reconcile with D1 error journal→RU scheduled titles→editorial budget/commentary→IDF translation→last_scan summary. No SQL, clock, budget, model, DB schema, feed registry or edge-route change. Parity test reconstructs exact extracted body from frozen v64 across all earlier ARCH-03 splits.

**Evidence:** [RED #43787495172](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43787495172), expected missing module; [GREEN app #43787584018](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43787584018) and [integrated #43787584005](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43787584005) SUCCESS. Four new synthetic D1/RSS integration-style regressions assert 12 feed statuses, ordered stage effects and exact summary, recoverable reconciliation error, failed summary persistence, and `/health` pending. Mandatory editor-source, module import/parse and immutable three-component bundle green.

**Verified production:** [Coordinated release #43787695419](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43787695419) success, rollback skipped. Cloudflare independent read-only: Pages canonical `c9c1eb18-3e90-41e7-b0f7-860a27f5758d` success; Editor active `dc24a7bc-32fd-4b60-a04b-9e53df74d062` (AI, CORE_DB, NEWS_DB, cron `*/5`) and Monitor active `67df41a1-184a-4617-b851-2f17438aebdc` (DB and expected secrets, cron `*/1`) 100%. No browser/user-facing global QA claim. Remaining ARCH-03: localization and analyst large modules independently; all other DEV-05 scopes stay open.

---

## ARCH-03 — scheduled Hebrew localization split from public RU/HE readers (16.11.2026)

**Source boundary:** [PR #63](https://github.com/ArrakturIL/regional-osint-feeds/pull/63), main `835b6718cefefc1a3f8fad34eaca98dfe968a9e4`. The previous `localization/localization.mjs` has been separated into public `localization.mjs`, new `scheduled.mjs` with original `HE_MODEL`, `localeCandidates`, quality gates, `translateLocaleItem`, `translateScheduled`, and `shared.mjs` with `DAY`, `val`, `sourceText`, `fingerprint`. Public exports, default `{fetch,scheduled}`, HTTP routes and original stable SHA-based source identity preserved. No cyclic imports and no additional AI/model, D1 schema, cron, source, budget or public display logic changes.

**Lossless proof:** `tests/architecture/editor-localization-scheduled.test.mjs` reconstitutes original pre-split `localization.mjs` by deterministic joins/reverse export rewrites, then checks exact original Git blob SHA `5b907775613eec9c1a986eddcd06cb74fd7c9880`. New synthetic D1/AI tests check 96 attempts / 4000 neurons/day, 5-minute source rotation, 4-item scan cap, quality rejection on changed Arabic numerals even at 98 confidence, GLM model settings/strict JSON, journals/errors and stable fingerprint. Existing RU/HE provenance + translation semantics tests preserved. [RED #43789103684](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43789103684) intentionally failed because new scheduled module absent; [GREEN app #43789296805](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43789296805) and [GREEN integrated #43789296783](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43789296783) successful, immutable release artifact built. An intermediate new-export error was corrected before release.

**Production verified:** [coordinated release #43789387820](https://github.com/ArrakturIL/regional-osint-feeds/actions/runs/43789387820) successfully published SHA `835b6718cefefc1a3f8fad34eaca98dfe968a9e4`, receipt archived, no rollback. Independent Cloudflare read-only verified Pages canonical `51469452-465c-4c79-ba2d-6785abe8af09` success; Editor `bcc1a493-7172-4864-9c27-370852680cb9` at 100% with AI, CORE_DB, NEWS_DB, cron `*/5`; Monitor `7e0744bb-9fd7-480b-89dc-f227f9e12bd9` at 100% with DB/secrets and cron `*/1`. This is release safety validation, not complete live RU/HE editorial/browser QA.

**Next:** review/factor remaining public localization reader branches in their own small stages, then large `analysts/editor.mjs` (or follow MASTER TODO ordering). ARCH-03 and DEV-05 overall remain open, backups/OSS/global UI QA not part of this block.
